import { describe, expect, mock, test } from "bun:test"

let createdThreads: any[] = []

mock.module("vscode", () => ({
  CommentThreadCollapsibleState: {
    Collapsed: 0,
    Expanded: 1,
  },
  CommentMode: {
    Editing: 0,
    Preview: 1,
  },
  MarkdownString: class {
    constructor(readonly value: string) {}
  },
  Range: class {
    constructor(
      readonly startLine: number,
      readonly startCol: number,
      readonly endLine: number,
      readonly endCol: number,
    ) {}
  },
  Uri: {
    file: (p: string) => ({ scheme: "file", fsPath: p }),
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
  comments: {
    createCommentController: (id: string, label: string) => ({
      id,
      label,
      commentingRangeProvider: undefined as any,
      createCommentThread: (uri: any, range: any, comments: any[]) => {
        const thread = {
          uri,
          range,
          comments: [...comments],
          collapsibleState: undefined,
          label: "",
          contextValue: "",
          disposed: false,
          dispose: () => {
            thread.disposed = true
          },
        }
        createdThreads.push(thread)
        return thread
      },
      dispose: () => {},
    }),
  },
  workspace: {
    workspaceFolders: [{ uri: { fsPath: "/workspace" } }],
    asRelativePath: (uri: any) => uri.fsPath.replace(/^\/workspace\//, ""),
    openTextDocument: async () => ({
      getText: () => "const x = 42",
      lineCount: 10,
    }),
  },
  window: {
    showWarningMessage: () => Promise.resolve(undefined),
  },
  commands: {
    registerCommand: () => ({ dispose: () => {} }),
  },
}))

const mockCreateCommentController = (id: string, label: string) => ({
  id,
  label,
  commentingRangeProvider: undefined as any,
  createCommentThread: (uri: any, range: any, comments: any[]) => {
    const thread = {
      uri,
      range,
      comments: [...comments],
      collapsibleState: undefined,
      label: "",
      contextValue: "",
      disposed: false,
      dispose: () => {
        thread.disposed = true
      },
    }
    createdThreads.push(thread)
    return thread
  },
  dispose: () => {},
})

const { ReviewNotes } = await import("../../apps/extension/src/review-notes")
const { ReviewThreadsController } = await import("../../apps/extension/src/review-threads")

describe("review-threads", () => {
  test("creates comment threads for active session notes and maintains note <-> thread mapping", () => {
    createdThreads = []
    const reviewNotes = new ReviewNotes()
    const n1 = reviewNotes.add({
      connectionId: "conn_1",
      sessionId: "ses_1",
      path: "src/app.ts",
      startLine: 10,
      endLine: 12,
      snippet: "console.log('hi')",
      comment: "check this",
    })

    const panels = {
      active: {
        binding: { connectionId: "conn_1", sessionId: "ses_1", directory: "/workspace" },
      },
      onDidChangeActiveSession: () => ({ dispose: () => {} }),
      list: () => [],
    } as any

    const controller = new ReviewThreadsController({
      reviewNotes,
      panels,
      createCommentController: mockCreateCommentController as any,
    })
    expect(createdThreads).toHaveLength(1)
    const thread = createdThreads[0]

    expect(thread.label).toBe("oco review note")
    expect(thread.collapsibleState).toBe(0) // Collapsed
    expect(thread.range.startLine).toBe(9) // 0-based
    expect(thread.range.endLine).toBe(11)

    // Bidirectional mapping
    expect(controller.getThread(n1.id)).toBe(thread)
    expect(controller.getNoteId(thread)).toBe(n1.id)
  })

  test("removeNote removes note from storage and disposes thread", () => {
    createdThreads = []
    const reviewNotes = new ReviewNotes()
    const n1 = reviewNotes.add({
      connectionId: "conn_1",
      sessionId: "ses_1",
      path: "src/app.ts",
      startLine: 5,
      endLine: 5,
      comment: "fix me",
    })

    const panels = {
      active: {
        binding: { connectionId: "conn_1", sessionId: "ses_1", directory: "/workspace" },
      },
      onDidChangeActiveSession: () => ({ dispose: () => {} }),
      list: () => [],
    } as any

    const controller = new ReviewThreadsController({
      reviewNotes,
      panels,
      createCommentController: mockCreateCommentController as any,
    })
    const thread = controller.getThread(n1.id)!
    expect(thread.disposed).toBe(false)

    // Remove via thread object
    const ok = controller.removeNote(thread)
    expect(ok).toBe(true)
    expect(thread.disposed).toBe(true)
    expect(controller.getThread(n1.id)).toBeUndefined()
    expect(reviewNotes.list("conn_1", "ses_1")).toHaveLength(0)
  })

  test("Send all clears all threads via reviewNotes.clear", () => {
    createdThreads = []
    const reviewNotes = new ReviewNotes()
    reviewNotes.add({
      connectionId: "conn_1",
      sessionId: "ses_1",
      path: "src/a.ts",
      startLine: 1,
      endLine: 2,
    })
    reviewNotes.add({
      connectionId: "conn_1",
      sessionId: "ses_1",
      path: "src/b.ts",
      startLine: 3,
      endLine: 4,
    })

    const panels = {
      active: {
        binding: { connectionId: "conn_1", sessionId: "ses_1", directory: "/workspace" },
      },
      onDidChangeActiveSession: () => ({ dispose: () => {} }),
      list: () => [],
    } as any

    const controller = new ReviewThreadsController({
      reviewNotes,
      panels,
      createCommentController: mockCreateCommentController as any,
    })
    expect(createdThreads).toHaveLength(2)
    expect(createdThreads.every((t) => !t.disposed)).toBe(true)

    // Clear notes (simulating Send all)
    reviewNotes.clear("conn_1", "ses_1")

    expect(createdThreads.every((t) => t.disposed)).toBe(true)
  })

  test("createFromReply creates review note and disposes drafting thread", async () => {
    const reviewNotes = new ReviewNotes()
    const panels = {
      active: {
        binding: { connectionId: "conn_1", sessionId: "ses_1", directory: "/workspace" },
      },
      onDidChangeActiveSession: () => ({ dispose: () => {} }),
      list: () => [],
    } as any

    const controller = new ReviewThreadsController({
      reviewNotes,
      panels,
      createCommentController: mockCreateCommentController as any,
    })

    let draftDisposed = false
    const draftThread = {
      uri: { scheme: "file", fsPath: "/workspace/src/test.ts" },
      range: { start: { line: 15 }, end: { line: 20 } },
      dispose: () => {
        draftDisposed = true
      },
    }

    const reply = {
      thread: draftThread as any,
      text: "Need refactoring here",
    }

    const note = await controller.createFromReply(reply)
    expect(note).toBeDefined()
    expect(note?.comment).toBe("Need refactoring here")
    expect(note?.path).toBe("src/test.ts")
    expect(note?.startLine).toBe(16) // 1-based
    expect(note?.endLine).toBe(21)
    expect(draftDisposed).toBe(true)

    // Stored in reviewNotes
    expect(reviewNotes.list("conn_1", "ses_1")).toHaveLength(1)
  })

  test("commentingRangeProvider allows all lines in file scheme documents only", () => {
    const reviewNotes = new ReviewNotes()
    const panels = {
      active: undefined,
      onDidChangeActiveSession: () => ({ dispose: () => {} }),
      list: () => [],
    } as any

    const controller = new ReviewThreadsController({
      reviewNotes,
      panels,
      createCommentController: mockCreateCommentController as any,
    })
    const provider = controller.controller.commentingRangeProvider!

    const fileDoc = { uri: { scheme: "file" }, lineCount: 50 } as any
    const ranges = provider.provideCommentingRanges(fileDoc, {} as any)
    expect(ranges).toHaveLength(1)
    expect(ranges[0].startLine).toBe(0)
    expect(ranges[0].endLine).toBe(49)

    const gitDoc = { uri: { scheme: "git" }, lineCount: 50 } as any
    expect(provider.provideCommentingRanges(gitDoc, {} as any)).toHaveLength(0)
  })
})
