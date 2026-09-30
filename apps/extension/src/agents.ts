// T013 Agent definitions (pure + fs; unit-tested). The server's /agent list is the effective configuration;
// files are only used to show where an agent comes from and to write new ones. oco never rewrites an
// existing agent file (edits happen in the raw file, so comments/unknown fields/body are preserved).
import * as fs from "node:fs"
import * as path from "node:path"

export type AgentScope = "project" | "user"
export type ServerAgent = { name: string; description?: string; mode?: string; native?: boolean; hidden?: boolean; model?: { providerID?: string; modelID?: string } | string; prompt?: string; temperature?: number; top_p?: number }
export type AgentFile = { name: string; file: string; scope: AgentScope; dir: string; description?: string; mode?: string; mtimeMs: number }
export type AgentSource = "builtin" | "file" | "config"
export type AgentRow = {
  name: string
  source: AgentSource
  scope?: AgentScope
  file?: string
  mode?: string
  description?: string
  /** "active": server has it and matches the file; "pending": file differs from / is missing on the server. */
  state: "active" | "pending"
  pendingReason?: string
  server?: ServerAgent
}

export const AGENT_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/

export function validateAgentName(name: string): string | undefined {
  const n = name.trim()
  if (!n) return "名称不能为空"
  if (!AGENT_NAME_RE.test(n) || n.includes("..")) return "只能使用字母、数字、点、下划线和连字符（不能以符号开头，最长 64）"
  return undefined
}

/** Minimal frontmatter reader: only top-level scalar `description` and `mode`, for status comparison. */
export function readFrontmatter(text: string): { description?: string; mode?: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)
  if (!m) return {}
  const out: Record<string, string> = {}
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^(description|mode):\s*(.*)$/.exec(line)
    if (!kv) continue
    let v = kv[2].trim()
    if (v.startsWith('"') && v.endsWith('"')) {
      try {
        v = JSON.parse(v)
      } catch {}
    } else if (v.startsWith("'") && v.endsWith("'")) v = v.slice(1, -1).replace(/''/g, "'")
    out[kv[1]] = v
  }
  return out
}

const q = (s: string) => JSON.stringify(s) // a JSON string is a valid YAML double-quoted scalar

/** New agent file content (Markdown + YAML frontmatter), the format the server loads from {agent,agents}/*.md. */
export function agentFileContent(a: { description: string; mode: string; model?: string; temperature?: number; prompt: string }) {
  const lines = ["---", `description: ${q(a.description)}`, `mode: ${a.mode}`]
  if (a.model) lines.push(`model: ${q(a.model)}`)
  if (typeof a.temperature === "number") lines.push(`temperature: ${a.temperature}`)
  lines.push("---", "", a.prompt.trim(), "")
  return lines.join("\n")
}

export function modelString(m: ServerAgent["model"]) {
  if (!m) return undefined
  if (typeof m === "string") return m
  return m.providerID && m.modelID ? `${m.providerID}/${m.modelID}` : undefined
}

/** Directories the server reads agents from, in its merge order (later wins). */
export function agentDirs(p: { config: string; directory: string; worktree?: string; home: string }): { dir: string; scope: AgentScope }[] {
  const out: { dir: string; scope: AgentScope }[] = [{ dir: p.config, scope: "user" }]
  const project: string[] = []
  let cur = path.resolve(p.directory)
  const stop = p.worktree && p.worktree !== "/" ? path.resolve(p.worktree) : cur
  for (;;) {
    project.push(path.join(cur, ".opencode"))
    if (cur === stop) break
    const up = path.dirname(cur)
    if (up === cur || !up.startsWith(stop)) break
    cur = up
  }
  // afs.up walks from the directory upward; the server applies them in that order.
  for (const d of project) out.push({ dir: d, scope: "project" })
  out.push({ dir: path.join(p.home, ".opencode"), scope: "user" })
  const seen = new Set<string>()
  return out.filter((d) => (seen.has(d.dir) ? false : (seen.add(d.dir), true)))
}

function walk(dir: string, depth = 0): string[] {
  if (depth > 6) return []
  let ents: fs.Dirent[]
  try {
    ents = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return []
  }
  const out: string[] = []
  for (const e of ents) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) out.push(...walk(p, depth + 1))
    else if (e.isFile() && e.name.endsWith(".md")) out.push(p)
  }
  return out
}

/** Agent Markdown files under each dir's agent/ and agents/ folders; later dirs override earlier ones. */
export function scanAgentFiles(dirs: { dir: string; scope: AgentScope }[]): Map<string, AgentFile> {
  const found = new Map<string, AgentFile>()
  for (const { dir, scope } of dirs) {
    for (const sub of ["agent", "agents"]) {
      const base = path.join(dir, sub)
      for (const file of walk(base)) {
        const rel = path.relative(base, file).split(path.sep).join("/")
        const name = rel.slice(0, -3)
        let text = ""
        let mtimeMs = 0
        try {
          text = fs.readFileSync(file, "utf8")
          mtimeMs = fs.statSync(file).mtimeMs
        } catch {
          continue
        }
        found.set(name, { name, file, scope, dir, mtimeMs, ...readFrontmatter(text) })
      }
    }
  }
  return found
}

/** Merge the server's effective list with the files on disk. Hidden server agents are left out. */
export function agentRows(server: ServerAgent[], files: Map<string, AgentFile>, configText?: string): AgentRow[] {
  const rows: AgentRow[] = []
  const byName = new Map(server.map((a) => [a.name, a]))
  for (const a of server) {
    if (a.hidden) continue
    const f = files.get(a.name)
    if (f) {
      const differs = (f.description !== undefined && (a.description ?? "") !== f.description) || (f.mode !== undefined && a.mode !== f.mode)
      rows.push({ name: a.name, source: "file", scope: f.scope, file: f.file, mode: a.mode, description: a.description, server: a, state: differs ? "pending" : "active", pendingReason: differs ? "文件内容与服务当前生效的定义不同，重新加载配置后生效" : undefined })
    } else if (!a.native && configText !== undefined && !configText.includes(`"${a.name}"`))
      // Loaded by the server, but neither a file nor a config entry defines it any more (deleted since the last load).
      rows.push({ name: a.name, source: "config", mode: a.mode, description: a.description, server: a, state: "pending", pendingReason: "服务仍在使用该定义，但本机找不到对应的文件或配置项（可能已删除），重新加载配置后消失" })
    else rows.push({ name: a.name, source: a.native ? "builtin" : "config", mode: a.mode, description: a.description, server: a, state: "active" })
  }
  for (const f of files.values()) {
    if (byName.has(f.name)) continue
    rows.push({ name: f.name, source: "file", scope: f.scope, file: f.file, mode: f.mode, description: f.description, state: "pending", pendingReason: "服务尚未加载该文件（或文件格式无效），重新加载配置后检查" })
  }
  const rank = (r: AgentRow) => (r.mode === "subagent" ? 1 : 0)
  return rows.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name))
}

/** Where a new agent file of this scope goes (the server also reads `agents/`; `agent/` is the documented one). */
export function newAgentPath(p: { config: string; directory: string }, scope: AgentScope, name: string) {
  const base = scope === "user" ? p.config : path.join(p.directory, ".opencode")
  return path.join(base, "agent", `${name}.md`)
}

/** Concatenated text of the config files (for a coarse "is this name still defined there" check). */
export function configText(p: { config: string; directory: string; worktree?: string }) {
  return configFiles(p)
    .map((f) => {
      try {
        return fs.readFileSync(f, "utf8")
      } catch {
        return ""
      }
    })
    .join("\n")
}

/** Candidate JSON/JSONC config files that may define config-only agents, most specific first. */
export function configFiles(p: { config: string; directory: string; worktree?: string }) {
  const dirs = [p.directory, ...(p.worktree && p.worktree !== p.directory ? [p.worktree] : []), path.join(p.directory, ".opencode")]
  const out: string[] = []
  for (const d of dirs) for (const f of ["opencode.jsonc", "opencode.json"]) out.push(path.join(d, f))
  for (const f of ["opencode.jsonc", "opencode.json", "config.json"]) out.push(path.join(p.config, f))
  return out.filter((f) => fs.existsSync(f))
}
