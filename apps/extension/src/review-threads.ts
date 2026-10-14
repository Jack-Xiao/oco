import * as vscode from "vscode"
import * as fs from "node:fs"
import * as path from "node:path"
import type { ReviewNotes, ReviewNote } from "./review-notes"
import type { Entry } from "./panels"

export type ReviewThreadsDeps = {
  reviewNotes: ReviewNotes
  panels: {
    active: Entry | undefined
    onDidChangeActiveSession: vscode.Event<{ sessionId?: string; draft?: boolean } | undefined>
    list(): Entry[]
  }
  getWorkspaceRoot?: () => string | undefined
  createCommentController?: (id: string, label: string) => vscode.CommentController
}

class FallbackRange {
  readonly start: { line: number; character: number }
  readonly end: { line: number; character: number }
  readonly startLine: number
  readonly startCol: number
  readonly endLine: number
  readonly endCol: number

  constructor(startLine: number, startCol: number, endLine: number, endCol: number) {
    this.startLine = startLine
    this.startCol = startCol
    this.endLine = endLine
    this.endCol = endCol
    this.start = { line: startLine, character: startCol }
    this.end = { line: endLine, character: endCol }
  }
}

function createRange(startLine: number, startCol: number, endLine: number, endCol: number): vscode.Range {
  const RangeCtor = vscode.Range ?? FallbackRange
  return new (RangeCtor as any)(startLine, startCol, endLine, endCol)
}

export class ReviewThreadsController implements vscode.Disposable {
  readonly controller: vscode.CommentController
  private readonly threadsByNoteId = new Map<string, vscode.CommentThread>()
  private readonly noteIdByThread = new Map<vscode.CommentThread, string>()
  private readonly subs: vscode.Disposable[] = []

  constructor(private readonly deps: ReviewThreadsDeps, controllerId = "oco.reviewNotes") {
    const createCtrl =
      this.deps.createCommentController ??
      (vscode.comments?.createCommentController ? vscode.comments.createCommentController.bind(vscode.comments) : undefined)
    if (!createCtrl) {
      throw new Error("vscode.comments.createCommentController is not available")
    }
    this.controller = createCtrl(controllerId, "oco review notes")
    this.controller.commentingRangeProvider = {
      provideCommentingRanges(document: vscode.TextDocument): vscode.Range[] {
        if (document.uri.scheme !== "file") return []
        const lines = Math.max(0, document.lineCount - 1)
        return [createRange(0, 0, lines, 0)]
      },
    }

    this.subs.push(
      this.controller,
      this.deps.reviewNotes.onDidChange(() => {
        this.sync()
      }),
      this.deps.panels.onDidChangeActiveSession(() => {
        this.sync()
      }),
    )

    this.sync()
  }

  /** Notes keep `asRelativePath(uri, false)` paths: relative to their workspace folder, not to the session directory. */
  private resolveNotePath(rel: string): string {
    for (const f of vscode.workspace.workspaceFolders ?? []) {
      const p = path.join(f.uri.fsPath, rel)
      if (fs.existsSync(p)) return p
    }
    return path.resolve(this.workspaceRoot(), rel)
  }

  private workspaceRoot(): string {
    if (this.deps.getWorkspaceRoot) return this.deps.getWorkspaceRoot() ?? ""
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? ""
  }

  sync(): void {
    const active = this.deps.panels.active?.binding
    if (!active || active.draft) {
      this.clearAllThreads()
      return
    }

    const currentNotes = this.deps.reviewNotes.list(active.connectionId, active.sessionId)
    const currentNoteIds = new Set(currentNotes.map((n) => n.id))

    // Dispose threads that no longer exist for this session
    for (const [noteId, thread] of this.threadsByNoteId) {
      if (!currentNoteIds.has(noteId)) {
        thread.dispose()
        this.noteIdByThread.delete(thread)
        this.threadsByNoteId.delete(noteId)
      }
    }

    // Create or update threads
    for (const note of currentNotes) {
      if (this.threadsByNoteId.has(note.id)) {
        continue
      }

      const fullPath = path.isAbsolute(note.path) ? note.path : this.resolveNotePath(note.path)
      const uri = vscode.Uri.file(fullPath)
      const startLine = Math.max(0, note.startLine - 1)
      const endLine = Math.max(startLine, note.endLine - 1)
      const range = createRange(startLine, 0, endLine, 0)

      const MarkdownStringCtor = vscode.MarkdownString ?? (class { constructor(public value: string) {} } as any)
      const previewMode = vscode.CommentMode?.Preview ?? 1
      const comment: vscode.Comment = {
        body: new MarkdownStringCtor(note.comment || note.snippet || ""),
        mode: previewMode,
        author: { name: "oco" },
        contextValue: "oco.reviewNote",
      }

      const thread = this.controller.createCommentThread(uri, range, [comment])
      thread.collapsibleState = vscode.CommentThreadCollapsibleState?.Collapsed ?? 0
      thread.label = "oco review note"
      thread.contextValue = "oco.reviewNote"

      this.threadsByNoteId.set(note.id, thread)
      this.noteIdByThread.set(thread, note.id)
    }
  }

  private clearAllThreads(): void {
    for (const thread of this.threadsByNoteId.values()) {
      thread.dispose()
    }
    this.threadsByNoteId.clear()
    this.noteIdByThread.clear()
  }

  getThread(noteId: string): vscode.CommentThread | undefined {
    return this.threadsByNoteId.get(noteId)
  }

  getNoteId(thread: vscode.CommentThread): string | undefined {
    return this.noteIdByThread.get(thread)
  }

  removeNote(target: string | vscode.CommentThread): boolean {
    const noteId = typeof target === "string" ? target : this.noteIdByThread.get(target)
    if (!noteId) return false
    return this.deps.reviewNotes.remove(noteId)
  }

  async createFromReply(reply: vscode.CommentReply): Promise<ReviewNote | undefined> {
    const active = this.deps.panels.active?.binding
    if (!active || active.draft) {
      void vscode.window.showWarningMessage("oco: No active session for review note")
      reply.thread.dispose()
      return undefined
    }

    const uri = reply.thread.uri
    const rel = vscode.workspace.asRelativePath(uri, false).replace(/\\/g, "/")
    const startLine = reply.thread.range.start.line + 1
    const endLine = reply.thread.range.end.line + 1

    let snippet = ""
    try {
      const doc = await vscode.workspace.openTextDocument(uri)
      snippet = doc.getText(reply.thread.range)
    } catch {}

    const note = this.deps.reviewNotes.add({
      connectionId: active.connectionId,
      sessionId: active.sessionId,
      path: rel,
      startLine,
      endLine,
      snippet,
      comment: reply.text,
      excluded: false,
    })

    reply.thread.dispose()
    return note
  }

  dispose() {
    this.clearAllThreads()
    for (const s of this.subs) s.dispose()
  }
}

export function registerReviewThreads(deps: ReviewThreadsDeps): {
  controller: ReviewThreadsController
  disposables: vscode.Disposable[]
} {
  const controller = new ReviewThreadsController(deps)

  const removeCmd = vscode.commands.registerCommand(
    "oco.reviewNotes.removeNote",
    (threadOrArg?: vscode.CommentThread | { thread?: vscode.CommentThread }) => {
      const thread =
        threadOrArg && typeof threadOrArg === "object" && "thread" in threadOrArg && threadOrArg.thread
          ? threadOrArg.thread
          : (threadOrArg as vscode.CommentThread | undefined)
      if (thread) {
        controller.removeNote(thread)
      }
    },
  )

  const createCmd = vscode.commands.registerCommand(
    "oco.reviewNotes.createNote",
    async (reply: vscode.CommentReply) => {
      if (reply) {
        await controller.createFromReply(reply)
      }
    },
  )

  return {
    controller,
    disposables: [controller, removeCmd, createCmd],
  }
}
