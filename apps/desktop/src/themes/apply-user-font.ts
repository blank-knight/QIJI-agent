/**
 * apply-user-font.ts — 用户字体偏好的运行时应用
 *
 * 与 applyTheme 的关系：applyTheme 写 --dt-font-sans（主题默认字体）；
 * 本模块在主题应用之后覆盖该变量（用户选择优先），并负责加载字体的
 * <link> 注入（去重）。清空选择时还原主题值——通过重新触发当前主题
 * 应用实现（调用方在 ThemeProvider 里监听字体变化后重跑 applyTheme）。
 */

const INJECTED_FONT_LINK_ID = 'qiji-user-font-link'

export function applyUserFont(fontSans: string | null, fontUrl: string | null): void {
  if (typeof document === 'undefined') return

  const root = document.documentElement

  if (fontSans) {
    root.style.setProperty('--dt-font-sans', fontSans)
    root.dataset.qijiUserFont = 'on'
  } else {
    root.style.removeProperty('--dt-font-sans')
    delete root.dataset.qijiUserFont
  }

  // 字体 stylesheet：同 URL 复用，URL 变了换 href，清空则移除
  let link = document.getElementById(INJECTED_FONT_LINK_ID) as HTMLLinkElement | null
  if (fontUrl) {
    if (!link) {
      link = document.createElement('link')
      link.id = INJECTED_FONT_LINK_ID
      link.rel = 'stylesheet'
      document.head.appendChild(link)
    }
    if (link.href !== fontUrl) link.href = fontUrl
  } else if (link) {
    link.remove()
  }
}
