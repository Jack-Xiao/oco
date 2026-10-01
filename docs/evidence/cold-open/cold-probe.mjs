// Remote cold-open probe: in a separate VS Code instance connected to gcp-workstation with no oco panel open, open a
// session from the oco sidebar and record what is on screen until its content shows. Then close all editors and open
// the next one (same window, webview resources cached), and so on.
//   node cold-probe.mjs <label> [opens=3] [firstRow=0]
//   VARIANT=<dir under /home/user/oco-perf> loads that build with --extensionDevelopmentPath (installed one otherwise).
// Per open: a CDP screencast of the window (frames kept under $FRAMES, not in the repo) with the editor area's mean
// luminance per frame; a per-animation-frame DOM sampler inside the chat document; the document's paint and resource
// timings; and the bridge requests (__OCO_STATS__.fetchRecent).
import { _electron as electron } from "playwright-core"
import { execSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

const S = path.dirname(new URL(import.meta.url).pathname)
const [label = "run", opensArg = "3", firstArg = "0"] = process.argv.slice(2)
const OPENS = Number(opensArg)
const FIRST = Number(firstArg)
const HOST = process.env.OCO_REMOTE_HOST ?? "gcp-workstation"
const FOLDER = process.env.OCO_REMOTE_FOLDER ?? "/home/user/ai"
const FRAMES = path.join(process.env.FRAMES ?? os.tmpdir(), `cold-${label}`)
fs.rmSync(FRAMES, { recursive: true, force: true })
fs.mkdirSync(FRAMES, { recursive: true })
const main = path.dirname(path.resolve(S, execSync("git rev-parse --git-common-dir", { cwd: S }).toString().trim()))
const R = path.join(fs.realpathSync(path.join(main, ".oco-test")), "co") // short path: IPC socket limit
fs.rmSync(path.join(R, "rud"), { recursive: true, force: true })
fs.mkdirSync(path.join(R, "rud/User"), { recursive: true })
fs.mkdirSync(path.join(R, "rext"), { recursive: true })
const userExt = path.join(os.homedir(), ".vscode/extensions")
for (const e of fs.readdirSync(userExt).filter((d) => /^ms-vscode(-remote)?\.remote-(ssh|ssh-edit|explorer)-\d/.test(d)))
  if (!fs.existsSync(path.join(R, "rext", e))) fs.cpSync(path.join(userExt, e), path.join(R, "rext", e), { recursive: true })
fs.writeFileSync(path.join(R, "rud/User/settings.json"), JSON.stringify({
  "remote.SSH.connectTimeout": 240, "workbench.startupEditor": "none", "telemetry.telemetryLevel": "off", "update.mode": "none",
  "extensions.autoUpdate": false, "security.workspace.trust.enabled": false, "window.restoreWindows": "none", "chat.disableAIFeatures": true,
  "workbench.tips.enabled": false, "remote.SSH.showLoginTerminal": false, "remote.SSH.remotePlatform": { [HOST]: "linux" }, "window.dialogStyle": "custom",
  "workbench.colorTheme": process.env.THEME ?? "Default Dark Modern",
}))
const log = (...a) => console.error(new Date().toISOString().slice(11, 19), ...a)
const ids = JSON.parse(execSync(`ssh -o BatchMode=yes ${HOST} python3 -`, { input: `import sqlite3, json
c = sqlite3.connect("file:" + __import__("os").path.expanduser("~/.local/share/opencode/opencode.db") + "?mode=ro", uri=True)
out = {}
for sid, mid in c.execute("select session_id, id from message"): out.setdefault(sid, []).append(mid)
print(json.dumps(out))`, stdio: ["pipe", "pipe", "ignore"] }).toString())
const owner = new Map(Object.entries(ids).flatMap(([sid, list]) => list.map((m) => [m, sid])))
const shows = (sid, first) => (first ? owner.get(first) === sid : !(ids[sid]?.length))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const app = await electron.launch({
  executablePath: process.env.OCO_VSCODE_BIN ?? "/Applications/Visual Studio Code.app/Contents/MacOS/Code",
  args: ["--folder-uri", `vscode-remote://ssh-remote+${HOST}${FOLDER}`, `--user-data-dir=${R}/rud`, `--extensions-dir=${R}/rext`,
    "--skip-welcome", "--skip-release-notes", "--disable-workspace-trust", "--new-window",
    ...(process.env.VARIANT ? [`--extensionDevelopmentPath=vscode-remote://ssh-remote+${HOST}/home/user/oco-perf/${process.env.VARIANT}`] : [])],
  timeout: 60000,
})
const page = await app.firstWindow()
const fail = async (msg) => { log("FAIL", msg); await app.close(); process.exit(1) }
process.on("uncaughtException", (e) => fail(e.message.split("\n")[0]))
await page.waitForSelector(".monaco-workbench", { timeout: 60000 })
const tConn = Date.now()
let st = ""
while (Date.now() - tConn < 300000) {
  st = await page.locator(".part.statusbar").innerText().catch(() => "")
  if (/oco/.test(st) && !/连接中|connecting/i.test(st)) break
  await sleep(2000)
}
log("status", JSON.stringify(st.replace(/\s+/g, " ").slice(0, 160)), Date.now() - tConn, "ms")
await sleep(3000)
await page.locator('.activitybar .action-item a[aria-label^="OpenCode"]').first().click()
const rows = page.locator('.pane-body .monaco-list-row[aria-level="1"]')
await rows.first().waitFor({ timeout: 30000 })
await sleep(1500)

// Per-animation-frame sampler inside the chat document: one record whenever the visible state changes.
const SAMPLER = () => {
  if (window.__CO__) return true
  const co = (window.__CO__ = { log: [], installedAt: Math.round(performance.timeOrigin + performance.now()) })
  let last = ""
  const tick = () => {
    const root = document.getElementById("root")
    const boot = !!document.getElementById("oco-boot")
    const splash = !!document.querySelector('[class*="z-[9999]"]')
    const comps = [...new Set([...document.querySelectorAll("#root [data-component]")].slice(0, 400).map((e) => e.getAttribute("data-component")))].slice(0, 14).join(",")
    const prompt = !!document.querySelector('[data-component="prompt-input"]')
    const turns = document.querySelectorAll('[data-component="session-turn"]').length
    const first = document.querySelector("[data-message-id]")?.getAttribute("data-message-id") ?? ""
    const text = root ? root.textContent.length : 0
    const kids = root ? root.childElementCount : 0
    const bg = getComputedStyle(document.body).backgroundColor
    const sid = window.__OCO_DEBUG__?.sessionId?.() ?? ""
    const key = [boot, splash, comps, prompt, turns, first, text > 0, kids, bg, sid].join("|")
    if (key !== last) {
      last = key
      co.log.push({ t: Math.round(performance.timeOrigin + performance.now()), boot, splash, comps, prompt, turns, first, text, kids, bg, sid })
    }
    requestAnimationFrame(tick)
  }
  tick()
  return true
}
const chatFrames = async () => {
  const out = []
  for (const f of page.frames()) {
    if (!f.url().startsWith("vscode-webview://")) continue
    if (await f.evaluate(() => !!window.__OCO_INIT__ || !!document.getElementById("oco-boot")).catch(() => false)) out.push(f)
  }
  return out
}

// Screencast of the whole window; frames saved as JPEG, analysed after the run.
const cdp = await page.context().newCDPSession(page)
let frames = []
let openNo = 0
cdp.on("Page.screencastFrame", (f) => {
  const t = Math.round(f.metadata.timestamp * 1000)
  const file = path.join(FRAMES, `${openNo}-${frames.length.toString().padStart(4, "0")}.jpg`)
  fs.writeFileSync(file, Buffer.from(f.data, "base64"))
  frames.push({ t, file, w: f.metadata.deviceWidth })
  cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {})
})
const viewport = await page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }))

/** Mean luminance and standard deviation of a JPEG frame inside `rect` (CSS px), via sips -> BMP. */
function luminance(file, rect) {
  const bmp = file.replace(/\.jpg$/, ".bmp")
  execSync(`sips -s format bmp ${JSON.stringify(file)} --out ${JSON.stringify(bmp)}`, { stdio: "ignore" })
  const b = fs.readFileSync(bmp)
  fs.rmSync(bmp)
  const off = b.readUInt32LE(10), W = b.readInt32LE(18), H0 = b.readInt32LE(22), bpp = b.readUInt16LE(28) / 8
  const H = Math.abs(H0), stride = Math.ceil((W * bpp) / 4) * 4, k = W / viewport.w
  let n = 0, sum = 0, sq = 0
  for (let y = Math.round(rect.y * k); y < Math.round((rect.y + rect.height) * k); y += 2) {
    const row = H0 > 0 ? H - 1 - y : y
    for (let x = Math.round(rect.x * k); x < Math.round((rect.x + rect.width) * k); x += 2) {
      const i = off + row * stride + x * bpp
      const l = 0.0722 * b[i] + 0.7152 * b[i + 1] + 0.2126 * b[i + 2]
      n++; sum += l; sq += l * l
    }
  }
  const mean = sum / n
  return { lum: Math.round(mean), sd: Math.round(Math.sqrt(Math.max(0, sq / n - mean * mean))) }
}

const results = []
for (let k = 0; k < OPENS; k++) {
  const row = rows.nth(FIRST + k)
  const name = (await row.getAttribute("aria-label").catch(() => "")) ?? ""
  frames = []
  openNo = k
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 60, everyNthFrame: 1 })
  await sleep(400)
  // Workbench side: when the editor tab and the webview iframe appear, and when the iframe turns "ready".
  await page.evaluate(() => {
    const wb = (window.__COWB__ = { log: [] })
    const seen = new Set()
    const mark = (what) => { if (!seen.has(what)) { seen.add(what); wb.log.push([what, Date.now()]) } }
    wb.obs?.disconnect?.()
    wb.obs = new MutationObserver(() => {
      const frames = [...document.querySelectorAll("iframe.webview")]
      if (frames.length) mark("iframe")
      if (frames.some((f) => f.classList.contains("ready"))) mark("iframe-ready")
      if (document.querySelector(".tabs-container .tab.active")) mark("tab")
    })
    wb.obs.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["class"] })
  })
  const t0 = Date.now()
  await row.click()
  let doneAt, frame, sid
  while (Date.now() - t0 < 30000) {
    for (const f of await chatFrames()) {
      if (!(await f.evaluate(SAMPLER).catch(() => false))) continue
      const s = await f.evaluate(() => ({ sid: window.__OCO_DEBUG__?.sessionId?.(), first: document.querySelector("[data-message-id]")?.getAttribute("data-message-id") ?? "", prompt: !!document.querySelector('[data-component="prompt-input"]') })).catch(() => undefined)
      if (!s) continue
      frame = f; sid = s.sid
      if (s.sid && s.prompt && shows(s.sid, s.first)) doneAt ??= Date.now()
    }
    if (doneAt && Date.now() - doneAt > 300) break
    await sleep(20)
  }
  await sleep(1500)
  await cdp.send("Page.stopScreencast")
  const rect = await page.locator(".part.editor").boundingBox()
  const wb = await page.evaluate(() => { window.__COWB__.obs.disconnect(); return window.__COWB__.log })
  const doc = frame ? await frame.evaluate(() => ({
    origin: performance.timeOrigin,
    installedAt: window.__CO__?.installedAt,
    samples: window.__CO__?.log ?? [],
    paint: performance.getEntriesByType("paint").map((e) => [e.name, Math.round(e.startTime)]),
    nav: (([n]) => n && { responseStart: Math.round(n.responseStart), responseEnd: Math.round(n.responseEnd), domInteractive: Math.round(n.domInteractive), dcl: Math.round(n.domContentLoadedEventEnd), load: Math.round(n.loadEventEnd), transfer: n.transferSize, encoded: n.encodedBodySize, decoded: n.decodedBodySize })(performance.getEntriesByType("navigation")),
    resources: performance.getEntriesByType("resource").map((e) => ({ name: e.name.replace(/^.*\/media\/chat\//, "").slice(0, 80), start: Math.round(e.startTime), end: Math.round(e.responseEnd), transfer: e.transferSize, encoded: e.encodedBodySize, decoded: e.decodedBodySize })),
    fetches: (window.__OCO_STATS__?.fetchRecent ?? []).map((r) => ({ t: Math.round(r.t), head: r.head === undefined ? null : Math.round(r.head), end: r.end === undefined ? null : Math.round(r.end), bytes: r.bytes, req: `${r.method} ${r.path}` })),
  })).catch((e) => ({ error: String(e) })) : { error: "no chat frame" }
  const lum = frames.map((f) => ({ t: f.t - t0, ...luminance(f.file, rect) }))
  const rel = (x) => (doc.origin === undefined || x === undefined ? null : Math.round(doc.origin + x - t0))
  const r = {
    k, name: name.slice(0, 40), sid, workbench: Object.fromEntries(wb.map(([w, t]) => [w, t - t0])), doneMs: doneAt ? doneAt - t0 : null, docStartMs: rel(0), installedMs: doc.installedAt ? doc.installedAt - t0 : null,
    paint: doc.paint?.map(([n, t]) => [n, rel(t)]), nav: doc.nav,
    samples: (doc.samples ?? []).map((s) => ({ ...s, t: s.t - t0 })),
    resources: (doc.resources ?? []).map((e) => ({ ...e, start: rel(e.start), end: rel(e.end) })),
    fetches: (doc.fetches ?? []).map((e) => ({ ...e, t: rel(e.t), head: rel(e.head ?? undefined), end: rel(e.end ?? undefined) })),
    frames: lum.map((f, i) => ({ ...f, file: path.basename(frames[i].file) })), rect, error: doc.error,
  }
  results.push(r)
  const shown = r.samples.find((s) => s.prompt && shows(s.sid, s.first))
  log(`#${k} ${r.name.padEnd(24)} done ${r.doneMs} ms  doc ${r.docStartMs}  shown ${shown?.t}  frames ${frames.length}`)
  fs.writeFileSync(path.join(S, `${label}.json`), JSON.stringify({ label, variant: process.env.VARIANT ?? "installed", viewport, frames: FRAMES, results }, null, 1))
  // Close every editor so the next open creates a new panel (no oco panel left).
  for (let tries = 0; tries < 4 && (await page.locator("iframe.webview").count()) > 0; tries++) {
    await page.locator(".part.statusbar").click({ position: { x: 5, y: 5 } }).catch(() => {}) // focus the workbench, not the webview
    await page.keyboard.press("F1")
    await page.locator(".quick-input-widget input").waitFor({ timeout: 5000 }).catch(() => {})
    await page.keyboard.type("View: Close All Editors")
    await sleep(800)
    await page.keyboard.press("Enter")
    await sleep(1500)
  }
  if ((await page.locator("iframe.webview").count()) > 0) log("WARN editors still open")
  await sleep(1500)
}
await app.close()
