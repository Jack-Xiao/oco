import * as vscode from "vscode"
import * as path from "node:path"
import type { ServerEvent } from "./session-store"
import type { Entry } from "./panels"

export type FollowModeDeps = {
  panels: {
    active: Entry | undefined
    onDidChangeActiveSession: vscode.Event<{ sessionId?: string; draft?: boolean } | undefined>
  }
  showTextDocument?: (uri: vscode.Uri, options: vscode.TextDocumentShowOptions) => Promise<unknown>
  getActiveTextEditor?: () => vscode.TextEditor | undefined
  getSessionDirectory?: (sessionId: string) => string | undefined
  /** False once the session has no open oco panel; Follow then turns off for it. */
  isOpen?: (sessionId: string) => boolean
  now?: () => number
}

function isEditTool(tool: string): boolean {
  const t = tool.toLowerCase()
  return t.includes("edit") || t.includes("write") || t.includes("patch")
}

export class FollowModeManager implements vscode.Disposable {
  private readonly followedSessions = new Set<string>()
  private readonly statusBarItem: vscode.StatusBarItem
  private readonly subs: vscode.Disposable[] = []

  private lastOpenedFile: string | undefined
  private lastOpenedTime = 0
  private lastUserEditTime = 0

  constructor(private readonly deps: FollowModeDeps) {
    const align = vscode.StatusBarAlignment?.Right ?? 2
    this.statusBarItem = vscode.window.createStatusBarItem(align, 100)
    this.statusBarItem.command = "oco.follow.toggle"
    this.statusBarItem.text = "$(eye) Follow"
    this.statusBarItem.tooltip = "Click to stop following OpenCode edits"

    this.subs.push(
      this.statusBarItem,
      this.deps.panels.onDidChangeActiveSession(() => {
        if (this.deps.isOpen) for (const id of [...this.followedSessions]) if (!this.deps.isOpen(id)) this.followedSessions.delete(id)
        this.updateUi()
      }),
      vscode.workspace.onDidChangeTextDocument((e) => {
        // The agent's disk writes reload documents without dirtying them; typing in the active editor does.
        const active = (this.deps.getActiveTextEditor ?? (() => vscode.window.activeTextEditor))()
        if (e.contentChanges.length > 0 && e.document.isDirty && active?.document === e.document) {
          this.lastUserEditTime = this.now()
        }
      }),
    )

    this.updateUi()
  }

  private now(): number {
    return this.deps.now ? this.deps.now() : Date.now()
  }

  isFollowing(sessionId: string): boolean {
    return this.followedSessions.has(sessionId)
  }

  isFollowingActive(): boolean {
    const curId = this.deps.panels.active?.binding?.sessionId
    return Boolean(curId && this.followedSessions.has(curId))
  }

  toggle(sessionId?: string): boolean {
    const targetId = sessionId ?? this.deps.panels.active?.binding?.sessionId
    if (!targetId) {
      void vscode.window.showWarningMessage("oco: No active session")
      return false
    }

    let enabled: boolean
    if (this.followedSessions.has(targetId)) {
      this.followedSessions.delete(targetId)
      enabled = false
    } else {
      this.followedSessions.add(targetId)
      enabled = true
    }

    this.updateUi()
    return enabled
  }

  updateUi(): void {
    const active = this.isFollowingActive()
    void vscode.commands.executeCommand("setContext", "oco.follow.active", active)
    if (active) {
      this.statusBarItem.show()
    } else {
      this.statusBarItem.hide()
    }
  }

  recordUserEdit(time?: number): void {
    this.lastUserEditTime = time ?? this.now()
  }

  async onEvent(e: ServerEvent): Promise<void> {
    if (e.type !== "message.part.updated") return
    const p = (e.properties ?? {}) as Record<string, unknown>
    const part = p.part as Record<string, unknown> | undefined
    if (!part || typeof part !== "object") return
    if (part.type !== "tool") return

    const sessionId = (part.sessionID ?? p.sessionID) as string | undefined
    if (!sessionId || !this.followedSessions.has(sessionId)) return
    if (this.deps.isOpen && !this.deps.isOpen(sessionId)) {
      this.followedSessions.delete(sessionId)
      this.updateUi()
      return
    }

    const toolName = String(part.tool ?? part.name ?? "")
    if (!isEditTool(toolName)) return

    const input = (part.state as Record<string, unknown> | undefined)?.input ?? (part.input as Record<string, unknown> | undefined)
    const rawPath = (input as Record<string, unknown> | undefined)?.filePath ?? (input as Record<string, unknown> | undefined)?.path
    if (typeof rawPath !== "string" || rawPath.length === 0) return

    const now = this.now()

    // 1. Check user recent edit in active text editor (within 2 seconds)
    if (now - this.lastUserEditTime < 2000) return

    // 2. Check active text editor unsaved changes (dirty)
    const activeEditor = this.deps.getActiveTextEditor ? this.deps.getActiveTextEditor() : vscode.window.activeTextEditor
    if (activeEditor?.document?.isDirty) return

    // 3. Resolve absolute path
    const dir =
      this.deps.getSessionDirectory?.(sessionId) ??
      this.deps.panels.active?.binding.directory ??
      vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ??
      ""
    const fullPath = path.isAbsolute(rawPath) ? rawPath : path.resolve(dir, rawPath)

    // 4. Same file 750 ms throttle
    if (this.lastOpenedFile === fullPath && now - this.lastOpenedTime < 750) return

    this.lastOpenedFile = fullPath
    this.lastOpenedTime = now

    // 5. Determine editor column (non-oco panel column)
    const panelColumn = this.deps.panels.active?.panel?.viewColumn
    const ViewColumnBeside = vscode.ViewColumn?.Beside ?? -1
    const ViewColumnOne = vscode.ViewColumn?.One ?? 1
    const ViewColumnTwo = vscode.ViewColumn?.Two ?? 2
    let targetColumn = ViewColumnBeside
    if (panelColumn !== undefined) {
      if (panelColumn === ViewColumnOne) {
        targetColumn = ViewColumnTwo
      } else {
        targetColumn = ViewColumnOne
      }
    }

    const uri = vscode.Uri.file(fullPath)
    try {
      if (this.deps.showTextDocument) {
        await this.deps.showTextDocument(uri, { viewColumn: targetColumn, preview: true, preserveFocus: true })
      } else {
        const doc = await vscode.workspace.openTextDocument(uri)
        await vscode.window.showTextDocument(doc, { viewColumn: targetColumn, preview: true, preserveFocus: true })
      }
    } catch {
      // A write tool announces its path before the file exists on disk; forget the attempt so the next update of the part retries.
      this.lastOpenedFile = undefined
    }
  }

  dispose() {
    for (const s of this.subs) s.dispose()
    this.statusBarItem.dispose()
  }
}

export function registerFollowMode(deps: FollowModeDeps): { manager: FollowModeManager; disposables: vscode.Disposable[] } {
  const manager = new FollowModeManager(deps)
  const cmd = vscode.commands.registerCommand("oco.follow.toggle", () => {
    manager.toggle()
  })
  const cmdOff = vscode.commands.registerCommand("oco.follow.toggleOff", () => {
    manager.toggle()
  })
  return {
    manager,
    disposables: [manager, cmd, cmdOff],
  }
}
