// C1 open file: file names in tool parts open the file in VS Code (patches/opencode/0005 -> ui openFile ->
// host open-file-policy). Cases:
//   open-file-line      the page asks for math.ts line 3 (debug hook = the same platform.openFileInHost the
//                       tool parts call); the editor shows math.ts at Ln 3.
//   open-file-refused   paths outside the session directory, missing files, directories and URI schemes are
//                       refused by the host; nothing is opened.
//   tool-click-opens    a real read tool part: clicking its file name opens math.ts at the read offset.
//   position-parse      `math.ts:2` / `math.ts#L3` (no separate line) open math.ts at that line (host splitPosition).
//   markdown-path       inline code `math.ts:4` in an assistant reply is clickable and opens math.ts at Ln 4;
//                       non-path inline code is not intercepted (patches/opencode/0006).
//   diff-summary        after a write, the turn's Diff summary row shows its scope label (0007); clicking the file name opens the file;
//                       clicking the chevron only expands the inline diff and opens nothing (0006).
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { createRun } from "./lib/results.mjs"
import { launch, command, chatFrames, frameSession, sleep, runShot, hostState, clearNotifications } from "./vscode.mjs"
import { messages, waitReply } from "./server.mjs"

const CASES = ["open-file-line", "open-file-refused", "tool-click-opens", "position-parse", "markdown-path", "diff-summary"]
const NOTE = "c1-note.txt"
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

  // 4. Position suffix parsed by the host (the page passes the raw text, no separate line). The chat
  // panel is itself an editor tab, so editors are not closed between attempts; the line must change.
  try {
    await command(page, "View: Close All Editors").catch(() => {})
    await sleep(800)
    const p = await newPanel(page)
    const got = []
    for (const [raw, want] of [["math.ts:2", 2], ["math.ts#L3", 3]]) {
      await p.f.evaluate((r) => window.__OCO_DEBUG__.openFile(r), raw)
      const st = await waitFor(async () => {
        const s = await editorState(page)
        return /^math(\.ts)?$/.test(s.tab ?? "") && lineOf(s.pos) === want ? s : null
      }, 10000, 200)
      got.push({ raw, want, ok: !!st, editor: st ?? (await editorState(page)) })
    }
    run.record("position-parse", got.every((g) => g.ok) ? "PASS" : "FAIL", { got })
  } catch (e) {
    run.record("position-parse", "FAIL", { error: String(e?.message ?? e).slice(0, 400) })
  }

  // 5. Markdown inline path in a real reply.
  try {
    await command(page, "View: Close All Editors").catch(() => {})
    await sleep(800)
    const p = await newPanel(page)
    await waitFor(async () => ((await p.f.evaluate(() => document.documentElement.dataset.ocoModel)) === "ready" ? true : null), 60000, 200)
    await p.f.locator(INPUT).click()
    await page.keyboard.type("Do not use any tools. Reply with exactly this line and nothing else: See `math.ts:4` and `npm test`.", { delay: 2 })
    await page.keyboard.press("Enter")
    await waitReply(p.sid, 150000).catch(() => null)
    const code = p.f.locator('[data-component="text-part"] code[data-oco-open-path]').first()
    const found = await code.waitFor({ timeout: 20000 }).then(() => true, () => false)
    const codeText = found ? await code.textContent() : null
    const plain = await p.f.evaluate(() =>
      [...document.querySelectorAll('[data-component="text-part"] :not(pre) > code')]
        .filter((c) => !("ocoOpenPath" in c.dataset))
        .map((c) => c.textContent),
    )
    const before = await panelStats(p.sid)
    const plainEl = p.f.locator('[data-component="text-part"] :not(pre) > code:not([data-oco-open-path])').first()
    if (await plainEl.count()) await plainEl.click()
    await sleep(800)
    const afterPlain = await panelStats(p.sid)
    if (found) await code.click()
    const st = await waitFor(async () => {
      const s = await editorState(page)
      return /^math(\.ts)?$/.test(s.tab ?? "") && lineOf(s.pos) === 4 ? s : null
    }, 10000, 200)
    await runShot(page, run, "markdown-path")
    const ps = await panelStats(p.sid)
    const plainIgnored = afterPlain.panel.fileOpens === before.panel.fileOpens && afterPlain.panel.fileRejects === before.panel.fileRejects
    run.record("markdown-path", found && st && ps?.panel.fileOpens === 1 && plainIgnored ? "PASS" : "FAIL", {
      found,
      codeText,
      plainCode: plain,
      plainIgnored,
      editor: st ?? (await editorState(page)),
      fileOpens: ps?.panel.fileOpens,
      lastReject: ps?.lastFileReject,
    })
  } catch (e) {
    run.record("markdown-path", "FAIL", { error: String(e?.message ?? e).slice(0, 400) })
    await runShot(page, run, "markdown-path-error")
  }

  // 6. Diff summary row after a write.
  try {
    await command(page, "View: Close All Editors").catch(() => {})
    await sleep(800)
    const p = await newPanel(page)
    await waitFor(async () => ((await p.f.evaluate(() => document.documentElement.dataset.ocoModel)) === "ready" ? true : null), 60000, 200)
    await p.f.locator(INPUT).click()
    await page.keyboard.type(`Use the write tool to create the file ${NOTE} containing the single line hello. Then reply only with OK.`, { delay: 2 })
    await page.keyboard.press("Enter")
    // The test server asks before edits (scripts/test-server.opencode.json): allow once in the dock.
    const dock = p.f.locator('[data-component="dock-prompt"][data-kind="permission"]')
    const asked = await dock.waitFor({ timeout: 90000 }).then(() => true, () => false)
    if (asked) await dock.getByRole("button", { name: /allow once|允许一次/i }).click()
    await waitReply(p.sid, 150000).catch(() => null)
    const row = p.f.locator('[data-slot="session-turn-diff-path"][data-oco-open-file]').first()
    const found = await row.waitFor({ timeout: 30000 }).then(() => true, () => false)
    const file = found ? await row.getAttribute("data-oco-open-file") : null
    // Chevron: expands the diff, opens nothing.
    const before = await panelStats(p.sid)
    const chevron = p.f.locator('[data-slot="session-turn-diff-chevron"]').first()
    let expanded = false
    if (found) {
      await chevron.click()
      expanded = !!(await waitFor(async () => ((await p.f.locator('[data-component="session-turn-diffs-content"] [data-expanded]').count()) ? true : null), 5000, 200))
    }
    await sleep(600)
    const afterChevron = await panelStats(p.sid)
    const chevronOpened = afterChevron.panel.fileOpens - before.panel.fileOpens
    if (found) await row.click()
    const st = await waitFor(async () => {
      const s = await editorState(page)
      return s.tab && NOTE.startsWith(s.tab) ? s : null
    }, 10000, 200)
    await runShot(page, run, "diff-summary")
    const ps = await panelStats(p.sid)
    // patches/opencode/0007: the turn diff row states its scope (snapshot window, not authorship).
    const scope = await p.f.locator('[data-slot="oco-turn-diff-scope"]').first().textContent({ timeout: 3000 }).catch(() => null)
    const scoped = !!scope?.includes("本轮工作区变化")
    run.record("diff-summary", found && st && expanded && chevronOpened === 0 && ps?.panel.fileOpens === 1 && scoped ? "PASS" : "FAIL", {
      scope,
      permissionAsked: asked,
      found,
      file,
      expanded,
      chevronOpened,
      editor: st ?? (await editorState(page)),
      fileOpens: ps?.panel.fileOpens,
      lastReject: ps?.lastFileReject,
    })
  } catch (e) {
    run.record("diff-summary", "FAIL", { error: String(e?.message ?? e).slice(0, 400) })
    await runShot(page, run, "diff-summary-error")
  }
} catch (e) {
  run.record("run", "FAIL", { error: String(e?.message ?? e).slice(0, 400) })
} finally {
  await app?.close().catch(() => {})
  try {
    fs.rmSync(path.join(fs.realpathSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "../../.oco-test")), "workspace", NOTE), { force: true })
  } catch {}
  process.exit(run.finish())
}
