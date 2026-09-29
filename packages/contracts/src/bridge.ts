// oco host <-> chat webview bridge protocol (P0).
// Every message carries the protocol version and the panel epoch; the host drops
// messages from stale epochs (panel re-bound / restored) and anything that fails validation.

export const PROTOCOL_VERSION = 1

/** Virtual, non-loopback origin the official app talks to. The host maps it to the real server.
 * Non-loopback http is required so the app routes its SSE stream through platform.fetch
 * (vendor/opencode/packages/app/src/context/server-sdk.tsx:191-199). */
export const BRIDGE_ORIGIN = "http://oco.bridge"

export type PanelIdentity = { panelId: string; epoch: number }

export type SessionBinding = {
  connectionId: string
  directory: string
  sessionId: string
}

export type WebviewInit = PanelIdentity & {
  binding: SessionBinding
  serverUrl: typeof BRIDGE_ORIGIN
  locale?: string
}

type Envelope<T extends string, P> = { v: typeof PROTOCOL_VERSION; epoch: number; type: T } & P

// webview -> host
export type FetchRequest = Envelope<
  "fetch.request",
  { id: string; url: string; method: string; headers: [string, string][]; body?: ArrayBuffer }
>
export type FetchAbort = Envelope<"fetch.abort", { id: string }>
export type StoreOp = Envelope<
  "store.op",
  { id: string; op: "get" | "set" | "remove" | "clear" | "keys"; name: string; key?: string; value?: string }
>
export type BlobOp = Envelope<"blob.op", { id: string; op: "put" | "get"; blobId?: string; data?: ArrayBuffer }>
export type UiAction = Envelope<
  "ui",
  { action: "ready" | "openExternal" | "notify" | "title"; url?: string; title?: string; body?: string }
>
export type WebviewToHost = FetchRequest | FetchAbort | StoreOp | BlobOp | UiAction

// host -> webview
export type FetchHead = Envelope<"fetch.head", { id: string; status: number; statusText: string; headers: [string, string][] }>
export type FetchChunk = Envelope<"fetch.chunk", { id: string; data: Uint8Array }>
export type FetchEnd = Envelope<"fetch.end", { id: string }>
export type FetchError = Envelope<"fetch.error", { id: string; message: string; aborted?: boolean }>
export type StoreResult = Envelope<"store.result", { id: string; value?: string | null; keys?: string[]; blobId?: string; data?: Uint8Array | null; error?: string }>
export type DraftInsert = Envelope<
  "draft.insert",
  { id: string; text: string; source: { path: string; startLine: number; endLine: number; unsaved: boolean } }
>
export type HostToWebview = FetchHead | FetchChunk | FetchEnd | FetchError | StoreResult | DraftInsert

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v)
const isStr = (v: unknown): v is string => typeof v === "string"
const isHeaders = (v: unknown): v is [string, string][] =>
  Array.isArray(v) && v.every((h) => Array.isArray(h) && h.length === 2 && isStr(h[0]) && isStr(h[1]))

const METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"])
const STORE_OPS = new Set(["get", "set", "remove", "clear", "keys"])
const UI_ACTIONS = new Set(["ready", "openExternal", "notify", "title"])

/** Runtime validation of untrusted webview messages. Returns null when invalid. */
export function parseWebviewMessage(raw: unknown): WebviewToHost | null {
  if (!isObj(raw) || raw.v !== PROTOCOL_VERSION || typeof raw.epoch !== "number" || !isStr(raw.type)) return null
  switch (raw.type) {
    case "fetch.request": {
      if (!isStr(raw.id) || !isStr(raw.url) || !isStr(raw.method) || !METHODS.has(raw.method)) return null
      if (!isHeaders(raw.headers)) return null
      if (raw.body !== undefined && !(raw.body instanceof ArrayBuffer) && !ArrayBuffer.isView(raw.body)) return null
      // Only the virtual bridge origin is accepted: the bridge never fetches arbitrary URLs.
      if (!raw.url.startsWith(BRIDGE_ORIGIN + "/")) return null
      return raw as unknown as FetchRequest
    }
    case "fetch.abort":
      return isStr(raw.id) ? (raw as unknown as FetchAbort) : null
    case "store.op":
      if (!isStr(raw.id) || !isStr(raw.op) || !STORE_OPS.has(raw.op) || !isStr(raw.name)) return null
      if (raw.key !== undefined && !isStr(raw.key)) return null
      if (raw.value !== undefined && !isStr(raw.value)) return null
      return raw as unknown as StoreOp
    case "blob.op":
      if (!isStr(raw.id) || (raw.op !== "put" && raw.op !== "get")) return null
      if (raw.op === "get" && !isStr(raw.blobId)) return null
      return raw as unknown as BlobOp
    case "ui":
      if (!isStr(raw.action) || !UI_ACTIONS.has(raw.action)) return null
      return raw as unknown as UiAction
  }
  return null
}

/** Maps a bridge URL to a path+query on the real server. Rejects anything else. */
export function bridgePath(url: string): string | null {
  if (!url.startsWith(BRIDGE_ORIGIN + "/")) return null
  const u = new URL(url)
  if (u.origin !== BRIDGE_ORIGIN) return null
  return u.pathname + u.search
}
