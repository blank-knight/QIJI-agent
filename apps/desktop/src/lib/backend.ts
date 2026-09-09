import { clearAuth } from '@/store/auth'

// 后端基地址。可用 VITE_BACKEND_BASE_URL 覆盖。
// 注: 必须 https——服务端 80 口 308 跳转虽保留 POST 方法,直连 https 可省一次往返
export const BACKEND_BASE_URL =
  (import.meta.env.VITE_BACKEND_BASE_URL as string | undefined) ?? 'https://agent.aijiqiren.vip'

// 登录 token 有效期（后端规定 30 天）
export const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000

export interface BackendResponse<T = unknown> {
  code: 0 | 1
  data?: T
  msg?: string
}

export interface LoginResponse {
  token: string
  user_id: string | number
  username: string
  api_key: string
  is_custom_key: 0 | 1
  /** 平台是否允许平台用户自选模型（site 配置，代理 models 非空时强制允许+限定清单） */
  allow_model_select?: 0 | 1
  score: number
  mode: 'trial' | 'formal'
  quota?: Record<string, unknown>
  /** 代理自定义 API 地址（allow_model_config 授权链下发，空=系统默认） */
  base_url?: string
  /** 代理限定的可用模型（A 方案：非空=只能用这些，第一个为默认） */
  models?: string[]
}

export interface QuotaResponse {
  score: number
  mode?: 'trial' | 'formal'
}

export interface QuotaReportResponse {
  remaining_score: number
}

export interface ApiKeyResponse {
  api_key: string
  is_custom_key: 0 | 1
  /** 平台是否允许平台用户自选模型（site 配置，代理 models 非空时强制允许+限定清单） */
  allow_model_select?: 0 | 1
  /** 代理链限定的模型清单（空=不限定） */
  models?: string[]
  key_source?: string
  can_customize?: boolean
}

export interface UpdateCheckResponse {
  has_update: boolean
  enforce: boolean | 0 | 1
  newversion: string
  downloadurl: string
  packagesize?: string
  upgradetext?: string
}

/** GET /api/client/v1/update/check — 版本检查（无需登录） */
export async function checkUpdate(version: string): Promise<UpdateCheckResponse> {
  const url = `${BACKEND_BASE_URL}/api/client/v1/update/check?version=${encodeURIComponent(version)}`

  const res = await fetch(url)

  if (!res.ok) {
    throw new BackendError(`版本检查失败 (${res.status})`, res.status)
  }

  const body = (await res.json()) as BackendResponse<UpdateCheckResponse>

  if (body.code === 0) {
    throw new BackendError(body.msg ?? '版本检查失败', res.status, body)
  }

  if (!body.data) {
    throw new BackendError('版本检查响应缺少 data', res.status, body)
  }

  return body.data
}

let unauthorizedHandler: (() => void) | null = null

/**
 * 注册 401 处理器（由 desktop-controller 设置，负责弹登录覆盖层）。
 * 拆出来是为了避免 backend.ts ↔ store/auth.ts 循环依赖。
 */
export function setUnauthorizedHandler(handler: (() => void) | null) {
  unauthorizedHandler = handler
}

/**
 * 统一的后端请求包装。自动带 Authorization header，401 时清 auth store 并触发登录页。
 * 返回后端响应体 {code, data, msg}；code=0 时抛错（由调用方决定怎么提示）。
 */
export async function backendFetch<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<BackendResponse<T>> {
  const token = getToken()

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) ?? {})
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  const url = `${BACKEND_BASE_URL}${path}`

  const res = await fetch(url, { ...options, headers })

  if (res.status === 401) {
    // token 失效：清状态，弹登录页
    clearAuth()
    unauthorizedHandler?.()
    throw new BackendError('登录已过期，请重新登录', 401)
  }

  if (!res.ok) {
    throw new BackendError(`后端请求失败 (${res.status})`, res.status)
  }

  const body = (await res.json()) as BackendResponse<T>

  if (body.code === 0) {
    throw new BackendError(body.msg ?? '请求失败', res.status, body)
  }

  return body
}

/** 后端业务错误（code=0 或 HTTP 非 2xx） */
export class BackendError extends Error {
  readonly statusCode: number
  readonly body: BackendResponse | undefined

  constructor(message: string, statusCode: number, body?: BackendResponse) {
    super(message)
    this.name = 'BackendError'
    this.statusCode = statusCode
    this.body = body
  }
}

// —— 便捷方法 ——

export function backendPost<T = unknown>(path: string, body?: unknown): Promise<BackendResponse<T>> {
  return backendFetch<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined })
}

export function backendGet<T = unknown>(path: string): Promise<BackendResponse<T>> {
  return backendFetch<T>(path, { method: 'GET' })
}

// token 读取拆成函数，避免顶层 import store/auth 造成循环依赖
function getToken(): string | null {
  try {
    const raw = window.localStorage.getItem(AUTH_TOKEN_KEY)

    return raw ?? null
  } catch {
    return null
  }
}

// localStorage key —— 必须跟 store/auth.ts 用的 key 一致
export const AUTH_TOKEN_KEY = 'qiji-auth-token'
export const AUTH_LOGIN_AT_KEY = 'qiji-auth-login-at'
export const AUTH_IS_CUSTOM_KEY = 'qiji-auth-is-custom-key'
export const AUTH_MODE_KEY = 'qiji-auth-mode'
export const AUTH_USERNAME_KEY = 'qiji-auth-username'
/** 用户隔离（方案A）：api_key 持久化，reload/切 profile 后兜底推送用 */
export const AUTH_API_KEY_STORE_KEY = 'qiji-auth-api-key'
export const AUTH_AVATAR_KEY = 'qiji-auth-avatar'
