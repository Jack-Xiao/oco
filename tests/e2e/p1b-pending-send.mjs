// P1b-1 pending send: a prompt submitted from an embedded panel before the directory's agents/models have
// loaded becomes ONE pending send with a visible, cancellable banner. It fires once when the model arrives
// and the draft is unchanged; editing the draft, Escape or the banner's cancel button drop it (draft kept);
// closing the panel destroys it. The load race is forced with the dev-only bridge delay
// (OCO_DEV_SLOW_PATHS, honoured outside production mode only). Every case uses a fresh panel/session.
import { fileURLToPath } from "node:url"
import { createRun } from "./lib/results.mjs"
import { launch, command, chatFrames, frameSession, sleep, runShot } from "./vscode.mjs"
import { messages, waitReply, MODEL } from "./server.mjs"

const DELAY = 8000
const CASES = ["loading-hint", "pending-visible-and-send", "pending-duplicate", "pending-draft-change", "pending-escape", "pending-cancel-button", "pending-close"]
const run = createRun({ suite: "p1b-pending-send", required: CASES, scriptPath: fileURLToPath(import.meta.url) })
let app
run.installCrashHandlers(() => app?.close())

const INPUT = '[data-component="prompt-input"]'

async function newPanel(page, known = new Set()) {
  await command(page, "oco: New Session")
  const end = Date.now() + 60000
  while (Date.now() < end) {
    for (const f of await chatFrames(page)) {
      const s = await frameSession(f).catch(() => null)
      if (s && !known.has(s) && (await f.$(INPUT).catch(() => null))) return { f, sid: s, t0: Date.now() }
    }
    await sleep(50)
  }
  throw new Error("no new panel")
}

const snap = (f) =>
  f
    .evaluate(() => {
      const html = document.documentElement
      const bar = document.getElementById("oco-submit-status")
      const btn = bar?.querySelector("button")
      return {
        model: html.dataset.ocoModel ?? null,
        pending: html.dataset.ocoSubmitPending ?? null,
        bar: bar && !bar.hidden ? { state: bar.dataset.state ?? null, text: bar.textContent, cancelButton: !!btn && !btn.hidden } : null,
        stats: window.__OCO_DEBUG__.submit(),
      }
    })
    .catch(() => null)

const users = async (sid) => (await messages(sid).catch(() => [])).filter((m) => m.info.role === "user")
const textOf = (m) => m.parts.filter((p) => p.type === "text").map((p) => p.text).join("")
const composer = async (f) => ((await f.locator(INPUT).innerText()) ?? "").trim()

async function waitFor(fn, ms, step = 100) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    const v = await fn()
    if (v) return v
    await sleep(step)
  }
  return null
}

const modelReady = (f) => waitFor(async () => (await snap(f))?.model === "ready", DELAY + 30000, 200)
const frameAlive = async (page, sid) => {
  for (const f of await chatFrames(page)) if ((await frameSession(f).catch(() => null)) === sid) return true
  return false
}

/** Fresh panel; the model must still be loading, otherwise the case cannot say anything. */
async function pendingPanel(page, text) {
  const p = await newPanel(page)
  const before = await snap(p.f)
  if (before?.model !== "loading") throw new Error(`precondition: model not loading in fresh panel (${JSON.stringify(before?.model)}, ${Date.now() - p.t0}ms in)`)
  const input = p.f.locator(INPUT)
  await input.click()
  await input.focus()
  await page.keyboard.type(text, { delay: 2 })
  return { ...p, input }
}

const submitKey = async (page) => page.keyboard.press("Enter")

async function closePanel(page, sid) {
  for (let i = 0; i < 3 && (await frameAlive(page, sid)); i++) {
    await command(page, "View: Close Editor").catch(() => {})
    await sleep(800)
  }
  return !(await frameAlive(page, sid))
}

async function runCase(page, id, fn) {
  let sid = null
  try {
    const r = await fn((s) => (sid = s))
    run.record(id, r.ok ? "PASS" : "FAIL", r.detail)
  } catch (e) {
    run.record(id, "FAIL", { error: String(e?.message ?? e).slice(0, 400) })
    await runShot(page, run, `${id}-error`)
  } finally {
    if (sid) await closePanel(page, sid).catch(() => {})
  }
}

process.env.OCO_DEV_SLOW_PATHS = "^/(agent|provider|config/providers)"
process.env.OCO_DEV_SLOW_MS = String(DELAY)
run.setEnv({ firstLoadDelay: { paths: process.env.OCO_DEV_SLOW_PATHS, ms: DELAY } })

try {
  const l = await launch({ profile: "p1b-pending-send", run })
  app = l.app
  const page = l.page

  // 1. Passive hint while loading, gone once loaded.
  await runCase(page, "loading-hint", async (setSid) => {
    const { f, sid, t0 } = await newPanel(page)
    setSid(sid)
    const early = await snap(f)
    const hint = await waitFor(async () => {
      const s = await snap(f)
      return s?.bar?.state === "loading" ? s : null
    }, DELAY - 1500)
    const hintAtMs = Date.now() - t0
    const modelShownWhileLoading = await f.getByText(MODEL.label).first().isVisible().catch(() => false)
    const loaded = await modelReady(f)
    const hidden = await waitFor(async () => (await snap(f))?.bar === null, 3000)
    const after = await snap(f)
    await runShot(page, run, "loading-hint")
    return {
      ok: early?.model === "loading" && !!hint && /加载/.test(hint.bar.text) && !hint.bar.cancelButton && !modelShownWhileLoading && !!loaded && !!hidden && (await users(sid)).length === 0,
      detail: { earlyModel: early?.model, hint: hint?.bar ?? null, hintAtMs, modelShownWhileLoading, loaded: !!loaded, barHiddenAfterLoad: !!hidden, after },
    }
  })

  // 2. Enter -> waiting banner with cancel button -> exactly one user message with the typed text.
  await runCase(page, "pending-visible-and-send", async (setSid) => {
    const text = "pending-send case two. Reply only with the word OK."
    const { f, sid } = await pendingPanel(page, text).then((p) => (setSid(p.sid), p))
    await submitKey(page)
    const waiting = await waitFor(async () => {
      const s = await snap(f)
      return s?.bar?.state === "waiting" ? s : null
    }, 3000, 50)
    const cancelVisible = await f.locator("#oco-submit-status button").isVisible().catch(() => false)
    await runShot(page, run, "pending-waiting")
    const sentEarly = (await users(sid)).length
    const loaded = await modelReady(f)
    const sent = await waitFor(async () => ((await users(sid)).length >= 1 ? true : null), 20000, 200)
    await sleep(3000)
    const us = await users(sid)
    const after = await snap(f)
    const reply = us.length ? await waitReply(sid, 90000) : null // informational only
    return {
      ok:
        waiting?.pending === "model" &&
        /自动发送/.test(waiting?.bar?.text ?? "") &&
        cancelVisible &&
        sentEarly === 0 &&
        !!loaded &&
        !!sent &&
        us.length === 1 &&
        textOf(us[0]) === text &&
        after?.stats.ready === 1 &&
        after?.stats.waiting === 1 &&
        after?.pending === null &&
        after?.bar === null,
      detail: { waiting: waiting?.bar ?? null, pendingAttr: waiting?.pending ?? null, cancelVisible, sentWhileWaiting: sentEarly, users: us.map(textOf), stats: after?.stats, replied: !!reply },
    }
  })

  // 3. Repeated Enter / send button while waiting must not queue a second message.
  await runCase(page, "pending-duplicate", async (setSid) => {
    const text = "pending-send case three, once only"
    const { f, sid } = await pendingPanel(page, text).then((p) => (setSid(p.sid), p))
    await submitKey(page)
    const waiting = await waitFor(async () => ((await snap(f))?.bar?.state === "waiting" ? true : null), 3000, 50)
    await sleep(300)
    await submitKey(page)
    await sleep(300)
    await submitKey(page)
    const btn = f.locator('[data-action="prompt-submit"]')
    const buttonFound = (await btn.count()) > 0
    if (buttonFound) await btn.first().click({ timeout: 3000 }).catch(() => {})
    await sleep(300)
    const mid = await snap(f)
    const loaded = await modelReady(f)
    await waitFor(async () => ((await users(sid)).length >= 1 ? true : null), 20000, 200)
    await sleep(4000)
    const us = await users(sid)
    const after = await snap(f)
    await waitReply(sid, 90000) // let the run finish so the test server is idle for the next case
    return {
      ok: !!waiting && mid?.bar?.state === "waiting" && !!loaded && us.length === 1 && textOf(us[0]) === text && after?.stats.waiting === 1 && after?.stats.ready === 1,
      detail: { buttonFound, stillWaitingAfterExtraSubmits: mid?.bar?.state, users: us.map(textOf), stats: after?.stats },
    }
  })

  // 4. Editing the draft while waiting cancels the auto-send and keeps the edited draft.
  await runCase(page, "pending-draft-change", async (setSid) => {
    const text = "pending-send case four"
    const extra = " EDITED"
    const { f, sid } = await pendingPanel(page, text).then((p) => (setSid(p.sid), p))
    await submitKey(page)
    const waiting = await waitFor(async () => ((await snap(f))?.bar?.state === "waiting" ? true : null), 3000, 50)
    await page.keyboard.type(extra, { delay: 2 })
    const notice = await waitFor(async () => {
      const s = await snap(f)
      return s?.bar?.state === "notice" && /草稿已修改/.test(s.bar.text) ? s : null
    }, 3000, 50)
    const loaded = await modelReady(f)
    await sleep(3000)
    const us = await users(sid)
    const draft = await composer(f)
    const after = await snap(f)
    await runShot(page, run, "pending-draft-change")
    return {
      ok: !!waiting && !!notice && !!loaded && us.length === 0 && draft === text + extra && after?.stats.draft === 1 && after?.stats.ready === 0 && after?.pending === null,
      detail: { notice: notice?.bar?.text ?? null, users: us.map(textOf), composer: draft, stats: after?.stats, pendingAttr: after?.pending },
    }
  })

  // 5. Escape cancels; draft kept; nothing sent.
  await runCase(page, "pending-escape", async (setSid) => {
    const text = "pending-send case five"
    const { f, sid } = await pendingPanel(page, text).then((p) => (setSid(p.sid), p))
    await submitKey(page)
    const waiting = await waitFor(async () => ((await snap(f))?.bar?.state === "waiting" ? true : null), 3000, 50)
    await page.keyboard.press("Escape")
    const notice = await waitFor(async () => {
      const s = await snap(f)
      return s?.bar?.state === "notice" && /已取消发送/.test(s.bar.text) ? s : null
    }, 3000, 50)
    const loaded = await modelReady(f)
    await sleep(3000)
    const us = await users(sid)
    const draft = await composer(f)
    const after = await snap(f)
    return {
      ok: !!waiting && !!notice && !!loaded && us.length === 0 && draft === text && after?.stats.cancel === 1 && after?.stats.ready === 0 && after?.pending === null,
      detail: { notice: notice?.bar?.text ?? null, users: us.map(textOf), composer: draft, stats: after?.stats, pendingAttr: after?.pending },
    }
  })

  // 6. The banner's cancel button cancels; draft kept; nothing sent.
  await runCase(page, "pending-cancel-button", async (setSid) => {
    const text = "pending-send case six"
    const { f, sid } = await pendingPanel(page, text).then((p) => (setSid(p.sid), p))
    await submitKey(page)
    const waiting = await waitFor(async () => ((await snap(f))?.bar?.state === "waiting" ? true : null), 3000, 50)
    await f.getByRole("button", { name: "取消发送" }).click({ timeout: 3000 })
    const notice = await waitFor(async () => {
      const s = await snap(f)
      return s?.bar?.state === "notice" && /已取消发送/.test(s.bar.text) ? s : null
    }, 3000, 50)
    const loaded = await modelReady(f)
    await sleep(3000)
    const us = await users(sid)
    const draft = await composer(f)
    const after = await snap(f)
    return {
      ok: !!waiting && !!notice && !!loaded && us.length === 0 && draft === text && after?.stats.cancel === 1 && after?.stats.ready === 0 && after?.pending === null,
      detail: { notice: notice?.bar?.text ?? null, users: us.map(textOf), composer: draft, stats: after?.stats, pendingAttr: after?.pending },
    }
  })

  // 7. Closing the panel before the model loads destroys the pending intent.
  await runCase(page, "pending-close", async (setSid) => {
    const text = "pending-send case seven"
    const { f, sid, t0 } = await pendingPanel(page, text).then((p) => (setSid(p.sid), p))
    await submitKey(page)
    const waiting = await waitFor(async () => ((await snap(f))?.bar?.state === "waiting" ? true : null), 3000, 50)
    const closed = await closePanel(page, sid)
    const closedAtMs = Date.now() - t0
    const beforeLoad = closedAtMs < DELAY
    // Wait past the delay plus 5s after opening the panel, then a bit more.
    await sleep(Math.max(0, t0 + DELAY + 5000 - Date.now()) + 2000)
    const us = await users(sid)
    return {
      ok: !!waiting && closed && beforeLoad && us.length === 0,
      detail: { waiting: !!waiting, closed, closedAtMs, beforeLoad, waitedTotalMs: Date.now() - t0, users: us.map(textOf) },
    }
  })
} catch (e) {
  run.record("run", "FAIL", { error: String(e?.message ?? e).slice(0, 400) })
} finally {
  await app?.close().catch(() => {})
  process.exit(run.finish())
}
