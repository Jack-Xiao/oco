import type { SessionActivity, SessionListItem } from "@oco/contracts"
import { compactTime } from "./session-groups"

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
export type PendingRequest = {
  id: string
  sessionID: string
  permission?: string
  patterns?: string[]
  metadata?: Record<string, unknown>
  questions?: Array<{
    question: string
    header?: string
    options?: Array<{ label: string; description?: string }>
    multiple?: boolean
    custom?: boolean
  }>
  tool?: { messageID: string; callID: string }
}
export type InboxRow = {
  id: string
  kind: "permission" | "question" | "error" | "done"
  sessionId: string
  parentId?: string
  title: string
  agent?: string
  parent?: string
  summary: string
  detail: string
  time: string
  at: number
  aria: string
}
export type InboxGroup = {
  kind: "group"
  parentId: string
  title: string
  rows: InboxRow[]
}
export type InboxEntry = InboxRow | InboxGroup
export type Snapshot = {
  sessions: ServerSession[]
  status: Record<string, ServerStatus>
  permissions: PendingRequest[]
  questions: PendingRequest[]
  /** The root list came back full (server page = the feed's limit): older sessions were not loaded. */
  rootLimitReached?: boolean
}
export type ServerEvent = { id?: string; type: string; properties?: Record<string, unknown> }

type Row = { session: ServerSession; status: ServerStatus["type"]; error?: string }

export class SessionStore {
  private rows = new Map<string, Row>()
  private permissions = new Map<string, PendingRequest>() // request id -> pending request
  private questions = new Map<string, PendingRequest>()
  private seen = new Set<string>() // recent event ids (bounded), for duplicate delivery
  private static readonly SEEN_MAX = 1024
  readonly stats = { snapshots: 0, events: 0, duplicates: 0, ignored: 0 }
  /** The loaded root page came back full, so older sessions were not loaded. Search is not limited by this. */
  limitReached = false

  /** Only sessions for which this returns true are kept (workspace ownership). */
  constructor(private readonly owns: (directory: string) => boolean) {}

  applySnapshot(s: Snapshot) {
    this.stats.snapshots++
    this.limitReached = !!s.rootLimitReached
    const rows = new Map<string, Row>()
    for (const session of s.sessions) {
      if (!session?.id || !this.owns(session.directory) || session.time?.archived) continue
      const prev = this.rows.get(session.id)
      rows.set(session.id, { session, status: s.status[session.id]?.type ?? "idle", error: prev?.error })
    }
    this.rows = rows
    this.permissions = new Map(s.permissions.filter((p) => rows.has(p.sessionID)).map((p) => [p.id, p]))
    this.questions = new Map(s.questions.filter((q) => rows.has(q.sessionID)).map((q) => [q.id, q]))
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
        return sid && this.rows.has(sid) && typeof p.id === "string"
          ? this.setPending(this.permissions, {
              id: p.id,
              sessionID: sid,
              permission: typeof p.permission === "string" ? p.permission : undefined,
              patterns: Array.isArray(p.patterns) ? p.patterns.map(String) : undefined,
              metadata: p.metadata && typeof p.metadata === "object" ? p.metadata : undefined,
              tool: p.tool && typeof p.tool === "object" ? (p.tool as { messageID: string; callID: string }) : undefined,
            })
          : this.ignore()
      case "permission.replied":
        return typeof p.requestID === "string" ? this.permissions.delete(p.requestID) : false
      case "question.asked":
        return sid && this.rows.has(sid) && typeof p.id === "string"
          ? this.setPending(this.questions, {
              id: p.id,
              sessionID: sid,
              questions: Array.isArray(p.questions) ? p.questions : undefined,
              tool: p.tool && typeof p.tool === "object" ? (p.tool as { messageID: string; callID: string }) : undefined,
            })
          : this.ignore()
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

  /**
   * Upsert a page of root sessions (or search hits) without dropping rows that are absent from it.
   * Pass `limitReached` only for a root page; omit it and the flag is left alone.
   * True when any row changed or the flag changed.
   */
  mergeRoots(sessions: ServerSession[], limitReached?: boolean): boolean {
    let changed = false
    for (const session of sessions) if (this.upsert(session)) changed = true
    if (limitReached !== undefined && limitReached !== this.limitReached) {
      this.limitReached = limitReached
      changed = true
    }
    return changed
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

  private countByRoot(m: Map<string, PendingRequest>) {
    const out = new Map<string, number>()
    for (const req of m.values()) {
      const root = this.rootOf(req.sessionID)
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
    for (const m of [this.permissions, this.questions]) for (const [rid, req] of m) if (req.sessionID === id) m.delete(rid)
    return true
  }

  removePending(id: string): boolean {
    const p = this.permissions.delete(id)
    const q = this.questions.delete(id)
    return p || q
  }

  hasPending(id: string): boolean {
    return this.permissions.has(id) || this.questions.has(id)
  }

  getPending(id: string): PendingRequest | undefined {
    return this.permissions.get(id) ?? this.questions.get(id)
  }

  private setPending(m: Map<string, PendingRequest>, req: PendingRequest): boolean {
    const prev = m.get(req.id)
    if (prev && prev.sessionID === req.sessionID) return false
    m.set(req.id, req)
    return true
  }

  private parseSubagentTitle(rawTitle: string): { title: string; agent?: string } {
    const match = rawTitle.match(/^(.*?)\s*\(@([^\s)]+)\s+subagent\)$/)
    if (match) {
      return { title: match[1].trim() || rawTitle, agent: match[2] }
    }
    return { title: rawTitle }
  }

  private sessionMeta(sid: string, now: number) {
    const row = this.rows.get(sid)
    if (!row) return undefined
    const rawTitle = row.session.title?.trim() || row.session.id
    const { title, agent } = this.parseSubagentTitle(rawTitle)
    let parent: string | undefined
    const parentId = row.session.parentID
    if (parentId) {
      const parentRow = this.rows.get(parentId)
      if (parentRow) {
        parent = parentRow.session.title?.trim() || parentRow.session.id
      }
    }
    const updated = row.session.time?.updated ?? row.session.time?.created ?? 0
    const time = compactTime(updated, now)
    return { title, agent, parent, parentId, updated, time, error: row.error, status: row.status }
  }

  /**
   * Attention-needed inbox rows: pending permissions & questions (oldest first),
   * then errors, then completed unread sessions.
   */
  inbox(
    currentSessionId?: string,
    unreadIds?: Iterable<string> | ((id: string) => boolean),
    now = Date.now(),
  ): InboxRow[] {
    const isUnread =
      typeof unreadIds === "function"
        ? unreadIds
        : (() => {
            const set = unreadIds instanceof Set ? unreadIds : new Set(unreadIds ? Array.from(unreadIds) : [])
            return (id: string) => set.has(id)
          })()

    const permQuesRows: InboxRow[] = []

    for (const req of this.permissions.values()) {
      const info = this.sessionMeta(req.sessionID, now)
      if (!info) continue
      const perm = req.permission ?? ""
      const patterns = req.patterns ?? []
      const patStr = patterns.join(" ").trim()
      const summary = patStr || perm || "Permission"
      const detail = perm && patStr ? `${perm} · ${patStr}` : perm || patStr || "Permission"
      const aria = [info.title, info.agent ? `@${info.agent}` : "", info.parent ? `(${info.parent})` : "", summary, info.time].filter(Boolean).join(", ")
      permQuesRows.push({
        id: req.id,
        kind: "permission",
        sessionId: req.sessionID,
        parentId: info.parentId,
        title: info.title,
        agent: info.agent,
        parent: info.parent,
        summary,
        detail,
        time: info.time,
        at: info.updated,
        aria,
      })
    }

    for (const req of this.questions.values()) {
      const info = this.sessionMeta(req.sessionID, now)
      if (!info) continue
      const summary = req.questions?.[0]?.question || "Question"
      const detail = summary
      const aria = [info.title, info.agent ? `@${info.agent}` : "", info.parent ? `(${info.parent})` : "", summary, info.time].filter(Boolean).join(", ")
      permQuesRows.push({
        id: req.id,
        kind: "question",
        sessionId: req.sessionID,
        parentId: info.parentId,
        title: info.title,
        agent: info.agent,
        parent: info.parent,
        summary,
        detail,
        time: info.time,
        at: info.updated,
        aria,
      })
    }

    // Permission and question: oldest first (time 旧→新)
    permQuesRows.sort((a, b) => a.at - b.at || a.id.localeCompare(b.id))

    const errorRows: InboxRow[] = []
    const doneRows: InboxRow[] = []

    for (const [sid, row] of this.rows) {
      const info = this.sessionMeta(sid, now)
      if (!info) continue

      if (info.error) {
        const summary = info.error
        const detail = info.error
        const aria = [info.title, info.agent ? `@${info.agent}` : "", info.parent ? `(${info.parent})` : "", summary, info.time].filter(Boolean).join(", ")
        errorRows.push({
          id: `err:${sid}`,
          kind: "error",
          sessionId: sid,
          parentId: info.parentId,
          title: info.title,
          agent: info.agent,
          parent: info.parent,
          summary,
          detail,
          time: info.time,
          at: info.updated,
          aria,
        })
      } else if (info.status === "idle" && sid !== currentSessionId && isUnread(sid)) {
        const summary = "Finished"
        const detail = info.time ? `Finished · ${info.time}` : "Finished"
        const aria = [info.title, info.agent ? `@${info.agent}` : "", info.parent ? `(${info.parent})` : "", "Finished", info.time].filter(Boolean).join(", ")
        doneRows.push({
          id: `done:${sid}`,
          kind: "done",
          sessionId: sid,
          parentId: info.parentId,
          title: info.title,
          agent: info.agent,
          parent: info.parent,
          summary,
          detail,
          time: info.time,
          at: info.updated,
          aria,
        })
      }
    }

    errorRows.sort((a, b) => b.at - a.at || a.id.localeCompare(b.id))
    doneRows.sort((a, b) => b.at - a.at || a.id.localeCompare(b.id))

    return [...permQuesRows, ...errorRows, ...doneRows]
  }

  private ignore() {
    this.stats.ignored++
    return false
  }
}
