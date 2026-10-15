// "oco: Add to Review Notes" — Review notes collection and draft insertion (M13).
import * as crypto from "node:crypto"
import * as vscode from "vscode"
import type { DraftSource } from "@oco/contracts"
import { DRAFT_MAX_LINES, filesExcludePatterns, gitignoreLines, isExcluded, truncateTail } from "./add-to-draft"
import type { Entry } from "./panels"

export const REVIEW_NOTES_KEY = "oco.reviewNotes.v1"
export const MAX_SNIPPET_LINES = 100

export type ReviewNote = {
  id: string
  connectionId: string
  sessionId: string
  path: string
  startLine: number
  endLine: number
  snippet: string
  comment: string
  excluded: boolean
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

function withHeader(header: string, body: string, maxLines: number): { text: string; truncated: boolean } {
  if (!body) return { text: header, truncated: false }
  const clipped = truncateTail(body, maxLines)
  return { text: `${header}\n${clipped.text}`, truncated: clipped.truncated }
}

export function formatReviewNotes(
  notes: ReviewNote[],
  opts?: { maxLines?: number; maxSnippetLines?: number },
): { text: string; source: DraftSource } {
  const uniqueFiles = new Set(notes.map((n) => n.path))
  const fileCount = uniqueFiles.size
  const header = `Review notes (${notes.length} on ${plural(fileCount, "file", "files")}). Snippets are from the current working tree; the before-image is Git changes (HEAD vs working tree) and may include changes not made by this session.`

  const maxSnippet = opts?.maxSnippetLines ?? MAX_SNIPPET_LINES
  let anySnippetTruncated = false

  const bodyLines: string[] = []
  for (const note of notes) {
    bodyLines.push(`${note.path}:${note.startLine}-${note.endLine}`)
    if (note.comment && note.comment.trim()) {
      bodyLines.push(note.comment.trim())
    }
    if (!note.excluded && note.snippet) {
      const sClipped = truncateTail(note.snippet, maxSnippet)
      if (sClipped.truncated) anySnippetTruncated = true
      const snippetText = sClipped.text.endsWith("\n") ? sClipped.text.slice(0, -1) : sClipped.text
      bodyLines.push(`\`\`\`\n${snippetText}\n\`\`\``)
    }
  }

  const clipped = withHeader(header, bodyLines.join("\n"), opts?.maxLines ?? DRAFT_MAX_LINES)
  const source: DraftSource = {
    kind: "reviewNotes",
    notes: notes.length,
    files: fileCount,
    truncated: anySnippetTruncated || clipped.truncated,
  }

  return { text: clipped.text, source }
}

const EventEmitterClass =
  vscode.EventEmitter ??
  (class FallbackEventEmitter<T> {
    private readonly listeners = new Set<(e: T) => any>()
    readonly event: vscode.Event<T> = (listener: (e: T) => any) => {
      this.listeners.add(listener)
      return {
        dispose: () => {
          this.listeners.delete(listener)
        },
      }
    }
    fire(data: T): void {
      for (const listener of this.listeners) {
        try {
          listener(data)
        } catch {}
      }
    }
    dispose(): void {
      this.listeners.clear()
    }
  } as any)

export class ReviewNotes implements vscode.Disposable {
  private readonly _onDidChange = new EventEmitterClass<void>()
  readonly onDidChange: vscode.Event<void> = this._onDidChange.event
  private notes: ReviewNote[] = []

  constructor(private readonly memento?: vscode.Memento) {
    this.notes = [...(memento?.get<ReviewNote[]>(REVIEW_NOTES_KEY) ?? [])]
  }

  add(note: Omit<ReviewNote, "id"> & { id?: string }): ReviewNote {
    const item: ReviewNote = {
      id: note.id ?? crypto.randomUUID(),
      connectionId: note.connectionId,
      sessionId: note.sessionId,
      path: note.path,
      startLine: note.startLine,
      endLine: note.endLine,
      snippet: note.snippet,
      comment: note.comment ?? "",
      excluded: Boolean(note.excluded),
    }
    this.notes.push(item)
    void this.memento?.update(REVIEW_NOTES_KEY, [...this.notes])
    this._onDidChange.fire()
    return item
  }

  list(connectionId: string, sessionId: string): ReviewNote[] {
    return this.notes
      .filter((n) => n.connectionId === connectionId && n.sessionId === sessionId)
      .map((n) => ({ ...n }))
  }

  count(connectionId: string, sessionId: string): number {
    return this.notes.filter((n) => n.connectionId === connectionId && n.sessionId === sessionId).length
  }

  clear(connectionId: string, sessionId: string): void {
    const before = this.notes.length
    this.notes = this.notes.filter((n) => !(n.connectionId === connectionId && n.sessionId === sessionId))
    if (this.notes.length !== before) {
      void this.memento?.update(REVIEW_NOTES_KEY, [...this.notes])
      this._onDidChange.fire()
    }
  }

  remove(id: string): boolean {
    const before = this.notes.length
    this.notes = this.notes.filter((n) => n.id !== id)
    if (this.notes.length !== before) {
      void this.memento?.update(REVIEW_NOTES_KEY, [...this.notes])
      this._onDidChange.fire()
      return true
    }
    return false
  }

  get(id: string): ReviewNote | undefined {
    const found = this.notes.find((n) => n.id === id)
    return found ? { ...found } : undefined
  }

  dispose() {
    this._onDidChange.dispose()
  }
}

type Panels = {
  list(): Entry[]
  active: Entry | undefined
  insertDraft(entry: Entry, text: string, source: DraftSource): Promise<void>
}

function sessionFromArg(arg: unknown): string | undefined {
  if (typeof arg === "string") return arg
  if (arg && typeof arg === "object" && typeof (arg as { sessionId?: unknown }).sessionId === "string") {
    return (arg as { sessionId: string }).sessionId
  }
  return undefined
}

export function registerReviewNotesCommands(
  panels: Panels,
  reviewNotes: ReviewNotes,
  conn: { id: string },
): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand("oco.addToReviewNotes", async () => {
      const editor = vscode.window.activeTextEditor
      if (!editor) {
        void vscode.window.showWarningMessage("oco: No active editor")
        return
      }
      if (editor.selection.isEmpty) {
        void vscode.window.showWarningMessage("oco: Select some code first")
        return
      }
      const open = panels.list().filter((e) => !e.binding.draft)
      if (open.length === 0) {
        void vscode.window.showWarningMessage("oco: Open a session tab first")
        return
      }
      let target = panels.active && !panels.active.binding.draft ? panels.active : undefined
      if (!target) {
        const items = open.map((e) => ({ label: e.panel.title, description: e.binding.sessionId, e }))
        target = (
          await vscode.window.showQuickPick(items, {
            placeHolder: "Add review note to which session draft?",
            matchOnDescription: true,
          })
        )?.e
      }
      if (!target) return

      const comment = await vscode.window.showInputBox({
        prompt: "Review note comment (optional)",
        placeHolder: "Enter note or feedback (optional)",
      })
      if (comment === undefined) return

      const doc = editor.document
      const sel = editor.selection
      const rel = vscode.workspace.asRelativePath(doc.uri, false).replace(/\\/g, "/")
      const startLine = sel.start.line + 1
      // A selection ending at column 0 does not include that line.
      const endLine = sel.end.character === 0 && sel.end.line > sel.start.line ? sel.end.line : sel.end.line + 1
      const snippet = doc.getText(sel)
      const rules = { filesExclude: filesExcludePatterns(), gitignore: gitignoreLines() }
      const excluded = isExcluded(rel, rules)

      reviewNotes.add({
        connectionId: target.binding.connectionId,
        sessionId: target.binding.sessionId,
        path: rel,
        startLine,
        endLine,
        snippet,
        comment,
        excluded,
      })

      const count = reviewNotes.count(target.binding.connectionId, target.binding.sessionId)
      void vscode.window.showInformationMessage(`Added review note (${count} pending for ${target.panel.title})`)
    }),

    vscode.commands.registerCommand("oco.reviewNotes.sendAll", async (arg?: unknown) => {
      const sessionId = sessionFromArg(arg) ?? panels.active?.binding.sessionId
      if (!sessionId) {
        void vscode.window.showWarningMessage("oco: No active session")
        return
      }

      const notes = reviewNotes.list(conn.id, sessionId)
      if (notes.length === 0) {
        void vscode.window.showInformationMessage("oco: No review notes for this session")
        return
      }

      let entry = panels.list().find((e) => e.binding.sessionId === sessionId && e.binding.connectionId === conn.id)
      if (!entry) {
        await vscode.commands.executeCommand("oco.openSession", sessionId)
        entry = panels.list().find((e) => e.binding.sessionId === sessionId && e.binding.connectionId === conn.id)
      }
      if (!entry) {
        void vscode.window.showWarningMessage("oco: Open a session tab first")
        return
      }

      const formatted = formatReviewNotes(notes)
      await panels.insertDraft(entry, formatted.text, formatted.source)
      reviewNotes.clear(conn.id, sessionId)
    }),

    vscode.commands.registerCommand("oco.reviewNotes.clear", async (arg?: unknown) => {
      const sessionId = sessionFromArg(arg) ?? panels.active?.binding.sessionId
      if (!sessionId) {
        void vscode.window.showWarningMessage("oco: No active session")
        return
      }

      const count = reviewNotes.count(conn.id, sessionId)
      if (count === 0) {
        void vscode.window.showInformationMessage("oco: No review notes for this session")
        return
      }

      const ok = await vscode.window.showWarningMessage(
        `Clear ${count} review note${count === 1 ? "" : "s"}?`,
        { modal: true },
        "Clear",
      )
      if (ok !== "Clear") return

      reviewNotes.clear(conn.id, sessionId)
    }),
  ]
}
