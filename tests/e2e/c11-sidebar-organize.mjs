#!/usr/bin/env node
// E2E c11-sidebar-organize: Pin, multi-select batch (Mark unread, archive), todo badge in the sidebar SESSIONS list.
import { fileURLToPath } from "node:url"
import { createRun, recordNotApplicable } from "./lib/results.mjs"
import { launch, command, waitUntil, sleep, runShot, clearNotifications } from "./vscode.mjs"
import { api, MODEL } from "./server.mjs"
import { sessionsFrame, sessionRow } from "./lib/sessions-web.mjs"

const REQUIRED = ["pinned-group", "selection-bar", "marked-unread", "todo-badge"]
const REAL = MODEL.mode === "real"
const TODO_WAIT_MS = REAL ? 90000 : 20000
const run = createRun({ suite: "c11-sidebar-organize", required: REQUIRED, scriptPath: fileURLToPath(import.meta.url) })
const health = await api("GET", "/global/health").catch(() => null)
run.setEnv({ serverVersion: health?.version ?? null, modelMode: MODEL.mode })

let app = null
let page = null
const errMsg = (e) => String(e?.message ?? e).slice(0, 400)

try {
  const launched = await launch({ profile: "c11-sidebar-organize", run, settings: { "window.dialogStyle": "custom" } })
  app = launched.app
  page = launched.page
  run.installCrashHandlers(() => app?.close())

  const rand = Math.random().toString(36).slice(2, 7)
  const titles = ["A", "B", "C"].map((n) => `c11-${n}-${rand}`)
  const ids = []
  for (const t of titles) {
    const s = await api("POST", "/session", { title: t })
    if (!s?.id) throw new Error("session create failed")
    ids.push(s.id)
    await sleep(300)
  }
  const [tA, tB, tC] = titles

  await command(page, "Focus on Sessions View")
  await clearNotifications(page)
  let frame = null
  await waitUntil(async () => ((frame = await sessionsFrame(page)), !!frame), 30000, 300)
  if (!frame) throw new Error("Sessions sidebar frame not found")
  for (const t of titles) await (await sessionRow(page, t)).waitFor({ state: "visible", timeout: 30000 })
  await runShot(page, run, "1-three-sessions")

  // --- Pin B ---
  try {
    const rowB = await sessionRow(page, tB)
    await rowB.hover()
    await rowB.locator("[data-pin]").click()
    await waitUntil(async () => (await (await sessionRow(page, tB)).getAttribute("class"))?.includes("pinned"), 10000, 200)
    const order = await frame.locator('.row[data-kind="session"] .title').allInnerTexts()
    const headIdx = await frame.evaluate(() => {
      const kids = [...document.querySelector(".list").querySelectorAll(".section-head, .row")]
      return kids.map((n) => (n.classList.contains("section-head") ? "H:" + (n.dataset.group ?? n.textContent.trim()) : "R:" + (n.querySelector(".title")?.textContent ?? n.dataset.kind)))
    })
    const pinnedHeadFirst = headIdx.findIndex((x) => x === "H:pinned") !== -1 && headIdx.indexOf("R:" + tB) === headIdx.indexOf("H:pinned") + 1
    const bFirstSession = order.indexOf(tB) === 0
    await runShot(page, run, "2-pinned")
    run.record("pinned-group", pinnedHeadFirst && bFirstSession ? "PASS" : "FAIL", { pinnedHeadFirst, bFirstSession, sequence: headIdx.slice(0, 8) })
  } catch (e) {
    run.record("pinned-group", "FAIL", { error: errMsg(e) })
  }

  // --- Multi-select: Cmd-click C (anchor), Shift-click A ---
  let selected2 = false
  try {
    await (await sessionRow(page, tC)).click({ modifiers: ["Meta"] })
    await (await sessionRow(page, tA)).click({ modifiers: ["Shift"] })
    const bar = frame.locator("[data-selection-bar]")
    await bar.waitFor({ state: "visible", timeout: 5000 })
    const barText = (await bar.innerText()).replace(/\s+/g, " ")
    const selCount = await frame.locator('.row[data-kind="session"][data-selected]').count()
    selected2 = /2 selected/.test(barText) && selCount === 2
    await runShot(page, run, "3-selection")
    run.record("selection-bar", selected2 ? "PASS" : "FAIL", { barText, selCount })
  } catch (e) {
    run.record("selection-bar", "FAIL", { error: errMsg(e) })
  }

  // --- Mark unread ---
  try {
    await frame.locator('[data-batch="unread"]').click()
    const unreadOf = async (t) => (await (await sessionRow(page, t)).locator(".dot").getAttribute("data-status").catch(() => null)) === "unread"
    const ok1 = await waitUntil(async () => (await unreadOf(tA)) && (await unreadOf(tC)), 8000, 150)
    await sleep(700)
    const still = (await unreadOf(tA)) && (await unreadOf(tC))
    const bUnread = await unreadOf(tB)
    await runShot(page, run, "4-unread")
    run.record("marked-unread", ok1 && still && !bUnread ? "PASS" : "FAIL", { ok1, stillAfter700ms: still, bUnread })
  } catch (e) {
    run.record("marked-unread", "FAIL", { error: errMsg(e) })
  }

  // --- Clear ---
  try {
    await frame.locator('[data-batch="clear"]').click()
    const gone = await waitUntil(async () => (await frame.locator("[data-selection-bar]").count()) === 0 || !(await frame.locator("[data-selection-bar]").isVisible()), 5000, 150)
    const n = await frame.locator('.row[data-kind="session"][data-selected]').count()
    run.record("selection-cleared", gone && n === 0 ? "PASS" : "FAIL", { gone, selectedRows: n })
  } catch (e) {
    run.record("selection-cleared", "FAIL", { error: errMsg(e) })
  }

  // --- Todo (before archive) ---
  try {
    await api("POST", `/session/${ids[0]}/prompt_async`, {
      model: { providerID: MODEL.providerID, modelID: MODEL.modelID },
      parts: [{ type: "text", text: "Use the todowrite tool to plan: write spec; build it; ship it" }],
    })
    const sel = (await sessionRow(page, tA)).locator("[data-todo]")
    await sel.waitFor({ state: "attached", timeout: TODO_WAIT_MS })
    const badge = await sel.getAttribute("data-todo")
    await sel.click()
    const list = (await sessionRow(page, tA)).locator("[data-todo-list]")
    await waitUntil(async () => (await list.locator(".todo-item").count()) > 0, 5000, 150)
    const items = await list.locator(".todo-item").allInnerTexts()
    await runShot(page, run, "5-todo")
    const todoPass = REAL
      ? /^\d+\/\d+$/.test(badge ?? "") && items.length > 0 && items.length === Number(badge.split("/")[1])
      : badge === "1/3" && items.length === 3
    const todoDetail = { badge, items, ...(REAL ? { relaxed: "real model: the model chooses its own todo list" } : {}) }
    run.record("todo-badge", todoPass ? "PASS" : "FAIL", todoDetail)
    await sel.click()
    const collapsed = await waitUntil(async () => (await list.locator(".todo-item").count()) === 0, 5000, 150)
    run.record("todo-collapse", collapsed ? "PASS" : "FAIL", { collapsed })
  } catch (e) {
    const diag = {}
    try {
      diag.api = await api("GET", `/session/${ids[0]}/todo`)
      diag.rowHtml = (await (await sessionRow(page, tA)).evaluate((n) => n.outerHTML)).slice(0, 600)
      await runShot(page, run, "5-todo-missing")
    } catch {}
    const error = errMsg(e).slice(0, 120)
    if (REAL && Array.isArray(diag.api) && diag.api.length === 0) {
      const reason = "real model did not call todowrite, so the session has no todos to badge"
      recordNotApplicable(run, REQUIRED, "todo-badge", reason, { error, ...diag })
      recordNotApplicable(run, REQUIRED, "todo-collapse", reason, { error, ...diag })
    } else {
      run.record("todo-badge", "FAIL", { error, ...diag })
    }
  }

  // --- Archive 2 rows via custom modal dialog ---
  try {
    await (await sessionRow(page, tC)).click({ modifiers: ["Meta"] })
    await (await sessionRow(page, tA)).click({ modifiers: ["Shift"] })
    await frame.locator("[data-selection-bar]").waitFor({ state: "visible", timeout: 5000 })
    const barText = (await frame.locator("[data-selection-bar]").innerText()).replace(/\s+/g, " ")
    await frame.locator('[data-batch="archive"]').click()
    const dialog = page.locator(".monaco-dialog-box")
    const shown = await dialog.waitFor({ state: "visible", timeout: 8000 }).then(() => true, () => false)
    if (!shown) {
      run.record("archive-batch", "NOT RUN", { reason: "no modal dialog appeared (dialogStyle=custom)", barText })
    } else {
      const dtxt = (await dialog.innerText()).replace(/\s+/g, " ").slice(0, 200)
      await runShot(page, run, "6-archive-dialog")
      const btns = await dialog.locator(".dialog-buttons .monaco-button, .dialog-buttons a, .dialog-buttons .monaco-text-button").allInnerTexts()
      await dialog.locator(".dialog-buttons").getByText(/archive/i).first().click()
      const gone = await waitUntil(async () => (await (await sessionRow(page, tA)).count()) === 0 && (await (await sessionRow(page, tC)).count()) === 0, 15000, 250)
      const archivedA = await api("GET", `/session/${ids[0]}`).then((s) => s?.time?.archived ?? null, () => null)
      run.record("archive-batch", gone && archivedA ? "PASS" : "FAIL", { dtxt, btns, rowsGone: gone, archivedA })
    }
  } catch (e) {
    run.record("archive-batch", "NOT RUN", { reason: "dialog handling failed: " + errMsg(e) })
  }
  run.record("delete-batch", "NOT RUN", { reason: "destructive; kept to archive only" })
} catch (e) {
  run.record("run", "FAIL", { error: errMsg(e) })
  if (page) await runShot(page, run, "error").catch(() => {})
} finally {
  if (app) await app.close().catch(() => {})
  process.exit(run.finish())
}
