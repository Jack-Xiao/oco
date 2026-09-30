import * as vscode from "vscode"
import * as fs from "node:fs"
import type { OpenSessionRequest, SessionBinding } from "@oco/contracts"
import { Connection, type SessionInfo } from "./connection"
import { SessionStore } from "./session-store"
import { SessionFeed } from "./session-feed"
import { SessionsView, SessionItem } from "./sessions-view"
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

  // Native sidebar: one host-side event stream + snapshot per window (P1b-1).
  const store = new SessionStore((dir) => {
    try {
      return conn.ownsDirectory(dir)
    } catch {
      return false
    }
  })
  const view = new SessionsView(store, (sid) => panels.list().some((e) => e.binding.sessionId === sid && e.binding.connectionId === feed.state.connectionId))
  const feed = new SessionFeed({
    fetch: (...a) => fetch(...a),
    endpoint: () => conn.endpoint(),
    auth: () => conn.auth(),
    directory: () => conn.directory,
    trusted: () => vscode.workspace.isTrusted,
    store,
    onChange: () => view.refresh(),
    onState: (st) => {
      view.setConnection(st)
      panels.setConnection(st)
    },
    log: (m) => log.info(m),
    // E2E hook for a silent stall (proxy holds the stream but forwards nothing), outside production only.
    stallMs: context.extensionMode !== vscode.ExtensionMode.Production && Number(process.env.OCO_DEV_STALL_MS) > 0 ? Number(process.env.OCO_DEV_STALL_MS) : undefined,
  })
  panels.onChange = () => view.refresh()
  panels.onRecoveryAction = (action) => {
    if (action === "retryConnection") feed.restart()
    else if (action === "openSettings") void vscode.commands.executeCommand("oco.openSettings")
    else if (action === "showSessions") void vscode.commands.executeCommand("oco.sessions.focus")
    else void vscode.commands.executeCommand("oco.newSession")
  }
  context.subscriptions.push(view, { dispose: () => feed.stop() })

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

  /** open-session contract: same connection and workspace only; reveals the group already showing it. */
  const openSession = (req: OpenSessionRequest) => {
    if (req.connectionId !== conn.id) throw new Error("连接已变化")
    if (!conn.ownsDirectory(req.directory)) throw new Error("会话不属于当前工作区")
    return panels.open({ connectionId: req.connectionId, directory: req.directory, sessionId: req.sessionId }, req.title, vscode.ViewColumn.Active, req.focus ?? true)
  }

  const openById = async (sessionId: string) => {
    const known = store.list().find((i) => i.id === sessionId)
    if (known && feed.state.state === "connected") return openSession({ connectionId: conn.id, directory: known.directory, sessionId, title: known.title })
    const s = await conn.request<SessionInfo>("GET", `/session/${encodeURIComponent(sessionId)}`)
    return openSession({ connectionId: conn.id, directory: s.directory, sessionId: s.id, title: s.title || s.id })
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
    const dir = conn.directory
    if (!dir) throw new Error("需要先打开一个工作区文件夹")
    const sessions = await conn.request<SessionInfo[]>("GET", `/session?directory=${encodeURIComponent(dir)}&roots=true&limit=200`)
    const items = sessions
      .filter((s) => conn.ownsDirectory(s.directory))
      .sort((a, b) => (b.time?.updated ?? 0) - (a.time?.updated ?? 0))
      .map((s) => ({ label: s.title || s.id, description: s.id, session: s }))
    return (await vscode.window.showQuickPick(items, { placeHolder, matchOnDescription: true }))?.session
  }

  context.subscriptions.push(
    vscode.commands.registerCommand("oco.openSession", async (arg?: string | SessionItem) => {
      try {
        const sessionId = arg instanceof SessionItem ? arg.session.id : arg
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
        if (store.add(s)) view.refresh() // identity backfill; the session.created event is deduplicated
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
          prompt: `${ep.origin}（用户 ${ep.username}）的密码，保存在 VS Code SecretStorage（不写入 settings），仅用于该地址和用户名`,
          password: true,
        })
        if (value !== undefined) {
          await conn.setPassword(value || undefined, ep)
          feed.restart()
        }
        if (ep.cleartext) void vscode.window.showWarningMessage("oco: 该服务使用非回环 http，密码会明文传输")
      } catch (e) {
        fail("无法设置密码", e)
      }
    }),
    vscode.commands.registerCommand("oco.renameSession", async (arg?: SessionItem) => {
      try {
        if (!requireTrust("重命名会话")) return
        const item = arg instanceof SessionItem ? arg.session : undefined
        const s = item ?? (await pickSession("选择要重命名的会话"))
        if (!s) return
        const current = "title" in s && s.title ? s.title : ""
        const title = (await vscode.window.showInputBox({ prompt: "新的会话标题", value: current, validateInput: (v) => (v.trim() ? undefined : "标题不能为空") }))?.trim()
        if (!title || title === current) return
        const updated = await conn.request<SessionInfo>("PATCH", `/session/${encodeURIComponent(s.id)}`, { title }, s.directory)
        if (store.add(updated)) view.refresh()
      } catch (e) {
        fail("无法重命名会话", e)
      }
    }),
    vscode.commands.registerCommand("oco.searchSessions", async () => {
      const q = await vscode.window.showInputBox({ prompt: "在已加载的最近 200 个会话中按标题或 ID 搜索（留空清除）", value: view.search })
      if (q !== undefined) view.setSearch(q)
    }),
    vscode.commands.registerCommand("oco.clearSearch", () => view.setSearch("")),
    vscode.commands.registerCommand("oco.reconnect", () => feed.restart()),
    vscode.commands.registerCommand("oco.openSettings", () => vscode.commands.executeCommand("workbench.action.openSettings", "oco")),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("oco")) feed.restart()
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(() => feed.restart()),
    vscode.workspace.onDidGrantWorkspaceTrust(() => feed.restart()),
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

  // Diagnostics: counters and bindings only (no credentials, no message content). The E2E suites
  // read it from OCO_DEBUG_STATE_FILE, which is only honoured outside production mode.
  context.subscriptions.push(
    vscode.commands.registerCommand("oco.debugState", () => {
      const state = {
        activationId,
        trusted: vscode.workspace.isTrusted,
        panels: panels.debugState(),
        sidebar: { ...view.debugState(), feed: feed.stats, store: store.stats },
      }
      const file = process.env.OCO_DEBUG_STATE_FILE
      if (file && context.extensionMode !== vscode.ExtensionMode.Production) fs.writeFileSync(file, JSON.stringify(state, null, 2))
      else log.info(`debug state: ${JSON.stringify(state)}`)
      return state
    }),
  )

  let endpointNote = ""
  try {
    endpointNote = conn.endpoint().origin
  } catch (e) {
    endpointNote = `invalid (${(e as Error).message})`
  }
  feed.start()
  log.info(`oco activated ${activationId}; server ${endpointNote}; directory ${conn.directory ?? "(none)"}; trusted ${vscode.workspace.isTrusted}`)
}

export function deactivate() {
  // Nothing to stop: oco only attaches to servers it does not own.
}
