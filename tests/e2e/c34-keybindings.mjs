#!/usr/bin/env node
// E2E c34-keybindings: the card 8 default chord (ctrl+alt+u, mac cmd+alt+u; second key i = oco: Inbox: Next Action)
// in its three positions, against the manifest's when clause `activeWebviewPanelId == 'oco.chat' || oco.sidebarFocused`:
//   1. Sessions sidebar webview focused while a plain text editor is the active editor — fires. Only the host context key
//      oco.sidebarFocused can let it through here: VS Code's focusedView never follows focus into a webview view's iframe,
//      so the sidebar page reports window focus / blur and the host mirrors it (sessions-webview.ts).
//   2. Plain text editor focused — the prefix is no chord here, nothing fires, and the second key types normally.
//   3. Chat panel active (activeWebviewPanelId == 'oco.chat') — fires.
// The observable is the "OpenCode Inbox" QuickPick, which the command opens (possibly empty) whenever it runs; no pending
// item is needed. The host's debug export shows the mirrored key and the focus / blur message counters afterwards.
import { fileURLToPath } from "node:url"
import { createRun } from "./lib/results.mjs"
import { launch, command, waitUntil, sleep, waitForChatFrame, createAndOpenSession, hostState, runShot, clearNotifications } from "./vscode.mjs"
import { api, MODEL } from "./server.mjs"
import { sessionsFrame } from "./lib/sessions-web.mjs"

const REQUIRED = ["sidebar-chord-opens-inbox", "editor-chord-passes-through", "sidebar-blur-clears-context", "panel-chord-opens-inbox"]
const run = createRun({ suite: "c34-keybindings", required: REQUIRED, scriptPath: fileURLToPath(import.meta.url) })
const health = await api("GET", "/global/health").catch(() => null)
run.setEnv({ serverVersion: health?.version ?? null, modelMode: MODEL.mode })

// package.json binds ctrl+alt+u (mac cmd+alt+u) as the prefix; press what this platform's VS Code resolves.
const PREFIX = process.platform === "darwin" ? "Meta+Alt+KeyU" : "Control+Alt+KeyU"
const PREFIX_LABEL = process.platform === "darwin" ? "cmd+alt+u" : "ctrl+alt+u"
const SECOND = "KeyI"
const QP_TITLE = "OpenCode Inbox"
// VS Code >= 1.10x edits through EditContext: the focusable input is `div.native-edit-context`, not `textarea.inputarea`.
// Accept both so the suite follows the editor.editContext setting / VS Code version.
const EDITOR_INPUT = ".editor-instance .monaco-editor :is(.native-edit-context, textarea.inputarea)"

let app = null
let page = null
let stateFile = null
const rand = Math.random().toString(36).slice(2, 7)

const quickPick = () => page.locator(".quick-input-widget")
const inboxOpen = async () => {
  if (!(await quickPick().isVisible().catch(() => false))) return false
  const title = await quickPick().locator(".quick-input-title").innerText().catch(() => "")
  return title.includes(QP_TITLE)
}
const statusText = () => page.locator(".part.statusbar").innerText().catch(() => "")
/** Press the prefix, note whether VS Code entered chord mode (its status bar message), then press the second key. */
async function chord() {
  await page.keyboard.press(PREFIX)
  const chordMode = await waitUntil(async () => /second key of chord|was pressed/i.test(await statusText()), 1500, 100).then((v) => !!v)
  await page.keyboard.press(SECOND)
  return chordMode
}
async function closeQuickPick() {
  for (let i = 0; i < 3 && (await quickPick().isVisible().catch(() => false)); i++) {
    await page.keyboard.press("Escape")
    await sleep(250)
  }
}
const activeTab = () => page.locator(".tabs-container .tab.active").first().innerText().catch(() => "")
const editorLines = () => page.locator(".editor-instance .monaco-editor .view-lines").first()
const editorText = () => editorLines().innerText().then((t) => t.replace(/\s+/g, ""), () => "")
const describeActive = (f) => f.evaluate(() => { const a = document.activeElement; return a ? `${a.tagName}.${String(a.className).slice(0, 60)}` : null }).catch(() => null)
const composerText = (f) => f.evaluate(() => { const a = document.activeElement; return a && (a.tagName === "TEXTAREA" || a.isContentEditable) ? String(a.value ?? a.textContent ?? "").slice(0, 40) : null }).catch(() => null)

try {
  const launched = await launch({ profile: "c34-keybindings", run })
  app = launched.app
  page = launched.page
  stateFile = launched.stateFile
  run.installCrashHandlers(() => app?.close())
  await clearNotifications(page)

  // A plain text editor is the active editor for cases 1 and 2, so activeWebviewPanelId stays empty throughout them.
  await command(page, "File: New Untitled Text File")
  await page.waitForSelector(EDITOR_INPUT, { state: "attached", timeout: 15000 })
  await sleep(500)
  await page.keyboard.type("ab")
  await waitUntil(async () => (await editorText()) === "ab", 5000, 100)

  // --- 1. Sessions sidebar webview focused
  // The list needs rows: an empty list has nothing focusable inside the iframe (run 2 of this suite never got focus there).
  for (const n of ["a", "b"]) await api("POST", "/session", { title: `c34-${n}-${rand}` })
  await command(page, "Focus on Sessions View") // the first reveal creates the webview; this focus can race its page load
  let frame = null
  await waitUntil(async () => ((frame = await sessionsFrame(page)), !!frame), 30000, 300)
  if (!frame) throw new Error("Sessions sidebar frame not found")
  const rows = frame.locator('.row[data-kind="session"]')
  const rowCount = (await waitUntil(async () => ((await rows.count()) >= 2 ? await rows.count() : 0), 20000, 200)) ?? 0
  await sleep(1500) // let the view settle (a late list refresh can move focus)
  // The page is loaded now, so this focus reaches it. If the iframe still is not the focused frame, focus a row as c20 does.
  await command(page, "Focus on Sessions View")
  await sleep(800)
  const hasFocus = () => frame.evaluate(() => document.hasFocus()).catch(() => false)
  const viaCommand = await hasFocus()
  let frameFocused = viaCommand
  if (!frameFocused) {
    await rows.first().focus().catch(() => {})
    await sleep(800) // the host mirrors the page's focus message into oco.sidebarFocused (an extension host round trip)
    frameFocused = await hasFocus()
  }
  const sidebarActive = await describeActive(frame)
  const topActive = await describeActive(page)
  const tab1 = await activeTab()
  const chordMode1 = await chord()
  const opened1 = await waitUntil(inboxOpen, 10000, 200).then((v) => !!v)
  await runShot(page, run, "1-sidebar-chord")
  run.record("sidebar-chord-opens-inbox", opened1 && frameFocused ? "PASS" : "FAIL", {
    prefix: PREFIX_LABEL, rows: rowCount, focusedViaCommand: viaCommand, frameFocused, sidebarActiveElement: sidebarActive, workbenchActiveElement: topActive, activeTab: tab1, chordMode: chordMode1, opened: opened1,
  })
  await closeQuickPick()

  // --- 2. Plain text editor focused: the prefix passes through and the second key types
  await editorLines().click()
  await page.keyboard.press("End")
  const editorFocused = await waitUntil(() => page.evaluate(() => !!document.activeElement?.matches?.(".native-edit-context, textarea.inputarea")), 5000, 100).then((v) => !!v)
  const before2 = await editorText()
  const chordMode2 = await chord()
  await sleep(1500)
  const opened2 = await inboxOpen()
  const after2 = await editorText()
  const status2 = await statusText()
  await runShot(page, run, "2-editor-chord")
  run.record("editor-chord-passes-through", editorFocused && !opened2 && !chordMode2 && after2 === before2 + "i" ? "PASS" : "FAIL", {
    prefix: PREFIX_LABEL, editorFocused, opened: opened2, chordMode: chordMode2, before: before2, after: after2, notACommand: /not a command/i.test(status2), activeTab: await activeTab(),
  })
  await closeQuickPick()

  // The host cleared oco.sidebarFocused when focus left the sidebar; the export also shows the page sent focus and blur.
  const state = await hostState(page, stateFile)
  const web = state?.sidebar?.webList ?? {}
  run.record("sidebar-blur-clears-context", web.sidebarFocused === false && (web.focus ?? 0) >= 1 && (web.blur ?? 0) >= 1 ? "PASS" : "FAIL", {
    sidebarFocused: web.sidebarFocused ?? null, focusMessages: web.focus ?? null, blurMessages: web.blur ?? null,
  })

  // --- 3. Chat panel active
  const sid = await createAndOpenSession(page, { title: `c34-panel-${rand}` })
  const [chat] = await waitForChatFrame(page, 1, 60000, '[data-component="prompt-input"]')
  await sleep(800)
  // A user working in the chat panel has the composer focused: click into it (a real click, so VS Code's webview focus tracking sees it).
  const composerClicked = await chat.locator('[data-component="prompt-input"]').click({ timeout: 10000 }).then(() => true, () => false)
  await sleep(500)
  const tab3 = await activeTab()
  const chatFocused = await chat.evaluate(() => document.hasFocus()).catch(() => null)
  const chatActive = await describeActive(chat)
  const composerBefore = await composerText(chat)
  const chordMode3 = await chord()
  const opened3 = await waitUntil(inboxOpen, 10000, 200).then((v) => !!v)
  const composerAfter = await composerText(chat)
  await runShot(page, run, "3-panel-chord")
  run.record("panel-chord-opens-inbox", opened3 ? "PASS" : "FAIL", {
    prefix: PREFIX_LABEL, sessionId: sid, activeTab: tab3, composerClicked, chatFrameFocused: chatFocused, chatActiveElement: chatActive, chordMode: chordMode3, opened: opened3,
    // informational: a letter second key still reaches a focused composer (VS Code cannot preventDefault inside a webview)
    composerBefore, composerAfter,
  })
  await closeQuickPick()
} catch (e) {
  run.record("run", "FAIL", { error: String(e?.message ?? e).slice(0, 500) })
  if (page) await runShot(page, run, "error").catch(() => {})
} finally {
  if (app) await app.close().catch(() => {})
  process.exit(run.finish())
}
