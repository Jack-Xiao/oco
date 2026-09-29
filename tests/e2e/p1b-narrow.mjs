// P1b-1 narrow layout: permission (deny / allow once) and question docks answered with real pointer
// clicks (Playwright locator.click(): mouse events at the element's centre after actionability and
// hit-target checks; no force, no dispatchEvent, no element.click()) while three editor groups are
// visible side by side, each ~W CSS px wide. Widths above what fits the screen use a lower VS Code
// zoom level (CSS px are what the page lays out in).
// OCO_NARROW_WIDTHS=260,320 overrides the width list.
import { fileURLToPath } from "node:url"
import { createRun } from "./lib/results.mjs"
import { launch, command, chatFrames, frameSession, sleep, runShot, clearNotifications, fitGroups } from "./vscode.mjs"
import { api, messages, status, waitIdle, waitReply } from "./server.mjs"

const WIDTHS = (process.env.OCO_NARROW_WIDTHS ?? "260,320,480,800").split(",").map(Number)
const ZOOM = { 260: 0, 320: 0, 480: -1, 800: -4 }
const REQUIRED = WIDTHS.flatMap((w) => [`deny-${w}`, `allow-${w}`, `question-${w}`])
const run = createRun({ suite: "p1b-narrow", required: REQUIRED, scriptPath: fileURLToPath(import.meta.url) })
const health = await api("GET", "/global/health").catch(() => null)
run.setEnv({ serverVersion: health?.version ?? null, widths: WIDTHS, clickMethod: "Playwright locator.click() (pointer, no force)" })

let app
run.installCrashHandlers(() => app?.close())

async function frameFor(page, sid) {
  for (const f of await chatFrames(page)) if ((await frameSession(f).catch(() => null)) === sid) return f
  throw new Error("no frame for " + sid)
}

async function newSession(page, known) {
  await command(page, "oco: New Session")
  const t0 = Date.now()
  while (Date.now() - t0 < 60000) {
    for (const f of await chatFrames(page)) {
      const s = await frameSession(f).catch(() => null)
      if (s && !known.includes(s) && (await f.$('[data-component="prompt-input"]').catch(() => null))) return s
    }
    await sleep(200)
  }
  throw new Error("new session panel did not appear")
}

async function send(page, frame, text) {
  const input = frame.locator('[data-component="prompt-input"]')
  for (let attempt = 0; attempt < 3; attempt++) {
    await input.click()
    await input.focus()
    await page.keyboard.type(text, { delay: 3 })
    await sleep(200)
    if ((await input.innerText()).includes(text.slice(0, 20))) break
    await page.keyboard.press("Meta+a")
    await page.keyboard.press("Backspace")
  }
  await page.keyboard.press("Enter")
}

/** Geometry of a button relative to its frame's viewport, and what is hit at its centre. */
async function geometry(button) {
  return button.evaluate((b) => {
    const r = b.getBoundingClientRect()
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
    return {
      left: Math.round(r.left),
      right: Math.round(r.right),
      top: Math.round(r.top),
      bottom: Math.round(r.bottom),
      viewport: [innerWidth, innerHeight],
      inside: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight,
      hitSelf: !!hit && (hit === b || b.contains(hit)),
    }
  })
}

async function waitPending(kind, sid, ms = 90000) {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    const x = ((await api("GET", `/${kind}`)) ?? []).find((p) => p.sessionID === sid)
    if (x) return x
    if (Date.now() - t0 > 8000 && (await status(sid)) === "idle") return null
    await sleep(300)
  }
  return null
}

async function permissionFlow(page, w, sid, decision) {
  const name = `${decision === "reject" ? "deny" : "allow"}-${w}`
  const frame = await frameFor(page, sid)
  const marker = `narrow-${decision}-${w}`
  let req = null
  let attempts = 0
  for (; attempts < 2 && !req; attempts++) {
    await send(page, frame, `Use the bash tool to run exactly: echo ${marker} . Then reply with the output.`)
    req = await waitPending("permission", sid)
    if (!req) await waitIdle(sid)
  }
  if (!req) return run.record(name, "NOT RUN", { reason: "model did not request the bash permission", attempts })
  const dock = frame.locator('[data-component="dock-prompt"][data-kind="permission"]')
  await dock.waitFor({ timeout: 30000 })
  await clearNotifications(page)
  await sleep(500)
  const button = dock.getByRole("button", { name: decision === "reject" ? /^deny$|拒绝/i : /allow once|允许一次/i })
  const geo = await geometry(button)
  await runShot(page, run, `${name}-before`)
  let clickError = null
  await button.click({ timeout: 10000 }).catch((e) => (clickError = String(e.message).split("\n")[0]))
  await waitReply(sid, 90000)
  await waitIdle(sid)
  const pending = ((await api("GET", "/permission")) ?? []).some((p) => p.id === req.id)
  const tool = (await messages(sid)).flatMap((m) => m.parts).find((p) => p.type === "tool" && p.callID === req.tool?.callID)
  const outcomeOk = decision === "reject" ? tool?.state?.status === "error" : tool?.state?.status === "completed" && String(tool.state.output).includes(marker)
  run.record(name, !clickError && geo.inside && geo.hitSelf && !pending && outcomeOk ? "PASS" : "FAIL", {
    sessionId: sid,
    requestId: req.id,
    geometry: geo,
    clickError,
    requestResolved: !pending,
    toolStatus: tool?.state?.status ?? null,
    attempts,
  })
}

async function questionFlow(page, w, sid) {
  const name = `question-${w}`
  const frame = await frameFor(page, sid)
  let q = null
  let attempts = 0
  for (; attempts < 2 && !q; attempts++) {
    await send(page, frame, "Use the question tool (not plain text) to ask which color I prefer, with exactly two options: red and blue. After my answer reply with the color only.")
    q = await waitPending("question", sid)
    if (!q) await waitIdle(sid)
  }
  if (!q) {
    for (const x of ((await api("GET", "/question")) ?? []).filter((x) => x.sessionID === sid)) await api("POST", `/question/${x.id}/reject`)
    return run.record(name, "NOT RUN", { reason: "model did not call the question tool", attempts })
  }
  const dock = frame.locator('[data-component="dock-prompt"][data-kind="question"]')
  await dock.waitFor({ timeout: 30000 })
  await clearNotifications(page)
  await sleep(500)
  const option = dock.locator('[data-slot="question-option"]').filter({ has: frame.locator('[data-slot="option-label"]', { hasText: /^blue$/i }) }).first()
  await option.waitFor({ timeout: 10000 }).catch(async () => console.log("question dock:", (await dock.innerHTML()).slice(0, 2000)))
  const optionGeo = await geometry(option)
  let clickError = null
  await option.click({ timeout: 10000 }).catch((e) => (clickError = "option: " + String(e.message).split("\n")[0]))
  const submit = dock.getByRole("button", { name: /submit|提交/i }).first()
  const submitGeo = await geometry(submit)
  await runShot(page, run, `${name}-before`)
  if (!clickError) await submit.click({ timeout: 10000 }).catch((e) => (clickError = "submit: " + String(e.message).split("\n")[0]))
  await waitReply(sid, 90000)
  await waitIdle(sid)
  const tool = (await messages(sid)).flatMap((m) => m.parts).find((p) => p.type === "tool" && p.callID === q.tool?.callID)
  const answer = tool?.state?.metadata?.answers?.[0]?.[0] ?? null
  run.record(name, !clickError && optionGeo.inside && submitGeo.inside && submitGeo.hitSelf && answer === "blue" ? "PASS" : "FAIL", {
    sessionId: sid,
    requestId: q.id,
    optionGeometry: optionGeo,
    submitGeometry: submitGeo,
    clickError,
    recordedAnswer: answer,
    attempts,
  })
}

try {
  for (const w of WIDTHS) {
    const zoom = ZOOM[w] ?? 0
    const launched = await launch({ profile: `p1b-narrow-${w}`, run, settings: { "window.zoomLevel": zoom } })
    app = launched.app
    const page = launched.page
    try {
      const ids = []
      for (let i = 0; i < 3; i++) {
        ids.push(await newSession(page, ids))
        await sleep(1500)
      }
      // Three sessions in one group -> one per group (group 1: A, group 2: B, group 3: C).
      await command(page, "View: Move Editor into Right Group")
      await sleep(1200)
      await command(page, "View: Move Editor into Right Group")
      await sleep(1200)
      await command(page, "View: Focus First Editor Group")
      await sleep(600)
      await command(page, "View: Move Editor into Right Group")
      await sleep(1200)
      // The side bar stays open: the palette helper focuses it before pressing Escape (Escape inside
      // a webview would dismiss an open question dock).
      const widths = await fitGroups(app, page, w)
      const groups = await page.$$eval(".editor-group-container", (e) => e.length)
      run.setEnv({ [`layout-${w}`]: { zoomLevel: zoom, frameWidths: widths, editorGroups: groups } })
      await runShot(page, run, `layout-${w}`)
      if (widths.length !== 3 || widths.some((x) => Math.abs(x - w) > 4)) throw new Error(`layout ${w}: frame widths ${widths}`)
      // Let each app finish its first sync (agent/model) before sending.
      for (const sid of ids) await (await frameFor(page, sid)).getByText("Big Pickle").first().waitFor({ timeout: 60000 })
      await permissionFlow(page, w, ids[0], "reject")
      await permissionFlow(page, w, ids[1], "once")
      await questionFlow(page, w, ids[2])
    } catch (e) {
      run.record(`layout-${w}`, "FAIL", { error: String(e?.message ?? e).slice(0, 400) })
    } finally {
      await app.close().catch(() => {})
      app = undefined
    }
  }
} finally {
  // Leave no pending requests behind (a failed click or a late tool call would keep one open).
  for (const p of (await api("GET", "/permission").catch(() => [])) ?? []) await api("POST", `/permission/${p.id}/reply`, { reply: "reject" }).catch(() => {})
  for (const q of (await api("GET", "/question").catch(() => [])) ?? []) await api("POST", `/question/${q.id}/reject`).catch(() => {})
  process.exit(run.finish())
}
