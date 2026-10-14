// Pure helpers for the sessions sidebar: day groups, compact times, unread dots, state messages.
// No vscode dependency. The host passes `now` and the id of the open session.
import type { ConnectionSummary, SessionActivity, SessionListItem } from "@oco/contracts"
import type { InboxEntry, InboxGroup, InboxRow } from "./session-store"
import {
  formatFailed,
  formatFinished,
  shouldNotify,
  type NotifyLevel,
  type NotifyResult,
} from "./notify-policy"

export type { InboxEntry, InboxGroup, InboxRow }

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 86_400_000

/** Local midnight of the calendar day that contains `ms`. */
export function startOfDay(ms: number): number {
  const date = new Date(ms)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

/** Local midnight of the calendar day before `now`. `setDate` stays on midnight across DST. */
export function startOfYesterday(now: number): number {
  const date = new Date(startOfDay(now))
  date.setDate(date.getDate() - 1)
  return date.getTime()
}

/**
 * Short age label. Blank when `ms` is missing. Under an hour stays minutes even across
 * midnight ("20m"); today is hours; then `Nd` by calendar day for under a week (yesterday
 * is "1d"); then "Sep 28" in the same year, or `YYYY-MM-DD` after that.
 */
export function compactTime(ms: number, now = Date.now()): string {
  if (!ms) return ""
  const diff = Math.max(0, now - ms)
  if (diff < MINUTE) return "now"
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m`
  if (ms >= startOfDay(now)) return `${Math.floor(diff / HOUR)}h`
  const days = Math.round((startOfDay(now) - startOfDay(ms)) / DAY)
  if (days < 7) return `${days}d`
  const date = new Date(ms)
  if (date.getFullYear() === new Date(now).getFullYear()) {
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
  }
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${date.getFullYear()}-${month}-${day}`
}

/** Recent = updated since yesterday, not idle, or unread. Order inside each bucket is kept. */
export function splitSessions(
  items: SessionListItem[],
  now: number,
  unread: (id: string) => boolean,
): { recent: SessionListItem[]; more: SessionListItem[] } {
  const recent: SessionListItem[] = []
  const more: SessionListItem[] = []
  const since = startOfYesterday(now)
  for (const item of items) {
    if (item.updated >= since || item.activity !== "idle" || unread(item.id)) recent.push(item)
    else more.push(item)
  }
  return { recent, more }
}

/**
 * A session becomes unread when it leaves busy/retry for idle/error and it is not the open one.
 * A first sighting never counts. Ids missing from a list stay unread (reconnect can empty the
 * list); the remembered activity is replaced by whatever this list actually contains.
 */
export class UnreadTracker {
  private readonly unread: string[] = []
  private readonly unreadSet = new Set<string>()
  private readonly manual = new Set<string>()
  private previous = new Map<string, SessionActivity>()
  private lastCurrent: string | undefined

  constructor(
    initial: Iterable<string> = [],
    private readonly max = 200,
  ) {
    for (const id of initial) this.remember(id, false)
  }

  has(id: string): boolean {
    return this.unreadSet.has(id)
  }

  /** Drops one id. True when it was present. */
  clear(id: string): boolean {
    this.manual.delete(id)
    if (!this.unreadSet.delete(id)) return false
    const index = this.unread.indexOf(id)
    if (index !== -1) this.unread.splice(index, 1)
    return true
  }

  /** Insertion order, oldest first. */
  ids(): string[] {
    return this.unread.slice()
  }

  /** True when the unread set changed. `current` is always removed and never added. */
  update(items: SessionListItem[], current?: string): boolean {
    const next = new Map<string, SessionActivity>()
    let changed = false
    for (const item of items) {
      const before = this.previous.get(item.id)
      next.set(item.id, item.activity)
      if (before === undefined || item.id === current) continue
      const wasRunning = before === "busy" || before === "retry"
      const settled = item.activity === "idle" || item.activity === "error"
      if (wasRunning && settled && this.remember(item.id, false)) changed = true
    }
    this.previous = next
    if (current !== undefined) {
      const becameCurrent = current !== this.lastCurrent
      if (becameCurrent) {
        this.manual.delete(current)
        if (this.clear(current)) changed = true
      } else if (!this.manual.has(current)) {
        if (this.clear(current)) changed = true
      }
      this.lastCurrent = current
    } else {
      this.lastCurrent = undefined
    }
    return changed
  }

  /** Appends an id, dropping the oldest past `max`. False when the set does not change. */
  remember(id: string, manual = true): boolean {
    if (manual) this.manual.add(id)
    if (this.unreadSet.has(id)) return false
    this.unread.push(id)
    this.unreadSet.add(id)
    while (this.unread.length > this.max) {
      const oldest = this.unread.shift()
      if (oldest !== undefined) {
        this.unreadSet.delete(oldest)
        this.manual.delete(oldest)
      }
    }
    return this.unreadSet.has(id)
  }
}

export type ListAction = { label: string; command: string }

/**
 * Text and buttons the list shows instead of rows (not connected, loading, empty, no search results);
 * undefined when rows show. `connected` is false when not connected and nothing is cached.
 */
export function listMessage(o: {
  summary: Pick<ConnectionSummary, "state" | "issue" | "error"> | undefined
  connected: boolean
  hasRows: boolean
  query: string
  loading: boolean
  trusted: boolean
}): { text: string; actions: ListAction[] } | undefined {
  const s = o.summary
  const settings = { label: "Open Settings", command: "oco.openSettings" }
  const reconnect = { label: "Reconnect Now", command: "oco.reconnect" }
  if (!o.connected) {
    switch (s?.state) {
      case "unconfigured":
        return s.issue === "folder"
          ? { text: "oco is not ready: open a workspace folder first.", actions: [{ label: "Open Folder", command: "workbench.action.files.openFolder" }] }
          : { text: `The server address setting is invalid.${s.error ? ` ${s.error}` : ""}`, actions: [settings] }
      case "unauthorized":
        return {
          text: "The server requires authentication, and the username or password is incorrect (this also happens when no password is set).",
          actions: [{ label: "Set Password", command: "oco.setServerPassword" }, settings],
        }
      case "error":
        return { text: `Cannot connect to the OpenCode server (offline or wrong address). Retrying with backoff.${s.error ? `\n${s.error}` : ""}`, actions: [reconnect, settings] }
      default:
        return { text: "Connecting to the OpenCode server…", actions: [] }
    }
  }
  if (o.hasRows) return undefined
  if (s?.state !== "connected") return { text: "Connection lost. Reconnecting…", actions: [reconnect, settings] }
  if (o.query) return { text: "No matching sessions.", actions: [{ label: "Clear Search", command: "oco.clearSearch" }] }
  if (o.loading) return { text: "Loading sessions…", actions: [] }
  return o.trusted
    ? { text: "This workspace has no OpenCode sessions yet.", actions: [{ label: "New Session", command: "oco.newSession" }] }
    : { text: "This workspace has no sessions yet. Restricted Mode cannot create a session.", actions: [] }
}

export type PendingNotificationItem = {
  id: string
  sessionId: string
  rootSessionId: string
}

export type NotifierDeps = {
  notify: (count: number) => Promise<"Show" | undefined> | { then: (cb: (choice: "Show" | undefined) => void) => unknown }
  focus: () => void | Promise<void>
  /** Read on each check so a settings change applies without a reload. */
  level: () => NotifyLevel
  windowFocused: () => boolean
}

export class PendingNotifier {
  private seenIds = new Set<string>()
  private notifying = false

  constructor(private readonly deps: NotifierDeps) {}

  check(items: PendingNotificationItem[], currentSessionId?: string): boolean {
    const currentIds = new Set(items.map((i) => i.id))
    for (const id of this.seenIds) {
      if (!currentIds.has(id)) this.seenIds.delete(id)
    }

    let hasNewNonCurrent = false
    for (const item of items) {
      if (!this.seenIds.has(item.id)) {
        this.seenIds.add(item.id)
        const isCurrent =
          !!currentSessionId &&
          (item.sessionId === currentSessionId || item.rootSessionId === currentSessionId)
        if (!isCurrent) {
          hasNewNonCurrent = true
        }
      }
    }

    if (!hasNewNonCurrent) return false
    if (!shouldNotify(this.deps.level(), this.deps.windowFocused())) return false
    if (this.notifying) return false

    this.notifying = true
    const count = items.length
    Promise.resolve(this.deps.notify(count))
      .then((choice) => {
        if (choice === "Show") {
          void this.deps.focus()
        }
      })
      .finally(() => {
        this.notifying = false
      })

    return true
  }

  reset() {
    this.seenIds.clear()
    this.notifying = false
  }
}

export type FinishedSession = {
  id: string
  parentID?: string
  activity: SessionActivity
  title: string
  result?: NotifyResult
  error?: string
}

export type FinishedAction = "Show" | "Open" | "Diff"

export type FinishedNotice = {
  severity: "info" | "warning"
  message: string
  actions: FinishedAction[]
  /** Set for a single session so Open / Diff know the target. */
  sessionId?: string
}

const FINISHED_DELAY_MS = 1500

export type FinishedNotifierDeps = {
  level: () => NotifyLevel
  windowFocused: () => boolean
  notify: (
    notice: FinishedNotice,
  ) => Promise<FinishedAction | undefined> | { then: (cb: (choice: FinishedAction | undefined) => void) => unknown }
  focus: () => void | Promise<void>
  open: (sessionId: string) => void | Promise<void>
  diff: (sessionId: string) => void | Promise<void>
  /** Returns a cancel function. Defaults to `setTimeout` of 1500 ms. */
  schedule?: (fn: () => void, ms: number) => () => void
  delayMs?: number
}

type FinishedBatch = {
  ids: Map<string, "idle" | "error">
  cancel: () => void
}

/**
 * Notifies when a root session leaves busy/retry for idle or error.
 * The toast waits so a summary that lands just after idle is included, and is dropped if the
 * session starts running again. Several roots settling in one pass share one toast.
 */
export class FinishedNotifier {
  private previous = new Map<string, SessionActivity>()
  private latest = new Map<string, FinishedSession>()
  private current: string | undefined
  private batches: FinishedBatch[] = []
  private disposed = false
  private readonly schedule: (fn: () => void, ms: number) => () => void
  private readonly delayMs: number

  constructor(private readonly deps: FinishedNotifierDeps) {
    this.schedule =
      deps.schedule ??
      ((fn, ms) => {
        const handle = setTimeout(fn, ms)
        return () => clearTimeout(handle)
      })
    this.delayMs = deps.delayMs ?? FINISHED_DELAY_MS
  }

  check(items: FinishedSession[], currentSessionId?: string): void {
    this.current = currentSessionId
    const seen = new Set<string>()
    const fresh: Array<{ id: string; outcome: "idle" | "error" }> = []
    for (const item of items) {
      seen.add(item.id)
      this.remember(item)
      const before = this.previous.get(item.id)
      this.previous.set(item.id, item.activity)
      if (item.activity === "busy" || item.activity === "retry") this.cancelId(item.id)
      if (item.parentID) continue
      if (currentSessionId !== undefined && item.id === currentSessionId) {
        this.cancelId(item.id)
        continue
      }
      if (before === undefined) continue
      const wasRunning = before === "busy" || before === "retry"
      if (wasRunning && (item.activity === "idle" || item.activity === "error")) {
        fresh.push({ id: item.id, outcome: item.activity })
      }
    }
    const gone: string[] = []
    for (const id of this.previous.keys()) if (!seen.has(id)) gone.push(id)
    for (const id of gone) {
      this.previous.delete(id)
      this.latest.delete(id)
      this.cancelId(id)
    }
    if (fresh.length > 0) this.arm(fresh)
  }

  dispose(): void {
    this.disposed = true
    for (const batch of this.batches) batch.cancel()
    this.batches = []
  }

  private remember(item: FinishedSession): void {
    const prev = this.latest.get(item.id)
    if (item.activity === "busy" || item.activity === "retry") {
      this.latest.set(item.id, { ...item, result: undefined, error: undefined })
      return
    }
    this.latest.set(item.id, {
      ...item,
      result: item.result ?? prev?.result,
      error: item.error ?? prev?.error,
    })
  }

  private arm(fresh: Array<{ id: string; outcome: "idle" | "error" }>): void {
    const ids = new Map(fresh.map((item) => [item.id, item.outcome]))
    const batch: FinishedBatch = { ids, cancel: () => {} }
    this.batches.push(batch)
    batch.cancel = this.schedule(() => {
      this.batches = this.batches.filter((item) => item !== batch)
      this.fire(ids)
    }, this.delayMs)
  }

  private cancelId(id: string): void {
    const keep: FinishedBatch[] = []
    for (const batch of this.batches) {
      batch.ids.delete(id)
      if (batch.ids.size === 0) batch.cancel()
      else keep.push(batch)
    }
    this.batches = keep
  }

  private fire(ids: Map<string, "idle" | "error">): void {
    if (this.disposed) return
    if (!shouldNotify(this.deps.level(), this.deps.windowFocused())) return
    const alive: FinishedSession[] = []
    const outcomes: Array<"idle" | "error"> = []
    for (const [id, scheduled] of ids) {
      if (this.current !== undefined && id === this.current) continue
      const session = this.latest.get(id)
      if (!session || session.parentID) continue
      if (session.activity === "busy" || session.activity === "retry") continue
      const outcome = session.activity === "idle" || session.activity === "error" ? session.activity : scheduled
      alive.push(session)
      outcomes.push(outcome)
    }
    if (alive.length === 0) return
    if (alive.length > 1) {
      this.emit({
        severity: outcomes.some((outcome) => outcome === "error") ? "warning" : "info",
        message: `${alive.length} sessions finished`,
        actions: ["Show"],
      })
      return
    }
    const session = alive[0]
    if (outcomes[0] === "error") {
      this.emit({
        severity: "warning",
        message: formatFailed(session.title, session.error),
        actions: ["Open"],
        sessionId: session.id,
      })
      return
    }
    const fileCount = session.result?.files?.length ?? 0
    this.emit({
      severity: "info",
      message: formatFinished(session.title, session.result),
      actions: fileCount > 0 ? ["Open", "Diff"] : ["Open"],
      sessionId: session.id,
    })
  }

  private emit(notice: FinishedNotice): void {
    Promise.resolve(this.deps.notify(notice)).then((choice) => {
      if (choice === "Show") void this.deps.focus()
      else if (choice === "Open" && notice.sessionId) void this.deps.open(notice.sessionId)
      else if (choice === "Diff" && notice.sessionId) void this.deps.diff(notice.sessionId)
    })
  }
}

/**
 * Groups inbox rows by parent session:
 * - Rows with a parentId and known parent title are grouped under InboxGroup.
 * - Rows without parentId or with unknown parent title remain top-level InboxRow.
 * - Top-level entries sorted by earliest `at` ascending (group takes its child rows' earliest `at`).
 * - Child rows inside a group sorted by `at` ascending.
 */
export function groupInbox(
  rows: InboxRow[],
  getParentTitle?: (parentId: string) => string | undefined,
): InboxEntry[] {
  const groupsByParentId = new Map<string, { parentId: string; title: string; rows: InboxRow[] }>()
  const standaloneRows: InboxRow[] = []

  for (const row of rows) {
    const parentTitle = row.parent ?? (row.parentId ? getParentTitle?.(row.parentId) : undefined)
    if (row.parentId && parentTitle) {
      let grp = groupsByParentId.get(row.parentId)
      if (!grp) {
        grp = { parentId: row.parentId, title: parentTitle, rows: [] }
        groupsByParentId.set(row.parentId, grp)
      }
      grp.rows.push(row)
    } else {
      standaloneRows.push(row)
    }
  }

  const groups: InboxGroup[] = []
  for (const grp of groupsByParentId.values()) {
    grp.rows.sort((a, b) => a.at - b.at || a.id.localeCompare(b.id))
    groups.push({
      kind: "group",
      parentId: grp.parentId,
      title: grp.title,
      rows: grp.rows,
    })
  }

  const entries: InboxEntry[] = [...standaloneRows, ...groups]

  const earliestAt = (entry: InboxEntry): number => {
    if (entry.kind === "group") {
      return entry.rows.length > 0 ? entry.rows[0].at : Infinity
    }
    return entry.at
  }

  const entryKey = (entry: InboxEntry): string => {
    return entry.kind === "group" ? entry.parentId : entry.id
  }

  entries.sort((a, b) => {
    const atA = earliestAt(a)
    const atB = earliestAt(b)
    if (atA !== atB) return atA - atB
    return entryKey(a).localeCompare(entryKey(b))
  })

  return entries
}

