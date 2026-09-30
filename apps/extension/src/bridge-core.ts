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
}

type Inflight = { gen: number; ac: AbortController }

let generationSeq = 0 // process-wide: generations are never reused across panels or documents

export class BridgeCore {
  private readonly inflight = new Map<string, Inflight>()
  generation = 0 // 0 = no live document
  docId: string | undefined
  stats = { requests: 0, streamsOpen: 0, rejectedMessages: 0, rejectedRequests: 0, staleDropped: 0, retired: 0, generations: 0 }

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
      const res = await this.deps.fetch(this.deps.baseUrl() + decision.path, {
        method: msg.method,
        headers,
        body: msg.body ? new Uint8Array(msg.body as ArrayBuffer) : undefined,
        signal: entry.ac.signal,
        redirect: "manual", // never forward credentials to a redirect target
      })
      const sse = (res.headers.get("content-type") ?? "").includes("text/event-stream")
      this.deps.log.info(`${label} -> ${res.status}${sse ? " (stream)" : ""}`)
      this.send(gen, { type: "fetch.head", id: msg.id, status: res.status, statusText: res.statusText, headers: [...res.headers.entries()] })
      if (res.body) {
        if (sse) this.stats.streamsOpen++
        try {
          for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
            if (entry.ac.signal.aborted || gen !== this.generation) break
            if (sse) this.deps.onSseChunk?.(k, chunk)
            this.send(gen, { type: "fetch.chunk", id: msg.id, data: chunk })
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
