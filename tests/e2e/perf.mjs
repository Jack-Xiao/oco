// P0 performance baseline: panel open / re-show latency and process memory with 1 and 3 panels.
import fs from "node:fs"
import path from "node:path"
import { execSync } from "node:child_process"
import { launch, command, chatFrames, frameSession, sleep, evidenceDir } from "./vscode.mjs"
const { app, page } = await launch({ profile: "perf" })
const rss = () => {
  const out = execSync("ps -axo rss=,command=").toString().split("\n").filter((l) => l.includes(".oco-test/vscode/perf"))
  const mb = (f) => Math.round(out.filter(f).reduce((a, l) => a + Number(l.trim().split(/\s+/)[0]), 0) / 1024)
  return { totalMB: mb(() => true), rendererMB: mb((l) => l.includes("--type=renderer")), extHostMB: mb((l) => l.includes("extensionHost") || l.includes("--type=utility")) }
}
async function visibleSession() {
  for (const f of await chatFrames(page)) {
    const ok = await f.evaluate(() => document.visibilityState === "visible" && !!document.querySelector('[data-component="prompt-input"]')).catch(() => false)
    if (ok) return f
  }
}
async function timed(fn, want) {
  const t0 = Date.now(); await fn()
  while (Date.now() - t0 < 60000) {
    const f = await visibleSession()
    if (f) { const s = await frameSession(f); if (typeof want === "function" ? want(s) : s === want) return { ms: Date.now() - t0, sid: s } }
    await sleep(50)
  }
  return { ms: null }
}
const r = { opens: [], reshows: [] }
try {
  await sleep(1000)
  r.idleBeforeMB = rss()
  const ids = []
  for (let i = 0; i < 3; i++) {
    const res = await timed(() => command(page, "oco: New Session"), (s) => !ids.includes(s))
    r.opens.push(res.ms)
    ids.push(res.sid)
    await sleep(4000)
    if (i === 0) r.oneOpenMB = rss()
  }
  r.threeOpenMB = rss()
  for (const sid of [ids[0], ids[1], ids[2], ids[0]]) {
    r.reshows.push((await timed(async () => { await command(page, "oco: Open Session"); await sleep(900); await page.keyboard.type(sid); await sleep(300); await page.keyboard.press("Enter") }, sid)).ms)
    await sleep(2000)
  }
  r.afterReshowsMB = rss()
  r.note = "open/reshow ms = palette command until the official composer is visible (includes ~1.5s of scripted palette typing)"
} finally {
  fs.writeFileSync(path.join(evidenceDir, "perf-results.json"), JSON.stringify({ at: new Date().toISOString(), ...r }, null, 2))
  console.log(JSON.stringify(r, null, 1))
  await app.close()
}
