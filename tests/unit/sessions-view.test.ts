// SessionsView & PendingNotifier unit tests
import { describe, expect, mock, test } from "bun:test"
import {
  PendingNotifier,
  type PendingNotificationItem,
} from "../../apps/extension/src/session-groups"
import { SessionStore } from "../../apps/extension/src/session-store"
import type { ConnectionSummary } from "@oco/contracts"

mock.module("vscode", () => ({
  EventEmitter: class {
    private listeners = new Set<() => void>()
    event = (listener: () => void) => {
      this.listeners.add(listener)
      return { dispose: () => this.listeners.delete(listener) }
    }
    fire() {
      for (const listener of this.listeners) listener()
    }
    dispose() {
      this.listeners.clear()
    }
  },
  StatusBarAlignment: { Left: 1, Right: 2 },
  ThemeColor: class {
    constructor(public id: string) {}
  },
  window: {
    createStatusBarItem() {
      return {
        name: "",
        text: "",
        tooltip: "" as string | undefined,
        command: undefined as string | undefined,
        backgroundColor: undefined as unknown,
        show() {},
        dispose() {},
      }
    },
    showWarningMessage: () => Promise.resolve(undefined),
  },
  commands: {
    executeCommand: () => Promise.resolve(undefined),
  },
  workspace: {
    isTrusted: true,
    getConfiguration: () => ({
      get: (_key: string, fallback?: unknown) => fallback,
    }),
  },
}))

const { SessionsView } = await import("../../apps/extension/src/sessions-view")

const UNREAD_KEY = "oco.unreadSessions"

class MemoryMemento {
  readonly updates: { key: string; value: unknown }[] = []
  constructor(private data: Record<string, unknown> = {}) {}
  get<T>(key: string): T | undefined {
    return this.data[key] as T | undefined
  }
  update(key: string, value: unknown): Thenable<void> {
    this.data[key] = value
    this.updates.push({ key, value })
    return Promise.resolve()
  }
  keys(): readonly string[] {
    return Object.keys(this.data)
  }
}

function doneSessionIds(inbox: { kind: string; sessionId?: string; rows?: { kind: string; sessionId: string }[] }[]): string[] {
  const ids: string[] = []
  for (const entry of inbox) {
    if (entry.kind === "group") {
      for (const row of entry.rows ?? []) if (row.kind === "done") ids.push(row.sessionId)
    } else if (entry.kind === "done" && entry.sessionId) ids.push(entry.sessionId)
  }
  return ids
}

describe("PendingNotifier throttling and rules", () => {
  test("triggers notification when new non-current pending request appears", async () => {
    let notifiedCount = 0
    let focusCalled = false
    let enabled = true
    let resolveNotification: ((choice: "Show" | undefined) => void) | undefined

    const notifier = new PendingNotifier({
      notify: (count) => {
        notifiedCount = count
        return new Promise<"Show" | undefined>((resolve) => {
          resolveNotification = resolve
        })
      },
      focus: () => {
        focusCalled = true
      },
      isEnabled: () => enabled,
    })

    const items: PendingNotificationItem[] = [
      { id: "req-1", sessionId: "sess-1", rootSessionId: "sess-1" },
    ]

    // 1. New request on non-current session -> triggers
    const res1 = notifier.check(items, "current-sess")
    expect(res1).toBe(true)
    expect(notifiedCount).toBe(1)

    // 2. Not closed yet (resolving pending) -> does not stack
    const items2: PendingNotificationItem[] = [
      ...items,
      { id: "req-2", sessionId: "sess-2", rootSessionId: "sess-2" },
    ]
    const res2 = notifier.check(items2, "current-sess")
    expect(res2).toBe(false) // blocked by notifying=true

    // Resolve previous notification with "Show"
    resolveNotification?.("Show")
    await Promise.resolve()
    await Promise.resolve()
    expect(focusCalled).toBe(true)
  })

  test("does not trigger when all new requests belong to current session or its root", () => {
    let notified = false
    const notifier = new PendingNotifier({
      notify: async () => {
        notified = true
        return undefined
      },
      focus: () => {},
      isEnabled: () => true,
    })

    // Request on current session directly
    const items1: PendingNotificationItem[] = [
      { id: "req-c1", sessionId: "current-sess", rootSessionId: "current-sess" },
    ]
    expect(notifier.check(items1, "current-sess")).toBe(false)
    expect(notified).toBe(false)

    // Request on child of current session (rootSessionId === current-sess)
    const items2: PendingNotificationItem[] = [
      { id: "req-c2", sessionId: "child-sess", rootSessionId: "current-sess" },
    ]
    expect(notifier.check(items2, "current-sess")).toBe(false)
    expect(notified).toBe(false)
  })

  test("does not trigger if setting oco.sessions.notifyPending is false", () => {
    let notified = false
    const notifier = new PendingNotifier({
      notify: async () => {
        notified = true
        return undefined
      },
      focus: () => {},
      isEnabled: () => false,
    })

    const items: PendingNotificationItem[] = [
      { id: "req-other", sessionId: "other-sess", rootSessionId: "other-sess" },
    ]
    expect(notifier.check(items, "current-sess")).toBe(false)
    expect(notified).toBe(false)
  })

  test("only triggers on newly seen request IDs (no duplicate popups for same requests)", async () => {
    let callCount = 0
    const notifier = new PendingNotifier({
      notify: async () => {
        callCount++
        return undefined
      },
      focus: () => {},
      isEnabled: () => true,
    })

    const items: PendingNotificationItem[] = [
      { id: "req-10", sessionId: "sess-10", rootSessionId: "sess-10" },
    ]

    expect(notifier.check(items, "current-sess")).toBe(true)
    expect(callCount).toBe(1)
    await Promise.resolve()
    await Promise.resolve()

    // Second check with the exact same items -> no new members
    expect(notifier.check(items, "current-sess")).toBe(false)
    expect(callCount).toBe(1)

    // Third check adding a new request -> triggers
    const itemsWithNew: PendingNotificationItem[] = [
      ...items,
      { id: "req-11", sessionId: "sess-11", rootSessionId: "sess-11" },
    ]
    expect(notifier.check(itemsWithNew, "current-sess")).toBe(true)
    expect(callCount).toBe(2)
  })
})

describe("SessionsView markRead", () => {
  test("clears an unread idle session, writes the memento, and drops its done row", () => {
    const store = new SessionStore(() => true)
    store.applySnapshot({
      sessions: [{ id: "s-done", title: "Finished task", directory: "/work", time: { updated: 1_700_000_000_000 } }],
      status: { "s-done": { type: "idle" } },
      permissions: [],
      questions: [],
    })
    const memento = new MemoryMemento({ [UNREAD_KEY]: ["s-done"] })
    const view = new SessionsView(store, memento)
    const connected: ConnectionSummary = {
      connectionId: "c1",
      label: "local",
      directory: "/work",
      state: "connected",
      attempt: 0,
      trusted: true,
    }
    view.setConnection(connected)

    expect(doneSessionIds(view.webModel().inbox)).toEqual(["s-done"])

    expect(view.markRead("s-done")).toBe(true)
    expect(memento.get<string[]>(UNREAD_KEY)).toEqual([])
    expect(memento.updates).toEqual([{ key: UNREAD_KEY, value: [] }])
    expect(doneSessionIds(view.webModel().inbox)).toEqual([])

    expect(view.markRead("s-done")).toBe(false)
    expect(memento.updates).toEqual([{ key: UNREAD_KEY, value: [] }])

    view.dispose()
  })
})
