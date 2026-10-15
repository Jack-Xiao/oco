// T017 resource baseline under ADR-007 (one main panel that switches in place + pinned panels kept alive).
// Method: real VS Code + test server; 10 sessions created through the API; the main panel plus 3 pinned
// panels spread over 3 editor groups; then the main panel switches through the other sessions 12 times.
// Measures per Electron process type RSS (this test profile only), host-side event streams per panel,
// in-place switch latency, and the RSS trend between the first and last switch.
//   panels-bounded       12 switches leave exactly 4 panels (1 main + 3 pinned): no panel per session
//   no-stream-leak       at most one host event stream per live panel; switching never adds generations
//   hidden-stays-alive   pinned panels keep their generation (no reload); in-flight requests are only their event stream
//   rss-bounded          total RSS after the last switch is within 25 % of the first switch (no steady growth)
import { execSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { createRun } from "./lib/results.mjs"
import { launch, command, chatFrames, sleep, hostState, userDataDirFor } from "./vscode.mjs"
import { api } from "./server.mjs"

const REQUIRED = ["panels-bounded", "no-stream-leak", "hidden-stays-alive", "rss-bounded"]
const run = createRun({ suite: "perf", required: REQUIRED, scriptPath: fileURLToPath(import.meta.url) })
const created = []
const { app, page, stateFile } = await launch({ profile: "perf", run })
run.installCrashHandlers(async () => {
  await app.close().catch(() => {})
  for (const id of created) await api("DELETE", `/session/${id}`).catch(() => {})
})
const state = () => hostState(page, stateFile)

// Match the processes of THIS profile by the exact --user-data-dir the launcher used. A hard-coded ".oco-test/vscode/perf"
// substring misses every process when vscode.mjs moves a long user-data-dir to a short temp path (userDataDirFor, e.g. a
// linked worktree or a long checkout path), and then the suite measures 0 MB.
const PROFILE_DIR = userDataDirFor("perf")
function rss() {
  const lines = execSync("ps -axo pid=,rss=,command=").toString().split("\n").filter((l) => l.includes(`--user-data-dir=${PROFILE_DIR} `) || l.endsWith(`--user-data-dir=${PROFILE_DIR}`) || l.includes(PROFILE_DIR + "/"))
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
/** Palette-open `sid` and time until a visible frame shows it with its composer. */
async function open(title, sid) {
  const t0 = Date.now()
  await command(page, title, { input: sid })
  while (Date.now() - t0 < 60000) {
    for (const f of await chatFrames(page)) {
      const ok = await f
        .evaluate((id) => (window.__OCO_DEBUG__?.sessionId?.() ?? window.__OCO_INIT__.binding.sessionId) === id && document.visibilityState === "visible" && !!document.querySelector('[data-component="prompt-input"]'), sid)
        .catch(() => false)
      if (ok) return Date.now() - t0
    }
    await sleep(50)
  }
  throw new Error("not shown " + sid)
}
const streams = (st) => st.panels.reduce((a, p) => a + (p.core.streamsOpen ?? 0), 0)

try {
  const idle = rss()
  for (let i = 0; i < 10; i++) created.push((await api("POST", "/session", { title: `oco-perf-${i}` })).id)
  const openMs = [await open("oco: Open Session", created[0])]
  for (let i = 1; i <= 3; i++) openMs.push(await open("oco: Open in New Panel", created[i]))
  // Spread the 4 tabs over 3 groups so 3 webviews are visible at once.
  await command(page, "View: Move Editor into Right Group")
  await sleep(1500)
  await command(page, "View: Move Editor into Right Group")
  await sleep(1500)
  await command(page, "View: Focus First Editor Group")
  await sleep(800)
  await command(page, "View: Move Editor into Right Group")
  await sleep(4000)
  const four = await state()
  const baseGenerations = Object.fromEntries(four.panels.map((p) => [p.sessionId, p.generation]))
  const fourPanels = { panels: four.panels.length, visible: four.panels.filter((p) => p.visible).length, streams: streams(four), rss: rss() }

  // The main panel switches through sessions 4..9 twice (in place, ADR-007).
  const switchMs = []
  const rssTrend = []
  for (let i = 0; i < 12; i++) {
    switchMs.push(await open("oco: Open Session", created[4 + (i % 6)]))
    await sleep(1200)
    if (i === 0 || i === 11) rssTrend.push(rss().totalMB)
  }
  await sleep(2000)
  const after = await state()
  const main = after.panels.filter((p) => p.role === "main")
  const pinned = after.panels.filter((p) => p.role === "pinned")
  run.record("panels-bounded", after.panels.length === 4 && main.length === 1 && pinned.length === 3 ? "PASS" : "FAIL", { panels: after.panels.length, main: main.length, pinned: pinned.length })
  run.record("no-stream-leak", streams(after) <= after.panels.length ? "PASS" : "FAIL", {
    panels: after.panels.length,
    openEventStreams: streams(after),
    perPanel: after.panels.map((p) => ({ role: p.role, visible: p.visible, streamsOpen: p.core.streamsOpen, generation: p.generation })),
  })
  const hidden = pinned.filter((p) => !p.visible)
  run.record("hidden-stays-alive", pinned.every((p) => p.generation === baseGenerations[p.sessionId]) && pinned.every((p) => p.inflight <= (p.core.streamsOpen ?? 0)) ? "PASS" : "FAIL", {
    hiddenPinned: hidden.length,
    generations: pinned.map((p) => [baseGenerations[p.sessionId], p.generation]),
    inflight: pinned.map((p) => p.inflight),
  })
  const growth = rssTrend.length === 2 ? (rssTrend[1] - rssTrend[0]) / rssTrend[0] : 1
  run.record("rss-bounded", growth <= 0.25 ? "PASS" : "FAIL", { firstSwitchMB: rssTrend[0], lastSwitchMB: rssTrend[1], growthPct: Math.round(growth * 1000) / 10 })
  const sorted = [...switchMs].sort((a, b) => a - b)
  run.setEnv({
    method: "ps RSS summed per Electron --type of processes whose command line contains this test profile; webviews run in renderer processes; latency = palette command to visible composer",
    idle,
    fourPanels,
    openMs,
    switchMs,
    switchMedianMs: sorted[Math.floor(sorted.length / 2)],
    after: rss(),
  })
} catch (e) {
  run.record("run", "FAIL", { error: String(e?.message ?? e).slice(0, 500) })
} finally {
  await app.close().catch(() => {})
  for (const id of created) await api("DELETE", `/session/${id}`).catch(() => {})
  process.exit(run.finish())
}
