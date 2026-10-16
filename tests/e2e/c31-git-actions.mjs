// E2E c31-git-actions (card 11, M21 Git actions v1, ADR-009 §4): the commit / pull request actions only draft a prompt.
// Real VS Code (built-in Git extension) + the isolated test server (mock model); the window opens .oco-test/workspace (a git repo).
//   no-session    "oco: Ask Agent to Commit Changes" with no session panel open only warns "Open a session in the main panel first"
//   commit-draft  with a main-panel session it drafts "Commit the current changes…", "Branch: <branch>" and the untracked file; nothing is sent
//   pr-draft      "oco: Ask Agent to Open a Pull Request" appends "Open a pull request…" with the "Branch:" line
//   open-scm      "oco: Open Source Control View" shows the Source Control sidebar
//   scm-button    (optional, not required) the SCM title-bar button "Commit with OpenCode" drafts the commit prompt again
import fs from "node:fs"
import path from "node:path"
import { execSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { createRun } from "./lib/results.mjs"
import { root, launch, command, clearNotifications, waitUntil, chatFrames, sleep, runShot, createAndOpenSession } from "./vscode.mjs"
import { api, MODEL } from "./server.mjs"

const REQUIRED = ["no-session", "commit-draft", "pr-draft", "open-scm"]
const run = createRun({ suite: "c31-git-actions", required: REQUIRED, scriptPath: fileURLToPath(import.meta.url) })
const errMsg = (e) => String(e?.message ?? e).slice(0, 400)
const flat = (s, n = 400) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n)
const occurrences = (text, needle) => text.split(needle).length - 1
const workspace = path.join(fs.realpathSync(path.join(root, ".oco-test")), "workspace")
const sh = (cmd) => execSync(cmd, { cwd: workspace, encoding: "utf8" }).trim()
const FILE = `c31-${Math.random().toString(36).slice(2, 8)}.txt`
const COMMIT = "Commit the current changes"
let app, page, sid, BR

const health = await api("GET", "/global/health").catch(() => null)
run.setEnv({ serverVersion: health?.version ?? null, modelMode: MODEL.mode, changedFile: FILE })

/** The chat frame that shows session `sid` with a composer. */
async function sessionFrame(timeout = 30000) {
  const end = Date.now() + timeout
  while (Date.now() < end) {
    for (const f of await chatFrames(page)) {
      const ok = await f.evaluate((id) => window.__OCO_DEBUG__?.sessionId?.() === id && !!document.querySelector('[data-component="prompt-input"]'), sid).catch(() => false)
      if (ok) return f
    }
    await sleep(150)
  }
  return null
}
const composer = async () => {
  const f = await sessionFrame(3000)
  return f ? (((await f.locator('[data-component="prompt-input"]').innerText().catch(() => "")) ?? "").replace(/\u00a0/g, " ")) : ""
}
const toasts = () => page.locator(".notifications-toasts .notification-toast").allInnerTexts().catch(() => [])
const userMessages = async () => ((await api("GET", `/session/${sid}/message`, undefined, workspace)) ?? []).filter((m) => m.info.role === "user").length
const sidebarTitle = async () =>
  (await page.locator(".part.sidebar .composite.title h2").first().innerText({ timeout: 1000 }).catch(() => "")) ||
  (await page.locator(".part.sidebar .composite.title").first().innerText({ timeout: 1000 }).catch(() => ""))
/** Record PASS / FAIL; a failure keeps one screenshot. */
async function check(id, ok, detail) {
  if (!ok) await runShot(page, run, `${id}-fail`)
  run.record(id, ok ? "PASS" : "FAIL", detail)
}
/** One case never takes the others down: an exception becomes that case's FAIL. */
async function step(id, fn) {
  try {
    await fn()
  } catch (e) {
    run.record(id, "FAIL", { error: errMsg(e) })
    await runShot(page, run, `${id}-error`)
  }
}

try {
  BR = sh("git rev-parse --abbrev-ref HEAD")
  fs.writeFileSync(path.join(workspace, FILE), `card 11 git actions e2e ${FILE}\n`) // an untracked change the prompts must list
  ;({ app, page } = await launch({ profile: "c31-git-actions", run }))
  run.installCrashHandlers(() => app.close())
  run.setEnv({ branch: BR })

  await step("no-session", async () => {
    await command(page, "oco: Ask Agent to Commit Changes")
    let seen = []
    const warned = await waitUntil(async () => ((seen = await toasts()), seen.some((t) => t.includes("Open a session in the main panel first"))), 10000, 250)
    await check("no-session", !!warned, { toasts: flat(seen.join(" | "), 300) })
    await clearNotifications(page)
  })

  await step("commit-draft", async () => {
    sid = await createAndOpenSession(page)
    const frame = await waitUntil(() => sessionFrame(2000), 60000, 200)
    await waitUntil(async () => (await frame.evaluate(() => document.documentElement.dataset.ocoModel).catch(() => null)) === "ready", 60000, 100)
    // Hint only (recorded, never a verdict): the built-in Git extension has opened the repository when the status bar shows its branch.
    const gitReady = await waitUntil(async () => ((await page.locator(".statusbar").innerText().catch(() => "")) ?? "").includes(BR), 20000, 500)
    await command(page, "oco: Ask Agent to Commit Changes")
    let text = ""
    const landed = await waitUntil(async () => ((text = await composer()), [COMMIT, `Branch: ${BR}`, FILE].every((w) => text.includes(w))), 20000, 300)
    await sleep(2000) // an automatic send would have landed by now
    const users = await userMessages()
    await check("commit-draft", !!landed && users === 0, {
      composer: flat(text), branch: BR, file: FILE, userMessages: users, branchLine: /^Branch:.*$/m.exec(text)?.[0] ?? null, gitReady: !!gitReady, gitStatus: sh("git status --short"),
    })
  })

  await step("pr-draft", async () => {
    await command(page, "oco: Ask Agent to Open a Pull Request")
    let text = ""
    const at = () => text.indexOf("Open a pull request")
    const landed = await waitUntil(async () => ((text = await composer()), at() >= 0 && text.slice(at()).includes(`Branch: ${BR}`)), 20000, 300)
    await check("pr-draft", !!landed, {
      composer: flat(text), prPart: at() >= 0 ? flat(text.slice(at()), 300) : null, commitTextKept: text.includes(COMMIT), branch: BR,
      joint: at() > 0 ? JSON.stringify(text.slice(Math.max(0, at() - 24), at() + 12)) : null, // the exact characters where the second draft was appended
    })
  })

  await step("open-scm", async () => {
    await command(page, "oco: Open Source Control View")
    let title = ""
    const shown = await waitUntil(async () => ((title = await sidebarTitle()), /source control|源代码管理/i.test(title)), 10000, 250)
    await check("open-scm", !!shown, { sidebarTitle: flat(title, 120) })
  })

  // Optional (not in REQUIRED): the "Commit with OpenCode" button of the SCM title bar.
  try {
    const btn = page.locator('.part.sidebar [aria-label*="Commit with OpenCode"]').first()
    // Pane-header actions only show while the header is hovered, so hover the sidebar title and each pane header in turn.
    const visible = await waitUntil(async () => {
      for (const sel of [".part.sidebar .composite.title", ".part.sidebar .pane-header"]) {
        for (const h of await page.locator(sel).all()) {
          await h.hover({ timeout: 1500 }).catch(() => {})
          if (await btn.isVisible().catch(() => false)) return true
        }
      }
      return false
    }, 10000, 500)
    const labelsOf = (sel) => page.locator(sel).evaluateAll((els) => els.map((e) => e.getAttribute("aria-label"))).catch(() => [])
    if (!visible) {
      run.record("scm-button", "NOT RUN", {
        reason: "no 'Commit with OpenCode' button found in the SCM view", titleBarLabels: await labelsOf(".part.sidebar .composite.title [aria-label]"), sidebarActionLabels: await labelsOf(".part.sidebar .actions-container a"),
      })
    } else {
      const label = await btn.getAttribute("aria-label")
      const before = occurrences(await composer(), COMMIT)
      await btn.click({ timeout: 5000 })
      let after = before
      const grew = await waitUntil(async () => (after = occurrences(await composer(), COMMIT)) > before, 15000, 300)
      if (!grew) await runShot(page, run, "scm-button-fail")
      const where = await btn.evaluate((el) => (el.closest(".composite.title") ? "composite-title" : el.closest(".pane-header") ? "pane-header" : "other")).catch(() => null)
      run.record("scm-button", grew ? "PASS" : "FAIL", { ariaLabel: label, where, occurrencesBefore: before, occurrencesAfter: after, titleBarLabels: await labelsOf(".part.sidebar .composite.title [aria-label]") })
    }
  } catch (e) {
    run.record("scm-button", "NOT RUN", { reason: errMsg(e) })
  }
} catch (e) {
  run.record("run", "FAIL", { error: errMsg(e) })
  if (page) await runShot(page, run, "error")
} finally {
  fs.rmSync(path.join(workspace, FILE), { force: true })
  await app?.close().catch(() => {})
  process.exit(run.finish())
}
