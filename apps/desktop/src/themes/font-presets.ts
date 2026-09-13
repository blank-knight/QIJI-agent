/**
 * font-presets.ts — 用户可选字体预设（外观页字体选择器数据源）
 *
 * 设计：字体跟主题解耦。用户选的字体存 localStorage（key 见 FONT_PREF_KEY），
 * 优先级高于主题自带 typography——换主题不丢字体选择，清空=回落主题默认。
 *
 * 字体全部走 Google Fonts 在线加载（fontUrl 注入 <link>，applyTheme 已有该机制）。
 * 国内可达性：fonts.googleapis.com 在无代理环境可能慢/超时，每个预设都带
 * 完整 fallback 链（系统中文字体兜底），加载失败时用户看到的是兜底字体而非崩溃。
 */

export interface FontPreset {
  id: string
  label: string
  /** CSS font-family 值（含 fallback 链） */
  fontSans: string
  /** Google Fonts stylesheet URL；null = 纯系统字体，无需网络 */
  fontUrl: string | null
  /** 一句话描述 */
  description: string
}

export const FONT_PREF_KEY = 'qiji-user-font-preset'

/** 系统默认（不额外加载字体，各平台原生栈） */
const SYSTEM_STACK = `-apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", sans-serif`

export const FONT_PRESETS: FontPreset[] = [
  {
    id: 'theme-default',
    label: '跟随主题',
    fontSans: SYSTEM_STACK,
    fontUrl: null,
    description: '使用当前主题自带的字体设置'
  },
  {
    id: 'lxgw-wenkai',
    label: '霞鹜文楷',
    fontSans: `"LXGW WenKai Screen", "LXGW WenKai", "Kaiti SC", "KaiTi", ${SYSTEM_STACK}`,
    fontUrl: 'https://fonts.googleapis.com/css2?family=LXGW+WenKai+TC:wght@400;700&display=swap',
    description: '手写楷体风 — 温润文艺，最搭动漫主题'
  },
  {
    id: 'noto-sans-sc',
    label: '思源黑体',
    fontSans: `"Noto Sans SC", "Source Han Sans SC", "Microsoft YaHei", ${SYSTEM_STACK}`,
    fontUrl: 'https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;700&display=swap',
    description: '现代标准黑体 — 清晰锐利，阅读舒适'
  },
  {
    id: 'zcool-kuaiLe',
    label: '站酷快乐体',
    fontSans: `"ZCOOL KuaiLe", "Microsoft YaHei", ${SYSTEM_STACK}`,
    fontUrl: 'https://fonts.googleapis.com/css2?family=ZCOOL+KuaiLe&display=swap',
    description: '圆润可爱体 — 活泼俏皮，二次元浓度高'
  },
  {
    id: 'ma-shan-zheng',
    label: '马善政毛笔',
    fontSans: `"Ma Shan Zheng", "Kaiti SC", "KaiTi", ${SYSTEM_STACK}`,
    fontUrl: 'https://fonts.googleapis.com/css2?family=Ma+Shan+Zheng&display=swap',
    description: '毛笔书法体 — 笔锋浓郁，国风主题绝配'
  },
  {
    id: 'jetbrains-mono',
    label: 'JetBrains Mono（含中文回退）',
    fontSans: `"JetBrains Mono", "Cascadia Code", Consolas, "Microsoft YaHei", ${SYSTEM_STACK}`,
    fontUrl: 'https://fonts.googleapis.com/css2?family=JetBrains+Mono:ital,wght@0,400;0,500;0,700;1,400&display=swap',
    description: '等宽编程体 — 代码感拉满，终端爱好者首选'
  }
]

export function getFontPreset(id: string | null | undefined): FontPreset | undefined {
  return FONT_PRESETS.find(p => p.id === id)
}

/** 读取用户持久化的字体偏好（渲染层 localStorage） */
export function readStoredFontPref(): string | null {
  try {
    return window.localStorage.getItem(FONT_PREF_KEY)
  } catch {
    return null
  }
}

export function writeStoredFontPref(id: string | null): void {
  try {
    if (id) {
      window.localStorage.setItem(FONT_PREF_KEY, id)
    } else {
      window.localStorage.removeItem(FONT_PREF_KEY)
    }
  } catch {
    // localStorage 不可用（隐私模式）——本次会话生效即可
  }
}
