import { describe, expect, mock, test } from "bun:test"

let contextKeys = new Map<string, any>()
let statusBarVisible = false

mock.module("vscode", () => ({
  ViewColumn: {
    One: 1,
    Two: 2,
    Beside: -1,
  },
  StatusBarAlignment: {
    Right: 2,
  },
  Uri: {
    file: (p: string) => ({ scheme: "file", fsPath: p }),
  },
  commands: {
    executeCommand: (cmd: string, ...args: any[]) => {
      if (cmd === "setContext") {
        contextKeys.set(args[0], args[1])
      }
      return Promise.resolve(undefined)
    },
    registerCommand: () => ({ dispose: () => {} }),
  },
  window: {
    createStatusBarItem: () => ({
      command: "",
      text: "",
      tooltip: "",
      show: () => {
        statusBarVisible = true
      },
      hide: () => {
        statusBarVisible = false
      },
      dispose: () => {},
    }),
    showWarningMessage: () => Promise.resolve(undefined),
  },
  workspace: {
    workspaceFolders: [{ uri: { fsPath: "/workspace" } }],
    onDidChangeTextDocument: () => ({ dispose: () => {} }),
  },
}))

const { FollowModeManager } = await import("../../apps/extension/src/follow-mode")

describe("follow-mode", () => {
  test("toggle follow mode updates context and status bar", () => {
    statusBarVisible = false
    contextKeys.clear()

    const panels = {
      active: { binding: { sessionId: "ses_1", directory: "/workspace" } },
      onDidChangeActiveSession: () => ({ dispose: () => {} }),
    } as any

    const manager = new FollowModeManager({ panels })
    expect(manager.isFollowing("ses_1")).toBe(false)
    expect(statusBarVisible).toBe(false)
    expect(contextKeys.get("oco.follow.active")).toBe(false)

    // Toggle on
    const on = manager.toggle("ses_1")
    expect(on).toBe(true)
    expect(manager.isFollowing("ses_1")).toBe(true)
    expect(statusBarVisible).toBe(true)
    expect(contextKeys.get("oco.follow.active")).toBe(true)

    // Toggle off
    const off = manager.toggle("ses_1")
    expect(off).toBe(false)
    expect(manager.isFollowing("ses_1")).toBe(false)
    expect(statusBarVisible).toBe(false)
    expect(contextKeys.get("oco.follow.active")).toBe(false)
  })

  test("filters events: only follows edit tools for followed session", async () => {
    const opened: { uri: string; options: any }[] = []
    let currentTime = 10000

    const panels = {
      active: {
        binding: { sessionId: "ses_1", directory: "/workspace" },
        panel: { viewColumn: 1 },
      },
      onDidChangeActiveSession: () => ({ dispose: () => {} }),
    } as any

    const manager = new FollowModeManager({
      panels,
      now: () => currentTime,
      showTextDocument: async (uri, options) => {
        opened.push({ uri: uri.fsPath, options })
      },
      getActiveTextEditor: () => undefined,
    })

    manager.toggle("ses_1")

    // 1. Wrong event type
    await manager.onEvent({
      type: "message.updated",
      properties: { part: { type: "tool", tool: "edit", sessionID: "ses_1", state: { input: { filePath: "a.ts" } } } },
    })
    expect(opened).toHaveLength(0)

    // 2. Different session
    await manager.onEvent({
      type: "message.part.updated",
      properties: { part: { type: "tool", tool: "edit", sessionID: "ses_other", state: { input: { filePath: "a.ts" } } } },
    })
    expect(opened).toHaveLength(0)

    // 3. Non-edit tool (e.g. bash or read)
    await manager.onEvent({
      type: "message.part.updated",
      properties: { part: { type: "tool", tool: "bash", sessionID: "ses_1", state: { input: { filePath: "a.ts" } } } },
    })
    expect(opened).toHaveLength(0)

    // 4. Valid edit tool
    await manager.onEvent({
      type: "message.part.updated",
      properties: { part: { type: "tool", tool: "write", sessionID: "ses_1", state: { input: { filePath: "src/file.ts" } } } },
    })
    expect(opened).toHaveLength(1)
    expect(opened[0].uri).toBe("/workspace/src/file.ts")
    // Non-oco panel column: panel was 1, so target is 2
    expect(opened[0].options.viewColumn).toBe(2)
    expect(opened[0].options.preview).toBe(true)
    expect(opened[0].options.preserveFocus).toBe(true)
  })

  test("throttles same file within 750ms but allows different file", async () => {
    const opened: string[] = []
    let currentTime = 10000

    const panels = {
      active: {
        binding: { sessionId: "ses_1", directory: "/workspace" },
        panel: { viewColumn: 1 },
      },
      onDidChangeActiveSession: () => ({ dispose: () => {} }),
    } as any

    const manager = new FollowModeManager({
      panels,
      now: () => currentTime,
      showTextDocument: async (uri) => {
        opened.push(uri.fsPath)
      },
      getActiveTextEditor: () => undefined,
    })

    manager.toggle("ses_1")

    // First open
    await manager.onEvent({
      type: "message.part.updated",
      properties: { part: { type: "tool", tool: "edit", sessionID: "ses_1", state: { input: { filePath: "a.ts" } } } },
    })
    expect(opened).toEqual(["/workspace/a.ts"])

    // Same file 300ms later -> throttled
    currentTime += 300
    await manager.onEvent({
      type: "message.part.updated",
      properties: { part: { type: "tool", tool: "edit", sessionID: "ses_1", state: { input: { filePath: "a.ts" } } } },
    })
    expect(opened).toEqual(["/workspace/a.ts"])

    // Different file 300ms later -> allowed
    await manager.onEvent({
      type: "message.part.updated",
      properties: { part: { type: "tool", tool: "edit", sessionID: "ses_1", state: { input: { filePath: "b.ts" } } } },
    })
    expect(opened).toEqual(["/workspace/a.ts", "/workspace/b.ts"])

    // Same file a.ts after 800ms -> allowed
    currentTime += 800
    await manager.onEvent({
      type: "message.part.updated",
      properties: { part: { type: "tool", tool: "edit", sessionID: "ses_1", state: { input: { filePath: "a.ts" } } } },
    })
    expect(opened).toEqual(["/workspace/a.ts", "/workspace/b.ts", "/workspace/a.ts"])
  })

  test("skips switching when active editor has unsaved changes or recent user edit", async () => {
    const opened: string[] = []
    let currentTime = 10000
    let isDirty = false

    const panels = {
      active: {
        binding: { sessionId: "ses_1", directory: "/workspace" },
        panel: { viewColumn: 1 },
      },
      onDidChangeActiveSession: () => ({ dispose: () => {} }),
    } as any

    const manager = new FollowModeManager({
      panels,
      now: () => currentTime,
      showTextDocument: async (uri) => {
        opened.push(uri.fsPath)
      },
      getActiveTextEditor: () => ({ document: { isDirty } } as any),
    })

    manager.toggle("ses_1")

    // 1. Unsaved changes (dirty) -> skip
    isDirty = true
    await manager.onEvent({
      type: "message.part.updated",
      properties: { part: { type: "tool", tool: "edit", sessionID: "ses_1", state: { input: { filePath: "a.ts" } } } },
    })
    expect(opened).toHaveLength(0)

    // Clean editor -> succeeds
    isDirty = false
    await manager.onEvent({
      type: "message.part.updated",
      properties: { part: { type: "tool", tool: "edit", sessionID: "ses_1", state: { input: { filePath: "a.ts" } } } },
    })
    expect(opened).toEqual(["/workspace/a.ts"])

    // 2. User edit within 2000ms -> skip
    currentTime += 1000
    manager.recordUserEdit(currentTime) // user edited at t=11000

    currentTime += 500 // now t=11500 (500ms after edit)
    await manager.onEvent({
      type: "message.part.updated",
      properties: { part: { type: "tool", tool: "edit", sessionID: "ses_1", state: { input: { filePath: "b.ts" } } } },
    })
    expect(opened).toEqual(["/workspace/a.ts"]) // b.ts was skipped

    // After 2100ms since user edit (t=13100) -> succeeds
    currentTime += 1600
    await manager.onEvent({
      type: "message.part.updated",
      properties: { part: { type: "tool", tool: "edit", sessionID: "ses_1", state: { input: { filePath: "b.ts" } } } },
    })
    expect(opened).toEqual(["/workspace/a.ts", "/workspace/b.ts"])
  })
})
