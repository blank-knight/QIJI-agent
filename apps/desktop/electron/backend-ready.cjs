const _READY_RE = /^HERMES_DASHBOARD_READY port=(\d+)/m

// The announcement clock starts the instant the backend process is spawned —
// before uvicorn binds its socket. On a cold install the child must first
// compile and import the whole `hermes_cli.main` → `web_server` → FastAPI/
// uvicorn chain, and on Windows real-time AV (Defender) scans every freshly
// written `.pyc`. That pre-bind cost can run 30-60s on a slow disk, so a tight
// 45s deadline kills a *healthy but still-starting* backend and respawns it,
// piling up orphaned processes (issue #50209). A roomier default absorbs the
// cold-start cost; a warm start still announces in well under a second.
const DEFAULT_PORT_ANNOUNCE_TIMEOUT_MS = 90_000
// qiji 0.17.7: 冷启动(重铺运行时后的第一次启动)默认 300s。公司机案例: 首启要
// 编译+AV扫描全部新写的 .pyc,90s 到点杀掉了健康但还在初始化的后端,弹"启动失败"
// 吓用户。warm start 不受影响(1s 内报端口)。判定: bootstrap marker 的 completedAt
// 在 10 分钟内 = 冷启动窗口。
const COLD_START_PORT_ANNOUNCE_TIMEOUT_MS = 300_000
// Never trust a deadline tighter than the warm-start path needs; floor at 45s
// (the historical default) so a malformed override can't reintroduce the loop.
const MIN_PORT_ANNOUNCE_TIMEOUT_MS = 45_000

/**
 * Resolve the port-announcement deadline. Honors the
 * HERMES_DESKTOP_PORT_ANNOUNCE_TIMEOUT_MS env override (for users on slow
 * disks / aggressive AV who need an even longer cold-start window), clamped
 * to a sane floor so a bad value can't make boot flakier than the default.
 */
function resolvePortAnnounceTimeoutMs(env = process.env, coldStart = false) {
  const parsed = Number(env.HERMES_DESKTOP_PORT_ANNOUNCE_TIMEOUT_MS)
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.max(MIN_PORT_ANNOUNCE_TIMEOUT_MS, Math.round(parsed))
  }
  return coldStart ? COLD_START_PORT_ANNOUNCE_TIMEOUT_MS : DEFAULT_PORT_ANNOUNCE_TIMEOUT_MS
}

// qiji 0.17.7: 冷启动判定——bootstrap marker 的 completedAt 距今 < 10 分钟。
// 由 main.cjs 调用(它有 readBootstrapMarker);backend-ready 自身不读文件系统,
// 保持模块纯粹(只接收布尔)。
function detectColdStartWindow(marker, nowMs = Date.now()) {
  if (!marker || typeof marker !== 'object' || !marker.completedAt) return false
  const t = Date.parse(marker.completedAt)
  if (!Number.isFinite(t)) return false
  return (nowMs - t) < 10 * 60 * 1000
}

/**
 * Watch a child process's stdout for the `HERMES_DASHBOARD_READY port=<N>`
 * line that web_server.py prints after uvicorn binds its socket.
 *
 * Returns the parsed port. Rejects if:
 *   - the child exits before emitting the line
 *   - the child emits an `error` event
 *   - no line arrives within the timeout
 *
 * The default timeout is cold-start tolerant (see
 * DEFAULT_PORT_ANNOUNCE_TIMEOUT_MS) because the clock starts before the
 * backend has even bound its port. Pass an explicit `timeoutMs` to override.
 *
 * A single `cleanup()` tears down every listener (data/exit/error/timeout)
 * on every terminal path — resolve, reject, or timeout — so repeated
 * backend spawns don't leak listener slots on the child.
 */
function waitForDashboardPort(child, timeoutMs = resolvePortAnnounceTimeoutMs()) {
  return new Promise((resolve, reject) => {
    let buf = ''
    let done = false

    function cleanup() {
      if (done) return
      done = true
      clearTimeout(timer)
      child.stdout.off('data', onData)
      child.off('exit', onExit)
      child.off('error', onError)
    }

    function onData(chunk) {
      buf += chunk.toString()
      let nl
      while ((nl = buf.indexOf('\n')) !== -1) {
        const line = buf.slice(0, nl)
        buf = buf.slice(nl + 1)
        const m = line.match(_READY_RE)
        if (m) {
          cleanup()
          resolve(parseInt(m[1], 10))
          return
        }
      }
    }

    function onExit(code, signal) {
      cleanup()
      reject(new Error(`奇计后端：异常退出 before port announcement (${signal || code})`))
    }

    function onError(err) {
      cleanup()
      reject(err)
    }

    const timer = setTimeout(() => {
      cleanup()
      reject(new Error(`等待奇计后端超时 port announcement (${timeoutMs}ms)`))
    }, timeoutMs)

    child.stdout.on('data', onData)
    child.on('exit', onExit)
    child.on('error', onError)
  })
}

module.exports = {
  waitForDashboardPort,
  resolvePortAnnounceTimeoutMs,
  detectColdStartWindow,
  DEFAULT_PORT_ANNOUNCE_TIMEOUT_MS,
  MIN_PORT_ANNOUNCE_TIMEOUT_MS,
}
