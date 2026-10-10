#!/usr/bin/env node
// E2E test c7-result-card: 每会话结果卡（侧栏 done 行摘要 / 标已读 / Diff，运行视图结果卡）。
// 依据 docs/evidence/cockpit-result-card-2026-10-10.md。需 mock 模型（write 工具步骤）。
import http from "node:http"
import { fileURLToPath } from "node:url"
import { createRun } from "./lib/results.mjs"
import { launch, command, waitUntil, chatFrames, frameSession, runShot, clearNotifications } from "./vscode.mjs"
import { api, MODEL, waitIdle } from "./server.mjs"
import { sessionsFrame } from "./lib/sessions-web.mjs"

const REQUIRED = ["done-row-summary", "done-row-mark-read", "done-row-diff", "runtime-result-card", "runtime-file-diff", "runtime-all-diffs"]
const run = createRun({ suite: "c7-result-card", required: REQUIRED, scriptPath: fileURLToPath(import.meta.url) })
const health = await api("GET", "/global/health").catch(() => null)
run.setEnv({ serverVersion: health?.version ?? null, modelMode: MODEL.mode, fixture: "last user summary.diffs via GET message and message.updated SSE; session.diff remains empty" })

// The test server's snapshot diff is always empty here (see c2-diff-unavailable: server drops the snapshot blob), so
// no real session.diff ever carries files. This pass-through proxy forwards everything to the real server and injects
// last user summary.diffs in message.updated SSE and GET message for both clients.
// Every message, tool result and status still comes from the test server. This tests rendering/routing,
// not snapshot generation (the server's missing snapshot blob is a separate C2 limitation).
const TARGET = new URL(process.env.OCO_TEST_URL ?? "http://127.0.0.1:4517")
const eventStreams = new Set()
const globalStreams = new Set() // /global/event wraps each event as {directory, payload}
const fixtureDiff = (name) => [{ file: `${name}.txt`, additions: 1, deletions: 0, status: "added", patch: `Index: ${name}.txt\n===================================================================\n--- ${name}.txt\n+++ ${name}.txt\n@@ -0,0 +1,1 @@\n+hello\n` }]
const fixtures = new Map() // sessionID -> FileDiff[]
function injectDiff(sessionID, name) {
  const diff = fixtureDiff(name)
  fixtures.set(sessionID, diff)
  return eventStreams.size
}
let summaryEvents = 0
const proxy = http.createServer((req, res) => {
  const m = req.method === "GET" && /^\/session\/([^/?]+)\/diff/.exec(req.url ?? "")
  if (m && fixtures.has(m[1])) {
    res.writeHead(200, { "content-type": "application/json" })
    return res.end(JSON.stringify(fixtures.get(m[1])))
  }
  const up = http.request({ host: TARGET.hostname, port: TARGET.port, path: req.url, method: req.method, headers: { ...req.headers, host: TARGET.host, "accept-encoding": "identity" } }, (r) => {
    const messageMatch = req.method === "GET" && /^\/session\/([^/?]+)\/message(?:\?|$)/.exec(req.url ?? "")
    if (messageMatch && fixtures.has(messageMatch[1])) {
      let body = ""
      r.on("data", (chunk) => { body += chunk.toString("utf8") })
      r.on("end", () => {
        try {
          const messages = JSON.parse(body)
          const user = messages.findLast((m) => m.info?.role === "user")
          if (!user) throw new Error("fixture session has no user message")
          user.info.summary = { ...user.info.summary, diffs: fixtures.get(messageMatch[1]) }
          res.writeHead(r.statusCode ?? 502, { "content-type": "application/json" })
          res.end(JSON.stringify(messages))
        } catch (error) {
          console.error("c7 message fixture:", String(error.message).slice(0, 160), "encoding:", r.headers["content-encoding"] ?? "identity")
          res.writeHead(502, { "content-type": "application/json" })
          res.end(JSON.stringify({ error: "c7 message fixture injection failed" }))
        }
      })
      return
    }
    res.writeHead(r.statusCode ?? 502, r.headers)
    const isGlobal = req.url?.startsWith("/global/event")
    if (req.url?.startsWith("/event") || isGlobal) {
      const set = isGlobal ? globalStreams : eventStreams
      set.add(res)
      res.on("close", () => set.delete(res))
    }
    if (req.url?.startsWith("/event") || isGlobal) {
      // Preserve real empty session.diff events: only user summary.diffs is authoritative on this upstream.
      let buf = ""
      r.on("data", (chunk) => {
        buf += chunk.toString("utf8")
        const parts = buf.split("\n\n")
        buf = parts.pop() ?? ""
        for (const part of parts) {
          const transformed = part.replace(/^data: (.+)$/m, (line, data) => {
            try {
              const value = JSON.parse(data)
              const event = isGlobal ? value.payload : value
              const info = event?.properties?.info
              if (event?.type === "message.updated" && info?.role === "user" && info.summary && fixtures.has(info.sessionID)) {
                info.summary.diffs = fixtures.get(info.sessionID)
                summaryEvents++
                return `data: ${JSON.stringify(value)}`
              }
            } catch {}
            return line
          })
          res.write(transformed + "\n\n")
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

let app = null
let page = null
const browserErrors = []
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
    record(name, "FAIL", { error: String(e?.message ?? e).slice(0, 400), browserErrors: browserErrors.slice(-3) })
    if (page) await runShot(page, run, `err-${name}`).catch(() => {})
  }
}

try {
  for (const p of (await api("GET", "/permission")) ?? []) await api("POST", `/permission/${p.id}/reply`, { reply: "reject" }).catch(() => {})
  const launched = await launch({ profile: "c7-result-card", run, settings: { "oco.serverUrl": proxyUrl } })
  app = launched.app
  page = launched.page
  page.on("pageerror", (error) => browserErrors.push(String(error.message).slice(0, 500)))
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text().slice(0, 500))
  })
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
    const readSummary = async () => ((await row.locator(".inbox-summary").first().innerText().catch(() => "")) ?? "").replace(/\s+/g, " ").trim()
    if (appeared) await waitUntil(async () => /\bfiles?\b/.test(await readSummary()), 10000, 200)
    const summary = appeared ? await readSummary() : ""
    await runShot(page, run, "1-done-row")
    // mock replies "OK" after the tool result; summary = "1 file · Ns · $x · OK"
    const ok = s1.idle && appeared && /\bfiles?\b/.test(summary) && /OK/.test(summary)
    record("done-row-summary", ok ? "PASS" : "FAIL", { idle: s1.idle, appeared, summary, summaryEvents })
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
    const filename = `c7-b-${rand}.txt`
    const reviewFile = f?.locator('[data-component="session-review-v2"]').getByText(filename, { exact: true }).first()
    const hasFile = reviewFile ? await waitUntil(async () => await reviewFile.isVisible(), 15000, 200) : false
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
    else if (review) record("done-row-diff", hasFile ? "PASS" : "FAIL", { routed: !!routed, review, hasFile, filename })
    else record("done-row-diff", "FAIL", { routed: !!routed, names: f ? await f.evaluate(() => window.__c7).catch(() => null) : null, browserErrors: browserErrors.slice(-3) })
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
    const modeAfter = await mode()
    const card = f.locator("[data-oco-runtime-card-result]").first()
    const shown = await waitUntil(async () => (await card.count()) > 0, 30000, 300)
    const text = shown ? ((await card.innerText().catch(() => "")) ?? "").replace(/\s+/g, " ").trim() : ""
    await runShot(page, run, "4-runtime-card")
    let files = 0
    if (shown && /changed/.test(text)) {
      await f.locator("[data-oco-runtime-card-expand]").first().click()
      await waitUntil(async () => (await f.locator("[data-oco-runtime-card-result-list] [data-oco-runtime-card-result-file]").count()) > 0, 10000, 200)
      files = await f.locator("[data-oco-runtime-card-result-list] [data-oco-runtime-card-result-file]").count()
      await runShot(page, run, "4-runtime-card-open")
    }
    const filename = `c7-b-${rand}.txt`
    const listedFile = f.locator(`[data-oco-runtime-card-result-file="${filename}"]`)
    const matchesFile = await listedFile.count() === 1
    const counts = /\+1/.test(text) && /−0/.test(text)
    record("runtime-result-card", shown && /changed/.test(text) && files === 1 && matchesFile && counts ? "PASS" : "FAIL", { shown, modeAfter, text: text.slice(0, 120), files, matchesFile, counts })
  })

  const targetFrame = async () => {
    for (const f of await chatFrames(page)) if (await frameSession(f) === s2?.id) return f
    throw new Error("result session frame missing")
  }
  const reviewShowsPatch = async (f) => {
    const filename = `c7-b-${rand}.txt`
    const name = f.locator('[data-slot="session-review-v2-file-name"]').first()
    const matched = await waitUntil(async () => (await name.innerText().catch(() => "")) === filename, 15000, 200)
    const diff = f.locator('[data-slot="session-review-v2-diff-scroll"]')
    // The diff viewer renders its lines in a shadow root; container.innerText excludes them.
    const patchText = () => diff.evaluate((el) => {
      const read = (root) => (root.textContent ?? "") + [...root.querySelectorAll("*")].map((node) => node.shadowRoot ? read(node.shadowRoot) : "").join("")
      return read(el)
    }).catch(() => "")
    const patchVisible = await waitUntil(async () => /hello/.test(await patchText()), 15000, 200)
    return { filename, matched: !!matched, patchVisible: !!patchVisible, runtimeHidden: await f.locator("[data-oco-runtime]").count() === 0, browserErrors: browserErrors.slice(-2) }
  }
  await guard("runtime-file-diff", async () => {
    const f = await targetFrame()
    await f.locator(`[data-oco-runtime-card-result-file="c7-b-${rand}.txt"]`).click()
    const result = await reviewShowsPatch(f)
    record("runtime-file-diff", result.matched && result.patchVisible && result.runtimeHidden ? "PASS" : "FAIL", result)
  })
  await guard("runtime-all-diffs", async () => {
    const f = await targetFrame()
    await f.locator('[data-oco-view="runtime"]').first().click()
    await f.locator("[data-oco-runtime-card-result-open]").first().click()
    const result = await reviewShowsPatch(f)
    record("runtime-all-diffs", result.matched && result.patchVisible && result.runtimeHidden ? "PASS" : "FAIL", result)
  })
} catch (e) {
  run.record("run", "FAIL", { error: String(e?.message ?? e).slice(0, 500) })
  if (page) await runShot(page, run, "error").catch(() => {})
} finally {
  if (app) await app.close().catch(() => {})
  proxy.close()
  process.exit(run.finish())
}
