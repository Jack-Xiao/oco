import { describe, expect, mock, test } from "bun:test"

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
  workspace: {
    getConfiguration: () => ({ get: () => undefined }),
    asRelativePath: (uri: unknown) => String(uri),
    workspaceFolders: [],
  },
  window: {
    showWarningMessage: () => Promise.resolve(undefined),
    showInformationMessage: () => Promise.resolve(undefined),
    showQuickPick: () => Promise.resolve(undefined),
    showInputBox: () => Promise.resolve(undefined),
  },
  commands: {
    registerCommand: () => ({ dispose: () => {} }),
    executeCommand: () => Promise.resolve(undefined),
  },
}))

const {
  formatReviewNotes,
  ReviewNotes,
  REVIEW_NOTES_KEY,
} = await import("../../apps/extension/src/review-notes")

type ReviewNote = import("../../apps/extension/src/review-notes").ReviewNote

describe("formatReviewNotes", () => {
  test("header description formatting for single and multiple files", () => {
    const singleNote: ReviewNote = {
      id: "1",
      connectionId: "c1",
      sessionId: "s1",
      path: "src/main.ts",
      startLine: 10,
      endLine: 15,
      snippet: "console.log('hello')",
      comment: "check this log",
      excluded: false,
    }

    const res1 = formatReviewNotes([singleNote])
    expect(res1.text).toContain(
      "Review notes (1 on 1 file). Snippets are from the current working tree; the before-image is Git changes (HEAD vs working tree) and may include changes not made by this session.",
    )
    expect(res1.source).toEqual({
      kind: "reviewNotes",
      notes: 1,
      files: 1,
      truncated: false,
    })

    const note2: ReviewNote = {
      id: "2",
      connectionId: "c1",
      sessionId: "s1",
      path: "src/utils.ts",
      startLine: 1,
      endLine: 5,
      snippet: "export const x = 1",
      comment: "make const",
      excluded: false,
    }
    const note3: ReviewNote = {
      id: "3",
      connectionId: "c1",
      sessionId: "s1",
      path: "src/utils.ts",
      startLine: 10,
      endLine: 12,
      snippet: "export const y = 2",
      comment: "",
      excluded: false,
    }

    const res2 = formatReviewNotes([singleNote, note2, note3])
    expect(res2.text).toContain("Review notes (3 on 2 files).")
    expect(res2.source).toEqual({
      kind: "reviewNotes",
      notes: 3,
      files: 2,
      truncated: false,
    })
  })

  test("formats path:start-end, user comment, and code snippet in backtick fence", () => {
    const note: ReviewNote = {
      id: "1",
      connectionId: "c1",
      sessionId: "s1",
      path: "src/app.ts",
      startLine: 20,
      endLine: 25,
      snippet: "function test() {\n  return 42\n}",
      comment: "Refactor to arrow function",
      excluded: false,
    }

    const { text } = formatReviewNotes([note])
    expect(text).toContain("src/app.ts:20-25")
    expect(text).toContain("Refactor to arrow function")
    expect(text).toContain("```\nfunction test() {\n  return 42\n}\n```")
  })

  test("excluded files only provide path and comment without snippet fence", () => {
    const noteExcluded: ReviewNote = {
      id: "1",
      connectionId: "c1",
      sessionId: "s1",
      path: "secret/config.json",
      startLine: 1,
      endLine: 10,
      snippet: '{\n  "token": "SECRET123"\n}',
      comment: "Don't hardcode credentials",
      excluded: true,
    }

    const { text } = formatReviewNotes([noteExcluded])
    expect(text).toContain("secret/config.json:1-10")
    expect(text).toContain("Don't hardcode credentials")
    expect(text).not.toContain("SECRET123")
    expect(text).not.toContain("```")
  })

  test("single snippet truncation flags truncated and preserves tail", () => {
    const longSnippet = ["line1", "line2", "line3", "line4", "line5"].join("\n")
    const note: ReviewNote = {
      id: "1",
      connectionId: "c1",
      sessionId: "s1",
      path: "src/long.ts",
      startLine: 1,
      endLine: 5,
      snippet: longSnippet,
      comment: "long function",
      excluded: false,
    }

    const { text, source } = formatReviewNotes([note], { maxSnippetLines: 2 })
    expect(source.truncated).toBe(true)
    expect(text).toContain("… showing last 2 of 5 lines")
    expect(text).toContain("line4\nline5")
  })

  test("total text truncation when exceeding maxLines", () => {
    const notes: ReviewNote[] = [1, 2, 3, 4, 5, 6].map((i) => ({
      id: String(i),
      connectionId: "c1",
      sessionId: "s1",
      path: `src/f${i}.ts`,
      startLine: i,
      endLine: i + 1,
      snippet: `code${i}`,
      comment: `comment${i}`,
      excluded: false,
    }))

    const { text, source } = formatReviewNotes(notes, { maxLines: 5 })
    expect(source.truncated).toBe(true)
    expect(text).toContain("… showing last 5 of")
  })
})

describe("ReviewNotes storage & isolation", () => {
  function createMockMemento(initial: Record<string, unknown> = {}) {
    const data = { ...initial }
    return {
      data,
      get: <T>(key: string) => data[key] as T | undefined,
      update: (key: string, val: unknown) => {
        data[key] = val
        return Promise.resolve()
      },
    }
  }

  test("adds notes, retrieves list and count", () => {
    const memento = createMockMemento()
    const rn = new ReviewNotes(memento as any)

    expect(rn.count("conn1", "session1")).toBe(0)
    expect(rn.list("conn1", "session1")).toEqual([])

    const added = rn.add({
      connectionId: "conn1",
      sessionId: "session1",
      path: "src/index.ts",
      startLine: 1,
      endLine: 5,
      snippet: "hello",
      comment: "first note",
      excluded: false,
    })

    expect(added.id).toBeDefined()
    expect(rn.count("conn1", "session1")).toBe(1)
    expect(rn.list("conn1", "session1")).toEqual([added])
  })

  test("isolates notes by connectionId and sessionId", () => {
    const memento = createMockMemento()
    const rn = new ReviewNotes(memento as any)

    rn.add({
      connectionId: "connA",
      sessionId: "session1",
      path: "a.ts",
      startLine: 1,
      endLine: 2,
      snippet: "a",
      comment: "cA s1",
      excluded: false,
    })

    rn.add({
      connectionId: "connA",
      sessionId: "session2",
      path: "b.ts",
      startLine: 1,
      endLine: 2,
      snippet: "b",
      comment: "cA s2",
      excluded: false,
    })

    rn.add({
      connectionId: "connB",
      sessionId: "session1",
      path: "c.ts",
      startLine: 1,
      endLine: 2,
      snippet: "c",
      comment: "cB s1",
      excluded: false,
    })

    expect(rn.count("connA", "session1")).toBe(1)
    expect(rn.count("connA", "session2")).toBe(1)
    expect(rn.count("connB", "session1")).toBe(1)
    expect(rn.count("connB", "session2")).toBe(0)

    expect(rn.list("connA", "session1")[0].comment).toBe("cA s1")
    expect(rn.list("connA", "session2")[0].comment).toBe("cA s2")
    expect(rn.list("connB", "session1")[0].comment).toBe("cB s1")
  })

  test("clear only removes notes for specified connection and session", () => {
    const memento = createMockMemento()
    const rn = new ReviewNotes(memento as any)

    rn.add({
      connectionId: "connA",
      sessionId: "session1",
      path: "a.ts",
      startLine: 1,
      endLine: 2,
      snippet: "a",
      comment: "cA s1",
      excluded: false,
    })
    rn.add({
      connectionId: "connA",
      sessionId: "session2",
      path: "b.ts",
      startLine: 1,
      endLine: 2,
      snippet: "b",
      comment: "cA s2",
      excluded: false,
    })

    let fired = 0
    rn.onDidChange(() => {
      fired++
    })

    rn.clear("connA", "session1")
    expect(rn.count("connA", "session1")).toBe(0)
    expect(rn.count("connA", "session2")).toBe(1)
    expect(fired).toBe(1)
  })

  test("persists to memento and reloads on new instance", () => {
    const memento = createMockMemento()
    const rn1 = new ReviewNotes(memento as any)

    rn1.add({
      connectionId: "c1",
      sessionId: "s1",
      path: "test.ts",
      startLine: 1,
      endLine: 10,
      snippet: "persisted",
      comment: "check persistence",
      excluded: false,
    })

    expect(memento.data[REVIEW_NOTES_KEY]).toBeDefined()
    const saved = memento.data[REVIEW_NOTES_KEY] as ReviewNote[]
    expect(saved.length).toBe(1)
    expect(saved[0].snippet).toBe("persisted")

    const rn2 = new ReviewNotes(memento as any)
    expect(rn2.count("c1", "s1")).toBe(1)
    expect(rn2.list("c1", "s1")[0].snippet).toBe("persisted")
  })
})
