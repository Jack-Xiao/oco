// Last finished command per terminal, from shell integration. Output is read on start (the stream
// only contains data written after read()) and published on end. Nothing here sends a message.

import * as vscode from "vscode"
import type { Disposable, Terminal, TerminalShellExecution } from "vscode"
import { DRAFT_MAX_LINES, NO_FINISHED_TERMINAL, bindTerminalDraftSource, pickPanel, truncateTail, type DraftPanels, type PreparedDraft } from "./add-to-draft"
import type { DraftSource } from "@oco/contracts"

type VSCode = typeof import("vscode")
function vs(): VSCode {
  return vscode
}

/** Hard cap so a noisy command cannot grow the capture without bound. Format still line-truncates. */
const TERMINAL_BUFFER_CHARS = 256 * 1024

export type TerminalSnapshot = { command: string; exitCode?: number; output: string }

/** Drop ANSI/CSI/OSC sequences. `\r\n` stays a newline; a bare `\r` keeps only the overwritten tail. */
export function stripAnsi(input: string): string {
  const stripped = input
    .replace(/\u001B\][\s\S]*?(?:\u0007|\u001B\\)/g, "")
    .replace(/\u009D[\s\S]*?(?:\u0007|\u001B\\)/g, "")
    .replace(/\u001B\[[\x30-\x3F]*[\x20-\x2F]*[\x40-\x7E]/g, "")
    .replace(/\u009B[\x30-\x3F]*[\x20-\x2F]*[\x40-\x7E]/g, "")
    .replace(/\u001B[\x40-\x5F]/g, "")
  return stripped
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => {
      const cut = line.lastIndexOf("\r")
      return cut >= 0 ? line.slice(cut + 1) : line
    })
    .join("\n")
}

export function formatTerminalOutput(
  input: { command: string; exitCode?: number; output: string },
  opts?: { maxLines?: number },
): { text: string; source: DraftSource } {
  const shown = input.command.replace(/[\r\n]+/g, " ").replace(/`/g, "'").trim()
  const exit = typeof input.exitCode === "number" ? ` (exit ${input.exitCode})` : ""
  const header = `Terminal: \`${shown}\`${exit}`
  const stripped = stripAnsi(input.output).replace(/\n$/, "")
  const body = stripped ? "```\n" + stripped + "\n```" : ""
  const clipped = body ? truncateTail(body, opts?.maxLines ?? DRAFT_MAX_LINES) : { text: "", truncated: false, total: 0 }
  const source: DraftSource = {
    kind: "terminal",
    command: input.command,
    truncated: clipped.truncated,
    ...(typeof input.exitCode === "number" ? { exitCode: input.exitCode } : {}),
  }
  return { text: clipped.text ? `${header}\n${clipped.text}` : header, source }
}

type Live = { text: string; readDone: Promise<void> }

const live = new WeakMap<TerminalShellExecution, Live>()
const finished = new Map<Terminal, TerminalSnapshot>()
const endTicket = new Map<Terminal, number>()

function pushChunk(bucket: Live, chunk: string): void {
  if (!chunk) return
  if (bucket.text.length >= TERMINAL_BUFFER_CHARS) {
    bucket.text = chunk.length >= TERMINAL_BUFFER_CHARS ? chunk.slice(-TERMINAL_BUFFER_CHARS) : bucket.text.slice(-(TERMINAL_BUFFER_CHARS - chunk.length)) + chunk
    return
  }
  bucket.text += chunk
  if (bucket.text.length > TERMINAL_BUFFER_CHARS) bucket.text = bucket.text.slice(-TERMINAL_BUFFER_CHARS)
}

function isTerminal(value: unknown): value is Terminal {
  if (!value || typeof value !== "object") return false
  return "shellIntegration" in value && "name" in value && "processId" in value
}

function resolveTerminal(arg: unknown): Terminal | undefined {
  if (isTerminal(arg)) return arg
  return vs().window.activeTerminal
}

function snapshotFor(arg: unknown): TerminalSnapshot | undefined {
  const terminal = resolveTerminal(arg)
  if (!terminal) return undefined
  return finished.get(terminal)
}

function publish(terminal: Terminal, execution: TerminalShellExecution, exitCode: number | undefined, bucket: Live | undefined, ticket: number): void {
  if (endTicket.get(terminal) !== ticket) return
  const record: TerminalSnapshot = { command: execution.commandLine.value, output: stripAnsi(bucket?.text ?? "") }
  if (typeof exitCode === "number") record.exitCode = exitCode
  finished.set(terminal, record)
  if (bucket) bucket.text = ""
}

function preparedFor(arg: unknown): PreparedDraft | "missing" {
  const snap = snapshotFor(arg)
  if (!snap) return "missing"
  return formatTerminalOutput(snap)
}

export function registerTerminalOutput(panels: DraftPanels): Disposable {
  const vscode = vs()
  bindTerminalDraftSource(() => preparedFor(undefined))
  const start = vscode.window.onDidStartTerminalShellExecution((event) => {
    let resolveDone = () => {}
    const bucket: Live = { text: "", readDone: new Promise<void>((resolve) => { resolveDone = resolve }) }
    live.set(event.execution, bucket)
    // Call read() before the first await; data written before read() is dropped by the API.
    const stream = event.execution.read()
    void (async () => {
      try {
        for await (const chunk of stream) pushChunk(bucket, chunk)
      } catch {
        // The terminal can close while the stream is still open.
      } finally {
        resolveDone()
      }
    })()
  })
  const end = vscode.window.onDidEndTerminalShellExecution((event) => {
    const ticket = (endTicket.get(event.terminal) ?? 0) + 1
    endTicket.set(event.terminal, ticket)
    const bucket = live.get(event.execution)
    if (!bucket) {
      publish(event.terminal, event.execution, event.exitCode, undefined, ticket)
      return
    }
    void bucket.readDone.then(() => publish(event.terminal, event.execution, event.exitCode, bucket, ticket))
  })
  const close = vscode.window.onDidCloseTerminal((terminal) => {
    finished.delete(terminal)
    endTicket.set(terminal, (endTicket.get(terminal) ?? 0) + 1)
  })
  const command = vscode.commands.registerCommand("oco.addTerminalOutputToDraft", async (arg?: unknown) => {
    const prepared = preparedFor(arg)
    if (prepared === "missing") {
      void vscode.window.showWarningMessage(NO_FINISHED_TERMINAL)
      return
    }
    const target = await pickPanel(panels, undefined)
    if (!target) return
    await panels.insertDraft(target, prepared.text, prepared.source)
  })
  return vscode.Disposable.from(start, end, close, command)
}
