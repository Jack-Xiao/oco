// Card 2: tell OpenCode V1 from V2 on connect. The V2 `/api/info` shape follows the 2026-10-02 migration
// assessment and has not been verified against a real V2 server.

export type ServerGeneration = "v1" | "v2" | "unknown"

export type ServerVersionProbe = {
  version?: string
  generation: ServerGeneration
  source?: "health" | "info"
}

/** Major version from a dotted version string. Anything other than 1 or 2 is unknown. */
function generationOf(version: string): ServerGeneration {
  const major = /^(\d+)\./.exec(version)?.[1]
  if (major === "1") return "v1"
  if (major === "2") return "v2"
  return "unknown"
}

function versionString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

/** Top-level `version`, then (info payloads only) `info.version` / `data.version`. Non-strings are ignored. */
function versionFromPayload(body: unknown, allowNested: boolean): string | undefined {
  if (!body || typeof body !== "object") return undefined
  const record = body as Record<string, unknown>
  const top = versionString(record.version)
  if (top) return top
  if (!allowNested) return undefined
  for (const key of ["info", "data"] as const) {
    const nested = record[key]
    if (!nested || typeof nested !== "object") continue
    const version = versionString((nested as Record<string, unknown>).version)
    if (version) return version
  }
  return undefined
}

function probed(version: string, source: "health" | "info"): ServerVersionProbe {
  return { version, generation: generationOf(version), source }
}

/** Try `GET /global/health`, then `GET /api/info`. Both missing or throwing → generation unknown. */
export async function probeServerVersion(
  request: (method: string, path: string) => Promise<unknown>,
): Promise<ServerVersionProbe> {
  try {
    const health = await request("GET", "/global/health")
    const version = versionFromPayload(health, false)
    if (version) return probed(version, "health")
  } catch {
    // Health is absent on some servers; /api/info is the fallback.
  }
  try {
    const info = await request("GET", "/api/info")
    const version = versionFromPayload(info, true)
    if (version) return probed(version, "info")
  } catch {
    // Neither endpoint identified a version.
  }
  return { generation: "unknown" }
}

/** Shown when the connected server reports OpenCode V2. This build talks to V1 only. */
export function v2UnsupportedMessage(version: string): string {
  return `This oco build supports OpenCode V1 only; the server reports ${version} (OpenCode V2). In managed mode set oco.opencodePath to a V1 executable, or connect to a V1 server.`
}
