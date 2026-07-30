import { atom } from 'nanostores'

import {
  AUTH_IS_CUSTOM_KEY,
  AUTH_LOGIN_AT_KEY,
  AUTH_MODE_KEY,
  AUTH_TOKEN_KEY,
  AUTH_USERNAME_KEY,
  backendPost,
  type LoginResponse,
  TOKEN_TTL_MS
} from '@/lib/backend'

export interface AuthState {
  token: string | null
  username: string | null
  isCustomKey: boolean
  mode: 'trial' | 'formal'
  /** 内存中的额度，每次查 quota 或上报后刷新；不持久化 */
  score: number
  /** 登录时间戳（ms），用于判断 30 天过期 */
  loginAt: number | null
  /** 后端下发的 api_key（is_custom_key=0 时服务端代理用） */
  apiKey: string | null
}

function readPersisted(): AuthState {
  if (typeof window === 'undefined') {
    return { token: null, username: null, isCustomKey: false, mode: 'trial', score: 0, loginAt: null, apiKey: null }
  }

  try {
    return {
      token: window.localStorage.getItem(AUTH_TOKEN_KEY),
      username: window.localStorage.getItem(AUTH_USERNAME_KEY),
      isCustomKey: window.localStorage.getItem(AUTH_IS_CUSTOM_KEY) === '1',
      mode: (window.localStorage.getItem(AUTH_MODE_KEY) as 'trial' | 'formal') ?? 'trial',
      score: 0, // 不持久化，每次启动后由 quota 查询刷新
      loginAt: Number(window.localStorage.getItem(AUTH_LOGIN_AT_KEY)) || null,
      apiKey: null // 不持久化，每次 login 后从后端拿
    }
  } catch {
    return { token: null, username: null, isCustomKey: false, mode: 'trial', score: 0, loginAt: null, apiKey: null }
  }
}

function persist(state: AuthState) {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(AUTH_TOKEN_KEY, state.token ?? '')
    window.localStorage.setItem(AUTH_LOGIN_AT_KEY, String(state.loginAt ?? Date.now()))
    window.localStorage.setItem(AUTH_IS_CUSTOM_KEY, state.isCustomKey ? '1' : '0')
    window.localStorage.setItem(AUTH_MODE_KEY, state.mode)
    window.localStorage.setItem(AUTH_USERNAME_KEY, state.username ?? '')
  } catch {
    // best-effort
  }
}

const INITIAL: AuthState = readPersisted()

export const $auth = atom<AuthState>(INITIAL)

const patch = (update: Partial<AuthState>) => {
  $auth.set({ ...$auth.get(), ...update })
}

/** 是否已登录（有 token 且未过期） */
export function isAuthenticated(): boolean {
  const s = $auth.get()

  return Boolean(s.token) && !isTokenExpired()
}

/** token 是否过期（超过 30 天） */
export function isTokenExpired(): boolean {
  const { loginAt } = $auth.get()

  if (!loginAt) return true

  return Date.now() - loginAt > TOKEN_TTL_MS
}

/**
 * 登录。成功后持久化 token + 用户信息，返回 api_key（供调用方推进 gateway）。
 * 失败抛 BackendError。
 */
export async function login(username: string, password: string): Promise<LoginResponse> {
  const res = await backendPost<LoginResponse>('/api/client/v1/auth/login', {
    username,
    password
  })

  if (!res.data) {
    throw new Error('登录响应缺少 data')
  }

  const data = res.data

  // 边界：代理链全无 key —— 登录成功但 api_key 为空
  if (!data.api_key) {
    throw new Error('当前账号未配置 AI 服务，请联系代理/上级开通')
  }

  const next: AuthState = {
    token: data.token,
    username: data.username,
    isCustomKey: data.is_custom_key === 1,
    mode: data.mode,
    score: data.score,
    loginAt: Date.now(),
    apiKey: data.api_key
  }

  persist(next)
  patch(next)

  return data
}

/** 登出 / 清空 auth 状态（401 时也调这个） */
export function clearAuth() {
  patch({ token: null, username: null, isCustomKey: false, mode: 'trial', score: 0, loginAt: null, apiKey: null })

  if (typeof window !== 'undefined') {
    try {
      window.localStorage.removeItem(AUTH_TOKEN_KEY)
      window.localStorage.removeItem(AUTH_LOGIN_AT_KEY)
      window.localStorage.removeItem(AUTH_IS_CUSTOM_KEY)
      window.localStorage.removeItem(AUTH_MODE_KEY)
      window.localStorage.removeItem(AUTH_USERNAME_KEY)
    } catch {
      // best-effort
    }
  }
}

/** 从后端刷新额度（GET /quota 或上报后更新） */
export function setScore(score: number) {
  patch({ score })
}

/** 从后端刷新 is_custom_key（GET /apikey 可能返回更细的权限） */
export function setIsCustomKey(isCustomKey: boolean) {
  patch({ isCustomKey })
  // 同步 localStorage
  try {
    window.localStorage.setItem(AUTH_IS_CUSTOM_KEY, isCustomKey ? '1' : '0')
  } catch {
    // best-effort
  }
}

/**
 * 开发模式跳过登录：直接往内存 atom + localStorage 写模拟登录态。
 * 后端未就绪时用来看主界面 UI，不依赖 reload。
 */
export function devSkipLogin() {
  const devState: AuthState = {
    token: 'dev-skip-token',
    username: 'dev',
    isCustomKey: false,
    mode: 'trial',
    score: 100,
    loginAt: Date.now(),
    apiKey: null
  }

  persist(devState)
  $auth.set(devState)
}
