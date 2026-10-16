// M21 Git actions v1, card 11, ADR-009 §4: oco never runs git; the commands render a prompt template with
// repository context from the built-in Git extension and queue it as a draft in the main panel's session over
// the M05 draft.insert channel, never sent automatically; "Open SCM" only reveals VS Code's own Source Control view.

import * as path from "node:path"
import * as vscode from "vscode"
import type { Disposable } from "vscode"
import type { DraftSource } from "@oco/contracts"
import type { Entry } from "./panels"
import { gitApi, type DraftPanels, type GitApi, type GitRepository } from "./add-to-draft"

// Same pattern as add-to-draft.ts: unit tests mock the "vscode" module; the pure functions never touch it.
type VSCode = typeof import("vscode")
function vs(): VSCode {
  return vscode
}

export const GIT_FILES_MAX = 20
export type GitActionKind = "commit" | "pr"

export type GitPromptContext = {
  /** Current branch (short commit for a detached HEAD); undefined when unknown. */
  branch?: string
  /** Repo-relative changed files (working tree + index + merge + untracked), deduped, forward slashes. */
  files?: string[]
  /** Total changed files when known (may exceed files.length). */
  count?: number
  /** Whether there are uncommitted changes; undefined when unknown. */
  dirty?: boolean
}

export const NO_MAIN_SESSION = "oco: Open a session in the main panel first"

export const DEFAULT_COMMIT_PROMPT = [
  "Commit the current changes in this repository.",
  "Branch: ${branch}",
  "Changed files (${count}):",
  "${files}",
  "",
  "Review the diff with git first, group related changes into one or more commits with concise conventional commit messages (subject under 72 characters, body saying why), and run the commits yourself. Do not push.",
].join("\n")

export const DEFAULT_PR_PROMPT = [
  "Open a pull request for the current branch.",
  "Branch: ${branch}",
  "Uncommitted changes (${count}):",
  "${files}",
  "",
  "If there are uncommitted changes, commit them first. Push the branch and open the pull request with the gh CLI (or this repository's equivalent) with a title under 70 characters, a summary of what changed and why, and how it was tested. Do not merge it. Report the pull request URL when done.",
].join("\n")

/** Pure. Replaces only ${branch} ${files} ${count}; any other ${…} stays as written. */
export function renderGitPrompt(template: string, ctx: GitPromptContext): string {
  const branchReplacement = ctx.branch ?? ""
  const n = ctx.count ?? ctx.files?.length
  const countReplacement = n === undefined ? "" : String(n)

  const list = ctx.files ?? []
  let filesReplacement = ""
  if (list.length > 0) {
    const total = ctx.count ?? list.length
    const shown = list.slice(0, GIT_FILES_MAX).map((f) => `- ${f}`)
    if (total > shown.length) {
      shown.push(`- … and ${total - shown.length} more`)
    }
    filesReplacement = shown.join("\n")
  }

  return template.replace(/\$\{(branch|files|count)\}/g, (_, key: string) => {
    if (key === "branch") return branchReplacement
    if (key === "count") return countReplacement
    if (key === "files") return filesReplacement
    return _
  })
}

/** Draft metadata over the existing contract (no new DraftSource kind). */
export function gitPromptSource(ctx: GitPromptContext): DraftSource {
  const total = ctx.count ?? ctx.files?.length ?? 0
  return {
    kind: "gitDiff",
    scope: "working",
    files: total,
    truncated: total > GIT_FILES_MAX,
  }
}

/** rootPath (SourceControl.rootUri.fsPath from scm/title) wins; else the deepest repository whose root contains `directory`; else the first. */
export function pickRepository(
  repos: readonly GitRepository[],
  hint: { rootPath?: string; directory?: string },
): GitRepository | undefined {
  if (repos.length === 0) return undefined
  if (hint.rootPath) {
    const matched = repos.find((r) => r.rootUri?.fsPath === hint.rootPath)
    if (matched) return matched
  }
  if (hint.directory) {
    let best: GitRepository | undefined
    let bestLen = -1
    for (const r of repos) {
      const root = r.rootUri?.fsPath
      if (!root) continue
      const rel = path.relative(root, hint.directory)
      const contains = rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel))
      if (contains && root.length > bestLen) {
        best = r
        bestLen = root.length
      }
    }
    if (best) return best
  }
  return repos[0]
}

export async function readGitContext(
  hint: { rootPath?: string; directory?: string } = {},
  api: () => Promise<GitApi | undefined> = gitApi,
): Promise<GitPromptContext> {
  const a = await api().catch(() => undefined)
  const repo = a ? pickRepository(a.repositories, hint) : undefined
  if (!repo) return {}

  try {
    await repo.status()
  } catch {}

  const head = repo.state.HEAD
  const branch = head?.name ?? (head?.commit ? head.commit.slice(0, 7) : undefined)
  const changes = [
    ...(repo.state.workingTreeChanges ?? []),
    ...(repo.state.indexChanges ?? []),
    ...(repo.state.mergeChanges ?? []),
    ...(repo.state.untrackedChanges ?? []),
  ]

  const seen = new Set<string>()
  const files: string[] = []
  for (const c of changes) {
    if (!c?.uri?.fsPath || !repo.rootUri?.fsPath) continue
    const rel = path.relative(repo.rootUri.fsPath, c.uri.fsPath).split(path.sep).join("/")
    if (!seen.has(rel)) {
      seen.add(rel)
      files.push(rel)
    }
  }

  return {
    branch,
    files,
    count: files.length,
    dirty: files.length > 0,
  }
}

/** The main panel's entry when it shows a real session (a draft page has none yet). */
export function mainSessionEntry(panels: DraftPanels): Entry | undefined {
  return panels.list().find((e) => e.role === "main" && !e.binding.draft)
}

export type GitActionDeps = {
  panels: DraftPanels
  /** The prompt template for a kind (settings, falling back to the defaults). */
  template(kind: GitActionKind): string
  /** The built-in git extension API; defaults to gitApi() (tests inject a fake). */
  api?: () => Promise<GitApi | undefined>
}

/** Returns one Disposable per command (spread into context.subscriptions, like registerExportSession). */
export function registerGitActions(deps: GitActionDeps): Disposable[] {
  async function run(kind: GitActionKind, arg?: unknown): Promise<void> {
    const target = mainSessionEntry(deps.panels)
    if (!target) {
      void vs().window.showWarningMessage(NO_MAIN_SESSION)
      return
    }
    // scm/title passes the SourceControl (rootUri); the palette passes nothing.
    const rootUri = arg && typeof arg === "object" ? (arg as { rootUri?: { fsPath?: unknown } }).rootUri : undefined
    const rootPath = typeof rootUri?.fsPath === "string" ? rootUri.fsPath : undefined
    const ctx = await readGitContext({ rootPath, directory: target.binding.directory }, deps.api ?? gitApi)
    await deps.panels.insertDraft(target, renderGitPrompt(deps.template(kind), ctx), gitPromptSource(ctx))
  }

  return [
    vs().commands.registerCommand("oco.git.askCommit", (arg?: unknown) => run("commit", arg)),
    vs().commands.registerCommand("oco.git.commitWithOpenCode", (arg?: unknown) => run("commit", arg)),
    vs().commands.registerCommand("oco.git.askOpenPR", (arg?: unknown) => run("pr", arg)),
    vs().commands.registerCommand("oco.git.openScm", () => vs().commands.executeCommand("workbench.view.scm")),
  ]
}
