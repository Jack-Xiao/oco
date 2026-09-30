// T014 connection-settings subset: settings entry, settings changes, invalid URL, auth failure, offline,
// and that the password never lands in settings or diagnostics. A local proxy stands between the extension and the
// isolated test server so 401 / offline can be produced without touching the server.
// Cases: open-settings, invalid-url, valid-change, auth-failure, offline, secret-not-in-settings
import fs from "node:fs"
import { fileURLToPath } from "node:url"
import { createRun } from "./lib/results.mjs"
import { startProxy } from "./lib/proxy.mjs"
import { launch, command, sleep, runShot, hostState, root } from "./vscode.mjs"

const CASES = ["open-settings", "invalid-url", "valid-change", "auth-failure", "offline", "secret-not-in-settings"]
const run = createRun({ suite: "t014-connection", required: CASES, scriptPath: fileURLToPath(import.meta.url) })
const DIRECT = process.env.OCO_TEST_URL ?? "http://127.0.0.1:4517"
const proxy = await startProxy({ target: DIRECT })
let deny401 = false
proxy.intercept((method, url) => (deny401 && url.pathname === "/event" ? { status: 401, json: { error: "unauthorized" } } : undefined))
let app
run.installCrashHandlers(async () => {
  await app?.close().catch(() => {})
  await proxy.close()
})

async function until(fn, ms, step = 300) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    const v = await fn().catch(() => undefined)
    if (v) return v
    await sleep(step)
  }
  return undefined
}
const rec = async (id, fn) => {
  try {
    await fn()
  } catch (e) {
    run.record(id, "FAIL", { error: String(e?.message ?? e).slice(0, 400) })
  }
}

try {
  const l = await launch({ profile: "t014-connection", run, settings: { "oco.serverUrl": "not a url" } })
  app = l.app
  const page = l.page
  const conn = async () => (await hostState(page, l.stateFile)).sidebar.connection
  const setSettings = (patch) => fs.writeFileSync(l.settingsFile, JSON.stringify({ ...JSON.parse(fs.readFileSync(l.settingsFile, "utf8")), ...patch }, null, 2))

  await rec("invalid-url", async () => {
    const c = await until(async () => {
      const c = await conn()
      return c?.state === "unconfigured" ? c : undefined
    }, 30000)
    const state = await hostState(page, l.stateFile)
    const ok = c?.issue === "endpoint" && /有效 URL/.test(c.error ?? "") && /有效 URL/.test(state.sidebar.message ?? "") && proxy.stats.requests === 0
    run.record("invalid-url", ok ? "PASS" : "FAIL", { connection: c, message: state.sidebar.message, statusText: state.sidebar.statusText, proxyRequests: proxy.stats.requests })
  })

  await rec("open-settings", async () => {
    await command(page, "oco: Open Settings")
    const editor = page.locator(".settings-editor")
    const shown = await editor.waitFor({ timeout: 15000 }).then(() => true, () => false)
    await sleep(800)
    const query = shown ? ((await page.locator(".settings-editor .suggest-input-container .view-lines").first().textContent().catch(() => "")) ?? "").replace(/ /g, " ").trim() : ""
    const listed = shown ? await page.locator('.settings-editor .setting-item-title, .settings-editor [class*="setting-item-label"]').allTextContents().catch(() => []) : []
    await runShot(page, run, "open-settings")
    run.record("open-settings", shown && /oco/.test(query) ? "PASS" : "FAIL", { shown, query, listed: listed.slice(0, 6) })
  })

  await rec("valid-change", async () => {
    setSettings({ "oco.serverUrl": proxy.url })
    const c = await until(async () => ((await conn())?.state === "connected" ? await conn() : undefined), 40000)
    run.record("valid-change", c && c.label === proxy.url ? "PASS" : "FAIL", { connection: c, proxyRequests: proxy.stats.requests })
  })

  await rec("auth-failure", async () => {
    deny401 = true
    await command(page, "oco: Reconnect")
    const c = await until(async () => {
      const c = await conn()
      return c?.state === "unauthorized" ? c : undefined
    }, 20000)
    const before = proxy.stats.requests
    await sleep(3000) // unauthorized must not retry on its own
    const retried = proxy.stats.requests - before
    const st = await hostState(page, l.stateFile)
    deny401 = false
    run.record("auth-failure", c && /用户名或密码/.test(c.error ?? "") && retried === 0 && /需要密码/.test(st.sidebar.statusText ?? "") ? "PASS" : "FAIL", { connection: c, retriedRequests: retried, statusText: st.sidebar.statusText })
    await command(page, "oco: Reconnect")
    await until(async () => ((await conn())?.state === "connected" ? true : undefined), 30000)
  })

  await rec("offline", async () => {
    proxy.refuse(true)
    const c = await until(async () => {
      const c = await conn()
      return (c?.state === "reconnecting" || c?.state === "error") && c.error ? c : undefined
    }, 30000)
    proxy.refuse(false)
    run.record("offline", c && /无法连接服务/.test(c.error ?? "") && !/认证/.test(c.error ?? "") ? "PASS" : "FAIL", { connection: c })
    await command(page, "oco: Reconnect")
    await until(async () => ((await conn())?.state === "connected" ? true : undefined), 30000)
  })

  await rec("secret-not-in-settings", async () => {
    const secret = fs.readFileSync(`${root}/.oco-test/secret`, "utf8").trim()
    const settings = fs.readFileSync(l.settingsFile, "utf8")
    const state = JSON.stringify(await hostState(page, l.stateFile))
    const props = Object.keys(JSON.parse(settings)).filter((k) => k.startsWith("oco."))
    const ok = secret.length > 8 && !settings.includes(secret) && !state.includes(secret) && !props.some((k) => /pass|secret|token/i.test(k))
    run.record("secret-not-in-settings", ok ? "PASS" : "FAIL", { ocoSettingKeys: props, secretInSettings: settings.includes(secret), secretInState: state.includes(secret) })
  })
} catch (e) {
  run.record("run", "FAIL", { error: String(e?.message ?? e).slice(0, 400) })
} finally {
  proxy.refuse(false)
  await app?.close().catch(() => {})
  await proxy.close().catch(() => {})
  process.exit(run.finish())
}
