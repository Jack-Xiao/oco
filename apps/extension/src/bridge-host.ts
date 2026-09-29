import * as vscode from "vscode"
import * as crypto from "node:crypto"
import type { SessionBinding } from "@oco/contracts"
import { BridgeCore, type CoreDeps, type Store } from "./bridge-core"
import { BridgePolicy } from "./bridge-policy"
import type { Connection, SessionInfo } from "./connection"
import { KvStore, type StoreContext } from "./host-store"

/** Attachment blobs (content-addressed, 20 MB cap) in global storage. */
export class BlobStore {
  constructor(private readonly context: vscode.ExtensionContext) {}

  private dir() {
    return vscode.Uri.joinPath(this.context.globalStorageUri, "blobs")
  }

  async put(data: Uint8Array): Promise<string> {
    if (data.byteLength > 20 * 1024 * 1024) throw new Error("attachment too large (20 MB limit)")
    const id = crypto.createHash("sha256").update(data).digest("hex")
    await vscode.workspace.fs.createDirectory(this.dir())
    await vscode.workspace.fs.writeFile(vscode.Uri.joinPath(this.dir(), id), data)
    return id
  }

  async get(id: string): Promise<Uint8Array | null> {
    if (!/^[a-f0-9]{64}$/.test(id)) return null
    try {
      return await vscode.workspace.fs.readFile(vscode.Uri.joinPath(this.dir(), id))
    } catch {
      return null
    }
  }
}

/** Server lookups used by the bridge policy (host-side, credentials never leave the host). */
export function serverLookup(conn: Connection, directory: string) {
  return {
    async sessionParent(id: string) {
      try {
        const s = await conn.request<SessionInfo>("GET", `/session/${encodeURIComponent(id)}`, undefined, directory)
        return { exists: true, parentID: s.parentID, directory: s.directory }
      } catch {
        return { exists: false }
      }
    },
    async permissionSession(id: string) {
      const list = await conn.request<{ id: string; sessionID: string }[]>("GET", "/permission", undefined, directory).catch(() => [])
      return list.find((p) => p.id === id)?.sessionID
    },
    async questionSession(id: string) {
      const list = await conn.request<{ id: string; sessionID: string }[]>("GET", "/question", undefined, directory).catch(() => [])
      return list.find((q) => q.id === id)?.sessionID
    },
  }
}

export function createBridge(opts: {
  webview: vscode.Webview
  conn: Connection
  kv: KvStore
  blobs: BlobStore
  binding: SessionBinding
  panelKey: string
  log: vscode.LogOutputChannel
  onUi: CoreDeps["onUi"]
  onGeneration?: CoreDeps["onGeneration"]
}) {
  const bound = () => {
    const ep = opts.conn.endpoint()
    if (ep.connectionId !== opts.binding.connectionId) throw new Error("connection changed; reopen the session")
    return ep
  }
  const ctx: StoreContext = { connectionId: opts.binding.connectionId, panelKey: opts.panelKey }
  const store: Store = {
    op: (op, name, key, value) => opts.kv.op(ctx, op, name, key, value),
    putBlob: (d) => opts.blobs.put(d),
    getBlob: (id) => opts.blobs.get(id),
  }
  const policy = new BridgePolicy(
    { directory: opts.binding.directory, sessionId: opts.binding.sessionId },
    serverLookup(opts.conn, opts.binding.directory),
    () => vscode.workspace.isTrusted,
  )
  const core = new BridgeCore({
    post: (m) => void opts.webview.postMessage(m),
    fetch: globalThis.fetch,
    // A panel stays bound to the endpoint it was opened for: if the configured endpoint changes,
    // its requests fail instead of carrying this binding (and its credentials) to another server.
    baseUrl: () => bound().origin,
    auth: () => opts.conn.auth(bound()),
    policy,
    store,
    log: opts.log,
    onUi: opts.onUi,
    onGeneration: opts.onGeneration,
  })
  const sub = opts.webview.onDidReceiveMessage((raw) => core.handle(raw))
  return {
    core,
    policy,
    dispose() {
      sub.dispose()
      core.retire() // closes this panel's streams; never stops the server or the session's run
    },
  }
}
