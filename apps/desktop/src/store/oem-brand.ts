import { useStore } from '@nanostores/react'
import { atom } from 'nanostores'

/**
 * OEM 品牌中枢 —— 客户端通用名「硅基Claw」，贴牌商用户登录后由后端下发
 * 覆盖品牌（brand.name / brand.logo），界面统一从这里取。
 *
 * 数据流：
 * 1. 登录前：输入手机号后调 /auth/brand 预查 → 登录界面即时换品牌
 * 2. 登录/注册响应携带 brand → 写入 store（localStorage 持久化，下次启动直接是贴牌品牌）
 * 3. 品牌为空（官方用户/未配贴牌）→ name 空 = 全界面显示默认「硅基Claw」
 */

export const DEFAULT_BRAND_NAME = '硅基Claw'

const OEM_BRAND_KEY = 'qiji-oem-brand'

export interface OemBrand {
  /** 贴牌品牌名；空串 = 官方默认（硅基Claw） */
  name: string
  /** 贴牌 logo URL；空串 = 默认图标 */
  logo: string
}

function loadPersistedBrand(): OemBrand {
  try {
    const raw = window.localStorage.getItem(OEM_BRAND_KEY)
    if (!raw) return { name: '', logo: '' }
    const parsed = JSON.parse(raw) as Partial<OemBrand> | null
    return {
      name: typeof parsed?.name === 'string' ? parsed.name : '',
      logo: typeof parsed?.logo === 'string' ? parsed.logo : ''
    }
  } catch {
    return { name: '', logo: '' }
  }
}

function persistBrand(brand: OemBrand): void {
  try {
    window.localStorage.setItem(OEM_BRAND_KEY, JSON.stringify(brand))
  } catch {
    // localStorage 不可用（隐私模式等）——本次会话内存态仍然生效
  }
}

/** 持久化的 OEM 品牌（登录后写入；登出时清除） */
export const $oemBrand = atom<OemBrand>(loadPersistedBrand())

/** 登录界面临时品牌预览（手机号输入后预查结果；不持久化，仅登录页用） */
export const $brandPreview = atom<OemBrand | null>(null)

/** 当前生效的显示名（贴牌名 or 默认） */
export function brandDisplayName(brand: OemBrand | null | undefined): string {
  return brand?.name?.trim() ? brand.name.trim() : DEFAULT_BRAND_NAME
}

/** 是否配置了贴牌 logo */
export function hasOemLogo(brand: OemBrand | null | undefined): boolean {
  return Boolean(brand?.logo?.trim())
}

/** 登录/注册成功后调用：写入持久化品牌 */
export function setOemBrand(brand: Partial<OemBrand> | null | undefined): void {
  const next: OemBrand = {
    name: typeof brand?.name === 'string' ? brand.name : '',
    logo: typeof brand?.logo === 'string' ? brand.logo : ''
  }
  persistBrand(next)
  $oemBrand.set(next)
}

/** 登出时调用：清回官方默认 */
export function clearOemBrand(): void {
  try {
    window.localStorage.removeItem(OEM_BRAND_KEY)
  } catch {
    // ignore
  }
  $oemBrand.set({ name: '', logo: '' })
  $brandPreview.set(null)
}

/** React hook：当前生效品牌（含默认回退） */
export function useOemBrand(): { brand: OemBrand; displayName: string } {
  const brand = useStore($oemBrand)
  return { brand, displayName: brandDisplayName(brand) }
}

/**
 * 品牌文本替换：把文案里的通用名占位（「奇计」/「Qiji」）换成当前生效品牌名
 * （贴牌用户=贴牌名，官方=默认「硅基Claw」）。i18n 出口与硬编码可见文案共用。
 * 注意：小写 `qiji`（CLI 命令/路径/协议名）不替换。
 */
export function brandText(text: string): string {
  if (!text) return text
  const name = brandDisplayName($oemBrand.get())
  let out = text.split('奇计').join(name)
  if (out !== text || /\bQiji\b/.test(out)) {
    out = out.replace(/\bQiji\b/g, name)
  }
  return out
}

// —— 主进程同步：登录/登出后把品牌推给主进程（托盘 tooltip / 通知标题用）——
function pushBrandToMain(brand: OemBrand): void {
  try {
    void window.hermesDesktop?.oemBrand?.set?.({ name: brand.name, logo: brand.logo })
  } catch {
    // preload 未就绪/不在 Electron 环境——忽略
  }
}

// 品牌变化时：同步主进程 + 更新主窗口标题
$oemBrand.subscribe(brand => {
  pushBrandToMain(brand)
  try {
    if (typeof document !== 'undefined') {
      document.title = brandDisplayName(brand)
    }
  } catch {
    // ignore
  }
})
// 模块加载即推送一次（启动时把持久化品牌同步给主进程）
pushBrandToMain(loadPersistedBrand())


