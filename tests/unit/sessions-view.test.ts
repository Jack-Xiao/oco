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
    showErrorMessage: (msg: string) => {
      showErrorMessageCalls.push(msg)
      return Promise.resolve(undefined)
    },
  },
  commands: {
    executeCommand: (cmd: string, ...args: any[]) => {
      executeCommandCalls.push({ cmd, args })
      return Promise.resolve(undefined)
    },
  },
  workspace: {
    isTrusted: true,
    getConfiguration: () => ({
      get: (_key: string, fallback?: unknown) => fallback,
    }),
  },
  Uri: {
    joinPath: (...parts: any[]) => ({
      fsPath: parts.map(String).join("/"),
      toString: () => parts.map(String).join("/"),
    }),
  },
}))

let showErrorMessageCalls: string[] = []
let executeCommandCalls: Array<{ cmd: string; args: any[] }> = []

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

if (typeof (globalThis as any).document === "undefined") {
  const fakeEl = () => {
    const el: any = {
      append() {},
      appendChild() {},
      removeChild() {},
      insertBefore() {},
      setAttribute() {},
      removeAttribute() {},
      getAttribute: () => null,
      addEventListener() {},
      querySelectorAll: () => [],
      querySelector: () => null,
      dataset: {},
      classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
      children: [],
      style: {},
    }
    return el
  }
  ;(globalThis as any).document = {
    createElement: fakeEl,
    getElementById: () => null,
    activeElement: null,
    body: fakeEl(),
  }
}
if (typeof (globalThis as any).window === "undefined") {
  ;(globalThis as any).window = { addEventListener() {} }
}

const { SessionsWebview } = await import("../../apps/extension/src/sessions-webview")
const {
  buildStepAnswer,
  collectAnswers,
  getQuestions,
  computeRangeSelection,
  getSelectionBarText,
  getTodoBadgeText,
  getTodoBadgeTitle,
  getTodoStatusIcon,
} = await import("../../apps/extension/media/sessions-list/index.js")

describe("M11: webModel questions passthrough", () => {
  test("preserves questions field on question rows", () => {
    const store = new SessionStore(() => true)
    const questionsData = [
      {
        question: "Select deployment target",
        header: "Deployment",
        options: [{ label: "Staging" }, { label: "Production", description: "Live environment" }],
        multiple: false,
        custom: true,
      },
      {
        question: "Select additional features",
        options: [{ label: "Feature A" }, { label: "Feature B" }],
        multiple: true,
      },
    ]

    store.applySnapshot({
      sessions: [
        {
          id: "s-test",
          title: "Deploy app",
          directory: "/work",
          time: { updated: 1_700_000_000_000 },
        },
      ],
      status: { "s-test": { type: "idle" } },
      permissions: [],
      questions: [
        {
          id: "req-q1",
          sessionID: "s-test",
          questions: questionsData,
        },
      ],
    })

    const view = new SessionsView(store)
    const connected: ConnectionSummary = {
      connectionId: "c1",
      label: "local",
      directory: "/work",
      state: "connected",
      attempt: 0,
      trusted: true,
    }
    view.setConnection(connected)

    const model = view.webModel()
    expect(model.inbox.length).toBe(1)
    const row = model.inbox[0]
    expect(row.kind).toBe("question")
    if (row.kind === "question") {
      expect(row.questions).toBeDefined()
      expect(row.questions).toEqual(questionsData)
    }

    view.dispose()
  })
})

describe("M11: SessionsWebview questionReply handling", () => {
  test("questionReply with expired request (hasPending=false) does not call client and refreshes", async () => {
    const store = new SessionStore(() => true)
    const view = new SessionsView(store)
    let refreshCalled = false
    view.refresh = () => {
      refreshCalled = true
    }

    let requestCalled = false
    const client = {
      request: async () => {
        requestCalled = true
        return {}
      },
      directory: "/work",
    }

    let messageHandler: ((m: any) => void) | undefined
    const mockWebview = {
      options: {},
      html: "",
      onDidReceiveMessage: (cb: any) => {
        messageHandler = cb
        return { dispose() {} }
      },
      asWebviewUri: (u: any) => u,
      postMessage: async () => true,
      cspSource: "",
    }
    const mockView: any = {
      webview: mockWebview,
      onDidChangeVisibility: () => ({ dispose() {} }),
      onDidDispose: () => ({ dispose() {} }),
      visible: true,
    }

    const extensionUri: any = { fsPath: "/ext", toString: () => "/ext" }
    const webview = new SessionsWebview(view, extensionUri, () => {}, client)
    webview.resolveWebviewView(mockView)

    expect(messageHandler).toBeDefined()

    // Send questionReply for a request that is NOT in store.hasPending
    messageHandler!({
      type: "questionReply",
      id: "req-expired",
      answers: [["Option A"]],
    })

    expect(requestCalled).toBe(false)
    expect(refreshCalled).toBe(true)

    webview.dispose()
    view.dispose()
  })

  test("questionReply with active request calls client.request, removes pending, and refreshes", async () => {
    const store = new SessionStore(() => true)
    store.applySnapshot({
      sessions: [
        {
          id: "s-1",
          title: "Session 1",
          directory: "/work",
          time: { updated: 1_700_000_000_000 },
        },
      ],
      status: { "s-1": { type: "idle" } },
      permissions: [],
      questions: [
        {
          id: "req-valid",
          sessionID: "s-1",
          questions: [{ question: "Pick one", options: [{ label: "A" }] }],
        },
      ],
    })

    expect(store.hasPending("req-valid")).toBe(true)

    const view = new SessionsView(store)
    let refreshCalled = false
    view.refresh = () => {
      refreshCalled = true
    }

    const requestedCalls: Array<{ method: string; path: string; body: any }> = []
    const client = {
      request: async <T>(method: string, path: string, body?: unknown) => {
        requestedCalls.push({ method, path, body })
        return {} as T
      },
      directory: "/work",
    }

    let messageHandler: ((m: any) => void) | undefined
    const mockWebview = {
      options: {},
      html: "",
      onDidReceiveMessage: (cb: any) => {
        messageHandler = cb
        return { dispose() {} }
      },
      asWebviewUri: (u: any) => u,
      postMessage: async () => true,
      cspSource: "",
    }
    const mockView: any = {
      webview: mockWebview,
      onDidChangeVisibility: () => ({ dispose() {} }),
      onDidDispose: () => ({ dispose() {} }),
      visible: true,
    }

    const extensionUri: any = { fsPath: "/ext", toString: () => "/ext" }
    const webview = new SessionsWebview(view, extensionUri, () => {}, client)
    webview.resolveWebviewView(mockView)

    // Send valid questionReply
    messageHandler!({
      type: "questionReply",
      id: "req-valid",
      answers: [["A"]],
    })

    // Wait microtasks for async handler
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()

    expect(requestedCalls.length).toBe(1)
    expect(requestedCalls[0].method).toBe("POST")
    expect(requestedCalls[0].path).toBe("/question/req-valid/reply?directory=%2Fwork")
    expect(requestedCalls[0].body).toEqual({ answers: [["A"]] })

    // store pending request should be removed
    expect(store.hasPending("req-valid")).toBe(false)
    expect(refreshCalled).toBe(true)

    webview.dispose()
    view.dispose()
  })

  test("questionReply error shows error message and refreshes", async () => {
    showErrorMessageCalls = []
    const store = new SessionStore(() => true)
    store.applySnapshot({
      sessions: [
        {
          id: "s-2",
          title: "Session 2",
          directory: "/work",
          time: { updated: 1_700_000_000_000 },
        },
      ],
      status: { "s-2": { type: "idle" } },
      permissions: [],
      questions: [
        {
          id: "req-fail",
          sessionID: "s-2",
          questions: [{ question: "Pick one" }],
        },
      ],
    })

    const view = new SessionsView(store)
    let refreshCount = 0
    view.refresh = () => {
      refreshCount++
    }

    const client = {
      request: async () => {
        throw new Error("Network timeout")
      },
      directory: "/work",
    }

    let messageHandler: ((m: any) => void) | undefined
    const mockWebview = {
      options: {},
      html: "",
      onDidReceiveMessage: (cb: any) => {
        messageHandler = cb
        return { dispose() {} }
      },
      asWebviewUri: (u: any) => u,
      postMessage: async () => true,
      cspSource: "",
    }
    const mockView: any = {
      webview: mockWebview,
      onDidChangeVisibility: () => ({ dispose() {} }),
      onDidDispose: () => ({ dispose() {} }),
      visible: true,
    }

    const extensionUri: any = { fsPath: "/ext", toString: () => "/ext" }
    const webview = new SessionsWebview(view, extensionUri, () => {}, client)
    webview.resolveWebviewView(mockView)

    messageHandler!({
      type: "questionReply",
      id: "req-fail",
      answers: [["Custom answer"]],
    })

    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()

    expect(showErrorMessageCalls.some((msg) => msg.includes("Network timeout"))).toBe(true)
    expect(refreshCount).toBeGreaterThanOrEqual(1)

    webview.dispose()
    view.dispose()
  })
})

describe("M11: answers shape logic", () => {
  test("single-choice answers shape", () => {
    const q = {
      question: "Which color?",
      options: [{ label: "Red" }, { label: "Blue" }],
      multiple: false,
    }
    const answer = buildStepAnswer(q, ["Blue"], "")
    expect(answer).toEqual(["Blue"])

    const fullAnswers = collectAnswers([q], [{ selected: ["Blue"] }])
    expect(fullAnswers).toEqual([["Blue"]])
  })

  test("multiple-choice answers shape", () => {
    const q = {
      question: "Which environments?",
      options: [{ label: "Staging" }, { label: "Production" }, { label: "Dev" }],
      multiple: true,
    }
    const answer = buildStepAnswer(q, ["Staging", "Dev"], "")
    expect(answer).toEqual(["Staging", "Dev"])

    const fullAnswers = collectAnswers([q], [{ selected: ["Staging", "Dev"] }])
    expect(fullAnswers).toEqual([["Staging", "Dev"]])
  })

  test("custom text answers shape", () => {
    const q = {
      question: "Provide explanation",
      custom: true,
    }
    const answer = buildStepAnswer(q, [], "Requires manual verification")
    expect(answer).toEqual(["Requires manual verification"])

    const fullAnswers = collectAnswers([q], [{ custom: "Requires manual verification" }])
    expect(fullAnswers).toEqual([["Requires manual verification"]])
  })

  test("multiple-choice with custom answers shape", () => {
    const q = {
      question: "Select items",
      options: [{ label: "Item 1" }, { label: "Item 2" }],
      multiple: true,
      custom: true,
    }
    const answer = buildStepAnswer(q, ["Item 1"], "Custom item")
    expect(answer).toEqual(["Item 1", "Custom item"])

    const fullAnswers = collectAnswers([q], [{ selected: ["Item 1"], custom: "Custom item" }])
    expect(fullAnswers).toEqual([["Item 1", "Custom item"]])
  })

  test("multi-question sequence answers shape", () => {
    const questions = [
      {
        question: "Color?",
        options: [{ label: "Red" }, { label: "Blue" }],
        multiple: false,
      },
      {
        question: "Tags?",
        options: [{ label: "Tag1" }, { label: "Tag2" }],
        multiple: true,
      },
      {
        question: "Comment?",
        custom: true,
      },
    ]
    const fullAnswers = collectAnswers(questions, [
      { selected: ["Red"] },
      { selected: ["Tag1", "Tag2"] },
      { custom: "Looks good" },
    ])
    expect(fullAnswers).toEqual([["Red"], ["Tag1", "Tag2"], ["Looks good"]])
  })

  test("getQuestions fallback when row has no questions", () => {
    const fallback = getQuestions({ summary: "Default prompt" })
    expect(fallback).toEqual([{ question: "Default prompt", custom: true }])
  })
})

describe("M14: SessionsView Pin and markUnread", () => {
  const PINNED_KEY = "oco.pinnedSessions"

  test("setPinned updates pinned state, writes to memento, and triggers refresh", () => {
    const store = new SessionStore(() => true)
    const memento = new MemoryMemento({ [PINNED_KEY]: ["s-init"] })
    const view = new SessionsView(store, memento)
    let refreshCount = 0
    view.refresh = () => {
      refreshCount++
    }

    expect(view.isPinned("s-init")).toBe(true)
    expect(view.isPinned("s-new")).toBe(false)

    // Pin a new session
    view.setPinned("s-new", true)
    expect(view.isPinned("s-new")).toBe(true)
    expect(memento.get<string[]>(PINNED_KEY)).toEqual(["s-init", "s-new"])
    expect(refreshCount).toBe(1)

    // Unpin s-init
    view.setPinned("s-init", false)
    expect(view.isPinned("s-init")).toBe(false)
    expect(memento.get<string[]>(PINNED_KEY)).toEqual(["s-new"])
    expect(refreshCount).toBe(2)

    // togglePin
    view.togglePin("s-new")
    expect(view.isPinned("s-new")).toBe(false)
    view.togglePin("s-new")
    expect(view.isPinned("s-new")).toBe(true)

    view.dispose()
  })

  test("webModel groups pinned sessions and sorts them by updated desc; flat in search", () => {
    const store = new SessionStore(() => true)
    const now = Date.now()
    store.applySnapshot({
      sessions: [
        { id: "s-1", title: "Session 1", directory: "/work", time: { updated: now - 3000 } },
        { id: "s-2", title: "Session 2", directory: "/work", time: { updated: now - 1000 } },
        { id: "s-3", title: "Session 3", directory: "/work", time: { updated: now - 2000 } },
      ],
      status: {
        "s-1": { type: "idle" },
        "s-2": { type: "idle" },
        "s-3": { type: "idle" },
      },
      permissions: [],
      questions: [],
    })

    const memento = new MemoryMemento({ [PINNED_KEY]: ["s-1", "s-2"] })
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

    const model = view.webModel()
    // Pinned should have s-2 (updated: 3000) then s-1 (updated: 1000)
    expect(model.pinned.map((r) => r.id)).toEqual(["s-2", "s-1"])
    expect(model.pinned[0].pinned).toBe(true)
    expect(model.pinned[1].pinned).toBe(true)
    // Non-pinned s-3 should be in recent
    expect(model.recent.map((r) => r.id)).toEqual(["s-3"])
    expect(model.recent[0].pinned).toBe(false)

    // Search mode: flat in recent, pinned group is empty, each row keeps pinned flag
    view.setSearch("Session")
    const searchModel = view.webModel()
    expect(searchModel.pinned).toEqual([])
    expect(searchModel.recent.map((r) => r.id)).toContain("s-1")
    expect(searchModel.recent.map((r) => r.id)).toContain("s-2")
    expect(searchModel.recent.map((r) => r.id)).toContain("s-3")
    const s1Row = searchModel.recent.find((r) => r.id === "s-1")
    expect(s1Row?.pinned).toBe(true)
    const s3Row = searchModel.recent.find((r) => r.id === "s-3")
    expect(s3Row?.pinned).toBe(false)

    view.dispose()
  })

  test("markUnread marks ids as unread, writes to memento, and triggers refresh", () => {
    const store = new SessionStore(() => true)
    const memento = new MemoryMemento()
    const view = new SessionsView(store, memento)
    let refreshCalled = false
    view.refresh = () => {
      refreshCalled = true
    }

    view.markUnread(["s-a", "s-b"])
    expect(memento.get<string[]>(UNREAD_KEY)).toEqual(["s-a", "s-b"])
    expect(refreshCalled).toBe(true)

    view.dispose()
  })
})

describe("M02: SessionsView Todo passthrough & probe", () => {
  test("webModel passes through todo progress to WebRow", () => {
    const store = new SessionStore(() => true)
    const todoData = {
      done: 2,
      total: 3,
      items: [
        { content: "Step 1", status: "completed" as const },
        { content: "Step 2", status: "completed" as const },
        { content: "Step 3", status: "in_progress" as const },
      ],
    }

    store.applySnapshot({
      sessions: [
        {
          id: "s-todo",
          title: "Session with todo",
          directory: "/work",
          time: { updated: Date.now() },
        },
      ],
      status: { "s-todo": { type: "idle" } },
      permissions: [],
      questions: [],
    })
    store.setTodo("s-todo", [
      { id: "t1", content: "Step 1", status: "completed" },
      { id: "t2", content: "Step 2", status: "completed" },
      { id: "t3", content: "Step 3", status: "in_progress" },
    ])

    const view = new SessionsView(store)
    view.setConnection({
      connectionId: "c1",
      label: "local",
      directory: "/work",
      state: "connected",
      attempt: 0,
      trusted: true,
    })

    const model = view.webModel()
    expect(model.recent.length).toBe(1)
    expect(model.recent[0].todo).toEqual(todoData)

    view.dispose()
  })

  test("setTodoProbe is called for visible session rows on webModel", () => {
    const store = new SessionStore(() => true)
    store.applySnapshot({
      sessions: [
        { id: "s-pinned", title: "Pinned session", directory: "/work", time: { updated: 1000 } },
        { id: "s-recent", title: "Recent session", directory: "/work", time: { updated: 1000 } },
        { id: "s-old", title: "Old session", directory: "/work", time: { updated: 10 } },
      ],
      status: {
        "s-pinned": { type: "idle" },
        "s-recent": { type: "busy" },
        "s-old": { type: "idle" },
      },
      permissions: [],
      questions: [],
    })

    const memento = new MemoryMemento({ ["oco.pinnedSessions"]: ["s-pinned"] })
    const view = new SessionsView(store, memento)
    view.setConnection({
      connectionId: "c1",
      label: "local",
      directory: "/work",
      state: "connected",
      attempt: 0,
      trusted: true,
    })

    const probed: string[] = []
    view.setTodoProbe((id) => probed.push(id))

    view.webModel()
    // When more is closed, s-old is not probed; s-pinned and s-recent are probed
    expect(probed).toContain("s-pinned")
    expect(probed).toContain("s-recent")
    expect(probed).not.toContain("s-old")

    // When more is open, s-old is also probed
    probed.length = 0
    view.setMoreOpen(true)
    view.webModel()
    expect(probed).toContain("s-pinned")
    expect(probed).toContain("s-recent")
    expect(probed).toContain("s-old")

    view.dispose()
  })
})

describe("M14: SessionsWebview FromPage message handling", () => {
  test("handles pin, markUnread, and batch messages", async () => {
    executeCommandCalls = []
    const store = new SessionStore(() => true)
    const view = new SessionsView(store)
    let pinnedArg: { id: string; pinned: boolean } | undefined
    let markedArg: string[] | undefined

    view.setPinned = (id: string, pinned: boolean) => {
      pinnedArg = { id, pinned }
    }
    view.markUnread = (ids: string[]) => {
      markedArg = ids
    }

    let messageHandler: ((m: any) => void) | undefined
    const mockWebview = {
      options: {},
      html: "",
      onDidReceiveMessage: (cb: any) => {
        messageHandler = cb
        return { dispose() {} }
      },
      asWebviewUri: (u: any) => u,
      postMessage: async () => true,
      cspSource: "",
    }
    const mockView: any = {
      webview: mockWebview,
      onDidChangeVisibility: () => ({ dispose() {} }),
      onDidDispose: () => ({ dispose() {} }),
      visible: true,
    }

    const extensionUri: any = { fsPath: "/ext", toString: () => "/ext" }
    const webview = new SessionsWebview(view, extensionUri, () => {})
    webview.resolveWebviewView(mockView)

    expect(messageHandler).toBeDefined()

    // 1. pin message
    messageHandler!({ type: "pin", id: "sess-1", pinned: true })
    expect(pinnedArg).toEqual({ id: "sess-1", pinned: true })

    // 2. markUnread message
    messageHandler!({ type: "markUnread", ids: ["sess-1", "sess-2"] })
    expect(markedArg).toEqual(["sess-1", "sess-2"])

    // 3. batch archive message
    messageHandler!({ type: "batch", action: "archive", ids: ["sess-1", "sess-2"] })
    expect(executeCommandCalls.some((c) => c.cmd === "oco.archiveSession" && c.args[0]?.sessionId === "sess-1" && c.args[0]?.selection?.length === 2)).toBe(true)

    // 4. batch delete message
    messageHandler!({ type: "batch", action: "delete", ids: ["sess-3"] })
    expect(executeCommandCalls.some((c) => c.cmd === "oco.deleteSession" && c.args[0]?.sessionId === "sess-3" && c.args[0]?.selection?.length === 1)).toBe(true)

    webview.dispose()
    view.dispose()
  })
})

describe("M14: Pure functions (multi-select, selection bar, todo badge)", () => {
  test("computeRangeSelection returns correct slice in forward and backward directions", () => {
    const list = ["s1", "s2", "s3", "s4", "s5"]
    expect(computeRangeSelection(list, "s1", "s3")).toEqual(["s1", "s2", "s3"])
    expect(computeRangeSelection(list, "s4", "s2")).toEqual(["s2", "s3", "s4"])
    expect(computeRangeSelection(list, "s3", "s3")).toEqual(["s3"])
    expect(computeRangeSelection(list, null, "s4")).toEqual(["s4"])
    expect(computeRangeSelection(list, "unknown", "s2")).toEqual(["s2"])
    expect(computeRangeSelection(list, "s1", "missing")).toEqual([])
    expect(computeRangeSelection([], "s1", "s2")).toEqual([])
  })

  test("getSelectionBarText formats selection count", () => {
    expect(getSelectionBarText(1)).toBe("1 selected")
    expect(getSelectionBarText(4)).toBe("4 selected")
  })

  test("getTodoBadgeText and getTodoBadgeTitle format todo progress", () => {
    expect(getTodoBadgeText({ done: 3, total: 7 })).toBe("3/7")
    expect(getTodoBadgeTitle({ done: 3, total: 7 })).toBe("3 of 7 steps")
    expect(getTodoBadgeText(undefined as any)).toBe("")
    expect(getTodoBadgeTitle(null as any)).toBe("")
  })

  test("getTodoStatusIcon returns correct status prefix symbols", () => {
    expect(getTodoStatusIcon("completed")).toBe("✓")
    expect(getTodoStatusIcon("in_progress")).toBe("▸")
    expect(getTodoStatusIcon("pending")).toBe("○")
    expect(getTodoStatusIcon("cancelled")).toBe("✕")
    expect(getTodoStatusIcon("unknown")).toBe("○")
  })

  test("M13: setNoteCounter populates notes count in WebRow only when greater than 0", () => {
    const store = new SessionStore(() => true)
    store.applySnapshot({
      sessions: [
        { id: "s-1", title: "Session 1", directory: "/work", time: { updated: Date.now() } },
        { id: "s-2", title: "Session 2", directory: "/work", time: { updated: Date.now() } },
      ],
      status: { "s-1": { type: "idle" }, "s-2": { type: "idle" } },
      permissions: [],
      questions: [],
    })
    const view = new SessionsView(store)
    view.setConnection({
      connectionId: "c1",
      label: "local",
      directory: "/work",
      state: "connected",
      attempt: 0,
      trusted: true,
    })
    view.setNoteCounter((id) => (id === "s-1" ? 3 : 0))
    const model = view.webModel()
    const r1 = model.recent.find((r) => r.id === "s-1")
    const r2 = model.recent.find((r) => r.id === "s-2")
    expect(r1?.notes).toBe(3)
    expect(r2?.notes).toBeUndefined()
  })
})
