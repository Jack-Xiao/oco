import * as vscode from "vscode"
import * as fs from "node:fs"
import type { SessionBinding } from "@oco/contracts"
import { Connection, type SessionInfo } from "./connection"
import { BlobStore } from "./bridge-host"
import { KvStore } from "./host-store"
import { PanelRegistry, VIEW_TYPE, type Entry } from "./panels"

export function activate(context: vscode.ExtensionContext) {
  const log = vscode.window.createOutputChannel("oco", { log: true })
  const conn = new Connection(context, log)
  const kv = new KvStore(context.globalState, context.workspaceState)
  const panels = new PanelRegistry(context, conn, kv, new BlobStore(context), log)
  const activationId = Math.random().toString(36).slice(2, 10)
  context.subscriptions.push(log)

  const fail = (what: string, e: unknown) => void vscode.window.showErrorMessage(`oco: ${what}（${(e as Error).message}）`)
  const requireTrust = (what: string) => {
    if (vscode.workspace.isTrusted) return true
    void vscode.window.showWarningMessage(`oco: 受限模式下不能${what}（工作区未受信任）`)
    return false
  }

  /** Session -> binding, only if it belongs to this workspace on the configured connection. */
  const bindingFor = (s: SessionInfo): SessionBinding => {
    if (!conn.ownsDirectory(s.directory)) throw new Error("会话不属于当前工作区")
    return { connectionId: conn.id, directory: s.directory, sessionId: s.id }
  }

  const openById = async (sessionId: string, column?: vscode.ViewColumn) => {
    const s = await conn.request<SessionInfo>("GET", `/session/${encodeURIComponent(sessionId)}`)
    return panels.open(bindingFor(s), s.title || s.id, column)
  }

  // A page asked to show another session (internal tab, child session link, shortcut...): the host
  // decides, and only for a session of the same connection and project. It opens its own panel.
  panels.onOpenSession = (from: Entry, sessionId: string) => {
    void (async () => {
      try {
        if (from.binding.connectionId !== conn.id) throw new Error("连接已变化")
        const s = await conn.request<SessionInfo>("GET", `/session/${encodeURIComponent(sessionId)}`, undefined, from.binding.directory)
        if (s.directory !== from.binding.directory) throw new Error("会话不属于同一项目")
        panels.open({ connectionId: conn.id, directory: s.directory, sessionId: s.id }, s.title || s.id)
      } catch (e) {
        fail("无法打开会话", e)
      }
    })()
  }

  const pickSession = async (placeHolder: string) => {
    const sessions = await conn.request<SessionInfo[]>("GET", "/session")
    const items = sessions
      .filter((s) => conn.ownsDirectory(s.directory))
      .sort((a, b) => (b.time?.updated ?? 0) - (a.time?.updated ?? 0))
      .map((s) => ({ label: s.title || s.id, description: s.id, session: s }))
    return (await vscode.window.showQuickPick(items, { placeHolder, matchOnDescription: true }))?.session
  }

  context.subscriptions.push(
    vscode.commands.registerCommand("oco.openSession", async (sessionId?: string) => {
      try {
        if (typeof sessionId === "string") return void (await openById(sessionId))
        const s = await pickSession("选择要打开的 OpenCode 会话")
        if (s) panels.open(bindingFor(s), s.title || s.id)
      } catch (e) {
        fail("无法打开会话", e)
      }
    }),
    vscode.commands.registerCommand("oco.newSession", async () => {
      try {
        if (!requireTrust("创建会话")) return
        if (!conn.directory) throw new Error("需要先打开一个工作区文件夹")
        const s = await conn.request<SessionInfo>("POST", "/session", {})
        panels.open(bindingFor(s), s.title || "新会话")
        return s.id
      } catch (e) {
        fail("无法创建会话", e)
      }
    }),
    vscode.commands.registerCommand("oco.addSelectionToDraft", async (targetSessionId?: string) => {
      const editor = vscode.window.activeTextEditor
      if (!editor) return void vscode.window.showWarningMessage("oco: 没有活动编辑器")
      const open = panels.list()
      if (open.length === 0) return void vscode.window.showWarningMessage("oco: 请先打开一个会话标签页")
      let target = typeof targetSessionId === "string" ? open.find((e) => e.binding.sessionId === targetSessionId) : undefined
      if (!target) {
        // Always explicit: the user picks the session (the last active one is only listed first).
        const last = panels.active
        const items = [...open]
          .sort((a) => (a === last ? -1 : 1))
          .map((e) => ({ label: e.panel.title, description: e.binding.sessionId, e }))
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
      await panels.insertDraft(target, snippet, { path: rel, startLine, endLine, unsaved: doc.isDirty })
    }),
    vscode.commands.registerCommand("oco.setServerPassword", async () => {
      try {
        const ep = conn.endpoint()
        const value = await vscode.window.showInputBox({
          prompt: `${ep.origin}（用户 ${ep.username}）的密码，保存在 VS Code SecretStorage，仅用于该地址`,
          password: true,
        })
        if (value !== undefined) await conn.setPassword(value || undefined, ep)
        if (ep.cleartext) void vscode.window.showWarningMessage("oco: 该服务使用非回环 http，密码会明文传输")
      } catch (e) {
        fail("无法设置密码", e)
      }
    }),
    vscode.window.registerWebviewPanelSerializer(VIEW_TYPE, {
      async deserializeWebviewPanel(panel, state: { binding?: SessionBinding } | undefined) {
        const b = state?.binding
        // Restore only panels of the currently configured connection and this workspace.
        if (!b?.sessionId || b.connectionId !== conn.id || !conn.ownsDirectory(b.directory)) {
          log.warn("not restoring panel: binding does not match current connection/workspace")
          panel.dispose()
          return
        }
        panel.webview.options = { enableScripts: true, localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, "media")] }
        panels.attach(panel, b, panel.title)
      },
    }),
  )

  // Development/test only: host state dump for the E2E suites. Not registered in production.
  if (context.extensionMode !== vscode.ExtensionMode.Production) {
    void vscode.commands.executeCommand("setContext", "oco.dev", true)
    context.subscriptions.push(
      vscode.commands.registerCommand("oco.debugState", () => {
        const state = { activationId, trusted: vscode.workspace.isTrusted, panels: panels.debugState() }
        const file = process.env.OCO_DEBUG_STATE_FILE
        if (file) fs.writeFileSync(file, JSON.stringify(state, null, 2))
        return state
      }),
    )
  }

  let endpointNote = ""
  try {
    endpointNote = conn.endpoint().origin
  } catch (e) {
    endpointNote = `invalid (${(e as Error).message})`
  }
  log.info(`oco activated ${activationId}; server ${endpointNote}; directory ${conn.directory ?? "(none)"}; trusted ${vscode.workspace.isTrusted}`)
}

export function deactivate() {
  // Nothing to stop: oco only attaches to servers it does not own.
}
