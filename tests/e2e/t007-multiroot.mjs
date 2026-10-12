// T007 multi-root mapping: one active folder at a time for the sidebar and new sessions.
// Cases: default-first-folder, select-folder, new-session-in-folder, open-panel-survives-switch, choice-remembered
import fs from "node:fs"
import path from "node:path"
import { execSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { createRun } from "./lib/results.mjs"
import { launch, command, sleep, runShot, hostState, root, waitForChatFrame, chatFrames } from "./vscode.mjs"

const CASES = ["default-first-folder", "select-folder", "new-session-in-folder", "open-panel-survives-switch", "choice-remembered"]
const run = createRun({ suite: "t007-multiroot", required: CASES, scriptPath: fileURLToPath(import.meta.url) })
const BASE = path.join(fs.realpathSync(path.join(root, ".oco-test")), "ws-multi")
const A = path.join(BASE, "alpha")
const B = path.join(BASE, "beta")
const WS_FILE = path.join(BASE, "multi.code-workspace")
fs.rmSync(BASE, { recursive: true, force: true })
for (const d of [A, B]) {
  fs.mkdirSync(d, { recursive: true })
  // The root commit must differ per folder: OpenCode derives the project id from it, and two folders with the same
  // root commit are one project (the sidebar lists a project's sessions across its folders).
  execSync(`git init -q && git -c user.email=t@oco.local -c user.name=t commit -q --allow-empty -m "init ${path.basename(d)} ${Date.now()}"`, { cwd: d })
}
fs.writeFileSync(WS_FILE, JSON.stringify({ folders: [{ path: "alpha" }, { path: "beta" }] }))
const URL_ = process.env.OCO_TEST_URL ?? "http://127.0.0.1:4517"
const AUTH = "Basic " + Buffer.from(`opencode:${fs.readFileSync(path.join(root, ".oco-test/secret"), "utf8").trim()}`).toString("base64")
async function dreq(method, p, dir, body) {
  const r = await fetch(URL_ + p, { method, headers: { authorization: AUTH, "content-type": "application/json", "x-opencode-directory": encodeURIComponent(dir) }, body: body ? JSON.stringify(body) : undefined })
  const t = await r.text()
  return t ? JSON.parse(t) : null
}
const rand = Math.random().toString(36).slice(2, 7)
const created = []
const sa = await dreq("POST", "/session", A, { title: `mr-alpha-${rand}` })
const sb = await dreq("POST", "/session", B, { title: `mr-beta-${rand}` })
created.push([sa.id, A], [sb.id, B])
let app
run.installCrashHandlers(async () => {
  await app?.close().catch(() => {})
  for (const [id, d] of created) await dreq("DELETE", `/session/${id}`, d).catch(() => {})
})

async function until(fn, ms, step = 300) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    const v = await fn().catch(() => undefined)
    if (v) return v
    await sleep(step)
  }
  return undefined
}
const rec = async (id, fn) => {
  try {
    await fn()
  } catch (e) {
    run.record(id, "FAIL", { error: String(e?.message ?? e).slice(0, 400) })
  }
}
const titles = (sb) => (sb?.items ?? []).map((i) => i.title)

try {
  let l = await launch({ profile: "t007-multiroot", run, workspace: WS_FILE })
  app = l.app
  let page = l.page
  const sidebar = async () => (await hostState(page, l.stateFile)).sidebar
  const listed = (want) => until(async () => {
    const s = await sidebar()
    return s.connection?.state === "connected" && titles(s).includes(want) ? s : undefined
  }, 40000)

  await rec("default-first-folder", async () => {
    const s = await listed(`mr-alpha-${rand}`)
    run.record("default-first-folder", s && !titles(s).includes(`mr-beta-${rand}`) && s.folderLabel === "alpha" ? "PASS" : "FAIL", { folderLabel: s?.folderLabel, titles: titles(s).slice(0, 5) })
  })

  // A panel of the first folder, checked again after switching the active folder.
  await command(page, "oco: Open Session", { input: sa.id })
  await waitForChatFrame(page, 1, 60000)

  await rec("select-folder", async () => {
    await command(page, "oco: Select Workspace Folder", { input: "beta" })
    const s = await listed(`mr-beta-${rand}`)
    await runShot(page, run, "multiroot-beta")
    run.record("select-folder", s && !titles(s).includes(`mr-alpha-${rand}`) && s.folderLabel === "beta" ? "PASS" : "FAIL", { folderLabel: s?.folderLabel, titles: titles(s).slice(0, 5) })
    const st = await hostState(page, l.stateFile)
    const pa = st.panels.find((p) => p.sessionId === sa.id)
    run.record("open-panel-survives-switch", pa && pa.directory === A && pa.ready ? "PASS" : "FAIL", { panel: pa ? { directory: pa.directory, ready: pa.ready, visible: pa.visible } : null })
  })

  await rec("new-session-in-folder", async () => {
    const before = new Set(((await dreq("GET", `/session?directory=${encodeURIComponent(B)}&limit=500`, B)) ?? []).map((s) => s.id))
    // New Session opens the new-session page (a draft); the session is created in the selected folder by the first message.
    await command(page, "oco: New Session")
    const draft = await until(async () => {
      for (const f of await chatFrames(page)) {
        const ok = await f.evaluate(() => !!document.querySelector('[data-component="session-new-design"]') && !!document.querySelector('[data-component="prompt-input"]') && document.documentElement.dataset.ocoModel === "ready").catch(() => false)
        if (ok) return f
      }
    }, 60000, 200)
    if (draft) {
      const input = draft.locator('[data-component="prompt-input"]')
      await input.click()
      await input.focus()
      await page.keyboard.type(`Reply with exactly: MR-NEW-${rand}`, { delay: 4 })
      await sleep(200)
      await page.keyboard.press("Enter")
    }
    const s = await until(async () => {
      const list = (await dreq("GET", `/session?directory=${encodeURIComponent(B)}&limit=500`, B)) ?? []
      return list.find((x) => !before.has(x.id))
    }, 20000)
    if (s) created.push([s.id, B])
    run.record("new-session-in-folder", draft && s && s.directory === B ? "PASS" : "FAIL", { directory: s?.directory ?? null })
  })

  await rec("choice-remembered", async () => {
    await app.close()
    l = await launch({ profile: "t007-multiroot", run, workspace: WS_FILE, fresh: false })
    app = l.app
    page = l.page
    const s = await listed(`mr-beta-${rand}`)
    run.record("choice-remembered", s && s.folderLabel === "beta" ? "PASS" : "FAIL", { folderLabel: s?.folderLabel })
  })
} catch (e) {
  run.record("run", "FAIL", { error: String(e?.message ?? e).slice(0, 400) })
} finally {
  await app?.close().catch(() => {})
  for (const [id, d] of created) await dreq("DELETE", `/session/${id}`, d).catch(() => {})
  process.exit(run.finish())
}
