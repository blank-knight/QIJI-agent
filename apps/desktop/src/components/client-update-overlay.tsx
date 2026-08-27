import { useStore } from '@nanostores/react'

import { BrandMark } from '@/components/brand-mark'
import { Button } from '@/components/ui/button'
import { Loader2, Lock, RefreshCw } from '@/lib/icons'
import { cn } from '@/lib/utils'
import {
  $clientUpdate,
  isEnforcedUpdate,
  openClientUpdateDownloadPage,
  startClientUpdate
} from '@/store/client-update'

/**
 * 客户端更新覆盖层（URL 更新通道）。
 *
 * - enforce 强制更新：全屏阻断，不能关闭，必须更新
 * - 非强制下载中：显示进度（toast 点了「立即更新」后）
 * - 下载完成：主进程自动启动安装程序并退出应用
 */
export function ClientUpdateOverlay() {
  const state = useStore($clientUpdate)
  const enforced = isEnforcedUpdate(state)
  const downloading = state.status === 'downloading'
  const downloadingNonEnforced = downloading && !enforced

  // 非强制 + 没在下载 → 不渲染（非强制提示由 toast 负责）
  if (!enforced && !downloadingNonEnforced) {
    return null
  }

  const info = state.info
  const indeterminate = downloading && state.progressIndeterminate

  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/70 backdrop-blur-sm"
      role="dialog"
    >
      <div className="mx-4 w-full max-w-md overflow-hidden rounded-2xl border border-border bg-background shadow-2xl">
        <div className="flex flex-col items-center gap-3 px-6 pt-8 pb-4 text-center">
          <BrandMark className="size-14" />

          {downloading ? (
            <>
              <h2 className="text-lg font-semibold tracking-tight">正在下载新版本</h2>
              <p className="text-xs text-muted-foreground">
                v{info?.newversion} · 下载完成后将自动启动安装
              </p>
            </>
          ) : state.status === 'error' ? (
            <>
              <h2 className="text-lg font-semibold tracking-tight text-destructive">更新失败</h2>
              <p className="line-clamp-3 text-xs text-muted-foreground">{state.error}</p>
            </>
          ) : (
            <>
              <h2 className="text-lg font-semibold tracking-tight">
                {enforced ? '请更新到最新版本' : `发现新版本 v${info?.newversion}`}
              </h2>
              <p className="text-xs text-muted-foreground">
                {enforced ? '当前版本已停用，需更新后才能继续使用' : '立即更新以获得最新功能'}
              </p>
            </>
          )}
        </div>

        {(info?.upgradetext || info?.packagesize) && state.status !== 'error' && (
          <div className="mx-6 mb-4 rounded-xl border border-border/70 bg-muted/30 px-4 py-3 text-left">
            {info?.packagesize && (
              <p className="mb-1.5 text-xs text-muted-foreground">安装包大小：{info.packagesize}</p>
            )}
            {info?.upgradetext && (
              <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed text-foreground/90">
                {info.upgradetext}
              </pre>
            )}
          </div>
        )}

        {downloading && (
          <div className="mx-6 mb-4">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  'h-full rounded-full bg-primary transition-[width] duration-300',
                  indeterminate && 'w-1/3 animate-pulse'
                )}
                style={indeterminate ? undefined : { width: `${state.progressPercent}%` }}
              />
            </div>
            <p className="mt-2 text-center text-xs tabular-nums text-muted-foreground">
              {indeterminate ? '下载中…' : `${state.progressPercent}%`}
            </p>
          </div>
        )}

        <div className="flex flex-col gap-2 border-t border-border/60 bg-muted/20 px-6 py-4">
          {downloading ? (
            <Button disabled size="sm">
              <Loader2 className="size-3.5 animate-spin" />
              下载中…请稍候
            </Button>
          ) : state.status === 'error' ? (
            <>
              <Button onClick={() => void startClientUpdate()} size="sm">
                <RefreshCw className="size-3.5" />
                重试下载
              </Button>
              <Button onClick={openClientUpdateDownloadPage} size="sm" variant="textStrong">
                手动下载安装包
              </Button>
            </>
          ) : (
            <Button autoFocus onClick={() => void startClientUpdate()} size="sm">
              立即更新{info?.packagesize ? `（约 ${info.packagesize}）` : ''}
            </Button>
          )}

          {enforced && (
            <p className="flex items-center justify-center gap-1 text-[0.6875rem] text-muted-foreground">
              <Lock className="size-3" />
              强制更新：完成更新前无法使用本软件
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
