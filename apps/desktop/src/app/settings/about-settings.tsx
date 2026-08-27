import { useStore } from '@nanostores/react'
import { useEffect, useState } from 'react'

import { BrandMark } from '@/components/brand-mark'
import { Button } from '@/components/ui/button'
import { type Translations, useI18n } from '@/i18n'
import { CheckCircle2, Download, Loader2, RefreshCw, Sparkles } from '@/lib/icons'
import { BackendError, backendFetch } from '@/lib/backend'
import { cn } from '@/lib/utils'
import { clearAuth, $auth } from '@/store/auth'
import {
  $clientUpdate,
  checkClientUpdate,
  openClientUpdateDownloadPage,
  startClientUpdate
} from '@/store/client-update'
import { $desktopVersion, refreshDesktopVersion } from '@/store/updates'

import { ListRow, SectionHeading, SettingsContent } from './primitives'
import { UninstallSection } from './uninstall-section'

// 修改密码弹窗（登录用户）：原密码 + 新密码，成功后跳回登录页。
// 用受控条件渲染而非全局 Dialog——设置面板本身层级高，全局弹窗可能被压住
// （忘记密码弹窗踩过同样的坑：登录遮罩 z-9999 压住 Dialog z-130）。
function ChangePasswordPanel({ onClose }: { onClose: () => void }) {
  const [oldpwd, setOldpwd] = useState('')
  const [newpwd, setNewpwd] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    if (busy) return
    if (newpwd.length < 6) {
      setError('新密码长度不能少于6位')
      return
    }
    if (newpwd !== confirm) {
      setError('两次输入的新密码不一致')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await backendFetch('/api/client/v1/auth/changepwd', {
        method: 'POST',
        body: JSON.stringify({ oldpassword: oldpwd, newpassword: newpwd })
      })
      // 改密成功：后端已作废当前 token，清本地状态回登录页。
      // 先拆掉老后端（resetBootstrap 只清内存失败态+SIGTERM 后端，不重装），
      // 重登时必拉全新后端，避免带着作废 token 的病后端被反复重拨。
      clearAuth()
      await window.hermesDesktop?.resetBootstrap().catch(() => undefined)
      window.location.reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : '修改失败，请稍后重试')
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/40"
      onClick={busy ? undefined : onClose}
    >
      <div
        className="w-full max-w-sm rounded-xl border border-border bg-background p-5 shadow-lg"
        onClick={event => event.stopPropagation()}
      >
        <h2 className="text-base font-semibold text-foreground">修改密码</h2>
        <div className="mt-4 space-y-3">
          <input
            autoComplete="current-password"
            className="h-10 w-full rounded-md border border-border bg-transparent px-3 text-sm outline-none focus:border-primary"
            disabled={busy}
            onChange={e => setOldpwd(e.target.value)}
            placeholder="原密码"
            type="password"
            value={oldpwd}
          />
          <input
            autoComplete="new-password"
            className="h-10 w-full rounded-md border border-border bg-transparent px-3 text-sm outline-none focus:border-primary"
            disabled={busy}
            onChange={e => setNewpwd(e.target.value)}
            placeholder="新密码（至少6位）"
            type="password"
            value={newpwd}
          />
          <input
            autoComplete="new-password"
            className="h-10 w-full rounded-md border border-border bg-transparent px-3 text-sm outline-none focus:border-primary"
            disabled={busy}
            onChange={e => setConfirm(e.target.value)}
            placeholder="再次输入新密码"
            type="password"
            value={confirm}
          />
        </div>
        {error ? (
          <div className="mt-3 rounded-md bg-(--ui-destructive-soft) p-2.5 text-xs leading-5 text-(--ui-destructive)">
            {error}
          </div>
        ) : null}
        <div className="mt-4 flex justify-end gap-2">
          <Button disabled={busy} onClick={onClose} type="button" variant="ghost">
            取消
          </Button>
          <Button disabled={busy} onClick={() => void submit()} type="button">
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            {busy ? '提交中…' : '确认修改'}
          </Button>
        </div>
      </div>
    </div>
  )
}

function relativeTime(ms: number | undefined, a: Translations['settings']['about']) {
  if (!ms) {
    return a.never
  }

  const diff = Date.now() - ms

  if (diff < 60_000) {
    return a.justNow
  }

  if (diff < 3_600_000) {
    return a.minAgo(Math.round(diff / 60_000))
  }

  if (diff < 86_400_000) {
    return a.hoursAgo(Math.round(diff / 3_600_000))
  }

  return a.daysAgo(Math.round(diff / 86_400_000))
}

export function AboutSettings() {
  const { t } = useI18n()
  const a = t.settings.about
  const version = useStore($desktopVersion)
  const clientUpdate = useStore($clientUpdate)
  const authState = useStore($auth)
  const [showChangePwd, setShowChangePwd] = useState(false)
  const [diagBusy, setDiagBusy] = useState(false)
  const [diagMsg, setDiagMsg] = useState<string | null>(null)
  const [diagOk, setDiagOk] = useState(false)

  async function handleExportDiagnostics() {
    if (diagBusy) {
      return
    }
    setDiagBusy(true)
    setDiagMsg(null)
    try {
      const api = window.hermesDesktop?.exportDiagnostics
      if (!api) {
        setDiagOk(false)
        setDiagMsg('当前版本不支持诊断导出，请手动拷贝 %LOCALAPPDATA%\\qiji\\logs 目录')
        return
      }
      const result = await api()
      if (result?.ok) {
        setDiagOk(true)
        setDiagMsg(`已导出到桌面：${result.path ?? 'qiji-diagnostics-*.txt'}`)
      } else {
        setDiagOk(false)
        setDiagMsg(result?.error ? `导出失败：${result.error}` : '导出失败，请稍后重试')
      }
    } catch (err) {
      setDiagOk(false)
      setDiagMsg(err instanceof Error ? err.message : '导出失败，请稍后重试')
    } finally {
      setDiagBusy(false)
    }
  }

  // The version atom is loaded once at app boot, which makes About show a
  // stale number after a self-update (the running binary is current, the
  // displayed string is not). Re-read on mount so opening About always
  // reflects the running build.
  useEffect(() => {
    void refreshDesktopVersion()
  }, [])

  const checking = clientUpdate.status === 'checking'
  const available = clientUpdate.status === 'available' && clientUpdate.info
  const downloading = clientUpdate.status === 'downloading'
  const failed = clientUpdate.status === 'error'

  let statusLine: string
  let statusTone: 'idle' | 'available' | 'error' = 'idle'

  if (downloading) {
    statusLine = clientUpdate.progressIndeterminate
      ? '正在下载新版本…'
      : `正在下载新版本 ${clientUpdate.progressPercent}%`
    statusTone = 'available'
  } else if (available) {
    statusLine = `有新版本 v${clientUpdate.info?.newversion}`
    statusTone = 'available'
  } else if (failed) {
    statusLine = clientUpdate.error ?? '版本检查失败'
    statusTone = 'error'
  } else if (clientUpdate.status === 'uptodate') {
    statusLine = '已是最新版本'
  } else {
    statusLine = '点击检查更新'
  }

  return (
    <SettingsContent>
      <div className="flex flex-col items-center gap-3 pt-6 pb-2 text-center">
        <BrandMark className="size-16" />
        <div>
          <h2 className="text-lg font-semibold tracking-tight">{a.heading}</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {version?.appVersion ? a.version(version.appVersion) : a.versionUnavailable}
          </p>
        </div>
      </div>

      <div className="mx-auto mt-4 w-full max-w-2xl">
        {/* 奇计后端联动：额度显示（被动查看，放关于页深处） */}
        <SectionHeading icon={Sparkles} title="账户信息" />
        <div className="mb-4 rounded-xl border border-border/70 bg-muted/20 px-4 py-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">剩余额度</span>
            <span className={cn('font-medium', authState.score <= 0 && 'text-destructive')}>
              {authState.score}
            </span>
          </div>
          <div className="mt-1.5 flex items-center justify-between text-xs text-muted-foreground">
            <span>账号模式</span>
            <span>{authState.mode === 'formal' ? '正式' : '体验'}</span>
          </div>
          <div className="mt-3 border-t border-border/50 pt-3">
            <Button
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() => setShowChangePwd(true)}
            >
              修改密码
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="mt-1 w-full text-destructive hover:text-destructive"
              onClick={() => {
                clearAuth()
                // 退出登录：先拆老后端再重载（resetBootstrap 不触发重装，
                // 只 SIGTERM 后端+清内存失败态），重登必得全新后端。
                void window.hermesDesktop
                  ?.resetBootstrap()
                  .catch(() => undefined)
                  .finally(() => window.location.reload())
              }}
            >
              退出登录
            </Button>
          </div>
        </div>
        {showChangePwd ? <ChangePasswordPanel onClose={() => setShowChangePwd(false)} /> : null}

        <SectionHeading icon={RefreshCw} title={a.updates} />

        <div
          className={cn(
            'rounded-xl border px-4 py-3 text-sm',
            statusTone === 'available' && 'border-primary/30 bg-primary/5 text-foreground',
            statusTone === 'error' && 'border-destructive/35 bg-destructive/5 text-destructive',
            statusTone === 'idle' && 'border-border/70 bg-muted/20 text-foreground'
          )}
        >
          <div className="flex items-start gap-2">
            {statusTone === 'available' ? (
              <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" />
            ) : statusTone === 'error' ? null : (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            )}
            <div className="min-w-0 flex-1">
              <p className="font-medium">{statusLine}</p>
              {available && clientUpdate.info?.upgradetext && (
                <pre className="mt-1.5 whitespace-pre-wrap font-sans text-xs text-muted-foreground">
                  {clientUpdate.info.upgradetext}
                </pre>
              )}
              <p className="mt-1 text-xs text-muted-foreground">
                {a.lastChecked(relativeTime(clientUpdate.lastCheckedAt, a))}
              </p>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-4">
            <Button
              disabled={checking || downloading}
              onClick={() => void checkClientUpdate({ manual: true })}
              size="sm"
              variant="textStrong"
            >
              {checking ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3" />}
              {checking ? a.checking : a.checkNow}
            </Button>

            {available && !downloading && (
              <Button onClick={() => void startClientUpdate()} size="sm">
                <Download className="size-3" />
                {a.updateNow}
              </Button>
            )}

            {(available || failed) && !downloading && (
              <Button onClick={openClientUpdateDownloadPage} size="sm" variant="textStrong">
                手动下载
              </Button>
            )}
          </div>

          {downloading && (
            <div className="mt-3">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    'h-full rounded-full bg-primary transition-[width] duration-300',
                    clientUpdate.progressIndeterminate && 'w-1/3 animate-pulse'
                  )}
                  style={clientUpdate.progressIndeterminate ? undefined : { width: `${clientUpdate.progressPercent}%` }}
                />
              </div>
            </div>
          )}
        </div>

        <ListRow description={a.automaticUpdatesDesc} title={a.automaticUpdates} />

        {/* 诊断快照导出：用户反馈问题时一键把日志打包到桌面，替代"手动拷贝数据目录" */}
        <SectionHeading icon={Download} title="诊断" />
        <div className="mb-4 rounded-xl border border-border/70 bg-muted/20 px-4 py-3 text-sm">
          <p className="text-xs text-muted-foreground">
            遇到问题时点击下方按钮，客户端会把运行日志与环境信息打包成一个文本文件放到桌面，发给客服即可（不含任何密钥明文）。
          </p>
          <Button
            className="mt-2"
            disabled={diagBusy}
            onClick={handleExportDiagnostics}
            size="sm"
            variant="textStrong"
          >
            {diagBusy ? <Loader2 className="size-3 animate-spin" /> : <Download className="size-3" />}
            {diagBusy ? '正在导出…' : '导出诊断日志'}
          </Button>
          {diagMsg ? (
            <p className={cn('mt-2 text-xs', diagOk ? 'text-emerald-600' : 'text-destructive')}>
              {diagMsg}
            </p>
          ) : null}
        </div>

        <UninstallSection />
      </div>
    </SettingsContent>
  )
}
