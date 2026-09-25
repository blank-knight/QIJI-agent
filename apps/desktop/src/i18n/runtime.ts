import { TRANSLATIONS } from './catalog'
import { DEFAULT_LOCALE } from './languages'
import { brandText } from '@/store/oem-brand'
import type { Locale, Translations } from './types'

let runtimeLocale: Locale = DEFAULT_LOCALE

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function resolvePath(catalog: Translations, key: string): unknown {
  return key.split('.').reduce<unknown>((current, part) => {
    if (!isRecord(current)) {
      return undefined
    }

    return current[part]
  }, catalog)
}

function renderTranslation(value: unknown, args: unknown[]): string | null {
  if (typeof value === 'string') {
    return value
  }

  if (typeof value === 'function') {
    return (value as (...args: unknown[]) => string)(...args)
  }

  return null
}

export function setRuntimeI18nLocale(locale: Locale) {
  runtimeLocale = locale
}

/** qiji: 当前运行时 locale（供非 React 模块如翻译表判断中文环境） */
export function getRuntimeI18nLocale(): Locale {
  return runtimeLocale
}

/** qiji: 当前是否中文（zh / zh-hant）——技能翻译层用 */
export function isZhLocale(): boolean {
  return runtimeLocale === 'zh' || runtimeLocale === 'zh-hant'
}

export function translateNow(key: string, ...args: unknown[]): string {
  const active = renderTranslation(resolvePath(TRANSLATIONS[runtimeLocale], key), args)

  if (active !== null) {
    return brandText(active)
  }

  if (runtimeLocale !== DEFAULT_LOCALE) {
    const fallback = renderTranslation(resolvePath(TRANSLATIONS[DEFAULT_LOCALE], key), args)

    if (fallback !== null) {
      return brandText(fallback)
    }
  }

  return key
}
