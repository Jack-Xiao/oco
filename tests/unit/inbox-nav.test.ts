import { describe, expect, mock, test } from "bun:test"
import type { InboxRow } from "../../apps/extension/src/session-store"

// Mock vscode
let lastQuickPick: any = undefined
let registeredCommands = new Map<string, (...args: any[]) => any>()

mock.module("vscode", () => ({
  QuickPickItemKind: {
    Separator: 1,
    Default: 0,
  },
  ThemeIcon: class {
    constructor(readonly id: string) {}
  },
  EventEmitter: class {
    private listeners = new Set<(arg?: any) => void>()
    event = (listener: (arg?: any) => void) => {
      this.listeners.add(listener)
      return { dispose: () => this.listeners.delete(listener) }
    }
    fire(arg?: any) {
      for (const l of this.listeners) l(arg)
    }
    dispose() {
      this.listeners.clear()
    }
  },
  window: {
    createQuickPick: () => {
      const listeners = {
        accept: [] as (() => void)[],
        button: [] as ((e: any) => void)[],
        hide: [] as (() => void)[],
      }
      const qp = {
        title: "",
        placeholder: "",
        items: [] as any[],
        activeItems: [] as any[],
        selectedItems: [] as any[],
        show: () => {},
        hide: () => {
          for (const fn of listeners.hide) fn()
        },
        dispose: () => {},
        onDidAccept: (fn: () => void) => {
          listeners.accept.push(fn)
          return { dispose: () => {} }
        },
        onDidTriggerItemButton: (fn: (e: any) => void) => {
          listeners.button.push(fn)
          return { dispose: () => {} }
        },
        onDidHide: (fn: () => void) => {
          listeners.hide.push(fn)
          return { dispose: () => {} }
        },
        _triggerAccept: () => {
          for (const fn of listeners.accept) fn()
        },
        _triggerButton: (e: any) => {
          for (const fn of listeners.button) fn(e)
        },
      }
      lastQuickPick = qp
      return qp
    },
    showQuickPick: (items: any[]) => Promise.resolve(items[0]),
    showInformationMessage: () => Promise.resolve(undefined),
    showWarningMessage: () => Promise.resolve(undefined),
  },
  commands: {
    registerCommand: (name: string, fn: (...args: any[]) => any) => {
      registeredCommands.set(name, fn)
      return { dispose: () => registeredCommands.delete(name) }
    },
    executeCommand: (cmd: string, ...args: any[]) => {
      const handler = registeredCommands.get(cmd)
      if (handler) return Promise.resolve(handler(...args))
      return Promise.resolve(undefined)
    },
  },
}))

const {
  buildInboxQuickPickItems,
  showInboxNextQuickPick,
  SessionMruTracker,
  registerInboxNavCommands,
} = await import("../../apps/extension/src/inbox-nav")

describe("inbox-nav", () => {
  test("buildInboxQuickPickItems groups by category and sorts newest first within group", () => {
    const rows: InboxRow[] = [
      { id: "p1", kind: "permission", sessionId: "s1", title: "Perm 1", summary: "read", detail: "read file", time: "1m", at: 100, aria: "" },
      { id: "p2", kind: "permission", sessionId: "s2", title: "Perm 2", summary: "bash", detail: "exec cmd", time: "just now", at: 200, aria: "" },
      { id: "q1", kind: "question", sessionId: "s3", title: "Question 1", summary: "choice", detail: "choice text", time: "5m", at: 50, aria: "" },
      { id: "e1", kind: "error", sessionId: "s4", title: "Err 1", summary: "failed", detail: "fail info", time: "10m", at: 10, aria: "" },
      { id: "d1", kind: "done", sessionId: "s5", title: "Done 1", summary: "finished", detail: "finished task", time: "2m", at: 80, aria: "" },
      { id: "d2", kind: "done", sessionId: "s6", title: "Done 2", summary: "finished", detail: "finished task", time: "1m", at: 90, aria: "" },
    ]

    const items = buildInboxQuickPickItems(rows)

    // Check separators
    const separators = items.filter((i) => i.kind === 1).map((i) => i.label)
    expect(separators).toEqual(["Needs permission", "Needs answer", "Errors", "Done unread"])

    // Permission group: p2 (at: 200) before p1 (at: 100)
    const permItems = items.filter((i) => i.row?.kind === "permission")
    expect(permItems.map((i) => i.row?.id)).toEqual(["p2", "p1"])
    expect(permItems[0].buttons).toHaveLength(2)
    expect(permItems[0].buttons?.[0].tooltip).toBe("Allow once")
    expect(permItems[0].buttons?.[1].tooltip).toBe("Deny")

    // Done group: d2 (at: 90) before d1 (at: 80)
    const doneItems = items.filter((i) => i.row?.kind === "done")
    expect(doneItems.map((i) => i.row?.id)).toEqual(["d2", "d1"])
  })

  test("showInboxNextQuickPick item button only acts on clicked item", async () => {
    const answered: { id: string; reply: string }[] = []
    const client = {
      directory: "/w",
      request: async (_method: string, path: string, body?: any) => {
        const id = path.split("/")[2]
        answered.push({ id, reply: body?.reply })
        return {}
      },
    }

    const rows: InboxRow[] = [
      { id: "perm_A", kind: "permission", sessionId: "s1", title: "Perm A", summary: "read", detail: "read", time: "", at: 10, aria: "" },
      { id: "perm_B", kind: "permission", sessionId: "s2", title: "Perm B", summary: "bash", detail: "bash", time: "", at: 20, aria: "" },
    ]

    const store = {
      inbox: () => rows,
      hasPending: (id: string) => rows.some((r) => r.id === id),
      pendingDirectory: () => "/w",
      removePending: (id: string) => {
        const idx = rows.findIndex((r) => r.id === id)
        if (idx !== -1) rows.splice(idx, 1)
        return true
      },
    } as any

    const deps = {
      store,
      panels: { active: undefined, onDidChangeActiveSession: () => ({ dispose: () => {} }) },
      client: () => client,
    }

    showInboxNextQuickPick(deps)
    expect(lastQuickPick).toBeDefined()

    // Trigger button only for perm_B
    const itemB = lastQuickPick.items.find((i: any) => i.row?.id === "perm_B")
    await lastQuickPick._triggerButton({ item: itemB, button: { tooltip: "Allow once" } })

    expect(answered).toEqual([{ id: "perm_B", reply: "once" }])
    expect(rows.map((r) => r.id)).toEqual(["perm_A"])
  })

  test("Enter on done/error marks read and opens session", async () => {
    const opened: string[] = []
    const readMarked: string[] = []

    const rows: InboxRow[] = [
      { id: "done:s1", kind: "done", sessionId: "s1", title: "Done Session", summary: "ok", detail: "ok", time: "", at: 10, aria: "" },
    ]

    const deps = {
      store: { inbox: () => rows } as any,
      panels: { active: undefined, onDidChangeActiveSession: () => ({ dispose: () => {} }) },
      openSession: async (id: string) => {
        opened.push(id)
      },
      markRead: (id: string) => {
        readMarked.push(id)
      },
    }

    showInboxNextQuickPick(deps)
    const doneItem = lastQuickPick.items.find((i: any) => i.row?.id === "done:s1")
    lastQuickPick.selectedItems = [doneItem]
    await lastQuickPick._triggerAccept()

    expect(readMarked).toEqual(["s1"])
    expect(opened).toEqual(["s1"])
  })

  test("SessionMruTracker maintains MRU order capped at 20, recent QuickPick selects second item", () => {
    let fireEvent: any
    const fakePanels = {
      active: { binding: { sessionId: "s1", draft: false } },
      onDidChangeActiveSession: (fn: any) => {
        fireEvent = fn
        return { dispose: () => {} }
      },
    }

    const mru = new SessionMruTracker(fakePanels)
    expect(mru.list()).toEqual(["s1"])

    fireEvent({ sessionId: "s2", draft: false })
    fireEvent({ sessionId: "s3", draft: false })
    expect(mru.list()).toEqual(["s3", "s2", "s1"])

    // Touch existing moves to front
    fireEvent({ sessionId: "s1", draft: false })
    expect(mru.list()).toEqual(["s1", "s3", "s2"])

    // Cap at 20
    for (let i = 4; i <= 25; i++) {
      fireEvent({ sessionId: `s${i}`, draft: false })
    }
    expect(mru.list()).toHaveLength(20)
    expect(mru.list()[0]).toBe("s25")

    // Test oco.session.recent selection
    const opened: string[] = []
    const deps = {
      store: {
        sessionStates: () => [
          { id: "s1", title: "Session 1" },
          { id: "s2", title: "Session 2" },
          { id: "s3", title: "Session 3" },
        ],
      } as any,
      panels: fakePanels as any,
      openSession: async (id: string) => {
        opened.push(id)
      },
    }

    const tracker = new SessionMruTracker({
      active: undefined,
      onDidChangeActiveSession: () => ({ dispose: () => {} }),
    })
    tracker.touch("s1")
    tracker.touch("s2") // s2 is first, s1 is second

    registerInboxNavCommands(deps, tracker)
    const recentCmd = registeredCommands.get("oco.session.recent")!
    recentCmd()

    // Expect activeItems to be default selected to second item [items[1]] (s1)
    expect(lastQuickPick.activeItems[0].sessionId).toBe("s1")
  })

  test("oco.session.parent, child, siblings navigation", async () => {
    const opened: string[] = []
    const states = [
      { id: "root", title: "Root", parentID: undefined },
      { id: "child1", title: "Child 1", parentID: "root" },
      { id: "child2", title: "Child 2", parentID: "root" },
    ]

    const deps = {
      store: {
        sessionStates: () => states,
      } as any,
      panels: {
        active: { binding: { sessionId: "child1" } },
        onDidChangeActiveSession: () => ({ dispose: () => {} }),
      } as any,
      openSession: async (id: string) => {
        opened.push(id)
        if (deps.panels.active?.binding) {
          deps.panels.active.binding.sessionId = id
        }
      },
    }

    const tracker = new SessionMruTracker({ active: undefined, onDidChangeActiveSession: () => ({ dispose: () => {} }) })
    registerInboxNavCommands(deps, tracker)

    // Parent
    await registeredCommands.get("oco.session.parent")!()
    expect(opened).toEqual(["root"])

    // Child of root
    deps.panels.active = { binding: { sessionId: "root" } } as any
    await registeredCommands.get("oco.session.child")!()
    // When multiple children, shows QuickPick and selects first
    expect(opened).toEqual(["root", "child1"])

    // Siblings
    deps.panels.active = { binding: { sessionId: "child1" } } as any
    await registeredCommands.get("oco.session.nextSibling")!()
    expect(opened).toEqual(["root", "child1", "child2"])

    await registeredCommands.get("oco.session.previousSibling")!()
    expect(opened).toEqual(["root", "child1", "child2", "child1"])
  })
})
