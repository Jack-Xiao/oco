// Drives a real VS Code (isolated profile) with the oco extension under development, via Playwright/Electron.
// Webview content is reached through Playwright frames (vscode-webview://.../fake.html).
import { _electron as electron } from "playwright-core"
import fs from "node:fs"
import os from "node:os"
import crypto from "node:crypto"
import path from "node:path"
import { MODEL } from "./server.mjs"

export const root = path.resolve(import.meta.dirname, "../..")
export const evidenceDir = path.join(root, "docs/evidence/p0-artifacts")
fs.mkdirSync(evidenceDir, { recursive: true })

const CODE = process.env.OCO_VSCODE_BIN ?? "/Applications/Visual Studio Code.app/Contents/MacOS/Code"

// VS Code puts its IPC socket (`<ver>-main.sock`) inside --user-data-dir, and a unix socket path is capped at 103
// chars on macOS. A nested git worktree (`.claude/worktrees/<name>/.oco-test/vscode/<profile>`) overshoots it, so
// an over-long user-data-dir moves to a short, per-checkout hashed directory under /tmp (or os.tmpdir()) and is
// removed again when this process exits. `OCO_E2E_USER_DATA_ROOT` forces the root.
const SOCKET_LIMIT = 103
const SOCKET_NAME_RESERVE = 24 // "<version>-main.sock" plus the separator, with headroom
const shortDirs = new Set()
let shortCleanupHooked = false
function cleanupShortDirs() {
  for (const dir of shortDirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true })
      fs.rmdirSync(path.dirname(dir)) // the shared parent goes only when no other profile is left in it
    } catch {}
  }
  shortDirs.clear()
}
/** The user-data-dir for `profile`: under `.oco-test` when its socket fits, else a short temp path. */
export function userDataDirFor(profile) {
  const home = path.join(fs.realpathSync(path.join(root, ".oco-test")), "vscode", profile)
  const forced = process.env.OCO_E2E_USER_DATA_ROOT
  if (!forced && home.length + SOCKET_NAME_RESERVE <= SOCKET_LIMIT) return home
  const hash = crypto.createHash("sha1").update(root).digest("hex").slice(0, 8)
  const candidates = forced ? [forced] : ["/tmp", os.tmpdir()]
  for (const base of candidates) {
    try {
      const real = fs.realpathSync(base)
      const dir = path.join(real, `oco-e2e-${hash}`, profile)
      if (!forced && dir.length + SOCKET_NAME_RESERVE > SOCKET_LIMIT) continue
      fs.mkdirSync(path.dirname(dir), { recursive: true })
      shortDirs.add(dir)
      if (!shortCleanupHooked) {
        shortCleanupHooked = true
        process.on("exit", cleanupShortDirs)
      }
      return dir
    } catch {}
  }
  return home // nothing shorter is usable: keep the old behaviour
}

export async function launch({ workspace = path.join(fs.realpathSync(path.join(root, ".oco-test")), "workspace"), profile = "default", fresh = true, run, settings = {}, trust = true, env = {} } = {}) {
  // realpath keeps a linked .oco-test short; userDataDirFor moves a still-too-long path to a short temp directory.
  const userData = userDataDirFor(profile)
  const stateFile = path.join(userData, "oco-debug-state.json")
  if (fresh) fs.rmSync(userData, { recursive: true, force: true })
  fs.mkdirSync(path.join(userData, "User"), { recursive: true })
  fs.writeFileSync(
    path.join(userData, "User/settings.json"),
    JSON.stringify(
      {
        "oco.serverUrl": process.env.OCO_TEST_URL ?? "http://127.0.0.1:4517",
        "security.workspace.trust.enabled": !trust,
        ...(trust ? {} : { "security.workspace.trust.startupPrompt": "never", "security.workspace.trust.emptyWindow": false }),
        "workbench.startupEditor": "none",
        "telemetry.telemetryLevel": "off",
        "update.mode": "none",
        "extensions.autoUpdate": false,
        "window.restoreWindows": "all",
        "chat.disableAIFeatures": true,
        "workbench.tips.enabled": false,
        "workbench.editor.closeEmptyGroups": false,
        ...settings,
      },
      null,
      2,
    ),
  )
  const app = await electron.launch({
    executablePath: CODE,
    args: [
      workspace,
      `--extensionDevelopmentPath=${path.join(root, "apps/extension")}`,
      `--user-data-dir=${userData}`,
      `--extensions-dir=${path.join(root, ".oco-test/vscode/extensions")}`,
      "--disable-extensions",
      "--skip-welcome",
      "--skip-release-notes",
      ...(trust ? ["--disable-workspace-trust"] : []),
      "--new-window",
    ],
    env: { ...process.env, OCO_DEV_PASSWORD_FILE: path.join(root, ".oco-test/secret"), OCO_DEBUG_STATE_FILE: stateFile, ...env },
    timeout: 60000,
  })
  const page = await app.firstWindow()
  await page.waitForSelector(".monaco-workbench", { timeout: 60000 })
  // The workbench shell renders before its parts are interactive; the command palette needs the sidebar title.
  await page.waitForSelector(".part.sidebar .composite.title", { timeout: 30000 }).catch(() => {})
  // --disable-extensions raises an "extensions are temporarily disabled" toast shortly after startup; it
  // covers the bottom-right of the window (e.g. a dock's buttons). Wait for it, then clear it.
  await page.locator(".notifications-toasts .notification-toast").first().waitFor({ timeout: 4000 }).catch(() => {})
  await clearNotifications(page)
  if (run) {
    const pkg = JSON.parse(fs.readFileSync("/Applications/Visual Studio Code.app/Contents/Resources/app/package.json", "utf8"))
    run.setEnv({ vscodeVersion: pkg.version, vscodeProfile: profile, modelMode: MODEL.mode, model: `${MODEL.providerID}/${MODEL.modelID}` })
  }
  return { app, page, stateFile, settingsFile: path.join(userData, "User/settings.json") }
}

/** Best effort: a failed clear (e.g. the palette's `fill` timing out) is logged and returns false, never throws,
 *  so a flaky startup toast cannot take down the suite. `command` already retries the palette once or twice. */
export async function clearNotifications(page) {
  try {
    await command(page, "Notifications: Clear All Notifications")
  } catch (e) {
    console.warn(`[vscode.mjs] clearNotifications skipped: ${String(e?.message ?? e).split("\n")[0].slice(0, 160)}`)
    await page.keyboard.press("Escape").catch(() => {})
    return false
  }
  await page.locator(".notifications-toasts .notification-toast").first().waitFor({ state: "detached", timeout: 2000 }).catch(() => {})
  return true
}

/** Open the command palette (focus the workbench first, retry with the other shortcut); true when it is visible. */
async function openPalette(page) {
  // Keyboard focus may be inside a webview (which swallows F1): move it back to the workbench first,
  // and retry with the other palette shortcut if the palette does not open.
  const palette = page.locator(".quick-input-widget input")
  for (const key of ["F1", "Meta+Shift+P", "F1"]) {
    // Focus the workbench BEFORE pressing Escape: Escape inside a busy chat composer means "stop".
    await page.click(".part.sidebar .composite.title", { position: { x: 30, y: 10 }, timeout: 3000 }).catch(() => {})
    await page.keyboard.press("Escape").catch(() => {})
    await page.keyboard.press(key)
    if (await palette.waitFor({ state: "visible", timeout: 3000 }).then(() => true, () => false)) return true
  }
  return false
}

export async function command(page, title, { input } = {}) {
  const palette = page.locator(".quick-input-widget input")
  // The palette can be visible yet detach / re-render under the first `fill` (a startup toast steals focus), which
  // used to burn the 30 s default timeout once in a while. Bound each fill to 5 s and reopen the palette up to twice.
  for (let attempt = 0; ; attempt++) {
    if (!(await openPalette(page))) throw new Error(`command palette did not open for: ${title}`)
    try {
      await palette.fill(">" + title, { timeout: 5000 })
      break
    } catch (e) {
      if (attempt >= 2) throw e
      await page.keyboard.press("Escape").catch(() => {})
      await page.waitForTimeout(300)
    }
  }
  // Wait until the palette has filtered down to this command, so Enter never runs a stale first row.
  const label = title.slice(title.lastIndexOf(": ") + 1).trim()
  await page
    .waitForFunction(
      (label) => document.querySelector(".quick-input-list .monaco-list-row.focused")?.textContent?.includes(label),
      label,
      { timeout: 3000 },
    )
    .catch(() => page.waitForTimeout(500))
  // Newer VS Code lists fuzzy matches alphabetically, so the exact title may not be the focused row: click it.
  const exact = page.locator(`.quick-input-list .monaco-list-row[aria-label="${title}"]`).first()
  if (await exact.isVisible().catch(() => false)) await exact.click().catch(() => {})
  else await page.keyboard.press("Enter")
  if (input !== undefined) await quickInput(page, input)
}

/** Answer the quick pick / input box a command just opened: wait until it is shown (it reuses the palette
 *  widget, so "ready" means it no longer holds ">title"), type, and press Enter once the focused row
 *  matches (quick picks) or right away (input boxes, which have no rows). */
export async function quickInput(page, text) {
  await page
    .waitForFunction(() => {
      const el = document.querySelector(".quick-input-widget input")
      return el && el.offsetParent !== null && !el.value.startsWith(">")
    }, null, { timeout: 10000 })
    .catch(() => page.waitForTimeout(800))
  await page.keyboard.type(text)
  await page
    .waitForFunction(
      (t) => {
        const rows = document.querySelector(".quick-input-list")
        if (!rows || rows.offsetParent === null) return true
        return document.querySelector(".quick-input-list .monaco-list-row.focused")?.textContent?.includes(t)
      },
      text,
      { timeout: 2000 },
    )
    .catch(() => page.waitForTimeout(300))
  await page.keyboard.press("Enter")
}

/** Poll `fn` until it returns a truthy value (returned) or `ms` elapses (returns null). */
export async function waitUntil(fn, ms = 5000, step = 100) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    const v = await fn().catch(() => null)
    if (v) return v
    await new Promise((r) => setTimeout(r, step))
  }
  return null
}

/** Runs a VS Code command through the extension host (for test setup only). */
export async function execCommand(app, id, ...args) {
  return app.evaluate(async ({}, { id, args }) => ({ id, args }), { id, args })
}

/** All oco chat content frames currently alive (frames that carry the oco init payload). */
export async function chatFrames(page) {
  const out = []
  for (const f of page.frames()) {
    if (!f.url().startsWith("vscode-webview://")) continue
    const ok = await f.evaluate(() => !!window.__OCO_INIT__).catch(() => false)
    if (ok) out.push(f)
  }
  return out
}

export async function waitForChatFrame(page, count = 1, timeout = 60000, selector = "#root > *") {
  const end = Date.now() + timeout
  let n = 0
  while (Date.now() < end) {
    const frames = await chatFrames(page)
    n = frames.length
    const ready = []
    for (const f of frames) if (await f.$(selector).catch(() => null)) ready.push(f)
    if (ready.length >= count) return ready
    await page.waitForTimeout(300)
  }
  throw new Error(`chat frame(s) not ready: wanted ${count}, have ${n}`)
}

/** Create a server session through the API and open it in the chat panel (main panel, or a pinned one with
 *  `newPanel`), returning its id. `oco: New Session` only opens a draft page now (the session is created by the
 *  first message), so suites that just need "a fresh session in a panel" use this instead; suites that test the
 *  draft itself use New explicitly (c12-new-session-draft). `directory` defaults to the shared test workspace.
 *  Retries the open once when no frame shows the session within 25 s (the picker may open before the list loads);
 *  `wait: false` skips that check for suites that time the panel's first paint themselves. */
export async function createAndOpenSession(page, { title, directory, newPanel = false, wait = true } = {}) {
  const { api } = await import("./server.mjs")
  const s = await api("POST", "/session", title ? { title } : {}, directory)
  if (!s?.id) throw new Error("createAndOpenSession: server did not return a session: " + JSON.stringify(s)?.slice(0, 200))
  const shown = async () => {
    for (const f of await chatFrames(page)) if ((await frameSession(f).catch(() => null)) === s.id) return true
    return false
  }
  for (let attempt = 0; attempt < 2; attempt++) {
    await command(page, newPanel ? "oco: Open in New Panel" : "oco: Open Session", { input: s.id })
    if (!wait || (await waitUntil(shown, 25000, 250))) return s.id
  }
  throw new Error("createAndOpenSession: no panel shows " + s.id)
}

/** Session id bound to a chat frame. */
/** The session a chat frame currently shows (a main panel switches in place, ADR-007). */
export const frameSession = (f) => f.evaluate(() => window.__OCO_DEBUG__?.sessionId?.() ?? window.__OCO_INIT__.binding.sessionId)

export async function shot(page, name) {
  const p = path.join(evidenceDir, `${name}.png`)
  await page.screenshot({ path: p })
  return p
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** Host-side state (dev-only command), read from the file the extension writes. */
export async function hostState(page, stateFile) {
  try {
    fs.rmSync(stateFile, { force: true })
  } catch {}
  await command(page, "oco: Debug State")
  const end = Date.now() + 10000
  while (Date.now() < end) {
    if (fs.existsSync(stateFile)) {
      try {
        return JSON.parse(fs.readFileSync(stateFile, "utf8"))
      } catch {}
    }
    await page.waitForTimeout(100)
  }
  throw new Error("debug state not written")
}

/** Screenshot into a run's artifact directory. */
export async function runShot(page, run, name) {
  const p = run.artifact(`${name}.png`)
  await page.screenshot({ path: p }).catch(() => {})
  return p
}

/** Resize the window until every visible chat frame is ~width CSS px wide (editor groups evened out). */
export async function fitGroups(app, page, width, { tolerance = 4 } = {}) {
  const measure = async () => {
    const out = []
    for (const f of await chatFrames(page)) {
      const w = await f.evaluate(() => (document.visibilityState === "visible" ? innerWidth : null)).catch(() => null)
      if (w) out.push(w)
    }
    return out
  }
  let widths = []
  for (let k = 0; k < 8; k++) {
    widths = await measure()
    const avg = widths.reduce((a, b) => a + b, 0) / Math.max(1, widths.length)
    if (widths.length && widths.every((w) => Math.abs(w - width) <= tolerance)) break
    await app.evaluate(({ BrowserWindow }, { d }) => {
      const w = BrowserWindow.getAllWindows()[0]
      const zoom = w.webContents.getZoomFactor()
      const [x, y] = w.getContentSize()
      w.setContentSize(Math.max(400, Math.round(x + d * zoom)), y)
    }, { d: (width - avg) * widths.length })
    await page.waitForTimeout(800)
    await command(page, "View: Reset Editor Group Sizes")
    await page.waitForTimeout(800)
  }
  return widths
}
