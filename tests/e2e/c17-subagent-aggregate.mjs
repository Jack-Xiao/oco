#!/usr/bin/env node
// E2E c17-subagent-aggregate (M20 step 1): a parent row in the SESSIONS sidebar aggregates its subagents.
// Mock model only: the prompt token WITH-SLOW-SIBLING makes the parent dispatch one slow subagent (60 sentences, ~9 s).
// Cases:
//   badge-running    no badge before the subagent exists; while it runs the parent row shows `.subagents-badge` "0/1" with the
//                    running style and aria-label "Subagents: 0 done, 1 running"
//   badge-done       after it finishes the badge reads "1/1" and the running style is gone
//   expand-collapse  clicking the badge lists the subagent under the row (`.subagents-list` > one `.subagent-row` with a title),
//                    aria-expanded=true, the open session does not change and the parent is not opened; a second click collapses
//   open-child       clicking the subagent row opens that child session (debugState().selected or a panel bound to it)
//   lazy-children    restart VS Code (same user-data-dir): the snapshot is roots only (roots=true), so the parent's "1/1" can only
//                    come from the lazy GET /session/:id/children, which a recording proxy sees (optional: NOT RUN if VS Code
//                    cannot be relaunched)
import { fileURLToPath } from "node:url"
import { createRun } from "./lib/results.mjs"
import { startProxy } from "./lib/proxy.mjs"
import { launch, command, waitUntil, sleep, runShot, hostState, clearNotifications, createAndOpenSession, chatFrames, frameSession } from "./vscode.mjs"
import { api, MODEL } from "./server.mjs"
import { sessionsFrame, sessionRow } from "./lib/sessions-web.mjs"

const PROFILE = "c17-subagent-aggregate"
const CASES = ["badge-running", "badge-done", "expand-collapse", "open-child", "lazy-children"]
const run = createRun({ suite: "c17-subagent-aggregate", required: ["badge-running", "badge-done", "expand-collapse", "open-child"], scriptPath: fileURLToPath(import.meta.url) })
const health = await api("GET", "/global/health").catch(() => null)
run.setEnv({ serverVersion: health?.version ?? null, modelMode: MODEL.mode })

const errMsg = (e) => String(e?.message ?? e).slice(0, 400)
const MODEL_REF = { providerID: MODEL.providerID, modelID: MODEL.modelID }
// A read tool call (no permission asked) plus one slow subagent: the parent stays busy until the subagent is done.
const PROMPT = "Use the read tool on math.ts with offset 1 and limit 2 WITH-SLOW-SIBLING"
const DIRECT = process.env.OCO_TEST_URL ?? "http://127.0.0.1:4517"

let app = null
let page = null
let stateFile = null
let proxy = null
const created = []
const rec = (id, ok, detail) => run.record(id, ok ? "PASS" : "FAIL", detail)

const sidebar = async () => (await hostState(page, stateFile)).sidebar
async function rowVisible(title, timeout = 30000) {
  await (await sessionRow(page, title)).waitFor({ state: "visible", timeout })
}
/** State of the parent row's subagents badge / list as the user sees it, or null when the row or badge element is missing. */
async function badgeInfo(title) {
  const row = await sessionRow(page, title)
  return row
    .evaluate((node) => {
      const b = node.querySelector(":scope > .subagents-badge")
      if (!b) return null
      const list = node.querySelector(":scope > .subagents-list")
      return {
        visible: !b.hidden && getComputedStyle(b).display !== "none" && getComputedStyle(b).visibility !== "hidden",
        text: (b.textContent ?? "").trim(),
        running: b.classList.contains("running"),
        attention: b.classList.contains("attention"),
        aria: b.getAttribute("aria-label"),
        title: b.getAttribute("title"),
        expanded: b.getAttribute("aria-expanded"),
        listVisible: !!list && !list.hidden && getComputedStyle(list).display !== "none",
        items: list ? [...list.querySelectorAll(".subagent-row")].map((r) => ({ id: r.dataset.id, title: (r.querySelector(".subagent-title")?.textContent ?? "").trim() })) : [],
      }
    }, undefined, { timeout: 2000 })
    .catch(() => null)
}
const serverIdle = async () => Object.values((await api("GET", "/session/status")) ?? {}).every((v) => v?.type !== "busy" && v?.type !== "retry")
const panelSessions = async () => {
  const out = []
  for (const f of await chatFrames(page)) out.push(await frameSession(f).catch(() => null))
  return out
}
async function waitSessionsFrame() {
  if (!(await waitUntil(async () => !!(await sessionsFrame(page)), 30000, 300))) throw new Error("Sessions sidebar frame not found")
}

try {
  if (MODEL.mode !== "mock") {
    for (const id of CASES) run.record(id, "NOT RUN", { reason: "needs the scripted mock model (OCO_E2E_MODEL=mock): WITH-SLOW-SIBLING dispatches the slow subagent" })
    throw new Error("not a mock server")
  }
  const launched = await launch({ profile: PROFILE, run })
  app = launched.app
  page = launched.page
  stateFile = launched.stateFile
  run.installCrashHandlers(async () => {
    for (const id of created) await api("POST", `/session/${id}/abort`).catch(() => {})
    await app?.close().catch(() => {})
    await proxy?.close().catch(() => {})
  })

  const rand = Math.random().toString(36).slice(2, 7)
  // An idle session open in the chat panel is the sidebar's "selected" one: a click that wrongly opens the parent (or the
  // child before it is asked to) shows up as a changed selection.
  const keepTitle = `c17-keep-${rand}`
  const keepId = await createAndOpenSession(page, { title: keepTitle })
  created.push(keepId)
  await command(page, "Focus on Sessions View")
  await clearNotifications(page)
  await waitSessionsFrame()
  await rowVisible(keepTitle)

  const parentTitle = `c17-parent-${rand}`
  const parent = await api("POST", "/session", { title: parentTitle })
  if (!parent?.id) throw new Error("parent create failed")
  created.push(parent.id)
  await rowVisible(parentTitle)
  const badgeBefore = await badgeInfo(parentTitle)
  const noBadgeBefore = !badgeBefore || !badgeBefore.visible
  const t0 = Date.now()
  await api("POST", `/session/${parent.id}/prompt_async`, { model: MODEL_REF, parts: [{ type: "text", text: PROMPT }] })

  // ---- 1. badge-running -----------------------------------------------------------------------------------
  let childId = null
  try {
    let seen = null
    await waitUntil(async () => {
      const b = await badgeInfo(parentTitle)
      if (b?.visible && b.running) return (seen = b)
      return null
    }, 30000, 150)
    const seenMs = Date.now() - t0
    await runShot(page, run, "1-badge-running")
    childId = ((await api("GET", `/session/${parent.id}/children`).catch(() => [])) ?? [])[0]?.id ?? null
    rec("badge-running", noBadgeBefore && !!seen && seen.text === "0/1" && seen.running && /1 running/.test(seen.aria ?? ""), { noBadgeBefore, seenMs, childId, badge: seen })
  } catch (e) {
    rec("badge-running", false, { error: errMsg(e) })
  }

  // ---- 2. badge-done --------------------------------------------------------------------------------------
  try {
    const serverDone = !!(await waitUntil(async () => ((await serverIdle()) ? true : null), 45000, 300))
    const done = await waitUntil(async () => {
      const b = await badgeInfo(parentTitle)
      return b?.visible && b.text === "1/1" && !b.running ? b : null
    }, 20000, 200)
    childId ??= ((await api("GET", `/session/${parent.id}/children`).catch(() => [])) ?? [])[0]?.id ?? null
    await runShot(page, run, "2-badge-done")
    rec("badge-done", serverDone && !!done, { serverDone, childId, badge: done ?? (await badgeInfo(parentTitle)) })
  } catch (e) {
    rec("badge-done", false, { error: errMsg(e) })
  }

  // ---- 3. expand-collapse ---------------------------------------------------------------------------------
  const badgeBtn = async () => (await sessionRow(page, parentTitle)).locator(":scope > .subagents-badge")
  try {
    const before = (await sidebar()).selected
    await (await badgeBtn()).click({ timeout: 5000 })
    const expanded = await waitUntil(async () => {
      const b = await badgeInfo(parentTitle)
      return b?.expanded === "true" && b.listVisible && b.items.length === 1 ? b : null
    }, 8000, 150)
    await runShot(page, run, "3-expanded")
    const mid = await sidebar()
    const panelsMid = await panelSessions()
    await (await badgeBtn()).click({ timeout: 5000 })
    const collapsed = await waitUntil(async () => {
      const b = await badgeInfo(parentTitle)
      return b?.expanded === "false" && !b.listVisible && b.items.length === 0 ? b : null
    }, 8000, 150)
    const after = await sidebar()
    rec("expand-collapse", before === keepId && !!expanded && !!expanded.items[0]?.title && mid.selected === keepId && !panelsMid.includes(parent.id) && !!collapsed && after.selected === keepId,
      { selectedBefore: before, selectedExpanded: mid.selected, selectedCollapsed: after.selected, keepId, parentOpened: panelsMid.includes(parent.id), expanded, collapsed: collapsed ? { expanded: collapsed.expanded, listVisible: collapsed.listVisible, items: collapsed.items.length } : null })
  } catch (e) {
    rec("expand-collapse", false, { error: errMsg(e) })
  }

  // ---- 4. open-child --------------------------------------------------------------------------------------
  try {
    await (await badgeBtn()).click({ timeout: 5000 })
    const row = await sessionRow(page, parentTitle)
    const childRow = row.locator(":scope > .subagents-list .subagent-row").first()
    await childRow.waitFor({ state: "visible", timeout: 8000 })
    const rowChildId = await childRow.getAttribute("data-id")
    const rowTitle = ((await childRow.locator(".subagent-title").innerText({ timeout: 2000 }).catch(() => "")) ?? "").trim()
    await childRow.click({ timeout: 5000 })
    let by = null
    await waitUntil(async () => {
      if ((await sidebar()).selected === childId) return (by = "selected")
      if ((await panelSessions()).includes(childId)) return (by = "panel")
      return null
    }, 20000, 300)
    const after = await sidebar()
    await runShot(page, run, "4-child-opened")
    rec("open-child", !!childId && rowChildId === childId && !!by && after.selected !== parent.id, { childId, rowChildId, rowTitle, openedBy: by, selectedAfter: after.selected, parentId: parent.id })
  } catch (e) {
    rec("open-child", false, { error: errMsg(e) })
  }

  // ---- 5. lazy-children -----------------------------------------------------------------------------------
  // New VS Code instance on the same user-data-dir: its store starts empty and the snapshot holds roots only, so the badge
  // can only be rebuilt from GET /session/:parent/children (the lazy fetch). A recording proxy counts those requests.
  try {
    await app.close().catch(() => {})
    app = null
    page = null
    proxy = await startProxy({ target: DIRECT })
    const requests = []
    proxy.intercept((method, url) => (requests.push({ method, path: url.pathname, search: url.search }), undefined))
    let relaunched = null
    try {
      relaunched = await launch({ profile: PROFILE, run, fresh: false, settings: { "oco.serverUrl": proxy.url } })
    } catch (e) {
      run.record("lazy-children", "NOT RUN", { reason: "could not relaunch VS Code on the same user-data-dir: " + errMsg(e) })
    }
    if (relaunched) {
      app = relaunched.app
      page = relaunched.page
      stateFile = relaunched.stateFile
      await command(page, "Focus on Sessions View")
      await clearNotifications(page)
      await waitSessionsFrame()
      await rowVisible(parentTitle, 40000)
      const badge = await waitUntil(async () => {
        const b = await badgeInfo(parentTitle)
        return b?.visible && b.text === "1/1" && !b.running ? b : null
      }, 30000, 250)
      await sleep(1500) // a duplicate fetch would show up by now
      await runShot(page, run, "5-after-restart")
      const childReqs = requests.filter((r) => r.method === "GET" && r.path === `/session/${parent.id}/children`)
      const snapshots = requests.filter((r) => r.method === "GET" && r.path === "/session" && new URLSearchParams(r.search).get("roots") === "true")
      const anyChildrenReqs = requests.filter((r) => r.method === "GET" && /^\/session\/[^/]+\/children$/.test(r.path)).length
      // "At most once per session per connection" (session-feed.ts ensureChildren): exactly one request for the parent.
      rec("lazy-children", !!badge && childReqs.length === 1 && snapshots.length >= 1,
        { badge, parentChildrenRequests: childReqs.length, allChildrenRequests: anyChildrenReqs, rootsSnapshotRequests: snapshots.length, proxyRequests: requests.length })
    }
  } catch (e) {
    rec("lazy-children", false, { error: errMsg(e) })
  }
} catch (e) {
  if (!String(e?.message).includes("not a mock server")) {
    run.record("run", "FAIL", { error: errMsg(e) })
    if (page) await runShot(page, run, "error").catch(() => {})
  }
} finally {
  for (const id of created) await api("POST", `/session/${id}/abort`).catch(() => {})
  if (app) await app.close().catch(() => {})
  if (proxy) await proxy.close().catch(() => {})
  process.exit(run.finish())
}
