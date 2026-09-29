import type { SessionActivity, SessionListItem } from "@oco/contracts"

/**
 * Pure session cache for the native sidebar (no vscode dependency; unit-tested).
 * Source of truth is the server: a snapshot replaces everything, events patch it. Every reducer is
 * idempotent, so a snapshot followed by a replay of events buffered while it loaded, or an event
 * delivered twice across a reconnect, converges to the same state.
 */

export type ServerSession = {
  id: string
  title?: string
  directory: string
  parentID?: string
  time?: { created?: number; updated?: number; archived?: number }
}
export type ServerStatus = { type: "idle" | "busy" | "retry"; message?: string }
export type PendingRequest = { id: string; sessionID: string }
export type Snapshot = {
  sessions: ServerSession[]
  status: Record<string, ServerStatus>
  permissions: PendingRequest[]
  questions: PendingRequest[]
}
export type ServerEvent = { id?: string; type: string; properties?: Record<string, unknown> }

type Row = { session: ServerSession; status: ServerStatus["type"]; error?: string }

export class SessionStore {
  private rows = new Map<string, Row>()
  private permissions = new Map<string, string>() // request id -> session id
  private questions = new Map<string, string>()
  private seen = new Set<string>() // recent event ids (bounded), for duplicate delivery
  private static readonly SEEN_MAX = 1024
  readonly stats = { snapshots: 0, events: 0, duplicates: 0, ignored: 0 }

  /** Only sessions for which this returns true are kept (workspace ownership). */
  constructor(private readonly owns: (directory: string) => boolean) {}

  applySnapshot(s: Snapshot) {
    this.stats.snapshots++
    const rows = new Map<string, Row>()
    for (const session of s.sessions) {
      if (!session?.id || !this.owns(session.directory) || session.time?.archived) continue
      const prev = this.rows.get(session.id)
      rows.set(session.id, { session, status: s.status[session.id]?.type ?? "idle", error: prev?.error })
    }
    this.rows = rows
    this.permissions = new Map(s.permissions.filter((p) => rows.has(p.sessionID)).map((p) => [p.id, p.sessionID]))
    this.questions = new Map(s.questions.filter((q) => rows.has(q.sessionID)).map((q) => [q.id, q.sessionID]))
  }

  /** Returns true when the visible list may have changed. */
  applyEvent(e: ServerEvent): boolean {
    if (e.id) {
      if (this.seen.has(e.id)) {
        this.stats.duplicates++
        return false
      }
      this.seen.add(e.id)
      if (this.seen.size > SessionStore.SEEN_MAX) this.seen.delete(this.seen.values().next().value as string)
    }
    this.stats.events++
    const p = (e.properties ?? {}) as Record<string, any>
    const sid: string | undefined = typeof p.sessionID === "string" ? p.sessionID : undefined
    switch (e.type) {
      case "session.created":
      case "session.updated":
        return this.upsert(p.info as ServerSession)
      case "session.deleted":
        return sid ? this.remove(sid) : false
      case "session.status": {
        const row = sid && this.rows.get(sid)
        if (!row) return this.ignore()
        const type = (p.status?.type ?? "idle") as ServerStatus["type"]
        if (type === "busy") row.error = undefined // a new run clears the previous error
        const changed = row.status !== type
        row.status = type
        return changed || type === "busy"
      }
      case "session.idle": {
        const row = sid && this.rows.get(sid)
        if (!row) return this.ignore()
        const changed = row.status !== "idle"
        row.status = "idle"
        return changed
      }
      case "session.error": {
        const row = sid && this.rows.get(sid)
        if (!row) return this.ignore()
        const err = p.error as { name?: string; data?: { message?: string } } | undefined
        // An abort (stop button) is not a failure.
        if (err?.name === "MessageAbortedError") return false
        row.error = err?.data?.message || err?.name || "error"
        return true
      }
      case "permission.asked":
        return sid && this.rows.has(sid) && typeof p.id === "string" ? this.setPending(this.permissions, p.id, sid) : this.ignore()
      case "permission.replied":
        return typeof p.requestID === "string" ? this.permissions.delete(p.requestID) : false
      case "question.asked":
        return sid && this.rows.has(sid) && typeof p.id === "string" ? this.setPending(this.questions, p.id, sid) : this.ignore()
      case "question.replied":
      case "question.rejected":
        return typeof p.requestID === "string" ? this.questions.delete(p.requestID) : false
      default:
        return false
    }
  }

  /** Local backfill after this client created a session (the event may arrive later, or first). */
  add(session: ServerSession) {
    return this.upsert(session)
  }

  has(id: string) {
    return this.rows.has(id)
  }

  get size() {
    return this.rows.size
  }

  /** Root of a session (walks parentID while the parent is known). */
  rootOf(id: string): string {
    let cur = id
    for (let i = 0; i < 32; i++) {
      const parent = this.rows.get(cur)?.session.parentID
      if (!parent || !this.rows.has(parent)) return cur
      cur = parent
    }
    return cur
  }

  /** Root sessions, newest first. `query` matches title or id, case-insensitively. */
  list(query?: string): SessionListItem[] {
    const perm = this.countByRoot(this.permissions)
    const ques = this.countByRoot(this.questions)
    const busy = new Map<string, ServerStatus["type"]>()
    const errors = new Map<string, string>()
    for (const [id, row] of this.rows) {
      const root = this.rootOf(id)
      if (row.status !== "idle" && busy.get(root) !== "busy") busy.set(root, row.status)
      if (row.error && !errors.has(root)) errors.set(root, row.error)
    }
    const q = query?.trim().toLowerCase()
    const out: SessionListItem[] = []
    for (const [id, row] of this.rows) {
      if (this.rootOf(id) !== id) continue
      const title = row.session.title?.trim() || id
      if (q && !title.toLowerCase().includes(q) && !id.toLowerCase().includes(q)) continue
      const pendingPermissions = perm.get(id) ?? 0
      const pendingQuestions = ques.get(id) ?? 0
      const error = row.error ?? errors.get(id)
      const run = busy.get(id)
      const activity: SessionActivity = pendingPermissions
        ? "permission"
        : pendingQuestions
          ? "question"
          : run === "busy" || run === "retry"
            ? run
            : error
              ? "error"
              : "idle"
      out.push({
        id,
        title,
        directory: row.session.directory,
        updated: row.session.time?.updated ?? row.session.time?.created ?? 0,
        activity,
        pendingPermissions,
        pendingQuestions,
        error,
      })
    }
    return out.sort((a, b) => b.updated - a.updated || a.id.localeCompare(b.id))
  }

  private countByRoot(m: Map<string, string>) {
    const out = new Map<string, number>()
    for (const sid of m.values()) {
      const root = this.rootOf(sid)
      out.set(root, (out.get(root) ?? 0) + 1)
    }
    return out
  }

  private upsert(info: ServerSession | undefined): boolean {
    if (!info?.id || typeof info.directory !== "string") return this.ignore()
    if (!this.owns(info.directory)) return this.ignore()
    if (info.time?.archived) return this.remove(info.id)
    const row = this.rows.get(info.id)
    if (!row) {
      this.rows.set(info.id, { session: info, status: "idle" })
      return true
    }
    // Out-of-order delivery: never replace newer info with older.
    if ((info.time?.updated ?? 0) < (row.session.time?.updated ?? 0)) return false
    row.session = info
    return true
  }

  private remove(id: string): boolean {
    if (!this.rows.delete(id)) return false
    for (const m of [this.permissions, this.questions]) for (const [rid, sid] of m) if (sid === id) m.delete(rid)
    return true
  }

  private setPending(m: Map<string, string>, id: string, sid: string) {
    if (m.get(id) === sid) return false
    m.set(id, sid)
    return true
  }

  private ignore() {
    this.stats.ignored++
    return false
  }
}
