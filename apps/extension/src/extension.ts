import * as vscode from "vscode"
import * as fs from "node:fs"
import * as os from "node:os"
import * as childProcess from "node:child_process"
import type { OpenSessionRequest, PanelRole, ReviewIntent, SessionBinding } from "@oco/contracts"
import { Connection, type SessionInfo } from "./connection"
import { SessionStore } from "./session-store"
import { SessionFeed } from "./session-feed"
import { SessionsView } from "./sessions-view"
import { SessionsWebview, SESSIONS_VIEW } from "./sessions-webview"
import { BlobStore } from "./bridge-host"
import { KvStore } from "./host-store"
import { PanelRegistry, VIEW_TYPE, type Entry } from "./panels"
import { ManagedServer } from "./managed-server"
import { redactValue, VERIFIED_SERVER } from "./diagnostics"

let managedServer: ManagedServer | undefined

/** Keep the last lines logged by oco for the diagnostics export (they carry no message text). */
function tapLog(log: vscode.LogOutputChannel, recent: string[]) {
  for (const level of ["info", "warn", "error"] as const) {
    const orig = log[level].bind(log) as (m: string, ...a: unknown[]) => void
    ;(log as unknown as Record<string, unknown>)[level] = (m: string, ...a: unknown[]) => {
      recent.push(`${new Date().toISOString()} ${level} ${String(m).slice(0, 300)}`)
      if (recent.length > 120) recent.splice(0, recent.length - 120)
      orig(m, ...a)
    }
  }
  return log
}

export function activate(context: vscode.ExtensionContext) {
  const recentLog: string[] = []
  const log = tapLog(vscode.window.createOutputChannel("oco", { log: true }), recentLog)
  const conn = new Connection(context, log)
  conn.activeFolder = context.workspaceState.get<string>("oco.activeFolder")
  const kv = new KvStore(context.globalState, context.workspaceState)
  const panels = new PanelRegistry(context, conn, kv, new BlobStore(context), log)
  const activationId = Math.random().toString(36).slice(2, 10)
  context.subscriptions.push(log)

  let refreshVersionLater = async () => {}
  // Native sidebar: one host-side event stream + snapshot per window (P1b-1).
  const store = new SessionStore((dir) => {
    try {
      return conn.ownsDirectory(dir)
    } catch {
      return false
    }
  })
  const view = new SessionsView(store, context.workspaceState)
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
      if (st.state === "connected") void refreshVersionLater()
    },
    log: (m) => log.info(m),
    // E2E hook for a silent stall (proxy holds the stream but forwards nothing), outside production only.
    stallMs: context.extensionMode !== vscode.ExtensionMode.Production && Number(process.env.OCO_DEV_STALL_MS) > 0 ? Number(process.env.OCO_DEV_STALL_MS) : undefined,
  })
  panels.onChange = () => {
    const e = panels.active
    view.setCurrent(e && e.binding.connectionId === feed.state.connectionId ? e.binding.sessionId : undefined)
    view.refresh()
  }

  // T007 managed mode + T015 server version. One managed process per window, shared by every panel.
  let serverVersion: string | undefined
  let versionFor: string | undefined
  const pushInfo = () => {
    const info = { version: serverVersion, mode: conn.mode(), managed: managedServer?.state }
    view.setServerInfo(info)
  }
  managedServer = new ManagedServer({
    spawn: (cmd, args, opts) => childProcess.spawn(cmd, args, opts),
    binary: () => conn.opencodePath(),
    cwd: () => conn.directory,
    env: () => process.env,
    log: (m) => log.info(m),
    onState: (st) => {
      log.info(`managed server: ${st.status}${st.error ? ` (${st.error})` : ""}`)
      pushInfo()
    },
  })
  conn.managed = managedServer
  const startManaged = async (notify = true) => {
    if (conn.mode() !== "managed") return
    if (!vscode.workspace.isTrusted) {
      managedServer!.state = { status: "failed", error: "Managed server does not start in Restricted Mode (it starts after you trust the workspace)" }
      pushInfo()
      feed.restart()
      return
    }
    try {
      await managedServer!.start()
    } catch (e) {
      if (notify)
        void vscode.window.showErrorMessage(`oco: Failed to start the managed server (${(e as Error).message})`, "Open Settings", "Show Log").then((a) => {
          if (a === "Open Settings") void vscode.commands.executeCommand("workbench.action.openSettings", "oco.opencodePath")
          else if (a === "Show Log") log.show()
        })
    }
    feed.restart()
  }
  refreshVersionLater = async () => refreshVersion()
  const refreshVersion = async () => {
    const st = feed.state
    if (st.state !== "connected" || !st.connectionId || versionFor === st.connectionId) return
    versionFor = st.connectionId
    try {
      serverVersion = (await conn.request<{ version?: string }>("GET", "/global/health")).version
    } catch {
      serverVersion = undefined
    }
    log.info(`server version ${serverVersion ?? "unknown"} (verified ${VERIFIED_SERVER})`)
    pushInfo()
  }

  // T007 multi-root: one active folder at a time for the sidebar and new sessions.
  const updateFolderChrome = () => {
    const folders = conn.folders()
    const multi = folders.length > 1
    void vscode.commands.executeCommand("setContext", "oco.multiRoot", multi)
    view.setFolderLabel(multi && conn.directory ? vscode.workspace.workspaceFolders?.find((f) => f.uri.fsPath === conn.directory)?.name ?? conn.directory : undefined)
  }
  updateFolderChrome()
  panels.onRecoveryAction = (action) => {
    if (action === "retryConnection") feed.restart()
    else if (action === "openSettings") void vscode.commands.executeCommand("oco.openSettings")
    else if (action === "showSessions") void vscode.commands.executeCommand("oco.sessions.focus")
    else void vscode.commands.executeCommand("oco.newSession")
  }
  context.subscriptions.push(view, { dispose: () => feed.stop() })
  const searchSessions = (q: string) => {
    view.setSearch(q)
    // The server searches titles across the whole history; matches merge into the list.
    if (q.trim()) void feed.search(q.trim())
  }
  // The sidebar list is a webview; retained while hidden so reopening the sidebar never rebuilds it.
  const webList = new SessionsWebview(view, context.extensionUri, searchSessions, conn)
  context.subscriptions.push(webList, vscode.window.registerWebviewViewProvider(SESSIONS_VIEW, webList, { webviewOptions: { retainContextWhenHidden: true } }))

  const fail = (what: string, e: unknown) => void vscode.window.showErrorMessage(`oco: ${what} (${(e as Error).message})`)
  const requireTrust = (what: string) => {
    if (vscode.workspace.isTrusted) return true
    void vscode.window.showWarningMessage(`oco: Cannot ${what} in Restricted Mode (workspace is not trusted)`)
    return false
  }

  /** Session -> binding, only if it belongs to this workspace on the configured connection. */
  const bindingFor = (s: SessionInfo): SessionBinding => {
    if (!conn.ownsDirectory(s.directory)) throw new Error("Session is not in the current workspace")
    return { connectionId: conn.id, directory: s.directory, sessionId: s.id }
  }

  /** open-session contract: same connection and workspace only; reveals the panel already showing it,
   *  otherwise switches the main panel (or, with newPanel, opens a pinned one). ADR-007. */
  const openSession = (req: OpenSessionRequest, newPanel = false) => {
    if (req.connectionId !== conn.id) throw new Error("Connection changed")
    if (!conn.ownsDirectory(req.directory)) throw new Error("Session is not in the current workspace")
    return panels.open(
      { connectionId: req.connectionId, directory: req.directory, sessionId: req.sessionId },
      req.title,
      vscode.ViewColumn.Active,
      req.focus ?? true,
      newPanel,
      req.review,
    )
  }

  const openById = async (sessionId: string, newPanel = false, review?: ReviewIntent) => {
    const known = store.list().find((i) => i.id === sessionId)
    if (known && feed.state.state === "connected")
      return openSession({ connectionId: conn.id, directory: known.directory, sessionId, title: known.title, review }, newPanel)
    const s = await conn.request<SessionInfo>("GET", `/session/${encodeURIComponent(sessionId)}`)
    return openSession({ connectionId: conn.id, directory: s.directory, sessionId: s.id, title: s.title || s.id, review }, newPanel)
  }

  // A page asked to show another session (internal tab, child session link, shortcut...): the host
  // decides, and only for a session of the same connection and project. The main panel switches to it
  // (a pinned panel's link also goes to the main panel); a panel already showing it is focused.
  panels.onOpenSession = (from: Entry, sessionId: string) => {
    void (async () => {
      try {
        if (from.binding.connectionId !== conn.id) throw new Error("Connection changed")
        const s = await conn.request<SessionInfo>("GET", `/session/${encodeURIComponent(sessionId)}`, undefined, from.binding.directory)
        if (s.directory !== from.binding.directory) throw new Error("Session is not in the same project")
        panels.open({ connectionId: conn.id, directory: s.directory, sessionId: s.id }, s.title || s.id)
      } catch (e) {
        fail("Could not open session", e)
      }
    })()
  }

  const pickSession = async (placeHolder: string) => {
    const dir = conn.directory
    if (!dir) throw new Error("Open a workspace folder first")
    const sessions = await conn.request<SessionInfo[]>("GET", `/session?directory=${encodeURIComponent(dir)}&roots=true&limit=200`)
    const items = sessions
      .filter((s) => conn.ownsDirectory(s.directory))
      .sort((a, b) => (b.time?.updated ?? 0) - (a.time?.updated ?? 0))
      .map((s) => ({ label: s.title || s.id, description: s.id, session: s }))
    return (await vscode.window.showQuickPick(items, { placeHolder, matchOnDescription: true }))?.session
  }

  /** A session id, or the webview list's context-menu argument (`{ sessionId }`). */
  const rowId = (arg: unknown): string | undefined =>
    typeof arg === "string" ? arg
    : arg && typeof arg === "object" && typeof (arg as { sessionId?: unknown }).sessionId === "string" ? (arg as { sessionId: string }).sessionId
    : undefined
  const rowItem = (arg: unknown) => {
    const id = rowId(arg)
    return id === undefined ? undefined : store.list().find((i) => i.id === id)
  }

  context.subscriptions.push(
    vscode.commands.registerCommand("oco.openSession", async (arg?: unknown) => {
      try {
        const sessionId = rowId(arg)
        if (typeof sessionId === "string") return void (await openById(sessionId))
        const s = await pickSession("Select an OpenCode session to open")
        if (s) panels.open(bindingFor(s), s.title || s.id)
      } catch (e) {
        fail("Could not open session", e)
      }
    }),
    // Result card (cockpit step 2): show the session and open the page's review (diff) panel, on `file` when given.
    vscode.commands.registerCommand("oco.openSessionReview", async (arg?: unknown, file?: unknown) => {
      try {
        const sessionId = rowId(arg)
        if (typeof sessionId !== "string") return
        await openById(sessionId, false, { file: typeof file === "string" && file ? file : undefined })
      } catch (e) {
        fail("Could not open session", e)
      }
    }),
    vscode.commands.registerCommand("oco.openSessionInNewPanel", async (arg?: unknown) => {
      try {
        const sessionId = rowId(arg)
        if (typeof sessionId === "string") return void (await openById(sessionId, true))
        const s = await pickSession("Which OpenCode session should open in a new panel?")
        if (s) panels.open(bindingFor(s), s.title || s.id, vscode.ViewColumn.Active, true, true)
      } catch (e) {
        fail("Could not open session", e)
      }
    }),
    vscode.commands.registerCommand("oco.newSession", async () => {
      try {
        if (!requireTrust("create a session")) return
        if (!conn.directory) throw new Error("Open a workspace folder first")
        const s = await conn.request<SessionInfo>("POST", "/session", {})
        if (store.add(s)) view.refresh() // identity backfill; the session.created event is deduplicated
        panels.open(bindingFor(s), s.title || "New Session")
        return s.id
      } catch (e) {
        fail("Could not create session", e)
      }
    }),
    vscode.commands.registerCommand("oco.addSelectionToDraft", async (targetSessionId?: string) => {
      const editor = vscode.window.activeTextEditor
      if (!editor) return void vscode.window.showWarningMessage("oco: No active editor")
      const open = panels.list()
      if (open.length === 0) return void vscode.window.showWarningMessage("oco: Open a session tab first")
      let target = typeof targetSessionId === "string" ? open.find((e) => e.binding.sessionId === targetSessionId) : undefined
      if (!target) {
        // Always explicit: the user picks the session (the last active one is only listed first).
        const last = panels.active
        const items = [...open]
          .sort((a) => (a === last ? -1 : 1))
          .map((e) => ({ label: e.panel.title, description: e.binding.sessionId, e }))
        target = (await vscode.window.showQuickPick(items, { placeHolder: "Add to which session draft? (not sent automatically)", matchOnDescription: true }))?.e
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
        if (conn.mode() === "managed") return void vscode.window.showInformationMessage("oco: Managed mode generates a random password on each start and keeps it in memory only. Nothing to set.")
        const ep = conn.endpoint()
        const value = await vscode.window.showInputBox({
          prompt: `Password for ${ep.origin} (user ${ep.username}). Stored in VS Code Secret Storage (not in settings), and only for this address and username.`,
          password: true,
        })
        if (value !== undefined) {
          await conn.setPassword(value || undefined, ep)
          feed.restart()
        }
        if (ep.cleartext) void vscode.window.showWarningMessage("oco: This server uses non-loopback HTTP. The password is sent in clear text.")
      } catch (e) {
        fail("Could not set password", e)
      }
    }),
    vscode.commands.registerCommand("oco.renameSession", async (arg?: unknown) => {
      try {
        if (!requireTrust("rename a session")) return
        const item = rowItem(arg)
        const s = item ?? (await pickSession("Select a session to rename"))
        if (!s) return
        const current = "title" in s && s.title ? s.title : ""
        const title = (await vscode.window.showInputBox({ prompt: "New session title", value: current, validateInput: (v) => (v.trim() ? undefined : "Title cannot be empty") }))?.trim()
        if (!title || title === current) return
        const updated = await conn.request<SessionInfo>("PATCH", `/session/${encodeURIComponent(s.id)}`, { title }, s.directory)
        if (store.add(updated)) view.refresh()
      } catch (e) {
        fail("Could not rename session", e)
      }
    }),
    vscode.commands.registerCommand("oco.archiveSession", async (arg?: unknown) => {
      try {
        if (!requireTrust("archive a session")) return
        const item = rowItem(arg)
        const s = item ?? (await pickSession("Select a session to archive"))
        if (!s) return
        const updated = await conn.request<SessionInfo>("PATCH", `/session/${encodeURIComponent(s.id)}`, { time: { archived: Date.now() } }, s.directory)
        for (const e of panels.list()) if (e.binding.sessionId === s.id) e.panel.dispose()
        if (store.add(updated)) view.refresh()
      } catch (e) {
        fail("Could not archive session", e)
      }
    }),
    vscode.commands.registerCommand("oco.deleteSession", async (arg?: unknown) => {
      try {
        if (!requireTrust("delete a session")) return
        const item = rowItem(arg)
        const s = item ?? (await pickSession("Select a session to delete"))
        if (!s) return
        const title = "title" in s && s.title ? s.title : s.id
        const ok = await vscode.window.showWarningMessage(`Delete session "${title}"?`, { modal: true, detail: "The session will be permanently deleted from the server and cannot be recovered." }, "Delete")
        if (ok !== "Delete") return
        await conn.request("DELETE", `/session/${encodeURIComponent(s.id)}`, undefined, s.directory)
        for (const e of panels.list()) if (e.binding.sessionId === s.id) e.panel.dispose()
        if (store.applyEvent({ type: "session.deleted", properties: { sessionID: s.id } })) view.refresh()
      } catch (e) {
        fail("Could not delete session", e)
      }
    }),
    vscode.commands.registerCommand("oco.searchSessions", () => webList.showSearch()),
    vscode.commands.registerCommand("oco.loadMoreSessions", () => feed.loadMore()),
    vscode.commands.registerCommand("oco.clearSearch", () => view.setSearch("")),
    vscode.commands.registerCommand("oco.reconnect", () => feed.restart()),
    vscode.commands.registerCommand("oco.openSettings", () => vscode.commands.executeCommand("workbench.action.openSettings", "oco")),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (!e.affectsConfiguration("oco")) return
      versionFor = undefined
      if (e.affectsConfiguration("oco.serverMode") || e.affectsConfiguration("oco.opencodePath")) {
        void managedServer!.stop().then(() => (conn.mode() === "managed" ? startManaged() : (pushInfo(), feed.restart())))
      } else feed.restart()
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      versionFor = undefined
      updateFolderChrome()
      if (conn.mode() === "managed") void managedServer!.stop().then(() => startManaged())
      else feed.restart()
    }),
    vscode.workspace.onDidGrantWorkspaceTrust(() => (conn.mode() === "managed" ? void startManaged() : feed.restart())),
    vscode.commands.registerCommand("oco.restartManagedServer", async () => {
      if (conn.mode() !== "managed") {
        const a = await vscode.window.showInformationMessage("oco: Attached mode does not manage the server process. Set oco.serverMode to managed to let oco start the server.", "Open Settings")
        if (a) void vscode.commands.executeCommand("workbench.action.openSettings", "oco.serverMode")
        return
      }
      versionFor = undefined
      await managedServer!.stop()
      await startManaged()
    }),
    vscode.commands.registerCommand("oco.stopManagedServer", async () => {
      if (conn.mode() !== "managed") return void vscode.window.showInformationMessage("oco: Not in managed mode. oco will not stop an external server.")
      await managedServer!.stop()
      feed.restart()
    }),
    vscode.commands.registerCommand("oco.showLog", () => log.show()),
    vscode.commands.registerCommand("oco.selectFolder", async (fsPath?: string) => {
      const folders = (vscode.workspace.workspaceFolders ?? []).filter((f) => f.uri.scheme === "file")
      if (folders.length < 2) return void vscode.window.showInformationMessage("oco: This workspace has only one folder")
      const target =
        typeof fsPath === "string" && folders.some((f) => f.uri.fsPath === fsPath)
          ? fsPath
          : (
              await vscode.window.showQuickPick(
                folders.map((f) => ({ label: f.name, description: f.uri.fsPath, picked: f.uri.fsPath === conn.directory, fsPath: f.uri.fsPath })),
                { placeHolder: "Which folder should the sidebar and new sessions use? (Open session tabs are not affected)" },
              )
            )?.fsPath
      if (!target || target === conn.directory) return
      conn.activeFolder = target
      await context.workspaceState.update("oco.activeFolder", target)
      log.info(`active folder switched (${folders.findIndex((f) => f.uri.fsPath === target) + 1}/${folders.length})`)
      updateFolderChrome()
      feed.restart()
    }),
    vscode.commands.registerCommand("oco.exportDiagnostics", async () => {
      const content = JSON.stringify(await diagnostics(), null, 2)
      // E2E reads the export from a file (outside production only), like OCO_DEBUG_STATE_FILE.
      const file = process.env.OCO_DIAGNOSTICS_FILE
      if (file && context.extensionMode !== vscode.ExtensionMode.Production) fs.writeFileSync(file, content)
      const doc = await vscode.workspace.openTextDocument({ language: "json", content })
      await vscode.window.showTextDocument(doc)
      void vscode.window.showInformationMessage("oco: Diagnostics exported (no passwords, auth headers, or message bodies). Review before sharing.")
    }),
    vscode.window.registerWebviewPanelSerializer(VIEW_TYPE, {
      async deserializeWebviewPanel(panel, state: { binding?: SessionBinding; role?: PanelRole } | undefined) {
        const b = state?.binding
        // Restore only panels of the currently configured connection and this workspace.
        if (!b?.sessionId || b.connectionId !== conn.id || !conn.ownsDirectory(b.directory)) {
          log.warn("not restoring panel: binding does not match current connection/workspace")
          panel.dispose()
          return
        }
        panel.webview.options = { enableScripts: true, localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, "media")] }
        panels.attach(panel, b, panel.title, state?.role === "pinned" ? "pinned" : "main")
      },
    }),
  )

  /** T015 export: versions, settings shape, connection state and recent oco log lines, all redacted. */
  const diagnostics = async () => {
    const cfg = vscode.workspace.getConfiguration("oco")
    let passwordStored = false
    let endpoint: unknown = null
    try {
      const ep = conn.endpoint()
      endpoint = { origin: ep.origin, loopback: ep.host === "127.0.0.1" || ep.host === "localhost" || ep.host === "::1", managed: !!ep.managed, cleartextRemote: ep.cleartext }
      passwordStored = !!(await conn.password(ep))
    } catch (e) {
      endpoint = { error: (e as Error).message }
    }
    const pkg = context.extension.packageJSON as { version?: string }
    const raw = {
      generatedAt: new Date().toISOString(),
      oco: { version: pkg.version, mode: vscode.ExtensionMode[context.extensionMode] },
      vscode: { version: vscode.version, remoteName: vscode.env.remoteName ?? null, uiKind: vscode.UIKind[vscode.env.uiKind], appHost: vscode.env.appHost },
      host: { platform: process.platform, arch: process.arch, release: os.release(), node: process.version },
      settings: { serverMode: conn.mode(), serverUrl: cfg.get("serverUrl"), serverUsernameCustom: cfg.get("serverUsername", "opencode") !== "opencode", opencodePath: cfg.get("opencodePath") || "(PATH)" },
      endpoint,
      passwordStored,
      server: { version: serverVersion ?? null, verified: VERIFIED_SERVER },
      managed: managedServer?.state ?? null,
      workspace: { folders: (vscode.workspace.workspaceFolders ?? []).length, trusted: vscode.workspace.isTrusted },
      connection: feed.state,
      sidebar: { feed: feed.stats, store: store.stats, items: store.size },
      panels: panels.list().map((e) => ({ role: e.role, visible: e.panel.visible })),
      recentLog: recentLog.slice(-80),
    }
    const secrets = [managedServer?.password ?? ""]
    try {
      const pw = await conn.password()
      if (pw) secrets.push(pw)
    } catch {}
    return redactValue(raw, { home: os.homedir(), extra: secrets })
  }

  // Diagnostics: counters and bindings only (no credentials, no message content). The E2E suites
  // read it from OCO_DEBUG_STATE_FILE, which is only honoured outside production mode.
  context.subscriptions.push(
    vscode.commands.registerCommand("oco.debugState", () => {
      const state = {
        activationId,
        trusted: vscode.workspace.isTrusted,
        panels: panels.debugState(),
        sidebar: (() => {
          const web = webList.debugState()
          // `visible` / `message` keep the names the native tree used: the view's visibility and its state text.
          return { ...view.debugState(), visible: web.visible, message: web.notice ?? (web.view === "message" ? web.text : null), feed: feed.stats, store: store.stats, webList: web }
        })(),
        managed: managedServer?.state ?? null,
        serverVersion: serverVersion ?? null,
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
  if (conn.mode() === "managed") void startManaged()
  pushInfo()
  log.info(`oco activated ${activationId}; server ${endpointNote}; directory ${conn.directory ?? "(none)"}; trusted ${vscode.workspace.isTrusted}`)
}

export function deactivate() {
  // Only the process oco started itself (managed mode) is stopped; attached servers are never touched.
  return managedServer?.stop()
}
