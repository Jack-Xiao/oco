// E2E c26-export (cc-features): "oco: Export Session as Markdown" opens an untitled markdown editor with the transcript.
// Cases:
//   export-text   after one text exchange: language=markdown untitled editor holding "# <title>", "## User", "## Assistant",
//                 the user text and the assistant text
//   export-tools  a session with a (failing) read tool call exports a <details> block
// The command targets the focused main panel's session (no row argument), so this drives the palette path.
import { fileURLToPath } from "node:url"
import { createRun } from "./lib/results.mjs"
import { launch, command, waitUntil, chatFrames, frameSession, sleep, runShot, createAndOpenSession } from "./vscode.mjs"
import { api, waitReply, lastAssistant, textOf, MODEL } from "./server.mjs"

const run = createRun({ suite: "c26-export", required: ["export-text", "export-tools"], scriptPath: fileURLToPath(import.meta.url) })
const health = await api("GET", "/global/health").catch(() => null)
run.setEnv({ serverVersion: health?.version ?? null, modelMode: MODEL.mode })
const { app, page } = await launch({ profile: "c26-export", run })
run.installCrashHandlers(() => app.close())
const rand = Math.random().toString(36).slice(2, 7)

async function frameFor(sid, timeout = 60000) {
  const end = Date.now() + timeout
  while (Date.now() < end) {
    for (const f of await chatFrames(page)) {
      const ok = await f
        .evaluate((id) => window.__OCO_DEBUG__?.sessionId?.() === id && document.visibilityState === "visible" && !!document.querySelector('[data-component="prompt-input"]'), sid)
        .catch(() => false)
      if (ok) return f
    }
    await sleep(50)
  }
  return null
}
async function send(f, text) {
  await waitUntil(async () => (await f.evaluate(() => document.documentElement.dataset.ocoModel)) === "ready", 60000, 100)
  const input = f.locator('[data-component="prompt-input"]')
  await input.click()
  await input.focus()
  await page.keyboard.type(text, { delay: 4 })
  await sleep(200)
  await page.keyboard.press("Enter")
}
/** Run the export command and return { text, language } of the untitled editor it opens. */
async function exportNow() {
  await command(page, "oco: Export Session as Markdown")
  const sel = ".editor-instance .view-lines"
  await page.waitForSelector(sel, { timeout: 20000 })
  await sleep(800)
  const text = await page.locator(sel).first().innerText()
  const language = (await page.locator('.statusbar [id="status.editor.mode"]').first().innerText().catch(() => "")).trim()
  const untitled = (await page.locator(".tab.active").first().getAttribute("aria-label").catch(() => "")) ?? ""
  return { text: text.replace(/ /g, " "), language, tab: untitled }
}
async function session(prompt) {
  const sid = await createAndOpenSession(page)
  const f = await frameFor(sid)
  await send(f, prompt)
  await waitReply(sid)
  await sleep(1500) // let the generated title land
  return sid
}

try {
  const U1 = `EXPORT-USER-${rand}`
  const sid1 = await session(`Reply with exactly this line and nothing else: ${U1}`)
  const title1 = (await api("GET", `/session/${sid1}`)).title
  const a1 = textOf(await lastAssistant(sid1))
  await runShot(page, run, "1-before-export")
  const e1 = await exportNow()
  await runShot(page, run, "1-exported")
  const t = e1.text
  const ok1 = t.includes(`# ${title1}`) && t.includes("## User") && t.includes("## Assistant") && t.includes(U1) && t.includes(a1.trim().slice(0, 40)) && /markdown/i.test(e1.language) && /Untitled/i.test(e1.tab)
  run.record("export-text", ok1 ? "PASS" : "FAIL", { title: title1, language: e1.language, tab: e1.tab, head: t.slice(0, 300), assistant: a1.slice(0, 60) })

  await command(page, "View: Close All Editors").catch(() => {})
  const sid2 = await session(`Use the read tool on missing file export-missing-${rand}.txt`)
  const e2 = await exportNow()
  await runShot(page, run, "2-exported-tools")
  run.record("export-tools", e2.text.includes("<details>") && e2.text.includes("## Assistant") ? "PASS" : "FAIL", { sid: sid2, language: e2.language, head: e2.text.slice(0, 500) })
} catch (e) {
  run.record("run", "FAIL", { error: String(e?.message ?? e).slice(0, 500) })
  await runShot(page, run, "error")
} finally {
  await app.close().catch(() => {})
  process.exit(run.finish())
}
