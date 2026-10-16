// E2E c27-docks (cc-features): do the upstream composer docks work inside the embedded panel?
// Cases:
//   todo-dock    "Use the todowrite tool to plan: a; b; c" renders data-component="session-todo-dock" ("of 3 todos completed");
//                (the dock only shows while a turn is running, so a slow second turn keeps it open); the toggle button collapses (data-collapsed=true) and expands it again
//   revert-dock  revert through the "/undo" slash command (the per-message hover button "Revert message" also exists in
//                the embedded timeline; c29-rewind covers it): /undo on a 2-turn session shows data-component="session-revert-dock" ("1 rolled back
//                message"); the server session has revert set; Restore clears both
// A missing entry or dock is recorded as NOT RUN with the missing piece in the detail (product finding, vendor untouched).
import { fileURLToPath } from "node:url"
import { createRun } from "./lib/results.mjs"
import { launch, waitUntil, chatFrames, sleep, runShot, createAndOpenSession } from "./vscode.mjs"
import { api, waitReply, messages, MODEL } from "./server.mjs"

const run = createRun({ suite: "c27-docks", required: ["todo-dock", "revert-dock"], scriptPath: fileURLToPath(import.meta.url) })
const health = await api("GET", "/global/health").catch(() => null)
run.setEnv({ serverVersion: health?.version ?? null, modelMode: MODEL.mode })
const { app, page } = await launch({ profile: "c27-docks", run })
run.installCrashHandlers(() => app.close())
const rand = Math.random().toString(36).slice(2, 7)

async function frameFor(sid, timeout = 60000) {
  const end = Date.now() + timeout
  while (Date.now() < end) {
    for (const f of await chatFrames(page)) {
      const ok = await f
        .evaluate((id) => window.__OCO_DEBUG__?.sessionId?.() === id && document.visibilityState === "visible" && !!document.querySelector('[data-component="prompt-input"]'), sid)
        .catch(() => false)
      if (ok) return f
    }
    await sleep(50)
  }
  return null
}
async function type(f, text, { enter = true } = {}) {
  await waitUntil(async () => (await f.evaluate(() => document.documentElement.dataset.ocoModel)) === "ready", 60000, 100)
  const input = f.locator('[data-component="prompt-input"]')
  await input.click()
  await input.focus()
  await page.keyboard.type(text, { delay: 4 })
  await sleep(300)
  if (enter) await page.keyboard.press("Enter")
}
const rec = (id, ok, detail) => run.record(id, ok === "NOT RUN" ? "NOT RUN" : ok ? "PASS" : "FAIL", detail)

try {
  // (a) todo dock
  const sidA = await createAndOpenSession(page)
  const fA = await frameFor(sidA)
  await type(fA, "Use the todowrite tool to plan: alpha; beta; gamma")
  await waitReply(sidA)
  // The upstream dock only lives while the session is running; the todos persist. Keep a second turn busy so it can be driven.
  await type(fA, "Write 600 numbered sentences about harbors. No tools.")
  const dock = fA.locator('[data-component="session-todo-dock"]')
  const shown = await waitUntil(async () => (await dock.count()) > 0 && (await dock.first().isVisible()), 20000, 300)
  // innerText of the rolling counter lists every digit; the label element carries the plain sentence.
  const dockText = shown ? (await dock.first().locator("[aria-label]").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")).join(" | "))) : ""
  const toggle = dock.first().locator('[data-action="session-todo-toggle-button"]')
  const header = dock.first().locator('[data-action="session-todo-toggle"]')
  const state = async () => (await toggle.getAttribute("data-collapsed", { timeout: 3000 }).catch(() => null))
  const s0 = shown ? await state() : null
  let s1 = null, s2 = null
  if (shown) {
    await header.evaluate((el) => el.click())
    await sleep(600)
    s1 = await state()
    await header.evaluate((el) => el.click())
    await sleep(600)
    s2 = await state()
  }
  await runShot(page, run, "1-todo-dock")
  await api("POST", `/session/${sidA}/abort`).catch(() => {})
  rec("todo-dock", shown && /of 3 todos completed/i.test(dockText) && s0 !== s1 && s2 === s0, { shown, dockText: dockText.slice(0, 200), collapsedStates: [s0, s1, s2] })

  // (b) revert dock via /undo
  const sidB = await createAndOpenSession(page)
  const fB = await frameFor(sidB)
  await type(fB, `Reply with exactly this line and nothing else: UNDO-1-${rand}`)
  await waitReply(sidB)
  await type(fB, `Reply with exactly this line and nothing else: UNDO-2-${rand}`)
  await waitReply(sidB)
  await sleep(1000)
  await type(fB, "/undo", { enter: false })
  await sleep(800)
  await runShot(page, run, "2-slash-undo")
  const popover = await fB.locator('[data-slash-id="session.undo"], [data-key="session.undo"]').count().catch(() => 0)
  await page.keyboard.press("Enter")
  const rdock = fB.locator('[data-component="session-revert-dock"]')
  const rshown = await waitUntil(async () => (await rdock.count()) > 0 && (await rdock.first().isVisible()), 20000, 300)
  const rtext = rshown ? (await rdock.first().innerText()).replace(/\s+/g, " ") : ""
  const info1 = await api("GET", `/session/${sidB}`)
  await runShot(page, run, "3-revert-dock")
  if (!rshown) {
    const composerText = await fB.locator('[data-component="prompt-input"]').innerText().catch(() => "")
    rec("revert-dock", "NOT RUN", { reason: "/undo did not produce a revert dock in the embedded panel", slashPopoverEntries: popover, composerText: composerText.slice(0, 80), serverRevert: info1.revert ?? null, messages: (await messages(sidB)).length })
  } else {
    let restore = fB.locator('[data-component="session-revert-dock"] button', { hasText: /restore|恢复/i }).first()
    if (!(await restore.isVisible().catch(() => false))) {
      await rdock.first().locator('[role="button"]').first().click()
      await sleep(600)
    }
    await restore.evaluate((el) => el.click())
    const cleared = await waitUntil(async () => (await rdock.count()) === 0 && !(await api("GET", `/session/${sidB}`)).revert, 20000, 300)
    await runShot(page, run, "4-restored")
    rec("revert-dock", /1 rolled back message/i.test(rtext) && !!info1.revert?.messageID && !!cleared, { dockText: rtext.slice(0, 200), serverRevert: info1.revert?.messageID ?? null, cleared: !!cleared })
  }
} catch (e) {
  run.record("run", "FAIL", { error: String(e?.message ?? e).slice(0, 500) })
  await runShot(page, run, "error")
} finally {
  await app.close().catch(() => {})
  process.exit(run.finish())
}
