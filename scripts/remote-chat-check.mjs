// A11 spot check on a real Remote-SSH host with the INSTALLED extension, in a separate VS Code instance
// (own profile under .oco-test/rl; the user's own VS Code windows are not touched):
//   1. new session from the sidebar, send a short prompt, reply arrives in the panel
//   2. start a long reply and stop it from the composer (Escape); the server reports the turn as aborted
//   3. click a workspace file path in the reply; VS Code opens the remote file
// The test session is deleted at the end. Server access for checks goes through ssh + curl on the host
// (loopback server without a password). Not an acceptance suite; prints a JSON summary and screenshots.
import { _electron as electron } from "playwright-core"
import { execFileSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

const root = path.resolve(import.meta.dirname, "..")
const R = path.join(fs.realpathSync(path.join(root, ".oco-test")), "rl")
const HOST = process.env.OCO_REMOTE_HOST ?? "gcp-workstation"
const FOLDER = process.env.OCO_REMOTE_FOLDER ?? "/home/user/ai"
const SERVER = process.env.OCO_REMOTE_SERVER ?? "http://127.0.0.1:4096"
const shots = path.join(R, "shots")
fs.mkdirSync(path.join(R, "rud/User"), { recursive: true })
fs.mkdirSync(path.join(R, "rext"), { recursive: true })
fs.mkdirSync(shots, { recursive: true })
const userExt = path.join(os.homedir(), ".vscode/extensions")
for (const e of fs.readdirSync(userExt).filter((d) => /^ms-vscode(-remote)?\.remote-(ssh|ssh-edit|explorer)-\d/.test(d)))
  if (!fs.existsSync(path.join(R, "rext", e))) fs.cpSync(path.join(userExt, e), path.join(R, "rext", e), { recursive: true })
fs.writeFileSync(path.join(R, "rud/User/settings.json"), JSON.stringify({ "remote.SSH.connectTimeout": 240, "workbench.startupEditor": "none", "telemetry.telemetryLevel": "off", "update.mode": "none", "extensions.autoUpdate": false, "security.workspace.trust.enabled": false, "chat.disableAIFeatures": true, "window.dialogStyle": "custom" }, null, 2))

const remote = (method, p, body) => {
  const args = ["-o", "BatchMode=yes", HOST, `curl -s -X ${method} -H 'content-type: application/json' -H 'x-opencode-directory: ${encodeURIComponent(FOLDER)}' ${body ? `--data-binary @-` : ""} '${SERVER}${p}'`]
  const out = execFileSync("ssh", args, { input: body ? JSON.stringify(body) : undefined, encoding: "utf8", stdio: ["pipe", "pipe", "ignore"], timeout: 240000 })
  return out ? JSON.parse(out) : null
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const summary = {}
let sid
let app
try {
  // A file the reply can point at (inside the workspace folder, removed at the end).
  execFileSync("ssh", ["-o", "BatchMode=yes", HOST, `printf 'line1\\nline2\\nOCO_MARK line3\\n' > ${FOLDER}/oco-remote-check.txt`], { stdio: "ignore", timeout: 240000 })
  app = await electron.launch({
    executablePath: process.env.OCO_VSCODE_BIN ?? "/Applications/Visual Studio Code.app/Contents/MacOS/Code",
    args: ["--folder-uri", `vscode-remote://ssh-remote+${HOST}${FOLDER}`, `--user-data-dir=${R}/rud`, `--extensions-dir=${R}/rext`, "--skip-welcome", "--skip-release-notes", "--new-window"],
    env: { ...process.env },
    timeout: 60000,
  })
  const page = await app.waitForEvent("window", { timeout: 120000 })
  const shot = (n) => page.screenshot({ path: path.join(shots, `${n}.png`) })
  const t0 = Date.now()
  while (Date.now() - t0 < 300000) {
    if (/\$?\(?plug|oco/.test(await page.locator(".part.statusbar").innerText().catch(() => "")) && (await page.locator('.activitybar [aria-label^="oco"]').count())) break
    await sleep(2000)
  }
  summary.connectSeconds = Math.round((Date.now() - t0) / 1000)
  await page.locator('.activitybar [aria-label^="oco"]').first().click()
  await sleep(3000)
  // Never type into an existing (real) session: the new frame must show a session that did not exist before.
  const before = new Set((remote("GET", `/session?directory=${encodeURIComponent(FOLDER)}&limit=1000`) ?? []).map((s) => s.id))
  if (before.size === 0) throw new Error("could not list existing sessions; refusing to continue")
  await page.keyboard.press("Escape")
  await page.locator(".command-center .search-label, .command-center-center").first().click()
  await page.locator(".quick-input-widget input").fill(">oco: New Session")
  await sleep(800)
  await page.keyboard.press("Enter")
  // The chat frame of the new session.
  let frame
  const f0 = Date.now()
  while (!frame && Date.now() - f0 < 90000) {
    for (const f of page.frames()) {
      const id = await f.evaluate(() => (window.__OCO_INIT__ && document.documentElement.dataset.ocoModel === "ready" && document.visibilityState === "visible" && document.querySelector('[data-component="prompt-input"]') ? (window.__OCO_DEBUG__?.sessionId?.() ?? window.__OCO_INIT__.binding.sessionId) : null)).catch(() => null)
      if (id && !before.has(id)) frame = f
    }
    await sleep(300)
  }
  if (!frame) throw new Error("chat frame not ready")
  sid = await frame.evaluate(() => window.__OCO_DEBUG__?.sessionId?.() ?? window.__OCO_INIT__.binding.sessionId)
  if (!sid || before.has(sid)) throw new Error("frame is not a new session; refusing to type")
  summary.sessionCreated = true
  const send = async (text) => {
    const input = frame.locator('[data-component="prompt-input"]')
    await input.click()
    await page.keyboard.type(text, { delay: 5 })
    await sleep(300)
    await page.keyboard.press("Enter")
  }
  const assistantTexts = () => remote("GET", `/session/${sid}/message`).filter((m) => m.info.role === "assistant").map((m) => ({ text: m.parts.filter((p) => p.type === "text").map((p) => p.text).join(""), error: m.info.error?.name ?? null, done: !!m.info.time?.completed }))

  // 1. short reply
  await send("Reply with exactly this line and nothing else, keeping the backticks: OCO-REMOTE-OK `oco-remote-check.txt:3`")
  const r0 = Date.now()
  let replied = false
  while (!replied && Date.now() - r0 < 120000) {
    // The prompt itself contains the marker once: the reply makes it appear a second time.
    replied = await frame.evaluate(() => document.body.innerText.split("OCO-REMOTE-OK").length - 1 >= 2).catch(() => false)
    if (!replied) await sleep(1000)
  }
  summary.replyShownInPanel = replied
  summary.replySeconds = Math.round((Date.now() - r0) / 1000)
  await sleep(2000)
  summary.replyOnServer = assistantTexts().some((m) => m.text.includes("OCO-REMOTE-OK"))
  await frame.getByText("Reply with exactly", { exact: false }).first().hover().catch(() => {})
  await sleep(800)
  summary.forkButtonsVisible = await frame.evaluate(() => document.querySelectorAll('[aria-label*="ork" i], [title*="ork" i], [data-slot*="fork"]').length).catch(() => null)
  await shot("chat-reply")

  // 3. click the path in the reply (Markdown inline path handling needs it in code; plain text is only checked if present as link)
  const pathEl = frame.locator('[data-component="markdown"] code, .markdown code', { hasText: "oco-remote-check.txt" }).last()
  if (await pathEl.count()) {
    await pathEl.click()
    await sleep(3000)
    summary.remoteFileOpened = (await page.locator(".tabs-container .tab", { hasText: "oco-remote-check.txt" }).count()) > 0
    summary.remoteFileLine = await page.locator(".part.statusbar").innerText().then((t) => /Ln 3,/.test(t)).catch(() => null)
    await shot("remote-file")
  } else summary.remoteFileOpened = "NOT RUN (reply did not render the path as inline code)"

  // 2. stop a long reply
  await frame.locator('[data-component="prompt-input"]').click()
  await send("Count from 1 to 3000, one number per line, no other text.")
  // Each ssh round trip takes seconds, so stop after a fixed delay and read the outcome from the server.
  await sleep(4000)
  const busy = (remote("GET", "/session/status") ?? {})[sid]?.type === "busy"
  await frame.locator('[data-component="prompt-input"]').click()
  await page.keyboard.press("Escape")
  const c0 = Date.now()
  let idle = false
  while (!idle && Date.now() - c0 < 30000) {
    idle = !(remote("GET", "/session/status") ?? {})[sid] || (remote("GET", "/session/status") ?? {})[sid]?.type === "idle"
    if (!idle) await sleep(700)
  }
  const last = assistantTexts().at(-1)
  summary.cancel = { sawBusy: busy, idleAfterStopSeconds: idle ? Math.round((Date.now() - c0) / 1000) : null, lastError: last?.error ?? null, lastTextTail: last?.text.slice(-40) ?? null }
  await shot("chat-cancelled")
} catch (e) {
  summary.error = String(e?.message ?? e).slice(0, 300)
} finally {
  await app?.close().catch(() => {})
  if (sid) {
    try {
      remote("DELETE", `/session/${sid}`)
      summary.testSessionDeleted = true
    } catch {
      summary.testSessionDeleted = false
    }
  }
  try {
    execFileSync("ssh", ["-o", "BatchMode=yes", HOST, `rm -f ${FOLDER}/oco-remote-check.txt`], { stdio: "ignore", timeout: 240000 })
  } catch {}
  console.log(JSON.stringify(summary, null, 2))
  console.log("SHOTS", shots)
}
