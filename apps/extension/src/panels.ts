import * as vscode from "vscode"
import * as crypto from "node:crypto"
import * as fs from "node:fs"
import { BRIDGE_ORIGIN, type SessionBinding, type WebviewInit } from "@oco/contracts"
import { BridgeHost, HostStore } from "./bridge-host"
import type { Connection } from "./connection"

export const VIEW_TYPE = "oco.chat"

type DraftMsg = { text: string; source: { path: string; startLine: number; endLine: number; unsaved: boolean } }
type Entry = { panel: vscode.WebviewPanel; bridge: BridgeHost; binding: SessionBinding; panelId: string; ready: boolean; queue: DraftMsg[] }

/** One editor tab per session; identity = connectionId + directory + sessionId. */
export class PanelRegistry {
  private readonly entries = new Map<string, Entry>()
  private epochSeq = 0
  private lastActive: string | undefined

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly conn: Connection,
    private readonly store: HostStore,
    private readonly log: vscode.LogOutputChannel,
  ) {}

  static key(b: SessionBinding) {
    return `${b.connectionId}|${b.directory}|${b.sessionId}`
  }

  list() {
    return [...this.entries.values()]
  }

  get active(): Entry | undefined {
    return this.list().find((e) => e.panel.active) ?? (this.lastActive ? this.entries.get(this.lastActive) : undefined)
  }

  open(binding: SessionBinding, title?: string) {
    const key = PanelRegistry.key(binding)
    const existing = this.entries.get(key)
    if (existing) {
      existing.panel.reveal()
      return existing
    }
    const panel = vscode.window.createWebviewPanel(VIEW_TYPE, title ?? "OpenCode", vscode.ViewColumn.Active, {
      enableScripts: true,
      retainContextWhenHidden: false, // restore from host state/drafts instead of keeping every app alive
      localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, "media")],
    })
    return this.attach(panel, binding, title)
  }

  /** Used by open() and by the serializer after Reload Window. */
  attach(panel: vscode.WebviewPanel, binding: SessionBinding, title?: string) {
    const key = PanelRegistry.key(binding)
    const panelId = crypto.randomUUID()
    panel.title = title ?? panel.title ?? "OpenCode"
    panel.iconPath = vscode.Uri.joinPath(this.context.extensionUri, "media", "icon.svg")
    const bridge = new BridgeHost(panel.webview, this.conn, this.store, this.log, ++this.epochSeq, (msg) => {
      if (msg.action === "openExternal" && msg.url && /^https?:\/\//.test(msg.url)) void vscode.env.openExternal(vscode.Uri.parse(msg.url))
      if (msg.action === "notify" && msg.title && !panel.active) void vscode.window.showInformationMessage(`${panel.title}: ${msg.title}`)
      if (msg.action === "ready") {
        this.log.info(`panel ready ${binding.sessionId}`)
        entry.ready = true
        for (const d of entry.queue.splice(0)) bridge.send({ type: "draft.insert", id: crypto.randomUUID(), ...d })
      }
    })
    const entry: Entry = { panel, bridge, binding, panelId, ready: false, queue: [] }
    this.entries.set(key, entry)
    const render = () => {
      // A (re)render starts a new epoch: late responses for the previous document are dropped.
      bridge.epoch = ++this.epochSeq
      panel.webview.html = this.html(panel.webview, { panelId, epoch: bridge.epoch, binding, serverUrl: BRIDGE_ORIGIN, locale: vscode.env.language })
    }
    render()
    panel.onDidChangeViewState((e) => {
      if (e.webviewPanel.active) this.lastActive = key
      if (!e.webviewPanel.visible) entry.ready = false // hidden webviews are destroyed; wait for the next "ready"
    })
    panel.onDidDispose(() => {
      bridge.dispose() // aborts this panel's requests/streams only; the session keeps running on the server
      this.entries.delete(key)
      if (this.lastActive === key) this.lastActive = undefined
    })
    if (panel.active) this.lastActive = key
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
    const shim = `
      window.__OCO_INIT__ = ${JSON.stringify(init)};
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
      })();`
    html = html.replace(
      "<head>",
      `<head>\n<meta http-equiv="Content-Security-Policy" content="${csp}">\n<base href="${base}">\n<script nonce="${nonce}">${shim}</script>`,
    )
    return html
  }

  /** Insert text into a specific session's draft (never sends). */
  insertDraft(entry: Entry, text: string, source: DraftMsg["source"]) {
    if (entry.ready && entry.panel.visible) entry.bridge.send({ type: "draft.insert", id: crypto.randomUUID(), text, source })
    else entry.queue.push({ text, source })
    entry.panel.reveal(undefined, false)
  }
}
