// oco chat webview entry: mounts the official OpenCode v1 app (vendored, pinned SHA) for ONE session.
// Modelled on vendor/opencode/packages/desktop/src/renderer/index.tsx, with a VS Code Platform.
import {
  AppBaseProviders,
  AppInterface,
  createDraftStore,
  PlatformProvider,
  ServerConnection,
  type Platform,
} from "@opencode-ai/app"
import { base64Encode } from "@opencode-ai/core/util/encode"
import { createMemoryHistory, MemoryRouter, type BaseRouterProps } from "@solidjs/router"
import { render } from "solid-js/web"
import { blobGet, blobPut, bridgeFetch, hostStorage, init, onDraftInsert, ui, vscode } from "./bridge"

const root = document.getElementById("root")!
const serverKey = ServerConnection.Key.make(init.serverUrl)
const sessionRoute = `/server/${base64Encode(serverKey)}/session/${init.binding.sessionId}`

const os = navigator.userAgent.includes("Mac") ? "macos" : navigator.userAgent.includes("Windows") ? "windows" : "linux"

const storageCache = new Map<string, ReturnType<typeof hostStorage>>()
const platform: Platform = {
  platform: "web",
  version: "oco-p0",
  windowID: init.panelId,
  openExternal: (url) => ui("openExternal", { url }),
  restart: async () => location.reload(),
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
}
void os

// Session routing belongs to the host: the memory router starts on the bound session.
function PanelRouter(props: BaseRouterProps) {
  const history = createMemoryHistory()
  history.set({ value: sessionRoute, replace: true, scroll: false })
  history.listen((value) => {
    vscode.setState({ ...(vscode.getState() as object), route: value })
  })
  return <MemoryRouter {...props} history={history} />
}

// Host -> draft insert: forwarded to the (patched) official composer as a DOM event.
// Inserts that arrive before the composer mounts are queued until it announces itself.
let composerReady = false
const queued: string[] = []
const deliver = (text: string) => window.dispatchEvent(new CustomEvent("oco:draft-insert", { detail: { text } }))
window.addEventListener("oco:composer-ready", () => {
  composerReady = true
  for (const text of queued.splice(0)) deliver(text)
})
onDraftInsert((msg) => {
  if (composerReady) deliver(msg.text)
  else queued.push(msg.text)
})

const servers: ServerConnection.Any[] = [{ type: "http", displayName: "oco", http: { url: init.serverUrl } }]

render(
  () => (
    <PlatformProvider value={platform}>
      <AppBaseProviders locale={init.locale as never}>
        <AppInterface defaultServer={serverKey} servers={servers} router={PanelRouter} disableHealthCheck={false} />
      </AppBaseProviders>
    </PlatformProvider>
  ),
  root,
)

vscode.setState({ ...(vscode.getState() as object), binding: init.binding })
ui("ready")
