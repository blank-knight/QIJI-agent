import { useStore } from '@nanostores/react'
import { useCallback, useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { useI18n } from '@/i18n'
import { CheckCircle2, Loader2, Sparkles, Users } from '@/lib/icons'
import { BackendError, backendGet, backendPost } from '@/lib/backend'
import { cn } from '@/lib/utils'
import { $auth, setAvatar as setGlobalAvatar, setScore } from '@/store/auth'

import { ListRow, SectionHeading, SettingsContent } from './primitives'

// —— 类型 ——

interface ProfileData {
  id: number
  username: string
  nickname: string
  avatar: string
  mobile: string
  email: string
  score: number
  mode: 'trial' | 'formal'
  agent_name: string
  createtime: string
}

interface ScoreLogRow {
  id: number
  score: number
  before_score: number
  after_score: number
  memo: string
  model: string
  createtime: string
}

// 内置头像预设：emoji 形态 avatar://emoji/<n>
const AVATAR_PRESETS = ['🐬', '🦊', '🐼', '🦉', '🐳', '🦄', '🐺', '🌵'] as const

function avatarUrl(emoji: string): string {
  return `avatar://emoji/${encodeURIComponent(emoji)}`
}

function avatarEmoji(url: string): string {
  if (url.startsWith('avatar://emoji/')) {
    const raw = decodeURIComponent(url.slice('avatar://emoji/'.length))
    if (AVATAR_PRESETS.includes(raw as (typeof AVATAR_PRESETS)[number])) {
      return raw
    }
  }
  return ''
}

// —— 主面板 ——

export function AccountSettings() {
  const { t } = useI18n()
  const a = t.settings.account
  const authState = useStore($auth)

  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // 编辑态
  const [nickname, setNickname] = useState('')
  const [email, setEmail] = useState('')
  const [avatar, setAvatar] = useState('')
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileSaved, setProfileSaved] = useState(false)
  const [profileError, setProfileError] = useState<string | null>(null)

  // 充值
  const [code, setCode] = useState('')
  const [redeeming, setRedeeming] = useState(false)
  const [rechargeMsg, setRechargeMsg] = useState<string | null>(null)
  const [rechargeOk, setRechargeOk] = useState(false)

  // 流水
  const [logs, setLogs] = useState<ScoreLogRow[]>([])
  const [logsTotal, setLogsTotal] = useState(0)
  const [logsPage, setLogsPage] = useState(1)
  const [loadingLogs, setLoadingLogs] = useState(false)

  const reloadProfile = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const res = await backendGet<ProfileData>('/api/client/v1/profile')
      const d = res.data
      if (!d) throw new Error('empty')
      setProfile(d)
      setNickname(d.nickname || '')
      setEmail(d.email || '')
      setAvatar(d.avatar || '')
      // 同步全局（标题栏账号胶囊显示头像）
      if ((authState.avatar ?? '') !== (d.avatar || '')) {
        setGlobalAvatar(d.avatar ? d.avatar : null)
      }
      // 同步全局额度（关于页/顶栏共用）
      setScore(d.score)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  const loadLogs = useCallback(async (page: number, append: boolean) => {
    setLoadingLogs(true)
    try {
      const res = await backendGet<{ total: number; page: number; rows: ScoreLogRow[] }>(
        `/api/client/v1/profile/scorelogs?page=${page}&limit=10`
      )
      const d = res.data
      if (!d) return
      setLogsTotal(d.total)
      setLogsPage(page)
      setLogs(prev => (append ? [...prev, ...d.rows] : d.rows))
    } catch {
      // 明细加载失败不打断整页，静默
    } finally {
      setLoadingLogs(false)
    }
  }, [])

  useEffect(() => {
    if (authState.token) {
      void reloadProfile()
      void loadLogs(1, false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authState.token])

  async function saveProfile() {
    if (!profile || savingProfile) return
    setSavingProfile(true)
    setProfileError(null)
    setProfileSaved(false)
    try {
      const body: Record<string, string> = {}
      if (nickname !== profile.nickname) body.nickname = nickname
      if (email !== profile.email) body.email = email
      if (Object.keys(body).length > 0) {
        await backendPost('/api/client/v1/profile/update', body)
      }
      if (avatar !== profile.avatar) {
        await backendPost('/api/client/v1/profile/avatar', { avatar })
        setGlobalAvatar(avatar !== '' ? avatar : null)
      }
      setProfileSaved(true)
      setProfile(p => (p ? { ...p, nickname, email, avatar } : p))
      window.setTimeout(() => setProfileSaved(false), 2000)
    } catch (err) {
      setProfileError(err instanceof BackendError ? err.message : '保存失败，请稍后重试')
    } finally {
      setSavingProfile(false)
    }
  }

  async function redeem() {
    if (!code.trim() || redeeming) return
    setRedeeming(true)
    setRechargeMsg(null)
    try {
      const res = await backendPost<{ added_score: number; remaining_score: number }>(
        '/api/client/v1/recharge/redeem',
        { code: code.trim() }
      )
      const d = res.data
      setRechargeOk(true)
      setRechargeMsg(a.recharge.success(d?.added_score ?? 0, d?.remaining_score ?? 0))
      setCode('')
      // 刷新余额与流水
      setScore(d?.remaining_score ?? authState.score)
      setProfile(p => (p ? { ...p, score: d?.remaining_score ?? p.score } : p))
      void loadLogs(1, false)
    } catch (err) {
      setRechargeOk(false)
      setRechargeMsg(err instanceof Error ? err.message : '兑换失败，请稍后重试')
    } finally {
      setRedeeming(false)
    }
  }

  if (!authState.token) {
    return (
      <SettingsContent>
        <div className="mx-auto max-w-2xl pt-10 text-center text-sm text-muted-foreground">
          {a.notLoggedIn}
        </div>
      </SettingsContent>
    )
  }

  if (loadError && !profile) {
    return (
      <SettingsContent>
        <div className="mx-auto max-w-2xl pt-10 text-center">
          <p className="text-sm text-destructive">{a.loadFailed}</p>
          <p className="mt-1 text-xs text-muted-foreground">{loadError}</p>
          <Button className="mt-3" onClick={() => void reloadProfile()} size="sm" variant="textStrong">
            {a.retry}
          </Button>
        </div>
      </SettingsContent>
    )
  }

  const currentEmoji = avatarEmoji(avatar)

  return (
    <SettingsContent>
      <div className="mx-auto w-full max-w-2xl">
        {/* 顶部：头像 + 昵称 + 积分概览 */}
        <div className="flex items-center gap-4 pt-6 pb-2">
          <div className="flex size-16 shrink-0 items-center justify-center rounded-full border border-border bg-muted/40 text-3xl">
            {currentEmoji || <Users className="size-7 text-muted-foreground" />}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg font-semibold tracking-tight text-foreground">
              {nickname || profile?.username || a.heading}
            </h2>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
              <span>{profile?.mobile}</span>
              {profile?.agent_name && <span>{profile.agent_name}</span>}
              <span>
                {a.score.balance}：
                <span className={cn('font-semibold', (profile?.score ?? 0) <= 0 ? 'text-destructive' : 'text-foreground')}>
                  {' '}
                  {profile?.score ?? authState.score}
                </span>
              </span>
              <span>
                {a.score.mode}：
                {profile?.mode === 'formal' ? a.score.modeFormal : a.score.modeTrial}
              </span>
            </div>
          </div>
        </div>

        {/* 头像选择 */}
        <SectionHeading icon={Sparkles} title={a.avatar.title} />
        <div className="mb-4 rounded-xl border border-border/70 bg-muted/20 px-4 py-3">
          <p className="text-xs text-muted-foreground">{a.avatar.desc}</p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {AVATAR_PRESETS.map(e => (
              <button
                className={cn(
                  'flex size-11 items-center justify-center rounded-full border text-2xl transition-colors',
                  currentEmoji === e
                    ? 'border-primary bg-primary/10'
                    : 'border-border bg-background hover:border-primary/50'
                )}
                key={e}
                onClick={() => setAvatar(avatarUrl(e))}
                type="button"
              >
                {e}
              </button>
            ))}
          </div>
        </div>

        {/* 个人信息 */}
        <SectionHeading icon={Users} title={a.profile.title} />
        <div className="mb-4 rounded-xl border border-border/70 bg-muted/20 px-4 py-1">
          <ProfileField label={a.profile.nickname}>
            <input
              className="h-9 w-full rounded-md border border-border bg-transparent px-3 text-sm outline-none focus:border-primary"
              onChange={e => setNickname(e.target.value)}
              placeholder={a.profile.nicknamePlaceholder}
              value={nickname}
            />
          </ProfileField>
          <ProfileField label={a.profile.email}>
            <input
              className="h-9 w-full rounded-md border border-border bg-transparent px-3 text-sm outline-none focus:border-primary"
              onChange={e => setEmail(e.target.value)}
              placeholder={a.profile.emailPlaceholder}
              value={email}
            />
          </ProfileField>
          <ProfileField label={a.profile.mobile}>
            <span className="text-sm text-muted-foreground">{profile?.mobile || '-'}</span>
          </ProfileField>
          <ProfileField label={a.profile.agent}>
            <span className="text-sm text-muted-foreground">{profile?.agent_name || '-'}</span>
          </ProfileField>
          <ProfileField last label={a.profile.joinedAt}>
            <span className="text-sm text-muted-foreground">{profile?.createtime || '-'}</span>
          </ProfileField>
        </div>
        <div className="-mt-2 mb-4 flex items-center gap-3">
          <Button disabled={savingProfile || loading} onClick={() => void saveProfile()} size="sm">
            {savingProfile ? <Loader2 className="size-3 animate-spin" /> : null}
            {savingProfile ? a.profile.saving : a.profile.save}
          </Button>
          {profileSaved && (
            <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="size-3.5" />
              {a.profile.saved}
            </span>
          )}
          {profileError && <span className="text-xs text-destructive">{profileError}</span>}
        </div>

        {/* 积分充值 */}
        <SectionHeading icon={Sparkles} title={a.recharge.title} />
        <div className="mb-4 rounded-xl border border-border/70 bg-muted/20 px-4 py-3">
          <p className="text-xs text-muted-foreground">{a.recharge.desc}</p>
          <div className="mt-2.5 flex gap-2">
            <input
              className="h-9 min-w-0 flex-1 rounded-md border border-border bg-transparent px-3 text-sm outline-none focus:border-primary"
              onChange={e => setCode(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') void redeem()
              }}
              placeholder={a.recharge.placeholder}
              value={code}
            />
            <Button disabled={!code.trim() || redeeming} onClick={() => void redeem()} size="sm" variant="textStrong">
              {redeeming ? <Loader2 className="size-3 animate-spin" /> : null}
              {redeeming ? a.recharge.submitting : a.recharge.submit}
            </Button>
          </div>
          {rechargeMsg && (
            <p className={cn('mt-2 text-xs', rechargeOk ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive')}>
              {rechargeMsg}
            </p>
          )}
        </div>

        {/* 积分明细 */}
        <SectionHeading icon={Sparkles} title={a.scorelogs.title} />
        <div className="mb-4 overflow-hidden rounded-xl border border-border/70">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">{a.scorelogs.cols.time}</th>
                <th className="px-3 py-2 text-left font-medium">{a.scorelogs.cols.memo}</th>
                <th className="px-3 py-2 text-right font-medium">{a.scorelogs.cols.change}</th>
                <th className="px-3 py-2 text-right font-medium">{a.scorelogs.cols.balance}</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 && !loadingLogs ? (
                <tr>
                  <td className="px-3 py-4 text-center text-xs text-muted-foreground" colSpan={4}>
                    {a.scorelogs.empty}
                  </td>
                </tr>
              ) : (
                logs.map(row => (
                  <tr className="border-t border-border/40" key={row.id}>
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">{row.createtime}</td>
                    <td className="max-w-48 truncate px-3 py-2" title={row.memo}>
                      {row.memo || row.model || '-'}
                    </td>
                    <td
                      className={cn(
                        'whitespace-nowrap px-3 py-2 text-right font-medium',
                        row.score > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-foreground'
                      )}
                    >
                      {row.score > 0 ? `+${row.score}` : row.score}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right text-muted-foreground">{row.after_score}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          {logs.length < logsTotal && (
            <div className="border-t border-border/40 py-1.5 text-center">
              <Button
                disabled={loadingLogs}
                onClick={() => void loadLogs(logsPage + 1, true)}
                size="sm"
                variant="ghost"
              >
                {loadingLogs ? <Loader2 className="size-3 animate-spin" /> : null}
                {a.scorelogs.loadMore}
              </Button>
            </div>
          )}
          {logs.length > 0 && logs.length >= logsTotal && (
            <div className="border-t border-border/40 py-1.5 text-center text-xs text-muted-foreground">
              {a.scorelogs.noMore}
            </div>
          )}
        </div>
      </div>
    </SettingsContent>
  )
}

function ProfileField({
  label,
  children,
  last = false
}: {
  label: string
  children: React.ReactNode
  last?: boolean
}) {
  return (
    <div
      className={cn(
        'grid gap-2 py-2.5 sm:grid-cols-[8rem_minmax(0,1fr)] sm:items-center',
        !last && 'border-b border-border/40'
      )}
    >
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  )
}
