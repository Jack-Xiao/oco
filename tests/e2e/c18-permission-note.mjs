#!/usr/bin/env node
// E2E c18-permission-note: sidebar inbox permission row — Always button preview text, and "Deny with note…".
//   always-preview   the inbox row shows "Always will allow: <patterns>" matching the server's permission.always, Always button title lists them.
//   deny-note        "Deny with note…" opens a textarea; Enter sends reject + message: GET /permission empties and the server
//                    received the note (it surfaces in the session's tool error / messages).
import { fileURLToPath } from "node:url"
import { createRun, recordNotApplicable } from "./lib/results.mjs"
import { launch, command, waitUntil, runShot, clearNotifications } from "./vscode.mjs"
import { api, MODEL, messages } from "./server.mjs"
import { sessionsFrame } from "./lib/sessions-web.mjs"

const REQUIRED = ["always-preview", "deny-note"]
const run = createRun({ suite: "c18-permission-note", required: REQUIRED, scriptPath: fileURLToPath(import.meta.url) })
const health = await api("GET", "/global/health").catch(() => null)
run.setEnv({ serverVersion: health?.version ?? null, modelMode: MODEL.mode })
const errMsg = (e) => String(e?.message ?? e).slice(0, 400)
let app = null
let page = null
const created = []

try {
  if (MODEL.mode !== "mock") {
    for (const id of ["always-preview", "deny-note"]) run.record(id, "NOT RUN", { reason: "needs the scripted mock model" })
    throw new Error("not a mock server")
  }
  for (const p of (await api("GET", "/permission")) ?? []) await api("POST", `/permission/${p.id}/reply`, { reply: "reject" }).catch(() => {})
  const launched = await launch({ profile: "c18-permission-note", run })
  app = launched.app
  page = launched.page
  run.installCrashHandlers(async () => {
    for (const id of created) await api("POST", `/session/${id}/abort`).catch(() => {})
    await app?.close().catch(() => {})
  })
  await command(page, "Focus on Sessions View")
  await clearNotifications(page)
  if (!(await waitUntil(async () => !!(await sessionsFrame(page)), 30000, 300))) throw new Error("Sessions sidebar frame not found")
  const frame = await sessionsFrame(page)

  const rand = Math.random().toString(36).slice(2, 7)
  const s = await api("POST", "/session", { title: `c18-perm-${rand}` })
  if (!s?.id) throw new Error("session create failed")
  created.push(s.id)
  await api("POST", `/session/${s.id}/prompt_async`, {
    model: { providerID: MODEL.providerID, modelID: MODEL.modelID },
    parts: [{ type: "text", text: `Use the bash tool to run exactly: echo c18-${rand}` }],
  })
  const pending = async () => ((await api("GET", "/permission")) ?? []).filter((p) => p.sessionID === s.id)
  let req = null
  await waitUntil(async () => ((req = (await pending())[0]), !!req), 60000, 250)
  if (!req) throw new Error("no permission request within 60s")
  const row = frame.locator(`section[data-group="inbox"] .row[data-kind="permission"][data-session-id="${s.id}"]`)
  const rowShown = !!(await waitUntil(async () => ((await row.count()) > 0 ? true : null), 20000, 200))

  // ---- always-preview
  try {
    const preview = row.locator(".inbox-always-preview")
    const shown = !!(await waitUntil(async () => ((await preview.count()) > 0 ? true : null), 10000, 200))
    const text = shown ? (await preview.innerText()).replace(/\s+/g, " ").trim() : null
    const codes = shown ? await preview.locator("code").allInnerTexts() : []
    const btnTitle = await row.locator('button[data-reply="always"]').getAttribute("title").catch(() => null)
    const serverAlways = req.always ?? []
    await runShot(page, run, "1-always-preview")
    if (serverAlways.length === 0) {
      recordNotApplicable(run, REQUIRED, "always-preview", "server permission carries no `always` patterns; nothing to preview", { rowShown, text, btnTitle })
    } else {
      const expected = serverAlways.slice(0, 3)
      const ok = rowShown && text?.startsWith("Always will allow:") && expected.every((p, i) => codes[i] === p) && (btnTitle ?? "") === serverAlways.join(", ")
      run.record("always-preview", ok ? "PASS" : "FAIL", { rowShown, text, codes, serverAlways, btnTitle })
    }
  } catch (e) {
    run.record("always-preview", "FAIL", { error: errMsg(e) })
  }

  // ---- deny-note
  try {
    const note = `c18 note ${rand}: not allowed here`
    await row.locator('button[data-action="denyWithNote"]').click({ timeout: 5000 })
    const ta = row.locator(".deny-note-input")
    const formOpen = await ta.waitFor({ state: "visible", timeout: 5000 }).then(() => true, () => false)
    await ta.fill(note)
    await runShot(page, run, "2-deny-note-form")
    await ta.press("Enter")
    const emptied = !!(await waitUntil(async () => ((await pending()).length === 0 ? true : null), 15000, 200))
    const rowGone = !!(await waitUntil(async () => ((await row.count()) === 0 ? true : null), 15000, 200))
    // The note reaches the session as the rejected tool call's feedback.
    let found = null
    await waitUntil(async () => {
      const blob = JSON.stringify(await messages(s.id).catch(() => []))
      found = blob.includes(note) ? true : null
      return found
    }, 20000, 400)
    const serverGotNote = !!found
    await runShot(page, run, "3-after-deny")
    run.record("deny-note", formOpen && emptied && rowGone && serverGotNote ? "PASS" : "FAIL", { formOpen, emptied, rowGone, serverGotNote, note })
  } catch (e) {
    run.record("deny-note", "FAIL", { error: errMsg(e) })
  }
} catch (e) {
  if (!String(e?.message).includes("not a mock server")) {
    run.record("run", "FAIL", { error: errMsg(e) })
    if (page) await runShot(page, run, "error").catch(() => {})
  }
} finally {
  for (const p of (await api("GET", "/permission").catch(() => [])) ?? []) if (created.includes(p.sessionID)) await api("POST", `/permission/${p.id}/reply`, { reply: "reject" }).catch(() => {})
  for (const id of created) await api("POST", `/session/${id}/abort`).catch(() => {})
  await app?.close().catch(() => {})
  run.finish?.()
}
