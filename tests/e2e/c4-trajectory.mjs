// Patches 0012/0013: 对话 / 轨迹 trajectory view. Real VS Code + test server; session A has a bash tool turn and a
// long (reasoning + text) turn. Copy follows VS Code's display language. OCO_E2E_LOCALE=zh-cn runs it in Chinese
// (through OCO_DEV_LOCALE: without the language pack, VS Code's --locale leaves vscode.env.language at "en").
//   toggle-open        the header toggle swaps the chat timeline for the trajectory; the composer stays
//   locale-copy        the copy matches the panel's locale (English by default, Chinese for zh-*)
//   compact-groups     by default thinking and tool steps fold into summary rows; a click expands one in place
//   rows-match-server  ("All rows") user / tool / reasoning rows, model bars and the request total match the server
//   tool-detail        clicking the tool row shows its input and the command output
//   request-timing     the detail shows tokens and derived timings (first token latency is a number)
//   raw-content        "原始内容" shows the stored part JSON
//   live-update        a turn sent from the trajectory view appears and completes without reopening it
//   back-to-chat       the toggle returns to the chat timeline
//   switch-resets      switching sessions in the main panel returns to 对话
//   tools-tab          the system row's 工具 tab lists the server's tools for the session model; a tool expands
//   narrow-detail      in a ~480 px panel the detail covers the list, nothing scrolls sideways, ✕ closes it
//   subagent-link      the chat view's subagent card is not an <a href>; a click opens the child session in the panel,
//                      its parent title returns to A, and nothing is opened outside VS Code (patch 0016)
import { fileURLToPath } from "node:url"
import { createRun } from "./lib/results.mjs"
import { launch, command, waitUntil, chatFrames, frameSession, sleep, runShot, fitGroups } from "./vscode.mjs"
import { api, messages, waitReply, MODEL } from "./server.mjs"

const REQUIRED = [
  "toggle-open",
  "locale-copy",
  "compact-groups",
  "rows-match-server",
  "scale-toggle",
  "tool-detail",
  "request-timing",
  "raw-content",
  "tools-tab",
  "live-update",
  "back-to-chat",
  "switch-resets",
  "narrow-detail",
  "subagent-row",
  "subagent-link",
]
const run = createRun({ suite: "c4-trajectory", required: REQUIRED, scriptPath: fileURLToPath(import.meta.url) })
const health = await api("GET", "/global/health").catch(() => null)
const LOCALE = process.env.OCO_E2E_LOCALE ?? ""
run.setEnv({ serverVersion: health?.version ?? null, modelMode: MODEL.mode, locale: LOCALE || "default" })
const { app, page } = await launch({ profile: "c4-trajectory", run, env: LOCALE ? { OCO_DEV_LOCALE: LOCALE } : {} })
// The copy this suite reads, per language (source: vendor/opencode/packages/app/src/components/session/session-trajectory-i18n.ts).
const COPY = {
  en: {
    trajectory: "Trajectory",
    requests: "Requests",
    tools: "Tools",
    toolInput: "Input · bash",
    toolTiming: "Tool timing",
    ttft: "Time to first token",
    generation: "Generation",
    total: "Total",
    cacheRead: "Cache read",
    source: "Source",
    duration: /^\d+(\.\d+)? (ms|s)$/,
    durationAny: /ms|s/,
    request: /^Request #\d+$/,
    completed: "Completed",
    subagent: "Subagent",
    childSession: "Child session",
  },
  zh: {
    trajectory: "轨迹",
    requests: "请求",
    tools: "工具",
    toolInput: "输入 · bash",
    toolTiming: "工具计时",
    ttft: "首 token 延迟",
    generation: "生成",
    total: "合计",
    cacheRead: "缓存读取",
    source: "来源",
    duration: /^\d+(\.\d+)? (毫秒|秒)$/,
    durationAny: /毫秒|秒/,
    request: /^请求 #\d+$/,
    completed: "已完成",
    subagent: "子智能体",
    childSession: "子会话",
  },
}
const L = /^zh(-cn|-sg|-hans)?$/i.test(LOCALE) ? COPY.zh : COPY.en
run.installCrashHandlers(() => app.close())
const rand = Math.random().toString(36).slice(2, 7)
const MARK = `traj-${rand}`
/** Session under test (set once the first panel opens). */
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
  // Until the server stores the new user message, waitReply would accept the previous turn's reply.
  await waitUntil(async () => (await users()) > before, 30000, 100)
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

  const copy = {
    lang: await fA.evaluate(() => document.documentElement.lang),
    toggle: (await fA.locator('[data-oco-trajectory] [data-oco-view="trajectory"]').innerText()).trim(),
    hasHan: /[\u4e00-\u9fff]/.test(await fA.locator("[data-oco-trajectory-totals]").innerText()),
  }
  run.record("locale-copy", copy.toggle === L.trajectory && copy.hasHan === (L === COPY.zh) ? "PASS" : "FAIL", copy)

  // Compact rows (default): thinking and tool steps fold into summary rows that expand in place.
  const compact = {
    groups: await count(fA, `${rowsSel} [data-oco-group]`),
    toolRows: await count(fA, `${rowsSel} [data-kind="tool"]`),
  }
  const toolGroup = fA.locator(`${rowsSel} [data-oco-group]`, { hasText: "bash" }).first()
  compact.summary = (await toolGroup.innerText().catch(() => "")).replace(/\s+/g, " ")
  await toolGroup.click()
  compact.expanded = await toolGroup.getAttribute("aria-expanded")
  compact.nestedTool = await count(fA, `${rowsSel} [data-kind="tool"][data-nested]`)
  await runShot(page, run, "2-compact-groups")
  run.record(
    "compact-groups",
    compact.groups >= 1 && compact.toolRows === 0 && compact.expanded === "true" && compact.nestedTool === 1 ? "PASS" : "FAIL",
    compact,
  )
  await fA.locator('[data-oco-rows-mode="full"]').click()

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
    bars: await count(fA, "[data-oco-trajectory-lanes] [data-oco-request]"),
    totals: (await fA.locator("[data-oco-trajectory-totals]").innerText()).replace(/\s+/g, " "),
    userIds: await fA.locator(`${rowsSel} [data-kind="user"]`).evaluateAll((els) => els.map((e) => e.getAttribute("data-row"))),
  }
  server.userIds = msgs.filter((m) => m.info.role === "user").map((m) => m.info.id)
  run.record(
    "rows-match-server",
    ui.user === server.user && ui.tool === server.tool && server.tool === 1 && ui.reasoning === server.reasoning && server.reasoning > 0 &&
      ui.bars === server.assistant && ui.totals.includes(`${L.requests} ${server.assistant}`) && ui.totals.includes(`${L.tools} 1`)
      ? "PASS"
      : "FAIL",
    { server, ui },
  )

  // Axis buttons: the pressed state must follow the click, and "request" gives every bar the same width.
  const scales = {}
  for (const value of ["turn", "request", "duration"]) {
    await fA.locator(`[data-oco-scale="${value}"]`).click()
    await fA.waitForTimeout(150)
    scales[value] = {
      pressed: await fA.locator("[data-oco-scale]").evaluateAll((els) =>
        els.filter((e) => e.getAttribute("aria-pressed") === "true").map((e) => e.getAttribute("data-oco-scale")),
      ),
      lefts: await fA
        .locator("[data-oco-trajectory-lanes] [data-oco-request]")
        .evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().left))),
    }
  }
  const gaps = scales.request.lefts.slice(1).map((l, i) => l - scales.request.lefts[i])
  run.record(
    "scale-toggle",
    Object.entries(scales).every(([k, v]) => v.pressed.length === 1 && v.pressed[0] === k) &&
      gaps.length >= 2 && Math.max(...gaps) - Math.min(...gaps) <= 2 &&
      scales.request.lefts.join() !== scales.duration.lefts.join()
      ? "PASS"
      : "FAIL",
    { scales, gaps },
  )

  // 3. Tool row detail.
  await fA.locator(`${rowsSel} [data-kind="tool"]`).first().click()
  await fA.locator("[data-oco-trajectory-detail]").waitFor({ state: "visible", timeout: 5000 })
  const toolDetail = await detailText(fA)
  await runShot(page, run, "3-tool-detail")
  run.record("tool-detail", toolDetail.includes(L.toolInput) && toolDetail.includes(MARK) && toolDetail.includes(L.toolTiming) ? "PASS" : "FAIL", {
    detail: toolDetail.slice(0, 400),
  })

  // 4. Request overview: tokens and timings of the request that produced the reasoning.
  await fA.locator(`${rowsSel} [data-kind="reasoning"]`).first().click()
  const timing = {
    ttft: await field(fA, L.ttft),
    generation: await field(fA, L.generation),
    total: await field(fA, L.total),
    cacheRead: await field(fA, L.cacheRead),
    source: await field(fA, L.source),
  }
  await runShot(page, run, "4-request-timing")
  run.record(
    "request-timing",
    L.duration.test(timing.ttft ?? "") && L.durationAny.test(timing.generation ?? "") && /tok$/.test(timing.total ?? "") && timing.cacheRead !== null && L.request.test(timing.source ?? "")
      ? "PASS"
      : "FAIL",
    timing,
  )

  // 5. Raw content of the tool part.
  await fA.locator(`${rowsSel} [data-kind="tool"]`).first().click()
  await fA.locator('[data-oco-trajectory-detail] [data-oco-tab="raw"]').click()
  const raw = await detailText(fA)
  run.record("raw-content", raw.includes('"callID"') && raw.includes('"type": "tool"') && raw.includes(MARK) ? "PASS" : "FAIL", { raw: raw.slice(0, 300) })
  await fA.locator('[data-oco-trajectory-detail] [data-oco-tab="overview"]').click()

  // Tools tab of the system row, against the server's tool list for the session's model.
  await fA.locator(`${rowsSel} [data-kind="system"]`).click()
  await fA.locator('[data-oco-trajectory-detail] [data-oco-tab="tools"]').click()
  const firstUser = msgs.find((m) => m.info.role === "user")?.info
  const listed = await api(
    "GET",
    `/experimental/tool?provider=${encodeURIComponent(firstUser?.model?.providerID ?? "")}&model=${encodeURIComponent(firstUser?.model?.modelID ?? "")}`,
  ).catch(() => null)
  const tools = { server: Array.isArray(listed) ? listed.length : listed }
  await waitUntil(async () => (await count(fA, "[data-oco-tool]")) > 0, 15000, 100).catch(() => undefined)
  tools.ui = await count(fA, "[data-oco-tool]")
  const bash = fA.locator('[data-oco-tool="bash"] button')
  await bash.click().catch(() => undefined)
  tools.expanded = await bash.getAttribute("aria-expanded").catch(() => null)
  tools.schema = (await fA.locator('[data-oco-tool="bash"] pre').innerText().catch(() => "")).slice(0, 200)
  await runShot(page, run, "5-tools-tab")
  run.record(
    "tools-tab",
    tools.ui > 0 && tools.ui === tools.server && tools.expanded === "true" && tools.schema.includes('"command"') ? "PASS" : "FAIL",
    tools,
  )

  // 6. Live: send from the trajectory view; the new request shows up while it streams and completes in place.
  const before = server.assistant
  await send(fA, "Write 40 numbered sentences about rivers. No tools.")
  const seenRunning = await waitUntil(async () => (await count(fA, "[data-oco-trajectory-lanes] [data-oco-request]")) > before, 20000, 100).then(
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
  run.record("live-update", seenRunning && stillOpenWhileRunning && lastText.includes("40. Mock line 40.") && lastText.includes(L.completed) ? "PASS" : "FAIL", {
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
  await fA.locator('[data-oco-rows-mode="full"]').click()
  await fA.locator(`${rowsSel} [data-kind="tool"]`).first().click()
  await fA.locator("[data-oco-trajectory-detail]").waitFor({ state: "visible", timeout: 5000 })
  const narrow = await fA.evaluate(() => {
    const root = document.querySelector("[data-oco-trajectory]").getBoundingClientRect()
    const detail = document.querySelector("[data-oco-trajectory-detail]").getBoundingClientRect()
    return { root: Math.round(root.width), detail: Math.round(detail.width), overflow: document.documentElement.scrollWidth - innerWidth }
  })
  await runShot(page, run, "9-narrow-detail")
  await fA.locator("[data-oco-trajectory-detail] [data-oco-detail-close]").click()
  const closed = (await count(fA, "[data-oco-trajectory-detail]")) === 0
  run.record("narrow-detail", narrow.detail >= narrow.root - 2 && narrow.overflow <= 1 && closed ? "PASS" : "FAIL", { widths, ...narrow, closed })

  // 10. Subagent: OpenCode runs it through the `task` tool; the row names the agent and the detail the child session.
  await send(fA, "Use the task tool with the explore agent: Find the fork code")
  await waitReply(A)
  const taskPart = ((await messages(A)) ?? []).flatMap((m) => m.parts).find((p) => p.type === "tool" && p.tool === "task")
  const child = taskPart?.state?.metadata?.sessionId ?? null
  await fA.locator('[data-oco-rows-mode="compact"]').click()
  const subRow = fA.locator(`${rowsSel} [data-kind="tool"]`, { hasText: "@explore" })
  await subRow.first().waitFor({ state: "visible", timeout: 10000 }).catch(() => {})
  const sub = {
    child,
    status: taskPart?.state?.status ?? null,
    rows: await subRow.count(),
    nested: (await subRow.first().getAttribute("data-nested").catch(() => null)) !== null,
    text: (await subRow.first().innerText().catch(() => "")).replace(/\s+/g, " "),
  }
  await subRow.first().click().catch(() => {})
  await fA.locator("[data-oco-trajectory-detail]").waitFor({ state: "visible", timeout: 5000 }).catch(() => {})
  sub.childField = await field(fA, L.childSession)
  await runShot(page, run, "10-subagent-row")
  run.record(
    "subagent-row",
    !!child && sub.rows === 1 && !sub.nested && sub.text.includes(L.subagent) && sub.text.includes("Find the fork code") &&
      sub.text.includes("subagent-ok") && !sub.text.includes("<task") && sub.childField === child
      ? "PASS"
      : "FAIL",
    sub,
  )

  // 11. The subagent card in the chat view opens the child session in this panel. It used to be an <a href> to an app
  // route; the webview's <base> made that an https URL and VS Code opened it in the system browser as well.
  await fA.locator('[data-oco-trajectory] [data-oco-view="chat"]').click()
  const card = fA.locator('[data-component="task-tool-card"]').first()
  await card.waitFor({ state: "visible", timeout: 10000 })
  const link = {
    child,
    href: await card.evaluate((el) => el.closest("a")?.getAttribute("href") ?? null),
    role: await card.evaluate((el) => el.closest("a")?.getAttribute("role") ?? null),
  }
  await app.evaluate(({ shell }) => {
    globalThis.__ocoOpened = []
    shell.openExternal = async (url) => void globalThis.__ocoOpened.push(String(url))
  })
  await card.click()
  link.switched = await waitUntil(async () => {
    for (const f of await chatFrames(page)) if ((await frameSession(f).catch(() => null)) === child) return true
    return false
  }, 15000, 100).then(() => true, () => false)
  await sleep(500)
  await runShot(page, run, "11-subagent-link")
  // The child's title links back to the parent (a button upstream); the panel returns to A.
  for (const f of await chatFrames(page))
    if ((await frameSession(f).catch(() => null)) === child) await f.locator('[data-slot="session-title-parent"]').click().catch(() => {})
  link.back = !!(await frameFor(A, 15000))
  link.opened = await app.evaluate(() => globalThis.__ocoOpened)
  run.record(
    "subagent-link",
    !!child && link.href === null && link.role === "button" && link.switched && link.back && link.opened.length === 0 ? "PASS" : "FAIL",
    link,
  )
} catch (e) {
  run.record("run", "FAIL", { error: String(e?.message ?? e).slice(0, 500) })
  await runShot(page, run, "error")
} finally {
  await app.close().catch(() => {})
  process.exit(run.finish())
}
