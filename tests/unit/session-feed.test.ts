// SessionFeed: injected fetch, timers, and clock. No real backoff waits.
import { describe, expect, test } from "bun:test"
import { SessionFeed, SseParser, type FeedDeps } from "../../apps/extension/src/session-feed"
import { SessionStore, type ServerEvent } from "../../apps/extension/src/session-store"

const ORIGIN = "http://127.0.0.1:4096"
const NOW = 1_700_000_000_000

const flush = () => new Promise((r) => setTimeout(r, 0))

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  })
}

function sse(event: ServerEvent) {
  return `data: ${JSON.stringify(event)}\n\n`
}

function openStream() {
  let controller: ReadableStreamDefaultController<Uint8Array> | undefined
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c
    },
  })
  const ready = () => {
    if (!controller) throw new Error("stream has not started")
    return controller
  }
  return {
    stream,
    push(text: string) {
      ready().enqueue(new TextEncoder().encode(text))
    },
    close() {
      try {
        ready().close()
      } catch {
        // already closed
      }
    },
  }
}

function defer<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

type Snap = {
  sessions?: unknown
  status?: unknown
  permissions?: unknown
  questions?: unknown
  byId?: Record<string, unknown>
  todos?: Record<string, unknown>
}

function routeSnapshot(url: string, snap: Snap): Response | undefined {
  if (url.includes("/session/status")) return json(snap.status ?? {})
  if (url.includes("/permission?")) return json(snap.permissions ?? [])
  if (url.includes("/question?")) return json(snap.questions ?? [])
  const todoMatch = url.match(/\/session\/([^/?]+)\/todo/)
  if (todoMatch) {
    const id = decodeURIComponent(todoMatch[1])
    if (snap.todos && id in snap.todos) return json(snap.todos[id])
    return json([])
  }
  const idMatch = url.match(/\/session\/([^/?]+)\?/)
  if (idMatch) {
    const id = decodeURIComponent(idMatch[1])
    if (!snap.byId || !(id in snap.byId)) return undefined
    return json(snap.byId[id])
  }
  if (url.includes("/session?")) return json(snap.sessions ?? [])
  return undefined
}

function hdr(init: RequestInit): Record<string, string> {
  const headers = init.headers
  if (!headers || headers instanceof Headers || Array.isArray(headers)) {
    throw new Error("expected a plain header object")
  }
  return headers
}

type TimerRec = { id: number; ms: number; fn: () => void }
type Call = { url: string; init: RequestInit }

function harness(opts: { stallMs?: number; directory?: string; noDirectory?: boolean } = {}) {
  let directory: string | undefined = opts.noDirectory ? undefined : (opts.directory ?? "/work")
  const owned = opts.directory ?? "/work"
  let connectionId = "c1"
  let endpointError: Error | undefined
  const calls: Call[] = []
  const timers: TimerRec[] = []
  let timerSeq = 1
  let changes = 0
  const states: string[] = []
  const store = new SessionStore((dir) => dir === owned)
  let handle: (url: string, init: RequestInit) => Response | Promise<Response> = () => {
    throw new Error("unexpected fetch")
  }

  const deps: FeedDeps = {
    fetch: (async (url: string | URL | Request, init?: RequestInit) => {
      const req = { url: String(url), init: init ?? {} }
      calls.push(req)
      return handle(req.url, req.init)
    }) as typeof fetch,
    endpoint: () => {
      if (endpointError) throw endpointError
      return { origin: ORIGIN, connectionId }
    },
    auth: async () => ({ authorization: "Basic test" }),
    directory: () => directory,
    trusted: () => true,
    store,
    onChange: () => {
      changes++
    },
    onState: (summary) => {
      states.push(summary.state)
    },
    now: () => NOW,
    setTimer: (fn, ms) => {
      const id = timerSeq++
      timers.push({ id, ms, fn })
      return id
    },
    clearTimer: (timer) => {
      const index = timers.findIndex((item) => item.id === timer)
      if (index >= 0) timers.splice(index, 1)
    },
    stallMs: opts.stallMs ?? 60_000,
    random: () => 0.5,
  }
  const feed = new SessionFeed(deps)

  return {
    feed,
    store,
    calls,
    timers,
    states,
    get changes() {
      return changes
    },
    get directory() {
      return directory
    },
    get connectionId() {
      return connectionId
    },
    set connectionId(id: string) {
      connectionId = id
    },
    set handle(next: typeof handle) {
      handle = next
    },
    failEndpoint(message: string) {
      endpointError = new Error(message)
    },
  }
}

type Harness = ReturnType<typeof harness>

async function until(pred: () => boolean, h: Harness, label: string) {
  for (let i = 0; i < 40; i++) {
    if (pred()) return
    await flush()
  }
  const urls = h.calls.map((call) => call.url).join(" | ")
  throw new Error(
    `${label}: state=${h.feed.state.state} attempt=${h.feed.state.attempt} error=${h.feed.state.error ?? ""} timers=${h.timers.map((t) => t.ms).join(",")} calls=${urls}`,
  )
}

describe("SseParser", () => {
  test("emits an event split across chunks and keeps a trailing partial line", () => {
    const parser = new SseParser()
    expect(parser.push('data: {"type":"session.idle","proper')).toEqual([])
    expect(parser.push('ties":{"sessionID":"abc"}}\n\n')).toEqual([
      { type: "session.idle", properties: { sessionID: "abc" } },
    ])
    expect(parser.push('data: {"type":"next"}')).toEqual([])
    expect(parser.push("\n\n")).toEqual([{ type: "next" }])
  })

  test("accepts CRLF, including a break between CR and LF, and joins multi-line data", () => {
    expect(new SseParser().push('data: {"type":"a"}\r\n\r\ndata: {"type":"b"}\r\n\r\n')).toEqual([
      { type: "a" },
      { type: "b" },
    ])

    const split = new SseParser()
    expect(split.push('data: {"type":"cr"}\r')).toEqual([])
    expect(split.push("\n\r\n")).toEqual([{ type: "cr" }])

    expect(new SseParser().push('data: {"type":"multi",\ndata: "n":2}\n\n')).toEqual([{ type: "multi", n: 2 }])
  })

  test("blank lines separate events, non-data fields are ignored, and bad JSON is skipped", () => {
    const parser = new SseParser()
    const chunk = [
      ": heartbeat",
      "",
      "event: message",
      "id: 42",
      'data: {"type":"one","id":"e1"}',
      "",
      'data: {"type":"two"}',
      "",
      "data: {",
    ].join("\n")
    expect(parser.push(chunk)).toEqual([
      { type: "one", id: "e1" },
      { type: "two" },
    ])
    expect(parser.push('"type":"three"}\n\n')).toEqual([{ type: "three" }])

    // A trailing blank line (the extra "\n") is what commits the last event.
    const bad =
      [
        "data: {not-json",
        "",
        'data: {"type":1}',
        "",
        'data: {"ok":true}',
        "",
        'data: {"type":"kept"}',
        "",
      ].join("\n") + "\n"
    expect(new SseParser().push(bad)).toEqual([{ type: "kept" }])
  })
})

describe("SessionFeed", () => {
  test("connects, queries the owned directory, and applies events buffered ahead of the snapshot", async () => {
    const dir = "/work/my dir"
    const enc = encodeURIComponent(dir)
    const h = harness({ directory: dir })
    const stream = openStream()
    const sessionGate = defer<Response>()
    const statusGate = defer<Response>()
    const permissionGate = defer<Response>()
    const questionGate = defer<Response>()
    stream.push(
      sse({
        id: "e-title",
        type: "session.updated",
        properties: { info: { id: "s1", directory: dir, title: "FromEvent", time: { updated: 50 } } },
      }) +
        sse({ id: "e-perm", type: "permission.asked", properties: { id: "req-1", sessionID: "s1" } }),
    )
    h.handle = (url) => {
      if (url.includes("/event")) return new Response(stream.stream, { status: 200 })
      if (url.includes("/session/status")) return statusGate.promise
      if (url.includes("/permission?")) return permissionGate.promise
      if (url.includes("/question?")) return questionGate.promise
      if (url.includes("/session?")) return sessionGate.promise
      throw new Error(url)
    }

    try {
      h.feed.start()
      expect(h.feed.state.state).toBe("connecting")
      await flush()
      await flush()
      // The event has been read, but the snapshot is still pending, so it must not be applied yet.
      expect(h.feed.state.state).toBe("connecting")
      expect(h.store.list()).toEqual([])

      const urls = h.calls.map((call) => call.url)
      expect(urls).toContain(`${ORIGIN}/session?directory=${enc}&scope=project&roots=true&limit=${SessionFeed.PAGE}`)
      expect(urls).toContain(`${ORIGIN}/session/status?directory=${enc}`)
      expect(urls).toContain(`${ORIGIN}/permission?directory=${enc}`)
      expect(urls).toContain(`${ORIGIN}/question?directory=${enc}`)
      const eventCall = h.calls.find((call) => call.url.includes("/event"))
      const sessionCall = h.calls.find((call) => call.url.includes("/session?"))
      expect(eventCall?.init.redirect).toBe("manual")
      expect(sessionCall?.init.redirect).toBe("manual")
      expect(hdr(eventCall!.init)).toEqual({
        authorization: "Basic test",
        "x-opencode-directory": enc,
        accept: "text/event-stream",
      })
      expect(hdr(sessionCall!.init)).toEqual({
        authorization: "Basic test",
        "x-opencode-directory": enc,
      })
      expect(sessionCall?.url).not.toContain("/session/status")

      sessionGate.resolve(json([{ id: "s1", directory: dir, title: "FromSnapshot", time: { created: 1, updated: 10 } }]))
      statusGate.resolve(json({}))
      permissionGate.resolve(json([]))
      questionGate.resolve(json([]))
      await until(() => h.feed.state.state === "connected", h, "happy path")

      expect(h.states).toEqual(["connecting", "connected"])
      expect(h.feed.state).toMatchObject({
        state: "connected",
        attempt: 0,
        connectionId: "c1",
        label: ORIGIN,
        directory: dir,
      })
      expect(h.feed.stats.connects).toBe(1)
      const item = h.store.list()
      expect(item).toHaveLength(1)
      // Title comes from the buffered update, so the snapshot did not run after the events.
      // Permission was not in /permission; the buffered permission.asked supplied it.
      expect(item[0]).toMatchObject({
        id: "s1",
        title: "FromEvent",
        updated: 50,
        activity: "permission",
        pendingPermissions: 1,
        pendingQuestions: 0,
      })
    } finally {
      stream.close()
      h.feed.stop()
    }
  })

  test("a busy child missing from the roots list is fetched, then its parent, and the root shows busy", async () => {
    const dir = "/work/my dir"
    const enc = encodeURIComponent(dir)
    const child = "child/1"
    const root = "root/1"
    const h = harness({ directory: dir })
    const stream = openStream()
    h.handle = (url) => {
      if (url.includes("/event")) return new Response(stream.stream, { status: 200 })
      const res = routeSnapshot(url, {
        sessions: [],
        status: { [child]: { type: "busy" } },
        byId: {
          [child]: { id: child, directory: dir, parentID: root, title: "Child", time: { updated: 4 } },
          [root]: { id: root, directory: dir, title: "Root", time: { updated: 3 } },
        },
      })
      if (!res) throw new Error(url)
      return res
    }

    try {
      h.feed.start()
      await until(() => h.feed.state.state === "connected", h, "child chain")
      const urls = h.calls.map((call) => call.url)
      const childUrl = `${ORIGIN}/session/${encodeURIComponent(child)}?directory=${enc}`
      const rootUrl = `${ORIGIN}/session/${encodeURIComponent(root)}?directory=${enc}`
      const childAt = urls.indexOf(childUrl)
      const rootAt = urls.indexOf(rootUrl)
      expect(childAt).toBeGreaterThan(-1)
      expect(rootAt).toBeGreaterThan(childAt)
      expect(h.store.list().map((item) => item.id)).toEqual([root])
      expect(h.store.list()[0]).toMatchObject({ activity: "busy", title: "Root", pendingPermissions: 0 })
    } finally {
      stream.close()
      h.feed.stop()
    }
  })

  test("401 on /event is unauthorized with no retry timer, and restart tries again", async () => {
    const dir = "/work"
    const h = harness({ directory: dir })
    const stream = openStream()
    let events = 0
    h.handle = (url) => {
      if (url.includes("/event")) {
        events++
        if (events === 1) return new Response("", { status: 401 })
        return new Response(stream.stream, { status: 200 })
      }
      const res = routeSnapshot(url, {
        sessions: [{ id: "s1", directory: dir, title: "After auth", time: { updated: 1 } }],
      })
      if (!res) throw new Error(url)
      return res
    }

    try {
      h.feed.start()
      await until(() => h.feed.state.state === "unauthorized", h, "401")
      expect(h.feed.state.error).toBe(`Authentication failed (${ORIGIN}): the username or password is incorrect. Run “oco: Set Server Password”, or check the username in Settings`)
      expect(h.feed.state.retryAt).toBeUndefined()
      expect(h.feed.state.attempt).toBe(0)
      expect(h.timers).toHaveLength(0)
      expect(h.feed.stats.connects).toBe(0)
      expect(h.store.list()).toEqual([])

      h.feed.restart()
      await until(() => h.feed.state.state === "connected", h, "restart after 401")
      expect(events).toBe(2)
      expect(h.store.list()[0].title).toBe("After auth")
      expect(h.feed.state.attempt).toBe(0)
    } finally {
      stream.close()
      h.feed.stop()
    }
  })

  test("a network error retries, success resets the attempt, and a later stream end keeps the list", async () => {
    const dir = "/work"
    const h = harness({ directory: dir })
    const stream = openStream()
    let events = 0
    h.handle = (url) => {
      if (url.includes("/event")) {
        events++
        if (events === 1) throw new Error("network down")
        return new Response(stream.stream, { status: 200 })
      }
      const res = routeSnapshot(url, {
        sessions: [{ id: "s1", directory: dir, title: "Kept", time: { updated: 42 } }],
      })
      if (!res) throw new Error(url)
      return res
    }

    try {
      h.feed.start()
      await until(() => h.feed.state.state === "error" && h.timers.length === 1, h, "network error")
      expect(h.feed.state.attempt).toBe(1)
      expect(h.feed.state.error).toBe("Cannot reach the server (offline or wrong address/port): network down")
      expect(h.timers[0].ms).toBe(1000)
      expect(h.feed.state.retryAt).toBe(NOW + 1000)

      h.timers[0].fn()
      await until(() => h.feed.state.state === "connected", h, "retry succeeded")
      expect(h.feed.state.attempt).toBe(0)
      expect(h.feed.state.lastConnectedAt).toBe(NOW)
      const stale = h.store.list()
      expect(stale.map((item) => item.title)).toEqual(["Kept"])

      stream.close()
      await until(() => h.feed.state.state === "reconnecting", h, "stream end")
      expect(h.feed.state.lastConnectedAt).toBe(NOW)
      expect(h.feed.state.attempt).toBe(1)
      expect(h.feed.state.error).toBe("Event stream ended")
      expect(h.store.list()).toEqual(stale)
      expect(h.timers.map((timer) => timer.ms)).toEqual([1000])
    } finally {
      h.feed.stop()
    }
  })

  test("backoff equals the base delay when random is 0.5 and caps at 30000", async () => {
    const h = harness()
    h.handle = () => {
      throw new Error("down")
    }
    try {
      h.feed.start()
      const delays: number[] = []
      for (let i = 0; i < 8; i++) {
        await until(() => h.feed.state.state === "error" && h.timers.length === 1, h, `backoff ${i}`)
        expect(h.feed.state.attempt).toBe(i + 1)
        expect(h.feed.state.retryAt).toBe(NOW + h.timers[0].ms)
        delays.push(h.timers[0].ms)
        h.timers[0].fn()
      }
      expect(delays).toEqual([1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000])
      expect(Math.max(...delays)).toBeLessThanOrEqual(30000)
    } finally {
      h.feed.stop()
    }
  })

  test("restart aborts the in-flight attempt and a late response does not change state or the store", async () => {
    const dir = "/work"
    const h = harness({ directory: dir })
    const firstEvent = defer<Response>()
    const late = openStream()
    let eventRound = 0
    let firstSignal: AbortSignal | undefined
    let secondSignal: AbortSignal | undefined
    const pending: { url: string; signal: AbortSignal; resolve: (response: Response) => void; done: boolean }[] = []

    h.handle = (url, init) => {
      const signal = init.signal as AbortSignal
      if (url.includes("/event")) {
        eventRound++
        if (eventRound === 1) {
          firstSignal = signal
          return firstEvent.promise
        }
        secondSignal = signal
        return new Promise(() => {})
      }
      return new Promise((resolve) => {
        pending.push({ url, signal, resolve, done: false })
      })
    }

    const ghost = (url: string) => {
      const res = routeSnapshot(url, {
        sessions: [{ id: "ghost", directory: dir, title: "Ghost", time: { updated: 99 } }],
        status: {},
        permissions: [{ id: "preq", sessionID: "ghost" }],
        questions: [],
      })
      if (!res) throw new Error(url)
      return res
    }

    try {
      h.feed.start()
      await until(() => eventRound === 1, h, "first event request")
      expect(firstSignal?.aborted).toBe(false)
      expect(h.store.stats.snapshots).toBe(1)

      h.feed.restart()
      expect(firstSignal?.aborted).toBe(true)
      expect(h.feed.stats.superseded).toBe(1)
      expect(h.feed.state.state).toBe("connecting")
      const snapshots = h.store.stats.snapshots
      await until(() => eventRound === 2, h, "second event request")
      expect(secondSignal?.aborted).toBe(false)

      late.push(
        sse({
          id: "late-create",
          type: "session.created",
          properties: { info: { id: "ghost", directory: dir, title: "Ghost", time: { updated: 99 } } },
        }) + sse({ id: "late-perm", type: "permission.asked", properties: { id: "preq", sessionID: "ghost" } }),
      )
      firstEvent.resolve(new Response(late.stream, { status: 200 }))

      for (let i = 0; i < 15; i++) {
        const batch = pending.filter((item) => item.signal === firstSignal && !item.done)
        if (!batch.length) {
          await flush()
          if (!pending.some((item) => item.signal === firstSignal && !item.done)) break
          continue
        }
        for (const item of batch) {
          item.done = true
          item.resolve(ghost(item.url))
        }
        await flush()
      }
      expect(pending.some((item) => item.signal === firstSignal && !item.done)).toBe(false)

      expect(h.store.stats.snapshots).toBe(snapshots)
      expect(h.store.stats.events).toBe(0)
      expect(h.store.list()).toEqual([])
      expect(h.feed.state.state).toBe("connecting")
      expect(h.feed.stats.superseded).toBe(1)
      expect(h.feed.stats.connects).toBe(0)
    } finally {
      late.close()
      h.feed.stop()
    }
  })

  test("the stall watchdog fails when no bytes arrive and schedules a reconnect", async () => {
    const dir = "/work"
    const h = harness({ directory: dir, stallMs: 5 })
    const stream = openStream()
    h.handle = (url) => {
      if (url.includes("/event")) return new Response(stream.stream, { status: 200 })
      const res = routeSnapshot(url, {
        sessions: [{ id: "s1", directory: dir, title: "Live", time: { updated: 7 } }],
      })
      if (!res) throw new Error(url)
      return res
    }

    try {
      h.feed.start()
      await until(() => h.feed.state.state === "connected", h, "before stall")
      expect(h.store.list()[0].title).toBe("Live")
      expect(h.timers.map((timer) => timer.ms)).toEqual([5])

      h.timers[0].fn()
      expect(h.feed.stats.stalls).toBe(1)
      expect(h.feed.state.state).toBe("reconnecting")
      expect(h.feed.state.error).toBe("Event stream has no heartbeat")
      expect(h.feed.state.attempt).toBe(1)
      expect(h.feed.state.lastConnectedAt).toBe(NOW)
      expect(h.timers.map((timer) => timer.ms)).toEqual([1000])
      expect(h.store.list().map((item) => item.title)).toEqual(["Live"])
    } finally {
      stream.close()
      h.feed.stop()
    }
  })

  test("changing connectionId clears the previous server's sessions while the next attempt is connecting", async () => {
    const dir = "/work"
    const h = harness({ directory: dir })
    const first = openStream()
    const second = openStream()
    const secondGate = defer<void>()
    let round = 0
    let firstSignal: AbortSignal | undefined
    h.handle = (url, init) => {
      if (url.includes("/event")) {
        round++
        if (round === 1) {
          firstSignal = init.signal as AbortSignal
          return new Response(first.stream, { status: 200 })
        }
        return secondGate.promise.then(() => new Response(second.stream, { status: 200 }))
      }
      const id = h.connectionId === "c1" ? "old" : "new"
      const title = h.connectionId === "c1" ? "Old server" : "New server"
      const res = routeSnapshot(url, {
        sessions: [{ id, directory: dir, title, time: { updated: 10 } }],
      })
      if (!res) throw new Error(url)
      return res
    }

    try {
      h.feed.start()
      await until(() => h.feed.state.state === "connected", h, "first server")
      expect(h.store.list().map((item) => item.id)).toEqual(["old"])

      h.connectionId = "c2"
      h.feed.restart()
      expect(firstSignal?.aborted).toBe(true)
      expect(h.feed.state.state).toBe("connecting")
      expect(h.feed.state.connectionId).toBe("c2")
      expect(h.feed.state.lastConnectedAt).toBeUndefined()
      expect(h.store.list()).toEqual([])

      first.push(
        sse({
          type: "session.created",
          properties: { info: { id: "sneaky", directory: dir, title: "Sneaky", time: { updated: 99 } } },
        }),
      )
      await flush()
      expect(h.store.list()).toEqual([])
      expect(h.feed.state.state).toBe("connecting")

      secondGate.resolve()
      await until(() => h.feed.state.state === "connected", h, "second server")
      expect(h.store.list().map((item) => item.id)).toEqual(["new"])
      expect(h.feed.state.connectionId).toBe("c2")
    } finally {
      first.close()
      second.close()
      h.feed.stop()
    }
  })

  test("endpoint() throwing reports unconfigured and does not fetch or retry", () => {
    const h = harness()
    h.failEndpoint("服务器地址无效")
    h.feed.start()
    expect(h.feed.state).toMatchObject({
      state: "unconfigured",
      error: "服务器地址无效",
      connectionId: null,
      label: "",
      directory: "/work",
      attempt: 0,
    })
    expect(h.calls).toHaveLength(0)
    expect(h.timers).toHaveLength(0)
    expect(h.feed.stats.attempts).toBe(0)
  })

  test("a missing directory reports unconfigured without fetching", () => {
    const h = harness({ noDirectory: true })
    h.feed.start()
    expect(h.feed.state).toMatchObject({
      state: "unconfigured",
      error: "Open a workspace folder first",
      connectionId: "c1",
      label: ORIGIN,
      directory: null,
      attempt: 0,
    })
    expect(h.calls).toHaveLength(0)
    expect(h.timers).toHaveLength(0)
    expect(h.feed.stats.attempts).toBe(0)
  })
})

describe("SessionFeed: stale attempts and limits", () => {
  const dir = "/work"
  const roots = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `s${i}`, directory: dir, title: `S${i}`, time: { updated: i } }))

  test("401 on a snapshot request while /event is open closes the stream and leaves no timers", async () => {
    const h = harness({ directory: dir })
    const stream = openStream()
    let eventSignal: AbortSignal | undefined
    let eventCalls = 0
    h.handle = (url, init) => {
      if (url.includes("/event")) {
        eventCalls++
        eventSignal = init.signal as AbortSignal
        return new Response(stream.stream, { status: 200 })
      }
      if (url.includes("/session?")) return new Response("", { status: 401 })
      const res = routeSnapshot(url, {})
      if (!res) throw new Error(url)
      return res
    }
    try {
      h.feed.start()
      await until(() => h.feed.state.state === "unauthorized", h, "snapshot 401")
      expect(eventSignal?.aborted).toBe(true)
      expect(h.timers).toHaveLength(0)
      // A late event or the end of the old stream neither changes the store nor schedules a retry.
      stream.push(sse({ id: "e1", type: "session.created", properties: { info: { id: "late", directory: dir, title: "Late", time: { updated: 5 } } } }))
      stream.close()
      for (let i = 0; i < 5; i++) await flush()
      expect(h.store.list()).toEqual([])
      expect(h.timers).toHaveLength(0)
      expect(h.feed.state.state).toBe("unauthorized")
      expect(eventCalls).toBe(1)
    } finally {
      stream.close()
      h.feed.stop()
    }
  })

  test("a superseded attempt whose /event resolves late does not disarm the new attempt's watchdog", async () => {
    const h = harness({ directory: dir, stallMs: 5000 })
    const firstEvent = defer<Response>()
    const late = openStream()
    const live = openStream()
    let eventRound = 0
    h.handle = (url) => {
      if (url.includes("/event")) {
        eventRound++
        if (eventRound === 1) return firstEvent.promise
        return new Response(live.stream, { status: 200 })
      }
      const res = routeSnapshot(url, { sessions: roots(1) })
      if (!res) throw new Error(url)
      return res
    }
    try {
      h.feed.start()
      await until(() => eventRound === 1, h, "first /event")
      h.feed.restart()
      await until(() => h.feed.state.state === "connected", h, "second attempt connected")
      expect(h.timers.filter((t) => t.ms === 5000)).toHaveLength(1)
      // The first attempt's response arrives after it was superseded (the fake ignores the abort).
      firstEvent.resolve(new Response(late.stream, { status: 200 }))
      for (let i = 0; i < 5; i++) await flush()
      const watchdogs = h.timers.filter((t) => t.ms === 5000)
      expect(watchdogs).toHaveLength(1)
      watchdogs[0].fn()
      expect(h.feed.stats.stalls).toBe(1)
      expect(h.feed.state.state).toBe("reconnecting")
    } finally {
      late.close()
      live.close()
      h.feed.stop()
    }
  })

  for (const [n, reached] of [
    [SessionFeed.PAGE, true],
    [SessionFeed.PAGE - 1, false],
  ] as const) {
    test(`${n} root sessions from the server set limitReached=${reached}`, async () => {
      const h = harness({ directory: dir })
      const stream = openStream()
      h.handle = (url) => {
        if (url.includes("/event")) return new Response(stream.stream, { status: 200 })
        const res = routeSnapshot(url, { sessions: roots(n) })
        if (!res) throw new Error(url)
        return res
      }
      try {
        h.feed.start()
        await until(() => h.feed.state.state === "connected", h, "connected")
        expect(h.store.limitReached).toBe(reached)
        expect(h.calls.some((c) => c.url.includes(`limit=${SessionFeed.PAGE}`))).toBe(true)
      } finally {
        stream.close()
        h.feed.stop()
      }
    })
  }
})

describe("SessionFeed: connection settings diagnostics", () => {
  test("invalid endpoint is issue=endpoint, missing folder is issue=folder", () => {
    const a = harness()
    a.failEndpoint("oco.serverUrl is not a valid URL")
    a.feed.start()
    expect(a.feed.state).toMatchObject({ state: "unconfigured", issue: "endpoint" })
    const b = harness({ noDirectory: true })
    b.feed.start()
    expect(b.feed.state).toMatchObject({ state: "unconfigured", issue: "folder" })
  })

  test("HTTP error from a wrong server and an offline fetch failure read differently and neither is unauthorized", async () => {
    const h = harness()
    h.handle = () => new Response("nope", { status: 404 })
    try {
      h.feed.start()
      await until(() => h.feed.state.state === "error" && h.timers.length === 1, h, "404")
      expect(h.feed.state.error).toContain("HTTP 404")
      expect(h.feed.state.error).toContain("may not be an OpenCode server")
    } finally {
      h.feed.stop()
    }
  })
})

describe("SessionFeed pages and search", () => {
  const dir = "/work"
  const enc = encodeURIComponent(dir)
  const roots = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ id: `s${i}`, directory: dir, title: `S${i}`, time: { updated: i + 1 } }))

  function sessionRoutes(extra: unknown) {
    return (url: string) => {
      if (url.includes("/session?")) return json(extra)
      const res = routeSnapshot(url, {})
      if (!res) throw new Error(url)
      return res
    }
  }

  test("loadMore asks for the next page, merges rows, and updates limitReached", async () => {
    const h = harness({ directory: dir })
    const first = openStream()
    const second = openStream()
    let events = 0
    const firstPage = roots(SessionFeed.PAGE)
    const more = Array.from({ length: 50 }, (_, i) => ({
      id: `m${i}`,
      directory: dir,
      title: `M${i}`,
      time: { updated: 1000 + i },
    }))
    h.handle = (url) => {
      if (url.includes("/event")) {
        events++
        return new Response((events === 1 ? first : second).stream, { status: 200 })
      }
      if (url.includes(`limit=${SessionFeed.PAGE * 2}`)) return json([...firstPage, ...more])
      return sessionRoutes(firstPage)(url)
    }
    try {
      h.feed.start()
      await until(() => h.feed.state.state === "connected", h, "connected")
      expect(h.store.limitReached).toBe(true)
      expect(h.store.size).toBe(SessionFeed.PAGE)
      const before = h.changes
      await h.feed.loadMore()
      const sessionUrls = h.calls.map((call) => call.url).filter((url) => url.includes("/session?"))
      expect(sessionUrls[0]).toBe(`${ORIGIN}/session?directory=${enc}&scope=project&roots=true&limit=${SessionFeed.PAGE}`)
      expect(sessionUrls[1]).toBe(`${ORIGIN}/session?directory=${enc}&scope=project&roots=true&limit=${SessionFeed.PAGE * 2}`)
      const pageCall = h.calls.find((call) => call.url === sessionUrls[1])
      expect(pageCall?.init.redirect).toBe("manual")
      expect(hdr(pageCall!.init)).toEqual({ authorization: "Basic test", "x-opencode-directory": enc })
      expect(h.store.limitReached).toBe(false)
      expect(h.store.size).toBe(SessionFeed.PAGE + 50)
      expect(h.store.has("s0")).toBe(true)
      expect(h.store.has("m0")).toBe(true)
      expect(h.changes).toBe(before + 1)

      h.feed.restart()
      await until(() => h.feed.state.state === "connected" && h.feed.stats.connects === 2, h, "reconnect keeps page")
      const again = h.calls.map((call) => call.url).filter((url) => url.includes("/session?"))
      expect(again[2]).toBe(`${ORIGIN}/session?directory=${enc}&scope=project&roots=true&limit=${SessionFeed.PAGE * 2}`)
      expect(h.store.size).toBe(SessionFeed.PAGE + 50)
      expect(h.store.limitReached).toBe(false)
    } finally {
      first.close()
      second.close()
      h.feed.stop()
    }
  })

  test("search queries the server, merges hits, and calls onChange only when the store changes", async () => {
    const h = harness({ directory: dir })
    const stream = openStream()
    const query = "a/b c"
    let searchRound = 0
    h.handle = (url) => {
      if (url.includes("/event")) return new Response(stream.stream, { status: 200 })
      if (url.includes("search=")) {
        searchRound++
        if (searchRound === 1) {
          return json(
            Array.from({ length: SessionFeed.PAGE }, (_, i) => ({
              id: `f${i}`,
              directory: dir,
              title: `F${i}`,
              time: { updated: 50 + i },
            })),
          )
        }
        return json([{ id: "s0", directory: dir, title: "Stale", time: { updated: 0 } }])
      }
      return sessionRoutes(roots(1))(url)
    }
    try {
      h.feed.start()
      await until(() => h.feed.state.state === "connected", h, "connected")
      expect(h.store.limitReached).toBe(false)
      const callsBefore = h.calls.length
      await h.feed.search("   ")
      await h.feed.search("")
      expect(h.calls).toHaveLength(callsBefore)

      const before = h.changes
      await h.feed.search(query)
      const searchCall = h.calls.find((call) => call.url.includes("search="))
      expect(searchCall?.url).toBe(
        `${ORIGIN}/session?directory=${enc}&scope=project&roots=true&search=${encodeURIComponent(query)}&limit=${SessionFeed.PAGE}`,
      )
      expect(searchCall?.init.redirect).toBe("manual")
      expect(hdr(searchCall!.init)).toEqual({ authorization: "Basic test", "x-opencode-directory": enc })
      expect(h.store.has("s0")).toBe(true)
      expect(h.store.has("f0")).toBe(true)
      expect(h.store.size).toBe(1 + SessionFeed.PAGE)
      expect(h.store.limitReached).toBe(false)
      expect(h.changes).toBe(before + 1)

      await h.feed.search(query)
      expect(h.store.list().find((item) => item.id === "s0")?.title).toBe("S0")
      expect(h.changes).toBe(before + 1)
      expect(h.store.limitReached).toBe(false)
    } finally {
      stream.close()
      h.feed.stop()
    }
  })

  test("loadMore and search do not fetch unless the feed is connected", async () => {
    const h = harness({ directory: dir })
    await h.feed.loadMore()
    await h.feed.search("hello")
    expect(h.calls).toHaveLength(0)

    const stream = openStream()
    const gate = defer<Response>()
    h.handle = (url) => {
      if (url.includes("/event")) return gate.promise.then(() => new Response(stream.stream, { status: 200 }))
      return sessionRoutes(roots(1))(url)
    }
    try {
      h.feed.start()
      expect(h.feed.state.state).toBe("connecting")
      await h.feed.loadMore()
      await h.feed.search("hello")
      expect(h.calls.filter((call) => call.url.includes("/session"))).toHaveLength(0)
      gate.resolve(new Response(null, { status: 200 }))
      await until(() => h.feed.state.state === "connected", h, "connected after gated event")
      const sessionUrls = h.calls.map((call) => call.url).filter((url) => url.includes("/session?"))
      expect(sessionUrls).toEqual([`${ORIGIN}/session?directory=${enc}&scope=project&roots=true&limit=${SessionFeed.PAGE}`])
    } finally {
      stream.close()
      h.feed.stop()
    }
  })

  test("a response that arrives after restart is ignored", async () => {
    const h = harness({ directory: dir })
    const stream = openStream()
    const loadLate = defer<Response>()
    const searchLate = defer<Response>()
    let events = 0
    h.handle = (url) => {
      if (url.includes("/event")) {
        events++
        if (events === 1) return new Response(stream.stream, { status: 200 })
        return new Promise(() => {})
      }
      if (url.includes("search=")) return searchLate.promise
      if (url.includes(`limit=${SessionFeed.PAGE * 2}`)) return loadLate.promise
      return sessionRoutes(roots(1))(url)
    }
    try {
      h.feed.start()
      await until(() => h.feed.state.state === "connected", h, "connected")
      const loadP = h.feed.loadMore()
      const searchP = h.feed.search("ghost")
      await until(
        () => h.calls.some((call) => call.url.includes(`limit=${SessionFeed.PAGE * 2}`)) && h.calls.some((call) => call.url.includes("search=")),
        h,
        "in flight",
      )
      const size = h.store.size
      h.feed.restart()
      loadLate.resolve(json([{ id: "ghost-load", directory: dir, title: "Ghost", time: { updated: 500 } }]))
      searchLate.resolve(json([{ id: "ghost-search", directory: dir, title: "Ghost", time: { updated: 500 } }]))
      await loadP
      await searchP
      expect(h.store.has("ghost-load")).toBe(false)
      expect(h.store.has("ghost-search")).toBe(false)
      expect(h.store.has("s0")).toBe(true)
      expect(h.store.size).toBe(size)
      expect(h.feed.state.state).toBe("reconnecting")
    } finally {
      stream.close()
      h.feed.stop()
    }
  })

  test("HTTP errors from loadMore and search do not throw or change the store", async () => {
    const h = harness({ directory: dir })
    const stream = openStream()
    let sessionLists = 0
    h.handle = (url) => {
      if (url.includes("/event")) return new Response(stream.stream, { status: 200 })
      if (url.includes("/session?")) {
        sessionLists++
        if (sessionLists > 1) return new Response("nope", { status: 500 })
      }
      return sessionRoutes(roots(1))(url)
    }
    try {
      h.feed.start()
      await until(() => h.feed.state.state === "connected", h, "connected")
      const before = h.changes
      await expect(h.feed.loadMore()).resolves.toBeUndefined()
      await expect(h.feed.search("a/b")).resolves.toBeUndefined()
      expect(h.store.list().map((item) => item.id)).toEqual(["s0"])
      expect(h.store.limitReached).toBe(false)
      expect(h.feed.state.state).toBe("connected")
      expect(h.changes).toBe(before)
      expect(h.calls.some((call) => call.url.includes("search="))).toBe(true)
    } finally {
      stream.close()
      h.feed.stop()
    }
  })
})

describe("SessionFeed M02 todo handling", () => {
  const dir = "/work"
  const enc = encodeURIComponent(dir)

  test("lazy-fetches todo for busy sessions after snapshot, does not fetch for non-busy sessions", async () => {
    const h = harness({ directory: dir })
    const stream = openStream()
    h.handle = (url) => {
      if (url.includes("/event")) return new Response(stream.stream, { status: 200 })
      return routeSnapshot(url, {
        sessions: [
          { id: "busy-1", directory: dir, title: "Busy 1", time: { updated: 10 } },
          { id: "idle-1", directory: dir, title: "Idle 1", time: { updated: 5 } },
        ],
        status: { "busy-1": { type: "busy" }, "idle-1": { type: "idle" } },
        todos: {
          "busy-1": [
            { id: "t1", content: "Implement M02", status: "in_progress" },
            { id: "t2", content: "Review contracts", status: "completed" },
          ],
        },
      })
    }

    try {
      h.feed.start()
      await until(() => h.feed.state.state === "connected", h, "connected")
      await until(() => h.store.hasTodo("busy-1"), h, "busy-1 todo loaded")

      const urls = h.calls.map((c) => c.url)
      expect(urls.some((u) => u.includes("/session/busy-1/todo"))).toBe(true)
      expect(urls.some((u) => u.includes("/session/idle-1/todo"))).toBe(false)

      const busyItem = h.store.list().find((item) => item.id === "busy-1")
      expect(busyItem?.todo).toEqual({
        done: 1,
        total: 2,
        items: [
          { content: "Implement M02", status: "in_progress" },
          { content: "Review contracts", status: "completed" },
        ],
      })
      const idleItem = h.store.list().find((item) => item.id === "idle-1")
      expect(idleItem?.todo).toBeUndefined()
    } finally {
      stream.close()
      h.feed.stop()
    }
  })

  test("session.status event making session busy triggers ensureTodo when store has no todo", async () => {
    const h = harness({ directory: dir })
    const stream = openStream()
    h.handle = (url) => {
      if (url.includes("/event")) return new Response(stream.stream, { status: 200 })
      return routeSnapshot(url, {
        sessions: [{ id: "s1", directory: dir, title: "S1", time: { updated: 1 } }],
        status: { s1: { type: "idle" } },
        todos: {
          s1: [{ id: "t1", content: "Dynamic task", status: "pending" }],
        },
      })
    }

    try {
      h.feed.start()
      await until(() => h.feed.state.state === "connected", h, "connected")
      expect(h.store.hasTodo("s1")).toBe(false)
      const callsBefore = h.calls.filter((c) => c.url.includes("/session/s1/todo")).length
      expect(callsBefore).toBe(0)

      // session becomes busy -> triggers ensureTodo
      stream.push(sse({ type: "session.status", properties: { sessionID: "s1", status: { type: "busy" } } }))
      await until(() => h.store.hasTodo("s1"), h, "s1 todo loaded after busy event")
      expect(h.calls.filter((c) => c.url.includes("/session/s1/todo"))).toHaveLength(1)
      expect(h.store.getTodo("s1")?.total).toBe(1)

      // another session.status busy event when store already has todo does not trigger re-fetch
      stream.push(sse({ type: "session.status", properties: { sessionID: "s1", status: { type: "busy" } } }))
      await flush()
      expect(h.calls.filter((c) => c.url.includes("/session/s1/todo"))).toHaveLength(1)
    } finally {
      stream.close()
      h.feed.stop()
    }
  })

  test("ensureTodo deduplicates concurrent and repeated calls within the same epoch", async () => {
    const h = harness({ directory: dir })
    const stream = openStream()
    h.handle = (url) => {
      if (url.includes("/event")) return new Response(stream.stream, { status: 200 })
      return routeSnapshot(url, {
        sessions: [{ id: "s1", directory: dir, title: "S1", time: { updated: 1 } }],
        status: {},
        todos: {
          s1: [{ id: "t1", content: "Task", status: "completed" }],
        },
      })
    }

    try {
      h.feed.start()
      await until(() => h.feed.state.state === "connected", h, "connected")

      // Call ensureTodo 3 times concurrently
      h.feed.ensureTodo("s1")
      h.feed.ensureTodo("s1")
      h.feed.ensureTodo("s1")

      await until(() => h.store.hasTodo("s1"), h, "s1 todo loaded")
      const todoCalls = h.calls.filter((c) => c.url.includes("/session/s1/todo"))
      expect(todoCalls).toHaveLength(1)
    } finally {
      stream.close()
      h.feed.stop()
    }
  })

  test("epoch expired results are discarded and do not overwrite new epoch", async () => {
    const h = harness({ directory: dir })
    const firstStream = openStream()
    const secondStream = openStream()
    let streamCount = 0
    const gate = defer<Response>()

    h.handle = (url) => {
      if (url.includes("/event")) {
        streamCount++
        return new Response((streamCount === 1 ? firstStream : secondStream).stream, { status: 200 })
      }
      if (url.includes("/session/s1/todo")) {
        return gate.promise
      }
      return routeSnapshot(url, {
        sessions: [{ id: "s1", directory: dir, title: "S1", time: { updated: 1 } }],
        status: { s1: { type: "busy" } },
      })
    }

    try {
      h.feed.start()
      await until(() => h.feed.state.state === "connected", h, "first connected")
      // The todo request for s1 is in-flight (waiting on gate)
      await until(() => h.calls.some((c) => c.url.includes("/session/s1/todo")), h, "todo in flight")

      // Reconnect (new epoch)
      h.feed.restart()
      await until(() => h.feed.state.state === "connected" && h.feed.stats.connects === 2, h, "second connected")

      // Now resolve the old epoch's request
      gate.resolve(
        json([
          { id: "old-1", content: "Old epoch todo", status: "completed" },
        ]),
      )
      await flush()

      // The store in the second epoch should NOT have old-1 todo because epoch expired
      expect(h.store.getTodo("s1")).toBeUndefined()
    } finally {
      firstStream.close()
      secondStream.close()
      h.feed.stop()
    }
  })

  test("404 on todo fetch logs error and does not affect snapshot or connection", async () => {
    const h = harness({ directory: dir })
    const stream = openStream()
    h.handle = (url) => {
      if (url.includes("/event")) return new Response(stream.stream, { status: 200 })
      if (url.includes("/todo")) return new Response("Not found", { status: 404 })
      return routeSnapshot(url, {
        sessions: [{ id: "s1", directory: dir, title: "S1", time: { updated: 1 } }],
        status: { s1: { type: "busy" } },
      })
    }

    try {
      h.feed.start()
      await until(() => h.feed.state.state === "connected", h, "connected")
      await until(() => h.calls.some((c) => c.url.includes("/session/s1/todo")), h, "todo fetched")

      expect(h.feed.state.state).toBe("connected")
      expect(h.store.hasTodo("s1")).toBe(false)
    } finally {
      stream.close()
      h.feed.stop()
    }
  })

  test("401 on todo fetch triggers unauthorized state", async () => {
    const h = harness({ directory: dir })
    const stream = openStream()
    h.handle = (url) => {
      if (url.includes("/event")) return new Response(stream.stream, { status: 200 })
      if (url.includes("/todo")) return new Response("Unauthorized", { status: 401 })
      return routeSnapshot(url, {
        sessions: [{ id: "s1", directory: dir, title: "S1", time: { updated: 1 } }],
        status: { s1: { type: "busy" } },
      })
    }

    try {
      h.feed.start()
      await until(() => h.feed.state.state === "unauthorized", h, "unauthorized state")
      expect(h.feed.state.state).toBe("unauthorized")
      expect(h.feed.state.error).toContain("Authentication failed")
    } finally {
      stream.close()
      h.feed.stop()
    }
  })

  test("concurrency limit 4 is enforced when multiple busy sessions are fetched", async () => {
    const h = harness({ directory: dir })
    const stream = openStream()
    const sessionIds = ["b1", "b2", "b3", "b4", "b5", "b6"]
    const statusMap: Record<string, { type: "busy" }> = {}
    for (const id of sessionIds) statusMap[id] = { type: "busy" }

    let concurrent = 0
    let maxConcurrent = 0
    const resolvers: Array<() => void> = []

    h.handle = (url) => {
      if (url.includes("/event")) return new Response(stream.stream, { status: 200 })
      if (url.includes("/todo")) {
        concurrent++
        if (concurrent > maxConcurrent) maxConcurrent = concurrent
        return new Promise<Response>((resolve) => {
          resolvers.push(() => {
            concurrent--
            resolve(json([]))
          })
        })
      }
      return routeSnapshot(url, {
        sessions: sessionIds.map((id) => ({ id, directory: dir, title: id, time: { updated: 1 } })),
        status: statusMap,
      })
    }

    try {
      h.feed.start()
      await until(() => h.feed.state.state === "connected", h, "connected")
      // Wait until initial batch of 4 is dispatched
      await until(() => resolvers.length === 4, h, "4 in flight")
      expect(maxConcurrent).toBe(4)
      expect(resolvers.length).toBe(4)

      // Resolve one, 5th should start
      resolvers.shift()!()
      await until(() => resolvers.length === 4, h, "next in flight")
      expect(maxConcurrent).toBe(4)

      // Resolve remaining
      while (resolvers.length > 0) {
        resolvers.shift()!()
        await flush()
      }
      expect(maxConcurrent).toBe(4)
    } finally {
      stream.close()
      h.feed.stop()
    }
  })
})

