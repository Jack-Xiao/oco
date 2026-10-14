import { describe, expect, mock, test } from "bun:test"

// Mock vscode module for bun test environment
mock.module("vscode", () => ({
  commands: {
    registerCommand: (id: string, handler: (...args: any[]) => any) => {
      commandsRegistry.set(id, handler)
      return {
        dispose: () => {
          commandsRegistry.delete(id)
        },
      }
    },
    executeCommand: () => Promise.resolve(undefined),
  },
}))

const commandsRegistry = new Map<string, (...args: any[]) => any>()

const {
  isSessionRunning,
  parseSessionIds,
  planStop,
  stopSessions,
  registerStopSessions,
  rootIds,
} = await import("../../apps/extension/src/stop-sessions")

describe("isSessionRunning", () => {
  test("returns true for busy and retry (case-insensitive and trimmed)", () => {
    expect(isSessionRunning("busy")).toBe(true)
    expect(isSessionRunning("BUSY")).toBe(true)
    expect(isSessionRunning(" retry ")).toBe(true)
    expect(isSessionRunning("Retry")).toBe(true)
  })

  test("returns false for idle, undefined, or other states", () => {
    expect(isSessionRunning("idle")).toBe(false)
    expect(isSessionRunning(undefined)).toBe(false)
    expect(isSessionRunning("")).toBe(false)
    expect(isSessionRunning("done")).toBe(false)
    expect(isSessionRunning("waiting")).toBe(false)
  })
})

describe("parseSessionIds", () => {
  test("parses string id", () => {
    expect(parseSessionIds("s-123")).toEqual(["s-123"])
    expect(parseSessionIds("")).toEqual([])
    expect(parseSessionIds("  ")).toEqual([])
  })

  test("parses selection array", () => {
    expect(parseSessionIds({ selection: ["s1", "s2"] })).toEqual(["s1", "s2"])
    expect(parseSessionIds({ sessionId: "s1", selection: ["s2", "s3"] })).toEqual(["s2", "s3"])
  })

  test("parses object with sessionId or id", () => {
    expect(parseSessionIds({ sessionId: "s-abc" })).toEqual(["s-abc"])
    expect(parseSessionIds({ id: "s-def" })).toEqual(["s-def"])
  })

  test("returns empty array for invalid inputs", () => {
    expect(parseSessionIds(null)).toEqual([])
    expect(parseSessionIds(undefined)).toEqual([])
    expect(parseSessionIds(123)).toEqual([])
    expect(parseSessionIds({})).toEqual([])
  })
})

describe("planStop", () => {
  test("skips non-running targets and keeps running ones", () => {
    const sessions = [
      { id: "s1", status: "busy", title: "Session 1" },
      { id: "s2", status: "idle", title: "Session 2" },
      { id: "s3", status: "retry", title: "Session 3" },
    ]
    const plan = planStop(["s1", "s2", "s3", "s-missing"], sessions)

    expect(plan.stop.map((s) => s.id)).toEqual(["s1", "s3"])
    expect(plan.skipped.map((s) => s.id)).toEqual(["s2", "s-missing"])
    expect(plan.cascade).toEqual([])
  })

  test("finds multi-level running descendants (subagents)", () => {
    const sessions = [
      { id: "root", status: "busy", title: "Root" },
      { id: "child1", parentID: "root", status: "idle", title: "Child 1 (idle)" },
      { id: "grandchild1", parentID: "child1", status: "busy", title: "Grandchild 1 (busy)" },
      { id: "greatgrandchild", parentID: "grandchild1", status: "retry", title: "Great Grandchild (retry)" },
      { id: "child2", parentID: "root", status: "busy", title: "Child 2 (busy)" },
      { id: "unrelated", status: "busy", title: "Unrelated" },
    ]

    const plan = planStop(["root"], sessions)

    expect(plan.stop.map((s) => s.id)).toEqual(["root"])
    // grandchild1, greatgrandchild, and child2 are all running descendants
    const cascadeIds = plan.cascade.map((s) => s.id)
    expect(cascadeIds).toContain("grandchild1")
    expect(cascadeIds).toContain("greatgrandchild")
    expect(cascadeIds).toContain("child2")
    expect(cascadeIds).not.toContain("unrelated")
    expect(cascadeIds).not.toContain("child1") // child1 is idle, so not in cascade
  })

  test("does not duplicate descendants already present in stop targets", () => {
    const sessions = [
      { id: "p1", status: "busy", title: "Parent" },
      { id: "c1", parentID: "p1", status: "busy", title: "Child 1" },
      { id: "gc1", parentID: "c1", status: "busy", title: "Grandchild 1" },
    ]

    // Target includes both parent and child
    const plan = planStop(["p1", "c1"], sessions)

    expect(plan.stop.map((s) => s.id)).toEqual(["p1", "c1"])
    expect(plan.cascade.map((s) => s.id)).toEqual(["gc1"])
    expect(plan.skipped).toEqual([])
  })

  test("handles duplicate target IDs in input without duplicating in stop", () => {
    const sessions = [{ id: "s1", status: "busy" }]
    const plan = planStop(["s1", "s1", "s1"], sessions)
    expect(plan.stop.map((s) => s.id)).toEqual(["s1"])
  })
})

describe("planStop: idle parent with a running subagent", () => {
  test("the parent is a target, the busy child cascades, nothing is skipped", () => {
    const plan = planStop(["p"], [
      { id: "p", status: "idle", title: "Parent" },
      { id: "c", parentID: "p", status: "busy", title: "Child" },
      { id: "g", parentID: "c", status: "retry", title: "Grandchild" },
    ])
    expect(plan.stop.map((s) => s.id)).toEqual([])
    expect(plan.cascade.map((s) => s.id)).toEqual(["c", "g"])
    expect(plan.targets.map((s) => s.id)).toEqual(["p"])
    expect(plan.skipped).toEqual([])
  })
  test("a target nested under another target is still a target", () => {
    const plan = planStop(["p", "c"], [
      { id: "p", status: "idle" },
      { id: "c", parentID: "p", status: "idle" },
      { id: "g", parentID: "c", status: "busy" },
    ])
    expect(plan.targets.map((s) => s.id)).toEqual(["p", "c"])
    expect(plan.cascade.map((s) => s.id)).toEqual(["g"])
  })
  test("rootIds keeps sessions whose parent is not loaded", () => {
    expect(rootIds([{ id: "a" }, { id: "b", parentID: "a" }, { id: "x", parentID: "gone" }])).toEqual(["a", "x"])
  })
})

describe("stopSessions", () => {
  function createFixture(sessionsList: Parameters<typeof planStop>[1]) {
    const requests: Array<{ method: string; path: string; body?: unknown; directory?: string }> = []
    const infoCalls: string[] = []
    const warnCalls: string[] = []
    const confirmCalls: Array<{ message: string; detail?: string }> = []
    let confirmResult = true

    const deps = {
      request: mock(async <T>(method: string, path: string, body?: unknown, directory?: string): Promise<T> => {
        requests.push({ method, path, body, directory })
        return {} as T
      }),
      sessions: mock(() => sessionsList),
      confirm: mock(async (message: string, detail?: string) => {
        confirmCalls.push({ message, detail })
        return confirmResult
      }),
      info: mock((message: string) => {
        infoCalls.push(message)
      }),
      warn: mock((message: string) => {
        warnCalls.push(message)
      }),
    }

    return {
      deps,
      requests,
      infoCalls,
      warnCalls,
      confirmCalls,
      setConfirmResult: (val: boolean) => {
        confirmResult = val
      },
    }
  }

  test("when no running sessions to stop, notifies info and returns early", async () => {
    const fixture = createFixture([
      { id: "s1", status: "idle", title: "Idle Session" },
    ])

    const res = await stopSessions(["s1"], fixture.deps)

    expect(fixture.infoCalls).toEqual(["No running sessions to stop."])
    expect(fixture.confirmCalls.length).toBe(0)
    expect(fixture.requests.length).toBe(0)
    expect(res).toEqual({ stopped: [], failed: [], cancelled: false })
  })

  test("single target without descendants stops directly without confirm", async () => {
    const fixture = createFixture([
      { id: "s1", status: "busy", title: "My Running Session", directory: "/custom/worktree" },
    ])

    const res = await stopSessions(["s1"], fixture.deps)

    expect(fixture.confirmCalls.length).toBe(0)
    expect(fixture.requests.length).toBe(1)
    expect(fixture.requests[0]).toEqual({
      method: "POST",
      path: "/session/s1/abort",
      body: undefined,
      directory: "/custom/worktree",
    })
    expect(res).toEqual({ stopped: ["s1"], failed: [], cancelled: false })
  })

  test("single target with descendants asks for confirmation with detail", async () => {
    const fixture = createFixture([
      { id: "parent", status: "busy", title: "Parent Task", directory: "/dir/p" },
      { id: "child", parentID: "parent", status: "busy", title: "Child Subagent", directory: "/dir/c" },
    ])

    // Confirm accepted
    const res = await stopSessions(["parent"], fixture.deps)

    expect(fixture.confirmCalls.length).toBe(1)
    expect(fixture.confirmCalls[0]).toEqual({
      message: 'Stop "Parent Task"?',
      detail: "Its 1 running subagent(s) will stop too.",
    })
    expect(fixture.requests.length).toBe(2)
    expect(fixture.requests).toEqual([
      { method: "POST", path: "/session/parent/abort", body: undefined, directory: "/dir/p" },
      { method: "POST", path: "/session/child/abort", body: undefined, directory: "/dir/c" },
    ])
    expect(res.stopped).toEqual(["parent", "child"])
    expect(res.cancelled).toBe(false)
  })

  test("multiple targets with descendants asks for confirmation with count message", async () => {
    const fixture = createFixture([
      { id: "p1", status: "busy", title: "Task 1", directory: "/dir/1" },
      { id: "p2", status: "busy", title: "Task 2", directory: "/dir/2" },
      { id: "c1", parentID: "p1", status: "busy", title: "Subagent 1", directory: "/dir/sub" },
    ])

    const res = await stopSessions(["p1", "p2"], fixture.deps)

    expect(fixture.confirmCalls.length).toBe(1)
    expect(fixture.confirmCalls[0]).toEqual({
      message: "Stop 2 sessions?",
      detail: "1 running subagent(s) will stop too.",
    })
    expect(res.stopped).toEqual(["p1", "p2", "c1"])
  })

  test("idle parent with a busy subagent confirms, then aborts only the subagent in its own directory", async () => {
    const fixture = createFixture([
      { id: "p", status: "idle", title: "Parent", directory: "/w" },
      { id: "c", parentID: "p", status: "busy", title: "Child", directory: "/w/.wt" },
    ])
    const result = await stopSessions(["p"], fixture.deps)
    expect(fixture.infoCalls).toEqual([])
    expect(fixture.confirmCalls).toEqual([{ message: 'Stop "Parent"?', detail: "Its 1 running subagent(s) will stop too." }])
    expect(fixture.requests).toEqual([{ method: "POST", path: "/session/c/abort", body: undefined, directory: "/w/.wt" }])
    expect(result.stopped).toEqual(["c"])
  })

  test("Restricted Mode gate cancels before reading sessions or sending", async () => {
    const fixture = createFixture([{ id: "s1", status: "busy", title: "Busy" }])
    const res = await stopSessions(["s1"], { ...fixture.deps, requireTrust: () => false })
    expect(res).toEqual({ stopped: [], failed: [], cancelled: true })
    expect(fixture.requests).toEqual([])
  })

  test("declining confirmation cancels stopping", async () => {
    const fixture = createFixture([
      { id: "parent", status: "busy", title: "Parent", directory: "/dir" },
      { id: "child", parentID: "parent", status: "busy", directory: "/dir" },
    ])
    fixture.setConfirmResult(false)

    const res = await stopSessions(["parent"], fixture.deps)

    expect(fixture.confirmCalls.length).toBe(1)
    expect(fixture.requests.length).toBe(0)
    expect(res).toEqual({ stopped: [], failed: [], cancelled: true })
  })

  test("all: true must confirm even without descendants", async () => {
    const fixture = createFixture([
      { id: "s1", status: "busy", title: "Session 1", directory: "/dir/1" },
      { id: "s2", status: "retry", title: "Session 2", directory: "/dir/2" },
    ])

    const res = await stopSessions(["s1", "s2"], fixture.deps, { all: true })

    expect(fixture.confirmCalls.length).toBe(1)
    expect(fixture.confirmCalls[0]).toEqual({
      message: "Stop all 2 running sessions?",
      detail: undefined,
    })
    expect(fixture.requests.length).toBe(2)
    expect(res.stopped).toEqual(["s1", "s2"])
  })

  test("all: true with descendants includes subagent detail", async () => {
    const fixture = createFixture([
      { id: "root", status: "busy", title: "Root", directory: "/dir/root" },
      { id: "sub1", parentID: "root", status: "busy", directory: "/dir/sub1" },
      { id: "sub2", parentID: "root", status: "busy", directory: "/dir/sub2" },
    ])

    const res = await stopSessions(["root"], fixture.deps, { all: true })

    expect(fixture.confirmCalls.length).toBe(1)
    expect(fixture.confirmCalls[0]).toEqual({
      message: "Stop all 1 running sessions?",
      detail: "2 running subagents will stop too.",
    })
    expect(res.stopped).toEqual(["root", "sub1", "sub2"])
  })

  test("uses each session's own directory when sending abort request", async () => {
    const fixture = createFixture([
      { id: "s1", status: "busy", directory: "/worktree/branch-a" },
      { id: "s2", status: "busy", directory: "/worktree/branch-b" },
    ])

    await stopSessions(["s1", "s2"], fixture.deps)

    expect(fixture.requests.find((r) => r.path === "/session/s1/abort")?.directory).toBe("/worktree/branch-a")
    expect(fixture.requests.find((r) => r.path === "/session/s2/abort")?.directory).toBe("/worktree/branch-b")
  })

  test("aggregates partial failures and calls deps.warn once", async () => {
    const fixture = createFixture([
      { id: "s1", status: "busy", title: "Session One", directory: "/dir/1" },
      { id: "s2", status: "busy", title: "Session Two", directory: "/dir/2" },
    ])

    fixture.deps.request = mock(async <T>(_m: string, path: string): Promise<T> => {
      if (path.includes("s2")) {
        throw new Error("HTTP 500: Failed to abort")
      }
      return {} as T
    })

    const res = await stopSessions(["s1", "s2"], fixture.deps)

    expect(res.stopped).toEqual(["s1"])
    expect(res.failed).toEqual([
      { id: "s2", title: "Session Two", error: "HTTP 500: Failed to abort" },
    ])
    expect(fixture.warnCalls.length).toBe(1)
    expect(fixture.warnCalls[0]).toContain("Failed to stop 1 session(s)")
    expect(fixture.warnCalls[0]).toContain('"Session Two": HTTP 500: Failed to abort')
  })
})

describe("registerStopSessions", () => {
  test("registers oco.sessions.stop and oco.sessions.stopAllRunning commands", async () => {
    commandsRegistry.clear()

    const sessions = [
      { id: "s1", status: "busy", title: "S1" },
      { id: "s2", status: "busy", title: "S2" },
    ]
    const aborted: string[] = []

    const deps = {
      request: mock(async <T>(_m: string, path: string): Promise<T> => {
        aborted.push(path)
        return {} as T
      }),
      sessions: mock(() => sessions),
      confirm: mock(async () => true),
      info: mock(() => {}),
      warn: mock(() => {}),
    }

    const disposables = registerStopSessions(deps)

    expect(commandsRegistry.has("oco.sessions.stop")).toBe(true)
    expect(commandsRegistry.has("oco.sessions.stopAllRunning")).toBe(true)

    // Call stop with single ID
    await commandsRegistry.get("oco.sessions.stop")!("s1")
    expect(aborted).toContain("/session/s1/abort")

    // Call stopAllRunning
    aborted.length = 0
    await commandsRegistry.get("oco.sessions.stopAllRunning")!()
    expect(deps.confirm).toHaveBeenCalled()
    expect(aborted).toContain("/session/s1/abort")
    expect(aborted).toContain("/session/s2/abort")

    // Dispose
    disposables.forEach((d) => d.dispose())
    expect(commandsRegistry.has("oco.sessions.stop")).toBe(false)
    expect(commandsRegistry.has("oco.sessions.stopAllRunning")).toBe(false)
  })
})
