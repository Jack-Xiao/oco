// T015 diagnostics and connection presentation (pure; unit-tested). Nothing here may carry a password,
// an authorization header or message text: the export is meant to be pasted into an issue.
import type { ManagedState } from "./managed-server"

/** Server versions this build was verified against: the vendored v1.18.33 baseline and the enterprise
 * v1.18.13 service (E2E 2026-10-06 / 2026-10-11). Others work but are flagged. */
export const VERIFIED_SERVERS = ["1.18.33", "1.18.13"]

export function versionNote(version: string | undefined): string | undefined {
  if (!version) return undefined
  if (!/^1\./.test(version)) return `Server ${version} is not OpenCode v1. oco has not verified it; some features may be unavailable`
  if (!VERIFIED_SERVERS.includes(version)) return `Server ${version} is not verified by oco (verified: ${VERIFIED_SERVERS.join(", ")})`
  return undefined
}

const SECRET_KEYS = /(authorization|password|passwd|secret|token|api[_-]?key|cookie)/i

/** Redact secrets and the user's home directory from free text. `extra` are literal secrets to remove. */
export function redactText(text: string, opts: { home?: string; extra?: string[] } = {}) {
  let t = text
  for (const s of opts.extra ?? []) if (s && s.length >= 4) t = t.split(s).join("<redacted>")
  if (opts.home && opts.home.length > 1) t = t.split(opts.home).join("~")
  t = t.replace(/(basic|bearer)\s+[A-Za-z0-9+/=._-]{6,}/gi, "$1 <redacted>")
  t = t.replace(/(authorization|password|passwd|secret|token|api[_-]?key|cookie)(["']?\s*[=:]\s*["']?)[^\s"',}]+/gi, "$1$2<redacted>")
  t = t.replace(/\/\/[^/\s:@]+:[^/\s@]+@/g, "//<redacted>@")
  return t
}

/** Deep copy with secret-looking keys removed and strings redacted. */
export function redactValue(v: unknown, opts: { home?: string; extra?: string[] } = {}): unknown {
  if (typeof v === "string") return redactText(v, opts)
  if (Array.isArray(v)) return v.map((x) => redactValue(x, opts))
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {}
    for (const [k, x] of Object.entries(v)) out[k] = SECRET_KEYS.test(k) && typeof x !== "boolean" ? "<redacted>" : redactValue(x, opts)
    return out
  }
  return v
}

export type ServerInfo = { version?: string; mode: "attached" | "managed"; managed?: ManagedState }

/** Extra status-bar tooltip lines: mode, server version (flagged when unverified) and the managed process. */
export function serverInfoLines(info: ServerInfo | undefined): string[] {
  if (!info) return []
  const lines = [`Mode: ${info.mode === "managed" ? "Managed (opencode serve started by oco)" : "Attached server"}`]
  if (info.version) lines.push(`Server version: ${info.version}`)
  const note = versionNote(info.version)
  if (note) lines.push(`Note: ${note}`)
  if (info.mode === "managed" && info.managed) {
    const m = info.managed
    lines.push(`Managed process: ${m.status}${m.pid ? ` (pid ${m.pid})` : ""}`)
    if (m.error) lines.push(m.error)
  }
  return lines
}
