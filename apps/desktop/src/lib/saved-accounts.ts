// 登录账号历史：本地记住最近登录的账号（可选记住密码），登录框下拉选择。
// 存 localStorage —— 与 auth store 同一惯例。密码经 btoa 混淆（防肩窥，非加密）。

export interface SavedAccount {
  username: string
  /** 仅在勾选“记住密码”时保存；btoa 混淆存储 */
  password?: string
  /** 最近一次登录成功时间戳 */
  loginAt: number
}

const STORE_KEY = 'qiji.savedAccounts'
const MAX_ACCOUNTS = 5

function decodeSaved(raw: string | null): SavedAccount[] {
  if (!raw) return []
  try {
    const arr = JSON.parse(raw) as SavedAccount[]
    if (!Array.isArray(arr)) return []
    return arr.filter(a => a && typeof a.username === 'string' && a.username.length > 0)
  } catch {
    return []
  }
}

export function loadSavedAccounts(): SavedAccount[] {
  try {
    return decodeSaved(window.localStorage.getItem(STORE_KEY))
  } catch {
    return []
  }
}

function persist(list: SavedAccount[]) {
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(list.slice(0, MAX_ACCOUNTS)))
  } catch {
    // localStorage 满或被禁用 —— 静默降级为不记住
  }
}

/**
 * 登录成功后调用：置顶该账号。rememberPassword=false 时抹掉已存密码。
 */
export function saveAccount(username: string, password: string | undefined, rememberPassword: boolean) {
  const u = username.trim()
  if (!u) return
  const list = loadSavedAccounts().filter(a => a.username !== u)
  const entry: SavedAccount = {
    username: u,
    password: rememberPassword && password ? btoa(password) : undefined,
    loginAt: Date.now(),
  }
  persist([entry, ...list])
}

/** 删除一条历史记录 */
export function removeSavedAccount(username: string) {
  persist(loadSavedAccounts().filter(a => a.username !== username))
}

/** 供单测直接重置 */
export function _resetSavedAccountsForTest() {
  try {
    window.localStorage.removeItem(STORE_KEY)
  } catch {
    // ignore
  }
}
