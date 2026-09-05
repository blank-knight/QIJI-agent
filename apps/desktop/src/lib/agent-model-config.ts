import { setModelAssignment, setEnvVar } from '@/hermes'
import { backendGet, type LoginResponse } from '@/lib/backend'

/**
 * 奇计代理自定义模型配置（allow_model_config 授权链）
 *
 * 后端下发（login/register/apikey 响应）：
 *   base_url: string  — 代理自定义的 OpenAI 兼容地址（空=系统默认）
 *   models:   string[] — 代理限定的可用模型列表（空数组=不限制）
 *
 * 语义（用户拍板 A 方案）：models 非空 = 限制。写 provider=custom + base_url + 默认模型，
 * 模型下拉从此走 custom 端点；models 为空时不动模型配置（保持系统默认全家桶）。
 */

export interface AgentModelConfig {
  base_url: string
  models: string[]
}

/** 从登录/注册响应提取代理模型配置 */
export function extractAgentModelConfig(data: LoginResponse): AgentModelConfig | null {
  const models = Array.isArray((data as { models?: string[] }).models)
    ? ((data as { models?: string[] }).models as string[]).filter(m => typeof m === 'string' && m.trim() !== '')
    : []
  const baseUrl = typeof data.base_url === 'string' ? data.base_url.trim() : ''
  if (!models.length && !baseUrl) {
    return null
  }
  return { base_url: baseUrl, models }
}

/**
 * 应用代理模型配置到本地运行时。
 * - models 非空：setModelAssignment(custom + base_url + 第一个模型) —— A 方案锁定
 * - models 为空但有 base_url：只写 OPENAI_BASE_URL 环境变量（沿用旧行为）
 * 返回是否写入了模型锁定。
 */
export async function applyAgentModelConfig(
  cfg: AgentModelConfig,
  apiKey?: string
): Promise<boolean> {
  const { base_url, models } = cfg

  if (models.length > 0) {
    const first = models[0]
    await setModelAssignment({
      scope: 'main',
      provider: 'custom',
      model: first,
      ...(base_url ? { base_url } : {}),
      ...(apiKey ? { api_key: apiKey } : {})
    })
    return true
  }

  if (base_url) {
    // 未限定模型：沿用 env 通道（运行时 resolver 会读 OPENAI_BASE_URL）
    try {
      await setEnvVar('OPENAI_BASE_URL', base_url)
    } catch {
      // gateway 未就绪时不阻塞
    }
  }
  return false
}

/** 拉一次 apikey 接口刷新代理配置（登录响应缺字段时兜底） */
export async function fetchAgentModelConfig(): Promise<AgentModelConfig | null> {
  const res = await backendGet<{ base_url?: string; models?: string[] }>('/api/client/v1/apikey')
  const d = res.data
  if (!d) {
    return null
  }
  const models = Array.isArray(d.models) ? d.models.filter(m => typeof m === 'string' && m !== '') : []
  const base_url = typeof d.base_url === 'string' ? d.base_url : ''
  if (!models.length && !base_url) {
    return null
  }
  return { base_url, models }
}
