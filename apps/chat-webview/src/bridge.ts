// Webview side of the oco host bridge. The webview never sees server credentials:
// requests go to the virtual BRIDGE_ORIGIN and the extension host forwards them.
//
// Each document introduces itself with a random docId (`hello`); the host replies `welcome` with a
// generation. Everything sent before the welcome is queued; everything received for another
// generation is ignored, so a recreated document never sees an older document's traffic.
import { PROTOCOL_VERSION, type HostToWebview, type Omit2, type UiAction, type WebviewInit, type WebviewToHost } from "@oco/contracts"

type VsCodeApi = { postMessage(msg: unknown): void; getState(): unknown; setState(s: unknown): void }
declare function acquireVsCodeApi(): VsCodeApi

export const vscode = acquireVsCodeApi()
export const init = (window as unknown as { __OCO_INIT__: WebviewInit }).__OCO_INIT__
const docId = crypto.randomUUID()
let generation = 0
const outbox: Omit2<WebviewToHost>[] = []

type Pending = {
  head?: (h: Extract<HostToWebview, { type: "fetch.head" }>) => void
  chunk?: (c: Uint8Array) => void
  end?: () => void
  error?: (message: string, aborted?: boolean) => void
  result?: (r: Extract<HostToWebview, { type: "store.result" }>) => void
}
const pending = new Map<string, Pending>()
let seq = 0
const nextId = () => `${docId.slice(0, 8)}:${++seq}`

function post(msg: Omit2<WebviewToHost>) {
  if (!generation) {
    outbox.push(msg)
    return
  }
  vscode.postMessage({ ...msg, v: PROTOCOL_VERSION, gen: generation })
}

const draftListeners = new Set<(m: Extract<HostToWebview, { type: "draft.insert" }>) => void>()
export const onDraftInsert = (fn: (m: Extract<HostToWebview, { type: "draft.insert" }>) => void) => {
  draftListeners.add(fn)
  return () => draftListeners.delete(fn)
}

const welcomed = Promise.withResolvers<void>()
export const connected = welcomed.promise

window.addEventListener("message", (event) => {
  const msg = event.data as HostToWebview
  if (!msg || msg.v !== PROTOCOL_VERSION) return
  if (msg.type === "welcome") {
    if (msg.docId !== docId || generation) return
    generation = msg.gen
    for (const m of outbox.splice(0)) post(m)
    welcomed.resolve()
    return
  }
  if (!generation || msg.gen !== generation) return
  if (msg.type === "draft.insert") {
    for (const fn of draftListeners) fn(msg)
    return
  }
  const p = pending.get(msg.id)
  if (!p) return
  switch (msg.type) {
    case "fetch.head":
      p.head?.(msg)
      return
    case "fetch.chunk":
      p.chunk?.(msg.data)
      return
    case "fetch.end":
      pending.delete(msg.id)
      p.end?.()
      return
    case "fetch.error":
      pending.delete(msg.id)
      p.error?.(msg.message, msg.aborted)
      return
    case "store.result":
      pending.delete(msg.id)
      p.result?.(msg)
      return
  }
})

vscode.postMessage({ v: PROTOCOL_VERSION, gen: 0, type: "hello", docId })

/** fetch() replacement: serialises the request, streams the response body back incrementally. */
export const bridgeFetch: typeof fetch = async (input, init2) => {
  const req = input instanceof Request ? input : new Request(input, init2)
  const signal = init2?.signal ?? req.signal
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError")
  const body = req.method === "GET" || req.method === "HEAD" ? undefined : await req.arrayBuffer()
  const id = nextId()
  return new Promise<Response>((resolve, reject) => {
    let controller!: ReadableStreamDefaultController<Uint8Array>
    let settled = false
    const stream = new ReadableStream<Uint8Array>({
      start: (c) => {
        controller = c
      },
      cancel: () => {
        if (pending.has(id)) post({ type: "fetch.abort", id })
        pending.delete(id)
      },
    })
    const onAbort = () => {
      if (!pending.has(id)) return
      post({ type: "fetch.abort", id })
      pending.delete(id)
      const err = new DOMException("Aborted", "AbortError")
      if (!settled) reject(err)
      else
        try {
          controller.error(err)
        } catch {}
    }
    signal?.addEventListener("abort", onAbort, { once: true })
    pending.set(id, {
      head: (h) => {
        settled = true
        const nullBody = h.status === 204 || h.status === 205 || h.status === 304 || req.method === "HEAD"
        resolve(new Response(nullBody ? null : stream, { status: h.status, statusText: h.statusText, headers: h.headers }))
      },
      chunk: (c) => controller.enqueue(c),
      end: () => {
        signal?.removeEventListener("abort", onAbort)
        try {
          controller.close()
        } catch {}
      },
      error: (message, aborted) => {
        signal?.removeEventListener("abort", onAbort)
        const err = aborted ? new DOMException("Aborted", "AbortError") : new TypeError(message)
        if (!settled) reject(err)
        else
          try {
            controller.error(err)
          } catch {}
      },
    })
    post({ type: "fetch.request", id, url: req.url, method: req.method, headers: [...req.headers.entries()], body })
  })
}

function storeCall(op: "get" | "set" | "remove" | "clear" | "keys", name: string, key?: string, value?: string) {
  const id = nextId()
  return new Promise<Extract<HostToWebview, { type: "store.result" }>>((resolve, reject) => {
    pending.set(id, { result: (r) => (r.error ? reject(new Error(r.error)) : resolve(r)) })
    post({ type: "store.op", id, op, name, key, value })
  })
}

export function hostStorage(name: string) {
  const api = {
    getItem: async (key: string) => (await storeCall("get", name, key)).value ?? null,
    setItem: async (key: string, value: string) => void (await storeCall("set", name, key, value)),
    removeItem: async (key: string) => void (await storeCall("remove", name, key)),
    clear: async () => void (await storeCall("clear", name)),
    key: async (index: number) => (await storeCall("keys", name)).keys?.[index] ?? null,
    getLength: async () => (await storeCall("keys", name)).keys?.length ?? 0,
    get length() {
      return api.getLength()
    },
  }
  return api
}

export function blobPut(data: ArrayBuffer) {
  const id = nextId()
  return new Promise<string>((resolve, reject) => {
    pending.set(id, { result: (r) => (r.blobId ? resolve(r.blobId) : reject(new Error(r.error ?? "blob put failed"))) })
    post({ type: "blob.op", id, op: "put", data })
  })
}

export function blobGet(blobId: string) {
  const id = nextId()
  return new Promise<Uint8Array | null>((resolve, reject) => {
    pending.set(id, { result: (r) => (r.error ? reject(new Error(r.error)) : resolve(r.data ?? null)) })
    post({ type: "blob.op", id, op: "get", blobId })
  })
}

export const ui = (action: UiAction, extra: { url?: string; title?: string; body?: string; sessionId?: string; route?: string } = {}) =>
  post({ type: "ui", action, ...extra })

export const ready = (route: string) => post({ type: "ready", route })
export const draftAck = (id: string, ok: boolean, reason?: string) => post({ type: "draft.ack", id, ok, reason })
