#!/usr/bin/env node
// E2E c16-sidebar-stop (card 2): stop running sessions from the SESSIONS sidebar. Mock model only: the long answers
// ("Write 600 numbered sentences", ~90 s) keep sessions busy long enough to be stopped from the UI.
// Cases:
//   row-stop         hovering a running row shows the ■ button; clicking it aborts the session on the server (<= 15 s),
//                    the row stops being "running", and the click does not open / switch to the session.
//   selection-stop   multi-select two busy rows: the selection bar shows Stop and it aborts both; a selection holding only
//                    idle rows shows no Stop.
//   stop-all         status-bar counter ("$(debug-stop) 2") + command "oco.sessions.stopAllRunning": modal confirm
//                    "Stop all 2 running sessions?", Cancel keeps everything running, Stop aborts all and clears the counter.
//   cascade-confirm  a running parent with a running subagent: ■ asks `Stop "<title>"?` naming the subagents, and the
//                    confirm stops parent and child (optional: NOT RUN when the 9 s subagent window is missed).
//   waiting-stop     a session blocked on a bash permission (busy on the server, "waiting" in the sidebar) still gets the row ■
//                    and counts in the status-bar stop counter; ■ aborts it (<= 15 s), clears its pending permission and its
//                    inbox row.
// The modal confirms are rendered into the DOM (window.dialogStyle=custom) so Playwright can click them.
import { fileURLToPath } from "node:url"
import { createRun } from "./lib/results.mjs"
import { launch, command, waitUntil, runShot, hostState, clearNotifications, createAndOpenSession, chatFrames, frameSession } from "./vscode.mjs"
import { api, MODEL, status, lastAssistant, textOf } from "./server.mjs"
import { sessionsFrame, sessionRow } from "./lib/sessions-web.mjs"

const CASES = ["row-stop", "selection-stop", "stop-all", "cascade-confirm", "waiting-stop"]
const run = createRun({ suite: "c16-sidebar-stop", required: ["row-stop", "selection-stop", "stop-all", "waiting-stop"], scriptPath: fileURLToPath(import.meta.url) })
const health = await api("GET", "/global/health").catch(() => null)
run.setEnv({ serverVersion: health?.version ?? null, modelMode: MODEL.mode })

const errMsg = (e) => String(e?.message ?? e).slice(0, 400)
const SLOW = "Write 600 numbered sentences about harbors. No tools."
const MODEL_REF = { providerID: MODEL.providerID, modelID: MODEL.modelID }
const STOP_WITHIN_MS = 15000

let app = null
let page = null
let stateFile = null
const created = [] // every session this run starts (or finds as a subagent); aborted again between cases and at the end

// --- server side ---------------------------------------------------------------------------------------------
const runningIds = async () =>
  Object.entries((await api("GET", "/session/status")) ?? {})
    .filter(([, v]) => v?.type === "busy" || v?.type === "retry")
    .map(([id]) => id)
const isRunning = async (sid) => {
  const t = await status(sid)
  return t === "busy" || t === "retry"
}
async function startBusy(title, text = SLOW) {
  const s = await api("POST", "/session", { title })
  if (!s?.id) throw new Error("session create failed: " + JSON.stringify(s)?.slice(0, 200))
  created.push(s.id)
  await api("POST", `/session/${s.id}/prompt_async`, { model: MODEL_REF, parts: [{ type: "text", text }] })
  if (!(await waitUntil(async () => (await isRunning(s.id)) || null, 20000, 200))) throw new Error(`session never became busy: ${title}`)
  return s.id
}
/** Aborts through the API whatever an earlier case left running, so every case starts from a quiet server. */
async function settle() {
  for (const id of await runningIds()) await api("POST", `/session/${id}/abort`).catch(() => {})
  return !!(await waitUntil(async () => ((await runningIds()).length === 0 ? true : null), 20000, 300))
}
/** True once the session's newest assistant message ended with MessageAbortedError (the server's mark of an abort). */
const abortedMark = async (sid) => !!(await waitUntil(async () => ((await lastAssistant(sid))?.info?.error?.name === "MessageAbortedError" ? true : null), 10000, 250))
/** Polls until none of `ids` is running; resolves with the time it took, or null on timeout. */
async function stoppedWithin(ids, ms = STOP_WITHIN_MS) {
  const t0 = Date.now()
  const ok = await waitUntil(async () => {
    for (const id of ids) if (await isRunning(id)) return null
    return true
  }, ms, 200)
  return ok ? Date.now() - t0 : null
}

// --- sidebar webview -----------------------------------------------------------------------------------------
const sidebar = async () => (await hostState(page, stateFile)).sidebar
const dotStatus = async (title) => (await (await sessionRow(page, title)).locator(".dot").getAttribute("data-status", { timeout: 2000 }).catch(() => null))
const notRunningDot = async (title) => {
  const d = await dotStatus(title)
  return d !== null && d !== "running"
}
async function rowVisible(title, timeout = 30000) {
  await (await sessionRow(page, title)).waitFor({ state: "visible", timeout })
}
async function clearSelection() {
  const frame = await sessionsFrame(page)
  if (frame && (await frame.locator("[data-selection-bar]").isVisible().catch(() => false))) await frame.locator('[data-batch="clear"]').click().catch(() => {})
}
/** The workbench's modal dialog (window.dialogStyle=custom): message, detail and button labels, or null when none shows. */
async function dialogOpen(timeout = 10000) {
  const dialog = page.locator(".monaco-dialog-box").first()
  if (!(await dialog.waitFor({ state: "visible", timeout }).then(() => true, () => false))) return null
  const text = (await dialog.innerText().catch(() => "")).replace(/\s+/g, " ").trim()
  const part = async (sel) => (await dialog.locator(sel).first().innerText({ timeout: 1000 }).catch(() => null))?.replace(/\s+/g, " ").trim() ?? null
  const buttons = await dialog.locator(".dialog-buttons .monaco-button").allInnerTexts().catch(() => [])
  return { dialog, text, message: await part(".dialog-message-text"), detail: await part(".dialog-message-detail"), buttons: buttons.map((b) => b.trim()) }
}
async function dialogPress(d, name) {
  await d.dialog.locator(".dialog-buttons").getByText(new RegExp(`^\\s*${name}\\s*$`)).first().click({ timeout: 5000 })
  await d.dialog.waitFor({ state: "hidden", timeout: 5000 }).catch(() => {})
}
async function dialogDismiss() {
  const d = await dialogOpen(500)
  if (d) await dialogPress(d, "Cancel").catch(() => {})
}
const rec = (id, ok, detail) => run.record(id, ok ? "PASS" : "FAIL", detail)

try {
  if (MODEL.mode !== "mock") {
    for (const id of CASES) run.record(id, "NOT RUN", { reason: "needs the scripted mock model (OCO_E2E_MODEL=mock): long answers keep sessions busy" })
    throw new Error("not a mock server")
  }
  const launched = await launch({ profile: "c16-sidebar-stop", run, settings: { "window.dialogStyle": "custom" } })
  app = launched.app
  page = launched.page
  stateFile = launched.stateFile
  run.installCrashHandlers(async () => {
    for (const id of created) await api("POST", `/session/${id}/abort`).catch(() => {})
    await app?.close().catch(() => {})
  })

  const rand = Math.random().toString(36).slice(2, 7)
  // An idle session open in the chat panel: it is the sidebar's "selected" session, so a click that wrongly opens
  // another session would show up as a changed selection.
  const keepTitle = `c16-keep-${rand}`
  const keepId = await createAndOpenSession(page, { title: keepTitle })
  created.push(keepId)
  await command(page, "Focus on Sessions View")
  await clearNotifications(page)
  if (!(await waitUntil(async () => !!(await sessionsFrame(page)), 30000, 300))) throw new Error("Sessions sidebar frame not found")
  await rowVisible(keepTitle)

  // ---- 1. row-stop ----------------------------------------------------------------------------------------
  try {
    const title = `c16-row-${rand}`
    const id = await startBusy(title)
    await rowVisible(title)
    const dotRunning = !!(await waitUntil(async () => ((await dotStatus(title)) === "running" ? true : null), 20000, 200))
    const before = await sidebar()
    // The idle row has a ■ in its markup but hidden: nothing to click.
    const keepRow = await sessionRow(page, keepTitle)
    await keepRow.hover()
    const idleStopVisible = await keepRow.locator("[data-stop]").isVisible().catch(() => false)
    const row = await sessionRow(page, title)
    await row.hover()
    const btn = row.locator("[data-stop]")
    const shownOnHover = !!(await waitUntil(async () => btn.evaluate((el) => {
      const cs = getComputedStyle(el)
      return !el.hidden && cs.display !== "none" && cs.pointerEvents !== "none" && parseFloat(cs.opacity) >= 0.5
    }), 3000, 100))
    await runShot(page, run, "1-row-hover-stop")
    const aria = await btn.getAttribute("aria-label", { timeout: 2000 }).catch(() => null)
    const stillBusyAtClick = await isRunning(id)
    const t0 = Date.now()
    await btn.click({ timeout: 8000 })
    const stoppedMs = await stoppedWithin([id])
    const dotCleared = !!(await waitUntil(async () => ((await notRunningDot(title)) ? true : null), 10000, 200))
    const aborted = await abortedMark(id)
    const after = await sidebar()
    const panelSessions = []
    for (const f of await chatFrames(page)) panelSessions.push(await frameSession(f).catch(() => null))
    const detail = {
      dotRunning, idleStopVisible, shownOnHover, aria, stillBusyAtClick, stoppedMs, withinMs: STOP_WITHIN_MS, dotCleared, aborted,
      selectedBefore: before.selected, selectedAfter: after.selected, keepId, panelOpensRow: panelSessions.includes(id),
    }
    await runShot(page, run, "1-row-stopped")
    rec("row-stop", dotRunning && !idleStopVisible && shownOnHover && stillBusyAtClick && stoppedMs !== null && dotCleared && aborted
      && before.selected === keepId && after.selected === keepId && !panelSessions.includes(id), { ...detail, elapsedSinceClickMs: Date.now() - t0 })
  } catch (e) {
    rec("row-stop", false, { error: errMsg(e) })
  }

  // ---- 2. selection-stop ----------------------------------------------------------------------------------
  try {
    await settle()
    await clearSelection()
    const idleTitle = `c16-idle-${rand}`
    const idleSession = await api("POST", "/session", { title: idleTitle })
    if (!idleSession?.id) throw new Error("idle session create failed")
    created.push(idleSession.id)
    const tA = `c16-selA-${rand}`
    const tB = `c16-selB-${rand}`
    const a = await startBusy(tA)
    const b = await startBusy(tB)
    for (const t of [idleTitle, tA, tB]) await rowVisible(t)
    await waitUntil(async () => ((await dotStatus(tA)) === "running" && (await dotStatus(tB)) === "running" ? true : null), 20000, 200)
    let frame = await sessionsFrame(page)
    const stopBtn = () => frame.locator('[data-batch="stop"]')
    // (a) only an idle row selected: the bar shows, Stop does not.
    await (await sessionRow(page, idleTitle)).click({ modifiers: ["Meta"] })
    await frame.locator("[data-selection-bar]").waitFor({ state: "visible", timeout: 5000 })
    const idleBarText = (await frame.locator("[data-selection-bar]").innerText()).replace(/\s+/g, " ").trim()
    const idleOnlyStopVisible = await stopBtn().isVisible()
    await frame.locator('[data-batch="clear"]').click()
    await frame.locator("[data-selection-bar]").waitFor({ state: "hidden", timeout: 5000 }).catch(() => {})
    // (b) the two busy rows selected: Stop shows and aborts both.
    await (await sessionRow(page, tA)).click({ modifiers: ["Meta"] })
    await (await sessionRow(page, tB)).click({ modifiers: ["Meta"] })
    await frame.locator("[data-selection-bar]").waitFor({ state: "visible", timeout: 5000 })
    const barText = (await frame.locator("[data-selection-bar]").innerText()).replace(/\s+/g, " ").trim()
    const selCount = await frame.locator('.row[data-kind="session"][data-selected]').count()
    const stopVisible = await stopBtn().isVisible()
    await runShot(page, run, "2-selection-stop")
    const bothBusyAtClick = (await isRunning(a)) && (await isRunning(b))
    await stopBtn().click({ timeout: 5000 })
    const stoppedMs = await stoppedWithin([a, b])
    const dotsCleared = !!(await waitUntil(async () => ((await notRunningDot(tA)) && (await notRunningDot(tB)) ? true : null), 10000, 200))
    const abortedA = await abortedMark(a)
    const abortedB = await abortedMark(b)
    const idleStillIdle = !(await isRunning(idleSession.id))
    await runShot(page, run, "2-selection-stopped")
    rec("selection-stop", !idleOnlyStopVisible && /1 selected/.test(idleBarText) && /2 selected/.test(barText) && selCount === 2 && stopVisible && bothBusyAtClick
      && stoppedMs !== null && dotsCleared && abortedA && abortedB && idleStillIdle,
      { idleBarText, idleOnlyStopVisible, barText, selCount, stopVisible, bothBusyAtClick, stoppedMs, withinMs: STOP_WITHIN_MS, dotsCleared, abortedA, abortedB, idleStillIdle })
  } catch (e) {
    rec("selection-stop", false, { error: errMsg(e) })
  }

  // ---- 3. stop-all ----------------------------------------------------------------------------------------
  try {
    await settle()
    await clearSelection()
    const tC = `c16-allA-${rand}`
    const tD = `c16-allB-${rand}`
    const c = await startBusy(tC)
    const d = await startBusy(tD)
    const counterBefore = await waitUntil(async () => {
      const s = (await sidebar()).stopText
      return s === "$(debug-stop) 2" ? s : null
    }, 30000, 300)
    const stopTextBefore = counterBefore ?? (await sidebar()).stopText
    const statusBarItems = await page.locator(".statusbar .codicon-debug-stop").count()
    // Cancel keeps everything running.
    await command(page, "oco: Stop All Running Sessions")
    const first = await dialogOpen(10000)
    let cancelKeepsRunning = null
    if (first) {
      await runShot(page, run, "3-stop-all-dialog")
      await dialogPress(first, "Cancel")
      await new Promise((r) => setTimeout(r, 1500))
      cancelKeepsRunning = (await isRunning(c)) && (await isRunning(d)) && (await sidebar()).stopText === "$(debug-stop) 2"
    }
    // Run it again and confirm.
    let second = first
    if (first) {
      await command(page, "oco: Stop All Running Sessions")
      second = await dialogOpen(10000)
    }
    if (!first || !second) {
      await dialogDismiss()
      run.record("stop-all", "NOT RUN", { reason: "no modal dialog rendered in the DOM (window.dialogStyle=custom did not take effect or the command did not run)", stopTextBefore, statusBarItems, firstDialog: !!first })
    } else {
      const msgOk = /Stop all 2 running sessions\?/.test(second.text)
      const t0 = Date.now()
      await dialogPress(second, "Stop")
      const stoppedMs = await stoppedWithin([c, d])
      const counterGone = !!(await waitUntil(async () => ((await sidebar()).stopText === null ? true : null), 15000, 400))
      const abortedC = await abortedMark(c)
      const abortedD = await abortedMark(d)
      const dotsCleared = !!(await waitUntil(async () => ((await notRunningDot(tC)) && (await notRunningDot(tD)) ? true : null), 10000, 200))
      await runShot(page, run, "3-stop-all-done")
      rec("stop-all", counterBefore === "$(debug-stop) 2" && statusBarItems > 0 && msgOk && cancelKeepsRunning === true && stoppedMs !== null && counterGone && abortedC && abortedD && dotsCleared,
        { stopTextBefore, statusBarItems, dialogMessage: second.message, dialogDetail: second.detail, dialogButtons: second.buttons, msgOk, cancelKeepsRunning, stoppedMs, withinMs: STOP_WITHIN_MS, counterGone, abortedC, abortedD, dotsCleared, elapsedSinceStopMs: Date.now() - t0 })
    }
  } catch (e) {
    await dialogDismiss().catch(() => {})
    rec("stop-all", false, { error: errMsg(e) })
  }

  // ---- 4. cascade-confirm ---------------------------------------------------------------------------------
  try {
    await settle()
    await clearSelection()
    const title = `c16-casc-${rand}`
    const parent = await api("POST", "/session", { title })
    if (!parent?.id) throw new Error("parent create failed")
    created.push(parent.id)
    await rowVisible(title)
    const row = await sessionRow(page, title)
    // WITH-SLOW-SIBLING adds a subagent (60 sentences, ~9 s) to the read tool call: the parent stays busy while it runs.
    await api("POST", `/session/${parent.id}/prompt_async`, { model: MODEL_REF, parts: [{ type: "text", text: "Use the read tool on math.ts with offset 1 and limit 2 WITH-SLOW-SIBLING" }] })
    let childId = null
    await waitUntil(async () => {
      for (const k of (await api("GET", `/session/${parent.id}/children`).catch(() => [])) ?? []) {
        if (await isRunning(k.id)) return (childId = k.id)
      }
      return null
    }, 30000, 150)
    if (!childId) {
      run.record("cascade-confirm", "NOT RUN", { reason: "no running subagent observed under the parent within 30 s (mock WITH-SLOW-SIBLING)", parentRunning: await isRunning(parent.id) })
    } else {
      created.push(childId)
      // Time matters from here: the subagent runs ~9 s.
      await row.hover()
      const btn = row.locator("[data-stop]")
      const parentBusyAtClick = await isRunning(parent.id)
      const childBusyAtClick = await isRunning(childId)
      const t0 = Date.now()
      await btn.click({ timeout: 4000 })
      const dlg = await dialogOpen(8000)
      const dialogMs = Date.now() - t0
      if (!dlg) {
        const childStillBusy = await isRunning(childId)
        if (childBusyAtClick && childStillBusy) rec("cascade-confirm", false, { reason: "no confirm although a subagent was running", parentBusyAtClick, childBusyAtClick, dialogMs })
        else run.record("cascade-confirm", "NOT RUN", { reason: "subagent window (~9 s) closed before the ■ click landed", parentBusyAtClick, childBusyAtClick, childStillBusy, dialogMs })
      } else {
        const titleOk = dlg.text.includes(`Stop "${title}"?`)
        const detailOk = /running subagent/.test(dlg.detail ?? dlg.text)
        await runShot(page, run, "4-cascade-dialog")
        const tc = Date.now()
        await dialogPress(dlg, "Stop")
        const stoppedMs = await stoppedWithin([parent.id, childId])
        const childMsg = await lastAssistant(childId)
        const childFinished = /Mock line 60\./.test(textOf(childMsg))
        const parentAborted = await abortedMark(parent.id)
        const dotCleared = !!(await waitUntil(async () => ((await notRunningDot(title)) ? true : null), 10000, 200))
        await runShot(page, run, "4-cascade-stopped")
        rec("cascade-confirm", titleOk && detailOk && parentBusyAtClick && childBusyAtClick && stoppedMs !== null && !childFinished && dotCleared,
          { dialogMessage: dlg.message, dialogDetail: dlg.detail, dialogButtons: dlg.buttons, titleOk, detailOk, parentBusyAtClick, childBusyAtClick, dialogMs, stoppedMs, withinMs: STOP_WITHIN_MS, childFinishedNaturally: childFinished, parentAborted, dotCleared, elapsedSinceConfirmMs: Date.now() - tc })
      }
    }
  } catch (e) {
    await dialogDismiss().catch(() => {})
    rec("cascade-confirm", false, { error: errMsg(e) })
  }

  // ---- 5. waiting-stop ------------------------------------------------------------------------------------
  // The mock server asks for bash permission, so the session stays busy on the server while the sidebar shows it as
  // "waiting" (and lists it in the inbox). It must still be stoppable: row ■, counted by the status-bar counter.
  try {
    for (const p of (await api("GET", "/permission")) ?? []) await api("POST", `/permission/${p.id}/reply`, { reply: "reject" }).catch(() => {})
    await settle()
    await clearSelection()
    const title = `c16-wait-${rand}`
    const s = await api("POST", "/session", { title })
    if (!s?.id) throw new Error("waiting session create failed")
    created.push(s.id)
    await rowVisible(title)
    await api("POST", `/session/${s.id}/prompt_async`, { model: MODEL_REF, parts: [{ type: "text", text: `Use the bash tool to run exactly: echo c16-wait-${rand}` }] })
    const pending = async () => ((await api("GET", "/permission")) ?? []).filter((p) => p.sessionID === s.id)
    const asked = !!(await waitUntil(async () => ((await pending()).length > 0 ? true : null), 30000, 200))
    const busyWhileWaiting = await isRunning(s.id)
    const waitingDot = !!(await waitUntil(async () => ((await dotStatus(title)) === "waiting" ? true : null), 20000, 200))
    const frame = await sessionsFrame(page)
    const inboxRow = frame.locator(`section[data-group="inbox"] .row[data-kind="permission"][data-session-id="${s.id}"]`)
    const inboxShown = !!(await waitUntil(async () => ((await inboxRow.count()) > 0 ? true : null), 20000, 200))
    const counted = !!(await waitUntil(async () => ((await sidebar()).stopText === "$(debug-stop) 1" ? true : null), 20000, 300))
    const stopTextWhileWaiting = (await sidebar()).stopText
    const row = await sessionRow(page, title)
    await row.hover()
    const btn = row.locator("[data-stop]")
    const shownOnHover = !!(await waitUntil(async () => btn.evaluate((el) => {
      const cs = getComputedStyle(el)
      return !el.hidden && cs.display !== "none" && cs.pointerEvents !== "none" && parseFloat(cs.opacity) >= 0.5
    }), 3000, 100))
    await runShot(page, run, "5-waiting-hover-stop")
    const t0 = Date.now()
    await btn.click({ timeout: 8000 })
    const within = async (fn) => ((await waitUntil(fn, Math.max(500, STOP_WITHIN_MS - (Date.now() - t0)), 200)) ? Date.now() - t0 : null)
    const stoppedMs = await within(async () => !(await isRunning(s.id)))
    const permissionGoneMs = await within(async () => (await pending()).length === 0)
    const inboxGoneMs = await within(async () => (await inboxRow.count()) === 0)
    const dotCleared = !!(await waitUntil(async () => {
      const d = await dotStatus(title)
      return d !== null && d !== "waiting" && d !== "running" ? true : null
    }, 10000, 200))
    const counterGone = !!(await waitUntil(async () => ((await sidebar()).stopText === null ? true : null), 15000, 400))
    const lastAssistantError = (await lastAssistant(s.id))?.info?.error?.name ?? null
    await runShot(page, run, "5-waiting-stopped")
    rec("waiting-stop", asked && busyWhileWaiting && waitingDot && inboxShown && counted && shownOnHover && stoppedMs !== null && permissionGoneMs !== null && inboxGoneMs !== null && dotCleared && counterGone,
      { asked, busyWhileWaiting, waitingDot, inboxShown, counted, stopTextWhileWaiting, shownOnHover, stoppedMs, permissionGoneMs, inboxGoneMs, withinMs: STOP_WITHIN_MS, dotCleared, counterGone, permissionStillPending: (await pending()).length, lastAssistantError })
  } catch (e) {
    rec("waiting-stop", false, { error: errMsg(e) })
  }
} catch (e) {
  if (!String(e?.message).includes("not a mock server")) {
    run.record("run", "FAIL", { error: errMsg(e) })
    if (page) await runShot(page, run, "error").catch(() => {})
  }
} finally {
  // A permission a stopped session left pending would show up in later suites' inboxes: reject this run's leftovers.
  for (const p of (await api("GET", "/permission").catch(() => [])) ?? []) if (created.includes(p.sessionID)) await api("POST", `/permission/${p.id}/reply`, { reply: "reject" }).catch(() => {})
  for (const id of created) await api("POST", `/session/${id}/abort`).catch(() => {})
  if (app) await app.close().catch(() => {})
  process.exit(run.finish())
}
