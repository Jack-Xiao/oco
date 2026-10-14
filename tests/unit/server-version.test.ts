import { describe, expect, test } from "bun:test"
import { probeServerVersion } from "../../apps/extension/src/server-version"

function scripted(replies: Record<string, unknown | Error>) {
  const calls: { method: string; path: string }[] = []
  const request = async (method: string, path: string) => {
    calls.push({ method, path })
    if (!(path in replies)) throw new Error(`unexpected ${method} ${path}`)
    const body = replies[path]
    if (body instanceof Error) throw body
    return body
  }
  return { request, calls }
}

describe("probeServerVersion", () => {
  test("health 1.18.33 is v1 from health and does not call /api/info", async () => {
    const { request, calls } = scripted({ "/global/health": { version: "1.18.33" } })
    expect(await probeServerVersion(request)).toEqual({ version: "1.18.33", generation: "v1", source: "health" })
    expect(calls).toEqual([{ method: "GET", path: "/global/health" }])
  })

  test("health throw plus /api/info 2.0.28 is v2 from info", async () => {
    const { request, calls } = scripted({
      "/global/health": new Error("down"),
      "/api/info": { version: "2.0.28" },
    })
    expect(await probeServerVersion(request)).toEqual({ version: "2.0.28", generation: "v2", source: "info" })
    expect(calls.map((c) => c.path)).toEqual(["/global/health", "/api/info"])
  })

  test("health without version falls through to info 1.x", async () => {
    const { request } = scripted({
      "/global/health": { healthy: true },
      "/api/info": { version: "1.18.13" },
    })
    expect(await probeServerVersion(request)).toEqual({ version: "1.18.13", generation: "v1", source: "info" })
  })

  test("nested data.version is recognized", async () => {
    const { request } = scripted({
      "/global/health": {},
      "/api/info": { data: { version: "2.0.28" } },
    })
    expect(await probeServerVersion(request)).toEqual({ version: "2.0.28", generation: "v2", source: "info" })
  })

  test("nested info.version is recognized when top-level version is absent", async () => {
    const { request } = scripted({
      "/global/health": { version: "" },
      "/api/info": { info: { version: "1.18.33" } },
    })
    expect(await probeServerVersion(request)).toEqual({ version: "1.18.33", generation: "v1", source: "info" })
  })

  test("both endpoints failing is unknown", async () => {
    const { request } = scripted({
      "/global/health": new Error("down"),
      "/api/info": new Error("down"),
    })
    expect(await probeServerVersion(request)).toEqual({ generation: "unknown" })
  })

  test("non-string version is ignored", async () => {
    const { request } = scripted({
      "/global/health": { version: 2 },
      "/api/info": { version: 2, info: { version: false }, data: { version: null } },
    })
    expect(await probeServerVersion(request)).toEqual({ generation: "unknown" })
  })

  test("other major versions stay unknown but keep the reported version", async () => {
    const { request } = scripted({ "/global/health": { version: "3.1.0" } })
    expect(await probeServerVersion(request)).toEqual({ version: "3.1.0", generation: "unknown", source: "health" })
  })
})
