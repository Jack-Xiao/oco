// Test-side server verification (reads the isolated test secret; never prints it).
import fs from "node:fs"
import path from "node:path"
const root = path.resolve(import.meta.dirname, "../..")
const base = process.env.OCO_TEST_URL ?? "http://127.0.0.1:4517"
const auth = "Basic " + Buffer.from("opencode:" + fs.readFileSync(path.join(root, ".oco-test/secret"), "utf8").trim()).toString("base64")
const dir = path.join(root, ".oco-test/workspace")
export async function api(method, p, body) {
  const r = await fetch(base + p, { method, headers: { authorization: auth, "content-type": "application/json", "x-opencode-directory": encodeURIComponent(dir) }, body: body ? JSON.stringify(body) : undefined })
  const t = await r.text()
  return t ? JSON.parse(t) : null
}
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
