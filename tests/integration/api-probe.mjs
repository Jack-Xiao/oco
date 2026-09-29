// T001 API probe against the isolated test server (scripts/test-server.sh).
// Verifies: auth, session create, SSE /event incremental deltas, prompt_async, real abort.
// Prints only event types / counts — no credentials, no message bodies beyond short previews.
import fs from "node:fs"
import path from "node:path"
const root = path.resolve(import.meta.dirname, "../..")
const base = process.env.OCO_TEST_URL ?? "http://127.0.0.1:4517"
const auth = "Basic " + Buffer.from("opencode:" + fs.readFileSync(path.join(root, ".oco-test/secret"), "utf8").trim()).toString("base64")
const dir = path.join(root, ".oco-test/workspace")
const H = { authorization: auth, "content-type": "application/json", "x-opencode-directory": encodeURIComponent(dir) }
const api = async (m, p, body) => {
  const r = await fetch(base + p, { method: m, headers: H, body: body ? JSON.stringify(body) : undefined })
  const t = await r.text()
  return { status: r.status, body: t ? JSON.parse(t) : null }
}
const mode = process.argv[2] ?? "stream"
const session = (await api("POST", "/session", { title: "oco api probe " + mode })).body
console.log("session", session.id, "directory ok:", session.directory === dir)
const ac = new AbortController()
const events = []
const t0 = Date.now()
const sse = fetch(base + "/event", { headers: H, signal: ac.signal }).then(async (r) => {
  console.log("sse status", r.status, r.headers.get("content-type"))
  const dec = new TextDecoder()
  let buf = ""
  for await (const chunk of r.body) {
    buf += dec.decode(chunk, { stream: true })
    let i
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const raw = buf.slice(0, i); buf = buf.slice(i + 2)
      const data = raw.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5)).join("")
      if (!data) continue
      const ev = JSON.parse(data)
      const sid = ev.properties?.sessionID ?? ev.properties?.info?.sessionID ?? ev.properties?.part?.sessionID ?? ev.properties?.info?.id
      if (sid && sid !== session.id) continue
      events.push({ t: Date.now() - t0, type: ev.type, status: ev.properties?.status?.type })
    }
  }
}).catch((e) => { if (e.name !== "AbortError") console.log("sse error", e.message) })
await new Promise((r) => setTimeout(r, 300))
const text = mode === "abort"
  ? "Write a very long numbered list from 1 to 400, one number per line with a short word each. Do not use tools."
  : "Reply with exactly: hello from oco probe"
const pr = await api("POST", `/session/${session.id}/prompt_async`, {
  model: { providerID: "opencode", modelID: process.env.OCO_TEST_MODEL ?? "big-pickle" },
  parts: [{ type: "text", text }],
})
console.log("prompt_async", pr.status)
const waitIdle = async (ms) => {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (events.some((e) => e.type === "session.idle" || (e.type === "session.status" && e.status === "idle" && e.t > 500))) return true
    await new Promise((r) => setTimeout(r, 200))
  }
  return false
}
if (mode === "abort") {
  const endW = Date.now() + 60000
  while (Date.now() < endW && events.filter((e) => e.type === "message.part.delta" || e.type === "message.part.updated").length < 15) await new Promise((r) => setTimeout(r, 100))
  const before = events.length
  const ab = await api("POST", `/session/${session.id}/abort`)
  console.log("abort", ab.status, JSON.stringify(ab.body), "events before abort", before)
}
const idle = await waitIdle(90000)
ac.abort(); await sse
const msgs = (await api("GET", `/session/${session.id}/message`)).body
const counts = {}
for (const e of events) counts[e.type] = (counts[e.type] ?? 0) + 1
console.log("idle", idle, "event counts", JSON.stringify(counts))
const deltas = events.filter((e) => e.type === "message.part.delta").map((e) => e.t)
console.log("delta count", deltas.length, "first/last ms", deltas[0], deltas.at(-1))
const last = msgs.at(-1)
console.log("assistant error", JSON.stringify(last?.info?.error?.name ?? null), "finish", last?.info?.finish ?? null)
const txt = last?.parts?.filter((p) => p.type === "text").map((p) => p.text).join("") ?? ""
console.log("assistant text chars", txt.length, "preview", JSON.stringify(txt.slice(0, 60)))
