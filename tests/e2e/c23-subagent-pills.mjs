#!/usr/bin/env node
// E2E c23-subagent-pills: the parent session's header (data-oco-session-header) shows subagent pills; clicking one opens the child.
// Mock model only: WITH-SLOW-SIBLING makes the parent dispatch one slow subagent.
// Cases: pills-visible (pill or count trigger in the header, child listed with status), pill-open-child (click -> child session opens)
import { fileURLToPath } from "node:url"
import { createRun } from "./lib/results.mjs"
import { launch, command, waitUntil, runShot, clearNotifications, createAndOpenSession, chatFrames, frameSession } from "./vscode.mjs"
import { api, MODEL } from "./server.mjs"

const run = createRun({ suite: "c23-subagent-pills", required: ["pills-visible", "pill-open-child"], scriptPath: fileURLToPath(import.meta.url) })
const health = await api("GET", "/global/health").catch(() => null)
run.setEnv({ serverVersion: health?.version ?? null, modelMode: MODEL.mode })
const errMsg = (e) => String(e?.message ?? e).slice(0, 400)
const MODEL_REF = { providerID: MODEL.providerID, modelID: MODEL.modelID }
const PROMPT = "Use the read tool on math.ts with offset 1 and limit 2 WITH-SLOW-SIBLING"
const rec = (id, ok, detail) => run.record(id, ok ? "PASS" : "FAIL", detail)
let app = null, page = null
const created = []

async function frameWithSession(id) {
  for (const f of await chatFrames(page)) if ((await frameSession(f).catch(() => null)) === id) return f
  return null
}
/** Pill state inside the parent frame's header. */
async function pillInfo(id) {
  const f = await frameWithSession(id)
  if (!f) return null
  return f.evaluate(() => {
    const header = document.querySelector("[data-oco-session-header]")
    const bar = header?.querySelector("[data-oco-child-pills]")
    if (!bar) return { header: !!header, bar: false }
    const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 }
    const pills = [...bar.querySelectorAll("button[data-oco-child-pill]")].filter(vis)
    return {
      header: true, bar: true, mode: bar.getAttribute("data-oco-child-pills-mode"),
      count: bar.querySelector("[data-oco-child-pills-count]")?.textContent?.trim() ?? null,
      pills: pills.map((p) => ({ id: p.getAttribute("data-oco-child-pill"), status: p.getAttribute("data-oco-child-status"), title: p.getAttribute("title") })),
    }
  }).catch(() => null)
}

try {
  if (MODEL.mode !== "mock") {
    for (const id of ["pills-visible", "pill-open-child"]) run.record(id, "NOT RUN", { reason: "needs OCO_E2E_MODEL=mock" })
    throw new Error("not a mock server")
  }
  const launched = await launch({ profile: "c23-subagent-pills", run })
  app = launched.app
  page = launched.page
  run.installCrashHandlers(async () => {
    for (const id of created) await api("POST", `/session/${id}/abort`).catch(() => {})
    await app?.close().catch(() => {})
  })
  const rand = Math.random().toString(36).slice(2, 7)
  const parentId = await createAndOpenSession(page, { title: `c23-parent-${rand}` })
  created.push(parentId)
  await clearNotifications(page)
  await api("POST", `/session/${parentId}/prompt_async`, { model: MODEL_REF, parts: [{ type: "text", text: PROMPT }] })

  let childId = null
  try {
    await waitUntil(async () => (childId = ((await api("GET", `/session/${parentId}/children`).catch(() => [])) ?? [])[0]?.id ?? null), 30000, 200)
    let info = null
    await waitUntil(async () => {
      info = await pillInfo(parentId)
      return info?.bar && (info.pills.some((p) => p.id === childId) || info.count) ? info : null
    }, 30000, 200)
    await runShot(page, run, "1-pills")
    rec("pills-visible", !!childId && !!info?.bar && (info.mode === "pills" ? info.pills.some((p) => p.id === childId) : /\d+\/\d+/.test(info.count ?? "")), { childId, info })
  } catch (e) {
    rec("pills-visible", false, { error: errMsg(e), childId, info: await pillInfo(parentId) })
  }

  try {
    const f = await frameWithSession(parentId)
    if (!f) throw new Error("parent frame not found")
    const info = await pillInfo(parentId)
    if (info?.mode === "count") await f.locator("[data-oco-child-pills-count]").click({ timeout: 5000 })
    const target = f.locator(`[data-oco-child-pill="${childId}"]`).first()
    await target.waitFor({ state: "visible", timeout: 8000 })
    await target.click({ timeout: 5000 })
    let by = null
    await waitUntil(async () => {
      if (await frameWithSession(childId)) return (by = "panel")
      return null
    }, 20000, 300)
    await runShot(page, run, "2-child-opened")
    rec("pill-open-child", !!by, { childId, openedBy: by, mode: info?.mode })
  } catch (e) {
    rec("pill-open-child", false, { error: errMsg(e) })
  }
} catch (e) {
  if (!String(e?.message).includes("not a mock server")) {
    run.record("run", "FAIL", { error: errMsg(e) })
    if (page) await runShot(page, run, "error").catch(() => {})
  }
} finally {
  for (const id of created) await api("POST", `/session/${id}/abort`).catch(() => {})
  if (app) await app.close().catch(() => {})
  process.exit(run.finish())
}
