import { describe, expect, test } from "bun:test"
import { BOOKMARKS_KEY, MessageBookmarks, type MessageBookmark } from "../../apps/extension/src/bookmarks"

function memento(initial: Record<string, unknown> = {}) {
  const data = { ...initial }
  return {
    data,
    get<T>(key: string) {
      return data[key] as T | undefined
    },
    update(key: string, value: unknown) {
      data[key] = value
      return Promise.resolve()
    },
  }
}

const mark = (over: Partial<MessageBookmark> = {}): MessageBookmark => ({
  connectionId: "c1",
  sessionId: "s1",
  messageId: "m1",
  anchorId: "a1",
  summary: "hello",
  at: 1,
  ...over,
})

describe("MessageBookmarks", () => {
  test("add dedupes the same message and reports whether it was new", () => {
    const store = new MessageBookmarks(memento() as never)
    let changes = 0
    store.onDidChange(() => changes++)
    expect(store.add(mark())).toBe(true)
    expect(store.add(mark({ summary: "other", anchorId: "a2", at: 9 }))).toBe(false)
    expect(store.listFor("c1", "s1")).toEqual([mark()])
    expect(changes).toBe(1)
  })

  test("truncates the summary to 80 characters", () => {
    const store = new MessageBookmarks(memento() as never)
    store.add(mark({ summary: `  ${"x".repeat(100)}  ` }))
    expect(store.listFor("c1", "s1")[0].summary).toBe("x".repeat(80))
  })

  test("lists one session oldest first", () => {
    const store = new MessageBookmarks(memento() as never)
    store.add(mark({ messageId: "late", at: 30 }))
    store.add(mark({ messageId: "early", at: 10 }))
    store.add(mark({ messageId: "mid", at: 20 }))
    expect(store.listFor("c1", "s1").map((b) => b.messageId)).toEqual(["early", "mid", "late"])
  })

  test("filters by connection and session", () => {
    const store = new MessageBookmarks(memento() as never)
    store.add(mark())
    store.add(mark({ connectionId: "c2", messageId: "other-conn" }))
    store.add(mark({ sessionId: "s2", messageId: "other-session" }))
    expect(store.listFor("c1", "s1").map((b) => b.messageId)).toEqual(["m1"])
    expect(store.listFor("c2", "s1").map((b) => b.messageId)).toEqual(["other-conn"])
    expect(store.listFor("c1", "s2").map((b) => b.messageId)).toEqual(["other-session"])
  })

  test("remove drops one bookmark and a missing one is a no-op", () => {
    const mem = memento()
    const store = new MessageBookmarks(mem as never)
    store.add(mark())
    store.add(mark({ messageId: "m2", at: 2 }))
    let changes = 0
    store.onDidChange(() => changes++)
    expect(store.remove("c1", "s1", "missing")).toBe(false)
    expect(changes).toBe(0)
    expect(store.remove("c1", "s1", "m1")).toBe(true)
    expect(store.listFor("c1", "s1").map((b) => b.messageId)).toEqual(["m2"])
    expect(changes).toBe(1)
    const again = new MessageBookmarks(mem as never)
    expect(again.listFor("c1", "s1").map((b) => b.messageId)).toEqual(["m2"])
    expect(mem.data[BOOKMARKS_KEY]).toBeDefined()
  })
})
