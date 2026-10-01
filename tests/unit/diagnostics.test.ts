// T015 diagnostics redaction and version notes.
import { describe, expect, test } from "bun:test"
import { connectionRows, redactText, redactValue, serverInfoLines, versionNote, VERIFIED_SERVER } from "../../apps/extension/src/diagnostics"

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
    expect(versionNote(VERIFIED_SERVER)).toBeUndefined()
    expect(versionNote("1.19.0")).toMatch(/未经 oco 验证/)
    expect(versionNote("2.0.0")).toMatch(/不是 OpenCode v1/)
    expect(versionNote(undefined)).toBeUndefined()
  })
  test("status lines show mode, version and managed process", () => {
    const l = serverInfoLines({ mode: "managed", version: "1.18.33", managed: { status: "running", pid: 7 } })
    expect(l.join("\n")).toMatch(/托管/)
    expect(l.join("\n")).toMatch(/pid 7/)
  })
})

describe("Connection view rows", () => {
  const base = { connectionId: "c1", label: "http://127.0.0.1:4096", directory: "/w/proj", attempt: 0, trusted: true }
  const row = (rows: ReturnType<typeof connectionRows>, label: string) => rows.find((r) => r.label === label)
  test("connected: state, server, folder name, mode and verified version", () => {
    const rows = connectionRows({ ...base, state: "connected" }, { version: VERIFIED_SERVER, mode: "attached" })
    expect(rows.map((r) => `${r.label}=${r.value}`)).toEqual(["状态=已连接", "服务=http://127.0.0.1:4096", "目录=proj", "模式=连接已有服务", `版本=${VERIFIED_SERVER}`])
    expect(row(rows, "目录")?.tooltip).toBe("/w/proj")
    expect(row(rows, "状态")?.command).toBeUndefined()
  })
  test("the state row offers the same action as the status bar", () => {
    expect(row(connectionRows({ ...base, state: "reconnecting", attempt: 3 }, undefined), "状态")).toMatchObject({ value: "重连中（第 3 次）", command: "oco.reconnect" })
    expect(row(connectionRows({ ...base, state: "unauthorized", error: "401" }, undefined), "状态")).toMatchObject({ command: "oco.setServerPassword", tooltip: "401" })
    expect(row(connectionRows({ ...base, state: "unconfigured", issue: "endpoint" }, undefined), "状态")?.command).toBe("oco.openSettings")
    expect(row(connectionRows({ ...base, state: "unconfigured", issue: "folder" }, undefined), "状态")?.command).toBeUndefined()
    expect(row(connectionRows(undefined, undefined), "状态")?.value).toBe("连接中")
  })
  test("unverified version, failed managed process and restricted mode are flagged", () => {
    const rows = connectionRows({ ...base, state: "error", trusted: false }, { version: "1.0.0", mode: "managed", managed: { status: "failed", error: "spawn ENOENT" } })
    expect(row(rows, "版本")).toMatchObject({ value: "1.0.0（未验证）", icon: "warning" })
    expect(row(rows, "托管进程")).toMatchObject({ value: "failed", tooltip: "spawn ENOENT", command: "oco.restartManagedServer" })
    expect(row(rows, "受限模式")?.value).toBe("只读")
  })
})
