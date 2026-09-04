import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { $auth } from '@/store/auth'

// —— fetch mock：断言组件打到真实后端路径 ——

const profileFixture = {
  id: 7,
  username: '13900001111',
  nickname: '小海豚',
  avatar: '',
  mobile: '139****1111',
  email: '',
  score: 42,
  mode: 'formal',
  agent_name: '测试贴牌',
  createtime: '2026-08-01'
}

const logsFixture = {
  total: 2,
  page: 1,
  rows: [
    { id: 2, score: 50, before_score: 10, after_score: 60, memo: '充值码兑换', model: '', createtime: '2026-09-03 09:00' },
    { id: 1, score: -1, before_score: 11, after_score: 10, memo: 'Token消耗：gpt-4o', model: 'gpt-4o', createtime: '2026-09-02 18:00' }
  ]
}

const calls: Array<{ url: string; init?: RequestInit }> = []

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body
  } as unknown as Response
}

// —— 测试本体 ——

import { AccountSettings } from './account-settings'

describe('AccountSettings（个人中心）', () => {
  beforeEach(() => {
    window.localStorage.clear()
    calls.length = 0
    window.localStorage.setItem('qiji-auth-token', 'test-token-123')
    window.localStorage.setItem('qiji-auth-username', '13900001111')
    // store 在模块求值期已初始化，测试内直接 set（组件只依赖 $auth.token）
    $auth.set({
      token: 'test-token-123',
      username: '13900001111',
      isCustomKey: false,
      mode: 'formal',
      score: 42,
      loginAt: Date.now(),
      apiKey: null,
      avatar: null
    })
    globalThis.fetch = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const u = String(url)
      calls.push({ url: u, init })
      if (u.endsWith('/api/client/v1/profile')) {
        return jsonResponse({ code: 1, msg: '', data: profileFixture })
      }
      if (u.includes('/api/client/v1/profile/scorelogs')) {
        return jsonResponse({ code: 1, msg: '', data: logsFixture })
      }
      return jsonResponse({ code: 1, msg: '', data: null })
    }) as unknown as typeof fetch
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    // 还原登录态，避免污染其它测试
    $auth.set({
      token: 'test-token-123',
      username: '13900001111',
      isCustomKey: false,
      mode: 'formal',
      score: 42,
      loginAt: Date.now(),
      apiKey: null,
      avatar: null
    })
  })

  it('登录态下加载资料并渲染概览/表单/充值/流水', async () => {
    render(<AccountSettings />)

    // 概览：昵称 + 积分 + 模式
    await waitFor(() => {
      expect(screen.getByText('小海豚')).toBeTruthy()
    })
    expect(screen.getByText(/42/)).toBeTruthy()
    expect(screen.getByText(/正式/)).toBeTruthy()

    // 请求路径断言：profile + scorelogs 都打到真实端点
    expect(calls.some(c => c.url.endsWith('/api/client/v1/profile'))).toBe(true)
    expect(calls.some(c => c.url.includes('/api/client/v1/profile/scorelogs'))).toBe(true)

    // 流水渲染：兑换行 + 消耗行
    expect(screen.getByText('充值码兑换')).toBeTruthy()
    expect(screen.getByText('Token消耗：gpt-4o')).toBeTruthy()
    expect(screen.getByText('+50')).toBeTruthy()
    expect(screen.getByText('-1')).toBeTruthy()
  })

  it('未登录（无 token）时显示提示、不发请求', async () => {
    window.localStorage.clear()
    $auth.set({
      token: null,
      username: null,
      isCustomKey: false,
      mode: 'trial',
      score: 0,
      loginAt: null,
      apiKey: null,
      avatar: null
    })
    render(<AccountSettings />)
    await waitFor(() => {
      expect(screen.getByText('未登录，请先登录奇计账号')).toBeTruthy()
    })
    expect(calls.length).toBe(0)
  })

  it('选头像 → 保存：avatar 请求打到 profile/avatar 且带 avatar://emoji 值', async () => {
    render(<AccountSettings />)
    await waitFor(() => {
      expect(screen.getByText('小海豚')).toBeTruthy()
    })

    // 点第一个预设头像 🐬
    const avatarBtn = screen.getByRole('button', { name: '🐬' })
    fireEvent.click(avatarBtn)

    // 保存（avatar 与 profile 都会带，因 nickname/email 未变只有 avatar 变更）
    fireEvent.click(screen.getByText('保存修改'))

    await waitFor(() => {
      const avatarCall = calls.find(c => c.url.endsWith('/api/client/v1/profile/avatar'))
      expect(avatarCall).toBeTruthy()
      const body = JSON.parse(String(avatarCall?.init?.body)) as { avatar: string }
      expect(body.avatar).toBe('avatar://emoji/%F0%9F%90%AC')
    })
  })

  it('充值兑换：输入码 → 兑换成功文案 + 余额刷新 + 流水重载', async () => {
    let redeemed = false
    globalThis.fetch = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const u = String(url)
      calls.push({ url: u, init })
      if (u.endsWith('/api/client/v1/recharge/redeem')) {
        redeemed = true
        return jsonResponse({ code: 1, msg: '充值成功', data: { added_score: 50, remaining_score: 92 } })
      }
      if (u.endsWith('/api/client/v1/profile')) {
        return jsonResponse({ code: 1, msg: '', data: { ...profileFixture, score: redeemed ? 92 : 42 } })
      }
      if (u.includes('/api/client/v1/profile/scorelogs')) {
        return jsonResponse({ code: 1, msg: '', data: logsFixture })
      }
      return jsonResponse({ code: 1, msg: '', data: null })
    }) as unknown as typeof fetch

    render(<AccountSettings />)
    await waitFor(() => {
      expect(screen.getByText('小海豚')).toBeTruthy()
    })

    const input = screen.getByPlaceholderText('请输入充值码')
    fireEvent.change(input, { target: { value: 'QJTESTCODE99' } })
    fireEvent.click(screen.getByText('兑换'))

    await waitFor(() => {
      expect(screen.getByText('充值成功：+50 积分，当前余额 92')).toBeTruthy()
    })
    // 兑换请求体
    const redeemCall = calls.find(c => c.url.endsWith('/api/client/v1/recharge/redeem'))
    expect(redeemCall).toBeTruthy()
    const body = JSON.parse(String(redeemCall?.init?.body)) as { code: string }
    expect(body.code).toBe('QJTESTCODE99')
  })

  it('兑换失败：后端 code=0 时显示错误文案（如已被使用）', async () => {
    globalThis.fetch = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const u = String(url)
      calls.push({ url: u, init })
      if (u.endsWith('/api/client/v1/recharge/redeem')) {
        // TP5 error() 形态：HTTP 200 + code=0
        return jsonResponse({ code: 0, msg: '充值码已被使用', data: null })
      }
      if (u.endsWith('/api/client/v1/profile')) {
        return jsonResponse({ code: 1, msg: '', data: profileFixture })
      }
      if (u.includes('/api/client/v1/profile/scorelogs')) {
        return jsonResponse({ code: 1, msg: '', data: logsFixture })
      }
      return jsonResponse({ code: 1, msg: '', data: null })
    }) as unknown as typeof fetch

    render(<AccountSettings />)
    await waitFor(() => {
      expect(screen.getByText('小海豚')).toBeTruthy()
    })

    fireEvent.change(screen.getByPlaceholderText('请输入充值码'), { target: { value: 'USED' } })
    fireEvent.click(screen.getByText('兑换'))

    await waitFor(() => {
      expect(screen.getByText('充值码已被使用')).toBeTruthy()
    })
  })
})
