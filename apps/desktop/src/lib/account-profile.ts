// 奇计账号 ↔ Hermes profile 映射（用户隔离，方案A）。
//
// 每个奇计账号登录后自动映射到一个专属 Hermes profile（独立 state.db：
// 会话/消息/技能/记忆物理隔离）。同一台机器上 user1/user2 换着登录，
// 各自只见自己的数据。
//
// 映射规则：账号名（手机号/用户名）经 sanitize 成 PROFILE_NAME_RE 允许的
// [a-z0-9][a-z0-9_-]{0,63}。中文/特殊字符做无冲突哈希兜底。
// 映射关系持久化在 localStorage（账号名原文↔profile key 双向表），解码
// 时校验，损坏则回退 default（宁可见自己的旧数据，不可进错家）。

import { $auth } from '@/store/auth'

const MAP_STORAGE_KEY = 'qiji.accountProfileMap'
const PREFIX = 'acc'

/** main.cjs PROFILE_NAME_RE 的渲染层镜像（保持同步） */
const PROFILE_NAME_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/

interface AccountProfileEntry {
  /** 奇计账号名原文（手机号/用户名，可能含中文） */
  account: string
  /** 该账号专属 profile key */
  profile: string
}

function sanitizeSegment(input: string): string {
  // 小写化 + 保留 [a-z0-9_-]，其余剔除；保证首字符字母数字
  const cleaned = input
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '')
    .replace(/^[^a-z0-9]+/, '')

  return cleaned
}

/** 稳定短哈希：同一账号名永远得到同一 profile 后缀（FNV-1a 32bit） */
function shortHash(input: string): string {
  let h = 0x811c9dc5

  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }

  return h.toString(36)
}

/** 账号名 → 稳定 profile key（纯函数；不动持久化映射表） */
export function accountToProfileKey(account: string): string {
  const raw = account.trim()

  if (!raw) return 'default'

  const seg = sanitizeSegment(raw)

  if (PROFILE_NAME_RE.test(seg)) {
    // 纯 ASCII 账号名（手机号/英文用户名）：acc + 号段尾 4 位可读性更好，
    // 但需防撞（acc1234 可能同时来自不同账号）——直接用 acc_<seg>。
    const candidate = `${PREFIX}_${seg}`

    if (candidate.length <= 64) return candidate
  }

  // 中文/特殊字符/超长：哈希兜底
  return `${PREFIX}_${shortHash(raw)}`
}

/** 读取账号→profile 映射表（损坏回退空表） */
function readMap(): AccountProfileEntry[] {
  if (typeof window === 'undefined') return []

  try {
    const raw = window.localStorage.getItem(MAP_STORAGE_KEY)
    if (!raw) return []
    const arr = JSON.parse(raw) as AccountProfileEntry[]
    if (!Array.isArray(arr)) return []
    return arr.filter(
      e => e && typeof e.account === 'string' && e.account.length > 0 && typeof e.profile === 'string' && PROFILE_NAME_RE.test(e.profile)
    )
  } catch {
    return []
  }
}

function writeMap(entries: AccountProfileEntry[]) {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(MAP_STORAGE_KEY, JSON.stringify(entries.slice(-64)))
  } catch {
    // localStorage 满/禁用 —— 静默降级
  }
}

/**
 * 登录成功后调用：登记映射并返回该账号的 profile key。
 * 已有映射则原样返回（稳定，不重新哈希）；冲突检测——若映射已被其他
 * 账号占用（哈希碰撞），追加序号消歧。
 *
 * 升级连续性：映射表为空（本机首次启用隔离）且当前桌面存储的 profile
 * 是 default/null 时，首个登录账号"认领" default——升级前的会话数据都在
 * default 里，认领保证老用户登录后看到原有记录而非空列表。之后的新
 * 账号走生成的专属 profile。
 */
export function registerAccountProfile(account: string): string {
  const raw = account.trim()
  if (!raw) return 'default'

  const map = readMap()
  const existing = map.find(e => e.account === raw)
  if (existing) return existing.profile

  if (map.length === 0) {
    // 本机首个登记的账号：认领 default（承接升级前的数据）
    writeMap([{ account: raw, profile: 'default' }])
    return 'default'
  }

  let profile = accountToProfileKey(raw)

  // 碰撞消歧：不同账号哈希到同一 key（极小概率）时追加 -2/-3…
  const taken = new Set(map.map(e => e.profile))
  let n = 2
  while (taken.has(profile)) {
    const suffix = `-${n}`
    profile = `${accountToProfileKey(raw).slice(0, 64 - suffix.length)}${suffix}`
    n += 1
  }

  writeMap([...map, { account: raw, profile }])
  return profile
}

/** 查询某账号的 profile key（未登记返回 null） */
export function lookupAccountProfile(account: string): string | null {
  const existing = readMap().find(e => e.account === account.trim())

  return existing ? existing.profile : null
}

/**
 * 账号隔离模式：当前登录账号已登记映射时返回其专属 profile key，否则
 * null（未启用隔离，UI 按原样显示多 profile 切换器）。
 * 未登录/映射表损坏均视为未启用——宁可不锁，不可错锁。
 */
export function accountLockedProfile(): string | null {
  try {
    const username = $auth.get()?.username
    if (!username) return null
    return lookupAccountProfile(username)
  } catch {
    return null
  }
}

/** 供单测直接重置 */
export function _resetAccountProfileMapForTest() {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.removeItem(MAP_STORAGE_KEY)
  } catch {
    // ignore
  }
}
