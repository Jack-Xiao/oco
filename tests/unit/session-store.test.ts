// SessionStore: workspace snapshot, idempotent events, activity folded onto roots.
import { describe, expect, test } from "bun:test"
import {
  SessionStore,
  type ServerEvent,
  type ServerSession,
  type Snapshot,
} from "../../apps/extension/src/session-store"

const WORK = "/work"

function make() {
  return new SessionStore((directory) => directory === WORK)
}

function session(partial: Partial<ServerSession> & { id: string }): ServerSession {
  return { directory: WORK, title: partial.id, time: { updated: 1 }, ...partial }
}

function ev(type: string, properties?: Record<string, unknown>, id?: string): ServerEvent {
  return { id, type, properties }
}

function only(store: SessionStore) {
  const list = store.list()
  expect(list).toHaveLength(1)
  return list[0]
}

describe("SessionStore snapshot and list", () => {
  test("applySnapshot keeps owned roots, drops archived and foreign sessions, and lists newest first", () => {
    const store = make()
    store.applySnapshot({
      sessions: [session({ id: "gone", title: "Gone", time: { updated: 1 } })],
      status: {},
      permissions: [],
      questions: [],
    })
    expect(store.list().map((s) => s.id)).toEqual(["gone"])

    store.applySnapshot({
      sessions: [
        session({ id: "old", title: "Old", time: { updated: 10 } }),
        session({ id: "new", title: "New", time: { updated: 30 } }),
        session({ id: "mid", title: "Mid", time: { updated: 20 } }),
        session({ id: "tie-b", title: "Tie B", time: { updated: 20 } }),
        session({ id: "child", parentID: "new", title: "Child", time: { updated: 999 } }),
        session({ id: "foreign", directory: "/elsewhere", title: "Foreign", time: { updated: 1000 } }),
        session({ id: "arch", title: "Archived", time: { updated: 500, archived: 600 } }),
      ],
      status: {},
      permissions: [
        { id: "pf", sessionID: "foreign" },
        { id: "pa", sessionID: "arch" },
      ],
      questions: [{ id: "qg", sessionID: "gone" }],
    })

    expect(store.has("gone")).toBe(false)
    expect(store.has("foreign")).toBe(false)
    expect(store.has("arch")).toBe(false)
    expect(store.has("child")).toBe(true)
    // Same updated timestamp breaks ties by id. The child is stored but not listed.
    expect(store.list().map((s) => `${s.id}:${s.updated}`)).toEqual(["new:30", "mid:20", "tie-b:20", "old:10"])
    expect(store.list().every((s) => s.pendingPermissions === 0 && s.pendingQuestions === 0)).toBe(true)
  })
})

describe("SessionStore idempotence", () => {
  test("the same event id applied twice is a duplicate and the second payload is dropped", () => {
    const store = make()
    expect(
      store.applyEvent(
        ev("session.updated", { info: session({ id: "s", title: "A", time: { updated: 5 } }) }, "evt-1"),
      ),
    ).toBe(true)
    expect(store.stats.events).toBe(1)

    expect(
      store.applyEvent(
        ev("session.updated", { info: session({ id: "s", title: "B", time: { updated: 9 } }) }, "evt-1"),
      ),
    ).toBe(false)
    expect(store.stats.duplicates).toBe(1)
    expect(store.stats.events).toBe(1)
    expect(only(store).title).toBe("A")
    expect(only(store).updated).toBe(5)
  })

  test("a snapshot followed by replay of events it already reflects stays deeply equal", () => {
    const root = session({ id: "root", title: "Root", time: { created: 1, updated: 50 } })
    const child = session({ id: "child", parentID: "root", title: "Child", time: { created: 2, updated: 40 } })
    const snap: Snapshot = {
      sessions: [root, child],
      status: { child: { type: "busy" } },
      permissions: [{ id: "p1", sessionID: "child" }],
      questions: [{ id: "q1", sessionID: "root" }],
    }
    // Buffered while the snapshot loaded: the server state already includes them, and their ids
    // have not been seen yet, so the reducers themselves must be idempotent.
    const events: ServerEvent[] = [
      { id: "e1", type: "session.created", properties: { info: root } },
      { id: "e2", type: "session.created", properties: { info: child } },
      { id: "e3", type: "session.status", properties: { sessionID: "child", status: { type: "busy" } } },
      { id: "e4", type: "permission.asked", properties: { id: "p1", sessionID: "child" } },
      { id: "e5", type: "question.asked", properties: { id: "q1", sessionID: "root" } },
    ]

    const store = make()
    store.applySnapshot(structuredClone(snap))
    const before = store.list()
    expect(before).toHaveLength(1)
    expect(before[0]).toMatchObject({
      id: "root",
      title: "Root",
      directory: WORK,
      updated: 50,
      activity: "permission",
      pendingPermissions: 1,
      pendingQuestions: 1,
    })
    expect(before[0].error).toBeUndefined()

    for (const e of events) store.applyEvent(structuredClone(e))
    expect(store.list()).toEqual(before)

    const seenEvents = store.stats.events
    const dup = store.stats.duplicates
    for (const e of events) expect(store.applyEvent(structuredClone(e))).toBe(false)
    expect(store.stats.duplicates).toBe(dup + events.length)
    expect(store.stats.events).toBe(seenEvents)
    expect(store.list()).toEqual(before)
  })
})

describe("SessionStore out of order", () => {
  test("session.updated with an older time.updated does not overwrite a newer title", () => {
    const store = make()
    store.add(session({ id: "s", title: "New", time: { updated: 200 } }))
    const ignored = store.stats.ignored
    const duplicates = store.stats.duplicates

    expect(
      store.applyEvent(
        ev("session.updated", { info: session({ id: "s", title: "Old", time: { updated: 100 } }) }, "old-evt"),
      ),
    ).toBe(false)
    expect(only(store)).toMatchObject({ title: "New", updated: 200 })
    expect(store.stats.ignored).toBe(ignored)
    expect(store.stats.duplicates).toBe(duplicates)

    expect(
      store.applyEvent(
        ev("session.updated", { info: session({ id: "s", title: "Newer", time: { updated: 300 } }) }, "new-evt"),
      ),
    ).toBe(true)
    expect(only(store)).toMatchObject({ title: "Newer", updated: 300 })
  })
})

describe("SessionStore activity", () => {
  test("priority is permission > question > busy/retry > error > idle, and replies clear counts", () => {
    const store = make()
    store.add(session({ id: "s", title: "S", time: { updated: 1 } }))
    expect(only(store).activity).toBe("idle")

    expect(
      store.applyEvent(ev("session.error", { sessionID: "s", error: { name: "APIError", data: { message: "boom" } } })),
    ).toBe(true)
    expect(only(store)).toMatchObject({ activity: "error", error: "boom" })

    // retry beats error and does not clear it.
    expect(store.applyEvent(ev("session.status", { sessionID: "s", status: { type: "retry" } }))).toBe(true)
    expect(only(store)).toMatchObject({ activity: "retry", error: "boom" })

    expect(store.applyEvent(ev("question.asked", { id: "q1", sessionID: "s" }))).toBe(true)
    expect(store.applyEvent(ev("question.asked", { id: "q1", sessionID: "s" }))).toBe(false)
    expect(only(store)).toMatchObject({ activity: "question", pendingQuestions: 1 })
    expect(store.applyEvent(ev("question.asked", { id: "q2", sessionID: "s" }))).toBe(true)
    expect(only(store).pendingQuestions).toBe(2)

    expect(store.applyEvent(ev("permission.asked", { id: "p1", sessionID: "s" }))).toBe(true)
    expect(store.applyEvent(ev("permission.asked", { id: "p2", sessionID: "s" }))).toBe(true)
    expect(only(store)).toMatchObject({ activity: "permission", pendingPermissions: 2, pendingQuestions: 2 })

    expect(store.applyEvent(ev("permission.replied", { requestID: "missing" }))).toBe(false)
    expect(store.applyEvent(ev("question.replied", { requestID: "missing" }))).toBe(false)
    expect(store.applyEvent(ev("question.rejected", { requestID: "missing" }))).toBe(false)
    expect(only(store)).toMatchObject({ activity: "permission", pendingPermissions: 2, pendingQuestions: 2 })

    expect(store.applyEvent(ev("permission.replied", { requestID: "p1" }))).toBe(true)
    expect(only(store)).toMatchObject({ activity: "permission", pendingPermissions: 1 })
    expect(store.applyEvent(ev("permission.replied", { requestID: "p2" }))).toBe(true)
    expect(only(store)).toMatchObject({ activity: "question", pendingPermissions: 0, pendingQuestions: 2 })

    expect(store.applyEvent(ev("question.replied", { requestID: "q1" }))).toBe(true)
    expect(only(store).pendingQuestions).toBe(1)
    expect(store.applyEvent(ev("question.rejected", { requestID: "q2" }))).toBe(true)
    expect(only(store)).toMatchObject({ activity: "retry", pendingQuestions: 0, error: "boom" })

    // busy beats error and clears it. A later error while busy does not take over.
    expect(store.applyEvent(ev("session.status", { sessionID: "s", status: { type: "busy" } }))).toBe(true)
    expect(only(store).activity).toBe("busy")
    expect(only(store).error).toBeUndefined()
    expect(
      store.applyEvent(ev("session.error", { sessionID: "s", error: { name: "APIError", data: { message: "later" } } })),
    ).toBe(true)
    expect(only(store)).toMatchObject({ activity: "busy", error: "later" })

    expect(store.applyEvent(ev("session.status", { sessionID: "s", status: { type: "idle" } }))).toBe(true)
    expect(only(store)).toMatchObject({ activity: "error", error: "later" })
  })
})

describe("SessionStore child sessions", () => {
  test("a child's permission or busy status shows on the root, and the child is not listed", () => {
    const store = make()
    store.applySnapshot({
      sessions: [
        session({ id: "root", title: "Root", time: { updated: 10 } }),
        session({ id: "child", parentID: "root", title: "Child", time: { updated: 99 } }),
      ],
      status: { root: { type: "idle" }, child: { type: "busy" } },
      permissions: [],
      questions: [],
    })
    expect(store.list().map((s) => s.id)).toEqual(["root"])
    expect(only(store)).toMatchObject({ activity: "busy", pendingPermissions: 0, pendingQuestions: 0, updated: 10 })

    expect(store.applyEvent(ev("permission.asked", { id: "req", sessionID: "child" }))).toBe(true)
    expect(store.list().map((s) => s.id)).toEqual(["root"])
    expect(only(store)).toMatchObject({ activity: "permission", pendingPermissions: 1 })

    expect(store.applyEvent(ev("question.asked", { id: "qq", sessionID: "child" }))).toBe(true)
    expect(store.applyEvent(ev("permission.replied", { requestID: "req" }))).toBe(true)
    expect(store.list().map((s) => s.id)).toEqual(["root"])
    expect(only(store)).toMatchObject({ activity: "question", pendingPermissions: 0, pendingQuestions: 1 })
  })
})

describe("SessionStore errors", () => {
  test("session.error sets error while idle, MessageAbortedError is ignored, and busy clears it", () => {
    const store = make()
    store.add(session({ id: "s", title: "S", time: { updated: 1 } }))
    const ignored = store.stats.ignored

    expect(
      store.applyEvent(
        ev("session.error", { sessionID: "s", error: { name: "MessageAbortedError", data: { message: "stopped" } } }),
      ),
    ).toBe(false)
    expect(only(store).activity).toBe("idle")
    expect(only(store).error).toBeUndefined()
    expect(store.stats.ignored).toBe(ignored)

    expect(
      store.applyEvent(ev("session.error", { sessionID: "s", error: { name: "APIError", data: { message: "boom" } } })),
    ).toBe(true)
    expect(only(store)).toMatchObject({ activity: "error", error: "boom" })

    expect(
      store.applyEvent(
        ev("session.error", { sessionID: "s", error: { name: "MessageAbortedError", data: { message: "stopped" } } }),
      ),
    ).toBe(false)
    expect(only(store)).toMatchObject({ activity: "error", error: "boom" })

    expect(store.applyEvent(ev("session.status", { sessionID: "s", status: { type: "busy" } }))).toBe(true)
    expect(only(store).activity).toBe("busy")
    expect(only(store).error).toBeUndefined()
  })
})

describe("SessionStore ignored events and removal", () => {
  test("events for foreign directories or unknown sessions are ignored", () => {
    const store = make()
    store.add(session({ id: "s", title: "Kept", time: { updated: 4 } }))
    const events: ServerEvent[] = [
      { id: "f1", type: "session.created", properties: { info: session({ id: "x", directory: "/other", title: "X" }) } },
      {
        id: "f2",
        type: "session.updated",
        properties: { info: session({ id: "y", directory: "/other", title: "Y", time: { updated: 8 } }) },
      },
      { id: "f3", type: "session.status", properties: { sessionID: "missing", status: { type: "busy" } } },
      { id: "f4", type: "session.idle", properties: { sessionID: "missing" } },
      {
        id: "f5",
        type: "session.error",
        properties: { sessionID: "missing", error: { name: "APIError", data: { message: "nope" } } },
      },
      { id: "f6", type: "permission.asked", properties: { id: "req", sessionID: "missing" } },
      { id: "f7", type: "question.asked", properties: { id: "qq", sessionID: "missing" } },
    ]
    const ignored = store.stats.ignored
    for (const e of events) expect(store.applyEvent(e)).toBe(false)
    expect(store.stats.ignored).toBe(ignored + events.length)
    expect(store.size).toBe(1)
    expect(store.list().map((s) => s.id)).toEqual(["s"])
    expect(only(store).title).toBe("Kept")
  })

  test("session.deleted removes the row and its pending requests", () => {
    const store = make()
    const s = session({ id: "s", title: "S", time: { updated: 4 } })
    store.applySnapshot({
      sessions: [s],
      status: {},
      permissions: [
        { id: "p1", sessionID: "s" },
        { id: "p2", sessionID: "s" },
      ],
      questions: [{ id: "q1", sessionID: "s" }],
    })
    expect(only(store)).toMatchObject({ activity: "permission", pendingPermissions: 2, pendingQuestions: 1 })

    expect(store.applyEvent(ev("session.deleted", { sessionID: "s" }))).toBe(true)
    expect(store.list()).toEqual([])
    expect(store.has("s")).toBe(false)

    expect(store.applyEvent(ev("session.created", { info: s }))).toBe(true)
    expect(only(store)).toMatchObject({ activity: "idle", pendingPermissions: 0, pendingQuestions: 0 })
    expect(only(store).error).toBeUndefined()
    expect(store.applyEvent(ev("permission.replied", { requestID: "p1" }))).toBe(false)
    expect(store.applyEvent(ev("question.rejected", { requestID: "q1" }))).toBe(false)
    expect(only(store).pendingPermissions).toBe(0)

    const folded = make()
    folded.applySnapshot({
      sessions: [
        session({ id: "root", title: "Root", time: { updated: 8 } }),
        session({ id: "child", parentID: "root", title: "Child", time: { updated: 7 } }),
      ],
      status: {},
      permissions: [{ id: "cp", sessionID: "child" }],
      questions: [],
    })
    expect(only(folded)).toMatchObject({ id: "root", activity: "permission", pendingPermissions: 1 })
    expect(folded.applyEvent(ev("session.deleted", { sessionID: "child" }))).toBe(true)
    expect(folded.has("child")).toBe(false)
    expect(folded.list().map((item) => item.id)).toEqual(["root"])
    expect(only(folded)).toMatchObject({ activity: "idle", pendingPermissions: 0 })
  })

  test("session.updated with time.archived removes the session and its pending requests", () => {
    const store = make()
    const s = session({ id: "s", title: "S", time: { updated: 4 } })
    store.applySnapshot({
      sessions: [s],
      status: { s: { type: "busy" } },
      permissions: [{ id: "p", sessionID: "s" }],
      questions: [{ id: "q", sessionID: "s" }],
    })
    expect(
      store.applyEvent(ev("session.updated", { info: { ...s, time: { updated: 9, archived: 9 } } })),
    ).toBe(true)
    expect(store.list()).toEqual([])
    expect(store.has("s")).toBe(false)

    store.add({ ...s, time: { updated: 10 } })
    expect(only(store)).toMatchObject({ activity: "idle", pendingPermissions: 0, pendingQuestions: 0 })
  })
})

describe("SessionStore query", () => {
  test("list(query) matches title or id case-insensitively and only among roots", () => {
    const store = make()
    store.applySnapshot({
      sessions: [
        session({ id: "SES_Alpha", title: "Hello World", time: { updated: 3 } }),
        session({ id: "SES_Beta", title: "Notes", time: { updated: 2 } }),
        session({ id: "child", parentID: "SES_Alpha", title: "UniqueChildTitle", time: { updated: 1 } }),
      ],
      status: {},
      permissions: [],
      questions: [],
    })
    const ids = (query?: string) => store.list(query).map((s) => s.id)

    expect(ids("hello")).toEqual(["SES_Alpha"])
    expect(ids("WORLD")).toEqual(["SES_Alpha"])
    expect(ids("  HeLLo  ")).toEqual(["SES_Alpha"])
    expect(ids("alpha")).toEqual(["SES_Alpha"])
    expect(ids("SES_BETA")).toEqual(["SES_Beta"])
    expect(ids("notes")).toEqual(["SES_Beta"])
    expect(ids("uniquechildtitle")).toEqual([])
    expect(ids("missing")).toEqual([])
    expect(ids("work")).toEqual([])
    expect(ids()).toEqual(["SES_Alpha", "SES_Beta"])
    expect(ids("   ")).toEqual(["SES_Alpha", "SES_Beta"])
  })
})

describe("SessionStore seen ids", () => {
  test("an early event id is accepted again after more than 1024 distinct ids, while a recent id is not", () => {
    const store = make()
    const touch = (eventId: string, title: string, updated: number) =>
      store.applyEvent(
        ev("session.updated", { info: session({ id: "s", title, time: { updated } }) }, eventId),
      )

    // 1 early + 1023 fillers = 1024 remembered ids, so the early id is still a duplicate.
    expect(touch("early", "early", 10)).toBe(true)
    for (let i = 0; i < 1023; i++) expect(touch(`fill-${i}`, `fill-${i}`, 11 + i)).toBe(true)
    const held = only(store).title

    expect(touch("early", "should-not-apply", 1_000_000)).toBe(false)
    expect(store.stats.duplicates).toBe(1)
    expect(only(store).title).toBe(held)

    // The 1025th distinct id evicts the oldest. `early` is applied again; a recent id is not.
    expect(touch("overflow", "overflow", 1_000_001)).toBe(true)
    const eventsBefore = store.stats.events
    const dupBefore = store.stats.duplicates
    expect(touch("early", "accepted-again", 1_000_002)).toBe(true)
    expect(store.stats.duplicates).toBe(dupBefore)
    expect(store.stats.events).toBe(eventsBefore + 1)
    expect(only(store)).toMatchObject({ title: "accepted-again", updated: 1_000_002 })

    expect(touch("overflow", "nope", 1_000_003)).toBe(false)
    expect(store.stats.duplicates).toBe(dupBefore + 1)
    expect(only(store).title).toBe("accepted-again")
  })
})

describe("SessionStore.limitReached", () => {
  test("follows the last snapshot and defaults to false", () => {
    const store = new SessionStore(() => true)
    const base = { sessions: [], status: {}, permissions: [], questions: [] }
    expect(store.limitReached).toBe(false)
    store.applySnapshot({ ...base, rootLimitReached: true })
    expect(store.limitReached).toBe(true)
    store.applySnapshot(base)
    expect(store.limitReached).toBe(false)
  })
})

describe("SessionStore.mergeRoots", () => {
  test("adds rows, keeps ones the page omits, and reports whether anything changed", () => {
    const store = make()
    store.add(session({ id: "keep", title: "New", time: { updated: 50 } }))
    store.add(session({ id: "old", title: "Old", time: { updated: 10 } }))
    store.applyEvent(ev("session.status", { sessionID: "keep", status: { type: "busy" } }))
    store.applyEvent(ev("permission.asked", { id: "p1", sessionID: "old" }))
    const ignored = store.stats.ignored

    expect(
      store.mergeRoots([
        session({ id: "keep", title: "Stale", time: { updated: 40 } }),
        session({ id: "foreign", directory: "/elsewhere", title: "No", time: { updated: 99 } }),
        { id: "", directory: WORK },
      ]),
    ).toBe(false)
    expect(store.stats.ignored).toBe(ignored + 2)
    expect(store.limitReached).toBe(false)
    expect(store.list().find((item) => item.id === "keep")).toMatchObject({ title: "New", activity: "busy" })
    expect(store.has("foreign")).toBe(false)

    expect(
      store.mergeRoots(
        [
          session({ id: "added", title: "Added", time: { updated: 3 } }),
          session({ id: "keep", title: "Newer", time: { updated: 60 } }),
          session({ id: "old", title: "Gone", time: { updated: 11, archived: 11 } }),
        ],
        true,
      ),
    ).toBe(true)
    expect(store.limitReached).toBe(true)
    expect(store.has("old")).toBe(false)
    expect(store.has("keep")).toBe(true)
    expect(store.has("added")).toBe(true)
    expect(store.list().find((item) => item.id === "keep")).toMatchObject({ title: "Newer", activity: "busy" })
    expect(store.list().map((item) => item.id)).toEqual(["keep", "added"])

    // Absent rows stay. Same flag and an older update are not a change. Omitting the flag leaves it set.
    expect(store.mergeRoots([session({ id: "keep", title: "Nope", time: { updated: 1 } })])).toBe(false)
    expect(store.has("added")).toBe(true)
    expect(store.limitReached).toBe(true)
    expect(store.list().find((item) => item.id === "keep")?.title).toBe("Newer")

    expect(store.mergeRoots([], true)).toBe(false)
    expect(store.mergeRoots([], false)).toBe(true)
    expect(store.limitReached).toBe(false)
    expect(store.mergeRoots([], false)).toBe(false)
    expect(store.size).toBe(2)
  })
})

describe("SessionStore.inbox", () => {
  test("outputs permission, question, error and done rows with correct fields and parent", () => {
    const store = make()
    const now = 100_000
    store.applySnapshot({
      sessions: [
        session({ id: "parent", title: "Parent Task", time: { updated: 10 } }),
        session({ id: "child", parentID: "parent", title: "Worker 1", time: { updated: 20 } }),
        session({ id: "orphan", parentID: "unknown-parent", title: "Solo Worker", time: { updated: 30 } }),
        session({ id: "err-sess", title: "Broken Session", time: { updated: 40 } }),
        session({ id: "done-sess", title: "Finished Session", time: { updated: 50 } }),
        session({ id: "curr-sess", title: "Current Session", time: { updated: 60 } }),
      ],
      status: {},
      permissions: [
        {
          id: "per-1",
          sessionID: "child",
          permission: "bash",
          patterns: ["npm test", "git status"],
        },
      ],
      questions: [
        {
          id: "que-1",
          sessionID: "orphan",
          questions: [{ question: "Which color?", options: [{ label: "red" }, { label: "blue" }] }],
        },
      ],
    })

    // Add error to err-sess
    store.applyEvent(ev("session.error", { sessionID: "err-sess", error: { data: { message: "Compilation failed" } } }))

    const unread = new Set(["done-sess", "curr-sess"])
    const rows = store.inbox("curr-sess", unread, now)

    // Verify ordering: permission/question first (oldest first: child=20, orphan=30), then error (err-sess), then done (done-sess)
    expect(rows.map((r) => r.id)).toEqual(["per-1", "que-1", "err:err-sess", "done:done-sess"])

    // Check permission row
    const perRow = rows[0]
    expect(perRow).toMatchObject({
      id: "per-1",
      kind: "permission",
      sessionId: "child",
      parentId: "parent",
      title: "Worker 1",
      parent: "Parent Task",
      summary: "npm test git status",
      detail: "bash · npm test git status",
      at: 20,
    })

    // Check question row (orphan's parent is unknown -> parent omitted, but parentId preserved)
    const queRow = rows[1]
    expect(queRow).toMatchObject({
      id: "que-1",
      kind: "question",
      sessionId: "orphan",
      parentId: "unknown-parent",
      title: "Solo Worker",
      summary: "Which color?",
      detail: "Which color?",
      at: 30,
    })
    expect(queRow.parent).toBeUndefined()

    // Check error row
    const errRow = rows[2]
    expect(errRow).toMatchObject({
      id: "err:err-sess",
      kind: "error",
      sessionId: "err-sess",
      title: "Broken Session",
      summary: "Compilation failed",
      detail: "Compilation failed",
      at: 40,
    })

    // Check done row (curr-sess is current -> omitted from done)
    const doneRow = rows[3]
    expect(doneRow).toMatchObject({
      id: "done:done-sess",
      kind: "done",
      sessionId: "done-sess",
      title: "Finished Session",
      summary: "Finished",
      at: 50,
    })

    // removePending
    expect(store.hasPending("per-1")).toBe(true)
    expect(store.removePending("per-1")).toBe(true)
    expect(store.hasPending("per-1")).toBe(false)
    expect(store.removePending("per-1")).toBe(false)

    const rowsAfter = store.inbox("curr-sess", unread, now)
    expect(rowsAfter.map((r) => r.id)).toEqual(["que-1", "err:err-sess", "done:done-sess"])
  })

  test("permission and question rows sort oldest first, while error and done sort newest first", () => {
    const store = make()
    const now = 200_000
    store.applySnapshot({
      sessions: [
        session({ id: "s1", time: { updated: 100 } }),
        session({ id: "s2", time: { updated: 50 } }),
        session({ id: "s3", time: { updated: 80 } }),
        session({ id: "e1", time: { updated: 10 } }),
        session({ id: "e2", time: { updated: 90 } }),
        session({ id: "d1", time: { updated: 30 } }),
        session({ id: "d2", time: { updated: 70 } }),
      ],
      status: {},
      permissions: [
        { id: "per-late", sessionID: "s1", permission: "write" },
        { id: "per-early", sessionID: "s2", permission: "read" },
      ],
      questions: [
        { id: "que-mid", sessionID: "s3", questions: [{ question: "Confirm?" }] },
      ],
    })

    store.applyEvent(ev("session.error", { sessionID: "e1", error: { name: "OlderError" } }))
    store.applyEvent(ev("session.error", { sessionID: "e2", error: { name: "NewerError" } }))

    const unread = new Set(["d1", "d2"])
    const rows = store.inbox(undefined, unread, now)

    // Permission and question: oldest updated first (50 -> 80 -> 100)
    // Error: newest updated first (90 -> 10)
    // Done: newest updated first (70 -> 30)
    expect(rows.map((r) => r.id)).toEqual(["per-early", "que-mid", "per-late", "err:e2", "err:e1", "done:d2", "done:d1"])
  })

  test("strips subagent title suffix, sets agent, and formats permission without patterns", () => {
    const store = make()
    store.applySnapshot({
      sessions: [
        session({ id: "p1", title: "Parent Root" }),
        session({ id: "c1", parentID: "p1", title: "Child Alpha (@explore subagent)", time: { updated: 100 } }),
        session({ id: "c2", parentID: "p1", title: "Regular Child", time: { updated: 120 } }),
      ],
      status: {},
      permissions: [
        { id: "per-1", sessionID: "c1", permission: "bash", patterns: ["ls", "pwd"] },
        { id: "per-2", sessionID: "c2", permission: "read" },
      ],
      questions: [],
    })

    const rows = store.inbox(undefined, new Set(), 200)
    expect(rows).toHaveLength(2)

    expect(rows[0]).toMatchObject({
      id: "per-1",
      title: "Child Alpha",
      agent: "explore",
      parentId: "p1",
      parent: "Parent Root",
      summary: "ls pwd",
      detail: "bash · ls pwd",
    })

    expect(rows[1]).toMatchObject({
      id: "per-2",
      title: "Regular Child",
      agent: undefined,
      parentId: "p1",
      parent: "Parent Root",
      summary: "read",
      detail: "read",
    })
  })
})

describe("SessionStore run summary and inbox results", () => {
  test("busy -> message.updated -> part.updated -> delta -> session.diff -> idle produces complete done row with summary, detail, result, and aria", () => {
    let t = 1000
    const store = new SessionStore((directory) => directory === WORK, () => t)
    store.add(session({ id: "s1", title: "Task 1", time: { updated: 1000 } }))

    // 1. busy: starts run at t = 1000
    t = 1000
    expect(store.applyEvent(ev("session.status", { sessionID: "s1", status: { type: "busy" } }))).toBe(true)

    // 2. message.updated: assistant message, cost = 0.08, tokens total = 31200
    expect(
      store.applyEvent(
        ev("message.updated", {
          info: {
            id: "msg-1",
            sessionID: "s1",
            role: "assistant",
            cost: 0.08,
            tokens: { total: 31200 },
          },
        }),
      ),
    ).toBe(false)

    // 3. part.updated: text part
    expect(
      store.applyEvent(
        ev("message.part.updated", {
          part: {
            id: "p-1",
            messageID: "msg-1",
            sessionID: "s1",
            type: "text",
            text: "Working on ",
          },
        }),
      ),
    ).toBe(false)

    // 4. part.delta: text delta
    expect(
      store.applyEvent(
        ev("message.part.delta", {
          sessionID: "s1",
          messageID: "msg-1",
          partID: "p-1",
          field: "text",
          delta: "refactor\nSecond line of output",
        }),
      ),
    ).toBe(false)

    // 5. session.diff: 3 files (+41, -8)
    expect(
      store.applyEvent(
        ev("session.diff", {
          sessionID: "s1",
          diff: [
            { file: "a.ts", additions: 20, deletions: 5, status: "modified", patch: "@@ ... @@" },
            { file: "b.ts", additions: 21, deletions: 3, status: "modified" },
            { file: "c.ts", additions: 0, deletions: 0, status: "added" },
            { additions: 99, deletions: 99 }, // missing file -> skipped
          ],
        }),
      ),
    ).toBe(false)

    // 6. idle at t = 59000 (durMs = 58000ms -> 58s)
    t = 59000
    expect(store.applyEvent(ev("session.idle", { sessionID: "s1" }))).toBe(true)

    const unread = new Set(["s1"])
    const rows = store.inbox(undefined, unread, t)
    expect(rows).toHaveLength(1)
    const doneRow = rows[0]

    expect(doneRow.kind).toBe("done")
    expect(doneRow.result).toEqual({
      files: [
        { file: "a.ts", additions: 20, deletions: 5, status: "modified" },
        { file: "b.ts", additions: 21, deletions: 3, status: "modified" },
        { file: "c.ts", additions: 0, deletions: 0, status: "added" },
      ],
      durMs: 58000,
      costUsd: 0.08,
      tokens: 31200,
      lastText: "Working on refactor\nSecond line of output",
    })

    expect(doneRow.summary).toBe("3 files · 58s · $0.08 · Working on refactor")
    expect(doneRow.detail).toBe(
      `Finished · now\n3 files (+41 −8)\n$0.08 · 31.2k tokens\nWorking on refactor\nSecond line of output`,
    )
    expect(doneRow.aria).toBe("Task 1, 3 files · 58s · $0.08 · Working on refactor, now")
  })

  test("new busy run clears previous run metrics and text while preserving session files diff", () => {
    let t = 1000
    const store = new SessionStore((directory) => directory === WORK, () => t)
    store.add(session({ id: "s1", title: "Task 1", time: { updated: 1000 } }))

    // First run
    store.applyEvent(ev("session.status", { sessionID: "s1", status: { type: "busy" } }))
    store.applyEvent(
      ev("session.diff", {
        sessionID: "s1",
        diff: [{ file: "x.ts", additions: 1, deletions: 0 }],
      }),
    )
    store.applyEvent(
      ev("message.updated", {
        info: { id: "m1", sessionID: "s1", role: "assistant", cost: 0.1, tokens: { total: 500 } },
      }),
    )
    store.applyEvent(
      ev("message.part.updated", {
        part: { id: "p1", messageID: "m1", sessionID: "s1", type: "text", text: "Finished run 1" },
      }),
    )
    t = 4000
    store.applyEvent(ev("session.idle", { sessionID: "s1" }))

    // Second run begins at t = 10000
    t = 10000
    expect(store.applyEvent(ev("session.status", { sessionID: "s1", status: { type: "busy" } }))).toBe(true)

    // Message in second run with cost 0 and 150 tokens
    store.applyEvent(
      ev("message.updated", {
        info: { id: "m2", sessionID: "s1", role: "assistant", cost: 0, tokens: { total: 150 } },
      }),
    )

    t = 15000 // durMs = 5000ms -> 5s
    expect(store.applyEvent(ev("session.idle", { sessionID: "s1" }))).toBe(true)

    const rows = store.inbox(undefined, new Set(["s1"]), t)
    expect(rows[0].result).toEqual({
      files: [{ file: "x.ts", additions: 1, deletions: 0 }],
      durMs: 5000,
      costUsd: 0,
      tokens: 150,
    })
    // cost is 0 -> not shown; lastText was cleared and no new part was sent
    expect(rows[0].summary).toBe("1 file · 5s")
  })

  test("user message text part and deltas are ignored", () => {
    let t = 2000
    const store = new SessionStore((directory) => directory === WORK, () => t)
    store.add(session({ id: "s1", title: "Task", time: { updated: 10 } }))
    store.applyEvent(ev("session.status", { sessionID: "s1", status: { type: "busy" } }))

    // Assistant message registered
    store.applyEvent(
      ev("message.updated", {
        info: { id: "asst-msg", sessionID: "s1", role: "assistant" },
      }),
    )

    // User message part.updated - messageID not in assistantMessages
    expect(
      store.applyEvent(
        ev("message.part.updated", {
          part: {
            id: "user-part",
            messageID: "user-msg",
            sessionID: "s1",
            type: "text",
            text: "Hello from user",
          },
        }),
      ),
    ).toBe(false)

    // User message part.delta - messageID not in assistantMessages
    expect(
      store.applyEvent(
        ev("message.part.delta", {
          sessionID: "s1",
          messageID: "user-msg",
          partID: "user-part",
          field: "text",
          delta: " more user words",
        }),
      ),
    ).toBe(false)

    t = 4000
    store.applyEvent(ev("session.idle", { sessionID: "s1" }))

    const rows = store.inbox(undefined, new Set(["s1"]), t)
    expect(rows[0].result?.lastText).toBeUndefined()
    expect(rows[0].summary).toBe("2s")
  })

  test("delta restarts lastText when partID changes", () => {
    let t = 1000
    const store = new SessionStore((directory) => directory === WORK, () => t)
    store.add(session({ id: "s1", title: "Task", time: { updated: 10 } }))
    store.applyEvent(ev("session.status", { sessionID: "s1", status: { type: "busy" } }))
    store.applyEvent(
      ev("message.updated", {
        info: { id: "asst-1", sessionID: "s1", role: "assistant" },
      }),
    )

    // Part p1
    store.applyEvent(
      ev("message.part.delta", {
        sessionID: "s1",
        messageID: "asst-1",
        partID: "p1",
        field: "text",
        delta: "Thinking first step...",
      }),
    )
    store.applyEvent(
      ev("message.part.delta", {
        sessionID: "s1",
        messageID: "asst-1",
        partID: "p1",
        field: "text",
        delta: " done thinking.",
      }),
    )

    // Part p2 arrives -> restarts lastText
    store.applyEvent(
      ev("message.part.delta", {
        sessionID: "s1",
        messageID: "asst-1",
        partID: "p2",
        field: "text",
        delta: "Final answer",
      }),
    )
    store.applyEvent(
      ev("message.part.delta", {
        sessionID: "s1",
        messageID: "asst-1",
        partID: "p2",
        field: "text",
        delta: " completed.",
      }),
    )

    t = 2000
    store.applyEvent(ev("session.idle", { sessionID: "s1" }))

    const rows = store.inbox(undefined, new Set(["s1"]), t)
    expect(rows[0].result?.lastText).toBe("Final answer completed.")
  })

  test("message.* and session.diff return false while session.idle returns true", () => {
    const store = make()
    store.add(session({ id: "s1", title: "S", time: { updated: 1 } }))
    store.applyEvent(ev("session.status", { sessionID: "s1", status: { type: "busy" } }))

    expect(
      store.applyEvent(
        ev("message.updated", { info: { id: "m1", sessionID: "s1", role: "assistant" } }),
      ),
    ).toBe(false)
    expect(
      store.applyEvent(
        ev("message.part.updated", {
          part: { id: "p1", messageID: "m1", sessionID: "s1", type: "text", text: "t" },
        }),
      ),
    ).toBe(false)
    expect(
      store.applyEvent(
        ev("message.part.delta", {
          sessionID: "s1",
          messageID: "m1",
          partID: "p1",
          field: "text",
          delta: "d",
        }),
      ),
    ).toBe(false)
    expect(
      store.applyEvent(
        ev("session.diff", {
          sessionID: "s1",
          diff: [{ file: "x.ts", additions: 1, deletions: 0 }],
        }),
      ),
    ).toBe(false)
    expect(store.applyEvent(ev("session.idle", { sessionID: "s1" }))).toBe(true)
  })

  test("applySnapshot preserves existing run summary for surviving rows", () => {
    let t = 1000
    const store = new SessionStore((directory) => directory === WORK, () => t)
    store.add(session({ id: "s1", title: "Session", time: { updated: 50 } }))
    store.applyEvent(ev("session.status", { sessionID: "s1", status: { type: "busy" } }))
    store.applyEvent(
      ev("message.updated", {
        info: { id: "m1", sessionID: "s1", role: "assistant", cost: 0.05, tokens: { total: 2000 } },
      }),
    )
    store.applyEvent(
      ev("session.diff", {
        sessionID: "s1",
        diff: [{ file: "foo.ts", additions: 5, deletions: 2 }],
      }),
    )
    t = 3000
    store.applyEvent(ev("session.idle", { sessionID: "s1" }))

    // Snapshot arrives
    store.applySnapshot({
      sessions: [session({ id: "s1", title: "Session", time: { updated: 60 } })],
      status: { s1: { type: "idle" } },
      permissions: [],
      questions: [],
    })

    const rows = store.inbox(undefined, new Set(["s1"]), 3000)
    expect(rows[0].result).toEqual({
      files: [{ file: "foo.ts", additions: 5, deletions: 2 }],
      durMs: 2000,
      costUsd: 0.05,
      tokens: 2000,
    })
    expect(rows[0].summary).toBe("1 file · 2s · $0.05")
  })

  test("summary fallback combinations: <$0.01, 1 file, compact time durations, long text ellipsis, Finished fallback", () => {
    let t = 0
    const store = new SessionStore((directory) => directory === WORK, () => t)

    // Case A: Everything missing -> "Finished"
    store.add(session({ id: "s-empty", title: "Empty", time: { updated: 10 } }))
    let rows = store.inbox(undefined, new Set(["s-empty"]), t)
    expect(rows[0].summary).toBe("Finished")
    expect(rows[0].result).toBeUndefined()

    // Case B: Only 1 file
    store.add(session({ id: "s-file", title: "One File", time: { updated: 10 } }))
    store.applyEvent(
      ev("session.diff", {
        sessionID: "s-file",
        diff: [{ file: "one.ts", additions: 1, deletions: 0 }],
      }),
    )
    rows = store.inbox(undefined, new Set(["s-file"]), t)
    expect(rows[0].summary).toBe("1 file")

    // Case C: Cost < $0.01 (0 < value < 0.005)
    store.add(session({ id: "s-cheap", title: "Cheap", time: { updated: 10 } }))
    store.applyEvent(ev("session.status", { sessionID: "s-cheap", status: { type: "busy" } }))
    store.applyEvent(
      ev("message.updated", {
        info: { id: "m-c", sessionID: "s-cheap", role: "assistant", cost: 0.002, tokens: { total: 100 } },
      }),
    )
    store.applyEvent(ev("session.idle", { sessionID: "s-cheap" }))
    rows = store.inbox(undefined, new Set(["s-cheap"]), t)
    expect(rows[0].summary).toContain("<$0.01")

    // Case D: Compact durations: 4m12s and 1h02m
    store.add(session({ id: "s-4m", title: "4m", time: { updated: 10 } }))
    t = 1000
    store.applyEvent(ev("session.status", { sessionID: "s-4m", status: { type: "busy" } }))
    t = 1000 + 252000 // 4m 12s
    store.applyEvent(ev("session.idle", { sessionID: "s-4m" }))
    rows = store.inbox(undefined, new Set(["s-4m"]), t)
    expect(rows[0].summary).toBe("4m12s")

    store.add(session({ id: "s-1h", title: "1h", time: { updated: 10 } }))
    t = 1000
    store.applyEvent(ev("session.status", { sessionID: "s-1h", status: { type: "busy" } }))
    t = 1000 + 3720000 // 1h 02m
    store.applyEvent(ev("session.idle", { sessionID: "s-1h" }))
    rows = store.inbox(undefined, new Set(["s-1h"]), t)
    expect(rows[0].summary).toBe("1h02m")

    // Case E: Long text truncated to 80 chars with …
    store.add(session({ id: "s-long", title: "Long Text", time: { updated: 10 } }))
    store.applyEvent(ev("session.status", { sessionID: "s-long", status: { type: "busy" } }))
    store.applyEvent(
      ev("message.updated", {
        info: { id: "m-l", sessionID: "s-long", role: "assistant" },
      }),
    )
    const long85 = "A".repeat(85)
    store.applyEvent(
      ev("message.part.updated", {
        part: { id: "p-l", messageID: "m-l", sessionID: "s-long", type: "text", text: `${long85}\nsecond line` },
      }),
    )
    store.applyEvent(ev("session.idle", { sessionID: "s-long" }))
    rows = store.inbox(undefined, new Set(["s-long"]), t)
    expect(rows[0].summary).toBe("0s · " + "A".repeat(80) + "…")
  })

  test("error row preserves summary as error message while appending result", () => {
    let t = 1000
    const store = new SessionStore((directory) => directory === WORK, () => t)
    store.add(session({ id: "s-err", title: "Failed Task", time: { updated: 1000 } }))

    store.applyEvent(ev("session.status", { sessionID: "s-err", status: { type: "busy" } }))
    store.applyEvent(
      ev("message.updated", {
        info: { id: "m1", sessionID: "s-err", role: "assistant", cost: 0.02, tokens: { total: 300 } },
      }),
    )
    store.applyEvent(
      ev("session.diff", {
        sessionID: "s-err",
        diff: [{ file: "fail.ts", additions: 3, deletions: 1 }],
      }),
    )
    store.applyEvent(ev("session.error", { sessionID: "s-err", error: { data: { message: "Network timeout" } } }))
    t = 6000
    store.applyEvent(ev("session.idle", { sessionID: "s-err" }))

    const rows = store.inbox(undefined, new Set(), t)
    const errRow = rows.find((r) => r.sessionId === "s-err")!
    expect(errRow).toBeDefined()
    expect(errRow.kind).toBe("error")
    expect(errRow.summary).toBe("Network timeout")
    expect(errRow.detail).toBe("Network timeout")
    expect(errRow.result).toEqual({
      files: [{ file: "fail.ts", additions: 3, deletions: 1 }],
      durMs: 5000,
      costUsd: 0.02,
      tokens: 300,
    })
  })

  test("retry does not start a new run and preserves duration across retry to idle", () => {
    let t = 1000
    const store = new SessionStore((directory) => directory === WORK, () => t)
    store.add(session({ id: "s-ret", title: "Retry Task", time: { updated: 1000 } }))

    // Run starts
    store.applyEvent(ev("session.status", { sessionID: "s-ret", status: { type: "busy" } }))
    store.applyEvent(
      ev("message.updated", {
        info: { id: "m1", sessionID: "s-ret", role: "assistant", cost: 0.03, tokens: { total: 400 } },
      }),
    )

    // Status becomes retry at t = 2000 (does not start a new run)
    t = 2000
    store.applyEvent(ev("session.status", { sessionID: "s-ret", status: { type: "retry" } }))

    // Add another message during retry
    store.applyEvent(
      ev("message.updated", {
        info: { id: "m2", sessionID: "s-ret", role: "assistant", cost: 0.01, tokens: { total: 100 } },
      }),
    )

    // Finishes to idle at t = 5000
    t = 5000
    store.applyEvent(ev("session.status", { sessionID: "s-ret", status: { type: "idle" } }))

    const rows = store.inbox(undefined, new Set(["s-ret"]), t)
    expect(rows[0].result).toEqual({
      durMs: 4000,
      costUsd: 0.04,
      tokens: 500,
    })
    expect(rows[0].summary).toBe("4s · $0.04")
  })

  test("token breakdown calculation sums input, output, reasoning, cache read, and cache write when total is missing", () => {
    const store = make()
    store.add(session({ id: "s-tok", title: "Tokens", time: { updated: 1 } }))
    store.applyEvent(ev("session.status", { sessionID: "s-tok", status: { type: "busy" } }))

    store.applyEvent(
      ev("message.updated", {
        info: {
          id: "m-tok",
          sessionID: "s-tok",
          role: "assistant",
          tokens: {
            input: 100,
            output: 50,
            reasoning: 20,
            cache: { read: 10, write: 5 },
          },
        },
      }),
    )
    store.applyEvent(ev("session.idle", { sessionID: "s-tok" }))

    const rows = store.inbox(undefined, new Set(["s-tok"]))
    expect(rows[0].result?.tokens).toBe(185)
  })
})
