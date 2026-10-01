// ADR-007: one main panel that switches sessions in place, plus pinned panels ("Open in New Panel").
// Real VS Code + test server. Also the step-2 measurement: in-place switch time vs. opening a new panel.
//   switch-in-place        opening another session reuses the main panel's live document (same generation)
//   send-after-switch      a message sent after switching lands only in the new session
//   draft-per-session      unsent drafts stay with their session across switches
//   pinned-unaffected      a pinned panel keeps its session while the main panel switches
//   open-shown-focuses     opening a session a pinned panel already shows focuses it (main unchanged)
//   reload-keeps-roles     Reload Window restores one main panel on its last session and the pinned one
//   switch-uncached-ready  switching to a session the page has not cached (not among the 5 most recent when it
//                          loaded; its requests held 3 s): the page reports ready only once its composer is shown
//   switch-uncached-no-blank  same, with only the session info held (as over Remote): no frame of an empty panel
//                          (patch 0015; upstream closes the whole workspace until the info arrives)
import { fileURLToPath } from "node:url"
import { createRun } from "./lib/results.mjs"
import { launch, command, waitUntil, chatFrames, frameSession, sleep, runShot, hostState } from "./vscode.mjs"
import { api, messages, waitReply, MODEL } from "./server.mjs"

const REQUIRED = ["switch-in-place", "send-after-switch", "draft-per-session", "switch-uncached-ready", "switch-uncached-no-blank", "pinned-unaffected", "open-shown-focuses", "reload-keeps-roles"]
const run = createRun({ suite: "p1b-main-panel", required: REQUIRED, scriptPath: fileURLToPath(import.meta.url) })
const health = await api("GET", "/global/health").catch(() => null)
run.setEnv({ serverVersion: health?.version ?? null, modelMode: MODEL.mode })
// D1, D2: created before five newer sessions, so the page's first session list (the 5 most recent) holds neither.
const rand0 = Math.random().toString(36).slice(2, 7)
const D1 = (await api("POST", "/session", { title: `oco uncached D1 ${rand0}` })).id
const D2 = (await api("POST", "/session", { title: `oco uncached D2 ${rand0}` })).id
// D1 gets one exchange, so its own rows tell when it is on screen (D2 and D1 would otherwise look the same).
await api("POST", `/session/${D1}/prompt_async`, {
  model: { providerID: MODEL.providerID, modelID: MODEL.modelID },
  parts: [{ type: "text", text: `Reply with exactly this line and nothing else: UNCACHED-D1-${rand0}` }],
})
await waitReply(D1)
const d1Messages = new Set((await messages(D1)).map((m) => m.info.id))
for (let i = 0; i < 5; i++) await api("POST", "/session", { title: `oco filler ${i} ${rand0}` })
const SLOW_MS = 3000
process.env.OCO_DEV_SLOW_PATHS = `^/session/(${D1}|${D2})$|^/session/${D2}/message$`
process.env.OCO_DEV_SLOW_MS = String(SLOW_MS)
run.setEnv({ uncachedDelay: { paths: process.env.OCO_DEV_SLOW_PATHS, ms: SLOW_MS } })
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

  // 3b/3c. Switches to sessions this page has not cached (not among the 5 most recent when it loaded).
  //   D2: info and messages slow. The previous session stays on screen until D2 renders, and the host must not
  //       mark the panel ready before that (a draft would reach the previous composer and be refused).
  //   D1: only its info slow, as over Remote (the messages come back first). D1 must be on screen before its info
  //       arrives, with no frame of an empty page (over Remote, upstream closed the whole workspace until then:
  //       the "black flash").
  const fB = toB.f
  const rows = () => fB.evaluate(() => document.querySelectorAll("[data-message-id]").length)
  const seen = (id) => fB.evaluate((d) => (window.__OCO_STATS__?.fetchRecent ?? []).filter((r) => r.path.includes(d)).length, id)
  const showing = (id) =>
    fB.evaluate((d) => window.__OCO_DEBUG__?.sessionId?.() === d && !!document.querySelector('[data-component="prompt-input"]') && !document.querySelector("[data-message-id]"), id)
  const readyOn = (st, id) => byRole(st, "main")[0]?.sessionId === id && byRole(st, "main")[0]?.ready === true

  const d2Seen = await seen(D2)
  await command(page, "oco: Open Session", { input: D2 })
  const t2 = Date.now() // the switch starts when the quick pick is accepted
  const stMid = await state()
  const midMs = Date.now() - t2
  const midRows = await rows()
  const midReady = byRole(stMid, "main")[0]?.ready
  let shown2
  await waitUntil(async () => (await showing(D2)) && (shown2 = Date.now() - t2), SLOW_MS + 15000, 50)
  let st2
  await waitUntil(async () => readyOn((st2 = await state()), D2), 15000, 200)
  run.record(
    "switch-uncached-ready",
    d2Seen === 0 && midMs < SLOW_MS - 300 && midRows > 0 && midReady === false && shown2 >= SLOW_MS - 500 && readyOn(st2, D2) ? "PASS" : "FAIL",
    { requestedBefore: d2Seen, midMs, midRowsOfB: midRows, midReady, shownMs: shown2, readyAfter: readyOn(st2, D2) },
  )

  const d1Seen = await seen(D1)
  await fB.evaluate(() => {
    const w = window
    w.__ocoSwitch = { frames: 0, empty: 0, stop: false, changes: [] }
    let last = ""
    const tick = () => {
      const s = w.__ocoSwitch
      if (s.stop) return
      s.frames++
      const text = (document.getElementById("root")?.textContent ?? "").length
      if (text === 0) s.empty++
      const now = `${text > 0} ${!!document.querySelector('[data-component="prompt-input"]')} ${w.__OCO_DEBUG__?.sessionId?.().slice(-6)}`
      if (now !== last) s.changes.push(`${Math.round(performance.now())} ${(last = now)} ${text}`)
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
  await command(page, "oco: Open Session", { input: D1 })
  const t1 = Date.now()
  let shown1
  const showsD1 = () => fB.evaluate(() => document.querySelector("[data-message-id]")?.getAttribute("data-message-id") ?? "")
  await waitUntil(async () => d1Messages.has(await showsD1()) && (shown1 = Date.now() - t1), SLOW_MS + 15000, 50)
  await sleep(Math.max(0, SLOW_MS + 500 - (Date.now() - t1))) // past the held info request
  const frames = await fB.evaluate(() => ((window.__ocoSwitch.stop = true), window.__ocoSwitch))
  await runShot(page, run, "3c-switched-to-D1")
  run.record("switch-uncached-no-blank", d1Seen === 0 && frames.empty === 0 && frames.frames > 30 && shown1 < SLOW_MS - 1000 ? "PASS" : "FAIL", {
    requestedBefore: d1Seen,
    emptyFrames: frames.empty,
    frames: frames.frames,
    changes: frames.changes.slice(0, 12),
    requests: await fB.evaluate((d) => (window.__OCO_STATS__?.fetchRecent ?? []).filter((r) => r.path.includes(d)).map((r) => `${r.t}-${r.head}-${r.end} ${r.path.slice(-20)}`), D1),
    shownMs: shown1,
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
