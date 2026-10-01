import * as vscode from "vscode"
import type { ConnectionSummary, SessionActivity, SessionListItem } from "@oco/contracts"
import type { SessionStore } from "./session-store"
import { serverInfoLines, versionNote, type ServerInfo } from "./diagnostics"

export const SESSIONS_VIEW = "oco.sessions"
export const MAX_ITEMS = 200 // = SessionFeed.ROOT_LIMIT

const ACTIVITY: Record<SessionActivity, { label: string; icon: string; color?: string }> = {
  idle: { label: "", icon: "comment-discussion" },
  busy: { label: "Running", icon: "sync~spin", color: "charts.blue" },
  retry: { label: "Retrying", icon: "sync~spin", color: "charts.orange" },
  permission: { label: "Waiting for permission", icon: "shield", color: "charts.yellow" },
  question: { label: "Waiting for answer", icon: "question", color: "charts.yellow" },
  error: { label: "Error", icon: "error", color: "errorForeground" },
}

export function relativeTime(ms: number, now = Date.now()) {
  if (!ms) return ""
  const s = Math.max(0, Math.round((now - ms) / 1000))
  if (s < 60) return "just now"
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 86400) return `${Math.floor(s / 3600)} hr ago`
  if (s < 86400 * 30) {
    const days = Math.floor(s / 86400)
    return days === 1 ? "1 day ago" : `${days} days ago`
  }
  return new Date(ms).toISOString().slice(0, 10)
}

export class SessionItem extends vscode.TreeItem {
  constructor(readonly session: SessionListItem, open: boolean) {
    super(session.title, vscode.TreeItemCollapsibleState.None)
    const a = ACTIVITY[session.activity]
    this.id = session.id
    const count = session.activity === "permission" ? session.pendingPermissions : session.activity === "question" ? session.pendingQuestions : 0
    this.description = [a.label + (count > 1 ? ` ×${count}` : ""), open ? "Open" : "", relativeTime(session.updated)].filter(Boolean).join(" · ")
    this.iconPath = new vscode.ThemeIcon(a.icon, a.color ? new vscode.ThemeColor(a.color) : undefined)
    this.contextValue = "oco.session"
    const tip = new vscode.MarkdownString(undefined, true)
    tip.appendText(`${session.title}\n${session.id}\n${session.directory}`)
    if (session.error) tip.appendText(`\nError: ${session.error}`)
    this.tooltip = tip
    this.accessibilityInformation = { label: [session.title, a.label, open ? "Open" : ""].filter(Boolean).join(", ") }
    this.command = { command: "oco.openSession", title: "Open Session", arguments: [session.id] }
  }
}

/** Native session list: data from SessionStore, states from the connection summary. */
export class SessionsView implements vscode.TreeDataProvider<SessionItem>, vscode.Disposable {
  private readonly changed = new vscode.EventEmitter<void>()
  readonly onDidChangeTreeData = this.changed.event
  readonly view: vscode.TreeView<SessionItem>
  private query = ""
  private summary: ConnectionSummary | undefined
  private info: ServerInfo | undefined
  private folderLabel: string | undefined
  private refreshTimer: ReturnType<typeof setTimeout> | undefined
  private current: string | undefined
  private readonly status: vscode.StatusBarItem
  readonly stats = { renders: 0 }

  constructor(
    private readonly store: SessionStore,
    private readonly isOpen: (sessionId: string) => boolean,
  ) {
    this.view = vscode.window.createTreeView(SESSIONS_VIEW, { treeDataProvider: this, showCollapseAll: false })
    this.status = vscode.window.createStatusBarItem("oco.connection", vscode.StatusBarAlignment.Left, 10)
    this.status.name = "oco Connection"
    void vscode.commands.executeCommand("setContext", "oco.searchActive", false)
    this.view.onDidChangeVisibility((e) => e.visible && this.syncSelection())
  }

  /**
   * The session shown in the active panel. Native tree selection only follows clicks, so a panel that
   * switches on its own (fork, new session, another tab) would leave the old row highlighted.
   */
  setCurrent(sessionId: string | undefined) {
    if (this.current === sessionId) return
    this.current = sessionId
    this.refresh()
  }

  private syncSelection() {
    const id = this.current
    if (!id || !this.view.visible || this.view.selection[0]?.session.id === id) return
    const item = this.getChildren().find((i) => i.session.id === id)
    // A fork's row may not be listed yet; the session.created refresh retries.
    if (item) void Promise.resolve(this.view.reveal(item, { select: true, focus: false })).catch(() => undefined)
  }

  /** Coalesces bursts of events (streaming updates) into one render. */
  refresh() {
    if (this.refreshTimer) return
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = undefined
      this.changed.fire()
      this.updateChrome()
      this.syncSelection()
    }, 150)
  }

  get search() {
    return this.query
  }

  setSearch(q: string) {
    this.query = q.trim()
    void vscode.commands.executeCommand("setContext", "oco.searchActive", !!this.query)
    this.refresh()
  }

  setConnection(s: ConnectionSummary) {
    this.summary = s
    void vscode.commands.executeCommand("setContext", "oco.connState", s.state)
    void vscode.commands.executeCommand("setContext", "oco.connIssue", s.issue ?? "")
    this.refresh()
  }

  items(): SessionListItem[] {
    return this.store.list(this.query)
  }

  getTreeItem(e: SessionItem) {
    return e
  }

  getParent(): undefined {
    return undefined // flat list; required by TreeView.reveal
  }

  getChildren(e?: SessionItem): SessionItem[] {
    if (e) return []
    this.stats.renders++
    const s = this.summary?.state
    // Empty tree -> the matching viewsWelcome content (loading / error / unauthorized / empty) shows.
    if (s === "unconfigured" || (s !== "connected" && s !== "reconnecting" && this.store.size === 0)) return []
    return this.items()
      .slice(0, MAX_ITEMS)
      .map((i) => new SessionItem(i, this.isOpen(i.id)))
  }

  private updateChrome() {
    const s = this.summary
    const all = this.items()
    const waiting = all.filter((i) => i.activity === "permission" || i.activity === "question").length
    this.view.description = [this.folderLabel, this.query ? `Search: ${this.query}` : ""].filter(Boolean).join(" · ") || undefined
    let message: string | undefined
    if (s?.state === "reconnecting") message = `Connection lost. Reconnecting (attempt ${s.attempt})… The list may be out of date.${s.error ? ` Cause: ${s.error}` : ""}`
    else if (s?.state === "error") message = `Cannot connect to ${s.label}: ${s.error ?? ""}`
    else if (s?.state === "unauthorized" || s?.state === "unconfigured") message = s.error
    // The feed loads at most MAX_ITEMS root sessions and search runs on that loaded list only.
    else if (this.store.limitReached || all.length > MAX_ITEMS)
      message = this.query
        ? `Search covers only the ${MAX_ITEMS} most recent loaded sessions. Older sessions are not included.`
        : `Only the ${MAX_ITEMS} most recent sessions are loaded. Search covers only those sessions.`
    this.view.message = message
    this.view.badge = waiting ? { value: waiting, tooltip: `${waiting} session${waiting === 1 ? "" : "s"} waiting` } : undefined

    const st = this.status
    const label = s?.label.replace(/^https?:\/\//, "") ?? ""
    switch (s?.state) {
      case "connected":
        st.text = `$(oco-logo) oco${waiting ? ` $(bell-dot) ${waiting}` : ""}`
        st.tooltip = `oco: Connected to ${s.label}\n${s.directory ?? ""}${s.trusted ? "" : "\nRestricted Mode: read-only"}`
        st.command = "oco.sessions.focus"
        st.backgroundColor = undefined
        break
      case "connecting":
        st.text = `$(sync~spin) oco: Connecting…`
        st.tooltip = `Connecting to ${s.label}`
        st.command = "oco.sessions.focus"
        st.backgroundColor = undefined
        break
      case "reconnecting":
      case "error":
        st.text = `$(debug-disconnect) oco: ${s.state === "error" ? "Not connected" : "Reconnecting…"}`
        st.tooltip = `${label}: ${s.error ?? ""}\nClick to retry now`
        st.command = "oco.reconnect"
        st.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground")
        break
      case "unauthorized":
        st.text = `$(lock) oco: Password required`
        st.tooltip = `${s.error ?? ""}\nClick to set the password`
        st.command = "oco.setServerPassword"
        st.backgroundColor = new vscode.ThemeColor("statusBarItem.errorBackground")
        break
      default:
        st.text = `$(circle-slash) oco`
        st.tooltip = `${s?.error ?? "oco is not configured"}\nClick to ${s?.issue === "endpoint" ? "open Settings" : "show the sidebar"}`
        st.command = s?.issue === "endpoint" ? "oco.openSettings" : "oco.sessions.focus"
        st.backgroundColor = undefined
    }
    const m = this.info?.mode === "managed" ? this.info.managed : undefined
    if (m && (m.status === "failed" || m.status === "exited") && s?.state !== "connected") {
      st.text = `$(error) oco: Managed server not running`
      st.tooltip = `${m.error ?? ""}\nClick to restart`
      st.command = "oco.restartManagedServer"
      st.backgroundColor = new vscode.ThemeColor("statusBarItem.errorBackground")
    } else if (m?.status === "starting") {
      st.text = `$(sync~spin) oco: Starting server…`
      st.command = "oco.showLog"
    }
    if (s?.state === "connected" && versionNote(this.info?.version)) st.text = st.text.replace("$(oco-logo)", "$(warning)")
    const extra = serverInfoLines(this.info)
    if (extra.length) st.tooltip = `${typeof st.tooltip === "string" ? st.tooltip : ""}\n${extra.join("\n")}`
    st.show()
  }

  /** Multi-root: the folder the list belongs to, shown next to the view title (undefined for one folder). */
  setFolderLabel(label: string | undefined) {
    this.folderLabel = label
    this.updateChrome()
  }

  /** Server version / mode / managed process shown in the status bar (T007/T015). */
  setServerInfo(info: ServerInfo) {
    this.info = info
    this.updateChrome()
  }

  debugState() {
    const s = this.summary
    return {
      connection: s ? { state: s.state, attempt: s.attempt, error: s.error, issue: s.issue, label: s.label, trusted: s.trusted } : null,
      search: this.query,
      visible: this.view.visible,
      selected: this.view.selection[0]?.session.id ?? null,
      folderLabel: this.folderLabel ?? null,
      message: this.view.message ?? null,
      badge: this.view.badge?.value ?? 0,
      statusText: this.status.text,
      statusTooltip: typeof this.status.tooltip === "string" ? this.status.tooltip : null,
      items: this.getChildren().map((i) => ({ id: i.session.id, title: i.session.title, activity: i.session.activity, description: i.description })),
    }
  }

  dispose() {
    if (this.refreshTimer) clearTimeout(this.refreshTimer)
    this.changed.dispose()
    this.view.dispose()
    this.status.dispose()
  }
}
