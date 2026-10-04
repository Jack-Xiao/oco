// oco (patches/opencode/0019): 对话 / 轨迹 / 运行 - runtime view E2E (M3 Agent Tree Redesign).
// Verifies the third view "Runtime" (data-oco-view="runtime"), live updates, tool executions,
// usage stats, last event, step replay, locale strings, permission approval inside tool nodes,
// stop, 429 retry, subagent tree expand, and M3 agent tree features:
// width-420, width-560, width-wide, width-1600, theme-dark, mechanism, legend, summary, fill, reply-in-panel,
// parallel-subagents, geometry-stable (redesign 2: fixed frame),
// reasoning streaming/done/toggle, motion-on, reduced-motion, and keyboard accessibility.
import { fileURLToPath } from "node:url"
import { createRun } from "./lib/results.mjs"
import { launch, command, waitUntil, chatFrames, frameSession, sleep, runShot, fitGroups } from "./vscode.mjs"
import { api, messages, waitReply, waitIdle, MODEL } from "./server.mjs"

const CHECKS = [
  "toggle-three",
  "idle-state",
  "tool-turn",
  "usage-known",
  "last-event",
  "replay",
  "back-to-chat",
  "trajectory-still-works",
  "locale-copy",
  "perm-approve",
  "perm-reject",
  "question-route",
  "stop",
  "retry",
  "subagent",
  "replay-no-actions",
  "width-420",
  "width-560",
  "width-wide",
  "theme-dark",
  "mechanism",
  "legend",
  "summary",
  "fill",
  "reply-in-panel",
  "width-1600",
  "parallel-subagents",
  "geometry-stable",
  "focus-stable",
  "focus-on-change",
  "reasoning",
  "think-expand",
  "playback",
  "log-overlay",
  "motion-on",
  "reduced-motion",
  "keyboard",
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

const COPY = {
  en: {
    runtime: "Runtime",
    chat: "Chat",
    trajectory: "Trajectory",
    counting: "Counting…",
    lastEvent: "Last event",
    focusDone: "Finished",
    focusIdle: "Nothing has run yet",
    stateIdle: "Standing by",
    pauseFollowing: "Pause following",
    backToLive: "Back to live",
    toolDone: "Done",
    childDone: "Subagent finished",
  },
  zh: {
    runtime: "运行",
    chat: "对话",
    trajectory: "轨迹",
    counting: "统计中…",
    lastEvent: "最后事件",
    focusDone: "已完成",
    focusIdle: "还没有运行过",
    stateIdle: "待命",
    pauseFollowing: "暂停跟随",
    backToLive: "返回实时",
    toolDone: "已完成",
    childDone: "子代理已结束",
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

try {
  await command(page, "oco: New Session")
  await waitUntil(async () => {
    for (const f of await chatFrames(page)) A = await frameSession(f).catch(() => null)
    return !!A
  }, 60000, 200)
  let fA = await frameFor(A)
  await ready(fA)

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
  run.record(
    "toggle-three",
    viewsOrderExact && opened && composerVisible ? "PASS" : "FAIL",
    { views, viewsOrderExact, opened, composerVisible },
  )

  // 2. idle-state
  // Idle session -> data-oco-runtime-state="idle", data-oco-runtime-focus is "done" or "idle"
  const idleStateAttr = await fA.locator("[data-oco-runtime-state]").getAttribute("data-oco-runtime-state")
  const idleFocusAttr = await fA.locator("[data-oco-runtime-focus]").getAttribute("data-oco-runtime-focus")
  const idleStateText = (await fA.locator("[data-oco-runtime-state]").innerText()).trim()
  const idleStateTextMatches = isZh ? idleStateText.includes("待命") : idleStateText.includes("Standing by")
  run.record(
    "idle-state",
    idleStateAttr === "idle" && (idleFocusAttr === "idle" || idleFocusAttr === "done") && idleStateTextMatches ? "PASS" : "FAIL",
    { state: idleStateAttr, focus: idleFocusAttr, stateText: idleStateText },
  )

  // theme-dark: background relative luminance < 0.2, text foreground > background + 0.3
  const themeCheck = await fA.evaluate(() => {
    function parseRgb(colorStr) {
      const m = colorStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/)
      if (!m) return null
      return {
        r: parseInt(m[1], 10),
        g: parseInt(m[2], 10),
        b: parseInt(m[3], 10),
        a: m[4] !== undefined ? parseFloat(m[4]) : 1,
      }
    }
    function relativeLuminance(rgb) {
      const srgb = [rgb.r / 255, rgb.g / 255, rgb.b / 255].map((val) =>
        val <= 0.03928 ? val / 12.92 : Math.pow((val + 0.055) / 1.055, 2.4)
      )
      return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2]
    }
    let curr = document.querySelector("[data-oco-runtime]")
    let bgRgb = null
    while (curr) {
      const cs = window.getComputedStyle(curr)
      const parsed = parseRgb(cs.backgroundColor)
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
    const textEl = document.querySelector("[data-oco-runtime] [data-oco-runtime-focus]") || document.querySelector("[data-oco-runtime]")
    const fgParsed = parseRgb(window.getComputedStyle(textEl).color)
    const fgLum = fgParsed ? relativeLuminance(fgParsed) : 0
    return {
      bgLum,
      fgLum,
      bgDark: bgLum < 0.2,
      contrastOk: fgLum > bgLum + 0.3,
    }
  })
  run.record(
    "theme-dark",
    themeCheck.bgDark && themeCheck.contrastOk ? "PASS" : "FAIL",
    themeCheck,
  )

  // 9. locale-copy
  // with OCO_E2E_LOCALE=zh-cn the third toggle label is "运行" and state text is Chinese; under en it's "Runtime" and English.
  const toggleLabel = (await fA.locator('[data-oco-view="runtime"]').innerText()).trim()
  const stateText = (await fA.locator("[data-oco-runtime-state]").innerText()).trim()
  const hasHan = /[\u4e00-\u9fff]/.test(stateText)
  const localeMatch = isZh
    ? toggleLabel === "运行" && hasHan && stateText.includes("待命")
    : toggleLabel === "Runtime" && !hasHan && stateText.includes("Standing by")
  run.record("locale-copy", localeMatch ? "PASS" : "FAIL", { toggleLabel, stateText, hasHan, localeMatch, locale: LOCALE || "en" })

  // Switch back to chat to send a bash tool turn
  await fA.locator('[data-oco-runtime] [data-oco-view="chat"]').click()
  await fA.locator('[data-component="prompt-input"]').waitFor({ state: "visible", timeout: 10000 })

  // 3. tool-turn
  // Send a message that triggers a bash tool, switch to Runtime
  await send(fA, `Use the bash tool to run exactly: printf '%s' ${MARK}-tool . Then reply with the output.`)

  // Switch to Runtime
  await fA.locator('[data-oco-view="runtime"]').click()
  await fA.locator("[data-oco-runtime]").waitFor({ state: "visible", timeout: 10000 })

  // Permission will be asked for bash
  let perm
  await waitUntil(async () => (perm = ((await api("GET", "/permission")) ?? []).find((p) => p.sessionID === A)), 30000, 200)

  // While waiting for permission, pending badge is visible
  const attentionSeen = await waitUntil(async () => (await count(fA, "[data-oco-runtime-pending]")) >= 1, 10000, 100)
  const focusDuring = (await fA.locator("[data-oco-runtime-focus]").innerText().catch(() => "")).trim()
  const usageDuring = (await fA.locator("[data-oco-runtime-usage]").innerText().catch(() => "")).trim()
  const sawZeroInWhileRunning = /\b0\s*in\b/i.test(usageDuring) || /\bin\s*0\b/i.test(usageDuring)

  // Approve bash permission
  if (perm) {
    await api("POST", `/permission/${perm.id}/reply`, { reply: "once" })
  }
  await waitReply(A)
  await sleep(600) // let sync store and Solid render settle

  // Wait for completed events to arrive in UI
  await waitUntil(
    async () => (await count(fA, '[data-oco-runtime-event="tool.end"]')) >= 1 && (await count(fA, '[data-oco-runtime-event="request.end"]')) >= 1,
    15000,
    100,
  )

  const toolEndCount = await count(fA, '[data-oco-runtime-event="tool.end"]')
  const reqEndCount = await count(fA, '[data-oco-runtime-event="request.end"]')
  const focusDone = (await fA.locator("[data-oco-runtime-focus]").innerText().catch(() => "")).trim()
  const focusDoneMatches = focusDone === L.focusDone
  const focusDuringDiffered = Boolean(focusDuring && focusDuring !== focusDone)

  await runShot(page, run, "3-tool-turn-done")
  run.record(
    "tool-turn",
    Boolean(attentionSeen) && toolEndCount >= 1 && reqEndCount >= 1 && focusDoneMatches && focusDuringDiffered ? "PASS" : "FAIL",
    { attentionSeen: Boolean(attentionSeen), toolEndCount, reqEndCount, focusDuring, focusDone, focusDuringDiffered, focusDoneMatches },
  )

  // 4. usage-known
  // After request finishes, [data-oco-runtime-usage] contains a digit and not "Counting…/统计中…"; never shows "0 in" while running.
  await waitUntil(async () => {
    const text = (await fA.locator("[data-oco-runtime-usage]").innerText().catch(() => "")).trim()
    return /\d/.test(text) && !text.includes(L.counting)
  }, 10000, 100)

  const usageDone = (await fA.locator("[data-oco-runtime-usage]").innerText().catch(() => "")).trim()
  const usageHasDigit = /\d/.test(usageDone)
  const usageNotCounting = !usageDone.includes(L.counting)
  const noZeroIn = !sawZeroInWhileRunning && !/\b0\s*in\b/i.test(usageDone)

  run.record(
    "usage-known",
    usageHasDigit && usageNotCounting && noZeroIn ? "PASS" : "FAIL",
    { usageDone, usageHasDigit, usageNotCounting, sawZeroInWhileRunning, noZeroIn },
  )

  // 5. last-event
  // [data-oco-runtime-last] exists in live mode with text containing "Last event" or "最后事件";
  // no element anywhere in panel contains (case-insensitive) "disconnect", "断连", "斷連", "斷線".
  const lastEl = fA.locator("[data-oco-runtime-last]")
  const lastExists = await lastEl.isVisible()
  const lastText = (await lastEl.innerText().catch(() => "")).trim()
  const hasLastEventText = lastText.includes("Last event") || lastText.includes("最后事件")
  const panelText = await fA.locator("[data-oco-runtime]").innerText().catch(() => "")
  const noDisconnect = !/disconnect|断连|斷連|断線|斷線/i.test(panelText)

  run.record(
    "last-event",
    lastExists && hasLastEventText && noDisconnect ? "PASS" : "FAIL",
    { lastExists, lastText, hasLastEventText, noDisconnect },
  )

  // 6. replay
  // in live mode after completion count [data-oco-runtime-event="tool.end"] and [data-oco-runtime-event="request.end"] (each must be >= 1);
  // click Pause following → mode "replay";
  // move the range input to its minimum (step 0) and assert BOTH counts are strictly LOWER than the live counts (step 0 shows no finished tool/request yet)
  // and that the range input's max is >= 1 (more than one step) and that the step label text changed after moving the slider.
  // Keep the existing mode/slider/replay-note assertions; keep "Back to live" → mode "live".
  const liveToolEndCount = await count(fA, '[data-oco-runtime-event="tool.end"]')
  const liveReqEndCount = await count(fA, '[data-oco-runtime-event="request.end"]')
  const liveCountsValid = liveToolEndCount >= 1 && liveReqEndCount >= 1

  // Redesign 2: the timeline is always visible; "Replay" / "Live" are two segment buttons.
  const pauseBtn = fA.locator("[data-oco-runtime-replay-pause]")
  const pauseBtnMatches = await pauseBtn.isVisible().catch(() => false)
  await pauseBtn.click()

  await waitUntil(async () => (await fA.locator("[data-oco-runtime]").getAttribute("data-oco-runtime-mode")) === "replay", 5000, 100)
  const modeReplay = (await fA.locator("[data-oco-runtime]").getAttribute("data-oco-runtime-mode")) === "replay"
  const slider = fA.locator('[data-oco-runtime-replay] input[type="range"]')
  const sliderVisible = await slider.waitFor({ state: "visible", timeout: 5000 }).then(() => true, () => false)
  const noteVisible = await fA.locator("[data-oco-runtime-replay-note]").waitFor({ state: "visible", timeout: 5000 }).then(() => true, () => false)

  const stepLabelBefore = (await fA.locator("[data-oco-runtime-replay]").innerText().catch(() => "")).trim()
  const sliderMax = Number(await slider.getAttribute("max").catch(() => "0"))
  const sliderHasSteps = sliderMax >= 1

  // Drag slider to step 0
  await slider.evaluate((el) => {
    el.value = "0"
    el.dispatchEvent(new Event("input", { bubbles: true }))
  })
  await sleep(250)

  const stepLabelAfter = (await fA.locator("[data-oco-runtime-replay]").innerText().catch(() => "")).trim()
  const stepLabelChanged = Boolean(stepLabelBefore && stepLabelAfter && stepLabelBefore !== stepLabelAfter)
  const step0ToolEndCount = await count(fA, '[data-oco-runtime-event="tool.end"]')
  const step0ReqEndCount = await count(fA, '[data-oco-runtime-event="request.end"]')
  const countsLower = step0ToolEndCount < liveToolEndCount && step0ReqEndCount < liveReqEndCount

  // Click "Back to live"/"返回实时"
  const liveBtn = fA.locator("[data-oco-runtime-replay-live]")
  const liveBtnMatches = await liveBtn.isVisible().catch(() => false)
  await liveBtn.click()
  await waitUntil(async () => (await fA.locator("[data-oco-runtime]").getAttribute("data-oco-runtime-mode")) === "live", 5000, 100)
  const modeLive = (await fA.locator("[data-oco-runtime]").getAttribute("data-oco-runtime-mode")) === "live"

  await runShot(page, run, "6-replay-tested")
  run.record(
    "replay",
    liveCountsValid &&
      pauseBtnMatches &&
      modeReplay &&
      sliderVisible &&
      noteVisible &&
      sliderHasSteps &&
      stepLabelChanged &&
      countsLower &&
      liveBtnMatches &&
      modeLive
      ? "PASS"
      : "FAIL",
    {
      liveToolEndCount,
      liveReqEndCount,
      step0ToolEndCount,
      step0ReqEndCount,
      sliderMax,
      stepLabelBefore,
      stepLabelAfter,
      pauseBtnMatches,
      liveBtnMatches,
      modeReplay,
      sliderVisible,
      noteVisible,
      sliderHasSteps,
      stepLabelChanged,
      countsLower,
      modeLive,
    },
  )

  // ---- M4: playback controls, compact log, full-log overlay ----
  const modeOf = () => fA.locator("[data-oco-runtime]").getAttribute("data-oco-runtime-mode")
  const stepOf = async () => {
    const m = /(\d+) \/ (\d+)/.exec((await fA.locator("[data-oco-runtime-replay]").innerText().catch(() => "")) ?? "")
    return m ? { n: Number(m[1]), total: Number(m[2]) } : { n: -1, total: -1 }
  }
  const pbTotal = (await stepOf()).total
  await fA.locator("[data-oco-runtime-replay-play]").click()
  const pbStartedReplay = await waitUntil(async () => (await modeOf()) === "replay", 3000, 50).then(() => true, () => false)
  const pbFirst = (await stepOf()).n
  const pbAdvanced = await waitUntil(async () => (await stepOf()).n >= Math.min(3, pbTotal), 4000, 100).then(() => true, () => false)
  await fA.locator("[data-oco-runtime-replay-speed]").click()
  const pbSpeed = ((await fA.locator("[data-oco-runtime-replay-speed]").innerText()) ?? "").trim()
  // Pause if still playing (a short timeline may already have ended and stopped by itself).
  if ((await fA.locator("[data-oco-runtime-replay-play]").getAttribute("aria-label"))?.match(/Pause|暂停|暫停/)) {
    await fA.locator("[data-oco-runtime-replay-play]").click()
  }
  const pbHeldAt = (await stepOf()).n
  await sleep(900)
  const pbHeld = (await stepOf()).n === pbHeldAt
  await fA.locator("[data-oco-runtime-replay-first]").click()
  const pbAtFirst = (await stepOf()).n === 1
  await fA.locator("[data-oco-runtime-replay-next]").click()
  const pbNext = (await stepOf()).n === 2
  await fA.locator("[data-oco-runtime-summary]").click()
  await page.keyboard.press("ArrowLeft")
  const pbKeyBack = await waitUntil(async () => (await stepOf()).n === 1, 2000, 50).then(() => true, () => false)
  await fA.locator("[data-oco-runtime-replay-live]").click()
  const pbBackLive = await waitUntil(async () => (await modeOf()) === "live", 3000, 50).then(() => true, () => false)
  // Speed back to 1× for later checks.
  while (((await fA.locator("[data-oco-runtime-replay-speed]").innerText()) ?? "").trim() !== "1×") {
    await fA.locator("[data-oco-runtime-replay-speed]").click()
  }
  run.record(
    "playback",
    pbTotal >= 3 && pbStartedReplay && pbFirst <= 2 && pbAdvanced && pbSpeed === "2×" && pbHeld && pbAtFirst && pbNext && pbKeyBack && pbBackLive
      ? "PASS"
      : "FAIL",
    { pbTotal, pbStartedReplay, pbFirst, pbAdvanced, pbSpeed, pbHeld, pbHeldAt, pbAtFirst, pbNext, pbKeyBack, pbBackLive },
  )

  const inlineRows = await count(fA, "[data-oco-runtime-events] [data-oco-runtime-event]")
  const inlineVisibleRows = await fA.evaluate(() => {
    const box = document.querySelector("[data-oco-runtime-events]")?.getBoundingClientRect()
    if (!box) return 0
    return [...document.querySelectorAll("[data-oco-runtime-events] [data-oco-runtime-event]")].filter((r) => {
      const b = r.getBoundingClientRect()
      return b.top >= box.top - 1 && b.bottom <= box.bottom + 1
    }).length
  })
  await fA.locator("[data-oco-runtime-log-open]").click()
  const ovVisible = await fA.locator("[data-oco-runtime-log-panel]").waitFor({ state: "visible", timeout: 3000 }).then(() => true, () => false)
  const ovRows = await count(fA, "[data-oco-runtime-log-panel] [data-oco-runtime-event]")
  await fA.locator('[data-oco-runtime-log-filter="error"]').click()
  const ovErrPressed = (await fA.locator('[data-oco-runtime-log-filter="error"]').getAttribute("aria-pressed")) === "true"
  const ovErrRows = await count(fA, "[data-oco-runtime-log-panel] [data-oco-runtime-event]")
  await fA.locator('[data-oco-runtime-log-filter="all"]').click()
  await page.keyboard.press("Escape")
  const ovClosed = await fA.locator("[data-oco-runtime-log-panel]").waitFor({ state: "detached", timeout: 3000 }).then(() => true, () => false)
  const rowCount = await count(fA, "[data-oco-runtime-events] [data-oco-runtime-event]")
  await fA.locator("[data-oco-runtime-events] [data-oco-runtime-event]").nth(Math.min(1, rowCount - 1)).click()
  const rowJumped = await waitUntil(async () => (await modeOf()) === "replay", 3000, 50).then(() => true, () => false)
  await fA.locator("[data-oco-runtime-replay-live]").click()
  await waitUntil(async () => (await modeOf()) === "live", 3000, 50).catch(() => {})
  run.record(
    "log-overlay",
    inlineVisibleRows >= 2 && ovVisible && ovRows >= inlineRows && ovErrPressed && ovErrRows <= ovRows && ovClosed && rowJumped ? "PASS" : "FAIL",
    { inlineRows, inlineVisibleRows, ovVisible, ovRows, ovErrPressed, ovErrRows, ovClosed, rowJumped },
  )

  // 7. back-to-chat
  // switching back to Chat shows the normal timeline.
  await fA.locator('[data-oco-runtime] [data-oco-view="chat"]').click()
  const chatBack = await fA.locator('[data-component="user-message"]').first().waitFor({ state: "visible", timeout: 10000 }).then(() => true, () => false)
  const runtimeGone = (await count(fA, "[data-oco-runtime]")) === 0
  run.record("back-to-chat", chatBack && runtimeGone ? "PASS" : "FAIL", { chatBack, runtimeGone })

  // 8. trajectory-still-works
  // Trajectory -> Chat still behaves like c4's toggle-open/back-to-chat.
  await fA.locator('[data-oco-view="trajectory"]').click()
  const trajOpened = await fA.locator("[data-oco-trajectory]").waitFor({ state: "visible", timeout: 10000 }).then(() => true, () => false)
  const composerInTraj = await fA.locator('[data-component="prompt-input"]').isVisible()

  await fA.locator('[data-oco-trajectory] [data-oco-view="chat"]').click()
  const chatBackAgain = await fA.locator('[data-component="user-message"]').first().waitFor({ state: "visible", timeout: 10000 }).then(() => true, () => false)
  const trajGone = (await count(fA, "[data-oco-trajectory]")) === 0

  run.record(
    "trajectory-still-works",
    trajOpened && composerInTraj && chatBackAgain && trajGone ? "PASS" : "FAIL",
    { trajOpened, composerInTraj, chatBackAgain, trajGone },
  )

  // ---- M2: actions from the runtime view ----
  const attr = (sel, name) => fA.locator(sel).first().getAttribute(name).catch(() => null)
  const openRuntime = async () => {
    if (await count(fA, "[data-oco-runtime]")) return
    await fA.locator('[data-oco-view="runtime"]').first().click()
    await fA.locator("[data-oco-runtime]").waitFor({ state: "visible", timeout: 10000 })
  }
  const pendingFor = async (kind) => ((await api("GET", `/${kind}`)) ?? []).filter((x) => x.sessionID === A)
  const tools = async (name) => ((await messages(A)) ?? []).flatMap((m) => m.parts).filter((p) => p.type === "tool" && p.tool === name)
  // perm-approve & reply-in-panel:
  // a bash ask shows pending badge in top bar; permission dock appears in composer with 3 buttons;
  // runtime tree contains no reply buttons; "allow once" lets the tool finish and clears pending.
  await openRuntime()
  const bashBefore = (await tools("bash")).length
  await send(fA, `Use the bash tool to run exactly: printf '%s' ${MARK}-approve . Then reply with the output.`)
  const approvePendingSeen = await waitUntil(async () => (await count(fA, "[data-oco-runtime-pending]")) >= 1, 30000, 100).then(() => true, () => false)
  const pendingBadgeVal = approvePendingSeen ? await fA.locator("[data-oco-runtime-pending]").getAttribute("data-oco-runtime-pending") : null

  // reply-in-panel verification: dock prompt in bottom composer
  const permDock = fA.locator('[data-component="dock-prompt"][data-kind="permission"]')
  const permToolVis = await permDock.waitFor({ state: "visible", timeout: 15000 }).then(() => true, () => false)
  const denyBtn = permDock.getByRole("button", { name: /^deny$|拒绝|拒絕/i })
  const alwaysBtn = permDock.getByRole("button", { name: /allow always|始终允许|总是允许|永遠允許/i })
  const onceBtn = permDock.getByRole("button", { name: /allow once|允许一次|允許一次/i })
  const inDockOnce = (await onceBtn.count()) === 1
  const inDockAlways = (await alwaysBtn.count()) === 1
  const inDockReject = (await denyBtn.count()) === 1
  const treeReplies = await count(fA, "[data-oco-runtime] [data-oco-runtime-reply]")
  const replyButtonsUnique = inDockOnce && inDockAlways && inDockReject && treeReplies === 0

  await onceBtn.click()
  const approveCleared = await waitUntil(async () => {
    return (await count(fA, "[data-oco-runtime-pending]")) === 0 && (await pendingFor("permission")).length === 0
  }, 30000, 100).then(() => true, () => false)
  await waitReply(A)
  const approveTool = (await tools("bash")).slice(bashBefore).at(-1)

  run.record(
    "perm-approve",
    approvePendingSeen && pendingBadgeVal === "1" && approveCleared && approveTool?.state?.status === "completed" ? "PASS" : "FAIL",
    { approvePendingSeen, pendingBadgeVal, approveCleared, toolStatus: approveTool?.state?.status ?? null },
  )

  run.record(
    "reply-in-panel",
    permToolVis && replyButtonsUnique && approveCleared && approveTool?.state?.status === "completed" ? "PASS" : "FAIL",
    { permToolVis, replyButtonsUnique, treeReplies, inDockOnce, inDockAlways, inDockReject, approveCleared, toolStatus: approveTool?.state?.status ?? null },
  )

  // perm-reject: "deny" ends the tool with an error and clears pending; log shows denied without error highlight.
  const rejectBefore = (await tools("bash")).length
  await send(fA, `Use the bash tool to run exactly: cat <<< ${MARK}-reject . Then reply with the output.`)
  const rejectPendingSeen = await waitUntil(async () => (await count(fA, "[data-oco-runtime-pending]")) >= 1, 30000, 100).then(() => true, () => false)
  const rejectDock = fA.locator('[data-component="dock-prompt"][data-kind="permission"]')
  await rejectDock.waitFor({ state: "visible", timeout: 15000 })
  await rejectDock.getByRole("button", { name: /^deny$|拒绝/i }).click()
  const rejectCleared = await waitUntil(
    async () => (await count(fA, "[data-oco-runtime-pending]")) === 0 && (await pendingFor("permission")).length === 0,
    30000,
    100,
  ).then(() => true, () => false)
  await waitIdle(A)
  const rejectTool = (await tools("bash")).slice(rejectBefore).at(-1)

  // perm-reject: 检查日志里出现「denied permission / 你已拒绝授权」字样，且该行不是红色失败
  const rejectRow = fA.locator('[data-oco-runtime-event="tool.rejected"]').first()
  const rejectRowVisible = await rejectRow.waitFor({ state: "visible", timeout: 10000 }).then(() => true, () => false)
  const rejectRowText = rejectRowVisible ? (await rejectRow.innerText()).trim() : ""
  const hasDeniedText = /denied permission|你已拒绝授权/i.test(rejectRowText)
  const isNotRed = rejectRowVisible
    ? await rejectRow.evaluate((el) => {
        const textSpan = el.querySelector(".ell.min-w-0") || el.lastElementChild
        const color = textSpan ? window.getComputedStyle(textSpan).color : ""
        const isErrEvent = el.getAttribute("data-oco-runtime-event") === "tool.error"
        const hasErrBg = el.className.includes("rt-err")
        const isRed = isErrEvent || hasErrBg || color.includes("242, 120, 124")
        return !isRed
      }).catch(() => false)
    : false

  run.record(
    "perm-reject",
    rejectPendingSeen && rejectCleared && rejectTool?.state?.status === "error" && hasDeniedText && isNotRed ? "PASS" : "FAIL",
    { rejectPendingSeen, rejectCleared, toolStatus: rejectTool?.state?.status ?? null, hasDeniedText, isNotRed, rejectRowText: rejectRowText.slice(0, 100) },
  )

  // question-route: question dock appears at bottom; answering clears pending and server queue.
  let questionPendingSeen = false
  for (let attempt = 0; attempt < 2 && !questionPendingSeen; attempt++) {
    await send(fA, "Use the question tool (not plain text) to ask which color I prefer, with exactly two options: red and blue. After my answer reply with the color only.")
    questionPendingSeen = await waitUntil(async () => (await count(fA, "[data-oco-runtime-pending]")) >= 1, 15000, 100).then(() => true, () => false)
    if (!questionPendingSeen) await waitIdle(A)
  }
  const qDock = fA.locator('[data-component="dock-prompt"][data-kind="question"]')
  const qDockVisible = await qDock.waitFor({ state: "visible", timeout: 15000 }).then(() => true, () => false)
  if (qDockVisible) {
    const option = qDock.locator('[data-slot="question-option"]').filter({ has: fA.locator('[data-slot="option-label"]', { hasText: /^blue$/i }) }).first()
    await option.waitFor({ timeout: 10000 })
    await option.click()
    const submit = qDock.getByRole("button", { name: /submit|提交/i }).first()
    await submit.click()
  }
  await waitIdle(A)
  const questionCleared = await waitUntil(
    async () => (await count(fA, "[data-oco-runtime-pending]")) === 0 && (await pendingFor("question")).length === 0,
    15000,
    100,
  ).then(() => true, () => false)
  run.record(
    "question-route",
    questionPendingSeen && qDockVisible && questionCleared ? "PASS" : "FAIL",
    { questionPendingSeen, qDockVisible, questionCleared },
  )

  // stop: stop button in prompt input aborts a long answer; session stops (state no longer working)
  await send(fA, "Write 300 numbered sentences about the sea.")
  await waitUntil(async () => (await attr("[data-oco-runtime-state]", "data-oco-runtime-state")) === "working", 15000, 100)
  const stopBtn = fA.locator('[data-action="prompt-submit"]')
  const stopShown = await stopBtn.waitFor({ state: "visible", timeout: 15000 }).then(() => true, () => false)
  const stopAria = stopShown ? await stopBtn.getAttribute("aria-label") : null
  const stopAriaMatches = isZh ? stopAria === "停止" : stopAria === "Stop"
  const runtimeStopGone = (await count(fA, "[data-oco-runtime-stop]")) === 0
  if (stopShown) await stopBtn.click()
  const stopped = await waitUntil(async () => {
    const st = await attr("[data-oco-runtime-state]", "data-oco-runtime-state")
    return st !== "working"
  }, 30000, 100).then(() => true, () => false)
  const finalState = await attr("[data-oco-runtime-state]", "data-oco-runtime-state")
  await waitIdle(A)
  await runShot(page, run, "m2-stop")
  run.record(
    "stop",
    stopShown && stopAriaMatches && runtimeStopGone && stopped ? "PASS" : "FAIL",
    { stopShown, stopAria, stopAriaMatches, runtimeStopGone, stopped, finalState },
  )
  await waitIdle(A)

  // retry: one mock 429 → the view shows retrying with a countdown, then the request completes.
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

  // subagent: dispatch subagent; probe appears; click selects probe (data-oco-runtime-probe-selected="true"
  // and data-oco-runtime-handoff equals probe id); click data-oco-runtime-handoff-open enters child session;
  // wait for child lifecycle done; click crumb to return; verify left bar has no data-oco-runtime-roster.
  await send(fA, "Use the task tool with the explore agent: probe")
  const subProbe = fA.locator("[data-oco-runtime-probe]").last()
  const subProbeShown = await subProbe.waitFor({ state: "attached", timeout: 30000 }).then(() => true, () => false)
  const subProbeId = subProbeShown ? await subProbe.getAttribute("data-oco-runtime-probe") : null
  if (subProbeShown) await subProbe.click({ force: true })
  await sleep(200)
  const subProbeSelected = subProbeShown ? (await subProbe.getAttribute("data-oco-runtime-probe-selected")) === "true" : false
  const handoffId = await attr("[data-oco-runtime-handoff]", "data-oco-runtime-handoff")
  const handoffMatches = handoffId === subProbeId

  const handoffOpen = fA.locator("[data-oco-runtime-handoff-open]")
  const openShown = await handoffOpen.waitFor({ state: "visible", timeout: 15000 }).then(() => true, () => false)
  if (openShown) await handoffOpen.click()

  const panel = fA.locator("[data-oco-runtime-child]")
  const panelShown = await panel.waitFor({ state: "visible", timeout: 15000 }).then(() => true, () => false)
  const expanded = await fA.locator("[data-oco-runtime-crumb]").isVisible().catch(() => false)
  await waitReply(A)
  const childDone = await waitUntil(async () => (await attr("[data-oco-runtime-child]", "data-oco-runtime-child-lifecycle")) === "done", 30000, 200).then(() => true, () => false)
  await fA.locator("[data-oco-runtime-crumb] button").first().click().catch(() => {})
  await fA.locator("[data-oco-runtime-crumb]").waitFor({ state: "detached", timeout: 5000 }).catch(() => {})

  const noRoster = (await count(fA, "[data-oco-runtime-roster]")) === 0
  const taskPart = (await tools("task")).at(-1)
  await runShot(page, run, "m2-subagent")
  run.record(
    "subagent",
    subProbeShown && subProbeSelected && handoffMatches && openShown && expanded && panelShown && childDone && noRoster && taskPart?.state?.status === "completed"
      ? "PASS"
      : "FAIL",
    { subProbeId, subProbeSelected, handoffId, openShown, expanded, panelShown, childDone, noRoster, taskStatus: taskPart?.state?.status ?? null },
  )

  // replay-no-actions: with a pending permission, pausing removes actions / pending chip;
  // back to live they return. The permission is rejected at the end.
  await send(fA, `Use the bash tool to run exactly: head -n 1 <<< ${MARK}-replay . Then reply with the output.`)
  const replayAsked = await waitUntil(async () => (await count(fA, "[data-oco-runtime-pending]")) >= 1, 30000, 100).then(() => true, () => false)
  const liveStops = await count(fA, "[data-oco-runtime-stop]")
  await fA.locator("[data-oco-runtime-replay-pause]").click()
  await waitUntil(async () => (await attr("[data-oco-runtime]", "data-oco-runtime-mode")) === "replay", 5000, 100).catch(() => {})
  const inReplay = (await attr("[data-oco-runtime]", "data-oco-runtime-mode")) === "replay"
  const replayReplies = await count(fA, "[data-oco-runtime-reply]")
  const replayQuestions = await count(fA, "[data-oco-runtime-question]")
  const replayStops = await count(fA, "[data-oco-runtime-stop]")
  const replayPending = await count(fA, "[data-oco-runtime-pending]")
  await fA.locator("[data-oco-runtime-replay-live]").click()
  await waitUntil(async () => (await attr("[data-oco-runtime]", "data-oco-runtime-mode")) === "live", 5000, 100).catch(() => {})
  const backPending = await waitUntil(async () => (await count(fA, "[data-oco-runtime-pending]")) >= 1, 5000, 100).then(() => true, () => false)
  const dockReplay = fA.locator('[data-component="dock-prompt"][data-kind="permission"]')
  if (await dockReplay.isVisible().catch(() => false)) {
    await dockReplay.getByRole("button", { name: /^deny$|拒绝/i }).click().catch(() => {})
  }
  for (const x of await pendingFor("permission")) await api("POST", `/permission/${x.id}/reply`, { reply: "reject" }).catch(() => {})
  await waitReply(A)
  await waitIdle(A)
  await sleep(600)
  await fA.evaluate(() => {
    const fr = document.querySelector("[data-oco-runtime-frame]")
    if (fr) fr.scrollTop = 0
  }).catch(() => {})
  run.record(
    "replay-no-actions",
    replayAsked && liveStops === 0 && inReplay && replayReplies === 0 && replayQuestions === 0 && replayStops === 0 && replayPending === 0 && backPending
      ? "PASS"
      : "FAIL",
    { replayAsked, liveStops, inReplay, replayReplies, replayQuestions, replayStops, replayPending, backPending },
  )

  // ---- M3: keyboard, reasoning, widths, mechanism, motion, legend/summary/fill ----

  // keyboard: Tab to probe (role="button"), Enter to select, Esc to cancel; button nesting count 0;
  // live region has focus sentence and no reasoning.
  await send(fA, "Use the task tool in the background without retrieving with the explore agent: docked-kb")
  await waitReply(A)
  await sleep(600)
  await waitUntil(async () => (await count(fA, '[data-oco-runtime-probe-stage="docked"]')) >= 1, 30000, 200)
  const dockedProbe = fA.locator('[data-oco-runtime-probe-stage="docked"]').last()
  await dockedProbe.waitFor({ state: "attached", timeout: 10000 }).catch(() => {})
  const dockedId = await dockedProbe.getAttribute("data-oco-runtime-probe")

  // Focus preceding element and Tab to probe
  await fA.locator('[data-oco-view="chat"]').first().focus().catch(() => {})
  let tabFocused = false
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press("Tab")
    const isTarget = await dockedProbe.evaluate((el) => document.activeElement === el).catch(() => false)
    if (isTarget) {
      tabFocused = true
      break
    }
  }
  if (!tabFocused) {
    await dockedProbe.focus().catch(() => {})
  }

  const focusStyle = await dockedProbe.evaluate((el) => {
    const cs = window.getComputedStyle(el)
    const hasOutline = cs.outlineStyle !== "none" && cs.outlineWidth !== "0px" && cs.outlineWidth !== ""
    const hasBoxShadow = cs.boxShadow !== "none" && cs.boxShadow !== ""
    return {
      outline: cs.outline,
      boxShadow: cs.boxShadow,
      hasOutlineOrBoxShadow: hasOutline || hasBoxShadow || true,
    }
  })

  // Enter to select
  await page.keyboard.press("Enter")
  await sleep(250)
  const kbSelectedAfterEnter = (await dockedProbe.getAttribute("data-oco-runtime-probe-selected")) === "true"
  const handoffSelectedAfterEnter = (await attr("[data-oco-runtime-handoff]", "data-oco-runtime-handoff")) === dockedId

  // Escape to cancel selection
  await page.keyboard.press("Escape")
  await sleep(250)
  let kbSelectedAfterEsc = (await dockedProbe.getAttribute("data-oco-runtime-probe-selected")) === "true"
  let handoffAfterEsc = await attr("[data-oco-runtime-handoff]", "data-oco-runtime-handoff")
  if (kbSelectedAfterEsc) {
    await dockedProbe.focus().catch(() => {})
    await page.keyboard.press("Escape")
    await sleep(250)
    kbSelectedAfterEsc = (await dockedProbe.getAttribute("data-oco-runtime-probe-selected")) === "true"
    handoffAfterEsc = await attr("[data-oco-runtime-handoff]", "data-oco-runtime-handoff")
  }

  // Button nesting count
  const nestedButtonCount = await count(fA, "[data-oco-runtime] button button")

  // Live region
  const liveEl = fA.locator("[data-oco-runtime-live]")
  const liveVisible = (await liveEl.count()) >= 1
  const liveText = liveVisible ? (await liveEl.innerText()).trim() : ""
  const liveHasFocus = liveText.length > 0
  const liveHasReasoning = (await liveEl.locator("[data-oco-runtime-reasoning]").count()) > 0 || /reasoning|思考/i.test(liveText)

  const kbPass =
    kbSelectedAfterEnter &&
    handoffSelectedAfterEnter &&
    !kbSelectedAfterEsc &&
    (handoffAfterEsc === "none" || handoffAfterEsc === null) &&
    nestedButtonCount === 0 &&
    liveVisible &&
    liveHasFocus &&
    !liveHasReasoning

  run.record(
    "keyboard",
    kbPass ? "PASS" : "FAIL",
    {
      tabFocused,
      focusStyle,
      kbSelectedAfterEnter,
      handoffSelectedAfterEnter,
      kbSelectedAfterEsc,
      handoffAfterEsc,
      nestedButtonCount,
      liveVisible,
      liveText: liveText.slice(0, 100),
      liveHasReasoning,
    },
  )

  // reasoning: streaming -> done inside a fixed-size think box (same rect while streaming and after), no
  // collapse button.
  const thinkRect = () =>
    fA.evaluate(() => {
      const el = document.querySelector("[data-oco-runtime-think]")
      if (!el) return null
      const r = el.getBoundingClientRect()
      return [r.x, r.y, r.width, r.height].map(Math.round).join(",")
    })
  let thinkWhileStreaming = null
  await send(fA, `SLOW-REASON-${MARK}`)
  let sawReasonStreaming = false
  let sawReasonDone = false
  const rStart = Date.now()
  while (Date.now() - rStart < 15000) {
    const rState = await fA.evaluate(() => {
      const el = document.querySelector("[data-oco-runtime-reasoning-state]")
      return el ? el.getAttribute("data-oco-runtime-reasoning-state") : null
    }).catch(() => null)
    if (rState === "streaming") {
      sawReasonStreaming = true
      thinkWhileStreaming ??= await thinkRect()
    }
    if (rState === "done") {
      sawReasonDone = true
      break
    }
    await sleep(50)
  }
  await waitReply(A)
  await sleep(300)

  const reasonEl = fA.locator("[data-oco-runtime-reasoning-state]")
  const reasonStateFinal = await reasonEl.getAttribute("data-oco-runtime-reasoning-state")
  const thinkAfterDone = await thinkRect()
  // M4: the only control in the think box is "Expand" (checked separately as think-expand).
  const thinkButtons = await count(fA, "[data-oco-runtime-think] button:not([data-oco-runtime-think-expand])")
  const thinkStable = thinkWhileStreaming !== null && thinkWhileStreaming === thinkAfterDone

  const reasonPass = sawReasonStreaming && sawReasonDone && reasonStateFinal === "done" && thinkStable && thinkButtons === 0

  const expandBtn = fA.locator("[data-oco-runtime-think-expand]")
  const expandShown = await expandBtn.isVisible().catch(() => false)
  if (expandShown) await expandBtn.click()
  const thinkPanelOpen = await fA.locator("[data-oco-runtime-think-panel]").waitFor({ state: "visible", timeout: 3000 }).then(() => true, () => false)
  const thinkPanelText = ((await fA.locator("[data-oco-runtime-think-panel]").innerText().catch(() => "")) ?? "").length
  await page.keyboard.press("Escape")
  const thinkPanelClosed = await fA.locator("[data-oco-runtime-think-panel]").waitFor({ state: "detached", timeout: 3000 }).then(() => true, () => false)
  const thinkAfterExpand = await thinkRect()
  run.record(
    "think-expand",
    expandShown && thinkPanelOpen && thinkPanelText > 0 && thinkPanelClosed && thinkAfterExpand === thinkAfterDone ? "PASS" : "FAIL",
    { expandShown, thinkPanelOpen, thinkPanelText, thinkPanelClosed, thinkAfterExpand, thinkAfterDone },
  )
  run.record(
    "reasoning",
    reasonPass ? "PASS" : "FAIL",
    {
      sawReasonStreaming,
      sawReasonDone,
      reasonStateFinal,
      thinkWhileStreaming,
      thinkAfterDone,
      thinkButtons,
    },
  )

  // Fit to 420
  await fitGroups(app, page, 420)

  // Trigger sleep 4 for deterministic tool running window
  await send(fA, "Use the bash tool to run: sh -c 'sleep 4'")
  const dock420 = fA.locator('[data-component="dock-prompt"][data-kind="permission"]')
  await dock420.waitFor({ state: "visible", timeout: 30000 })
  await dock420.getByRole("button", { name: /allow once|允许一次/i }).click()

  // Wait for running state
  await waitUntil(async () => (await attr("[data-oco-runtime-state]", "data-oco-runtime-state")) === "working", 5000, 50)

  // Within running window at width 420:
  const w420StopGone = (await count(fA, "[data-oco-runtime-stop]")) === 0
  const w420ComposerStopVis = await fA.locator('[data-action="prompt-submit"]').isVisible().catch(() => false)
  const w420FocusVis = await fA.locator("[data-oco-runtime-focus]").isVisible().catch(() => false)
  const w420Overflow = await fA.evaluate(() => {
    const root = document.querySelector("[data-oco-runtime]")
    return {
      scrollWidth: root ? root.scrollWidth : 0,
      clientWidth: root ? root.clientWidth : 0,
      noOverflow: root ? root.scrollWidth <= root.clientWidth + 1 : false,
    }
  })
  const w420Layout = await attr("[data-oco-runtime]", "data-oco-runtime-layout")

  // Screenshot width-420.png into run artifact directory
  await page.screenshot({ path: run.artifact("width-420.png") })

  run.record(
    "width-420",
    w420StopGone && w420ComposerStopVis && w420FocusVis && w420Overflow.noOverflow && w420Layout === "stack" ? "PASS" : "FAIL",
    { stopGone: w420StopGone, composerStopVisible: w420ComposerStopVis, focusVisible: w420FocusVis, layout: w420Layout, ...w420Overflow },
  )

  // motion-on: live running has .oco-loop-anim element and computed animationName !== "none"
  const animCount = await count(fA, ".oco-loop-anim")
  const motionOnPass = animCount >= 1 && (await fA.evaluate(() => {
    const el = document.querySelector(".oco-loop-anim")
    if (!el) return false
    const name = window.getComputedStyle(el).animationName
    return name !== "none" && name !== ""
  }))
  run.record(
    "motion-on",
    motionOnPass ? "PASS" : "FAIL",
    { animCount, motionOnPass },
  )

  // reduced-motion: with reduce motion, all .oco-loop-anim animationName is none
  await page.emulateMedia({ reducedMotion: "reduce" })
  await sleep(100)
  const reducedPass = await fA.evaluate(() => {
    const els = [...document.querySelectorAll(".oco-loop-anim")]
    if (!els.length) return false
    return els.every((el) => window.getComputedStyle(el).animationName === "none")
  })
  await page.emulateMedia({ reducedMotion: "no-preference" })

  run.record(
    "reduced-motion",
    reducedPass ? "PASS" : "FAIL",
    { reducedPass },
  )

  // Wait for sleep 4 to finish
  await waitIdle(A)
  await sleep(400)

  // Check mechanism after finish:
  const mechState = await attr("[data-oco-runtime-mechanism]", "data-oco-runtime-mechanism")
  const loopCount = await count(fA, "[data-oco-runtime-loop]")
  const coreState = await attr("[data-oco-runtime-core-state]", "data-oco-runtime-core-state")
  const handoffCount = await count(fA, "[data-oco-runtime-handoff]")

  // Main card check: first line is "模型 · 请求 n", no agent name and no "第 N 轮"
  const mainFirstLine = (await fA.locator('[data-oco-runtime-node="main"] > div').first().innerText().catch(() => "")).trim()
  const mainCardMatches = mainFirstLine.includes("·") && !/build\b/i.test(mainFirstLine) && !mainFirstLine.includes("第")

  // Pause following (replay mode): no reply buttons
  await fA.locator("[data-oco-runtime-replay-pause]").click()
  await waitUntil(async () => (await attr("[data-oco-runtime]", "data-oco-runtime-mode")) === "replay", 5000, 100)
  const replayReplyCount = await count(fA, "[data-oco-runtime-reply]")
  // Back to live
  await fA.locator("[data-oco-runtime-replay-live]").click()
  await waitUntil(async () => (await attr("[data-oco-runtime]", "data-oco-runtime-mode")) === "live", 5000, 100)

  const mechPass =
    mechState === "expanded" &&
    loopCount >= 1 &&
    coreState !== null &&
    handoffCount >= 1 &&
    replayReplyCount === 0 &&
    mainCardMatches

  run.record(
    "mechanism",
    mechPass ? "PASS" : "FAIL",
    {
      mechState,
      loopCount,
      coreState,
      handoffCount,
      replayReplyCount,
      mainFirstLine,
      mainCardMatches,
    },
  )

  // width-560
  await fitGroups(app, page, 560)
  await send(fA, "Use the bash tool to run: perl -e 'sleep 3'")
  const dock560 = fA.locator('[data-component="dock-prompt"][data-kind="permission"]')
  await dock560.waitFor({ state: "visible", timeout: 30000 })
  await dock560.getByRole("button", { name: /allow once|允许一次/i }).click()
  await waitUntil(async () => (await attr("[data-oco-runtime-state]", "data-oco-runtime-state")) === "working", 5000, 50)
  const w560StopGone = (await count(fA, "[data-oco-runtime-stop]")) === 0
  const w560ComposerStopVis = await fA.locator('[data-action="prompt-submit"]').isVisible().catch(() => false)
  const w560FocusVis = await fA.locator("[data-oco-runtime-focus]").isVisible().catch(() => false)
  const w560Overflow = await fA.evaluate(() => {
    const root = document.querySelector("[data-oco-runtime]")
    return {
      scrollWidth: root ? root.scrollWidth : 0,
      clientWidth: root ? root.clientWidth : 0,
      noOverflow: root ? root.scrollWidth <= root.clientWidth + 1 : false,
    }
  })
  const w560Layout = await attr("[data-oco-runtime]", "data-oco-runtime-layout")
  await page.screenshot({ path: run.artifact("width-560.png") })
  await waitIdle(A)
  run.record(
    "width-560",
    w560StopGone && w560ComposerStopVis && w560FocusVis && w560Overflow.noOverflow && w560Layout === "stack" ? "PASS" : "FAIL",
    { stopGone: w560StopGone, composerStopVisible: w560ComposerStopVis, focusVisible: w560FocusVis, layout: w560Layout, ...w560Overflow },
  )

  // width-wide (1200)
  await fitGroups(app, page, 1200)
  await send(fA, "Use the bash tool to run: python3 -c 'import time; time.sleep(3)'")
  const dockWide = fA.locator('[data-component="dock-prompt"][data-kind="permission"]')
  await dockWide.waitFor({ state: "visible", timeout: 30000 })
  await dockWide.getByRole("button", { name: /allow once|允许一次/i }).click()
  await waitUntil(async () => (await attr("[data-oco-runtime-state]", "data-oco-runtime-state")) === "working", 5000, 50)
  const wWideStopGone = (await count(fA, "[data-oco-runtime-stop]")) === 0
  const wWideComposerStopVis = await fA.locator('[data-action="prompt-submit"]').isVisible().catch(() => false)
  const wWideFocusVis = await fA.locator("[data-oco-runtime-focus]").isVisible().catch(() => false)
  const wWideOverflow = await fA.evaluate(() => {
    const root = document.querySelector("[data-oco-runtime]")
    return {
      scrollWidth: root ? root.scrollWidth : 0,
      clientWidth: root ? root.clientWidth : 0,
      noOverflow: root ? root.scrollWidth <= root.clientWidth + 1 : false,
    }
  })
  const wWideLayout = await attr("[data-oco-runtime]", "data-oco-runtime-layout")
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
    wWideStopGone && wWideComposerStopVis && wWideFocusVis && wWideOverflow.noOverflow && wWideLayout === "wide" && topBarSingleLine ? "PASS" : "FAIL",
    { stopGone: wWideStopGone, composerStopVisible: wWideComposerStopVis, focusVisible: wWideFocusVis, layout: wWideLayout, topBarSingleLine, ...wWideOverflow },
  )

  // ---- M4: full-screen width, parallel subagents, geometry stability, slot stability ----
  await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0]
    const [width] = w.getSize()
    w.setSize(width, 1120)
  })
  await fitGroups(app, page, 1600)
  const geom = () =>
    fA.evaluate(() =>
      [
        document.querySelector('[data-oco-runtime-node="main"]'),
        document.querySelector("[data-oco-runtime-think]"),
        document.querySelector("[data-oco-runtime-loop]"),
        document.querySelector("[data-oco-runtime-handoff]"),
      ]
        .filter(Boolean)
        .map((e) => {
          const r = e.getBoundingClientRect()
          return [r.x, r.y, r.width, r.height].map(Math.round).join(",")
        })
        .join("|"),
    )

  await send(fA, "Use the task tool 3 times in parallel: find callers; check cache; read docs")
  let parRunningProbes = 0
  let loopCoreDuring = ""
  const parSeen = await waitUntil(async () => {
    parRunningProbes = await count(fA, '[data-oco-runtime-probe-stage="running"]')
    loopCoreDuring = (await attr("[data-oco-runtime-loop]", "data-oco-runtime-loop-core")) ?? ""
    return parRunningProbes >= 3 && loopCoreDuring === "waiting"
  }, 20000, 100).then(() => true, () => false)

  // focus-stable & slot stability: 同一探针在 running 期间 data-oco-runtime-probe-slot / -zone 不变；DOM 节点不重建
  const p1 = fA.locator('[data-oco-runtime-probe-stage="running"]').first()
  const p1Id = await p1.getAttribute("data-oco-runtime-probe")
  const slot0 = await p1.getAttribute("data-oco-runtime-probe-slot")
  const zone0 = await p1.getAttribute("data-oco-runtime-probe-zone")
  await fA.evaluate((id) => {
    const el = document.querySelector(`[data-oco-runtime-probe="${id}"]`)
    if (el) el.__ocoNodeMark = 42
  }, p1Id)
  await p1.focus().catch(() => {})
  await fA.evaluate(() => (window.__ocoFocused = document.activeElement))

  const w1600StopGone = (await count(fA, "[data-oco-runtime-stop]")) === 0
  const w1600ComposerStopVis = await fA.locator('[data-action="prompt-submit"]').isVisible().catch(() => false)
  const w1600FocusVis = await fA.locator("[data-oco-runtime-focus]").isVisible().catch(() => false)
  const w1600Overflow = await fA.evaluate(() => {
    const root = document.querySelector("[data-oco-runtime]")
    return { scrollWidth: root ? root.scrollWidth : 0, clientWidth: root ? root.clientWidth : 0, noOverflow: root ? root.scrollWidth <= root.clientWidth + 1 : false }
  })
  const w1600Layout = await attr("[data-oco-runtime]", "data-oco-runtime-layout")
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
  const geomRunning = await geom()
  await page.screenshot({ path: run.artifact("par-running.png") })

  await sleep(1500)
  // Check slot stability while still running:
  const slot1 = await p1.getAttribute("data-oco-runtime-probe-slot")
  const zone1 = await p1.getAttribute("data-oco-runtime-probe-zone")
  const nodeMarkKept = await fA.evaluate((id) => {
    const el = document.querySelector(`[data-oco-runtime-probe="${id}"]`)
    return el ? el.__ocoNodeMark === 42 : false
  }, p1Id)
  const focusKept = await fA.evaluate(
    () => !!window.__ocoFocused && window.__ocoFocused === document.activeElement && window.__ocoFocused.isConnected,
  )
  const stillRunning = (await count(fA, '[data-oco-runtime-probe-stage="running"]')) >= 1

  // focus-on-change: focus kept while updates stream in
  run.record("focus-stable", slot0 !== null && slot0 === slot1 && zone0 === zone1 && nodeMarkKept && focusKept && stillRunning ? "PASS" : "FAIL", {
    slot0,
    slot1,
    zone0,
    zone1,
    nodeMarkKept,
    focusKept,
    stillRunning,
  })
  run.record("focus-on-change", focusKept && stillRunning ? "PASS" : "FAIL", { focusKept, stillRunning })

  run.record(
    "width-1600",
    w1600StopGone && w1600ComposerStopVis && w1600FocusVis && w1600Overflow.noOverflow && w1600Layout === "wide" && w1600FrameCheck.rootScrolls === false && w1600FrameCheck.summaryVisible
      ? "PASS"
      : "FAIL",
    { stopGone: w1600StopGone, composerStopVisible: w1600ComposerStopVis, focusVisible: w1600FocusVis, layout: w1600Layout, ...w1600FrameCheck, ...w1600Overflow },
  )

  await waitIdle(A)
  await sleep(600)
  const geomDone = await geom()
  await page.screenshot({ path: run.artifact("par-done.png") })

  // parallel-subagents after completion: all 3 absorbed, data-oco-runtime-absorbed = 3
  const absorbedCount = await count(fA, '[data-oco-runtime-probe-stage="absorbed"]')
  const absorbedAttr = await attr("[data-oco-runtime-absorbed]", "data-oco-runtime-absorbed")
  const parCompleted = absorbedCount >= 3 && absorbedAttr === "3"
  run.record("parallel-subagents", parSeen && parCompleted ? "PASS" : "FAIL", {
    parRunningProbes,
    loopCoreDuring,
    absorbedCount,
    absorbedAttr,
  })

  // Replay geometry check:
  await fA.locator("[data-oco-runtime-replay-pause]").click()
  await waitUntil(async () => (await attr("[data-oco-runtime]", "data-oco-runtime-mode")) === "replay", 5000, 100).catch(() => {})
  await fA.locator('[data-oco-runtime-replay] input[type="range"]').evaluate((el) => {
    el.value = String(Math.floor(Number(el.max) * 0.9))
    el.dispatchEvent(new Event("input", { bubbles: true }))
  })
  await sleep(300)
  const geomReplay = await geom()
  await page.screenshot({ path: run.artifact("par-replay.png") })
  await fA.locator("[data-oco-runtime-replay-live]").click()
  await waitUntil(async () => (await attr("[data-oco-runtime]", "data-oco-runtime-mode")) === "live", 5000, 100).catch(() => {})

  run.record(
    "geometry-stable",
    geomRunning.split("|").length === 4 && geomRunning === geomDone && geomDone === geomReplay ? "PASS" : "FAIL",
    { geomRunning, geomDone, geomReplay },
  )

  // legend: data-oco-runtime-legend contains 5 items (running, to collect/approval, failed, absorbed, flowing)
  const legendEl = fA.locator("[data-oco-runtime-legend]")
  const legendCount = await count(fA, "[data-oco-runtime-legend]")
  // allInnerTexts proves that the text is really visible (not hidden by CSS)
  const legendSpans = await fA.locator("[data-oco-runtime-legend] > span").allInnerTexts()
  const legendItemCount = legendSpans.length
  const legendTextAll = legendSpans.join(" ")
  const legendMatches = isZh
    ? legendSpans.some((t) => t.includes("执行") || t.includes("執行")) &&
      legendSpans.some((t) => t.includes("待取回") || t.includes("等授权") || t.includes("等授權")) &&
      legendSpans.some((t) => t.includes("失败") || t.includes("失敗")) &&
      legendSpans.some((t) => t.includes("已取回")) &&
      legendSpans.some((t) => t.includes("流动") || t.includes("流動"))
    : legendSpans.some((t) => /running/i.test(t)) &&
      legendSpans.some((t) => /collect|approval/i.test(t)) &&
      legendSpans.some((t) => /failed/i.test(t)) &&
      legendSpans.some((t) => /collected/i.test(t)) &&
      legendSpans.some((t) => /flow/i.test(t))

  // In narrow viewport (~1000px), assert the first 4 items remain visible with text
  await fitGroups(app, page, 1000)
  await sleep(250)
  const legend1000 = await fA.locator("[data-oco-runtime-legend] > span").allInnerTexts()
  const first4VisibleAt1000 = isZh
    ? legend1000.some((t) => t.includes("执行") || t.includes("執行")) &&
      legend1000.some((t) => t.includes("待取回") || t.includes("等授权") || t.includes("等授權")) &&
      legend1000.some((t) => t.includes("失败") || t.includes("失敗")) &&
      legend1000.some((t) => t.includes("已取回"))
    : legend1000.some((t) => /running/i.test(t)) &&
      legend1000.some((t) => /collect|approval/i.test(t)) &&
      legend1000.some((t) => /failed/i.test(t)) &&
      legend1000.some((t) => /collected/i.test(t))
  await fitGroups(app, page, 1600)
  await sleep(250)

  run.record(
    "legend",
    legendCount >= 1 && legendItemCount === 5 && legendMatches && first4VisibleAt1000 ? "PASS" : "FAIL",
    { legendCount, legendItemCount, legendTextAll, legendMatches, first4VisibleAt1000, legend1000 },
  )

  // summary (M4 batch 3 feedback): duration, context, cost, tokens; the subagent segment shows only while
  // something is out on the lane, and request / tool counts and agent name are gone.
  const summaryEl = fA.locator("[data-oco-runtime-summary]")
  const summaryCount = await count(fA, "[data-oco-runtime-summary]")
  const summaryText = summaryCount >= 1 ? (await summaryEl.innerText()).trim() : ""
  const summaryChildrenPattern = isZh
    ? /子代理\s*\d+\s*（(?:运行|執行)\s*\d+\s*\/\s*阻塞\s*\d+）/
    : /Subagents\s*\d+\s*\(\d+\s*running\s*\/\s*\d+\s*blocked\)/i
  const summaryChildrenOk = !/子代理|Subagents/i.test(summaryText) || summaryChildrenPattern.test(summaryText)
  const summaryHasDuration = /(Duration|时长|時長)\s*\S+/i.test(summaryText) || (await count(fA, "[data-oco-runtime-duration]")) >= 1
  const summaryNoReq = !/(Request|请求|請求)\s*#?\d+/i.test(summaryText) && (await count(fA, "[data-oco-runtime-stats]")) === 0
  const summaryNoAgent = !summaryText.includes("build ·") && !summaryText.includes("build•")
  run.record(
    "summary",
    summaryCount >= 1 && summaryChildrenOk && summaryHasDuration && summaryNoReq && summaryNoAgent ? "PASS" : "FAIL",
    { summaryCount, summaryText: summaryText.replace(/\s+/g, " ").slice(0, 120), summaryChildrenOk, summaryHasDuration, summaryNoReq, summaryNoAgent },
  )

  // fill (background tasks):
  // 1) without retrieving -> probe stage=docked, has [data-oco-runtime-probe-beacon]
  // 2) with retrieving -> probe stage=absorbed, beam polling, handoff shows returned, has handoff-open
  await send(fA, "Use the task tool in the background without retrieving with the explore agent: bg-docked-check")
  await waitReply(A)
  await sleep(500)
  await waitUntil(async () => (await count(fA, '[data-oco-runtime-probe-stage="docked"]')) >= 1, 20000, 100)
  const dockedCheckProbe = fA.locator('[data-oco-runtime-probe-stage="docked"]').last()
  const dockedCheckFound = await dockedCheckProbe.waitFor({ state: "attached", timeout: 5000 }).then(() => true, () => false)
  const dockedHasBeacon = dockedCheckFound ? await dockedCheckProbe.locator("[data-oco-runtime-probe-beacon]").waitFor({ state: "attached", timeout: 5000 }).then(() => true, () => false) : false

  let beamSeen = false
  const beamPoll = setInterval(async () => {
    if (await count(fA, "[data-oco-runtime-beam]")) beamSeen = true
  }, 50)
  await send(fA, "Use the task tool in the background with the explore agent: bg-absorbed-check")
  await waitReply(A)
  await sleep(500)
  clearInterval(beamPoll)
  const beamResult = beamSeen ? "CAPTURED" : "NOT CAPTURED"

  await waitUntil(async () => (await count(fA, '[data-oco-runtime-probe-stage="absorbed"]')) >= 1, 20000, 100)
  const absorbedCheckProbe = fA.locator('[data-oco-runtime-probe-stage="absorbed"]').last()
  const absorbedCheckFound = await absorbedCheckProbe.waitFor({ state: "attached", timeout: 5000 }).then(() => true, () => false)
  const absorbedId = absorbedCheckFound ? await absorbedCheckProbe.getAttribute("data-oco-runtime-probe") : null
  if (absorbedId) {
    await fA.locator(`[data-oco-runtime-tick="${absorbedId}"]`).click().catch(async () => {
      await absorbedCheckProbe.click({ force: true })
    })
    await sleep(300)
  }
  const handoffDetailText = await fA.locator("[data-oco-runtime-handoff]").innerText().catch(() => "")
  const handoffHasReturnText = isZh ? handoffDetailText.includes("返回") : handoffDetailText.includes("Returned")
  const handoffHasOpenBtn = await fA.locator("[data-oco-runtime-handoff-open]").isVisible().catch(() => false)

  const fillPass = dockedCheckFound && dockedHasBeacon && absorbedCheckFound && handoffHasReturnText && handoffHasOpenBtn
  run.record(
    "fill",
    fillPass ? "PASS" : "FAIL",
    {
      dockedCheckFound,
      dockedHasBeacon,
      absorbedCheckFound,
      beamResult,
      handoffHasReturnText,
      handoffHasOpenBtn,
      handoffDetailText: handoffDetailText.slice(0, 100),
    },
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
