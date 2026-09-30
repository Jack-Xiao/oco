// Controllable transparent HTTP proxy for reconnect tests (node:http + node:net only).
// Listens on a random 127.0.0.1 port and forwards to the isolated test server. It never touches any other
// server. Knobs: cutStreams() destroys open /event streams, refuse(on) rejects new connections and requests,
// stall(on) keeps /event streams open but stops forwarding bytes. Counters: /event connections and snapshot requests.
//
// While healthy the proxy also writes an SSE comment into every /event stream once a second (only between two
// complete events), so a short client-side stall watchdog does not fire on the real server's 10 s heartbeat gap.
// A stalled stream gets neither events nor these keepalives.
import http from "node:http"

export async function startProxy({ target = "http://127.0.0.1:4517", keepaliveMs = 1000 } = {}) {
  const up = new URL(target)
  const sockets = new Set()
  const streams = new Set() // live /event streams
  const stats = { eventConnections: 0, snapshotRequests: 0, requests: 0, refusedConnections: 0, refusedRequests: 0, cuts: 0, stalledClosedByClient: 0 }
  let refusing = false
  // Optional fixtures: intercept(fn) with fn(method, url) -> {status?, json} answers a request locally instead of
  // forwarding it. None registered by default, so existing suites see a transparent proxy.
  const intercepts = []
  let stallNew = false
  const waiters = []

  const server = http.createServer((req, res) => {
    if (refusing) {
      stats.refusedRequests++
      req.socket.destroy()
      return
    }
    stats.requests++
    const url = new URL(req.url, "http://proxy")
    for (const fn of intercepts) {
      const hit = fn(req.method, url)
      if (!hit) continue
      stats.intercepted = (stats.intercepted ?? 0) + 1
      const body = JSON.stringify(hit.json)
      res.writeHead(hit.status ?? 200, { "content-type": "application/json", "content-length": Buffer.byteLength(body) })
      res.end(body)
      req.resume()
      return
    }
    const isEvent = req.method === "GET" && url.pathname === "/event"
    // A session-list snapshot is exactly GET /session?...&roots=true (the sidebar feed's first request).
    if (req.method === "GET" && url.pathname === "/session" && url.searchParams.get("roots") === "true") stats.snapshotRequests++
    const headers = { ...req.headers, host: up.host }
    delete headers.connection
    const out = http.request({ host: up.hostname, port: up.port, method: req.method, path: req.url, headers, agent: false }, (ures) => {
      const h = { ...ures.headers }
      delete h.connection
      delete h["keep-alive"]
      res.writeHead(ures.statusCode ?? 502, h)
      if (!isEvent) return void ures.pipe(res)
      const st = { req, res, ures, out, stalled: stallNew, tailOk: true, timer: undefined, closedByProxy: false }
      streams.add(st)
      stats.eventConnections++
      ures.on("data", (chunk) => {
        if (st.stalled) return
        st.tailOk = chunk.length >= 2 && chunk[chunk.length - 1] === 10 && chunk[chunk.length - 2] === 10
        res.write(chunk)
      })
      st.timer = setInterval(() => {
        if (!st.stalled && st.tailOk && !res.destroyed) res.write(": proxy-keepalive\n\n")
      }, keepaliveMs)
      const done = () => {
        clearInterval(st.timer)
        if (!streams.delete(st)) return
        if (st.stalled && !st.closedByProxy) {
          stats.stalledClosedByClient++
          for (const w of waiters.splice(0)) w()
        }
        out.destroy()
        res.destroy()
      }
      res.on("close", done)
      ures.on("close", () => {
        if (!st.stalled) res.end()
      })
      ures.on("error", done)
    })
    out.on("error", () => {
      if (!res.headersSent) res.writeHead(502)
      res.end()
    })
    req.pipe(out)
    req.on("aborted", () => out.destroy())
  })
  server.on("connection", (s) => {
    if (refusing) {
      stats.refusedConnections++
      s.destroy()
      return
    }
    sockets.add(s)
    s.on("close", () => sockets.delete(s))
  })
  await new Promise((r) => server.listen(0, "127.0.0.1", r))
  const port = server.address().port

  function killStream(st) {
    st.closedByProxy = true
    st.res.destroy()
    st.out.destroy()
  }

  return {
    url: `http://127.0.0.1:${port}`,
    port,
    stats,
    /** Answer matching requests locally (test fixture). Returns a function that removes the interceptor. */
    intercept(fn) {
      intercepts.push(fn)
      return () => void intercepts.splice(intercepts.indexOf(fn), 1)
    },
    /** Destroy every in-flight /event stream (the client sees the connection drop). */
    cutStreams() {
      stats.cuts += streams.size
      for (const st of [...streams]) killStream(st)
    },
    /** on=true: drop every open connection and reject all new ones until refuse(false). */
    refuse(on) {
      refusing = !!on
      if (refusing) for (const s of [...sockets]) s.destroy()
    },
    /**
     * on=true: /event streams that are open now stay open but no longer forward anything (no events, no
     * keepalives). includeNew=true also stalls streams opened while this is on. on=false clears it and
     * lets stalled streams flow again.
     */
    stall(on, { includeNew = false } = {}) {
      stallNew = !!on && includeNew
      for (const st of streams) st.stalled = !!on
    },
    /** Resolves when the client closed a stalled stream itself (its watchdog fired), false on timeout. */
    stalledClosedByClient(ms = 30000) {
      const before = stats.stalledClosedByClient
      if (before > 0) return Promise.resolve(true)
      return new Promise((resolve) => {
        const t = setTimeout(() => resolve(false), ms)
        waiters.push(() => {
          clearTimeout(t)
          resolve(true)
        })
      })
    },
    /** Snapshot of the counters plus currently open /event streams. */
    counters: () => ({ eventConnections: stats.eventConnections, snapshotRequests: stats.snapshotRequests, openStreams: streams.size }),
    resetStalledCounter() {
      stats.stalledClosedByClient = 0
    },
    async close() {
      refusing = false
      for (const st of [...streams]) killStream(st)
      for (const s of [...sockets]) s.destroy()
      await new Promise((r) => server.close(r))
    },
  }
}
