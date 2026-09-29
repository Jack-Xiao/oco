// Drives a real VS Code (isolated profile) with the oco extension under development, via Playwright/Electron.
// Webview content is reached through Playwright frames (vscode-webview://.../fake.html).
import { _electron as electron } from "playwright-core"
import fs from "node:fs"
import path from "node:path"

export const root = path.resolve(import.meta.dirname, "../..")
export const evidenceDir = path.join(root, "docs/evidence/p0-artifacts")
fs.mkdirSync(evidenceDir, { recursive: true })

const CODE = process.env.OCO_VSCODE_BIN ?? "/Applications/Visual Studio Code.app/Contents/MacOS/Code"

export async function launch({ workspace = path.join(root, ".oco-test/workspace"), profile = "default", fresh = true, run, settings = {}, trust = true } = {}) {
  const userData = path.join(root, ".oco-test/vscode", profile)
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
    env: { ...process.env, OCO_DEV_PASSWORD_FILE: path.join(root, ".oco-test/secret"), OCO_DEBUG_STATE_FILE: stateFile },
    timeout: 60000,
  })
  const page = await app.firstWindow()
  await page.waitForSelector(".monaco-workbench", { timeout: 60000 })
  await page.waitForTimeout(2500)
  await clearNotifications(page)
  if (run) {
    const pkg = JSON.parse(fs.readFileSync("/Applications/Visual Studio Code.app/Contents/Resources/app/package.json", "utf8"))
    run.setEnv({ vscodeVersion: pkg.version, vscodeProfile: profile })
  }
  return { app, page, stateFile, settingsFile: path.join(userData, "User/settings.json") }
}

export async function clearNotifications(page) {
  await command(page, "Notifications: Clear All Notifications")
  await page.waitForTimeout(300)
}

export async function command(page, title, { input } = {}) {
  // Keyboard focus may be inside a webview (which swallows F1): move it back to the workbench first,
  // and retry with the other palette shortcut if the palette does not open.
  const palette = page.locator(".quick-input-widget input")
  let open = false
  for (const key of ["F1", "Meta+Shift+P", "F1"]) {
    // Focus the workbench BEFORE pressing Escape: Escape inside a busy chat composer means "stop".
    await page.click(".part.sidebar .composite.title", { position: { x: 30, y: 10 }, timeout: 3000 }).catch(() => {})
    await page.keyboard.press("Escape").catch(() => {})
    await page.keyboard.press(key)
    open = await palette.waitFor({ state: "visible", timeout: 3000 }).then(() => true, () => false)
    if (open) break
  }
  if (!open) throw new Error(`command palette did not open for: ${title}`)
  await palette.fill(">" + title)
  await page.waitForTimeout(500)
  await page.keyboard.press("Enter")
  if (input !== undefined) {
    await page.waitForTimeout(800)
    await page.keyboard.type(input)
    await page.waitForTimeout(800)
    await page.keyboard.press("Enter")
  }
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

/** Session id bound to a chat frame. */
export const frameSession = (f) => f.evaluate(() => window.__OCO_INIT__.binding.sessionId)

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
