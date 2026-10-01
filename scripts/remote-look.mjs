// Look at the INSTALLED oco extension in a real Remote-SSH window, without touching the user's VS Code:
// a separate VS Code instance (own profile under .oco-test/rl) with only the Remote-SSH extensions copied in.
// Not an acceptance suite; it only produces screenshots/text for manual review.
//   OCO_REMOTE_HOST (default gcp-workstation), OCO_REMOTE_FOLDER (default /home/user/ai)
//   STEPS="click:<selector>,wait:<ms>,hover:<selector>,cmd:<palette title>,shot:<name>,text:<selector>"
import { _electron as electron } from "playwright-core"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

const root = path.resolve(import.meta.dirname, "..")
const R = path.join(fs.realpathSync(path.join(root, ".oco-test")), "rl") // short path: IPC socket limit
const HOST = process.env.OCO_REMOTE_HOST ?? "gcp-workstation"
const FOLDER = process.env.OCO_REMOTE_FOLDER ?? "/home/user/ai"
const shots = path.join(R, "shots")
fs.mkdirSync(path.join(R, "rud/User"), { recursive: true })
fs.mkdirSync(path.join(R, "rext"), { recursive: true })
fs.mkdirSync(shots, { recursive: true })
const userExt = path.join(os.homedir(), ".vscode/extensions")
for (const e of fs.readdirSync(userExt).filter((d) => /^ms-vscode(-remote)?\.remote-(ssh|ssh-edit|explorer)-\d/.test(d)))
  if (!fs.existsSync(path.join(R, "rext", e))) fs.cpSync(path.join(userExt, e), path.join(R, "rext", e), { recursive: true })
fs.writeFileSync(
  path.join(R, "rud/User/settings.json"),
  JSON.stringify({ "remote.SSH.connectTimeout": 240, "workbench.startupEditor": "none", "telemetry.telemetryLevel": "off", "update.mode": "none", "extensions.autoUpdate": false, "security.workspace.trust.enabled": false, "chat.disableAIFeatures": true, "window.dialogStyle": "custom" }, null, 2),
)

const app = await electron.launch({
  executablePath: process.env.OCO_VSCODE_BIN ?? "/Applications/Visual Studio Code.app/Contents/MacOS/Code",
  args: ["--folder-uri", `vscode-remote://ssh-remote+${HOST}${FOLDER}`, `--user-data-dir=${R}/rud`, `--extensions-dir=${R}/rext`, "--skip-welcome", "--skip-release-notes", "--new-window"],
  env: { ...process.env },
  timeout: 60000,
})
const page = await app.waitForEvent("window", { timeout: 120000 })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const shot = async (n) => page.screenshot({ path: path.join(shots, `${n}.png`) })
async function command(title) {
  // Keyboard shortcuts can be swallowed by a focused panel/webview: open the palette from the command center.
  await page.keyboard.press("Escape")
  await page.locator(".command-center .search-label, .command-center-center").first().click()
  await page.locator(".quick-input-widget input").waitFor({ timeout: 5000 })
  await page.locator(".quick-input-widget input").fill(">" + title)
  await sleep(800)
  await page.keyboard.press("Enter")
}
const t0 = Date.now()
let st = ""
while (Date.now() - t0 < 300000) {
  st = await page.locator(".part.statusbar").innerText().catch(() => "")
  if (/oco/.test(st) && !/Connecting|连接中/.test(st)) break
  await sleep(3000)
}
console.log("STATUS", JSON.stringify(st.replace(/\s+/g, " ")), Math.round((Date.now() - t0) / 1000) + "s")
await shot("1-status")
for (const step of (process.env.STEPS ?? "").split(",").filter(Boolean)) {
  const i = step.indexOf(":")
  const kind = step.slice(0, i)
  const arg = step.slice(i + 1)
  if (kind === "cmd") await command(arg)
  if (kind === "wait") await sleep(Number(arg))
  if (kind === "shot") await shot(arg)
  if (kind === "click") await page.locator(arg).first().click().catch((e) => console.log("click fail", String(e).slice(0, 100)))
  if (kind === "hover") await page.locator(arg).first().hover().catch(() => {})
  if (kind === "text") console.log("TEXT", (await page.locator(arg).first().innerText().catch(() => "")).slice(0, 1500))
}
console.log("SHOTS", shots)
await app.close()
