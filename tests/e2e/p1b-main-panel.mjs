// ADR-007: one main panel that switches sessions in place, plus pinned panels ("Open in New Panel").
// Real VS Code + test server. Also the step-2 measurement: in-place switch time vs. opening a new panel.
//   switch-in-place        opening another session reuses the main panel's live document (same generation)
//   send-after-switch      a message sent after switching lands only in the new session
//   draft-per-session      unsent drafts stay with their session across switches
//   pinned-unaffected      a pinned panel keeps its session while the main panel switches
//   open-shown-focuses     opening a session a pinned panel already shows focuses it (main unchanged)
//   reload-keeps-roles     Reload Window restores one main panel on its last session and the pinned one
import { fileURLToPath } from "node:url"
import { createRun } from "./lib/results.mjs"
import { launch, command, waitUntil, chatFrames, frameSession, sleep, runShot, hostState } from "./vscode.mjs"
import { api, messages, waitReply, MODEL } from "./server.mjs"

const REQUIRED = ["switch-in-place", "send-after-switch", "draft-per-session", "pinned-unaffected", "open-shown-focuses", "reload-keeps-roles"]
const run = createRun({ suite: "p1b-main-panel", required: REQUIRED, scriptPath: fileURLToPath(import.meta.url) })
const health = await api("GET", "/global/health").catch(() => null)
run.setEnv({ serverVersion: health?.version ?? null, modelMode: MODEL.mode })
const { app, page, stateFile } = await launch({ profile: "p1b-main-panel", run })
run.installCrashHandlers(() => app.close())
const state = () => hostState(page, stateFile)
const rand = Math.random().toString(36).slice(2, 7)

/** Visible chat frame currently showing `sid` with its composer, or null after `timeout`. */
async function frameFor(sid, timeout = 60000) {
  const end = Date.now() + timeout
  while (Date.now() < end) {
    for (const f of await chatFrames(page)) {
      const ok = await f
        .evaluate(
          (id) => window.__OCO_DEBUG__?.sessionId?.() === id && document.visibilityState === "visible" && !!document.querySelector('[data-component="prompt-input"]'),
          sid,
        )
        .catch(() => false)
      if (ok) return f
    }
    await sleep(50)
  }
  return null
}
async function ready(f) {
  await waitUntil(async () => (await f.evaluate(() => document.documentElement.dataset.ocoModel)) === "ready", 60000, 100)
}
async function type(f, text, send = false) {
  const input = f.locator('[data-component="prompt-input"]')
  for (let attempt = 0; attempt < 2; attempt++) {
    const before = await input.innerText()
    await input.click()
    await input.focus()
    await page.keyboard.press("Meta+End")
    await page.keyboard.type(text, { delay: 4 })
    await sleep(200)
    if ((await input.innerText()).length >= before.length + text.length - 2) break
  }
  if (send) await page.keyboard.press("Enter")
}
const composer = (f) => f.locator('[data-component="prompt-input"]').innerText()
const userTexts = async (sid) =>
  (await messages(sid)).filter((m) => m.info.role === "user").flatMap((m) => m.parts).filter((p) => p.type === "text").map((p) => p.text).join("\n")
/** Open a session through the palette and time until its composer is visible and the model is ready. */
async function timedOpen(title, sid) {
  const t0 = Date.now()
  await command(page, title, { input: sid })
  const f = await frameFor(sid)
  if (f) await ready(f)
  return { f, ms: Date.now() - t0 }
}
const byRole = (st, role) => st.panels.filter((p) => p.role === role)

try {
  // Setup: A in the main panel (New Session), with one exchanged message.
  await command(page, "oco: New Session")
  let A
  await waitUntil(async () => {
    for (const f of await chatFrames(page)) A = await frameSession(f).catch(() => null)
    return !!A
  }, 60000, 200)
  const fA = await frameFor(A)
  await ready(fA)
  await type(fA, `Reply with exactly this line and nothing else: MAIN-A-${rand}`, true)
  await waitReply(A)
  const B = (await api("POST", "/session", { title: `oco main B ${rand}` })).id
  const C = (await api("POST", "/session", { title: `oco pinned C ${rand}` })).id

  // 1. Switch in place: A -> B in the same panel and document.
  const st0 = await state()
  const sw = await timedOpen("oco: Open Session", B)
  const st1 = await state()
  const mains = byRole(st1, "main")
  const bBody = sw.f ? await sw.f.evaluate(() => document.body.innerText) : ""
  await runShot(page, run, "1-switched-to-B")
  run.record(
    "switch-in-place",
    sw.f && st1.panels.length === 1 && mains.length === 1 && mains[0].sessionId === B && mains[0].generation === byRole(st0, "main")[0]?.generation && !bBody.includes(`MAIN-A-${rand}`)
      ? "PASS"
      : "FAIL",
    { switchMs: sw.ms, panels: st1.panels.length, mainSession: mains[0]?.sessionId === B, sameGeneration: mains[0]?.generation === byRole(st0, "main")[0]?.generation, showsAContent: bBody.includes(`MAIN-A-${rand}`), switches: mains[0]?.panel.switches },
  )

  // 2. A message sent after the switch lands only in B.
  await type(sw.f, `Reply with exactly this line and nothing else: MAIN-B-${rand}`, true)
  await waitReply(B)
  const inB = (await userTexts(B)).includes(`MAIN-B-${rand}`)
  const inA = (await userTexts(A)).includes(`MAIN-B-${rand}`)
  run.record("send-after-switch", inB && !inA ? "PASS" : "FAIL", { landedInB: inB, leakedToA: inA })

  // 3. Drafts stay with their session: draft in B, switch to A (no B draft), back to B (B draft).
  await type(sw.f, `draft-B-${rand}`)
  await sleep(1500) // the page debounces draft persistence
  const toA = await timedOpen("oco: Open Session", A)
  const aComposer = toA.f ? await composer(toA.f) : ""
  const toB = await timedOpen("oco: Open Session", B)
  const bComposer = toB.f ? await composer(toB.f) : ""
  run.record("draft-per-session", toA.f && toB.f && !aComposer.includes(`draft-B-${rand}`) && bComposer.includes(`draft-B-${rand}`) ? "PASS" : "FAIL", {
    aHasBDraft: aComposer.includes(`draft-B-${rand}`),
    bKeptDraft: bComposer.includes(`draft-B-${rand}`),
    switchToAMs: toA.ms,
    switchToBMs: toB.ms,
  })

  // 4. Pinned panel: C opens in a new panel (cold open, for comparison); the main panel then switches to A
  //    while C stays pinned.
  const pin = await timedOpen("oco: Open in New Panel", C)
  await command(page, "View: Move Editor into Right Group")
  await sleep(1500)
  const toA2 = await timedOpen("oco: Open Session", A)
  const st4 = await state()
  const pinned = byRole(st4, "pinned")
  await runShot(page, run, "4-main-A-pinned-C")
  run.record(
    "pinned-unaffected",
    pin.f && toA2.f && st4.panels.length === 2 && pinned.length === 1 && pinned[0].sessionId === C && byRole(st4, "main")[0]?.sessionId === A ? "PASS" : "FAIL",
    { newPanelOpenMs: pin.ms, switchMs: toA2.ms, panels: st4.panels.length, pinnedSession: pinned[0]?.sessionId === C, mainSession: byRole(st4, "main")[0]?.sessionId === A },
  )

  // 5. Opening C again focuses the pinned panel; the main panel keeps A.
  await command(page, "oco: Open Session", { input: C })
  await sleep(1500)
  const st5 = await state()
  const activeIsC = await page.locator(".editor-group-container.active .tab.active").first().getAttribute("aria-label").catch(() => "")
  run.record(
    "open-shown-focuses",
    st5.panels.length === 2 && byRole(st5, "main")[0]?.sessionId === A && byRole(st5, "pinned")[0]?.sessionId === C && /pinned C/.test(activeIsC ?? "") ? "PASS" : "FAIL",
    { panels: st5.panels.length, mainKeepsA: byRole(st5, "main")[0]?.sessionId === A, activeTab: (activeIsC ?? "").slice(0, 60) },
  )

  // 6. Reload Window: one main panel on A and the pinned C come back.
  const pre = await state()
  await command(page, "Developer: Reload Window")
  await waitUntil(async () => (await state().catch(() => null))?.activationId !== pre.activationId, 30000, 300)
  await page.waitForSelector(".monaco-workbench", { timeout: 60000 })
  let post
  await waitUntil(async () => {
    post = await state().catch(() => null)
    return post && post.activationId !== pre.activationId && post.panels.filter((p) => p.ready).length >= 2
  }, 60000, 300)
  await runShot(page, run, "6-after-reload")
  run.record(
    "reload-keeps-roles",
    post && byRole(post, "main").length === 1 && byRole(post, "main")[0].sessionId === A && byRole(post, "pinned")[0]?.sessionId === C ? "PASS" : "FAIL",
    { roles: post?.panels.map((p) => `${p.role}:${p.sessionId === A ? "A" : p.sessionId === C ? "C" : p.sessionId === B ? "B" : "?"}`) },
  )
} catch (e) {
  run.record("run", "FAIL", { error: String(e?.message ?? e).slice(0, 500) })
  await runShot(page, run, "error")
} finally {
  await app.close().catch(() => {})
  process.exit(run.finish())
}
