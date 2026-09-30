// T013 Agents view against the isolated test server, in its own project directory (so reloading config
// never disturbs another suite's server instance).
// Cases: list-sources, create-project, reload-activates, duplicate-builtin, duplicate-preserves-bytes, external-edit-pending
import fs from "node:fs"
import path from "node:path"
import { execSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { createRun } from "./lib/results.mjs"
import { launch, command, quickInput, sleep, runShot, hostState, root } from "./vscode.mjs"
import { api } from "./server.mjs"

const CASES = ["list-sources", "create-project", "reload-activates", "duplicate-builtin", "duplicate-preserves-bytes", "external-edit-pending"]
const run = createRun({ suite: "t013-agents", required: CASES, scriptPath: fileURLToPath(import.meta.url) })
const WS = path.join(fs.realpathSync(path.join(root, ".oco-test")), "ws-agents")
fs.rmSync(WS, { recursive: true, force: true })
fs.mkdirSync(WS, { recursive: true })
execSync("git init -q && git -c user.email=t@oco.local -c user.name=t commit -q --allow-empty -m init", { cwd: WS })
const AGENT_DIR = path.join(WS, ".opencode", "agent")
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
const serverAgents = async () => {
  const res = await fetch(`${process.env.OCO_TEST_URL ?? "http://127.0.0.1:4517"}/agent`, {
    headers: { authorization: "Basic " + Buffer.from(`opencode:${fs.readFileSync(path.join(root, ".oco-test/secret"), "utf8").trim()}`).toString("base64"), "x-opencode-directory": encodeURIComponent(WS) },
  })
  return res.json()
}
void api

try {
  const l = await launch({ profile: "t013-agents", run, workspace: WS, settings: { "window.dialogStyle": "custom" } })
  app = l.app
  const page = l.page
  const agents = async () => (await hostState(page, l.stateFile)).agents
  const row = async (name) => (await agents())?.rows.find((r) => r.name === name)
  const step = () => sleep(700)
  const confirmDialog = async (label) => {
    const btn = page.locator(".monaco-dialog-box .monaco-button", { hasText: label }).first()
    await btn.waitFor({ timeout: 10000 })
    await btn.click()
  }

  await rec("list-sources", async () => {
    await command(page, "oco: Refresh Agents")
    const a = await until(async () => {
      const a = await agents()
      return a?.rows?.some((r) => r.name === "build") ? a : undefined
    }, 40000)
    await command(page, "OpenCode: Focus on Agents View").catch(() => {})
    await sleep(800)
    await runShot(page, run, "agents-list")
    const build = a?.rows.find((r) => r.name === "build")
    const hidden = a?.rows.some((r) => r.name === "title" || r.name === "compaction")
    run.record("list-sources", build?.source === "builtin" && !hidden && a.writable === true ? "PASS" : "FAIL", { rows: a?.rows?.map((r) => `${r.name}:${r.source}:${r.state}`), writable: a?.writable, error: a?.error })
  })

  await rec("create-project", async () => {
    await command(page, "oco: New Agent")
    await quickInput(page, "项目")
    await step()
    await quickInput(page, "e2e-reviewer")
    await step()
    await quickInput(page, "E2E reviewer: checks \"quotes\"")
    await step()
    await quickInput(page, "subagent")
    const file = path.join(AGENT_DIR, "e2e-reviewer.md")
    const made = await until(async () => fs.existsSync(file), 10000)
    const r = await until(async () => {
      const r = await row("e2e-reviewer")
      return r ? r : undefined
    }, 10000)
    const text = made ? fs.readFileSync(file, "utf8") : ""
    const tabOpen = await page.locator(".tabs-container .tab", { hasText: "e2e-reviewer.md" }).count()
    await runShot(page, run, "agent-created")
    run.record("create-project", made && /mode: subagent/.test(text) && text.includes('description: "E2E reviewer: checks \\"quotes\\""') && r?.state === "pending" && r?.scope === "project" && tabOpen > 0 ? "PASS" : "FAIL", { made, row: r, tabOpen, head: text.split("\n").slice(0, 4) })
  })

  await rec("reload-activates", async () => {
    await command(page, "oco: Reload OpenCode Config")
    await confirmDialog("重新加载")
    const r = await until(async () => {
      const r = await row("e2e-reviewer")
      return r?.state === "active" ? r : undefined
    }, 20000)
    const server = await serverAgents()
    const s = server.find((a) => a.name === "e2e-reviewer")
    const health = await fetch(`${process.env.OCO_TEST_URL ?? "http://127.0.0.1:4517"}/global/health`).then((x) => x.status, () => 0)
    run.record("reload-activates", r && s?.mode === "subagent" && s?.description === 'E2E reviewer: checks "quotes"' && (health === 200 || health === 401) ? "PASS" : "FAIL", { row: r, server: s ? { mode: s.mode, description: s.description } : null, serverStillUp: health })
  })

  await rec("duplicate-builtin", async () => {
    await command(page, "oco: Duplicate Agent")
    await quickInput(page, "plan")
    await step()
    await quickInput(page, "项目")
    await step()
    await quickInput(page, "plan-copy2")
    const file = path.join(AGENT_DIR, "plan-copy2.md")
    const made = await until(async () => fs.existsSync(file), 10000)
    const text = made ? fs.readFileSync(file, "utf8") : ""
    const planDesc = (await serverAgents()).find((a) => a.name === "plan")?.description
    run.record("duplicate-builtin", made && /mode: primary/.test(text) && text.includes(JSON.stringify(planDesc)) ? "PASS" : "FAIL", { made, head: text.split("\n").slice(0, 4), planDesc })
  })

  await rec("duplicate-preserves-bytes", async () => {
    const src = path.join(AGENT_DIR, "e2e-reviewer.md")
    // A hand-edited file: comment, unknown field, body. Same description, so it stays active.
    const hand = fs.readFileSync(src, "utf8").replace("mode: subagent", "mode: subagent\n# keep this comment\nx-unknown-field: 42")
    fs.writeFileSync(src, hand + "\nExtra body paragraph.\n")
    await sleep(1500)
    await command(page, "oco: Duplicate Agent")
    await quickInput(page, "e2e-reviewer")
    await step()
    await quickInput(page, "用户")
    await step()
    await quickInput(page, "e2e-reviewer-user")
    const cfg = (await until(async () => (await hostState(page, l.stateFile)).agents.rows.find((r) => r.name === "e2e-reviewer-user")?.file, 10000)) ?? ""
    const same = cfg && fs.readFileSync(cfg, "utf8") === fs.readFileSync(src, "utf8")
    const inIsolatedConfig = cfg.startsWith(fs.realpathSync(path.join(root, ".oco-test")))
    if (cfg && inIsolatedConfig) fs.rmSync(cfg) // user scope = the test server's isolated config dir
    run.record("duplicate-preserves-bytes", same && inIsolatedConfig ? "PASS" : "FAIL", { copy: cfg.replace(root, "<root>"), same, inIsolatedConfig })
  })

  await rec("external-edit-pending", async () => {
    const src = path.join(AGENT_DIR, "e2e-reviewer.md")
    fs.writeFileSync(src, fs.readFileSync(src, "utf8").replace(/^description: .*$/m, 'description: "changed outside"'))
    const pending = await until(async () => ((await row("e2e-reviewer"))?.state === "pending" ? true : undefined), 15000)
    await command(page, "oco: Reload OpenCode Config")
    await confirmDialog("重新加载")
    const active = await until(async () => ((await row("e2e-reviewer"))?.state === "active" ? true : undefined), 20000)
    const s = (await serverAgents()).find((a) => a.name === "e2e-reviewer")
    // Reload ends the server's event stream; the sidebar must be back without waiting for backoff.
    const sidebar = await until(async () => ((await hostState(page, l.stateFile)).sidebar.connection?.state === "connected" ? true : undefined), 6000)
    await runShot(page, run, "agents-after-edit")
    run.record("external-edit-pending", pending && active && sidebar && s?.description === "changed outside" ? "PASS" : "FAIL", { pending: !!pending, active: !!active, sidebarConnected: !!sidebar, serverDescription: s?.description })
  })
} catch (e) {
  run.record("run", "FAIL", { error: String(e?.message ?? e).slice(0, 400) })
} finally {
  await app?.close().catch(() => {})
  process.exit(run.finish())
}
