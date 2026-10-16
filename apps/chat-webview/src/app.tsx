// oco chat webview app: mounts the official OpenCode v1 app (vendored, pinned SHA) for ONE session.
// Loaded by main.tsx after the panel-scoped localStorage shim is installed.
// Modelled on vendor/opencode/packages/desktop/src/renderer/index.tsx, with a VS Code Platform.
//
// Panel identity (P1a-01, ADR-007): the memory router only ever holds the current session route. Any
// navigation (internal tabs, shortcuts, deep links, child-session links, persisted tabs) is intercepted
// in the router history: another session becomes a host "openSession" request (the host validates it
// and either switches this panel with a "navigate" message or opens/focuses another panel); everything
// else is refused. The page itself never changes session: only the host's "navigate" does.
import {
  AppBaseProviders,
  AppInterface,
  createDraftStore,
  PlatformProvider,
  ServerConnection,
  type Platform,
} from "@opencode-ai/app"
import { detectDesktopNativeLocale } from "@opencode-ai/app/i18n/desktop-native"
import { base64Decode, base64Encode } from "@opencode-ai/core/util/encode"
import { createMemoryHistory, MemoryRouter, type BaseRouterProps } from "@solidjs/router"
import { render } from "solid-js/web"
import { blobGet, blobPut, bridgeFetch, currentGeneration, draftAck, hostStorage, init, onDraftInsert, onNavigate, ready, ui, vscode } from "./bridge"
import type { HostToWebview } from "@oco/contracts"
import { storageStats } from "./local-storage"
import { ConnectionBanner, RecoveryView } from "./recovery"
import { installSubmitStatus, submitStats } from "./submit-status"
import { themeStats } from "./theme"

const root = document.getElementById("root")!
const serverKey = ServerConnection.Key.make(init.serverUrl)
// The session this panel shows. Starts at the init binding; changed only by the host's "navigate".
const bound = { ...init.binding }
const routeFor = (sessionId: string) => `/server/${base64Encode(serverKey)}/session/${sessionId}`
// patches/opencode/0023: a draft panel starts on the legacy "/<dir>/session" route; the app turns it into a
// /new-session?draftId=… page. Its first message creates the session the panel then shows ("promoted").
const draftRoute = `/${base64Encode(bound.directory)}/session`
const boundRoute = bound.draft ? draftRoute : routeFor(bound.sessionId)
const stats = ((window as unknown as { __OCO_STATS__: Record<string, number> }).__OCO_STATS__ ??= {})
stats.blockedNavigation = 0
stats.openSessionRequests = 0
stats.navigations = 0

type RouteClass = { kind: "bound" } | { kind: "session"; id: string } | { kind: "other" }

/** Classifies a router target against the panel binding. */
export function classifyRoute(target: string): RouteClass {
  const path = target.split(/[?#]/)[0]
  const parts = path.split("/").filter(Boolean)
  const decode = (v: string) => {
    try {
      return base64Decode(v)
    } catch {
      return undefined
    }
  }
  // /server/<b64 server key>/session/<id>
  if (parts.length === 4 && parts[0] === "server" && parts[2] === "session") {
    if (decode(parts[1]) !== serverKey) return { kind: "other" }
    return parts[3] === bound.sessionId ? { kind: "bound" } : { kind: "session", id: parts[3] }
  }
  // legacy /<b64 directory>/session/<id>
  if (parts.length === 3 && parts[1] === "session") {
    if (decode(parts[0]) !== bound.directory) return { kind: "other" }
    return parts[2] === bound.sessionId ? { kind: "bound" } : { kind: "session", id: parts[2] }
  }
  return { kind: "other" }
}

// When this document last gained focus; sent with openFile so the host can tell whether the click that asked
// for the file also just focused the webview (see Panels.settleWebviewFocus).
let focusedAt: number | undefined
window.addEventListener("focus", () => (focusedAt = performance.now()))
const focusAgeMs = () => (focusedAt === undefined ? undefined : Math.round(performance.now() - focusedAt))

const storageCache = new Map<string, ReturnType<typeof hostStorage>>()
const platform: Platform = {
  platform: "web",
  version: "oco-p1a",
  embedded: true, // patches/opencode/0002: no tabs/home/new-session/terminal entry points
  embeddedDirectory: init.binding.directory, // patches/opencode/0015: the session mounts before its info arrives
  embeddedFolders: init.folders, // patches/opencode/0023: the new-session page picks among these folders only
  windowID: init.panelId,
  openExternal: (url) => ui("openExternal", { url }),
  // patches/opencode/0005: file names in tool parts open in VS Code; the host validates the path.
  openFileInHost: (path, line) =>
    ui("openFile", { path, line: Number.isInteger(line) && line! >= 1 ? line : undefined, focusAgeMs: focusAgeMs() }),
  // A plain location.reload() leaves a VS Code webview blank (its inner frame has no URL to reload), so the host
  // resets the panel HTML instead (T010: the error page's Restart must actually recover the chat).
  restart: async () => ui("reload"),
  // patches/opencode/0008 (T010): oco's own error / unreachable / missing-session screens.
  recoveryView: RecoveryView,
  notify: async (title, body) => ui("notify", { title, body }),
  fetch: bridgeFetch,
  storage: (name = "default.dat") => {
    let s = storageCache.get(name)
    if (!s) storageCache.set(name, (s = hostStorage(name)))
    return s
  },
  draftStore: createDraftStore({
    get: (key) => hostStorage("drafts").getItem(key),
    set: (key, value) => hostStorage("drafts").setItem(key, value),
    remove: (key) => hostStorage("drafts").removeItem(key),
    putBlob: async (blob) => blobPut(await blob.arrayBuffer()),
    getBlob: async (id) => {
      const data = await blobGet(id)
      return data ? new Blob([data]) : null
    },
  }),
  getDefaultServer: async () => serverKey,
  // M22: the message action row asks the host to store a bookmark. The page keeps no copy.
  ocoBookmarkMessage: ({ sessionID, messageID, anchorID, summary }) =>
    ui("bookmark", { sessionId: sessionID, messageId: messageID, anchorId: anchorID, body: summary }),
}

let currentRoute = boundRoute
const inner = createMemoryHistory()
inner.set({ value: boundRoute, replace: true, scroll: false })

/** Draft panel: the new-session page itself, then the first session route (the one its message created; the host
 *  checks that). Everything else stays blocked. */
function draftGuard(value: string) {
  const path = value.split(/[?#]/)[0]
  if (path === draftRoute || path === "/new-session") return true
  const parts = path.split("/").filter(Boolean)
  const id =
    parts.length === 4 && parts[0] === "server" && parts[2] === "session" ? parts[3]
    : parts.length === 3 && parts[1] === "session" ? parts[2]
    : undefined
  if (id) {
    delete bound.draft
    bound.sessionId = id
    stats.navigations++
    ui("promoted", { sessionId: id })
    saveState()
    return true
  }
  stats.blockedNavigation++
  ui("blockedNavigation", { route: value.slice(0, 300) })
  return false
}

function PanelRouter(props: BaseRouterProps) {
  const guard = (value: string) => {
    if (bound.draft) return draftGuard(value)
    const c = classifyRoute(value)
    if (c.kind === "bound") return true
    if (c.kind === "session") {
      stats.openSessionRequests++
      ui("openSession", { sessionId: c.id })
    } else {
      stats.blockedNavigation++
      ui("blockedNavigation", { route: value.slice(0, 300) })
    }
    return false
  }
  const history: typeof inner = {
    ...inner,
    set(change) {
      if (!guard(change.value)) {
        // solid-router stores the target in its own location signal even when history.set does
        // nothing (createRouter.js intercept); push the bound route back through the listeners.
        queueMicrotask(() => inner.set({ value: currentRoute, replace: true, scroll: false }))
        return
      }
      // Hash is scroll state (M22). The host matches ready routes with endsWith(sessionId).
      currentRoute = change.value.split("#")[0]
      inner.set(change)
    },
    // Only one route exists in a panel: history traversal would leave it.
    go() {},
    back() {},
    forward() {},
  }
  return <MemoryRouter {...props} history={history} />
}

// Host -> draft insert. Delivered only to the bound session's composer; the (patched) composer
// re-checks its own session and reports the outcome, which is acknowledged to the host.
// `chip` (card 13, patch 0028) passes through untouched: the composer shows it as an attachment pill.
let composerReady = false
type DraftInsertMessage = Extract<HostToWebview, { type: "draft.insert" }>
const queued: DraftInsertMessage[] = []
const deliver = (m: DraftInsertMessage) =>
  window.dispatchEvent(new CustomEvent("oco:draft-insert", { detail: { id: m.id, sessionID: m.sessionId, text: m.text, chip: m.chip } }))
window.addEventListener("oco:draft-inserted", (e) => {
  const d = (e as CustomEvent<{ id?: string; ok: boolean; reason?: string }>).detail
  if (d?.id) draftAck(d.id, d.ok, d.reason)
})
window.addEventListener("oco:composer-ready", () => {
  composerReady = true
  for (const m of queued.splice(0)) deliver(m)
})
onDraftInsert((msg) => {
  if (msg.sessionId !== bound.sessionId) return draftAck(msg.id, false, "panel is bound to another session")
  if (classifyRoute(currentRoute).kind !== "bound") return draftAck(msg.id, false, "panel is not showing its session")
  if (composerReady) deliver(msg)
  else queued.push(msg)
})

// Title: the official app sets document.title for the session; mirror it to the VS Code tab.
let lastTitle = ""
new MutationObserver(() => {
  const t = document.title.trim()
  if (!t || t === lastTitle || t === "oco" || t === "OpenCode") return
  lastTitle = t
  ui("title", { title: t.replace(/\s*[|·-]\s*OpenCode$/i, "") })
}).observe(document.head, { subtree: true, childList: true, characterData: true })

const servers: ServerConnection.Any[] = [{ type: "http", displayName: "oco", http: { url: init.serverUrl } }]

render(
  () => (
    <PlatformProvider value={platform}>
      {/* VS Code reports BCP 47 tags (zh-cn, zh-tw, pt-br); the app only accepts its own ids (zh, zht, br). */}
      <AppBaseProviders locale={detectDesktopNativeLocale([init.locale ?? "en"])}>
        <AppInterface defaultServer={serverKey} servers={servers} router={PanelRouter} disableHealthCheck={false} />
        <ConnectionBanner />
      </AppBaseProviders>
    </PlatformProvider>
  ),
  root,
)

installSubmitStatus()

// Inspection hooks for tests: page code already has these capabilities, so exposing them grants nothing new.
;(window as unknown as { __OCO_DEBUG__: unknown }).__OCO_DEBUG__ = {
  fetch: bridgeFetch,
  classifyRoute,
  route: () => currentRoute,
  sessionId: () => bound.sessionId,
  generation: currentGeneration,
  storage: storageStats,
  theme: themeStats,
  submit: submitStats,
  openFile: (path: string, line?: number) => platform.openFileInHost?.(path, line),
}

const saveState = () => vscode.setState({ binding: { ...bound }, role: init.role })

// Host -> switch to another session (ADR-007). Same connection and directory, validated by the host.
/** `#message-{id}` is the user-message anchor `use-session-hash-scroll` reads from the router location. */
const messageHash = (messageId: string | undefined) => (messageId ? `#message-${messageId}` : "")

onNavigate((msg) => {
  // Result card: the host asks for the review (diff) panel too. The page-side module keeps the intent until the
  // session page is on screen (patches/opencode/0021), so a navigate to an uncached session loses nothing.
  if (msg.review) window.dispatchEvent(new CustomEvent("oco:review-intent", { detail: { sessionID: msg.sessionId, file: msg.review.file } }))
  const hash = messageHash(msg.messageId)
  if (msg.sessionId === bound.sessionId) {
    // After a draft's promotion the host names the session's directory (a worktree may differ).
    if (msg.directory && msg.directory !== bound.directory) {
      bound.directory = msg.directory
      saveState()
    }
    // Already on this session: the router will not remount, so point the hash at the turn.
    if (hash) {
      location.hash = hash
      inner.set({ value: routeFor(bound.sessionId) + hash, replace: true, scroll: false })
    }
    return void ready(currentRoute.split("#")[0])
  }
  stats.navigations++
  bound.sessionId = msg.sessionId
  currentRoute = routeFor(msg.sessionId)
  if (hash) location.hash = hash
  inner.set({ value: currentRoute + hash, replace: true, scroll: false })
  saveState()
  // Report ready once the new session's composer is on screen, so drafts for it never reach the previous one:
  // an uncached session renders only after its data arrives (patches/opencode/0015).
  const target = msg.sessionId
  void composerShows(target, 5000).then(() => bound.sessionId === target && ready(currentRoute))
})

let composerSession: string | undefined
const composerWaiters = new Set<() => void>()
window.addEventListener("oco:composer-session", (e) => {
  composerSession = (e as CustomEvent<{ sessionID?: string }>).detail?.sessionID
  for (const fn of [...composerWaiters]) fn()
})
/** Resolves when the composer shows `sessionId`, or after `timeoutMs` (no composer, e.g. an error view). */
function composerShows(sessionId: string, timeoutMs: number) {
  return new Promise<void>((resolve) => {
    const done = () => {
      composerWaiters.delete(check)
      clearTimeout(timer)
      resolve()
    }
    const check = () => composerSession === sessionId && done()
    const timer = setTimeout(done, timeoutMs)
    composerWaiters.add(check)
    check()
  })
}

saveState()
ready(boundRoute)
