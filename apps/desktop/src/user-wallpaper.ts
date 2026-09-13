/**
 * user-wallpaper.ts — 用户自定义背景图（与主题解耦的壁纸层）
 *
 * 复用主题壁纸的 CSS 管线（html[data-hermes-wallpaper] body 背景 +
 * --dt-wallpaper 变量），但来源是用户选的本地图片文件，而不是主题内置。
 * 图片复制到 userData/wallpapers/ 下持久保存（原路径可能被删除/移动），
 * localStorage 只存文件名 + 选项。
 *
 * 优先级：用户壁纸 > 主题自带 backgroundImage > 纯色。设置用户壁纸时
 * 主题壁纸被覆盖；清除用户壁纸后主题壁纸（若有）自然回归。
 */

const LS_KEY = 'qiji-user-wallpaper'

export interface UserWallpaperPref {
  /** 持久化目录里的文件名 */
  file: string
  /** 0-100 遮罩浓度（越大文字越清晰、图越淡） */
  scrim: number
  /** cover | contain */
  size: 'cover' | 'contain'
}

export function readWallpaperPref(): UserWallpaperPref | null {
  try {
    const raw = window.localStorage.getItem(LS_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as UserWallpaperPref
    return parsed?.file ? parsed : null
  } catch {
    return null
  }
}

export function writeWallpaperPref(pref: UserWallpaperPref | null): void {
  try {
    if (pref) window.localStorage.setItem(LS_KEY, JSON.stringify(pref))
    else window.localStorage.removeItem(LS_KEY)
  } catch {
    // 隐私模式下本次会话生效即可
  }
}

function wallpaperDir(): string {
  // 渲染层拿不到 userData 绝对路径——用 protocol。主进程注册了
  // app:// 静态协议吗？保守方案：图片转 data URL 存 localStorage 体积不可行，
  // 因此走主进程 IPC：wallpaper 文件落在 userData/wallpapers，渲染层通过
  // hermesDesktop.wallpaper.url() 拿 file:// 或自定义协议 URL。
  throw new Error('use bridge')
}

/**
 * 应用/清除用户壁纸。url 为空 = 清除（回落主题壁纸或纯色）。
 * 直接操作 CSS 变量（与 applyTheme 的壁纸段同一套变量）。
 */
export function applyUserWallpaper(url: string | null, pref: { scrim: number; size: string } | null): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement

  if (url && pref) {
    root.style.setProperty('--dt-wallpaper', `url("${url}")`)
    root.style.setProperty('--dt-wallpaper-size', pref.size)
    root.style.setProperty('--dt-wallpaper-position', 'center')
    // 遮罩：由主题背景色 + 用户浓度合成（CSS 变量在 styles.css 里被引用）
    const bg = getComputedStyle(root).getPropertyValue('--theme-background-seed').trim() || '#222'
    const alpha = Math.round(Math.min(100, Math.max(0, pref.scrim)) * 2.55)
      .toString(16)
      .padStart(2, '0')
    root.style.setProperty('--dt-wallpaper-scrim', `linear-gradient(${bg}${alpha}, ${bg}${alpha})`)
    root.dataset.hermesWallpaper = 'on'
  } else {
    root.style.removeProperty('--dt-wallpaper')
    root.style.removeProperty('--dt-wallpaper-size')
    root.style.removeProperty('--dt-wallpaper-position')
    root.style.removeProperty('--dt-wallpaper-scrim')
    delete root.dataset.hermesWallpaper
  }
}
