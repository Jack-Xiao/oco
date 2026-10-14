#!/usr/bin/env node
// E2E c13-worktree-inbox (card 1): two worktree sessions wait on bash permissions; with no panel open the
// sidebar inbox lists both, the status bar counts 2, and Allow in the sidebar clears both (replies go to the session dirs).
import fs from "node:fs"
import path from "node:path"
import { execFileSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { createRun } from "./lib/results.mjs"
import { launch, command, waitUntil, chatFrames, sleep, runShot, hostState, clearNotifications, root } from "./vscode.mjs"
import { MODEL } from "./server.mjs"
import { sessionsFrame } from "./lib/sessions-web.mjs"

const REQUIRED = ["worktree-sessions-waiting", "inbox-two-rows", "status-count-two", "inbox-allow-both", "permissions-cleared", "inbox-and-count-zero"]
const run = createRun({ suite: "c13-worktree-inbox", required: REQUIRED, scriptPath: fileURLToPath(import.meta.url) })

const base = process.env.OCO_TEST_URL ?? "http://127.0.0.1:4517"
const auth = "Basic " + Buffer.from("opencode:" + fs.readFileSync(path.join(root, ".oco-test/secret"), "utf8").trim()).toString("base64")
const testRoot = fs.realpathSync(path.join(root, ".oco-test"))
const rand = Math.random().toString(36).slice(2, 7)
const wsDir = path.join(testRoot, "c13", `ws-${rand}`)
fs.mkdirSync(wsDir, { recursive: true })
const git = (...a) => execFileSync("git", ["-c", "user.email=t@oco.local", "-c", "user.name=oco-test", ...a], { cwd: wsDir, stdio: "pipe" })
git("init", "-q"); fs.writeFileSync(path.join(wsDir, "README.md"), `c13 ${rand}\n`); git("add", "-A"); git("commit", "-qm", "init")

async function sapi(method, p, body, dir = wsDir) {
  const headers = { authorization: auth, "content-type": "application/json" }
  if (dir) headers["x-opencode-directory"] = encodeURIComponent(dir)
  const r = await fetch(base + p, { method, headers, body: body ? JSON.stringify(body) : undefined })
  const t = await r.text()
  try { return t ? JSON.parse(t) : null } catch { return { _raw: t.slice(0, 200), _status: r.status } }
}
const health = await sapi("GET", "/global/health").catch(() => null)
run.setEnv({ serverVersion: health?.version ?? null, modelMode: MODEL.mode })

let app = null, page = null, stateFile = null
const wts = [] // {id, dir}
const listSessions = async () => (await sapi("GET", `/session?directory=${encodeURIComponent(wsDir)}&scope=project`)) ?? []
const permsOf = async (d) => { const r = await sapi("GET", "/permission", undefined, d); return Array.isArray(r) ? r : [] }
async function rejectAll() {
  for (const d of [wsDir, ...wts.map((w) => w.dir)]) for (const p of await permsOf(d).catch(() => [])) if (p?.id) await sapi("POST", `/permission/${p.id}/reply`, { reply: "reject" }, d).catch(() => {})
}
async function draftFrame(timeout = 60000) {
  const end = Date.now() + timeout
  while (Date.now() < end) {
    for (const f of await chatFrames(page)) {
      const ok = await f.evaluate(() => document.visibilityState === "visible" && !!document.querySelector('[data-component="session-new-design"]') && !!document.querySelector('[data-component="prompt-input"]')).catch(() => false)
      if (ok) return f
    }
    await sleep(100)
  }
  return null
}
async function statusBar() {
  return page.evaluate(() => [...document.querySelectorAll(".part.statusbar .statusbar-item")]
    .filter((e) => /oco/i.test(e.getAttribute("aria-label") || "") || /oco/i.test(e.textContent || ""))
    .map((e) => ({ aria: e.getAttribute("aria-label"), text: (e.textContent || "").replace(/\s+/g, " ").trim(), bell: !!e.querySelector(".codicon-bell-dot") })))
}
const countOf = (sb) => { const b = sb.find((x) => x.bell); if (!b) return 0; const m = /(\d+)\s*$/.exec(b.text); return m ? Number(m[1]) : null }

async function newWorktreeSession(n) {
  await command(page, "View: Close All Editors")
  const ids = new Set((await listSessions()).map((s) => s.id))
  await command(page, "oco: New Session")
  const f = await draftFrame()
  if (!f) throw new Error("draft page missing")
  await waitUntil(async () => (await f.evaluate(() => document.documentElement.dataset.ocoModel)) === "ready", 30000, 100)
  const label = f.locator('label[data-action="oco-new-worktree"]').first()
  await label.waitFor({ state: "visible", timeout: 20000 })
  await label.click(); await sleep(500)
  if (!(await label.locator('input[type="checkbox"]').isChecked())) throw new Error("worktree box not checked")
  const input = f.locator('[data-component="prompt-input"]')
  await input.click(); await input.focus()
  await page.keyboard.type(`Use the bash tool to run exactly: echo wt${n}-perm-${rand}`, { delay: 4 })
  await sleep(200); await page.keyboard.press("Enter")
  const s = await waitUntil(async () => (await listSessions()).filter((x) => !ids.has(x.id))[0], 90000, 300)
  if (!s) throw new Error(`no worktree session ${n}`)
  const dir = fs.existsSync(s.directory) ? fs.realpathSync(s.directory) : s.directory
  wts.push({ id: s.id, dir })
  await waitUntil(async () => (await permsOf(dir)).some((p) => p.sessionID === s.id), 60000, 400)
}

try {
  const launched = await launch({ profile: "c13-worktree-inbox", workspace: wsDir, run })
  app = launched.app; page = launched.page; stateFile = launched.stateFile
  run.installCrashHandlers(() => app?.close())
  await rejectAll()

  await newWorktreeSession(1)
  await newWorktreeSession(2)
  const distinct = wts.length === 2 && wts[0].dir !== wts[1].dir && wts[0].dir !== wsDir
  const bothWaiting = distinct && (await Promise.all(wts.map(async (w) => (await permsOf(w.dir)).some((p) => p.sessionID === w.id)))).every(Boolean)
  run.record("worktree-sessions-waiting", bothWaiting ? "PASS" : "FAIL", { dirs: wts.map((w) => w.dir), sessions: wts.map((w) => w.id) })

  await command(page, "View: Close All Editors")
  await waitUntil(async () => (await hostState(page, stateFile)).panels.length === 0, 15000, 300)
  await command(page, "Focus on Sessions View")
  await clearNotifications(page)
  let frame = null
  await waitUntil(async () => (frame = await sessionsFrame(page)), 30000, 300)
  const inboxRows = () => frame.locator('section[data-group="inbox"] .row[data-kind="permission"]')
  await waitUntil(async () => (await inboxRows().count()) >= 2, 30000, 300)
  await sleep(1500)
  const rows = await inboxRows().count()
  const panels = (await chatFrames(page)).length
  run.record("inbox-two-rows", rows === 2 && panels === 0 ? "PASS" : "FAIL", { rows, openPanels: panels })
  await waitUntil(async () => countOf(await statusBar()) === 2, 15000, 300)
  const sb = await statusBar()
  run.record("status-count-two", countOf(sb) === 2 ? "PASS" : "FAIL", { statusBar: sb, count: countOf(sb) })
  await runShot(page, run, "1-two-worktree-rows")

  let clicked = 0
  for (let i = 0; i < 2; i++) {
    const btn = frame.locator('section[data-group="inbox"] button[data-reply="once"]').first()
    if ((await btn.count()) === 0) break
    await btn.waitFor({ state: "visible", timeout: 10000 })
    await btn.click(); clicked++
    await sleep(600)
  }
  run.record("inbox-allow-both", clicked === 2 ? "PASS" : "FAIL", { clicked })

  const leftover = {}
  const emptied = await waitUntil(async () => {
    for (const w of wts) leftover[w.dir] = (await permsOf(w.dir)).length
    return Object.values(leftover).every((n) => n === 0)
  }, 30000, 500)
  run.record("permissions-cleared", emptied ? "PASS" : "FAIL", { leftover })

  const zero = await waitUntil(async () => (await inboxRows().count()) === 0 && countOf(await statusBar()) === 0, 20000, 300)
  const sb2 = await statusBar()
  run.record("inbox-and-count-zero", zero ? "PASS" : "FAIL", { inboxRows: await inboxRows().count(), statusBar: sb2, count: countOf(sb2) })
  await runShot(page, run, "2-cleared")
} catch (e) {
  run.record("run", "FAIL", { error: String(e?.stack ?? e).slice(0, 600) })
  if (page) await runShot(page, run, "error").catch(() => {})
} finally {
  await rejectAll().catch(() => {})
  for (const w of (await sapi("GET", "/experimental/worktree").catch(() => [])) ?? []) await sapi("DELETE", "/experimental/worktree", { directory: w }).catch(() => {})
  if (app) await app.close().catch(() => {})
  process.exit(run.finish())
}
