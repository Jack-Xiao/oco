// Test-side server verification (reads the isolated test secret; never prints it).
import fs from "node:fs"
import path from "node:path"
const root = path.resolve(import.meta.dirname, "../..")
const base = process.env.OCO_TEST_URL ?? "http://127.0.0.1:4517"
const auth = "Basic " + Buffer.from("opencode:" + fs.readFileSync(path.join(root, ".oco-test/secret"), "utf8").trim()).toString("base64")
const dir = path.join(fs.realpathSync(path.join(root, ".oco-test")), "workspace")
export async function api(method, p, body, directory = dir) {
  const r = await fetch(base + p, { method, headers: { authorization: auth, "content-type": "application/json", "x-opencode-directory": encodeURIComponent(directory) }, body: body ? JSON.stringify(body) : undefined })
  const t = await r.text()
  return t ? JSON.parse(t) : null
}

/** Model the test server runs: the real one, or the scripted local mock (scripts/test-server.sh, OCO_E2E_MODEL=mock).
 *  Read from the server so a suite can never claim the wrong mode; falls back to OCO_E2E_MODEL if it is down. */
async function detectModel() {
  const configured = await api("GET", "/config").then((c) => c?.model, () => undefined)
  const mock = configured ? configured.startsWith("oco-mock/") : process.env.OCO_E2E_MODEL === "mock"
  return mock
    ? { mode: "mock", providerID: "oco-mock", modelID: "mock", label: "OCO Mock" }
    : { mode: "real", providerID: "opencode", modelID: "big-pickle", label: "Big Pickle" }
}
export const MODEL = await detectModel()
export const messages = (sid) => api("GET", `/session/${sid}/message`)
export async function status(sid) {
  const all = await api("GET", "/session/status")
  return all?.[sid]?.type ?? "idle"
}
export async function waitIdle(sid, ms = 120000) {
  const end = Date.now() + ms
  await new Promise((r) => setTimeout(r, 1500))
  while (Date.now() < end) {
    if ((await status(sid)) === "idle") return true
    await new Promise((r) => setTimeout(r, 500))
  }
  return false
}
export const lastAssistant = async (sid) => (await messages(sid)).filter((m) => m.info.role === "assistant").at(-1)
export const textOf = (m) => (m?.parts ?? []).filter((p) => p.type === "text").map((p) => p.text).join("")

/** Wait until the session's newest message is an assistant reply that has completed (or errored) and
 *  the session is idle. Unlike waitIdle, a run that has not started yet does not count as finished. */
export async function waitReply(sid, ms = 180000) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    const msgs = await messages(sid)
    const last = msgs.at(-1)
    if (last?.info.role === "assistant" && (last.info.time?.completed || last.info.error) && (await status(sid)) === "idle") return last
    await new Promise((r) => setTimeout(r, 400))
  }
  return null
}

/** Wait until a specific message is finalised (completed timestamp or error recorded). */
export async function waitMessageFinal(sid, messageId, ms = 30000) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    const m = (await messages(sid)).find((x) => x.info.id === messageId)
    if (m && (m.info.time?.completed || m.info.error)) return m
    await new Promise((r) => setTimeout(r, 200))
  }
  return null
}
