#!/usr/bin/env node
// E2E c21-follow (M08): with Follow on, a file the agent edits opens as a PREVIEW editor and keyboard focus stays in the chat panel.
// Mock model: "Use the write tool to create the file X containing the single line Y." Cases:
//   follow-on      "oco: Toggle Follow Mode" enables Follow for the open session (status bar item "Follow" appears)
//   preview-open   after the agent writes the file, an editor tab for it exists and is a preview tab (.tab.preview), in another group
//   focus-stays    from sending the prompt until the file tab shows, no sample has keyboard focus outside the chat group, and
//                  afterwards typed keys land in the chat input (the file is not dirty)
import { fileURLToPath } from "node:url"
import { createRun } from "./lib/results.mjs"
import { launch, command, chatFrames, frameSession, sleep, runShot, createAndOpenSession, waitUntil } from "./vscode.mjs"
import { waitReply, MODEL } from "./server.mjs"

const CASES = ["follow-on", "preview-open", "focus-stays"]
const run = createRun({ suite: "c21-follow", required: CASES, scriptPath: fileURLToPath(import.meta.url) })
const INPUT = '[data-component="prompt-input"]'
const NOTE = `c21-follow-${Math.random().toString(36).slice(2, 7)}.txt`
let app = null
run.installCrashHandlers(() => app?.close())
const errMsg = (e) => String(e?.message ?? e).slice(0, 400)

const domState = (page, name) =>
  page.evaluate((name) => {
    const groups = [...document.querySelectorAll(".editor-group-container")].map((g) => ({
      active: g.classList.contains("active"),
      hasFocus: g.classList.contains("active"), // the active group: a webview keeps focus in its iframe, so DOM focus cannot tell
      tabs: [...g.querySelectorAll(".tab")].map((t) => ({ label: t.querySelector(".label-name")?.textContent ?? "", preview: t.classList.contains("preview") || t.classList.contains("tab-preview") || getComputedStyle(t.querySelector(".label-name") ?? t).fontStyle === "italic", dirty: t.classList.contains("dirty"), active: t.classList.contains("active") })),
    }))
    const fileGroup = groups.findIndex((g) => g.tabs.some((t) => t.label.startsWith(name.replace(/\.txt$/, ""))))
    const follow = [...document.querySelectorAll("#workbench\\.parts\\.statusbar .statusbar-item")].some((e) => /Follow/.test(e.textContent ?? ""))
    return { groups, fileGroup, follow }
  }, name)

try {
  if (MODEL.mode !== "mock") {
    for (const id of CASES) run.record(id, "NOT RUN", { reason: "needs the scripted mock model (OCO_E2E_MODEL=mock)" })
    throw new Error("not a mock server")
  }
  const l = await launch({ profile: "c21-follow", run })
  app = l.app
  const page = l.page
  await createAndOpenSession(page).catch(async (e) => {
    await runShot(page, run, "open-failed")
    throw e
  })
  const p = await waitUntil(async () => {
    for (const f of await chatFrames(page)) {
      const sid = await frameSession(f).catch(() => null)
      if (sid && (await f.$(INPUT).catch(() => null))) return { f, sid }
    }
    return null
  }, 60000, 100)
  if (!p) throw new Error("no chat panel")
  await waitUntil(async () => ((await p.f.evaluate(() => document.documentElement.dataset.ocoModel)) === "ready" ? true : null), 60000, 200)

  // ---- 1. follow-on
  try {
    await p.f.locator(INPUT).click()
    await command(page, "oco: Toggle Follow Mode")
    const st = await waitUntil(async () => {
      const s = await domState(page, NOTE)
      return s.follow ? s : null
    }, 8000, 150)
    run.record("follow-on", st ? "PASS" : "FAIL", { statusBarFollow: !!st })
  } catch (e) {
    run.record("follow-on", "FAIL", { error: errMsg(e) })
  }

  // ---- 2/3. send the write prompt, sample focus until the file tab shows
  const samples = []
  try {
    await p.f.locator(INPUT).click()
    await sleep(500)
    const chatGroup = (await domState(page, NOTE)).groups.findIndex((g) => g.hasFocus)
    await page.keyboard.type(`Use the write tool to create the file ${NOTE} containing the single line hello. Then reply only with OK.`, { delay: 2 })
    await page.keyboard.press("Enter")
    const dock = p.f.locator('[data-component="dock-prompt"][data-kind="permission"]')
    let allowed = false
    let st = null
    const end = Date.now() + 120000
    while (Date.now() < end && !st) {
      if (!allowed && (await dock.count().catch(() => 0)) > 0) {
        await dock.getByRole("button", { name: /allow once|允许一次/i }).click().catch(() => {})
        allowed = true
      }
      const s = await domState(page, NOTE)
      samples.push({ ms: end - Date.now(), chatHasFocus: s.groups[chatGroup]?.hasFocus ?? null, active: s.groups.findIndex((g) => g.active), fileGroup: s.fileGroup })
      if (s.fileGroup >= 0) st = s
      else await sleep(80)
    }
    await waitReply(p.sid, 60000).catch(() => null)
    await sleep(1200) // a late focus steal would land after the editor opens
    const fin = await domState(page, NOTE)
    await runShot(page, run, "follow-opened")
    const tab = fin.groups[fin.fileGroup]?.tabs.find((t) => t.label.startsWith(NOTE.replace(/\.txt$/, "")))
    run.record("preview-open", !!tab && tab.preview && fin.fileGroup !== chatGroup ? "PASS" : "FAIL", { allowed, tab, fileGroup: fin.fileGroup, chatGroup, groups: fin.groups })

    // Focus: every sample before and after the editor opened has focus in the chat group; typing still reaches the chat input.
    const stolen = samples.filter((s) => s.chatHasFocus === false)
    await page.keyboard.type("zz9", { delay: 20 })
    await sleep(300)
    const typed = await p.f.locator(INPUT).innerText().catch(() => "")
    const after = await domState(page, NOTE)
    const dirty = after.groups.flatMap((g) => g.tabs).some((t) => t.dirty)
    run.record("focus-stays", stolen.length === 0 && samples.length > 0 && !!after.groups[chatGroup]?.hasFocus && typed.includes("zz9") && !dirty ? "PASS" : "FAIL",
      { samples: samples.length, stolen: stolen.slice(0, 5), chatGroupFocusedAfter: after.groups[chatGroup]?.hasFocus, typedReachedChat: typed.includes("zz9"), anyDirty: dirty })
  } catch (e) {
    for (const id of ["preview-open", "focus-stays"]) if (!run.has?.(id)) run.record(id, "FAIL", { error: errMsg(e) })
    await runShot(page, run, "error")
  }
} catch (e) {
  if (!String(e?.message).includes("not a mock server")) run.record("run", "FAIL", { error: errMsg(e) })
} finally {
  if (app) await app.close().catch(() => {})
  process.exit(run.finish())
}
