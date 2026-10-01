// Host end of one panel's bridge (pure; no vscode import, unit-tested).
//
// Request lifecycle rules (P1a-01):
// - A document announces itself with `hello`; the core assigns a new generation and retires every
//   in-flight request of the previous generation (aborted, never answered to the new document).
// - Requests are keyed by (generation, id) and remember their own AbortController; replies carry the
//   generation the request was created under; cleanup only removes the entry if it is still the same one.
// - `retire()` (document replaced by a reload, or panel disposed) aborts everything and accepts no
//   messages until the next `hello`.
import {
  bridgeTarget,
  parseWebviewMessage,
  PROTOCOL_VERSION,
  type HostToWebview,
  type Omit2,
  type WebviewToHost,
} from "@oco/contracts"
import { Readable } from "node:stream"
import type { ReadableStream as NodeReadableStream } from "node:stream/web"
import zlib from "node:zlib"
import { BridgePolicy } from "./bridge-policy"

export type Store = {
  op(op: string, name: string, key?: string, value?: string): Promise<{ value?: string | null; keys?: string[]; entries?: [string, string][]; error?: string }>
  putBlob(data: Uint8Array): Promise<string>
  getBlob(id: string): Promise<Uint8Array | null>
}

export type CoreDeps = {
  post(msg: HostToWebview): void
  fetch: typeof fetch
  baseUrl(): string
  auth(): Promise<Record<string, string>>
  policy: BridgePolicy
  store: Store
  log: { info(m: string): void; warn(m: string): void }
  onUi(msg: Extract<WebviewToHost, { type: "ui" | "draft.ack" | "ready" }>): void
  onGeneration?(gen: number): void
  /** Observes proxied SSE bytes (read-only tap, e.g. for the tab title). */
  onSseChunk?(streamKey: string, chunk: Uint8Array): void
  /** Gzip large JSON bodies to the page (set when the webview is across a Remote connection). */
  compress?: boolean
  compressMinBytes?: number
}

type Inflight = { gen: number; ac: AbortController }

// On a large model catalog the provider list is ~1 s of single-threaded server time (several seconds on a server
// that just started); a request that reaches the server meanwhile waits for it. The first paint needs the session's
// messages, not the provider list, and sometimes more requests after the message list (the parents of assistant
// messages cut off by the page limit), so a booting document's provider requests are held until the page reports
// that it shows the session (ui "painted"), or DEFER_MS: the page reports within its skeleton timeout (main.tsx).
const DEFER_MS = 10_000
const DEFERRED = /^\/(api\/)?provider$/
const COMPRESS_MIN_BYTES = 32 * 1024
const NULL_BODY = new Set([101, 204, 205, 304])
let generationSeq = 0 // process-wide: generations are never reused across panels or documents

export class BridgeCore {
  private readonly inflight = new Map<string, Inflight>()
  generation = 0 // 0 = no live document
  docId: string | undefined
  stats = { requests: 0, streamsOpen: 0, rejectedMessages: 0, rejectedRequests: 0, staleDropped: 0, retired: 0, generations: 0, deferred: 0, shared: 0 }
  private firstPaint?: { gen: number; done: Promise<void>; open(): void }
  // Identical provider GETs from one document while the first is in flight share its response: a booting page asks
  // twice per URL, and each costs the single-threaded server 1-1.4 s, delaying whatever the user opens next.
  // Only in flight: nothing is reused once the response is in, and no read joins one that arrived before a write.
  private shared = new Map<string, Promise<Response>>()
  private writes = 0

  constructor(private readonly deps: CoreDeps) {}

  private key(gen: number, id: string) {
    return `${gen}\u0000${id}`
  }

  send(gen: number, msg: Omit2<HostToWebview>) {
    // Never deliver a reply for an older document to the current one.
    if (gen !== this.generation) {
      this.stats.staleDropped++
      return
    }
    this.deps.post({ ...msg, v: PROTOCOL_VERSION, gen } as HostToWebview)
  }

  /** Current document only (e.g. host-initiated draft insert). Returns false if no live document. */
  sendCurrent(msg: Omit2<HostToWebview>): boolean {
    if (!this.generation) return false
    this.send(this.generation, msg)
    return true
  }

  retire() {
    for (const [, f] of this.inflight) f.ac.abort()
    this.inflight.clear()
    if (this.generation) this.stats.retired++
    this.generation = 0
    this.docId = undefined
  }

  handle(raw: unknown) {
    const msg = parseWebviewMessage(raw)
    if (!msg) {
      this.stats.rejectedMessages++
      this.deps.log.warn("rejected invalid bridge message")
      return
    }
    if (msg.type === "hello") {
      this.retire()
      this.generation = ++generationSeq
      this.docId = msg.docId
      this.stats.generations++
      let open!: () => void
      const done = new Promise<void>((r) => (open = r))
      this.firstPaint = { gen: this.generation, done, open }
      this.deps.onGeneration?.(this.generation)
      this.send(this.generation, { type: "welcome", docId: msg.docId })
      return
    }
    if (!this.generation || msg.gen !== this.generation) {
      this.stats.rejectedMessages++
      return // message from a retired/older document
    }
    const gen = msg.gen
    switch (msg.type) {
      case "fetch.request":
        void this.fetch(gen, msg)
        return
      case "fetch.abort":
        this.inflight.get(this.key(gen, msg.id))?.ac.abort()
        return
      case "store.op":
        void this.deps.store
          .op(msg.op, msg.name, msg.key, msg.value)
          .then((r) => this.send(gen, { type: "store.result", id: msg.id, ...r }))
          .catch((e) => this.send(gen, { type: "store.result", id: msg.id, error: String((e as Error)?.message ?? e) }))
        return
      case "blob.op":
        void this.blob(gen, msg)
        return
      case "ui":
        if (msg.action === "painted") return void (this.firstPaint?.gen === gen && this.firstPaint.open())
        this.deps.onUi(msg)
        return
      case "draft.ack":
      case "ready":
        this.deps.onUi(msg)
        return
    }
  }

  private async fetch(gen: number, msg: Extract<WebviewToHost, { type: "fetch.request" }>) {
    const k = this.key(gen, msg.id)
    const prior = this.inflight.get(k)
    if (prior) prior.ac.abort() // duplicate id within one document: the newer request wins
    const entry: Inflight = { gen, ac: new AbortController() }
    this.inflight.set(k, entry)
    this.stats.requests++
    if (msg.method !== "GET" && msg.method !== "HEAD") this.writes++
    const writes = this.writes // in arrival order: policy checks below are async
    const target = bridgeTarget(msg.url)!
    const label = `${msg.method} ${target.pathname}`
    try {
      const decision = await this.deps.policy.decide(msg.method, target.pathname, target.search)
      if (!decision.ok) {
        this.stats.rejectedRequests++
        this.deps.log.warn(`${label} rejected: ${decision.reason}`)
        this.send(gen, {
          type: "fetch.head",
          id: msg.id,
          status: decision.status,
          statusText: "Forbidden",
          headers: [["content-type", "application/json"]],
        })
        this.send(gen, { type: "fetch.chunk", id: msg.id, data: new TextEncoder().encode(JSON.stringify({ error: `oco: ${decision.reason}` })) })
        this.send(gen, { type: "fetch.end", id: msg.id })
        return
      }
      if (entry.ac.signal.aborted) throw new DOMException("Aborted", "AbortError")
      const headers = BridgePolicy.forwardHeaders(msg.headers, decision.directory, await this.deps.auth())
      const gate = this.firstPaint?.gen === gen ? this.firstPaint : undefined
      if (gate && msg.method === "GET" && DEFERRED.test(target.pathname)) {
        this.stats.deferred++
        let timer: ReturnType<typeof setTimeout> | undefined
        await Promise.race([gate.done, new Promise<void>((r) => (timer = setTimeout(r, DEFER_MS)))])
        clearTimeout(timer)
        if (entry.ac.signal.aborted) throw new DOMException("Aborted", "AbortError")
      }
      const url = this.deps.baseUrl() + decision.path
      const init: RequestInit = {
        method: msg.method,
        headers,
        body: msg.body ? new Uint8Array(msg.body as ArrayBuffer) : undefined,
        signal: entry.ac.signal,
        redirect: "manual", // never forward credentials to a redirect target
      }
      const res =
        msg.method === "GET" && DEFERRED.test(target.pathname) ? await this.sharedFetch(`${gen}\u0000${writes}`, url, init, entry.ac.signal) : await this.deps.fetch(url, init)
      const sse = (res.headers.get("content-type") ?? "").includes("text/event-stream")
      this.deps.log.info(`${label} -> ${res.status}${sse ? " (stream)" : ""}`)
      // Over Remote every body byte crosses the tunnel; a provider list is several MB of JSON (~11x smaller gzipped).
      // The server compresses for fetch's default Accept-Encoding and fetch hands over the decoded body (content-length
      // is then the compressed size): such a body was big enough for the server to compress, so compress it again.
      const gzip =
        !!this.deps.compress && !!res.body && !sse && (res.headers.get("content-type") ?? "").includes("json") &&
        (res.headers.has("content-encoding") || Number(res.headers.get("content-length")) >= (this.deps.compressMinBytes ?? COMPRESS_MIN_BYTES))
      const resHeaders = [...res.headers.entries()].filter(([k]) => !gzip || (k !== "content-length" && k !== "content-encoding"))
      this.send(gen, { type: "fetch.head", id: msg.id, status: res.status, statusText: res.statusText, headers: resHeaders, ...(gzip ? { encoding: "gzip" as const } : {}) })
      if (res.body) {
        if (sse) this.stats.streamsOpen++
        const body = gzip
          ? Readable.fromWeb(res.body as unknown as NodeReadableStream).compose(zlib.createGzip({ level: 1 }))
          : (res.body as unknown as AsyncIterable<Uint8Array>)
        try {
          for await (const chunk of body as AsyncIterable<Uint8Array>) {
            if (entry.ac.signal.aborted || gen !== this.generation) break
            if (sse) this.deps.onSseChunk?.(k, chunk)
            // zlib output chunks are views into a shared buffer; postMessage needs each one standalone.
            this.send(gen, { type: "fetch.chunk", id: msg.id, data: gzip ? new Uint8Array(chunk) : chunk })
          }
        } finally {
          if (sse) this.stats.streamsOpen--
        }
      }
      if (entry.ac.signal.aborted) throw new DOMException("Aborted", "AbortError")
      this.send(gen, { type: "fetch.end", id: msg.id })
    } catch (e) {
      const aborted = entry.ac.signal.aborted
      if (!aborted) this.deps.log.warn(`${label} failed: ${(e as Error).message}`)
      this.send(gen, { type: "fetch.error", id: msg.id, message: aborted ? "aborted" : "network error", aborted })
    } finally {
      // Identity check: a newer request that reused the key must not be removed by this one's cleanup.
      if (this.inflight.get(k) === entry) this.inflight.delete(k)
    }
  }

  /** One server request per identical in-flight GET (see `shared`); each caller gets its own copy of the body. */
  private async sharedFetch(round: string, url: string, init: RequestInit, signal: AbortSignal) {
    const key = `${round}\u0000${url}\u0000${JSON.stringify([...new Headers(init.headers).entries()])}`
    let p = this.shared.get(key)
    if (p) this.stats.shared++
    else {
      // Not tied to the first caller's signal: another caller may still want the response.
      const done = this.deps.fetch(url, { ...init, signal: undefined }).then(async (r) => new Response(NULL_BODY.has(r.status) ? null : await r.arrayBuffer(), r))
      p = done.finally(() => this.shared.get(key) === p && this.shared.delete(key))
      this.shared.set(key, p)
    }
    const res = await p
    if (signal.aborted) throw new DOMException("Aborted", "AbortError")
    return res.clone()
  }

  private async blob(gen: number, msg: Extract<WebviewToHost, { type: "blob.op" }>) {
    try {
      if (msg.op === "put") {
        const data = msg.data instanceof ArrayBuffer ? new Uint8Array(msg.data) : new Uint8Array((msg.data as unknown as ArrayBufferView).buffer)
        this.send(gen, { type: "store.result", id: msg.id, blobId: await this.deps.store.putBlob(data) })
      } else {
        this.send(gen, { type: "store.result", id: msg.id, data: await this.deps.store.getBlob(msg.blobId!) })
      }
    } catch (e) {
      this.send(gen, { type: "store.result", id: msg.id, error: (e as Error).message })
    }
  }

  get inflightCount() {
    return this.inflight.size
  }
}
