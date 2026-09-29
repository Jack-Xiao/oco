// Drives a real VS Code (isolated profile) with the oco extension under development, via Playwright/Electron.
// Webview content is reached through Playwright frames (vscode-webview://.../fake.html).
import { _electron as electron } from "playwright-core"
import fs from "node:fs"
import path from "node:path"

export const root = path.resolve(import.meta.dirname, "../..")
export const evidenceDir = path.join(root, "docs/evidence/p0-artifacts")
fs.mkdirSync(evidenceDir, { recursive: true })

const CODE = process.env.OCO_VSCODE_BIN ?? "/Applications/Visual Studio Code.app/Contents/MacOS/Code"

export async function launch({ workspace = path.join(root, ".oco-test/workspace"), profile = "default", fresh = true } = {}) {
  const userData = path.join(root, ".oco-test/vscode", profile)
  if (fresh) fs.rmSync(userData, { recursive: true, force: true })
  fs.mkdirSync(path.join(userData, "User"), { recursive: true })
  fs.writeFileSync(
    path.join(userData, "User/settings.json"),
    JSON.stringify(
      {
        "oco.serverUrl": process.env.OCO_TEST_URL ?? "http://127.0.0.1:4517",
        "security.workspace.trust.enabled": false,
        "workbench.startupEditor": "none",
        "telemetry.telemetryLevel": "off",
        "update.mode": "none",
        "extensions.autoUpdate": false,
        "window.restoreWindows": "all",
        "chat.disableAIFeatures": true,
        "workbench.tips.enabled": false,
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
      "--disable-workspace-trust",
      "--new-window",
    ],
    env: { ...process.env, OCO_DEV_PASSWORD_FILE: path.join(root, ".oco-test/secret") },
    timeout: 60000,
  })
  const page = await app.firstWindow()
  await page.waitForSelector(".monaco-workbench", { timeout: 60000 })
  await page.waitForTimeout(2500)
  await clearNotifications(page)
  return { app, page }
}

export async function clearNotifications(page) {
  await command(page, "Notifications: Clear All Notifications")
  await page.waitForTimeout(300)
}

export async function command(page, title, { input } = {}) {
  await page.keyboard.press("F1")
  await page.waitForSelector(".quick-input-widget input", { state: "visible" })
  await page.keyboard.type(title)
  await page.waitForTimeout(400)
  await page.keyboard.press("Enter")
  if (input !== undefined) {
    await page.waitForTimeout(500)
    await page.keyboard.type(input)
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
