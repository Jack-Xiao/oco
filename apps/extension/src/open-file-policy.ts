// Which file a panel may ask VS Code to open (pure; no vscode import, unit-tested).
//
// The page only names a path; the host decides. A server-reported path is treated as a file on this
// machine only when all of these hold; otherwise the request is refused rather than guessed:
//   - the server endpoint is a loopback address (a remote server's paths name files on another machine,
//     even when an identically named directory exists here);
//   - the bound session directory exists here and, after symlinks are resolved, lies inside a local
//     (`file:`) workspace folder;
//   - the requested path, resolved against that directory, stays inside it after symlinks and is a
//     regular file.
// Residual risk: a loopback port forwarded to a remote server (e.g. an SSH tunnel) whose directory layout
// happens to match a local workspace cannot be told apart from a local server.
//
// Case: containment is compared case-sensitively unless the session directory's volume is measured to be
// case-insensitive (see probeCaseInsensitive); the platform alone is not trusted, since macOS and Windows
// both support case-sensitive volumes/directories.

import path from "node:path"

export type OpenFileRequest = { path: string; line?: number; column?: number }

export type OpenFileEnv = {
  /** Bound session directory as the server reports it. */
  directory: string
  /** fsPath of every local workspace folder. */
  workspaceRoots: string[]
  /** The server endpoint is a loopback address on this machine. */
  serverLocal: boolean
  /** realpath, or null if the path does not exist. */
  realpath(p: string): Promise<string | null>
  /** true for a regular file (after realpath). */
  isFile(p: string): Promise<boolean>
  /** Measured case-insensitivity of the volume holding `dir` (a realpath). false when unsure. */
  caseInsensitive(dir: string): Promise<boolean>
}

export type OpenFileDecision =
  | { ok: true; fsPath: string; line?: number; column?: number }
  | { ok: false; reason: string }

export const MAX_PATH = 4096
const MAX_LINE = 10_000_000

/** A URI scheme (`file:`, `http:` …) but not a Windows drive letter (`C:`) nor a bare `name.ts:12[:3]`. */
const SCHEME = /^[a-zA-Z][a-zA-Z0-9+.-]+:(?!\d+(?::\d+)?$)/

/** Strips a trailing `:line` or `:line:col` / `#Lline` that tools and markdown often append. */
export function splitPosition(raw: string): OpenFileRequest {
  const hash = /^(.*)#L(\d+)(?:C(\d+))?$/.exec(raw)
  if (hash) return { path: hash[1], line: Number(hash[2]), column: hash[3] ? Number(hash[3]) : undefined }
  const colon = /^(.*?):(\d+)(?::(\d+))?$/.exec(raw)
  if (colon && colon[1] && !/^[a-zA-Z]$/.test(colon[1])) return { path: colon[1], line: Number(colon[2]), column: colon[3] ? Number(colon[3]) : undefined }
  return { path: raw }
}

const position = (n: unknown) => (typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= MAX_LINE ? n : undefined)

export function inside(root: string, p: string, caseInsensitive = false) {
  const norm = (s: string) => (caseInsensitive ? s.toLowerCase() : s)
  const rel = path.relative(norm(root), norm(p))
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel))
}

/** Flips the case of the deepest path component that has letters and checks whether both spellings are
 * the same directory entry. Any doubt (no letters, missing, error) answers false = case-sensitive. */
export async function probeCaseInsensitive(
  dir: string,
  lstat: (p: string) => Promise<{ dev: number | bigint; ino: number | bigint }>,
): Promise<boolean> {
  const parts = dir.split(path.sep)
  for (let i = parts.length - 1; i >= 0; i--) {
    const name = parts[i]
    const flipped = [...name].map((c) => (c === c.toLowerCase() ? c.toUpperCase() : c.toLowerCase())).join("")
    if (flipped === name) continue
    const other = [...parts.slice(0, i), flipped, ...parts.slice(i + 1)].join(path.sep)
    try {
      const [a, b] = await Promise.all([lstat(dir), lstat(other)])
      return a.dev === b.dev && a.ino === b.ino
    } catch {
      return false
    }
  }
  return false
}

export async function decideOpenFile(req: OpenFileRequest, env: OpenFileEnv): Promise<OpenFileDecision> {
  const raw = req.path
  if (typeof raw !== "string" || raw.length === 0 || raw.length > MAX_PATH || raw.includes("\0")) return { ok: false, reason: "Invalid path" }
  if (SCHEME.test(raw)) return { ok: false, reason: "Only local file paths can be opened" }
  if (!env.serverLocal) return { ok: false, reason: "The server is not on this machine, so the path cannot be confirmed as a local file" }
  if (!path.isAbsolute(env.directory)) return { ok: false, reason: "Invalid session directory" }

  // The session directory must map to a local workspace folder; otherwise we cannot know which local
  // file the server means.
  const dirReal = await env.realpath(env.directory)
  if (!dirReal) return { ok: false, reason: "Session directory does not exist on this machine" }
  const ci = await env.caseInsensitive(dirReal).catch(() => false)
  const contains = (root: string, p: string) => inside(root, p, false) || (ci && inside(root, p, true))
  const roots = (await Promise.all(env.workspaceRoots.map((r) => env.realpath(r)))).filter((r): r is string => !!r)
  if (!roots.some((r) => contains(r, dirReal))) return { ok: false, reason: "Session directory is not in the current workspace" }

  const open = async (rel: string, line?: number, column?: number): Promise<OpenFileDecision> => {
    const target = path.resolve(env.directory, rel)
    if (!contains(env.directory, target)) return { ok: false, reason: "Path is outside the session directory" }
    const real = await env.realpath(target)
    if (!real) return { ok: false, reason: "File does not exist" }
    if (!contains(dirReal, real)) return { ok: false, reason: "Path is outside the session directory" }
    if (!(await env.isFile(real))) return { ok: false, reason: "Not a file" }
    return { ok: true, fsPath: real, line: position(line), column: position(column) }
  }

  // A literal file wins (a file may really be named `a.ts:3`); otherwise, when no line was given, try a
  // trailing `:line[:col]` / `#Lline[Ccol]` (markdown and tool text), with the same checks.
  const literal = await open(raw, req.line, req.column)
  if (literal.ok || literal.reason !== "File does not exist" || req.line !== undefined) return literal
  const split = splitPosition(raw)
  if (split.path === raw || split.line === undefined) return literal
  return open(split.path, split.line, split.column)
}
