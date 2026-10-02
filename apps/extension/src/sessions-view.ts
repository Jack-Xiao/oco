import * as vscode from "vscode"
import type { ConnectionSummary, SessionActivity, SessionListItem } from "@oco/contracts"
import type { SessionStore } from "./session-store"
import { serverInfoLines, versionNote, type ServerInfo } from "./diagnostics"
import { compactTime, splitSessions, UnreadTracker } from "./session-groups"

export const SESSIONS_VIEW = "oco.sessions"
const UNREAD_KEY = "oco.unreadSessions"

const STATUS: Record<SessionActivity, string> = {
  idle: "",
  busy: "Running",
  retry: "Retrying",
  permission: "Waiting for permission",
  question: "Waiting for answer",
  error: "Error",
}

/** One icon per row, by priority: error > waiting on you > running > unread > nothing (blank keeps titles aligned). */
function rowIcon(s: SessionListItem, unread: boolean, media: vscode.Uri, still: boolean): TreeItemIcon {
  if (s.activity === "error") return new vscode.ThemeIcon("error", new vscode.ThemeColor("errorForeground"))
  if (s.activity === "permission" || s.activity === "question") return new vscode.ThemeIcon("circle-filled", new vscode.ThemeColor("charts.yellow"))
  if (s.activity === "busy" || s.activity === "retry")
    return still
      ? new vscode.ThemeIcon("circle-filled", new vscode.ThemeColor("descriptionForeground"))
      : { light: vscode.Uri.joinPath(media, "session-running-light.svg"), dark: vscode.Uri.joinPath(media, "session-running-dark.svg") }
  if (unread) return new vscode.ThemeIcon("circle-filled", new vscode.ThemeColor("charts.blue"))
  return new vscode.ThemeIcon("blank")
}
type TreeItemIcon = vscode.ThemeIcon | { light: vscode.Uri; dark: vscode.Uri }

export class SessionItem extends vscode.TreeItem {
  constructor(
    readonly session: SessionListItem,
    readonly unread: boolean,
    media: vscode.Uri,
    still: boolean,
    now = Date.now(),
  ) {
    super(session.title, vscode.TreeItemCollapsibleState.None)
    this.id = session.id
    const count = session.activity === "permission" ? session.pendingPermissions : session.activity === "question" ? session.pendingQuestions : 0
    const status = STATUS[session.activity] + (count > 1 ? ` (${count})` : "") || (unread ? "New activity" : "")
    this.description = compactTime(session.updated, now)
    this.iconPath = rowIcon(session, unread, media, still)
    this.contextValue = "oco.session"
    const tip = new vscode.MarkdownString(undefined, true)
    tip.appendText([session.title, status, session.updated ? `Updated ${new Date(session.updated).toLocaleString()}` : "", session.id, session.directory].filter(Boolean).join("\n"))
    if (session.error) tip.appendText(`\nError: ${session.error}`)
    this.tooltip = tip
    this.accessibilityInformation = { label: [session.title, status, this.description].filter(Boolean).join(", ") }
    this.command = { command: "oco.openSession", title: "Open Session", arguments: [session.id] }
  }
}

/** Sessions older than yesterday, collapsed. Its id changes when nothing is recent so it opens on its own. */
export class MoreItem extends vscode.TreeItem {
  constructor(count: number, open: boolean) {
    super("More", open ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed)
    this.id = open ? "oco.more.open" : "oco.more"
    this.description = String(count)
    this.contextValue = "oco.more"
  }
}

export class LoadMoreItem extends vscode.TreeItem {
  constructor() {
    super("Load more…", vscode.TreeItemCollapsibleState.None)
    this.id = "oco.loadMore"
    this.iconPath = new vscode.ThemeIcon("blank")
    this.contextValue = "oco.loadMore"
    this.command = { command: "oco.loadMoreSessions", title: "Load More Sessions" }
  }
}

type Node = SessionItem | MoreItem | LoadMoreItem
const selected = (v: vscode.TreeView<Node>) => {
  const e = v.selection[0]
  return e instanceof SessionItem ? e.session.id : undefined
}

/** Native session list: data from SessionStore, states from the connection summary. */
export class SessionsView implements vscode.TreeDataProvider<Node>, vscode.Disposable {
  private readonly changed = new vscode.EventEmitter<void>()
  readonly onDidChangeTreeData = this.changed.event
  readonly view: vscode.TreeView<Node>
  private query = ""
  private summary: ConnectionSummary | undefined
  private info: ServerInfo | undefined
  private folderLabel: string | undefined
  private refreshTimer: ReturnType<typeof setTimeout> | undefined
  private current: string | undefined
  private readonly status: vscode.StatusBarItem
  private readonly unread: UnreadTracker
  private readonly media: vscode.Uri
  private moreIds = new Set<string>()
  private moreOpen = false
  private moreId: string | undefined
  private readonly clock: ReturnType<typeof setInterval>
  readonly stats = { renders: 0 }

  constructor(
    private readonly store: SessionStore,
    extensionUri: vscode.Uri,
    private readonly memento?: vscode.Memento,
  ) {
    this.media = vscode.Uri.joinPath(extensionUri, "media")
    this.unread = new UnreadTracker(memento?.get<string[]>(UNREAD_KEY) ?? [])
    this.view = vscode.window.createTreeView(SESSIONS_VIEW, { treeDataProvider: this, showCollapseAll: false })
    this.view.onDidExpandElement((e) => e.element instanceof MoreItem && (this.moreOpen = true))
    this.view.onDidCollapseElement((e) => e.element instanceof MoreItem && (this.moreOpen = false))
    // Time labels and the "since yesterday" boundary age without events.
    this.clock = setInterval(() => this.view.visible && this.refresh(), 60_000)
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
    if (!id || !this.view.visible || selected(this.view) === id) return
    // Revealing a row inside the collapsed "More" group would force it open.
    if (this.moreIds.has(id) && !this.moreOpen) return
    const s = this.store.list().find((i) => i.id === id)
    const item = s && this.row(s)
    // A fork's row may not be listed yet; the session.created refresh retries.
    if (item) void Promise.resolve(this.view.reveal(item, { select: true, focus: false })).catch(() => undefined)
  }

  /** Coalesces bursts of events (streaming updates) into one render. */
  refresh() {
    if (this.refreshTimer) return
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = undefined
      if (this.unread.update(this.store.list(), this.current)) void this.memento?.update(UNREAD_KEY, this.unread.ids())
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

  getTreeItem(e: Node) {
    return e
  }

  /** Required by TreeView.reveal: rows in "More" have it as parent. */
  getParent(e: Node): Node | undefined {
    return e instanceof SessionItem && this.moreIds.has(e.session.id) ? this.moreNode() : undefined
  }

  getChildren(e?: Node): Node[] {
    if (e instanceof SessionItem || e instanceof LoadMoreItem) return []
    const g = this.groups()
    const row = (i: SessionListItem) => this.row(i, g.now)
    if (e) return [...g.more.map(row), ...(g.loadMore ? [new LoadMoreItem()] : [])]
    this.stats.renders++
    if (!g.connected) return []
    const out: Node[] = g.recent.map(row)
    // Nothing older loaded yet: "Load more…" sits at the end of the list rather than in an empty "More".
    if (g.more.length) out.push(this.moreNode(g))
    else if (g.loadMore) out.push(new LoadMoreItem())
    return out
  }

  /**
   * Today and yesterday first, then everything older under "More". Sessions that are running, waiting
   * or unread stay on top regardless of age. A search shows its results flat.
   */
  private groups() {
    const now = Date.now()
    const s = this.summary?.state
    // Empty tree -> the matching viewsWelcome content (loading / error / unauthorized / empty) shows.
    const connected = !(s === "unconfigured" || (s !== "connected" && s !== "reconnecting" && this.store.size === 0))
    const items = this.items()
    const split = this.query ? { recent: items, more: [] } : splitSessions(items, now, (id) => this.unread.has(id))
    this.moreIds = new Set(split.more.map((i) => i.id))
    return { ...split, now, connected, loadMore: !this.query && this.store.limitReached }
  }

  private row(i: SessionListItem, now = Date.now()) {
    const still = vscode.workspace.getConfiguration("workbench").get("reduceMotion") === "on"
    return new SessionItem(i, this.unread.has(i.id), this.media, still, now)
  }

  private moreNode(g = this.groups()) {
    const node = new MoreItem(g.more.length, !g.recent.length)
    // Track the forced-open variant; the collapsed one starts closed again (expand events only follow clicks).
    if (node.id !== this.moreId) this.moreOpen = node.id === "oco.more.open"
    this.moreId = node.id
    return node
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
      selected: selected(this.view) ?? null,
      folderLabel: this.folderLabel ?? null,
      message: this.view.message ?? null,
      badge: this.view.badge?.value ?? 0,
      statusText: this.status.text,
      statusTooltip: typeof this.status.tooltip === "string" ? this.status.tooltip : null,
      items: (() => {
        const g = this.groups()
        const row = (group: string) => (i: SessionListItem) => ({ id: i.id, title: i.title, activity: i.activity, group, unread: this.unread.has(i.id), description: compactTime(i.updated, g.now) })
        return [...g.recent.map(row("recent")), ...g.more.map(row("more"))]
      })(),
      loadMore: this.groups().loadMore,
    }
  }

  dispose() {
    if (this.refreshTimer) clearTimeout(this.refreshTimer)
    clearInterval(this.clock)
    this.changed.dispose()
    this.view.dispose()
    this.status.dispose()
  }
}
