#!/usr/bin/env node
// E2E c14-review-notes: "Add to Review Notes" collects notes per session, the sidebar row shows an "N to send"
// badge, and sending (badge click) queues ONE text into that session's draft without sending it. Real VS Code +
// test server (mock LLM). The two notes come from two real editor selections; the comment goes through the input box.
//   notes-badge-1         after the first note the session row shows "1 to send"
//   notes-badge-2         after the second note it shows "2 to send"
//   badge-send-draft      clicking the badge puts one text in the composer: both path:lines, both comments, the
//                         "may include changes not made by this session" caveat and the selected code
//   draft-acked           the page acknowledged the insert (draftAcks +1, no rejects, no pending drafts left)
//   badge-cleared         the badge disappears after sending
//   no-auto-send          the session has no new user message (the draft was not sent)
import fs from "node:fs"
import path from "node:path"
import { execFileSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { createRun } from "./lib/results.mjs"
import { launch, command, waitUntil, chatFrames, frameSession, sleep, runShot, hostState, createAndOpenSession, root } from "./vscode.mjs"
import { api, MODEL } from "./server.mjs"
import { sessionsFrame } from "./lib/sessions-web.mjs"

const REQUIRED = ["notes-badge-1", "notes-badge-2", "badge-send-draft", "draft-acked", "badge-cleared", "no-auto-send"]
const run = createRun({ suite: "c14-review-notes", required: REQUIRED, scriptPath: fileURLToPath(import.meta.url) })
const errMsg = (e) => String(e?.message ?? e).slice(0, 400)

const rand = Math.random().toString(36).slice(2, 7)
const wsDir = path.join(fs.realpathSync(path.join(root, ".oco-test")), "c14", `ws-${rand}`)
fs.mkdirSync(wsDir, { recursive: true })
const git = (...args) => execFileSync("git", ["-c", "user.email=test@oco.local", "-c", "user.name=oco-test", ...args], { cwd: wsDir, stdio: "pipe" })
git("init", "-q")
const FILE = `sample-${rand}.txt`
const lines = Array.from({ length: 8 }, (_, i) => `line ${i + 1} alpha-${rand}-${i + 1}`)
fs.writeFileSync(path.join(wsDir, FILE), lines.join("\n") + "\n")
git("add", "-A")
git("commit", "-qm", "init")

const health = await api("GET", "/global/health").catch(() => null)
run.setEnv({ serverVersion: health?.version ?? null, modelMode: MODEL.mode, fixtureWorkspace: wsDir })

const { app, page, stateFile } = await launch({ profile: "c14-review-notes", run, workspace: wsDir })
run.installCrashHandlers(() => app.close())
const state = () => hostState(page, stateFile)
const userMessages = async (sid) => ((await api("GET", `/session/${sid}/message`, undefined, wsDir)) ?? []).filter((m) => m.info.role === "user").length

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
const badgeOf = async (sid) => {
  const frame = await sessionsFrame(page)
  if (!frame) return null
  const b = frame.locator(`.row[data-kind="session"][data-id="${sid}"] .notes-badge`).first()
  if ((await b.count()) === 0) return { visible: false, text: "" }
  return { visible: await b.isVisible(), text: (await b.textContent())?.trim() ?? "", locator: b }
}
const waitBadge = (sid, want) => waitUntil(async () => { const b = await badgeOf(sid); return b && (want === null ? !b.visible : b.visible && b.text === want) ? b : null }, 15000, 250)

/** Open the fixture file beside the chat panel and make its editor the active one. */
async function openFileToSide() {
  await page.click(".part.sidebar .composite.title", { position: { x: 30, y: 10 }, timeout: 3000 }).catch(() => {})
  await page.keyboard.press("Meta+P")
  await page.locator(".quick-input-widget input").waitFor({ state: "visible", timeout: 5000 })
  await page.keyboard.type(FILE)
  await sleep(700)
  await page.keyboard.press("Meta+Enter")
  await page.locator(".monaco-editor .view-lines", { hasText: `alpha-${rand}-1` }).first().waitFor({ state: "visible", timeout: 15000 })
}
/** Select whole lines [from, to] (1-based) in the active text editor. */
async function selectLines(from, to) {
  await page.locator(".editor-instance .monaco-editor .view-lines", { hasText: `alpha-${rand}-1` }).first().click({ position: { x: 400, y: 5 } }).catch(() => {})
  await page.keyboard.press("Control+G")
  await page.locator(".quick-input-widget input").waitFor({ state: "visible", timeout: 5000 })
  await page.keyboard.type(String(from))
  await page.keyboard.press("Enter")
  await sleep(300)
  await page.keyboard.press("Home")
  for (let i = from; i < to; i++) await page.keyboard.press("Shift+ArrowDown")
  await page.keyboard.press("Shift+End")
  await sleep(200)
}
/** Run "oco: Add to Review Notes": answer a session pick if one is shown, then the comment box. */
async function addNote(comment) {
  await command(page, "oco: Add to Review Notes")
  await page.waitForFunction(() => { const el = document.querySelector(".quick-input-widget input"); return el && el.offsetParent !== null && !el.value.startsWith(">") }, null, { timeout: 10000 })
  const placeholder = await page.locator(".quick-input-widget input").getAttribute("placeholder")
  const picked = /which session/i.test(placeholder ?? "")
  if (picked) { await page.keyboard.press("Enter"); await sleep(400) }
  await page.keyboard.type(comment)
  await page.keyboard.press("Enter")
  await sleep(500)
  return { placeholder, picked }
}

let sid
try {
  sid = await createAndOpenSession(page, { title: `c14-notes-${rand}`, directory: wsDir })
  const f = await sessionFrame(sid)
  if (!f) throw new Error("session frame not found")
  const before = { users: await userMessages(sid), acks: (await state()).panels.find((p) => p.sessionId === sid)?.panel.draftAcks ?? 0 }
  await openFileToSide()
  await runShot(page, run, "1-file-open")

  const c1 = `first-note-${rand}`
  const c2 = `second-note-${rand}`
  await selectLines(2, 2)
  const a1 = await addNote(c1)
  await command(page, "Focus on Sessions View")
  const b1 = await waitBadge(sid, "1 to send")
  run.record("notes-badge-1", b1 ? "PASS" : "FAIL", { badge: (await badgeOf(sid))?.text, addNote: a1 })

  await selectLines(5, 6)
  const a2 = await addNote(c2)
  await command(page, "Focus on Sessions View")
  const b2 = await waitBadge(sid, "2 to send")
  await runShot(page, run, "2-badge")
  run.record("notes-badge-2", b2 ? "PASS" : "FAIL", { badge: (await badgeOf(sid))?.text, addNote: a2 })
  if (!b2) throw new Error("badge 2 to send not shown")

  await b2.locator.click()
  const want = [`${FILE}:2-2`, `${FILE}:5-6`, c1, c2, "may include changes not made by this session", `line 2 alpha-${rand}-2`, `line 6 alpha-${rand}-6`]
  const got = await waitUntil(async () => { const t = await composerText(f); return want.every((w) => t.includes(w)) ? t : null }, 20000, 300)
  await sleep(2500) // a duplicate delivery would have landed by now
  const text = await composerText(f)
  await runShot(page, run, "3-draft")
  const once = text.split("Review notes (2 on 1 file").length - 1 === 1
  run.record("badge-send-draft", got && once ? "PASS" : "FAIL", { missing: want.filter((w) => !text.includes(w)), headerCount: text.split("Review notes (2 on 1 file").length - 1, length: text.length })

  const st = await waitUntil(async () => { const s = await state(); const p = s.panels.find((x) => x.sessionId === sid); return p && p.panel.draftAcks > before.acks && p.pendingDrafts === 0 ? p : null }, 15000, 400)
  const p = st ?? (await state()).panels.find((x) => x.sessionId === sid)
  run.record("draft-acked", st && p.panel.draftRejects === 0 && p.panel.draftAcks === before.acks + 1 ? "PASS" : "FAIL", { acksBefore: before.acks, acks: p?.panel.draftAcks, rejects: p?.panel.draftRejects, pending: p?.pendingDrafts })

  run.record("badge-cleared", (await waitBadge(sid, null)) ? "PASS" : "FAIL", { visible: (await badgeOf(sid))?.visible })

  await sleep(3000)
  const after = await userMessages(sid)
  run.record("no-auto-send", after === before.users ? "PASS" : "FAIL", { userMessagesBefore: before.users, after })
} catch (e) {
  run.record("run", "FAIL", { error: errMsg(e) })
  await runShot(page, run, "error")
} finally {
  await app.close().catch(() => {})
  process.exit(run.finish())
}
