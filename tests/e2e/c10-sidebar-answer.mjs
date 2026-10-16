#!/usr/bin/env node
// E2E c10-sidebar-answer: M11 — answer a question in place from the sidebar inbox (no session panel).
import { fileURLToPath } from "node:url"
import { createRun, recordNotApplicable } from "./lib/results.mjs"
import { launch, command, waitUntil, chatFrames, sleep, runShot, hostState, clearNotifications } from "./vscode.mjs"
import { api, MODEL } from "./server.mjs"
import { sessionsFrame } from "./lib/sessions-web.mjs"

const REQUIRED = ["question-row", "form-open", "answer-sent", "inbox-cleared"]
const REAL = MODEL.mode === "real"
const run = createRun({ suite: "c10-sidebar-answer", required: REQUIRED, scriptPath: fileURLToPath(import.meta.url) })
const health = await api("GET", "/global/health").catch(() => null)
run.setEnv({ serverVersion: health?.version ?? null, modelMode: MODEL.mode })

let app = null
let page = null
let stateFile = null
const createdSessions = []

const pending = async () => (await api("GET", "/question").catch(() => null)) ?? []

async function round(frame, label, promptText, answerFn) {
  const rand = Math.random().toString(36).slice(2, 7)
  const s = await api("POST", "/session", { title: `c10-${label}-${rand}` })
  if (!s?.id) throw new Error("session create failed")
  createdSessions.push(s.id)
  await api("POST", `/session/${s.id}/prompt_async`, {
    model: { providerID: MODEL.providerID, modelID: MODEL.modelID },
    parts: [{ type: "text", text: promptText }],
  })
  const inbox = frame.locator('section[data-group="inbox"]')
  const row = inbox.locator(`.row[data-kind="question"][data-session-id="${s.id}"]`)
  let q = null
  await waitUntil(async () => ((q = (await pending()).find((x) => x.sessionID === s.id)), !!q), REAL ? 180000 : 60000, 400)
  if (!q && REAL) {
    await api("POST", `/session/${s.id}/abort`).catch(() => {})
    for (const item of (await pending().catch(() => []))) {
      if (item.sessionID === s.id) await api("POST", `/question/${item.id}/reject`).catch(() => {})
    }
    return { sessionId: s.id, noQuestion: true }
  }
  const rowVisible = await waitUntil(async () => (await row.count()) > 0, 20000, 200).then(() => true, () => false)
  const ids = {}
  ids.rowVisible = rowVisible
  ids.hasAnswerBtn = (await row.locator("button", { hasText: /answer/i }).count()) > 0
  await runShot(page, run, `${label}-1-row`)
  await row.locator("button", { hasText: /answer/i }).first().click()
  const form = row.locator("[data-question-form]")
  ids.formOpen = await form.waitFor({ state: "visible", timeout: 10000 }).then(() => true, () => false)
  ids.options = await form.locator("[data-question-option]").evaluateAll((els) => els.map((e) => e.dataset.questionOption)).catch(() => [])
  await runShot(page, run, `${label}-2-form`)
  await answerFn(form)
  ids.sent = await waitUntil(async () => (await pending()).every((x) => x.sessionID !== s.id), 20000, 300).then(() => true, () => false)
  ids.rowGone = await waitUntil(async () => (await row.count()) === 0, 15000, 200).then(() => true, () => false)
  await runShot(page, run, `${label}-3-after`)
  return { sessionId: s.id, ...ids }
}

try {
  for (const p of (await api("GET", "/permission")) ?? []) await api("POST", `/permission/${p.id}/reply`, { reply: "reject" }).catch(() => {})
  for (const q of await pending()) await api("POST", `/question/${q.id}/reject`).catch(() => {})

  const launched = await launch({ profile: "c10-sidebar-answer", run })
  app = launched.app
  page = launched.page
  stateFile = launched.stateFile
  run.installCrashHandlers(() => app?.close())

  await command(page, "Focus on Sessions View")
  await clearNotifications(page)
  let frame = null
  await waitUntil(async () => ((frame = await sessionsFrame(page)), !!frame), 30000, 300)
  if (!frame) throw new Error("Sessions sidebar frame not found")
  const noPanels = (await chatFrames(page)).length === 0

  // single-select
  const singlePrompt = REAL
    ? "Use the question tool (not plain text) to ask which color I prefer, with exactly two options: red and blue."
    : "Use the question tool to ask me which color I prefer."
  const single = await round(frame, "single", singlePrompt, async (form) => {
    if (REAL) {
      const blueOpt = form.locator('[data-question-option]', { hasText: /blue/i }).first()
      if ((await blueOpt.count()) > 0) {
        await blueOpt.click()
      } else {
        await form.locator("[data-question-option]").first().click()
      }
    } else {
      await form.locator('[data-question-option="blue"]').click()
    }
    const submit = form.locator("[data-question-submit]")
    if (await submit.count()) await submit.click().catch(() => {})
  })

  if (single.noQuestion) {
    const noQuestionReason = "real model did not call the question tool within 180 s, so there is no question row to answer"
    for (const id of ["question-row", "form-open", "answer-sent", "inbox-cleared"]) {
      recordNotApplicable(run, REQUIRED, id, noQuestionReason, { sessionId: single.sessionId })
    }
    for (const id of ["multi-answer", "custom-answer"]) {
      recordNotApplicable(run, REQUIRED, id, noQuestionReason, { sessionId: single.sessionId })
    }
  } else {
    run.record("question-row", single.rowVisible && single.hasAnswerBtn ? "PASS" : "FAIL", { ...single, noPanels })
    const formOpenPass = REAL
      ? single.formOpen && single.options.length >= 2
      : single.formOpen && single.options.includes("red") && single.options.includes("blue")
    run.record("form-open", formOpenPass ? "PASS" : "FAIL", { options: single.options })
    run.record("answer-sent", single.sent ? "PASS" : "FAIL", { sent: single.sent })
    const noPanelsAfter = (await chatFrames(page)).length === 0

    let bellZero = null
    const st = stateFile ? await hostState(page, stateFile).catch(() => null) : null
    if (st?.sidebar) bellZero = (st.sidebar.waiting ?? 0) === 0
    run.record("inbox-cleared", single.rowGone && single.sent && (bellZero ?? true) ? "PASS" : "FAIL", { rowGone: single.rowGone, bellZero, noPanelsAfter })
    if (bellZero === null) run.record("bell-count-zero", "NOT RUN", { reason: "no sidebar host state" })

    if (REAL) {
      const skippedReason = 'real model: the mock tokens "question multi" / "question custom" select scripted question shapes (red/green options, free text); a real model words its own question'
      recordNotApplicable(run, REQUIRED, "multi-answer", skippedReason, { sessionId: single.sessionId })
      recordNotApplicable(run, REQUIRED, "custom-answer", skippedReason, { sessionId: single.sessionId })
    } else {
      // multi-select
      try {
        const multi = await round(frame, "multi", "Use the question multi tool to ask me which colors I like.", async (form) => {
          await form.locator('[data-question-option="red"]').click()
          await form.locator('[data-question-option="green"]').click()
          await form.locator("[data-question-submit]").click()
        })
        run.record("multi-answer", multi.formOpen && multi.sent && multi.rowGone ? "PASS" : "FAIL", multi)
      } catch (e) {
        run.record("multi-answer", "FAIL", { error: String(e?.message ?? e).slice(0, 300) })
      }

      // custom text
      try {
        const custom = await round(frame, "custom", "Use the question custom tool to ask me for a color.", async (form) => {
          // Product defect probe: the server omits `custom` from GET /question, and the sidebar then hides the input.
          if (!(await form.locator("[data-question-input]").waitFor({ state: "visible", timeout: 3000 }).then(() => true, () => false)))
            throw new Error("custom text input [data-question-input] not rendered for a question without explicit custom flag")
          await form.locator("[data-question-input]").fill("purple-custom")
          await form.locator("[data-question-submit]").click()
        })
        run.record("custom-answer", custom.formOpen && custom.sent && custom.rowGone ? "PASS" : "FAIL", custom)
      } catch (e) {
        run.record("custom-answer", "FAIL", { error: String(e?.message ?? e).slice(0, 300) })
      }
    }
  }
} catch (e) {
  run.record("run", "FAIL", { error: String(e?.message ?? e).slice(0, 500) })
  if (page) await runShot(page, run, "error").catch(() => {})
} finally {
  if (REAL) {
    for (const sid of createdSessions) {
      await api("POST", `/session/${sid}/abort`).catch(() => {})
      for (const item of (await pending().catch(() => []))) {
        if (item.sessionID === sid) await api("POST", `/question/${item.id}/reject`).catch(() => {})
      }
    }
  }
  if (app) await app.close().catch(() => {})
  process.exit(run.finish())
}
