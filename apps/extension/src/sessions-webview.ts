import { randomBytes } from "crypto"
import * as vscode from "vscode"
import { answerPending } from "./inbox-actions"
import type { SessionsView } from "./sessions-view"

export const SESSIONS_VIEW = "oco.sessions"

/** Buttons in the page's empty / error states may only run these. */
const COMMANDS = new Set([
  "oco.openSettings",
  "oco.reconnect",
  "oco.setServerPassword",
  "oco.clearSearch",
  "oco.newSession",
  "workbench.action.files.openFolder",
])

export type WebviewClient = {
  request: <T>(method: string, path: string, body?: unknown, directory?: string) => Promise<T>
  directory?: string
}

type FromPage =
  | { type: "ready" }
  | { type: "open"; id: string; newPanel?: boolean }
  | { type: "search"; query: string }
  | { type: "loadMore" }
  | { type: "command"; command: string }
  | { type: "permissionReply"; id: string; reply: "once" | "always" | "reject"; message?: string }
  | { type: "questionReject"; id: string }
  | { type: "questionReply"; id: string; answers: string[][] }
  | { type: "openReview"; id: string }
  | { type: "markRead"; id: string }
  | { type: "pin"; id: string; pinned: boolean }
  | { type: "markUnread"; ids: string[] }
  | { type: "batch"; action: "archive" | "delete"; ids: string[] }
  | { type: "stop"; ids: string[] }
  | { type: "sendNotes"; id: string }

/**
 * The sidebar session list as a webview (time column, rounded selection, row height a native tree can't
 * set). SessionsView owns grouping and state; this view renders `webModel()` and sends clicks back.
 */
export class SessionsWebview implements vscode.WebviewViewProvider, vscode.Disposable {
  private view: vscode.WebviewView | undefined
  private readonly subs: vscode.Disposable[] = []
  private lastCurrent: string | undefined
  private searchPending = false
  readonly stats = { resolves: 0, posts: 0, readyMs: [] as number[] }

  constructor(
    private readonly list: SessionsView,
    private readonly extensionUri: vscode.Uri,
    private readonly search: (q: string) => void,
    private readonly client?: WebviewClient,
  ) {
    this.subs.push(list.onDidRender(() => this.post()))
  }

  resolveWebviewView(view: vscode.WebviewView) {
    const started = Date.now()
    this.stats.resolves++
    this.view = view
    const root = vscode.Uri.joinPath(this.extensionUri, "media", "sessions-list")
    view.webview.options = { enableScripts: true, localResourceRoots: [root] }
    view.webview.html = this.html(view.webview, root)
    const subs = [
      view.webview.onDidReceiveMessage((m: FromPage) => {
        if (m.type === "ready") {
          this.stats.readyMs.push(Date.now() - started)
          this.post()
          if (this.searchPending) this.focusSearch()
          return
        }
        this.handle(m)
      }),
      view.onDidChangeVisibility(() => view.visible && this.post()),
    ]
    view.onDidDispose(() => {
      subs.forEach((d) => d.dispose())
      if (this.view === view) this.view = undefined
    })
  }

  /** Title-bar search button: reveal the list, then show and focus its search box. */
  async showSearch() {
    if (!this.view) this.searchPending = true
    await vscode.commands.executeCommand(`${SESSIONS_VIEW}.focus`)
    if (this.view && !this.searchPending) this.focusSearch()
  }

  private focusSearch() {
    this.searchPending = false
    void this.view?.webview.postMessage({ type: "focusSearch" })
  }

  private handle(m: FromPage) {
    switch (m.type) {
      case "open":
        if (typeof m.id === "string") void vscode.commands.executeCommand(m.newPanel ? "oco.openSessionInNewPanel" : "oco.openSession", m.id)
        return
      case "search":
        if (typeof m.query === "string") this.search(m.query)
        return
      case "loadMore":
        void vscode.commands.executeCommand("oco.loadMoreSessions")
        return
      case "command":
        if (COMMANDS.has(m.command)) void vscode.commands.executeCommand(m.command)
        return
      case "permissionReply":
        void answerPending(this.client, this.list.sessionStore, () => this.list.refresh(), m.id, { kind: "permission", reply: m.reply, message: typeof m.message === "string" ? m.message : undefined })
        return
      case "openReview":
        if (typeof m.id === "string") void vscode.commands.executeCommand("oco.openSessionReview", m.id)
        return
      case "markRead":
        if (typeof m.id === "string") this.list.markRead(m.id)
        return
      case "pin":
        if (typeof m.id === "string" && typeof m.pinned === "boolean") {
          this.list.setPinned(m.id, m.pinned)
        }
        return
      case "markUnread":
        if (Array.isArray(m.ids)) {
          this.list.markUnread(m.ids)
        }
        return
      case "batch":
        if ((m.action === "archive" || m.action === "delete") && Array.isArray(m.ids) && m.ids.length > 0) {
          const cmd = m.action === "archive" ? "oco.archiveSession" : "oco.deleteSession"
          void vscode.commands.executeCommand(cmd, { sessionId: m.ids[0], selection: m.ids })
        }
        return
      case "stop":
        if (Array.isArray(m.ids) && m.ids.length > 0 && m.ids.every((x) => typeof x === "string")) {
          void vscode.commands.executeCommand("oco.sessions.stop", { sessionId: m.ids[0], selection: m.ids })
        }
        return
      case "sendNotes":
        if (typeof m.id === "string") void vscode.commands.executeCommand("oco.reviewNotes.sendAll", m.id)
        return
      case "questionReject":
        void answerPending(this.client, this.list.sessionStore, () => this.list.refresh(), m.id, { kind: "questionReject" })
        return
      case "questionReply":
        void answerPending(this.client, this.list.sessionStore, () => this.list.refresh(), m.id, { kind: "questionReply", answers: m.answers })
        return
    }
  }

  private post() {
    const view = this.view
    if (!view?.visible) return
    const model = this.list.webModel()
    view.description = this.list.chrome.description
    view.badge = this.list.chrome.badge
    this.stats.posts++
    void view.webview.postMessage({ type: "state", ...model })
    if (model.current && model.current !== this.lastCurrent) void view.webview.postMessage({ type: "reveal", id: model.current })
    this.lastCurrent = model.current
  }

  private html(webview: vscode.Webview, root: vscode.Uri) {
    const nonce = randomBytes(16).toString("base64")
    const css = webview.asWebviewUri(vscode.Uri.joinPath(root, "index.css"))
    const js = webview.asWebviewUri(vscode.Uri.joinPath(root, "index.js"))
    const model = this.list.webModel()
    this.lastCurrent = model.current
    // First frame comes with the HTML, so the list never flashes empty while the page asks for state.
    const initial = JSON.stringify({ type: "state", ...model }).replace(/</g, "\\u003c")
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="stylesheet" href="${css}">
</head>
<body>
<script type="application/json" id="oco-initial-state" nonce="${nonce}">${initial}</script>
<script nonce="${nonce}" src="${js}"></script>
</body>
</html>`
  }

  debugState() {
    const model = this.list.webModel()
    return { resolved: !!this.view, visible: this.view?.visible ?? false, view: model.view, text: model.text ?? null, notice: model.notice ?? null, ...this.stats }
  }

  dispose() {
    this.subs.forEach((d) => d.dispose())
  }
}
