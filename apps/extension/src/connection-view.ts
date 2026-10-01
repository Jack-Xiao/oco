import * as vscode from "vscode"
import type { ConnectionSummary } from "@oco/contracts"
import { connectionRows, type ServerInfo } from "./diagnostics"

export const CONNECTION_VIEW = "oco.connection"

/**
 * Read-only Connection view under Sessions, collapsed by default. Besides showing the connection facts,
 * it keeps Sessions its own header: VS Code folds a container's only view into the container title.
 */
export class ConnectionView implements vscode.TreeDataProvider<vscode.TreeItem>, vscode.Disposable {
  private readonly changed = new vscode.EventEmitter<void>()
  readonly onDidChangeTreeData = this.changed.event
  private readonly view: vscode.TreeView<vscode.TreeItem>
  private summary: ConnectionSummary | undefined
  private info: ServerInfo | undefined

  constructor() {
    this.view = vscode.window.createTreeView(CONNECTION_VIEW, { treeDataProvider: this })
  }

  setConnection(s: ConnectionSummary) {
    this.summary = s
    this.changed.fire()
  }

  setServerInfo(info: ServerInfo) {
    this.info = info
    this.changed.fire()
  }

  getTreeItem(e: vscode.TreeItem) {
    return e
  }

  getChildren(e?: vscode.TreeItem): vscode.TreeItem[] {
    if (e) return []
    return connectionRows(this.summary, this.info).map((r) => {
      const item = new vscode.TreeItem(r.label)
      item.description = r.value
      item.tooltip = r.tooltip
      item.iconPath = new vscode.ThemeIcon(r.icon)
      if (r.command) item.command = { command: r.command, title: r.label }
      return item
    })
  }

  debugState() {
    return { visible: this.view.visible, rows: connectionRows(this.summary, this.info) }
  }

  dispose() {
    this.changed.dispose()
    this.view.dispose()
  }
}
