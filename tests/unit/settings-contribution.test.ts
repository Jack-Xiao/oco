// Connection-settings surface declared in the extension manifest (no VS Code runtime needed).
import { describe, expect, test } from "bun:test"
import pkg from "../../apps/extension/package.json"
import { endpointFromSetting } from "../../apps/extension/src/endpoint"

const c = pkg.contributes as any
const welcome = (state: string) => (c.viewsWelcome as { when?: string; contents: string }[]).filter((w) => (w.when ?? "").includes(`connState == ${state}`))

describe("connection settings contribution", () => {
  test("a discoverable Open Settings command exists in the sidebar title and is what welcome views link to", () => {
    expect(c.commands.some((x: any) => x.command === "oco.openSettings")).toBe(true)
    expect(c.menus["view/title"].some((m: any) => m.command === "oco.openSettings")).toBe(true)
    for (const s of ["error", "unauthorized", "reconnecting"]) expect(welcome(s).every((w) => w.contents.includes("command:oco.openSettings"))).toBe(true)
  })
  test("unconfigured splits: no-folder offers Open Folder, invalid endpoint offers settings", () => {
    const u = welcome("unconfigured")
    expect(u.find((w) => w.when.includes("connIssue == folder"))?.contents).toContain("openFolder")
    expect(u.find((w) => w.when.includes("connIssue != folder"))?.contents).toContain("command:oco.openSettings")
  })
  test("unauthorized offers the password command; password is not a setting", () => {
    expect(welcome("unauthorized")[0].contents).toContain("command:oco.setServerPassword")
    const props = Object.keys(c.configuration.properties)
    expect(props.sort()).toEqual(["oco.opencodePath", "oco.serverMode", "oco.serverUrl", "oco.serverUsername"])
    expect(props.some((k) => /pass|secret|token/i.test(k))).toBe(false)
  })
  test("all settings stay machine scoped and are documented in Chinese", () => {
    for (const p of Object.values(c.configuration.properties) as any[]) {
      expect(p.scope).toBe("machine")
      expect(p.markdownDescription).toMatch(/[一-鿿]/)
    }
    expect(c.configuration.properties["oco.serverUrl"].markdownDescription).toContain("machine")
    expect(c.configuration.properties["oco.serverUsername"].markdownDescription).toContain("Set Server Password")
    expect(c.configuration.properties["oco.serverMode"].default).toBe("attached")
    expect(c.configuration.properties["oco.serverMode"].enum).toEqual(["attached", "managed"])
  })
  test("Sessions plus a collapsed Connection view (keeps the Sessions header); no Agents view or commands", () => {
    expect(c.views.oco.map((v: any) => v.id)).toEqual(["oco.sessions", "oco.connection"])
    expect(c.views.oco.find((v: any) => v.id === "oco.connection").visibility).toBe("collapsed")
    expect(JSON.stringify(pkg)).not.toContain("oco.agents")
    expect(c.menus["view/title"].find((m: any) => m.command === "oco.selectFolder")?.when).toContain("oco.multiRoot")
    for (const id of ["oco.selectFolder", "oco.exportDiagnostics", "oco.showLog", "oco.restartManagedServer", "oco.stopManagedServer"]) expect(c.commands.some((x: any) => x.command === id)).toBe(true)
  })
})

describe("endpoint validation never echoes credentials", () => {
  test("credential-bearing and malformed URLs are rejected without leaking the value", () => {
    for (const raw of ["http://u:secretpw@127.0.0.1:4096", "ftp://x", "not a url", "http://127.0.0.1:4096/x?token=abc"]) {
      let msg = ""
      try {
        endpointFromSetting(raw, "opencode")
      } catch (e) {
        msg = (e as Error).message
      }
      expect(msg).not.toBe("")
      expect(msg).not.toContain("secretpw")
      expect(msg).not.toContain("token=abc")
    }
  })
  test("changing url or username changes the connection identity (secrets are per identity)", () => {
    const a = endpointFromSetting("http://127.0.0.1:4096", "opencode").connectionId
    expect(endpointFromSetting("http://127.0.0.1:4097", "opencode").connectionId).not.toBe(a)
    expect(endpointFromSetting("http://127.0.0.1:4096", "other").connectionId).not.toBe(a)
  })
})
