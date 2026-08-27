import { beforeEach, describe, expect, it } from 'vitest'

import {
  _resetSavedAccountsForTest,
  loadSavedAccounts,
  removeSavedAccount,
  saveAccount,
} from './saved-accounts'

describe('saved-accounts', () => {
  beforeEach(() => {
    _resetSavedAccountsForTest()
  })

  it('空列表初始为空', () => {
    expect(loadSavedAccounts()).toEqual([])
  })

  it('登录成功置顶保存；不勾记住密码则不存密码', () => {
    saveAccount('alice', 'pw1', false)
    const list = loadSavedAccounts()
    expect(list).toHaveLength(1)
    expect(list[0].username).toBe('alice')
    expect(list[0].password).toBeUndefined()
  })

  it('勾记住密码则密码 btoa 混淆存储', () => {
    saveAccount('alice', 'pw1', true)
    const list = loadSavedAccounts()
    expect(list[0].password).toBe(btoa('pw1'))
    expect(atob(list[0].password!)).toBe('pw1')
  })

  it('重复登录同账号置顶且不重复', () => {
    saveAccount('a', undefined, false)
    saveAccount('b', undefined, false)
    saveAccount('a', undefined, false)
    const list = loadSavedAccounts()
    expect(list.map(x => x.username)).toEqual(['a', 'b'])
  })

  it('最多保留 5 个账号（FIFO 淘汰最旧）', () => {
    for (const u of ['u1', 'u2', 'u3', 'u4', 'u5', 'u6']) {
      saveAccount(u, undefined, false)
    }
    const list = loadSavedAccounts()
    expect(list).toHaveLength(5)
    expect(list[0].username).toBe('u6')
    expect(list.map(x => x.username)).not.toContain('u1')
  })

  it('取消记住密码时抹掉已存密码', () => {
    saveAccount('alice', 'pw1', true)
    expect(loadSavedAccounts()[0].password).toBeDefined()
    saveAccount('alice', 'pw1', false)
    expect(loadSavedAccounts()[0].password).toBeUndefined()
  })

  it('removeSavedAccount 删除指定账号', () => {
    saveAccount('a', undefined, false)
    saveAccount('b', undefined, false)
    removeSavedAccount('a')
    expect(loadSavedAccounts().map(x => x.username)).toEqual(['b'])
  })

  it('损坏的 localStorage 数据静默降级为空列表', () => {
    window.localStorage.setItem('qiji.savedAccounts', '{broken json')
    expect(loadSavedAccounts()).toEqual([])
  })

  it('空用户名不保存', () => {
    saveAccount('   ', 'pw', true)
    expect(loadSavedAccounts()).toEqual([])
  })
})
