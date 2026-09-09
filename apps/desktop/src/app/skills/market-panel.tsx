import type * as React from 'react'
import { useCallback, useEffect, useState } from 'react'
import { Download, Loader2, Sparkles } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { BACKEND_BASE_URL, backendGet } from '@/lib/backend'
import { $auth } from '@/store/auth'
import { useStore } from '@nanostores/react'

interface MarketSkill {
  id: number | string
  name: string
  title: string
  version: string
  description?: string
  download_count: number
}

/**
 * qiji 0.17.7: 技能广场——从「设置→个人中心」提升为一级入口。
 * 数据源 /api/client/v1/skill/list;安装走 hermesDesktop.skillMarket.install。
 * （逻辑从 account-settings.tsx 迁出,个人中心保留轻量入口）
 */
export function MarketPanel(_props: React.ComponentProps<'section'>) {
  const [skills, setSkills] = useState<MarketSkill[]>([])
  const [loading, setLoading] = useState(true)
  const [installing, setInstalling] = useState<string | null>(null)
  const [installed, setInstalled] = useState<Set<string>>(new Set())
  const [msg, setMsg] = useState('')
  const [msgOk, setMsgOk] = useState(true)
  const auth = useStore($auth)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await backendGet<{ total: number; rows: MarketSkill[] }>('/api/client/v1/skill/list')
      const rows = res.data?.rows ?? []
      const installedNames: string[] = []
      try {
        const r = await window.hermesDesktop.listDir('skills/market')
        for (const item of r) {
          if (item.isDirectory) installedNames.push(item.name)
        }
      } catch { /* 目录不存在=没装过 */ }
      setSkills(rows)
      setInstalled(new Set(installedNames))
    } catch {
      setSkills([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  async function install(sk: MarketSkill) {
    if (installing) return
    setInstalling(sk.name)
    setMsg('')
    try {
      const url = `${BACKEND_BASE_URL}/api/client/v1/skill/download?id=${sk.id}`
      await window.hermesDesktop.skillMarket.install(url, sk.name, auth.token || '')
      setInstalled(prev => new Set(prev).add(sk.name))
      setMsgOk(true)
      setMsg(`「${sk.title}」安装成功`)
    } catch (err) {
      setMsgOk(false)
      setMsg(`安装失败: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setInstalling(null)
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <header className="flex items-center gap-2">
        <Sparkles className="size-4 text-primary" />
        <h2 className="text-sm font-semibold">技能广场</h2>
        <span className="text-xs text-muted-foreground">浏览并安装平台技能,安装后可在会话中直接使用</span>
      </header>
      {msg ? (
        <p className={cn('text-xs', msgOk ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive')}>{msg}</p>
      ) : null}
      {loading ? (
        <p className="text-xs text-muted-foreground">
          <Loader2 className="mr-1 inline size-3 animate-spin" />
          正在加载技能列表…
        </p>
      ) : skills.length === 0 ? (
        <p className="text-xs text-muted-foreground">暂无可用技能</p>
      ) : (
        <div className="grid grid-cols-2 gap-2.5 xl:grid-cols-3">
          {skills.map(sk => {
            const isInstalled = installed.has(sk.name)
            return (
              <div
                className="flex flex-col justify-between rounded-xl border border-border/70 bg-muted/20 px-3.5 py-3"
                key={sk.id}
              >
                <div>
                  <p className="text-sm font-medium">{sk.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">v{sk.version} · {sk.download_count} 次下载</p>
                  {sk.description ? (
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground/80">{sk.description}</p>
                  ) : null}
                </div>
                <Button
                  className="mt-2.5"
                  disabled={isInstalled || installing !== null}
                  onClick={() => void install(sk)}
                  size="sm"
                  variant={isInstalled ? 'outline' : 'textStrong'}
                >
                  {installing === sk.name ? <Loader2 className="size-3 animate-spin" /> : null}
                  {isInstalled ? '已安装' : installing === sk.name ? '安装中…' : '安装'}
                </Button>
              </div>
            )
          })}
        </div>
      )}
      <p className="text-xs text-muted-foreground/70">
        <Download className="mr-1 inline size-3" />
        安装目录 skills/market,在「技能」页可管理启用状态
      </p>
    </section>
  )
}
