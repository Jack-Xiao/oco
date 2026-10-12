#!/usr/bin/env node
// E2E c12-new-session-draft: "New" opens OpenCode's own new-session page (a draft) instead of creating a server
// session. The session exists only once the first message is sent (optionally in a fresh git worktree), and the
// panel then turns into that session in place, with no document reload. Real VS Code + test server (mock LLM).
//   draft-page-ui          the page shows the project selector with the workspace folder only, no "open project"
//   draft-no-session       opening the page creates nothing on the server
//   draft-close-discards   closing the page leaves the server session count unchanged and no panel behind
//   send-creates-session   the first message creates exactly one session, in the workspace folder
//   send-reply-shown       the mock model's reply appears in the panel
//   send-promote-in-place  the panel is now bound to that session; same document (marker, generation, switchReloads)
//   send-sidebar           the sidebar session list shows the session
//   draft-worktree-toggle  one "New worktree" checkbox (unchecked by default), no old "where to run" menu, branch name shown
//   worktree-session       ticking "New worktree" + send creates a session whose directory is a worktree, not the folder
//   worktree-reply-fast    the reply arrives well inside the 5 minute worktree wait (limit 60 s)
//   worktree-in-place      same as send-promote-in-place for the worktree case
//   worktree-sidebar       the sidebar lists the worktree session
//   reload-drops-draft     Reload Window restores a pinned session panel but not the draft page
import fs from "node:fs"
import path from "node:path"
import { execFileSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { createRun } from "./lib/results.mjs"
import { launch, command, waitUntil, chatFrames, frameSession, sleep, runShot, hostState, root } from "./vscode.mjs"
import { MODEL } from "./server.mjs"
import { sessionsFrame } from "./lib/sessions-web.mjs"

const REQUIRED = [
  "draft-page-ui",
  "draft-worktree-toggle",
  "draft-no-session",
  "draft-close-discards",
  "send-creates-session",
  "send-reply-shown",
  "send-promote-in-place",
  "send-sidebar",
  "worktree-session",
  "worktree-reply-fast",
  "worktree-in-place",
  "worktree-sidebar",
  "reload-drops-draft",
]
const run = createRun({ suite: "c12-new-session-draft", required: REQUIRED, scriptPath: fileURLToPath(import.meta.url) })
const errMsg = (e) => String(e?.message ?? e).slice(0, 400)

// --- server access for the fixture project (the shared helper in server.mjs pins another directory) ---
const base = process.env.OCO_TEST_URL ?? "http://127.0.0.1:4517"
const auth = "Basic " + Buffer.from("opencode:" + fs.readFileSync(path.join(root, ".oco-test/secret"), "utf8").trim()).toString("base64")
const testRoot = fs.realpathSync(path.join(root, ".oco-test"))
const rand = Math.random().toString(36).slice(2, 7)
const wsDir = path.join(testRoot, "c12", `ws-${rand}`)
fs.mkdirSync(wsDir, { recursive: true })
const git = (...args) => execFileSync("git", ["-c", "user.email=test@oco.local", "-c", "user.name=oco-test", ...args], { cwd: wsDir, stdio: "pipe" })
git("init", "-q")
fs.writeFileSync(path.join(wsDir, "README.md"), `c12 fixture ${rand} ${Date.now()}\n`)
git("add", "-A")
git("commit", "-qm", "init")
const wsName = path.basename(wsDir)
const worktreeRoot = path.join(testRoot, "xdg/data/opencode/worktree")

async function sapi(method, p, body, dir = wsDir) {
  const r = await fetch(base + p, { method, headers: { authorization: auth, "content-type": "application/json", "x-opencode-directory": encodeURIComponent(dir) }, body: body ? JSON.stringify(body) : undefined })
  const t = await r.text()
  return t ? JSON.parse(t) : null
}
/** Every session of the fixture project, in any of its worktrees. */
const listSessions = async () => (await sapi("GET", `/session?directory=${encodeURIComponent(wsDir)}&scope=project`)) ?? []
const messagesOf = (sid, dir) => sapi("GET", `/session/${sid}/message`, undefined, dir)

const health = await sapi("GET", "/global/health").catch(() => null)
run.setEnv({ serverVersion: health?.version ?? null, modelMode: MODEL.mode, fixtureWorkspace: wsDir })

const { app, page, stateFile } = await launch({ profile: "c12-new-session-draft", run, workspace: wsDir })
run.installCrashHandlers(() => app.close())
const state = () => hostState(page, stateFile)
const isDraftId = (id) => typeof id === "string" && id.startsWith("draft-")

/** The visible chat frame showing the new-session page, or null after `timeout`. */
async function draftFrame(timeout = 60000) {
  const end = Date.now() + timeout
  while (Date.now() < end) {
    for (const f of await chatFrames(page)) {
      const ok = await f
        .evaluate(() => document.visibilityState === "visible" && !!document.querySelector('[data-component="session-new-design"]') && !!document.querySelector('[data-component="prompt-input"]'))
        .catch(() => false)
      if (ok && isDraftId(await frameSession(f).catch(() => null))) return f
    }
    await sleep(100)
  }
  return null
}
/** The visible chat frame showing session `sid` with its composer. */
async function sessionFrame(sid, timeout = 60000) {
  const end = Date.now() + timeout
  while (Date.now() < end) {
    for (const f of await chatFrames(page)) {
      const ok = await f
        .evaluate((id) => window.__OCO_DEBUG__?.sessionId?.() === id && document.visibilityState === "visible" && !!document.querySelector('[data-component="prompt-input"]'), sid)
        .catch(() => false)
      if (ok) return f
    }
    await sleep(100)
  }
  return null
}
async function type(f, text, send = false) {
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
const modelReady = (f) => waitUntil(async () => (await f.evaluate(() => document.documentElement.dataset.ocoModel)) === "ready", 30000, 100)
async function closeAll() {
  await command(page, "View: Close All Editors")
  await waitUntil(async () => (await state()).panels.length === 0, 15000, 300)
}
/** Wait for exactly one session beyond `known`; returns it. */
async function newSessionSince(known, timeout = 30000) {
  const ids = new Set(known.map((s) => s.id))
  return waitUntil(async () => (await listSessions()).filter((s) => !ids.has(s.id))[0], timeout, 300)
}
const sidebarHas = async (sid) => {
  const frame = await sessionsFrame(page)
  if (!frame) return false
  return (await frame.locator(`.row[data-kind="session"][data-id="${sid}"]`).count()) > 0
}
const sidebarShows = async (sid) => {
  await command(page, "Focus on Sessions View")
  return !!(await waitUntil(() => sidebarHas(sid), 20000, 300))
}
const panelOf = (st, sid) => st.panels.find((p) => p.sessionId === sid)

/** Shared checks for a draft that became a session: bound to it, and the document never reloaded. */
function promoteFacts(st, sid, dir, before, marker) {
  const p = panelOf(st, sid)
  return {
    panels: st.panels.length,
    bound: !!p,
    boundDirectory: p?.directory === dir,
    stillDraft: st.panels.some((x) => isDraftId(x.sessionId)),
    sameGeneration: p?.generation === before.generation,
    switchReloads: (p?.panel.switchReloads ?? -1) - before.switchReloads,
    markerKept: marker,
  }
}
const promoteOk = (f) => f.panels === 1 && f.bound && f.boundDirectory && !f.stillDraft && f.sameGeneration && f.switchReloads === 0 && f.markerKept === true

/** Opens a draft page and returns its frame, host-state snapshot and an in-document marker (lost on reload). */
async function openDraft() {
  await command(page, "oco: New Session")
  const f = await draftFrame()
  if (!f) throw new Error("new-session page did not appear")
  await modelReady(f)
  const marker = `c12-${Math.random().toString(36).slice(2, 8)}`
  await f.evaluate((m) => (window.__c12Marker = m), marker)
  const st = await state()
  const dp = st.panels.find((p) => isDraftId(p.sessionId))
  return { f, marker, st, dp, before: { generation: dp?.generation, switchReloads: dp?.panel.switchReloads ?? 0 } }
}
const markerKept = (f, marker) => f.evaluate((m) => window.__c12Marker === m, marker).catch(() => false)
const bodyText = (f) => f.evaluate(() => document.body.innerText).catch(() => "")

try {
  const sessions0 = await listSessions()
  await closeAll()

  // ---- A. the draft page ----
  const A = await openDraft()
  await runShot(page, run, "1-draft-page")
  try {
    const trigger = A.f.locator('[data-action="prompt-project"]').first()
    await trigger.waitFor({ state: "visible", timeout: 20000 })
    const triggerText = (await trigger.innerText()).trim()
    await trigger.click()
    await sleep(700)
    const menu = await A.f.evaluate(() => {
      const el = [...document.querySelectorAll('[data-slot="dropdown-menu-content"], [role="menu"]')].at(-1)
      return el ? el.innerText : null
    })
    await runShot(page, run, "1b-project-menu")
    await page.keyboard.press("Escape")
    const body = await bodyText(A.f)
    const addEntry = /open project|add project|new project|打开项目|添加项目/i.test(menu ?? "") || (await A.f.locator("text=/open project|add project/i").count()) > 0
    // The avatar letter is a separate line; project names are the longer lines.
    const items = (menu ?? "").split("\n").map((s) => s.trim()).filter((s) => s.length > 1)
    // Control: the server knows other projects (the shared test workspace); the menu must list none of them.
    const others = ((await sapi("GET", "/project")) ?? []).map((p) => path.basename(p.worktree)).filter((n) => n && n !== wsName && n !== "/")
    const leaked = others.filter((n) => items.includes(n))
    run.record(
      "draft-page-ui",
      isDraftId(A.dp?.sessionId) && A.dp?.ready === true && menu !== null && triggerText.includes(wsName) && items.includes(wsName) && items.length === 1 && others.length > 0 && leaked.length === 0 && !addEntry && !/^\s*$/.test(body)
        ? "PASS"
        : "FAIL",
      { draftPanel: isDraftId(A.dp?.sessionId), ready: A.dp?.ready, triggerText, menuItems: items.slice(0, 8), otherKnownProjects: others.length, leaked, addEntry },
    )
  } catch (e) {
    run.record("draft-page-ui", "FAIL", { error: errMsg(e) })
  }
  try {
    // Embedded page: a single "New worktree" checkbox (patch 0023), default off; the old Local / New workspace menu is gone.
    const label = A.f.locator('label[data-action="oco-new-worktree"]').first()
    await label.waitFor({ state: "visible", timeout: 20000 })
    const box = label.locator('input[type="checkbox"]')
    const labelText = (await label.innerText()).trim()
    const checked = await box.isChecked()
    const barButtons = (await A.f.locator('[data-component="session-new-design"] button').allInnerTexts()).map((s) => s.trim()).filter(Boolean)
    const oldMenu = barButtons.filter((t) => /^(Local|New workspace)$/i.test(t) || /运行会话的位置|Run (session|in)/i.test(t))
    const oldMenuMenu = await A.f.locator('[role="menuitem"]', { hasText: /New workspace|Local/ }).count()
    const branch = git("rev-parse", "--abbrev-ref", "HEAD").toString().trim()
    const branchVisible = (await bodyText(A.f)).split("\n").some((l) => l.trim() === branch)
    run.record(
      "draft-worktree-toggle",
      (await box.count()) === 1 && /^(New worktree|新建 worktree)$/.test(labelText) && checked === false && oldMenu.length === 0 && oldMenuMenu === 0 && branch && branchVisible ? "PASS" : "FAIL",
      { labelText, checked, checkboxes: await box.count(), oldMenuButtons: oldMenu, oldMenuItems: oldMenuMenu, branch, branchVisible, bar: barButtons.slice(0, 6) },
    )
  } catch (e) {
    run.record("draft-worktree-toggle", "FAIL", { error: errMsg(e) })
  }
  await sleep(2500) // a stray server-side create would land by now
  const afterOpen = await listSessions()
  run.record("draft-no-session", afterOpen.length === sessions0.length ? "PASS" : "FAIL", { before: sessions0.length, afterOpen: afterOpen.length })

  await closeAll()
  await sleep(1500)
  const afterClose = await listSessions()
  const stClosed = await state()
  run.record("draft-close-discards", afterClose.length === sessions0.length && stClosed.panels.length === 0 ? "PASS" : "FAIL", {
    before: sessions0.length,
    afterClose: afterClose.length,
    panels: stClosed.panels.length,
  })

  // ---- B. first message creates the session in the workspace folder ----
  try {
    const known = await listSessions()
    const B = await openDraft()
    const prompt = `Reply with exactly this line and nothing else: C12-B-${rand}`
    await type(B.f, prompt, true)
    const created = await newSessionSince(known)
    const after = await listSessions()
    run.record(
      "send-creates-session",
      created && after.length === known.length + 1 && created.directory === wsDir ? "PASS" : "FAIL",
      { delta: after.length - known.length, directory: created?.directory === wsDir ? "workspace" : created?.directory },
    )
    if (!created) throw new Error("no session created")
    const f = await sessionFrame(created.id)
    const replied = await waitUntil(async () => (await bodyText(f ?? B.f)).includes(`C12-B-${rand}`) && (await messagesOf(created.id, created.directory)).some((m) => m.info.role === "assistant" && m.info.time?.completed), 60000, 400)
    const userSaw = (await messagesOf(created.id, created.directory)).filter((m) => m.info.role === "user").flatMap((m) => m.parts).some((p) => p.type === "text" && p.text.includes(`C12-B-${rand}`))
    // The user message echoes the marker too; require the assistant reply row text via the stored message instead.
    const assistantText = (await messagesOf(created.id, created.directory)).filter((m) => m.info.role === "assistant").flatMap((m) => m.parts).filter((p) => p.type === "text").map((p) => p.text).join("")
    run.record("send-reply-shown", replied && userSaw && assistantText.includes(`C12-B-${rand}`) && !!f ? "PASS" : "FAIL", { replied: !!replied, userSaw, assistantHasMarker: assistantText.includes(`C12-B-${rand}`), frameFound: !!f })
    const st = await state()
    const facts = promoteFacts(st, created.id, wsDir, B.before, f ? await markerKept(f, B.marker) : false)
    await runShot(page, run, "2-promoted")
    run.record("send-promote-in-place", promoteOk(facts) ? "PASS" : "FAIL", facts)
    run.record("send-sidebar", (await sidebarShows(created.id)) ? "PASS" : "FAIL", { sessionId: created.id })
  } catch (e) {
    for (const id of ["send-creates-session", "send-reply-shown", "send-promote-in-place", "send-sidebar"]) if (!run.results?.some?.((r) => r.id === id)) run.record(id, "FAIL", { error: errMsg(e) })
  }

  // ---- C. ticking "New worktree" creates a worktree for the session ----
  try {
    await closeAll()
    const known = await listSessions()
    const C = await openDraft()
    // The "New worktree" checkbox exists only for git folders and embedded pages (patch 0023).
    const label = C.f.locator('label[data-action="oco-new-worktree"]').first()
    await label.waitFor({ state: "visible", timeout: 20000 })
    const box = label.locator('input[type="checkbox"]')
    const checkedBefore = await box.isChecked()
    await label.click()
    await sleep(500)
    const checkedAfter = await box.isChecked()
    const triggerAfter = (await C.f.locator('[data-component="session-new-design"] button').allInnerTexts()).map((s) => s.trim()).filter(Boolean)
    await runShot(page, run, "3-worktree-checked")
    if (checkedBefore || !checkedAfter) throw new Error(`checkbox state before=${checkedBefore} after=${checkedAfter}`)
    const prompt = `Reply with exactly this line and nothing else: C12-C-${rand}`
    const t0 = Date.now()
    await type(C.f, prompt, true)
    const created = await newSessionSince(known, 90000)
    const tCreated = Date.now() - t0
    const realDir = created ? (fs.existsSync(created.directory) ? fs.realpathSync(created.directory) : created.directory) : undefined
    run.record(
      "worktree-session",
      created && realDir !== wsDir && realDir.startsWith(worktreeRoot + path.sep) && fs.existsSync(path.join(realDir, ".git")) ? "PASS" : "FAIL",
      { directory: realDir, underWorktreeRoot: !!realDir?.startsWith(worktreeRoot + path.sep), isWorkspace: realDir === wsDir, createdMs: tCreated, checkedBefore, checkedAfter, barAfterTick: triggerAfter.slice(0, 6) },
    )
    if (!created) throw new Error("no worktree session created")
    const f = await sessionFrame(created.id, 60000)
    const got = await waitUntil(async () => {
      const m = await messagesOf(created.id, created.directory)
      return m.filter((x) => x.info.role === "assistant").flatMap((x) => x.parts).filter((p) => p.type === "text").some((p) => p.text.includes(`C12-C-${rand}`))
    }, 60000, 400)
    const replyMs = Date.now() - t0
    const shown = f ? await waitUntil(async () => (await bodyText(f)).split(`C12-C-${rand}`).length > 2, 20000, 300) : false // user + assistant rows
    run.record("worktree-reply-fast", got && replyMs < 60000 && shown ? "PASS" : "FAIL", { replyMs, replyStored: !!got, replyShown: !!shown })
    const st = await state()
    const facts = promoteFacts(st, created.id, created.directory, C.before, f ? await markerKept(f, C.marker) : false)
    await runShot(page, run, "4-worktree-promoted")
    run.record("worktree-in-place", promoteOk(facts) ? "PASS" : "FAIL", facts)
    run.record("worktree-sidebar", (await sidebarShows(created.id)) ? "PASS" : "FAIL", { sessionId: created.id })
  } catch (e) {
    for (const id of ["worktree-session", "worktree-reply-fast", "worktree-in-place", "worktree-sidebar"]) if (!run.results?.some?.((r) => r.id === id)) run.record(id, "FAIL", { error: errMsg(e) })
  }

  // ---- D. Reload Window does not bring a draft page back ----
  try {
    await closeAll()
    // The first panel of a window is the main panel and "New" reuses it; the pinned one must be a second panel.
    const mainSession = await sapi("POST", "/session", { title: `c12 main ${rand}` })
    const keep = await sapi("POST", "/session", { title: `c12 pinned ${rand}` })
    await command(page, "oco: Open Session", { input: mainSession.id })
    await waitUntil(async () => (await state()).panels.some((p) => p.sessionId === mainSession.id && p.ready), 30000, 300)
    await command(page, "oco: Open in New Panel", { input: keep.id })
    const pinnedUp = await waitUntil(async () => (await state()).panels.some((p) => p.sessionId === keep.id && p.ready && p.role === "pinned"), 30000, 300)
    if (!pinnedUp) await runShot(page, run, "5a-pinned-missing")
    await command(page, "oco: New Session")
    const df = await draftFrame()
    const pre = await state()
    const preFacts = { draftPanels: pre.panels.filter((p) => isDraftId(p.sessionId)).length, pinned: pre.panels.some((p) => p.sessionId === keep.id), draftFrame: !!df }
    await command(page, "Developer: Reload Window")
    await waitUntil(async () => (await state().catch(() => null))?.activationId !== pre.activationId, 30000, 300)
    await page.waitForSelector(".monaco-workbench", { timeout: 60000 })
    let post
    await waitUntil(async () => {
      post = await state().catch(() => null)
      return post && post.activationId !== pre.activationId && post.panels.some((p) => p.sessionId === keep.id && p.ready)
    }, 60000, 300)
    await sleep(4000) // a restored draft would be rebuilt by now
    post = await state()
    const draftFramesAfter = (await Promise.all((await chatFrames(page)).map((f) => f.evaluate(() => !!document.querySelector('[data-component="session-new-design"]')).catch(() => false)))).filter(Boolean).length
    await runShot(page, run, "5-after-reload")
    run.record(
      "reload-drops-draft",
      preFacts.draftPanels === 1 && preFacts.pinned && preFacts.draftFrame && post && post.panels.length === 1 && post.panels[0].sessionId === keep.id && draftFramesAfter === 0 ? "PASS" : "FAIL",
      { ...preFacts, pinnedUp: !!pinnedUp, postPanels: post?.panels.map((p) => (isDraftId(p.sessionId) ? "draft" : p.sessionId === keep.id ? "pinned" : "other")), draftFramesAfter },
    )
  } catch (e) {
    run.record("reload-drops-draft", "FAIL", { error: errMsg(e) })
  }
} catch (e) {
  run.record("run", "FAIL", { error: errMsg(e) })
  await runShot(page, run, "error")
} finally {
  await app.close().catch(() => {})
  // Fixture cleanup: remove worktrees the sessions created, then the fixture repo.
  try {
    for (const w of (await sapi("GET", "/experimental/worktree").catch(() => [])) ?? []) {
      await sapi("DELETE", "/experimental/worktree", { directory: w }).catch(() => {})
    }
  } catch {}
  process.exit(run.finish())
}
