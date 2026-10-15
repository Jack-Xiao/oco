#!/usr/bin/env node
// E2E c25-nested-subagents: subagents that start subagents (root -> child -> grandchild, 2 levels). Mock model only:
// NESTED-L1-SLOW / NESTED-L1-PERM make each level dispatch the next; the leaf is a slow reply or a bash call awaiting permission.
// Cases:
//   tree-depth       the server really has root -> child -> grandchild (GET /session/:id/children at each level)
//   sidebar-running  while the grandchild is busy the ROOT row's subagents badge is `.running` (never idle/done)
//   pills-running    the root header pill for the child is `running` while only the grandchild is busy
//   runtime-nested   runtime view: root has a subagent cell -> open child -> child shows its own cell -> open grandchild (crumb depth 2) -> back
//   settled          after the leaf finishes the badge is not running and the pill is `done`
//   perm-attention   grandchild awaits permission: the root badge carries `.attention` (or running if the child is still busy) and
//                    the pill is `waiting`; after reject the badge/pill leave the waiting state
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { createRun } from "./lib/results.mjs"
import { launch, command, waitUntil, runShot, clearNotifications, createAndOpenSession, chatFrames, frameSession } from "./vscode.mjs"
import { api, MODEL } from "./server.mjs"
import { sessionsFrame, sessionRow } from "./lib/sessions-web.mjs"

const CASES = ["tree-depth", "sidebar-running", "pills-running", "runtime-nested", "settled", "perm-attention"]
const run = createRun({ suite: "c25-nested-subagents", required: CASES, scriptPath: fileURLToPath(import.meta.url) })
const health = await api("GET", "/global/health").catch(() => null)
run.setEnv({ serverVersion: health?.version ?? null, modelMode: MODEL.mode })
const errMsg = (e) => String(e?.message ?? e).slice(0, 400)
const MODEL_REF = { providerID: MODEL.providerID, modelID: MODEL.modelID }
const rec = (id, ok, detail) => run.record(id, ok ? "PASS" : "FAIL", detail)
const AGENT_FILE = path.join(fs.realpathSync(path.join(path.resolve(import.meta.dirname, "../.."), ".oco-test")), "workspace/.opencode/agents/nested.md")
let app = null, page = null
const created = []
const children = async (id) => ((await api("GET", `/session/${id}/children`).catch(() => [])) ?? [])
const prompt = (id, text) => api("POST", `/session/${id}/prompt_async`, { model: MODEL_REF, parts: [{ type: "text", text }] })

async function frameWithSession(id) {
  for (const f of await chatFrames(page)) if ((await frameSession(f).catch(() => null)) === id) return f
  return null
}
async function pillInfo(id) {
  const f = await frameWithSession(id)
  if (!f) return null
  return f.evaluate(() => {
    const bar = document.querySelector("[data-oco-session-header] [data-oco-child-pills]")
    if (!bar) return { bar: false }
    const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 }
    return {
      bar: true, mode: bar.getAttribute("data-oco-child-pills-mode"), count: bar.querySelector("[data-oco-child-pills-count]")?.textContent?.trim() ?? null,
      pills: [...bar.querySelectorAll("button[data-oco-child-pill]")].filter(vis).map((p) => ({ id: p.getAttribute("data-oco-child-pill"), status: p.getAttribute("data-oco-child-status") })),
    }
  }).catch(() => null)
}
async function badgeInfo(title) {
  const row = await sessionRow(page, title)
  return row.evaluate((node) => {
    const b = node.querySelector(":scope > .subagents-badge")
    if (!b) return null
    return { visible: !b.hidden && getComputedStyle(b).display !== "none", text: (b.textContent ?? "").trim(), running: b.classList.contains("running"), attention: b.classList.contains("attention"), aria: b.getAttribute("aria-label") }
  }, undefined, { timeout: 2000 }).catch(() => null)
}
/** Pill status of `childId` in the root panel's header; opens the count popover when the bar is collapsed. */
async function pillStatus(rootId, childId) {
  const info = await pillInfo(rootId)
  return info?.pills?.find((p) => p.id === childId)?.status ?? null
}

try {
  if (MODEL.mode !== "mock") {
    for (const id of CASES) run.record(id, "NOT RUN", { reason: "needs the scripted mock model (OCO_E2E_MODEL=mock): NESTED-L1-* dispatches the nested subagents" })
    throw new Error("not a mock server")
  }
  // Built-in subagents deny `task`; this one may dispatch again, which is what makes a grandchild possible.
  fs.mkdirSync(path.dirname(AGENT_FILE), { recursive: true })
  fs.writeFileSync(AGENT_FILE, "---\ndescription: Nested subagent (c25 test)\nmode: subagent\npermission:\n  task: allow\n---\nYou are a nested subagent.\n")
  // The default subagent depth is 1 (a child may not dispatch); allow root -> child -> grandchild.
  fs.writeFileSync(path.join(path.dirname(AGENT_FILE), "..", "opencode.json"), JSON.stringify({ subagent_depth: 2 }) + "\n")
  await api("POST", "/instance/dispose").catch(() => {})
  for (const p of (await api("GET", "/permission")) ?? []) await api("POST", `/permission/${p.id}/reply`, { reply: "reject" }).catch(() => {})
  const launched = await launch({ profile: "c25-nested-subagents", run })
  app = launched.app
  page = launched.page
  run.installCrashHandlers(async () => {
    for (const id of created) await api("POST", `/session/${id}/abort`).catch(() => {})
    await app?.close().catch(() => {})
  })
  const rand = Math.random().toString(36).slice(2, 7)
  const rootTitle = `c25-root-${rand}`
  const rootId = await createAndOpenSession(page, { title: rootTitle })
  created.push(rootId)
  await command(page, "Focus on Sessions View")
  await clearNotifications(page)
  if (!(await waitUntil(async () => !!(await sessionsFrame(page)), 30000, 300))) throw new Error("Sessions sidebar frame not found")
  await (await sessionRow(page, rootTitle)).waitFor({ state: "visible", timeout: 30000 })
  await prompt(rootId, "NESTED-L1-SLOW")

  // ---- tree-depth
  let childId = null, grandId = null
  try {
    await waitUntil(async () => ((childId = (await children(rootId))[0]?.id ?? null), childId), 40000, 200)
    await waitUntil(async () => ((grandId = childId ? ((await children(childId))[0]?.id ?? null) : null), grandId), 40000, 200)
    const grandKids = grandId ? await children(grandId) : []
    rec("tree-depth", !!childId && !!grandId && grandKids.length === 0, { rootId, childId, grandId })
  } catch (e) {
    rec("tree-depth", false, { error: errMsg(e), childId, grandId })
  }

  // ---- sidebar-running
  try {
    let seen = null
    await waitUntil(async () => {
      const b = await badgeInfo(rootTitle)
      return b?.visible && b.running ? (seen = b) : null
    }, 30000, 150)
    const gst = (await api("GET", "/session/status"))?.[grandId]?.type ?? null
    await runShot(page, run, "1-badge-running")
    rec("sidebar-running", !!seen && /running/.test(seen.aria ?? ""), { badge: seen, grandStatus: gst })
  } catch (e) {
    rec("sidebar-running", false, { error: errMsg(e), badge: await badgeInfo(rootTitle) })
  }

  // ---- pills-running
  try {
    let st = null
    await waitUntil(async () => ((st = await pillStatus(rootId, childId)), st === "running" ? st : null), 20000, 200)
    rec("pills-running", st === "running", { childId, status: st, info: await pillInfo(rootId) })
  } catch (e) {
    rec("pills-running", false, { error: errMsg(e), info: await pillInfo(rootId) })
  }

  // ---- runtime-nested
  try {
    const f = await frameWithSession(rootId)
    if (!f) throw new Error("root frame not found")
    await f.locator('[data-oco-view="runtime"]').first().click({ timeout: 10000 })
    await f.locator("[data-oco-runtime]").first().waitFor({ state: "attached", timeout: 15000 })
    const rootCells = f.locator("[data-oco-runtime-sub-cell]")
    await rootCells.first().waitFor({ state: "attached", timeout: 20000 })
    const nRoot = await rootCells.count()
    await rootCells.first().click({ force: true })
    const open1 = f.locator("[data-oco-runtime-handoff-open]")
    await open1.waitFor({ state: "visible", timeout: 15000 })
    await open1.click()
    await f.locator("[data-oco-runtime-child]").waitFor({ state: "visible", timeout: 15000 })
    const crumb1 = await f.locator("[data-oco-runtime-crumb]").first().innerText().catch(() => "")
    const childCells = f.locator("[data-oco-runtime-child] [data-oco-runtime-sub-cell], [data-oco-runtime-sub-cell]")
    await childCells.first().waitFor({ state: "attached", timeout: 20000 })
    const nChild = await childCells.count()
    await childCells.last().click({ force: true })
    const open2 = f.locator("[data-oco-runtime-handoff-open]")
    await open2.waitFor({ state: "visible", timeout: 15000 })
    await open2.click()
    await waitUntil(async () => ((await f.locator("[data-oco-runtime-crumb]").first().innerText().catch(() => "")).length > crumb1.length ? true : null), 10000, 200)
    const crumb2 = await f.locator("[data-oco-runtime-crumb]").first().innerText().catch(() => "")
    await runShot(page, run, "2-runtime-grandchild")
    const bc = f.locator("[data-oco-runtime-crumb] button")
    for (let i = 0; i < 3 && (await bc.count()) > 0; i++) { await bc.first().click().catch(() => {}); await page.waitForTimeout(400) }
    const back = await f.locator("[data-oco-runtime-crumb]").waitFor({ state: "detached", timeout: 8000 }).then(() => true, () => false)
    await f.locator('[data-oco-view="chat"]').first().click({ timeout: 5000 }).catch(() => {}) // the header pills live in the chat view
    rec("runtime-nested", nRoot >= 1 && nChild >= 1 && crumb2.length > crumb1.length && back, { nRoot, nChild, crumb1, crumb2, back })
  } catch (e) {
    const f = await frameWithSession(rootId)
    const dom = f ? await f.evaluate(() => [...new Set([...document.querySelectorAll("*")].flatMap((n) => n.getAttributeNames()).filter((a) => a.startsWith("data-oco-runtime")))].slice(0, 40)).catch(() => null) : null
    rec("runtime-nested", false, { error: errMsg(e), dom })
  }

  // ---- settled
  try {
    await waitUntil(async () => (Object.values((await api("GET", "/session/status")) ?? {}).every((v) => v?.type !== "busy" && v?.type !== "retry") ? true : null), 60000, 300)
    let b = null, st = null
    await waitUntil(async () => ((b = await badgeInfo(rootTitle)), (st = await pillStatus(rootId, childId)), b?.visible && !b.running && !b.attention && st === "done" ? true : null), 20000, 200)
    await runShot(page, run, "3-settled")
    rec("settled", !!b && !b.running && !b.attention && st === "done", { badge: b, pill: st })
  } catch (e) {
    rec("settled", false, { error: errMsg(e), badge: await badgeInfo(rootTitle), pill: await pillStatus(rootId, childId) })
  }

  // ---- perm-attention
  try {
    const permTitle = `c25-perm-${rand}`
    const permRoot = { id: await createAndOpenSession(page, { title: permTitle, newPanel: true }) }
    created.push(permRoot.id)
    await command(page, "Focus on Sessions View")
    await (await sessionRow(page, permTitle)).waitFor({ state: "visible", timeout: 30000 })
    await prompt(permRoot.id, "NESTED-L1-PERM")
    let req = null
    await waitUntil(async () => ((req = ((await api("GET", "/permission")) ?? []).find((p) => p.sessionID !== permRoot.id && p.sessionID !== rootId) ?? null), req), 60000, 250)
    const permChild = (await children(permRoot.id))[0]?.id ?? null
    const permGrand = permChild ? ((await children(permChild))[0]?.id ?? null) : null
    let badge = null
    await waitUntil(async () => ((badge = await badgeInfo(permTitle)), badge?.visible && badge.attention ? true : null), 20000, 200)
    const status = (await api("GET", "/session/status"))?.[permGrand]?.type ?? null
    const childStatus = (await api("GET", "/session/status"))?.[permChild]?.type ?? null
    await runShot(page, run, "4-perm-attention")
    const pill = await pillStatus(permRoot.id, permChild)
    const atGrand = req?.sessionID === permGrand
    if (req) await api("POST", `/permission/${req.id}/reply`, { reply: "reject" }).catch(() => {})
    let after = null
    await waitUntil(async () => ((after = await badgeInfo(permTitle)), !after || !after.attention ? true : null), 20000, 200)
    rec("perm-attention", atGrand && !!badge?.attention && !after?.attention, { permissionSession: req?.sessionID, permGrand, atGrand, badge, pill, grandStatus: status, childStatus, after })
  } catch (e) {
    rec("perm-attention", false, { error: errMsg(e) })
  }
} catch (e) {
  if (!String(e?.message).includes("not a mock server")) {
    run.record("run", "FAIL", { error: errMsg(e) })
    if (page) await runShot(page, run, "error").catch(() => {})
  }
} finally {
  for (const id of created) await api("POST", `/session/${id}/abort`).catch(() => {})
  fs.rmSync(path.dirname(AGENT_FILE), { recursive: true, force: true })
  await api("POST", "/instance/dispose").catch(() => {})
  if (app) await app.close().catch(() => {})
  process.exit(run.finish())
}
