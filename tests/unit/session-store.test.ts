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
