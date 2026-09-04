import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  _resetAccountProfileMapForTest,
  accountLockedProfile,
  accountToProfileKey,
  lookupAccountProfile,
  registerAccountProfile
} from '@/lib/account-profile'
import { $auth } from '@/store/auth'

describe('account-profile（账号↔profile 映射，用户隔离方案A）', () => {
  beforeEach(() => {
    _resetAccountProfileMapForTest()
  })

  afterEach(() => {
    _resetAccountProfileMapForTest()
    $auth.set({ token: null, username: null, isCustomKey: false, mode: 'trial', score: 0, loginAt: null, apiKey: null, avatar: null })
  })

  it('纯 ASCII 账号名映射为 acc_<sanitized>', () => {
    expect(accountToProfileKey('13800138000')).toBe('acc_13800138000')
    expect(accountToProfileKey('Alice')).toBe('acc_alice')
    expect(accountToProfileKey('  bob-42 ')).toBe('acc_bob-42')
  })

  it('空账号回退 default', () => {
    expect(accountToProfileKey('')).toBe('default')
    expect(accountToProfileKey('   ')).toBe('default')
  })

  it('中文名走哈希兜底且稳定', () => {
    const a = accountToProfileKey('张三')
    const b = accountToProfileKey('张三')
    const c = accountToProfileKey('李四')

    expect(a).toMatch(/^acc_[a-z0-9_-]+$/)
    expect(a).toBe(b) // 稳定
    expect(a).not.toBe(c) // 不同人不同 key
  })

  it('register：映射表为空时首个账号认领 default（升级连续性）', () => {
    const p = registerAccountProfile('13800138000')

    expect(p).toBe('default')
    expect(lookupAccountProfile('13800138000')).toBe('default')
  })

  it('register：后续账号获得专属 profile，与 default 不同', () => {
    registerAccountProfile('13800138000') // 认领 default
    const second = registerAccountProfile('user2')

    expect(second).not.toBe('default')
    expect(second).toBe('acc_user2')
    expect(lookupAccountProfile('user2')).toBe('acc_user2')
  })

  it('register：重复登记返回同一 key（稳定）', () => {
    const first = registerAccountProfile('13800138000')
    const again = registerAccountProfile('13800138000')

    expect(again).toBe(first)
  })

  it('register：损坏的 localStorage 容忍（解析失败回退空表）', () => {
    window.localStorage.setItem('qiji.accountProfileMap', '{not json')

    const p = registerAccountProfile('13800138000')

    expect(p).toBe('default') // 坏表当空表：重新认领
  })

  it('accountLockedProfile：未登录返回 null（不锁）', () => {
    expect(accountLockedProfile()).toBeNull()
  })

  it('accountLockedProfile：登录账号已登记返回其 profile key', () => {
    registerAccountProfile('13800138000')
    $auth.set({ token: 't', username: '13800138000', isCustomKey: false, mode: 'trial', score: 0, loginAt: Date.now(), apiKey: null, avatar: null })

    expect(accountLockedProfile()).toBe('default')
  })

  it('accountLockedProfile：登录账号未登记返回 null（老 token 未走新登录流）', () => {
    $auth.set({ token: 't', username: 'ghost', isCustomKey: false, mode: 'trial', score: 0, loginAt: Date.now(), apiKey: null, avatar: null })

    expect(accountLockedProfile()).toBeNull()
  })
})
