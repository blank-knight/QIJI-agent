import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '@nanostores/react'

import { getHermesConfigRecord, type HermesConfigRecord, saveHermesConfig } from '@/hermes'

import { TRANSLATIONS } from './catalog'
import { DEFAULT_LOCALE, detectSystemLocale, localeConfigValue, normalizeLocale } from './languages'
import { setRuntimeI18nLocale } from './runtime'
import { $oemBrand, DEFAULT_BRAND_NAME } from '@/store/oem-brand'
import type { Locale, Translations } from './types'

export { LOCALE_META } from './languages'

export interface I18nConfigClient {
  getConfig: () => Promise<HermesConfigRecord>
  saveConfig: (config: HermesConfigRecord) => Promise<{ ok: boolean }>
}

const defaultConfigClient: I18nConfigClient = {
  getConfig: () => {
    if (typeof window === 'undefined' || !window.hermesDesktop?.api) {
      return Promise.resolve({})
    }

    return getHermesConfigRecord()
  },
  saveConfig: config => {
    if (typeof window === 'undefined' || !window.hermesDesktop?.api) {
      return Promise.resolve({ ok: true })
    }

    return saveHermesConfig(config)
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function getConfigDisplayLanguage(config: HermesConfigRecord): unknown {
  return isRecord(config.display) ? config.display.language : undefined
}

export function withConfigDisplayLanguage(config: HermesConfigRecord, locale: Locale): HermesConfigRecord {
  const display = isRecord(config.display) ? config.display : {}

  return {
    ...config,
    display: {
      ...display,
      language: localeConfigValue(locale)
    }
  }
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}

/**
 * OEM 品牌替换后的翻译目录：把每个 locale 的目录按「当前品牌」缓存一份
 * 深拷贝，字符串/模板函数里的「奇计」/「Qiji」替换为生效品牌名。
 * 品牌变化（登录贴牌账号/登出）时缓存失效，useMemo 依赖 brandName 触发重渲染。
 */
const brandedCatalogCache = new Map<string, Translations>()

function mapTranslationValue(value: unknown, replace: (s: string) => string): unknown {
  if (typeof value === 'string') return replace(value)
  if (typeof value === 'function') {
    return (...args: unknown[]) => replace(String((value as (...a: unknown[]) => string)(...args)))
  }
  if (Array.isArray(value)) return value.map(v => mapTranslationValue(v, replace))
  if (isRecord(value)) {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) out[k] = mapTranslationValue(v, replace)
    return out
  }
  return value
}

function getBrandedTranslations(locale: Locale, brandName: string): Translations {
  const cacheKey = `${locale}|${brandName}`
  const cached = brandedCatalogCache.get(cacheKey)
  if (cached) return cached

  const base = TRANSLATIONS[locale]
  // 目录文案里的「奇计」是品牌占位符：一律替换为生效品牌名
  // （官方默认=硅基Claw，贴牌=贴牌名）
  const replace = (s: string) => s.split('奇计').join(brandName).replace(/\bQiji\b/g, brandName)
  const branded = mapTranslationValue(base, replace) as Translations
  brandedCatalogCache.set(cacheKey, branded)
  return branded
}

export interface I18nContextValue {
  configLoadError: Error | null
  isLoadingConfig: boolean
  isSavingLocale: boolean
  locale: Locale
  saveError: Error | null
  setLocale: (next: Locale) => Promise<void>
  t: Translations
}

const I18nContext = createContext<I18nContextValue>({
  configLoadError: null,
  isLoadingConfig: false,
  isSavingLocale: false,
  locale: DEFAULT_LOCALE,
  saveError: null,
  setLocale: async () => {},
  t: TRANSLATIONS[DEFAULT_LOCALE]
})

export interface I18nProviderProps {
  children: ReactNode
  configClient?: I18nConfigClient | null
  initialLocale?: unknown
}

export function I18nProvider({ children, configClient = defaultConfigClient, initialLocale }: I18nProviderProps) {
  const [locale, setLocaleState] = useState<Locale>(() => normalizeLocale(initialLocale))
  const [isLoadingConfig, setIsLoadingConfig] = useState(false)
  const [isSavingLocale, setIsSavingLocale] = useState(false)
  const [configLoadError, setConfigLoadError] = useState<Error | null>(null)
  const [saveError, setSaveError] = useState<Error | null>(null)
  const localeRef = useRef(locale)
  // OEM 品牌：订阅 store，品牌变化 → 翻译目录重映射 → 全界面重渲染
  const oemBrand = useStore($oemBrand)
  const brandName = oemBrand.name.trim() || DEFAULT_BRAND_NAME

  useEffect(() => {
    localeRef.current = locale
    setRuntimeI18nLocale(locale)
  }, [locale])

  useEffect(() => {
    if (!configClient) {
      return
    }

    let cancelled = false

    setIsLoadingConfig(true)
    setConfigLoadError(null)

    configClient
      .getConfig()
      .then(config => {
        if (!cancelled) {
          setLocaleState(normalizeLocale(getConfigDisplayLanguage(config)))
        }
      })
      .catch(error => {
        if (!cancelled) {
          setConfigLoadError(toError(error))
          setLocaleState(DEFAULT_LOCALE)
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingConfig(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [configClient, initialLocale])

  const setLocale = useCallback(
    async (next: Locale) => {
      const previousLocale = localeRef.current

      setSaveError(null)
      setLocaleState(next)

      if (!configClient) {
        return
      }

      setIsSavingLocale(true)

      try {
        const latestConfig = await configClient.getConfig()
        const result = await configClient.saveConfig(withConfigDisplayLanguage(latestConfig, next))

        if (!result.ok) {
          throw new Error('Failed to save language')
        }
      } catch (error) {
        const nextError = toError(error)

        setLocaleState(previousLocale)
        setSaveError(nextError)

        throw nextError
      } finally {
        setIsSavingLocale(false)
      }
    },
    [configClient]
  )

  const value = useMemo<I18nContextValue>(
    () => ({
      configLoadError,
      isLoadingConfig,
      isSavingLocale,
      locale,
      saveError,
      setLocale,
      t: getBrandedTranslations(locale, brandName)
    }),
    [configLoadError, isLoadingConfig, isSavingLocale, locale, saveError, setLocale, brandName]
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nContextValue {
  return useContext(I18nContext)
}
