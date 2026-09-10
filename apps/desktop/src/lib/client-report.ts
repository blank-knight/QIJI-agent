/**
 * 客户端异常/日志上报
 *
 * 两条通道:
 * 1. 手动: 用户点「反馈问题」→ submitReport('manual', digest) → 打包最近日志上报
 * 2. 自动: 渲染层崩溃 / boot 失败场景由 desktop-controller 或主进程触发
 *
 * 上报内容: 版本 + 平台 + 最近 N 行 desktop.log(主进程 getRecentLogs 提供)
 * 隐私: 日志在服务端做 token 打码; 未登录也可上报(anon@IP)
 */

import { backendFetch } from '@/lib/backend'
import { $auth } from '@/store/auth'

export type ReportType = 'manual' | 'auto_crash' | 'auto_renderer' | 'auto_boot_fail'

interface RecentLogsResult {
  path: string
  lines: string[]
}

/** 收集环境信息 */
function collectPlatform(): string {
  const nav = navigator.userAgent
  let os = 'unknown'
  let arch = ''
  if (nav.includes('Windows NT 10.0')) os = 'Win10/11'
  else if (nav.includes('Windows NT 6.3')) os = 'Win8.1'
  else if (nav.includes('Mac OS X')) os = 'macOS'
  else if (nav.includes('Linux')) os = 'Linux'
  const m = nav.match(/\(([^)]+)\)/)
  if (m) arch = m[1].slice(0, 60)
  const mem = (navigator as unknown as { deviceMemory?: number }).deviceMemory
  return `${os} | ${arch}${mem ? ` | ${mem}GB` : ''}`
}

/** 拉最近日志(主进程内存镜像,最多200行) */
async function collectLogs(maxLines = 200): Promise<string> {
  try {
    const r = await window.hermesDesktop?.getRecentLogs?.()
    if (r && Array.isArray((r as RecentLogsResult).lines)) {
      return (r as RecentLogsResult).lines.slice(-maxLines).join('\n')
    }
  } catch {
    // 主进程不可用时仅上报概要
  }
  return ''
}

async function collectVersion(): Promise<string> {
  try {
    const v = await window.hermesDesktop?.getVersion?.()
    if (typeof v === 'string') return v
    const info = v as { version?: string } | null | undefined
    return info?.version ?? 'unknown'
  } catch {
    return 'unknown'
  }
}

export interface ReportResult {
  ok: boolean
  message: string
}

/**
 * 提交上报。digest 是给运营看的一行摘要; 详细内容在 logs 里。
 */
export async function submitReport(
  type: ReportType,
  digest: string,
  extraLogs = ''
): Promise<ReportResult> {
  try {
    const [version, platform, logs] = await Promise.all([
      collectVersion(),
      Promise.resolve(collectPlatform()),
      collectLogs()
    ])
    const merged = extraLogs ? `${extraLogs}\n${logs}` : logs
    const body = JSON.stringify({
      type,
      app_version: version,
      platform,
      digest,
      logs: merged
    })

    const res = await backendFetch('/api/client/v1/report/submit', {
      method: 'POST',
      body
    })

    return { ok: true, message: (res.msg as string) || '上报成功' }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, message: `上报失败: ${msg}` }
  }
}

/** 渲染层崩溃时自动上报(带节流,同会话最多3次) */
let autoReportCount = 0
export async function autoReportCrash(reason: string): Promise<void> {
  if (autoReportCount >= 3) return
  autoReportCount++
  try {
    await submitReport('auto_renderer', `渲染层异常: ${reason}`.slice(0, 180))
  } catch {
    // 静默失败,不能让上报本身引发新错误
  }
}

/** 当前上报者(登录=账号名,未登录=anonymous) */
export function reportUserInfo(): string {
  const s = $auth.get()
  return s.username || 'anonymous'
}
