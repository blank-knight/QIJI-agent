import { useStore } from '@nanostores/react'
import { useEffect, useRef, useState } from 'react'

import { BrandMark } from '@/components/brand-mark'
import { Button } from '@/components/ui/button'
// 忘记密码弹窗为登录页内部实现：全局 Dialog z-130 会被登录遮罩 z-[9999] 压住，不可见
import { ErrorIcon } from '@/components/ui/error-state'
import { Input } from '@/components/ui/input'
import { setEnvVar } from '@/hermes'
import { useI18n } from '@/i18n'
import { ChevronDown, Loader2, X } from '@/lib/icons'
import { BackendError, backendFetch } from '@/lib/backend'
import { loadSavedAccounts, removeSavedAccount, saveAccount, type SavedAccount } from '@/lib/saved-accounts'
import { registerAccountProfile } from '@/lib/account-profile'
import { selectProfile } from '@/store/profile'
import { notify } from '@/store/notifications'
import { $auth, devSkipLogin, login, register } from '@/store/auth'

import { cn } from '../lib/utils'

// 后端网页入口（注册已改为内置表单；忘记密码改为弹窗提示，文案由后端下发）。
const FORGOT_TIP_FALLBACK = '请联系客服或您的代理重置密码'

export interface LoginOverlayProps {
  /** 登录成功后回调（由 desktop-controller 用于刷新 config/model 等） */
  onLoggedIn?: () => void
}

export function LoginOverlay({ onLoggedIn }: LoginOverlayProps) {
  const auth = useStore($auth)
  const { t } = useI18n()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [mobile, setMobile] = useState('')
  const [regPassword, setRegPassword] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [forgotOpen, setForgotOpen] = useState(false)
  const [forgotTip, setForgotTip] = useState<string | null>(null)
  // 历史账号下拉
  const [savedList, setSavedList] = useState<SavedAccount[]>(() => loadSavedAccounts())
  const [dropdownOpen, setDropdownOpen] = useState(false)
  // 用户手动输入的过滤词。程序填入（挂载自动填充/选账号）不算——否则
  // 自动填充的上次账号会把下拉列表过滤得只剩它自己。
  const [typedFilter, setTypedFilter] = useState('')
  const [rememberPwd, setRememberPwd] = useState(false)
  const usernameRef = useRef<HTMLInputElement>(null)
  const mobileRef = useRef<HTMLInputElement>(null)

  // 打开忘记密码弹窗时拉取后端文案（失败用兜底文案，不打扰用户）
  function openForgotPassword() {
    setForgotOpen(true)
    setForgotTip(null)
    void backendFetch<{ tip: string }>('/api/client/v1/auth/forgottip')
      .then(res => {
        if (res.data?.tip) {
          setForgotTip(res.data.tip)
        }
      })
      .catch(() => {
        // 网络失败保持 null，渲染兜底文案
      })
  }

  // 自动聚焦第一个输入框
  useEffect(() => {
    if (mode === 'login') {
      usernameRef.current?.focus()
    } else {
      mobileRef.current?.focus()
    }
  }, [mode])

  // 自动填充上次登录的账号（有记住密码则一并填充并勾选）
  useEffect(() => {
    const last = savedList[0]
    if (mode === 'login' && last) {
      setUsername(last.username)
      if (last.password) {
        try {
          setPassword(atob(last.password))
          setRememberPwd(true)
        } catch {
          // 损坏数据忽略
        }
      }
    }
    // 仅挂载时执行一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 点击外部关闭下拉
  useEffect(() => {
    if (!dropdownOpen) return
    function onDocMouseDown(e: MouseEvent) {
      const t = e.target as HTMLElement
      if (!t.closest('[data-account-dropdown]') && !t.closest('[data-username-field]')) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [dropdownOpen])

  // 只按用户手动敲的字过滤；点箭头展开（typedFilter 为空）显示全部
  const filteredAccounts = typedFilter.trim()
    ? savedList.filter(a => a.username.includes(typedFilter.trim()))
    : savedList

  function pickAccount(a: SavedAccount) {
    // 只做填充，绝不代替用户登录——选号 ≠ 确认登录。
    setUsername(a.username)
    setDropdownOpen(false)

    if (a.password) {
      try {
        setPassword(atob(a.password))
        setRememberPwd(true)
      } catch {
        setPassword('')
      }
    } else {
      setPassword('')
      setRememberPwd(false)
    }

    // 聚焦登录按钮/密码框，用户确认后再登录
    requestAnimationFrame(() => document.getElementById('login-password')?.focus())
  }

  function deleteAccount(e: React.MouseEvent, name: string) {
    e.stopPropagation()
    removeSavedAccount(name)
    setSavedList(loadSavedAccounts())
  }

  // 切换模式时清空表单
  function switchMode(next: 'login' | 'register') {
    setMode(next)
    setError(null)
  }

  // 回车提交
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !busy) {
      void submit()
    }
  }

  async function submit() {
    if (mode === 'login') {
      return doLogin()
    }

    return doRegister()
  }

  /**
   * 登录。读表单 state（下拉选号只做填充，不直接触发登录）。
   */
  async function doLogin() {
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

      // 记住该账号（置顶）；未勾“记住密码”时抹掉已存密码。
      saveAccount(u, p, rememberPwd)
      setSavedList(loadSavedAccounts())

      // 用户隔离（方案A）：登录成功后热切换到该账号的专属 profile。
      // 走池化路径（selectProfile → ensureGatewayForProfile）：不杀后端、
      // 不 reload 窗口——旧实现的 profile.set（teardown + reload）就是
      // 切换账号时界面闪烁的根源。$activeGatewayProfile 订阅会自动完成
      // REST 路由切换与缓存失效；主进程按需拉起目标 profile 的后端。
      const accountProfile = registerAccountProfile(u)
      const currentProfile = await window.hermesDesktop?.profile?.get?.().then(r => r?.profile ?? null).catch(() => null)

      if (accountProfile !== currentProfile) {
        selectProfile(accountProfile)
        // 热切换后立即刷新配置/模型/会话列表，避免登录层收起后短暂显示
        // 上一个账号的残留数据
        onLoggedIn?.()
        return
      }

      // 把后端下发的 api_key 推进 gateway env
      if (data.api_key) {
        try {
          await setEnvVar('OPENAI_API_KEY', data.api_key)
        } catch {
          // gateway 还没 ready，不阻塞登录成功
        }
      }

      notify({ kind: 'success', title: '登录成功', message: `欢迎，${data.username ?? u}` })
      if (!data.api_key) {
        notify({ kind: 'info', title: '未配置 AI 服务', message: '请联系代理/上级开通，或在设置页面手动配置 API Key' })
      }
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

  async function doRegister() {
    const m = mobile.trim()
    const p = regPassword.trim()

    if (!m || !p) {
      setError('请输入手机号和密码')

      return
    }

    if (!/^1\d{10}$/.test(m)) {
      setError('请输入正确的手机号')

      return
    }

    if (p.length < 6) {
      setError('密码至少 6 位')

      return
    }

    setError(null)
    setBusy(true)

    try {
      const data = await register(m, p, inviteCode.trim() || undefined)

      // 用户隔离（方案A）：注册即自动登录——切到该账号的专属 profile。
      const accountProfile = registerAccountProfile(m)
      const currentProfile = await window.hermesDesktop?.profile?.get?.().then(r => r?.profile ?? null).catch(() => null)
      if (accountProfile !== 'default' && accountProfile !== currentProfile) {
        await window.hermesDesktop?.profile?.set?.(accountProfile).catch(() => undefined)
        return
      }

      // 注册成功后后端直接返回 token + api_key，自动登录
      if (data.api_key) {
        try {
          await setEnvVar('OPENAI_API_KEY', data.api_key)
        } catch {
          // gateway 还没 ready
        }
      }

      notify({ kind: 'success', title: '注册成功', message: `欢迎，${data.username ?? m}` })
      if (!data.api_key) {
        notify({ kind: 'info', title: '未配置 AI 服务', message: '请联系代理/上级开通，或在设置页面手动配置 API Key' })
      }
      onLoggedIn?.()
    } catch (err) {
      const msg =
        err instanceof BackendError
          ? err.message
          : err instanceof Error
            ? err.message
            : '注册失败，请重试'

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
          <p className="text-base text-(--ui-text-tertiary)">
            {mode === 'login' ? '登录以开始使用' : '注册新账号'}
          </p>
        </div>

        {mode === 'login' ? (
          /* —— 登录表单 —— */
          <div className="space-y-4" onKeyDown={onKeyDown}>
            <div className="relative space-y-2">
              <label className="text-sm font-medium text-(--ui-text-secondary)" htmlFor="login-username">
                用户名
              </label>
              <div className="relative" data-username-field>
                <Input
                  autoComplete="username"
                  className="h-12 text-base pr-10"
                  disabled={busy}
                  id="login-username"
                  onChange={e => {
                    setUsername(e.target.value)
                    setTypedFilter(e.target.value)
                    setDropdownOpen(true)
                  }}
                  placeholder="请输入用户名"
                  ref={usernameRef}
                  value={username}
                />
                {savedList.length > 0 && (
                  <button
                    aria-label="选择历史账号"
                    className={cn(
                      'absolute right-3 top-1/2 -translate-y-1/2 text-(--ui-text-tertiary)',
                      'transition-transform hover:text-foreground',
                      dropdownOpen && 'rotate-180'
                    )}
                    onClick={() => setDropdownOpen(v => !v)}
                    tabIndex={-1}
                    type="button"
                  >
                    <ChevronDown className="size-4" />
                  </button>
                )}

                {/* 历史账号下拉 */}
                {dropdownOpen && filteredAccounts.length > 0 && (
                  <div
                    className={cn(
                      'absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-md',
                      'border border-border bg-popover text-popover-foreground shadow-lg'
                    )}
                    data-account-dropdown
                  >
                    {filteredAccounts.map(a => (
                      <div
                        className={cn(
                          'flex items-center justify-between gap-2 px-3 py-2.5 text-sm',
                          'cursor-pointer transition-colors hover:bg-accent'
                        )}
                        key={a.username}
                        onClick={() => pickAccount(a)}
                      >
                        <span className="truncate">{a.username}</span>
                        {a.password ? (
                          <span className="shrink-0 text-xs text-(--ui-text-tertiary)">已存密码</span>
                        ) : null}
                        <button
                          aria-label={`删除 ${a.username}`}
                          className="shrink-0 rounded p-0.5 text-(--ui-text-tertiary) transition-colors hover:bg-(--ui-destructive-soft) hover:text-(--ui-destructive)"
                          onClick={e => deleteAccount(e, a.username)}
                          type="button"
                        >
                          <X className="size-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
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
                placeholder="请输入密码"
                type="password"
                value={password}
              />
            </div>

            <label className="flex cursor-pointer items-center gap-2 text-sm text-(--ui-text-tertiary)">
              <input
                checked={rememberPwd}
                className="size-4 accent-(--ui-primary)"
                onChange={e => setRememberPwd(e.target.checked)}
                type="checkbox"
              />
              记住密码
            </label>

            {error && (
              <div className="flex items-start gap-2 rounded-md bg-(--ui-destructive-soft) p-3 text-sm leading-5 text-(--ui-destructive)">
                <ErrorIcon className="size-4 shrink-0" size="1em" />
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
        ) : (
          /* —— 注册表单 —— */
          <div className="space-y-4" onKeyDown={onKeyDown}>
            <div className="space-y-2">
              <label className="text-sm font-medium text-(--ui-text-secondary)" htmlFor="reg-mobile">
                手机号
              </label>
              <Input
                autoComplete="tel"
                className="h-12 text-base"
                disabled={busy}
                id="reg-mobile"
                maxLength={11}
                onChange={e => setMobile(e.target.value.replace(/\D/g, ''))}
                placeholder="请输入手机号"
                ref={mobileRef}
                value={mobile}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-(--ui-text-secondary)" htmlFor="reg-password">
                密码
              </label>
              <Input
                autoComplete="new-password"
                className="h-12 text-base"
                disabled={busy}
                id="reg-password"
                onChange={e => setRegPassword(e.target.value)}
                placeholder="至少 6 位"
                type="password"
                value={regPassword}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-(--ui-text-tertiary)" htmlFor="reg-invite">
                邀请码（选填）
              </label>
              <Input
                className="h-12 text-base"
                disabled={busy}
                id="reg-invite"
                onChange={e => setInviteCode(e.target.value)}
                placeholder="填写邀请码成为正式用户"
                value={inviteCode}
              />
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-md bg-(--ui-destructive-soft) p-3 text-sm leading-5 text-(--ui-destructive)">
                <ErrorIcon className="size-4 shrink-0" size="1em" />
                <span>{error}</span>
              </div>
            )}

            <Button className="h-12 w-full text-base font-semibold" disabled={busy} onClick={() => void submit()} size="lg">
              {busy ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  注册中…
                </>
              ) : (
                '注册'
              )}
            </Button>
          </div>
        )}

        {/* 底部：登录/注册切换 + 忘记密码 */}
        {mode === 'login' ? (
          <div className="flex items-center justify-center gap-5 text-sm text-(--ui-text-tertiary)">
            <button
              className="inline-flex items-center gap-1.5 transition-colors hover:text-foreground"
              onClick={() => switchMode('register')}
              type="button"
            >
              注册账号
            </button>
            <span className="text-(--ui-border)">·</span>
            <button
              className="inline-flex items-center gap-1.5 transition-colors hover:text-foreground"
              onClick={openForgotPassword}
              type="button"
            >
              忘记密码
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-center text-sm text-(--ui-text-tertiary)">
            <button
              className="transition-colors hover:text-foreground"
              onClick={() => switchMode('login')}
              type="button"
            >
              已有账号？返回登录
            </button>
          </div>
        )}

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

      {/* 忘记密码弹窗：文案由后端 forgottip 接口下发，后台可配。
          登录页本身是 z-[9999] 顶层遮罩，全局 Dialog(z-130) 会被它压住，
          所以这里在遮罩内部用绝对定位画一个同层模态框。 */}
      {forgotOpen && (
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/40"
          onClick={() => setForgotOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-xl border border-border bg-background p-5 shadow-lg"
            onClick={event => event.stopPropagation()}
          >
            <h2 className="text-base font-semibold text-foreground">忘记密码</h2>
            <p className="mt-1 text-sm text-(--ui-text-tertiary)">请联系相关人员为您重置密码</p>
            <div className="mt-4 rounded-md bg-(--ui-text-tertiary)/10 p-4 text-sm leading-relaxed text-foreground">
              {forgotTip ?? FORGOT_TIP_FALLBACK}
            </div>
            <div className="mt-4 flex justify-end">
              <Button onClick={() => setForgotOpen(false)} type="button" variant="ghost">
                我知道了
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
