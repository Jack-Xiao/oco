// Dev aid (not a test suite): look at the runtime view on REAL local sessions, without a remote host.
// Opens an isolated VS Code (own user-data-dir, this checkout's extension build) on a real folder in managed
// mode, so the server reads the local OpenCode data; opens one existing session by title, switches to the
// runtime view and saves live + replay screenshots and a report. Read-only: it never sends a prompt.
// Usage: LOOK_WS=<folder> LOOK_TITLE=<title substring> [LOOK_OUT=.oco-look-local] [LOOK_W=1600] [LOOK_H=1000]
//        [LOOK_POINTS=0.15,0.4,0.65,0.9] [LOOK_SETTLE=700] node scripts/look-local.mjs
import fs from "node:fs"
import path from "node:path"
import { launch, command, waitUntil, chatFrames, sleep } from "../tests/e2e/vscode.mjs"

if (!process.env.LOOK_WS || !process.env.LOOK_TITLE) throw new Error("set LOOK_WS and LOOK_TITLE")
const OUT = process.env.LOOK_OUT ?? path.resolve(".oco-look-local")
const W = Number(process.env.LOOK_W ?? 1600)
const H = Number(process.env.LOOK_H ?? 1000)
const POINTS = (process.env.LOOK_POINTS ?? "0.15,0.4,0.65,0.9").split(",").map(Number)
fs.mkdirSync(OUT, { recursive: true })
const report = { ws: process.env.LOOK_WS, title: process.env.LOOK_TITLE, w: W, h: H, timings: {}, errors: [] }
const t0 = Date.now()
const mark = (k) => (report.timings[k] = Date.now() - t0)

const { app, page } = await launch({
  workspace: process.env.LOOK_WS,
  profile: "look-local",
  settings: { "oco.serverMode": "managed", "workbench.colorTheme": "Default Dark Modern", "workbench.sideBar.location": "left" },
})
page.on("console", (m) => {
  if (m.type() === "error") report.errors.push(m.text().slice(0, 300))
})
try {
  await app.evaluate(({ BrowserWindow }, { w, h }) => BrowserWindow.getAllWindows()[0].setContentSize(w, h), { w: W, h: H })
  mark("launched")
  // Managed server start + session list: retry the picker until a row matches.
  let f
  for (let i = 0; i < 6 && !f; i++) {
    await command(page, "oco: Open Session", { input: process.env.LOOK_TITLE }).catch((e) => report.errors.push("cmd " + e.message))
    f = await waitUntil(async () => {
      for (const fr of await chatFrames(page)) if (await fr.$("[data-oco-view]").catch(() => null)) return fr
    }, 15000, 300)
  }
  if (!f) throw new Error("no chat frame")
  mark("opened")
  await command(page, "View: Close Primary Side Bar").catch(() => {})
  await f.locator('[data-oco-view="runtime"]').click()
  await f.locator("[data-oco-runtime]").waitFor({ state: "visible", timeout: 20000 })
  mark("runtime")
  await sleep(2500)
  const diag = () =>
    f.evaluate(() => {
      const q = (s) => document.querySelector(s)
      const frame = q("[data-oco-runtime-frame]")
      return {
        mode: q("[data-oco-runtime-mode]")?.getAttribute("data-oco-runtime-mode"),
        layout: q("[data-oco-runtime]")?.getAttribute("data-oco-runtime-layout"),
        frameScrolls: frame ? frame.scrollHeight > frame.clientHeight + 1 : null,
        probes: [...document.querySelectorAll("[data-oco-runtime-probe]")].map((e) => e.getAttribute("data-oco-runtime-probe-stage")).join(","),
        time: q("[data-oco-runtime-replay-time]")?.textContent,
        header: q("[data-oco-runtime-replay]")?.parentElement?.textContent?.replace(/\s+/g, " ").slice(0, 240),
        summary: q("[data-oco-runtime-summary]")?.textContent?.replace(/\s+/g, " ").slice(0, 240),
        goal: q("[data-oco-runtime-goal]")?.textContent?.replace(/\s+/g, " ").slice(0, 160),
        steps: q('[data-oco-runtime-replay] input[type="range"]')?.max,
      }
    })
  report.live = await diag()
  await page.screenshot({ path: path.join(OUT, "live.png") })
  for (const p of POINTS) {
    if ((await f.locator("[data-oco-runtime-mode]").getAttribute("data-oco-runtime-mode")) !== "replay")
      await f.locator("[data-oco-runtime-replay-pause]").click().catch(() => {})
    await f.locator('[data-oco-runtime-replay] input[type="range"]').evaluate((el, p) => {
      el.value = String(Math.floor(Number(el.max) * p))
      el.dispatchEvent(new Event("input", { bubbles: true }))
    }, p)
    await sleep(Number(process.env.LOOK_SETTLE ?? 700))
    report[`replay-${p}`] = await diag()
    await page.screenshot({ path: path.join(OUT, `replay-${p}.png`) })
  }
  mark("done")
} catch (e) {
  report.fatal = String(e.stack ?? e).slice(0, 800)
  await page.screenshot({ path: path.join(OUT, "fatal.png") }).catch(() => {})
} finally {
  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2))
  await app.close().catch(() => {})
}
