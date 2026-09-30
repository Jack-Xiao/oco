import * as vscode from "vscode"
import * as crypto from "node:crypto"
import * as fs from "node:fs"
import { BRIDGE_ORIGIN, type SessionBinding, type WebviewInit } from "@oco/contracts"
import { BlobStore, createBridge } from "./bridge-host"
import type { Connection } from "./connection"
import type { KvStore } from "./host-store"
import { decideOpenFile, probeCaseInsensitive } from "./open-file-policy"
import { isLoopbackHost } from "./endpoint"

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
  binding: SessionBinding
  panelKey: string
  ready: boolean
  route?: string
  stats: { blockedNavigations: number; openRequests: number; draftAcks: number; draftRejects: number; titles: number; fileOpens: number; fileRejects: number }
  /** Last refused openFile (reason only; for diagnostics and tests). */
  lastFileReject?: string
}

/** One editor tab per session; identity = connectionId + directory + sessionId. */
export class PanelRegistry {
  private readonly entries = new Map<string, Entry>()
  private lastActive: string | undefined
  /** Host operation for "open another session" requests coming from a page (validated by the caller). */
  onOpenSession: (from: Entry, sessionId: string) => void = () => {}
  /** A panel was opened or closed (the sidebar marks open sessions). */
  onChange: () => void = () => {}

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

  get(binding: SessionBinding) {
    return this.entries.get(PanelRegistry.key(binding))
  }

  get active(): Entry | undefined {
    return this.list().find((e) => e.panel.active) ?? (this.lastActive ? this.entries.get(this.lastActive) : undefined)
  }

  /** Open-or-focus: an already open session is revealed in the editor group that shows it. */
  open(binding: SessionBinding, title?: string, column: vscode.ViewColumn = vscode.ViewColumn.Active, focus = true) {
    const existing = this.get(binding)
    if (existing) {
      existing.panel.reveal(undefined, !focus)
      return existing
    }
    const panel = vscode.window.createWebviewPanel(VIEW_TYPE, title ?? "OpenCode", { viewColumn: column, preserveFocus: !focus }, {
      enableScripts: true,
      retainContextWhenHidden: false, // restore from host state/drafts instead of keeping every app alive
      localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, "media")],
    })
    return this.attach(panel, binding, title)
  }

  /** E2E hook for the first-load race: OCO_DEV_SLOW_PATHS / OCO_DEV_SLOW_MS, outside production only. */
  private devSlow() {
    const paths = process.env.OCO_DEV_SLOW_PATHS
    if (!paths || this.context.extensionMode === vscode.ExtensionMode.Production) return undefined
    return { pattern: new RegExp(paths), ms: Number(process.env.OCO_DEV_SLOW_MS ?? 4000) }
  }

  private pendingKey(e: Entry) {
    return `oco.pendingDrafts.v1/${e.panelKey}`
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
  attach(panel: vscode.WebviewPanel, binding: SessionBinding, title?: string) {
    const key = PanelRegistry.key(binding)
    const panelKey = PanelRegistry.panelKey(binding)
    const panelId = crypto.randomUUID()
    panel.title = title ?? panel.title ?? "OpenCode"
    panel.iconPath = vscode.Uri.joinPath(this.context.extensionUri, "media", "icon.svg")
    const entry = {
      binding,
      panelKey,
      panel,
      ready: false,
      stats: { blockedNavigations: 0, openRequests: 0, draftAcks: 0, draftRejects: 0, titles: 0, fileOpens: 0, fileRejects: 0 },
    } as Entry
    entry.bridge = createBridge({
      webview: panel.webview,
      conn: this.conn,
      kv: this.kv,
      blobs: this.blobs,
      binding,
      panelKey,
      log: this.log,
      onGeneration: () => {
        entry.ready = false
      },
      onSessionTitle: (t) => this.setTitle(entry, t),
      devSlow: this.devSlow(),
      onUi: (msg) => {
        switch (msg.type) {
          case "ready":
            entry.ready = true
            entry.route = msg.route
            this.log.info(`panel ready ${binding.sessionId} gen ${entry.bridge.core.generation}`)
            this.flushDrafts(entry)
            void this.conn
              .request<{ title?: string }>("GET", `/session/${encodeURIComponent(binding.sessionId)}`, undefined, binding.directory)
              .then((s) => s.title && this.setTitle(entry, s.title))
              .catch(() => undefined)
            return
          case "draft.ack": {
            if (msg.ok) entry.stats.draftAcks++
            else {
              // The page refused (e.g. not showing the bound session): surface it, never retarget.
              entry.stats.draftRejects++
              this.log.warn(`draft insert rejected in ${binding.sessionId}: ${msg.reason}`)
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
              this.log.info(`blocked in-panel navigation in ${binding.sessionId}: ${msg.route ?? ""}`)
            }
            if (msg.action === "openSession" && msg.sessionId) {
              entry.stats.openRequests++
              this.onOpenSession(entry, msg.sessionId)
            }
            if (msg.action === "openFile" && msg.path) void this.openFile(entry, msg.path, msg.line, msg.column)
            return
        }
      },
    })
    this.entries.set(key, entry)
    panel.webview.html = this.html(panel.webview, { panelId, binding, serverUrl: BRIDGE_ORIGIN, locale: vscode.env.language, colorScheme: colorScheme() })
    panel.onDidChangeViewState((e) => {
      if (e.webviewPanel.active) this.lastActive = key
      // retainContextWhenHidden=false: a hidden webview's document is destroyed. Retire its generation
      // so its streams close now and nothing it sends late is accepted.
      if (!e.webviewPanel.visible) {
        entry.ready = false
        entry.bridge.core.retire()
      }
    })
    panel.onDidDispose(() => {
      entry.bridge.dispose() // aborts this panel's requests/streams only; the session keeps running on the server
      this.entries.delete(key)
      if (this.lastActive === key) this.lastActive = undefined
      this.onChange()
    })
    if (panel.active) this.lastActive = key
    this.onChange()
    return entry
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
        const boot = "let ready=false;const q=[];self.addEventListener('message',(e)=>{const d=e.data;" +
          "if(d&&d.__ocoWorkerCode){e.stopImmediatePropagation();try{importScripts(d.__ocoWorkerCode)}catch(err){setTimeout(()=>{throw err})}" +
          "ready=true;for(const m of q.splice(0))self.dispatchEvent(new MessageEvent('message',{data:m}));return}" +
          "if(!ready){e.stopImmediatePropagation();q.push(d)}});";
        const bootUrl = URL.createObjectURL(new Blob([boot], { type: "text/javascript" }));
        window.Worker = class extends Native {
          constructor(url, opts) {
            const href = new URL(String(url), document.baseURI).href;
            if (href.startsWith(location.origin) || href.startsWith("blob:") || href.startsWith("data:")) { super(url, opts); return; }
            super(bootUrl, { name: opts && opts.name });
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

  /** Queue text for a specific session's draft (never sends). Persisted until the page acknowledges it. */
  async insertDraft(entry: Entry, text: string, source: DraftSource) {
    const d: PendingDraft = { id: crypto.randomUUID(), text, source }
    await this.setPending(entry, [...this.pending(entry), d])
    entry.panel.reveal(undefined, false)
    this.flushDrafts(entry)
  }

  /** A page asked to open a file. The host decides; see open-file-policy.ts. */
  private async openFile(entry: Entry, p: string, line?: number, column?: number) {
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
    try {
      await vscode.window.showTextDocument(vscode.Uri.file(d.fsPath), {
        preview: true,
        preserveFocus: false,
        viewColumn: vscode.ViewColumn.Beside,
        selection: pos ? new vscode.Range(pos, pos) : undefined,
      })
      entry.stats.fileOpens++
    } catch (e) {
      reject(e instanceof Error ? e.message.slice(0, 200) : "打开失败")
    }
  }

  debugState() {
    return this.list().map((e) => ({
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
      pendingDrafts: this.pending(e).length,
    }))
  }
}
