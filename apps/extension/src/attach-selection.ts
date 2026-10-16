import * as vscode from "vscode"
import type { DraftChip, DraftSource } from "@oco/contracts"
import type { Entry } from "./panels"

export const AUTO_SELECTION_MAX_LINES = 400

export type SelectionInput = {
  path: string
  startLine: number
  endLine: number
  text: string
  unsaved: boolean
  auto?: boolean
}

export function chipLabel(relPath: string, startLine: number, endLine: number): string {
  const norm = relPath.replace(/\\/g, "/")
  return startLine === endLine ? `${norm}:${startLine}` : `${norm}:${startLine}-${endLine}`
}

/** 1-based lines of an editor selection. A selection that ends at column 0 of a later line (Shift+Down, select-all
 * of a file with a trailing newline) holds nothing of that line, so the label does not count it. */
export function selectionLines(sel: { start: { line: number; character: number }; end: { line: number; character: number } }): {
  startLine: number
  endLine: number
} {
  const startLine = sel.start.line + 1
  const endLine = sel.end.character === 0 && sel.end.line > sel.start.line ? sel.end.line : sel.end.line + 1
  return { startLine, endLine }
}

export function selectionChip(sel: SelectionInput): {
  text: string
  source: DraftSource
  chip: DraftChip
} {
  const normPath = sel.path.replace(/\\/g, "/")
  let text = sel.text
  if (sel.auto) {
    const lines = text.split("\n")
    if (lines.length > AUTO_SELECTION_MAX_LINES) {
      const kept = lines.slice(0, AUTO_SELECTION_MAX_LINES)
      text = `${kept.join("\n")}\n… (first ${AUTO_SELECTION_MAX_LINES} of ${lines.length} lines)`
    }
  }
  const source: DraftSource = {
    kind: "selection",
    path: normPath,
    startLine: sel.startLine,
    endLine: sel.endLine,
    unsaved: sel.unsaved,
  }
  const chip: DraftChip = {
    label: chipLabel(normPath, sel.startLine, sel.endLine),
    path: normPath,
    startLine: sel.startLine,
    endLine: sel.endLine,
    mime: "text/plain",
    ...(sel.auto ? { auto: true } : {}),
  }
  return { text, source, chip }
}

export class AutoSelectionTracker {
  private currentKey: string | undefined = undefined

  next(sel: { path: string; startLine: number; endLine: number } | null): "attach" | "clear" | "skip" {
    if (sel === null) {
      if (this.currentKey !== undefined) {
        this.currentKey = undefined
        return "clear"
      }
      return "skip"
    }

    const norm = sel.path.replace(/\\/g, "/")
    const key = `${norm}:${sel.startLine}-${sel.endLine}`
    if (key === this.currentKey) {
      return "skip"
    }
    this.currentKey = key
    return "attach"
  }

  reset(): void {
    this.currentKey = undefined
  }
}

export type AttachSelectionPanels = {
  list(): Entry[]
  active: Entry | undefined
  insertDraft(entry: Entry, text: string, source: DraftSource, chip?: DraftChip): Promise<void>
}

export type AttachSelectionDeps = {
  window?: typeof vscode.window
  workspace?: typeof vscode.workspace
  commands?: typeof vscode.commands
  debounceMs?: number
}

const ALLOWED_SCHEMES = new Set(["file", "untitled", "vscode-remote", "vscode-vfs"])

export function registerAttachSelection(
  panels: AttachSelectionPanels,
  deps?: AttachSelectionDeps,
): vscode.Disposable[] {
  const win = deps?.window ?? vscode.window
  const ws = deps?.workspace ?? vscode.workspace
  const cmds = deps?.commands ?? vscode.commands
  const debounceMs = deps?.debounceMs ?? 250

  const tracker = new AutoSelectionTracker()
  let timer: ReturnType<typeof setTimeout> | undefined

  const handleSelection = () => {
    const config = ws.getConfiguration("oco")
    if (!config.get<boolean>("draft.attachSelection", true)) return

    const editor = win.activeTextEditor
    if (!editor) return

    const scheme = editor.document.uri?.scheme
    if (!scheme || !ALLOWED_SCHEMES.has(scheme)) return

    const main = panels.list().find((e) => e.role === "main" && !e.binding.draft)
    if (!main) return

    const doc = editor.document
    const rel = ws.asRelativePath(doc.uri).replace(/\\/g, "/")
    const sel = editor.selection

    if (sel.isEmpty) {
      const action = tracker.next(null)
      if (action === "clear") {
        void panels
          .insertDraft(
            main,
            "",
            { kind: "selection", path: rel, startLine: 0, endLine: 0, unsaved: false },
            { label: "", path: rel, auto: true },
          )
          .catch(() => {})
      }
      return
    }

    const { startLine, endLine } = selectionLines(sel)
    const action = tracker.next({ path: rel, startLine, endLine })
    if (action === "attach") {
      const text = doc.getText(sel)
      const prepared = selectionChip({
        path: rel,
        startLine,
        endLine,
        text,
        unsaved: doc.isDirty,
        auto: true,
      })
      void panels.insertDraft(main, prepared.text, prepared.source, prepared.chip).catch(() => {})
    }
  }

  const triggerDebounced = () => {
    if (timer !== undefined) {
      clearTimeout(timer)
      timer = undefined
    }
    if (debounceMs <= 0) {
      handleSelection()
      return
    }
    timer = setTimeout(() => {
      timer = undefined
      handleSelection()
    }, debounceMs)
  }

  const cmdDisposable = cmds.registerCommand("oco.addSelectionToDraft", async (targetSessionId?: string) => {
    const editor = win.activeTextEditor
    if (!editor) return void win.showWarningMessage("oco: No active editor")
    const open = panels.list().filter((e) => !e.binding.draft)
    if (open.length === 0) return void win.showWarningMessage("oco: Open a session tab first")
    let target = typeof targetSessionId === "string" ? open.find((e) => e.binding.sessionId === targetSessionId) : undefined
    if (!target) {
      const last = panels.active
      const items = [...open]
        .sort((a) => (a === last ? -1 : 1))
        .map((e) => ({ label: e.panel.title, description: e.binding.sessionId, e }))
      target = (await win.showQuickPick(items, { placeHolder: "Add to which session draft? (not sent automatically)", matchOnDescription: true }))?.e
    }
    if (!target) return
    const doc = editor.document
    const empty = editor.selection.isEmpty
    const { startLine, endLine } = empty ? { startLine: 1, endLine: Math.max(1, doc.lineCount) } : selectionLines(editor.selection)
    const text = empty ? doc.getText() : doc.getText(editor.selection)
    const rel = ws.asRelativePath(doc.uri).replace(/\\/g, "/")
    const prepared = selectionChip({
      path: rel,
      startLine,
      endLine,
      text,
      unsaved: doc.isDirty,
      auto: false,
    })
    try {
      await panels.insertDraft(target, prepared.text, prepared.source, prepared.chip)
    } catch {
      // ignore
    }
  })

  const selectionDisposable = win.onDidChangeTextEditorSelection(() => {
    triggerDebounced()
  })

  const activeEditorDisposable = win.onDidChangeActiveTextEditor(() => {
    triggerDebounced()
  })

  return [
    cmdDisposable,
    selectionDisposable,
    activeEditorDisposable,
    {
      dispose: () => {
        if (timer !== undefined) {
          clearTimeout(timer)
          timer = undefined
        }
      },
    },
  ]
}
