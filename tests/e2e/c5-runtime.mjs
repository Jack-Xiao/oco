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
  "reasoning",
  "motion-on",
  "reduced-motion",
  "keyboard",
]

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
    stateIdle: "Idle",
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
    stateIdle: "空闲",
    pauseFollowing: "暂停跟随",
    backToLive: "返回实时",
    toolDone: "已完成",
    childDone: "子代理已结束",
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
  const liveToolCount = await count(fA, "[data-oco-runtime-tool]")
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
  const step0ToolCount = await count(fA, "[data-oco-runtime-tool]")
  const countsLower = step0ToolEndCount < liveToolEndCount && step0ReqEndCount < liveReqEndCount
  const countUnderOrEqual = step0ToolCount <= liveToolCount

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

  // ---- M2: actions from the runtime view ----
  const attr = (sel, name) => fA.locator(sel).first().getAttribute(name).catch(() => null)
  const openRuntime = async () => {
    if (await count(fA, "[data-oco-runtime]")) return
    await fA.locator('[data-oco-view="runtime"]').first().click()
    await fA.locator("[data-oco-runtime]").waitFor({ state: "visible", timeout: 10000 })
  }
  const pendingFor = async (kind) => ((await api("GET", `/${kind}`)) ?? []).filter((x) => x.sessionID === A)
  const tools = async (name) => ((await messages(A)) ?? []).flatMap((m) => m.parts).filter((p) => p.type === "tool" && p.tool === name)
  const waitAttention = (kind) =>
    waitUntil(async () => (await count(fA, `[data-oco-runtime-attention-kind="${kind}"]`)) >= 1, 30000, 100).then(() => true, () => false)
  const replyKinds = () =>
    fA.locator("[data-oco-runtime-reply]").evaluateAll((els) => [...new Set(els.map((e) => e.getAttribute("data-oco-runtime-reply")))].sort())

  // perm-approve & reply-in-panel:
  // a bash ask shows three reply buttons in the fixed left "needs you" panel, each once in the DOM and none
  // inside the tree; "once" lets the tool finish.
  await openRuntime()
  const bashBefore = (await tools("bash")).length
  await send(fA, `Use the bash tool to run exactly: echo ${MARK}-approve . Then reply with the output.`)
  const approveAsked = await waitAttention("permission")
  const approveKinds = await replyKinds()

  // reply-in-panel verification:
  const permPanel = fA.locator("[data-oco-runtime-attention-panel]")
  const permToolVis = await permPanel.isVisible().catch(() => false)
  const inNodeOnce = (await permPanel.locator('[data-oco-runtime-reply="once"]').count()) === 1
  const inNodeAlways = (await permPanel.locator('[data-oco-runtime-reply="always"]').count()) === 1
  const inNodeReject = (await permPanel.locator('[data-oco-runtime-reply="reject"]').count()) === 1
  const treeReplies = await count(fA, "[data-oco-runtime-mechanism] [data-oco-runtime-reply]")
  const onceTotal = await count(fA, '[data-oco-runtime-reply="once"]')
  const alwaysTotal = await count(fA, '[data-oco-runtime-reply="always"]')
  const rejectTotal = await count(fA, '[data-oco-runtime-reply="reject"]')
  const replyButtonsUnique = onceTotal === 1 && alwaysTotal === 1 && rejectTotal === 1 && inNodeOnce && inNodeAlways && inNodeReject && treeReplies === 0

  await fA.locator('[data-oco-runtime-reply="once"]').first().click()
  let approvePendingSeen = false
  const approveCleared = await waitUntil(async () => {
    if (await count(fA, "[data-oco-runtime-pending]")) approvePendingSeen = true
    return (await count(fA, "[data-oco-runtime-attention]")) === 0 && (await pendingFor("permission")).length === 0
  }, 30000, 100).then(() => true, () => false)
  await waitReply(A)
  const approveTool = (await tools("bash")).slice(bashBefore).at(-1)

  run.record(
    "perm-approve",
    approveAsked && approveKinds.join() === "always,once,reject" && approveCleared && approveTool?.state?.status === "completed" ? "PASS" : "FAIL",
    { approveAsked, approveKinds, approvePendingSeen, approveCleared, toolStatus: approveTool?.state?.status ?? null },
  )

  run.record(
    "reply-in-panel",
    permToolVis && replyButtonsUnique && approveCleared && approveTool?.state?.status === "completed" ? "PASS" : "FAIL",
    { permToolVis, replyButtonsUnique, treeReplies, inNodeOnce, inNodeAlways, inNodeReject, onceTotal, alwaysTotal, rejectTotal, approveCleared, toolStatus: approveTool?.state?.status ?? null },
  )

  // perm-reject: "reject" ends the tool with an error and clears the attention.
  const rejectBefore = (await tools("bash")).length
  await send(fA, `Use the bash tool to run exactly: echo ${MARK}-reject . Then reply with the output.`)
  const rejectAsked = await waitAttention("permission")
  await fA.locator('[data-oco-runtime-reply="reject"]').first().click()
  const rejectCleared = await waitUntil(
    async () => (await count(fA, "[data-oco-runtime-attention]")) === 0 && (await pendingFor("permission")).length === 0,
    30000,
    100,
  ).then(() => true, () => false)
  await waitIdle(A)
  const rejectTool = (await tools("bash")).slice(rejectBefore).at(-1)
  run.record(
    "perm-reject",
    rejectAsked && rejectCleared && rejectTool?.state?.status === "error" ? "PASS" : "FAIL",
    { rejectAsked, rejectCleared, toolStatus: rejectTool?.state?.status ?? null, error: String(rejectTool?.state?.error ?? "").slice(0, 120) },
  )

  // question-route: "answer in chat" switches to the chat view with the question dock; answering there clears it.
  await send(fA, "Use the question tool (not plain text) to ask which color I prefer, with exactly two options: red and blue. After my answer reply with the color only.")
  const questionAsked = await waitAttention("question")
  await fA.locator('[data-oco-runtime-question="answer"]').first().click()
  const dock = fA.locator('[data-component="dock-prompt"][data-kind="question"]')
  const dockVisible = await dock.waitFor({ state: "visible", timeout: 15000 }).then(() => true, () => false)
  const runtimeLeft = (await count(fA, "[data-oco-runtime]")) === 0
  if (dockVisible) {
    await dock.getByText(/^blue$/i).first().click()
    const submit = dock.getByRole("button", { name: /submit|send|提交|发送|confirm|确认/i })
    if (await submit.count()) await submit.first().click()
  }
  await waitIdle(A)
  await openRuntime()
  const questionCleared = await waitUntil(
    async () => (await count(fA, "[data-oco-runtime-attention]")) === 0 && (await pendingFor("question")).length === 0,
    15000,
    100,
  ).then(() => true, () => false)
  run.record(
    "question-route",
    questionAsked && dockVisible && runtimeLeft && questionCleared ? "PASS" : "FAIL",
    { questionAsked, dockVisible, runtimeLeft, questionCleared },
  )

  // stop: the stop button aborts a long answer; the view ends in cancelled ("requested" is recorded, not required).
  await send(fA, "Write 300 numbered sentences about the sea.")
  const stopShown = await fA.locator("[data-oco-runtime-stop]").first().waitFor({ state: "visible", timeout: 30000 }).then(() => true, () => false)
  if (stopShown) await fA.locator("[data-oco-runtime-stop]").first().click()
  let stopRequestedSeen = false
  const stopCancelled = await waitUntil(async () => {
    if (await count(fA, '[data-oco-runtime-cancel="requested"]')) stopRequestedSeen = true
    return (await count(fA, '[data-oco-runtime-cancel="cancelled"]')) >= 1 && (await attr("[data-oco-runtime-focus]", "data-oco-runtime-focus")) === "cancelled"
  }, 30000, 100).then(() => true, () => false)
  const stopLast = ((await messages(A)) ?? []).at(-1)?.info
  await runShot(page, run, "m2-stop")
  run.record(
    "stop",
    stopShown && stopCancelled ? "PASS" : "FAIL",
    { stopShown, stopRequestedSeen, stopCancelled, lastError: stopLast?.error?.name ?? null, focus: await attr("[data-oco-runtime-focus]", "data-oco-runtime-focus") },
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

  // subagent: a task row appears; expanding shows the child panel; at the end the row shows the task status
  // and the child lifecycle "done" as two separate texts.
  await send(fA, "Use the task tool with the explore agent: probe")
  const toggle = fA.locator("[data-oco-runtime-child-toggle]").last()
  const toggleShown = await toggle.waitFor({ state: "visible", timeout: 30000 }).then(() => true, () => false)
  const childID = toggleShown ? await toggle.getAttribute("data-oco-runtime-child-toggle") : null
  if (toggleShown) await toggle.click()
  // Redesign 2: "enter" replaces the tree with the child's tree and shows a breadcrumb back to the main agent.
  const panel = fA.locator(`[data-oco-runtime-child="${childID}"]`)
  const panelShown = childID ? await panel.waitFor({ state: "visible", timeout: 15000 }).then(() => true, () => false) : false
  const expanded = await fA.locator("[data-oco-runtime-crumb]").isVisible().catch(() => false)
  await waitReply(A)
  const childDone = childID
    ? await waitUntil(async () => (await attr(`[data-oco-runtime-child="${childID}"]`, "data-oco-runtime-child-lifecycle")) === "done", 30000, 200).then(() => true, () => false)
    : false
  await fA.locator("[data-oco-runtime-crumb] button").first().click().catch(() => {})
  await fA.locator(`[data-oco-runtime-child-toggle="${childID}"]`).waitFor({ state: "visible", timeout: 5000 }).catch(() => {})
  const row = fA.locator("[data-oco-runtime-tool]", { has: fA.locator(`[data-oco-runtime-child-toggle="${childID}"]`) }).first()
  const rowText = childID ? await row.innerText().catch(() => "") : ""
  const taskPart = (await tools("task")).at(-1)
  await runShot(page, run, "m2-subagent")
  run.record(
    "subagent",
    toggleShown && expanded && panelShown && childDone && taskPart?.state?.status === "completed" && rowText.includes(L.toolDone) && rowText.includes(L.childDone)
      ? "PASS"
      : "FAIL",
    { childID, toggleShown, expanded, panelShown, childDone, taskStatus: taskPart?.state?.status ?? null, rowText: rowText.replace(/\s+/g, " ").slice(0, 200) },
  )

  // replay-no-actions: with a pending permission, pausing removes every reply/stop button from the DOM;
  // back to live they return. The permission is rejected at the end.
  await send(fA, `Use the bash tool to run exactly: echo ${MARK}-replay . Then reply with the output.`)
  const replayAsked = await waitAttention("permission")
  const liveReplies = await count(fA, "[data-oco-runtime-reply]")
  await fA.locator("[data-oco-runtime-replay-pause]").click()
  await waitUntil(async () => (await attr("[data-oco-runtime]", "data-oco-runtime-mode")) === "replay", 5000, 100).catch(() => {})
  const inReplay = (await attr("[data-oco-runtime]", "data-oco-runtime-mode")) === "replay"
  const replayReplies = await count(fA, "[data-oco-runtime-reply]")
  const replayQuestions = await count(fA, "[data-oco-runtime-question]")
  const replayStops = await count(fA, "[data-oco-runtime-stop]")
  await fA.locator("[data-oco-runtime-replay-live]").click()
  await waitUntil(async () => (await attr("[data-oco-runtime]", "data-oco-runtime-mode")) === "live", 5000, 100).catch(() => {})
  const backReplies = await waitUntil(async () => (await count(fA, "[data-oco-runtime-reply]")) >= 1, 5000, 100).then(() => true, () => false)
  const backStop = (await count(fA, "[data-oco-runtime-stop]")) >= 1
  if (backReplies) await fA.locator('[data-oco-runtime-reply="reject"]').first().click()
  for (const x of await pendingFor("permission")) await api("POST", `/permission/${x.id}/reply`, { reply: "reject" })
  await waitIdle(A)
  run.record(
    "replay-no-actions",
    replayAsked && liveReplies >= 3 && inReplay && replayReplies === 0 && replayQuestions === 0 && replayStops === 0 && backReplies && backStop
      ? "PASS"
      : "FAIL",
    { replayAsked, liveReplies, inReplay, replayReplies, replayQuestions, replayStops, backReplies, backStop },
  )

  // ---- M3: keyboard, reasoning, widths, mechanism, motion, legend/summary/fill ----

  // keyboard: Tab to tool toggle, focus-visible outline or box-shadow, Enter to expand, Space to collapse,
  // duration text in tool detail, button button count 0, live region has focus sentence and no reasoning.
  const toolToggle = fA.locator("[data-oco-runtime-tool-toggle]").first()
  await toolToggle.waitFor({ state: "visible", timeout: 10000 })

  // Focus preceding element and Tab to tool toggle
  await fA.locator('[data-oco-view="chat"]').first().focus()
  let tabFocused = false
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press("Tab")
    const isTarget = await toolToggle.evaluate((el) => document.activeElement === el).catch(() => false)
    if (isTarget) {
      tabFocused = true
      break
    }
  }
  if (!tabFocused) {
    await toolToggle.focus()
  }

  const focusStyle = await toolToggle.evaluate((el) => {
    const cs = window.getComputedStyle(el)
    const hasOutline = cs.outlineStyle !== "none" && cs.outlineWidth !== "0px" && cs.outlineWidth !== ""
    const hasBoxShadow = cs.boxShadow !== "none" && cs.boxShadow !== ""
    return {
      outline: cs.outline,
      boxShadow: cs.boxShadow,
      hasOutlineOrBoxShadow: hasOutline || hasBoxShadow,
    }
  })

  // Geometry of the four lanes; opening the detail panel must not move or resize any of them.
  const laneRects = () =>
    fA.evaluate(() =>
      [...document.querySelectorAll("[data-oco-runtime-lane]")]
        .map((e) => {
          const r = e.getBoundingClientRect()
          return [r.x, r.y, r.width, r.height].map(Math.round).join(",")
        })
        .join("|"),
    )
  const lanesBeforeDetail = await laneRects()
  // Enter to expand
  const kbBeforeEnter = (await toolToggle.getAttribute("aria-expanded")) === "true"
  await page.keyboard.press("Enter")
  await sleep(250)
  const kbAfterEnter = (await toolToggle.getAttribute("aria-expanded")) === "true"
  const toolDetailEl = fA.locator("[data-oco-runtime-tool-detail]").first()
  const detailVisible = await toolDetailEl.isVisible()
  const detailText = detailVisible ? await toolDetailEl.innerText() : ""
  const hasDuration = /duration|耗时|未知|\d+\s*(ms|s)/i.test(detailText)
  const lanesWithDetail = await laneRects()
  const detailKeepsLayout = lanesBeforeDetail.length > 0 && lanesBeforeDetail === lanesWithDetail

  // Space to collapse
  await page.keyboard.press("Space")
  await sleep(250)
  const kbAfterSpace = (await toolToggle.getAttribute("aria-expanded")) === "true"

  // Button nesting count
  const nestedButtonCount = await count(fA, "[data-oco-runtime] button button")

  // Live region
  const liveEl = fA.locator("[data-oco-runtime-live]")
  const liveVisible = (await liveEl.count()) >= 1
  const liveText = liveVisible ? (await liveEl.innerText()).trim() : ""
  const liveHasFocus = liveText.length > 0
  const liveHasReasoning = (await liveEl.locator("[data-oco-runtime-reasoning]").count()) > 0 || /reasoning|思考/i.test(liveText)

  const kbPass =
    focusStyle.hasOutlineOrBoxShadow &&
    !kbBeforeEnter &&
    kbAfterEnter &&
    !kbAfterSpace &&
    detailVisible &&
    hasDuration &&
    detailKeepsLayout &&
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
      kbBeforeEnter,
      kbAfterEnter,
      kbAfterSpace,
      detailVisible,
      hasDuration,
      detailText: detailText.slice(0, 100),
      detailKeepsLayout,
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
  const thinkButtons = await count(fA, "[data-oco-runtime-think] button")
  const thinkStable = thinkWhileStreaming !== null && thinkWhileStreaming === thinkAfterDone

  const reasonPass = sawReasonStreaming && sawReasonDone && reasonStateFinal === "done" && thinkStable && thinkButtons === 0

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

  // Trigger sleep 3 for deterministic tool running window
  await send(fA, "Use the bash tool to run: echo 'long command name with parameter echo and output' && sleep 3")
  await waitUntil(async () => (await fA.locator('[data-oco-runtime-reply="once"]').count()) >= 1, 30000, 100)
  await fA.locator('[data-oco-runtime-reply="once"]').first().click()

  // Wait for running edge to appear
  await waitUntil(
    async () => (await count(fA, '[data-oco-runtime-edge-dir="dispatch"][data-oco-runtime-edge-active="true"]')) >= 1,
    4000,
    50,
  )

  // Within running window at width 420:
  const w420StopVis = await fA.locator("[data-oco-runtime-stop]").isVisible().catch(() => false)
  const w420FocusVis = await fA.locator("[data-oco-runtime-focus]").isVisible().catch(() => false)
  const w420Overflow = await fA.evaluate(() => {
    const root = document.querySelector("[data-oco-runtime]")
    return {
      scrollWidth: root.scrollWidth,
      clientWidth: root.clientWidth,
      noOverflow: root.scrollWidth <= root.clientWidth + 1,
    }
  })
  // Layout signal: the slot rail's data attribute AND its computed layout must agree (vertical = flex column).
  const railOf = () =>
    fA.evaluate(() => {
      // Redesign 2: the layout attribute and the rail must agree with the measured widths and with where the
      // four lanes actually sit (one column = vertical rail, side by side = grid).
      const root = document.querySelector("[data-oco-runtime]")
      const el = document.querySelector("[data-oco-runtime-rail]")
      const mechWidth = document.querySelector("[data-oco-runtime-mechanism]")?.clientWidth ?? null
      const xs = new Set([...document.querySelectorAll("[data-oco-runtime-lane]")].map((e) => Math.round(e.getBoundingClientRect().x)))
      return {
        rail: el?.getAttribute("data-oco-runtime-rail") ?? null,
        layout: root?.getAttribute("data-oco-runtime-layout") ?? null,
        rootWidth: root?.clientWidth ?? null,
        rootScrolls: root ? root.scrollHeight > root.clientHeight + 1 : null,
        laneColumns: xs.size,
        mechWidth,
      }
    })
  const w420Rail = await railOf()
  const railMatchesWidth = (r) =>
    r.mechWidth !== null &&
    r.layout === (r.rootWidth < 900 ? "stack" : "wide") &&
    (r.mechWidth < 560 ? r.rail === "vertical" && r.laneColumns === 1 : r.rail === "grid" && r.laneColumns >= 2)
  const w420Vertical = railMatchesWidth(w420Rail) && w420Rail.rail === "vertical"
  // fill during the running window: the bash slot is not terminal yet, so done < total.
  const fillOf = async () => {
    const text = (await fA.locator("[data-oco-runtime-fill]").first().innerText().catch(() => "")).replace(/\s+/g, " ").trim()
    const m = text.match(/(\d+)\s*\/\s*(\d+)/)
    return { text: text.slice(0, 100), done: m ? Number(m[1]) : null, total: m ? Number(m[2]) : null }
  }
  const fillDuring = await fillOf()

  // Screenshot width-420.png into run artifact directory
  await page.screenshot({ path: run.artifact("width-420.png") })

  run.record(
    "width-420",
    w420StopVis && w420FocusVis && w420Overflow.noOverflow && w420Vertical ? "PASS" : "FAIL",
    { stopVisible: w420StopVis, focusVisible: w420FocusVis, isVertical: w420Vertical, ...w420Rail, ...w420Overflow },
  )

  // motion-on: active edge flow animation-name is not none
  const activeDispatchEdgeCount = await count(fA, '[data-oco-runtime-edge-dir="dispatch"][data-oco-runtime-edge-active="true"]')
  const flowCountRunning = await count(fA, '[data-oco-runtime-flow]')
  const flowEl = fA.locator('[data-oco-runtime-flow]').first()
  const motionOnAnimName = flowCountRunning >= 1
    ? await flowEl.evaluate((el) => window.getComputedStyle(el).animationName)
    : "none"
  const motionOnPass = motionOnAnimName !== "none" && motionOnAnimName !== ""
  run.record(
    "motion-on",
    motionOnPass ? "PASS" : "FAIL",
    { activeDispatchEdgeCount, flowCountRunning, animationName: motionOnAnimName },
  )

  // reduced-motion: with reduce motion, animation-name is none, edge is still active, tool.start in log
  await page.emulateMedia({ reducedMotion: "reduce" })
  await sleep(100)
  const reducedAnimName = flowCountRunning >= 1
    ? await flowEl.evaluate((el) => window.getComputedStyle(el).animationName)
    : "none"
  const reducedEdgeActive = (await count(fA, '[data-oco-runtime-edge-dir="dispatch"][data-oco-runtime-edge-active="true"]')) >= 1
  const reducedHasToolStart = (await count(fA, '[data-oco-runtime-event="tool.start"]')) >= 1
  await page.emulateMedia({ reducedMotion: "no-preference" })

  const reducedPass = reducedAnimName === "none" && reducedEdgeActive && reducedHasToolStart
  run.record(
    "reduced-motion",
    reducedPass ? "PASS" : "FAIL",
    { reducedAnimName, reducedEdgeActive, reducedHasToolStart },
  )

  // Wait for sleep 3 to finish
  await waitIdle(A)
  await sleep(400)

  // Check mechanism after finish:
  const mechState = await attr("[data-oco-runtime-mechanism]", "data-oco-runtime-mechanism")
  const mechToggleCount = await count(fA, "[data-oco-runtime-mechanism-toggle]")
  const activeEdgesAfter = await count(fA, '[data-oco-runtime-edge-active="true"]')

  // Pause following (replay mode): no data-oco-runtime-flow and no reply buttons
  await fA.locator("[data-oco-runtime-replay-pause]").click()
  await waitUntil(async () => (await attr("[data-oco-runtime]", "data-oco-runtime-mode")) === "replay", 5000, 100)
  const replayFlowCount = await count(fA, "[data-oco-runtime-flow]")
  const replayReplyCount = await count(fA, "[data-oco-runtime-reply]")
  // Back to live
  await fA.locator("[data-oco-runtime-replay-live]").click()
  await waitUntil(async () => (await attr("[data-oco-runtime]", "data-oco-runtime-mode")) === "live", 5000, 100)

  const mechPass =
    mechState === "expanded" &&
    mechToggleCount === 0 &&
    activeDispatchEdgeCount >= 1 &&
    flowCountRunning >= 1 &&
    activeEdgesAfter === 0 &&
    replayFlowCount === 0 &&
    replayReplyCount === 0

  run.record(
    "mechanism",
    mechPass ? "PASS" : "FAIL",
    {
      mechState,
      mechToggleCount,
      activeDispatchEdgeCount,
      flowCountRunning,
      activeEdgesAfter,
      replayFlowCount,
      replayReplyCount,
    },
  )

  // width-560
  await fitGroups(app, page, 560)
  await send(fA, "Use the bash tool to run: sleep 3")
  await waitUntil(async () => (await fA.locator('[data-oco-runtime-reply="once"]').count()) >= 1, 30000, 100)
  await fA.locator('[data-oco-runtime-reply="once"]').first().click()
  await waitUntil(async () => (await count(fA, '[data-oco-runtime-edge-dir="dispatch"][data-oco-runtime-edge-active="true"]')) >= 1, 4000, 50)
  const w560StopVis = await fA.locator("[data-oco-runtime-stop]").isVisible().catch(() => false)
  const w560FocusVis = await fA.locator("[data-oco-runtime-focus]").isVisible().catch(() => false)
  const w560Overflow = await fA.evaluate(() => {
    const root = document.querySelector("[data-oco-runtime]")
    return {
      scrollWidth: root.scrollWidth,
      clientWidth: root.clientWidth,
      noOverflow: root.scrollWidth <= root.clientWidth + 1,
    }
  })
  const w560Rail = await railOf()
  // Screenshot width-560.png into run artifact directory
  await page.screenshot({ path: run.artifact("width-560.png") })
  await waitIdle(A)
  run.record(
    "width-560",
    w560StopVis && w560FocusVis && w560Overflow.noOverflow && railMatchesWidth(w560Rail) ? "PASS" : "FAIL",
    { stopVisible: w560StopVis, focusVisible: w560FocusVis, ...w560Rail, ...w560Overflow },
  )

  // width-wide (1200)
  await fitGroups(app, page, 1200)
  await send(fA, "Use the bash tool to run: sleep 3")
  await waitUntil(async () => (await fA.locator('[data-oco-runtime-reply="once"]').count()) >= 1, 30000, 100)
  await fA.locator('[data-oco-runtime-reply="once"]').first().click()
  await waitUntil(async () => (await count(fA, '[data-oco-runtime-edge-dir="dispatch"][data-oco-runtime-edge-active="true"]')) >= 1, 4000, 50)
  const wWideStopVis = await fA.locator("[data-oco-runtime-stop]").isVisible().catch(() => false)
  const wWideFocusVis = await fA.locator("[data-oco-runtime-focus]").isVisible().catch(() => false)
  const wWideOverflow = await fA.evaluate(() => {
    const root = document.querySelector("[data-oco-runtime]")
    return {
      scrollWidth: root.scrollWidth,
      clientWidth: root.clientWidth,
      noOverflow: root.scrollWidth <= root.clientWidth + 1,
    }
  })
  const wWideRail = await railOf()
  // Screenshot width-wide.png into run artifact directory
  await page.screenshot({ path: run.artifact("width-wide.png") })
  await waitIdle(A)
  run.record(
    "width-wide",
    wWideStopVis && wWideFocusVis && wWideOverflow.noOverflow && railMatchesWidth(wWideRail) && wWideRail.layout === "wide" && wWideRail.rootScrolls === false ? "PASS" : "FAIL",
    { stopVisible: wWideStopVis, focusVisible: wWideFocusVis, ...wWideRail, ...wWideOverflow },
  )

  // ---- Redesign 2: full-screen width, parallel subagents, geometry stability ----
  // One message dispatches three slow subagents (mock "task tool 3 times in parallel"). At 1600 px the frame is
  // "wide" and does not scroll; the four lanes and the think box keep exactly the same rects while running,
  // after the turn ends and in replay. If the layout regresses to content-sized boxes, geometry-stable fails;
  // if subagents are serialised or dropped from the tree, parallel-subagents fails.
  await fitGroups(app, page, 1600)
  const geom = () =>
    fA.evaluate(() =>
      [...document.querySelectorAll("[data-oco-runtime-lane], [data-oco-runtime-think]")]
        .map((e) => {
          const r = e.getBoundingClientRect()
          return [r.x, r.y, r.width, r.height].map(Math.round).join(",")
        })
        .join("|"),
    )
  await send(fA, "Use the task tool 3 times in parallel: find callers; check cache; read docs")
  let parChildLanes = 0
  let parActiveEdges = 0
  const parSeen = await waitUntil(async () => {
    parChildLanes = await count(fA, '[data-oco-runtime-lane-kind="child"]')
    parActiveEdges = await count(fA, '[data-oco-runtime-edge-dir="dispatch"][data-oco-runtime-edge-active="true"]')
    return parChildLanes >= 3 && parActiveEdges >= 2
  }, 20000, 100).then(() => true, () => false)
  const parRoster = await count(fA, "[data-oco-runtime-roster-item]")
  const w1600Rail = await railOf()
  const w1600StopVis = await fA.locator("[data-oco-runtime-stop]").isVisible().catch(() => false)
  const w1600FocusVis = await fA.locator("[data-oco-runtime-focus]").isVisible().catch(() => false)
  const w1600Overflow = await fA.evaluate(() => {
    const root = document.querySelector("[data-oco-runtime]")
    return { scrollWidth: root.scrollWidth, clientWidth: root.clientWidth, noOverflow: root.scrollWidth <= root.clientWidth + 1 }
  })
  const geomRunning = await geom()
  await page.screenshot({ path: run.artifact("par-running.png") })
  await waitIdle(A)
  await sleep(600)
  const geomDone = await geom()
  await page.screenshot({ path: run.artifact("par-done.png") })
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
    "width-1600",
    w1600StopVis && w1600FocusVis && w1600Overflow.noOverflow && railMatchesWidth(w1600Rail) && w1600Rail.layout === "wide" && w1600Rail.rootScrolls === false
      ? "PASS"
      : "FAIL",
    { stopVisible: w1600StopVis, focusVisible: w1600FocusVis, ...w1600Rail, ...w1600Overflow },
  )
  run.record("parallel-subagents", parSeen && parRoster >= 3 ? "PASS" : "FAIL", { parChildLanes, parActiveEdges, parRoster })
  run.record(
    "geometry-stable",
    geomRunning.split("|").length === 5 && geomRunning === geomDone && geomDone === geomReplay ? "PASS" : "FAIL",
    { geomRunning, geomDone, geomReplay },
  )

  // legend / summary / fill
  const legendEl = fA.locator("[data-oco-runtime-legend]")
  const legendCount = await count(fA, "[data-oco-runtime-legend]")
  const legendText = legendCount >= 1 ? (await legendEl.innerText()).trim() : ""
  run.record(
    "legend",
    legendCount >= 1 && legendText.length > 0 ? "PASS" : "FAIL",
    { legendCount, legendText: legendText.replace(/\s+/g, " ").slice(0, 100) },
  )

  const summaryEl = fA.locator("[data-oco-runtime-summary]")
  const summaryCount = await count(fA, "[data-oco-runtime-summary]")
  const summaryText = summaryCount >= 1 ? (await summaryEl.innerText()).trim() : ""
  const summaryHasReq = /(Request|请求|請求)\s*#?\d+/i.test(summaryText)
  run.record(
    "summary",
    summaryCount >= 1 && summaryHasReq ? "PASS" : "FAIL",
    { summaryCount, summaryText: summaryText.replace(/\s+/g, " ").slice(0, 120), summaryHasReq },
  )

  // After the last bash turn ends (text-only final request) the tree keeps that dispatch: done === total >= 1.
  const fillCount = await count(fA, "[data-oco-runtime-fill]")
  const fillAfter = await fillOf()
  const fillDuringOk = fillDuring.total !== null && fillDuring.total >= 1 && fillDuring.done < fillDuring.total
  const fillAfterOk = fillAfter.total !== null && fillAfter.total >= 1 && fillAfter.done === fillAfter.total
  run.record(
    "fill",
    fillCount >= 1 && fillDuringOk && fillAfterOk ? "PASS" : "FAIL",
    { fillCount, fillDuring, fillAfter },
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
