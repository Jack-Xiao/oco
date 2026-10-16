// E2E c33-composer-chip (card 13, M13): the editor selection reaches the composer as an attachment pill, not as text.
// Real VS Code + the isolated test server (mock model); the editor opens beside the main session panel.
//   manual-chip   "oco: Add Selection to Session Draft" puts a pill "math.ts:2-3" into the composer, no code text, nothing sent
//   send-chip     sending carries a file part (filename = pill, data: url) whose text is the selection
//   auto-chip     oco.draft.attachSelection (default true): selecting adds / updates one pill, clearing the selection removes it
//   auto-off      with the setting false no pill appears by itself, the command still works
//   auto-dedupe   (optional) removing the auto pill with its x keeps it removed for the same selection
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { createRun } from "./lib/results.mjs"
import { root, launch, command, waitUntil, chatFrames, sleep, runShot, createAndOpenSession } from "./vscode.mjs"
import { api, MODEL, waitIdle } from "./server.mjs"

const REQUIRED = ["manual-chip", "send-chip", "auto-chip", "auto-off"]
const run = createRun({ suite: "c33-composer-chip", required: REQUIRED, scriptPath: fileURLToPath(import.meta.url) })
const errMsg = (e) => String(e?.message ?? e).slice(0, 400)
const flat = (s, n = 300) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n)
const occurrences = (text, needle) => text.split(needle).length - 1
const workspace = path.join(fs.realpathSync(path.join(root, ".oco-test")), "workspace")
const CODE = "return a + b"
let app, page, sid

const health = await api("GET", "/global/health").catch(() => null)
run.setEnv({ serverVersion: health?.version ?? null, modelMode: MODEL.mode })

async function sessionFrame(timeout = 30000) {
  const end = Date.now() + timeout
  while (Date.now() < end) {
    for (const f of await chatFrames(page)) {
      const ok = await f.evaluate((id) => window.__OCO_DEBUG__?.sessionId?.() === id && !!document.querySelector('[data-component="prompt-input"]'), sid).catch(() => false)
      if (ok) return f
    }
    await sleep(150)
  }
  return null
}
/** body text, composer text (first 300) and the contenteditable text of the session frame. */
async function snap() {
  const f = await sessionFrame(3000)
  if (!f) return { body: "", composer: "", editable: "", attach: "" }
  return f
    .evaluate(() => {
      const p = document.querySelector('[data-component="prompt-input-v2"]')
      const e = document.querySelector('[data-component="prompt-input"]')
      const a = document.querySelector('[data-component="prompt-input-v2-attachments"]')
      return { body: document.body.innerText, composer: p?.innerText ?? "", editable: e?.innerText ?? "", attach: a?.innerText ?? "" }
    })
    .then((s) => ({ body: s.body.replace(/\u00a0/g, " "), composer: flat(s.composer, 300), editable: s.editable, attach: s.attach }))
    .catch(() => ({ body: "", composer: "", editable: "", attach: "" }))
}
/** Diagnostic: where the pill / the input live in the frame's DOM. */
async function dom() {
  const f = await sessionFrame(3000)
  return f
    ?.evaluate(() => {
      const hit = [...document.querySelectorAll("*")].filter((e) => e.children.length === 0 && /math\.ts:/.test(e.textContent ?? "")).slice(0, 3)
      const chain = (e) => { const o = []; for (let n = e; n && o.length < 7; n = n.parentElement) o.push(n.tagName.toLowerCase() + (n.dataset?.component ? `[${n.dataset.component}]` : "")); return o.join("<") }
      return { pillPath: hit.map(chain), editables: [...document.querySelectorAll("[contenteditable]")].map((e) => chain(e) + "=" + e.getAttribute("contenteditable")), components: [...new Set([...document.querySelectorAll("[data-component]")].map((e) => e.dataset.component))].slice(0, 30) }
    })
    .catch((e) => ({ error: errMsg(e) }))
}
const userMessages = async () => ((await api("GET", `/session/${sid}/message`, undefined, workspace)) ?? []).filter((m) => m.info.role === "user")
/** Wait until `pred(snap)` holds; returns { ok, ms, s }. */
async function until(pred, ms) {
  const t0 = Date.now()
  let s
  const ok = await waitUntil(async () => ((s = await snap()), pred(s)), ms, 300)
  return { ok: !!ok, ms: Date.now() - t0, s }
}
async function check(id, ok, detail) {
  if (!ok) await runShot(page, run, `${id}-fail`)
  run.record(id, ok ? "PASS" : "FAIL", detail)
}
async function step(id, fn) {
  try {
    await fn()
  } catch (e) {
    run.record(id, "FAIL", { error: errMsg(e) })
    await runShot(page, run, `${id}-error`)
  }
}
async function prepare() {
  sid = await createAndOpenSession(page)
  const f = await sessionFrame(30000)
  if (!f) throw new Error("no session frame")
  await waitUntil(async () => (await f.evaluate(() => document.documentElement.dataset.ocoModel).catch(() => null)) === "ready", 60000, 300)
}
/** math.ts in the editor group beside the chat panel. */
async function openSide() {
  await page.keyboard.press("Meta+P")
  await page.locator(".quick-input-widget input").waitFor({ state: "visible", timeout: 5000 })
  await page.keyboard.type("math.ts")
  await sleep(700)
  await page.keyboard.press("Meta+Enter")
  const view = page.locator(".editor-instance .monaco-editor .view-lines", { hasText: "export function add" }).first()
  await view.waitFor({ state: "visible", timeout: 15000 })
  await view.click({ position: { x: 600, y: 5 } }).catch(() => {})
}
/** Click into the side editor (never Go to File: it opens in the chat panel group and hides the panel); returns the chat frame visibility. */
const focusEditor = async () => {
  await page.locator(".editor-instance .monaco-editor .view-lines", { hasText: "export function add" }).first().click({ position: { x: 150, y: 5 } }).catch(() => {})
  await sleep(300)
  const f = await sessionFrame(3000).catch(() => null)
  return f ? await f.evaluate(() => document.visibilityState).catch(() => "unknown") : "no-frame"
}
async function gotoLine2() {
  await page.keyboard.press("Control+G")
  await page.locator(".quick-input-widget input").waitFor({ state: "visible", timeout: 5000 })
  await page.keyboard.type("2")
  await page.keyboard.press("Enter")
  await sleep(300)
}
const selectLine2 = async () => {
  await gotoLine2()
  await page.keyboard.press("Shift+End")
}
const selectLines23 = async () => {
  await selectLine2()
  await page.keyboard.press("Shift+ArrowDown")
  await sleep(200)
}
const clean = (s) => !s.editable.includes(CODE)

try {
  ;({ app, page } = await launch({ profile: "c33-chip", run }))
  run.installCrashHandlers(() => app.close())
  await prepare()
  await openSide()

  await step("manual-chip", async () => {
    await selectLines23()
    await command(page, "oco: Add Selection to Session Draft", { input: sid })
    const r = await until((s) => s.body.includes("math.ts:2-3"), 20000)
    const users = (await userMessages()).length
    await check("manual-chip", r.ok && clean(r.s) && users === 0, { pill: r.ok ? "math.ts:2-3" : null, composer: r.s.composer, editableHasCode: !clean(r.s), dom: await dom(), userMessages: users, ms: r.ms })
  })

  await step("send-chip", async () => {
    const f = await sessionFrame(5000)
    await f.locator('[data-component="prompt-input"]').first().click()
    await page.keyboard.type("Reply only with OK.")
    await page.keyboard.press("Enter")
    await waitIdle(sid)
    const last = (await userMessages()).at(-1)
    const parts = last?.parts ?? []
    const files = parts.filter((p) => p.type === "file")
    const file = files.find((p) => String(p.filename ?? "").includes("math.ts:2"))
    const anyFile = files.find((p) => String(p.url ?? "").startsWith("data:")) ?? files[0]
    const decoded = files.map((p) => (String(p.url ?? "").startsWith("data:") ? Buffer.from(String(p.url).split(",")[1] ?? "", "base64").toString() : "")).find((t) => t.includes(CODE)) ?? ""
    const textHit = parts.some((p) => p.type === "text" && String(p.text ?? "").includes(CODE))
    const after = await snap()
    await check("send-chip", !!file && (decoded.includes(CODE) || textHit), {
      filePartCount: files.length,
      parts: parts.map((p) => [p.type, p.filename ?? "", p.mime ?? ""]),
      decoded: flat(decoded, 120),
      delivered: decoded.includes(CODE) || textHit,
      fileUrlPrefixes: files.map((p) => String(p.url ?? "").slice(0, 30)),
      filenameHasRange: !!file,
      textPartHasCode: textHit,
      composerStillHasPill: after.attach.includes("math.ts:2"),
    })
  })

  await step("auto-chip", async () => {
    const vis = await focusEditor()
    const editorDiag = await page.evaluate(() => ({ views: [...document.querySelectorAll(".editor-instance .monaco-editor .view-lines")].map((e) => { const r = e.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height), (e.textContent ?? "").slice(0, 20)] }), tabs: [...document.querySelectorAll(".tabs-container .tab")].map((t) => (t.getAttribute("aria-label") ?? "").slice(0, 40) + (t.classList.contains("active") ? "*" : "")), status: (document.querySelector(".statusbar")?.textContent ?? "").slice(0, 120) })).catch(() => null)
    if (vis !== "visible") return check("auto-chip", false, { reason: "chat frame not visible after clicking side editor", visibility: vis })
    await page.keyboard.press("ArrowRight")
    await selectLine2()
    const a = await until((s) => s.attach.includes("math.ts:2"), 10000)
    const statusLine = a.ok ? "" : flat(await page.locator(".statusbar").innerText().catch(() => ""), 200)
    const aDom = a.ok ? null : await dom()
    await page.keyboard.press("Shift+ArrowDown")
    const b = await until((s) => s.attach.includes("math.ts:2-3"), 10000)
    const count = occurrences(b.s.attach, "math.ts:")
    await page.keyboard.press("ArrowRight")
    const c = await until((s) => !s.attach.includes("math.ts:"), 10000)
    await check("auto-chip", a.ok && b.ok && count === 1 && c.ok, { step1: { editorDiag, ok: a.ok, ms: a.ms, composer: a.s.composer, statusLine, dom: aDom }, step2: { ok: b.ok, ms: b.ms, composer: b.s.composer, occurrences: count, bodyOccurrences: occurrences(b.s.body, "math.ts:"), attach: flat(b.s.attach, 100) }, step3: { ok: c.ok, ms: c.ms, composer: c.s.composer } })
  })

  await step("auto-dedupe", async () => {
    await focusEditor()
    await selectLine2()
    const a = await until((s) => s.attach.includes("math.ts:2"), 10000)
    const f = await sessionFrame(3000)
    const btns = await f.evaluate(() => [...document.querySelectorAll('[data-component="prompt-input-v2-attachments"] button[aria-label]')].map((b) => b.getAttribute("aria-label")))
    if (!a.ok || !btns.length) return run.record("auto-dedupe", "NOT RUN", { reason: a.ok ? "no remove button" : "no auto pill", ariaLabels: btns })
    const clicked = await f.evaluate(() => {
      const bs = [...document.querySelectorAll('[data-component="prompt-input-v2-attachments"] button[aria-label]')]
      const b = bs.find((x) => x.parentElement?.innerText?.includes("math.ts:")) ?? bs[0] ?? null
      b?.click()
      return !!b
    })
    const gone = await until((s) => !s.attach.includes("math.ts:"), 5000)
    await sleep(4000)
    const back = (await snap()).attach.includes("math.ts:")
    run.record("auto-dedupe", clicked && gone.ok && !back ? "PASS" : "FAIL", { ariaLabels: btns, clicked, removed: gone.ok, cameBack: back })
  })

  // ---- second launch: the setting off ----
  await app.close().catch(() => {})
  ;({ app, page } = await launch({ profile: "c33-off", run, settings: { "oco.draft.attachSelection": false } }))
  await step("auto-off", async () => {
    await prepare()
    await openSide()
    await selectLine2()
    await sleep(8000)
    const idle = await snap()
    await command(page, "oco: Add Selection to Session Draft", { input: sid })
    const r = await until((s) => s.body.includes("math.ts:2"), 20000)
    await check("auto-off", !idle.body.includes("math.ts:2") && r.ok, { autoPillAfter8s: idle.body.includes("math.ts:2"), idleComposer: idle.composer, manualPill: r.ok, manualComposer: r.s.composer })
  })
} catch (e) {
  run.record("run", "FAIL", { error: errMsg(e) })
  if (page) await runShot(page, run, "error")
} finally {
  await app?.close().catch(() => {})
  process.exit(run.finish())
}
