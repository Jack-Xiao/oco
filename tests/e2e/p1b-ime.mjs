// P1b-1 IME: Enter pressed while an IME composition is active must not send; after the composition
// is committed, Enter sends the committed text. The composition is produced by Chromium's DevTools
// input domain (Input.imeSetComposition / insertText, and a keydown during composition), i.e. the
// browser's own IME path, not a real macOS input method; the real input method is recorded NOT RUN.
import { fileURLToPath } from "node:url"
import { createRun } from "./lib/results.mjs"
import { launch, command, chatFrames, frameSession, sleep, runShot, createAndOpenSession } from "./vscode.mjs"
import { messages, waitReply, MODEL } from "./server.mjs"

const run = createRun({ suite: "p1b-ime", required: ["ime-composition-enter"], scriptPath: fileURLToPath(import.meta.url) })
const { app, page } = await launch({ profile: "p1b-ime", run })
run.installCrashHandlers(() => app.close())
const users = async (sid) => (await messages(sid)).filter((m) => m.info.role === "user")
try {
  await createAndOpenSession(page)
  let f, sid
  for (let i = 0; i < 300 && !f; i++) {
    for (const x of await chatFrames(page)) if (await x.$('[data-component="prompt-input"]').catch(() => null)) (f = x), (sid = await frameSession(x))
    if (!f) await sleep(200)
  }
  await f.getByText(MODEL.label).first().waitFor({ timeout: 60000 })
  await sleep(2000)
  await f.evaluate(() => {
    window.__ocoIme = []
    for (const t of ["compositionstart", "compositionend", "keydown"])
      document.addEventListener(t, (e) => window.__ocoIme.push(t + (e.isComposing ? ":composing" : "") + (e.key ? ":" + e.key : "")), true)
  })
  const input = f.locator('[data-component="prompt-input"]')
  await input.click()
  await input.focus()
  const cdp = await page.context().newCDPSession(page)
  await cdp.send("Input.imeSetComposition", { text: "zhong", selectionStart: 5, selectionEnd: 5 })
  await sleep(200)
  await cdp.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 229, nativeVirtualKeyCode: 36 })
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 229 })
  await sleep(300)
  await cdp.send("Input.insertText", { text: "中文输入" })
  await sleep(1500)
  const sentDuring = (await users(sid)).length
  const composed = (await input.innerText()).trim()
  const events = await f.evaluate(() => window.__ocoIme.join(","))
  await page.keyboard.press("Enter")
  let sent = []
  for (let i = 0; i < 40 && sent.length === 0; i++) {
    await sleep(250)
    sent = await users(sid)
  }
  const text = sent.map((m) => m.parts.filter((p) => p.type === "text").map((p) => p.text).join("")).join("|")
  await waitReply(sid, 60000)
  await runShot(page, run, "ime")
  run.record("ime-composition-enter", /keydown:composing:Enter/.test(events) && sentDuring === 0 && composed === "中文输入" && sent.length === 1 && text === "中文输入" ? "PASS" : "FAIL", {
    events,
    sentDuringComposition: sentDuring,
    composerAfterCommit: composed,
    sentAfterEnter: text,
  })
  run.record("ime-real-macos", "NOT RUN", { reason: "needs a person typing with a macOS Chinese input method; automation cannot drive the system IME in VS Code" })
} catch (e) {
  run.record("run", "FAIL", { error: String(e?.message ?? e).slice(0, 400) })
} finally {
  await app.close().catch(() => {})
  process.exit(run.finish())
}
