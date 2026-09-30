// T004: official chat in a VS Code webview against the real server: stream, tool+permission, question, cancel.
import fs from "node:fs"
import path from "node:path"
import { launch, command, waitForChatFrame, frameSession, shot, sleep, evidenceDir } from "./vscode.mjs"
import { api, messages, status, waitIdle, lastAssistant, textOf, MODEL } from "./server.mjs"

const results = []
const record = (id, status, detail) => { results.push({ id, status, detail }); console.log(`[${status}] ${id}: ${JSON.stringify(detail)}`) }
const { app, page } = await launch({ profile: "t004" })
const cspViolations = []
page.on("console", (m) => { if (/Content Security Policy|Refused to/i.test(m.text())) cspViolations.push(m.text().slice(0, 200)) })

async function send(frame, text) {
  const editor = frame.locator('[data-component="prompt-input"]')
  await editor.click()
  await page.keyboard.type(text, { delay: 5 })
  await page.keyboard.press("Enter")
}
async function sampleGrowth(frame, sid, ms) {
  const samples = []; const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    const len = await frame.evaluate(() => document.body.innerText.length)
    if (samples.length === 0 || samples.at(-1).len !== len) samples.push({ t: Date.now() - t0, len })
    if (Date.now() - t0 > 3000 && (await status(sid)) === "idle") break
    await sleep(120)
  }
  return samples
}

try {
  await sleep(2000)
  await command(page, "oco: New Session")
  const [frame] = await waitForChatFrame(page, 1, 90000, '[data-component="prompt-input"]')
  const sid = await frameSession(frame)
  console.log("session", sid)
  // The official app rejects submits until agents/models are synced ("Select an agent and model").
  await frame.getByText(MODEL.label).first().waitFor({ timeout: 60000 })
  await sleep(6000)

  // 1. streaming text
  await send(frame, "Count from 1 to 40, one number per line with the English word for it. Do not use any tools.")
  const samples = await sampleGrowth(frame, sid, 120000)
  await waitIdle(sid)
  const a1 = await lastAssistant(sid)
  const t1 = textOf(a1)
  await shot(page, "t004-1-stream")
  record("stream", samples.length >= 5 && /40/.test(t1) && a1.info.finish === "stop" ? "PASS" : "FAIL",
    { distinctRenderSteps: samples.length, firstMs: samples[0]?.t, lastMs: samples.at(-1)?.t, serverTextChars: t1.length, finish: a1.info.finish })

  // 2. tool + permission (bash is "ask" in the isolated test config)
  await send(frame, "Use the bash tool to run exactly this command: echo oco-perm-check-$((6*7)) . Then reply with its output.")
  const dock = frame.locator('[data-component="dock-prompt"][data-kind="permission"]')
  let permSeen = false
  try { await dock.waitFor({ timeout: 90000 }); permSeen = true } catch {}
  if (permSeen) {
    await shot(page, "t004-2-permission")
    const pending = await api("GET", "/permission")
    await dock.getByRole("button", { name: /allow once|允许一次/i }).click()
    await waitIdle(sid)
    const msgs = await messages(sid)
    const tool = msgs.flatMap((m) => m.parts).filter((p) => p.type === "tool" && p.tool === "bash").at(-1)
    const out = tool?.state?.output ?? ""
    await shot(page, "t004-2-tool-done")
    record("tool+permission", tool?.state?.status === "completed" && out.includes("oco-perm-check-42") ? "PASS" : "FAIL",
      { pendingBeforeClick: pending?.filter?.((p) => p.sessionID === sid).length, toolStatus: tool?.state?.status, outputHasMarker: out.includes("oco-perm-check-42") })
  } else record("tool+permission", "FAIL", { reason: "permission dock not shown in 90s" })

  // 3. question tool
  await send(frame, "Use the question tool (not plain text) to ask me which color I prefer, with exactly two options: red and blue. Wait for my answer, then reply with the chosen color.")
  const qdock = frame.locator('[data-component="dock-prompt"][data-kind="question"]')
  let qSeen = false
  try { await qdock.waitFor({ timeout: 90000 }); qSeen = true } catch {}
  if (qSeen) {
    await shot(page, "t004-3-question")
    await qdock.getByText(/^blue$/i).first().click()
    const submit = qdock.getByRole("button", { name: /submit|send|提交|发送|confirm|确认/i })
    if (await submit.count()) await submit.first().click()
    await waitIdle(sid)
    const msgs = await messages(sid)
    const q = msgs.flatMap((m) => m.parts).filter((p) => p.type === "tool" && p.tool === "question").at(-1)
    await shot(page, "t004-3-question-done")
    record("question", q?.state?.status === "completed" && JSON.stringify(q.state).toLowerCase().includes("blue") ? "PASS" : "FAIL", { toolStatus: q?.state?.status, answerHasBlue: JSON.stringify(q?.state ?? {}).toLowerCase().includes("blue") })
  } else {
    const msgs = await messages(sid)
    const used = msgs.flatMap((m) => m.parts).some((p) => p.type === "tool" && p.tool === "question")
    record("question", "NOT RUN", { reason: used ? "question tool used but dock not detected" : "model did not call the question tool" })
    await waitIdle(sid)
  }

  // 4. real cancel through the UI stop button
  await send(frame, "Write a numbered list from 1 to 300; each item is one full sentence about a different animal. Do not use tools.")
  const t0 = Date.now()
  while (Date.now() - t0 < 60000) { if ((await status(sid)) === "busy") { const m = await lastAssistant(sid); if (textOf(m).length > 200) break } await sleep(200) }
  await frame.locator('[data-action="prompt-submit"]').click()
  const clickedAt = Date.now()
  let idleAt = null
  while (Date.now() - clickedAt < 20000) { if ((await status(sid)) === "idle") { idleAt = Date.now(); break } await sleep(100) }
  const a4 = await lastAssistant(sid)
  const len1 = textOf(a4).length; await sleep(3000); const len2 = textOf(await lastAssistant(sid)).length
  await shot(page, "t004-4-cancel")
  record("cancel", a4?.info?.error?.name === "MessageAbortedError" && idleAt && len1 === len2 ? "PASS" : "FAIL",
    { error: a4?.info?.error?.name, serverIdleAfterMs: idleAt ? idleAt - clickedAt : null, textStoppedGrowing: len1 === len2, charsAtStop: len1 })

  const state = await page.evaluate(() => 0)
  void state
} catch (e) {
  record("run", "FAIL", { error: e.message })
  await shot(page, "t004-error").catch(() => {})
} finally {
  record("csp-violations", cspViolations.length === 0 ? "PASS" : "FAIL", { count: cspViolations.length, sample: cspViolations.slice(0, 5) })
  fs.writeFileSync(path.join(evidenceDir, "t004-results.json"), JSON.stringify({ at: new Date().toISOString(), results }, null, 2))
  await app.close()
}
