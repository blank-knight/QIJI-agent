/**
 * Built-in desktop themes. Names match the CLI skins / dashboard presets.
 * Add new themes here — no code changes needed elsewhere.
 */

import type { DesktopTheme, DesktopThemeTypography } from './types'

// Color-emoji fonts to append to every stack as a last resort. None of the UI
// text/mono fonts carry emoji glyphs, so without this emoji render as tofu
// boxes on platforms whose default text font lacks them (e.g. Linux/#40364).
// Covers macOS, Windows, Linux, plus the `emoji` generic for anything else.
export const EMOJI_FALLBACK =
  '"Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji", emoji'

const SYSTEM_SANS =
  '"Segoe WPC", "Segoe UI", -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", system-ui, sans-serif, ' +
  EMOJI_FALLBACK

const SYSTEM_MONO =
  '"Cascadia Code", "JetBrains Mono", "SF Mono", ui-monospace, Menlo, Monaco, Consolas, monospace, ' + EMOJI_FALLBACK

export const DEFAULT_TYPOGRAPHY: DesktopThemeTypography = { fontSans: SYSTEM_SANS, fontMono: SYSTEM_MONO }

const NOUS_BLUE = '#0053FD'
const PSYCHE_BLUE = '#1540B1'
const PSYCHE_WARM = '#FFE6CB'

const nousTint = (pct: number) => `color-mix(in srgb, ${NOUS_BLUE} ${pct}%, #FFFFFF)`
const nousTintTransparent = (pct: number) => `color-mix(in srgb, ${NOUS_BLUE} ${pct}%, transparent)`

/**
 * Nous — canonical Hermes desktop identity. The palette keeps the current
 * glass geometry neutral, then lets the old bb/gui blue and psyche cream
 * return as accent seeds.
 */
export const nousTheme: DesktopTheme = {
  name: 'nous',
  label: '经典 Nous',
  description: '玻璃质感中性色 · Nous 蓝点缀',
  colors: {
    background: '#F8FAFF',
    foreground: '#17171A',
    card: '#FFFFFF',
    cardForeground: '#17171A',
    muted: nousTint(5),
    mutedForeground: '#666678',
    popover: '#FFFFFF',
    popoverForeground: '#17171A',
    primary: NOUS_BLUE,
    primaryForeground: '#FCFCFC',
    secondary: nousTint(7),
    secondaryForeground: '#242432',
    accent: nousTint(10),
    accentForeground: '#202030',
    border: nousTintTransparent(22),
    input: nousTintTransparent(30),
    ring: NOUS_BLUE,
    midground: NOUS_BLUE,
    composerRing: NOUS_BLUE,
    destructive: '#C72E4D',
    destructiveForeground: '#FFFFFF',
    sidebarBackground: '#F3F7FF',
    sidebarBorder: nousTintTransparent(18),
    userBubble: nousTint(6),
    userBubbleBorder: nousTintTransparent(24)
  },
  darkColors: {
    background: '#0D2F86',
    foreground: PSYCHE_WARM,
    card: '#12378F',
    cardForeground: PSYCHE_WARM,
    muted: '#183F9A',
    mutedForeground: '#B5C7F3',
    popover: '#123A96',
    popoverForeground: PSYCHE_WARM,
    primary: PSYCHE_WARM,
    primaryForeground: '#0D2F86',
    secondary: '#1B45A4',
    secondaryForeground: '#E0E8FF',
    accent: PSYCHE_BLUE,
    accentForeground: '#F0F4FF',
    border: '#3158AD',
    input: '#0B2566',
    ring: PSYCHE_WARM,
    midground: NOUS_BLUE,
    composerRing: PSYCHE_WARM,
    destructive: '#C0473A',
    destructiveForeground: '#FEF2F2',
    sidebarBackground: '#09286F',
    sidebarBorder: '#234A9C',
    userBubble: '#143B91',
    userBubbleBorder: '#3A63BD'
  },
  typography: {
    fontSans: SYSTEM_SANS,
    fontMono: `"Courier Prime", ${SYSTEM_MONO}`,
    fontUrl: 'https://fonts.googleapis.com/css2?family=Courier+Prime:wght@400;700&display=swap'
  }
}

/** Deep blue-violet with cool accents. Matches the dashboard midnight theme. */
export const midnightTheme: DesktopTheme = {
  name: 'midnight',
  label: '午夜 Midnight',
  description: '深蓝紫色 · 冷冽夜色',
  colors: {
    background: '#08081c',
    foreground: '#ddd6ff',
    card: '#0d0d28',
    cardForeground: '#ddd6ff',
    muted: '#13133a',
    mutedForeground: '#7c7ab0',
    popover: '#0f0f2e',
    popoverForeground: '#ddd6ff',
    primary: '#ddd6ff',
    primaryForeground: '#08081c',
    secondary: '#1a1a4a',
    secondaryForeground: '#c4bff0',
    accent: '#1a1a44',
    accentForeground: '#d0c8ff',
    border: '#1e1e52',
    input: '#1e1e52',
    ring: '#8b80e8',
    midground: '#8b80e8',
    destructive: '#b03060',
    destructiveForeground: '#fef2f2',
    sidebarBackground: '#06061a',
    sidebarBorder: '#12123a',
    userBubble: '#14143a',
    userBubbleBorder: '#242466'
  },
  typography: {
    fontMono: `"JetBrains Mono", ${SYSTEM_MONO}`,
    fontUrl: 'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&display=swap'
  }
}

/** Warm crimson and bronze — forge vibes. Matches the CLI ares skin. */
export const emberTheme: DesktopTheme = {
  name: 'ember',
  label: '余烬 Ember',
  description: '绯红与古铜 · 锻炉暖调',
  colors: {
    background: '#160800',
    foreground: '#ffd8b0',
    card: '#1e0e04',
    cardForeground: '#ffd8b0',
    muted: '#2a1408',
    mutedForeground: '#aa7a56',
    popover: '#221008',
    popoverForeground: '#ffd8b0',
    primary: '#ffd8b0',
    primaryForeground: '#160800',
    secondary: '#341800',
    secondaryForeground: '#f0c090',
    accent: '#301600',
    accentForeground: '#e8c080',
    border: '#3a1c08',
    input: '#3a1c08',
    ring: '#d97316',
    midground: '#d97316',
    destructive: '#c43010',
    destructiveForeground: '#fef2f2',
    sidebarBackground: '#100600',
    sidebarBorder: '#2a1004',
    userBubble: '#2a1000',
    userBubbleBorder: '#4a2010'
  },
  typography: {
    fontMono: `"IBM Plex Mono", ${SYSTEM_MONO}`,
    fontUrl: 'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;700&display=swap'
  }
}

/** Clean grayscale. Matches the CLI mono skin and dashboard mono theme. */
export const monoTheme: DesktopTheme = {
  name: 'mono',
  label: '墨色 Mono',
  description: '纯净灰阶 · 极简专注',
  colors: {
    background: '#0e0e0e',
    foreground: '#eaeaea',
    card: '#141414',
    cardForeground: '#eaeaea',
    muted: '#1e1e1e',
    mutedForeground: '#808080',
    popover: '#181818',
    popoverForeground: '#eaeaea',
    primary: '#eaeaea',
    primaryForeground: '#0e0e0e',
    secondary: '#262626',
    secondaryForeground: '#c8c8c8',
    accent: '#222222',
    accentForeground: '#d8d8d8',
    border: '#2a2a2a',
    input: '#2a2a2a',
    ring: '#9a9a9a',
    midground: '#9a9a9a',
    destructive: '#a84040',
    destructiveForeground: '#fef2f2',
    sidebarBackground: '#0a0a0a',
    sidebarBorder: '#202020',
    userBubble: '#1a1a1a',
    userBubbleBorder: '#363636'
  }
}

/** Neon green on black. Matches the CLI cyberpunk skin and dashboard theme. */
export const cyberpunkTheme: DesktopTheme = {
  name: 'cyberpunk',
  label: '赛博 Cyberpunk',
  description: '黑底霓虹绿 · 矩阵终端',
  colors: {
    background: '#000a00',
    foreground: '#00ff41',
    card: '#001200',
    cardForeground: '#00ff41',
    muted: '#001a00',
    mutedForeground: '#1a8a30',
    popover: '#001000',
    popoverForeground: '#00ff41',
    primary: '#00ff41',
    primaryForeground: '#000a00',
    secondary: '#002800',
    secondaryForeground: '#00cc34',
    accent: '#002000',
    accentForeground: '#00e038',
    border: '#003000',
    input: '#003000',
    ring: '#00ff41',
    midground: '#00ff41',
    destructive: '#ff003c',
    destructiveForeground: '#000a00',
    sidebarBackground: '#000600',
    sidebarBorder: '#001800',
    userBubble: '#001400',
    userBubbleBorder: '#004800'
  },
  typography: {
    fontMono: `"Courier New", Courier, monospace, ${EMOJI_FALLBACK}`,
    fontSans: `"Courier New", Courier, monospace, ${EMOJI_FALLBACK}`
  }
}

/** Cool slate blue for developers. Matches the CLI slate skin. */
export const slateTheme: DesktopTheme = {
  name: 'slate',
  label: '石板 Slate',
  description: '冷石板蓝 · 开发者专注',
  colors: {
    background: '#0d1117',
    foreground: '#c9d1d9',
    card: '#161b22',
    cardForeground: '#c9d1d9',
    muted: '#21262d',
    mutedForeground: '#8b949e',
    popover: '#1c2128',
    popoverForeground: '#c9d1d9',
    primary: '#c9d1d9',
    primaryForeground: '#0d1117',
    secondary: '#2a3038',
    secondaryForeground: '#adb5bf',
    accent: '#1e2530',
    accentForeground: '#c0c8d0',
    border: '#30363d',
    input: '#30363d',
    ring: '#58a6ff',
    midground: '#58a6ff',
    destructive: '#cf4848',
    destructiveForeground: '#fef2f2',
    sidebarBackground: '#090d13',
    sidebarBorder: '#1c2228',
    userBubble: '#1e2a38',
    userBubbleBorder: '#2e4060'
  },
  typography: {
    fontMono: `"JetBrains Mono", ${SYSTEM_MONO}`
  },
  layout: {
    vibe: 'work',
    bubbleStyle: 'sharp',
    radiusScalar: 0.15,
    spacingMul: 0.9,
    turnGap: 0.25,
    chatLayout: { list: 'forum', userStyle: 'bare', assistantStyle: 'indent', composer: 'dock' }
  }
}

/**
 * Sakura — 樱花粉 anime theme. Soft spring palette; warm rose primary with
 * petal-milk surfaces. Designed as the flagship of the skin-shop line:
 *色板先行,壁纸接口就绪(backgroundImage 留待官方插画资产接入)。
 */
export const sakuraTheme: DesktopTheme = {
  name: 'sakura',
  label: '樱花 Sakura',
  description: '粉色少女系主题 — 柔和樱花色调',
  colors: {
    background: '#FDF3F5',
    foreground: '#4A3238',
    card: '#FFFFFF',
    cardForeground: '#4A3238',
    muted: '#F9E4E9',
    mutedForeground: '#9A7B82',
    popover: '#FFFFFF',
    popoverForeground: '#4A3238',
    primary: '#E8798F',
    primaryForeground: '#FFF7F8',
    secondary: '#F6CBD3',
    secondaryForeground: '#5E3F46',
    accent: '#F4A7B9',
    accentForeground: '#533540',
    border: '#F0D4DA',
    input: '#F7E3E7',
    ring: '#E8798F',
    midground: '#E8798F',
    composerRing: '#E8798F',
    destructive: '#C4485F',
    destructiveForeground: '#FFF5F6',
    sidebarBackground: '#FAECEF',
    sidebarBorder: '#F0D4DA',
    userBubble: '#F9DCE2',
    userBubbleBorder: '#EFC6CE'
  },
  darkColors: {
    background: '#2A1E22',
    foreground: '#F3D9DE',
    card: '#37282D',
    cardForeground: '#F3D9DE',
    muted: '#423036',
    mutedForeground: '#C7A2AB',
    popover: '#3C2C31',
    popoverForeground: '#F3D9DE',
    primary: '#F096A9',
    primaryForeground: '#2A1E22',
    secondary: '#4A353B',
    secondaryForeground: '#EBD3D8',
    accent: '#D97A8E',
    accentForeground: '#FBEFF1',
    border: '#564047',
    input: '#241A1E',
    ring: '#F096A9',
    midground: '#F096A9',
    composerRing: '#F096A9',
    destructive: '#C05B6E',
    destructiveForeground: '#FBEDEF',
    sidebarBackground: '#231A1D',
    sidebarBorder: '#4A353B',
    userBubble: '#3F2E33',
    userBubbleBorder: '#5C454B'
  },
  typography: {
    fontSans: SYSTEM_SANS
  },
  layout: {
    vibe: 'chat',
    bubbleStyle: 'pill',
    radiusScalar: 1.3,
    spacingMul: 1.15,
    turnGap: 0.55,
    chatMaxWidth: 42,
    chatLayout: { list: 'feed', userAlign: 'right', userStyle: 'card', assistantStyle: 'card', composer: 'float' }
  }
}

/**
 * Starnight — 星空紫 anime theme. Deep night-violet with luminous accents;
 * the "晚空少女" mood. Wallpaper-ready like sakura.
 */
export const starnightTheme: DesktopTheme = {
  name: 'starnight',
  label: '星夜 Starnight',
  description: '深紫星空主题 — 静谧夜色氛围',
  colors: {
    background: '#171233',
    foreground: '#E4DEFA',
    card: '#221B45',
    cardForeground: '#E4DEFA',
    muted: '#2B2352',
    mutedForeground: '#A79DD6',
    popover: '#251E4B',
    popoverForeground: '#E4DEFA',
    primary: '#9D7BEA',
    primaryForeground: '#171233',
    secondary: '#332A5F',
    secondaryForeground: '#D5CDF2',
    accent: '#7E5FD1',
    accentForeground: '#F0ECFB',
    border: '#3C3168',
    input: '#2A2151',
    ring: '#9D7BEA',
    midground: '#9D7BEA',
    composerRing: '#B79BF0',
    destructive: '#C4586E',
    destructiveForeground: '#FBEFF2',
    sidebarBackground: '#120E28',
    sidebarBorder: '#332A5F',
    userBubble: '#2E2557',
    userBubbleBorder: '#4A3E7E'
  },
  darkColors: {
    background: '#0F0B24',
    foreground: '#DCD5F5',
    card: '#1A1438',
    cardForeground: '#DCD5F5',
    muted: '#221A44',
    mutedForeground: '#9C92C9',
    popover: '#1D1640',
    popoverForeground: '#DCD5F5',
    primary: '#8F6CE0',
    primaryForeground: '#0F0B24',
    secondary: '#292050',
    secondaryForeground: '#CFC7EE',
    accent: '#6E50BE',
    accentForeground: '#ECE7F9',
    border: '#312858',
    input: '#1B1339',
    ring: '#8F6CE0',
    midground: '#8F6CE0',
    composerRing: '#A98CF0',
    destructive: '#B44F65',
    destructiveForeground: '#F9ECEF',
    sidebarBackground: '#0B081C',
    sidebarBorder: '#292050',
    userBubble: '#251D48',
    userBubbleBorder: '#403670'
  },
  typography: {
    fontSans: SYSTEM_SANS
  },
  layout: {
    vibe: 'chat',
    bubbleStyle: 'soft',
    radiusScalar: 1.0,
    spacingMul: 1.05,
    turnGap: 0.45
  }
}

/**
 * Matcha — 抹茶绿 healing theme. Fresh tea greens on cream; the "治愈系"
 * pick. Wallpaper-ready like the other skin-shop themes.
 */
export const matchaTheme: DesktopTheme = {
  name: 'matcha',
  label: '抹茶 Matcha',
  description: '治愈抹茶绿 — 清新自然色调',
  colors: {
    background: '#F4F7EE',
    foreground: '#33402A',
    card: '#FFFFFF',
    cardForeground: '#33402A',
    muted: '#E8F0DC',
    mutedForeground: '#7A8A6C',
    popover: '#FFFFFF',
    popoverForeground: '#33402A',
    primary: '#6B9B4E',
    primaryForeground: '#F8FBF4',
    secondary: '#D9E8C5',
    secondaryForeground: '#41522F',
    accent: '#A3C487',
    accentForeground: '#3A4A2C',
    border: '#DCE8CC',
    input: '#EDF4E2',
    ring: '#6B9B4E',
    midground: '#6B9B4E',
    composerRing: '#6B9B4E',
    destructive: '#B8543F',
    destructiveForeground: '#FBF3EF',
    sidebarBackground: '#EDF3E3',
    sidebarBorder: '#DCE8CC',
    userBubble: '#E2EED2',
    userBubbleBorder: '#D2E3BC'
  },
  darkColors: {
    background: '#1C2318',
    foreground: '#DEE8D2',
    card: '#252E20',
    cardForeground: '#DEE8D2',
    muted: '#2E3A27',
    mutedForeground: '#A5B896',
    popover: '#293323',
    popoverForeground: '#DEE8D2',
    primary: '#87B86A',
    primaryForeground: '#1C2318',
    secondary: '#35422D',
    secondaryForeground: '#D0DEBF',
    accent: '#5F8A46',
    accentForeground: '#EDF4E4',
    border: '#414F37',
    input: '#182011',
    ring: '#87B86A',
    midground: '#87B86A',
    composerRing: '#9BCB80',
    destructive: '#A84E3A',
    destructiveForeground: '#F7EDE9',
    sidebarBackground: '#151C11',
    sidebarBorder: '#35422D',
    userBubble: '#2C3726',
    userBubbleBorder: '#465539'
  },
  typography: {
    fontSans: SYSTEM_SANS
  },
  layout: {
    vibe: 'zen',
    bubbleStyle: 'soft',
    radiusScalar: 0.8,
    spacingMul: 1.2,
    turnGap: 0.7
  }
}

export const BUILTIN_THEMES: Record<string, DesktopTheme> = {
  nous: nousTheme,
  midnight: midnightTheme,
  ember: emberTheme,
  mono: monoTheme,
  cyberpunk: cyberpunkTheme,
  slate: slateTheme,
  sakura: sakuraTheme,
  starnight: starnightTheme,
  matcha: matchaTheme
}

export const BUILTIN_THEME_LIST = Object.values(BUILTIN_THEMES)

/** Skin used when nothing is persisted or the persisted name is retired. */
export const DEFAULT_SKIN_NAME = 'nous'
