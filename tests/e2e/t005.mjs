// T005: three sessions, draft isolation, unsaved selection into a chosen session draft, concurrent
// permissions, image bytes, hide/restore and Reload Window — in real VS Code against the real server.
import fs from "node:fs"
import path from "node:path"
import { launch, command, waitForChatFrame, chatFrames, frameSession, shot, sleep, evidenceDir, root, createAndOpenSession } from "./vscode.mjs"
import { api, messages, status, waitIdle, MODEL } from "./server.mjs"

const results = []
const record = (id, st, detail) => { results.push({ id, status: st, detail }); console.log(`[${st}] ${id}: ${JSON.stringify(detail)}`) }
const { app, page } = await launch({ profile: "t005" })
const png = fs.readFileSync(path.join(root, "tests/fixtures/oco-test.png"))

const promptText = (f) => f.locator('[data-component="prompt-input"]').innerText()
async function visibleFrame() {
  const [f] = await waitForChatFrame(page, 1, 60000, '[data-component="prompt-input"]')
  const frames = await chatFrames(page)
  for (const fr of frames) {
    const vis = await fr.evaluate(() => document.visibilityState === "visible" && !!document.querySelector('[data-component="prompt-input"]')).catch(() => false)
    if (vis) return fr
  }
  return f
}
async function focusSession(sid) {
  await command(page, "oco: Open Session")
  await page.waitForTimeout(1200)
  await page.keyboard.type(sid)
  await page.waitForTimeout(500)
  await page.keyboard.press("Enter")
  const end = Date.now() + 60000
  while (Date.now() < end) {
    for (const f of await chatFrames(page)) {
      const ok = await f.evaluate((id) => (window.__OCO_DEBUG__?.sessionId?.() ?? window.__OCO_INIT__.binding.sessionId) === id && document.visibilityState === "visible" && !!document.querySelector('[data-component="prompt-input"], [data-component="dock-prompt"]'), sid).catch(() => false)
      if (ok) {
        if (await f.$('[data-component="prompt-input"]')) await f.getByText(MODEL.label).first().waitFor({ timeout: 60000 })
        await sleep(2500)
        return f
      }
    }
    await sleep(300)
  }
  throw new Error("session panel not visible: " + sid)
}
async function typeInto(f, text, send = false) {
  await f.locator('[data-component="prompt-input"]').click()
  await page.keyboard.press("End")
  await page.keyboard.type(text, { delay: 5 })
  if (send) await page.keyboard.press("Enter")
}
const panelCount = async () => (await page.$$('.tabs-container .tab')).length

try {
  // 1. three sessions
  const ids = []
  for (let i = 0; i < 3; i++) {
    const sid = await createAndOpenSession(page, { newPanel: i > 0 })
    await sleep(1500)
    let f
    for (const fr of await chatFrames(page)) if ((await frameSession(fr).catch(() => null)) === sid) f = fr
    if (!ids.includes(sid)) ids.push(sid)
    await f.getByText(MODEL.label).first().waitFor({ timeout: 60000 })
    await sleep(3000)
  }
  const [A, B, C] = ids
  console.log("sessions", ids)
  record("three-sessions", ids.length === 3 && (await panelCount()) === 3 ? "PASS" : "FAIL", { sessions: ids.length, editorTabs: await panelCount() })

  // 2. separate drafts per session (hidden webviews are destroyed: drafts must come back from host storage)
  for (const [sid, tag] of [[A, "draft-A-alpha"], [B, "draft-B-bravo"], [C, "draft-C-charlie"]]) {
    const f = await focusSession(sid)
    await typeInto(f, tag)
    await sleep(1500) // let the draft persist
  }
  const drafts = {}
  for (const sid of [A, B, C]) drafts[sid] = await promptText(await focusSession(sid))
  const isolated = drafts[A].includes("draft-A-alpha") && !/bravo|charlie/.test(drafts[A]) && drafts[B].includes("draft-B-bravo") && !/alpha|charlie/.test(drafts[B]) && drafts[C].includes("draft-C-charlie") && !/alpha|bravo/.test(drafts[C])
  record("draft-isolation+hide-restore", isolated ? "PASS" : "FAIL", { A: drafts[A].trim(), B: drafts[B].trim(), C: drafts[C].trim() })

  // 3. re-opening an open session focuses the existing tab
  const before = await panelCount()
  await focusSession(A)
  const innerTabs = await (await focusSession(A)).evaluate(() => document.body.innerText.includes("draft") ? null : null)
  void innerTabs
  record("dedupe-open", (await panelCount()) === before ? "PASS" : "FAIL", { tabsBefore: before, tabsAfter: await panelCount() })

  // 4. unsaved editor selection -> session B draft (explicit target, not sent)
  await command(page, "Go to File", { input: "math.ts" })
  await page.waitForSelector(".monaco-editor .view-lines", { timeout: 20000 })
  await page.waitForTimeout(800)
  await page.locator(".monaco-editor .view-lines").first().click()
  await page.keyboard.press("Meta+ArrowDown")
  await page.keyboard.type("\n// unsaved-marker-777\n")
  await page.keyboard.press("Meta+A")
  const bMsgsBefore = (await messages(B)).length
  await command(page, "oco: Add Selection to Session Draft")
  await page.waitForTimeout(1000)
  await page.keyboard.type(B)
  await page.waitForTimeout(500)
  await page.keyboard.press("Enter")
  await sleep(4000)
  const fB = await focusSession(B)
  const bDraft = (await promptText(fB)) + " " + (await fB.locator('[data-component="prompt-input-v2-attachments"]').innerText().catch(() => "")) // the chip is outside the contenteditable
  const aDraft = await promptText(await focusSession(A))
  const cDraft = await promptText(await focusSession(C))
  const bNotSent = (await messages(B)).length === bMsgsBefore
  await shot(page, "t005-4-selection-draft")
  record("selection-into-chosen-draft", /math\.ts:1-\d+/.test(bDraft) && bDraft.includes("draft-B-bravo") && !aDraft.includes("unsaved-marker") && !cDraft.includes("unsaved-marker") && bNotSent ? "PASS" : "FAIL",
    { bHasChip: /math\.ts:1-\d+/.test(bDraft), bKeptOldDraft: bDraft.includes("draft-B-bravo"), aClean: !aDraft.includes("unsaved-marker"), cClean: !cDraft.includes("unsaved-marker"), notAutoSent: bNotSent })

  // 5. send B: the server must receive the unsaved buffer content
  const fB2 = await focusSession(B)
  await fB2.locator('[data-component="prompt-input"]').click()
  await page.keyboard.press("Meta+End")
  await page.keyboard.type(" Reply only with OK.", { delay: 5 })
  await page.keyboard.press("Enter")
  await waitIdle(B)
  const bUser = (await messages(B)).filter((m) => m.info.role === "user").at(-1)
  const bUserText = (bUser?.parts ?? []).filter((p) => p.type === "text").map((p) => p.text).join("")
  record("server-received-unsaved-buffer", bUserText.includes("unsaved-marker-777") && bUserText.includes("export function add") ? "PASS" : "FAIL", { hasMarker: bUserText.includes("unsaved-marker-777"), hasFileBody: bUserText.includes("export function add") })

  // 6. concurrent permission requests in A and C, answered separately
  const fA = await focusSession(A)
  await page.keyboard.press("Meta+A"); await page.keyboard.press("Backspace")
  await typeInto(fA, "Use the bash tool to run exactly: echo perm-A-111", true)
  const fC = await focusSession(C)
  await fC.locator('[data-component="prompt-input"]').click()
  await page.keyboard.press("Meta+A"); await page.keyboard.press("Backspace")
  await typeInto(fC, "Use the bash tool to run exactly: echo perm-C-333", true)
  const end = Date.now() + 90000
  let pend = []
  while (Date.now() < end) { pend = ((await api("GET", "/permission")) ?? []).filter((p) => p.sessionID === A || p.sessionID === C); if (pend.length >= 2) break; await sleep(500) }
  const fC2 = await focusSession(C)
  const dockC = fC2.locator('[data-component="dock-prompt"][data-kind="permission"]')
  await dockC.waitFor({ timeout: 30000 })
  const cDockText = await dockC.innerText()
  await shot(page, "t005-6-permission-C")
  await dockC.getByRole("button", { name: /^deny$|拒绝/i }).click()
  const fA2 = await focusSession(A)
  const dockA = fA2.locator('[data-component="dock-prompt"][data-kind="permission"]')
  await dockA.waitFor({ timeout: 30000 })
  const aDockText = await dockA.innerText()
  await dockA.getByRole("button", { name: /allow once|允许一次/i }).click()
  await waitIdle(A); await waitIdle(C)
  const toolOf = async (sid) => (await messages(sid)).flatMap((m) => m.parts).filter((p) => p.type === "tool" && p.tool === "bash").at(-1)
  const tA = await toolOf(A), tC = await toolOf(C)
  record("concurrent-permissions-routed", pend.length >= 2 && cDockText.includes("perm-C-333") && !cDockText.includes("perm-A") && aDockText.includes("perm-A-111") && tA?.state?.status === "completed" && String(tA.state.output).includes("perm-A-111") && tC?.state?.status === "error" ? "PASS" : "FAIL",
    { pendingBoth: pend.length, cDockShowsC: cDockText.includes("perm-C-333"), aDockShowsA: aDockText.includes("perm-A-111"), A: tA?.state?.status, C: tC?.state?.status })

  // 7. image bytes: paste a PNG File into C's composer and send
  const fC3 = await focusSession(C)
  await fC3.locator('[data-component="prompt-input"]').click()
  await fC3.evaluate((b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
    const dt = new DataTransfer()
    dt.items.add(new File([bytes], "oco-test.png", { type: "image/png" }))
    document.querySelector('[data-component="prompt-input"]').dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }))
  }, png.toString("base64"))
  await sleep(1500)
  await shot(page, "t005-7-image-attached")
  await typeInto(fC3, "What is in this image? One sentence.", true)
  await sleep(4000)
  const cUser = (await messages(C)).filter((m) => m.info.role === "user").at(-1)
  const img = (cUser?.parts ?? []).find((p) => p.type === "file" && String(p.mime).startsWith("image/"))
  const got = img?.url?.startsWith("data:") ? Buffer.from(img.url.split(",")[1], "base64") : null
  record("image-bytes-to-server", got && got.equals(png) ? "PASS" : "FAIL", { mime: img?.mime, bytesReceived: got?.length ?? null, bytesSent: png.length, identical: !!got && got.equals(png) })
  await waitIdle(C, 60000)

  // 8. Reload Window: panels restored by the serializer, drafts restored
  const fA3 = await focusSession(A)
  await typeInto(fA3, "keep-me-after-reload")
  await sleep(2000)
  const streamsBefore = await page.$$eval('.tabs-container .tab', (t) => t.length)
  await command(page, "Developer: Reload Window")
  await sleep(4000)
  await page.waitForSelector(".monaco-workbench", { timeout: 60000 })
  await sleep(4000)
  const fAr = await focusSession(A)
  const restored = await promptText(fAr)
  const tabsAfter = await page.$$eval('.tabs-container .tab', (t) => t.length)
  await shot(page, "t005-8-after-reload")
  record("reload-window-restore", restored.includes("keep-me-after-reload") && tabsAfter === streamsBefore ? "PASS" : "FAIL", { draftRestored: restored.includes("keep-me-after-reload"), tabsBefore: streamsBefore, tabsAfter })

  // 9. closing a tab does not stop the server-side run
  const fB3 = await focusSession(B)
  await fB3.locator('[data-component="prompt-input"]').click()
  await page.keyboard.press("Meta+A"); await page.keyboard.press("Backspace")
  await typeInto(fB3, "Write a numbered list from 1 to 120, one short sentence each. No tools.", true)
  const t0 = Date.now(); while (Date.now() - t0 < 30000 && (await status(B)) !== "busy") await sleep(200)
  await page.keyboard.press("Meta+W")
  await sleep(1500)
  const stillBusy = (await status(B)) === "busy"
  await waitIdle(B)
  const lastB = (await messages(B)).filter((m) => m.info.role === "assistant").at(-1)
  record("close-tab-not-cancel", stillBusy && !lastB?.info?.error ? "PASS" : "FAIL", { busyAfterClose: stillBusy, finishedWithoutError: !lastB?.info?.error, finish: lastB?.info?.finish })
} catch (e) {
  record("run", "FAIL", { error: e.message.slice(0, 400) })
  await shot(page, "t005-error").catch(() => {})
} finally {
  fs.writeFileSync(path.join(evidenceDir, "t005-results.json"), JSON.stringify({ at: new Date().toISOString(), results }, null, 2))
  await app.close()
}
