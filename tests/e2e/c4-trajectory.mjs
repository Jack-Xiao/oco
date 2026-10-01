// Patch 0012: 对话 / 轨迹 trajectory view. Real VS Code + test server; session A has a bash tool turn and a
// long (reasoning + text) turn.
//   toggle-open        the header toggle swaps the chat timeline for the trajectory; the composer stays
//   rows-match-server  user / tool / reasoning rows, model bars and the request total match the server's messages
//   tool-detail        clicking the tool row shows its input and the command output
//   request-timing     the detail shows tokens and derived timings (first token latency is a number)
//   raw-content        "原始内容" shows the stored part JSON
//   live-update        a turn sent from the trajectory view appears and completes without reopening it
//   back-to-chat       the toggle returns to the chat timeline
//   switch-resets      switching sessions in the main panel returns to 对话
//   narrow-detail      in a ~480 px panel the detail covers the list, nothing scrolls sideways, ✕ closes it
import { fileURLToPath } from "node:url"
import { createRun } from "./lib/results.mjs"
import { launch, command, waitUntil, chatFrames, frameSession, sleep, runShot, fitGroups } from "./vscode.mjs"
import { api, messages, waitReply, MODEL } from "./server.mjs"

const REQUIRED = ["toggle-open", "rows-match-server", "tool-detail", "request-timing", "raw-content", "live-update", "back-to-chat", "switch-resets", "narrow-detail"]
const run = createRun({ suite: "c4-trajectory", required: REQUIRED, scriptPath: fileURLToPath(import.meta.url) })
const health = await api("GET", "/global/health").catch(() => null)
run.setEnv({ serverVersion: health?.version ?? null, modelMode: MODEL.mode })
const { app, page } = await launch({ profile: "c4-trajectory", run })
run.installCrashHandlers(() => app.close())
const rand = Math.random().toString(36).slice(2, 7)
const MARK = `traj-${rand}`

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
const count = (f, sel) => f.locator(sel).count()
const rowsSel = "[data-oco-trajectory-rows]"
const detailText = (f) => f.locator("[data-oco-trajectory-detail]").innerText().catch(() => "")
/** Value next to a detail field label, e.g. "首 token 延迟". */
const field = (f, label) =>
  f.evaluate((label) => {
    const el = [...document.querySelectorAll("[data-oco-trajectory-detail] div")].find((d) => d.textContent === label && d.nextElementSibling)
    return el?.nextElementSibling?.textContent ?? null
  }, label)

try {
  await command(page, "oco: New Session")
  let A
  await waitUntil(async () => {
    for (const f of await chatFrames(page)) A = await frameSession(f).catch(() => null)
    return !!A
  }, 60000, 200)
  let fA = await frameFor(A)
  await ready(fA)
  await send(fA, `Use the bash tool to run exactly: echo ${MARK} . Then reply with the output.`)
  // The test server asks before bash; approve once through the API (the dock itself is covered by p1b-narrow).
  let perm
  await waitUntil(async () => (perm = ((await api("GET", "/permission")) ?? []).find((p) => p.sessionID === A)), 30000, 200)
  await api("POST", `/permission/${perm.id}/reply`, { reply: "once" })
  await waitReply(A)
  await send(fA, "Write a numbered list from 1 to 30 of fruit names. No tools.")
  await waitReply(A)

  // 1. Open the trajectory from the header toggle.
  const toTrajectory = fA.locator('[data-oco-view="trajectory"]')
  await toTrajectory.waitFor({ state: "visible", timeout: 30000 })
  await toTrajectory.click()
  const opened = await fA.locator("[data-oco-trajectory]").waitFor({ state: "visible", timeout: 10000 }).then(() => true, () => false)
  const composerVisible = await fA.locator('[data-component="prompt-input"]').isVisible()
  await runShot(page, run, "1-trajectory")
  run.record("toggle-open", opened && composerVisible && (await count(fA, '[data-component="user-message"]')) === 0 ? "PASS" : "FAIL", { opened, composerVisible })

  // 2. Rows against the server's stored messages.
  const msgs = await messages(A)
  const server = {
    user: msgs.filter((m) => m.info.role === "user").length,
    assistant: msgs.filter((m) => m.info.role === "assistant").length,
    tool: msgs.flatMap((m) => m.parts).filter((p) => p.type === "tool").length,
    reasoning: msgs.flatMap((m) => m.parts).filter((p) => p.type === "reasoning" && p.text.trim()).length,
  }
  await waitUntil(async () => (await count(fA, `${rowsSel} [data-kind="user"]`)) === server.user, 10000, 100).catch(() => undefined)
  const ui = {
    user: await count(fA, `${rowsSel} [data-kind="user"]`),
    tool: await count(fA, `${rowsSel} [data-kind="tool"]`),
    reasoning: await count(fA, `${rowsSel} [data-kind="reasoning"]`),
    bars: await count(fA, '[data-oco-trajectory-lanes] button[aria-label^="请求 #"]'),
    totals: (await fA.locator("[data-oco-trajectory-totals]").innerText()).replace(/\s+/g, " "),
    userIds: await fA.locator(`${rowsSel} [data-kind="user"]`).evaluateAll((els) => els.map((e) => e.getAttribute("data-row"))),
  }
  server.userIds = msgs.filter((m) => m.info.role === "user").map((m) => m.info.id)
  run.record(
    "rows-match-server",
    ui.user === server.user && ui.tool === server.tool && server.tool === 1 && ui.reasoning === server.reasoning && server.reasoning > 0 &&
      ui.bars === server.assistant && ui.totals.includes(`请求 ${server.assistant}`) && ui.totals.includes("工具 1")
      ? "PASS"
      : "FAIL",
    { server, ui },
  )

  // 3. Tool row detail.
  await fA.locator(`${rowsSel} [data-kind="tool"]`).first().click()
  await fA.locator("[data-oco-trajectory-detail]").waitFor({ state: "visible", timeout: 5000 })
  const toolDetail = await detailText(fA)
  await runShot(page, run, "3-tool-detail")
  run.record("tool-detail", toolDetail.includes("输入 · bash") && toolDetail.includes(MARK) && toolDetail.includes("工具计时") ? "PASS" : "FAIL", {
    detail: toolDetail.slice(0, 400),
  })

  // 4. Request overview: tokens and timings of the request that produced the reasoning.
  await fA.locator(`${rowsSel} [data-kind="reasoning"]`).first().click()
  const timing = {
    ttft: await field(fA, "首 token 延迟"),
    generation: await field(fA, "生成"),
    total: await field(fA, "合计"),
    cacheRead: await field(fA, "缓存读取"),
    source: await field(fA, "来源"),
  }
  await runShot(page, run, "4-request-timing")
  run.record(
    "request-timing",
    /^\d+(\.\d+)? (毫秒|秒)$/.test(timing.ttft ?? "") && /毫秒|秒/.test(timing.generation ?? "") && /tok$/.test(timing.total ?? "") && timing.cacheRead !== null && /^请求 #\d+$/.test(timing.source ?? "")
      ? "PASS"
      : "FAIL",
    timing,
  )

  // 5. Raw content of the tool part.
  await fA.locator(`${rowsSel} [data-kind="tool"]`).first().click()
  await fA.locator("[data-oco-trajectory-detail] button", { hasText: "原始内容" }).click()
  const raw = await detailText(fA)
  run.record("raw-content", raw.includes('"callID"') && raw.includes('"type": "tool"') && raw.includes(MARK) ? "PASS" : "FAIL", { raw: raw.slice(0, 300) })
  await fA.locator("[data-oco-trajectory-detail] button", { hasText: "概述" }).click()

  // 6. Live: send from the trajectory view; the new request shows up while it streams and completes in place.
  const before = server.assistant
  await send(fA, "Write 40 numbered sentences about rivers. No tools.")
  const seenRunning = await waitUntil(async () => (await count(fA, '[data-oco-trajectory-lanes] button[aria-label^="请求 #"]')) > before, 20000, 100).then(
    () => true,
    () => false,
  )
  const stillOpenWhileRunning = await fA.locator("[data-oco-trajectory]").isVisible()
  await runShot(page, run, "6-live-running")
  await waitReply(A)
  await sleep(500)
  await fA.locator(`${rowsSel} [data-kind="text"]`).last().click()
  const lastText = await detailText(fA)
  await runShot(page, run, "6-live-done")
  run.record("live-update", seenRunning && stillOpenWhileRunning && lastText.includes("40. Mock line 40.") && lastText.includes("已完成") ? "PASS" : "FAIL", {
    seenRunning,
    stillOpenWhileRunning,
    tail: lastText.slice(-200),
  })

  // 7. Back to the chat timeline.
  await fA.locator('[data-oco-trajectory] [data-oco-view="chat"]').click()
  const chatBack = await fA.locator('[data-component="user-message"]').first().waitFor({ state: "visible", timeout: 10000 }).then(() => true, () => false)
  run.record("back-to-chat", chatBack && (await count(fA, "[data-oco-trajectory]")) === 0 ? "PASS" : "FAIL", { chatBack })

  // 8. Trajectory open, then another session in the main panel and back: 对话 again.
  await fA.locator('[data-oco-view="trajectory"]').click()
  await fA.locator("[data-oco-trajectory]").waitFor({ state: "visible", timeout: 10000 })
  await command(page, "oco: New Session")
  await waitUntil(async () => {
    for (const f of await chatFrames(page)) if ((await frameSession(f).catch(() => null)) !== A) return true
    return false
  }, 30000, 200)
  await command(page, "oco: Open Session", { input: A })
  fA = await frameFor(A)
  if (fA) await ready(fA)
  await sleep(500)
  const reset = fA ? (await count(fA, "[data-oco-trajectory]")) === 0 && (await count(fA, '[data-component="user-message"]')) > 0 : false
  await runShot(page, run, "8-switch-resets")
  run.record("switch-resets", reset ? "PASS" : "FAIL", { reset })

  // 9. Narrow panel: the detail overlays the list instead of squeezing it.
  const widths = await fitGroups(app, page, 480)
  await fA.locator('[data-oco-view="trajectory"]').click()
  await fA.locator("[data-oco-trajectory]").waitFor({ state: "visible", timeout: 10000 })
  await fA.locator(`${rowsSel} [data-kind="tool"]`).first().click()
  await fA.locator("[data-oco-trajectory-detail]").waitFor({ state: "visible", timeout: 5000 })
  const narrow = await fA.evaluate(() => {
    const root = document.querySelector("[data-oco-trajectory]").getBoundingClientRect()
    const detail = document.querySelector("[data-oco-trajectory-detail]").getBoundingClientRect()
    return { root: Math.round(root.width), detail: Math.round(detail.width), overflow: document.documentElement.scrollWidth - innerWidth }
  })
  await runShot(page, run, "9-narrow-detail")
  await fA.locator('[data-oco-trajectory-detail] button[aria-label="关闭详情"]').click()
  const closed = (await count(fA, "[data-oco-trajectory-detail]")) === 0
  run.record("narrow-detail", narrow.detail >= narrow.root - 2 && narrow.overflow <= 1 && closed ? "PASS" : "FAIL", { widths, ...narrow, closed })
} catch (e) {
  run.record("run", "FAIL", { error: String(e?.message ?? e).slice(0, 500) })
  await runShot(page, run, "error")
} finally {
  await app.close().catch(() => {})
  process.exit(run.finish())
}
