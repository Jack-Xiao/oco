#!/usr/bin/env node
// E2E c24-runtime-question: runtime view centre card answers a single-choice agent question in place (patch 0025);
// afterwards GET /question is empty.
import { fileURLToPath } from "node:url"
import { createRun } from "./lib/results.mjs"
import { launch, waitUntil, chatFrames, frameSession, runShot, createAndOpenSession } from "./vscode.mjs"
import { api, MODEL } from "./server.mjs"

const REQUIRED = ["ask-card", "option-click", "question-cleared"]
const run = createRun({ suite: "c24-runtime-question", required: REQUIRED, scriptPath: fileURLToPath(import.meta.url) })
const health = await api("GET", "/global/health").catch(() => null)
run.setEnv({ serverVersion: health?.version ?? null, modelMode: MODEL.mode })

let app = null
let page = null
const pending = async () => (await api("GET", "/question").catch(() => null)) ?? []

try {
  for (const q of await pending()) await api("POST", `/question/${q.id}/reject`).catch(() => {})
  const launched = await launch({ profile: "c24-runtime-question", run })
  app = launched.app
  page = launched.page
  run.installCrashHandlers(() => app?.close())

  await createAndOpenSession(page)
  let sid = null
  await waitUntil(async () => {
    for (const f of await chatFrames(page)) sid = (await frameSession(f).catch(() => null)) ?? sid
    return !!sid
  }, 60000, 200)
  let fr = null
  await waitUntil(async () => {
    for (const f of await chatFrames(page)) {
      if (await f.evaluate((id) => window.__OCO_DEBUG__?.sessionId?.() === id && !!document.querySelector('[data-component="prompt-input"]'), sid).catch(() => false)) fr = f
    }
    return !!fr
  }, 60000, 200)
  if (!fr) throw new Error("chat frame not found")
  await waitUntil(async () => (await fr.evaluate(() => document.documentElement.dataset.ocoModel)) === "ready", 60000, 100)

  await fr.locator('[data-oco-view="runtime"]').first().click()
  await fr.locator("[data-oco-runtime]").waitFor({ state: "visible", timeout: 10000 })

  await api("POST", `/session/${sid}/prompt_async`, {
    model: { providerID: MODEL.providerID, modelID: MODEL.modelID },
    parts: [{ type: "text", text: "Use the question tool to ask me which color I prefer." }],
  })
  let q = null
  await waitUntil(async () => ((q = (await pending()).find((x) => x.sessionID === sid)), !!q), 60000, 300)
  const kindOf = () => fr.locator("[data-oco-runtime-card]").first().getAttribute("data-oco-runtime-card-kind").catch(() => null)
  const askUp = !!(await waitUntil(async () => (await kindOf()) === "ask", 15000, 150))
  const optLoc = fr.locator("button[data-oco-runtime-ask-option]")
  const nOpts = await waitUntil(async () => (await optLoc.count()) >= 2, 10000, 150).then(() => optLoc.count(), () => 0)
  await runShot(page, run, "1-ask-card")
  const optTexts = await optLoc.allInnerTexts().catch(() => [])
  run.record("ask-card", q && askUp && nOpts >= 2 ? "PASS" : "FAIL", { pending: !!q, askUp, nOpts, optTexts })

  let clicked = false
  if (nOpts >= 1) {
    const blue = optLoc.filter({ hasText: /blue/i }).first()
    const target = (await blue.count()) ? blue : optLoc.first()
    await target.click()
    clicked = true
  }
  const cleared = !!(await waitUntil(async () => (await pending()).every((x) => x.sessionID !== sid), 20000, 300))
  await runShot(page, run, "2-after-click")
  run.record("option-click", clicked && cleared ? "PASS" : "FAIL", { clicked, answeredServerSide: cleared })
  const all = await pending()
  run.record("question-cleared", cleared && all.length === 0 ? "PASS" : "FAIL", { remaining: all.map((x) => x.id) })
} catch (e) {
  run.record("run", "FAIL", { error: String(e?.message ?? e).slice(0, 500) })
  if (page) await runShot(page, run, "error").catch(() => {})
} finally {
  if (app) await app.close().catch(() => {})
  process.exit(run.finish())
}
