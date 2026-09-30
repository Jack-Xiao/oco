// C2 DiffUnavailable UI (patch 0007), deterministic fixture, no model call.
// The webview reads its session through a local proxy (lib/proxy.mjs) whose `intercept` answers
// GET /session/:id/message with a fabricated finished turn: empty summary.diffs plus a completed write tool
// part for math.ts. Cases:
//   unavailable-row     the "Diff 不可用" row shows, lists the tool-written file, and shows no before/after diff row,
//                       no scope label and no "no changes" wording.
//   unavailable-open    clicking the listed file opens it in VS Code (host open-file policy).
//   control-diff-row    same fixture with a non-empty summary.diffs shows the normal Diff row and NO unavailable row.
// This proves UI behaviour for that data shape only. It does NOT prove the real chain (server drops a snapshot
// blob -> stored diff [] -> this row); that part is covered by tests/integration/c2-diff-*.
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { createRun } from "./lib/results.mjs"
import { startProxy } from "./lib/proxy.mjs"
import { launch, command, chatFrames, frameSession, sleep, runShot, hostState, root } from "./vscode.mjs"

const CASES = ["unavailable-row", "unavailable-open", "control-diff-row"]
const run = createRun({ suite: "c2-diff-unavailable", required: CASES, scriptPath: fileURLToPath(import.meta.url) })
const DIRECT = process.env.OCO_TEST_URL ?? "http://127.0.0.1:4517"
const WORKSPACE = path.join(fs.realpathSync(path.join(root, ".oco-test")), "workspace")
const INPUT = '[data-component="prompt-input"]'

async function waitFor(fn, ms, step = 100) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    const v = await fn().catch(() => null)
    if (v) return v
    await sleep(step)
  }
  return null
}

let fixtureDiffs = []
function fixtureMessages(sid) {
  const u = "msg_fixture0000001"
  const a = "msg_fixture0000002"
  const file = path.join(WORKSPACE, "math.ts")
  const t = 1_790_000_000_000
  return [
    {
      info: { id: u, sessionID: sid, role: "user", time: { created: t }, summary: { diffs: fixtureDiffs }, agent: "build", model: { providerID: "opencode", modelID: "big-pickle" } },
      parts: [{ id: "prt_fixture0000001", sessionID: sid, messageID: u, type: "text", text: "Add a comment to math.ts" }],
    },
    {
      info: { id: a, sessionID: sid, role: "assistant", time: { created: t + 1, completed: t + 3000 }, parentID: u, modelID: "big-pickle", providerID: "opencode", mode: "build", agent: "build", path: { cwd: WORKSPACE, root: WORKSPACE }, cost: 0, tokens: { total: 0, input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } }, finish: "stop" },
      parts: [
        {
          id: "prt_fixture0000002", sessionID: sid, messageID: a, type: "tool", callID: "call_fixture_1", tool: "write",
          state: { status: "completed", input: { filePath: file, content: "// x\n" }, output: "Wrote file successfully.", title: "math.ts", metadata: {}, time: { start: t + 100, end: t + 200 } },
        },
        { id: "prt_fixture0000003", sessionID: sid, messageID: a, type: "text", text: "OK", time: { start: t + 2000, end: t + 2001 } },
      ],
    },
  ]
}

const proxy = await startProxy({ target: DIRECT })
proxy.intercept((method, url) => {
  const m = method === "GET" && /^\/session\/([^/]+)\/message$/.exec(url.pathname)
  return m ? { json: fixtureMessages(m[1]) } : undefined
})
let app
run.installCrashHandlers(async () => {
  await app?.close().catch(() => {})
  await proxy.close()
})

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
  await waitFor(async () => ((await f.f.evaluate(() => document.documentElement.dataset.ocoModel)) === "ready" ? true : null), 60000, 200)
  return f
}

const editorState = (page) =>
  page.evaluate(() => ({
    tab: document.querySelector(".editor-group-container.active .tab.active .label-name")?.textContent ?? null,
    tabs: [...document.querySelectorAll(".tab .label-name")].map((e) => e.textContent),
  }))

try {
  const l = await launch({ profile: "c2-diff-unavailable", run, settings: { "oco.serverUrl": proxy.url } })
  app = l.app
  const page = l.page

  // Empty summary.diffs + completed write tool.
  fixtureDiffs = []
  const p = await newPanel(page)
  const unavailable = p.f.locator('[data-slot="oco-turn-diff-unavailable"]').first()
  const shown = await unavailable.waitFor({ timeout: 30000 }).then(() => true, () => false)
  try {
    const text = shown ? ((await unavailable.textContent()) ?? "") : ""
    const listed = shown ? await unavailable.locator("[data-oco-open-file]").evaluateAll((els) => els.map((e) => e.getAttribute("data-oco-open-file"))) : []
    const diffRows = await p.f.locator('[data-slot="session-turn-diff-path"]').count()
    const scope = await p.f.locator('[data-slot="oco-turn-diff-scope"]').count()
    const bodyText = (await p.f.locator("body").textContent()) ?? ""
    const fakeNoChange = /无修改|没有修改|无变化|no (file )?changes/i.test(bodyText)
    await runShot(page, run, "unavailable-row")
    const ok = shown && text.includes("不可用") && listed.some((f) => /math\.ts$/.test(f ?? "")) && diffRows === 0 && scope === 0 && !fakeNoChange
    run.record("unavailable-row", ok ? "PASS" : "FAIL", { shown, text: text.slice(0, 120), listed, diffRows, scopeLabels: scope, fakeNoChange, intercepted: proxy.stats.intercepted })
  } catch (e) {
    run.record("unavailable-row", "FAIL", { error: String(e?.message ?? e).slice(0, 400) })
  }

  try {
    const file = unavailable.locator("[data-oco-open-file]").first()
    await file.click()
    const st = await waitFor(async () => {
      const s = await editorState(page)
      return s.tabs.some((t) => /^math(\.ts)?$/.test(t ?? "")) ? s : null
    }, 10000, 200)
    const ps = (await hostState(page, l.stateFile)).panels.find((x) => x.sessionId === p.sid)
    run.record("unavailable-open", st && ps?.panel.fileOpens >= 1 ? "PASS" : "FAIL", { editor: st ?? (await editorState(page)), fileOpens: ps?.panel.fileOpens, lastReject: ps?.lastFileReject })
  } catch (e) {
    run.record("unavailable-open", "FAIL", { error: String(e?.message ?? e).slice(0, 400) })
  }

  // Control: same turn but with a stored diff -> normal Diff row, no unavailable row.
  try {
    await command(page, "View: Close All Editors").catch(() => {})
    await sleep(800)
    fixtureDiffs = [{ file: "math.ts", patch: "Index: math.ts\n===\n--- math.ts\n+++ math.ts\n@@ -1,1 +1,2 @@\n+// x\n export function add() {}\n", additions: 1, deletions: 0, status: "modified" }]
    const c = await newPanel(page)
    const row = c.f.locator('[data-slot="session-turn-diff-path"]').first()
    const rowShown = await row.waitFor({ timeout: 30000 }).then(() => true, () => false)
    const unavailableCount = await c.f.locator('[data-slot="oco-turn-diff-unavailable"]').count()
    await runShot(page, run, "control-diff-row")
    run.record("control-diff-row", rowShown && unavailableCount === 0 ? "PASS" : "FAIL", { rowShown, unavailableCount })
  } catch (e) {
    run.record("control-diff-row", "FAIL", { error: String(e?.message ?? e).slice(0, 400) })
  }
} catch (e) {
  run.record("run", "FAIL", { error: String(e?.message ?? e).slice(0, 400) })
} finally {
  await app?.close().catch(() => {})
  await proxy.close().catch(() => {})
  process.exit(run.finish())
}
