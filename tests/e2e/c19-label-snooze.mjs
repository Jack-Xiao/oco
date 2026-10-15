#!/usr/bin/env node
// E2E c19-label-snooze: sidebar Label (own section) and Snooze (hidden, Unsnooze, auto-wake on new message,
// waiting-permission rows never hidden and status-bar stop counter unchanged).
import { fileURLToPath } from "node:url"
import { createRun } from "./lib/results.mjs"
import { launch, waitUntil, sleep, runShot, clearNotifications, hostState } from "./vscode.mjs"
import { api, MODEL, status } from "./server.mjs"
import { sessionsFrame, sessionRow } from "./lib/sessions-web.mjs"

const REQUIRED = ["label-section", "snooze-hides", "unsnooze-restores", "wake-on-message", "waiting-not-hidden"]
const run = createRun({ suite: "c19-label-snooze", required: REQUIRED, scriptPath: fileURLToPath(import.meta.url) })
const health = await api("GET", "/global/health").catch(() => null)
run.setEnv({ serverVersion: health?.version ?? null, modelMode: MODEL.mode })
const MODEL_REF = { providerID: MODEL.providerID, modelID: MODEL.modelID }
const errMsg = (e) => String(e?.message ?? e).slice(0, 400)

let app = null
let page = null
let stateFile = null
const created = []

const sectionOf = async (title) => {
  const frame = await sessionsFrame(page)
  if (!frame) return null
  return frame.evaluate((t) => {
    // A label group holds exactly `count` rows; the plain rows after it have no head of their own (they belong to "sessions").
    let head = null
    let left = 0
    for (const n of document.querySelector(".list").querySelectorAll(".section-head, .row")) {
      if (n.classList.contains("section-head")) {
        head = n.dataset.group + (n.dataset.label ? ":" + n.dataset.label : "")
        left = n.dataset.group === "label" ? Number(n.querySelector(".section-count")?.textContent) || 0 : 0
      } else if (n.dataset.kind === "session") {
        if (head?.startsWith("label:") && left <= 0) head = "sessions"
        if (n.querySelector(".title")?.textContent === t) return head ?? "(none)"
        left--
      }
    }
    return null
  }, title)
}
const sidebar = async () => (await hostState(page, stateFile)).sidebar
const dot = async (t) => (await (await sessionRow(page, t)).locator(".dot").getAttribute("data-status", { timeout: 1500 }).catch(() => null))
async function expandSnoozed() {
  const frame = await sessionsFrame(page)
  const head = frame.locator(".snoozed-head")
  if (!(await head.count())) return false
  if ((await head.getAttribute("aria-expanded")) !== "true") await head.click()
  return true
}
async function newSession(title) {
  const s = await api("POST", "/session", { title })
  if (!s?.id) throw new Error("session create failed")
  created.push(s.id)
  return s.id
}
const rec = (id, ok, detail) => run.record(id, ok ? "PASS" : "FAIL", detail)

try {
  const launched = await launch({ profile: "c19-label-snooze", run, settings: { "window.dialogStyle": "custom" } })
  app = launched.app
  page = launched.page
  stateFile = launched.stateFile
  run.installCrashHandlers(() => app?.close())

  for (const p of (await api("GET", "/permission")) ?? []) await api("POST", `/permission/${p.id}/reply`, { reply: "reject" }).catch(() => {})
  const rand = Math.random().toString(36).slice(2, 7)
  const tL = `c19-L-${rand}`, tS = `c19-S-${rand}`, tO = `c19-O-${rand}`
  const idS = null
  const ids = {}
  for (const t of [tL, tS, tO]) { ids[t] = await newSession(t); await sleep(300) }

  const { command } = await import("./vscode.mjs")
  await command(page, "Focus on Sessions View")
  await clearNotifications(page)
  await waitUntil(async () => !!(await sessionsFrame(page)), 30000, 300)
  for (const t of [tL, tS, tO]) await (await sessionRow(page, t)).waitFor({ state: "visible", timeout: 30000 })
  const frame = await sessionsFrame(page)

  // --- Label ---
  try {
    const row = await sessionRow(page, tL)
    await row.click({ modifiers: ["Meta"] })
    await frame.locator("[data-selection-bar]").waitFor({ state: "visible", timeout: 5000 })
    const nSel = await frame.locator('.row[aria-selected="true"]').count()
    await frame.locator('[data-batch="label"]').click()
    const input = frame.locator(".inline-label-input")
    await input.waitFor({ state: "visible", timeout: 5000 })
    await input.fill("urgent")
    await input.press("Enter")
    const ok = await waitUntil(async () => ((await sectionOf(tL)) === "label:urgent" ? true : null), 10000, 200)
    const secL = await sectionOf(tL), secO = await sectionOf(tO)
    await runShot(page, run, "1-labeled")
    rec("label-section", !!ok && secO !== "label:urgent", { secL, secO, nSel })
    await frame.locator('[data-batch="clear"]').click().catch(() => {})
  } catch (e) {
    run.record("label-section", "FAIL", { error: errMsg(e) })
  }

  // --- Snooze hides, Unsnooze restores ---
  try {
    const row = await sessionRow(page, tS)
    await row.hover()
    await row.locator("[data-snooze]").click({ timeout: 5000 })
    const hidden = await waitUntil(async () => ((await (await sessionRow(page, tS)).count()) === 0 ? true : null), 10000, 200)
    await expandSnoozed()
    const inSnoozed = await waitUntil(async () => ((await sectionOf(tS)) === "snoozed" ? true : null), 5000, 200)
    await runShot(page, run, "2-snoozed")
    rec("snooze-hides", !!hidden && !!inSnoozed, { hiddenFromMain: !!hidden, inSnoozedSection: !!inSnoozed, secO: await sectionOf(tO) })

    const r2 = await sessionRow(page, tS)
    await r2.hover()
    await r2.locator(".unsnooze-btn").click({ timeout: 5000 })
    const back = await waitUntil(async () => {
      const s = await sectionOf(tS)
      return s && s !== "snoozed" ? s : null
    }, 10000, 200)
    rec("unsnooze-restores", !!back, { section: back })
  } catch (e) {
    run.record("snooze-hides", "FAIL", { error: errMsg(e) })
    run.record("unsnooze-restores", "FAIL", { error: errMsg(e) })
  }

  // --- Wake on new message ---
  try {
    const row = await sessionRow(page, tO)
    await row.hover()
    await row.locator("[data-snooze]").click({ timeout: 5000 })
    await waitUntil(async () => ((await (await sessionRow(page, tO)).count()) === 0 ? true : null), 10000, 200)
    await expandSnoozed()
    const was = await waitUntil(async () => ((await sectionOf(tO)) === "snoozed" ? true : null), 5000, 200)
    await sleep(1200)
    await api("POST", `/session/${ids[tO]}/prompt_async`, { model: MODEL_REF, parts: [{ type: "text", text: "Say hello. No tools." }] })
    const woke = await waitUntil(async () => {
      const s = await sectionOf(tO)
      return s && s !== "snoozed" ? s : null
    }, 30000, 300)
    await runShot(page, run, "3-woken")
    rec("wake-on-message", !!was && !!woke, { wasSnoozed: !!was, sectionAfter: woke })
  } catch (e) {
    run.record("wake-on-message", "FAIL", { error: errMsg(e) })
  }

  // --- Waiting-permission row is not hidden by snooze; counter unchanged ---
  try {
    if (MODEL.mode !== "mock") throw Object.assign(new Error("needs mock model"), { na: true })
    const tW = `c19-W-${rand}`
    ids[tW] = await newSession(tW)
    await (await sessionRow(page, tW)).waitFor({ state: "visible", timeout: 30000 })
    await api("POST", `/session/${ids[tW]}/prompt_async`, { model: MODEL_REF, parts: [{ type: "text", text: `Use the bash tool to run exactly: echo c19-wait-${rand}` }] })
    const pending = async () => ((await api("GET", "/permission")) ?? []).filter((p) => p.sessionID === ids[tW])
    const asked = !!(await waitUntil(async () => ((await pending()).length > 0 ? true : null), 30000, 200))
    const waiting = !!(await waitUntil(async () => ((await dot(tW)) === "waiting" ? true : null), 20000, 200))
    const counted = !!(await waitUntil(async () => ((await sidebar()).stopText === "$(debug-stop) 1" ? true : null), 20000, 300))
    const before = (await sidebar()).stopText
    // The hover button is hidden for waiting rows; use the selection-bar batch Snooze, which sends the same message.
    await (await sessionRow(page, tW)).click({ modifiers: ["Meta"] })
    await frame.locator("[data-selection-bar]").waitFor({ state: "visible", timeout: 5000 })
    const hoverBtnHidden = await (await sessionRow(page, tW)).locator("[data-snooze]").evaluate((el) => el.hidden).catch(() => null)
    await frame.locator('[data-batch="snooze"]').click()
    await sleep(2000)
    const sec = await sectionOf(tW)
    const after = (await sidebar()).stopText
    const stillWaiting = (await dot(tW)) === "waiting"
    await runShot(page, run, "4-waiting-snooze")
    rec("waiting-not-hidden", asked && waiting && counted && sec !== null && sec !== "snoozed" && after === before && stillWaiting,
      { asked, waiting, counted, hoverBtnHidden, section: sec, counterBefore: before, counterAfter: after, stillWaiting })
  } catch (e) {
    if (e.na) run.recordNotApplicable("waiting-not-hidden", e.message)
    else run.record("waiting-not-hidden", "FAIL", { error: errMsg(e) })
  }
} catch (e) {
  run.record("run", "FAIL", { error: errMsg(e) })
  if (page) await runShot(page, run, "error").catch(() => {})
} finally {
  for (const id of created) await api("POST", `/session/${id}/abort`).catch(() => {})
  for (const p of (await api("GET", "/permission").catch(() => [])) ?? []) if (created.includes(p.sessionID)) await api("POST", `/permission/${p.id}/reply`, { reply: "reject" }).catch(() => {})
  if (app) await app.close().catch(() => {})
  process.exit(run.finish())
}
