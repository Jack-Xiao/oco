import { describe, expect, test } from "bun:test"
import type { SessionActivity, SessionListItem } from "@oco/contracts"
import {
  FinishedNotifier,
  PendingNotifier,
  UnreadTracker,
  compactTime,
  groupInbox,
  listMessage,
  splitSessions,
  startOfDay,
  startOfYesterday,
  type InboxRow,
} from "../../apps/extension/src/session-groups"

/** Local calendar time, so assertions do not depend on the machine's UTC offset. */
const at = (year: number, month: number, day: number, hour = 0, minute = 0) =>
  new Date(year, month, day, hour, minute).getTime()

const NOW = at(2026, 8, 30, 14, 0) // 2026-09-30 14:00 local

function item(partial: Partial<SessionListItem> & { id: string }): SessionListItem {
  return {
    title: partial.id,
    directory: "/work",
    updated: 0,
    activity: "idle",
    pendingPermissions: 0,
    pendingQuestions: 0,
    ...partial,
  }
}

describe("startOfDay and startOfYesterday", () => {
  test("midnight is local, and yesterday steps a calendar day", () => {
    expect(startOfDay(NOW)).toBe(at(2026, 8, 30))
    expect(startOfYesterday(NOW)).toBe(at(2026, 8, 29))
    expect(startOfYesterday(at(2026, 8, 30, 0, 10))).toBe(at(2026, 8, 29))
    // Spring-forward day: setDate lands on the previous local midnight, not 24h earlier.
    const spring = at(2026, 2, 8, 14, 0)
    const yesterday = new Date(startOfYesterday(spring))
    expect(yesterday.getFullYear()).toBe(2026)
    expect(yesterday.getMonth()).toBe(2)
    expect(yesterday.getDate()).toBe(7)
    expect(yesterday.getHours()).toBe(0)
    expect(yesterday.getMinutes()).toBe(0)
  })
})

describe("compactTime", () => {
  test("blank, now, minutes, and hours today", () => {
    expect(compactTime(0, NOW)).toBe("")
    expect(compactTime(NOW, NOW)).toBe("now")
    expect(compactTime(NOW + 5_000, NOW)).toBe("now")
    expect(compactTime(NOW - 59_000, NOW)).toBe("now")
    expect(compactTime(NOW - 60_000, NOW)).toBe("1m")
    expect(compactTime(NOW - 20 * 60_000, NOW)).toBe("20m")
    expect(compactTime(NOW - 59 * 60_000, NOW)).toBe("59m")
    expect(compactTime(at(2026, 8, 30, 13, 0), NOW)).toBe("1h")
    expect(compactTime(at(2026, 8, 30, 11, 30), NOW)).toBe("2h")
    expect(compactTime(at(2026, 8, 30, 0, 30), at(2026, 8, 30, 2, 0))).toBe("1h")
  })

  test("20m across midnight, then days (yesterday is 1d), and calendar dates", () => {
    const justAfterMidnight = at(2026, 8, 30, 0, 10)
    expect(compactTime(at(2026, 8, 29, 23, 50), justAfterMidnight)).toBe("20m")
    expect(compactTime(at(2026, 8, 29, 10, 0), NOW)).toBe("1d")
    expect(compactTime(at(2026, 8, 29, 23, 50), NOW)).toBe("1d")
    expect(compactTime(startOfYesterday(NOW), NOW)).toBe("1d")
    expect(compactTime(at(2026, 8, 28, 23, 59), NOW)).toBe("2d")
    expect(compactTime(at(2026, 8, 24, 14, 0), NOW)).toBe("6d")
    // Two calendar days that include the spring-forward hour still read as 2d.
    expect(compactTime(at(2026, 2, 7, 12, 0), at(2026, 2, 9, 14, 0))).toBe("2d")
    expect(compactTime(at(2026, 8, 23, 9, 0), NOW)).toBe("Sep 23")
    expect(compactTime(at(2026, 8, 28, 12, 0), at(2026, 9, 6, 14, 0))).toBe("Sep 28")
    expect(compactTime(at(2025, 11, 20, 8, 0), NOW)).toBe("2025-12-20")
  })
})

describe("splitSessions", () => {
  test("keeps yesterday, non-idle, and unread in recent, in input order", () => {
    const items = [
      item({ id: "old-idle", updated: at(2026, 8, 28, 12, 0) }),
      item({ id: "old-busy", updated: at(2026, 8, 1, 12, 0), activity: "busy" }),
      item({ id: "today", updated: at(2026, 8, 30, 9, 0) }),
      item({ id: "old-unread", updated: at(2026, 8, 20, 9, 0) }),
      item({ id: "yesterday", updated: at(2026, 8, 29, 8, 0) }),
      item({ id: "old-retry", updated: at(2026, 7, 2, 8, 0), activity: "retry" }),
      item({ id: "old-permission", updated: at(2026, 7, 3, 8, 0), activity: "permission" }),
      item({ id: "old-question", updated: at(2026, 7, 4, 8, 0), activity: "question" }),
      item({ id: "old-error", updated: at(2026, 7, 1, 8, 0), activity: "error" }),
      item({ id: "before-yesterday", updated: at(2026, 8, 28, 23, 59) }),
      item({ id: "yesterday-midnight", updated: startOfYesterday(NOW) }),
    ]
    const { recent, more } = splitSessions(items, NOW, (id) => id === "old-unread")
    expect(recent.map((session) => session.id)).toEqual([
      "old-busy",
      "today",
      "old-unread",
      "yesterday",
      "old-retry",
      "old-permission",
      "old-question",
      "old-error",
      "yesterday-midnight",
    ])
    expect(more.map((session) => session.id)).toEqual(["old-idle", "before-yesterday"])
  })
})

describe("UnreadTracker", () => {
  test("first sighting never becomes unread", () => {
    const tracker = new UnreadTracker()
    expect(tracker.update([item({ id: "a", activity: "idle" })])).toBe(false)
    expect(tracker.update([item({ id: "a", activity: "busy" })])).toBe(false)
    expect(tracker.update([item({ id: "b", activity: "error" })])).toBe(false)
    expect(tracker.has("a")).toBe(false)
    expect(tracker.has("b")).toBe(false)
    expect(tracker.ids()).toEqual([])
  })

  test("busy or retry settling to idle or error is unread; other transitions are not", () => {
    const tracker = new UnreadTracker()
    const see = (id: string, activity: SessionActivity) => tracker.update([item({ id, activity })])
    expect(see("busy-idle", "busy")).toBe(false)
    expect(see("busy-idle", "idle")).toBe(true)
    expect(see("busy-error", "busy")).toBe(false)
    expect(see("busy-error", "error")).toBe(true)
    expect(see("retry-idle", "retry")).toBe(false)
    expect(see("retry-idle", "idle")).toBe(true)
    expect(see("retry-error", "retry")).toBe(false)
    expect(see("retry-error", "error")).toBe(true)
    expect(tracker.ids()).toEqual(["busy-idle", "busy-error", "retry-idle", "retry-error"])

    const quiet = new UnreadTracker()
    expect(quiet.update([item({ id: "p", activity: "busy" })])).toBe(false)
    expect(quiet.update([item({ id: "p", activity: "retry" })])).toBe(false)
    expect(quiet.update([item({ id: "p", activity: "permission" })])).toBe(false)
    expect(quiet.update([item({ id: "p", activity: "idle" })])).toBe(false)
    expect(quiet.update([item({ id: "q", activity: "question" })])).toBe(false)
    expect(quiet.update([item({ id: "q", activity: "error" })])).toBe(false)
    expect(quiet.update([item({ id: "e", activity: "error" })])).toBe(false)
    expect(quiet.update([item({ id: "e", activity: "idle" })])).toBe(false)
    expect(quiet.ids()).toEqual([])
  })

  test("the open session is not marked, and is cleared if it was already unread", () => {
    const tracker = new UnreadTracker()
    tracker.update([item({ id: "open", activity: "busy" }), item({ id: "other", activity: "retry" })])
    expect(
      tracker.update(
        [item({ id: "open", activity: "idle" }), item({ id: "other", activity: "error" })],
        "open",
      ),
    ).toBe(true)
    expect(tracker.has("open")).toBe(false)
    expect(tracker.has("other")).toBe(true)

    const already = new UnreadTracker(["open", "keep"])
    expect(already.update([item({ id: "open", activity: "idle" })], "open")).toBe(true)
    expect(already.has("open")).toBe(false)
    expect(already.has("keep")).toBe(true)
    expect(already.update([item({ id: "open", activity: "idle" })], "open")).toBe(false)
  })

  test("clear and ids report membership without keeping a caller-owned array", () => {
    const tracker = new UnreadTracker(["a", "b", "a"])
    expect(tracker.ids()).toEqual(["a", "b"])
    expect(tracker.clear("b")).toBe(true)
    expect(tracker.clear("b")).toBe(false)
    expect(tracker.clear("missing")).toBe(false)
    const ids = tracker.ids()
    ids.push("nope")
    expect(tracker.ids()).toEqual(["a"])
    expect(tracker.has("a")).toBe(true)
  })

  test("ids missing from the list stay unread, but their previous activity is forgotten", () => {
    const tracker = new UnreadTracker()
    tracker.update([item({ id: "gone", activity: "busy" }), item({ id: "stay", activity: "busy" })])
    expect(tracker.update([item({ id: "stay", activity: "idle" })])).toBe(true)
    expect(tracker.has("stay")).toBe(true)
    expect(tracker.has("gone")).toBe(false)
    // `gone` was dropped from the list before it settled, so the next idle is a first sighting.
    expect(tracker.update([item({ id: "gone", activity: "idle" })])).toBe(false)
    expect(tracker.has("gone")).toBe(false)

    expect(tracker.update([])).toBe(false)
    expect(tracker.has("stay")).toBe(true)
    // Activity memory was replaced by the empty list, so this idle does not count again.
    expect(tracker.update([item({ id: "stay", activity: "idle" })])).toBe(false)
    expect(tracker.ids()).toEqual(["stay"])
    expect(tracker.update([item({ id: "other", activity: "busy" })])).toBe(false)
    expect(tracker.has("stay")).toBe(true)
  })

  test("the unread set is capped at max, dropping the oldest insertion", () => {
    const tracker = new UnreadTracker(["a", "b", "c"], 2)
    expect(tracker.ids()).toEqual(["b", "c"])
    expect(tracker.has("a")).toBe(false)

    const capped = new UnreadTracker(undefined, 2)
    const busy = ["a", "b", "c"].map((id) => item({ id, activity: "busy" }))
    expect(capped.update(busy)).toBe(false)
    expect(capped.update(busy.map((session) => ({ ...session, activity: "idle" })))).toBe(true)
    expect(capped.ids()).toEqual(["b", "c"])
    expect(capped.has("a")).toBe(false)

    const defaults = new UnreadTracker()
    const many = Array.from({ length: 201 }, (_, index) => item({ id: `s${index}`, activity: "busy" }))
    expect(defaults.update(many)).toBe(false)
    expect(defaults.update(many.map((session) => ({ ...session, activity: "idle" as const })))).toBe(true)
    expect(defaults.ids()).toHaveLength(200)
    expect(defaults.has("s0")).toBe(false)
    expect(defaults.has("s1")).toBe(true)
    expect(defaults.has("s200")).toBe(true)
    expect(defaults.ids()[0]).toBe("s1")
    expect(defaults.ids()[199]).toBe("s200")
  })

  test("manually remembered session remains unread across update() and clears when becoming current", () => {
    const tracker = new UnreadTracker()
    expect(tracker.remember("manual-1")).toBe(true)
    expect(tracker.has("manual-1")).toBe(true)

    // update with idle item does not clear it
    expect(tracker.update([item({ id: "manual-1", activity: "idle" })])).toBe(false)
    expect(tracker.has("manual-1")).toBe(true)

    // update with other session as current does not clear it
    expect(tracker.update([item({ id: "manual-1", activity: "idle" })], "other")).toBe(false)
    expect(tracker.has("manual-1")).toBe(true)

    // when manual-1 becomes current, it is cleared
    expect(tracker.update([item({ id: "manual-1", activity: "idle" })], "manual-1")).toBe(true)
    expect(tracker.has("manual-1")).toBe(false)
  })

  test("manually remembered while already current stays unread on refresh, clears on reopening", () => {
    const tracker = new UnreadTracker()
    tracker.update([item({ id: "active", activity: "idle" })], "active")

    // Marked while active is current
    expect(tracker.remember("active")).toBe(true)
    expect(tracker.has("active")).toBe(true)

    // 150ms refresh with same current does not wipe it
    expect(tracker.update([item({ id: "active", activity: "idle" })], "active")).toBe(false)
    expect(tracker.has("active")).toBe(true)

    // Switch to another session
    expect(tracker.update([item({ id: "active", activity: "idle" })], "other")).toBe(false)
    expect(tracker.has("active")).toBe(true)

    // Reopen active (becomes current again)
    expect(tracker.update([item({ id: "active", activity: "idle" })], "active")).toBe(true)
    expect(tracker.has("active")).toBe(false)
  })
})

describe("list state messages", () => {
  const base = { summary: { state: "connected" } as any, connected: true, hasRows: false, query: "", loading: false, trusted: true }
  test("rows hide the message", () => {
    expect(listMessage({ ...base, hasRows: true })).toBeUndefined()
  })
  test("connected and empty: loading, search miss, empty workspace, restricted mode", () => {
    expect(listMessage({ ...base, loading: true })?.text).toBe("Loading sessions…")
    expect(listMessage({ ...base, query: "x" })?.actions).toEqual([{ label: "Clear Search", command: "oco.clearSearch" }])
    expect(listMessage(base)?.actions.map((a) => a.command)).toEqual(["oco.newSession"])
    expect(listMessage({ ...base, trusted: false })?.actions).toEqual([])
  })
  test("connecting with nothing cached shows no buttons; an error carries its cause", () => {
    expect(listMessage({ ...base, summary: { state: "connecting" } as any, connected: false })).toEqual({ text: "Connecting to the OpenCode server…", actions: [] })
    expect(listMessage({ ...base, summary: { state: "error", error: "ECONNREFUSED" } as any, connected: false })?.text).toContain("ECONNREFUSED")
  })
})

describe("groupInbox", () => {
  function makeRow(partial: Partial<InboxRow> & { id: string }): InboxRow {
    return {
      id: partial.id,
      kind: "permission",
      sessionId: partial.sessionId ?? partial.id,
      title: partial.title ?? partial.id,
      summary: partial.summary ?? "test",
      detail: partial.detail ?? "test",
      time: partial.time ?? "1m",
      at: partial.at ?? 100,
      aria: partial.aria ?? partial.id,
      ...partial,
    }
  }

  test("无父 (no parentId): stays top-level row", () => {
    const rows = [makeRow({ id: "r1", at: 100 }), makeRow({ id: "r2", at: 50 })]
    const entries = groupInbox(rows)
    expect(entries).toEqual([
      expect.objectContaining({ id: "r2", at: 50 }),
      expect.objectContaining({ id: "r1", at: 100 }),
    ])
  })

  test("有父 (has parentId and known parent): grouped by parentId", () => {
    const rows = [
      makeRow({ id: "c1", parentId: "p1", parent: "Parent Task", at: 120 }),
      makeRow({ id: "c2", parentId: "p1", parent: "Parent Task", at: 80 }),
    ]
    const entries = groupInbox(rows)
    expect(entries).toHaveLength(1)
    expect(entries[0]).toEqual({
      kind: "group",
      parentId: "p1",
      title: "Parent Task",
      rows: [
        expect.objectContaining({ id: "c2", at: 80 }),
        expect.objectContaining({ id: "c1", at: 120 }),
      ],
    })
  })

  test("父未知 (has parentId but parent unknown): remains top-level row", () => {
    const rows = [
      makeRow({ id: "c1", parentId: "unknown-p", parent: undefined, at: 90 }),
      makeRow({ id: "r1", at: 70 }),
    ]
    const entries = groupInbox(rows)
    expect(entries).toEqual([
      expect.objectContaining({ id: "r1", at: 70 }),
      expect.objectContaining({ id: "c1", parentId: "unknown-p", at: 90 }),
    ])
  })

  test("排序 (sorting): top-level by earliest at ascending; in-group by at ascending", () => {
    const rows = [
      makeRow({ id: "g1-late", parentId: "p1", parent: "P1", at: 200 }),
      makeRow({ id: "g1-early", parentId: "p1", parent: "P1", at: 80 }),
      makeRow({ id: "g2-late", parentId: "p2", parent: "P2", at: 90 }),
      makeRow({ id: "g2-early", parentId: "p2", parent: "P2", at: 30 }),
      makeRow({ id: "solo", at: 50 }),
    ]
    const entries = groupInbox(rows)
    expect(entries).toHaveLength(3)

    // Earliest at:
    // P2: 30
    // solo: 50
    // P1: 80
    expect(entries[0]).toMatchObject({
      kind: "group",
      parentId: "p2",
      title: "P2",
      rows: [expect.objectContaining({ id: "g2-early", at: 30 }), expect.objectContaining({ id: "g2-late", at: 90 })],
    })
    expect(entries[1]).toMatchObject({
      id: "solo",
      at: 50,
    })
    expect(entries[2]).toMatchObject({
      kind: "group",
      parentId: "p1",
      title: "P1",
      rows: [expect.objectContaining({ id: "g1-early", at: 80 }), expect.objectContaining({ id: "g1-late", at: 200 })],
    })
  })

  test("混合 (mixed): includes standalone, grouped, unknown parent, with tie-breaking", () => {
    const rows = [
      makeRow({ id: "solo-1", at: 100 }),
      makeRow({ id: "orphan", parentId: "nonexistent", parent: undefined, at: 40 }),
      makeRow({ id: "child-a", parentId: "p-alpha", parent: "Alpha", at: 150 }),
      makeRow({ id: "child-b", parentId: "p-alpha", parent: "Alpha", at: 60 }),
      makeRow({ id: "solo-2", at: 200 }),
    ]
    const entries = groupInbox(rows)
    // Earliest at:
    // orphan: 40
    // Alpha: min(150, 60) = 60
    // solo-1: 100
    // solo-2: 200
    expect(entries).toHaveLength(4)
    expect(entries[0]).toMatchObject({ id: "orphan", at: 40 })
    expect(entries[1]).toMatchObject({
      kind: "group",
      parentId: "p-alpha",
      title: "Alpha",
      rows: [expect.objectContaining({ id: "child-b", at: 60 }), expect.objectContaining({ id: "child-a", at: 150 })],
    })
    expect(entries[2]).toMatchObject({ id: "solo-1", at: 100 })
    expect(entries[3]).toMatchObject({ id: "solo-2", at: 200 })
  })

  test("preserves always, patterns, and permission fields", () => {
    const row = makeRow({
      id: "perm-row",
      kind: "permission",
      permission: "doom_loop",
      patterns: ["test/*"],
      always: ["test/*", "build/*"],
    })
    const entries = groupInbox([row])
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({
      id: "perm-row",
      permission: "doom_loop",
      patterns: ["test/*"],
      always: ["test/*", "build/*"],
    })
  })
})

describe("PendingNotifier level gate", () => {
  function check(level: "off" | "windowNotFocused" | "always", focused: boolean) {
    let notified = 0
    const notifier = new PendingNotifier({
      notify: async () => {
        notified++
        return undefined
      },
      focus: () => {},
      level: () => level,
      windowFocused: () => focused,
    })
    const fired = notifier.check([{ id: "req", sessionId: "other", rootSessionId: "other" }], "current")
    return { fired, notified }
  }

  test("off never notifies, windowNotFocused only in the background, always notifies", () => {
    expect(check("off", false)).toEqual({ fired: false, notified: 0 })
    expect(check("off", true)).toEqual({ fired: false, notified: 0 })
    expect(check("windowNotFocused", true)).toEqual({ fired: false, notified: 0 })
    expect(check("windowNotFocused", false)).toEqual({ fired: true, notified: 1 })
    expect(check("always", true)).toEqual({ fired: true, notified: 1 })
    expect(check("always", false)).toEqual({ fired: true, notified: 1 })
  })
})

describe("FinishedNotifier", () => {
  type Notice = {
    severity: "info" | "warning"
    message: string
    actions: string[]
    sessionId?: string
  }

  function harness(level: "off" | "windowNotFocused" | "always" = "always", focused = false) {
    const notices: Notice[] = []
    let choice: "Show" | "Open" | "Diff" | undefined
    let focus = 0
    let opened: string | undefined
    let diffed: string | undefined
    const timers: { fn: () => void; cancelled: boolean; ms: number }[] = []
    const notifier = new FinishedNotifier({
      level: () => level,
      windowFocused: () => focused,
      notify: (notice) => {
        notices.push(notice)
        return Promise.resolve(choice)
      },
      focus: () => {
        focus++
      },
      open: (id) => {
        opened = id
      },
      diff: (id) => {
        diffed = id
      },
      schedule: (fn, ms) => {
        const timer = { fn, cancelled: false, ms }
        timers.push(timer)
        return () => {
          timer.cancelled = true
        }
      },
    })
    return {
      notifier,
      notices,
      timers,
      choose: (next: "Show" | "Open" | "Diff" | undefined) => {
        choice = next
      },
      get focus() {
        return focus
      },
      get opened() {
        return opened
      },
      get diffed() {
        return diffed
      },
      flush: async () => {
        const due = timers.splice(0)
        for (const timer of due) if (!timer.cancelled) timer.fn()
        await Promise.resolve()
        await Promise.resolve()
      },
    }
  }

  function sess(partial: { id: string; activity: "idle" | "busy" | "retry" | "error" | "permission" | "question"; title?: string; parentID?: string; error?: string; result?: { files?: unknown[]; durMs?: number; costUsd?: number; lastText?: string } }) {
    return { title: partial.id, ...partial }
  }

  test("notifies a finished root after the delay, with Open and Diff when files changed", async () => {
    const h = harness()
    h.choose("Diff")
    h.notifier.check([sess({ id: "a", activity: "busy" })])
    h.notifier.check([
      sess({ id: "a", activity: "idle", title: "Build", result: { files: [{}, {}, {}], durMs: 252_000 } }),
    ])
    expect(h.notices).toEqual([])
    expect(h.timers.map((timer) => timer.ms)).toEqual([1500])
    await h.flush()
    expect(h.notices).toEqual([
      {
        severity: "info",
        message: `"Build" finished · 3 files · 4m12s`,
        actions: ["Open", "Diff"],
        sessionId: "a",
      },
    ])
    expect(h.diffed).toBe("a")
    expect(h.opened).toBeUndefined()
  })

  test("uses the latest summary if it arrives during the delay", async () => {
    const h = harness()
    h.notifier.check([sess({ id: "a", activity: "busy", title: "Build" })])
    h.notifier.check([sess({ id: "a", activity: "idle", title: "Build", result: { durMs: 5_000 } })])
    h.notifier.check([
      sess({
        id: "a",
        activity: "idle",
        title: "Build",
        result: { files: [{}], durMs: 252_000, costUsd: 1.2, lastText: "done" },
      }),
    ])
    await h.flush()
    expect(h.notices[0]?.message).toBe(`"Build" finished · 1 file · 4m12s · $1.20 · done`)
    expect(h.notices[0]?.actions).toEqual(["Open", "Diff"])
  })

  test("warns on retry → error with Open only", async () => {
    const h = harness()
    h.choose("Open")
    h.notifier.check([sess({ id: "a", activity: "retry", title: "Build" })])
    h.notifier.check([sess({ id: "a", activity: "error", title: "Build", error: "boom" })])
    await h.flush()
    expect(h.notices).toEqual([
      { severity: "warning", message: `"Build" failed: boom`, actions: ["Open"], sessionId: "a" },
    ])
    expect(h.opened).toBe("a")
  })

  test("does not notify a child session", async () => {
    const h = harness()
    h.notifier.check([sess({ id: "child", parentID: "root", activity: "busy" })])
    h.notifier.check([sess({ id: "child", parentID: "root", activity: "idle", title: "Child" })])
    await h.flush()
    expect(h.notices).toEqual([])
  })

  test("does not notify the current session, including when it becomes current during the delay", async () => {
    const h = harness()
    h.notifier.check([sess({ id: "a", activity: "busy" })], "a")
    h.notifier.check([sess({ id: "a", activity: "idle", title: "A" })], "a")
    await h.flush()
    expect(h.notices).toEqual([])

    h.notifier.check([sess({ id: "b", activity: "busy" })])
    h.notifier.check([sess({ id: "b", activity: "idle", title: "B" })])
    h.notifier.check([sess({ id: "b", activity: "idle", title: "B" })], "b")
    await h.flush()
    expect(h.notices).toEqual([])
  })

  test("a first sighting is not a transition", async () => {
    const h = harness()
    h.notifier.check([sess({ id: "a", activity: "idle", title: "A" })])
    await h.flush()
    expect(h.timers).toEqual([])
    expect(h.notices).toEqual([])
  })

  test("cancels when the session goes back to busy during the delay", async () => {
    const h = harness()
    h.notifier.check([sess({ id: "a", activity: "busy" })])
    h.notifier.check([sess({ id: "a", activity: "idle", title: "A" })])
    h.notifier.check([sess({ id: "a", activity: "busy" })])
    expect(h.timers[0]?.cancelled).toBe(true)
    await h.flush()
    expect(h.notices).toEqual([])
  })

  test("merges several sessions that settle in one pass into one Show toast", async () => {
    const h = harness()
    h.choose("Show")
    h.notifier.check([sess({ id: "a", activity: "busy" }), sess({ id: "b", activity: "retry" })])
    h.notifier.check([
      sess({ id: "a", activity: "idle", title: "A" }),
      sess({ id: "b", activity: "error", title: "B", error: "nope" }),
    ])
    await h.flush()
    expect(h.notices).toEqual([
      { severity: "warning", message: "2 sessions finished", actions: ["Show"] },
    ])
    expect(h.focus).toBe(1)
  })

  test("a batch that shrinks to one session uses the single-session toast", async () => {
    const h = harness()
    h.notifier.check([sess({ id: "a", activity: "busy" }), sess({ id: "b", activity: "busy" })])
    h.notifier.check([
      sess({ id: "a", activity: "idle", title: "A" }),
      sess({ id: "b", activity: "idle", title: "B" }),
    ])
    h.notifier.check([
      sess({ id: "a", activity: "busy" }),
      sess({ id: "b", activity: "idle", title: "B" }),
    ])
    await h.flush()
    expect(h.notices).toEqual([
      { severity: "info", message: `"B" finished`, actions: ["Open"], sessionId: "b" },
    ])
  })

  test("level off does not notify", async () => {
    const h = harness("off")
    h.notifier.check([sess({ id: "a", activity: "busy" })])
    h.notifier.check([sess({ id: "a", activity: "idle", title: "A" })])
    await h.flush()
    expect(h.notices).toEqual([])
  })

  test("windowNotFocused stays quiet in the foreground", async () => {
    const quiet = harness("windowNotFocused", true)
    quiet.notifier.check([sess({ id: "a", activity: "busy" })])
    quiet.notifier.check([sess({ id: "a", activity: "idle", title: "A" })])
    await quiet.flush()
    expect(quiet.notices).toEqual([])

    const loud = harness("windowNotFocused", false)
    loud.notifier.check([sess({ id: "a", activity: "busy" })])
    loud.notifier.check([sess({ id: "a", activity: "idle", title: "A" })])
    await loud.flush()
    expect(loud.notices).toHaveLength(1)
  })

  test("dispose cancels a pending toast", async () => {
    const h = harness()
    h.notifier.check([sess({ id: "a", activity: "busy" })])
    h.notifier.check([sess({ id: "a", activity: "idle", title: "A" })])
    h.notifier.dispose()
    await h.flush()
    expect(h.notices).toEqual([])
  })
})
