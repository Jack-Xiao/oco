// Card 11 (M21 Git actions v1, ADR-009 §4): template rendering, draft metadata, repository selection, context
// reading through the (mocked) built-in git extension API, and the command wiring. The "vscode" module is mocked
// before the module under test is imported (same pattern as export-session.test.ts).

import { beforeEach, describe, expect, mock, test } from "bun:test"

const registeredCommands = new Map<string, (arg?: unknown) => Promise<unknown>>()
const executedCommands: { command: string; args: unknown[] }[] = []
const warningMessages: string[] = []
let fakeExtensions: Record<string, any> = {}

const vscodeMock = {
  commands: {
    registerCommand: (id: string, handler: (arg?: unknown) => Promise<unknown>) => {
      registeredCommands.set(id, handler)
      return {
        dispose: () => {
          registeredCommands.delete(id)
        },
      }
    },
    executeCommand: (command: string, ...args: unknown[]) => {
      executedCommands.push({ command, args })
      return Promise.resolve(undefined)
    },
  },
  Disposable: {
    from: (...disposables: { dispose: () => void }[]) => ({
      dispose: () => {
        for (const d of disposables) d.dispose()
      },
    }),
  },
  window: {
    showWarningMessage: (message: string) => {
      warningMessages.push(message)
      return Promise.resolve(undefined)
    },
  },
  extensions: {
    getExtension: (id: string) => fakeExtensions[id],
  },
  Uri: {
    file: (fsPath: string) => ({
      fsPath,
      scheme: "file",
      toString: () => `file://${fsPath}`,
    }),
  },
}

mock.module("vscode", () => vscodeMock)

import pkg from "../../apps/extension/package.json"
import type { DraftPanels, GitApi, GitRepository } from "../../apps/extension/src/add-to-draft"
import type { Entry } from "../../apps/extension/src/panels"

const {
  DEFAULT_COMMIT_PROMPT,
  DEFAULT_PR_PROMPT,
  GIT_FILES_MAX,
  NO_MAIN_SESSION,
  gitPromptSource,
  mainSessionEntry,
  pickRepository,
  readGitContext,
  registerGitActions,
  renderGitPrompt,
} = await import("../../apps/extension/src/git-actions")
type GitPromptContext = import("../../apps/extension/src/git-actions").GitPromptContext

describe("git-actions (Card 11 / M21 v1)", () => {
  beforeEach(() => {
    registeredCommands.clear()
    executedCommands.length = 0
    warningMessages.length = 0
    fakeExtensions = {}
  })

  test("1. renderGitPrompt replaces branch, files, count; files formatted with - <path>; count is 2", () => {
    const template = "Branch: ${branch}, Count: ${count}\nFiles:\n${files}"
    const ctx: GitPromptContext = {
      branch: "main",
      files: ["src/a.ts", "src/b.ts"],
      count: 2,
      dirty: true,
    }
    const rendered = renderGitPrompt(template, ctx)
    expect(rendered).toBe("Branch: main, Count: 2\nFiles:\n- src/a.ts\n- src/b.ts")
  })

  test("2. empty context replaces placeholders with empty string; ${other} preserved", () => {
    const template = "Branch: '${branch}', Count: '${count}', Files: '${files}', Other: '${other}'"
    const rendered = renderGitPrompt(template, {})
    expect(rendered).toBe("Branch: '', Count: '', Files: '', Other: '${other}'")
  })

  test("3. truncation with >20 files and count > files.length", () => {
    const files25 = Array.from({ length: 25 }, (_, i) => `file${i + 1}.txt`)
    const rendered25 = renderGitPrompt("${files}", { files: files25 })
    const lines25 = rendered25.split("\n")
    expect(lines25).toHaveLength(21)
    for (let i = 0; i < 20; i++) {
      expect(lines25[i]).toBe(`- file${i + 1}.txt`)
    }
    expect(lines25[20]).toBe("- … and 5 more")

    const renderedCount30 = renderGitPrompt("${count}\n${files}", {
      files: ["a.ts", "b.ts", "c.ts"],
      count: 30,
    })
    const [countLine, ...fileLines] = renderedCount30.split("\n")
    expect(countLine).toBe("30")
    expect(fileLines).toEqual(["- a.ts", "- b.ts", "- c.ts", "- … and 27 more"])
  })

  test("4. gitPromptSource metadata calculation", () => {
    expect(gitPromptSource({ count: 25 })).toEqual({
      kind: "gitDiff",
      scope: "working",
      files: 25,
      truncated: true,
    })
    expect(gitPromptSource({ files: ["a", "b", "c"] })).toEqual({
      kind: "gitDiff",
      scope: "working",
      files: 3,
      truncated: false,
    })
    expect(gitPromptSource({})).toEqual({
      kind: "gitDiff",
      scope: "working",
      files: 0,
      truncated: false,
    })
  })

  test("5. default prompts contain placeholders and match package.json configuration defaults", () => {
    for (const t of [DEFAULT_COMMIT_PROMPT, DEFAULT_PR_PROMPT]) {
      expect(t).toContain("${branch}")
      expect(t).toContain("${files}")
      expect(t).toContain("${count}")
    }
    const props = (pkg.contributes as any).configuration.properties
    expect(props["oco.git.commitPrompt"].default).toBe(DEFAULT_COMMIT_PROMPT)
    expect(props["oco.git.prPrompt"].default).toBe(DEFAULT_PR_PROMPT)
  })

  test("6. pickRepository selects repo based on rootPath, directory containment depth, or first fallback", () => {
    const repo1 = { rootUri: { fsPath: "/workspace/root" } } as GitRepository
    const repo2 = { rootUri: { fsPath: "/workspace/root/worktrees/feat" } } as GitRepository
    const repo3 = { rootUri: { fsPath: "/workspace/other" } } as GitRepository

    // empty array -> undefined
    expect(pickRepository([], {})).toBeUndefined()

    // rootPath match wins
    expect(pickRepository([repo1, repo2], { rootPath: "/workspace/root/worktrees/feat" })).toBe(repo2)
    // rootPath not matched -> falls back to directory or first
    expect(pickRepository([repo1, repo2], { rootPath: "/workspace/nonexistent" })).toBe(repo1)

    // deepest containing directory
    expect(pickRepository([repo1, repo2], { directory: "/workspace/root/worktrees/feat/src" })).toBe(repo2)
    expect(pickRepository([repo1, repo2], { directory: "/workspace/root/src" })).toBe(repo1)

    // neither rootPath nor directory matched -> first
    expect(pickRepository([repo1, repo3], { directory: "/somewhere/else" })).toBe(repo1)
  })

  test("7. readGitContext reads branch, deduplicates files, handles detached HEAD and errors", async () => {
    let statusCalled = false
    const repo: GitRepository = {
      rootUri: { fsPath: "/repo" } as any,
      async diff() {
        return ""
      },
      async status() {
        statusCalled = true
      },
      state: {
        HEAD: { name: "feat/my-branch" },
        workingTreeChanges: [{ uri: { fsPath: "/repo/src/a.ts" } as any }, { uri: { fsPath: "/repo/src/b.ts" } as any }],
        indexChanges: [{ uri: { fsPath: "/repo/src/b.ts" } as any }, { uri: { fsPath: "/repo/src/c.ts" } as any }],
        untrackedChanges: [{ uri: { fsPath: "/repo/docs/readme.md" } as any }],
      },
    }

    const fakeApi: GitApi = { repositories: [repo] }
    const ctx = await readGitContext({}, async () => fakeApi)
    expect(statusCalled).toBe(true)
    expect(ctx.branch).toBe("feat/my-branch")
    expect(ctx.files).toEqual(["src/a.ts", "src/b.ts", "src/c.ts", "docs/readme.md"])
    expect(ctx.count).toBe(4)
    expect(ctx.dirty).toBe(true)

    // api returns undefined -> {}
    const emptyCtx = await readGitContext({}, async () => undefined)
    expect(emptyCtx).toEqual({})

    // detached HEAD with commit -> 7 chars short commit
    const detachedRepo: GitRepository = {
      rootUri: { fsPath: "/repo" } as any,
      async diff() {
        return ""
      },
      async status() {
        throw new Error("status error")
      },
      state: {
        HEAD: { commit: "1234567890abcdef" },
        workingTreeChanges: [],
        indexChanges: [],
      },
    }
    const detachedCtx = await readGitContext({}, async () => ({ repositories: [detachedRepo] }))
    expect(detachedCtx.branch).toBe("1234567")
    expect(detachedCtx.files).toEqual([])
    expect(detachedCtx.count).toBe(0)
    expect(detachedCtx.dirty).toBe(false)
  })

  test("8. registerGitActions handles panel selection, execution, scm/title rootUri hint, and openScm", async () => {
    const insertDraftCalls: { entry: Entry; text: string; source: any }[] = []
    let entries: Entry[] = []

    const panels: DraftPanels = {
      list: () => entries,
      get active() {
        return entries[0]
      },
      insertDraft: async (entry, text, source) => {
        insertDraftCalls.push({ entry, text, source })
      },
    }

    // The git API is injected: in a full `bun test` run the "vscode" mock's export names are fixed by whichever
    // test file mocked it first, so an `extensions` key added here would not reach add-to-draft's gitApi().
    const repositories: GitRepository[] = []
    const disposables = registerGitActions({
      panels,
      template: (kind) => `Action: ${kind}\nBranch: ${"${branch}"}\nFiles: ${"${files}"}`,
      api: async () => ({ repositories }),
    })

    const registeredIds = Array.from(registeredCommands.keys()).sort()
    expect(registeredIds).toEqual([
      "oco.git.askCommit",
      "oco.git.askOpenPR",
      "oco.git.commitWithOpenCode",
      "oco.git.openScm",
    ])

    // No main panel -> showWarningMessage received NO_MAIN_SESSION and insertDraft not called
    await registeredCommands.get("oco.git.askCommit")?.()
    expect(warningMessages).toContain(NO_MAIN_SESSION)
    expect(insertDraftCalls).toHaveLength(0)

    // Draft page main panel (!e.binding.draft is false) -> still no real session
    entries = [
      {
        role: "main",
        binding: { sessionId: "draft-123", directory: "/repoA", draft: true },
      } as unknown as Entry,
    ]
    warningMessages.length = 0
    await registeredCommands.get("oco.git.askCommit")?.()
    expect(warningMessages).toContain(NO_MAIN_SESSION)
    expect(insertDraftCalls).toHaveLength(0)

    // Real main panel exists
    const repoA: GitRepository = {
      rootUri: { fsPath: "/repoA" } as any,
      async diff() {
        return ""
      },
      async status() {},
      state: {
        HEAD: { name: "feat/branch-a" },
        workingTreeChanges: [{ uri: { fsPath: "/repoA/src/fileA.ts" } as any }],
        indexChanges: [],
      },
    }
    const repoB: GitRepository = {
      rootUri: { fsPath: "/repoB" } as any,
      async diff() {
        return ""
      },
      async status() {},
      state: {
        HEAD: { name: "feat/branch-b" },
        workingTreeChanges: [{ uri: { fsPath: "/repoB/src/fileB.ts" } as any }],
        indexChanges: [],
      },
    }

    repositories.push(repoA, repoB)

    const mainEntry = {
      role: "main",
      binding: { sessionId: "session-real", directory: "/repoA" },
    } as unknown as Entry
    entries = [mainEntry]

    // Run askCommit with main panel (directory /repoA picks repoA)
    await registeredCommands.get("oco.git.askCommit")?.()
    expect(insertDraftCalls).toHaveLength(1)
    expect(insertDraftCalls[0].entry).toBe(mainEntry)
    expect(insertDraftCalls[0].text).toContain("feat/branch-a")
    expect(insertDraftCalls[0].text).toContain("src/fileA.ts")
    expect(insertDraftCalls[0].source).toEqual({
      kind: "gitDiff",
      scope: "working",
      files: 1,
      truncated: false,
    })

    // scm/title passes { rootUri: { fsPath: "/repoB" } } -> picks repoB
    await registeredCommands.get("oco.git.commitWithOpenCode")?.({ rootUri: { fsPath: "/repoB" } })
    expect(insertDraftCalls).toHaveLength(2)
    expect(insertDraftCalls[1].text).toContain("feat/branch-b")
    expect(insertDraftCalls[1].text).toContain("src/fileB.ts")

    // oco.git.openScm executes workbench.view.scm
    await registeredCommands.get("oco.git.openScm")?.()
    expect(executedCommands).toContainEqual({
      command: "workbench.view.scm",
      args: [],
    })

    for (const d of disposables) d.dispose()
    expect(registeredCommands.size).toBe(0)
  })
})
