import * as vscode from "vscode"
import type { ConnectionSummary, SessionActivity, SessionListItem } from "@oco/contracts"
import type { InboxEntry, InboxRow, SessionStore } from "./session-store"
import { serverInfoLines, versionNote, type ServerInfo } from "./diagnostics"
import {
  compactTime,
  groupInbox,
  listMessage,
  splitSessions,
  UnreadTracker,
  PendingNotifier,
  type NotifierDeps,
  type PendingNotificationItem,
} from "./session-groups"

export { PendingNotifier, type NotifierDeps, type PendingNotificationItem }

const UNREAD_KEY = "oco.unreadSessions"

const STATUS: Record<SessionActivity, string> = {
  idle: "",
  busy: "Running",
  retry: "Retrying",
  permission: "Waiting for permission",
  question: "Waiting for answer",
  error: "Error",
}

/** Row and state shapes of the webview list (message contract: docs/evidence/sessions-webview-spike-2026-10-08.md). */
export type WebRow = { id: string; title: string; time: string; status: "" | "running" | "waiting" | "unread" | "error"; tooltip: string; aria: string }
export type WebListModel = {
  view: "list" | "message"
  text?: string
  notice?: string
  actions?: { label: string; command: string }[]
  query: string
  current?: string
  inbox: InboxEntry[]
  recent: WebRow[]
  more: WebRow[]
  moreForcedOpen: boolean
  loadMore: boolean
  still: boolean
}

/**
 * The sidebar session list's state: data from SessionStore, connection state, search, unread dots and the
 * status bar. The webview (sessions-webview.ts) renders `webModel()` after each coalesced refresh.
 */
export class SessionsView implements vscode.Disposable {
  private readonly rendered = new vscode.EventEmitter<void>()
  /** After each coalesced render; the webview list follows it. */
  readonly onDidRender = this.rendered.event
  private query = ""
  private summary: ConnectionSummary | undefined
  private info: ServerInfo | undefined
  private folderLabel: string | undefined
  private refreshTimer: ReturnType<typeof setTimeout> | undefined
  private current: string | undefined
  private readonly status: vscode.StatusBarItem
  private readonly unread: UnreadTracker
  private readonly clock: ReturnType<typeof setInterval>
  readonly notifier: PendingNotifier
  /** Title-row text and badge, applied by the webview view. */
  chrome: { description?: string; badge?: { value: number; tooltip: string } } = {}
  readonly stats = { renders: 0 }

  constructor(
    private readonly store: SessionStore,
    private readonly memento?: vscode.Memento,
    notifier?: PendingNotifier,
  ) {
    this.unread = new UnreadTracker(memento?.get<string[]>(UNREAD_KEY) ?? [])
    this.notifier =
      notifier ??
      new PendingNotifier({
        notify: (count) => {
          const msg = `${count} request${count === 1 ? "" : "s"} waiting for approval`
          return vscode.window.showWarningMessage(msg, "Show") as Thenable<"Show" | undefined>
        },
        focus: () => {
          void vscode.commands.executeCommand("oco.sessions.focus")
        },
        isEnabled: () => vscode.workspace.getConfiguration("oco.sessions").get<boolean>("notifyPending", true),
      })
    // Time labels and the "since yesterday" boundary age without events.
    this.clock = setInterval(() => this.refresh(), 60_000)
    this.status = vscode.window.createStatusBarItem("oco.connection", vscode.StatusBarAlignment.Left, 10)
    this.status.name = "oco Connection"
    void vscode.commands.executeCommand("setContext", "oco.searchActive", false)
  }

  get sessionStore(): SessionStore {
    return this.store
  }

  /** The session shown in the active panel (fork, new session, another tab); its row is the selected one. */
  setCurrent(sessionId: string | undefined) {
    if (this.current === sessionId) return
    this.current = sessionId
    this.refresh()
  }

  /** Drops one unread id. True when it was present; then the memento and the list update. */
  markRead(id: string): boolean {
    if (!this.unread.clear(id)) return false
    void this.memento?.update(UNREAD_KEY, this.unread.ids())
    this.refresh()
    return true
  }

  /** Coalesces bursts of events (streaming updates) into one render. */
  refresh() {
    if (this.refreshTimer) return
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = undefined
      if (this.unread.update(this.store.list(), this.current)) void this.memento?.update(UNREAD_KEY, this.unread.ids())
      this.stats.renders++
      this.updateChrome()
      this.rendered.fire()
    }, 150)
  }

  get search() {
    return this.query
  }

  get currentSession() {
    return this.current
  }

  /** What the webview renders: rows pre-formatted, connection / empty states as text plus command buttons. */
  webModel(): WebListModel {
    const g = this.groups()
    const s = this.summary
    const still = vscode.workspace.getConfiguration("workbench").get("reduceMotion") === "on"
    const inbox = g.connected ? this.store.inbox(this.current, (id) => this.unread.has(id)) : []
    const q = this.query.trim().toLowerCase()
    const filteredRows = q
      ? inbox.filter(
          (r) =>
            r.title.toLowerCase().includes(q) ||
            (r.agent && r.agent.toLowerCase().includes(q)) ||
            (r.parent && r.parent.toLowerCase().includes(q)) ||
            r.sessionId.toLowerCase().includes(q) ||
            r.summary.toLowerCase().includes(q) ||
            r.detail.toLowerCase().includes(q),
        )
      : inbox
    const groupedInbox = groupInbox(filteredRows)
    const base = {
      query: this.query,
      current: this.current,
      inbox: groupedInbox,
      recent: [] as WebRow[],
      more: [] as WebRow[],
      moreForcedOpen: false,
      loadMore: false,
      still,
    }
    const recent = g.connected ? g.recent.map((i) => this.webRow(i, g.now)) : []
    const more = g.connected ? g.more.map((i) => this.webRow(i, g.now)) : []
    const msg = listMessage({
      summary: s,
      connected: g.connected,
      hasRows: groupedInbox.length > 0 || recent.length > 0 || more.length > 0 || g.loadMore,
      query: this.query,
      loading: this.store.size === 0 && !this.empty,
      trusted: vscode.workspace.isTrusted,
    })
    if (msg) return { ...base, view: "message", text: msg.text, actions: msg.actions }
    const notice = s?.state === "reconnecting" ? `Connection lost. Reconnecting (attempt ${s.attempt})… The list may be out of date.` : undefined
    return { ...base, view: "list", notice, recent, more, moreForcedOpen: !recent.length, loadMore: g.loadMore }
  }

  private webRow(i: SessionListItem, now: number): WebRow {
    const unread = this.unread.has(i.id)
    const count = i.activity === "permission" ? i.pendingPermissions : i.activity === "question" ? i.pendingQuestions : 0
    const statusText = STATUS[i.activity] + (count > 1 ? ` (${count})` : "") || (unread ? "New activity" : "")
    const time = compactTime(i.updated, now)
    const status: WebRow["status"] =
      i.activity === "error" ? "error"
      : i.activity === "permission" || i.activity === "question" ? "waiting"
      : i.activity === "busy" || i.activity === "retry" ? "running"
      : unread ? "unread" : ""
    const tooltip = [i.title, statusText, i.updated ? `Updated ${new Date(i.updated).toLocaleString()}` : "", i.directory, i.error ? `Error: ${i.error}` : ""].filter(Boolean).join("\n")
    return { id: i.id, title: i.title, time, status, tooltip, aria: [i.title, statusText, time].filter(Boolean).join(", ") }
  }

  setSearch(q: string) {
    this.query = q.trim()
    void vscode.commands.executeCommand("setContext", "oco.searchActive", !!this.query)
    this.refresh()
  }

  setConnection(s: ConnectionSummary) {
    this.summary = s
    // Not yet known to be empty: the rows of a new snapshot render on the next refresh.
    if (s.state !== "connected") this.empty = false
    this.refresh()
  }

  items(): SessionListItem[] {
    return this.store.list(this.query)
  }

  /**
   * Today and yesterday first, then everything older under "More". Sessions that are running, waiting
   * or unread stay on top regardless of age. A search shows its results flat.
   */
  private groups() {
    const now = Date.now()
    const s = this.summary?.state
    // Not connected and nothing cached -> webModel() shows the state message instead of rows.
    const connected = !(s === "unconfigured" || (s !== "connected" && s !== "reconnecting" && this.store.size === 0))
    const items = this.items()
    const split = this.query ? { recent: items, more: [] } : splitSessions(items, now, (id) => this.unread.has(id))
    return { ...split, now, connected, loadMore: !this.query && this.store.limitReached }
  }

  private updateChrome() {
    const s = this.summary
    const all = this.items()
    const inbox = this.store.inbox(this.current, (id) => this.unread.has(id))
    const waitingRows = inbox.filter((i) => i.kind === "permission" || i.kind === "question")
    const waiting = waitingRows.length

    if (s?.state === "connected") {
      const pendingItems: PendingNotificationItem[] = waitingRows.map((r) => ({
        id: r.id,
        sessionId: r.sessionId,
        rootSessionId: this.store.rootOf(r.sessionId),
      }))
      this.notifier.check(pendingItems, this.current)
    }

    // Set on render, so "no sessions" never shows while the rows of a new snapshot are on their way.
    this.empty = s?.state === "connected" && all.length === 0 && inbox.length === 0
    this.chrome = {
      description: [this.folderLabel, this.query ? `Search: ${this.query}` : ""].filter(Boolean).join(" · ") || undefined,
      badge: waiting ? { value: waiting, tooltip: `${waiting} request${waiting === 1 ? "" : "s"} waiting for approval` } : undefined,
    }

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

  private empty = false

  /** Multi-root: the folder the list belongs to, shown next to the view title (undefined for one folder). */
  setFolderLabel(label: string | undefined) {
    this.folderLabel = label
    this.refresh()
  }

  /** Server version / mode / managed process shown in the status bar (T007/T015). */
  setServerInfo(info: ServerInfo) {
    this.info = info
    this.refresh()
  }

  debugState() {
    const s = this.summary
    return {
      connection: s ? { state: s.state, attempt: s.attempt, error: s.error, issue: s.issue, label: s.label, trusted: s.trusted } : null,
      search: this.query,
      selected: this.current ?? null,
      folderLabel: this.folderLabel ?? null,
      description: this.chrome.description ?? null,
      badge: this.chrome.badge?.value ?? 0,
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
    this.rendered.dispose()
    this.status.dispose()
  }
}
