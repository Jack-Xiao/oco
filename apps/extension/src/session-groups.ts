// Pure helpers for the sessions sidebar: day groups, compact times, unread dots.
// No vscode dependency. The host passes `now` and the id of the open session.
import type { SessionActivity, SessionListItem } from "@oco/contracts"

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
