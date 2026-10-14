#!/usr/bin/env node
// E2E c20-inbox-nav: oco.inbox.next QuickPick + Enter opens the session; sidebar j/k/Enter/? keyboard.
import { fileURLToPath } from "node:url"
import { createRun } from "./lib/results.mjs"
import { launch, command, waitUntil, sleep, chatFrames, frameSession, runShot, clearNotifications } from "./vscode.mjs"
import { api, MODEL } from "./server.mjs"
import { sessionsFrame } from "./lib/sessions-web.mjs"

const REQUIRED = ["inbox-quickpick-opens", "inbox-enter-opens-session", "sidebar-jk", "sidebar-enter-opens", "sidebar-help"]
const run = createRun({ suite: "c20-inbox-nav", required: REQUIRED, scriptPath: fileURLToPath(import.meta.url) })
const health = await api("GET", "/global/health").catch(() => null)
run.setEnv({ serverVersion: health?.version ?? null, modelMode: MODEL.mode })

let app = null
let page = null
const rand = Math.random().toString(36).slice(2, 7)
const pending = async () => (await api("GET", "/question").catch(() => null)) ?? []
const shows = async (id) => {
  for (const f of await chatFrames(page)) if ((await frameSession(f).catch(() => null)) === id) return true
  return false
}

try {
  for (const p of (await api("GET", "/permission")) ?? []) await api("POST", `/permission/${p.id}/reply`, { reply: "reject" }).catch(() => {})
  for (const q of await pending()) await api("POST", `/question/${q.id}/reject`).catch(() => {})

  const launched = await launch({ profile: "c20-inbox-nav", run })
  app = launched.app
  page = launched.page
  run.installCrashHandlers(() => app?.close())

  await command(page, "Focus on Sessions View")
  await clearNotifications(page)
  let frame = null
  await waitUntil(async () => ((frame = await sessionsFrame(page)), !!frame), 30000, 300)
  if (!frame) throw new Error("Sessions sidebar frame not found")

  // --- Inbox QuickPick: a session with a pending question
  const qs = await api("POST", "/session", { title: `c20-q-${rand}` })
  await api("POST", `/session/${qs.id}/prompt_async`, {
    model: { providerID: MODEL.providerID, modelID: MODEL.modelID },
    parts: [{ type: "text", text: "Use the question tool to ask me which color I prefer." }],
  })
  await waitUntil(async () => (await pending()).some((x) => x.sessionID === qs.id), 60000, 400)
  await waitUntil(async () => (await frame.locator(`.row[data-kind="question"][data-session-id="${qs.id}"]`).count()) > 0, 20000, 200)
  const before = await shows(qs.id)

  await command(page, "oco: Inbox: Next Action")
  const qp = page.locator(".quick-input-widget")
  const opened = await waitUntil(
    async () => (await qp.locator(".monaco-list-row").filter({ hasText: `c20-q-${rand}` }).count()) > 0,
    10000, 200,
  ).then((v) => !!v)
  const title = await qp.locator(".quick-input-title").innerText().catch(() => "")
  await runShot(page, run, "1-quickpick")
  run.record("inbox-quickpick-opens", opened ? "PASS" : "FAIL", { opened, title, alreadyShown: before })
  if (opened) {
    // focus the item (first row of our session) then Enter
    const row = qp.locator(".monaco-list-row").filter({ hasText: `c20-q-${rand}` }).first()
    await row.hover().catch(() => {})
    const focused = await row.evaluate((e) => e.classList.contains("focused")).catch(() => false)
    if (!focused) await row.click({ trial: false }).catch(() => {})
    else await page.keyboard.press("Enter")
    const ok = await waitUntil(() => shows(qs.id), 20000, 300).then((v) => !!v)
    await runShot(page, run, "2-opened")
    run.record("inbox-enter-opens-session", ok ? "PASS" : "FAIL", { sessionId: qs.id, focusedBeforeEnter: focused })
  } else run.record("inbox-enter-opens-session", "FAIL", { reason: "quickpick not shown" })
  await page.keyboard.press("Escape").catch(() => {})
  for (const q of await pending()) await api("POST", `/question/${q.id}/reject`).catch(() => {})

  // --- Sidebar keyboard
  const targets = []
  for (const n of ["a", "b"]) targets.push(await api("POST", "/session", { title: `c20-${n}-${rand}` }))
  await command(page, "Focus on Sessions View")
  await waitUntil(async () => (await frame.locator('.row[data-kind="session"]').count()) >= 2, 20000, 200)
  const rows = frame.locator('.row[data-kind="session"]')
  await sleep(1500) // let the sidebar settle (late list refreshes can steal focus)
  await rows.first().focus()
  const idx = () => frame.evaluate(() => {
    const all = Array.from(document.querySelectorAll(".section-head, .row, .more-head, .inbox-group-head, .subagent-row"))
    return all.indexOf(document.activeElement)
  })
  const i0 = await idx()
  await page.keyboard.press("j")
  await sleep(250)
  const i1 = await idx()
  await page.keyboard.press("j")
  await sleep(250)
  const i2 = await idx()
  await page.keyboard.press("k")
  await sleep(250)
  const i3 = await idx()
  run.record("sidebar-jk", i0 >= 0 && i1 === i0 + 1 && i2 === i0 + 2 && i3 === i1 ? "PASS" : "FAIL", { i0, i1, i2, i3, act: await frame.evaluate(() => { const a = document.activeElement; return a ? a.tagName + "." + a.className + "|" + (a.dataset?.kind ?? "") + "|" + document.hasFocus() : null }) })

  // Enter on a session row opens it
  const tgt = frame.locator(`.row[data-kind="session"]`).filter({ has: frame.locator(".title", { hasText: `c20-a-${rand}` }) }).first()
  await tgt.focus()
  const focusedOk = await tgt.evaluate((e) => document.activeElement === e).catch(() => false)
  await page.keyboard.press("Enter")
  const opened2 = await waitUntil(() => shows(targets[0].id), 20000, 300).then((v) => !!v)
  run.record("sidebar-enter-opens", opened2 ? "PASS" : "FAIL", { focusedOk, sessionId: targets[0].id })

  // ? help
  await command(page, "Focus on Sessions View")
  frame = await sessionsFrame(page)
  const tgt2 = frame.locator(`.row[data-kind="session"]`).filter({ has: frame.locator(".title", { hasText: `c20-a-${rand}` }) }).first()
  await tgt2.focus().catch(() => {})
  const focusedHelp = await frame.evaluate(() => document.activeElement?.className).catch(() => null)
  await sleep(600)
  await page.keyboard.type("?")
  const helpVisible = await waitUntil(
    () => frame.evaluate(() => { const m = document.querySelector(".shortcuts-modal"); return !!m && !m.hidden }),
    5000, 150,
  ).then((v) => !!v)
  const text = helpVisible ? await frame.locator(".shortcuts-modal").innerText().catch(() => "") : ""
  await runShot(page, run, "3-help")
  run.record("sidebar-help", helpVisible && /Next item/.test(text) && /Open item/.test(text) ? "PASS" : "FAIL", { focusedHelp, helpVisible, text: text.slice(0, 200) })
} catch (e) {
  run.record("run", "FAIL", { error: String(e?.message ?? e).slice(0, 500) })
  if (page) await runShot(page, run, "error").catch(() => {})
} finally {
  if (app) await app.close().catch(() => {})
  process.exit(run.finish())
}
