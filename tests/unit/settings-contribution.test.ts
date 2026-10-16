// Connection-settings surface declared in the extension manifest (no VS Code runtime needed).
import { describe, expect, test } from "bun:test"
import pkg from "../../apps/extension/package.json"
import { endpointFromSetting } from "../../apps/extension/src/endpoint"
import { listMessage } from "../../apps/extension/src/session-groups"

const c = pkg.contributes as any
// The list's state messages (formerly viewsWelcome) for a connection state with nothing cached.
const welcome = (state: string, issue?: string) =>
  listMessage({ summary: { state, issue } as any, connected: false, hasRows: false, query: "", loading: false, trusted: true })!
const commands = (m: { actions: { command: string }[] }) => m.actions.map((a) => a.command)

describe("connection settings contribution", () => {
  test("a discoverable Open Settings command exists in the sidebar title and is what the state messages link to", () => {
    expect(c.commands.some((x: any) => x.command === "oco.openSettings")).toBe(true)
    expect(c.menus["view/title"].some((m: any) => m.command === "oco.openSettings")).toBe(true)
    for (const s of ["error", "unauthorized"]) expect(commands(welcome(s))).toContain("oco.openSettings")
    const lost = listMessage({ summary: { state: "reconnecting" } as any, connected: true, hasRows: false, query: "", loading: false, trusted: true })!
    expect(commands(lost)).toEqual(["oco.reconnect", "oco.openSettings"])
  })
  test("unconfigured splits: no-folder offers Open Folder, invalid endpoint offers settings", () => {
    expect(commands(welcome("unconfigured", "folder"))).toEqual(["workbench.action.files.openFolder"])
    expect(commands(welcome("unconfigured", "endpoint"))).toEqual(["oco.openSettings"])
  })
  test("unauthorized offers the password command; password is not a setting", () => {
    expect(commands(welcome("unauthorized"))).toContain("oco.setServerPassword")
    const props = Object.keys(c.configuration.properties)
    expect(props.sort()).toEqual([
      "oco.decorations.changedFiles",
      "oco.git.commitPrompt",
      "oco.git.prPrompt",
      "oco.notify.finished",
      "oco.notify.needsMe",
      "oco.opencodePath",
      "oco.serverMode",
      "oco.serverUrl",
      "oco.serverUsername",
      "oco.sessions.notifyPending",
      "oco.statusBar.hud",
    ])
    expect(props.some((k) => /pass|secret|token/i.test(k))).toBe(false)
  })
  test("all settings stay machine scoped and are documented in English", () => {
    for (const p of Object.values(c.configuration.properties) as any[]) {
      expect(p.scope).toBe("machine")
      expect(p.markdownDescription).not.toMatch(/\p{Script=Han}/u)
      expect(String(p.markdownDescription).length).toBeGreaterThan(40)
    }
    expect(c.configuration.properties["oco.serverUrl"].markdownDescription).toContain("machine")
    expect(c.configuration.properties["oco.serverUsername"].markdownDescription).toContain("Set Server Password")
    expect(c.configuration.properties["oco.serverMode"].default).toBe("attached")
    expect(c.configuration.properties["oco.serverMode"].enum).toEqual(["attached", "managed"])
    for (const k of ["oco.notify.needsMe", "oco.notify.finished"]) {
      expect(c.configuration.properties[k].enum).toEqual(["off", "windowNotFocused", "always"])
      expect(c.configuration.properties[k].default).toBe("windowNotFocused")
    }
    expect(c.configuration.properties["oco.sessions.notifyPending"].markdownDeprecationMessage).toContain("oco.notify.needsMe")
  })
  test("one webview Sessions view (its title row merges into the container's); no Connection or Agents view", () => {
    expect(c.views.oco).toEqual([{ type: "webview", id: "oco.sessions", name: "Sessions", contextualTitle: "oco" }])
    expect(c.viewsWelcome).toBeUndefined()
    expect(JSON.stringify(pkg)).not.toContain("oco.agents")
    expect(JSON.stringify(pkg)).not.toContain("onView:oco.connection")
    // Search is a title-bar button; row actions live in the webview's context menu.
    expect(c.menus["view/title"].map((m: any) => m.command)).toEqual(expect.arrayContaining(["oco.newSession", "oco.searchSessions", "oco.reconnect"]))
    expect(c.menus["webview/context"].map((m: any) => m.command)).toEqual([
      "oco.openSessionInNewPanel",
      "oco.sessions.stop",
      "oco.renameSession",
      "oco.archiveSession",
      "oco.deleteSession",
      "oco.compactSession",
      "oco.exportSession",
      "oco.exportSessionToFile",
      "oco.pinSession",
      "oco.unpinSession",
      "oco.markSessionsUnread",
    ])
    for (const m of c.menus["webview/context"]) expect(m.when).toContain("webviewId == 'oco.sessions' && webviewSection == 'session'")
    expect(c.menus["view/title"].find((m: any) => m.command === "oco.selectFolder")?.when).toContain("oco.multiRoot")
    for (const id of ["oco.selectFolder", "oco.exportDiagnostics", "oco.showLog", "oco.restartManagedServer", "oco.stopManagedServer"]) expect(c.commands.some((x: any) => x.command === id)).toBe(true)
  })
  test("git actions (card 11): commands, SCM title button, hidden alias", () => {
    for (const cmd of ["oco.git.askCommit", "oco.git.commitWithOpenCode", "oco.git.askOpenPR", "oco.git.openScm"]) {
      expect(c.commands.some((x: any) => x.command === cmd)).toBe(true)
    }
    const scmTitle = c.menus["scm/title"]
    const commitBtn = scmTitle.find((m: any) => m.command === "oco.git.commitWithOpenCode")
    expect(commitBtn).toBeDefined()
    expect(commitBtn.when).toContain("scmProvider == git")
    expect(commitBtn.group).toMatch(/^navigation/)

    const prBtn = scmTitle.find((m: any) => m.command === "oco.git.askOpenPR")
    expect(prBtn).toBeDefined()
    expect(prBtn.when).toContain("scmProvider == git")

    const hidden = c.menus.commandPalette.find((m: any) => m.command === "oco.git.commitWithOpenCode")
    expect(hidden?.when).toBe("false")

    for (const k of ["oco.git.commitPrompt", "oco.git.prPrompt"]) {
      const prop = c.configuration.properties[k]
      expect(prop.scope).toBe("machine")
      expect(prop.markdownDescription).toContain("${branch}")
    }
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
