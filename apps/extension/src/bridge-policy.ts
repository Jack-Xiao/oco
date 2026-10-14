// Which bridged requests a panel may make (pure; no vscode import, unit-tested).
//
// The virtual-origin check only guarantees the host never fetches arbitrary network targets. This
// policy is the session/project boundary: the directory is forced to the panel binding (or, for a draft
// panel, one of the workspace's own directories), and side-effecting requests must target the bound session
// (or a verified child session, or a session this panel created).

import * as fs from "node:fs"


/** `draft`: a new-session page with no session yet (patches/opencode/0023). It may create a session (and a
 *  worktree) in the workspace's directories; the session it creates becomes writable. */
export type PolicyBinding = { directory: string; sessionId: string; draft?: boolean }

/** What a request carried besides its URL. */
export type RequestExtras = { headerDirectory?: string; body?: ArrayBuffer | Uint8Array }

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
  { method: "POST", re: /^\/(api\/)?session$/ }, // create a session (directory checked below)
  { method: "POST", re: /^\/log$/ },
]
const SESSION_CREATE = /^\/(api\/)?session$/
const WORKTREE_CREATE = /^\/experimental\/worktree$/

const SESSION_WRITE = /^\/(?:api\/)?session\/([^/]+)(?:\/|$)/
const PERMISSION_REPLY = /^\/permission\/([^/]+)\/reply$/
const QUESTION_REPLY = /^\/question\/([^/]+)\/(reply|reject)$/

export class BridgePolicy {
  /** Bound session plus child sessions verified through the server. */
  private readonly allowed = new Set<string>()
  /** Sessions this (draft) panel created; the host only lets the panel switch to one of these. */
  readonly created = new Map<string, string>()
  /** Worktree directories this (draft) panel created. */
  private readonly worktrees = new Set<string>()
  private binding: PolicyBinding
  stats = { rejected: 0, verifiedChildren: 0, created: 0 }

  constructor(
    binding: PolicyBinding,
    private readonly lookup: Lookup,
    private readonly trusted: () => boolean,
    /** Draft panels: the workspace folders and their projects' worktrees (Connection.roots()). */
    private readonly workspaceDirectories: () => string[] = () => [],
    private readonly isLoopback: boolean | (() => boolean) = false,
  ) {
    this.binding = { ...binding }
    this.allowed.add(binding.sessionId)
  }

  get draft() {
    return !!this.binding.draft
  }

  private norm(p: string): string {
    const loopback = typeof this.isLoopback === "function" ? this.isLoopback() : !!this.isLoopback
    if (!loopback) return p
    try {
      return fs.realpathSync.native(p)
    } catch {
      return p
    }
  }

  private sameDir(a: string, b: string): boolean {
    if (a === b) return true
    return this.norm(a) === this.norm(b)
  }

  /** The panel now shows another session (ADR-007; or a draft panel's new session, possibly in a worktree):
   *  only it (and its verified children) may be acted on from now on; the previous grants are dropped. */
  retarget(sessionId: string, directory?: string) {
    this.allowed.clear()
    this.allowed.add(sessionId)
    if (directory !== undefined) this.binding = { directory, sessionId }
    else this.binding = { ...this.binding, sessionId, draft: undefined }
    this.worktrees.clear()
    this.created.clear()
  }

  /** Directories requests may target: the binding's, plus, for a draft, the workspace's own. */
  private directoryAllowed(dir: string) {
    if (this.sameDir(dir, this.binding.directory)) return true
    if (!this.binding.draft) return false
    for (const w of this.worktrees) {
      if (this.sameDir(dir, w)) return true
    }
    for (const d of this.workspaceDirectories()) {
      if (this.sameDir(dir, d)) return true
    }
    return false
  }

  /** A successful response the page asked for: sessions and worktrees a draft creates become usable. */
  observe(method: string, pathname: string, status: number, json: unknown) {
    if (!this.binding.draft || method.toUpperCase() !== "POST" || status < 200 || status >= 300) return
    const o = (json && typeof json === "object" ? json : {}) as { id?: unknown; directory?: unknown; data?: unknown }
    const v = (o.data && typeof o.data === "object" ? o.data : o) as { id?: unknown; directory?: unknown }
    if (SESSION_CREATE.test(pathname) && typeof v.id === "string" && typeof v.directory === "string") {
      if (!this.directoryAllowed(v.directory)) return
      this.allowed.add(v.id)
      this.created.set(v.id, v.directory)
      this.stats.created++
    } else if (WORKTREE_CREATE.test(pathname) && typeof v.directory === "string") {
      this.worktrees.add(v.directory)
    }
  }

  /** Only these responses need to be read by the host (see observe). */
  static observes(method: string, pathname: string) {
    return method.toUpperCase() === "POST" && (SESSION_CREATE.test(pathname) || WORKTREE_CREATE.test(pathname))
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
      if (!info.exists || (info.directory !== undefined && !this.sameDir(info.directory, this.binding.directory))) return false
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

  async decide(method: string, pathname: string, search: URLSearchParams, extras: RequestExtras = {}): Promise<Decision> {
    const m = method.toUpperCase()
    if (pathname.includes("..") || pathname.includes("//")) return this.reject(400, "invalid path")
    if (BLOCKED_ANY.some((re) => re.test(pathname))) return this.reject(403, "not available in oco")

    // Directory overrides: the query may only name an allowed directory (it is then moved to the header); a
    // header outside the allowed set is replaced by the bound directory, as before.
    const q = new URLSearchParams(search)
    let directory = this.binding.directory
    const header = extras.headerDirectory !== undefined ? safeDecode(extras.headerDirectory) : undefined
    if (header !== undefined && this.directoryAllowed(header)) directory = header
    for (const key of ["directory", "workspace"]) {
      const value = q.get(key)
      if (value === null) continue
      if (key === "directory" && this.directoryAllowed(value)) {
        directory = value
        continue
      }
      return this.reject(403, `${key} override not allowed`)
    }
    q.delete("directory")
    const query = q.toString()
    const path = pathname + (query ? `?${query}` : "")
    const ok: Decision = { ok: true, path, directory }

    if (READ.has(m)) return ok
    if (!this.trusted()) return this.reject(403, "workspace not trusted")
    if (m === "POST" && SESSION_CREATE.test(pathname)) {
      // v2 names the directory in the body; it must be allowed too.
      const target = bodyLocation(extras.body)
      if (target !== undefined && !this.directoryAllowed(target)) return this.reject(403, "directory not allowed")
      return ok
    }
    if (m === "POST" && WORKTREE_CREATE.test(pathname)) {
      if (!this.binding.draft || !this.workspaceDirectories().some((d) => this.sameDir(directory, d))) return this.reject(403, "worktrees are created from a new-session page only")
      return ok
    }
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

function safeDecode(v: string) {
  try {
    return decodeURIComponent(v)
  } catch {
    return undefined
  }
}

/** `location.directory` of a v2 session-create body, if any. */
function bodyLocation(body: RequestExtras["body"]): string | undefined {
  if (!body || body.byteLength === 0) return undefined
  try {
    const json = JSON.parse(new TextDecoder().decode(body)) as { location?: { directory?: unknown } }
    const d = json?.location?.directory
    return typeof d === "string" ? d : undefined
  } catch {
    return undefined
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
