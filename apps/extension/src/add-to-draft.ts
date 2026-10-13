// "oco: Add to Draft…" — Problems and Git diff into a session draft.
// Pure formatters are separated from the vscode command so unit tests do not need the extension host.
// Exclusion is a simplified gitignore: *, **, trailing-slash directories, leading-/ anchor, and ! negation
// (later matching rules override earlier ones). files.exclude is applied before .gitignore lines.
// Truncation keeps the tail (T011) and always leaves the source line above the notice.

import * as fs from "node:fs"
import * as path from "node:path"
import * as vscode from "vscode"
import type { DraftSource } from "@oco/contracts"
import type { Diagnostic, Disposable, QuickPickItem, Uri } from "vscode"
import type { Entry } from "./panels"

// The bundle is CommonJS (esbuild --format=cjs), where `import.meta.url` is empty, so no createRequire here:
// unit tests mock the "vscode" module instead (see tests/unit/add-to-draft.test.ts).
type VSCode = typeof import("vscode")
function vs(): VSCode {
  return vscode
}

export const DRAFT_MAX_LINES = 400

export type ProblemItem = {
  path: string
  line: number
  column: number
  severity: "error" | "warning" | "info" | "hint"
  message: string
  source?: string
  code?: string
  excluded: boolean
}

export type ExcludeRules = { filesExclude: string[]; gitignore: string[] }

type Panels = {
  list(): Entry[]
  active: Entry | undefined
  insertDraft(entry: Entry, text: string, source: DraftSource): Promise<void>
}

type SourceId = "problems-file" | "problems-all" | "git-working" | "git-staged"

/** Count logical lines. A single trailing newline does not add an empty line. */
function splitLines(text: string): string[] {
  if (text === "") return []
  const lines = text.split("\n")
  if (lines[lines.length - 1] === "") lines.pop()
  return lines
}

export function truncateTail(text: string, maxLines: number): { text: string; truncated: boolean; total: number } {
  const lines = splitLines(text)
  const total = lines.length
  if (total <= maxLines) return { text, truncated: false, total }
  const kept = lines.slice(Math.max(0, total - maxLines))
  return { text: `… showing last ${maxLines} of ${total} lines\n${kept.join("\n")}`, truncated: true, total }
}

function normPath(p: string): string {
  return p.replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\/+/, "")
}

type ParsedRule = { negated: boolean; pattern: string; anchored: boolean }

function parseRule(raw: string): ParsedRule | null {
  let s = raw.trim()
  if (!s || s.startsWith("#")) return null
  let negated = false
  if (s.startsWith("!")) {
    negated = true
    s = s.slice(1).trim()
    if (!s) return null
  }
  if (s.endsWith("/") && !s.endsWith("\\/")) s = s.slice(0, -1)
  if (!s) return null
  let anchored = false
  if (s.startsWith("/")) {
    anchored = true
    s = s.slice(1)
    if (!s) return null
  }
  return { negated, pattern: s, anchored }
}

function escapeLiteral(c: string): string {
  return "\\^$.+?()[]{}|".includes(c) ? `\\${c}` : c
}

// `*` stays inside one path segment. `**` crosses segments. A trailing double-star matches the rest.
function globToRegexBody(pattern: string): string {
  let out = ""
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i]
    if (c === "\\") {
      const n = pattern[i + 1]
      if (n === undefined) {
        out += "\\\\"
        continue
      }
      out += escapeLiteral(n)
      i++
      continue
    }
    if (c === "*") {
      if (pattern[i + 1] === "*") {
        if (pattern[i + 2] === "/") {
          out += "(?:[^/]+/)*"
          i += 2 // the loop's i++ then consumes the slash already represented above
          continue
        }
        out += ".*"
        i += 1
        continue
      }
      out += "[^/]*"
      continue
    }
    out += escapeLiteral(c)
  }
  return out
}

function ruleMatches(relPath: string, rule: ParsedRule): boolean {
  const body = globToRegexBody(rule.pattern)
  const rooted = rule.anchored || rule.pattern.includes("/")
  const source = rooted ? `^${body}(?:/.*)?$` : `(?:^|/)${body}(?:/.*)?$`
  try {
    return new RegExp(source).test(relPath)
  } catch {
    return false
  }
}

export function isExcluded(relPath: string, rules: ExcludeRules): boolean {
  const rel = normPath(relPath)
  let excluded = false
  for (const raw of [...rules.filesExclude, ...rules.gitignore]) {
    const rule = parseRule(raw)
    if (!rule) continue
    if (ruleMatches(rel, rule)) excluded = !rule.negated
  }
  return excluded
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

function formatProblemLine(item: ProblemItem): string {
  let bracket = ""
  if (item.source && item.code) bracket = ` [${item.source}(${item.code})]`
  else if (item.source) bracket = ` [${item.source}]`
  else if (item.code) bracket = ` [${item.code}]`
  const message = item.message.replace(/[\r\n]+/g, " ").trim()
  return `${item.path}:${item.line}:${item.column} ${item.severity}${bracket} ${message}`.trimEnd()
}

function problemsHeader(scope: "file" | "all", items: ProblemItem[]): string {
  const count = plural(items.length, "problem", "problems")
  if (scope === "file") return `Problems (current file: ${items[0]?.path ?? ""}, ${count})`
  return `Problems (all files, ${count})`
}

function withHeader(header: string, body: string, maxLines: number): { text: string; truncated: boolean } {
  if (!body) return { text: header, truncated: false }
  const clipped = truncateTail(body, maxLines)
  return { text: `${header}\n${clipped.text}`, truncated: clipped.truncated }
}

export function formatProblems(
  items: ProblemItem[],
  scope: "file" | "all",
  opts?: { maxLines?: number },
): { text: string; source: DraftSource } {
  const groups = new Map<string, ProblemItem[]>()
  for (const item of items) {
    const list = groups.get(item.path)
    if (list) list.push(item)
    else groups.set(item.path, [item])
  }
  const bodyLines: string[] = []
  for (const [file, group] of groups) {
    if (group.some((g) => g.excluded)) {
      bodyLines.push(`${file} (excluded, ${group.length} problems)`)
      continue
    }
    for (const item of group) bodyLines.push(formatProblemLine(item))
  }
  const clipped = withHeader(problemsHeader(scope, items), bodyLines.join("\n"), opts?.maxLines ?? DRAFT_MAX_LINES)
  const source: DraftSource = {
    kind: "problems",
    scope,
    count: items.length,
    truncated: clipped.truncated,
    ...(scope === "file" && items[0] ? { path: items[0].path } : {}),
  }
  return { text: clipped.text, source }
}

type DiffChunk = { pathA: string; pathB: string; text: string }

function takeQuoted(s: string): { value: string; consumed: number } {
  let out = ""
  let i = 1
  while (i < s.length) {
    if (s[i] === "\\" && i + 1 < s.length) {
      out += s[i + 1]
      i += 2
      continue
    }
    if (s[i] === '"') return { value: out, consumed: i + 1 }
    out += s[i]
    i++
  }
  return { value: out, consumed: s.length }
}

function stripDiffPrefix(p: string): string {
  return p.startsWith("a/") || p.startsWith("b/") ? p.slice(2) : p
}

function parseDiffHeader(line: string): { a: string; b: string } {
  const rest = line.slice("diff --git ".length)
  let rawA: string
  let rawB: string
  if (rest.startsWith('"')) {
    const a = takeQuoted(rest)
    const after = rest.slice(a.consumed).trim()
    rawA = a.value
    rawB = after.startsWith('"') ? takeQuoted(after).value : after
  } else {
    const sp = rest.indexOf(" ")
    rawA = sp < 0 ? rest : rest.slice(0, sp)
    rawB = sp < 0 ? "" : rest.slice(sp + 1).trim()
  }
  return { a: stripDiffPrefix(rawA), b: stripDiffPrefix(rawB) }
}

function splitDiff(diff: string): DiffChunk[] {
  const normalized = diff.replace(/\r\n/g, "\n").replace(/\n$/, "")
  if (!normalized) return []
  const groups: string[][] = []
  let current: string[] | null = null
  for (const line of normalized.split("\n")) {
    if (line.startsWith("diff --git ") || !current) {
      current = [line]
      groups.push(current)
      continue
    }
    current.push(line)
  }
  return groups.map((lines) => {
    const header = lines[0]?.startsWith("diff --git ") ? lines[0] : ""
    const paths = header ? parseDiffHeader(header) : { a: "", b: "" }
    return { pathA: paths.a, pathB: paths.b, text: lines.join("\n") }
  })
}

function excludedPath(chunk: DiffChunk, files: { path: string; excluded: boolean }[]): string | null {
  const a = normPath(chunk.pathA)
  const b = normPath(chunk.pathB)
  for (const file of files) {
    if (!file.excluded) continue
    const p = normPath(file.path)
    if (p && (p === a || p === b)) return p
  }
  return null
}

function gitHeader(scope: "working" | "staged", files: number): string {
  const which = scope === "working" ? "Git working tree diff" : "Git staged diff"
  return `${which} (${plural(files, "file", "files")})`
}

function renderGitBody(diff: string, files: { path: string; excluded: boolean }[]): string {
  const chunks = splitDiff(diff)
  if (chunks.length === 0) return ""
  const kept: string[] = []
  const notes: string[] = []
  for (const chunk of chunks) {
    const excluded = excludedPath(chunk, files)
    if (excluded) notes.push(`${excluded} (excluded)`)
    else kept.push(chunk.text)
  }
  const parts: string[] = []
  if (kept.length) parts.push("```diff\n" + kept.join("\n") + "\n```")
  parts.push(...notes)
  return parts.join("\n")
}

export function formatGitDiff(
  input: { diff: string; files: Array<{ path: string; excluded: boolean }>; scope: "working" | "staged" },
  opts?: { maxLines?: number },
): { text: string; source: DraftSource } {
  const clipped = withHeader(gitHeader(input.scope, input.files.length), renderGitBody(input.diff, input.files), opts?.maxLines ?? DRAFT_MAX_LINES)
  return {
    text: clipped.text,
    source: { kind: "gitDiff", scope: input.scope, files: input.files.length, truncated: clipped.truncated },
  }
}

export function filesExcludePatterns(): string[] {
  const value = vs().workspace.getConfiguration("files").get("exclude")
  if (!value || typeof value !== "object") return []
  return Object.entries(value as Record<string, unknown>)
    .filter(([, on]) => on === true)
    .map(([pattern]) => pattern)
}

export function gitignoreLines(): string[] {
  const root = vs().workspace.workspaceFolders?.[0]?.uri.fsPath
  if (!root) return []
  try {
    return fs.readFileSync(path.join(root, ".gitignore"), "utf8").split(/\r?\n/)
  } catch {
    return []
  }
}

function asRel(uri: Uri | string): string {
  return vs().workspace.asRelativePath(uri, false).replace(/\\/g, "/")
}

function severityOf(severity: Diagnostic["severity"]): ProblemItem["severity"] {
  const sev = vs().DiagnosticSeverity
  if (severity === sev.Error) return "error"
  if (severity === sev.Warning) return "warning"
  if (severity === sev.Hint) return "hint"
  return "info"
}

function diagnosticCode(code: Diagnostic["code"]): string | undefined {
  if (code === undefined || code === null) return undefined
  if (typeof code === "object") return String(code.value)
  return String(code)
}

function toProblem(rel: string, d: Diagnostic, rules: ExcludeRules): ProblemItem {
  const item: ProblemItem = {
    path: rel,
    line: d.range.start.line + 1,
    column: d.range.start.character + 1,
    severity: severityOf(d.severity),
    message: d.message,
    excluded: isExcluded(rel, rules),
  }
  if (d.source) item.source = d.source
  const code = diagnosticCode(d.code)
  if (code) item.code = code
  return item
}

function collectProblems(scope: "file" | "all", rules: ExcludeRules): ProblemItem[] | undefined {
  const vscode = vs()
  if (scope === "file") {
    const editor = vscode.window.activeTextEditor
    if (!editor) {
      void vscode.window.showWarningMessage("oco: No active editor")
      return undefined
    }
    const rel = asRel(editor.document.uri)
    return vscode.languages.getDiagnostics(editor.document.uri).map((d) => toProblem(rel, d, rules))
  }
  const items: ProblemItem[] = []
  for (const [uri, diags] of vscode.languages.getDiagnostics()) {
    const rel = asRel(uri)
    for (const d of diags) items.push(toProblem(rel, d, rules))
  }
  return items
}

type GitChange = { uri: Uri }
type GitRepository = {
  diff(cached?: boolean): Promise<string>
  state: { workingTreeChanges: readonly GitChange[]; indexChanges: readonly GitChange[] }
}
type GitApi = { repositories: readonly GitRepository[] }

async function gitApi(): Promise<GitApi | undefined> {
  const ext = vs().extensions.getExtension("vscode.git")
  if (!ext) return undefined
  try {
    if (!ext.isActive) await ext.activate()
    const exports = ext.exports as { getAPI?(version: 1): GitApi } | undefined
    return exports?.getAPI?.(1)
  } catch {
    return undefined
  }
}

async function collectDiff(staged: boolean, rules: ExcludeRules): Promise<{ diff: string; files: { path: string; excluded: boolean }[] } | undefined> {
  const api = await gitApi()
  if (!api) {
    void vs().window.showWarningMessage("oco: Git extension is not available")
    return undefined
  }
  const repo = api.repositories[0]
  if (!repo) {
    void vs().window.showWarningMessage("oco: No git repository")
    return undefined
  }
  const changes = staged ? repo.state.indexChanges : repo.state.workingTreeChanges
  const seen = new Map<string, boolean>()
  for (const change of changes) {
    const rel = asRel(change.uri)
    const excluded = isExcluded(rel, rules)
    const prev = seen.get(rel)
    if (prev === undefined) seen.set(rel, excluded)
    else if (excluded) seen.set(rel, true)
  }
  try {
    const diff = await repo.diff(staged)
    return { diff: diff ?? "", files: [...seen].map(([filePath, excluded]) => ({ path: filePath, excluded })) }
  } catch {
    void vs().window.showWarningMessage("oco: Could not read git diff")
    return undefined
  }
}

async function pickSource(): Promise<SourceId | undefined> {
  const choices: (QuickPickItem & { id: SourceId })[] = [
    { label: "Problems: current file", id: "problems-file" },
    { label: "Problems: all files", id: "problems-all" },
    { label: "Git: working tree diff", id: "git-working" },
    { label: "Git: staged diff", id: "git-staged" },
  ]
  return (await vs().window.showQuickPick(choices, { placeHolder: "Add to Draft…" }))?.id
}

async function pickPanel(panels: Panels, targetSessionId: unknown): Promise<Entry | undefined> {
  const open = panels.list()
  if (open.length === 0) {
    void vs().window.showWarningMessage("oco: Open a session tab first")
    return undefined
  }
  let target = typeof targetSessionId === "string" ? open.find((e) => e.binding.sessionId === targetSessionId) : undefined
  if (!target) {
    const last = panels.active
    const items = [...open]
      .sort((a) => (a === last ? -1 : 1))
      .map((e) => ({ label: e.panel.title, description: e.binding.sessionId, e }))
    target = (await vs().window.showQuickPick(items, { placeHolder: "Add to which session draft? (not sent automatically)", matchOnDescription: true }))?.e
  }
  return target
}

export function registerAddToDraft(panels: Panels): Disposable {
  return vs().commands.registerCommand("oco.addToDraft", async (targetSessionId?: unknown) => {
    const kind = await pickSource()
    if (!kind) return
    const target = await pickPanel(panels, targetSessionId)
    if (!target) return
    const rules = { filesExclude: filesExcludePatterns(), gitignore: gitignoreLines() }
    if (kind === "problems-file" || kind === "problems-all") {
      const scope = kind === "problems-file" ? "file" : "all"
      const items = collectProblems(scope, rules)
      if (!items) return
      if (items.length === 0) {
        void vs().window.showWarningMessage("oco: No problems to add")
        return
      }
      const formatted = formatProblems(items, scope)
      await panels.insertDraft(target, formatted.text, formatted.source)
      return
    }
    const staged = kind === "git-staged"
    const git = await collectDiff(staged, rules)
    if (!git) return
    if (!git.diff.trim()) {
      void vs().window.showWarningMessage(staged ? "oco: Staged diff is empty" : "oco: Working tree diff is empty")
      return
    }
    const formatted = formatGitDiff({ diff: git.diff, files: git.files, scope: staged ? "staged" : "working" })
    await panels.insertDraft(target, formatted.text, formatted.source)
  })
}
