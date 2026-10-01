import type { ConnectionSummary } from "@oco/contracts"
import type { PendingRequest, ServerEvent, ServerSession, ServerStatus, SessionStore } from "./session-store"

/**
 * One host-side event stream per window for the native sidebar and status bar (the chat panels keep
 * their own streams through the bridge). No vscode dependency: all I/O is injected, for unit tests.
 *
 * Connect = open `/event` (scoped to the workspace directory), buffer its events, load a snapshot,
 * apply it, replay the buffer. Only one attempt is live at a time: every trigger (retry button,
 * config change, stall watchdog, stream end) bumps a token and aborts the previous attempt, so
 * reconnects never overlap or double-apply. Backoff is capped; 401 stops until credentials change.
 */

export type FeedDeps = {
  fetch: typeof fetch
  /** Throws a user-facing error if the endpoint is not configured/valid. */
  endpoint: () => { origin: string; connectionId: string }
  auth: () => Promise<Record<string, string>>
  directory: () => string | undefined
  trusted: () => boolean
  store: SessionStore
  onChange: () => void
  onState: (s: ConnectionSummary) => void
  log?: (msg: string) => void
  now?: () => number
  setTimer?: (fn: () => void, ms: number) => unknown
  clearTimer?: (t: unknown) => void
  /** Server heartbeats every 10 s; no bytes for this long means the stream is dead. */
  stallMs?: number
  random?: () => number
}

class HttpError extends Error {
  constructor(readonly status: number, what: string) {
    super(`${what}: HTTP ${status}`)
  }
}

/** Offline and wrong-server failures read differently from bad settings (invalid URL) and 401 (auth). */
function describeFailure(e: unknown) {
  if (e instanceof HttpError) return `Server returned HTTP ${e.status} (${e.message.split(":")[0]}). The address may not be an OpenCode server`
  const m = (e as Error)?.message ?? String(e)
  return /^Event stream/.test(m) ? m : `Cannot reach the server (offline or wrong address/port): ${m}`
}

/** Incremental text/event-stream parser: returns the JSON `data` payload of each complete event. */
export class SseParser {
  private buf = ""
  private data: string[] = []
  push(chunk: string): ServerEvent[] {
    this.buf += chunk
    const out: ServerEvent[] = []
    let nl: number
    while ((nl = this.buf.indexOf("\n")) >= 0) {
      let line = this.buf.slice(0, nl)
      this.buf = this.buf.slice(nl + 1)
      if (line.endsWith("\r")) line = line.slice(0, -1)
      if (line === "") {
        if (this.data.length) {
          try {
            const e = JSON.parse(this.data.join("\n"))
            if (e && typeof e.type === "string") out.push(e)
          } catch {
            // ignore malformed event
          }
        }
        this.data = []
      } else if (line.startsWith("data:")) this.data.push(line.slice(5).replace(/^ /, ""))
    }
    return out
  }
}

export class SessionFeed {
  static readonly ROOT_LIMIT = 200
  private token = 0
  private abort: AbortController | undefined
  private retryTimer: unknown
  private stallTimer: unknown
  private stopped = true
  private summary: ConnectionSummary = { connectionId: null, label: "", directory: null, state: "unconfigured", attempt: 0, trusted: true }
  readonly stats = { attempts: 0, connects: 0, superseded: 0, stalls: 0 }

  constructor(private readonly d: FeedDeps) {}

  get state() {
    return this.summary
  }

  start() {
    this.stopped = false
    this.connect()
  }

  stop() {
    this.stopped = true
    this.token++
    this.abort?.abort()
    this.clear()
  }

  /** Manual retry / credentials or configuration changed: reconnect now, reset backoff. */
  restart() {
    this.stopped = false
    this.summary = { ...this.summary, attempt: 0 }
    this.connect()
  }

  private now() {
    return (this.d.now ?? Date.now)()
  }
  private timer(fn: () => void, ms: number) {
    return (this.d.setTimer ?? ((f, m) => setTimeout(f, m)))(fn, ms)
  }
  private clearT(t: unknown) {
    if (t !== undefined) (this.d.clearTimer ?? ((x) => clearTimeout(x as ReturnType<typeof setTimeout>)))(t)
  }
  private clear() {
    this.clearT(this.retryTimer)
    this.clearT(this.stallTimer)
    this.retryTimer = this.stallTimer = undefined
  }

  private set(patch: Partial<ConnectionSummary>) {
    this.summary = { ...this.summary, ...patch, trusted: this.d.trusted() }
    this.d.onState(this.summary)
  }

  private connect() {
    if (this.stopped) return
    if (this.abort) this.stats.superseded++
    this.abort?.abort()
    this.clear()
    const token = ++this.token
    const abort = (this.abort = new AbortController())
    let ep: { origin: string; connectionId: string }
    const directory = this.d.directory()
    try {
      ep = this.d.endpoint()
    } catch (e) {
      return this.set({ state: "unconfigured", issue: "endpoint", error: (e as Error).message, connectionId: null, label: "", directory: directory ?? null })
    }
    if (!directory) return this.set({ state: "unconfigured", issue: "folder", error: "Open a workspace folder first", connectionId: ep.connectionId, label: ep.origin, directory: null })
    if (this.summary.connectionId !== ep.connectionId || this.summary.directory !== directory) {
      // Another server or workspace: never show the previous one's sessions, even while connecting.
      this.d.store.applySnapshot({ sessions: [], status: {}, permissions: [], questions: [] })
      this.summary = { ...this.summary, lastConnectedAt: undefined, attempt: 0 }
      this.d.onChange()
    }
    const had = this.summary.lastConnectedAt !== undefined
    this.set({ state: had ? "reconnecting" : "connecting", issue: undefined, error: undefined, retryAt: undefined, connectionId: ep.connectionId, label: ep.origin, directory })
    this.stats.attempts++
    void this.run(token, abort, ep, directory).catch((e) => {
      if (token !== this.token) return
      if (e instanceof HttpError && e.status === 401) {
        this.d.log?.(`feed: unauthorized`)
        // A 401 can also come from a snapshot request while /event is open: close it and its
        // watchdog, otherwise it keeps buffering and its end or stall would retry anyway.
        abort.abort()
        this.abort = undefined
        this.clear()
        return this.set({ state: "unauthorized", error: `Authentication failed (${ep.origin}): the username or password is incorrect. Run “oco: Set Server Password”, or check the username in Settings`, retryAt: undefined })
      }
      this.fail(token, e)
    })
  }

  private fail(token: number, e: unknown) {
    if (token !== this.token || this.stopped) return
    this.abort?.abort()
    this.abort = undefined
    this.clear()
    const attempt = this.summary.attempt + 1
    const base = Math.min(30000, 1000 * 2 ** Math.min(attempt - 1, 5))
    const delay = Math.round(base * (0.8 + 0.4 * (this.d.random ?? Math.random)()))
    const msg = describeFailure(e)
    this.d.log?.(`feed: attempt ${attempt} failed (${msg}); retry in ${delay} ms`)
    const had = this.summary.lastConnectedAt !== undefined
    this.set({ state: had ? "reconnecting" : "error", error: msg, attempt, retryAt: this.now() + delay })
    this.retryTimer = this.timer(() => {
      if (token === this.token) this.connect()
    }, delay)
  }

  private async run(token: number, abort: AbortController, ep: { origin: string }, directory: string) {
    const headers = { ...(await this.d.auth()), "x-opencode-directory": encodeURIComponent(directory) }
    const res = await this.d.fetch(ep.origin + "/event", { headers: { ...headers, accept: "text/event-stream" }, signal: abort.signal, redirect: "manual" })
    if (!res.ok || !res.body) throw new HttpError(res.status, "GET /event")
    const buffered: ServerEvent[] = []
    let live = false
    const parser = new SseParser()
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    const armStall = () => {
      if (token !== this.token || abort.signal.aborted) return
      this.clearT(this.stallTimer)
      this.stallTimer = this.timer(() => {
        if (token !== this.token) return
        this.stats.stalls++
        this.fail(token, new Error("Event stream has no heartbeat"))
      }, this.d.stallMs ?? 35000)
    }
    armStall()
    const pump = (async () => {
      for (;;) {
        const { done, value } = await reader.read()
        if (token !== this.token || abort.signal.aborted) return
        if (done) throw new Error("Event stream ended")
        armStall()
        for (const e of parser.push(decoder.decode(value, { stream: true }))) {
          if (!live) buffered.push(e)
          else if (this.d.store.applyEvent(e)) this.d.onChange()
        }
      }
    })()
    pump.catch((e) => {
      if (!abort.signal.aborted) this.fail(token, e)
    })
    const get = async <T>(path: string): Promise<T> => {
      const r = await this.d.fetch(ep.origin + path, { headers, signal: abort.signal, redirect: "manual" })
      if (!r.ok) throw new HttpError(r.status, `GET ${path}`)
      return (await r.json()) as T
    }
    // `directory` as a query filters to this directory (the header only selects the instance);
    // /session/status lists non-idle sessions only; the server's default page is 100.
    const q = `directory=${encodeURIComponent(directory)}`
    const [roots, status, permissions, questions] = await Promise.all([
      get<ServerSession[]>(`/session?${q}&roots=true&limit=${SessionFeed.ROOT_LIMIT}`),
      get<Record<string, ServerStatus>>(`/session/status?${q}`),
      get<PendingRequest[]>(`/permission?${q}`),
      get<PendingRequest[]>(`/question?${q}`),
    ])
    // Child sessions (subagents) that are running or waiting fold into their root: fetch the chain.
    const sessions = new Map((roots ?? []).map((s) => [s.id, s]))
    let missing = [...Object.keys(status ?? {}), ...(permissions ?? []).map((p) => p.sessionID), ...(questions ?? []).map((p) => p.sessionID)]
    for (let depth = 0; depth < 4 && missing.length; depth++) {
      const ids = [...new Set(missing)].filter((id) => !sessions.has(id)).slice(0, 50)
      const got = await Promise.all(ids.map((id) => get<ServerSession>(`/session/${encodeURIComponent(id)}?${q}`).catch(() => undefined)))
      missing = []
      for (const s of got) {
        if (!s?.id) continue
        sessions.set(s.id, s)
        if (s.parentID) missing.push(s.parentID)
      }
    }
    if (token !== this.token) return
    this.d.store.applySnapshot({ sessions: [...sessions.values()], status: status ?? {}, permissions: permissions ?? [], questions: questions ?? [], rootLimitReached: (roots ?? []).length >= SessionFeed.ROOT_LIMIT })
    for (const e of buffered.splice(0)) this.d.store.applyEvent(e)
    live = true
    this.stats.connects++
    this.set({ state: "connected", error: undefined, attempt: 0, retryAt: undefined, lastConnectedAt: this.now() })
    this.d.onChange()
  }
}
