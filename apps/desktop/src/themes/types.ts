/**
 * Desktop app theme model.
 *
 *   colors      — Tailwind color tokens written directly to CSS vars.
 *   darkColors  — optional hand-tuned dark variant (else `colors` is reused
 *                 unchanged for dark, and a synth pass generates light).
 *   typography  — font families + optional stylesheet URL.
 *
 * Everything else (layout, sizing, radius, line-height) lives in styles.css.
 * Add new themes in `presets.ts` — no other code changes needed.
 */

export interface DesktopThemeColors {
  background: string
  foreground: string
  card: string
  cardForeground: string
  muted: string
  mutedForeground: string
  popover: string
  popoverForeground: string
  primary: string
  primaryForeground: string
  secondary: string
  secondaryForeground: string
  accent: string
  accentForeground: string
  border: string
  input: string
  /** Generic focus ring — buttons, inputs, etc. */
  ring: string
  /**
   * Brand-accent stroke — focus rings, streaming cursors, active session
   * pills, branded scrollbars, text selection. Falls back to `ring`.
   * Aliased to the DS `--midground` token.
   */
  midground?: string
  /** Auto-derived from `midground` luminance when omitted. */
  midgroundForeground?: string
  /** Composer outline / focus color. Falls back to `midground`. */
  composerRing?: string
  destructive: string
  destructiveForeground: string
  sidebarBackground?: string
  sidebarBorder?: string
  userBubble?: string
  userBubbleBorder?: string
}

export interface DesktopThemeTypography {
  fontSans: string
  fontMono: string
  /** Google/Bunny/self-hosted font stylesheet URL. */
  fontUrl?: string
}

/**
 * Integrated-terminal ANSI palette (xterm `ITheme`, minus `background`).
 *
 * Populated only when a converted VS Code theme ships a full `terminal.ansi*`
 * set; otherwise the terminal keeps its built-in VS Code default palette.
 * `background` is intentionally absent — the pane always paints the live skin
 * surface so it stays translucent.
 */
export interface DesktopTerminalPalette {
  foreground?: string
  cursor?: string
  /** Keeps its source alpha — xterm blends it over the surface. */
  selectionBackground?: string
  black?: string
  red?: string
  green?: string
  yellow?: string
  blue?: string
  magenta?: string
  cyan?: string
  white?: string
  brightBlack?: string
  brightRed?: string
  brightGreen?: string
  brightYellow?: string
  brightBlue?: string
  brightMagenta?: string
  brightCyan?: string
  brightWhite?: string
}

/**
 * Layout tokens a theme may tune (A档: 布局token化). All optional — omitted
 * keys fall back to the shell defaults in styles.css, so flat-color themes
 * are unaffected. Values are validated + clamped in applyTheme.
 */
export interface DesktopThemeLayout {
  /** 0-2, default 0.6. Scales every radius token (rounded↔angular). */
  radiusScalar?: number
  /** 0.85-1.3, default 1. Multiplier on spacing scale (compact↔roomy). */
  spacingMul?: number
  /** Base font size in rem, 0.75-1.1, default 0.875. */
  baseSize?: number
  /** Chat turn gap in rem, 0.2-0.9, default 0.375. Larger = airier transcript. */
  turnGap?: number
  /** Conversation column max width in rem, 32-72, default 48. Narrow = 聊天感, wide = 工作台感. */
  chatMaxWidth?: number
  /** Chat bubble corner style. 'soft' = 大圆角软气泡, 'sharp' = 直角, 'pill' = 胶囊. */
  bubbleStyle?: 'soft' | 'sharp' | 'pill'
  /**
   * B档: 布局预设倾向. Presets clamp to officially-verified arrangements —
   * themes express intent, the shell maps it to safe CSS.
   * - 'chat'    居中窄栏聊天风(收窄对话区, 大留白)
   * - 'work'    宽幅工作台风(默认, 最大化内容区)
   * - 'zen'     极简禅意(隐藏次要装饰, 大行距)
   */
  vibe?: 'chat' | 'work' | 'zen'
}

export interface DesktopTheme {
  name: string
  label: string
  description: string
  /** Light palette (also reused for dark when `darkColors` is omitted). */
  colors: DesktopThemeColors
  /** Hand-tuned dark palette. Skins like `nous` ship one. */
  darkColors?: DesktopThemeColors
  typography?: Partial<DesktopThemeTypography>
  /** Light-variant terminal ANSI palette (also the fallback for dark). */
  terminal?: DesktopTerminalPalette
  /** Dark-variant terminal ANSI palette. Falls back to `terminal`. */
  darkTerminal?: DesktopTerminalPalette
  /** A+B档: 布局token(圆角/密度/气泡/对话区宽度/布局预设). 全可选,缺省=壳默认. */
  layout?: DesktopThemeLayout
  /**
   * Wallpaper — decorative background image layered under the whole app shell
   * (body background-image). Anime/skin themes live here. Optional per-mode:
   * pass one URL for both, or separate light/dark artworks.
   * Supported: https:// URL, data: URL, or an `avatar://`-style local asset
   * path the renderer can resolve. Leave undefined for flat-color themes.
   */
  backgroundImage?: {
    /** Used in light mode. */
    light?: string
    /** Used in dark mode. Defaults to `light` when omitted. */
    dark?: string
    /** 0-1 overlay strength of the readability scrim (default 0.55 dark / 0.75 light). */
    scrimOpacity?: number
    /** CSS background-size (default "cover"). */
    size?: string
    /** CSS background-position (default "center"). */
    position?: string
  }
}
