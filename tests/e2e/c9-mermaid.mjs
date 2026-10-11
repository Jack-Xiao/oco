#!/usr/bin/env node
// E2E test c9-mermaid: ```mermaid blocks in an assistant reply render as SVG in the chat webview.
// Evidence: docs/evidence/c9-mermaid-2026-10-11.md. Needs the mock model server started with
// OCO_E2E_MODEL=mock OCO_MOCK_LLM_EXTERNAL=1 scripts/test-server.sh: this suite binds the mock LLM port itself
// (wrapping the standard scripted mock) so one prompt can answer with a fixed multi-line markdown reply.
import { fileURLToPath } from "node:url"
import { createRun } from "./lib/results.mjs"
import { createMockServer } from "./lib/mock-llm.mjs"
import { launch, command, waitForChatFrame, frameSession, sleep, runShot, waitUntil } from "./vscode.mjs"
import { api, MODEL, waitReply } from "./server.mjs"
import fs from "node:fs"

const REQUIRED = ["flowchart-rendered", "sequence-rendered", "svg-size", "source-hidden", "error-block", "copy-button", "no-csp-errors", "lazy-chunk"]
const run = createRun({ suite: "c9-mermaid", required: REQUIRED, scriptPath: fileURLToPath(import.meta.url) })
const health = await api("GET", "/global/health").catch(() => null)
run.setEnv({ serverVersion: health?.version ?? null, modelMode: MODEL.mode, fixture: "local mock LLM answers prompt C9-MERMAID with 2 valid mermaid blocks + 1 invalid" })

const REPLY = [
  "Here are the diagrams.",
  "",
  "```mermaid",
  "flowchart TD",
  "  A[Start] --> B{Ok?}",
  "  B -->|yes| C[Done]",
  "  B -->|no| D[Retry]",
  "```",
  "",
  "```mermaid",
  "sequenceDiagram",
  "  participant U as User",
  "  participant S as Server",
  "  U->>S: ping",
  "  S-->>U: pong",
  "```",
  "",
  "```mermaid",
  "flowchart TD",
  "  A[broken --> ??? ]]] ((",
  "  -->-->",
  "```",
  "",
  "Done.",
].join("\n")

// Wrap the standard scripted mock: only the C9-MERMAID prompt (with tools = the real run, not title calls) is special.
const mock = createMockServer()
const base = mock.listeners("request")[0]
mock.removeAllListeners("request")
mock.on("request", (req, res) => {
  if (req.method !== "POST" || !req.url?.endsWith("/chat/completions")) return base(req, res)
  let raw = ""
  req.on("data", (d) => (raw += d))
  req.on("end", async () => {
    let body
    try {
      body = JSON.parse(raw)
    } catch {
      return base(Object.assign(req, { __raw: raw }), res)
    }
    const users = (body.messages ?? []).filter((m) => m.role === "user")
    const last = users.at(-1)?.content
    const prompt = typeof last === "string" ? last : (last ?? []).map((p) => p?.text ?? "").join("")
    if (!/C9-MERMAID/.test(prompt) || !(body.tools ?? []).length || body.messages.at(-1)?.role === "tool") {
      // replay the consumed body into the standard handler
      const { Readable } = await import("node:stream")
      const replay = Object.assign(Readable.from([raw]), { method: req.method, url: req.url, headers: req.headers })
      return base(replay, res)
    }
    const id = "chatcmpl-c9"
    const send = (delta, finish = null) => res.write(`data: ${JSON.stringify({ id, object: "chat.completion.chunk", created: Math.floor(Date.now() / 1000), model: "mock", choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`)
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" })
    send({ role: "assistant", content: "" })
    for (const line of REPLY.split("\n")) {
      send({ content: line + "\n" })
      await sleep(30)
    }
    send({}, "stop")
    res.write(`data: ${JSON.stringify({ id, object: "chat.completion.chunk", created: Math.floor(Date.now() / 1000), model: "mock", choices: [], usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 } })}\n\n`)
    res.end("data: [DONE]\n\n")
  })
})
await new Promise((r, j) => mock.once("error", j).listen(Number(process.env.OCO_MOCK_LLM_PORT ?? 4518), "127.0.0.1", r))

let app = null
let page = null
const cspViolations = []
const pageErrors = []
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
  const launched = await launch({ profile: "c9-mermaid", run })
  app = launched.app
  page = launched.page
  run.installCrashHandlers(() => app?.close())
  page.on("pageerror", (e) => pageErrors.push(String(e.message).slice(0, 300)))
  page.on("console", (m) => {
    const t = m.text()
    if (/Content Security Policy|Refused to/i.test(t)) cspViolations.push(t.slice(0, 300))
    else if (m.type() === "error" && /mermaid/i.test(t)) pageErrors.push(t.slice(0, 300))
  })
  await command(page, "oco: New Session")
  const [frame] = await waitForChatFrame(page, 1, 90000, '[data-component="prompt-input"]')
  const sid = await frameSession(frame)
  await frame.getByText(MODEL.label).first().waitFor({ timeout: 60000 })
  const t0 = Date.now()
  while (Date.now() - t0 < 10000 && (await frame.evaluate(() => document.documentElement.dataset.ocoModel)) !== "ready") await sleep(100)
  await sleep(500)
  // Count securitypolicyviolation events and uncaught errors inside the webview itself.
  await frame.evaluate(() => {
    window.__c9 = { csp: [], errors: [], chunks: [] }
    document.addEventListener("securitypolicyviolation", (e) => window.__c9.csp.push(`${e.violatedDirective} ${e.blockedURI}`))
    window.addEventListener("error", (e) => window.__c9.errors.push(String(e.message)))
    window.addEventListener("unhandledrejection", (e) => window.__c9.errors.push("rejection: " + String(e.reason?.message ?? e.reason)))
  })
  const chunksBefore = await frame.evaluate(() => performance.getEntriesByType("resource").filter((r) => /mermaid/i.test(r.name)).length)

  const roBaseline = await frame.evaluate(() => window.__c9.errors.filter((m) => /ResizeObserver loop/.test(m)).length)
  const input = frame.locator('[data-component="prompt-input"]')
  await input.click()
  await page.keyboard.type("C9-MERMAID please draw diagrams", { delay: 4 })
  await sleep(200)
  await page.keyboard.press("Enter")
  const reply = await waitReply(sid, 90000)
  if (!reply) throw new Error("assistant reply did not complete")
  run.setEnv({ sessionId: sid })

  const blocks = frame.locator('[data-component="markdown-code"]:has(code.language-mermaid)')
  await waitUntil(async () => (await blocks.count()) >= 3, 30000, 200)
  await waitUntil(async () => frame.evaluate(() => [...document.querySelectorAll('[data-component="markdown-code"][data-mermaid]')].length >= 3), 45000, 300)
  await sleep(500)
  await frame.locator('[data-component="markdown-code"]').first().scrollIntoViewIfNeeded().catch(() => {})
  const info = () =>
    frame.evaluate(() =>
      [...document.querySelectorAll('[data-component="markdown-code"]:has(code.language-mermaid)')].map((w) => {
        const svg = w.querySelector('[data-slot="markdown-mermaid"] svg')
        const pre = w.querySelector("pre")
        const r = svg?.getBoundingClientRect()
        const cs = pre ? getComputedStyle(pre) : null
        const pr = pre?.getBoundingClientRect()
        return {
          state: w.getAttribute("data-mermaid"),
          hasSvg: !!svg,
          w: r ? Math.round(r.width) : 0,
          h: r ? Math.round(r.height) : 0,
          preHidden: !!pre && (cs.display === "none" || cs.visibility === "hidden" || (pr.width === 0 && pr.height === 0)),
          preDisplay: cs?.display,
          source: (pre?.textContent ?? "").slice(0, 60),
          copy: !!w.querySelector('[data-component="markdown-copy-button"], [data-slot="markdown-copy-button"], button[aria-label*="opy" i]'),
          text: (w.querySelector('[data-slot="markdown-mermaid"]')?.textContent ?? "").slice(0, 80),
        }
      }),
    )
  let blocksInfo = await info()
  await runShot(page, run, "1-rendered")
  run.setEnv({ mermaidBlocks: blocksInfo.map((b) => ({ state: b.state, hasSvg: b.hasSvg, w: b.w, h: b.h })) })
  const [flow, seq, bad] = blocksInfo

  await guard("flowchart-rendered", async () => record("flowchart-rendered", flow?.state === "rendered" && flow.hasSvg ? "PASS" : "FAIL", flow))
  await guard("sequence-rendered", async () => record("sequence-rendered", seq?.state === "rendered" && seq.hasSvg ? "PASS" : "FAIL", seq))
  await guard("svg-size", async () => record("svg-size", flow?.w > 0 && flow?.h > 0 && seq?.w > 0 && seq?.h > 0 ? "PASS" : "FAIL", { flow: [flow?.w, flow?.h], seq: [seq?.w, seq?.h] }))
  await guard("source-hidden", async () => record("source-hidden", flow?.preHidden && seq?.preHidden ? "PASS" : "FAIL", { flow: flow?.preDisplay, seq: seq?.preDisplay, flowHidden: flow?.preHidden, seqHidden: seq?.preHidden }))
  await guard("error-block", async () => {
    const visible = await frame.locator('[data-component="markdown-code"][data-mermaid="error"] pre').first().isVisible().catch(() => false)
    record("error-block", bad?.state === "error" && !bad.hasSvg && visible && /flowchart|-->/.test(bad.source) ? "PASS" : "FAIL", { ...bad, preVisible: visible })
  })
  await guard("copy-button", async () => {
    const n = await frame.locator('[data-component="markdown-code"]:has(code.language-mermaid) [data-slot="markdown-copy-button"], [data-component="markdown-code"]:has(code.language-mermaid) [data-component="markdown-copy-button"]').count()
    record("copy-button", n >= 3 ? "PASS" : "FAIL", { copyButtons: n, perBlock: blocksInfo.map((b) => b.copy) })
  })
  await guard("lazy-chunk", async () => {
    const chunks = await frame.evaluate(() => performance.getEntriesByType("resource").filter((r) => /mermaid/i.test(r.name)).map((r) => r.name.split("/").pop()))
    record("lazy-chunk", chunks.some((c) => /^mermaid\.core-.*\.js$/.test(c)) && chunksBefore === 0 ? "PASS" : "FAIL", { before: chunksBefore, chunks })
  })

  // Optional: switch the VS Code colour theme; the SVGs must survive (re-rendered for the new scheme).
  await guard("theme-switch", async () => {
    const readTheme = () => frame.evaluate(() => document.documentElement.dataset.colorScheme ?? document.body.className)
    const before = await readTheme()
    const settings = JSON.parse(fs.readFileSync(launched.settingsFile, "utf8"))
    const light = /dark/i.test(String(before)) || !/light/i.test(String(before))
    settings["workbench.colorTheme"] = light ? "Default Light Modern" : "Default Dark Modern"
    fs.writeFileSync(launched.settingsFile, JSON.stringify(settings, null, 2))
    await sleep(3000)
    const after = await readTheme()
    await waitUntil(async () => (await info()).filter((b) => b.state === "rendered").length >= 2, 15000, 300)
    blocksInfo = await info()
    await runShot(page, run, "2-theme-switched")
    const ok = blocksInfo.filter((b) => b.state === "rendered" && b.hasSvg && b.w > 0).length >= 2
    record("theme-switch", ok ? "PASS" : "FAIL", { before, after, changed: before !== after, states: blocksInfo.map((b) => b.state) })
  })

  await guard("no-csp-errors", async () => {
    const inFrame = await frame.evaluate(() => window.__c9)
    // "ResizeObserver loop completed..." is a benign browser notice (spec: not an error); counted, not failed.
    const ro = inFrame.errors.filter((m) => /ResizeObserver loop/.test(m)).length
    const errors = inFrame.errors.filter((m) => !/ResizeObserver loop/.test(m))
    const all = { cspHost: cspViolations, cspFrame: inFrame.csp, frameErrors: errors, pageErrors, resizeObserverNotices: { baselineBeforePrompt: roBaseline, total: ro } }
    record("no-csp-errors", cspViolations.length + inFrame.csp.length + errors.length + pageErrors.length === 0 ? "PASS" : "FAIL", all)
  })
} catch (e) {
  run.record("run", "FAIL", { error: String(e?.message ?? e).slice(0, 500) })
  if (page) await runShot(page, run, "error").catch(() => {})
} finally {
  if (app) await app.close().catch(() => {})
  mock.close()
  process.exit(run.finish())
}
