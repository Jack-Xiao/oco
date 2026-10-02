import { describe, expect, test } from "bun:test"
import type { SessionActivity, SessionListItem } from "@oco/contracts"
import {
  UnreadTracker,
  compactTime,
  splitSessions,
  startOfDay,
  startOfYesterday,
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

  test("20m across midnight, then yesterday, days, and calendar dates", () => {
    const justAfterMidnight = at(2026, 8, 30, 0, 10)
    expect(compactTime(at(2026, 8, 29, 23, 50), justAfterMidnight)).toBe("20m")
    expect(compactTime(at(2026, 8, 29, 10, 0), NOW)).toBe("yesterday")
    expect(compactTime(at(2026, 8, 29, 23, 50), NOW)).toBe("yesterday")
    expect(compactTime(startOfYesterday(NOW), NOW)).toBe("yesterday")
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
})
