// P1a-01/02/04: panel identity, concurrent visible webviews, navigation attacks, storage and restore.
// Real VS Code (three editor groups visible at once) + real server.
import { fileURLToPath } from "node:url"
import fs from "node:fs"
import path from "node:path"
import { createRun } from "./lib/results.mjs"
import { clearNotifications, launch, command, quickInput, waitUntil, chatFrames, frameSession, sleep, runShot, hostState, root } from "./vscode.mjs"
import { api, messages, status, waitIdle, waitReply, MODEL } from "./server.mjs"

const REQUIRED = [
  "three-visible-webviews",
  "no-internal-tabs",
  "concurrent-send-isolated",
  "nav-link-other-session",
  "nav-blocked-routes",
  "nav-shortcuts-deeplink",
  "draft-after-attacks",
  "forged-draft-rejected",
  "permission-after-attacks",
  "hide-retires-generation",
  "reload-auto-restore",
  "close-specific-tab",
  "image-bytes",
  "csp-violations",
]
const run = createRun({ suite: "p1a-identity", required: REQUIRED, scriptPath: fileURLToPath(import.meta.url) })
const health = await api("GET", "/global/health").catch(() => null)
run.setEnv({ serverVersion: health?.version ?? null })
const { app, page, stateFile } = await launch({ profile: "p1a-identity", run })
run.installCrashHandlers(() => app.close())
const csp = []
page.on("console", (m) => {
  if (/Content Security Policy|Refused to/i.test(m.text())) csp.push(m.text().slice(0, 200))
})
const png = fs.readFileSync(path.join(root, "tests/fixtures/oco-test.png"))
const state = () => hostState(page, stateFile)
const DIR = path.join(fs.realpathSync(path.join(root, ".oco-test")), "workspace")

/** Visible chat frame for a session (by binding), waiting until its composer or a dock is present. */
async function frameFor(sid, timeout = 60000) {
  const end = Date.now() + timeout
  while (Date.now() < end) {
    for (const f of await chatFrames(page)) {
      const ok = await f
        .evaluate((id) => window.__OCO_INIT__.binding.sessionId === id && document.visibilityState === "visible" && !!document.querySelector('[data-component="prompt-input"], [data-component="dock-prompt"]'), sid)
        .catch(() => false)
      if (ok) return f
    }
    await sleep(200)
  }
  throw new Error(`no visible frame for ${sid}`)
}
async function ready(f) {
  await f.getByText(MODEL.label).first().waitFor({ timeout: 60000 })
  // The page marks itself once agents/models are loaded (patch 0004); then the composer accepts input.
  await waitUntil(async () => (await f.evaluate(() => document.documentElement.dataset.ocoModel)) === "ready", 10000, 100)
  await sleep(300)
}
async function openSession(sid) {
  await command(page, "oco: Open Session", { input: sid })
}
// Note: hostState() runs a palette command (~1s), so poll it only where one read replaces a long wait.
const panelOf = async (sid) => (await state()).panels.find((p) => p.sessionId === sid)
const groupCount = () => page.$$eval(".editor-group-container", (e) => e.length)
async function type(f, text, send = false) {
  // The first click on a webview can focus only the editor group; focus the composer explicitly and
  // verify the text arrived (retry once) so a lost keystroke is never mistaken for a product result.
  const input = f.locator('[data-component="prompt-input"]')
  for (let attempt = 0; attempt < 2; attempt++) {
    const before = await input.innerText()
    await input.click()
    await input.focus()
    await page.keyboard.press("Meta+End")
    await page.keyboard.type(text, { delay: 4 })
    await sleep(200)
    if ((await input.innerText()).length >= before.length + text.length - 2) break
  }
  if (send) await page.keyboard.press("Enter")
}
/** Editor tab labels across all groups (VS Code revives hidden webviews lazily, so the host registry
 *  after a reload only lists visible panels; the tabs themselves are the restore contract). */
const tabLabels = () => page.$$eval(".tabs-container .tab", (t) => t.map((x) => x.getAttribute("aria-label") ?? x.textContent ?? "").sort())
const composer = (f) => f.locator('[data-component="prompt-input"]').innerText()
const lastUserText = async (sid) =>
  ((await messages(sid)).filter((m) => m.info.role === "user").at(-1)?.parts ?? []).filter((p) => p.type === "text").map((p) => p.text).join("")
const assistantText = async (sid) =>
  (await messages(sid)).filter((m) => m.info.role === "assistant").flatMap((m) => m.parts).filter((p) => p.type === "text").map((p) => p.text).join("\n")

try {
  // 1. Three sessions in three editor groups, all visible at the same time.
  const ids = []
  for (let i = 0; i < 3; i++) {
    await command(page, "oco: New Session")
    // Identify the new panel from its frame (querying host state here would race the webview for focus).
    let sid
    const t0 = Date.now()
    while (!sid && Date.now() - t0 < 60000) {
      for (const f of await chatFrames(page)) {
        const s = await frameSession(f).catch(() => null)
        if (s && !ids.includes(s)) sid = s
      }
      if (!sid) await sleep(300)
    }
    if (!sid) throw new Error("new session panel did not appear")
    ids.push(sid)
    await ready(await frameFor(sid))
  }
  // Spread the three tabs over three editor groups: C -> right twice (g3), then B -> right (g2).
  await command(page, "View: Move Editor into Right Group")
  await waitUntil(async () => (await groupCount()) >= 2, 5000)
  await command(page, "View: Move Editor into Right Group")
  await waitUntil(async () => (await groupCount()) >= 3, 5000)
  await command(page, "View: Focus First Editor Group")
  await waitUntil(() => page.evaluate(() => document.querySelector(".editor-group-container")?.classList.contains("active")), 3000)
  await command(page, "View: Move Editor into Right Group")
  // All three panels visible, ready and on distinct generations (the assertion below), within 10s.
  await waitUntil(async () => {
    const vis = (await state()).panels.filter((p) => p.visible && p.ready && p.generation > 0)
    return vis.length === 3 && new Set(vis.map((p) => p.generation)).size === 3
  }, 10000, 200)
  const [A, B, C] = ids
  run.setEnv({ sessions: { A, B, C } })
  let st = await state()
  const vis = st.panels.filter((p) => p.visible && p.ready && p.generation > 0)
  const gens = new Set(vis.map((p) => p.generation))
  run.record("three-visible-webviews", vis.length === 3 && gens.size === 3 ? "PASS" : "FAIL", {
    visibleReady: vis.length,
    distinctGenerations: gens.size,
    editorGroups: await page.$$eval(".editor-group-container", (e) => e.length),
  })
  await runShot(page, run, "1-three-visible")
  const fA = await frameFor(A), fB = await frameFor(B), fC = await frameFor(C)

  // 2. No internal tab strip / home / new-tab entries in any panel.
  const tabCounts = await Promise.all([fA, fB, fC].map((f) => f.evaluate(() => document.querySelectorAll('[data-slot="titlebar-tabs"], [data-component="session-tab-popover-trigger"]').length)))
  run.record("no-internal-tabs", tabCounts.every((n) => n === 0) ? "PASS" : "FAIL", { tabElementsPerPanel: tabCounts })

  // 3. Concurrent sends in the three visible panels; each reply lands only in its own session.
  await type(fA, "Reply with exactly: TAG-ALPHA", true)
  await type(fB, "Reply with exactly: TAG-BRAVO", true)
  await type(fC, "Reply with exactly: TAG-CHARLIE", true)
  await Promise.all([waitReply(A), waitReply(B), waitReply(C)])
  await sleep(1500)
  const tags = { [A]: "ALPHA", [B]: "BRAVO", [C]: "CHARLIE" }
  const iso = {}
  for (const [sid, f] of [[A, fA], [B, fB], [C, fC]]) {
    const ms = await messages(sid)
    const users = ms.filter((m) => m.info.role === "user").map((m) => m.parts.filter((p) => p.type === "text").map((p) => p.text).join(""))
    const replies = ms.filter((m) => m.info.role === "assistant")
    const serverAll = JSON.stringify(ms)
    const dom = await f.evaluate(() => document.body.innerText)
    const others = Object.entries(tags).filter(([s]) => s !== sid).map(([, t]) => `TAG-${t}`)
    iso[tags[sid]] = {
      ownPromptOnServer: users.length === 1 && users[0].includes(`TAG-${tags[sid]}`),
      replyCompleted: replies.length >= 1 && replies.every((r) => r.info.time?.completed && !r.info.error),
      replyEchoesTag: replies.some((r) => r.parts.some((p) => p.type === "text" && p.text.includes(`TAG-${tags[sid]}`))), // model compliance, informational
      leak: others.some((t) => serverAll.includes(t) || dom.includes(t)),
    }
  }
  run.record("concurrent-send-isolated", Object.values(iso).every((x) => x.ownPromptOnServer && x.replyCompleted && !x.leak) ? "PASS" : "FAIL", iso)
  await runShot(page, run, "3-concurrent")

  // 4. Navigation attacks inside panel A.
  const other = await api("POST", "/session", { title: "oco nav target" }) // same project, not open
  const clickLink = (f, href) =>
    f.evaluate((href) => {
      // Same-origin absolute URL so solid-router's link handler intercepts it (a relative href would
      // resolve against the resource <base> and bypass the router entirely).
      const a = document.createElement("a")
      a.href = location.origin + href
      a.textContent = "oco-test-link"
      document.getElementById("root").appendChild(a)
      a.click()
      a.remove()
    }, href)
  const b64 = (s) => Buffer.from(s).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "")
  const beforeNav = await state()
  await clickLink(fA, `/server/${b64("http://oco.bridge")}/session/${other.id}`)
  await sleep(3000)
  st = await state()
  const aEntry = st.panels.find((p) => p.sessionId === A)
  const openedOther = st.panels.some((p) => p.sessionId === other.id)
  // The host opens the requested session in the active editor group (A's), which hides A; bring A back
  // and check that A itself never changed session.
  await openSession(A)
  const fA2 = await frameFor(A)
  const aRoute = await fA2.evaluate(() => window.__OCO_DEBUG__.route())
  const aBody = await fA2.evaluate(() => document.body.innerText)
  run.record("nav-link-other-session", openedOther && aRoute.endsWith(`/session/${A}`) && aBody.includes("TAG-ALPHA") && aEntry.panel.openRequests > (beforeNav.panels.find((p) => p.sessionId === A)?.panel.openRequests ?? 0) ? "PASS" : "FAIL", {
    hostOpenedTargetPanel: openedOther,
    panelARoute: aRoute.split("/").pop(),
    panelAStillShowsItsMessages: aBody.includes("TAG-ALPHA"),
    openRequests: aEntry.panel.openRequests,
  })
  const fA3 = await frameFor(A)
  const blockedBefore = (await state()).panels.find((p) => p.sessionId === A).panel.blockedNavigations
  // One click per router transition (clicks within one tick are merged into one navigation).
  for (const href of ["/", "/new-session", `/server/${b64("http://evil.example")}/session/${A}`]) {
    await clickLink(fA3, href)
    await sleep(1200)
  }
  const blockedAfter = (await state()).panels.find((p) => p.sessionId === A).panel.blockedNavigations
  const aRoute2 = await fA3.evaluate(() => window.__OCO_DEBUG__.route())
  run.record("nav-blocked-routes", blockedAfter - blockedBefore === 3 && aRoute2.endsWith(`/session/${A}`) ? "PASS" : "FAIL", { blocked: blockedAfter - blockedBefore, routeStill: aRoute2.split("/").pop() })

  // Shortcuts that would switch/create sessions or open the terminal, plus deep links.
  // Official shortcuts for new tab/session, terminal and home. With patch 0002 the app no longer
  // registers them, so they reach VS Code (which may e.g. toggle its own terminal/sidebar or open a
  // quick pick). Meta+N (new untitled file) is skipped because it would just hide the panel.
  const keys = ["Meta+Shift+s", "Meta+t", "Control+Backquote", "Control+Alt+t", "Meta+b", "Meta+b"]
  for (const key of keys) {
    const f = await frameFor(A).catch(() => null)
    if (f) await f.locator('[data-component="prompt-input"]').click().catch(() => {})
    await page.keyboard.press(key)
    await sleep(500)
    await page.keyboard.press("Escape")
  }
  // Undo VS Code-side effects of those keys (its own terminal panel, notifications).
  await command(page, "View: Close Panel").catch(() => {})
  await command(page, "Notifications: Clear All Notifications").catch(() => {})
  await openSession(A)
  const fA3b = await frameFor(A)
  await fA3b.evaluate(() => {
    for (const url of ["opencode://open-project?directory=%2Ftmp", "opencode://new-session?directory=%2Ftmp&prompt=hi"]) {
      ;(window.__OPENCODE__ ??= {}).deepLinks = [...(window.__OPENCODE__.deepLinks ?? []), url]
      window.dispatchEvent(new CustomEvent("opencode:deep-link", { detail: { urls: [url] } }))
    }
  })
  await sleep(2000)
  const fA4 = await frameFor(A)
  const after = await fA4.evaluate(() => ({
    route: window.__OCO_DEBUG__.route(),
    terminal: document.querySelectorAll('[data-component="terminal"]').length,
    ws: window.__OCO_STATS__.websocketBlocked,
  }))
  st = await state()
  run.record("nav-shortcuts-deeplink", after.route.endsWith(`/session/${A}`) && after.terminal === 0 && st.panels.filter((p) => p.sessionId === A).length === 1 ? "PASS" : "FAIL", {
    route: after.route.split("/").pop(),
    terminalElements: after.terminal,
    websocketAttempts: after.ws,
    panelsForA: st.panels.filter((p) => p.sessionId === A).length,
  })
  await runShot(page, run, "4-after-attacks")

  // 5. After the attacks: selection into A's draft (explicit target), sent, received by A only.
  await command(page, "Go to File", { input: "math.ts" })
  const editorLines = page.locator(".editor-group-container.active .monaco-editor .view-lines").first()
  await editorLines.waitFor({ timeout: 20000 })
  await sleep(300)
  await editorLines.click()
  await page.keyboard.press("Meta+ArrowDown")
  await page.keyboard.type("\n// unsaved-ident-555\n")
  await page.keyboard.press("Meta+a")
  const editorHasMarker = (await editorLines.innerText()).includes("unsaved-ident-555")
  await command(page, "oco: Add Selection to Session Draft", { input: A })
  // The draft is delivered once A's page acknowledges it and shows it in the composer.
  await waitUntil(async () => {
    const p = await panelOf(A)
    return p?.panel.draftAcks >= 1 && p.pendingDrafts === 0 && (await composer(await frameFor(A, 2000))).includes("unsaved-ident-555")
  }, 10000, 200)
  const fA5 = await frameFor(A)
  const aDraft = await composer(fA5)
  st = await state()
  const aAck = st.panels.find((p) => p.sessionId === A)
  await type(fA5, " Reply only with OK.", true)
  await waitIdle(A)
  const sent = await lastUserText(A)
  const leaked = (await Promise.all([B, C].map(lastUserText))).some((t) => t.includes("unsaved-ident-555"))
  run.record("draft-after-attacks", aDraft.includes("unsaved-ident-555") && aAck.panel.draftAcks >= 1 && aAck.pendingDrafts === 0 && sent.includes("unsaved-ident-555") && !leaked ? "PASS" : "FAIL", {
    editorHadUnsavedMarker: editorHasMarker,
    draftHasSelection: aDraft.includes("unsaved-ident-555"),
    composerHead: aDraft.slice(0, 120),
    acks: aAck.panel.draftAcks,
    pending: aAck.pendingDrafts,
    serverReceived: sent.includes("unsaved-ident-555"),
    leakedToOthers: leaked,
  })

  // 6. Forged host message targeting another session inside A's page: refused, nothing inserted.
  const fA6 = await frameFor(A)
  const rejectsBefore = (await state()).panels.find((p) => p.sessionId === A).panel.draftRejects
  const composerBefore = await composer(fA6)
  await fA6.evaluate((B) => {
    const gen = window.__OCO_DEBUG__.generation()
    window.dispatchEvent(new MessageEvent("message", { data: { v: 2, gen, type: "draft.insert", id: "forged-1", sessionId: B, text: "FORGED-TEXT", source: { path: "x", startLine: 1, endLine: 1, unsaved: false } } }))
  }, B)
  await sleep(1500)
  const rejectsAfter = (await state()).panels.find((p) => p.sessionId === A).panel.draftRejects
  const composerAfter = await composer(fA6)
  run.record("forged-draft-rejected", rejectsAfter === rejectsBefore + 1 && !composerAfter.includes("FORGED") && composerAfter === composerBefore ? "PASS" : "FAIL", {
    hostRejects: rejectsAfter - rejectsBefore,
    composerUnchanged: composerAfter === composerBefore,
  })

  // 7. Permission after the attacks is answered in A and applies to A's request only.
  await fA6.locator('[data-component="prompt-input"]').click()
  await page.keyboard.press("Meta+a")
  await page.keyboard.press("Backspace")
  await type(fA6, "Use the bash tool to run exactly: echo ident-perm-A", true)
  let req
  const t0 = Date.now()
  while (!req && Date.now() - t0 < 90000) {
    req = ((await api("GET", "/permission")) ?? []).find((p) => p.sessionID === A)
    if (!req) await sleep(300)
  }
  const dock = (await frameFor(A)).locator('[data-component="dock-prompt"][data-kind="permission"]')
  await dock.waitFor({ timeout: 30000 })
  await clearNotifications(page)
  const dockText = await dock.innerText()
  // Known T010 issue: at ~1/3 editor width the official permission dock does not wrap and "Allow once"
  // overflows under the neighbouring group's webview, so a pointer click is intercepted. Use the
  // button's own click() and record it.
  const allow = dock.getByRole("button", { name: /allow once|允许一次/i })
  const box = await allow.boundingBox()
  const frameBox = await (await frameFor(A)).evaluate(() => ({ w: window.innerWidth }))
  await allow.evaluate((b) => b.click())
  await waitIdle(A)
  const tool = (await messages(A)).flatMap((m) => m.parts).find((p) => p.type === "tool" && p.callID === req?.tool?.callID)
  run.record("permission-after-attacks", req && dockText.includes("ident-perm-A") && tool?.state?.status === "completed" && String(tool.state.output).includes("ident-perm-A") ? "PASS" : "FAIL", {
    requestId: req?.id,
    clickMethod: "element.click() (pointer click intercepted: button overflows narrow panel)",
    buttonRightEdge: box ? Math.round(box.x + box.width) : null,
    panelWidth: frameBox.w,
    toolStatus: tool?.state?.status,
  })

  // 8. Hide -> generation retired, streams closed; show -> new generation, draft restored.
  await openSession(C)
  const fC2 = await frameFor(C)
  await type(fC2, "unsent-draft-CHARLIE")
  await sleep(1500) // draft persistence is debounced by the page
  const cBefore = (await state()).panels.find((p) => p.sessionId === C)
  // A new session opens in the active group (C's) and hides C: its document is destroyed.
  await command(page, "oco: New Session")
  await sleep(4000)
  const cHidden = (await state()).panels.find((p) => p.sessionId === C)
  await openSession(C)
  const fC3 = await frameFor(C)
  await ready(fC3)
  const cShown = (await state()).panels.find((p) => p.sessionId === C)
  const cDraft = await composer(fC3)
  run.record("hide-retires-generation", !cHidden.visible && cHidden.generation === 0 && cHidden.inflight === 0 && cShown.generation > cBefore.generation && cDraft.includes("unsent-draft-CHARLIE") ? "PASS" : "FAIL", {
    hidden: { visible: cHidden.visible, generation: cHidden.generation, inflight: cHidden.inflight, retired: cHidden.core.retired },
    generationBefore: cBefore.generation,
    generationAfterShow: cShown.generation,
    draftRestored: cDraft.includes("unsent-draft-CHARLIE"),
  })

  // 9. Reload Window: new activation, visible panels restored by the serializer (no open command),
  //    unsent drafts of all three sessions intact.
  const fB2 = await frameFor(B)
  await type(fB2, "unsent-draft-BRAVO")
  const bComposerBefore = await composer(fB2)
  const fA7 = await frameFor(A)
  await type(fA7, "unsent-draft-ALPHA")
  await sleep(2000)
  const pre = await state()
  const tabsBefore = await tabLabels()
  await command(page, "Developer: Reload Window")
  // The old window's host state keeps its activation id until the new extension host starts.
  await waitUntil(async () => (await state().catch(() => null))?.activationId !== pre.activationId, 30000, 300)
  await page.waitForSelector(".monaco-workbench", { timeout: 60000 })
  let post
  const tR = Date.now()
  while (Date.now() - tR < 60000) {
    post = await state().catch(() => null)
    if (post && post.activationId !== pre.activationId && post.panels.filter((p) => p.visible && p.ready).length >= 3) break
    await sleep(300)
  }
  const restoredVisible = post.panels.filter((p) => p.visible && p.ready).map((p) => p.sessionId)
  const tabsAfter = await tabLabels()
  const drafts = {}
  for (const [sid, tag] of [[A, "ALPHA"], [B, "BRAVO"], [C, "CHARLIE"]]) {
    if (!restoredVisible.includes(sid)) await openSession(sid)
    const text = await composer(await frameFor(sid))
    drafts[tag] = text.includes(`unsent-draft-${tag}`)
    if (!drafts[tag]) drafts[`${tag}_after`] = text.slice(0, 80)
  }
  drafts.BRAVO_before = bComposerBefore.slice(0, 80)
  await runShot(page, run, "9-after-reload")
  run.record("reload-auto-restore", post.activationId !== pre.activationId && restoredVisible.length >= 3 && JSON.stringify(tabsAfter) === JSON.stringify(tabsBefore) && Object.values(drafts).every(Boolean) ? "PASS" : "FAIL", {
    newActivation: post.activationId !== pre.activationId,
    autoRestoredVisible: restoredVisible.length,
    editorTabsBefore: tabsBefore.length,
    editorTabsSame: JSON.stringify(tabsAfter) === JSON.stringify(tabsBefore),
    hostPanelsBefore: pre.panels.length,
    hostPanelsAfterLazyRevive: post.panels.length,
    drafts,
  })

  // 10. Close one specific tab while its session runs: that tab only; the run continues.
  const fB3 = await frameFor(B)
  await fB3.locator('[data-component="prompt-input"]').click()
  await page.keyboard.press("Meta+a")
  await page.keyboard.press("Backspace")
  const bUsersBefore = (await messages(B)).filter((m) => m.info.role === "user").length
  await type(fB3, "Write 150 numbered sentences about rivers. No tools.", true)
  const tb = Date.now()
  while (Date.now() - tb < 30000 && (await status(B)) !== "busy") await sleep(200)
  const bBusyBefore = (await status(B)) === "busy"
  const bTitle = (await state()).panels.find((p) => p.sessionId === B)?.title
  const labelsBefore = await tabLabels()
  // Close exactly B's tab with its own close button (the palette would act on whatever is active).
  const bTab = page.locator(".tabs-container .tab", { hasText: bTitle ?? "TAG-BRAVO" }).first()
  await bTab.hover()
  await bTab.locator(".tab-actions .action-label").first().click()
  await sleep(1500)
  const labelsAfter = await tabLabels()
  st = await state()
  const bGone = !st.panels.some((p) => p.sessionId === B)
  const onlyThatTab = labelsAfter.length === labelsBefore.length - 1 && !labelsAfter.some((l) => bTitle && l.startsWith(bTitle + ","))
  const stillBusy = (await status(B)) === "busy"
  const lastBNow = (await messages(B)).filter((m) => m.info.role === "assistant").at(-1)
  await waitIdle(B)
  const bMsgs = await messages(B)
  const lastB = bMsgs.filter((m) => m.info.role === "assistant").at(-1)
  run.record("close-specific-tab", bBusyBefore && bGone && onlyThatTab && stillBusy && !lastB?.info?.error && bMsgs.filter((m) => m.info.role === "user").length === bUsersBefore + 1 ? "PASS" : "FAIL", {
    busyBeforeClose: bBusyBefore,
    closedPanelGone: bGone,
    exactlyThatTabClosed: onlyThatTab,
    busyAfterClose: stillBusy,
    finish: lastB?.info?.finish ?? null,
    lastAssistantAtClose: { id: lastBNow?.info?.id, completed: !!lastBNow?.info?.time?.completed, error: lastBNow?.info?.error?.name ?? null },
    bTitle,
    labelsBefore,
    labelsAfter,
  })

  // 11. Image bytes (synthetic ClipboardEvent with real PNG bytes; the system clipboard is not tested).
  await openSession(A)
  const fA8 = await frameFor(A)
  await fA8.locator('[data-component="prompt-input"]').click()
  await page.keyboard.press("Meta+a")
  await page.keyboard.press("Backspace")
  await fA8.evaluate((b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
    const dt = new DataTransfer()
    dt.items.add(new File([bytes], "oco-test.png", { type: "image/png" }))
    document.querySelector('[data-component="prompt-input"]').dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }))
  }, png.toString("base64"))
  await sleep(1200) // attachment is read asynchronously by the composer
  const usersBeforeImage = (await messages(A)).filter((m) => m.info.role === "user").length
  await type(fA8, "What is in this image? One sentence.", true)
  await waitUntil(async () => (await messages(A)).filter((m) => m.info.role === "user").length > usersBeforeImage, 15000, 200)
  const u = (await messages(A)).filter((m) => m.info.role === "user").at(-1)
  const img = (u?.parts ?? []).find((p) => p.type === "file" && String(p.mime).startsWith("image/"))
  const got = img?.url?.startsWith("data:") ? Buffer.from(img.url.split(",")[1], "base64") : null
  run.record("image-bytes", got && got.equals(png) ? "PASS" : "FAIL", { bytesSent: png.length, bytesReceived: got?.length ?? null, identical: !!got && got.equals(png), method: "synthetic ClipboardEvent" })
  await waitIdle(A, 60000)
  run.setEnv({ finalHostState: (await state()).panels.map((p) => ({ s: p.sessionId, core: p.core, policy: p.policy, panel: p.panel })) })
} catch (e) {
  run.record("run", "FAIL", { error: String(e?.message ?? e).slice(0, 500) })
  await runShot(page, run, "error")
} finally {
  run.record("csp-violations", csp.length === 0 ? "PASS" : "FAIL", { count: csp.length, sample: csp.slice(0, 3) })
  await app.close().catch(() => {})
  process.exit(run.finish())
}
