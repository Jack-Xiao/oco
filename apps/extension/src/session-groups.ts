// Pure helpers for the sessions sidebar: day groups, compact times, unread dots, state messages.
// No vscode dependency. The host passes `now` and the id of the open session.
import type { ConnectionSummary, SessionActivity, SessionListItem } from "@oco/contracts"

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
 * midnight ("20m"); today is hours; the previous calendar day is "yesterday"; then `Nd` for
 * under a week; then "Sep 28" in the same year, or `YYYY-MM-DD` after that.
 */
export function compactTime(ms: number, now = Date.now()): string {
  if (!ms) return ""
  const diff = Math.max(0, now - ms)
  if (diff < MINUTE) return "now"
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m`
  if (ms >= startOfDay(now)) return `${Math.floor(diff / HOUR)}h`
  if (ms >= startOfYesterday(now)) return "yesterday"
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
  private previous = new Map<string, SessionActivity>()

  constructor(
    initial: Iterable<string> = [],
    private readonly max = 200,
  ) {
    for (const id of initial) this.remember(id)
  }

  has(id: string): boolean {
    return this.unreadSet.has(id)
  }

  /** Drops one id. True when it was present. */
  clear(id: string): boolean {
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
      if (wasRunning && settled && this.remember(item.id)) changed = true
    }
    this.previous = next
    if (current !== undefined && this.clear(current)) changed = true
    return changed
  }

  /** Appends an id, dropping the oldest past `max`. False when the set does not change. */
  private remember(id: string): boolean {
    if (this.unreadSet.has(id)) return false
    this.unread.push(id)
    this.unreadSet.add(id)
    while (this.unread.length > this.max) {
      const oldest = this.unread.shift()
      if (oldest !== undefined) this.unreadSet.delete(oldest)
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
