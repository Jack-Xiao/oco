// E2E c28-status-hud (cc-features): status bar HUD item (id oco.hud) for the focused session.
// Cases:
//   hud-shown     after one finished turn the item shows the model id and a context figure (NN%, "<k>k tok") or a cost ($)
//   hud-disabled  setting oco.statusBar.hud=false removes the item; setting it back to true restores it
// The mock model reports no price, so the cost part ("$0.12") is omitted by design; the context figure stands in for "$/tok".
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { createRun } from "./lib/results.mjs"
import { launch, userDataDirFor, waitUntil, chatFrames, sleep, runShot, createAndOpenSession } from "./vscode.mjs"
import { api, waitReply, MODEL } from "./server.mjs"

const run = createRun({ suite: "c28-status-hud", required: ["hud-shown", "hud-disabled"], scriptPath: fileURLToPath(import.meta.url) })
const health = await api("GET", "/global/health").catch(() => null)
run.setEnv({ serverVersion: health?.version ?? null, modelMode: MODEL.mode })
const PROFILE = "c28-status-hud"
const { app, page } = await launch({ profile: PROFILE, run })
run.installCrashHandlers(() => app.close())
const settingsFile = path.join(userDataDirFor(PROFILE), "User/settings.json")
const hud = () => page.locator('.statusbar [id*="oco.hud"]')
const hudText = async () => ((await hud().count()) > 0 ? ((await hud().first().innerText().catch(() => "")) ?? "").trim() : null)
function setHud(value) {
  const s = JSON.parse(fs.readFileSync(settingsFile, "utf8"))
  s["oco.statusBar.hud"] = value
  fs.writeFileSync(settingsFile, JSON.stringify(s, null, 2))
}

try {
  const sid = await createAndOpenSession(page)
  let f
  await waitUntil(async () => {
    for (const x of await chatFrames(page)) if (await x.evaluate(() => !!document.querySelector('[data-component="prompt-input"]')).catch(() => false)) f = x
    return !!f
  }, 60000, 200)
  await waitUntil(async () => (await f.evaluate(() => document.documentElement.dataset.ocoModel)) === "ready", 60000, 100)
  const input = f.locator('[data-component="prompt-input"]')
  await input.click()
  await input.focus()
  await page.keyboard.type("Reply with exactly this line and nothing else: hud-ok", { delay: 4 })
  await sleep(200)
  await page.keyboard.press("Enter")
  await waitReply(sid)
  await waitUntil(async () => /\d+%|tok|\$/.test((await hudText()) ?? ""), 20000, 300).catch(() => undefined)
  const text = await hudText()
  await runShot(page, run, "1-hud")
  run.record("hud-shown", text && text.includes(MODEL.modelID) && /\d+%|\d+k tok|\$/.test(text) ? "PASS" : "FAIL", { text, modelID: MODEL.modelID })

  setHud(false)
  const gone = await waitUntil(async () => (await hud().count()) === 0 || !(await hud().first().isVisible().catch(() => false)), 15000, 300)
  await runShot(page, run, "2-hud-off")
  setHud(true)
  const back = await waitUntil(async () => !!(await hudText()), 15000, 300)
  run.record("hud-disabled", gone && back ? "PASS" : "FAIL", { gone, back, textAfter: await hudText() })
} catch (e) {
  run.record("run", "FAIL", { error: String(e?.message ?? e).slice(0, 500) })
  await runShot(page, run, "error")
} finally {
  await app.close().catch(() => {})
  process.exit(run.finish())
}
