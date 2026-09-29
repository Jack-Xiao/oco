import * as vscode from "vscode"
import * as crypto from "node:crypto"
import { bridgePath, parseWebviewMessage, PROTOCOL_VERSION, type HostToWebview, type WebviewToHost } from "@oco/contracts"
import type { Connection } from "./connection"

type Omit2<T> = T extends unknown ? Omit<T, "v" | "epoch"> : never

/** Headers the webview may not set; the host owns auth and hop-by-hop headers. */
const STRIPPED = new Set(["authorization", "host", "cookie", "connection", "content-length", "origin", "referer"])

/**
 * Host end of one panel's bridge: proxies fetch (streaming, abortable) to the attached server,
 * and serves storage / draft blobs. Credentials are added here and never sent to the webview.
 */
export class BridgeHost implements vscode.Disposable {
  private readonly inflight = new Map<string, AbortController>()
  private readonly sub: vscode.Disposable
  epoch: number
  stats = { requests: 0, streamsOpen: 0, rejected: 0 }

  constructor(
    private readonly webview: vscode.Webview,
    private readonly conn: Connection,
    private readonly store: HostStore,
    private readonly log: vscode.LogOutputChannel,
    epoch: number,
    private readonly onUi: (msg: Extract<WebviewToHost, { type: "ui" }>) => void,
  ) {
    this.epoch = epoch
    this.sub = webview.onDidReceiveMessage((raw) => this.handle(raw))
  }

  send(msg: Omit2<HostToWebview>) {
    void this.webview.postMessage({ ...msg, v: PROTOCOL_VERSION, epoch: this.epoch })
  }

  private handle(raw: unknown) {
    const msg = parseWebviewMessage(raw)
    if (!msg) {
      this.stats.rejected++
      this.log.warn("rejected invalid bridge message")
      return
    }
    if (msg.epoch !== this.epoch) {
      this.stats.rejected++
      return // stale panel epoch: drop late messages
    }
    switch (msg.type) {
      case "fetch.request":
        void this.fetch(msg)
        return
      case "fetch.abort":
        this.inflight.get(msg.id)?.abort()
        return
      case "store.op":
        this.send({ type: "store.result", id: msg.id, ...this.store.op(msg.op, msg.name, msg.key, msg.value) })
        return
      case "blob.op":
        void this.blob(msg)
        return
      case "ui":
        this.onUi(msg)
        return
    }
  }

  private async fetch(msg: Extract<WebviewToHost, { type: "fetch.request" }>) {
    const path = bridgePath(msg.url)
    if (!path) return this.send({ type: "fetch.error", id: msg.id, message: "rejected url" })
    const ac = new AbortController()
    this.inflight.set(msg.id, ac)
    this.stats.requests++
    const headers = new Headers()
    for (const [k, v] of msg.headers) if (!STRIPPED.has(k.toLowerCase())) headers.set(k, v)
    for (const [k, v] of Object.entries(await this.conn.headers())) headers.set(k, v)
    const t0 = Date.now()
    try {
      const res = await fetch(this.conn.baseUrl + path, {
        method: msg.method,
        headers,
        body: msg.body ? new Uint8Array(msg.body as ArrayBuffer) : undefined,
        signal: ac.signal,
      })
      const sse = (res.headers.get("content-type") ?? "").includes("text/event-stream")
      this.log.info(`${msg.method} ${path.split("?")[0]} -> ${res.status}${sse ? " (stream)" : ""}`)
      this.send({ type: "fetch.head", id: msg.id, status: res.status, statusText: res.statusText, headers: [...res.headers.entries()] })
      if (res.body) {
        if (sse) this.stats.streamsOpen++
        try {
          for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
            this.send({ type: "fetch.chunk", id: msg.id, data: chunk })
          }
        } finally {
          if (sse) this.stats.streamsOpen--
        }
      }
      this.send({ type: "fetch.end", id: msg.id })
    } catch (e) {
      const aborted = ac.signal.aborted
      if (!aborted) this.log.warn(`${msg.method} ${path.split("?")[0]} failed after ${Date.now() - t0}ms: ${(e as Error).message}`)
      this.send({ type: "fetch.error", id: msg.id, message: aborted ? "aborted" : "network error", aborted })
    } finally {
      this.inflight.delete(msg.id)
    }
  }

  private async blob(msg: Extract<WebviewToHost, { type: "blob.op" }>) {
    try {
      if (msg.op === "put") {
        const data = new Uint8Array(msg.data as ArrayBuffer)
        const blobId = await this.store.putBlob(data)
        this.send({ type: "store.result", id: msg.id, blobId })
      } else {
        this.send({ type: "store.result", id: msg.id, data: await this.store.getBlob(msg.blobId!) })
      }
    } catch (e) {
      this.send({ type: "store.result", id: msg.id, error: (e as Error).message })
    }
  }

  dispose() {
    this.sub.dispose()
    for (const ac of this.inflight.values()) ac.abort() // closes this panel's streams; never stops the server
    this.inflight.clear()
  }
}

/** Host-backed storage for the app's Platform.storage and draft store (global scope, P0). */
export class HostStore {
  constructor(private readonly context: vscode.ExtensionContext) {}

  private key(name: string) {
    return `oco.store.${name}`
  }

  op(op: string, name: string, key?: string, value?: string): { value?: string | null; keys?: string[]; error?: string } {
    const all = { ...(this.context.globalState.get<Record<string, string>>(this.key(name)) ?? {}) }
    switch (op) {
      case "get":
        return { value: key !== undefined ? (all[key] ?? null) : null }
      case "set":
        if (key === undefined || value === undefined) return { error: "missing key/value" }
        all[key] = value
        void this.context.globalState.update(this.key(name), all)
        return {}
      case "remove":
        if (key !== undefined) delete all[key]
        void this.context.globalState.update(this.key(name), all)
        return {}
      case "clear":
        void this.context.globalState.update(this.key(name), undefined)
        return {}
      case "keys":
        return { keys: Object.keys(all) }
    }
    return { error: "unknown op" }
  }

  private blobDir() {
    return vscode.Uri.joinPath(this.context.globalStorageUri, "blobs")
  }

  async putBlob(data: Uint8Array): Promise<string> {
    if (data.byteLength > 20 * 1024 * 1024) throw new Error("attachment too large (20 MB limit)")
    const id = crypto.createHash("sha256").update(data).digest("hex")
    await vscode.workspace.fs.createDirectory(this.blobDir())
    await vscode.workspace.fs.writeFile(vscode.Uri.joinPath(this.blobDir(), id), data)
    return id
  }

  async getBlob(id: string): Promise<Uint8Array | null> {
    if (!/^[a-f0-9]{64}$/.test(id)) return null
    try {
      return await vscode.workspace.fs.readFile(vscode.Uri.joinPath(this.blobDir(), id))
    } catch {
      return null
    }
  }
}
