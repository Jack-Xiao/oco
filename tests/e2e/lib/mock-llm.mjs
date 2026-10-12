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

/** Decide the next assistant step from the conversation. Returns { tool, args }, { tools } or { lines }. */
function planBase(body) {
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
    if (/without retrieving/i.test(prompt)) return { lines: ["OK"] }
    if (/in the background with/i.test(prompt)) {
      const bgId = /background_task_id:\s*(\S+)/i.exec(out)?.[1]
      if (bgId && tools.has("background_output")) {
        return { tool: "background_output", args: { task_id: bgId } }
      }
    }
    return { lines: ["OK"] }
  }

  let m
  if (tools.has("bash") && (m = /use the bash tool to run(?: exactly)?(?: this command)?:\s*(.+?)(?:\s\.(?:\s|$)| and tell|$)/im.exec(prompt)))
    return { tool: "bash", args: { command: m[1], description: "Run the requested command" } }
  // "Use the bash tool 3 times in parallel to run: <cmd>" starts N identical bash calls from one assistant message
  // (the runtime view numbers them 1/3, 2/3, 3/3). Added for the M5 same-command check.
  if (tools.has("bash") && (m = /use the bash tool (\d+) times in parallel to run(?: exactly)?:\s*(.+?)(?:\s\.(?:\s|$)| and tell|$)/im.exec(prompt)))
    return {
      tools: Array.from({ length: Math.min(Number(m[1]), 8) }, () => ({
        tool: "bash",
        args: { command: m[2], description: "Run the requested command" },
      })),
    }
  // "Use the read tool on missing file <path>" reads a file that does not exist; the tool reports an error.
  if (tools.has("read") && (m = /use the read tool on missing file (\S+)/i.exec(prompt)))
    return { tool: "read", args: { filePath: abs(m[1]) } }
  if (tools.has("task") && (m = /use the task tool in the background without retrieving with the (\S+) agent:\s*(.+)$/im.exec(prompt)))
    return { tool: "task", args: { subagent_type: m[1], description: m[2].trim(), prompt: "Reply with exactly this line and nothing else: subagent-ok", run_in_background: true } }
  if (tools.has("task") && (m = /use the task tool in the background with the (\S+) agent:\s*(.+)$/im.exec(prompt)))
    return { tool: "task", args: { subagent_type: m[1], description: m[2].trim(), prompt: "Reply with exactly this line and nothing else: subagent-ok", run_in_background: true } }
  if (tools.has("task") && /THREE-SUBAGENTS-NEED-PERMISSION/i.test(prompt)) {
    const agents = ["explore", "general"]
    const descriptions = ["child-alpha", "child-beta", "child-gamma"]
    return {
      tools: descriptions.map((description, i) => ({
        tool: "task",
        args: {
          subagent_type: agents[i % agents.length],
          description,
          prompt: `Use the bash tool to run exactly: echo perm-sub-${i + 1}`,
          run_in_background: true,
        },
      })),
    }
  }
  // "Use the task tool 3 times in parallel: a; b; c" starts several subagents from one assistant message.
  // Each child streams 30 numbered sentences (~4.5 s) so the runtime view shows them running side by side.
  if (tools.has("task") && (m = /use the task tool (\d+) times in parallel:\s*(.+)$/im.exec(prompt))) {
    const agents = ["explore", "general"]
    const descriptions = m[2].split(";").map((d) => d.trim()).filter(Boolean).slice(0, Number(m[1]))
    return {
      tools: descriptions.map((description, i) => ({
        tool: "task",
        args: { subagent_type: agents[i % agents.length], description, prompt: "Write 30 numbered sentences." },
      })),
    }
  }
  // "Use the task tool with the explore agent: <description>" starts a subagent (child session).
  if (tools.has("task") && (m = /use the task tool with the (\S+) agent:\s*(.+)$/im.exec(prompt)))
    return { tool: "task", args: { subagent_type: m[1], description: m[2].trim(), prompt: "Reply with exactly this line and nothing else: subagent-ok" } }
  // "question multi tool": a multi-select question (red/blue/green). "question custom tool": single-select with free text allowed.
  if (tools.has("question") && /question multi tool/i.test(prompt))
    return { tool: "question", args: { questions: [{ question: "Which colors do you like?", header: "Colors", multiple: true, options: [{ label: "red", description: "Red" }, { label: "blue", description: "Blue" }, { label: "green", description: "Green" }] }] } }
  if (tools.has("question") && /question custom tool/i.test(prompt))
    return { tool: "question", args: { questions: [{ question: "Name a color of your own?", header: "Custom", custom: true, options: [{ label: "red", description: "Red" }, { label: "blue", description: "Blue" }] }] } }
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
  // "Use the todowrite tool to plan: a; b; c" → the first item done, the second in progress, the rest pending.
  if (tools.has("todowrite") && (m = /Use the todowrite tool to plan: ([^.\n]+)/i.exec(prompt))) {
    const items = m[1].split(";").map((s) => s.trim()).filter(Boolean)
    const status = (i) => (i === 0 ? "completed" : i === 1 ? "in_progress" : "pending")
    return { tool: "todowrite", args: { todos: items.map((content, i) => ({ id: String(i + 1), content, status: status(i), priority: "medium" })) } }
  }
  if (tools.has("read") && (m = /Use the read tool on (\S+) with offset (\d+) and limit (\d+)/i.exec(prompt)))
    return { tool: "read", args: { filePath: abs(m[1]), offset: Number(m[2]), limit: Number(m[3]) } }
  if ((m = /Reply with exactly this line and nothing else:\s*(.+)$/im.exec(prompt))) {
    return { lines: [m[1].trim()], slowReason: /SLOW-REASON-[\w-]+/.test(prompt) }
  }

  const n = Number(/(\d+) numbered sentences|from 1 to (\d+)|1 to (\d+)/i.exec(prompt)?.slice(1).find(Boolean) ?? 0)
  // "in one paragraph": plain words, no list markup, so the rendered text equals the raw text.
  if (n > 0 && /one paragraph/i.test(prompt)) return { lines: Array.from({ length: n }, (_, i) => `word${i + 1}`), sep: " ", slowReason: /SLOW-REASON-[\w-]+/.test(prompt) }
  // Long "sentence" answers are what stop/close tests interrupt; stream them slower (300 lines ~ 45s) so a
  // test that polls host state (~1s per read) still sees the run busy.
  if (n > 0) return { lines: Array.from({ length: n }, (_, i) => `${i + 1}. Mock line ${i + 1}.`), lineMs: /sentence/i.test(prompt) ? SENTENCE_MS : LINE_MS, slowReason: /SLOW-REASON-[\w-]+/.test(prompt) }

  const slowTag = /SLOW-REASON-[\w-]+/.exec(prompt)?.[0]
  if (slowTag) return { lines: [`OK ${slowTag}`], slowReason: true }

  const tag = /TAG-[\w-]+/.exec(prompt)?.[0]
  return { lines: [tag ? `OK ${tag}` : "OK"] }
}

/** Prompt-level modifiers on top of planBase (they never change what planBase decides, only add to a tool-call step):
 *  - `THINK-FIRST` as the first word: stream 6 reasoning segments (300 ms apart) before the tool calls.
 *  - `WITH-SLOW-SIBLING` anywhere: append a slow task call (a subagent writing 60 sentences, ~9 s) to the same
 *    assistant message, so the request stays in its "await results" stage after the other tools have finished. */
export function plan(body) {
  const step = planBase(body)
  const msgs = body.messages ?? []
  if (msgs.at(-1)?.role === "tool" || !(step.tool || step.tools)) return step
  const prompt = text(msgs.filter((m) => m.role === "user").at(-1)?.content)
  const tools = new Set((body.tools ?? []).map((t) => t.function?.name))
  let out = step
  if (/WITH-SLOW-SIBLING/.test(prompt) && tools.has("task")) {
    const calls = step.tools ?? [{ tool: step.tool, args: step.args }]
    out = { tools: [...calls, { tool: "task", args: { subagent_type: "explore", description: "slow sibling", prompt: "Write 60 numbered sentences." } }] }
  }
  if (/^\s*THINK-FIRST\b/.test(prompt)) out.thinkFirst = true
  return out
}

function chunk(res, id, delta, finish = null) {
  const c = { id, object: "chat.completion.chunk", created: Math.floor(Date.now() / 1000), model: "mock", choices: [{ index: 0, delta, finish_reason: finish }] }
  res.write(`data: ${JSON.stringify(c)}\n\n`)
}

export const retryTags = new Set()

async function complete(req, res, body) {
  const tools = body.tools ?? []
  if (Array.isArray(tools) && tools.length > 0) {
    const users = (body.messages ?? []).filter((m) => m.role === "user")
    const prompt = text(users.at(-1)?.content)
    const m = /RETRY-ONCE-([\w-]+)/.exec(prompt)
    if (m) {
      const tag = m[1]
      if (!retryTags.has(tag)) {
        retryTags.add(tag)
        res.writeHead(429, {
          "content-type": "application/json",
          "retry-after": "1",
        })
        return res.end(
          JSON.stringify({
            error: {
              message: "Rate limit reached (mock)",
              type: "rate_limit_exceeded",
              code: "rate_limit_exceeded",
            },
          })
        )
      }
    }
  }

  const step = plan(body)
  const id = "chatcmpl-" + Math.random().toString(36).slice(2)
  let closed = false
  res.on("close", () => (closed = true))
  res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" })
  await sleep(FIRST_MS)
  chunk(res, id, { role: "assistant", content: "" })
  if (step.tool || step.tools) {
    // THINK-FIRST: the model reasons for ~1.8 s (6 segments, 300 ms apart) before it calls the tools.
    if (step.thinkFirst)
      for (let i = 0; i < 6; i++) {
        if (closed) return
        chunk(res, id, { reasoning_content: `Thinking before acting, step ${i + 1}: decide which tool to call and with what arguments. ` })
        await sleep(300)
      }
    const calls = step.tools ?? [{ tool: step.tool, args: step.args }]
    for (const [index, call] of calls.entries())
      chunk(res, id, {
        tool_calls: [{ index, id: "call_" + Math.random().toString(36).slice(2), type: "function", function: { name: call.tool, arguments: JSON.stringify(call.args) } }],
      })
    chunk(res, id, {}, "tool_calls")
  } else {
    // Long answers start with a reasoning block, as the real test model does. OpenCode stores a part's
    // text when the part ends, so tests that wait for "> 200 chars stored" see it while text still streams.
    if (step.lines.length > 1 || step.slowReason) {
      for (let i = 0; i < 6; i++) {
        if (closed) return
        chunk(res, id, { reasoning_content: `Planning the list, step ${i + 1}: keep every item short and numbered in order. ` })
        if (step.slowReason) await sleep(300)
      }
      if (!step.slowReason) await sleep(LINE_MS)
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
