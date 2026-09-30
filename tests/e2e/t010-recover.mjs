// T010 limited check via a fixture proxy (lib/proxy.mjs intercept; no model call):
//   unknown-types  a message with an unknown part type and an unknown tool still renders, the chat stays usable.
//   session-gone   the message list answers 404 (session removed): the app's error page shows, and its Restart button
//                  recovers the panel (host reloads the webview; a plain location.reload() left it blank) once the
//                  session reads fine again.
import { fileURLToPath } from "node:url"
import { createRun } from "./lib/results.mjs"
import { startProxy } from "./lib/proxy.mjs"
import { launch, command, chatFrames, sleep, runShot } from "./vscode.mjs"

const run = createRun({ suite: "t010-recover", required: ["unknown-types", "session-gone-restart"], scriptPath: fileURLToPath(import.meta.url) })
const proxy = await startProxy({ target: process.env.OCO_TEST_URL ?? "http://127.0.0.1:4517" })
let mode = "unknown"
proxy.intercept((m, url) => {
  const x = /^\/session\/([^/]+)\/message$/.exec(url.pathname)
  if (m !== "GET" || !x) return
  if (mode === "gone") return { status: 404, json: { name: "NotFoundError", data: { message: "Session not found" } } }
  const sid = x[1]
  const t = 1790000000000
  return {
    json: [
      { info: { id: "msg_f1", sessionID: sid, role: "user", time: { created: t }, summary: { diffs: [] }, agent: "build", model: { providerID: "opencode", modelID: "big-pickle" } }, parts: [{ id: "prt_f1", sessionID: sid, messageID: "msg_f1", type: "text", text: "hi" }] },
      { info: { id: "msg_f2", sessionID: sid, role: "assistant", time: { created: t + 1, completed: t + 2 }, parentID: "msg_f1", modelID: "big-pickle", providerID: "opencode", mode: "build", agent: "build", path: { cwd: "/", root: "/" }, cost: 0, tokens: { total: 0, input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } }, finish: "stop" },
        parts: [
          { id: "prt_f2", sessionID: sid, messageID: "msg_f2", type: "future-part-type", payload: 1 },
          { id: "prt_f3", sessionID: sid, messageID: "msg_f2", type: "tool", callID: "c", tool: "brand-new-tool", state: { status: "completed", input: { x: 1 }, output: "o", title: "t", metadata: {}, time: { start: t, end: t + 1 } } },
          { id: "prt_f4", sessionID: sid, messageID: "msg_f2", type: "text", text: "still here", time: { start: t, end: t + 1 } },
        ] },
    ],
  }
}) 
let app
run.installCrashHandlers(async () => {
  await app?.close().catch(() => {})
  await proxy.close()
})
const INPUT = '[data-component="prompt-input"]'
const snap = async (page) => {
  for (const f of await chatFrames(page)) {
    const r = await f.evaluate((sel) => ({ text: document.body.innerText.slice(0, 400), input: !!document.querySelector(sel) }), INPUT).catch(() => null)
    if (r) return r
  }
  return null
}
const poll = async (page, pred, ms) => {
  const end = Date.now() + ms
  let last = null
  while (Date.now() < end) {
    last = await snap(page)
    if (last && pred(last)) return last
    await sleep(500)
  }
  return null
}

try {
  const l = await launch({ profile: "t010-recover", run, settings: { "oco.serverUrl": proxy.url } })
  app = l.app
  const page = l.page
  try {
    await command(page, "oco: New Session")
    const s = await poll(page, (r) => r.input && /still here/.test(r.text), 40000)
    await runShot(page, run, "unknown-types")
    run.record("unknown-types", s ? "PASS" : "FAIL", { text: s?.text.slice(0, 200) })
  } catch (e) {
    run.record("unknown-types", "FAIL", { error: String(e?.message ?? e).slice(0, 400) })
  }
  try {
    await command(page, "View: Close All Editors").catch(() => {})
    mode = "gone"
    await command(page, "oco: New Session")
    const err = await poll(page, (r) => /Something went wrong/.test(r.text), 40000)
    await runShot(page, run, "session-gone")
    mode = "unknown"
    let clicked = false
    for (const f of await chatFrames(page)) {
      const b = f.getByRole("button", { name: /restart/i }).first()
      if (await b.count()) {
        await b.click({ timeout: 5000 }).catch(() => {})
        clicked = true
      }
    }
    const after = clicked ? await poll(page, (r) => r.input && /still here/.test(r.text), 40000) : null
    await runShot(page, run, "session-gone-restart")
    run.record("session-gone-restart", err && clicked && after ? "PASS" : "FAIL", { errorPageShown: !!err, restartClicked: clicked, recovered: !!after })
  } catch (e) {
    run.record("session-gone-restart", "FAIL", { error: String(e?.message ?? e).slice(0, 400) })
  }
} catch (e) {
  run.record("run", "FAIL", { error: String(e?.message ?? e).slice(0, 400) })
} finally {
  await app?.close().catch(() => {})
  await proxy.close().catch(() => {})
  process.exit(run.finish())
}
