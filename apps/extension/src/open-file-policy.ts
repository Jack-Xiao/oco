// Which file a panel may ask VS Code to open (pure; no vscode import, unit-tested).
//
// The page only names a path; the host decides. A path is resolved against the panel's bound session
// directory and must stay inside it after symlinks are resolved, and that directory must itself be a
// local workspace folder (or inside one). A server-side path with no local counterpart (remote server,
// other checkout) is refused rather than guessed.

import path from "node:path"

export type OpenFileRequest = { path: string; line?: number; column?: number }

export type OpenFileEnv = {
  /** Bound session directory as the server reports it. */
  directory: string
  /** fsPath of every local workspace folder. */
  workspaceRoots: string[]
  /** realpath, or null if the path does not exist. */
  realpath(p: string): Promise<string | null>
  /** true for a regular file (after realpath). */
  isFile(p: string): Promise<boolean>
  /** Case-insensitive file system (macOS/Windows default). */
  caseInsensitive?: boolean
}

export type OpenFileDecision =
  | { ok: true; fsPath: string; line?: number; column?: number }
  | { ok: false; reason: string }

export const MAX_PATH = 4096
const MAX_LINE = 10_000_000

/** A URI scheme (`file:`, `http:` …) but not a Windows drive letter (`C:`). */
const SCHEME = /^[a-zA-Z][a-zA-Z0-9+.-]+:/

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

export async function decideOpenFile(req: OpenFileRequest, env: OpenFileEnv): Promise<OpenFileDecision> {
  const raw = req.path
  if (typeof raw !== "string" || raw.length === 0 || raw.length > MAX_PATH || raw.includes("\0")) return { ok: false, reason: "路径无效" }
  if (SCHEME.test(raw)) return { ok: false, reason: "只能打开本地文件路径" }
  if (!path.isAbsolute(env.directory)) return { ok: false, reason: "会话目录无效" }
  const ci = env.caseInsensitive ?? false

  // The session directory must map to a local workspace folder; otherwise we cannot know which local
  // file the server means.
  const dirReal = await env.realpath(env.directory)
  if (!dirReal) return { ok: false, reason: "会话目录在本机不存在" }
  const roots = (await Promise.all(env.workspaceRoots.map((r) => env.realpath(r)))).filter((r): r is string => !!r)
  if (!roots.some((r) => inside(r, dirReal, ci))) return { ok: false, reason: "会话目录不在当前工作区" }

  const target = path.resolve(env.directory, raw)
  if (!inside(env.directory, target, ci)) return { ok: false, reason: "路径超出会话目录" }
  const real = await env.realpath(target)
  if (!real) return { ok: false, reason: "文件不存在" }
  if (!inside(dirReal, real, ci)) return { ok: false, reason: "路径超出会话目录" }
  if (!(await env.isFile(real))) return { ok: false, reason: "不是文件" }
  return { ok: true, fsPath: real, line: position(req.line), column: position(req.column) }
}
