import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  applyAgentModelConfig,
  extractAgentModelConfig,
  type AgentModelConfig
} from './agent-model-config'

const setModelAssignment = vi.fn()
const setEnvVar = vi.fn()

vi.mock('@/hermes', () => ({
  setModelAssignment: (...args: unknown[]) => setModelAssignment(...args),
  setEnvVar: (...args: unknown[]) => setEnvVar(...args)
}))

vi.mock('@/lib/backend', () => ({
  backendGet: vi.fn()
}))

describe('extractAgentModelConfig', () => {
  it('models 非空 → 提取配置', () => {
    const cfg = extractAgentModelConfig({
      token: 't', user_id: 1, username: 'u', api_key: 'k',
      is_custom_key: 0, score: 0, mode: 'trial',
      base_url: 'https://x.example.com/v1',
      models: ['gpt-4o', 'gpt-4o-mini']
    } as Parameters<typeof extractAgentModelConfig>[0])
    expect(cfg).toEqual({ base_url: 'https://x.example.com/v1', models: ['gpt-4o', 'gpt-4o-mini'] })
  })

  it('models 空 + base_url 空 → null（不动模型配置）', () => {
    const cfg = extractAgentModelConfig({
      token: 't', user_id: 1, username: 'u', api_key: 'k',
      is_custom_key: 0, score: 0, mode: 'trial'
    } as Parameters<typeof extractAgentModelConfig>[0])
    expect(cfg).toBeNull()
  })

  it('models 含空串/非字符串 → 过滤', () => {
    const cfg = extractAgentModelConfig({
      token: 't', user_id: 1, username: 'u', api_key: 'k',
      is_custom_key: 0, score: 0, mode: 'trial',
      base_url: 'https://x/v1',
      models: ['gpt-4o', '', '  ', 'claude-3']
    } as unknown as Parameters<typeof extractAgentModelConfig>[0])
    expect(cfg?.models).toEqual(['gpt-4o', 'claude-3'])
  })
})

describe('applyAgentModelConfig（A 方案：models 非空=锁定）', () => {
  beforeEach(() => {
    setModelAssignment.mockReset()
    setEnvVar.mockReset()
  })
  afterEach(() => vi.restoreAllMocks())

  it('models 非空 → setModelAssignment(custom, 首模型, base_url, api_key)，返回 true', async () => {
    const cfg: AgentModelConfig = { base_url: 'https://x/v1', models: ['gpt-4o', 'gpt-4o-mini'] }
    const locked = await applyAgentModelConfig(cfg, 'sk-1')
    expect(locked).toBe(true)
    expect(setModelAssignment).toHaveBeenCalledWith({
      scope: 'main', provider: 'custom', model: 'gpt-4o',
      base_url: 'https://x/v1', api_key: 'sk-1'
    })
    expect(setEnvVar).not.toHaveBeenCalled()
  })

  it('models 空 + base_url 非空 → 只写 OPENAI_BASE_URL，返回 false', async () => {
    const cfg: AgentModelConfig = { base_url: 'https://x/v1', models: [] }
    const locked = await applyAgentModelConfig(cfg)
    expect(locked).toBe(false)
    expect(setModelAssignment).not.toHaveBeenCalled()
    expect(setEnvVar).toHaveBeenCalledWith('OPENAI_BASE_URL', 'https://x/v1')
  })

  it('models 非空但无 base_url → 仍锁定 custom（不带 base_url 键）', async () => {
    const cfg: AgentModelConfig = { base_url: '', models: ['m1'] }
    await applyAgentModelConfig(cfg)
    expect(setModelAssignment).toHaveBeenCalledWith({
      scope: 'main', provider: 'custom', model: 'm1'
    })
  })
})
