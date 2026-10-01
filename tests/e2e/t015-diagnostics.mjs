// T015 connection presentation and diagnostics export.
// Cases: status-version, export-redacted, export-opens-editor, show-log
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { createRun } from "./lib/results.mjs"
import { launch, command, sleep, runShot, hostState, root } from "./vscode.mjs"

const CASES = ["status-version", "export-redacted", "export-opens-editor", "show-log"]
const run = createRun({ suite: "t015-diagnostics", required: CASES, scriptPath: fileURLToPath(import.meta.url) })
let app
run.installCrashHandlers(async () => {
  await app?.close().catch(() => {})
})

async function until(fn, ms, step = 300) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    const v = await fn().catch(() => undefined)
    if (v) return v
    await sleep(step)
  }
  return undefined
}
const rec = async (id, fn) => {
  try {
    await fn()
  } catch (e) {
    run.record(id, "FAIL", { error: String(e?.message ?? e).slice(0, 400) })
  }
}

try {
  const diagFile = path.join(fs.realpathSync(path.join(root, ".oco-test")), "t015-diagnostics.json")
  fs.rmSync(diagFile, { force: true })
  const l = await launch({ profile: "t015-diagnostics", run, env: { OCO_DIAGNOSTICS_FILE: diagFile } })
  app = l.app
  const page = l.page

  await rec("status-version", async () => {
    const s = await until(async () => {
      const s = await hostState(page, l.stateFile)
      return s.sidebar.connection?.state === "connected" && s.serverVersion ? s : undefined
    }, 40000)
    const tip = s?.sidebar.statusTooltip ?? ""
    run.record("status-version", s && /Server version: \d+\.\d+/.test(tip) && /Mode: Attached server/.test(tip) && /\$\((oco-logo|warning)\) oco/.test(s.sidebar.statusText) ? "PASS" : "FAIL", { version: s?.serverVersion, statusText: s?.sidebar.statusText, tooltip: tip.split("\n") })
  })

  await rec("export-redacted", async () => {
    await command(page, "oco: Export Diagnostics")
    const text = await until(async () => (fs.existsSync(diagFile) ? fs.readFileSync(diagFile, "utf8") : undefined), 10000)
    const d = text ? JSON.parse(text) : {}
    const secret = fs.readFileSync(path.join(root, ".oco-test/secret"), "utf8").trim()
    const basic = Buffer.from(`opencode:${secret}`).toString("base64")
    const leaks = { secret: text?.includes(secret), basic: text?.includes(basic), home: text?.includes(os.homedir()) }
    const ok = text && !leaks.secret && !leaks.basic && !leaks.home && d.passwordStored === true && d.server?.version && d.connection?.state === "connected" && Array.isArray(d.recentLog) && d.recentLog.length > 0 && d.settings?.serverMode === "attached"
    run.record("export-redacted", ok ? "PASS" : "FAIL", { leaks, keys: Object.keys(d), server: d.server, logLines: d.recentLog?.length })
  })

  await rec("export-opens-editor", async () => {
    const tab = await until(async () => ((await page.locator(".tabs-container .tab", { hasText: "Untitled" }).count()) > 0 ? true : undefined), 5000)
    await runShot(page, run, "diagnostics-export")
    run.record("export-opens-editor", tab ? "PASS" : "FAIL", { tab: !!tab })
  })

  await rec("show-log", async () => {
    await command(page, "oco: Show Log")
    const shown = await until(async () => ((await page.locator(".panel .monaco-editor", { hasText: "oco activated" }).count()) > 0 ? true : undefined), 8000)
    await runShot(page, run, "show-log")
    run.record("show-log", shown ? "PASS" : "FAIL", { shown: !!shown })
  })
} catch (e) {
  run.record("run", "FAIL", { error: String(e?.message ?? e).slice(0, 400) })
} finally {
  await app?.close().catch(() => {})
  process.exit(run.finish())
}
