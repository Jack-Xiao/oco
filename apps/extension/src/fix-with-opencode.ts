// "Fix with OpenCode" quick fix. The lightbulb only queues a draft; it never applies an edit or sends.

import * as vscode from "vscode"
import type { CodeActionContext, CodeActionProvider, Diagnostic, Disposable, Range, TextDocument } from "vscode"
import type { DraftSource } from "@oco/contracts"
import {
  DRAFT_MAX_LINES,
  filesExcludePatterns,
  gitignoreLines,
  isExcluded,
  pickPanel,
  truncateTail,
  workspaceRelative,
  type DraftPanels,
  type ExcludeRules,
} from "./add-to-draft"

type VSCode = typeof import("vscode")
function vs(): VSCode {
  return vscode
}

const CONTEXT_LINES = 5
const CODE_MAX_LINES = 60

export type FixDiagnosticInput = {
  message: string
  severity: "error" | "warning" | "info" | "hint"
  line: number
  column: number
  source?: string
  code?: string
}

function problemLine(path: string, item: FixDiagnosticInput): string {
  let bracket = ""
  if (item.source && item.code) bracket = ` [${item.source}(${item.code})]`
  else if (item.source) bracket = ` [${item.source}]`
  else if (item.code) bracket = ` [${item.code}]`
  const message = item.message.replace(/[\r\n]+/g, " ").trim()
  return `${path}:${item.line}:${item.column} ${item.severity}${bracket} ${message}`.trimEnd()
}

function codeExcerpt(lines: readonly string[], startLine: number, endLine: number, contextLines: number, codeMaxLines: number): string {
  if (lines.length === 0) return ""
  const lo = Math.min(startLine, endLine)
  const hi = Math.max(startLine, endLine)
  const from = Math.max(1, lo - contextLines)
  const to = Math.min(lines.length, hi + contextLines)
  const capped = Math.min(to, from + codeMaxLines - 1)
  const out: string[] = []
  for (let n = from; n <= capped; n++) out.push(`${n}|${lines[n - 1] ?? ""}`)
  return out.join("\n")
}

export function formatFix(
  input: {
    path: string
    line: number
    endLine?: number
    diagnostics: readonly FixDiagnosticInput[]
    lines?: readonly string[]
    language?: string
    excluded?: boolean
    rules?: ExcludeRules
  },
  opts?: { maxLines?: number; contextLines?: number; codeMaxLines?: number },
): { text: string; source: DraftSource } {
  const header = `Fix the following problem(s) in ${input.path}:${input.line}.`
  const excluded = input.excluded === true || (input.rules ? isExcluded(input.path, input.rules) : false)
  const parts: string[] = []
  if (input.diagnostics.length) parts.push(input.diagnostics.map((item) => problemLine(input.path, item)).join("\n"))
  if (!excluded && input.lines && input.lines.length) {
    const excerpt = codeExcerpt(input.lines, input.line, input.endLine ?? input.line, opts?.contextLines ?? CONTEXT_LINES, opts?.codeMaxLines ?? CODE_MAX_LINES)
    if (excerpt) {
      const lang = (input.language ?? "").replace(/[\r\n`]/g, "")
      parts.push("```" + lang + "\n" + excerpt + "\n```")
    }
  }
  const body = parts.join("\n")
  const clipped = body ? truncateTail(body, opts?.maxLines ?? DRAFT_MAX_LINES) : { text: "", truncated: false, total: 0 }
  const source: DraftSource = { kind: "fix", path: input.path, line: input.line, count: input.diagnostics.length, truncated: clipped.truncated }
  return { text: clipped.text ? `${header}\n${clipped.text}` : header, source }
}

function severityName(severity: Diagnostic["severity"]): FixDiagnosticInput["severity"] {
  const sev = vs().DiagnosticSeverity
  if (severity === sev.Error) return "error"
  if (severity === sev.Warning) return "warning"
  if (severity === sev.Hint) return "hint"
  return "info"
}

function codeText(code: Diagnostic["code"]): string | undefined {
  if (code === undefined || code === null) return undefined
  if (typeof code === "object") return String(code.value)
  return String(code)
}

function summarize(diagnostic: Diagnostic): FixDiagnosticInput {
  const item: FixDiagnosticInput = {
    message: diagnostic.message,
    severity: severityName(diagnostic.severity),
    line: diagnostic.range.start.line + 1,
    column: diagnostic.range.start.character + 1,
  }
  if (diagnostic.source) item.source = diagnostic.source
  const code = codeText(diagnostic.code)
  if (code) item.code = code
  return item
}

function provideFixActions(document: TextDocument, context: CodeActionContext): vscode.CodeAction[] {
  if (document.uri.scheme !== "file" || context.diagnostics.length === 0) return []
  const vscode = vs()
  if (context.only && context.only.value && !vscode.CodeActionKind.QuickFix.intersects(context.only)) return []
  const diags = context.diagnostics
  let startLine = diags[0]!.range.start.line
  let endLine = diags[0]!.range.end.line
  for (const diagnostic of diags) {
    startLine = Math.min(startLine, diagnostic.range.start.line)
    endLine = Math.max(endLine, diagnostic.range.end.line)
  }
  const action = new vscode.CodeAction("Fix with OpenCode", vscode.CodeActionKind.QuickFix)
  action.command = {
    title: "Fix with OpenCode",
    command: "oco.fixWithOpenCode",
    arguments: [document.uri, { startLine, endLine }, diags.map(summarize)],
  }
  return [action]
}

function asUri(value: unknown): vscode.Uri | undefined {
  const vscode = vs()
  if (typeof value === "string" && value) return vscode.Uri.file(value)
  if (!value || typeof value !== "object") return undefined
  const rec = value as { fsPath?: unknown; scheme?: unknown; external?: unknown }
  if (typeof rec.fsPath === "string" && rec.fsPath && (rec.scheme === undefined || rec.scheme === "file")) return vscode.Uri.file(rec.fsPath)
  if (typeof rec.external === "string" && rec.external) {
    try {
      return vscode.Uri.parse(rec.external)
    } catch {
      return undefined
    }
  }
  if (typeof rec.fsPath === "string" && rec.fsPath) return vscode.Uri.file(rec.fsPath)
  return undefined
}

function asSeverity(value: unknown): FixDiagnosticInput["severity"] {
  if (value === "error" || value === "warning" || value === "info" || value === "hint") return value
  return "info"
}

function asDiagnostics(value: unknown): FixDiagnosticInput[] {
  if (!Array.isArray(value)) return []
  const items: FixDiagnosticInput[] = []
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue
    const rec = entry as Record<string, unknown>
    if (typeof rec.message !== "string") continue
    const item: FixDiagnosticInput = {
      message: rec.message,
      severity: asSeverity(rec.severity),
      line: typeof rec.line === "number" && rec.line >= 1 ? Math.floor(rec.line) : 1,
      column: typeof rec.column === "number" && rec.column >= 1 ? Math.floor(rec.column) : 1,
    }
    if (typeof rec.source === "string" && rec.source) item.source = rec.source
    if (typeof rec.code === "string" || typeof rec.code === "number") item.code = String(rec.code)
    items.push(item)
  }
  return items
}

function lineSpan(range: unknown, diagnostics: readonly FixDiagnosticInput[]): { line: number; endLine: number } {
  if (range && typeof range === "object") {
    const rec = range as { startLine?: unknown; endLine?: unknown; start?: { line?: unknown }; end?: { line?: unknown } }
    if (typeof rec.startLine === "number") {
      const line = rec.startLine + 1
      const endLine = typeof rec.endLine === "number" ? Math.max(line, rec.endLine + 1) : line
      return { line, endLine }
    }
    if (typeof rec.start?.line === "number") {
      const line = rec.start.line + 1
      const endLine = typeof rec.end?.line === "number" ? Math.max(line, rec.end.line + 1) : line
      return { line, endLine }
    }
  }
  if (!diagnostics.length) return { line: 1, endLine: 1 }
  const line = Math.min(...diagnostics.map((item) => item.line))
  const endLine = Math.max(...diagnostics.map((item) => item.line))
  return { line, endLine }
}

export function registerFixWithOpenCode(panels: DraftPanels): Disposable {
  const vscode = vs()
  const provider: CodeActionProvider = {
    provideCodeActions(document: TextDocument, _range: Range, context) {
      return provideFixActions(document, context)
    },
  }
  const registration = vscode.languages.registerCodeActionsProvider({ scheme: "file" }, provider, {
    providedCodeActionKinds: [vscode.CodeActionKind.QuickFix],
  })
  const command = vscode.commands.registerCommand("oco.fixWithOpenCode", async (uriArg?: unknown, rangeArg?: unknown, diagArg?: unknown) => {
    const uri = asUri(uriArg)
    if (!uri || uri.scheme !== "file") {
      void vscode.window.showWarningMessage("oco: No file for Fix with OpenCode")
      return
    }
    const diagnostics = asDiagnostics(diagArg)
    if (!diagnostics.length) {
      void vscode.window.showWarningMessage("oco: No problems to fix")
      return
    }
    const span = lineSpan(rangeArg, diagnostics)
    const rel = workspaceRelative(uri)
    const rules = { filesExclude: filesExcludePatterns(), gitignore: gitignoreLines() }
    const excluded = isExcluded(rel, rules)
    let lines: string[] | undefined
    let language: string | undefined
    if (!excluded) {
      try {
        const doc = await vscode.workspace.openTextDocument(uri)
        lines = doc.getText().split(/\r?\n/)
        language = doc.languageId
      } catch {
        lines = undefined
      }
    }
    const formatted = formatFix({ path: rel, line: span.line, endLine: span.endLine, diagnostics, lines, language, excluded })
    const target = await pickPanel(panels, undefined)
    if (!target) return
    await panels.insertDraft(target, formatted.text, formatted.source)
  })
  return vscode.Disposable.from(registration, command)
}
