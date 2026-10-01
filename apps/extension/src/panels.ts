import * as vscode from "vscode"
import * as crypto from "node:crypto"
import * as fs from "node:fs"
import * as nodePath from "node:path"
import { BRIDGE_ORIGIN, type ConnectionSummary, type PanelRole, type SessionBinding, type WebviewInit } from "@oco/contracts"
import { BlobStore, createBridge } from "./bridge-host"
import type { Connection } from "./connection"
import type { KvStore } from "./host-store"
import { decideOpenFile, probeCaseInsensitive } from "./open-file-policy"
import { isLoopbackHost } from "./endpoint"

/** VS Code's webview focus poll interval (see Panels.settleWebviewFocus) and the slack allowed for its message. */
const FOCUS_POLL_MS = 250
const FOCUS_POLL_SLACK_MS = 60

export const VIEW_TYPE = "oco.chat"

const colorScheme = (): "light" | "dark" => {
  const k = vscode.window.activeColorTheme.kind
  return k === vscode.ColorThemeKind.Light || k === vscode.ColorThemeKind.HighContrastLight ? "light" : "dark"
}

type DraftSource = { path: string; startLine: number; endLine: number; unsaved: boolean }
type PendingDraft = { id: string; text: string; source: DraftSource }
export type Entry = {
  panel: vscode.WebviewPanel
  bridge: ReturnType<typeof createBridge>
  /** Unique per panel (one document lineage); the registry key. */
  panelId: string
  /** ADR-007: "main" follows the sidebar and switches session in place; "pinned" keeps one session. */
  role: PanelRole
  /** The session the panel currently shows (a main panel's binding changes on switch). */
  binding: SessionBinding
  panelKey: string
  ready: boolean
  route?: string
  stats: { blockedNavigations: number; openRequests: number; draftAcks: number; draftRejects: number; titles: number; fileOpens: number; fileRejects: number; focusWaits: number; lateActivations: number; switches: number; switchReloads: number }
  /** Last refused openFile (reason only; for diagnostics and tests). */
  lastFileReject?: string
  /** Diagnostics: ms-stamped focus events around the last file open (panel active flips, active editor). */
  focusTrace?: string[]
  /** Diagnostics: when the last file open finished (counts late re-activations; never acts on them). */
  openedAt?: number
}

/** Chat panels (ADR-007): at most one "main" panel that switches sessions in place, plus "pinned" panels
 *  opened with "Open in New Panel". A session is shown by at most one panel. */
export class PanelRegistry {
  private readonly entries = new Map<string, Entry>()
  private lastActive: string | undefined
  /** Host operation for "open another session" requests coming from a page (validated by the caller). */
  onOpenSession: (from: Entry, sessionId: string) => void = () => {}
  /** A panel was opened or closed (the sidebar marks open sessions). */
  onChange: () => void = () => {}
  /** T010 recovery screen buttons that need the rest of the extension (retry, settings, sessions list, new session). */
  onRecoveryAction: (action: "retryConnection" | "openSettings" | "showSessions" | "newSession") => void = () => {}
  private connection: ConnectionSummary | undefined

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly conn: Connection,
    private readonly kv: KvStore,
    private readonly blobs: BlobStore,
    private readonly log: vscode.LogOutputChannel,
  ) {}

  static key(b: SessionBinding) {
    return `${b.connectionId}|${b.directory}|${b.sessionId}`
  }

  /** Stable across reloads; used for panel-scoped storage and the persisted draft queue. */
  static panelKey(b: SessionBinding) {
    return crypto.createHash("sha256").update(PanelRegistry.key(b)).digest("hex").slice(0, 20)
  }

  list() {
    return [...this.entries.values()]
  }

  /** The panel currently showing this session, if any. */
  get(binding: SessionBinding) {
    const key = PanelRegistry.key(binding)
    return this.list().find((e) => PanelRegistry.key(e.binding) === key)
  }

  get main() {
    return this.list().find((e) => e.role === "main")
  }

  get active(): Entry | undefined {
    return this.list().find((e) => e.panel.active) ?? (this.lastActive ? this.entries.get(this.lastActive) : undefined)
  }

  /**
   * Show a session (ADR-007), in this order: the panel already showing it is revealed; otherwise the main
   * panel switches to it; otherwise a new main panel opens. `newPanel` opens a pinned panel instead of
   * switching the main one (still revealing a panel that already shows the session).
   */
  open(binding: SessionBinding, title?: string, column: vscode.ViewColumn = vscode.ViewColumn.Active, focus = true, newPanel = false) {
    const existing = this.get(binding)
    if (existing) {
      existing.panel.reveal(undefined, !focus)
      return existing
    }
    const main = this.main
    if (!newPanel && main) {
      this.switchTo(main, binding, title)
      main.panel.reveal(undefined, !focus)
      return main
    }
    const role: PanelRole = main ? "pinned" : "main"
    const panel = vscode.window.createWebviewPanel(VIEW_TYPE, title ?? "OpenCode", { viewColumn: column, preserveFocus: !focus }, {
      enableScripts: true,
      // Keep the app alive while its tab is hidden: a destroyed document means a full cold boot (bundle,
      // bridge handshake, session sync) on every tab switch. Memory is bounded by the few open panels.
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, "media")],
    })
    return this.attach(panel, binding, title, role)
  }

  /**
   * Switch a panel to another session in place. Same directory: the live app navigates (no reload) and the
   * bridge policy follows the new session. Another directory: the bridge is rebuilt for it and the document
   * reloaded (the policy pins every request to one directory).
   */
  private switchTo(entry: Entry, binding: SessionBinding, title?: string) {
    const sameDirectory = binding.connectionId === entry.binding.connectionId && binding.directory === entry.binding.directory
    entry.stats.switches++
    entry.binding = binding
    entry.panel.title = title ?? entry.panel.title
    this.log.info(`switch ${sameDirectory ? "in place" : "with reload"} to ${binding.sessionId}`)
    if (sameDirectory) {
      entry.ready = false // the page says ready again once the new route rendered; drafts wait for it
      entry.bridge.retarget(binding.sessionId)
      entry.bridge.core.sendCurrent({ type: "navigate", sessionId: binding.sessionId })
    } else {
      entry.stats.switchReloads++
      entry.ready = false
      entry.bridge.dispose()
      entry.bridge = this.bridgeFor(entry)
      entry.panel.webview.html = this.html(entry.panel.webview, this.initFor(entry))
    }
    void this.conn
      .request<{ title?: string }>("GET", `/session/${encodeURIComponent(binding.sessionId)}`, undefined, binding.directory)
      .then((s) => entry.binding.sessionId === binding.sessionId && s.title && this.setTitle(entry, s.title))
      .catch(() => undefined)
    this.onChange()
  }

  private initFor(entry: Entry): WebviewInit {
    return { panelId: entry.panelId, binding: entry.binding, serverUrl: BRIDGE_ORIGIN, locale: this.locale(), colorScheme: colorScheme(), role: entry.role }
  }

  /** VS Code's display language. OCO_DEV_LOCALE (development only) stands in for an installed language
   *  pack: without one, `--locale` does not change vscode.env.language. */
  private locale() {
    const dev = process.env.OCO_DEV_LOCALE
    return dev && this.context.extensionMode !== vscode.ExtensionMode.Production ? dev : vscode.env.language
  }

  /** E2E hook for the first-load race: OCO_DEV_SLOW_PATHS / OCO_DEV_SLOW_MS, outside production only. */
  private devSlow() {
    const paths = process.env.OCO_DEV_SLOW_PATHS
    if (!paths || this.context.extensionMode === vscode.ExtensionMode.Production) return undefined
    return { pattern: new RegExp(paths), ms: Number(process.env.OCO_DEV_SLOW_MS ?? 4000) }
  }

  /** Pending drafts belong to a session, not a panel (a main panel changes session). */
  private pendingKey(e: Entry) {
    return `oco.pendingDrafts.v1/${PanelRegistry.panelKey(e.binding)}`
  }

  private pending(e: Entry): PendingDraft[] {
    return this.context.workspaceState.get<PendingDraft[]>(this.pendingKey(e)) ?? []
  }

  private async setPending(e: Entry, list: PendingDraft[]) {
    await this.context.workspaceState.update(this.pendingKey(e), list.length ? list : undefined)
  }

  private flushDrafts(e: Entry) {
    if (!e.ready || !e.panel.visible) return
    for (const d of this.pending(e))
      e.bridge.core.sendCurrent({ type: "draft.insert", id: d.id, sessionId: e.binding.sessionId, text: d.text, source: d.source })
  }

  /** Used by open() and by the serializer after Reload Window. */
  attach(panel: vscode.WebviewPanel, binding: SessionBinding, title?: string, role: PanelRole = "main") {
    // A restored second "main" (e.g. two main panels from an older layout) becomes pinned.
    if (role === "main" && this.main) role = "pinned"
    const panelId = crypto.randomUUID()
    panel.title = title ?? panel.title ?? "OpenCode"
    panel.iconPath = vscode.Uri.joinPath(this.context.extensionUri, "media", "icon.svg")
    const entry = {
      panelId,
      role,
      binding,
      // Panel-scoped storage namespace (opencode.window.*): fixed for the panel's lifetime.
      panelKey: PanelRegistry.panelKey(binding),
      panel,
      ready: false,
      stats: { blockedNavigations: 0, openRequests: 0, draftAcks: 0, draftRejects: 0, titles: 0, fileOpens: 0, fileRejects: 0, focusWaits: 0, lateActivations: 0, switches: 0, switchReloads: 0 },
    } as Entry
    entry.bridge = this.bridgeFor(entry)
    this.entries.set(panelId, entry)
    panel.webview.html = this.html(panel.webview, this.initFor(entry))
    panel.onDidChangeViewState((e) => {
      if (entry.focusTrace) entry.focusTrace.push(`${Date.now() % 100000} panel.active=${e.webviewPanel.active}`)
      if (e.webviewPanel.active && entry.openedAt !== undefined && Date.now() - entry.openedAt < 1000) entry.stats.lateActivations++
      if (e.webviewPanel.active && this.lastActive !== panelId) {
        this.lastActive = panelId
        this.onChange() // the sidebar selection follows the active panel
      }
      // retainContextWhenHidden: a hidden document stays alive with its generation and streams; drafts
      // queued while it was hidden are delivered once it shows again.
      if (e.webviewPanel.visible) this.flushDrafts(entry)
    })
    panel.onDidDispose(() => {
      entry.bridge.dispose() // aborts this panel's requests/streams only; the session keeps running on the server
      this.entries.delete(panelId)
      if (this.lastActive === panelId) this.lastActive = undefined
      this.onChange()
    })
    if (panel.active) this.lastActive = panelId
    this.onChange()
    return entry
  }

  /** The panel's bridge for its current binding (rebuilt when a switch changes directory). */
  private bridgeFor(entry: Entry) {
    const panel = entry.panel
    const bridge = createBridge({
      webview: panel.webview,
      conn: this.conn,
      kv: this.kv,
      blobs: this.blobs,
      binding: entry.binding,
      panelKey: entry.panelKey,
      log: this.log,
      onGeneration: () => {
        entry.ready = false
      },
      onSessionTitle: (t) => this.setTitle(entry, t),
      devSlow: this.devSlow(),
      onUi: (msg) => {
        if (entry.bridge !== bridge) return // replaced by a cross-directory switch
        switch (msg.type) {
          case "ready": {
            // A ready for another session: a switch happened before this document could receive "navigate"
            // (still loading), or it is late from before the switch. Either way, (re)send the current session.
            if (!msg.route.endsWith(`/session/${entry.binding.sessionId}`)) {
              entry.bridge.core.sendCurrent({ type: "navigate", sessionId: entry.binding.sessionId })
              return
            }
            entry.ready = true
            entry.route = msg.route
            this.log.info(`panel ready ${entry.binding.sessionId} gen ${entry.bridge.core.generation}`)
            this.flushDrafts(entry)
            this.sendConnection(entry)
            const b = entry.binding
            void this.conn
              .request<{ title?: string }>("GET", `/session/${encodeURIComponent(b.sessionId)}`, undefined, b.directory)
              .then((s) => entry.binding.sessionId === b.sessionId && s.title && this.setTitle(entry, s.title))
              .catch(() => undefined)
            return
          }
          case "draft.ack": {
            if (msg.ok) entry.stats.draftAcks++
            else {
              // The page refused (e.g. not showing the bound session): surface it, never retarget.
              entry.stats.draftRejects++
              this.log.warn(`draft insert rejected in ${entry.binding.sessionId}: ${msg.reason}`)
              void vscode.window.showWarningMessage(`oco: 未能加入草稿（${msg.reason ?? "unknown"}）`)
            }
            void this.setPending(entry, this.pending(entry).filter((d) => d.id !== msg.id))
            return
          }
          case "ui":
            if (msg.action === "openExternal" && msg.url && /^https?:\/\//.test(msg.url)) void vscode.env.openExternal(vscode.Uri.parse(msg.url))
            if (msg.action === "notify" && msg.title && !panel.active) void vscode.window.showInformationMessage(`${panel.title}: ${msg.title}`)
            if (msg.action === "title" && msg.title) this.setTitle(entry, msg.title)
            if (msg.action === "blockedNavigation") {
              entry.stats.blockedNavigations++
              this.log.info(`blocked in-panel navigation in ${entry.binding.sessionId}: ${msg.route ?? ""}`)
            }
            if (msg.action === "openSession" && msg.sessionId) {
              entry.stats.openRequests++
              this.onOpenSession(entry, msg.sessionId)
            }
            if (msg.action === "reload") {
              // Same binding, new document: the bridge starts a new generation when the page says ready again.
              entry.ready = false
              entry.bridge.core.retire()
              panel.webview.html = ""
              panel.webview.html = this.html(panel.webview, this.initFor(entry))
            }
            if (msg.action === "retryConnection" || msg.action === "openSettings" || msg.action === "showSessions" || msg.action === "newSession")
              this.onRecoveryAction(msg.action)
            if (msg.action === "closePanel") panel.dispose()
            if (msg.action === "openFile" && msg.path) void this.openFile(entry, msg.path, msg.line, msg.column, msg.focusAgeMs)
            return
        }
      },
    })
    return bridge
  }

  private html(webview: vscode.Webview, init: WebviewInit) {
    const media = vscode.Uri.joinPath(this.context.extensionUri, "media", "chat")
    const base = webview.asWebviewUri(media).toString() + "/"
    const nonce = crypto.randomBytes(16).toString("base64")
    const src = webview.cspSource
    const csp = [
      "default-src 'none'",
      `script-src 'nonce-${nonce}' ${src} 'wasm-unsafe-eval' blob:`, // blob: only for worker code loaded by the shim below
      `worker-src ${src} blob:`,
      `style-src ${src} 'unsafe-inline'`,
      `img-src ${src} data: blob: https:`,
      `font-src ${src} data:`,
      `media-src ${src} data: blob:`,
      // No server origin here: every server request must go through the host bridge.
      `connect-src ${src} data: blob:`,
    ].join("; ")
    let html = fs.readFileSync(vscode.Uri.joinPath(media, "index.html").fsPath, "utf8")
    // The pre-paint theme script is render-blocking: inline it so the first paint (and the loading skeleton)
    // does not wait for a resource round trip, which over Remote-SSH queues behind the app bundle.
    const themePreload = fs.readFileSync(vscode.Uri.joinPath(media, "oc-theme-preload.js").fsPath, "utf8")
    html = html.replace(/<script id="oc-theme-preload-script" src="\.\/oc-theme-preload\.js"><\/script>/, () =>
      `<script id="oc-theme-preload-script">${themePreload.replace(/<\/script/gi, "<\\/script")}</script>`)
    html = html.replace(/(src|href)="\.\//g, `$1="${base}`)
    html = html.replace(/<script /g, `<script nonce="${nonce}" `)
    // Workers in a webview cannot fetch from the resource origin (requests never resolve), so the
    // app's workers are built as self-contained IIFE scripts (apps/chat-webview/vite.config.ts) and
    // started from a blob bootstrap that receives their code, fetched by the main thread.
    // WebSocket is disabled: its only user is the terminal, which v0.1 does not support.
    const shim = `
      window.__OCO_INIT__ = ${JSON.stringify(init)};
      window.__OCO_STATS__ = { websocketBlocked: 0 };
      // The app's pre-paint theme script reads this key from native storage before the host shim exists.
      try { if (window.__OCO_INIT__.colorScheme) localStorage.setItem("opencode-color-scheme", window.__OCO_INIT__.colorScheme); } catch {}
      (() => {
        const Native = window.Worker;
        // Worker side: runs the code it is sent, queues app messages until then, and offers
        // self.__ocoAsset(path) — text of a bundle file, fetched by the main thread (lazy shiki grammars).
        const boot = "let ready=false;const q=[];let seq=0;const assets=new Map();" +
          "self.__ocoAsset=(path)=>new Promise((resolve,reject)=>{const id=++seq;assets.set(id,{resolve,reject});self.postMessage({__ocoAsset:path,id})});" +
          "self.addEventListener('message',(e)=>{const d=e.data;" +
          "if(d&&d.__ocoAssetId){e.stopImmediatePropagation();const p=assets.get(d.__ocoAssetId);assets.delete(d.__ocoAssetId);" +
          "if(p)typeof d.text==='string'?p.resolve(d.text):p.reject(new Error(d.error||'asset load failed'));return}" +
          "if(d&&d.__ocoWorkerCode){e.stopImmediatePropagation();try{importScripts(d.__ocoWorkerCode)}catch(err){setTimeout(()=>{throw err})}" +
          "ready=true;for(const m of q.splice(0))self.dispatchEvent(new MessageEvent('message',{data:m}));return}" +
          "if(!ready){e.stopImmediatePropagation();q.push(d)}});";
        const bootUrl = URL.createObjectURL(new Blob([boot], { type: "text/javascript" }));
        window.Worker = class extends Native {
          constructor(url, opts) {
            const href = new URL(String(url), document.baseURI).href;
            if (href.startsWith(location.origin) || href.startsWith("blob:") || href.startsWith("data:")) { super(url, opts); return; }
            super(bootUrl, { name: opts && opts.name });
            // Registered before the app's own listeners, so asset requests never reach the app.
            this.addEventListener("message", (e) => {
              const d = e.data;
              if (!d || typeof d.__ocoAsset !== "string") return;
              e.stopImmediatePropagation();
              const reply = (m) => Native.prototype.postMessage.call(this, { __ocoAssetId: d.id, ...m });
              if (!/^shiki-langs\\/[a-z0-9-]+\\.json$/.test(d.__ocoAsset)) return reply({ error: "asset not allowed" });
              fetch(new URL(d.__ocoAsset, document.baseURI)).then((r) => { if (!r.ok) throw new Error("asset load failed: " + r.status); return r.text(); })
                .then((text) => reply({ text }), (err) => reply({ error: String(err && err.message || err) }));
            });
            fetch(href).then((r) => { if (!r.ok) throw new Error("worker load failed: " + r.status); return r.text(); })
              .then((code) => Native.prototype.postMessage.call(this, { __ocoWorkerCode: URL.createObjectURL(new Blob([code], { type: "text/javascript" })) }))
              .catch((err) => this.dispatchEvent(new ErrorEvent("error", { message: String(err && err.message || err) })));
          }
        };
        window.WebSocket = class { constructor() { window.__OCO_STATS__.websocketBlocked++; throw new Error("oco: WebSocket is disabled (terminal is not supported)"); } };
      })();`
    html = html.replace(
      "<head>",
      `<head>\n<meta http-equiv="Content-Security-Policy" content="${csp}">\n<base href="${base}">\n<script nonce="${nonce}">${shim}</script>`,
    )
    return html
  }

  private setTitle(e: Entry, title: string) {
    const t = title.trim().slice(0, 80)
    if (!t || t === e.panel.title) return
    e.stats.titles++
    e.panel.title = t
  }

  /** The host's connection changed: tell every live page (T010 in-panel notice). */
  setConnection(s: ConnectionSummary) {
    this.connection = s
    for (const e of this.entries.values()) if (e.ready) this.sendConnection(e)
  }

  private sendConnection(entry: Entry) {
    const s = this.connection
    if (!s) return
    entry.bridge.core.sendCurrent({ type: "connection", state: s.state, bound: s.connectionId === entry.binding.connectionId })
  }

  /** Queue text for a specific session's draft (never sends). Persisted until the page acknowledges it. */
  async insertDraft(entry: Entry, text: string, source: DraftSource) {
    const d: PendingDraft = { id: crypto.randomUUID(), text, source }
    await this.setPending(entry, [...this.pending(entry), d])
    entry.panel.reveal(undefined, false)
    this.flushDrafts(entry)
  }

  /** A page asked to open a file. The host decides; see open-file-policy.ts. */
  /**
   * VS Code learns that a webview gained focus only by polling `document.hasFocus()` every 250 ms
   * (1.139: workbench/contrib/webview/browser/pre/index.html `trackFocus`), then activates its group. A click
   * that both focuses this webview and asks for a file can therefore be reported after the file was opened,
   * re-activating the chat over it. When the page gained focus less than one poll ago, wait for that report
   * (the panel turns active) or for the poll to have passed, whichever is first; later activations are the
   * user's and are left alone.
   */
  private settleWebviewFocus(entry: Entry, focusAgeMs: number | undefined): Promise<void> {
    const wait = focusAgeMs === undefined ? 0 : FOCUS_POLL_MS + FOCUS_POLL_SLACK_MS - focusAgeMs
    if (wait <= 0) return Promise.resolve()
    entry.stats.focusWaits++
    return new Promise((resolve) => {
      const done = () => {
        clearTimeout(timer)
        sub.dispose()
        resolve()
      }
      const timer = setTimeout(done, wait)
      const sub = entry.panel.onDidChangeViewState((e) => e.webviewPanel.active && done())
    })
  }

  private async openFile(entry: Entry, p: string, line?: number, column?: number, focusAgeMs?: number) {
    const reject = (reason: string) => {
      entry.stats.fileRejects++
      entry.lastFileReject = reason
      this.log.info(`openFile refused in ${entry.binding.sessionId}: ${reason}`)
      void vscode.window.showWarningMessage(`oco: 无法打开文件（${reason}）`)
    }
    let current: string | undefined
    let serverLocal = false
    try {
      const ep = this.conn.endpoint()
      current = ep.connectionId
      serverLocal = isLoopbackHost(ep.host)
    } catch {
      current = undefined
    }
    if (current !== entry.binding.connectionId) return reject("连接已变化，请重新打开会话")
    const d = await decideOpenFile(
      { path: p, line, column },
      {
        directory: entry.binding.directory,
        workspaceRoots: (vscode.workspace.workspaceFolders ?? []).filter((f) => f.uri.scheme === "file").map((f) => f.uri.fsPath),
        serverLocal,
        realpath: (x) => fs.promises.realpath(x).catch(() => null),
        isFile: (x) => fs.promises.stat(x).then((st) => st.isFile(), () => false),
        caseInsensitive: (dir) => probeCaseInsensitive(dir, (x) => fs.promises.lstat(x)),
      },
    )
    if (!d.ok) return reject(d.reason)
    const pos = d.line ? new vscode.Position(d.line - 1, (d.column ?? 1) - 1) : undefined
    const trace = (entry.focusTrace = [`${Date.now() % 100000} open-start focusAge=${focusAgeMs ?? "-"} panel.active=${entry.panel.active}`])
    entry.openedAt = undefined
    await this.settleWebviewFocus(entry, focusAgeMs)
    trace.push(`${Date.now() % 100000} settled panel.active=${entry.panel.active}`)
    try {
      const opts: vscode.TextDocumentShowOptions = {
        preview: true,
        preserveFocus: false,
        viewColumn: vscode.ViewColumn.Beside,
        selection: pos ? new vscode.Range(pos, pos) : undefined,
      }
      const uri = vscode.Uri.file(d.fsPath)
      await vscode.window.showTextDocument(uri, opts)
      entry.stats.fileOpens++
      entry.openedAt = Date.now()
      trace.push(`${Date.now() % 100000} open-done panel.active=${entry.panel.active} editor=${nodePath.basename(vscode.window.activeTextEditor?.document.fileName ?? "-")}`)
      setTimeout(() => trace.push(`${Date.now() % 100000} +500ms panel.active=${entry.panel.active} editor=${nodePath.basename(vscode.window.activeTextEditor?.document.fileName ?? "-")}`), 500)
    } catch (e) {
      reject(e instanceof Error ? e.message.slice(0, 200) : "打开失败")
    }
  }

  debugState() {
    return this.list().map((e) => ({
      role: e.role,
      sessionId: e.binding.sessionId,
      directory: e.binding.directory,
      connectionId: e.binding.connectionId,
      title: e.panel.title,
      visible: e.panel.visible,
      ready: e.ready,
      route: e.route,
      generation: e.bridge.core.generation,
      inflight: e.bridge.core.inflightCount,
      core: e.bridge.core.stats,
      policy: e.bridge.policy.stats,
      panel: e.stats,
      lastFileReject: e.lastFileReject,
      focusTrace: e.focusTrace,
      pendingDrafts: this.pending(e).length,
    }))
  }
}
