import * as vscode from "vscode"
import { Connection, type SessionInfo } from "./connection"
import { HostStore } from "./bridge-host"
import { PanelRegistry, VIEW_TYPE } from "./panels"
import type { SessionBinding } from "@oco/contracts"

export function activate(context: vscode.ExtensionContext) {
  const log = vscode.window.createOutputChannel("oco", { log: true })
  const conn = new Connection(context, log)
  const store = new HostStore(context)
  const panels = new PanelRegistry(context, conn, store, log)
  context.subscriptions.push(log)

  const binding = (s: SessionInfo): SessionBinding => ({ connectionId: conn.id, directory: s.directory, sessionId: s.id })

  const pickSession = async (placeHolder: string) => {
    const sessions = await conn.request<SessionInfo[]>("GET", "/session")
    const items = sessions
      .filter((s) => !conn.directory || s.directory === conn.directory)
      .sort((a, b) => (b.time?.updated ?? 0) - (a.time?.updated ?? 0))
      .map((s) => ({ label: s.title || s.id, description: s.id, session: s }))
    return (await vscode.window.showQuickPick(items, { placeHolder, matchOnDescription: true }))?.session
  }

  const openById = async (sessionId: string) => {
    const s = await conn.request<SessionInfo>("GET", `/session/${encodeURIComponent(sessionId)}`)
    return panels.open(binding(s), s.title || s.id)
  }

  context.subscriptions.push(
    vscode.commands.registerCommand("oco.openSession", async (sessionId?: string) => {
      try {
        if (typeof sessionId === "string") return void (await openById(sessionId))
        const s = await pickSession("选择要打开的 OpenCode 会话")
        if (s) panels.open(binding(s), s.title || s.id)
      } catch (e) {
        void vscode.window.showErrorMessage(`oco: 无法打开会话（${(e as Error).message}）`)
      }
    }),
    vscode.commands.registerCommand("oco.newSession", async () => {
      try {
        if (!conn.directory) throw new Error("需要先打开一个工作区文件夹")
        const s = await conn.request<SessionInfo>("POST", "/session", {})
        panels.open(binding(s), s.title || "新会话")
        return s.id
      } catch (e) {
        void vscode.window.showErrorMessage(`oco: 无法创建会话（${(e as Error).message}）`)
      }
    }),
    vscode.commands.registerCommand("oco.addSelectionToDraft", async (targetSessionId?: string) => {
      const editor = vscode.window.activeTextEditor
      if (!editor) return void vscode.window.showWarningMessage("oco: 没有活动编辑器")
      const open = panels.list()
      if (open.length === 0) return void vscode.window.showWarningMessage("oco: 请先打开一个会话标签页")
      let target = typeof targetSessionId === "string" ? open.find((e) => e.binding.sessionId === targetSessionId) : undefined
      if (!target) {
        // Always explicit: the user picks the session (the last active one is only pre-listed first).
        const last = panels.active
        const items = [...open].sort((a) => (a === last ? -1 : 1)).map((e) => ({ label: e.panel.title, description: e.binding.sessionId, e }))
        target = (await vscode.window.showQuickPick(items, { placeHolder: "加入到哪个会话的草稿？（不会自动发送）", matchOnDescription: true }))?.e
      }
      if (!target) return
      const doc = editor.document
      const sel = editor.selection.isEmpty ? new vscode.Range(0, 0, doc.lineCount, 0) : editor.selection
      const text = doc.getText(sel) // actual buffer content, including unsaved edits
      const rel = vscode.workspace.asRelativePath(doc.uri)
      const startLine = sel.start.line + 1
      const endLine = sel.end.line + 1
      const fence = "```"
      const snippet = `\n${rel}:${startLine}-${endLine}${doc.isDirty ? " (unsaved)" : ""}\n${fence}${doc.languageId}\n${text}\n${fence}\n`
      panels.insertDraft(target, snippet, { path: rel, startLine, endLine, unsaved: doc.isDirty })
    }),
    vscode.commands.registerCommand("oco.setServerPassword", async () => {
      const value = await vscode.window.showInputBox({ prompt: "OpenCode 服务密码（保存在 VS Code SecretStorage）", password: true })
      if (value !== undefined) await conn.setPassword(value || undefined)
    }),
    vscode.commands.registerCommand("oco.debugState", () =>
      panels.list().map((e) => ({ sessionId: e.binding.sessionId, title: e.panel.title, visible: e.panel.visible, ready: e.ready, epoch: e.bridge.epoch, stats: e.bridge.stats })),
    ),
    vscode.window.registerWebviewPanelSerializer(VIEW_TYPE, {
      async deserializeWebviewPanel(panel, state: { binding?: SessionBinding } | undefined) {
        if (!state?.binding?.sessionId) {
          panel.dispose()
          return
        }
        panel.webview.options = { enableScripts: true, localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, "media")] }
        panels.attach(panel, state.binding, panel.title)
      },
    }),
  )
  log.info(`oco activated; server ${conn.baseUrl}; directory ${conn.directory ?? "(none)"}`)
}

export function deactivate() {
  // Nothing to stop: oco only attaches to servers it does not own.
}
