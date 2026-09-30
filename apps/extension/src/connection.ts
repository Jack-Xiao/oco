import * as vscode from "vscode"
import * as fs from "node:fs"
import { endpointFromSetting, isLoopbackHost, managedEndpoint, sameDirectory, type Endpoint } from "./endpoint"
import type { ManagedServer } from "./managed-server"

export type ServerMode = "attached" | "managed"

/**
 * attached (default): oco never starts, stops or reconfigures the server.
 * managed (T007): the endpoint is the process ManagedServer started for this window; its secret lives in memory only.
 * - The endpoint comes from machine-scoped settings (a workspace/repository cannot redirect it).
 * - Secrets are keyed by the normalised endpoint identity (origin + username): changing the URL
 *   never reuses another endpoint's password.
 */
export class Connection {
  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly log: vscode.LogOutputChannel,
  ) {}

  managed: ManagedServer | undefined

  mode(): ServerMode {
    return vscode.workspace.getConfiguration("oco").get<string>("serverMode", "attached") === "managed" ? "managed" : "attached"
  }

  opencodePath(): string {
    return vscode.workspace.getConfiguration("oco").get<string>("opencodePath", "").trim() || "opencode"
  }

  /** Throws a user-facing error if the configured endpoint is invalid (or the managed server is not running). */
  endpoint(): Endpoint {
    const cfg = vscode.workspace.getConfiguration("oco")
    if (this.mode() === "managed") {
      const url = this.managed?.url
      if (!url || !this.directory) throw new Error(this.managed?.state.error ?? (this.managed?.state.status === "starting" ? "托管服务启动中" : "托管服务未运行"))
      return managedEndpoint(url, this.opencodePath(), this.directory)
    }
    return endpointFromSetting(cfg.get<string>("serverUrl", "http://127.0.0.1:4096"), cfg.get<string>("serverUsername", "opencode"))
  }

  get id(): string {
    return this.endpoint().connectionId
  }

  baseUrl(): string {
    return this.endpoint().origin
  }

  /** Workspace folders on this extension host (local fs paths). */
  folders(): string[] {
    return (vscode.workspace.workspaceFolders ?? []).filter((f) => f.uri.scheme === "file").map((f) => f.uri.fsPath)
  }

  /** Directory used for new sessions / listing (first folder, P1a). */
  get directory(): string | undefined {
    return this.folders()[0]
  }

  /** A server-reported session directory belongs to this workspace. Realpath only for a local server. */
  ownsDirectory(directory: string): boolean {
    const local = isLoopbackHost(this.endpoint().host)
    return this.folders().some((f) => sameDirectory(f, directory, local))
  }

  private secretKey(ep: Endpoint) {
    return `oco.secret.v1.${ep.connectionId}`
  }

  async password(ep = this.endpoint()): Promise<string | undefined> {
    if (ep.managed) return this.managed?.password || undefined
    const stored = await this.context.secrets.get(this.secretKey(ep))
    if (stored) return stored
    // Development/test only, loopback only: read a local test secret file.
    const file = process.env.OCO_DEV_PASSWORD_FILE
    if (file && this.context.extensionMode !== vscode.ExtensionMode.Production && isLoopbackHost(ep.host)) {
      try {
        return fs.readFileSync(file, "utf8").trim()
      } catch {
        this.log.warn("dev password file unreadable")
      }
    }
    return undefined
  }

  async setPassword(value: string | undefined, ep = this.endpoint()) {
    if (value) await this.context.secrets.store(this.secretKey(ep), value)
    else await this.context.secrets.delete(this.secretKey(ep))
  }

  async auth(ep = this.endpoint()): Promise<Record<string, string>> {
    const pw = await this.password(ep)
    return pw ? { authorization: "Basic " + Buffer.from(`${ep.username}:${pw}`).toString("base64") } : {}
  }

  /** Host-side JSON call used by native UI and bridge policy lookups. */
  async request<T>(method: string, path: string, body?: unknown, directory = this.directory): Promise<T> {
    const ep = this.endpoint()
    const headers: Record<string, string> = { ...(await this.auth(ep)), "content-type": "application/json" }
    if (directory) headers["x-opencode-directory"] = encodeURIComponent(directory)
    const res = await fetch(ep.origin + path, { method, headers, body: body ? JSON.stringify(body) : undefined, redirect: "manual" })
    this.log.info(`${method} ${path.split("?")[0]} -> ${res.status}`)
    if (res.status === 401) throw new Error(`认证失败（${ep.origin}），请执行“oco: Set Server Password”`)
    if (!res.ok) throw new Error(`${method} ${path.split("?")[0]} failed: HTTP ${res.status}`)
    const text = await res.text()
    return (text ? JSON.parse(text) : undefined) as T
  }
}

export type SessionInfo = { id: string; title?: string; directory: string; parentID?: string; time?: { updated?: number } }
