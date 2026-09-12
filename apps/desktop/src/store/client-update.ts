import { atom } from 'nanostores'

import { checkUpdate, type UpdateCheckResponse } from '@/lib/backend'
import { notify } from '@/store/notifications'

// 非强制更新的 toast 冷却时间（24h），避免每次启动都弹。
// 冷却按"版本"隔离：同一版本 24h 内不重复弹，换新版本号立即重新弹。
const TOAST_COOLDOWN_MS = 24 * 60 * 60 * 1000
const toastCooldownKey = (version: string) => `qiji-client-update-toast-${version}`
// 已下载安装包路径（跨启动持久化；temp 文件被系统清理时优雅降级）
const downloadedPathKey = (version: string) => `qiji-client-update-installer-${version}`

export type ClientUpdateStatus =
  | 'idle' // 还没检查过
  | 'checking'
  | 'uptodate'
  | 'available' // 有新版本，等待用户操作
  | 'downloading' // 后台静默下载中（不阻断界面）
  | 'downloaded' // 已下载完成，等待用户确认安装
  | 'error'

export interface ClientUpdateState {
  status: ClientUpdateStatus
  info: UpdateCheckResponse | null
  /** 下载进度 0-100；0 = 不确定（服务器无 Content-Length） */
  progressPercent: number
  /** 服务器未告知总大小时为 true，UI 显示不定进度条 */
  progressIndeterminate: boolean
  /** 已下载安装包的本地路径（status=downloaded 时有效） */
  installerPath?: string
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
 * 已下载完成待安装的安装包路径（status=downloaded 时非空）。
 */
export function downloadedInstallerPath(): string | null {
  const state = $clientUpdate.get()
  return state.status === 'downloaded' ? state.installerPath ?? null : null
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

    // 上次会话已下载完这个版本：直接恢复 downloaded 态（文件可能已被
    // 系统清理，装的时候主进程会报"安装包不存在"，届时自然回落重下）
    try {
      const savedPath = window.localStorage.getItem(downloadedPathKey(info.newversion))

      if (savedPath) {
        patch({ status: 'downloaded', installerPath: savedPath })
        return
      }
    } catch {
      // localStorage 不可用就当没下载过
    }

    // 手动检查：结果展示在关于页，不重复弹 toast
    if (options.manual) {
      return
    }

    try {
      const key = toastCooldownKey(info.newversion)
      const last = Number(window.localStorage.getItem(key) || 0)

      if (Date.now() - last < TOAST_COOLDOWN_MS) {
        return
      }

      window.localStorage.setItem(key, String(Date.now()))
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
 * 后台静默下载新安装包（主进程执行，不阻断界面）。
 * 下载完成后弹常驻提醒，用户点「立即安装」才真正运行安装程序。
 */
export async function startClientUpdate(): Promise<void> {
  const state = $clientUpdate.get()
  const url = state.info?.downloadurl

  if (!url) {
    notify({ kind: 'error', message: '没有可用的下载地址，请稍后重试' })
    return
  }

  if (state.status === 'downloading' || state.status === 'downloaded') {
    return
  }

  const bridge = window.hermesDesktop?.clientUpdate

  if (!bridge?.download) {
    // 理论上到不了这里（preload 一定有）；兜底走浏览器下载
    notify({ kind: 'warning', title: '无法自动更新', message: '已在浏览器打开下载页面，请手动下载安装' })
    window.hermesDesktop?.openExternal?.(url)
    return
  }

  // 发布签名元数据透传主进程（sha256/signature 验签用）
  const meta = { sha256: state.info?.sha256, signature: state.info?.signature, newversion: state.info?.newversion }

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
    const result = await bridge.download(url, meta)

    patch({ status: 'downloaded', installerPath: result.path, progressPercent: 100, progressIndeterminate: false })

    try {
      window.localStorage.setItem(downloadedPathKey(state.info?.newversion ?? ''), result.path)
    } catch {
      // 存不进 localStorage 不影响本次会话安装
    }

    notify({
      kind: 'success',
      title: `新版本 v${state.info?.newversion ?? ''} 已下载完成`,
      message: '点击「立即安装」完成升级',
      durationMs: 0,
      action: {
        label: '立即安装',
        onClick: () => void installClientUpdate()
      }
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)

    patch({ status: 'error', info: state.info, progressPercent: 0, error: message })

    notify({
      kind: 'error',
      title: '更新下载失败',
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

/**
 * 运行已下载的安装包（主进程执行，应用随即退出让安装器覆盖安装）。
 */
export async function installClientUpdate(): Promise<void> {
  const state = $clientUpdate.get()
  const filePath = state.status === 'downloaded' ? state.installerPath : null

  if (!filePath) {
    return
  }

  const bridge = window.hermesDesktop?.clientUpdate

  if (!bridge?.runInstaller) {
    return
  }

  try {
    await bridge.runInstaller(filePath, {
      sha256: state.info?.sha256,
      signature: state.info?.signature,
      newversion: state.info?.newversion
    })
    // 安装程序已启动，应用即将退出
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)

    // 安装包已不存在（如系统清理了临时目录）→ 清掉记录，回到可重下状态
    if (message.includes('安装包不存在')) {
      try {
        window.localStorage.removeItem(downloadedPathKey(state.info?.newversion ?? ''))
      } catch { /* ignore */ }
      patch({ status: 'available', installerPath: undefined })
      notify({ kind: 'warning', title: '安装包已失效', message: '请重新下载更新包' })
      return
    }

    notify({ kind: 'error', title: '启动安装失败', message })
  }
}

/** 丢弃已下载的安装包，回到可重新下载状态（本地缓存可能过期/损坏时用）。 */
export async function discardDownloadedInstaller(): Promise<void> {
  const state = $clientUpdate.get()

  if (state.status !== 'downloaded') {
    return
  }

  try {
    window.localStorage.removeItem(downloadedPathKey(state.info?.newversion ?? ''))
  } catch { /* ignore */ }

  patch({ status: 'available', installerPath: undefined, progressPercent: 0 })
}

/**
 * 强制更新专用：下载并立即运行安装（downloadAndRun 一体通道）。
 * enforce 没有「稍后」的余地，下载完直接装、应用退出。
 */
export async function runEnforcedClientUpdate(): Promise<void> {
  const state = $clientUpdate.get()
  const url = state.info?.downloadurl

  if (!url) {
    return
  }

  const bridge = window.hermesDesktop?.clientUpdate

  if (!bridge) {
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
    await bridge.downloadAndRun(url, {
      sha256: state.info?.sha256,
      signature: state.info?.signature,
      newversion: state.info?.newversion
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)

    patch({ status: 'error', info: state.info, progressPercent: 0, error: message })
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
