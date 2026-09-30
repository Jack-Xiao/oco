// P1b switch while pending: a prompt submitted before the model has loaded is pending; if oco.serverUrl
// changes to another endpoint while it waits, the old panel must not submit it to either endpoint, and
// the draft must stay. Two transparent proxies (lib/proxy.mjs) point at the same isolated test server, so
// the two endpoints get different connectionIds while the server-side result is directly observable
// (api() bypasses both proxies). The load race is forced with the dev-only bridge delay, as in
// p1b-pending-send. A control case shows the switch took effect: a new panel binds to B and can send.
import fs from "node:fs"
import { fileURLToPath } from "node:url"
import { createRun } from "./lib/results.mjs"
import { startProxy } from "./lib/proxy.mjs"
import { launch, command, chatFrames, frameSession, sleep, runShot, hostState } from "./vscode.mjs"
import { messages, waitReply } from "./server.mjs"

const DELAY = 8000
const CASES = ["switch-while-pending", "new-panel-after-switch"]
const run = createRun({ suite: "p1b-switch-pending", required: CASES, scriptPath: fileURLToPath(import.meta.url) })
const DIRECT = process.env.OCO_TEST_URL ?? "http://127.0.0.1:4517"
const INPUT = '[data-component="prompt-input"]'

let app
const proxyA = await startProxy({ target: DIRECT })
const proxyB = await startProxy({ target: DIRECT })
const cleanup = async () => {
  await app?.close().catch(() => {})
  await proxyA.close().catch(() => {})
  await proxyB.close().catch(() => {})
}
run.installCrashHandlers(cleanup)

const snap = (f) =>
  f
    .evaluate(() => {
      const html = document.documentElement
      const bar = document.getElementById("oco-submit-status")
      return {
        model: html.dataset.ocoModel ?? null,
        pending: html.dataset.ocoSubmitPending ?? null,
        bar: bar && !bar.hidden ? { state: bar.dataset.state ?? null, text: bar.textContent } : null,
        stats: window.__OCO_DEBUG__.submit(),
      }
    })
    .catch(() => null)

const users = async (sid) => (await messages(sid).catch(() => [])).filter((m) => m.info.role === "user")
const textOf = (m) => m.parts.filter((p) => p.type === "text").map((p) => p.text).join("")
const composer = async (f) => ((await f.locator(INPUT).innerText().catch(() => null)) ?? "").trim()

async function waitFor(fn, ms, step = 100) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    const v = await fn()
    if (v) return v
    await sleep(step)
  }
  return null
}

async function newPanel(page, known = new Set()) {
  await command(page, "oco: New Session")
  const end = Date.now() + 60000
  while (Date.now() < end) {
    for (const f of await chatFrames(page)) {
      const s = await frameSession(f).catch(() => null)
      if (s && !known.has(s) && (await f.$(INPUT).catch(() => null))) return { f, sid: s, t0: Date.now() }
    }
    await sleep(50)
  }
  throw new Error("no new panel")
}

async function frameFor(page, sid) {
  for (const f of await chatFrames(page)) if ((await frameSession(f).catch(() => null)) === sid) return f
  return null
}

process.env.OCO_DEV_SLOW_PATHS = "^/(agent|provider|config/providers)"
process.env.OCO_DEV_SLOW_MS = String(DELAY)
run.setEnv({ firstLoadDelay: { paths: process.env.OCO_DEV_SLOW_PATHS, ms: DELAY }, proxies: "A, B: 127.0.0.1:<random> -> same test server" })

try {
  const l = await launch({ profile: "p1b-switch-pending", run, settings: { "oco.serverUrl": proxyA.url } })
  app = l.app
  const page = l.page
  const panelsState = async () => (await hostState(page, l.stateFile).catch(() => null))?.panels ?? []
  let oldSid = null

  // 1. Pending in panel bound to A; switch oco.serverUrl to B while waiting.
  try {
    const text = `switch-pending ${Math.random().toString(36).slice(2, 8)}. Reply only with OK.`
    const { f, sid, t0 } = await newPanel(page)
    oldSid = sid
    const before = await snap(f)
    if (before?.model !== "loading") throw new Error(`precondition: model not loading (${JSON.stringify(before?.model)}, ${Date.now() - t0}ms in)`)
    const boundBefore = (await panelsState()).find((p) => p.sessionId === sid)?.connectionId ?? null
    const input = f.locator(INPUT)
    await input.click()
    await input.focus()
    await page.keyboard.type(text, { delay: 2 })
    await page.keyboard.press("Enter")
    const waiting = await waitFor(async () => ((await snap(f))?.bar?.state === "waiting" ? true : null), 3000, 50)
    await runShot(page, run, "switch-pending-waiting")
    const reqA0 = proxyA.stats.requests
    const reqB0 = proxyB.stats.requests
    const settings = JSON.parse(fs.readFileSync(l.settingsFile, "utf8"))
    settings["oco.serverUrl"] = proxyB.url
    fs.writeFileSync(l.settingsFile, JSON.stringify(settings, null, 2))
    const switchedAtMs = Date.now() - t0
    // Past the load delay and the official 20 s model timeout.
    await sleep(Math.max(0, t0 + DELAY + 25000 - Date.now()))
    const us = await users(sid)
    const f2 = await frameFor(page, sid)
    const draft = f2 ? await composer(f2) : null
    const after = f2 ? await snap(f2) : null
    await runShot(page, run, "switch-pending-after")
    const ok = !!waiting && switchedAtMs < DELAY && us.length === 0 && (f2 === null || draft === text)
    run.record("switch-while-pending", ok ? "PASS" : "FAIL", {
      waiting: !!waiting,
      switchedAtMs,
      beforeLoad: switchedAtMs < DELAY,
      boundBefore: boundBefore ? "<A connectionId>" : null,
      users: us.map(textOf),
      panelAlive: f2 !== null,
      draftKept: f2 ? draft === text : null,
      after,
      requestsAfterSwitch: { a: proxyA.stats.requests - reqA0, b: proxyB.stats.requests - reqB0 },
    })
  } catch (e) {
    run.record("switch-while-pending", "FAIL", { error: String(e?.message ?? e).slice(0, 400) })
    await runShot(page, run, "switch-while-pending-error")
  }

  // 2. Control: a new panel after the switch binds to B and can send.
  try {
    const known = new Set(oldSid ? [oldSid] : [])
    const reqB0 = proxyB.stats.requests
    const { f, sid } = await newPanel(page, known)
    const conns = await panelsState()
    const oldConn = conns.find((p) => p.sessionId === oldSid)?.connectionId ?? null
    const newConn = conns.find((p) => p.sessionId === sid)?.connectionId ?? null
    const ready = await waitFor(async () => ((await snap(f))?.model === "ready" ? true : null), DELAY + 30000, 200)
    const text = "switch control. Reply only with OK."
    const input = f.locator(INPUT)
    await input.click()
    await input.focus()
    await page.keyboard.type(text, { delay: 2 })
    await page.keyboard.press("Enter")
    const sent = await waitFor(async () => ((await users(sid)).length >= 1 ? true : null), 20000, 200)
    await sleep(2000)
    const us = await users(sid)
    await waitReply(sid, 90000).catch(() => null) // informational; leaves the server idle
    const reqB = proxyB.stats.requests - reqB0
    const ok = !!ready && !!sent && us.length === 1 && textOf(us[0]) === text && reqB > 0 && !!newConn && newConn !== oldConn
    run.record("new-panel-after-switch", ok ? "PASS" : "FAIL", { ready: !!ready, users: us.map(textOf), requestsViaB: reqB, differentConnection: !!newConn && newConn !== oldConn })
  } catch (e) {
    run.record("new-panel-after-switch", "FAIL", { error: String(e?.message ?? e).slice(0, 400) })
    await runShot(page, run, "new-panel-after-switch-error")
  }
} catch (e) {
  run.record("run", "FAIL", { error: String(e?.message ?? e).slice(0, 400) })
} finally {
  await cleanup()
  process.exit(run.finish())
}
