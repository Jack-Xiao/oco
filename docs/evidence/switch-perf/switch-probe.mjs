// Remote switch probe: in a separate VS Code instance connected to gcp-workstation, click sessions in the oco
// sidebar one after another (the main panel switches in place), then revisit them, and record per switch:
// time until the new session's turns and composer are on screen, whether the document reloaded, and the
// frames in which the panel showed no session content (what the user sees as a black flash).
//   node switch-probe.mjs <label> [rows=12] [rounds=2]
//   VARIANT=<dir under /home/user/oco-perf> loads that build with --extensionDevelopmentPath (installed one otherwise).
import { _electron as electron } from "playwright-core"
import { execSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

const S = path.dirname(new URL(import.meta.url).pathname)
const [label = "run", rowsArg = "12", roundsArg = "2"] = process.argv.slice(2)
const ROWS = Number(rowsArg)
const ROUNDS = Number(roundsArg)
const HOST = process.env.OCO_REMOTE_HOST ?? "gcp-workstation"
const FOLDER = process.env.OCO_REMOTE_FOLDER ?? "/home/user/ai"
const SETTLE = Number(process.env.SETTLE_MS ?? 1500)
const main = path.dirname(path.resolve(S, execSync("git rev-parse --git-common-dir", { cwd: S }).toString().trim()))
const R = path.join(fs.realpathSync(path.join(main, ".oco-test")), "sw") // short path: IPC socket limit
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
}))
const log = (...a) => console.error(new Date().toISOString().slice(11, 19), ...a)
// Message ids per session (read-only from the workstation's OpenCode DB): a switch is done when the first timeline
// row on screen belongs to the target session (forks repeat their parent's text, never its message ids).
const ids = JSON.parse(execSync(`ssh -o BatchMode=yes ${HOST} python3 -`, { input: `import sqlite3, json
c = sqlite3.connect("file:" + __import__("os").path.expanduser("~/.local/share/opencode/opencode.db") + "?mode=ro", uri=True)
out = {}
for sid, mid in c.execute("select session_id, id from message"): out.setdefault(sid, []).append(mid)
print(json.dumps(out))`, stdio: ["pipe", "pipe", "ignore"] }).toString())
const owner = new Map(Object.entries(ids).flatMap(([sid, list]) => list.map((m) => [m, sid])))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const app = await electron.launch({
  executablePath: process.env.OCO_VSCODE_BIN ?? "/Applications/Visual Studio Code.app/Contents/MacOS/Code",
  args: ["--folder-uri", `vscode-remote://ssh-remote+${HOST}${FOLDER}`, `--user-data-dir=${R}/rud`, `--extensions-dir=${R}/rext`,
    "--skip-welcome", "--skip-release-notes", "--disable-workspace-trust", "--new-window",
    ...(process.env.VARIANT ? [`--extensionDevelopmentPath=vscode-remote://ssh-remote+${HOST}/home/user/oco-perf/${process.env.VARIANT}`] : [])],
  timeout: 60000,
})
const page = await app.firstWindow()
const fail = async (msg) => { log("FAIL", msg); await page.screenshot({ path: path.join(S, `${label}-fail.png`) }).catch(() => {}); await app.close(); process.exit(1) }
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

// Sidebar: the oco view container.
await page.locator('.activitybar .action-item a[aria-label^="OpenCode"]').first().click()
const rows = page.locator('.pane-body .monaco-list-row[aria-level="1"]')
await rows.first().waitFor({ timeout: 30000 })
await sleep(1500)
const labels = await rows.evaluateAll((els) => els.map((e) => e.getAttribute("aria-label") ?? e.textContent ?? ""))
log("sidebar rows", labels.length)
const n = Math.min(ROWS, labels.length)

// Frame sampler, installed once per document: one record per animation frame in which the visible state changes.
const SAMPLER = () => {
  if (window.__SW__) return window.__SW__.origin
  const sw = (window.__SW__ = { origin: performance.timeOrigin, log: [] })
  let last = ""
  const tick = () => {
    const root = document.getElementById("root")
    const turns = document.querySelectorAll('[data-component="session-turn"]').length
    const prompt = !!document.querySelector('[data-component="prompt-input"]')
    const boot = !!document.getElementById("oco-boot")
    const sid = window.__OCO_DEBUG__?.sessionId?.() ?? ""
    const text = root ? root.textContent.length : 0
    const title = document.title
    const first = document.querySelector("[data-message-id]")?.getAttribute("data-message-id") ?? ""
    const key = [sid, turns, prompt, boot, text > 0, title, first].join("|")
    if (key !== last) {
      last = key
      sw.log.push({ t: Math.round(performance.timeOrigin + performance.now()), sid, turns, prompt, boot, text, first, title: title.slice(0, 40) })
    }
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
  return sw.origin
}
const chatFrames = async () => {
  const out = []
  for (const f of page.frames()) {
    if (!f.url().startsWith("vscode-webview://")) continue
    if (await f.evaluate(() => !!window.__OCO_INIT__).catch(() => false)) out.push(f)
  }
  return out
}

/** The screen shows session `sid`: its first row is one of its messages, or it has none and no row is shown. */
const shows = (sid, first) => (first ? owner.get(first) === sid : !(ids[sid]?.length))
const results = []
const origins = new Set()
for (let round = 0; round < ROUNDS; round++) {
  for (let i = 0; i < n; i++) {
    const row = rows.nth(i)
    const name = (await row.getAttribute("aria-label").catch(() => "")) ?? ""
    for (const f of await chatFrames()) await f.evaluate(SAMPLER).catch(() => {})
    const t0 = Date.now()
    await row.click()
    // Wait until a chat document shows a session (other than the previous) with turns and a composer, steady for 300 ms.
    let doneAt, frame, origin, sid
    while (Date.now() - t0 < 30000) {
      for (const f of await chatFrames()) {
        const o = await f.evaluate(SAMPLER).catch(() => undefined)
        if (!o) continue
        const s = await f.evaluate(() => ({ sid: window.__OCO_DEBUG__?.sessionId?.(), first: document.querySelector("[data-message-id]")?.getAttribute("data-message-id") ?? "", prompt: !!document.querySelector('[data-component="prompt-input"]') })).catch(() => undefined)
        if (!s) continue
        frame = f; origin = o; sid = s.sid
        const prev = results.at(-1)
        const changed = !prev || s.sid !== prev.sid || o !== prev.origin
        if (changed && s.prompt && shows(s.sid, s.first)) doneAt ??= Date.now()
      }
      if (doneAt && Date.now() - doneAt > 300) break
      await sleep(30)
    }
    await sleep(SETTLE)
    const samples = frame ? await frame.evaluate((t) => window.__SW__.log.filter((r) => r.t >= t), t0).catch(() => []) : []
    // Bridge requests in this switch (builds with __OCO_STATS__.fetchRecent): [start, head, end] ms after the click, bytes, path.
    const fetches = frame ? await frame.evaluate((t) => (window.__OCO_STATS__?.fetchRecent ?? [])
      .map((r) => [r.t, r.head, r.end].map((x) => (x === undefined ? null : Math.round(performance.timeOrigin + x - t))).concat([r.bytes, `${r.method} ${r.path}`]))
      .filter((r) => r[0] >= -50), t0).catch(() => []) : []
    const reload = results.length > 0 && origin !== results.at(-1).origin
    const revisit = origins.has(sid)
    origins.add(sid)
    // From the frame samples: when the target's content was first painted; frames with an empty page (black flash).
    const shown = samples.find((r) => r.sid === sid && r.prompt && shows(sid, r.first))
    const blank = samples.filter((r) => r.t <= (shown?.t ?? Infinity) && r.text === 0)
    const firstTurns = shown
    const r = { round, i, name: name.slice(0, 40), sid, origin, reload, revisit, doneMs: doneAt ? doneAt - t0 : null,
      turnsMs: firstTurns ? firstTurns.t - t0 : null, blankFrames: blank.length, blankFirstMs: blank[0] ? blank[0].t - t0 : null, samples: samples.map((s) => ({ ...s, t: s.t - t0 })), fetches }
    results.push(r)
    log(`r${round} #${i} ${r.name.padEnd(28)} done ${String(r.doneMs).padStart(5)} ms  shown ${String(r.turnsMs).padStart(5)}  reload ${reload ? "YES" : "no "}  blank ${r.blankFrames}  ${revisit ? "revisit" : "first"}`)
    if (reload || r.doneMs > 1500) await page.screenshot({ path: path.join(S, `${label}-r${round}-${i}.png`) }).catch(() => {})
  }
}
const mem = await app.evaluate(async ({ app }) => (await app.getAppMetrics()).map((m) => ({ type: m.type, pid: m.pid, mb: Math.round(m.memory.workingSetSize / 1024) })))
const stats = []
for (const f of await chatFrames()) stats.push(await f.evaluate(() => ({ stats: { ...window.__OCO_STATS__, fetchLog: undefined }, heapMB: Math.round((performance.memory?.usedJSHeapSize ?? 0) / 1048576), nodes: document.getElementsByTagName("*").length })).catch(() => null))
fs.writeFileSync(path.join(S, `${label}.json`), JSON.stringify({ label, variant: process.env.VARIANT ?? "installed", rows: labels, results, mem, stats }, null, 1))
console.log(JSON.stringify({ label, switches: results.map((r) => [r.round, r.i, r.doneMs, r.reload ? "R" : "", r.blankFrames]), heap: stats }))
await app.close()
