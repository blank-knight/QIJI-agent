import { useEffect, useRef } from 'react'

import type { HermesConnection } from '@/global'
import { HermesGateway } from '@/hermes'
import { translateNow } from '@/i18n'
import { desktopDefaultCwd } from '@/lib/desktop-fs'
import { isGatewayReauthRequired, resolveGatewayWsUrl } from '@/lib/gateway-ws-url'
import { isAuthenticated, $auth } from '@/store/auth'
import {
  $desktopBoot,
  applyDesktopBootProgress,
  completeDesktopBoot,
  failDesktopBoot,
  setDesktopBootStep
} from '@/store/boot'
import {
  $gateway,
  closeSecondaryGateways,
  configureGatewayRegistry,
  ensureGatewayForProfile,
  pruneSecondaryGateways,
  reconnectSecondaryGateways,
  reportPrimaryGatewayState,
  setPrimaryGateway,
  touchSecondaryGateways
} from '@/store/gateway'
import { notify, notifyError } from '@/store/notifications'
import { $activeGatewayProfile, normalizeProfileKey, touchActiveGatewayBackend } from '@/store/profile'
import {
  $activeSessionId,
  $attentionSessionIds,
  $connection,
  $currentCwd,
  $sessions,
  $workingSessionIds,
  ensureDefaultWorkspaceCwd,
  setConnection,
  setCurrentBranch,
  setCurrentCwd,
  setSessionsLoading
} from '@/store/session'
import type { RpcEvent } from '@/types/hermes'

interface GatewayBootOptions {
  handleGatewayEvent: (event: RpcEvent) => void
  onConnectionReady: (
    connection: Awaited<ReturnType<NonNullable<typeof window.hermesDesktop>['getConnection']>> | null
  ) => void
  onGatewayReady: (gateway: HermesGateway | null) => void
  refreshHermesConfig: () => Promise<void>
  refreshSessions: () => Promise<void>
}

export function useGatewayBoot({
  handleGatewayEvent,
  onConnectionReady,
  onGatewayReady,
  refreshHermesConfig,
  refreshSessions
}: GatewayBootOptions) {
  const callbacksRef = useRef({
    handleGatewayEvent,
    onConnectionReady,
    onGatewayReady,
    refreshHermesConfig,
    refreshSessions
  })

  callbacksRef.current = {
    handleGatewayEvent,
    onConnectionReady,
    onGatewayReady,
    refreshHermesConfig,
    refreshSessions
  }

  useEffect(() => {
    let cancelled = false
    const desktop = window.hermesDesktop

    // 登录门控：未登录（登出→reload 后停在登录页）不启动后端。旧逻辑在
    // 登录页背后照样 boot 旧 profile 的后端，登录切档时 profile.set 再把它
    // 杀掉、reload、重新 spawn——一次切换 = 双 spawn + 击杀 + 双 reload，
    // 每一步都是一次界面闪烁。effect 主体（监听器/清理函数）保持完整执行，
    // 只有 boot() 的启动受门控；登录成功（含同账号重登不 reload 的路径）
    // 由 $auth 订阅补启动。
    // ⚠ nanostores 的 subscribe 会同步先触发一次回调（初始通知）——那时
    // 下方的 async function boot 还未声明（TDZ）。回调必须整体 defer 到
    // 微任务/宏任务之后执行，否则启动即 ReferenceError（登录门控失效，
    // 表现为"每次重启都弹登录页"）。
    let wantBoot = isAuthenticated()
    let authUnsub: (() => void) | null = null

    if (!wantBoot) {
      authUnsub = $auth.subscribe(() => {
        queueMicrotask(() => {
          if (!wantBoot && isAuthenticated()) {
            wantBoot = true
            authUnsub?.()
            authUnsub = null
            void boot()
          }
        })
      })
    }

    const publish = (next: HermesConnection | null) => {
      callbacksRef.current.onConnectionReady(next)
      setConnection(next)
    }

    if (!desktop) {
      failDesktopBoot('Desktop IPC bridge is unavailable.')
      setSessionsLoading(false)

      return () => void (cancelled = true)
    }

    // --- Reconnect-after-sleep machinery -------------------------------------
    // macOS sleep silently drops the renderer's WebSocket. The backend Python
    // process keeps running, but nothing re-opened the socket on wake, so the
    // composer stayed disabled forever on "正在启动奇计...". Once the
    // initial boot succeeds we treat any non-open state as recoverable and
    // reconnect with backoff, and we nudge a reconnect on the OS/browser
    // signals that fire around wake (power resume, network online, the window
    // becoming visible).
    let bootCompleted = false
    let reconnecting = false
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let reconnectAttempt = 0
    // Initial-boot bounded retry: a logout→reload boot can race the backend
    // restart (stale cached WS URL against a SIGTERM'd backend) and fail once;
    // retry the whole boot a few times before latching a fatal failure.
    let bootRetryCount = 0
    let bootRetryTimer: ReturnType<typeof setTimeout> | null = null
    const BOOT_MAX_RETRIES = 3
    // 慢速自动重试：快速重试（1s/2s/4s，总窗口 ~7s）耗尽后 failDesktopBoot
    // 钉死失败层，但后端重启竞态窗口可达 10s+——事后日志证明新后端在最后
    // 一次失败后 1 秒就已就绪，却再无拨号，用户干等 12 分钟直到手动重启。
    // 故失败态不再终态：每 15s 自动重跑完整 boot（每轮重置快速重试预算），
    // 任一次成功即 completeDesktopBoot 自愈；最多 3 轮防死循环。复用
    // bootRetryTimer 以白捡 cleanup 与唤醒信号的提前触发。
    let bootSlowRetryCount = 0
    const BOOT_SLOW_RETRY_DELAY_MS = 15_000
    const BOOT_MAX_SLOW_RETRIES = 3
    // 重连退避失败多少次后升级为可恢复 boot error（1+2+4+8+15+15 ≈ 45s）
    const RECONNECT_ESCALATION_THRESHOLD = 6
    // Surface "sign in again" once per disconnect episode, not on every backoff
    // tick — a stale OAuth ticket fails every attempt and would otherwise stack
    // identical error toasts (and their haptics). Reset on the next clean open.
    let reauthNotified = false

    // Wrap the live getter in a call so TS control-flow analysis doesn't narrow
    // `connectionState` to a constant across the early-return guards (the state
    // genuinely changes between reads).
    const gatewayOpen = () => gateway.connectionState === 'open'

    const clearReconnectTimer = () => {
      if (reconnectTimer !== null) {
        clearTimeout(reconnectTimer)
        reconnectTimer = null
      }
    }

    const attemptReconnect = async () => {
      if (cancelled || reconnecting || gatewayOpen()) {
        return
      }

      reconnecting = true

      try {
        // Drop a stale REMOTE backend cache before re-dialing. After sleep/wake a
        // remote backend can become unreachable, but it has no child process
        // whose 'exit' would clear the main process's cached descriptor — without
        // this the renderer re-dials the same dead endpoint forever and stays on
        // "正在启动奇计…". The probe is a no-op for a healthy or local backend.
        await desktop.revalidateConnection?.().catch(() => undefined)

        const conn = await desktop.getConnection($activeGatewayProfile.get())

        if (cancelled) {
          return
        }

        publish(conn)
        // Re-mint the WS URL before reconnecting. OAuth tickets are single-use
        // with a short TTL, so the ticket baked into the cached conn.wsUrl is
        // dead on every reconnect after the initial boot — reusing it surfaces
        // as an opaque "无法连接到奇计网关". resolveGatewayWsUrl
        // mints a fresh ticket (or throws a reauth error in OAuth mode rather
        // than connecting with a stale one). For local/token gateways the URL
        // carries a long-lived token and the re-mint is a cheap no-op.
        const wsUrl = await resolveGatewayWsUrl(desktop, conn)
        await gateway.connect(wsUrl)

        if (cancelled) {
          return
        }

        reconnectAttempt = 0
        // 逃生口自愈：重连成功后清掉此前升级的 boot error（BootFailureOverlay
        // 收起，回到正常工作区），并重置 OAuth 一次性提示标记。
        if ($desktopBoot.get().error !== null) {
          setDesktopBootStep({
            phase: 'renderer.ready',
            message: translateNow('boot.ready'),
            progress: 100,
            running: false
          })
        }
        reauthNotified = false
        // Resync state that may have moved on the backend while we were asleep.
        await callbacksRef.current.refreshHermesConfig().catch(() => undefined)
        await callbacksRef.current.refreshSessions().catch(() => undefined)
      } catch (err) {
        // OAuth session expired mid-reconnect: surface the actionable "sign in
        // again" message once instead of silently looping the backoff against a
        // ticket that can never succeed. Transport failures fall through to the
        // backoff in the finally block below.
        if (!cancelled && isGatewayReauthRequired(err) && !reauthNotified) {
          reauthNotified = true
          notifyError(err, translateNow('boot.errors.gatewaySignInRequired'))
        }
        // 死端逃生口：重连循环失败次数到阈值仍连不上 → 置可恢复 boot error，
        // 让 BootFailureOverlay（重试/登录/换网关）浮出水面替代无限 CONNECTING
        // 转圈。不 return、不清循环：后台继续退避重试，一旦连上即自愈清 error。
        if (!cancelled && !gatewayOpen() && reconnectAttempt >= RECONNECT_ESCALATION_THRESHOLD) {
          failDesktopBoot(translateNow('boot.errors.gatewayUnreachableAfterRetries'))
        }
      } finally {
        reconnecting = false

        if (!cancelled && !gatewayOpen()) {
          scheduleReconnect()
        }
      }
    }

    function scheduleReconnect() {
      if (cancelled || reconnecting || reconnectTimer !== null || gatewayOpen()) {
        return
      }

      // 1s, 2s, 4s … capped at 15s.
      const delay = Math.min(15_000, 1_000 * 2 ** Math.min(reconnectAttempt, 4))
      reconnectAttempt += 1
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null
        void attemptReconnect()
      }, delay)
    }

    // 自救信号（online/可见/powerResume）不应被 bootCompleted 挡死：
    // 登出→reload 后 boot 撞上后端重启竞态失败时，重试定时器在退避等待中，
    // 唤醒信号到达却因 bootCompleted=false 直接 no-op，错过最快的自愈时机。
    // 改为：boot 未完成但有挂起的重试定时器 → 立即触发（提前退避）。
    const reconnectNow = () => {
      if (cancelled) {
        return
      }

      if (!bootCompleted && bootRetryTimer !== null) {
        clearTimeout(bootRetryTimer)
        bootRetryTimer = null
        void boot()
      }

      if (!bootCompleted) {
        return
      }

      clearReconnectTimer()
      reconnectAttempt = 0
      reconnectSecondaryGateways()

      if (!gatewayOpen()) {
        void attemptReconnect()
      }
    }

    const offBootProgress = desktop.onBootProgress(payload => applyDesktopBootProgress(payload))
    void desktop
      .getBootProgress()
      .then(snapshot => applyDesktopBootProgress(snapshot))
      .catch(() => undefined)

    setDesktopBootStep({
      phase: 'renderer.boot',
      message: translateNow('boot.steps.startingDesktopConnection'),
      progress: 6
    })

    const gateway = new HermesGateway()
    callbacksRef.current.onGatewayReady(gateway)
    setPrimaryGateway(gateway, normalizeProfileKey($activeGatewayProfile.get()))
    // Secondary (background-profile) sockets funnel into the same handler.
    configureGatewayRegistry({ onEvent: event => callbacksRef.current.handleGatewayEvent(event) })

    const offState = gateway.onState(st => {
      // Mirror to the composer only while the primary is the active profile —
      // a background secondary reconnect mustn't flip the foreground state.
      reportPrimaryGatewayState(st)

      if (st === 'open') {
        reconnectAttempt = 0
        reauthNotified = false
        clearReconnectTimer()

        // A revalidate-driven reconnect can rebuild the backend in place when the
        // cached remote was found dead, which re-drives the boot-progress overlay.
        // Unlike the initial boot, nothing calls completeDesktopBoot() afterwards,
        // so dismiss it here once we're open again — otherwise the overlay sticks
        // at ~94%. A no-op on a normal (non-rebuild) reconnect.
        if (bootCompleted) {
          completeDesktopBoot()
        }
      } else if (bootCompleted && (st === 'closed' || st === 'error')) {
        // The socket dropped after a healthy boot (typically sleep/wake). Try
        // to bring it back instead of leaving the composer stuck disabled.
        scheduleReconnect()
      }
    })

    const offEvent = gateway.onEvent(event => callbacksRef.current.handleGatewayEvent(event))

    // Wake signals: power resume (macOS/Windows), network coming back, and the
    // window regaining focus/visibility. Each nudges an immediate reconnect.
    const offPowerResume = desktop.onPowerResume?.(() => reconnectNow())

    const onOnline = () => reconnectNow()

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        reconnectNow()
      }
    }

    window.addEventListener('online', onOnline)
    document.addEventListener('visibilitychange', onVisible)

    // Keep live pool backends alive while this window is open (the main process
    // can't observe the direct renderer↔backend WS). No-op for the primary.
    const keepaliveTimer = setInterval(() => {
      touchActiveGatewayBackend()
      touchSecondaryGateways()
    }, 60_000)

    // Bound concurrency cost to live work: keep a background socket only while
    // its profile has a running (working) or blocked (needs-input) session.
    // Once that profile goes idle its socket is dropped and its backend is free
    // to idle-reap. The active profile is always spared.
    const recomputeKeptGateways = () => {
      const live = new Set([...$workingSessionIds.get(), ...$attentionSessionIds.get()])
      const keep = new Set<string>()

      for (const session of $sessions.get()) {
        if (live.has(session.id)) {
          keep.add(normalizeProfileKey(session.profile))
        }
      }

      pruneSecondaryGateways(keep)
    }

    const offWorking = $workingSessionIds.subscribe(() => recomputeKeptGateways())
    const offAttention = $attentionSessionIds.subscribe(() => recomputeKeptGateways())
    const offActiveProfile = $activeGatewayProfile.subscribe(() => recomputeKeptGateways())

    const offWindowState = desktop.onWindowStateChanged?.(payload => {
      const current = $connection.get()

      if (current) {
        publish({ ...current, ...payload })
      }
    })

    const offExit = desktop.onBackendExit(() => {
      if ($desktopBoot.get().running || $desktopBoot.get().visible) {
        failDesktopBoot(translateNow('boot.errors.backgroundExitedDuringStartup'))
      }

      notify({
        kind: 'error',
        title: translateNow('boot.errors.backendStopped'),
        message: translateNow('boot.errors.backgroundExited'),
        durationMs: 0
      })
    })

    async function boot() {
      // Transport-race gate: only failures AFTER getConnection resolved are
      // retried. A getConnection rejection means bootstrap/remote wait failed
      // (45s timeout against a dead VPS) — retrying multiplies the wait and
      // delays the failure overlay; fail fast as before.
      let connResolved = false

      try {
        const conn = await desktop.getConnection()
        connResolved = true

        if (cancelled) {
          return
        }

        setDesktopBootStep({
          phase: 'renderer.gateway.connect',
          message: translateNow('boot.steps.connectingGateway'),
          progress: 95
        })
        publish(conn)
        // Mint a fresh WS URL right before connecting. For OAuth gateways the
        // ticket is single-use with a short TTL, so the ticket baked into
        // conn.wsUrl is stale; resolveGatewayWsUrl() re-mints it and, on
        // failure, throws a reauth error rather than connecting with a dead
        // ticket (which would surface as an opaque "connection closed").
        const wsUrl = await resolveGatewayWsUrl(desktop, conn)
        await gateway.connect(wsUrl)

        if (cancelled) {
          return
        }

        // Record which profile the primary (window) backend booted as, so
        // same-profile resumes are no-op swaps and any reconnect targets the
        // right backend. Best-effort: a missing preference means "default".
        try {
          const pref = await desktop.profile?.get?.()
          const profileKey = (pref?.profile ?? '').trim() || 'default'
          $activeGatewayProfile.set(profileKey)
          setPrimaryGateway(gateway, profileKey)
          void ensureGatewayForProfile(profileKey)
        } catch {
          $activeGatewayProfile.set('default')
        }

        setDesktopBootStep({
          phase: 'renderer.config',
          message: translateNow('boot.steps.loadingSettings'),
          progress: 97
        })
        await ensureDefaultWorkspaceCwd()
        const remoteDefault = await desktopDefaultCwd().catch(() => null)
        if (remoteDefault?.cwd && !$activeSessionId.get() && !$currentCwd.get()) {
          setCurrentCwd(remoteDefault.cwd)
          setCurrentBranch(remoteDefault.branch || '')
        }
        await callbacksRef.current.refreshHermesConfig()

        if (cancelled) {
          return
        }

        setDesktopBootStep({
          phase: 'renderer.sessions',
          message: translateNow('boot.steps.loadingSessions'),
          progress: 99
        })
        await callbacksRef.current.refreshSessions()
        completeDesktopBoot()
        bootCompleted = true
      } catch (err) {
        if (!cancelled) {
          // 登出→重新登录链路：reload 后 boot 可能撞上后端重启竞态（旧后端被
          // SIGTERM、新后端端口未就绪），一次失败就 failDesktopBoot 会把失败
          // 层永久钉死在登录页下面（boot 无重试、唤醒信号全部 no-op），用户
          // 只能重启客户端。改为有界自动重试：1s/2s/4s 退避重跑整个 boot，
          // 任一次成功即自愈；重试期间保持 boot 进度态（连接遮罩）而非失败态。
          // 仅重试传输竞态类失败（getConnection 已成功后的 WS 拨号失败）。
          if (connResolved && bootRetryCount < BOOT_MAX_RETRIES) {
            bootRetryCount += 1
            const delay = 1_000 * 2 ** (bootRetryCount - 1)
            console.warn(`[boot] attempt ${bootRetryCount}/${BOOT_MAX_RETRIES} failed; retrying in ${delay}ms`, err)
            bootRetryTimer = setTimeout(() => {
              bootRetryTimer = null
              void boot()
            }, delay)
            return
          }

          const message = err instanceof Error ? err.message : String(err)
          // 计划内拆除（登出/切档reload）：主进程已经或马上要 reload 窗口，
          // 这里锁失败层只会闪现一下被 reload 收掉。保持 boot 进度态静默
          // 等待 reload 即可。
          const planned = (err as { plannedTeardown?: boolean } | null)?.plannedTeardown === true
          if (planned) {
            console.warn('[boot] backend torn down (planned); waiting for reload')
            return
          }
          failDesktopBoot(message)
          notifyError(err, translateNow('boot.errors.desktopBootFailed'))
          setSessionsLoading(false)
          // 失败态自愈：快速重试耗尽 ≠ 终态。后台重启竞态的窗口比快速
          // 重试链长，钉死会让用户面对失败层干等。15s 后自动重跑完整
          // boot（重置快速重试预算），有界 3 轮。成功路径 completeDesktopBoot
          // 已收失败层，无需在此清计数。与快速重试同 gate：仅传输竞态类
          // 失败（getConnection 已成功后的 WS 拨号失败）；getConnection
          // 拒绝（死 VPS / bootstrap 失败）维持 fail-fast 不重试。
          if (connResolved && bootSlowRetryCount < BOOT_MAX_SLOW_RETRIES) {
            bootSlowRetryCount += 1
            console.warn(`[boot] fatal; slow auto-retry ${bootSlowRetryCount}/${BOOT_MAX_SLOW_RETRIES} in ${BOOT_SLOW_RETRY_DELAY_MS}ms`)
            bootRetryTimer = setTimeout(() => {
              bootRetryTimer = null
              bootRetryCount = 0
              void boot()
            }, BOOT_SLOW_RETRY_DELAY_MS)
          }
        }
      }
    }

    if (wantBoot) {
      void boot()
    }

    return () => {
      cancelled = true
      authUnsub?.()
      clearReconnectTimer()
      if (bootRetryTimer !== null) {
        clearTimeout(bootRetryTimer)
        bootRetryTimer = null
      }
      clearInterval(keepaliveTimer)
      offWorking()
      offAttention()
      offActiveProfile()
      window.removeEventListener('online', onOnline)
      document.removeEventListener('visibilitychange', onVisible)
      offPowerResume?.()
      offState()
      offEvent()
      offExit()
      offWindowState?.()
      offBootProgress()
      closeSecondaryGateways()
      gateway.close()
      publish(null)
      callbacksRef.current.onGatewayReady(null)
      setPrimaryGateway(null)
      $gateway.set(null)
    }
  }, [])
}
