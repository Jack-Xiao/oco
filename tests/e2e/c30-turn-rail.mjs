// E2E c30-turn-rail (card 10, patch 0026): the embedded "turn rail" - a thin vertical strip of ticks (one per visible user
// turn) at the right edge of the chat column; click = jump to that turn (upstream scrollToMessage), active tick highlighted.
// DOM contract: nav[data-oco-turn-rail] with button[data-oco-turn-index=i] (aria-label "Jump to turn {n}", title = first line
// of the user message, <=80 chars); active tick: inner span has `w-3.5 bg-text-strong`. Rendered only with >=2 user turns.
// Cases:
//   rail-hidden-single  one user turn -> no nav[data-oco-turn-rail]
//   rail-ticks          7 turns (tall replies): tick count = user turns; each title = the first line of its user message;
//                       the rail sits at the right edge of the chat column and does not cover message text (geometry recorded)
//   jump                from the bottom click tick 1 -> user message 1 near the scroller top and tick 1 active;
//                       click the last tick -> back near the bottom, last tick active
//   bottom-highlight    scrolled back to the bottom -> the last tick is active
//   narrow-260 / wide   chat column ~260 px and >=1200 px: rail visible, no horizontal overflow caused by the rail (an overflow that
//                       survives with the rail hidden is upstream and only recorded: overflowPreExisting)
//   keyboard            Shift+Tab from the composer reaches a tick; Enter on tick 1 jumps to user message 1
// Product defects are recorded (expected vs actual, selector), never fixed here.
import { fileURLToPath } from "node:url"
import { createRun } from "./lib/results.mjs"
import { launch, waitUntil, chatFrames, sleep, runShot, createAndOpenSession, command, fitGroups, frameSession } from "./vscode.mjs"
import { api, waitReply, waitIdle, MODEL } from "./server.mjs"

const REQUIRED = ["rail-hidden-single", "rail-ticks", "jump", "bottom-highlight", "narrow-260", "wide", "keyboard"]
const run = createRun({ suite: "c30-turn-rail", required: REQUIRED, scriptPath: fileURLToPath(import.meta.url) })
const health = await api("GET", "/global/health").catch(() => null)
run.setEnv({ serverVersion: health?.version ?? null, modelMode: MODEL.mode })
const rand = Math.random().toString(36).slice(2, 7)
const TURNS = 7
const RAIL = "nav[data-oco-turn-rail]"
const TICK = "button[data-oco-turn-index]"
const rec = (id, ok, detail) => run.record(id, ok === "NOT RUN" ? "NOT RUN" : ok ? "PASS" : "FAIL", detail)
let app, page

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
  await page.keyboard.type(text, { delay: 3 })
  await sleep(300)
  await page.keyboard.press("Enter")
}
/** First line of turn i's user message (also the whole message): distinct, <80 chars, asks the mock for N numbered sentences. */
const titleOf = (i, tag = rand) => `TURN-${i + 1}-${tag}: write ${i === TURNS - 1 ? 4 : 14} numbered sentences about harbors`
async function turns(sid, f, tag = rand, n = TURNS) {
  for (let i = 0; i < n; i++) {
    await type(f, titleOf(i, tag))
    await waitReply(sid)
    await waitIdle(sid, 60000)
  }
  await sleep(1200)
}

// ---- in-page helpers (run inside the chat frame)
/** Scroll container of the timeline: nearest scrollable ancestor of the first [data-message-id]. */
const SCROLLER_FN = `(() => {
  const m = document.querySelector("[data-message-id]")
  for (let e = m?.parentElement; e; e = e.parentElement) {
    const o = getComputedStyle(e).overflowY
    if ((o === "auto" || o === "scroll") && e.scrollHeight > e.clientHeight + 1) return e
  }
  return null
})`
const inFrame = (f, body, arg) => f.evaluate(`(${body})(${JSON.stringify(arg ?? null)}, ${SCROLLER_FN}())`)

const scrollerState = (f) =>
  inFrame(f, `(a, s) => s ? { top: Math.round(s.scrollTop), h: s.scrollHeight, c: s.clientHeight, fromBottom: Math.round(s.scrollHeight - s.clientHeight - s.scrollTop), sw: s.scrollWidth, cw: s.clientWidth } : null`)
const toBottom = async (f) => {
  await inFrame(f, `(a, s) => { if (s) s.scrollTop = s.scrollHeight }`)
  await sleep(700)
}
/** Rail summary: tick count, titles, active ticks, rects. */
const railInfo = (f) =>
  f.evaluate(
    ({ RAIL, TICK }) => {
      const nav = document.querySelector(RAIL)
      if (!nav) return null
      const r = nav.getBoundingClientRect()
      const ticks = [...nav.querySelectorAll(TICK)]
      return {
        navCount: document.querySelectorAll(RAIL).length,
        ariaLabel: nav.getAttribute("aria-label"),
        rect: { left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom), w: Math.round(r.width), h: Math.round(r.height) },
        viewportW: innerWidth,
        n: ticks.length,
        titles: ticks.map((t) => t.getAttribute("title")),
        labels: ticks.map((t) => t.getAttribute("aria-label")),
        indexes: ticks.map((t) => t.dataset.ocoTurnIndex),
        active: ticks.map((t, i) => (/\bw-3\.5\b/.test(t.querySelector("span")?.className ?? "") && /\bbg-text-strong\b/.test(t.querySelector("span")?.className ?? "") ? i : -1)).filter((i) => i >= 0),
        tickRects: ticks.map((t) => {
          const b = t.getBoundingClientRect()
          return { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height) }
        }),
      }
    },
    { RAIL, TICK },
  )
/** Text rects (visible part of the timeline) that intersect the rail's tick buttons / the whole rail box. */
const overlap = (f) =>
  inFrame(
    f,
    `(a, s) => {
      const nav = document.querySelector('${RAIL}')
      if (!nav || !s) return null
      const rb = nav.getBoundingClientRect()
      const sb = s.getBoundingClientRect()
      const ticks = [...nav.querySelectorAll('${TICK}')].map((t) => t.getBoundingClientRect())
      const hit = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
      const w = document.createTreeWalker(s, NodeFilter.SHOW_TEXT)
      let n, texts = 0, onBox = 0, onTick = 0, maxRight = 0
      while ((n = w.nextNode())) {
        if (!n.textContent.trim()) continue
        const range = document.createRange()
        range.selectNodeContents(n)
        for (const r of range.getClientRects()) {
          if (r.width < 1 || r.bottom < sb.top || r.top > sb.bottom) continue
          texts++
          maxRight = Math.max(maxRight, r.right)
          if (hit(r, rb)) onBox++
          if (ticks.some((t) => hit(r, t))) onTick++
        }
      }
      return { texts, textRectsOnRailBox: onBox, textRectsOnTicks: onTick, textMaxRight: Math.round(maxRight), scrollerRight: Math.round(sb.right), railLeft: Math.round(rb.left) }
    }`,
  )
/** Position of the user message whose text contains `needle`, relative to the scroller top. */
const userPos = (f, needle) =>
  inFrame(
    f,
    `(needle, s) => {
      if (!s) return null
      const el = [...document.querySelectorAll('[data-component="user-message"]')].find((e) => (e.textContent ?? '').includes(needle))
      if (!el) return { found: false }
      return { found: true, top: Math.round(el.getBoundingClientRect().top - s.getBoundingClientRect().top), scrollerH: s.clientHeight }
    }`,
    needle,
  )
/** Real pointer click on tick i. If something else intercepts the pointer (Playwright actionability), record what sits on
 *  top of the tick and fall back to a DOM click so the jump/highlight logic can still be checked; returns { blocked }. */
const tickClick = async (f, i) => {
  const t = f.locator(`${RAIL} ${TICK}[data-oco-turn-index="${i}"]`)
  let blocked = null
  try {
    await t.click({ timeout: 4000 })
  } catch (e) {
    blocked = await f.evaluate((i) => {
      const b = document.querySelector(`nav[data-oco-turn-rail] button[data-oco-turn-index="${i}"]`)?.getBoundingClientRect()
      const el = b && document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2)
      const bar = document.querySelector("[data-session-title]")?.getBoundingClientRect()
      return {
        tick: i,
        tickRect: b ? { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height) } : null,
        hitAtCentre: el ? `${el.tagName.toLowerCase()}${el.hasAttribute("data-session-title") ? "[data-session-title]" : ""}.${String(el.className).slice(0, 60)}` : null,
        titleBarRect: bar ? { x: Math.round(bar.left), y: Math.round(bar.top), w: Math.round(bar.width), h: Math.round(bar.height) } : null,
        cls: "sticky session title bar (z-30) vs rail (z-30, earlier in DOM)",
      }
    }, i).catch(() => ({ tick: i }))
    blocked.error = String(e.message).split("\n").filter((l) => /intercept|stable|visible|enabled/.test(l)).slice(-1)[0]?.replace(/\u001b\[[0-9;]*m/g, "").trim().slice(0, 200)
    await t.evaluate((el) => el.click())
  }
  await sleep(900)
  return { blocked }
}
const dims = (f) => f.evaluate(() => ({ innerWidth, docSW: document.documentElement.scrollWidth, docCW: document.documentElement.clientWidth, bodySW: document.body.scrollWidth }))

/** Rail visible + no horizontal overflow, for the width cases. */
async function widthCheck(f, label) {
  const info = await railInfo(f)
  const d = await dims(f)
  const sc = await scrollerState(f)
  const vis = info ? await f.locator(`${RAIL} ${TICK}`).first().isVisible() : false
  const overflow = d.docSW > d.docCW || (sc && sc.sw > sc.cw)
  // differential: does the overflow survive when the rail is hidden? (then it is not caused by the rail)
  let withoutRail = null
  let wideEl = null
  if (info) {
    withoutRail = await inFrame(f, `(a, s) => { const n = document.querySelector('${RAIL}'); n.style.display = 'none'; const r = s ? { sw: s.scrollWidth, cw: s.clientWidth } : null; n.style.display = ''; return r }`)
    if (overflow) {
      wideEl = await inFrame(f, `(a, s) => { if (!s) return null; const sr = s.getBoundingClientRect().right; const out = []; for (const e of s.querySelectorAll('*')) { const r = e.getBoundingClientRect(); if (r.width > 0 && r.right > sr + 2) out.push(e.tagName.toLowerCase() + '[' + (e.getAttribute('data-component') ?? e.getAttribute('data-slot') ?? '') + '].' + String(e.className).slice(0, 40) + ' right=' + Math.round(r.right)); if (out.length >= 6) break } return out }`)
    }
  }
  const overflowPreExisting = !!overflow && !!withoutRail && withoutRail.sw > withoutRail.cw
  const inside = info ? info.rect.right <= d.innerWidth + 1 && info.rect.left >= 0 : false
  return { label, frameWidth: d.innerWidth, railVisible: !!info && vis, railInsideViewport: inside, dims: d, scroller: sc, rail: info && { rect: info.rect, n: info.n }, overflow, overflowWithRailHidden: withoutRail, overflowingElements: wideEl, overflowPreExisting, ok: !!info && vis && inside && (!overflow || overflowPreExisting) }
}

try {
  // ============ launch 1: default width + wide
  ;({ app, page } = await launch({ profile: "c30-turn-rail", run }))
  run.installCrashHandlers(() => app.close())

  // (a) one user turn: no rail
  const sidA = await createAndOpenSession(page)
  const fA = await frameFor(sidA)
  await type(fA, `TURN-1-${rand}-single: write 3 numbered sentences about harbors`)
  await waitReply(sidA)
  await waitIdle(sidA, 60000)
  await sleep(1200)
  const aCount = await fA.locator(RAIL).count()
  await runShot(page, run, "1-single")
  rec("rail-hidden-single", aCount === 0, { selector: RAIL, navCount: aCount, expected: 0 })

  // (b) many turns
  const sidB = await createAndOpenSession(page)
  const fB = await frameFor(sidB)
  await turns(sidB, fB)
  await toBottom(fB)
  const info = await railInfo(fB)
  const sc0 = await scrollerState(fB)
  const ov = await overlap(fB)
  await runShot(page, run, "2-rail")
  if (!info) {
    rec("rail-ticks", false, { reason: `no ${RAIL} with ${TURNS} user turns`, scroller: sc0, selector: RAIL })
    for (const id of ["jump", "bottom-highlight"]) rec(id, "NOT RUN", { reason: "no rail rendered" })
  } else {
    const expTitles = Array.from({ length: TURNS }, (_, i) => titleOf(i))
    const titlesOk = info.titles.length === TURNS && info.titles.every((t, i) => t === expTitles[i])
    const labelsOk = info.labels.every((l, i) => l === `Jump to turn ${i + 1}`)
    const scrollable = !!sc0 && sc0.h > sc0.c + 200
    const edgeOk = info.rect.w <= 20 && info.rect.right <= info.viewportW + 1 && ov && ov.textRectsOnTicks === 0
    const geomOk = (ov?.textRectsOnRailBox === 0 || info.rect.w <= 20) && info.rect.right > info.viewportW - 40
    rec("rail-ticks", info.navCount === 1 && info.n === TURNS && titlesOk && labelsOk && info.ariaLabel === "Turns" && scrollable && edgeOk && geomOk, {
      selector: `${RAIL} ${TICK}`,
      expectedTicks: TURNS,
      ticks: info.n,
      navAriaLabel: info.ariaLabel,
      titlesMatch: titlesOk,
      titles: info.titles,
      labelsOk,
      timelineScrollable: scrollable,
      scroller: sc0,
      railRect: info.rect,
      viewportW: info.viewportW,
      tickRects: info.tickRects,
      overlap: ov,
      verticalOrder: info.tickRects.every((r, i, a) => i === 0 || r.y > a[i - 1].y),
    })

    // (c) jump to the first turn, then back to the last one
    const u1 = titleOf(0)
    const c1 = await tickClick(fB, 0)
    const p1 = await userPos(fB, u1)
    const s1 = await scrollerState(fB)
    const i1 = await railInfo(fB)
    await runShot(page, run, "3-jump-first")
    const nearTop = !!p1?.found && p1.top >= -8 && p1.top <= 140
    const firstActive = i1?.active.length === 1 && i1.active[0] === 0
    const c2 = await tickClick(fB, TURNS - 1)
    const s2 = await scrollerState(fB)
    const i2 = await railInfo(fB)
    const nearBottom = !!s2 && s2.fromBottom <= 80
    rec("jump", !c1.blocked && !c2.blocked && nearTop && firstActive && nearBottom && i2?.active.length === 1 && i2.active[0] === TURNS - 1, {
      selector: `${RAIL} ${TICK}[data-oco-turn-index]`,
      pointerBlockedFirst: c1.blocked,
      pointerBlockedLast: c2.blocked,
      note: "a blocked pointer click is a FAIL; the DOM-click fallback only shows whether the jump logic itself works",
      firstUserMsgTopInScroller: p1,
      expectedTopRange: [-8, 140],
      scrollerAfterFirst: s1,
      activeAfterFirst: i1?.active,
      expectedActiveAfterFirst: [0],
      scrollerAfterLast: s2,
      expectedFromBottomMax: 80,
      activeAfterLast: i2?.active,
    })

    // (d) scroll to the bottom by hand after a jump to the top
    await tickClick(fB, 0)
    await toBottom(fB)
    await sleep(500)
    const s3 = await scrollerState(fB)
    const i3 = await railInfo(fB)
    rec("bottom-highlight", !!s3 && s3.fromBottom <= 80 && i3?.active.length === 1 && i3.active[0] === TURNS - 1, {
      scroller: s3,
      active: i3?.active,
      expectedActive: [TURNS - 1],
    })

    // (f) keyboard: Shift+Tab from the composer until a tick is focused, then to tick 0, Enter
    await toBottom(fB)
    const isTick = () => fB.evaluate((T) => { const a = document.activeElement; return a && a.matches?.(T) ? Number(a.dataset.ocoTurnIndex) : null }, TICK)
    await fB.locator('[data-component="prompt-input"]').click()
    let presses = 0
    let focused = null
    for (; presses < 120 && focused === null; presses++) {
      await page.keyboard.press("Shift+Tab")
      focused = await isTick()
    }
    let steps = 0
    while (focused !== null && focused > 0 && steps < TURNS + 2) {
      await page.keyboard.press("Shift+Tab")
      steps++
      focused = await isTick()
    }
    const reached = focused === 0
    let kp = null
    let kactive = null
    if (reached) {
      await page.keyboard.press("Enter")
      await sleep(900)
      kp = await userPos(fB, u1)
      kactive = (await railInfo(fB))?.active
    }
    await runShot(page, run, "4-keyboard")
    rec("keyboard", reached && !!kp?.found && kp.top >= -8 && kp.top <= 140 && kactive?.length === 1 && kactive[0] === 0, {
      shiftTabPressesToFirstTick: presses,
      extraStepsToTick0: steps,
      focusedTickIndex: focused,
      firstUserMsgTopAfterEnter: kp,
      activeAfterEnter: kactive,
    })
  }

  // (e-wide) widen the chat column to >=1200
  await toBottom(fB)
  const widths = await fitGroups(app, page, 1250)
  const wFrame = await frameFor(sidB, 10000)
  await sleep(800)
  await toBottom(wFrame)
  const wc = await widthCheck(wFrame, "wide")
  await runShot(page, run, "5-wide")
  if (wc.frameWidth < 1200) rec("wide", "NOT RUN", { reason: `could not widen the chat frame to >=1200 (got ${wc.frameWidth})`, fitGroupsWidths: widths, ...wc })
  else rec("wide", wc.ok, { ...wc, fitGroupsWidths: widths })
  await app.close().catch(() => {})
  app = null

  // ============ launch 2: three side-by-side panels, each ~260 px wide (same layout as p1b-narrow)
  const W = 260
  ;({ app, page } = await launch({ profile: "c30-turn-rail-260", run }))
  run.installCrashHandlers(() => app?.close())
  const ids = []
  const frameBy = async (sid) => {
    for (const f of await chatFrames(page)) if ((await frameSession(f).catch(() => null)) === sid) return f
    throw new Error("no frame for " + sid)
  }
  for (let i = 0; i < 3; i++) {
    await createAndOpenSession(page, { newPanel: i > 0, wait: false }).then(async (sid) => {
      await waitUntil(async () => { try { await frameBy(sid); return true } catch { return false } }, 60000, 250)
      ids.push(sid)
    })
    await sleep(500)
  }
  const tabsPerGroup = () => page.$$eval(".editor-group-container", (gs) => gs.map((g) => g.querySelectorAll(".tab").length).join(","))
  await command(page, "View: Move Editor into Right Group")
  await waitUntil(async () => (await tabsPerGroup()) === "2,1", 5000)
  await command(page, "View: Move Editor into Right Group")
  await waitUntil(async () => (await tabsPerGroup()) === "2,0,1", 5000)
  await command(page, "View: Focus First Editor Group")
  await waitUntil(() => page.evaluate(() => document.querySelector(".editor-group-container")?.classList.contains("active")), 3000)
  await command(page, "View: Move Editor into Right Group")
  await waitUntil(async () => (await tabsPerGroup()) === "1,1,1", 5000)
  await sleep(300)
  const nw = await fitGroups(app, page, W)
  const fN = await frameFor(ids[1], 60000)
  if (!fN || nw.length !== 3 || nw.some((x) => Math.abs(x - W) > 4)) {
    rec("narrow-260", "NOT RUN", { reason: `layout did not reach 3 x ${W}px`, frameWidths: nw })
  } else {
    const tag = rand + "n"
    await turns(ids[1], fN, tag)
    await toBottom(fN)
    const nc = await widthCheck(fN, "narrow-260")
    const ovn = await overlap(fN)
    await runShot(page, run, "6-narrow-260")
    // clicking a tick must also work at this width
    const cn = await tickClick(fN, 0).catch((e) => ({ blocked: { error: String(e.message).slice(0, 200) } }))
    const pn = await userPos(fN, titleOf(0, tag))
    rec("narrow-260", nc.ok && !cn.blocked && !!pn?.found && pn.top >= -8 && pn.top <= 140, { ...nc, frameWidths: nw, overlap: ovn, tickJumpFirstMsg: pn, pointerBlockedFirst: cn.blocked })
  }
} catch (e) {
  run.record("run", "FAIL", { error: String(e?.message ?? e).slice(0, 500) })
  if (page) await runShot(page, run, "error")
} finally {
  await app?.close().catch(() => {})
  process.exit(run.finish())
}
