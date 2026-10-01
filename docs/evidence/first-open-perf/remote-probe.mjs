// Opens one existing session in a fresh VS Code window connected to gcp-workstation and times the first open.
import { _electron as electron } from "playwright-core"
import fs from "node:fs"
import path from "node:path"
const S = path.dirname(new URL(import.meta.url).pathname)
const [label, sessionTitle = "今日测试记录"] = process.argv.slice(2)
const userData = path.join(fs.realpathSync(new URL("../../../.oco-test", import.meta.url).pathname), "vscode", "r-" + label)
fs.rmSync(userData, { recursive: true, force: true })
fs.mkdirSync(path.join(userData, "User"), { recursive: true })
fs.writeFileSync(path.join(userData, "User/settings.json"), JSON.stringify({
  "remote.SSH.connectTimeout": 240, "workbench.startupEditor": "none", "telemetry.telemetryLevel": "off", "update.mode": "none",
  "extensions.autoUpdate": false, "security.workspace.trust.enabled": false, "window.restoreWindows": "none", "chat.disableAIFeatures": true,
  "workbench.tips.enabled": false, "remote.SSH.showLoginTerminal": false, "remote.SSH.remotePlatform": { "gcp-workstation": "linux" },
}))
const log = (...a) => console.error(new Date().toISOString().slice(11, 19), ...a)
const app = await electron.launch({
  executablePath: "/Applications/Visual Studio Code.app/Contents/MacOS/Code",
  args: ["--folder-uri", "vscode-remote://ssh-remote+gcp-workstation/home/user/ai", `--user-data-dir=${userData}`, `--extensions-dir=${path.join(S, "rext")}`,
    "--skip-welcome", "--skip-release-notes", "--disable-workspace-trust", "--new-window",
    ...(process.env.VARIANT ? [`--extensionDevelopmentPath=vscode-remote://ssh-remote+gcp-workstation/home/user/oco-perf/${process.env.VARIANT}`] : [])],
  timeout: 60000,
})
const page = await app.firstWindow()
process.on("uncaughtException", async (e) => { console.error("ERR", e.message.split("\n")[0]); await page.screenshot({ path: path.join(S, `remote-${label}-err.png`) }).catch(() => {}); const q = await page.locator(".quick-input-widget").innerText().catch(() => ""); console.error("QUICK", q.slice(0, 400)); await app.close(); process.exit(1) })
await page.waitForSelector(".monaco-workbench", { timeout: 60000 })
log("workbench up; waiting for remote")
const tConn = Date.now()
// The oco command becomes available once the remote extension host has activated its contributions.
let ok = false
while (Date.now() - tConn < 300000) {
  const host = await page.locator("#status\\.host").textContent().catch(() => "")
  if (/gcp-workstation/.test(host) && !/Opening|Setting up|正在/.test(host)) { ok = true; break }
  await page.waitForTimeout(1000)
}
if (!ok) { log("remote not connected"); await page.screenshot({ path: path.join(S, `remote-${label}-fail.png`) }); await app.close(); process.exit(1) }
log("remote connected in", Date.now() - tConn, "ms")
await page.waitForTimeout(8000)
const palette = page.locator(".quick-input-widget input")
await page.keyboard.press("F1")
await palette.waitFor({ state: "visible", timeout: 5000 })
await palette.fill(">oco: Open Session")
await page.waitForFunction(() => document.querySelector(".quick-input-list .monaco-list-row.focused")?.textContent?.includes("Open Session"), null, { timeout: 30000 })
await page.keyboard.press("Enter")
await page.waitForFunction(() => { const el = document.querySelector(".quick-input-widget input"); return el && el.offsetParent !== null && !el.value.startsWith(">") }, null, { timeout: 30000 })
await page.keyboard.type(sessionTitle)
await page.waitForFunction((t) => document.querySelector(".quick-input-list .monaco-list-row.focused")?.textContent?.includes(t), sessionTitle, { timeout: 30000 })
const t0 = Date.now()
await page.keyboard.press("Enter")
const marks = {}
let frame
while (Date.now() - t0 < 120000) {
  for (const f of page.frames()) {
    if (!f.url().startsWith("vscode-webview://")) continue
    const s = await f.evaluate(() => window.__OCO_INIT__ ? {
      skeleton: !!document.getElementById("oco-boot"), root: !!document.querySelector("#root > *"),
      prompt: !!document.querySelector('[data-component="prompt-input"]'),
      text: (document.querySelector("#root")?.innerText ?? "").length,
    } : null).catch(() => null)
    if (!s) continue
    frame = f
    const t = Date.now() - t0
    if (s.skeleton) marks.skeleton ??= t
    if (s.root) marks.root ??= t
    if (s.prompt) marks.prompt ??= t
    if (s.prompt && s.text > 200) marks.content ??= t
  }
  if (marks.content) break
  await page.waitForTimeout(50)
}
await page.waitForTimeout(3000)
const data = frame && await frame.evaluate(() => ({
  timeOrigin: performance.timeOrigin,
  stats: { req: window.__OCO_STATS__?.fetchRequests, coalesced: window.__OCO_STATS__?.fetchCoalesced, log: window.__OCO_STATS__?.fetchLog },
  res: performance.getEntriesByType("resource").map((r) => [Math.round(r.startTime), Math.round(r.responseEnd), r.name.split("/").pop().split("?")[0]]),
}))
await page.screenshot({ path: path.join(S, `remote-${label}.png`) })
const out = { label, docCreatedMs: data && Math.round(data.timeOrigin - t0), marks, stats: data?.stats, res: data?.res }
fs.writeFileSync(path.join(S, `remote-${label}.json`), JSON.stringify(out, null, 1))
console.log(JSON.stringify({ label, index: (data?.res ?? []).map((r) => r[2]).find((n) => n.startsWith("index-")), docCreatedMs: out.docCreatedMs, marks, req: out.stats?.req, coalesced: out.stats?.coalesced, resources: data?.res.length, lastResourceEnd: Math.max(...(data?.res ?? []).map((r) => r[1])) }))
if (process.env.PHASE2) {
  await page.keyboard.press("Escape")
  await page.click(".part.sidebar .composite.title", { position: { x: 30, y: 10 } }).catch(() => {})
  await page.keyboard.press("F1"); await palette.waitFor({ state: "visible" }); await palette.fill(">View: Close All Editors")
  await page.waitForTimeout(800); await page.keyboard.press("Enter"); await page.waitForTimeout(2000)
  await page.keyboard.press("F1"); await palette.waitFor({ state: "visible" }); await palette.fill(">oco: Open Session")
  await page.waitForFunction(() => document.querySelector(".quick-input-list .monaco-list-row.focused")?.textContent?.includes("Open Session"), null, { timeout: 30000 })
  await page.keyboard.press("Enter")
  await page.waitForFunction(() => { const el = document.querySelector(".quick-input-widget input"); return el && el.offsetParent !== null && !el.value.startsWith(">") }, null, { timeout: 30000 })
  await page.keyboard.type(process.env.PHASE2)
  await page.waitForFunction((t) => document.querySelector(".quick-input-list .monaco-list-row.focused")?.textContent?.includes(t), process.env.PHASE2, { timeout: 30000 })
  const t1 = Date.now(); await page.keyboard.press("Enter")
  let prompt2
  while (Date.now() - t1 < 60000 && !prompt2) {
    for (const f of page.frames()) if (f.url().startsWith("vscode-webview://") && await f.$('[data-component="prompt-input"]').catch(() => null)) { prompt2 = Date.now() - t1; frame = f }
    await page.waitForTimeout(50)
  }
  await page.waitForTimeout(3000)
  const res2 = await frame.evaluate(() => performance.getEntriesByType("resource").map((r) => [Math.round(r.startTime), Math.round(r.responseEnd), r.name.split("/").pop().split("?")[0]]))
  console.log(JSON.stringify({ phase2PromptMs: prompt2, res2 }))
}
await app.close()
