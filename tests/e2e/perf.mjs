// P1a-04 performance / leak baseline (structured). Method: real VS Code, 3 editor groups (3 visible
// webviews), then 10 hide/show cycles of one panel sharing a group with a 4th session.
// Measures: per-process RSS by Electron process type (only processes of this test profile), host-side
// open event streams / in-flight requests per panel, and re-show latency.
import { execSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { createRun } from "./lib/results.mjs"
import { launch, command, chatFrames, frameSession, sleep, hostState } from "./vscode.mjs"

const run = createRun({ suite: "perf", required: ["no-stream-leak", "hidden-releases-requests"], scriptPath: fileURLToPath(import.meta.url) })
const { app, page, stateFile } = await launch({ profile: "perf", run })
run.installCrashHandlers(() => app.close())
const state = () => hostState(page, stateFile)

function rss() {
  const lines = execSync("ps -axo pid=,rss=,command=").toString().split("\n").filter((l) => l.includes(".oco-test/vscode/perf"))
  const out = {}
  for (const l of lines) {
    const m = l.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/)
    if (!m) continue
    const type = (m[3].match(/--type=([a-z-]+)/)?.[1] ?? "main") + (m[3].includes("--utility-sub-type=node.mojom.NodeService") ? ":node(extHost)" : "")
    out[type] ??= { processes: 0, mb: 0 }
    out[type].processes++
    out[type].mb += Math.round(Number(m[2]) / 1024)
  }
  out.totalMB = Object.values(out).reduce((a, v) => a + (v.mb ?? 0), 0)
  return out
}
async function newSession(ids) {
  await command(page, "oco: New Session")
  const t0 = Date.now()
  while (Date.now() - t0 < 60000) {
    for (const f of await chatFrames(page)) {
      const s = await frameSession(f).catch(() => null)
      const ok = s && !ids.includes(s) && (await f.$('[data-component="prompt-input"]').catch(() => null))
      if (ok) return { sid: s, ms: Date.now() - t0 }
    }
    await sleep(100)
  }
  throw new Error("no new panel")
}
async function showSession(sid) {
  const t0 = Date.now()
  await command(page, "oco: Open Session")
  await sleep(800)
  await page.keyboard.type(sid)
  await sleep(300)
  await page.keyboard.press("Enter")
  const typed = Date.now() - t0
  while (Date.now() - t0 < 60000) {
    for (const f of await chatFrames(page)) {
      const ok = await f.evaluate((id) => window.__OCO_INIT__.binding.sessionId === id && document.visibilityState === "visible" && !!document.querySelector('[data-component="prompt-input"]'), sid).catch(() => false)
      if (ok) return { totalMs: Date.now() - t0, afterPaletteMs: Date.now() - t0 - typed }
    }
    await sleep(50)
  }
  throw new Error("not shown " + sid)
}
const streams = (st) => st.panels.reduce((a, p) => a + p.core.streamsOpen, 0)

try {
  const idle = rss()
  const ids = []
  const opens = []
  for (let i = 0; i < 3; i++) {
    const r = await newSession(ids)
    ids.push(r.sid)
    opens.push(r.ms)
    await sleep(3000)
  }
  const oneGroupThreeTabs = { rss: rss(), host: await state() }
  await command(page, "View: Move Editor into Right Group")
  await sleep(1500)
  await command(page, "View: Move Editor into Right Group")
  await sleep(1500)
  await command(page, "View: Focus First Editor Group")
  await sleep(800)
  await command(page, "View: Move Editor into Right Group")
  await sleep(6000)
  const three = await state()
  const threeVisible = { visible: three.panels.filter((p) => p.visible).length, streamsOpen: streams(three), rss: rss() }
  // A 4th session in group 3 shares the group with the 3rd: alternate them 10 times.
  const d = await newSession(ids)
  ids.push(d.sid)
  await sleep(3000)
  const reshows = []
  const rssTrend = []
  for (let i = 0; i < 10; i++) {
    reshows.push(await showSession(i % 2 === 0 ? ids[2] : ids[3]))
    await sleep(1500)
    if (i === 0 || i === 9) rssTrend.push(rss().totalMB)
  }
  const after = await state()
  const visibleAfter = after.panels.filter((p) => p.visible).length
  const hidden = after.panels.filter((p) => !p.visible)
  run.record("no-stream-leak", streams(after) <= visibleAfter ? "PASS" : "FAIL", {
    visiblePanels: visibleAfter,
    openEventStreams: streams(after),
    perPanel: after.panels.map((p) => ({ visible: p.visible, streamsOpen: p.core.streamsOpen, generations: p.core.generations, retired: p.core.retired })),
  })
  run.record("hidden-releases-requests", hidden.length > 0 && hidden.every((p) => p.inflight === 0 && p.generation === 0) ? "PASS" : "FAIL", {
    hiddenPanels: hidden.length,
    inflight: hidden.map((p) => p.inflight),
  })
  run.setEnv({
    method: "ps RSS summed per Electron --type of processes whose command line contains this test profile; webviews run in renderer processes",
    idle,
    oneGroupThreeTabs: { rss: oneGroupThreeTabs.rss, visible: oneGroupThreeTabs.host.panels.filter((p) => p.visible).length, streams: streams(oneGroupThreeTabs.host) },
    threeVisible,
    openMs: opens,
    reshowMs: reshows,
    rssTotalMBFirstVsLastCycle: rssTrend,
  })
} catch (e) {
  run.record("run", "FAIL", { error: String(e?.message ?? e).slice(0, 500) })
} finally {
  await app.close().catch(() => {})
  process.exit(run.finish())
}
