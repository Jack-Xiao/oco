#!/usr/bin/env node
// Visual prep (not an assertion suite): the SESSIONS sidebar in a light theme with a label section, a snoozed row and a
// selection bar, for a human to look at. Mock model only. Screenshot: light-sidebar.png in the run directory.
import { fileURLToPath } from "node:url"
import { createRun } from "./lib/results.mjs"
import { launch, command, waitUntil, runShot, clearNotifications } from "./vscode.mjs"
import { api, MODEL } from "./server.mjs"
import { sessionsFrame, sessionRow } from "./lib/sessions-web.mjs"

const run = createRun({ suite: "visual-light-sidebar", required: ["light-shot"], scriptPath: fileURLToPath(import.meta.url) })
let app = null
try {
  const l = await launch({ profile: "visual-light", run, settings: { "workbench.colorTheme": "Default Light Modern", "window.dialogStyle": "custom" } })
  app = l.app
  const page = l.page
  run.installCrashHandlers(() => app?.close())
  const rand = Math.random().toString(36).slice(2, 7)
  const titles = ["Refactor parser", "Fix flaky test", "Write docs", "Snoozed idea"].map((t) => `${t} ${rand}`)
  for (const t of titles) { await api("POST", "/session", { title: t }); await new Promise((r) => setTimeout(r, 300)) }
  await command(page, "Focus on Sessions View")
  await clearNotifications(page)
  await waitUntil(async () => !!(await sessionsFrame(page)), 30000, 300)
  for (const t of titles) await (await sessionRow(page, t)).waitFor({ state: "visible", timeout: 30000 })
  const frame = await sessionsFrame(page)
  // label the first two
  await (await sessionRow(page, titles[0])).click({ modifiers: ["Meta"] })
  await (await sessionRow(page, titles[1])).click({ modifiers: ["Meta"] })
  await frame.locator('[data-batch="label"]').click()
  const input = frame.locator(".inline-label-input")
  await input.waitFor({ state: "visible", timeout: 5000 })
  await input.fill("urgent")
  await input.press("Enter")
  await page.waitForTimeout(800)
  // snooze the last one
  await frame.locator('[data-batch="clear"]').click().catch(() => {})
  await (await sessionRow(page, titles[3])).click({ modifiers: ["Meta"] })
  await frame.locator('[data-batch="snooze"]').click()
  await page.waitForTimeout(800)
  // leave a selection bar up on one visible row
  await (await sessionRow(page, titles[2])).click({ modifiers: ["Meta"] })
  await page.waitForTimeout(500)
  await runShot(page, run, "light-sidebar")
  run.record("light-shot", "PASS", { note: "screenshot only; look at it", mode: MODEL.mode })
} catch (e) {
  run.record("light-shot", "FAIL", { error: String(e?.message ?? e).slice(0, 400) })
} finally {
  if (app) await app.close().catch(() => {})
  process.exit(run.finish())
}
