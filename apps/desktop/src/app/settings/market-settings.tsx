import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'

import type { DesktopMarketplaceSearchItem } from '@/global'
import { useI18n } from '@/i18n'
import { triggerHaptic } from '@/lib/haptics'
import { Check, Download, Loader2, Palette } from '@/lib/icons'
import { selectableCardClass } from '@/lib/selectable-card'
import { cn } from '@/lib/utils'
import { installVscodeThemeFromMarketplace } from '@/themes/install'
import { isUserTheme, removeUserTheme } from '@/themes/user-themes'

import { SettingsContent } from './primitives'

function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const handle = setTimeout(() => setDebounced(value), delayMs)

    return () => clearTimeout(handle)
  }, [value, delayMs])

  return debounced
}

const compactNumber = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 })

function results_short(pageSize: number, data: DesktopMarketplaceSearchItem[] | undefined): boolean {
  return !data || data.length < pageSize
}

/**
 * 主题市场独立页面（0.19.2 从外观页拆出）：热门榜 + 市场搜索。
 * 空查询 = 安装量 Top 榜；有词 = 定向搜索。每行点击即下载转换安装并激活。
 */
export function MarketSettings() {
  const { t } = useI18n()
  const copy = t.commandCenter.installTheme
  const [query, setQuery] = useState('')
  const debounced = useDebounced(query.trim(), 300)
  const [installingId, setInstallingId] = useState<string | null>(null)
  const [installedHere, setInstalledHere] = useState<Record<string, true>>({})
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(12)

  // 换搜索词或每页条数时回到第1页
  useEffect(() => { setPage(1) }, [debounced, pageSize])

  const search = useQuery({
    // 空查询 = 市场热门榜(安装量Top), 有词 = 定向搜索。翻页走市场API的pageNumber。
    queryFn: () =>
      window.hermesDesktop?.themes?.searchMarketplace(debounced, { limit: pageSize, page }) ??
      Promise.resolve([]),
    queryKey: ['marketplace-themes-page', debounced || '__hot__', page, pageSize],
    staleTime: 5 * 60 * 1000
  })

  const install = async (item: DesktopMarketplaceSearchItem) => {
    if (installingId) {
      return
    }

    setInstallingId(item.extensionId)
    setError(null)

    try {
      await installVscodeThemeFromMarketplace(item.extensionId)

      triggerHaptic('crisp')
      setInstalledHere(prev => ({ ...prev, [item.extensionId]: true }))
    } catch (e) {
      setError(e instanceof Error ? e.message : copy.error)
    } finally {
      setInstallingId(null)
    }
  }

  const header = (
    <p className="mb-2 text-[length:var(--conversation-caption-font-size)] font-medium text-(--ui-text-tertiary)">
      {debounced ? '市场搜索结果' : '热门主题榜（来自 VS Code 市场，点一下即装）'}
    </p>
  )

  return (
    <SettingsContent>
      <div className="flex items-center justify-between gap-3 pt-1">
        <h2 className="text-lg font-semibold tracking-tight">主题市场</h2>
      </div>
      <p className="mt-1 text-[length:var(--conversation-caption-font-size)] text-(--ui-text-tertiary)">
        浏览 VS Code 市场的热门主题，搜索并一键安装。已安装的主题可在「设置 → 外观」中管理。
      </p>

      <div className="mt-3">
        <input
          className="w-full rounded-lg border border-(--ui-stroke-tertiary) bg-(--ui-bg-quinary) px-3 py-1.5 text-[length:var(--conversation-caption-font-size)] outline-none placeholder:text-(--ui-text-tertiary) focus:border-(--ui-stroke-secondary)"
          onChange={event => setQuery(event.target.value)}
          placeholder="搜索主题名，或留空浏览热门榜…"
          spellCheck={false}
          value={query}
        />
      </div>

      <div className="mt-3">
        {search.isLoading ? (
          <>
            {header}
            <p className="flex items-center gap-2 text-[length:var(--conversation-caption-font-size)] text-(--ui-text-tertiary)">
              <Loader2 className="size-3.5 animate-spin" />
              {copy.loading}
            </p>
          </>
        ) : search.isError ? (
          <>
            {header}
            <p className="text-[length:var(--conversation-caption-font-size)] text-(--ui-red)">{copy.error}</p>
          </>
        ) : (search.data ?? []).length === 0 ? (
          <>
            {header}
            <p className="text-[length:var(--conversation-caption-font-size)] text-(--ui-text-tertiary)">{copy.empty}</p>
          </>
        ) : (
          <>
            {header}
            {error && <p className="mb-2 text-[length:var(--conversation-caption-font-size)] text-(--ui-red)">{error}</p>}
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {(search.data ?? []).map(item => {
                const busy = installingId === item.extensionId
                const done = installedHere[item.extensionId]

                return (
                  <button
                    className={cn(
                      'flex items-center gap-2.5 px-2.5 py-2 text-left disabled:opacity-60',
                      selectableCardClass({ prominent: done })
                    )}
                    disabled={Boolean(installingId) && !busy}
                    key={item.extensionId}
                    onClick={() => void install(item)}
                    type="button"
                  >
                    <Palette className="size-4 shrink-0 text-(--ui-text-tertiary)" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[length:var(--conversation-text-font-size)] font-medium">
                        {item.displayName}
                      </span>
                      <span className="block truncate text-[length:var(--conversation-caption-font-size)] text-(--ui-text-tertiary)">
                        {item.publisher}
                        {item.installs > 0 ? ` · ${copy.installs(compactNumber.format(item.installs))}` : ''}
                      </span>
                    </span>
                    <span className="shrink-0 text-(--ui-text-tertiary)">
                      {busy ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : done ? (
                        <Check className="size-4 text-(--ui-green)" />
                      ) : (
                        <Download className="size-4" />
                      )}
                    </span>
                  </button>
                )
              })}
            </div>
            <div className="mt-2 flex items-center justify-center gap-1.5">
              <select
                className="rounded-md border border-(--ui-stroke-tertiary) bg-(--ui-bg-quinary) px-1.5 py-0.5 text-[11px] outline-none"
                onChange={e => setPageSize(Number(e.target.value))}
                title="每页显示数量"
                value={pageSize}
              >
                {[6, 12, 24].map(n => (
                  <option key={n} value={n}>
                    {n} 条/页
                  </option>
                ))}
              </select>
              <button
                className="rounded-md border border-(--ui-stroke-tertiary) px-1.5 py-0.5 text-[11px] text-(--ui-text-tertiary) hover:text-(--ui-text-primary) disabled:opacity-40"
                disabled={page <= 1 || search.isFetching}
                onClick={() => setPage(p => Math.max(1, p - 1))}
                type="button"
              >
                ‹ 上一页
              </button>
              <span className="min-w-7 text-center text-[11px] tabular-nums text-(--ui-text-tertiary)">{page}</span>
              <button
                className="rounded-md border border-(--ui-stroke-tertiary) px-1.5 py-0.5 text-[11px] text-(--ui-text-tertiary) hover:text-(--ui-text-primary) disabled:opacity-40"
                disabled={results_short(pageSize, search.data) || search.isFetching}
                onClick={() => setPage(p => p + 1)}
                type="button"
              >
                下一页 ›
              </button>
            </div>
          </>
        )}
      </div>
    </SettingsContent>
  )
}
