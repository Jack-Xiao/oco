import * as vscode from "vscode"
import type { ConnectionSummary, SessionActivity, SessionListItem } from "@oco/contracts"
import type { InboxEntry, InboxRow, SessionStore } from "./session-store"
import { formatHud, formatHudTooltip } from "./status-hud"
import { serverInfoLines, versionNote, type ServerInfo } from "./diagnostics"
import { resolveLevel, type NotifySettingsInspect } from "./notify-policy"
import { planStop, rootIds } from "./stop-sessions"
import {
  compactTime,
  groupInbox,
  listMessage,
  splitSessions,
  UnreadTracker,
  PendingNotifier,
  FinishedNotifier,
  type FinishedAction,
  type FinishedSession,
  type NotifierDeps,
  type PendingNotificationItem,
} from "./session-groups"

export { PendingNotifier, type NotifierDeps, type PendingNotificationItem }

const UNREAD_KEY = "oco.unreadSessions"
const PINNED_KEY = "oco.pinnedSessions"
const LABELS_KEY = "oco.sessionLabels"
const SNOOZED_KEY = "oco.snoozedSessions"

/** Upper limit on lazy probe requests for recent sessions to avoid network floods (M20 E2E caused 74–92 requests per connect). */
const MAX_RECENT_PROBE_COUNT = 20

/** Live inspect snapshot. A settings change applies on the next check; nothing is written back. */
function readNotifySettings(): NotifySettingsInspect {
  const oco = vscode.workspace.getConfiguration("oco")
  const sessions = vscode.workspace.getConfiguration("oco.sessions")
  return {
    needsMe: oco.inspect<unknown>("notify.needsMe"),
    finished: oco.inspect<unknown>("notify.finished"),
    notifyPending: sessions.inspect<unknown>("notifyPending"),
  }
}

function finishedSessions(list: { id: string; title: string; activity: FinishedSession["activity"]; error?: string }[], inbox: InboxRow[]): FinishedSession[] {
  const extra = new Map<string, { parentID?: string; result?: FinishedSession["result"] }>()
  for (const row of inbox) {
    const prev = extra.get(row.sessionId)
    if (!prev || row.kind === "done" || row.kind === "error") {
      extra.set(row.sessionId, { parentID: row.parentId ?? prev?.parentID, result: row.result ?? prev?.result })
    }
  }
  return list.map((item) => {
    const more = extra.get(item.id)
    return {
      id: item.id,
      parentID: more?.parentID,
      activity: item.activity,
      title: item.title,
      result: more?.result,
      error: item.error,
    }
  })
}

const STATUS: Record<SessionActivity, string> = {
  idle: "",
  busy: "Running",
  retry: "Retrying",
  permission: "Waiting for permission",
  question: "Waiting for answer",
  error: "Error",
}

/** Row and state shapes of the webview list (message contract: docs/evidence/sessions-webview-spike-2026-10-08.md). */
export type WebRow = {
  id: string
  title: string
  time: string
  status: "" | "running" | "waiting" | "unread" | "error"
  tooltip: string
  aria: string
  pinned: boolean
  label?: string
  snoozed?: boolean
  /** Card 2 B: the session or a subagent is busy on the server (also while it waits for permission / an answer). Drives ■, the selection-bar Stop and the `running` context key. */
  stoppable?: boolean
  notes?: number
  todo?: { done: number; total: number; items: Array<{ content: string; status: string }> }
  subagents?: {
    done: number
    total: number
    running: number
    attention: boolean
    items: Array<{
      id: string
      title: string
      status: "" | "running" | "waiting" | "error"
      time: string
    }>
  }
}
export type WebListModel = {
  view: "list" | "message"
  text?: string
  notice?: string
  actions?: { label: string; command: string }[]
  query: string
  current?: string
  inbox: InboxEntry[]
  pinned: WebRow[]
  labeled: Array<{ label: string; rows: WebRow[] }>
  recent: WebRow[]
  more: WebRow[]
  moreForcedOpen: boolean
  loadMore: boolean
  still: boolean
  snoozed: WebRow[]
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
  /** Card 2 B: "Stop all running", shown next to the connection item only while a session runs. */
  private readonly stopStatus: vscode.StatusBarItem
  private readonly hudStatus: vscode.StatusBarItem
  private hudDeps?: {
    focusedSession?: () => string | undefined
    getLimit?: (providerID?: string, modelID?: string) => number | undefined
  }
  private stopVisible = false
  /** Root sessions Stop would act on, recomputed per render with the same plan the Stop command uses. */
  private stoppable = new Set<string>()
  private readonly unread: UnreadTracker
  private readonly pinned = new Set<string>()
  private readonly labels = new Map<string, string>()
  private readonly snoozed = new Map<string, number>()
  private todoProbe?: (id: string) => void
  private childrenProbe?: (id: string) => void
  private noteCounter?: (sessionId: string) => number
  private moreOpen = false
  private readonly clock: ReturnType<typeof setInterval>
  readonly notifier: PendingNotifier
  private readonly finished: FinishedNotifier
  /** Title-row text and badge, applied by the webview view. */
  chrome: { description?: string; badge?: { value: number; tooltip: string } } = {}
  readonly stats = { renders: 0 }

  constructor(
    private readonly store: SessionStore,
    private readonly memento?: vscode.Memento,
    notifier?: PendingNotifier,
  ) {
    this.unread = new UnreadTracker(memento?.get<string[]>(UNREAD_KEY) ?? [])
    const initialPinned = memento?.get<string[]>(PINNED_KEY) ?? []
    for (const id of initialPinned) this.pinned.add(id)
    const initialLabels = memento?.get<Record<string, string>>(LABELS_KEY) ?? {}
    for (const [id, lbl] of Object.entries(initialLabels)) {
      if (typeof lbl === "string" && lbl.trim()) this.labels.set(id, lbl.trim().slice(0, 32))
    }
    const initialSnoozed = memento?.get<Record<string, number>>(SNOOZED_KEY) ?? {}
    for (const [id, time] of Object.entries(initialSnoozed)) {
      if (typeof time === "number") this.snoozed.set(id, time)
    }
    const focusSessions = () => {
      void vscode.commands.executeCommand("oco.sessions.focus")
    }
    const windowFocused = () => vscode.window.state.focused
    this.notifier =
      notifier ??
      new PendingNotifier({
        notify: (count) => {
          const msg = `${count} request${count === 1 ? "" : "s"} waiting for approval`
          return vscode.window.showWarningMessage(msg, "Show") as Thenable<"Show" | undefined>
        },
        focus: focusSessions,
        level: () => resolveLevel("needsMe", readNotifySettings()),
        windowFocused,
      })
    this.finished = new FinishedNotifier({
      level: () => resolveLevel("finished", readNotifySettings()),
      windowFocused,
      notify: (notice) =>
        (notice.severity === "warning"
          ? vscode.window.showWarningMessage(notice.message, ...notice.actions)
          : vscode.window.showInformationMessage(notice.message, ...notice.actions)) as Thenable<FinishedAction | undefined>,
      focus: focusSessions,
      open: (id) => {
        void vscode.commands.executeCommand("oco.openSession", id)
      },
      diff: (id) => {
        void vscode.commands.executeCommand("oco.openSessionReview", id)
      },
    })
    // Time labels and the "since yesterday" boundary age without events.
    this.clock = setInterval(() => this.refresh(), 60_000)
    this.status = vscode.window.createStatusBarItem("oco.connection", vscode.StatusBarAlignment.Left, 10)
    this.stopStatus = vscode.window.createStatusBarItem("oco.stopAll", vscode.StatusBarAlignment.Left, 9)
    this.hudStatus = vscode.window.createStatusBarItem("oco.hud", vscode.StatusBarAlignment.Left, 8)
    this.stopStatus.name = "oco Stop All Running"
    this.stopStatus.command = "oco.sessions.stopAllRunning"
    this.status.name = "oco Connection"
    this.hudStatus.name = "oco HUD"
    void vscode.commands.executeCommand("setContext", "oco.searchActive", false)
  }

  setHudDeps(deps: {
    focusedSession?: () => string | undefined
    getLimit?: (providerID?: string, modelID?: string) => number | undefined
  }) {
    this.hudDeps = deps
    this.refresh()
  }

  get sessionStore(): SessionStore {
    return this.store
  }

  /** The session shown in the active panel (fork, new session, another tab); its row is the selected one. */
  get currentSessionId(): string | undefined {
    return this.current
  }

  setCurrent(sessionId: string | undefined) {
    if (this.current === sessionId) return
    this.current = sessionId
    this.refresh()
  }

  isPinned(id: string): boolean {
    return this.pinned.has(id)
  }

  setPinned(id: string, pinned: boolean): void {
    if (pinned) {
      if (this.pinned.has(id)) return
      this.pinned.add(id)
    } else {
      if (!this.pinned.has(id)) return
      this.pinned.delete(id)
    }
    void this.memento?.update(PINNED_KEY, Array.from(this.pinned))
    this.refresh()
  }

  togglePin(id: string): void {
    this.setPinned(id, !this.isPinned(id))
  }

  markUnread(ids: string[]): void {
    for (const id of ids) {
      this.unread.remember(id)
    }
    void this.memento?.update(UNREAD_KEY, this.unread.ids())
    this.refresh()
  }

  setLabel(ids: string[], rawLabel: string | null): void {
    const trimmed = rawLabel?.trim()
    const label = trimmed && trimmed.length > 0 ? trimmed.slice(0, 32) : null
    for (const id of ids) {
      if (label) this.labels.set(id, label)
      else this.labels.delete(id)
    }
    const record: Record<string, string> = {}
    for (const [id, lbl] of this.labels) record[id] = lbl
    void this.memento?.update(LABELS_KEY, record)
    this.refresh()
  }

  getLabel(id: string): string | undefined {
    return this.labels.get(id)
  }

  setSnooze(ids: string[], snoozed: boolean): void {
    const list = this.store.list()
    const map = new Map(list.map((s) => [s.id, s]))
    for (const id of ids) {
      if (snoozed) {
        const session = map.get(id)
        this.snoozed.set(id, session?.updated ?? 0)
      } else {
        this.snoozed.delete(id)
      }
    }
    this.persistSnoozed()
    this.refresh()
  }

  isSnoozed(id: string): boolean {
    return this.snoozed.has(id)
  }

  private persistSnoozed(): void {
    const record: Record<string, number> = {}
    for (const [id, time] of this.snoozed) record[id] = time
    void this.memento?.update(SNOOZED_KEY, record)
  }

  /** Auto-clear snooze when a session's time.updated has advanced. */
  private checkSnoozeWake(items: SessionListItem[]): void {
    let changed = false
    const itemMap = new Map(items.map((i) => [i.id, i]))
    for (const [id, snoozedAt] of this.snoozed) {
      // A session missing from this list (search, unloaded page, before the snapshot) keeps its snooze.
      const it = itemMap.get(id)
      if (it && it.updated > snoozedAt) {
        this.snoozed.delete(id)
        changed = true
      }
    }
    if (changed) this.persistSnoozed()
  }

  private isEffectivelySnoozed(item: SessionListItem): boolean {
    if (!this.snoozed.has(item.id)) return false
    if (item.activity === "permission" || item.activity === "question" || item.activity === "busy" || item.activity === "retry") {
      return false
    }
    return true
  }

  setTodoProbe(fn: (id: string) => void): void {
    this.todoProbe = fn
  }

  setChildrenProbe(fn: (id: string) => void): void {
    this.childrenProbe = fn
  }

  setNoteCounter(fn: (sessionId: string) => number): void {
    this.noteCounter = fn
    this.refresh()
  }

  setMoreOpen(open: boolean): void {
    this.moreOpen = open
    this.refresh()
  }

  isUnread(id: string): boolean {
    return this.unread.has(id)
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
    const rawInbox = g.connected ? this.store.inbox(this.current, (id) => this.unread.has(id)) : []
    const inbox = rawInbox.filter((r) => {
      if (r.kind === "permission" || r.kind === "question") return true
      if (this.snoozed.has(r.sessionId)) {
        const sess = this.store.list().find((item) => item.id === r.sessionId)
        if (sess && !this.isEffectivelySnoozed(sess)) return true
        return false
      }
      return true
    })
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
    this.stoppable = this.stoppableRoots()
    const pinned = g.connected ? g.pinned.map((i) => this.webRow(i, g.now)) : []
    const labeled = g.connected
      ? g.labeled.map((grp) => ({
          label: grp.label,
          rows: grp.rows.map((i) => this.webRow(i, g.now)),
        }))
      : []
    const recent = g.connected ? g.recent.map((i) => this.webRow(i, g.now)) : []
    const more = g.connected ? g.more.map((i) => this.webRow(i, g.now)) : []
    const snoozed = g.connected ? g.snoozed.map((i) => this.webRow(i, g.now)) : []
    const moreForcedOpen = !pinned.length && !labeled.length && !recent.length

    if (g.connected && (this.todoProbe || this.childrenProbe)) {
      const probeIds = new Set<string>()
      for (const entry of groupedInbox) {
        if (entry.kind === "group") {
          for (const r of entry.rows) probeIds.add(r.sessionId)
        } else {
          probeIds.add(entry.sessionId)
        }
      }
      for (const item of g.pinned) probeIds.add(item.id)
      for (const item of g.recent.slice(0, MAX_RECENT_PROBE_COUNT)) probeIds.add(item.id)

      if (this.todoProbe) {
        for (const id of probeIds) this.todoProbe(id)
      }
      if (this.childrenProbe) {
        for (const id of probeIds) this.childrenProbe(id)
      }
    }

    const base = {
      query: this.query,
      current: this.current,
      // M11: groupedInbox preserves question rows' `questions` for in-place answering in webview
      inbox: groupedInbox,
      pinned,
      labeled,
      recent,
      more,
      snoozed,
      moreForcedOpen,
      loadMore: false,
      still,
    }
    const msg = listMessage({
      summary: s,
      connected: g.connected,
      hasRows: groupedInbox.length > 0 || pinned.length > 0 || labeled.length > 0 || recent.length > 0 || more.length > 0 || snoozed.length > 0 || g.loadMore,
      query: this.query,
      loading: this.store.size === 0 && !this.empty,
      trusted: vscode.workspace.isTrusted,
    })
    if (msg) return { ...base, view: "message", text: msg.text, actions: msg.actions }
    const notice = s?.state === "reconnecting" ? `Connection lost. Reconnecting (attempt ${s.attempt})… The list may be out of date.` : undefined
    return { ...base, view: "list", notice, pinned, labeled, recent, more, snoozed, moreForcedOpen, loadMore: g.loadMore }
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
    const notes = this.noteCounter?.(i.id) ?? 0
    const sub = this.store.subagents(i.id)
    const subagents: WebRow["subagents"] =
      sub.total >= 1
        ? {
            done: sub.done,
            total: sub.total,
            running: sub.running,
            attention: sub.waiting > 0 || sub.error > 0,
            items: sub.items.map((item) => ({
              id: item.id,
              title: item.title,
              status: item.status === "done" ? "" : item.status,
              time: compactTime(item.updated, now),
            })),
          }
        : undefined
    const label = this.labels.get(i.id)
    const isSnoozed = this.snoozed.has(i.id)
    return {
      id: i.id,
      title: i.title,
      time,
      status,
      tooltip,
      aria: [i.title, statusText, time].filter(Boolean).join(", "),
      pinned: this.isPinned(i.id),
      ...(label ? { label } : {}),
      ...(isSnoozed ? { snoozed: true } : {}),
      ...(this.stoppable.has(i.id) ? { stoppable: true } : {}),
      ...(notes > 0 ? { notes } : {}),
      todo: i.todo,
      ...(subagents ? { subagents } : {}),
    }
  }

  /** Roots that are busy themselves or through a subagent, by server status (a session waiting for permission is busy too). Empty unless connected and trusted. */
  private stoppableRoots(): Set<string> {
    if (this.summary?.state !== "connected" || !vscode.workspace.isTrusted) return new Set()
    const states = this.store.sessionStates()
    return new Set(planStop(rootIds(states), states).targets.map((t) => t.id))
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
    this.checkSnoozeWake(items)
    if (this.query) {
      return {
        pinned: [] as SessionListItem[],
        labeled: [] as Array<{ label: string; rows: SessionListItem[] }>,
        recent: items,
        more: [] as SessionListItem[],
        snoozed: [] as SessionListItem[],
        now,
        connected,
        loadMore: false,
      }
    }
    const snoozed: SessionListItem[] = []
    const active: SessionListItem[] = []
    for (const item of items) {
      if (this.isEffectivelySnoozed(item)) snoozed.push(item)
      else active.push(item)
    }

    const pinned: SessionListItem[] = []
    const unpinned: SessionListItem[] = []
    for (const item of active) {
      if (this.isPinned(item.id)) pinned.push(item)
      else unpinned.push(item)
    }
    pinned.sort((a, b) => b.updated - a.updated || a.id.localeCompare(b.id))

    const labeledMap = new Map<string, SessionListItem[]>()
    const unlabeled: SessionListItem[] = []
    for (const item of unpinned) {
      const lbl = this.labels.get(item.id)
      if (lbl) {
        let arr = labeledMap.get(lbl)
        if (!arr) {
          arr = []
          labeledMap.set(lbl, arr)
        }
        arr.push(item)
      } else {
        unlabeled.push(item)
      }
    }

    const sortedLabels = Array.from(labeledMap.keys()).sort((a, b) => a.localeCompare(b))
    const labeled = sortedLabels.map((label) => ({
      label,
      rows: labeledMap.get(label)!,
    }))

    const split = splitSessions(unlabeled, now, (id) => this.unread.has(id))
    snoozed.sort((a, b) => b.updated - a.updated || a.id.localeCompare(b.id))

    return {
      pinned,
      labeled,
      recent: split.recent,
      more: split.more,
      snoozed,
      now,
      connected,
      loadMore: this.store.limitReached,
    }
  }

  private updateChrome() {
    const s = this.summary
    const all = this.items()
    const inbox = this.store.inbox(this.current, (id) => this.unread.has(id))
    const waitingRows = inbox.filter((i) => i.kind === "permission" || i.kind === "question")
    const waiting = waitingRows.length
    // Notifications and the stop item look at every root session, not just the ones a search shows.
    const roots = this.query ? this.store.list() : all
    this.finished.check(finishedSessions(roots, inbox), this.current)

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
    this.stoppable = this.stoppableRoots()
    const running = this.stoppable.size
    if (running > 0) {
      this.stopStatus.text = `$(debug-stop) ${running}`
      this.stopStatus.tooltip = `Stop all running sessions (${running})…`
      this.stopStatus.show()
    } else this.stopStatus.hide()
    this.stopVisible = running > 0

    // Feature B: Status bar HUD
    const hudEnabled = vscode.workspace.getConfiguration("oco").get<boolean>("statusBar.hud", true)
    const focusedId = this.hudDeps?.focusedSession?.() ?? this.current
    if (!hudEnabled || !focusedId) {
      this.hudStatus.hide()
    } else {
      const session = this.store.list().find((i) => i.id === focusedId)
      const model = this.store.lastModel(focusedId)
      const tokens = this.store.lastTokens(focusedId)
      const metrics = this.store.sessionMetrics(focusedId)
      const limit = this.hudDeps?.getLimit?.(model?.providerID, model?.modelID)

      // A pending permission / question outranks the running state (the agent is busy *and* waiting on the user).
      const state = this.store.hasPending(focusedId) ? "permission" : (session?.activity ?? "idle")

      this.hudStatus.text = formatHud({
        model: model?.modelID,
        tokens,
        limit,
        cost: metrics.costUsd,
        state,
      })
      this.hudStatus.tooltip = formatHudTooltip({
        title: session?.title,
        sessionId: focusedId,
        state,
        providerID: model?.providerID,
        modelID: model?.modelID,
        tokens,
        limit,
        cost: metrics.costUsd,
        sessionTokens: metrics.tokens,
      })
      this.hudStatus.command = {
        title: "Open Session",
        command: "oco.openSession",
        arguments: [{ sessionId: focusedId }],
      }
      this.hudStatus.show()
    }
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
      stopText: this.stopVisible ? this.stopStatus.text : null,
      items: (() => {
        const g = this.groups()
        const row = (group: string) => (i: SessionListItem) => ({ id: i.id, title: i.title, activity: i.activity, group, unread: this.unread.has(i.id), description: compactTime(i.updated, g.now) })
        return [
          ...g.pinned.map(row("pinned")),
          ...g.labeled.flatMap((grp) => grp.rows.map(row(`labeled:${grp.label}`))),
          ...g.recent.map(row("recent")),
          ...g.more.map(row("more")),
          ...g.snoozed.map(row("snoozed")),
        ]
      })(),
      loadMore: this.groups().loadMore,
    }
  }

  dispose() {
    if (this.refreshTimer) clearTimeout(this.refreshTimer)
    clearInterval(this.clock)
    this.finished.dispose()
    this.rendered.dispose()
    this.status.dispose()
    this.stopStatus.dispose()
    this.hudStatus.dispose()
  }
}
