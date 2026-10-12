// C1 focus after opening a file from the chat (panels.ts settleWebviewFocus). VS Code reports webview focus by a
// 250 ms poll, so a click that focuses the chat webview and opens a file can be reported after the file opened
// and re-activate the chat over it. Cases:
//   open-stays-on-file   repeated real clicks on a read tool's file name, alternating "chat input focused" and
//                        "chat group active but keyboard focus in the sidebar" (the racy state). After each click
//                        the file's group is active and stays so; no late chat activation is counted by the host.
//   return-via-tab       file opened by a click, then within ~300 ms the user clicks the chat tab: the chat stays
//                        active (nothing pulls the file back).
//   return-via-webview   same, but the user clicks into the chat input: the chat stays active.
// The verdict reads the workbench DOM and the host's counters; it never refocuses anything itself.
// Works with the real or the scripted model (OCO_E2E_MODEL=mock); the run records which one was used.
import { fileURLToPath } from "node:url"
import { createRun } from "./lib/results.mjs"
import { launch, command, chatFrames, frameSession, sleep, runShot, hostState, createAndOpenSession } from "./vscode.mjs"
import { waitReply } from "./server.mjs"

const CASES = ["open-stays-on-file", "return-via-tab", "return-via-webview"]
const N = Number(process.env.OCO_FOCUS_REPEAT ?? 20)
const run = createRun({ suite: "c1-focus", required: CASES, scriptPath: fileURLToPath(import.meta.url) })
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

/** Which editor group is active, and its active tab. Group 0 holds the chat panel. */
const groups = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll(".editor-group-container")].map((g) => ({
      active: g.classList.contains("active"),
      tab: g.querySelector(".tab.active .label-name")?.textContent ?? null,
    })),
  )
const activeTab = async (page) => (await groups(page)).find((g) => g.active)?.tab ?? null
const isFile = (t) => /^math(\.ts)?$/.test(t ?? "")

try {
  const l = await launch({ profile: "c1-focus", run })
  app = l.app
  const page = l.page
  const stats = async (sid) => (await hostState(page, l.stateFile)).panels.find((p) => p.sessionId === sid)

  await createAndOpenSession(page)
  const { f, sid } = await waitFor(async () => {
    for (const x of await chatFrames(page)) if (await x.$(INPUT).catch(() => null)) return { f: x, sid: await frameSession(x) }
    return null
  }, 60000)
  await waitFor(async () => ((await f.evaluate(() => document.documentElement.dataset.ocoModel)) === "ready" ? true : null), 60000, 200)
  await f.locator(INPUT).click()
  await page.keyboard.type("Use the read tool on math.ts with offset 2 and limit 2. Then reply only with OK.", { delay: 2 })
  await page.keyboard.press("Enter")
  await waitReply(sid, 150000)
  // Read tools may be grouped into a collapsed "context" group; expand it until the file name shows.
  const link = f.locator('[data-oco-open-file], [data-slot="basic-tool-tool-subtitle"].clickable').first()
  const shown = await waitFor(async () => {
    if (await link.isVisible()) return true
    const group = f.locator('[data-component="context-tool-group-trigger"]').first()
    if (await group.count()) await group.click()
    await sleep(500)
    return (await link.isVisible()) || null
  }, 20000, 200)
  if (!shown) {
    await runShot(page, run, "no-link")
    throw new Error("read tool file name not shown")
  }
  const chatTab = page.locator(".editor-group-container").first().locator(".tab").first()

  /** Make the chat group active; with `sidebar`, move keyboard focus to the Explorer so the webview is unfocused. */
  async function prepare(sidebar) {
    await chatTab.click()
    await sleep(300)
    if (sidebar) await command(page, "View: Show Explorer").catch(() => {})
    else await f.locator(INPUT).click()
    await sleep(600) // longer than VS Code's focus poll, so the starting state has been reported
  }

  // 1. Repeated opens.
  try {
    const before = (await stats(sid)).panel
    const rows = []
    for (let i = 0; i < N; i++) {
      const sidebar = i % 2 === 1
      await prepare(sidebar)
      await link.click()
      const opened = await waitFor(async () => (isFile(await activeTab(page)) ? true : null), 5000, 50)
      await sleep(1000) // a late did-focus would land within ~300 ms of the click
      const end = await activeTab(page)
      rows.push({ i, sidebar, opened: !!opened, endTab: end, ok: !!opened && isFile(end) })
    }
    const after = await stats(sid)
    const d = (k) => after.panel[k] - before[k]
    const failed = rows.filter((r) => !r.ok)
    await runShot(page, run, "open-stays-on-file")
    run.record("open-stays-on-file", failed.length === 0 && d("fileOpens") === N && d("lateActivations") === 0 ? "PASS" : "FAIL", {
      repeats: N,
      failed,
      fileOpens: d("fileOpens"),
      focusWaits: d("focusWaits"),
      lateActivations: d("lateActivations"),
      lastTrace: after.focusTrace,
    })
  } catch (e) {
    run.record("open-stays-on-file", "FAIL", { error: String(e?.message ?? e).slice(0, 400) })
  }

  // 2/3. Deliberate return to the chat right after an open.
  for (const [name, back] of [
    ["return-via-tab", () => chatTab.click()],
    ["return-via-webview", () => f.locator(INPUT).click()],
  ]) {
    try {
      const rows = []
      for (let i = 0; i < 3; i++) {
        await prepare(i % 2 === 1)
        await link.click()
        const opened = await waitFor(async () => (isFile(await activeTab(page)) ? true : null), 5000, 50)
        await sleep(300)
        await back()
        await sleep(1200)
        const g = await groups(page)
        rows.push({ i, opened: !!opened, chatActive: !!g[0]?.active, active: g.find((x) => x.active)?.tab })
      }
      await runShot(page, run, name)
      const p = await stats(sid)
      run.record(name, rows.every((r) => r.opened && r.chatActive) ? "PASS" : "FAIL", { rows, lastTrace: p.focusTrace })
    } catch (e) {
      run.record(name, "FAIL", { error: String(e?.message ?? e).slice(0, 400) })
    }
  }
} catch (e) {
  run.record("run", "FAIL", { error: String(e?.message ?? e).slice(0, 400) })
} finally {
  await app?.close().catch(() => {})
  process.exit(run.finish())
}
