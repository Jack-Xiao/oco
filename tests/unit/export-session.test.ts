import { describe, expect, mock, test } from "bun:test"

// Mock vscode module for bun test environment
mock.module("vscode", () => ({
  commands: {
    registerCommand: (id: string, handler: (arg?: unknown) => Promise<unknown>) => ({
      id,
      handler,
      dispose: () => {},
    }),
    executeCommand: () => Promise.resolve(undefined),
  },
  window: {
    showInformationMessage: () => Promise.resolve(undefined),
    showWarningMessage: () => Promise.resolve(undefined),
    showErrorMessage: () => Promise.resolve(undefined),
    showTextDocument: () => Promise.resolve(undefined),
    showSaveDialog: () => Promise.resolve(undefined),
  },
  workspace: {
    openTextDocument: (options: unknown) => Promise.resolve(options),
    fs: {
      writeFile: () => Promise.resolve(undefined),
    },
    workspaceFolders: [
      {
        uri: {
          fsPath: "/test/workspace",
          toString: () => "/test/workspace",
        },
      },
    ],
  },
  Uri: {
    joinPath: (base: any, ...parts: string[]) => ({
      fsPath: `${base.fsPath}/${parts.join("/")}`,
      toString: () => `${base.toString()}/${parts.join("/")}`,
    }),
  },
}))

const vscode = await import("vscode")

const { renderSessionMarkdown, registerExportSession } = await import("../../apps/extension/src/export-session")

describe("renderSessionMarkdown", () => {
  test("title fallback to Session <id> when title is empty or missing", () => {
    const md1 = renderSessionMarkdown({ id: "ses-101" }, [])
    expect(md1).toContain("# Session ses-101")

    const md2 = renderSessionMarkdown({ id: "ses-102", title: "   " }, [])
    expect(md2).toContain("# Session ses-102")

    const md3 = renderSessionMarkdown({ id: "ses-103", title: "My Custom Title" }, [])
    expect(md3).toContain("# My Custom Title")
  })

  test("renders user and assistant sections with modelID and time", () => {
    const timestamp = 1729000000000 // A fixed timestamp
    const d = new Date(timestamp)
    const expectedHHMM = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`

    const messages = [
      {
        info: {
          id: "m1",
          role: "user",
          time: { created: timestamp },
        },
        parts: [{ type: "text", text: "Hello AI!" }],
      },
      {
        info: {
          id: "m2",
          role: "assistant",
          modelID: "claude-3-5-sonnet",
          time: { created: timestamp },
        },
        parts: [{ type: "text", text: "Hello user! How can I help?" }],
      },
    ]

    const md = renderSessionMarkdown({ id: "ses-1" }, messages)
    expect(md).toContain(`## User · ${expectedHHMM}`)
    expect(md).toContain("Hello AI!")
    expect(md).toContain(`## Assistant · claude-3-5-sonnet · ${expectedHHMM}`)
    expect(md).toContain("Hello user! How can I help?")
    expect(md).toContain("- **Models:** claude-3-5-sonnet")
  })

  test("tool details + truncation markers (input > 2000 chars, output > 4000 chars)", () => {
    const longInput = "A".repeat(2500)
    const longOutput = "B".repeat(5000)

    const messages = [
      {
        info: { id: "m1", role: "assistant", modelID: "gpt-4o" },
        parts: [
          {
            type: "tool",
            tool: "runCommand",
            state: {
              title: "Running build",
              input: longInput,
              output: longOutput,
            },
          },
        ],
      },
    ]

    const md = renderSessionMarkdown({ id: "ses-1" }, messages)
    expect(md).toContain("<details><summary>🔧 runCommand — Running build</summary>")
    expect(md).toContain("```json")
    expect(md).toContain(longInput.slice(0, 2000) + "(truncated)")
    expect(md).not.toContain("A".repeat(2001))
    expect(md).toContain("```\n" + longOutput.slice(0, 4000) + "(truncated)")
    expect(md).not.toContain("B".repeat(4001))
    expect(md).toContain("</details>")
  })

  test("reasoning omitted unless opts.includeReasoning is true", () => {
    const messages = [
      {
        info: { id: "m1", role: "assistant" },
        parts: [
          { type: "reasoning", text: "Secret inner thought" },
          { type: "text", text: "Final answer" },
        ],
      },
    ]

    const mdWithout = renderSessionMarkdown({ id: "ses-1" }, messages, { includeReasoning: false })
    expect(mdWithout).not.toContain("Secret inner thought")
    expect(mdWithout).toContain("Final answer")

    const mdWith = renderSessionMarkdown({ id: "ses-1" }, messages, { includeReasoning: true })
    expect(mdWith).toContain("Secret inner thought")
    expect(mdWith).toContain("Final answer")
  })

  test("revert skipping and omitted line", () => {
    const messages = [
      { info: { id: "m1", role: "user" }, parts: [{ type: "text", text: "Keep this 1" }] },
      { info: { id: "m2", role: "assistant" }, parts: [{ type: "text", text: "Keep this 2" }] },
      { info: { id: "m3", role: "user" }, parts: [{ type: "text", text: "Reverted 3" }] },
      { info: { id: "m4", role: "assistant" }, parts: [{ type: "text", text: "Reverted 4" }] },
    ]

    const info = {
      id: "ses-revert",
      revert: { messageID: "m3" },
    }

    const md = renderSessionMarkdown(info, messages)
    expect(md).toContain("Keep this 1")
    expect(md).toContain("Keep this 2")
    expect(md).not.toContain("Reverted 3")
    expect(md).not.toContain("Reverted 4")
    expect(md).toContain("_2 rolled back messages omitted_")
  })

  test("file attachments and unknown part types tolerated without throwing", () => {
    const messages = [
      {
        info: { id: "m1", role: "user" },
        parts: [
          { type: "file", filename: "diagram.png" },
          { type: "file", mime: "application/pdf" },
          { type: "step-start" },
          { type: "step-finish" },
          { type: "snapshot" },
          { type: "patch" },
          { type: "future-unknown-type", data: 123 },
          { type: "text", text: "Working fine" },
        ],
      },
    ]

    expect(() => {
      const md = renderSessionMarkdown({ id: "ses-parts" }, messages)
      expect(md).toContain("[attachment: diagram.png]")
      expect(md).toContain("[attachment: application/pdf]")
      expect(md).toContain("Working fine")
    }).not.toThrow()
  })

  test("calculates total cost and tokens across messages", () => {
    const messages = [
      {
        info: {
          id: "m1",
          role: "user",
          cost: 0.05,
          tokens: { input: 100, output: 50 },
        },
        parts: [{ type: "text", text: "User prompt" }],
      },
      {
        info: {
          id: "m2",
          role: "assistant",
          cost: 0.12,
          tokens: { total: 500 },
        },
        parts: [{ type: "text", text: "Assistant response" }],
      },
    ]

    const md = renderSessionMarkdown({ id: "ses-cost" }, messages)
    expect(md).toContain("- **Total Cost:** $0.17")
    expect(md).toContain("- **Total Tokens:** 650")
  })
})

describe("registerExportSession", () => {
  test("registers oco.exportSession and oco.exportSessionToFile", () => {
    const deps = {
      request: mock(() => Promise.resolve({})),
      rowItem: mock(() => undefined),
      mainSession: mock(() => undefined),
      pickSession: mock(() => Promise.resolve(undefined)),
      requireTrust: mock(() => true),
    }

    const disposables = registerExportSession(deps)
    expect(disposables.length).toBe(2)
  })
})
