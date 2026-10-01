// T007 managed mode: oco starts its own `opencode serve` (isolated HOME/XDG via lib/managed-opencode.sh),
// shares it between panels, never auto-restarts it, stops only its own process, and leaves the
// attached test server alone.
// Cases: managed-start, shared-by-panels, crash-no-restart, manual-restart, bad-path, switch-to-attached-stops-own, window-close-stops-own
import fs from "node:fs"
import path from "node:path"
import { execSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { createRun } from "./lib/results.mjs"
import { launch, command, sleep, runShot, hostState, root, waitForChatFrame } from "./vscode.mjs"

const CASES = ["managed-start", "shared-by-panels", "crash-no-restart", "manual-restart", "bad-path", "switch-to-attached-stops-own", "window-close-stops-own"]
const run = createRun({ suite: "t007-managed", required: CASES, scriptPath: fileURLToPath(import.meta.url) })
const WRAPPER = path.join(root, "tests/e2e/lib/managed-opencode.sh")
const ATTACHED = process.env.OCO_TEST_URL ?? "http://127.0.0.1:4517"
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
const alive = (pid) => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}
/** Processes started from the managed HOME (the wrapper execs opencode with it). */
const managedProcs = () => {
  try {
    return execSync(`pgrep -f -- "serve --hostname 127.0.0.1 --port 0"`, { encoding: "utf8" }).trim().split(/\s+/).filter(Boolean).map(Number)
  } catch {
    return []
  }
}
const attachedHealth = () => fetch(`${ATTACHED}/global/health`).then((r) => r.status, () => 0)
const attachedPids = () => {
  try {
    return execSync(`lsof -nP -t -iTCP:${new URL(ATTACHED).port} -sTCP:LISTEN`, { encoding: "utf8" }).trim()
  } catch {
    return ""
  }
}

const before = managedProcs()
const attachedBefore = attachedPids()
try {
  const l = await launch({ profile: "t007-managed", run, settings: { "oco.serverMode": "managed", "oco.opencodePath": WRAPPER } })
  app = l.app
  const page = l.page
  const st = () => hostState(page, l.stateFile)
  const setSettings = (patch) => fs.writeFileSync(l.settingsFile, JSON.stringify({ ...JSON.parse(fs.readFileSync(l.settingsFile, "utf8")), ...patch }, null, 2))
  const connected = () => until(async () => {
    const s = await st()
    return s.managed?.status === "running" && s.sidebar.connection?.state === "connected" ? s : undefined
  }, 60000, 500)
  let pid

  await rec("managed-start", async () => {
    const s = await connected()
    pid = s?.managed?.pid
    const label = s?.sidebar.connection?.label ?? ""
    const own = managedProcs().filter((p) => !before.includes(p))
    await runShot(page, run, "managed-connected")
    run.record("managed-start", s && /^http:\/\/127\.0\.0\.1:\d+$/.test(label) && label !== ATTACHED && own.includes(pid) && s.serverVersion && /Managed/.test(s.sidebar.statusTooltip ?? "") ? "PASS" : "FAIL", { managed: s?.managed, label, own, version: s?.serverVersion, status: s?.sidebar.statusText })
  })

  await rec("shared-by-panels", async () => {
    await command(page, "oco: New Session")
    await waitForChatFrame(page, 1, 60000)
    await command(page, "oco: New Session")
    await sleep(3000)
    const s = await st()
    const own = managedProcs().filter((p) => !before.includes(p))
    run.record("shared-by-panels", s.panels.length >= 1 && own.length === 1 && s.managed?.pid === pid ? "PASS" : "FAIL", { panels: s.panels.length, own, pid: s.managed?.pid })
  })

  await rec("crash-no-restart", async () => {
    process.kill(pid, "SIGKILL")
    const s = await until(async () => {
      const s = await st()
      return s.managed?.status === "exited" ? s : undefined
    }, 15000)
    await sleep(5000) // any auto-restart would show up here
    const own = managedProcs().filter((p) => !before.includes(p))
    const s2 = await st()
    await runShot(page, run, "managed-exited")
    run.record("crash-no-restart", s && own.length === 0 && s2.managed?.status === "exited" && /Managed server not running/.test(s2.sidebar.statusText ?? "") ? "PASS" : "FAIL", { status: s2.managed?.status, error: s2.managed?.error, own, statusText: s2.sidebar.statusText })
  })

  await rec("manual-restart", async () => {
    await command(page, "oco: Restart Managed Server")
    const s = await connected()
    const own = managedProcs().filter((p) => !before.includes(p))
    const newPid = s?.managed?.pid
    run.record("manual-restart", s && newPid !== pid && own.length === 1 && own[0] === newPid ? "PASS" : "FAIL", { pid: newPid, own })
    pid = newPid
  })

  await rec("bad-path", async () => {
    setSettings({ "oco.opencodePath": "/nonexistent/bin/opencode" })
    const s = await until(async () => {
      const s = await st()
      return s.managed?.status === "failed" ? s : undefined
    }, 20000)
    const own = managedProcs().filter((p) => !before.includes(p))
    await runShot(page, run, "managed-bad-path")
    run.record("bad-path", s && /oco\.opencodePath/.test(s.managed.error ?? "") && own.length === 0 && !alive(pid) ? "PASS" : "FAIL", { managed: s?.managed, own, oldPidAlive: alive(pid) })
    setSettings({ "oco.opencodePath": WRAPPER })
    const s2 = await connected()
    pid = s2?.managed?.pid
  })

  await rec("switch-to-attached-stops-own", async () => {
    setSettings({ "oco.serverMode": "attached" })
    const s = await until(async () => {
      const s = await st()
      return s.sidebar.connection?.state === "connected" && s.sidebar.connection.label === ATTACHED ? s : undefined
    }, 30000)
    await sleep(1000)
    const own = managedProcs().filter((p) => !before.includes(p))
    run.record("switch-to-attached-stops-own", s && own.length === 0 && !alive(pid) && [200, 401].includes(await attachedHealth()) ? "PASS" : "FAIL", { label: s?.sidebar.connection?.label, own, attachedHealth: await attachedHealth() })
  })

  await rec("window-close-stops-own", async () => {
    setSettings({ "oco.serverMode": "managed" })
    const s = await connected()
    const p = s?.managed?.pid
    await app.close()
    app = undefined
    const gone = await until(async () => (!alive(p) ? true : undefined), 10000)
    const attachedAfter = attachedPids()
    run.record("window-close-stops-own", p && gone && attachedAfter === attachedBefore && [200, 401].includes(await attachedHealth()) ? "PASS" : "FAIL", { pid: p, gone: !!gone, attachedUnchanged: attachedAfter === attachedBefore })
  })
} catch (e) {
  run.record("run", "FAIL", { error: String(e?.message ?? e).slice(0, 400) })
} finally {
  await app?.close().catch(() => {})
  process.exit(run.finish())
}
