import { useStore } from '@nanostores/react'
import { useEffect, useRef, useState } from 'react'

import { BrandMark } from '@/components/brand-mark'
import { Button } from '@/components/ui/button'
import { ErrorIcon } from '@/components/ui/error-state'
import { Input } from '@/components/ui/input'
import { setEnvVar } from '@/hermes'
import { useI18n } from '@/i18n'
import { ExternalLink as ExternalLinkIcon, Loader2 } from '@/lib/icons'
import { openExternalLink } from '@/lib/external-link'
import { BackendError } from '@/lib/backend'
import { notify } from '@/store/notifications'
import { $auth, devSkipLogin, login } from '@/store/auth'

import { cn } from '../lib/utils'

// 后端网页入口（注册/找回密码）。随 4.1 基地址定了一起改。
// 暂时指向基地址根路径下的 /register 和 /forgot-password，后端确认后调整。
const REGISTER_URL = '/register'
const FORGOT_PASSWORD_URL = '/forgot-password'

export interface LoginOverlayProps {
  /** 登录成功后回调（由 desktop-controller 用于刷新 config/model 等） */
  onLoggedIn?: () => void
}

export function LoginOverlay({ onLoggedIn }: LoginOverlayProps) {
  const auth = useStore($auth)
  const { t } = useI18n()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const usernameRef = useRef<HTMLInputElement>(null)

  // 自动聚焦用户名输入框
  useEffect(() => {
    usernameRef.current?.focus()
  }, [])

  // 回车提交
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !busy) {
      void submit()
    }
  }

  async function submit() {
    const u = username.trim()
    const p = password.trim()

    if (!u || !p) {
      setError('请输入用户名和密码')

      return
    }

    setError(null)
    setBusy(true)

    try {
      const data = await login(u, p)

      // 把后端下发的 api_key 推进 gateway env
      // 注意：这步需要 gateway 已启动；如果 gateway 还没连上，setEnvVar 会失败
      // 此时由 desktop-controller 在 gateway ready 后再补推（见 1.4）
      try {
        await setEnvVar('OPENAI_API_KEY', data.api_key)
      } catch {
        // gateway 还没 ready，不阻塞登录成功——controller 会兜底补推
      }

      notify({ kind: 'success', title: '登录成功', message: `欢迎，${data.username}` })
      onLoggedIn?.()
    } catch (err) {
      const msg =
        err instanceof BackendError
          ? err.message
          : err instanceof Error
            ? err.message
            : '登录失败，请重试'

      setError(msg)
    } finally {
      setBusy(false)
    }
  }

  // 登录覆盖层：顶层全屏遮罩，比所有东西都顶层（z-index 极高）
  return (
    <div
      className={cn(
        'fixed inset-0 z-[9999] flex items-center justify-center',
        'bg-background'
      )}
    >
      <div className="w-full max-w-sm space-y-8 px-6">
        {/* Logo + 标题 */}
        <div className="flex flex-col items-center gap-4">
          <BrandMark className="size-20 rounded-lg border border-border/40 shadow-sm p-1" />
          <h1 className="text-3xl font-bold text-foreground">奇计</h1>
          <p className="text-base text-(--ui-text-tertiary)">登录以开始使用</p>
        </div>

        {/* 登录表单 */}
        <div className="space-y-4" onKeyDown={onKeyDown}>
          <div className="space-y-2">
            <label className="text-sm font-medium text-(--ui-text-secondary)" htmlFor="login-username">
              用户名
            </label>
            <Input
              autoComplete="username"
              className="h-12 text-base"
              disabled={busy}
              id="login-username"
              onChange={e => setUsername(e.target.value)}
              placeholder="请输入用户名"
              ref={usernameRef}
              value={username}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-(--ui-text-secondary)" htmlFor="login-password">
              密码
            </label>
            <Input
              autoComplete="current-password"
              className="h-12 text-base"
              disabled={busy}
              id="login-password"
              onChange={e => setPassword(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="请输入密码"
              type="password"
              value={password}
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-md bg-(--ui-destructive-soft) p-3 text-sm text-(--ui-destructive)">
              <ErrorIcon className="mt-0.5 size-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <Button className="h-12 w-full text-base font-semibold" disabled={busy} onClick={() => void submit()} size="lg">
            {busy ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                登录中…
              </>
            ) : (
              '登录'
            )}
          </Button>
        </div>

        {/* 底部外链：注册 / 忘记密码 */}
        <div className="flex items-center justify-center gap-5 text-sm text-(--ui-text-tertiary)">
          <button
            className="inline-flex items-center gap-1.5 transition-colors hover:text-foreground"
            onClick={() => openExternalLink(REGISTER_URL)}
            type="button"
          >
            <ExternalLinkIcon className="size-3.5" />
            注册账号
          </button>
          <span className="text-(--ui-border)">·</span>
          <button
            className="inline-flex items-center gap-1.5 transition-colors hover:text-foreground"
            onClick={() => openExternalLink(FORGOT_PASSWORD_URL)}
            type="button"
          >
            <ExternalLinkIcon className="size-3.5" />
            忘记密码
          </button>
        </div>

        {/* 开发模式：跳过登录（后端未就绪时用来看主界面 UI） */}
        <div className="border-t border-border/30 pt-4">
          <button
            className="w-full text-center text-sm text-(--ui-text-tertiary) underline underline-offset-2 transition-colors hover:text-foreground"
            onClick={() => devSkipLogin()}
            type="button"
          >
            [开发模式] 跳过登录
          </button>
        </div>
      </div>
    </div>
  )
}
