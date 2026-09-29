import * as vscode from "vscode"
import * as fs from "node:fs"

/** P0 connection: one `attached` OpenCode server. The extension never starts, stops or reconfigures it. */
export class Connection {
  readonly id = "default"
  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly log: vscode.LogOutputChannel,
  ) {}

  get baseUrl(): string {
    return vscode.workspace.getConfiguration("oco").get<string>("serverUrl", "http://127.0.0.1:4096").replace(/\/+$/, "")
  }

  get username(): string {
    return vscode.workspace.getConfiguration("oco").get<string>("serverUsername", "opencode")
  }

  /** Workspace directory the sessions belong to (first folder, P0). */
  get directory(): string | undefined {
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
  }

  async password(): Promise<string | undefined> {
    const stored = await this.context.secrets.get("oco.serverPassword")
    if (stored) return stored
    // Development-only: read a local test secret file (never used in packaged/production mode).
    const file = process.env.OCO_DEV_PASSWORD_FILE
    if (file && this.context.extensionMode !== vscode.ExtensionMode.Production) {
      try {
        return fs.readFileSync(file, "utf8").trim()
      } catch {
        this.log.warn("dev password file unreadable")
      }
    }
    return undefined
  }

  async setPassword(value: string | undefined) {
    if (value) await this.context.secrets.store("oco.serverPassword", value)
    else await this.context.secrets.delete("oco.serverPassword")
  }

  async headers(): Promise<Record<string, string>> {
    const h: Record<string, string> = {}
    const pw = await this.password()
    if (pw) h.authorization = "Basic " + Buffer.from(`${this.username}:${pw}`).toString("base64")
    return h
  }

  /** Host-side JSON call used by native UI (session pickers etc.). */
  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers = await this.headers()
    headers["content-type"] = "application/json"
    if (this.directory) headers["x-opencode-directory"] = encodeURIComponent(this.directory)
    const res = await fetch(this.baseUrl + path, { method, headers, body: body ? JSON.stringify(body) : undefined })
    this.log.info(`${method} ${path.split("?")[0]} -> ${res.status}`)
    if (!res.ok) throw new Error(`${method} ${path.split("?")[0]} failed: HTTP ${res.status}`)
    const text = await res.text()
    return (text ? JSON.parse(text) : undefined) as T
  }
}

export type SessionInfo = { id: string; title?: string; directory: string; time?: { updated?: number } }
