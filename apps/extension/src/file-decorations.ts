import * as vscode from "vscode"
import * as path from "node:path"
import type { SessionStore, FileChange } from "./session-store"
import type { Entry } from "./panels"

export type FileDecorationsDeps = {
  store: SessionStore
  panels: {
    list(): Entry[]
    onDidChangeActiveSession?: vscode.Event<any>
    onChange?: () => void
  }
  isConfigEnabled?: () => boolean
}

function normPath(p: string): string {
  const n = path.normalize(p)
  return process.platform === "win32" ? n.toLowerCase() : n
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

const ThemeColorClass =
  vscode.ThemeColor ??
  (class ThemeColor {
    constructor(public readonly id: string) {}
  } as any)

export class OcoFileDecorationProvider implements vscode.FileDecorationProvider, vscode.Disposable {
  private readonly _onDidChangeFileDecorations = new EventEmitterClass<vscode.Uri | vscode.Uri[] | undefined>()
  readonly onDidChangeFileDecorations: vscode.Event<vscode.Uri | vscode.Uri[] | undefined> = this._onDidChangeFileDecorations.event

  private decoratedFiles = new Map<string, { title: string; uri: vscode.Uri }>()
  private readonly subs: vscode.Disposable[] = []

  constructor(private readonly deps: FileDecorationsDeps) {
    if (this.deps.panels.onDidChangeActiveSession) {
      this.subs.push(this.deps.panels.onDidChangeActiveSession(() => this.refresh()))
    }
    this.refresh()
  }

  private isEnabled(): boolean {
    if (this.deps.isConfigEnabled) return this.deps.isConfigEnabled()
    return vscode.workspace.getConfiguration("oco.decorations").get<boolean>("changedFiles", true)
  }

  refresh(): void {
    if (!this.isEnabled()) {
      if (this.decoratedFiles.size > 0) {
        this.decoratedFiles.clear()
        this._onDidChangeFileDecorations.fire(undefined)
      }
      return
    }

    const next = new Map<string, { title: string; uri: vscode.Uri }>()
    const openPanels = this.deps.panels.list()
    for (const entry of openPanels) {
      if (entry.binding.draft) continue
      const sessionId = entry.binding.sessionId
      const directory = entry.binding.directory
      const title = entry.panel.title || sessionId
      const files = this.deps.store.changedFiles(sessionId)
      if (Array.isArray(files)) {
        for (const f of files) {
          if (!f || typeof f.file !== "string" || f.file.length === 0) continue
          const fullPath = path.isAbsolute(f.file) ? f.file : path.resolve(directory, f.file)
          const uri = vscode.Uri.file(fullPath)
          next.set(normPath(fullPath), { title, uri })
        }
      }
    }

    let changed = next.size !== this.decoratedFiles.size
    if (!changed) {
      for (const [key, val] of next) {
        const prev = this.decoratedFiles.get(key)
        if (!prev || prev.title !== val.title) {
          changed = true
          break
        }
      }
    }

    if (changed) {
      this.decoratedFiles = next
      this._onDidChangeFileDecorations.fire(undefined)
    }
  }

  provideFileDecoration(uri: vscode.Uri, _token: vscode.CancellationToken): vscode.ProviderResult<vscode.FileDecoration> {
    if (!this.isEnabled()) return undefined
    if (uri.scheme !== "file") return undefined

    const info = this.decoratedFiles.get(normPath(uri.fsPath))
    if (!info) return undefined

    return {
      badge: "O",
      tooltip: `Changed by oco session: ${info.title}`,
      color: new ThemeColorClass("gitDecoration.modifiedResourceForeground"),
    }
  }

  dispose() {
    this._onDidChangeFileDecorations.dispose()
    for (const s of this.subs) s.dispose()
  }
}

export function registerFileDecorations(deps: FileDecorationsDeps): { provider: OcoFileDecorationProvider; disposables: vscode.Disposable[] } {
  const provider = new OcoFileDecorationProvider(deps)
  const reg = vscode.window.registerFileDecorationProvider(provider)

  const configSub = vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration("oco.decorations.changedFiles")) {
      provider.refresh()
    }
  })

  return {
    provider,
    disposables: [provider, reg, configSub],
  }
}
