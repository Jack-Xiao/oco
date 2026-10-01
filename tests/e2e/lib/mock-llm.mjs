#!/usr/bin/env node
// Scripted OpenAI-compatible chat model for fast, deterministic E2E runs (OCO_E2E_MODEL=mock).
// It recognises the fixed prompts the suites send (bash / question / read / write tool requests, exact
// replies, long numbered lists) and answers them the way a compliant model would, streaming over SSE.
// Runs bound to 127.0.0.1 only; it never forwards anything upstream.
import http from "node:http"
import path from "node:path"

const PORT = Number(process.env.OCO_MOCK_LLM_PORT ?? 4518)
// Delay between streamed lines of long answers; keeps a run "busy" long enough for stop/switch tests.
const LINE_MS = Number(process.env.OCO_MOCK_LINE_MS ?? 60)
const SENTENCE_MS = Number(process.env.OCO_MOCK_SENTENCE_MS ?? 150)
const FIRST_MS = Number(process.env.OCO_MOCK_FIRST_MS ?? 150)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const text = (c) => (typeof c === "string" ? c : Array.isArray(c) ? c.map((p) => p?.text ?? "").join("") : "")

/** Decide the next assistant step from the conversation. Returns { tool, args } or { lines }. */
export function plan(body) {
  const msgs = body.messages ?? []
  const tools = new Set((body.tools ?? []).map((t) => t.function?.name))
  const system = msgs.filter((m) => m.role === "system").map((m) => text(m.content)).join("\n")
  const users = msgs.filter((m) => m.role === "user")
  const prompt = text(users.at(-1)?.content)
  const last = msgs.at(-1)
  const cwd = /Working directory: *(\S+)/.exec(system)?.[1] ?? process.cwd()
  const abs = (p) => (path.isAbsolute(p) ? p : path.join(cwd, p))

  // Auxiliary calls (session title, summaries) have no tools; answer briefly.
  // Titles echo the prompt so every session gets a distinct, recognisable tab label.
  if (!tools.size) return { lines: [/title/i.test(system) ? "Mock: " + (prompt.replace(/\s+/g, " ").trim().slice(0, 40) || "session") : "OK"] }

  if (last?.role === "tool") {
    const out = text(last.content).trim()
    if (/question tool/i.test(prompt)) {
      const answer = [...out.matchAll(/="([^"]+)"/g)].at(-1)?.[1] ?? (/\bblue\b/i.test(out) ? "blue" : "red")
      return { lines: [answer] }
    }
    if (/bash tool/i.test(prompt)) return { lines: [out.split("\n").filter(Boolean).at(-1) ?? out] }
    return { lines: ["OK"] }
  }

  let m
  if (tools.has("bash") && (m = /use the bash tool to run(?: exactly)?(?: this command)?:\s*(.+?)(?:\s\.(?:\s|$)| and tell|$)/im.exec(prompt)))
    return { tool: "bash", args: { command: m[1], description: "Run the requested command" } }
  // "Use the task tool with the explore agent: <description>" starts a subagent (child session).
  if (tools.has("task") && (m = /use the task tool with the (\S+) agent:\s*(.+)$/im.exec(prompt)))
    return { tool: "task", args: { subagent_type: m[1], description: m[2].trim(), prompt: "Reply with exactly this line and nothing else: subagent-ok" } }
  if (tools.has("question") && /question tool/i.test(prompt))
    return {
      tool: "question",
      args: {
        questions: [
          {
            question: "Which color do you prefer?",
            header: "Color",
            options: [
              { label: "red", description: "Red" },
              { label: "blue", description: "Blue" },
            ],
          },
        ],
      },
    }
  if (tools.has("write") && (m = /Use the write tool to create the file (\S+) containing the single line (\S+?)\./i.exec(prompt)))
    return { tool: "write", args: { filePath: abs(m[1]), content: m[2] + "\n" } }
  if (tools.has("read") && (m = /Use the read tool on (\S+) with offset (\d+) and limit (\d+)/i.exec(prompt)))
    return { tool: "read", args: { filePath: abs(m[1]), offset: Number(m[2]), limit: Number(m[3]) } }
  if ((m = /Reply with exactly this line and nothing else:\s*(.+)$/im.exec(prompt))) return { lines: [m[1].trim()] }

  const n = Number(/(\d+) numbered sentences|from 1 to (\d+)|1 to (\d+)/i.exec(prompt)?.slice(1).find(Boolean) ?? 0)
  // "in one paragraph": plain words, no list markup, so the rendered text equals the raw text.
  if (n > 0 && /one paragraph/i.test(prompt)) return { lines: Array.from({ length: n }, (_, i) => `word${i + 1}`), sep: " " }
  // Long "sentence" answers are what stop/close tests interrupt; stream them slower (300 lines ~ 45s) so a
  // test that polls host state (~1s per read) still sees the run busy.
  if (n > 0) return { lines: Array.from({ length: n }, (_, i) => `${i + 1}. Mock line ${i + 1}.`), lineMs: /sentence/i.test(prompt) ? SENTENCE_MS : LINE_MS }

  const tag = /TAG-[\w-]+/.exec(prompt)?.[0]
  return { lines: [tag ? `OK ${tag}` : "OK"] }
}

function chunk(res, id, delta, finish = null) {
  const c = { id, object: "chat.completion.chunk", created: Math.floor(Date.now() / 1000), model: "mock", choices: [{ index: 0, delta, finish_reason: finish }] }
  res.write(`data: ${JSON.stringify(c)}\n\n`)
}

async function complete(req, res, body) {
  const step = plan(body)
  const id = "chatcmpl-" + Math.random().toString(36).slice(2)
  let closed = false
  res.on("close", () => (closed = true))
  res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" })
  await sleep(FIRST_MS)
  chunk(res, id, { role: "assistant", content: "" })
  if (step.tool) {
    const call = { index: 0, id: "call_" + Math.random().toString(36).slice(2), type: "function", function: { name: step.tool, arguments: JSON.stringify(step.args) } }
    chunk(res, id, { tool_calls: [call] })
    chunk(res, id, {}, "tool_calls")
  } else {
    // Long answers start with a reasoning block, as the real test model does. OpenCode stores a part's
    // text when the part ends, so tests that wait for "> 200 chars stored" see it while text still streams.
    if (step.lines.length > 1) {
      for (let i = 0; i < 6; i++) chunk(res, id, { reasoning_content: `Planning the list, step ${i + 1}: keep every item short and numbered in order. ` })
      await sleep(LINE_MS)
    }
    for (const [i, line] of step.lines.entries()) {
      if (closed) return
      chunk(res, id, { content: (i ? step.sep ?? "\n" : "") + line })
      if (step.lines.length > 1) await sleep(step.lineMs ?? LINE_MS)
    }
    chunk(res, id, {}, "stop")
  }
  if (closed) return
  res.write(`data: ${JSON.stringify({ id, object: "chat.completion.chunk", created: Math.floor(Date.now() / 1000), model: "mock", choices: [], usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 } })}\n\n`)
  res.end("data: [DONE]\n\n")
}

export function createMockServer() {
  return http.createServer((req, res) => {
    if (req.method === "GET" && req.url?.endsWith("/models")) {
      res.writeHead(200, { "content-type": "application/json" })
      return res.end(JSON.stringify({ object: "list", data: [{ id: "mock", object: "model" }] }))
    }
    if (req.method !== "POST" || !req.url?.endsWith("/chat/completions")) {
      res.writeHead(404)
      return res.end()
    }
    let raw = ""
    req.on("data", (d) => (raw += d))
    req.on("end", () => {
      let body
      try {
        body = JSON.parse(raw)
      } catch {
        res.writeHead(400)
        return res.end()
      }
      complete(req, res, body).catch(() => res.destroy())
    })
  })
}

if (import.meta.url === `file://${process.argv[1]}`) {
  createMockServer().listen(PORT, "127.0.0.1", () => console.log(`mock LLM listening on http://127.0.0.1:${PORT}/v1`))
}
