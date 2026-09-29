// Which bridged requests a panel may make (pure; no vscode import, unit-tested).
//
// The virtual-origin check only guarantees the host never fetches arbitrary network targets. This
// policy is the session/project boundary: the directory is always forced to the panel binding, and
// side-effecting requests must target the bound session (or a verified child session).

export type PolicyBinding = { directory: string; sessionId: string }

export type Lookup = {
  /** parentID of a session, or null if it has none / does not exist in the bound directory. */
  sessionParent(sessionId: string): Promise<{ exists: boolean; parentID?: string; directory?: string }>
  /** sessionID owning a pending permission request, if any. */
  permissionSession(requestId: string): Promise<string | undefined>
  /** sessionID owning a pending question request, if any. */
  questionSession(requestId: string): Promise<string | undefined>
}

export type Decision =
  | { ok: true; path: string; directory: string }
  | { ok: false; status: number; reason: string }

const READ = new Set(["GET", "HEAD", "OPTIONS"])
const DIRECTORY_HEADER = "x-opencode-directory"

/** Paths that are never proxied (unsupported in v0.1 or host-owned). */
const BLOCKED_ANY = [/^\/(api\/)?pty(\/|$)/, /^\/tui\//, /^\/global\/(upgrade|dispose)$/, /^\/instance\/dispose$/]

/** Side-effecting operations that are not tied to a session and are allowed. */
const WRITE_ALLOW: { method: string; re: RegExp }[] = [
  { method: "POST", re: /^\/(api\/)?session$/ }, // create a session in the bound directory (host opens its panel)
  { method: "POST", re: /^\/log$/ },
]

const SESSION_WRITE = /^\/(?:api\/)?session\/([^/]+)(?:\/|$)/
const PERMISSION_REPLY = /^\/permission\/([^/]+)\/reply$/
const QUESTION_REPLY = /^\/question\/([^/]+)\/(reply|reject)$/

export class BridgePolicy {
  /** Bound session plus child sessions verified through the server. */
  private readonly allowed = new Set<string>()
  stats = { rejected: 0, verifiedChildren: 0 }

  constructor(
    private readonly binding: PolicyBinding,
    private readonly lookup: Lookup,
    private readonly trusted: () => boolean,
  ) {
    this.allowed.add(binding.sessionId)
  }

  private reject(status: number, reason: string): Decision {
    this.stats.rejected++
    return { ok: false, status, reason }
  }

  private async sessionAllowed(id: string): Promise<boolean> {
    if (this.allowed.has(id)) return true
    // Walk up at most 8 parents: a child (subagent) session of the bound session is allowed.
    let cur = id
    for (let i = 0; i < 8; i++) {
      const info = await this.lookup.sessionParent(cur)
      if (!info.exists || (info.directory !== undefined && info.directory !== this.binding.directory)) return false
      if (!info.parentID) return false
      if (this.allowed.has(info.parentID)) {
        this.allowed.add(id)
        this.stats.verifiedChildren++
        return true
      }
      cur = info.parentID
    }
    return false
  }

  async decide(method: string, pathname: string, search: URLSearchParams): Promise<Decision> {
    const m = method.toUpperCase()
    if (pathname.includes("..") || pathname.includes("//")) return this.reject(400, "invalid path")
    if (BLOCKED_ANY.some((re) => re.test(pathname))) return this.reject(403, "not available in oco")

    // Directory overrides: the query may only repeat the bound directory; it is then rewritten.
    const q = new URLSearchParams(search)
    for (const key of ["directory", "workspace"]) {
      const value = q.get(key)
      if (value === null) continue
      if (key === "directory" && value === this.binding.directory) continue
      return this.reject(403, `${key} override not allowed`)
    }
    q.delete("directory")
    const query = q.toString()
    const path = pathname + (query ? `?${query}` : "")
    const ok: Decision = { ok: true, path, directory: this.binding.directory }

    if (READ.has(m)) return ok
    if (!this.trusted()) return this.reject(403, "workspace not trusted")
    if (WRITE_ALLOW.some((r) => r.method === m && r.re.test(pathname))) return ok

    const s = SESSION_WRITE.exec(pathname)
    if (s) {
      if (s[1] === "status" || s[1] === "active") return this.reject(403, "not a session")
      return (await this.sessionAllowed(decodeURIComponent(s[1]))) ? ok : this.reject(403, "session not bound to this panel")
    }
    const p = PERMISSION_REPLY.exec(pathname)
    if (p && m === "POST") {
      const owner = await this.lookup.permissionSession(decodeURIComponent(p[1]))
      return owner && (await this.sessionAllowed(owner)) ? ok : this.reject(403, "permission request not owned by this panel")
    }
    const qr = QUESTION_REPLY.exec(pathname)
    if (qr && m === "POST") {
      const owner = await this.lookup.questionSession(decodeURIComponent(qr[1]))
      return owner && (await this.sessionAllowed(owner)) ? ok : this.reject(403, "question not owned by this panel")
    }
    return this.reject(403, "operation not available in this panel")
  }

  /** Headers forwarded to the server: webview-supplied auth/host/directory headers are dropped. */
  static forwardHeaders(from: [string, string][], directory: string, auth: Record<string, string>): Headers {
    const h = new Headers()
    for (const [k, v] of from) if (!STRIPPED.has(k.toLowerCase())) h.set(k, v)
    h.set(DIRECTORY_HEADER, encodeURIComponent(directory))
    for (const [k, v] of Object.entries(auth)) h.set(k, v)
    return h
  }
}

const STRIPPED = new Set([
  "authorization",
  "proxy-authorization",
  "host",
  "cookie",
  "connection",
  "content-length",
  "origin",
  "referer",
  DIRECTORY_HEADER,
  "x-opencode-workspace",
])
