#!/usr/bin/env node
// E2E test c7-result-card: 每会话结果卡（侧栏 done 行摘要 / 标已读 / Diff，运行视图结果卡）。
// 依据 docs/evidence/cockpit-result-card-2026-10-10.md。需 mock 模型（write 工具步骤）。
import fs from "node:fs"
import path from "node:path"
import http from "node:http"
import { fileURLToPath } from "node:url"
import { createRun } from "./lib/results.mjs"
import { root, launch, command, waitUntil, chatFrames, frameSession, sleep, runShot, clearNotifications } from "./vscode.mjs"
import { api, MODEL, waitIdle } from "./server.mjs"
import { sessionsFrame } from "./lib/sessions-web.mjs"

const REQUIRED = ["done-row-summary", "done-row-mark-read", "done-row-diff", "runtime-result-card"]
const run = createRun({ suite: "c7-result-card", required: REQUIRED, scriptPath: fileURLToPath(import.meta.url) })
const health = await api("GET", "/global/health").catch(() => null)
run.setEnv({ serverVersion: health?.version ?? null, modelMode: MODEL.mode, fixture: "session.diff injected via pass-through proxy" })

// The test server's snapshot diff is always empty here (see c2-diff-unavailable: server drops the snapshot blob), so
// no real session.diff ever carries files. This pass-through proxy forwards everything to the real server and injects
// a fixture `session.diff` event (and serves it for GET /session/:id/diff). Everything else is the real chain.
const TARGET = new URL(process.env.OCO_TEST_URL ?? "http://127.0.0.1:4517")
const eventStreams = new Set()
const globalStreams = new Set() // /global/event wraps each event as {directory, payload}
const WORKSPACE = path.join(fs.realpathSync(path.join(root, ".oco-test")), "workspace")
const fixtureDiff = (name) => [{ file: `${name}.txt`, additions: 1, deletions: 0, status: "added", patch: `Index: ${name}.txt\n===================================================================\n--- ${name}.txt\n+++ ${name}.txt\n@@ -0,0 +1,1 @@\n+hello\n` }]
const fixtures = new Map() // sessionID -> FileDiff[]
function injectDiff(sessionID, name) {
  const diff = fixtureDiff(name)
  fixtures.set(sessionID, diff)
  const frame = `data: ${JSON.stringify({ type: "session.diff", properties: { sessionID, diff } })}\n\n`
  for (const res of eventStreams) res.write(frame)
  const event = { id: "evt_c7" + Date.now().toString(36), type: "session.diff", properties: { sessionID, diff } }
  const wrapped = `data: ${JSON.stringify({ directory: WORKSPACE, project: projectId, payload: event })}\n\n`
  for (const res of globalStreams) res.write(wrapped)
  return eventStreams.size
}
const seenPaths = new Set()
let sampleGlobal = null
let projectId = null
const proxy = http.createServer((req, res) => {
  seenPaths.add(req.method + " " + (req.url ?? "").replace(/ses_\w+/g, "SID").slice(0, 60))
  const m = req.method === "GET" && /^\/session\/([^/?]+)\/diff/.exec(req.url ?? "")
  if (m && fixtures.has(m[1])) {
    res.writeHead(200, { "content-type": "application/json" })
    return res.end(JSON.stringify(fixtures.get(m[1])))
  }
  const up = http.request({ host: TARGET.hostname, port: TARGET.port, path: req.url, method: req.method, headers: { ...req.headers, host: TARGET.host } }, (r) => {
    res.writeHead(r.statusCode ?? 502, r.headers)
    const isGlobal = req.url?.startsWith("/global/event")
    if (req.url?.startsWith("/event") || isGlobal) {
      const set = isGlobal ? globalStreams : eventStreams
      set.add(res)
      res.on("close", () => set.delete(res))
    }
    if (req.url?.startsWith("/event") || isGlobal) {
      // Drop the server's own (empty) session.diff frames for fixture sessions so they cannot overwrite the fixture.
      let buf = ""
      r.on("data", (chunk) => {
        buf += chunk.toString("utf8")
        const parts = buf.split("\n\n")
        buf = parts.pop() ?? ""
        for (const part of parts) {
          const sid = /"type":"session\.diff"/.test(part) ? /"sessionID":"([^"]+)"/.exec(part)?.[1] : null
          if (sid && fixtures.has(sid) && !part.includes('"file"')) continue
          if (isGlobal && !projectId) projectId = /"project":"([^"]+)"/.exec(part)?.[1] ?? null
          res.write(part + "\n\n")
        }
      })
      r.on("end", () => res.end())
    } else r.pipe(res)
  })
  up.on("error", () => res.destroy())
  req.pipe(up)
})
await new Promise((r) => proxy.listen(0, "127.0.0.1", r))
const proxyUrl = `http://127.0.0.1:${proxy.address().port}`

projectId = (await api("GET", "/project/current").catch(() => null))?.id ?? null
let app = null
let page = null
const rand = Math.random().toString(36).slice(2, 7)

let injectedTo = -1
async function runSession(name) {
  const s = await api("POST", "/session", { title: `c7-${name}-${rand}` })
  if (!s?.id) throw new Error("create session failed")
  await api("POST", `/session/${s.id}/prompt_async`, {
    model: { providerID: MODEL.providerID, modelID: MODEL.modelID },
    parts: [{ type: "text", text: `Use the write tool to create the file c7-${name}-${rand}.txt containing the single line hello${name}.` }],
  })
  // The write tool asks for "edit" permission; approve it through the API (the sidebar inbox is under test, not the approval).
  const end = Date.now() + 90000
  let idle = false
  while (Date.now() < end && !idle) {
    let injected = false
  for (const p of (await api("GET", "/permission")) ?? []) {
      if (p.sessionID !== s.id) continue
      if (!injected) {
        injectedTo = injectDiff(s.id, `c7-${name}-${rand}`)
        injected = true
      }
      await api("POST", `/permission/${p.id}/reply`, { reply: "once" }).catch(() => {})
    }
    idle = await waitIdle(s.id, 3000)
  }
  return { id: s.id, idle, injectedTo }
}

const record = (name, status, details) => run.record(name, status, details)
const guard = async (name, fn) => {
  try {
    await fn()
  } catch (e) {
    record(name, "FAIL", { error: String(e?.message ?? e).slice(0, 400) })
    if (page) await runShot(page, run, `err-${name}`).catch(() => {})
  }
}

try {
  for (const p of (await api("GET", "/permission")) ?? []) await api("POST", `/permission/${p.id}/reply`, { reply: "reject" }).catch(() => {})
  const launched = await launch({ profile: "c7-result-card", run, settings: { "oco.serverUrl": proxyUrl } })
  app = launched.app
  page = launched.page
  run.installCrashHandlers(() => app?.close())

  await command(page, "Focus on Sessions View")
  await clearNotifications(page)
  let frame = null
  await waitUntil(async () => (frame = await sessionsFrame(page)), 30000, 300)
  if (!frame) throw new Error("Sessions sidebar frame not found")
  const doneRow = (id) => frame.locator(`section[data-group="inbox"] .row[data-kind="done"][data-session-id="${id}"]`)
  const doneCount = () => frame.locator('section[data-group="inbox"] .row[data-kind="done"]').count()

  let s1 = null
  let s2 = null

  // 1. done-row-summary
  await guard("done-row-summary", async () => {
    s1 = await runSession("a")
    const row = doneRow(s1.id)
    const appeared = await waitUntil(async () => (await row.count()) > 0, 30000, 300)
    const summary = appeared ? ((await row.locator(".inbox-summary").first().innerText().catch(() => "")) ?? "").replace(/\s+/g, " ").trim() : ""
    await runShot(page, run, "1-done-row")
    // mock replies "OK" after the tool result; summary = "1 file · Ns · $x · OK"
    const ok = s1.idle && appeared && /\bfiles?\b/.test(summary) && /OK/.test(summary)
    record("done-row-summary", ok ? "PASS" : "FAIL", { idle: s1.idle, appeared, summary, injectedTo: s1.injectedTo })
  })

  // 2. done-row-mark-read
  await guard("done-row-mark-read", async () => {
    if (!s1) throw new Error("no s1")
    const before = await doneCount()
    const row = doneRow(s1.id)
    await row.hover()
    await row.locator('button[data-action="markRead"]').click()
    const gone = await waitUntil(async () => (await row.count()) === 0, 10000, 200)
    const after = await doneCount()
    record("done-row-mark-read", gone && after === before - 1 ? "PASS" : "FAIL", { before, after, gone })
  })

  // 3. done-row-diff
  await guard("done-row-diff", async () => {
    s2 = await runSession("b")
    const row = doneRow(s2.id)
    const appeared = await waitUntil(async () => (await row.count()) > 0, 30000, 300)
    if (!appeared) throw new Error("second done row did not appear")
    await row.hover()
    await row.locator('button[data-action="diff"]').click()
    let f = null
    const routed = await waitUntil(async () => {
      for (const c of await chatFrames(page)) {
        if ((await frameSession(c).catch(() => null)) === s2.id) return (f = c)
      }
      return false
    }, 30000, 300)
    await sleep(2500)
    if (f) injectDiff(s2.id, `c7-b-${rand}`) // the panel's app is subscribed now; replay the fixture event to it
    await runShot(page, run, "3-after-diff")
    // Review panel: no stable selector known. Probe a few candidates; otherwise report unverified.
    let review = null
    if (f) {
      review = await f
        .evaluate(() => {
          window.__c7 = [...new Set([...document.querySelectorAll("[data-component],[data-slot]")].map((e) => e.getAttribute("data-component") || e.getAttribute("data-slot")).filter((n) => /review|diff/i.test(n)))]
          const sel = ['[data-component="session-review-v2"]', '[data-component="session-review"]', '[data-slot="session-review-container"]', '[data-component="session-review-accordion"]']
          for (const s of sel) if (document.querySelector(s)) return s
          return null
        })
        .catch(() => null)
    }
    if (!routed) record("done-row-diff", "FAIL", { routed })
    else if (review) record("done-row-diff", "PASS", { routed, review })
    else record("done-row-diff", "NOT RUN", { routed, names: f ? await f.evaluate(() => window.__c7).catch(() => null) : null, unverified: "routing ok; no stable Review selector found (see screenshot 3-after-diff)" })
  })

  // 4. runtime-result-card
  await guard("runtime-result-card", async () => {
    if (!s2) throw new Error("no s2")
    let f = null
    await waitUntil(async () => {
      for (const c of await chatFrames(page)) if ((await frameSession(c).catch(() => null)) === s2.id) return (f = c)
      return false
    }, 30000, 300)
    if (!f) throw new Error("chat frame for s2 not found")
    if (!(await f.locator("[data-oco-runtime]").count())) {
      await f.locator('[data-oco-view="runtime"]').first().click()
      await f.locator("[data-oco-runtime]").waitFor({ state: "visible", timeout: 10000 })
    }
    const mode = () => f.locator("[data-oco-runtime]").getAttribute("data-oco-runtime-mode").catch(() => null)
    if ((await mode()) !== "live") await f.locator("[data-oco-runtime-replay-live]").click().catch(() => {})
    injectDiff(s2.id, `c7-b-${rand}`)
    const modeAfter = await mode()
    const card = f.locator("[data-oco-runtime-card-result]").first()
    const shown = await waitUntil(async () => (await card.count()) > 0, 30000, 300)
    const text = shown ? ((await card.innerText().catch(() => "")) ?? "").replace(/\s+/g, " ").trim() : ""
    await runShot(page, run, "4-runtime-card")
    let files = 0
    if (shown && /changed/.test(text)) {
      await f.locator("[data-oco-runtime-card-result-open]").first().click()
      await waitUntil(async () => (await f.locator("[data-oco-runtime-card-result-list] [data-oco-runtime-card-result-file]").count()) > 0, 10000, 200)
      files = await f.locator("[data-oco-runtime-card-result-list] [data-oco-runtime-card-result-file]").count()
      await runShot(page, run, "4-runtime-card-open")
    }
    record("runtime-result-card", shown && /changed/.test(text) && files >= 1 ? "PASS" : "FAIL", { shown, modeAfter, paths: [...seenPaths].filter((x) => /event|diff/.test(x)), projectId, streams: [eventStreams.size, globalStreams.size], facts: await f.evaluate(() => JSON.stringify(document.querySelector('[data-oco-runtime]')?.__ocoRuntime?.facts?.() ?? null).slice(0, 300)).catch(() => null), cardKind: await f.locator('[data-oco-runtime-card]').first().getAttribute('data-oco-runtime-card-kind').catch(() => null), text: text.slice(0, 120), files })
  })
} catch (e) {
  run.record("run", "FAIL", { error: String(e?.message ?? e).slice(0, 500) })
  if (page) await runShot(page, run, "error").catch(() => {})
} finally {
  if (app) await app.close().catch(() => {})
  proxy.close()
  process.exit(run.finish())
}
