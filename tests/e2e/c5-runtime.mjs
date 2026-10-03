// oco (patches/opencode/0019): 对话 / 轨迹 / 运行 - runtime view E2E.
// Verifies the third view "Runtime" (data-oco-view="runtime"), live updates, tool executions,
// usage stats, last event, step replay, and locale strings.
import { fileURLToPath } from "node:url"
import { createRun } from "./lib/results.mjs"
import { launch, command, waitUntil, chatFrames, frameSession, sleep, runShot } from "./vscode.mjs"
import { api, messages, waitReply, MODEL } from "./server.mjs"

const REQUIRED = [
  "toggle-three",
  "idle-state",
  "tool-turn",
  "usage-known",
  "last-event",
  "replay",
  "back-to-chat",
  "trajectory-still-works",
  "locale-copy",
]

const run = createRun({ suite: "c5-runtime", required: REQUIRED, scriptPath: fileURLToPath(import.meta.url) })
const health = await api("GET", "/global/health").catch(() => null)
const LOCALE = process.env.OCO_E2E_LOCALE ?? ""
run.setEnv({ serverVersion: health?.version ?? null, modelMode: MODEL.mode, locale: LOCALE || "default" })
const { app, page } = await launch({ profile: "c5-runtime", run, env: LOCALE ? { OCO_DEV_LOCALE: LOCALE } : {} })

const COPY = {
  en: {
    runtime: "Runtime",
    chat: "Chat",
    trajectory: "Trajectory",
    counting: "Counting…",
    lastEvent: "Last event",
    focusDone: "Finished",
    focusIdle: "Nothing has run yet",
    stateIdle: "Idle",
    pauseFollowing: "Pause following",
    backToLive: "Back to live",
  },
  zh: {
    runtime: "运行",
    chat: "对话",
    trajectory: "轨迹",
    counting: "统计中…",
    lastEvent: "最后事件",
    focusDone: "已完成",
    focusIdle: "还没有运行过",
    stateIdle: "空闲",
    pauseFollowing: "暂停跟随",
    backToLive: "返回实时",
  },
}

const L = /^zh(-cn|-sg|-hans)?$/i.test(LOCALE) ? COPY.zh : COPY.en
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
  await input.click()
  await input.focus()
  await page.keyboard.type(text, { delay: 4 })
  await sleep(200)
  await page.keyboard.press("Enter")
  await waitUntil(async () => (await users()) > before, 30000, 100)
}

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
  run.record(
    "idle-state",
    idleStateAttr === "idle" && (idleFocusAttr === "idle" || idleFocusAttr === "done") ? "PASS" : "FAIL",
    { state: idleStateAttr, focus: idleFocusAttr },
  )

  // 9. locale-copy
  // with OCO_E2E_LOCALE=zh-cn the third toggle label is "运行" and state text is Chinese; under en it's "Runtime" and English.
  const toggleLabel = (await fA.locator('[data-oco-view="runtime"]').innerText()).trim()
  const stateText = (await fA.locator("[data-oco-runtime-state]").innerText()).trim()
  const hasHan = /[\u4e00-\u9fff]/.test(stateText)
  const isZh = L === COPY.zh
  const localeMatch = isZh
    ? toggleLabel === "运行" && hasHan && stateText.includes("空闲")
    : toggleLabel === "Runtime" && !hasHan && stateText.includes("Idle")
  run.record("locale-copy", localeMatch ? "PASS" : "FAIL", { toggleLabel, stateText, hasHan, localeMatch, locale: LOCALE || "en" })

  // Switch back to chat to send a bash tool turn
  await fA.locator('[data-oco-runtime] [data-oco-view="chat"]').click()
  await fA.locator('[data-component="prompt-input"]').waitFor({ state: "visible", timeout: 10000 })

  // 3. tool-turn
  // Send a message that triggers a bash tool, switch to Runtime
  await send(fA, `Use the bash tool to run exactly: echo ${MARK} . Then reply with the output.`)

  // Switch to Runtime
  await fA.locator('[data-oco-view="runtime"]').click()
  await fA.locator("[data-oco-runtime]").waitFor({ state: "visible", timeout: 10000 })

  // Permission will be asked for bash
  let perm
  await waitUntil(async () => (perm = ((await api("GET", "/permission")) ?? []).find((p) => p.sessionID === A)), 30000, 200)

  // Wait for tool row to appear
  await waitUntil(async () => (await count(fA, "[data-oco-runtime-tool]")) >= 1, 10000, 100)
  const toolRowCountDuring = await count(fA, "[data-oco-runtime-tool]")
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
  const finalToolCount = await count(fA, "[data-oco-runtime-tool]")
  const focusDone = (await fA.locator("[data-oco-runtime-focus]").innerText().catch(() => "")).trim()
  const focusDoneMatches = focusDone === L.focusDone
  const focusDuringDiffered = Boolean(focusDuring && focusDuring !== focusDone)

  await runShot(page, run, "3-tool-turn-done")
  run.record(
    "tool-turn",
    toolRowCountDuring >= 1 && toolEndCount >= 1 && reqEndCount >= 1 && focusDoneMatches && focusDuringDiffered ? "PASS" : "FAIL",
    { toolRowCountDuring, finalToolCount, toolEndCount, reqEndCount, focusDuring, focusDone, focusDuringDiffered, focusDoneMatches },
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
  const noDisconnect = !/disconnect|断连|斷連|斷線/i.test(panelText)

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
  const liveToolCount = await count(fA, "[data-oco-runtime-tool]")
  const liveCountsValid = liveToolEndCount >= 1 && liveReqEndCount >= 1

  const pauseBtn = fA.locator("[data-oco-runtime-replay] button")
  const pauseBtnText = (await pauseBtn.innerText().catch(() => "")).trim()
  const pauseBtnMatches = pauseBtnText === L.pauseFollowing
  await pauseBtn.click()

  await waitUntil(async () => (await fA.locator("[data-oco-runtime]").getAttribute("data-oco-runtime-mode")) === "replay", 5000, 100)
  const modeReplay = (await fA.locator("[data-oco-runtime]").getAttribute("data-oco-runtime-mode")) === "replay"
  const slider = fA.locator('[data-oco-runtime-replay] input[type="range"]')
  const sliderVisible = await slider.waitFor({ state: "visible", timeout: 5000 }).then(() => true, () => false)
  const noteVisible = await fA.locator("[data-oco-runtime-replay-note]").waitFor({ state: "visible", timeout: 5000 }).then(() => true, () => false)

  const stepLabelBefore = (await fA.locator("[data-oco-runtime-replay] span").first().innerText().catch(() => "")).trim()
  const sliderMax = Number(await slider.getAttribute("max").catch(() => "0"))
  const sliderHasSteps = sliderMax >= 1

  // Drag slider to step 0
  await slider.evaluate((el) => {
    el.value = "0"
    el.dispatchEvent(new Event("input", { bubbles: true }))
  })
  await sleep(250)

  const stepLabelAfter = (await fA.locator("[data-oco-runtime-replay] span").first().innerText().catch(() => "")).trim()
  const stepLabelChanged = Boolean(stepLabelBefore && stepLabelAfter && stepLabelBefore !== stepLabelAfter)
  const step0ToolEndCount = await count(fA, '[data-oco-runtime-event="tool.end"]')
  const step0ReqEndCount = await count(fA, '[data-oco-runtime-event="request.end"]')
  const step0ToolCount = await count(fA, "[data-oco-runtime-tool]")
  const countsLower = step0ToolEndCount < liveToolEndCount && step0ReqEndCount < liveReqEndCount
  const countUnderOrEqual = step0ToolCount <= liveToolCount

  // Click "Back to live"/"返回实时"
  const liveBtn = fA.locator("[data-oco-runtime-replay] button")
  const liveBtnText = (await liveBtn.innerText().catch(() => "")).trim()
  const liveBtnMatches = liveBtnText === L.backToLive
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
      countUnderOrEqual &&
      liveBtnMatches &&
      modeLive
      ? "PASS"
      : "FAIL",
    {
      liveToolEndCount,
      liveReqEndCount,
      step0ToolEndCount,
      step0ReqEndCount,
      liveToolCount,
      step0ToolCount,
      sliderMax,
      stepLabelBefore,
      stepLabelAfter,
      pauseBtnText,
      liveBtnText,
      pauseBtnMatches,
      liveBtnMatches,
      modeReplay,
      sliderVisible,
      noteVisible,
      sliderHasSteps,
      stepLabelChanged,
      countsLower,
      countUnderOrEqual,
      modeLive,
    },
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
} catch (e) {
  run.record("run", "FAIL", { error: String(e?.message ?? e).slice(0, 500) })
  await runShot(page, run, "error")
} finally {
  const code = run.finish()
  try {
    await Promise.race([app.close(), sleep(2000)])
  } catch {}
  process.exit(code)
}
