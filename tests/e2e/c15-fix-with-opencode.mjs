#!/usr/bin/env node
// E2E c15-fix-with-opencode: the "Fix with OpenCode" quick fix and "Add Terminal Output to Session Draft".
// Real VS Code (built-in JSON language features supply the diagnostic) + test server (mock LLM). The quick fix
// is reached the way a user does: cursor on the problem, Quick Fix menu (Cmd+.), pick the entry.
//   fix-action-offered     the Quick Fix menu for the problem lists "Fix with OpenCode"
//   fix-draft              picking it puts "Fix the following problem(s) in <path>:<line>." + the problem + a code window in the draft
//   fix-draft-once         exactly one insert (draftAcks +1, header once) and no user message was sent
//   terminal-no-record     "Add Terminal Output to Session Draft" without a finished shell-integration command only warns; the draft is untouched
//   terminal-shell-integ   with a real terminal command (shell integration) the draft gets "Terminal: `<cmd>`" + its output (NOT RUN when the shell never reports integration)
import fs from "node:fs"
import path from "node:path"
import { execFileSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { createRun } from "./lib/results.mjs"
import { launch, command, waitUntil, chatFrames, sleep, runShot, hostState, createAndOpenSession, root } from "./vscode.mjs"
import { api, MODEL } from "./server.mjs"

const REQUIRED = ["fix-action-offered", "fix-draft", "fix-draft-once", "terminal-no-record"]
const run = createRun({ suite: "c15-fix-with-opencode", required: REQUIRED, scriptPath: fileURLToPath(import.meta.url) })
const errMsg = (e) => String(e?.message ?? e).slice(0, 400)

const rand = Math.random().toString(36).slice(2, 7)
const wsDir = path.join(fs.realpathSync(path.join(root, ".oco-test")), "c15", `ws-${rand}`)
fs.mkdirSync(wsDir, { recursive: true })
const git = (...args) => execFileSync("git", ["-c", "user.email=test@oco.local", "-c", "user.name=oco-test", ...args], { cwd: wsDir, stdio: "pipe" })
git("init", "-q")
const FILE = `broken-${rand}.json`
// Line 3 is invalid JSON (value expected after the colon).
fs.writeFileSync(path.join(wsDir, FILE), `{\n  "a": 1,\n  "b": ,\n  "c": 3\n}\n`)
git("add", "-A")
git("commit", "-qm", "init")

const health = await api("GET", "/global/health").catch(() => null)
run.setEnv({ serverVersion: health?.version ?? null, modelMode: MODEL.mode, fixtureWorkspace: wsDir })

const { app, page, stateFile } = await launch({ profile: "c15-fix-with-opencode", run, workspace: wsDir })
run.installCrashHandlers(() => app.close())
const state = () => hostState(page, stateFile)
const userMessages = async (sid) => ((await api("GET", `/session/${sid}/message`, undefined, wsDir)) ?? []).filter((m) => m.info.role === "user").length
const acksOf = async (sid) => (await state()).panels.find((p) => p.sessionId === sid)?.panel.draftAcks ?? 0

async function sessionFrame(sid, timeout = 30000) {
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
const composerText = (f) => f.locator('[data-component="prompt-input"]').innerText().catch(() => "")
const toasts = () => page.locator(".notifications-toasts .notification-toast").allInnerTexts().catch(() => [])
/** Answer the "Add to which session draft?" pick (Enter on the first row) if it opens. */
async function answerPanelPick() {
  const shown = await waitUntil(async () => (await page.locator(".quick-input-widget input").getAttribute("placeholder").catch(() => "")) ?.includes("Add to which session draft"), 8000, 200)
  if (shown) { await page.keyboard.press("Enter"); await sleep(400) }
  return !!shown
}

let sid
try {
  sid = await createAndOpenSession(page, { title: `c15-fix-${rand}`, directory: wsDir })
  const f = await sessionFrame(sid)
  if (!f) throw new Error("session frame not found")
  const users0 = await userMessages(sid)
  const acks0 = await acksOf(sid)

  // ---- A. Fix with OpenCode ----
  await page.click(".part.sidebar .composite.title", { position: { x: 30, y: 10 }, timeout: 3000 }).catch(() => {})
  await page.keyboard.press("Meta+P")
  await page.locator(".quick-input-widget input").waitFor({ state: "visible", timeout: 5000 })
  await page.keyboard.type(FILE)
  await sleep(700)
  await page.keyboard.press("Meta+Enter")
  const view = page.locator(".editor-instance .monaco-editor .view-lines", { hasText: '"c": 3' }).first()
  await view.waitFor({ state: "visible", timeout: 15000 })
  await view.click({ position: { x: 600, y: 5 } }).catch(() => {})
  await page.keyboard.press("Control+G")
  await page.locator(".quick-input-widget input").waitFor({ state: "visible", timeout: 5000 })
  await page.keyboard.type("3:9")
  await page.keyboard.press("Enter")
  await sleep(300)

  // The JSON server reports the problem a moment after opening; retry the Quick Fix menu until it lists the entry.
  const widget = page.locator(".action-widget")
  let offered = false
  let menu = ""
  for (let i = 0; i < 12 && !offered; i++) {
    await page.keyboard.press("Meta+.")
    await widget.first().waitFor({ state: "visible", timeout: 2500 }).catch(() => {})
    menu = (await widget.allInnerTexts().catch(() => [])).join("\n")
    offered = /Fix with OpenCode/.test(menu)
    if (!offered) { await page.keyboard.press("Escape"); await sleep(1500) }
  }
  await runShot(page, run, "1-quick-fix-menu")
  run.record("fix-action-offered", offered ? "PASS" : "FAIL", { menu: menu.replace(/\s+/g, " ").slice(0, 200) })
  if (!offered) throw new Error("Fix with OpenCode not offered")

  await page.keyboard.press("Enter") // the only entry is preselected (the widget is not click-stable)
  const picked = await answerPanelPick()
  const header = `Fix the following problem(s) in ${FILE}:3.`
  const text = await waitUntil(async () => { const t = await composerText(f); return t.includes(header) ? t : null }, 20000, 300)
  await sleep(2500) // a duplicate delivery would have landed by now
  const final = await composerText(f)
  await runShot(page, run, "2-fix-draft")
  const problem = new RegExp(`${FILE.replace(/[.]/g, "\\.")}:3:\\d+ error`).test(final)
  const codeWindow = /\b3\|\s+"b": ,/.test(final) && /\b2\|\s+"a": 1,/.test(final)
  run.record("fix-draft", text && problem && codeWindow ? "PASS" : "FAIL", { pickedPanel: picked, header: !!text, problemLine: problem, codeWindow, sample: final.replace(/\s+/g, " ").slice(0, 260) })
  const acks1 = await acksOf(sid)
  const once = final.split(header).length - 1 === 1
  run.record("fix-draft-once", once && acks1 === acks0 + 1 && (await userMessages(sid)) === users0 ? "PASS" : "FAIL", { headerCount: final.split(header).length - 1, acks: acks1 - acks0, userMessages: (await userMessages(sid)) - users0 })

  // ---- B. Terminal output without a finished shell-integration command ----
  const lenBefore = (await composerText(f)).length
  const acksB = await acksOf(sid)
  await command(page, "oco: Add Terminal Output to Session Draft")
  const warned = await waitUntil(async () => (await toasts()).find((t) => /No finished command/i.test(t)), 8000, 250)
  await sleep(1500)
  const stillOpenPick = (await page.locator(".quick-input-widget input").getAttribute("placeholder").catch(() => "") ?? "").includes("which session")
  if (stillOpenPick) await page.keyboard.press("Escape")
  run.record("terminal-no-record", warned && !stillOpenPick && (await composerText(f)).length === lenBefore && (await acksOf(sid)) === acksB ? "PASS" : "FAIL", {
    warning: warned ? warned.replace(/\s+/g, " ").slice(0, 140) : null, pickOpened: stillOpenPick, draftUnchanged: (await composerText(f)).length === lenBefore,
  })

  // ---- C. Terminal output with shell integration (best effort) ----
  try {
    await page.keyboard.press("Escape")
    const cmd = `echo oco-term-${rand}`
    await command(page, "Terminal: Create New Terminal")
    await page.locator(".terminal-wrapper").first().waitFor({ state: "visible", timeout: 15000 })
    await sleep(4000) // shell start + integration handshake
    await page.keyboard.type(cmd)
    await page.keyboard.press("Enter")
    await sleep(2500)
    let got = null
    for (let i = 0; i < 4 && !got; i++) {
      await command(page, "oco: Add Terminal Output to Session Draft")
      const w = await waitUntil(async () => (await toasts()).find((t) => /No finished command/i.test(t)) ?? ((await page.locator(".quick-input-widget input").getAttribute("placeholder").catch(() => "")) ?? "").includes("which session") ? "x" : null, 5000, 250)
      if (w === "x" || (typeof w === "string" && !/No finished/.test(w))) {
        await answerPanelPick()
        got = await waitUntil(async () => { const t = await composerText(f); return t.includes(`Terminal: \`${cmd}\``) ? t : null }, 10000, 300)
      } else await sleep(3000)
    }
    await runShot(page, run, "3-terminal")
    if (got) run.record("terminal-shell-integ", /oco-term-\w+\n?[\s\S]*```/.test(got) && got.split(`oco-term-${rand}`).length > 2 ? "PASS" : "FAIL", { header: true, outputShown: got.split(`oco-term-${rand}`).length > 2 })
    else run.record("terminal-shell-integ", "NOT RUN", { reason: "terminal never reported a finished shell-integration command within ~25 s" })
  } catch (e) {
    run.record("terminal-shell-integ", "NOT RUN", { reason: errMsg(e) })
  }
} catch (e) {
  run.record("run", "FAIL", { error: errMsg(e) })
  await runShot(page, run, "error")
} finally {
  await app.close().catch(() => {})
  process.exit(run.finish())
}
