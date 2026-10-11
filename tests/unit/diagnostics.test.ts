// T015 diagnostics redaction and version notes.
import { describe, expect, test } from "bun:test"
import { redactText, redactValue, serverInfoLines, versionNote, VERIFIED_SERVERS } from "../../apps/extension/src/diagnostics"

describe("diagnostics redaction", () => {
  test("secrets, auth headers, URL credentials and home paths are removed", () => {
    const t = redactText("Authorization: Basic b3BlbmNvZGU6c2VjcmV0 token=abc123 http://u:pw@h/x /Users/me/p hunter2", { home: "/Users/me", extra: ["hunter2"] })
    expect(t).not.toContain("b3BlbmNvZGU6c2VjcmV0")
    expect(t).not.toContain("abc123")
    expect(t).not.toContain("u:pw@")
    expect(t).not.toContain("hunter2")
    expect(t).toContain("~/p")
  })
  test("secret-named keys are dropped deep in objects, booleans kept", () => {
    const v = redactValue({ a: { password: "x", apiKey: "y", passwordStored: true, list: ["/Users/me/q"] } }, { home: "/Users/me" }) as any
    expect(v.a.password).toBe("<redacted>")
    expect(v.a.apiKey).toBe("<redacted>")
    expect(v.a.passwordStored).toBe(true)
    expect(v.a.list[0]).toBe("~/q")
  })
})

describe("server version notes", () => {
  test("verified version has no note; other v1 and non-v1 are flagged", () => {
    for (const v of VERIFIED_SERVERS) expect(versionNote(v)).toBeUndefined()
    expect(versionNote("1.18.13")).toBeUndefined()
    expect(versionNote("1.19.0")).toMatch(/not verified by oco/)
    expect(versionNote("2.0.0")).toMatch(/not OpenCode v1/)
    expect(versionNote(undefined)).toBeUndefined()
  })
  test("status lines show mode, version and managed process", () => {
    const l = serverInfoLines({ mode: "managed", version: "1.18.33", managed: { status: "running", pid: 7 } })
    expect(l.join("\n")).toMatch(/Managed/)
    expect(l.join("\n")).toMatch(/pid 7/)
  })
})
