import { atom } from 'nanostores'

import { checkUpdate, type UpdateCheckResponse } from '@/lib/backend'
import { notify } from '@/store/notifications'

// 非强制更新的 toast 冷却时间（24h），避免每次启动都弹。
const TOAST_COOLDOWN_MS = 24 * 60 * 60 * 1000
const LAST_TOAST_KEY = 'qiji-client-update-toast-at'

export type ClientUpdateStatus =
  | 'idle' // 还没检查过
  | 'checking'
  | 'uptodate'
  | 'available' // 有新版本，等待用户操作
  | 'downloading'
  | 'error'

export interface ClientUpdateState {
  status: ClientUpdateStatus
  info: UpdateCheckResponse | null
  /** 下载进度 0-100；0 = 不确定（服务器无 Content-Length） */
  progressPercent: number
  /** 服务器未告知总大小时为 true，UI 显示不定进度条 */
  progressIndeterminate: boolean
  error?: string
  lastCheckedAt?: number
}

const INITIAL: ClientUpdateState = {
  status: 'idle',
  info: null,
  progressPercent: 0,
  progressIndeterminate: false
}

export const $clientUpdate = atom<ClientUpdateState>(INITIAL)

function patch(update: Partial<ClientUpdateState>) {
  $clientUpdate.set({ ...$clientUpdate.get(), ...update })
}

let checking = false
let progressUnsub: (() => void) | null = null

/** 当前版本是否有强制更新待处理（用于阻断式弹窗） */
export function isEnforcedUpdate(state: ClientUpdateState): boolean {
  return Boolean(state.info?.enforce) && state.status !== 'idle' && state.status !== 'checking' && state.status !== 'uptodate'
}

/**
 * 检查客户端更新（GET /api/client/v1/update/check，无需登录）。
 * - enforce 强制更新：只更新状态，阻断弹窗由 <ClientUpdateEnforceOverlay /> 渲染
 * - 非强制：toast 提醒（24h 冷却），点「立即更新」开始下载
 * - manual: 关于页手动触发，不弹 toast（结果直接显示在页面上）
 */
export async function checkClientUpdate(options: { manual?: boolean } = {}): Promise<void> {
  if (checking) {
    return
  }

  checking = true
  patch({ status: 'checking', error: undefined })

  try {
    const version = await window.hermesDesktop.getVersion()
    const info = await checkUpdate(version.appVersion)

    if (!info.has_update) {
      patch({ status: 'uptodate', info: null, progressPercent: 0, lastCheckedAt: Date.now() })

      if (options.manual) {
        notify({ kind: 'success', message: '当前已是最新版本' })
      }

      return
    }

    patch({ status: 'available', info, progressPercent: 0, lastCheckedAt: Date.now() })

    // 强制更新：不弹 toast，阻断弹窗接管
    if (info.enforce) {
      return
    }

    // 手动检查：结果展示在关于页，不重复弹 toast
    if (options.manual) {
      return
    }

    try {
      const last = Number(window.localStorage.getItem(LAST_TOAST_KEY) || 0)

      if (Date.now() - last < TOAST_COOLDOWN_MS) {
        return
      }

      window.localStorage.setItem(LAST_TOAST_KEY, String(Date.now()))
    } catch {
      // localStorage 不可用就直接弹
    }

    notify({
      kind: 'info',
      title: `发现新版本 v${info.newversion}`,
      message: info.upgradetext?.split('\n')[0] || '立即更新以获得最新功能',
      action: {
        label: '立即更新',
        onClick: () => void startClientUpdate()
      }
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)

    patch({ status: 'error', info: null, error: message, lastCheckedAt: Date.now() })

    // 手动检查时把错误显出来；启动时的静默失败不打扰用户
    if (options.manual) {
      notify({ kind: 'error', title: '版本检查失败', message })
    }
  } finally {
    checking = false
  }
}

/**
 * 下载新安装包并启动安装（主进程执行，下载完成后应用自动退出）。
 */
export async function startClientUpdate(): Promise<void> {
  const state = $clientUpdate.get()
  const url = state.info?.downloadurl

  if (!url) {
    notify({ kind: 'error', message: '没有可用的下载地址，请稍后重试' })
    return
  }

  if (state.status === 'downloading') {
    return
  }

  const bridge = window.hermesDesktop?.clientUpdate

  if (!bridge) {
    // 理论上到不了这里（preload 一定有）；兜底走浏览器下载
    notify({ kind: 'warning', title: '无法自动更新', message: '已在浏览器打开下载页面，请手动下载安装' })
    window.hermesDesktop?.openExternal?.(url)
    return
  }

  patch({ status: 'downloading', progressPercent: 0, progressIndeterminate: true, error: undefined })

  progressUnsub?.()
  progressUnsub =
    bridge.onProgress(progress => {
      const cur = $clientUpdate.get()

      if (cur.status !== 'downloading') {
        return
      }

      $clientUpdate.set({
        ...cur,
        progressPercent: progress.percent,
        progressIndeterminate: progress.total <= 0 && progress.percent < 100
      })
    }) ?? null

  try {
    await bridge.downloadAndRun(url)
    // 安装程序已启动，应用即将退出；这里不用再改状态
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)

    patch({ status: 'error', info: state.info, progressPercent: 0, error: message })

    notify({
      kind: 'error',
      title: '更新失败',
      message,
      action: {
        label: '手动下载',
        onClick: () => window.hermesDesktop?.openExternal?.(url)
      }
    })
  } finally {
    progressUnsub?.()
    progressUnsub = null
  }
}

/** 浏览器打开下载页（自动更新失败时的手动兜底） */
export function openClientUpdateDownloadPage(): void {
  const url = $clientUpdate.get().info?.downloadurl

  if (url) {
    window.hermesDesktop?.openExternal?.(url)
  }
}
