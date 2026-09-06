import { useStore } from '@nanostores/react'
import { useCallback, useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { useI18n } from '@/i18n'
import { CheckCircle2, Download, Loader2, Sparkles, Users } from '@/lib/icons'
import { BackendError, BACKEND_BASE_URL, backendGet, backendPost } from '@/lib/backend'
import { cn } from '@/lib/utils'
import { $auth, setAvatar as setGlobalAvatar, setScore } from '@/store/auth'

interface MarketSkill {
  id: number
  name: string
  title: string
  description: string
  category: string
  version: string
  filesize: number
  download_count: number
  updatetime_text: string
}

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
  // 套餐购买
  type Plan = { id: number; name: string; score: number; price: number; remark: string }
  const [plans, setPlans] = useState<Plan[]>([])
  const [payEnabled, setPayEnabled] = useState(false)
  const [buyingId, setBuyingId] = useState<number | null>(null)
  const [planMsg, setPlanMsg] = useState<string | null>(null)
  const [planMsgOk, setPlanMsgOk] = useState(false)
  const [redeeming, setRedeeming] = useState(false)
  const [skills, setSkills] = useState<MarketSkill[]>([])
  const [loadingSkills, setLoadingSkills] = useState(true)
  const [installingSkill, setInstallingSkill] = useState<string | null>(null)
  const [installedSkills, setInstalledSkills] = useState<Set<string>>(new Set())
  const [skillMsg, setSkillMsg] = useState('')
  const [skillMsgOk, setSkillMsgOk] = useState(true)
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

  // 技能市场：加载列表（installed 标记：本地 skills/market/{name} 目录存在即算已装）
  const loadSkills = useCallback(async () => {
    setLoadingSkills(true)
    try {
      const res = await backendGet<{ total: number; rows: MarketSkill[] }>('/api/client/v1/skill/list')
      const rows = res.data?.rows ?? []
      const installed: string[] = []
      try {
        const r = await window.hermesDesktop.listDir('skills/market')
        for (const item of r) {
          if (item.isDirectory) installed.push(item.name)
        }
      } catch { /* 目录不存在=没装过 */ }
      setSkills(rows)
      setInstalledSkills(new Set(installed))
    } catch {
      setSkills([])
    } finally {
      setLoadingSkills(false)
    }
  }, [])

  async function installSkill(sk: MarketSkill) {
    if (installingSkill) return
    setInstallingSkill(sk.name)
    setSkillMsg('')
    try {
      // 下载地址 = 服务端 download 接口（302 到 zip 直链）；token 由 main 进程下载时带 header
      const url = `${BACKEND_BASE_URL}/api/client/v1/skill/download?id=${sk.id}`
      await window.hermesDesktop.skillMarket.install(url, sk.name, authState.token || '')
      setInstalledSkills(prev => new Set(prev).add(sk.name))
      setSkillMsgOk(true)
      setSkillMsg(t.settings.account.skillmarket.installOk)
    } catch (err) {
      setSkillMsgOk(false)
      setSkillMsg(`${t.settings.account.skillmarket.installFail}: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setInstallingSkill(null)
    }
  }

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

  const loadPlans = useCallback(async () => {
    try {
      const res = await backendGet<{ plans: Plan[]; pay_enabled: number }>('/api/client/v1/plan/index')
      setPlans(res.data?.plans ?? [])
      setPayEnabled(!!res.data?.pay_enabled)
    } catch {
      // 静默
    }
  }, [])

  useEffect(() => {
    if (authState.token) {
      void loadSkills()
      void reloadProfile()
      void loadLogs(1, false)
      void loadPlans()
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

  async function buyPlan(plan: Plan) {
    if (buyingId !== null) return
    setBuyingId(plan.id)
    setPlanMsg(null)
    try {
      const res = await backendPost<{ order_no: string; pay_url: string }>('/api/client/v1/plan/order', {
        plan_id: plan.id,
        pay_type: 'alipay',
      })
      const payUrl = res.data?.pay_url
      if (payUrl && window.hermesDesktop?.openExternal) {
        await window.hermesDesktop.openExternal(payUrl)
        setPlanMsgOk(true)
        setPlanMsg(a.plans.payOpened)
        // 轮询支付结果（最多 5 分钟，每 5 秒）
        const orderNo = res.data?.order_no ?? ''
        let paid = false
        for (let i = 0; i < 60 && !paid; i++) {
          await new Promise(r => setTimeout(r, 5000))
          try {
            const st = await backendGet<{ status: string; score: number }>(
              `/api/client/v1/plan/status?order_no=${encodeURIComponent(orderNo)}`
            )
            if (st.data?.status === 'paid') {
              paid = true
              setPlanMsg(a.plans.paid)
              // 刷新余额与流水
              void reloadProfile()
              void loadLogs(1, false)
            }
          } catch {
            // 继续
          }
        }
      } else {
        setPlanMsgOk(false)
        setPlanMsg(a.plans.contactAgent)
      }
    } catch (err) {
      setPlanMsgOk(false)
      setPlanMsg(err instanceof Error ? err.message : '下单失败，请稍后重试')
    } finally {
      setBuyingId(null)
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

        {/* 套餐购买 */}
        <SectionHeading icon={Sparkles} title={a.plans.title} />
        {plans.length === 0 ? (
          <p className="mb-4 text-xs text-muted-foreground">{a.plans.empty}</p>
        ) : (
          <div className="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {plans.map(p => (
              <div
                className="flex flex-col justify-between rounded-xl border border-border/70 bg-muted/20 px-3.5 py-3"
                key={p.id}
              >
                <div>
                  <p className="text-sm font-medium">{p.name}</p>
                  <p className="mt-0.5 text-xl font-semibold">
                    {p.price > 0 ? `¥${p.price.toFixed(2)}` : '免费'}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {p.score.toLocaleString()} {a.plans.unit}
                  </p>
                  {p.remark ? <p className="mt-1 text-xs text-muted-foreground/80">{p.remark}</p> : null}
                </div>
                <Button
                  className="mt-2.5"
                  disabled={!payEnabled || buyingId !== null}
                  onClick={() => void buyPlan(p)}
                  size="sm"
                  variant="textStrong"
                >
                  {buyingId === p.id ? <Loader2 className="size-3 animate-spin" /> : null}
                  {buyingId === p.id ? a.plans.buying : a.plans.buy}
                </Button>
              </div>
            ))}
          </div>
        )}
        {!payEnabled && plans.length > 0 ? (
          <p className="mb-4 text-xs text-muted-foreground">{a.plans.payDisabled}</p>
        ) : null}
        {planMsg ? (
          <p className={cn('mb-4 text-xs', planMsgOk ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive')}>
            {planMsg}
          </p>
        ) : null}

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

        {/* 技能市场 */}
        <SectionHeading icon={Download} title={a.skillmarket.title} />
        <p className="mb-3 text-xs text-muted-foreground">{a.skillmarket.desc}</p>
        {skillMsg ? (
          <p className={cn('mb-3 text-xs', skillMsgOk ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive')}>
            {skillMsg}
          </p>
        ) : null}
        {loadingSkills ? (
          <p className="mb-4 text-xs text-muted-foreground">
            <Loader2 className="mr-1 inline size-3 animate-spin" />
          </p>
        ) : skills.length === 0 ? (
          <p className="mb-4 text-xs text-muted-foreground">{a.skillmarket.empty}</p>
        ) : (
          <div className="mb-4 grid grid-cols-2 gap-2.5">
            {skills.map(sk => {
              const installed = installedSkills.has(sk.name)
              return (
                <div
                  className="flex flex-col justify-between rounded-xl border border-border/70 bg-muted/20 px-3.5 py-3"
                  key={sk.id}
                >
                  <div>
                    <p className="text-sm font-medium">{sk.title}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      v{sk.version} · {sk.download_count} {a.skillmarket.downloads}
                    </p>
                    {sk.description ? (
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground/80">{sk.description}</p>
                    ) : null}
                  </div>
                  <Button
                    className="mt-2.5"
                    disabled={installed || installingSkill !== null}
                    onClick={() => void installSkill(sk)}
                    size="sm"
                    variant={installed ? 'outline' : 'textStrong'}
                  >
                    {installingSkill === sk.name ? <Loader2 className="size-3 animate-spin" /> : null}
                    {installed
                      ? a.skillmarket.installed
                      : installingSkill === sk.name
                        ? a.skillmarket.installing
                        : a.skillmarket.install}
                  </Button>
                </div>
              )
            })}
          </div>
        )}

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
