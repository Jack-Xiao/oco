// oco host <-> chat webview bridge protocol (v2, P1a).
//
// Document identity: every webview *document* (initial render, re-creation after hide, reload) starts
// with `hello { docId }`; the host answers `welcome { generation }` and from then on both sides tag
// every message with that generation. The host only accepts the panel's current generation and
// answers each request with the generation it was created under, so a late chunk/end/abort from an
// older document can never reach or affect a newer one, even if request ids repeat.

export const PROTOCOL_VERSION = 2

/** Virtual, non-loopback origin the official app talks to. The host maps it to the real server.
 * Non-loopback http is required so the app routes its SSE stream through platform.fetch
 * (vendor/opencode/packages/app/src/context/server-sdk.tsx:191-199). */
export const BRIDGE_ORIGIN = "http://oco.bridge"

export type SessionBinding = {
  connectionId: string
  directory: string
  sessionId: string
}

export type WebviewInit = {
  panelId: string
  binding: SessionBinding
  serverUrl: typeof BRIDGE_ORIGIN
  locale?: string
  /** VS Code theme kind when the page was generated (the page then follows the body theme class). */
  colorScheme?: "light" | "dark"
  /** ADR-007: "main" follows the sidebar (the host may switch its session), "pinned" keeps one session. */
  role?: PanelRole
}

export type PanelRole = "main" | "pinned"

type Envelope<T extends string, P> = { v: typeof PROTOCOL_VERSION; gen: number; type: T } & P
export type Omit2<T> = T extends unknown ? Omit<T, "v" | "gen"> : never

export type UiAction =
  | "openExternal"
  | "notify"
  | "title"
  | "openSession"
  | "blockedNavigation"
  | "openFile"
  | "reload"
  // T010 recovery screen: fixed host operations, no arguments.
  | "retryConnection"
  | "openSettings"
  | "showSessions"
  | "newSession"
  | "closePanel"
  // The page first shows the session (or an error / recovery view); handled by the bridge itself.
  | "painted"

// webview -> host
export type Hello = Envelope<"hello", { docId: string }>
export type FetchRequest = Envelope<
  "fetch.request",
  { id: string; url: string; method: string; headers: [string, string][]; body?: ArrayBuffer }
>
export type FetchAbort = Envelope<"fetch.abort", { id: string }>
export type StoreOp = Envelope<
  "store.op",
  { id: string; op: "get" | "set" | "remove" | "clear" | "keys" | "snapshot"; name: string; key?: string; value?: string }
>
export type BlobOp = Envelope<"blob.op", { id: string; op: "put" | "get"; blobId?: string; data?: ArrayBuffer }>
/** `openFile`: `path` is relative to the bound session directory (or absolute inside it); the host
 * validates it and never opens anything outside that directory. `line`/`column` are 1-based. Without
 * `line`, a path that does not exist literally may carry `:line[:col]` or `#Lline[Ccol]`, which the
 * host parses. The host opens files only when it can confirm the server path is this machine's file.
 * `focusAgeMs` (openFile only): ms since the page's window last gained focus, if it ever did. The host uses it
 * to let VS Code report a focus the requesting click just gave the webview before it opens the file. */
export type Ui = Envelope<
  "ui",
  { action: UiAction; url?: string; title?: string; body?: string; sessionId?: string; route?: string; path?: string; line?: number; column?: number; focusAgeMs?: number }
>
export type DraftAck = Envelope<"draft.ack", { id: string; ok: boolean; reason?: string }>
export type Ready = Envelope<"ready", { route: string }>
export type WebviewToHost = Hello | FetchRequest | FetchAbort | StoreOp | BlobOp | Ui | DraftAck | Ready

// host -> webview
export type Welcome = Envelope<"welcome", { docId: string }>
/** `encoding: "gzip"`: the chunks are the gzip of the body (large responses over Remote; the page decompresses). */
export type FetchHead = Envelope<"fetch.head", { id: string; status: number; statusText: string; headers: [string, string][]; encoding?: "gzip" }>
export type FetchChunk = Envelope<"fetch.chunk", { id: string; data: Uint8Array }>
export type FetchEnd = Envelope<"fetch.end", { id: string }>
export type FetchError = Envelope<"fetch.error", { id: string; message: string; aborted?: boolean; status?: number }>
export type StoreResult = Envelope<
  "store.result",
  { id: string; value?: string | null; keys?: string[]; entries?: [string, string][]; blobId?: string; data?: Uint8Array | null; error?: string }
>
export type DraftInsert = Envelope<
  "draft.insert",
  { id: string; sessionId: string; text: string; source: { path: string; startLine: number; endLine: number; unsaved: boolean } }
>
/** Host connection state for this panel (T010). `state` is the host's feed state; `bound` is false when the host
 * is now connected somewhere else than the panel's binding. Carries no address, credentials or server text. */
export type ConnectionNotice = Envelope<
  "connection",
  { state: "connected" | "connecting" | "reconnecting" | "error" | "unauthorized" | "unconfigured"; bound: boolean }
>
/** ADR-007: the host switched this panel to another session of the same connection and directory. The page's
 * route guard accepts only the session the host last sent; the page never picks its own session. */
export type Navigate = Envelope<"navigate", { sessionId: string; review?: { file?: string } }>
export type HostToWebview = Welcome | FetchHead | FetchChunk | FetchEnd | FetchError | StoreResult | DraftInsert | ConnectionNotice | Navigate

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v)
const isStr = (v: unknown): v is string => typeof v === "string"
const isId = (v: unknown): v is string => isStr(v) && v.length > 0 && v.length <= 200
const isHeaders = (v: unknown): v is [string, string][] =>
  Array.isArray(v) && v.length <= 200 && v.every((h) => Array.isArray(h) && h.length === 2 && isStr(h[0]) && isStr(h[1]))

const METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"])
const STORE_OPS = new Set(["get", "set", "remove", "clear", "keys", "snapshot"])
const UI_ACTIONS = new Set<UiAction>([
  "openExternal",
  "notify",
  "title",
  "openSession",
  "blockedNavigation",
  "openFile",
  "reload",
  "retryConnection",
  "openSettings",
  "showSessions",
  "newSession",
  "closePanel",
  "painted",
])
const isPos = (v: unknown) => v === undefined || (typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 10_000_000)

/** Runtime validation of untrusted webview messages. Returns null when invalid. */
export function parseWebviewMessage(raw: unknown): WebviewToHost | null {
  if (!isObj(raw) || raw.v !== PROTOCOL_VERSION || typeof raw.gen !== "number" || !Number.isInteger(raw.gen) || !isStr(raw.type))
    return null
  switch (raw.type) {
    case "hello":
      return isId(raw.docId) ? (raw as unknown as Hello) : null
    case "fetch.request": {
      if (!isId(raw.id) || !isStr(raw.url) || !isStr(raw.method) || !METHODS.has(raw.method)) return null
      if (!isHeaders(raw.headers)) return null
      if (raw.body !== undefined && !(raw.body instanceof ArrayBuffer) && !ArrayBuffer.isView(raw.body)) return null
      // Only the virtual bridge origin is accepted: the bridge never fetches arbitrary URLs.
      if (bridgeTarget(raw.url) === null) return null
      return raw as unknown as FetchRequest
    }
    case "fetch.abort":
      return isId(raw.id) ? (raw as unknown as FetchAbort) : null
    case "store.op":
      if (!isId(raw.id) || !isStr(raw.op) || !STORE_OPS.has(raw.op) || !isStr(raw.name) || raw.name.length > 300) return null
      if (raw.key !== undefined && !isStr(raw.key)) return null
      if (raw.value !== undefined && !isStr(raw.value)) return null
      return raw as unknown as StoreOp
    case "blob.op":
      if (!isId(raw.id) || (raw.op !== "put" && raw.op !== "get")) return null
      if (raw.op === "get" && !isStr(raw.blobId)) return null
      if (raw.op === "put" && !(raw.data instanceof ArrayBuffer) && !ArrayBuffer.isView(raw.data)) return null
      return raw as unknown as BlobOp
    case "ui":
      if (!isStr(raw.action) || !UI_ACTIONS.has(raw.action as UiAction)) return null
      for (const k of ["url", "title", "body", "sessionId", "route"] as const)
        if (raw[k] !== undefined && (!isStr(raw[k]) || (raw[k] as string).length > 2000)) return null
      if (raw.path !== undefined && (!isStr(raw.path) || raw.path.length > 4096)) return null
      if (!isPos(raw.line) || !isPos(raw.column)) return null
      if (raw.action === "openFile" && !isStr(raw.path)) return null
      if (raw.focusAgeMs !== undefined && !(typeof raw.focusAgeMs === "number" && Number.isFinite(raw.focusAgeMs) && raw.focusAgeMs >= 0)) return null
      return raw as unknown as Ui
    case "draft.ack":
      return isId(raw.id) && typeof raw.ok === "boolean" ? (raw as unknown as DraftAck) : null
    case "ready":
      return isStr(raw.route) ? (raw as unknown as Ready) : null
  }
  return null
}

/** Parses a bridge URL into pathname + search params. Rejects anything that is not the virtual origin. */
export function bridgeTarget(url: string): { pathname: string; search: URLSearchParams } | null {
  if (!url.startsWith(BRIDGE_ORIGIN + "/")) return null
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return null
  }
  if (u.origin !== BRIDGE_ORIGIN || u.username || u.password) return null
  return { pathname: u.pathname, search: u.searchParams }
}

export * from "./sessions"
