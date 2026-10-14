import type { ConnectionSummary } from "@oco/contracts"
import type { PendingRequest, ServerEvent, ServerSession, ServerStatus, ServerTodo, SessionStore } from "./session-store"

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
  roots?: () => string[]
  sameDirectory?: (a: string, b: string) => boolean
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

export type GlobalEvent = {
  directory?: string
  project?: unknown
  workspace?: unknown
  payload: ServerEvent
}

/** Incremental text/event-stream parser: returns the JSON `data` payload of each complete event. */
export class SseParser {
  private buf = ""
  private data: string[] = []
  push(chunk: string): Array<ServerEvent | GlobalEvent> {
    this.buf += chunk
    const out: Array<ServerEvent | GlobalEvent> = []
    let nl: number
    while ((nl = this.buf.indexOf("\n")) >= 0) {
      let line = this.buf.slice(0, nl)
      this.buf = this.buf.slice(nl + 1)
      if (line.endsWith("\r")) line = line.slice(0, -1)
      if (line === "") {
        if (this.data.length) {
          try {
            const e = JSON.parse(this.data.join("\n"))
            if (e && (typeof e.type === "string" || (e.payload && typeof e.payload === "object" && typeof e.payload.type === "string"))) {
              out.push(e)
            }
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
  static readonly PAGE = 100
  static readonly TODO_CONCURRENCY = 4
  private token = 0
  private abort: AbortController | undefined
  private retryTimer: unknown
  private stallTimer: unknown
  private stopped = true
  /** How many root sessions the next snapshot asks for. Grows by a page on load-more; a reconnect keeps it. */
  private rootLimit = SessionFeed.PAGE
  private summary: ConnectionSummary = { connectionId: null, label: "", directory: null, state: "unconfigured", attempt: 0, trusted: true }
  readonly stats = { attempts: 0, connects: 0, superseded: 0, stalls: 0 }
  private todoEpoch = 0
  private todoFetched = new Set<string>()
  private todoQueue: Array<() => Promise<void>> = []
  private todoRunning = 0
  private activeContext?: {
    token: number
    get: <T>(path: string) => Promise<T>
    abort: AbortController
    origin: string
  }

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
    this.activeContext = undefined
    this.todoQueue = []
    this.todoRunning = 0
    this.clear()
  }

  /** Manual retry / credentials or configuration changed: reconnect now, reset backoff. */
  restart() {
    this.stopped = false
    this.summary = { ...this.summary, attempt: 0 }
    this.connect()
  }

  /** Next page of root sessions. No cursor: re-request the same list with a larger limit. */
  async loadMore(): Promise<void> {
    if (this.stopped || this.summary.state !== "connected") return
    this.rootLimit += SessionFeed.PAGE
    const limit = this.rootLimit
    const list = await this.fetchRoots(`limit=${limit}`)
    if (!list) return
    this.d.store.mergeRoots(list, list.length >= limit)
    this.d.onChange()
  }

  /** Title search across the whole history. Does not change `limitReached`. */
  async search(q: string): Promise<void> {
    if (this.stopped || this.summary.state !== "connected" || q.trim() === "") return
    const list = await this.fetchRoots(`search=${encodeURIComponent(q)}&limit=${SessionFeed.PAGE}`)
    if (!list) return
    if (this.d.store.mergeRoots(list)) this.d.onChange()
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
    this.activeContext = undefined
    this.todoQueue = []
    this.todoRunning = 0
    this.clear()
    const token = ++this.token
    this.todoEpoch = token
    this.todoFetched.clear()
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
      this.rootLimit = SessionFeed.PAGE
      this.d.onChange()
    }
    const had = this.summary.lastConnectedAt !== undefined
    this.set({ state: had ? "reconnecting" : "connecting", issue: undefined, error: undefined, retryAt: undefined, connectionId: ep.connectionId, label: ep.origin, directory })
    this.stats.attempts++
    void this.run(token, abort, ep, directory).catch((e) => {
      if (token !== this.token) return
      if (e instanceof HttpError && e.status === 401) {
        return this.handleUnauthorized(ep.origin, abort)
      }
      this.fail(token, e)
    })
  }

  private handleUnauthorized(origin: string, abort: AbortController) {
    this.d.log?.(`feed: unauthorized`)
    abort.abort()
    this.abort = undefined
    this.activeContext = undefined
    this.todoQueue = []
    this.todoRunning = 0
    this.clear()
    this.set({ state: "unauthorized", error: `Authentication failed (${origin}): the username or password is incorrect. Run “oco: Set Server Password”, or check the username in Settings`, retryAt: undefined })
  }

  private fail(token: number, e: unknown) {
    if (token !== this.token || this.stopped) return
    this.abort?.abort()
    this.abort = undefined
    this.activeContext = undefined
    this.todoQueue = []
    this.todoRunning = 0
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

  private isSameDirectory(a: string, b: string): boolean {
    if (this.d.sameDirectory) return this.d.sameDirectory(a, b)
    const norm = (p: string) => {
      let s = p.trim()
      while (s.length > 1 && (s.endsWith("/") || s.endsWith("\\"))) {
        s = s.slice(0, -1)
      }
      return s
    }
    return norm(a) === norm(b)
  }

  private getRoots(directory: string): string[] {
    const raw = this.d.roots ? this.d.roots() : [directory]
    const out: string[] = []
    const list = [directory, ...(raw ?? [])].filter((r): r is string => typeof r === "string" && r.length > 0)
    for (const r of list) {
      if (!out.some((existing) => this.isSameDirectory(existing, r))) {
        out.push(r)
      }
    }
    return out.length > 0 ? out : [directory]
  }

  private inRoots(dir: string, roots: string[]): boolean {
    return roots.some((r) => this.isSameDirectory(r, dir))
  }

  private async run(token: number, abort: AbortController, ep: { origin: string }, directory: string) {
    const headers = { ...(await this.d.auth()), "x-opencode-directory": encodeURIComponent(directory) }
    let isGlobal = true
    let res = await this.d.fetch(ep.origin + "/global/event", { headers: { ...headers, accept: "text/event-stream" }, signal: abort.signal, redirect: "manual" })
    if (res.status === 404) {
      isGlobal = false
      res = await this.d.fetch(ep.origin + "/event", { headers: { ...headers, accept: "text/event-stream" }, signal: abort.signal, redirect: "manual" })
    }
    if (!res.ok || !res.body) throw new HttpError(res.status, isGlobal ? "GET /global/event" : "GET /event")
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
    const get = async <T>(path: string): Promise<T> => {
      const r = await this.d.fetch(ep.origin + path, { headers, signal: abort.signal, redirect: "manual" })
      if (!r.ok) throw new HttpError(r.status, `GET ${path}`)
      return (await r.json()) as T
    }
    this.activeContext = { token, get, abort, origin: ep.origin }

    const handleEvent = (e: ServerEvent): boolean => {
      const changed = this.d.store.applyEvent(e)
      if (e.type === "session.status") {
        const p = e.properties as Record<string, any> | undefined
        const sid = typeof p?.sessionID === "string" ? p.sessionID : undefined
        if (sid && p?.status?.type === "busy" && !this.d.store.hasTodo(sid)) {
          this.ensureTodo(sid)
        }
      }
      return changed
    }

    const rootDirs = this.getRoots(directory)
    const inRoots = (dir: string) => this.inRoots(dir, rootDirs)

    armStall()
    const pump = (async () => {
      for (;;) {
        const { done, value } = await reader.read()
        if (token !== this.token || abort.signal.aborted) return
        if (done) throw new Error("Event stream ended")
        armStall()
        for (const raw of parser.push(decoder.decode(value, { stream: true }))) {
          let e: ServerEvent
          if (isGlobal && raw && typeof raw === "object" && "payload" in raw && raw.payload) {
            const globalEvent = raw as { directory?: string; payload: ServerEvent }
            if (typeof globalEvent.directory === "string" && !inRoots(globalEvent.directory)) {
              continue
            }
            if (globalEvent.payload.type === "sync") {
              continue
            }
            e = globalEvent.payload
          } else if (raw && typeof (raw as any).type === "string") {
            e = raw as ServerEvent
          } else {
            continue
          }
          if (!live) buffered.push(e)
          else if (handleEvent(e)) this.d.onChange()
        }
      }
    })()
    pump.catch((e) => {
      if (!abort.signal.aborted) this.fail(token, e)
    })
    // `directory` as a query filters to this directory (the header only selects the instance); `scope=project`
    // widens the list to the project's worktrees (patches/opencode/0023), which the store keeps only when the
    // workspace owns them (Connection.roots). /session/status lists non-idle sessions only; the server's default
    // page is 100.
    const sessionRootsPromise = get<ServerSession[]>(
      `/session?directory=${encodeURIComponent(directory)}&scope=project&roots=true&limit=${this.rootLimit}`,
    )

    const dirResultsPromises = rootDirs.map(async (d) => {
      const isWs = this.isSameDirectory(d, directory)
      const qDir = `directory=${encodeURIComponent(d)}`
      if (isWs) {
        const [st, perm, ques] = await Promise.all([
          get<Record<string, ServerStatus>>(`/session/status?${qDir}`),
          get<PendingRequest[]>(`/permission?${qDir}`),
          get<PendingRequest[]>(`/question?${qDir}`),
        ])
        return { d, status: st ?? {}, permissions: perm ?? [], questions: ques ?? [] }
      } else {
        const [st, perm, ques] = await Promise.all([
          get<Record<string, ServerStatus>>(`/session/status?${qDir}`).catch(() => ({} as Record<string, ServerStatus>)),
          get<PendingRequest[]>(`/permission?${qDir}`).catch(() => [] as PendingRequest[]),
          get<PendingRequest[]>(`/question?${qDir}`).catch(() => [] as PendingRequest[]),
        ])
        return { d, status: st ?? {}, permissions: perm ?? [], questions: ques ?? [] }
      }
    })

    const [roots, dirResults] = await Promise.all([sessionRootsPromise, Promise.all(dirResultsPromises)])

    const status: Record<string, ServerStatus> = {}
    const permMap = new Map<string, PendingRequest>()
    const quesMap = new Map<string, PendingRequest>()
    const idToDir = new Map<string, string>()

    for (const s of roots ?? []) {
      if (s?.id && s.directory) idToDir.set(s.id, s.directory)
    }

    for (const r of dirResults) {
      if (r.status) {
        for (const [sid, st] of Object.entries(r.status)) {
          status[sid] = st
          if (!idToDir.has(sid)) idToDir.set(sid, r.d)
        }
      }
      if (r.permissions) {
        for (const p of r.permissions) {
          if (!permMap.has(p.id)) permMap.set(p.id, p)
          if (!idToDir.has(p.sessionID)) idToDir.set(p.sessionID, r.d)
        }
      }
      if (r.questions) {
        for (const q of r.questions) {
          if (!quesMap.has(q.id)) quesMap.set(q.id, q)
          if (!idToDir.has(q.sessionID)) idToDir.set(q.sessionID, r.d)
        }
      }
    }

    const permissions = [...permMap.values()]
    const questions = [...quesMap.values()]

    // Child sessions (subagents) that are running or waiting fold into their root: fetch the chain.
    const sessions = new Map((roots ?? []).map((s) => [s.id, s]))
    let missing = [...Object.keys(status), ...permissions.map((p) => p.sessionID), ...questions.map((p) => p.sessionID)]
    for (let depth = 0; depth < 4 && missing.length; depth++) {
      const ids = [...new Set(missing)].filter((id) => !sessions.has(id)).slice(0, 50)
      const got = await Promise.all(
        ids.map((id) => {
          const d = idToDir.get(id) ?? directory
          return get<ServerSession>(`/session/${encodeURIComponent(id)}?directory=${encodeURIComponent(d)}`).catch(() => undefined)
        }),
      )
      missing = []
      for (const s of got) {
        if (!s?.id) continue
        sessions.set(s.id, s)
        if (s.parentID) {
          if (!idToDir.has(s.parentID)) idToDir.set(s.parentID, s.directory || idToDir.get(s.id) || directory)
          missing.push(s.parentID)
        }
      }
    }
    if (token !== this.token) return
    this.d.store.applySnapshot({ sessions: [...sessions.values()], status: status ?? {}, permissions: permissions ?? [], questions: questions ?? [], rootLimitReached: (roots ?? []).length >= this.rootLimit })
    for (const e of buffered.splice(0)) {
      if (handleEvent(e)) this.d.onChange()
    }
    live = true
    this.stats.connects++
    this.set({ state: "connected", error: undefined, attempt: 0, retryAt: undefined, lastConnectedAt: this.now() })
    this.d.onChange()

    for (const [id, s] of Object.entries(status ?? {})) {
      if (s?.type === "busy" && sessions.has(id)) {
        this.ensureTodo(id)
      }
    }
  }

  /**
   * Ensure todo list is loaded for a session (GET /session/:id/todo).
   * Fetched at most once per session per epoch; deduplicates in-flight requests.
   */
  ensureTodo(sessionID: string): void {
    if (this.stopped || !sessionID) return
    if (this.todoEpoch !== this.token) {
      this.todoEpoch = this.token
      this.todoFetched.clear()
    }
    if (this.todoFetched.has(sessionID)) return
    this.todoFetched.add(sessionID)

    this.enqueueTodo(async () => {
      const ctx = this.activeContext
      if (!ctx || ctx.token !== this.token) return
      try {
        const todos = await ctx.get<ServerTodo[]>(`/session/${encodeURIComponent(sessionID)}/todo`)
        if (ctx.token !== this.token) return
        if (Array.isArray(todos)) {
          if (this.d.store.setTodo(sessionID, todos)) {
            this.d.onChange()
          }
        }
      } catch (e) {
        if (ctx.token !== this.token) return
        if (e instanceof HttpError && e.status === 401) {
          this.handleUnauthorized(ctx.origin, ctx.abort)
          return
        }
        this.d.log?.(`feed: GET /session/${sessionID}/todo failed (${e instanceof Error ? e.message : String(e)})`)
      }
    })
  }

  private enqueueTodo(fn: () => Promise<void>) {
    this.todoQueue.push(fn)
    this.drainTodoQueue()
  }

  private drainTodoQueue() {
    while (this.todoRunning < SessionFeed.TODO_CONCURRENCY && this.todoQueue.length > 0) {
      const next = this.todoQueue.shift()!
      this.todoRunning++
      next().finally(() => {
        this.todoRunning--
        this.drainTodoQueue()
      })
    }
  }

  /** GET /session roots. Undefined on failure or when this attempt was superseded mid-flight. Never throws. */
  private async fetchRoots(extra: string): Promise<ServerSession[] | undefined> {
    const token = this.token
    try {
      const directory = this.d.directory()
      if (!directory) return
      const headers = { ...(await this.d.auth()), "x-opencode-directory": encodeURIComponent(directory) }
      if (token !== this.token) return
      const origin = this.d.endpoint().origin
      const r = await this.d.fetch(`${origin}/session?directory=${encodeURIComponent(directory)}&scope=project&roots=true&${extra}`, {
        headers,
        signal: this.abort?.signal,
        redirect: "manual",
      })
      if (token !== this.token) return
      if (!r.ok) throw new HttpError(r.status, "GET /session")
      const body: unknown = await r.json()
      if (token !== this.token) return
      if (!Array.isArray(body)) {
        this.d.log?.("feed: session page was not a list")
        return
      }
      return body as ServerSession[]
    } catch (e) {
      if (token !== this.token) return
      this.d.log?.(`feed: session page failed (${e instanceof Error ? e.message : String(e)})`)
    }
  }
}
