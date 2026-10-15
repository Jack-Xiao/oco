// Patch 0011: fork buttons on messages. Real VS Code + test server; session A has two exchanged turns.
//   fork-user          the fork button on A's 2nd user message opens a new session in the main panel (in place)
//                      holding only turn 1; that message's text is back in the composer; A is unchanged
//   fork-response-mid  the fork button on turn 1's response: new session holds turn 1 (user + reply) only,
//                      composer empty
//   fork-response-last the fork button on the last response: new session holds both turns
import { fileURLToPath } from "node:url"
import { createRun } from "./lib/results.mjs"
import { launch, command, waitUntil, chatFrames, frameSession, sleep, runShot, hostState, createAndOpenSession } from "./vscode.mjs"
import { api, messages, waitReply, MODEL } from "./server.mjs"

const REQUIRED = ["fork-user", "fork-response-mid", "fork-response-last"]
const run = createRun({ suite: "c3-fork", required: REQUIRED, scriptPath: fileURLToPath(import.meta.url) })
const health = await api("GET", "/global/health").catch(() => null)
run.setEnv({ serverVersion: health?.version ?? null, modelMode: MODEL.mode })
const { app, page, stateFile } = await launch({ profile: "c3-fork", run })
run.installCrashHandlers(() => app.close())
const state = () => hostState(page, stateFile)
const rand = Math.random().toString(36).slice(2, 7)
const T1 = `FORK-1-${rand}`
const T2 = `FORK-2-${rand}`
// en / zh tooltip of ui.message.forkMessage
const FORK = '[aria-label="Fork to new session"], [aria-label="从此消息创建新会话"]'

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
async function send(f, text) {
  const input = f.locator('[data-component="prompt-input"]')
  await input.click()
  await input.focus()
  await page.keyboard.type(text, { delay: 4 })
  await sleep(200)
  await page.keyboard.press("Enter")
}
const composer = (f) => f.locator('[data-component="prompt-input"]').innerText()
/** Role + text of each message, e.g. ["user:FORK-1", "assistant:..."]. */
const shape = async (sid) =>
  (await messages(sid)).map((m) => `${m.info.role}:${m.parts.filter((p) => p.type === "text").map((p) => p.text).join(" ").slice(0, 80)}`)
/** Click the fork button inside `container` (hover first: message actions show on hover). */
async function clickFork(container, shot) {
  await container.scrollIntoViewIfNeeded()
  await container.hover()
  await sleep(300)
  await runShot(page, run, shot)
  await container.locator(FORK).first().click({ force: true })
}
/** Wait for the main panel to switch away from `from`; returns the new session id and its frame. */
async function forkedFrom(from) {
  let sid
  await waitUntil(async () => {
    const main = (await state()).panels.find((p) => p.role === "main")
    sid = main && main.sessionId !== from ? main.sessionId : undefined
    return !!sid
  }, 30000, 200)
  const f = await frameFor(sid)
  if (f) await ready(f)
  return { sid, f }
}

try {
  // Setup: A in the main panel with two turns.
  await createAndOpenSession(page)
  let A
  await waitUntil(async () => {
    for (const f of await chatFrames(page)) A = await frameSession(f).catch(() => null)
    return !!A
  }, 60000, 200)
  let fA = await frameFor(A)
  await ready(fA)
  await send(fA, `Reply with exactly this line and nothing else: ${T1}`)
  await waitReply(A)
  await send(fA, `Reply with exactly this line and nothing else: ${T2}`)
  await waitReply(A)
  // waitReply can return before the final text part is written; snapshot only once the last reply has text.
  await waitUntil(async () => (await shape(A)).at(-1) !== "assistant:", 15000, 200)
  await sleep(1500)
  const before = await shape(A)
  // Sidebar visible with A selected, so the fork must move the highlight (native selection only follows clicks).
  await command(page, "Focus on Sessions View")
  await waitUntil(async () => (await state()).sidebar.selected === A, 10000, 200).catch(() => undefined)
  const selBefore = (await state()).sidebar.selected
  await sleep(1000)

  // 1. Fork from the 2nd user message.
  await clickFork(fA.locator('[data-component="user-message"]', { hasText: T2 }), "1-hover-user")
  const u = await forkedFrom(A)
  const uShape = u.sid ? await shape(u.sid) : []
  const uComposer = u.f ? await composer(u.f) : ""
  const st1 = await state()
  await runShot(page, run, "1-fork-user")
  const uOk =
    uShape.length === 2 && uShape[0].startsWith("user:") && uShape[0].includes(T1) && uShape[1].startsWith("assistant:") &&
    !uShape.some((s) => s.includes(T2)) && uComposer.includes(T2) && st1.panels.length === 1 &&
    JSON.stringify(await shape(A)) === JSON.stringify(before)
  let selAfter = null
  await waitUntil(async () => (selAfter = (await state()).sidebar.selected) === u.sid, 10000, 200).catch(() => undefined)
  run.record("fork-sidebar-selection", selBefore === A && selAfter === u.sid ? "PASS" : "FAIL", { selBefore, selAfter, A, fork: u.sid })
  run.record("fork-user", uOk ? "PASS" : "FAIL", { shape: uShape, composerHasT2: uComposer.includes(T2), panels: st1.panels.length, aMessages: before.length })

  // 2. Back to A; fork from turn 1's response.
  await command(page, "oco: Open Session", { input: A })
  fA = await frameFor(A)
  await ready(fA)
  await sleep(1000)
  const responses = fA.locator('[data-component="text-part"]:has([data-slot="text-part-copy-wrapper"])')
  await clickFork(responses.first(), "2-hover-response-mid")
  const m = await forkedFrom(A)
  const mShape = m.sid ? await shape(m.sid) : []
  const mComposer = m.f ? (await composer(m.f)).trim() : "?"
  await runShot(page, run, "2-fork-response-mid")
  run.record(
    "fork-response-mid",
    mShape.length === 2 && mShape[0].includes(T1) && mShape[1].startsWith("assistant:") && !mShape.some((s) => s.includes(T2)) && mComposer === "" ? "PASS" : "FAIL",
    { shape: mShape, composer: mComposer.slice(0, 80) },
  )

  // 3. Back to A; fork from the last response: everything is copied.
  await command(page, "oco: Open Session", { input: A })
  fA = await frameFor(A)
  await ready(fA)
  await sleep(1000)
  await clickFork(responses.last(), "3-hover-response-last")
  const l = await forkedFrom(A)
  const lShape = l.sid ? await shape(l.sid) : []
  await runShot(page, run, "3-fork-response-last")
  run.record("fork-response-last", lShape.length === before.length && lShape.at(-1)?.startsWith("assistant:") && lShape.some((s) => s.includes(T2)) ? "PASS" : "FAIL", {
    shape: lShape,
    aMessages: before.length,
  })
} catch (e) {
  run.record("run", "FAIL", { error: String(e?.message ?? e).slice(0, 500) })
  await runShot(page, run, "error")
} finally {
  await app.close().catch(() => {})
  process.exit(run.finish())
}
