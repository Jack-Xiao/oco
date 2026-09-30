// C1 open file: file names in tool parts open the file in VS Code (patches/opencode/0005 -> ui openFile ->
// host open-file-policy). Cases:
//   open-file-line      the page asks for math.ts line 3 (debug hook = the same platform.openFileInHost the
//                       tool parts call); the editor shows math.ts at Ln 3.
//   open-file-refused   paths outside the session directory, missing files, directories and URI schemes are
//                       refused by the host; nothing is opened.
//   tool-click-opens    a real read tool part: clicking its file name opens math.ts at the read offset.
import { fileURLToPath } from "node:url"
import { createRun } from "./lib/results.mjs"
import { launch, command, chatFrames, frameSession, sleep, runShot, hostState, clearNotifications } from "./vscode.mjs"
import { messages, waitReply } from "./server.mjs"

const CASES = ["open-file-line", "open-file-refused", "tool-click-opens"]
const run = createRun({ suite: "c1-open-file", required: CASES, scriptPath: fileURLToPath(import.meta.url) })
const INPUT = '[data-component="prompt-input"]'
let app
run.installCrashHandlers(() => app?.close())

async function waitFor(fn, ms, step = 100) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    const v = await fn().catch(() => null)
    if (v) return v
    await sleep(step)
  }
  return null
}

async function newPanel(page) {
  await command(page, "oco: New Session")
  const f = await waitFor(async () => {
    for (const f of await chatFrames(page)) {
      const s = await frameSession(f).catch(() => null)
      if (s && (await f.$(INPUT).catch(() => null))) return { f, sid: s }
    }
    return null
  }, 60000, 100)
  if (!f) throw new Error("no panel")
  return f
}

/** Active editor tab label and cursor position from the workbench DOM. */
const editorState = (page) =>
  page.evaluate(() => {
    const tab = document.querySelector(".editor-group-container.active .tab.active .label-name")?.textContent ?? null
    const pos = document.querySelector('[id="status.editor.selection"]')?.textContent ?? null
    const tabs = [...document.querySelectorAll(".tab .label-name")].map((e) => e.textContent)
    return { tab, pos, tabs }
  })

const lineOf = (pos) => Number(/Ln (\d+)/.exec(pos ?? "")?.[1] ?? NaN)

try {
  const l = await launch({ profile: "c1-open-file", run })
  app = l.app
  const page = l.page
  const panelStats = async (sid) => (await hostState(page, l.stateFile)).panels.find((p) => p.sessionId === sid)

  const { f, sid } = await newPanel(page)
  await waitFor(async () => ((await f.evaluate(() => document.documentElement.dataset.ocoModel)) === "ready" ? true : null), 60000, 200)

  // 1. Valid path + line.
  try {
    await f.evaluate(() => window.__OCO_DEBUG__.openFile("math.ts", 3))
    const st = await waitFor(async () => {
      const s = await editorState(page)
      return /^math(\.ts)?$/.test(s.tab ?? "") && lineOf(s.pos) === 3 ? s : null
    }, 10000, 200)
    const ps = await panelStats(sid)
    await runShot(page, run, "open-file-line")
    run.record("open-file-line", st && ps?.panel.fileOpens === 1 ? "PASS" : "FAIL", { editor: st ?? (await editorState(page)), fileOpens: ps?.panel.fileOpens })
  } catch (e) {
    run.record("open-file-line", "FAIL", { error: String(e?.message ?? e).slice(0, 400) })
  }

  // 2. Refusals: no new editor tab may appear.
  try {
    const fr = f
    const tabsBefore = (await editorState(page)).tabs
    const before = await panelStats(sid)
    const bad = ["../outside.txt", "/etc/hosts", "missing-file.ts", ".", "file:///etc/hosts"]
    for (const p of bad) {
      await fr.evaluate((p) => window.__OCO_DEBUG__.openFile(p), p)
      await sleep(400)
    }
    await sleep(1000)
    const after = await panelStats(sid)
    const ed = await editorState(page)
    await runShot(page, run, "open-file-refused")
    await clearNotifications(page).catch(() => {})
    const rejected = after.panel.fileRejects - before.panel.fileRejects
    const opened = after.panel.fileOpens - before.panel.fileOpens
    const leaked = ed.tabs.length !== tabsBefore.length || ed.tabs.some((t) => t === "hosts" || t === "outside.txt" || t === "missing-file.ts")
    run.record("open-file-refused", rejected === bad.length && opened === 0 && !leaked ? "PASS" : "FAIL", {
      attempts: bad.length,
      rejected,
      opened,
      lastReason: after.lastFileReject,
      tabs: ed.tabs,
    })
  } catch (e) {
    run.record("open-file-refused", "FAIL", { error: String(e?.message ?? e).slice(0, 400) })
  }

  // 3. Real tool part (test model): click the read tool's file name.
  try {
    await command(page, "View: Close All Editors").catch(() => {})
    await sleep(800)
    const p = await newPanel(page)
    await waitFor(async () => ((await p.f.evaluate(() => document.documentElement.dataset.ocoModel)) === "ready" ? true : null), 60000, 200)
    const input = p.f.locator(INPUT)
    await input.click()
    await page.keyboard.type("Use the read tool on math.ts with offset 2 and limit 2. Then reply only with OK.", { delay: 2 })
    await page.keyboard.press("Enter")
    await waitReply(p.sid, 150000).catch(() => null)
    const msgs = await messages(p.sid).catch(() => [])
    const read = msgs.flatMap((m) => m.parts).find((x) => x.type === "tool" && x.tool === "read")
    const offset = typeof read?.state?.input?.offset === "number" ? read.state.input.offset : undefined
    // Read tools are grouped into a collapsed "context" group; expand it if present.
    const group = p.f.locator('[data-component="context-tool-group-trigger"]').first()
    if (await group.count()) await group.click().catch(() => {})
    const link = p.f.locator('[data-oco-open-file], [data-slot="basic-tool-tool-subtitle"].clickable').first()
    const found = await link.waitFor({ timeout: 20000 }).then(() => true, () => false)
    if (found) await link.click()
    const expectLine = offset ?? 1
    const st = await waitFor(async () => {
      const s = await editorState(page)
      return /^math(\.ts)?$/.test(s.tab ?? "") && lineOf(s.pos) === expectLine ? s : null
    }, 10000, 200)
    await runShot(page, run, "tool-click-opens")
    const ps = await panelStats(p.sid)
    run.record("tool-click-opens", read && found && st && ps?.panel.fileOpens === 1 ? "PASS" : "FAIL", {
      readTool: !!read,
      readInput: read ? { filePath: String(read.state?.input?.filePath ?? "").replace(/^.*\//, ".../"), offset } : null,
      linkFound: found,
      expectLine,
      editor: st ?? (await editorState(page)),
      fileOpens: ps?.panel.fileOpens,
    })
  } catch (e) {
    run.record("tool-click-opens", "FAIL", { error: String(e?.message ?? e).slice(0, 400) })
    await runShot(page, run, "tool-click-opens-error")
  }
} catch (e) {
  run.record("run", "FAIL", { error: String(e?.message ?? e).slice(0, 400) })
} finally {
  await app?.close().catch(() => {})
  process.exit(run.finish())
}
