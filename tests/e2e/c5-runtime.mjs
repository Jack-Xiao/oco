// oco (patches/opencode/0019): 对话 / 轨迹 / 运行 - runtime view E2E (M5 ring view).
// Verifies the third view "Runtime" (data-oco-view="runtime") as the M5 ring: stations + token, centre card,
// You / Tools / Subagents docks, collapsible replay track, subagent detail panel, log overlay, locale strings,
// permission / question / dismiss flows, stop, 429 retry, widths 560 / 1200 / 1600, motion and reduced motion.
// Every selector below is one of the data-oco-runtime-* attributes of the M5 plan (docs/superpowers/plans/
// 2026-10-08-runtime-m5-ring.md, "数据属性"); the hook element.__ocoRuntime = { seek(t), facts(), frame() } is the
// only other contract. The view is a read-only display: permission / question answers go through the composer
// dock or the REST routes, never through the runtime view.
//
// Timing rule used throughout: a card or row that exists only for a few milliseconds in a single-tool request
// (result / failed / rejected live between "tool ended" and "step finished", which are 1-25 ms apart) is never
// polled. Such states are produced with a slow sibling subagent (mock token WITH-SLOW-SIBLING keeps the request
// in its await-results stage for ~9 s) or read back deterministically with __ocoRuntime.seek() using the part
// times from the REST API.
import { fileURLToPath } from "node:url"
import { createRun } from "./lib/results.mjs"
import { launch, command, waitUntil, chatFrames, frameSession, sleep, runShot, fitGroups, createAndOpenSession } from "./vscode.mjs"
import { api, messages, waitReply, waitIdle, MODEL } from "./server.mjs"

const CHECKS = [
  "toggle-three",
  "idle-state",
  "theme-dark",
  "locale-copy",
  "tool-turn",
  "context-known",
  "last-event",
  "replay",
  "playback",
  "log-overlay",
  "back-to-chat",
  "trajectory-still-works",
  "plan-chip",
  "perm-approve",
  "reply-in-panel",
  "perm-reject",
  "tool-fail",
  "question-route",
  "dismiss",
  "fold",
  "same-command",
  "no-leak",
  "stop",
  "retry",
  "subagent",
  "strip",
  "replay-no-actions",
  "keyboard",
  "think-card",
  "think-expand",
  "width-560",
  "width-wide",
  "ring",
  "motion-on",
  "reduced-motion",
  "width-1600",
  "parallel-subagents",
  "focus-stable",
  "focus-on-change",
  "geometry-stable",
  "legend",
  "summary",
  "fill",
]
const REQUIRED = CHECKS

const run = createRun({ suite: "c5-runtime", required: REQUIRED, scriptPath: fileURLToPath(import.meta.url) })
const health = await api("GET", "/global/health").catch(() => null)
const LOCALE = process.env.OCO_E2E_LOCALE ?? ""
run.setEnv({ serverVersion: health?.version ?? null, modelMode: MODEL.mode, locale: LOCALE || "default" })
const { app, page } = await launch({
  profile: "c5-runtime",
  run,
  settings: { "workbench.colorTheme": "Default Dark Modern" },
  env: LOCALE ? { OCO_DEV_LOCALE: LOCALE } : {},
})

// Copy the checks assert on (plan "i18n 键": ring.status.*, ring.tools.row.rejected, ring.bar.*, ring.legend.*, ring.fold.*).
const COPY = {
  en: {
    runtime: "Runtime",
    standing: "Standing by",
    lastEvent: "Last event",
    rejectedRow: "You rejected the permission request",
    question: "Which color do you prefer?",
    approvalRe: /approval/i,
    roundRe: /Round\s*\d+/i,
    roundTookRe: /Round\s*\d+\s*took/i,
    costRe: /Round cost/i,
    failedRe: /failed/i,
    dismissedRe: /dismissed/i,
    rejectedRe: /rejected/i,
    thinkRe: /reasoning|thinking/i,
    dismissBtn: /^dismiss$/i,
    legend: { think: /thinking/i, run: /running/i, ok: /done/i, err: /failed/i, attn: /needs you/i, declined: /dismissed|rejected/i },
  },
  zh: {
    runtime: "运行",
    standing: "待命",
    lastEvent: "最后事件",
    rejectedRow: "你已拒绝授权",
    question: "Which color do you prefer?",
    approvalRe: /授权/,
    roundRe: /第\s*\d+\s*轮/,
    roundTookRe: /第\s*\d+\s*轮用时/,
    costRe: /本轮花费/,
    failedRe: /失败|失敗/,
    dismissedRe: /已忽略/,
    rejectedRe: /已拒绝/,
    thinkRe: /思考|reasoning|thinking/i,
    dismissBtn: /^忽略$/,
    legend: { think: /思考/, run: /运行/, ok: /完成/, err: /失败/, attn: /需要你/, declined: /忽略|拒绝/ },
  },
}

const L = /^zh(-cn|-sg|-hans)?$/i.test(LOCALE) ? COPY.zh : COPY.en
const isZh = L === COPY.zh
run.installCrashHandlers(() => app.close())
const rand = Math.random().toString(36).slice(2, 7)
const MARK = `rt-${rand}`
let A

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
  const users = async () => ((await messages(A)) ?? []).filter((m) => m.info.role === "user").length
  const before = await users()
  const input = f.locator('[data-component="prompt-input"]')
  await input.waitFor({ state: "visible", timeout: 15000 })
  await input.scrollIntoViewIfNeeded().catch(() => {})
  await input.click()
  await input.focus()
  await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A")
  await page.keyboard.press("Backspace")
  await sleep(100)
  await page.keyboard.type(text, { delay: 4 })
  await sleep(200)
  // The first keystroke right after clearing is occasionally dropped ("SLOW-…" arrived as "LOW-…"); retype once.
  const typed = async () => ((await input.innerText().catch(() => "")) ?? "").replace(/\s+/g, " ").trim()
  if ((await typed()) !== text.replace(/\s+/g, " ").trim()) {
    sendRetyped++
    await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A")
    await page.keyboard.press("Backspace")
    await sleep(150)
    await page.keyboard.type(text, { delay: 4 })
    await sleep(200)
  }
  await page.keyboard.press("Enter")
  const ok = await waitUntil(async () => (await users()) > before, 30000, 100)
  if (!ok) throw new Error("send timed out waiting for user message: " + text)
  // A send is a live action; if anything left the view in replay, return to live so the checks see live state.
  if ((await f.locator("[data-oco-runtime]").getAttribute("data-oco-runtime-mode").catch(() => null)) === "replay") {
    sendLeftReplay++
    await f.locator("[data-oco-runtime-replay-live]").click().catch(() => {})
  }
}
let sendLeftReplay = 0
let sendRetyped = 0

const count = (f, sel) => f.locator(sel).count()
// waitUntil returns the truthy value or null; the checks want a plain boolean.
const until = async (fn, ms, step) => Boolean(await waitUntil(fn, ms, step))
// A clamped card body shows only part of a long text, cut with "…". True when some visible piece of 6+ characters is
// part of the full text (so the card does show that text, just shortened).
const visiblePieceOf = (body, full) =>
  !!full &&
  String(body ?? "")
    .split("…")
    .map((p) => p.replace(/\s+/g, " ").trim())
    .some((p) => p.length >= 6 && full.replace(/\s+/g, " ").includes(p))
// Names the M5 view must never render (plan "禁用名"); counting them is the same assertion everywhere.
const FORBIDDEN = ["question", "reply", "stop", "roster", "stats", "attention"].map((n) => `[data-oco-runtime-${n}]`).join(",")

try {
  await createAndOpenSession(page)
  await waitUntil(async () => {
    for (const f of await chatFrames(page)) A = await frameSession(f).catch(() => null)
    return !!A
  }, 60000, 200)
  let fA = await frameFor(A)
  await ready(fA)

  // ---- helpers bound to the chat frame ----
  const num = (v) => (v === null || v === undefined || v === "" ? NaN : Number(v))
  const attrOf = (sel, name) => fA.locator(sel).first().getAttribute(name).catch(() => null)
  const textOf = async (sel) => ((await fA.locator(sel).first().innerText({ timeout: 2000 }).catch(() => "")) ?? "").trim()
  const modeOf = () => attrOf("[data-oco-runtime]", "data-oco-runtime-mode")
  const stateOf = () => attrOf("[data-oco-runtime-state]", "data-oco-runtime-state")
  const stageOf = () => attrOf("[data-oco-runtime-stage]", "data-oco-runtime-stage")
  const laneKOf = async () => num(await attrOf("[data-oco-runtime-stage]", "data-oco-runtime-lane-k"))
  const cardKindOf = () => attrOf("[data-oco-runtime-card]", "data-oco-runtime-card-kind")
  const youStateOf = () => attrOf("[data-oco-runtime-you]", "data-oco-runtime-you-state")
  const replayTOf = async () => num(await attrOf("[data-oco-runtime-replay]", "data-oco-runtime-replay-t"))
  const pendingFor = async (kind) => ((await api("GET", `/${kind}`)) ?? []).filter((x) => x.sessionID === A)
  const tools = async (name) => ((await messages(A)) ?? []).flatMap((m) => m.parts).filter((p) => p.type === "tool" && p.tool === name)
  const timesOf = (p) => ({ start: p?.state?.time?.start, end: p?.state?.time?.end })
  const approveAll = async (reply = "once") => {
    for (const p of await pendingFor("permission")) await api("POST", `/permission/${p.id}/reply`, { reply }).catch(() => {})
  }
  const openRuntime = async () => {
    if (await count(fA, "[data-oco-runtime]")) return
    await fA.locator('[data-oco-view="runtime"]').first().click()
    await fA.locator("[data-oco-runtime]").waitFor({ state: "visible", timeout: 10000 })
  }
  const goLive = async () => {
    if ((await modeOf()) !== "live") await fA.locator("[data-oco-runtime-replay-live]").click().catch(() => {})
    return until(async () => (await modeOf()) === "live", 5000, 50)
  }
  const pauseFollow = async () => {
    await fA.locator("[data-oco-runtime-replay-pause]").click()
    return until(async () => (await modeOf()) === "replay", 5000, 50)
  }
  // Inspection hook on the runtime root (plan "检查钩子"): facts() = { stage, cardKind, round, request, plan,
  // tools:[{name,state,same}], subs:[{num,state}], youState, status, k, t, + 9 innerText segments }.
  const factsNow = () => fA.evaluate(() => document.querySelector("[data-oco-runtime]")?.__ocoRuntime?.facts?.() ?? null)
  // seek(t) enters replay, pauses and clamps t into [t0, t1]; wait until the frame reached t (or, when t was clamped, until
  // the playhead stopped moving), then let the DOM settle.
  async function seekAt(t) {
    const hooked = await fA.evaluate((x) => {
      const h = document.querySelector("[data-oco-runtime]")?.__ocoRuntime
      if (!h) return false
      h.seek(x)
      return true
    }, t)
    if (!hooked) return null
    let prev = null
    await waitUntil(async () => {
      const f = await factsNow()
      if (!f) return false
      if (Math.abs(f.t - t) < 5) return true
      const stable = prev !== null && prev === f.t && (await modeOf()) === "replay"
      prev = f.t
      return stable
    }, 3000, 80)
    await sleep(150)
    return factsNow()
  }
  // In-page sampler (50 ms) so ordered observations do not depend on Node round-trips.
  const watchStart = () =>
    fA.evaluate(() => {
      const w = window
      clearInterval(w.__ocoWatchTimer)
      w.__ocoWatch = []
      const at = (sel, name) => document.querySelector(sel)?.getAttribute(name) ?? null
      w.__ocoWatchTimer = setInterval(() => {
        if (!document.querySelector("[data-oco-runtime]")) return
        const card = document.querySelector("[data-oco-runtime-card]")
        const r = card?.getBoundingClientRect()
        const k = at("[data-oco-runtime-stage]", "data-oco-runtime-lane-k")
        const sb = document.querySelector("[data-oco-runtime-stage]")?.getBoundingClientRect()
        w.__ocoWatch.push({
          sbox: sb ? `${Math.round(sb.width)}x${Math.round(sb.height)}` : null,
          layout: at("[data-oco-runtime]", "data-oco-runtime-layout"),
          at: Date.now(),
          mode: at("[data-oco-runtime]", "data-oco-runtime-mode"),
          run: at("[data-oco-runtime-state]", "data-oco-runtime-state"),
          stage: at("[data-oco-runtime-stage]", "data-oco-runtime-stage"),
          k: k === null ? null : Number(k),
          kind: card?.getAttribute("data-oco-runtime-card-kind") ?? null,
          tone: card?.getAttribute("data-oco-runtime-card-tone") ?? null,
          rect: r ? [r.x, r.y, r.width, r.height].map(Math.round).join(",") : null,
          you: at("[data-oco-runtime-you]", "data-oco-runtime-you-state"),
          subs: at("[data-oco-runtime-subs]", "data-oco-runtime-subs-mode"),
          pending: !!document.querySelector("[data-oco-runtime-pending]"),
          tools: [...document.querySelectorAll("[data-oco-runtime-tool-row]")].map(
            (e) => e.getAttribute("data-oco-runtime-tool-state") + (e.getAttribute("data-oco-runtime-tool-same") ? "@" + e.getAttribute("data-oco-runtime-tool-same") : ""),
          ),
          cells: [...document.querySelectorAll("[data-oco-runtime-sub-cell]")].map((e) => e.getAttribute("data-oco-runtime-sub-state")),
        })
      }, 50)
    })
  const watchRead = () => fA.evaluate(() => window.__ocoWatch ?? [])
  const watchStop = () =>
    fA.evaluate(() => {
      clearInterval(window.__ocoWatchTimer)
      return window.__ocoWatch ?? []
    })
  const geomOf = () =>
    fA.evaluate(() => {
      const rect = (sel) => {
        const e = document.querySelector(sel)
        if (!e) return null
        const b = e.getBoundingClientRect()
        return [b.x, b.y, b.width, b.height].map(Math.round).join(",")
      }
      // D14: a rectangle depends only on (stage width, stage height, k). Record the stage and frame sizes and the
      // visible host blocks below the runtime root, so a size change from outside the view can be told apart.
      const root = document.querySelector("[data-oco-runtime]")
      const rb = root?.getBoundingClientRect()
      const host = rb
        ? [...document.querySelectorAll("[data-component]")]
            .filter((e) => !root.contains(e) && !e.contains(root))
            .map((e) => [e.getAttribute("data-component"), e.getBoundingClientRect()])
            .filter(([, b]) => b.height > 0 && b.top >= rb.bottom - 1)
            .map(([n, b]) => `${n}:${Math.round(b.height)}`)
            .slice(0, 12)
        : []
      return {
        k: document.querySelector("[data-oco-runtime-stage]")?.getAttribute("data-oco-runtime-lane-k") ?? null,
        dk: document.querySelector("[data-oco-runtime-stage]")?.getAttribute("data-oco-runtime-tools-k") ?? null,
        rects: ["card", "ring", "model", "you", "tools"].map((n) => rect(`[data-oco-runtime-${n}]`)),
        stageBox: rect("[data-oco-runtime-stage]"),
        rootBox: rect("[data-oco-runtime]"),
        frameBox: rect("[data-oco-runtime-frame]"),
        host,
      }
    })
  const overflowOf = () =>
    fA.evaluate(() => {
      const root = document.querySelector("[data-oco-runtime]")
      return { scrollWidth: root ? root.scrollWidth : 0, clientWidth: root ? root.clientWidth : 0, noOverflow: root ? root.scrollWidth <= root.clientWidth + 1 : false }
    })
  const composerStopVisible = () => fA.locator('[data-action="prompt-submit"]').isVisible().catch(() => false)
  // A bash turn the test approves through the composer dock (used by the width checks).
  async function runBashThroughDock(cmd) {
    await send(fA, `Use the bash tool to run: ${cmd}`)
    const dock = fA.locator('[data-component="dock-prompt"][data-kind="permission"]')
    await dock.waitFor({ state: "visible", timeout: 30000 })
    await dock.getByRole("button", { name: /allow once|允许一次|允許一次/i }).click()
    await waitUntil(async () => (await stateOf()) === "working", 5000, 50)
  }

  // 1. toggle-three
  // Check the titlebar toggle has 3 items in exact order: chat, trajectory, runtime
  const views = await fA.locator('[role="tablist"] [data-oco-view]').evaluateAll((els) => els.map((e) => e.getAttribute("data-oco-view")))
  const viewsOrderExact = Array.isArray(views) && views.length === 3 && views[0] === "chat" && views[1] === "trajectory" && views[2] === "runtime"
  const toRuntime = fA.locator('[data-oco-view="runtime"]')
  await toRuntime.waitFor({ state: "visible", timeout: 30000 })
  await toRuntime.click()
  const opened = await fA.locator("[data-oco-runtime]").waitFor({ state: "visible", timeout: 10000 }).then(() => true, () => false)
  const composerVisible = await fA.locator('[data-component="prompt-input"]').isVisible()
  await runShot(page, run, "1-runtime-opened")
  run.record("toggle-three", viewsOrderExact && opened && composerVisible ? "PASS" : "FAIL", { views, viewsOrderExact, opened, composerVisible })

  // 2. idle-state: a session that has never run is standing by; the ring sits at "pre" and the subagent dock is a strip.
  const idleStateAttr = await stateOf()
  const idleStage = await stageOf()
  const idleFocus = await attrOf("[data-oco-runtime-focus]", "data-oco-runtime-focus")
  const idleStateText = await textOf("[data-oco-runtime-state]")
  const idleStateTextMatches = idleStateText.includes(L.standing)
  const idleSubsMode = await attrOf("[data-oco-runtime-subs]", "data-oco-runtime-subs-mode")
  const idleLaneK = await laneKOf()
  const idlePlanChips = await count(fA, "[data-oco-runtime-plan]")
  run.record(
    "idle-state",
    idleStateAttr === "idle" && ["pre", "end"].includes(idleStage) && ["pre", "end"].includes(idleFocus) && idleStateTextMatches ? "PASS" : "FAIL",
    { state: idleStateAttr, stage: idleStage, focus: idleFocus, stateText: idleStateText, idleSubsMode, idleLaneK, idlePlanChips },
  )

  // theme-dark: background relative luminance < 0.2, text foreground > background + 0.3
  const themeCheck = await fA.evaluate(() => {
    function parseRgb(colorStr) {
      const m = colorStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/)
      if (!m) return null
      return { r: parseInt(m[1], 10), g: parseInt(m[2], 10), b: parseInt(m[3], 10), a: m[4] !== undefined ? parseFloat(m[4]) : 1 }
    }
    function relativeLuminance(rgb) {
      const srgb = [rgb.r / 255, rgb.g / 255, rgb.b / 255].map((val) => (val <= 0.03928 ? val / 12.92 : Math.pow((val + 0.055) / 1.055, 2.4)))
      return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2]
    }
    let curr = document.querySelector("[data-oco-runtime]")
    let bgRgb = null
    while (curr) {
      const parsed = parseRgb(window.getComputedStyle(curr).backgroundColor)
      if (parsed && parsed.a > 0.9) {
        bgRgb = parsed
        break
      }
      curr = curr.parentElement
    }
    if (!bgRgb) {
      const bodyParsed = parseRgb(window.getComputedStyle(document.body).backgroundColor)
      if (bodyParsed && bodyParsed.a > 0.9) bgRgb = bodyParsed
    }
    const bgLum = bgRgb ? relativeLuminance(bgRgb) : 1
    // M5: the centre card is the text sample (the caption line was dropped 2026-10-09; data-oco-runtime-focus is now on the stage).
    const textEl = document.querySelector("[data-oco-runtime] [data-oco-runtime-card]") || document.querySelector("[data-oco-runtime]")
    const fgParsed = parseRgb(window.getComputedStyle(textEl).color)
    const fgLum = fgParsed ? relativeLuminance(fgParsed) : 0
    return { bgLum, fgLum, bgDark: bgLum < 0.2, contrastOk: fgLum > bgLum + 0.3 }
  })
  run.record("theme-dark", themeCheck.bgDark && themeCheck.contrastOk ? "PASS" : "FAIL", themeCheck)

  // locale-copy: with OCO_E2E_LOCALE=zh-cn the third toggle label is "运行" and the state text is Chinese; under en it is "Runtime" and English.
  const toggleLabel = (await fA.locator('[data-oco-view="runtime"]').innerText()).trim()
  const stateText = await textOf("[data-oco-runtime-state]")
  const hasHan = /[一-鿿]/.test(stateText)
  const localeMatch = isZh ? toggleLabel === "运行" && hasHan && stateText.includes("待命") : toggleLabel === "Runtime" && !hasHan && stateText.includes("Standing by")
  run.record("locale-copy", localeMatch ? "PASS" : "FAIL", { toggleLabel, stateText, hasHan, localeMatch, locale: LOCALE || "en" })

  // Switch back to chat to send a bash tool turn
  await fA.locator('[data-oco-runtime] [data-oco-view="chat"]').click()
  await fA.locator('[data-component="prompt-input"]').waitFor({ state: "visible", timeout: 10000 })

  // 3. tool-turn (two rounds)
  // Round 1, plain bash: the poll sees You dock "permission" + card "permission" while the ask is pending, the
  // subagent dock stays a strip, and the round ends in stage "end". The "call" card (it lives only from the tool's
  // created to start + EMIT_MS) and the finished bash row are read back deterministically through seek().
  await watchStart()
  await send(fA, `Use the bash tool to run exactly: printf '%s' ${MARK}-tool . Then reply with the output.`)
  await fA.locator('[data-oco-view="runtime"]').click()
  await fA.locator("[data-oco-runtime]").waitFor({ state: "visible", timeout: 10000 })

  let perm
  await waitUntil(async () => (perm = ((await api("GET", "/permission")) ?? []).find((p) => p.sessionID === A)), 30000, 200)
  const ttPermSeen = await until(async () => (await watchRead()).some((s) => s.you === "permission" && s.kind === "permission"), 10000, 100)
  const ttAskStage = (await watchRead()).some((s) => s.stage === "ask")
  const ttPendingBadge = (await count(fA, "[data-oco-runtime-pending]")) >= 1
  const ttYouButtons = await count(fA, "[data-oco-runtime-you] button")
  const ttStatusWhilePending = await textOf("[data-oco-runtime-state]")
  const ttRunWhilePending = await stateOf()
  if (perm) await api("POST", `/permission/${perm.id}/reply`, { reply: "once" })
  await waitReply(A)
  const ttEnded = await until(async () => (await stageOf()) === "end", 15000, 100)
  const ttFocusEnd = await attrOf("[data-oco-runtime-focus]", "data-oco-runtime-focus")
  const ttStatusEnd = await textOf("[data-oco-runtime-state]")
  const log1 = await watchStop()
  await runShot(page, run, "3-tool-turn-done")
  const stripFirstRound = log1.length > 0 && log1.every((s) => s.subs === "strip" && (s.k === null || s.k < 0.5))

  const bash1 = timesOf((await tools("bash")).at(-1))
  const callFacts = bash1.start ? await seekAt(bash1.start + 50) : null
  const callDet = { start: bash1.start, stage: callFacts?.stage ?? null, cardKind: callFacts?.cardKind ?? null }
  const callOk = callDet.stage === "call" && callDet.cardKind === "call"
  const rowFacts = bash1.end ? await seekAt(bash1.end + 1) : null
  const bashRowOk = !!rowFacts?.tools?.some((x) => x.name === "bash" && x.state === "ok")
  await goLive()

  // Round 2, bash + a slow sibling subagent: while the sibling runs the request stays in "await results", so the
  // finished bash is shown as the "result" card (RECENT_MS = 4 s) and the live poll cannot miss it.
  await watchStart()
  await send(fA, `Use the bash tool to run exactly: printf '%s' ${MARK}-result . Then reply with the output. WITH-SLOW-SIBLING`)
  let perm2
  await waitUntil(async () => (perm2 = ((await api("GET", "/permission")) ?? []).find((p) => p.sessionID === A)), 30000, 200)
  if (perm2) await api("POST", `/permission/${perm2.id}/reply`, { reply: "once" })
  const ttResultSeen = await until(async () => (await watchRead()).filter((s) => s.kind === "result").length >= 2, 10000, 100)
  await waitReply(A, 120000)
  const log2 = await watchStop()
  const resultSamples = log2.filter((s) => s.kind === "result")
  const resultTone = resultSamples.every((s) => s.tone === "ok")
  const resultStageWait = resultSamples.every((s) => s.stage === "wait")
  // WITH-SLOW-SIBLING is a mock-model token. A real model that never calls `task` has no "run" subagent cell;
  // the ok tool row on the result card is still required.
  const siblingTask = (await messages(A)).some((m) => (m.parts ?? []).some((p) => p.type === "tool" && p.tool === "task"))
  const resultRows = resultSamples.some((s) => s.tools.some((x) => x.startsWith("ok")) && (!siblingTask || s.cells.includes("run")))
  await waitUntil(async () => (await stageOf()) === "end", 15000, 100)

  run.record(
    "tool-turn",
    ttPermSeen && ttAskStage && ttPendingBadge && ttYouButtons === 0 && L.approvalRe.test(ttStatusWhilePending) &&
      ttEnded && ttFocusEnd === "end" && ttStatusEnd.includes(L.standing) && callOk && bashRowOk && ttResultSeen && resultTone && resultStageWait && resultRows
      ? "PASS"
      : "FAIL",
    { ttPermSeen, ttAskStage, ttPendingBadge, ttYouButtons, ttRunWhilePending, ttStatusWhilePending, ttEnded, ttFocusEnd, ttStatusEnd, callDet, callOk, bashRowOk, ttResultSeen, resultSamples: resultSamples.length, resultTone, resultStageWait, resultRows, siblingTask, resultTools: resultSamples.slice(0, 2).map((s) => s.tools), resultCells: resultSamples.slice(0, 2).map((s) => s.cells) },
  )

  // 4. context-known: after the first receipt the status bar shows the context size (digits); token in/out now live in the model box receipt.
  await waitUntil(async () => /\d/.test(await textOf("[data-oco-runtime-context]")), 10000, 100)
  const contextText = await textOf("[data-oco-runtime-context]")
  run.record("context-known", /\d/.test(contextText) ? "PASS" : "FAIL", { contextText, modelBox: (await textOf("[data-oco-runtime-model]")).slice(0, 160) })

  // 5. last-event: the top bar shows "Last event …" live; nothing in the panel says the server disconnected.
  const lastEl = fA.locator("[data-oco-runtime-last]")
  const lastExists = await lastEl.isVisible()
  const lastText = (await lastEl.innerText().catch(() => "")).trim()
  const hasLastEventText = lastText.includes(L.lastEvent)
  const panelText = await fA.locator("[data-oco-runtime]").innerText().catch(() => "")
  const noDisconnect = !/disconnect|断连|斷連|断線|斷線/i.test(panelText)
  run.record("last-event", lastExists && hasLastEventText && noDisconnect ? "PASS" : "FAIL", { lastExists, lastText, hasLastEventText, noDisconnect })

  // 6. replay: pause -> mode "replay", the track range is there, seek(t0) shows a state before any request, back to live.
  const liveStageBefore = await stageOf()
  const pauseOk = await pauseFollow()
  const slider = fA.locator('[data-oco-runtime-replay] input[type="range"]')
  const sliderVisible = await slider.waitFor({ state: "visible", timeout: 5000 }).then(() => true, () => false)
  const sliderMax = num(await slider.getAttribute("max").catch(() => null))
  const replayTBefore = await replayTOf()
  const atStart = await seekAt(0)
  const replayTStart = await replayTOf()
  const startStageOk = atStart?.stage === "pre" || atStart?.stage === "say"
  const replayLiveBtn = await fA.locator("[data-oco-runtime-replay-live]").isVisible().catch(() => false)
  const replayBackLive = await goLive()
  await runShot(page, run, "6-replay-tested")
  run.record(
    "replay",
    pauseOk && sliderVisible && sliderMax >= 1 && startStageOk && atStart?.stage !== liveStageBefore && replayTStart < replayTBefore && replayLiveBtn && replayBackLive ? "PASS" : "FAIL",
    { liveStageBefore, pauseOk, sliderVisible, sliderMax, replayTBefore, replayTStart, startStage: atStart?.stage ?? null, startStageOk, replayLiveBtn, replayBackLive },
  )

  // 7. playback: play from t0 advances the playhead, speed cycles 1x/2x/4x/0.5x, first/prev/next move it, ArrowLeft on the root steps back.
  await seekAt(0)
  const pbT0 = await replayTOf()
  const pbStartedReplay = (await modeOf()) === "replay"
  await fA.locator("[data-oco-runtime-replay-play]").click()
  const pbAdvanced = await until(async () => (await replayTOf()) > pbT0 + 800, 8000, 100)
  const speeds = []
  for (let i = 0; i < 4; i++) {
    await fA.locator("[data-oco-runtime-replay-speed]").click()
    const sp = ((await fA.locator("[data-oco-runtime-replay-speed]").innerText()) ?? "").trim()
    speeds.push(Number(/[\d.]+/.exec(sp)?.[0] ?? NaN))
  }
  const speedCycle = JSON.stringify(speeds) === JSON.stringify([2, 4, 0.5, 1])
  // Pause if still playing (a short timeline may already have ended and stopped by itself).
  if ((await fA.locator("[data-oco-runtime-replay-play]").getAttribute("aria-label"))?.match(/Pause|暂停|暫停/)) {
    await fA.locator("[data-oco-runtime-replay-play]").click()
  }
  const pbHeldAt = await replayTOf()
  await sleep(900)
  const pbHeld = (await replayTOf()) === pbHeldAt
  await fA.locator("[data-oco-runtime-replay-first]").click()
  const pbFirstT = await replayTOf()
  const pbAtFirst = pbFirstT < pbHeldAt && pbFirstT <= pbT0 + 2000
  await fA.locator("[data-oco-runtime-replay-next]").click()
  const pbN1 = await replayTOf()
  await fA.locator("[data-oco-runtime-replay-next]").click()
  const pbN2 = await replayTOf()
  const pbNext = pbN1 > pbFirstT && pbN2 > pbN1
  await fA.locator("[data-oco-runtime-replay-prev]").click()
  const pbP1 = await replayTOf()
  const pbPrev = pbP1 < pbN2
  await fA.locator("[data-oco-runtime]").evaluate((el) => el.focus())
  await page.keyboard.press("ArrowLeft")
  const pbKeyBack = await until(async () => (await replayTOf()) < pbP1, 2000, 50)
  const pbBackLive = (await goLive()) && (await modeOf()) === "live"
  run.record(
    "playback",
    pbStartedReplay && pbAdvanced && speedCycle && pbHeld && pbAtFirst && pbNext && pbPrev && pbKeyBack && pbBackLive ? "PASS" : "FAIL",
    { pbT0, pbStartedReplay, pbAdvanced, speeds, speedCycle, pbHeld, pbHeldAt, pbFirstT, pbAtFirst, pbN1, pbN2, pbNext, pbP1, pbPrev, pbKeyBack, pbBackLive },
  )

  // 8. log-overlay: the entry is in the status bar; Esc closes it and focus returns to the entry; a row jumps into replay.
  const logBtn = fA.locator("[data-oco-runtime-log-open]")
  const logBtnVisible = await logBtn.isVisible().catch(() => false)
  // The entry lives in the status bar, i.e. below the stage.
  const logInSummary = await fA.evaluate(() => {
    const b = document.querySelector("[data-oco-runtime-log-open]")?.getBoundingClientRect()
    const s = document.querySelector("[data-oco-runtime-stage]")?.getBoundingClientRect()
    return !!b && !!s && b.top >= s.bottom - 1
  })
  await logBtn.click()
  const ovVisible = await fA.locator("[data-oco-runtime-log-panel]").waitFor({ state: "visible", timeout: 3000 }).then(() => true, () => false)
  const ovRows = await count(fA, "[data-oco-runtime-log-panel] [data-oco-runtime-event]")
  await fA.locator('[data-oco-runtime-log-filter="error"]').click()
  const ovErrPressed = (await fA.locator('[data-oco-runtime-log-filter="error"]').getAttribute("aria-pressed")) === "true"
  const ovErrRows = await count(fA, "[data-oco-runtime-log-panel] [data-oco-runtime-event]")
  await fA.locator('[data-oco-runtime-log-filter="all"]').click()
  await page.keyboard.press("Escape")
  const ovClosed = await fA.locator("[data-oco-runtime-log-panel]").waitFor({ state: "detached", timeout: 3000 }).then(() => true, () => false)
  const ovFocusBack = await logBtn.evaluate((el) => document.activeElement === el).catch(() => false)
  await logBtn.click()
  await fA.locator("[data-oco-runtime-log-panel]").waitFor({ state: "visible", timeout: 3000 }).catch(() => {})
  const rowTotal = await count(fA, "[data-oco-runtime-log-panel] [data-oco-runtime-event]")
  await fA.locator("[data-oco-runtime-log-panel] [data-oco-runtime-event]").nth(Math.min(1, Math.max(0, rowTotal - 1))).click()
  const rowJumped = await until(async () => (await modeOf()) === "replay", 3000, 50)
  if (await fA.locator("[data-oco-runtime-log-panel]").isVisible().catch(() => false)) await page.keyboard.press("Escape")
  await goLive()
  run.record(
    "log-overlay",
    logBtnVisible && logInSummary && ovVisible && ovRows >= 1 && ovErrPressed && ovErrRows <= ovRows && ovClosed && ovFocusBack && rowJumped ? "PASS" : "FAIL",
    { logBtnVisible, logInSummary, ovVisible, ovRows, ovErrPressed, ovErrRows, ovClosed, ovFocusBack, rowTotal, rowJumped },
  )

  // 9. back-to-chat: switching back to Chat shows the normal timeline.
  await fA.locator('[data-oco-runtime] [data-oco-view="chat"]').click()
  const chatBack = await fA.locator('[data-component="user-message"]').first().waitFor({ state: "visible", timeout: 10000 }).then(() => true, () => false)
  const runtimeGone = (await count(fA, "[data-oco-runtime]")) === 0
  run.record("back-to-chat", chatBack && runtimeGone ? "PASS" : "FAIL", { chatBack, runtimeGone })

  // 10. trajectory-still-works: Trajectory -> Chat still behaves like c4's toggle-open/back-to-chat.
  await fA.locator('[data-oco-view="trajectory"]').click()
  const trajOpened = await fA.locator("[data-oco-trajectory]").waitFor({ state: "visible", timeout: 10000 }).then(() => true, () => false)
  const composerInTraj = await fA.locator('[data-component="prompt-input"]').isVisible()
  await fA.locator('[data-oco-trajectory] [data-oco-view="chat"]').click()
  const chatBackAgain = await fA.locator('[data-component="user-message"]').first().waitFor({ state: "visible", timeout: 10000 }).then(() => true, () => false)
  const trajGone = (await count(fA, "[data-oco-trajectory]")) === 0
  run.record("trajectory-still-works", trajOpened && composerInTraj && chatBackAgain && trajGone ? "PASS" : "FAIL", { trajOpened, composerInTraj, chatBackAgain, trajGone })

  // ---- plan, permissions, tool errors, questions, repeated commands ----
  await openRuntime()

  // 11. plan-chip: no chip until a todowrite has been written; "a; b; c" (first done, second in progress) reads 1/3.
  const planBefore = await count(fA, "[data-oco-runtime-plan]")
  await send(fA, "Use the todowrite tool to plan: alpha; beta; gamma. Mark the first completed, the second in_progress, and the third pending.")
  await waitReply(A)
  const planShown = await until(async () => (await attrOf("[data-oco-runtime-plan]", "data-oco-runtime-plan")) === "1/3", 10000, 100)
  const planText = await textOf("[data-oco-runtime-plan]")
  // a real pointer click (Playwright hit-tests it, so a pointer-events: none parent fails here) opens the plan list
  const planClicked = await fA.locator("[data-oco-runtime-plan]").click({ timeout: 3000 }).then(() => true, () => false)
  const planPanel = await fA.locator('[data-oco-runtime-card-panel="plan"]').waitFor({ state: "visible", timeout: 3000 }).then(() => true, () => false)
  const planPanelItems = planPanel ? await fA.locator('[data-oco-runtime-card-panel="plan"] li').count() : 0
  await page.keyboard.press("Escape")
  const planPanelClosed = await fA.locator("[data-oco-runtime-card-panel]").waitFor({ state: "detached", timeout: 3000 }).then(() => true, () => false)
  run.record(
    "plan-chip",
    idlePlanChips === 0 && planBefore === 0 && planShown && planText.includes("1/3") && planClicked && planPanel && planPanelItems === 3 && planPanelClosed ? "PASS" : "FAIL",
    { idlePlanChips, planBefore, planShown, planText, planClicked, planPanel, planPanelItems, planPanelClosed },
  )

  // 12. perm-approve & reply-in-panel: a bash ask shows the pending badge in the top bar, the You dock reads "permission"
  // (no button in it) and the centre card shows the permission; the composer dock carries the 3 buttons;
  // "allow once" lets the tool finish and clears pending.
  const bashBefore = (await tools("bash")).length
  await send(fA, `Use the bash tool to run exactly: printf '%s' ${MARK}-approve . Then reply with the output.`)
  const approvePendingSeen = await until(async () => (await count(fA, "[data-oco-runtime-pending]")) >= 1, 30000, 100)
  const pendingBadgeVal = approvePendingSeen ? await attrOf("[data-oco-runtime-pending]", "data-oco-runtime-pending") : null
  const youPermission = await until(async () => (await youStateOf()) === "permission" && (await cardKindOf()) === "permission", 10000, 100)
  const youButtons = await count(fA, "[data-oco-runtime-you] button")
  const youOptionButtons = await count(fA, "[data-oco-runtime-you-option] button")
  const forbiddenWhilePending = await count(fA, FORBIDDEN)

  const permDock = fA.locator('[data-component="dock-prompt"][data-kind="permission"]')
  const permToolVis = await permDock.waitFor({ state: "visible", timeout: 15000 }).then(() => true, () => false)
  const denyBtn = permDock.getByRole("button", { name: /^deny$|拒绝|拒絕/i })
  const alwaysBtn = permDock.getByRole("button", { name: /allow always|始终允许|总是允许|永遠允許/i })
  const onceBtn = permDock.getByRole("button", { name: /allow once|允许一次|允許一次/i })
  const inDockOnce = (await onceBtn.count()) === 1
  const inDockAlways = (await alwaysBtn.count()) === 1
  const inDockReject = (await denyBtn.count()) === 1
  const replyButtonsUnique = inDockOnce && inDockAlways && inDockReject && forbiddenWhilePending === 0

  await onceBtn.click()
  const approveCleared = await until(
    async () => (await count(fA, "[data-oco-runtime-pending]")) === 0 && (await pendingFor("permission")).length === 0,
    30000,
    100,
  )
  await waitReply(A)
  const approveTool = (await tools("bash")).slice(bashBefore).at(-1)
  run.record(
    "perm-approve",
    approvePendingSeen && pendingBadgeVal === "1" && youPermission && youButtons === 0 && approveCleared && approveTool?.state?.status === "completed" ? "PASS" : "FAIL",
    { approvePendingSeen, pendingBadgeVal, youPermission, youButtons, approveCleared, toolStatus: approveTool?.state?.status ?? null },
  )
  run.record(
    "reply-in-panel",
    permToolVis && replyButtonsUnique && youPermission && youButtons === 0 && youOptionButtons === 0 && approveCleared && approveTool?.state?.status === "completed" ? "PASS" : "FAIL",
    { permToolVis, replyButtonsUnique, forbiddenWhilePending, youButtons, youOptionButtons, inDockOnce, inDockAlways, inDockReject, approveCleared, toolStatus: approveTool?.state?.status ?? null },
  )

  // 13. perm-reject: "deny" ends the tool with an error and clears pending. With a slow sibling subagent the request stays
  // in "await results", so the "rejected" card (RECENT_MS) is observable; it and the tool row use the neutral style
  // (D18): the row says "You rejected the permission request", never "Failed", and its colour is not --rt-err.
  const rejectBefore = (await tools("bash")).length
  await send(fA, `Use the bash tool to run exactly: cat <<< ${MARK}-reject . Then reply with the output. WITH-SLOW-SIBLING`)
  const rejectPendingSeen = await until(async () => (await count(fA, "[data-oco-runtime-pending]")) >= 1, 30000, 100)
  const rejectDock = fA.locator('[data-component="dock-prompt"][data-kind="permission"]')
  await rejectDock.waitFor({ state: "visible", timeout: 15000 })
  await rejectDock.getByRole("button", { name: /^deny$|拒绝|拒絕/i }).click()
  const rejectCleared = await until(async () => (await count(fA, "[data-oco-runtime-pending]")) === 0 && (await pendingFor("permission")).length === 0, 30000, 100)
  const rejectedCard = await until(async () => (await cardKindOf()) === "rejected", 8000, 50)
  const rejInfo = await fA.evaluate((phrase) => {
    const root = document.querySelector("[data-oco-runtime]")
    // Resolve --rt-err inside the row itself so the probe follows the same cascade as the row's own text.
    const colorOf = (css, host) => {
      const p = document.createElement("span")
      p.style.color = css
      host.appendChild(p)
      const c = getComputedStyle(p).color
      p.remove()
      return c
    }
    const deepest = (scope) => {
      if (!scope) return null
      let best = null
      for (const e of [scope, ...scope.querySelectorAll("*")]) if ((e.textContent ?? "").includes(phrase)) best = e
      return best
    }
    const rows = [...document.querySelectorAll("[data-oco-runtime-tool-row]")]
    const errRow = rows.find((r) => r.getAttribute("data-oco-runtime-tool-state") === "err")
    const rowEl = deepest(errRow)
    const card = document.querySelector("[data-oco-runtime-card]")
    return {
      rowState: errRow?.getAttribute("data-oco-runtime-tool-state") ?? null,
      rowText: (errRow?.innerText ?? "").replace(/\s+/g, " ").trim(),
      rowColor: rowEl ? getComputedStyle(rowEl).color : null,
      errColor: colorOf("var(--rt-err)", errRow ?? root),
      cardKind: card?.getAttribute("data-oco-runtime-card-kind") ?? null,
      cardTone: card?.getAttribute("data-oco-runtime-card-tone") ?? null,
      cardText: (card?.innerText ?? "").replace(/\s+/g, " ").trim(),
    }
  }, L.rejectedRow)
  await waitIdle(A, 120000)
  const rejectTool = (await tools("bash")).slice(rejectBefore).at(-1)
  const rejRowOk = rejInfo.rowState === "err" && rejInfo.rowText.includes(L.rejectedRow) && !L.failedRe.test(rejInfo.rowText) && !rejInfo.rowText.includes("✗")
  const rejNeutral = rejInfo.rowColor !== null && rejInfo.rowColor !== rejInfo.errColor && rejInfo.cardTone !== "err"
  run.record(
    "perm-reject",
    rejectPendingSeen && rejectCleared && rejectedCard && rejectTool?.state?.status === "error" && rejInfo.cardKind === "rejected" && L.rejectedRe.test(rejInfo.cardText) && rejRowOk && rejNeutral
      ? "PASS"
      : "FAIL",
    { rejectPendingSeen, rejectCleared, rejectedCard, toolStatus: rejectTool?.state?.status ?? null, rejRowOk, rejNeutral, ...rejInfo, cardText: rejInfo.cardText.slice(0, 160) },
  )

  // 14. tool-fail: reading a file that does not exist -> card "failed" (red), tool row "err". Slow sibling keeps the "failed" card live.
  await send(fA, `Use the read tool on missing file nope-${rand}.txt WITH-SLOW-SIBLING`)
  const failedCard = await until(async () => (await cardKindOf()) === "failed", 20000, 50)
  const failInfo = await fA.evaluate(() => {
    const card = document.querySelector("[data-oco-runtime-card]")
    const errRow = [...document.querySelectorAll("[data-oco-runtime-tool-row]")].find((r) => r.getAttribute("data-oco-runtime-tool-state") === "err")
    return {
      cardKind: card?.getAttribute("data-oco-runtime-card-kind") ?? null,
      cardTone: card?.getAttribute("data-oco-runtime-card-tone") ?? null,
      cardText: (card?.innerText ?? "").replace(/\s+/g, " ").trim(),
      rowState: errRow?.getAttribute("data-oco-runtime-tool-state") ?? null,
      rowText: (errRow?.innerText ?? "").replace(/\s+/g, " ").trim(),
    }
  })
  const failBody = await textOf("[data-oco-runtime-card-body]")
  await waitIdle(A, 120000)
  const readPart = (await tools("read")).at(-1)
  const readErrFull = String(readPart?.state?.error ?? "").replace(/\s+/g, " ").trim()
  const readErrHead = readErrFull.slice(0, 12)
  // The card body is clamped to its 3 lines and ends or starts with "…" when the card is narrow (small stage height);
  // the full text stays behind "Full text". Accept a visible piece (6+ characters) of the error as well as the whole head.
  const failErrShown = readErrHead === "" || failInfo.cardText.includes(readErrHead) || visiblePieceOf(failBody, readErrFull)
  run.record(
    "tool-fail",
    failedCard && failInfo.cardTone === "err" && failInfo.rowState === "err" && readPart?.state?.status === "error" && failErrShown ? "PASS" : "FAIL",
    { failedCard, ...failInfo, cardText: failInfo.cardText.slice(0, 160), failBody: failBody.slice(0, 120), failErrShown, readStatus: readPart?.state?.status ?? null, readErrHead },
  )

  // 15. question-route: the question stays in the composer dock; the runtime view shows card "ask" with the question text
  // and the options in the You dock as list items (not buttons). Answering clears pending and the server queue.
  const QUESTION_PROMPT = "Use the question tool (not plain text) to ask which color I prefer, with exactly two options: red and blue. After my answer reply with the color only."
  const qDock = fA.locator('[data-component="dock-prompt"][data-kind="question"]')
  const questionDockUp = () => qDock.isVisible().catch(() => false)
  let questionPendingSeen = false
  for (let attempt = 0; attempt < 2 && !questionPendingSeen; attempt++) {
    // A late tool call replaces prompt-input with the question dock. Do not send again over that dock.
    if (await questionDockUp()) {
      questionPendingSeen = true
      break
    }
    await send(fA, QUESTION_PROMPT)
    questionPendingSeen = await until(async () => (await count(fA, "[data-oco-runtime-pending]")) >= 1 || (await questionDockUp()), 90000, 200)
    if (!questionPendingSeen) await waitIdle(A)
  }
  const qCardAsk = await until(async () => (await cardKindOf()) === "ask", 10000, 100)
  const qCardBody = await textOf("[data-oco-runtime-card-body]")
  const qYouState = await youStateOf()
  const qOpts = await fA.evaluate(() =>
    [...document.querySelectorAll("[data-oco-runtime-you-option]")].map((e) => ({
      tag: e.tagName,
      role: e.getAttribute("role"),
      buttonInside: !!e.querySelector("button, [role=button]"),
    })),
  )
  const qOptionsOk = qOpts.length >= 2 && qOpts.every((o) => o.tag !== "BUTTON" && o.role !== "button" && !o.buttonInside)
  const qYouButtons = await count(fA, "[data-oco-runtime-you] button")
  const qDockVisible = await qDock.waitFor({ state: "visible", timeout: 15000 }).then(() => true, () => false)
  if (qDockVisible) {
    const option = qDock.locator('[data-slot="question-option"]').filter({ has: fA.locator('[data-slot="option-label"]', { hasText: /^blue$/i }) }).first()
    await option.waitFor({ timeout: 10000 })
    await option.click()
    const submit = qDock.getByRole("button", { name: /submit|提交/i }).first()
    await submit.click()
  }
  await waitIdle(A)
  const questionCleared = await until(async () => (await count(fA, "[data-oco-runtime-pending]")) === 0 && (await pendingFor("question")).length === 0, 15000, 100)
  run.record(
    "question-route",
    questionPendingSeen && qCardAsk && (qCardBody.includes(L.question) || visiblePieceOf(qCardBody, L.question)) && qYouState === "need" && qOptionsOk && qYouButtons === 0 && qDockVisible && questionCleared ? "PASS" : "FAIL",
    { questionPendingSeen, qCardAsk, qCardBody: qCardBody.slice(0, 120), qYouState, qOpts, qOptionsOk, qYouButtons, qDockVisible, questionCleared },
  )

  // 16. fold + dismiss: ask again and leave the question unanswered. After 10 s of waiting the track folds the wait
  // (a "≈ waited for you" mark with the elapsed ms); dismissing it ends the round: stage "end", card "dismissed",
  // You dock "dismissed", neutral style (D18). The dock's Dismiss button is used; the REST reject route is the fallback.
  let dismissPendingSeen = false
  for (let attempt = 0; attempt < 2 && !dismissPendingSeen; attempt++) {
    await send(fA, QUESTION_PROMPT)
    dismissPendingSeen = await until(async () => (await count(fA, "[data-oco-runtime-pending]")) >= 1, 15000, 100)
    if (!dismissPendingSeen) await waitIdle(A)
  }
  await sleep(11500)
  const foldEl = fA.locator('[data-oco-runtime-fold="wait"]').first()
  const foldVisible = await until(async () => foldEl.isVisible(), 8000, 200)
  const foldText = foldVisible ? ((await foldEl.textContent().catch(() => "")) ?? "").trim() : ""
  const foldMs = num(await attrOf('[data-oco-runtime-fold="wait"]', "data-oco-runtime-fold-ms"))
  run.record("fold", dismissPendingSeen && foldVisible && foldText.includes("≈") && foldMs >= 10000 ? "PASS" : "FAIL", { dismissPendingSeen, foldVisible, foldText, foldMs })

  const dDock = fA.locator('[data-component="dock-prompt"][data-kind="question"]')
  const dDockVisible = await dDock.waitFor({ state: "visible", timeout: 15000 }).then(() => true, () => false)
  const dismissBtn = dDock.getByRole("button", { name: L.dismissBtn })
  let dismissVia = "none"
  if (dDockVisible && (await dismissBtn.count()) > 0) {
    await dismissBtn.first().click()
    dismissVia = "dock-button"
  } else {
    const qs = await pendingFor("question")
    for (const q of qs) await api("POST", `/question/${q.id}/reject`).catch(() => {})
    if (qs.length) dismissVia = "rest-reject"
  }
  if (dismissVia === "none") {
    run.record("dismiss", "NOT RUN", { reason: "no Dismiss control in the question dock and no pending question to reject through POST /question/:id/reject", dDockVisible })
  } else {
    const dismissedEnd = await until(async () => (await stageOf()) === "end" && (await cardKindOf()) === "dismissed", 10000, 100)
    const dismissInfo = await fA.evaluate(() => {
      const card = document.querySelector("[data-oco-runtime-card]")
      return {
        you: document.querySelector("[data-oco-runtime-you]")?.getAttribute("data-oco-runtime-you-state") ?? null,
        cardTone: card?.getAttribute("data-oco-runtime-card-tone") ?? null,
        cardText: (card?.innerText ?? "").replace(/\s+/g, " ").trim(),
        youText: (document.querySelector("[data-oco-runtime-you]")?.innerText ?? "").replace(/\s+/g, " ").trim(),
      }
    })
    await waitIdle(A)
    const dismissCleared = await until(async () => (await count(fA, "[data-oco-runtime-pending]")) === 0 && (await pendingFor("question")).length === 0, 15000, 100)
    run.record(
      "dismiss",
      dismissedEnd && dismissInfo.you === "dismissed" && dismissInfo.cardTone !== "err" && L.dismissedRe.test(dismissInfo.cardText) && dismissCleared ? "PASS" : "FAIL",
      { dismissVia, dismissedEnd, dismissCleared, ...dismissInfo, cardText: dismissInfo.cardText.slice(0, 160), youText: dismissInfo.youText.slice(0, 160) },
    )
  }

  // 17. same-command: three identical bash calls in one message are numbered 1/3, 2/3, 3/3 on the tool rows.
  await send(fA, `Use the bash tool 3 times in parallel to run: printf '%s' ${MARK}-same`)
  const samePermissions = await until(async () => (await pendingFor("permission")).length >= 3, 30000, 200)
  const sameRowsReady = await until(async () => (await count(fA, "[data-oco-runtime-tool-row]")) >= 3, 10000, 100)
  const sameValues = await fA.evaluate(() =>
    [...document.querySelectorAll("[data-oco-runtime-tool-row]")].map((e) => e.getAttribute("data-oco-runtime-tool-same")).filter(Boolean).sort(),
  )
  for (let i = 0; i < 30 && (await pendingFor("permission")).length; i++) {
    await approveAll()
    await sleep(250)
  }
  await waitReply(A)
  const sameTools = (await tools("bash")).slice(-3)
  run.record(
    "same-command",
    samePermissions && sameRowsReady && JSON.stringify(sameValues) === JSON.stringify(["1/3", "2/3", "3/3"]) && sameTools.length === 3 && sameTools.every((p) => p.state?.status === "completed") ? "PASS" : "FAIL",
    { samePermissions, sameRowsReady, sameValues, statuses: sameTools.map((p) => p.state?.status) },
  )

  // 18. no-leak: pause inside a bash call (the mid-point of state.time.start/end from REST). The row is not "ok" yet and no
  // runtime text carries the command's output. The output (LEAK<rand>) differs from the typed command text
  // ("LEAK <rand>" with a space), so the call card showing the command cannot trigger a false alarm.
  const leakWord = `LEAK${rand}`
  const leakBefore = (await tools("bash")).length
  await send(fA, `Use the bash tool to run exactly: sh -c 'sleep 3; printf "%s%s" LEAK ${rand}' . Then reply with the output.`)
  let permLeak
  await waitUntil(async () => (permLeak = ((await api("GET", "/permission")) ?? []).find((p) => p.sessionID === A)), 30000, 200)
  await sleep(600)
  if (permLeak) await api("POST", `/permission/${permLeak.id}/reply`, { reply: "once" })
  await waitReply(A)
  const leakPart = (await tools("bash")).slice(leakBefore).at(-1)
  const leakTimes = timesOf(leakPart)
  const leakOut = String(leakPart?.state?.output ?? "")
  let leakFacts = null
  if (leakTimes.start && leakTimes.end) leakFacts = await seekAt(Math.floor((leakTimes.start + leakTimes.end) / 2))
  const leakTexts = leakFacts ? Object.values(leakFacts).filter((v) => typeof v === "string").join("\n") : ""
  const leakCardText = await textOf("[data-oco-runtime-card]")
  const leakToolsText = await textOf("[data-oco-runtime-tools]")
  const leakBashRows = (leakFacts?.tools ?? []).filter((x) => x.name === "bash")
  await goLive()
  run.record(
    "no-leak",
    leakOut.includes(leakWord) && leakBashRows.length >= 1 && leakBashRows.every((x) => x.state !== "ok") && !leakTexts.includes(leakWord) && !leakCardText.includes(leakWord) && !leakToolsText.includes(leakWord)
      ? "PASS"
      : "FAIL",
    { leakOut: leakOut.slice(0, 40), leakTimes, midStage: leakFacts?.stage ?? null, leakBashRows, leakInFacts: leakTexts.includes(leakWord), leakInCard: leakCardText.includes(leakWord), leakInTools: leakToolsText.includes(leakWord) },
  )

  // 19. stop: the stop button in the prompt input aborts a long answer; the session leaves "working".
  await send(fA, "Write 300 numbered sentences about the sea.")
  await waitUntil(async () => (await stateOf()) === "working", 15000, 100)
  const stopBtn = fA.locator('[data-action="prompt-submit"]')
  const stopShown = await stopBtn.waitFor({ state: "visible", timeout: 15000 }).then(() => true, () => false)
  const stopAria = stopShown ? await stopBtn.getAttribute("aria-label") : null
  const stopAriaMatches = isZh ? stopAria === "停止" : stopAria === "Stop"
  const runtimeStopGone = (await count(fA, FORBIDDEN)) === 0
  if (stopShown) await stopBtn.click()
  const stopped = await until(async () => (await stateOf()) !== "working", 30000, 100)
  const finalState = await stateOf()
  await waitIdle(A)
  await runShot(page, run, "m2-stop")
  run.record("stop", stopShown && stopAriaMatches && runtimeStopGone && stopped ? "PASS" : "FAIL", { stopShown, stopAria, stopAriaMatches, runtimeStopGone, stopped, finalState })
  await waitIdle(A)

  // 20. retry: one mock 429 -> the view shows retrying with a countdown, then the request completes.
  await fA.evaluate(() => {
    const w = window
    w.__ocoRetrySeen = []
    clearInterval(w.__ocoRetryTimer)
    w.__ocoRetryTimer = setInterval(() => {
      const state = document.querySelector("[data-oco-runtime-state]")?.getAttribute("data-oco-runtime-state") ?? "none"
      const retry = !!document.querySelector("[data-oco-runtime-retry]")
      const key = `${state}${retry ? "+retry" : ""}`
      if (w.__ocoRetrySeen.at(-1) !== key) w.__ocoRetrySeen.push(key)
    }, 50)
  })
  await send(fA, `Reply with exactly this line and nothing else: RETRY-ONCE-${rand}`)
  const retryReply = await waitReply(A, 60000)
  await sleep(500)
  const retrySeq = await fA.evaluate(() => {
    clearInterval(window.__ocoRetryTimer)
    return window.__ocoRetrySeen
  })
  const sawRetrying = retrySeq.includes("retrying+retry")
  const retryText = (retryReply?.parts ?? []).filter((p) => p.type === "text").map((p) => p.text).join("")
  run.record(
    "retry",
    sawRetrying && retrySeq.at(-1)?.startsWith("idle") && retryText.includes(`RETRY-ONCE-${rand}`) ? "PASS" : "FAIL",
    { pollMs: 50, retrySeq, sawRetrying, completed: !!retryReply?.info?.time?.completed, retryText: retryText.slice(0, 80) },
  )

  // ---- subagents, replay without actions, keyboard, thinking ----

  // 21. subagent: dispatch a subagent; its cell appears in the dock (the lane opens); clicking it opens the detail panel;
  // "Open child session" enters the child (child view + breadcrumb); the child reaches lifecycle done; the breadcrumb returns.
  await send(fA, "Use the task tool with the explore agent: probe")
  const subCell = fA.locator("[data-oco-runtime-sub-cell]").last()
  const subCellShown = await subCell.waitFor({ state: "attached", timeout: 30000 }).then(() => true, () => false)
  const subCellUid = subCellShown ? await subCell.getAttribute("data-oco-runtime-sub-cell") : null
  const subLaneOpen = await until(async () => (await laneKOf()) >= 0.99, 5000, 50)
  const subsModeOpen = await attrOf("[data-oco-runtime-subs]", "data-oco-runtime-subs-mode")
  if (subCellShown) await subCell.click({ force: true })
  const subPanel = fA.locator("[data-oco-runtime-sub-panel]")
  const subPanelShown = await subPanel.waitFor({ state: "visible", timeout: 10000 }).then(() => true, () => false)
  const subPanelMode = await attrOf("[data-oco-runtime-sub-panel]", "data-oco-runtime-sub-panel-mode")
  const handoffOpen = fA.locator("[data-oco-runtime-handoff-open]")
  const openShown = await handoffOpen.waitFor({ state: "visible", timeout: 15000 }).then(() => true, () => false)
  if (openShown) await handoffOpen.click()
  const childPanel = fA.locator("[data-oco-runtime-child]")
  const childShown = await childPanel.waitFor({ state: "visible", timeout: 15000 }).then(() => true, () => false)
  const crumbShown = await fA.locator("[data-oco-runtime-crumb]").isVisible().catch(() => false)
  await waitReply(A)
  const childDone = await until(async () => (await attrOf("[data-oco-runtime-child]", "data-oco-runtime-child-lifecycle")) === "done", 30000, 200)
  await fA.locator("[data-oco-runtime-crumb] button").first().click().catch(() => {})
  const crumbGone = await fA.locator("[data-oco-runtime-crumb]").waitFor({ state: "detached", timeout: 5000 }).then(() => true, () => false)
  const noForbiddenSub = (await count(fA, FORBIDDEN)) === 0
  const taskPart = (await tools("task")).at(-1)
  await runShot(page, run, "m2-subagent")
  run.record(
    "subagent",
    subCellShown && subPanelShown && subPanelMode === "detail" && openShown && childShown && crumbShown && childDone && crumbGone && noForbiddenSub && taskPart?.state?.status === "completed" ? "PASS" : "FAIL",
    { subCellUid, subPanelShown, subPanelMode, openShown, childShown, crumbShown, childDone, crumbGone, noForbiddenSub, taskStatus: taskPart?.state?.status ?? null },
  )

  // 22. strip: a new session's first round shows the collapsed strip (lane-k 0); once a task is dispatched the lane opens (lane-k 1).
  run.record(
    "strip",
    idleSubsMode === "strip" && idleLaneK === 0 && stripFirstRound && subLaneOpen && subsModeOpen === "open" ? "PASS" : "FAIL",
    { idleSubsMode, idleLaneK, stripFirstRound, firstRoundSamples: log1.length, subLaneOpen, subsModeOpen },
  )

  // 23. replay-no-actions: with a pending permission, pausing removes the pending chip and the You dock stops saying
  // "permission" (history has no approval timestamps); back to live they return. The permission is rejected at the end.
  await send(fA, `Use the bash tool to run exactly: head -n 1 <<< ${MARK}-replay . Then reply with the output.`)
  const replayAsked = await until(async () => (await count(fA, "[data-oco-runtime-pending]")) >= 1, 30000, 100)
  const liveForbidden = await count(fA, FORBIDDEN)
  const liveYouPerm = await until(async () => (await youStateOf()) === "permission", 10000, 100)
  await pauseFollow()
  const inReplay = (await modeOf()) === "replay"
  const replayForbidden = await count(fA, FORBIDDEN)
  const replayPending = await count(fA, "[data-oco-runtime-pending]")
  const replayYou = await youStateOf()
  await goLive()
  const backPending = await until(async () => (await count(fA, "[data-oco-runtime-pending]")) >= 1, 5000, 100)
  const backYouPerm = await until(async () => (await youStateOf()) === "permission", 5000, 100)
  const dockReplay = fA.locator('[data-component="dock-prompt"][data-kind="permission"]')
  if (await dockReplay.isVisible().catch(() => false)) {
    await dockReplay.getByRole("button", { name: /^deny$|拒绝|拒絕/i }).click().catch(() => {})
  }
  for (const x of await pendingFor("permission")) await api("POST", `/permission/${x.id}/reply`, { reply: "reject" }).catch(() => {})
  await waitReply(A)
  await waitIdle(A)
  await sleep(600)
  run.record(
    "replay-no-actions",
    replayAsked && liveForbidden === 0 && liveYouPerm && inReplay && replayForbidden === 0 && replayPending === 0 && replayYou !== "permission" && backPending && backYouPerm ? "PASS" : "FAIL",
    { replayAsked, liveForbidden, liveYouPerm, inReplay, replayForbidden, replayPending, replayYou, backPending, backYouPerm },
  )

  // 24. keyboard: Tab reaches a subagent cell (role=button), Enter opens the detail panel (focus moves into it), Esc closes it and
  // focus returns to the same cell; no nested buttons; the live region never mentions thinking / reasoning.
  await send(fA, "Use the task tool in the background without retrieving with the explore agent: docked-kb")
  await waitReply(A)
  await sleep(600)
  await waitUntil(async () => (await count(fA, '[data-oco-runtime-sub-cell][data-oco-runtime-sub-state="docked"]')) >= 1, 30000, 200)
  const kbCell = fA.locator('[data-oco-runtime-sub-cell][data-oco-runtime-sub-state="docked"]').last()
  await kbCell.waitFor({ state: "attached", timeout: 10000 }).catch(() => {})
  const kbUid = await kbCell.getAttribute("data-oco-runtime-sub-cell").catch(() => null)
  const kbRole = await kbCell.getAttribute("role").catch(() => null)
  await fA.locator('[data-oco-view="chat"]').first().focus().catch(() => {})
  let tabFocused = false
  for (let i = 0; i < 60; i++) {
    await page.keyboard.press("Tab")
    if (await kbCell.evaluate((el) => document.activeElement === el).catch(() => false)) {
      tabFocused = true
      break
    }
  }
  if (!tabFocused) await kbCell.focus().catch(() => {})
  await page.keyboard.press("Enter")
  const kbPanelShown = await fA.locator("[data-oco-runtime-sub-panel]").waitFor({ state: "visible", timeout: 5000 }).then(() => true, () => false)
  const kbFocusInPanel = await fA.evaluate(() => !!document.querySelector("[data-oco-runtime-sub-panel]")?.contains(document.activeElement))
  await page.keyboard.press("Escape")
  const kbPanelClosed = await fA.locator("[data-oco-runtime-sub-panel]").waitFor({ state: "detached", timeout: 3000 }).then(() => true, () => false)
  const kbFocusBack = await fA.evaluate((uid) => document.activeElement?.getAttribute("data-oco-runtime-sub-cell") === uid, kbUid)
  const nestedButtonCount = await count(fA, "[data-oco-runtime] button button")
  const liveText = ((await fA.locator("[data-oco-runtime-live]").first().textContent().catch(() => "")) ?? "").trim()
  const liveHasReasoning = L.thinkRe.test(liveText)
  run.record(
    "keyboard",
    kbRole === "button" && kbPanelShown && kbFocusInPanel && kbPanelClosed && kbFocusBack && nestedButtonCount === 0 && liveText.length > 0 && !liveHasReasoning ? "PASS" : "FAIL",
    { kbUid, kbRole, tabFocused, kbPanelShown, kbFocusInPanel, kbPanelClosed, kbFocusBack, nestedButtonCount, liveText: liveText.slice(0, 100), liveHasReasoning },
  )

  // 25. think-card: while the model thinks the centre card has kind "think" and keeps one fixed rectangle.
  await watchStart()
  await send(fA, `SLOW-REASON-${MARK}`)
  await waitReply(A)
  await sleep(300)
  const thinkLog = await watchStop()
  const thinkSamples = thinkLog.filter((s) => s.kind === "think")
  const thinkRects = [...new Set(thinkSamples.map((s) => s.rect))]
  // D14: the card rectangle depends only on (stage width, stage height, k); the host can resize the stage mid-round
  // (its todo dock comes and goes with the busy state), so samples are compared only within one (layout, stage size, k) key.
  const thinkGroups = {}
  for (const s of thinkSamples) {
    const key = `${s.layout}|${s.sbox}|${s.k}`
    ;(thinkGroups[key] ??= { n: 0, rects: new Set() }).n++
    thinkGroups[key].rects.add(s.rect)
  }
  const thinkGroupList = Object.entries(thinkGroups).map(([key, g]) => ({ key, n: g.n, rects: [...g.rects] }))
  const thinkStable = thinkGroupList.every((g) => g.rects.length === 1 && g.rects[0] !== null)
  const thinkBigGroup = thinkGroupList.some((g) => g.n >= 3)
  run.record(
    "think-card",
    thinkSamples.length >= 3 && thinkBigGroup && thinkStable ? "PASS" : "FAIL",
    { thinkSamples: thinkSamples.length, thinkRects, thinkGroups: thinkGroupList, stagesSeen: [...new Set(thinkLog.map((s) => s.stage))] },
  )

  // 26. think-expand: clicking the card opens the full-text overlay while the model thinks; Esc closes it and focus returns to the card.
  // THINK-FIRST makes the model reason for ~1.8 s before it calls the bash tool.
  await send(fA, `THINK-FIRST Use the bash tool to run exactly: printf '%s' ${MARK}-tf . Then reply with the output.`)
  const expandBtn = fA.locator("[data-oco-runtime-card-expand]")
  const expandReady = await until(
    async () => (await cardKindOf()) === "think" && (await expandBtn.evaluate((el) => !(el.disabled || el.getAttribute("aria-disabled") === "true")).catch(() => false)),
    10000,
    25,
  )
  if (expandReady) await expandBtn.click({ timeout: 3000 }).catch(() => {})
  const thinkPanelOpen = await fA.locator("[data-oco-runtime-card-panel]").waitFor({ state: "visible", timeout: 3000 }).then(() => true, () => false)
  const thinkPanelText = ((await fA.locator("[data-oco-runtime-card-panel]").first().innerText().catch(() => "")) ?? "").length
  await page.keyboard.press("Escape")
  const thinkPanelClosed = await fA.locator("[data-oco-runtime-card-panel]").waitFor({ state: "detached", timeout: 3000 }).then(() => true, () => false)
  const expandFocusBack = await expandBtn.evaluate((el) => document.activeElement === el).catch(() => false)
  await waitUntil(async () => (await pendingFor("permission")).length >= 1, 30000, 200)
  await approveAll()
  await waitReply(A)
  run.record(
    "think-expand",
    expandReady && thinkPanelOpen && thinkPanelText > 0 && thinkPanelClosed && expandFocusBack ? "PASS" : "FAIL",
    { expandReady, thinkPanelOpen, thinkPanelText, thinkPanelClosed, expandFocusBack },
  )

  // ---- widths, ring, motion ----
  // The width-420 check is retired (420 px is outside the 560-1600 spec, plan open question 2).

  // 27. width-560: stacked layout, no horizontal scroll, stage visible, no forbidden attributes.
  await fitGroups(app, page, 560)
  await runBashThroughDock("perl -e 'sleep 3'")
  const w560Forbidden = await count(fA, FORBIDDEN)
  const w560ComposerStopVis = await composerStopVisible()
  const w560FocusVis = await fA.locator("[data-oco-runtime-focus]").isVisible().catch(() => false)
  const w560Overflow = await overflowOf()
  const w560Layout = await attrOf("[data-oco-runtime]", "data-oco-runtime-layout")
  await page.screenshot({ path: run.artifact("width-560.png") })
  await waitIdle(A)
  run.record(
    "width-560",
    w560Forbidden === 0 && w560ComposerStopVis && w560FocusVis && w560Overflow.noOverflow && w560Layout === "stack" ? "PASS" : "FAIL",
    { forbidden: w560Forbidden, composerStopVisible: w560ComposerStopVis, focusVisible: w560FocusVis, layout: w560Layout, ...w560Overflow },
  )

  // 28. width-wide (1200): wide layout, single-line top bar, no horizontal scroll. The same running bash call (8 s) is
  // used for the ring, motion-on and reduced-motion checks below, which all need the request to be live.
  await fitGroups(app, page, 1200)
  await runBashThroughDock("python3 -c 'import time; time.sleep(8)'")

  // ring: 6 stations with exactly one lit while running, the counter row says round N, the model box is there.
  // "state=working" can be set a moment before the ring re-renders the new round, so poll (50 ms, up to 3 s) for a
  // running stage and record how long that took (ringWaitMs) plus the first sample, so a lag stays visible.
  const ringSample = () => fA.evaluate(() => ({
    ring: !!document.querySelector("[data-oco-runtime-ring]"),
    pills: document.querySelectorAll("[data-oco-runtime-pill]").length,
    lit: document.querySelectorAll('[data-oco-runtime-pill-lit="true"]').length,
    counter: (document.querySelector("[data-oco-runtime-counter]")?.innerText ?? "").replace(/\s+/g, " ").trim(),
    model: !!document.querySelector("[data-oco-runtime-model]"),
    stage: document.querySelector("[data-oco-runtime-stage]")?.getAttribute("data-oco-runtime-stage") ?? null,
  }))
  const ringFirst = await ringSample()
  const ringT0 = Date.now()
  let ringInfo = ringFirst
  await until(async () => {
    ringInfo = await ringSample()
    return ringInfo.lit === 1 && ringInfo.stage !== "end" && ringInfo.stage !== "pre"
  }, 3000, 50)
  ringInfo = { ...ringInfo, ringWaitMs: Date.now() - ringT0, ringFirst }
  run.record(
    "ring",
    ringInfo.ring && ringInfo.pills === 6 && ringInfo.lit === 1 && L.roundRe.test(ringInfo.counter) && ringInfo.model ? "PASS" : "FAIL",
    ringInfo,
  )

  // motion-on: while the request runs the token or a t-driven group (packet, flowing dashes) moves within 400 ms.
  const motionSnap = () =>
    fA.evaluate(() => {
      const tok = document.querySelector("[data-oco-runtime-token]")
      const anim = [...document.querySelectorAll(".oco-loop-anim")]
      const sig = anim
        .map((e) =>
          [e.getAttribute("transform"), e.getAttribute("stroke-dashoffset"), e.style.transform, e.style.strokeDashoffset, ...[...e.querySelectorAll("[stroke-dashoffset],[transform]")].map((c) => c.getAttribute("stroke-dashoffset") + "|" + c.getAttribute("transform"))].join("~"),
        )
        .join("##")
      const dashed = [...document.querySelectorAll(".oco-loop-anim[stroke-dashoffset], .oco-loop-anim [stroke-dashoffset]")]
      return {
        count: anim.length,
        pos: tok?.getAttribute("data-oco-runtime-token-pos") ?? null,
        tgt: tok?.getAttribute("data-oco-runtime-token-tgt") ?? null,
        sig,
        dashOffsets: dashed.map((e) => Number(e.getAttribute("stroke-dashoffset") ?? 0)),
      }
    })
  let motionOnPass = false
  const motionTrail = []
  for (let i = 0; i < 6 && !motionOnPass; i++) {
    const a = await motionSnap()
    await sleep(420)
    const b = await motionSnap()
    motionTrail.push({ count: a.count, posA: a.pos, posB: b.pos, sigChanged: a.sig !== b.sig })
    if (a.count >= 1 && (a.pos !== b.pos || a.sig !== b.sig)) motionOnPass = true
  }
  run.record("motion-on", motionOnPass ? "PASS" : "FAIL", { motionTrail })

  // reduced-motion: with reduce, the token sits on its target and the dashed lines carry no dash offset.
  await page.emulateMedia({ reducedMotion: "reduce" })
  let reducedSnap = null
  const reducedPass = await until(
    async () => {
      reducedSnap = await motionSnap()
      return reducedSnap.count >= 1 && reducedSnap.pos !== null && reducedSnap.pos === reducedSnap.tgt && reducedSnap.dashOffsets.every((v) => v === 0)
    },
    3000,
    100,
  )
  await page.emulateMedia({ reducedMotion: "no-preference" })
  run.record("reduced-motion", reducedPass ? "PASS" : "FAIL", { reducedSnap })

  // width-wide measurements (taken while the call is still running).
  await waitUntil(async () => (await stateOf()) === "working", 5000, 50)
  const wWideForbidden = await count(fA, FORBIDDEN)
  const wWideComposerStopVis = await composerStopVisible()
  const wWideFocusVis = await fA.locator("[data-oco-runtime-focus]").isVisible().catch(() => false)
  const wWideOverflow = await overflowOf()
  const wWideLayout = await attrOf("[data-oco-runtime]", "data-oco-runtime-layout")
  const topBarSingleLine = await fA.evaluate(() => {
    const top = document.querySelector("[data-oco-runtime-frame] .top")
    if (!top) return false
    const children = [...top.children]
    if (children.length < 2) return true
    const firstTop = Math.round(children[0].getBoundingClientRect().top)
    return children.every((c) => Math.abs(Math.round(c.getBoundingClientRect().top) - firstTop) <= 4)
  })
  await page.screenshot({ path: run.artifact("width-wide.png") })
  await waitIdle(A)
  run.record(
    "width-wide",
    wWideForbidden === 0 && wWideComposerStopVis && wWideFocusVis && wWideOverflow.noOverflow && wWideLayout === "wide" && topBarSingleLine ? "PASS" : "FAIL",
    { forbidden: wWideForbidden, composerStopVisible: wWideComposerStopVis, focusVisible: wWideFocusVis, layout: wWideLayout, topBarSingleLine, ...wWideOverflow },
  )

  // ---- full-screen width, parallel subagents, geometry and focus stability ----
  await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0]
    const [width] = w.getSize()
    w.setSize(width, 1120)
  })
  await fitGroups(app, page, 1600)

  await send(fA, "Use the task tool 3 times in parallel: find callers; check cache; read docs")
  let parRunCells = 0
  let parRunProbes = 0
  const parSeen = await until(async () => {
    parRunCells = await count(fA, '[data-oco-runtime-sub-cell][data-oco-runtime-sub-state="run"]')
    parRunProbes = await count(fA, '[data-oco-runtime-probe][data-oco-runtime-probe-stage="running"]')
    return parRunCells >= 3 && parRunProbes >= 3
  }, 20000, 100)

  // The lane opens with a LANE_MS (420 ms) smoothstep from the first task; cells and docks move while lane-k < 1.
  // focus-stable and geometry-stable compare rectangles at the same lane-k, so wait for the lane to settle first.
  await until(async () => (await laneKOf()) === 1, 3000, 50)

  // focus-stable: the same cell node keeps its identity, position and keyboard focus while updates stream in.
  const cell1 = fA.locator('[data-oco-runtime-sub-cell][data-oco-runtime-sub-state="run"]').first()
  const cell1Uid = await cell1.getAttribute("data-oco-runtime-sub-cell").catch(() => null)
  const cell1Sel = `[data-oco-runtime-sub-cell="${cell1Uid}"]`
  const rect0 = await fA.evaluate((sel) => {
    const el = document.querySelector(sel)
    if (!el) return null
    el.__ocoNodeMark = 42
    el.focus()
    window.__ocoFocused = document.activeElement
    const r = el.getBoundingClientRect()
    return [r.x, r.y, r.width, r.height].map(Math.round).join(",")
  }, cell1Sel)

  const w1600Forbidden = await count(fA, FORBIDDEN)
  const w1600ComposerStopVis = await composerStopVisible()
  const w1600FocusVis = await fA.locator("[data-oco-runtime-focus]").isVisible().catch(() => false)
  const w1600Overflow = await overflowOf()
  const w1600Layout = await attrOf("[data-oco-runtime]", "data-oco-runtime-layout")
  const w1600FrameCheck = await fA.evaluate(() => {
    const frame = document.querySelector("[data-oco-runtime-frame]")
    const sum = document.querySelector("[data-oco-runtime-summary]")
    const fb = frame?.getBoundingClientRect()
    const sb = sum?.getBoundingClientRect()
    return {
      rootScrolls: frame ? frame.scrollHeight > frame.clientHeight + 1 : null,
      summaryVisible: !!fb && !!sb && sb.bottom <= fb.bottom + 1,
      frameClientHeight: frame?.clientHeight ?? 0,
      frameScrollHeight: frame?.scrollHeight ?? 0,
    }
  })
  const geomRunning = await geomOf()
  await page.screenshot({ path: run.artifact("par-running.png") })

  await sleep(1500)
  const rect1 = await fA.evaluate((sel) => {
    const el = document.querySelector(sel)
    if (!el) return null
    const r = el.getBoundingClientRect()
    return [r.x, r.y, r.width, r.height].map(Math.round).join(",")
  }, cell1Sel)
  const geomRunning2 = await geomOf()
  const nodeMarkKept = await fA.evaluate((sel) => document.querySelector(sel)?.__ocoNodeMark === 42, cell1Sel)
  const focusKept = await fA.evaluate(() => !!window.__ocoFocused && window.__ocoFocused === document.activeElement && window.__ocoFocused.isConnected)
  const stillRunning = (await count(fA, '[data-oco-runtime-sub-cell][data-oco-runtime-sub-state="run"]')) >= 1
  run.record("focus-stable", cell1Uid !== null && rect0 !== null && rect0 === rect1 && nodeMarkKept && focusKept && stillRunning ? "PASS" : "FAIL", {
    cell1Uid,
    rect0,
    rect1,
    nodeMarkKept,
    focusKept,
    stillRunning,
  })
  run.record("focus-on-change", focusKept && stillRunning ? "PASS" : "FAIL", { focusKept, stillRunning })

  run.record(
    "width-1600",
    w1600Forbidden === 0 && w1600ComposerStopVis && w1600FocusVis && w1600Overflow.noOverflow && w1600Layout === "wide" && w1600FrameCheck.rootScrolls === false && w1600FrameCheck.summaryVisible
      ? "PASS"
      : "FAIL",
    { forbidden: w1600Forbidden, composerStopVisible: w1600ComposerStopVis, focusVisible: w1600FocusVis, layout: w1600Layout, ...w1600FrameCheck, ...w1600Overflow },
  )

  await waitIdle(A)
  await sleep(600)
  const geomDone = await geomOf()
  await page.screenshot({ path: run.artifact("par-done.png") })

  // parallel-subagents: three cells ran side by side (cells "run", probe layers "running"), then all three are collected ("done").
  // The probe layer fades out LINGER_MS + FADE_MS after the return packet arrives, so "absorbed" is not asserted after the end.
  const parDone = await until(async () => (await count(fA, '[data-oco-runtime-sub-cell][data-oco-runtime-sub-state="done"]')) >= 3, 15000, 200)
  const parProbeStages = await fA.evaluate(() => [...document.querySelectorAll("[data-oco-runtime-probe]")].map((e) => e.getAttribute("data-oco-runtime-probe-stage")))
  run.record("parallel-subagents", parSeen && parDone ? "PASS" : "FAIL", { parRunCells, parRunProbes, parDone, parProbeStagesAfter: parProbeStages })

  // geometry-stable: with the same lane-k the card, ring, model box and You dock keep their rectangles while running,
  // when done, and in replay (seek into the middle of the parallel round). The tools dock also depends on tools-k (it
  // collapses to its header once the round ends on a tool-less request), so its rectangle is compared only at the same tools-k.
  const parTasks = (await tools("task")).slice(-3)
  const parFirstStart = Math.min(...parTasks.map((p) => timesOf(p).start).filter(Boolean))
  let geomReplay = null
  if (Number.isFinite(parFirstStart)) {
    await seekAt(parFirstStart + 1500)
    geomReplay = await geomOf()
  }
  await goLive()
  const rectsPresent = (g) => !!g && g.rects.length === 5 && g.rects.every((r) => r !== null)
  // D14: rectangles are a function of (stage width, stage height, k). Pairs whose stage size or k differ (the host's todo
  // dock shrinks the frame while the session is busy) are recorded as not comparable (null) instead of compared.
  const sizeOf = (g) => (g?.stageBox ?? "").split(",").slice(2).join("x")
  const rectsOf = (g, other) => (g.dk === other.dk ? g.rects : g.rects.slice(0, 4))
  const sameRects = (a, b) =>
    a.k === b.k && sizeOf(a) === sizeOf(b) && sizeOf(a) !== "" ? rectsOf(a, b).join("|") === rectsOf(b, a).join("|") : null
  const pairOf = (a, b) => (rectsPresent(a) && rectsPresent(b) ? sameRects(a, b) : null)
  const runRun = pairOf(geomRunning, geomRunning2)
  const runDone = pairOf(geomRunning, geomDone)
  const doneReplay = pairOf(geomDone, geomReplay)
  const geomPairs = [runRun, runDone, doneReplay]
  const geomOk = !geomPairs.includes(false) && (runRun === true || runDone === true) && doneReplay === true
  run.record("geometry-stable", geomOk ? "PASS" : "FAIL", { geomRunning, geomRunning2, geomDone, geomReplay, runRun, runDone, doneReplay })

  // legend: 5 items (thinking, running, done, failed, needs you) plus the neutral "dismissed / rejected" item (D18)
  // and, since patch 0020, the "ticks: round / failed / question" key (so 5-7 spans);
  // at 1000 px the first four are still readable.
  const legendCount = await count(fA, "[data-oco-runtime-legend]")
  const legendSpans = await fA.locator("[data-oco-runtime-legend] > span").allInnerTexts()
  const lg = L.legend
  const hasLegend = (spans, re) => spans.some((t) => re.test(t))
  const legendMatches = hasLegend(legendSpans, lg.think) && hasLegend(legendSpans, lg.run) && hasLegend(legendSpans, lg.ok) && hasLegend(legendSpans, lg.err) && hasLegend(legendSpans, lg.attn) && hasLegend(legendSpans, lg.declined)
  await fitGroups(app, page, 1000)
  await sleep(250)
  const legend1000 = await fA.locator("[data-oco-runtime-legend] > span").allInnerTexts()
  const first4VisibleAt1000 = hasLegend(legend1000, lg.think) && hasLegend(legend1000, lg.run) && hasLegend(legend1000, lg.ok) && hasLegend(legend1000, lg.err)
  await fitGroups(app, page, 1600)
  await sleep(250)
  run.record(
    "legend",
    legendCount >= 1 && legendSpans.length >= 5 && legendSpans.length <= 7 && legendMatches && first4VisibleAt1000 ? "PASS" : "FAIL",
    { legendCount, legendItemCount: legendSpans.length, legendSpans, legendMatches, first4VisibleAt1000, legend1000 },
  )

  // summary: the status bar has the round time and the round cost; the M4 request / agent text is gone. The subagent
  // counts moved to the dock, so they are not asserted here (plan open question 11).
  const summaryCount = await count(fA, "[data-oco-runtime-summary]")
  const summaryText = summaryCount >= 1 ? await textOf("[data-oco-runtime-summary]") : ""
  const summaryRoundTook = L.roundTookRe.test(summaryText)
  const summaryCost = L.costRe.test(summaryText)
  const summaryDurationEl = (await count(fA, "[data-oco-runtime-duration]")) >= 1
  const summaryNoReq = !/(Request|请求|請求)\s*#?\d+/i.test(summaryText)
  const summaryNoAgent = !summaryText.includes("build ·") && !summaryText.includes("build•")
  run.record(
    "summary",
    summaryCount >= 1 && summaryRoundTook && summaryCost && summaryDurationEl && summaryNoReq && summaryNoAgent ? "PASS" : "FAIL",
    { summaryCount, summaryText: summaryText.replace(/\s+/g, " ").slice(0, 160), summaryRoundTook, summaryCost, summaryDurationEl, summaryNoReq, summaryNoAgent },
  )

  // fill (background tasks):
  // 1) without retrieving -> the cell reads "docked" (awaiting pickup);
  // 2) with retrieving -> the cell reads "done" and the detail panel's result contains the child's reply (subagent-ok).
  await send(fA, "Use the task tool in the background without retrieving with the explore agent: bg-docked-check")
  await waitReply(A)
  await sleep(500)
  const fillDocked = await until(async () => (await count(fA, '[data-oco-runtime-sub-cell][data-oco-runtime-sub-state="docked"]')) >= 1, 30000, 200)

  await send(fA, "Use the task tool in the background with the explore agent: bg-absorbed-check")
  await waitReply(A)
  await sleep(500)
  const fillDone = await until(async () => (await count(fA, '[data-oco-runtime-sub-cell][data-oco-runtime-sub-state="done"]')) >= 1, 30000, 200)
  let fillPanelText = ""
  if (fillDone) {
    await fA.locator('[data-oco-runtime-sub-cell][data-oco-runtime-sub-state="done"]').last().click({ force: true })
    await fA.locator("[data-oco-runtime-sub-panel]").waitFor({ state: "visible", timeout: 10000 }).catch(() => {})
    await sleep(300)
    fillPanelText = (await textOf("[data-oco-runtime-sub-panel]")).replace(/\s+/g, " ")
    await page.keyboard.press("Escape")
  }
  run.record(
    "fill",
    fillDocked && fillDone && fillPanelText.includes("subagent-ok") ? "PASS" : "FAIL",
    { fillDocked, fillDone, fillPanelText: fillPanelText.slice(0, 200) },
  )

} catch (e) {
  run.record("run", "FAIL", { error: String(e?.message ?? e).slice(0, 500) })
  await runShot(page, run, "error")
} finally {
  console.log(`[INFO] send-left-replay: ${sendLeftReplay}; send-retyped: ${sendRetyped}`)
  const code = run.finish()
  try {
    await Promise.race([app.close(), sleep(2000)])
  } catch {}
  process.exit(code)
}
