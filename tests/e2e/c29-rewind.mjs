// E2E c29-rewind (card 9): does the upstream per-message "Revert message" button work inside the embedded panel?
// Cases:
//   revert-button-visible  2 finished user turns; hovering the 1st user message makes the reset-icon "Revert message" button visible (opacity > 0) and clickable; the selector is recorded
//   revert-to-message      click Revert on the 2nd user message: server session.revert.messageID = that message; timeline keeps only turn 1;
//                          revert dock ("1 rolled back message") shows; composer is refilled with the 2nd message text
//   restore                Restore in the dock: revert cleared on the server, turn 2 is back, dock gone
//   busy-revert            while a slow 2nd turn runs, Revert on the 1st user message: the button is enabled while the session is busy
//                          (its own `disabled` only covers its click round-trip); the session is interrupted and revert is set to message 1
// A missing button or dock is recorded as NOT RUN / FAIL with the detail (product finding, vendor untouched).
import { fileURLToPath } from "node:url"
import { createRun } from "./lib/results.mjs"
import { launch, waitUntil, chatFrames, sleep, runShot, createAndOpenSession } from "./vscode.mjs"
import { api, waitReply, waitIdle, status, messages, MODEL } from "./server.mjs"

const REQUIRED = ["revert-button-visible", "revert-to-message", "restore", "busy-revert"]
const run = createRun({ suite: "c29-rewind", required: REQUIRED, scriptPath: fileURLToPath(import.meta.url) })
const health = await api("GET", "/global/health").catch(() => null)
run.setEnv({ serverVersion: health?.version ?? null, modelMode: MODEL.mode })
const { app, page } = await launch({ profile: "c29-rewind", run })
run.installCrashHandlers(() => app.close())
const rand = Math.random().toString(36).slice(2, 7)
const T1 = `REWIND-1-${rand}`
const T2 = `REWIND-2-${rand}`
// en tooltip / aria-label of ui.message.revertMessage (reset icon, same row as the fork button)
const REVERT = '[aria-label="Revert message"]'
const rec = (id, ok, detail) => run.record(id, ok === "NOT RUN" ? "NOT RUN" : ok ? "PASS" : "FAIL", detail)

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
async function type(f, text) {
  await waitUntil(async () => (await f.evaluate(() => document.documentElement.dataset.ocoModel)) === "ready", 60000, 100)
  const input = f.locator('[data-component="prompt-input"]')
  await input.click()
  await input.focus()
  await page.keyboard.type(text, { delay: 4 })
  await sleep(300)
  await page.keyboard.press("Enter")
}
const users = async (sid) => (await messages(sid)).filter((m) => m.info.role === "user")
const userText = (m) => m.parts.filter((p) => p.type === "text").map((p) => p.text).join(" ")
/** Product-visible opacity of an element: product of its own and all ancestors' computed opacity. */
const opacityOf = (loc) =>
  loc.evaluate((el) => {
    let o = 1
    for (let e = el; e; e = e.parentElement) o *= Number(getComputedStyle(e).opacity)
    const r = el.getBoundingClientRect()
    return { opacity: o, w: Math.round(r.width), h: Math.round(r.height), disabled: el.disabled === true || el.getAttribute("aria-disabled") === "true" }
  })
const userMsg = (f, text) => f.locator('[data-component="user-message"]', { hasText: text })
async function hover(f, text) {
  const m = userMsg(f, text).first()
  await m.scrollIntoViewIfNeeded()
  await m.hover()
  await sleep(400)
  return m
}
const dockOf = (f) => f.locator('[data-component="session-revert-dock"]')
async function dockText(f, timeout = 20000) {
  const dock = dockOf(f)
  const shown = await waitUntil(async () => (await dock.count()) > 0 && (await dock.first().isVisible()), timeout, 300)
  return shown ? (await dock.first().innerText()).replace(/\s+/g, " ") : null
}
async function twoTurns(sid, f) {
  await type(f, `Reply with exactly this line and nothing else: ${T1}`)
  await waitReply(sid)
  await type(f, `Reply with exactly this line and nothing else: ${T2}`)
  await waitReply(sid)
  await waitIdle(sid, 30000)
  await sleep(1000)
}

try {
  // ---- (a)(b)(c) share one session with two finished turns
  const sidA = await createAndOpenSession(page)
  const fA = await frameFor(sidA)
  await twoTurns(sidA, fA)
  const us = await users(sidA)
  const u1 = us[0]?.info.id, u2 = us[1]?.info.id

  // (a) visibility
  const btn1 = userMsg(fA, T1).first().locator(REVERT).first()
  const nBtn = await userMsg(fA, T1).first().locator(REVERT).count()
  const before = nBtn ? await opacityOf(btn1) : null
  await hover(fA, T1)
  const after = nBtn ? await opacityOf(btn1) : null
  await runShot(page, run, "1-hover-user1")
  let clickable = false
  if (after) {
    // actionability without side effects: the pointer hit-test at the button centre must land on the button itself
    clickable = await btn1.evaluate((el) => {
      const r = el.getBoundingClientRect()
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
      return !!hit && (hit === el || el.contains(hit))
    })
  }
  const visible = !!after && after.opacity > 0.5 && after.w > 0 && after.h > 0 && !after.disabled && clickable
  rec("revert-button-visible", visible, { selector: `[data-component="user-message"] ${REVERT}`, count: nBtn, beforeHover: before, afterHover: after, hitTestOnButton: clickable })

  // (b) revert to message 2
  if (!nBtn || !u2) {
    rec("revert-to-message", "NOT RUN", { reason: "no Revert button in the embedded user message" })
    rec("restore", "NOT RUN", { reason: "no revert was produced" })
  } else {
    await hover(fA, T2)
    await userMsg(fA, T2).first().locator(REVERT).first().click()
    const rtext = await dockText(fA)
    let info = null
    await waitUntil(async () => !!(info = await api("GET", `/session/${sidA}`)).revert?.messageID, 20000, 300)
    await sleep(800)
    const shownUsers = await fA.locator('[data-component="user-message"]').evaluateAll((els) => els.map((e) => e.textContent ?? ""))
    const composer = await fA.locator('[data-component="prompt-input"]').innerText().catch(() => "")
    await runShot(page, run, "2-reverted")
    const timelineOk = shownUsers.length === 1 && shownUsers[0].includes(T1) && !shownUsers.some((t) => t.includes(T2))
    rec("revert-to-message", !!rtext && /1 rolled back message/i.test(rtext) && info?.revert?.messageID === u2 && timelineOk && composer.includes(T2), {
      dockText: rtext?.slice(0, 120) ?? null,
      serverRevertMessageID: info?.revert?.messageID ?? null,
      expectedMessageID: u2,
      timelineUsers: shownUsers.map((t) => t.slice(0, 60)),
      composerHasT2: composer.includes(T2),
      composer: composer.slice(0, 80),
    })

    // (c) restore
    if (!rtext) {
      rec("restore", "NOT RUN", { reason: "revert dock did not show" })
    } else {
      const dock = dockOf(fA)
      let restore = fA.locator('[data-component="session-revert-dock"] button', { hasText: /restore|恢复/i }).first()
      if (!(await restore.isVisible().catch(() => false))) {
        await dock.first().locator('[role="button"]').first().click()
        await sleep(600)
      }
      await restore.evaluate((el) => el.click())
      const cleared = await waitUntil(async () => (await dock.count()) === 0 && !(await api("GET", `/session/${sidA}`)).revert, 20000, 300)
      await sleep(800)
      const back = await fA.locator('[data-component="user-message"]').evaluateAll((els) => els.map((e) => e.textContent ?? ""))
      await runShot(page, run, "3-restored")
      rec("restore", !!cleared && back.length === 2 && back.some((t) => t.includes(T2)), { cleared: !!cleared, timelineUsers: back.map((t) => t.slice(0, 60)), serverRevert: (await api("GET", `/session/${sidA}`)).revert ?? null })
    }
  }

  // (d) busy revert in a fresh session
  const sidD = await createAndOpenSession(page)
  const fD = await frameFor(sidD)
  await type(fD, `Reply with exactly this line and nothing else: ${T1}`)
  await waitReply(sidD)
  await waitIdle(sidD, 30000)
  await type(fD, "Write 600 numbered sentences about harbors. No tools.")
  const busy = await waitUntil(async () => (await status(sidD)) === "busy", 20000, 200)
  await sleep(1500)
  const d1 = (await users(sidD))[0]?.info.id
  if (!busy) {
    rec("busy-revert", "NOT RUN", { reason: "slow second turn never became busy" })
  } else {
    await hover(fD, T1)
    const b = fD.locator('[data-component="user-message"]', { hasText: T1 }).first().locator(REVERT).first()
    const state = (await b.count()) ? await opacityOf(b) : null
    // the message hover can be lost while the streaming timeline auto-scrolls; hovering the button itself must reveal it
    const stateBtnHover = state ? (await b.hover({ force: true }), await sleep(300), await opacityOf(b)) : null
    await runShot(page, run, "4-busy-hover")
    if (!state) {
      rec("busy-revert", "NOT RUN", { reason: "no Revert button while busy" })
    } else if (state.disabled) {
      const still = (await api("GET", `/session/${sidD}`)).revert ?? null
      rec("busy-revert", !still, { behaviour: "busy 时禁用", button: state, serverRevert: still })
    } else {
      await b.click()
      let info = null
      await waitUntil(async () => !!(info = await api("GET", `/session/${sidD}`)).revert?.messageID, 25000, 300)
      const idle = await waitIdle(sidD, 20000)
      const dt = await dockText(fD, 10000)
      await runShot(page, run, "5-busy-reverted")
      rec("busy-revert", info?.revert?.messageID === d1 && idle, {
        behaviour: "enabled while busy; interrupts then reverts",
        button: state,
        buttonAfterButtonHover: stateBtnHover,
        serverRevertMessageID: info?.revert?.messageID ?? null,
        expectedMessageID: d1,
        idleAfter: idle,
        dockText: dt?.slice(0, 120) ?? null,
      })
    }
    await api("POST", `/session/${sidD}/abort`).catch(() => {})
  }
} catch (e) {
  run.record("run", "FAIL", { error: String(e?.message ?? e).slice(0, 500) })
  await runShot(page, run, "error")
} finally {
  await app.close().catch(() => {})
  process.exit(run.finish())
}
