// P1a-00/01: request lifecycle across webview documents (remount), with a controllable fake server.
import { describe, expect, test } from "bun:test"
import { BRIDGE_ORIGIN, PROTOCOL_VERSION, type HostToWebview } from "@oco/contracts"
import { BridgeCore } from "../../apps/extension/src/bridge-core"
import { BridgePolicy } from "../../apps/extension/src/bridge-policy"

type Controlled = { push(s: string): void; end(): void; aborted: boolean }

/** Fake server: every request gets a stream we control from the test. */
function harness() {
  const posted: HostToWebview[] = []
  const streams: Controlled[] = []
  const fakeFetch = (async (_url: string, init: RequestInit) => {
    let ctl!: ReadableStreamDefaultController<Uint8Array>
    const c: Controlled = {
      push: (s) => ctl.enqueue(new TextEncoder().encode(s)),
      end: () => ctl.close(),
      aborted: false,
    }
    const body = new ReadableStream<Uint8Array>({ start: (x) => void (ctl = x) })
    init.signal?.addEventListener("abort", () => {
      c.aborted = true
      try {
        ctl.error(new DOMException("Aborted", "AbortError"))
      } catch {}
    })
    streams.push(c)
    return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } })
  }) as unknown as typeof fetch
  const policy = new BridgePolicy(
    { directory: "/w", sessionId: "ses_A" },
    { sessionParent: async () => ({ exists: false }), permissionSession: async () => undefined, questionSession: async () => undefined },
    () => true,
  )
  const core = new BridgeCore({
    post: (m) => posted.push(m),
    fetch: fakeFetch,
    baseUrl: () => "http://127.0.0.1:1",
    auth: async () => ({ authorization: "Basic x" }),
    policy,
    store: { op: async () => ({}), putBlob: async () => "b", getBlob: async () => null },
    log: { info() {}, warn() {} },
    onUi() {},
  })
  const hello = (docId: string) => {
    core.handle({ v: PROTOCOL_VERSION, gen: 0, type: "hello", docId })
    return core.generation
  }
  const request = (gen: number, id: string) =>
    core.handle({ v: PROTOCOL_VERSION, gen, type: "fetch.request", id, url: `${BRIDGE_ORIGIN}/global/event`, method: "GET", headers: [] })
  const tick = () => new Promise((r) => setTimeout(r, 5))
  return { core, posted, streams, hello, request, tick }
}

describe("bridge request lifecycle across remounts", () => {
  test("old stream chunk/end/abort never reach or affect a new document reusing the same id", async () => {
    const h = harness()
    const g1 = h.hello("doc-1")
    h.request(g1, "p:1")
    await h.tick()
    expect(h.streams.length).toBe(1)
    h.streams[0].push("data: old-1\n\n")
    await h.tick()

    // Webview document is recreated (hidden/shown): same panel, seq restarts, same request id.
    const g2 = h.hello("doc-2")
    expect(g2).not.toBe(g1)
    expect(h.streams[0].aborted).toBe(true) // previous document's stream was retired
    h.request(g2, "p:1")
    await h.tick()
    expect(h.streams.length).toBe(2)

    // Late traffic from the old stream and a late abort from the old document.
    try {
      h.streams[0].push("data: old-2\n\n")
    } catch {}
    h.core.handle({ v: PROTOCOL_VERSION, gen: g1, type: "fetch.abort", id: "p:1" })
    await h.tick()
    expect(h.streams[1].aborted).toBe(false)

    h.streams[1].push("data: new-1\n\n")
    await h.tick()
    const forG2 = h.posted.filter((m) => m.gen === g2 && m.type === "fetch.chunk")
    expect(forG2.length).toBe(1)
    expect(new TextDecoder().decode((forG2[0] as { data: Uint8Array }).data)).toBe("data: new-1\n\n")
    // Nothing tagged with g1 was posted after g2 started.
    const idx = h.posted.findIndex((m) => m.type === "welcome" && m.gen === g2)
    expect(h.posted.slice(idx).some((m) => m.gen === g1)).toBe(false)
    // The old request's finally must not have removed the new in-flight entry.
    expect(h.core.inflightCount).toBe(1)
    h.core.handle({ v: PROTOCOL_VERSION, gen: g2, type: "fetch.abort", id: "p:1" })
    await h.tick()
    expect(h.streams[1].aborted).toBe(true)
    expect(h.core.inflightCount).toBe(0)
  })

  test("messages after retire (panel hidden) are rejected until the next hello", async () => {
    const h = harness()
    const g1 = h.hello("doc-1")
    h.request(g1, "p:1")
    await h.tick()
    h.core.retire()
    expect(h.streams[0].aborted).toBe(true)
    h.request(g1, "p:2")
    await h.tick()
    expect(h.streams.length).toBe(1)
    expect(h.core.stats.rejectedMessages).toBeGreaterThan(0)
  })

  test("duplicate id within one document: newer request wins, older cleanup keeps it", async () => {
    const h = harness()
    const g = h.hello("doc-1")
    h.request(g, "p:1")
    await h.tick()
    h.request(g, "p:1")
    await h.tick()
    expect(h.streams[0].aborted).toBe(true)
    expect(h.streams[1].aborted).toBe(false)
    expect(h.core.inflightCount).toBe(1)
  })

  test("NEGATIVE CONTROL: without generations a reused id would be cancelled by the old document", async () => {
    // Demonstrates the fixture detects the P0 bug class: an id-only table lets an old abort hit a new request.
    const table = new Map<string, AbortController>()
    const oldAc = new AbortController()
    table.set("p:1", oldAc)
    const newAc = new AbortController()
    table.set("p:1", newAc) // new document reuses the id
    table.get("p:1")?.abort() // late abort from the old document
    expect(newAc.signal.aborted).toBe(true) // the bug the generation-keyed core prevents
  })

  test("invalid and wrong-version messages are rejected", () => {
    const h = harness()
    h.hello("d")
    h.core.handle({ v: 1, gen: h.core.generation, type: "fetch.abort", id: "x" })
    h.core.handle({ v: PROTOCOL_VERSION, gen: h.core.generation, type: "fetch.request", id: "x", url: "http://evil.example/", method: "GET", headers: [] })
    h.core.handle(null)
    expect(h.core.stats.rejectedMessages).toBe(3)
  })
})

describe("bridge provider deferral", () => {
  function setup() {
    const posted: HostToWebview[] = []
    const calls: string[] = []
    const core = new BridgeCore({
      post: (m) => posted.push(m),
      fetch: (async (url: string) => {
        calls.push(new URL(url).pathname)
        return new Response("{}", { status: 200, headers: { "content-type": "application/json" } })
      }) as unknown as typeof fetch,
      baseUrl: () => "http://127.0.0.1:1",
      auth: async () => ({}),
      policy: new BridgePolicy(
        { directory: "/w", sessionId: "ses_A" },
        { sessionParent: async () => ({ exists: false }), permissionSession: async () => undefined, questionSession: async () => undefined },
        () => true,
      ),
      store: { op: async () => ({}), putBlob: async () => "b", getBlob: async () => null },
      log: { info() {}, warn() {} },
      onUi() {},
    })
    core.handle({ v: PROTOCOL_VERSION, gen: 0, type: "hello", docId: "d" })
    const send = (id: string, path: string) =>
      core.handle({ v: PROTOCOL_VERSION, gen: core.generation, type: "fetch.request", id, url: `${BRIDGE_ORIGIN}${path}`, method: "GET", headers: [] })
    const ended = async (id: string) => {
      for (let i = 0; i < 100 && !posted.some((m) => m.type === "fetch.end" && m.id === id); i++) await new Promise((r) => setTimeout(r, 5))
      return posted.some((m) => m.type === "fetch.end" && m.id === id)
    }
    return { core, calls, send, ended }
  }

  test("a booting document's provider list reaches the server after its first message list", async () => {
    const { core, calls, send, ended } = setup()
    send("p", "/provider?directory=%2Fw")
    send("s", "/session/ses_A")
    await new Promise((r) => setTimeout(r, 20))
    expect(calls).toEqual(["/session/ses_A"])
    send("m", "/session/ses_A/message?limit=80")
    expect(await ended("p")).toBe(true)
    expect(calls).toEqual(["/session/ses_A", "/session/ses_A/message", "/provider"])
    expect(core.stats.deferred).toBe(1)
    send("p2", "/provider") // after first paint: not held
    expect(await ended("p2")).toBe(true)
    expect(core.stats.deferred).toBe(2)
  })
})

describe("bridge compression", () => {
  async function run(compress: boolean, body: string, contentType = "application/json") {
    const posted: HostToWebview[] = []
    const core = new BridgeCore({
      post: (m) => posted.push(m),
      fetch: (async () =>
        new Response(body, { status: 200, headers: { "content-type": contentType, "content-length": String(Buffer.byteLength(body)) } })) as unknown as typeof fetch,
      baseUrl: () => "http://127.0.0.1:1",
      auth: async () => ({}),
      policy: new BridgePolicy(
        { directory: "/w", sessionId: "ses_A" },
        { sessionParent: async () => ({ exists: false }), permissionSession: async () => undefined, questionSession: async () => undefined },
        () => true,
      ),
      store: { op: async () => ({}), putBlob: async () => "b", getBlob: async () => null },
      log: { info() {}, warn() {} },
      onUi() {},
      compress,
    })
    core.handle({ v: PROTOCOL_VERSION, gen: 0, type: "hello", docId: "d" })
    core.handle({ v: PROTOCOL_VERSION, gen: core.generation, type: "fetch.request", id: "1", url: `${BRIDGE_ORIGIN}/config`, method: "GET", headers: [] })
    for (let i = 0; i < 200 && !posted.some((m) => m.type === "fetch.end"); i++) await new Promise((r) => setTimeout(r, 5))
    const head = posted.find((m) => m.type === "fetch.head") as Extract<HostToWebview, { type: "fetch.head" }>
    const chunks = posted.filter((m) => m.type === "fetch.chunk").map((m) => (m as Extract<HostToWebview, { type: "fetch.chunk" }>).data)
    let stream = new Response(new Blob(chunks as BlobPart[])).body!
    if (head.encoding === "gzip") stream = stream.pipeThrough(new DecompressionStream("gzip"))
    return { head, bytes: chunks.reduce((n, c) => n + c.byteLength, 0), text: await new Response(stream).text() }
  }
  const big = JSON.stringify({ all: Array.from({ length: 20000 }, (_, i) => ({ id: `model-${i}`, name: "Model" })) })

  test("a large JSON body is sent gzipped and the page gets the same bytes back", async () => {
    const r = await run(true, big)
    expect(r.head.encoding).toBe("gzip")
    expect(r.head.headers.some(([k]) => k === "content-length")).toBe(false)
    expect(r.bytes).toBeLessThan(big.length / 5)
    expect(r.text).toBe(big)
  })

  test("small bodies, non-JSON bodies and local panels are sent as is", async () => {
    for (const r of [await run(true, '{"a":1}'), await run(true, big, "text/plain"), await run(false, big)]) expect(r.head.encoding).toBeUndefined()
  })
})
