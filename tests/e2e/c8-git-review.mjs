// Regression: card lists session-recorded files across turns; Review retains native Git scope.
// Only user summary.diffs is a fixture; Git files and patches come from the real isolated server.
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { createRun } from "./lib/results.mjs"
import { startProxy } from "./lib/proxy.mjs"
import { sessionsFrame } from "./lib/sessions-web.mjs"
import { root, launch, command, clearNotifications, waitUntil, chatFrames, frameSession } from "./vscode.mjs"
import { api, MODEL } from "./server.mjs"

const required = ["two-turn-files", "sidebar-git-review", "session-card-files", "runtime-git-review", "runtime-file-git-review"]
const run = createRun({ suite: "c8-git-review", required, scriptPath: fileURLToPath(import.meta.url) })
const prefix = `c8scope-${Date.now().toString(36)}`
const names = [`${prefix}-first.txt`, `${prefix}-second.txt`, `${prefix}-third.txt`]
const unrelated = `${prefix}-outside-session.txt`
const workspace = path.join(fs.realpathSync(path.join(root, ".oco-test")), "workspace")
const proxy = await startProxy({ target: process.env.OCO_TEST_URL ?? "http://127.0.0.1:4517" })
let session
let fixtureMessages
let app
let page
const errors = []
proxy.intercept((method, url) => method === "GET" && url.pathname === `/session/${session?.id}/message` && fixtureMessages
  ? { json: fixtureMessages } : undefined)
run.setEnv({ modelMode: MODEL.mode, fixture: "user summary.diffs only; native Git diff unmodified", serverVersion: (await api("GET", "/global/health"))?.version })

async function turn(index) {
  await api("POST", `/session/${session.id}/prompt_async`, {
    model: { providerID: MODEL.providerID, modelID: MODEL.modelID },
    parts: [{ type: "text", text: `Use the write tool to create the file ${names[index]} containing the single line hello${index}.` }],
  })
  const messages = await waitUntil(async () => {
    for (const permission of (await api("GET", "/permission")) ?? []) {
      if (permission.sessionID === session.id) await api("POST", `/permission/${permission.id}/reply`, { reply: "once" })
    }
    const list = await api("GET", `/session/${session.id}/message`)
    const users = list.filter((m) => m.info.role === "user")
    const last = list.at(-1)?.info
    if (users.length !== index + 1 || last?.role !== "assistant" || !last.time?.completed || last.parentID !== users.at(-1).info.id) return false
    const statuses = await api("GET", "/session/status")
    return !statuses[session.id] || statuses[session.id].type === "idle" ? list : false
  }, 60000, 300)
  if (!messages) throw new Error(`turn ${index + 1} did not finish`)
  return messages
}

const guard = async (id, fn) => {
  try { await fn() }
  catch (error) { run.record(id, "FAIL", { error: String(error.message).slice(0, 400), browserErrors: errors.slice(-2) }) }
}

try {
  if (MODEL.mode !== "mock") throw new Error("This regression requires the isolated mock server")
  const launched = await launch({ profile: "c8-git-review", run, settings: { "oco.serverUrl": proxy.url } })
  app = launched.app
  page = launched.page
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 400)) })
  run.installCrashHandlers(() => app?.close())
  await command(page, "Focus on Sessions View")
  await clearNotifications(page)
  const sidebar = await waitUntil(() => sessionsFrame(page), 30000, 200)
  if (!sidebar) throw new Error("sidebar missing")
  session = await api("POST", "/session", { title: `Git review regression ${prefix}` })
  await turn(0)
  fixtureMessages = await turn(1)
  // The third path is a second file in the last-turn summary fixture; the outside path is Git-only.
  fs.writeFileSync(path.join(workspace, names[2]), "hello2\n")
  fs.writeFileSync(path.join(workspace, unrelated), "outside\n")
  let index = 0
  for (const message of fixtureMessages) {
    if (message.info.role !== "user") continue
    const file = names[index++]
    message.info.summary = { ...message.info.summary, diffs: [{ file, additions: 1, deletions: 0, status: "added", patch: `--- /dev/null\n+++ ${file}\n@@ -0,0 +1 @@\n+hello${index - 1}\n` }] }
    if (index === 1) message.info.summary.diffs.push({ ...message.info.summary.diffs[0] }) // duplicate must not inflate count
    if (index === 2) message.info.summary.diffs.push({ file: names[2], additions: 1, deletions: 0, status: "added", patch: `--- /dev/null\n+++ ${names[2]}\n@@ -0,0 +1 @@\n+hello2\n` })
  }
  const actualFiles = names.filter((name) => fs.existsSync(path.join(workspace, name)))
  const lastTurnFiles = fixtureMessages.filter((m) => m.info.role === "user").at(-1).info.summary.diffs.map((d) => d.file)
  run.record("two-turn-files", actualFiles.length === 3 && lastTurnFiles.length === 2 && !lastTurnFiles.includes(names[0]) ? "PASS" : "FAIL", { actualFiles, lastTurnFiles, unrelated })

  let frame
  const gitReview = async () => {
    const title = frame.locator('[data-slot="session-review-v2-sidebar-title"]')
    const scope = await waitUntil(async () => /Git\s*(changes|变更)/i.test(await title.innerText().catch(() => "")), 15000, 200)
    if (!scope) return { scope: false, files: [] }
    await frame.locator('[data-slot="session-review-v2-sidebar-filter"] input').fill(prefix)
    const tree = frame.locator('[data-slot="session-review-v2-sidebar-tree"]')
    await waitUntil(async () => (await tree.innerText().catch(() => "")).includes(names[0]), 10000, 200)
    const text = await tree.innerText().catch(() => "")
    return { scope: true, files: names.filter((name) => text.includes(name)) }
  }

  await guard("sidebar-git-review", async () => {
    const row = sidebar.locator(`section[data-group="inbox"] .row[data-kind="done"][data-session-id="${session.id}"]`)
    await row.waitFor({ timeout: 30000 })
    await row.hover()
    await row.locator('button[data-action="diff"]').click()
    frame = await waitUntil(async () => {
      for (const f of await chatFrames(page)) if (await frameSession(f) === session.id) return f
      return false
    }, 30000, 200)
    if (!frame) throw new Error("session frame missing")
    const result = await gitReview()
    run.record("sidebar-git-review", result.scope && result.files.length === 3 ? "PASS" : "FAIL", result)
  })
  await guard("session-card-files", async () => {
    await frame.locator('[data-oco-view="runtime"]').first().click()
    await frame.locator('[data-oco-runtime-card-expand]').first().click()
    const panel = frame.locator('[data-oco-runtime-card-result-list]')
    await panel.waitFor({ state: "visible", timeout: 15000 })
    const text = await panel.innerText()
    const list = frame.locator('[data-oco-runtime-card-result-list] [data-oco-runtime-card-result-file]')
    await waitUntil(async () => await list.count() === 3, 10000, 200)
    const listed = await list.evaluateAll((els) => els.map((el) => el.getAttribute('data-oco-runtime-card-result-file')))
    const ok = listed.length === 3 && names.every((name) => listed.includes(name)) && !listed.includes(unrelated)
      && /\b3\b/.test(text) && /session/i.test(text) && !/[+−]\d/.test(text)
    run.record("session-card-files", ok ? "PASS" : "FAIL", { text, listed, excludesUnrelated: !listed.includes(unrelated), history: await frame.locator('[data-oco-runtime]').getAttribute('data-oco-runtime-history') })
  })
  await guard("runtime-git-review", async () => {
    if (!await frame.locator('[data-oco-runtime]').count()) await frame.locator('[data-oco-view="runtime"]').first().click()
    const expanded = frame.locator('[data-oco-runtime-card-result-list] [data-oco-runtime-card-result-open]')
    await (await expanded.count() ? expanded : frame.locator('[data-oco-runtime-card-result-open]').first()).click({ timeout: 15000 })
    const result = await gitReview()
    run.record("runtime-git-review", result.scope && result.files.length === 3 ? "PASS" : "FAIL", result)
  })
  await guard("runtime-file-git-review", async () => {
    await frame.locator('[data-oco-view="runtime"]').first().click()
    await frame.locator('[data-oco-runtime-card-expand]').first().click()
    await frame.locator(`[data-oco-runtime-card-result-file="${names[1]}"]`).click()
    const result = await gitReview()
    const selected = await waitUntil(async () => (await frame.locator('[data-slot="session-review-v2-file-name"]').innerText().catch(() => "")) === names[1], 10000, 200)
    const patch = await waitUntil(async () => frame.locator('[data-slot="session-review-v2-diff-scroll"]').evaluate((el) => {
      const text = (root) => (root.textContent ?? "") + [...root.querySelectorAll("*")].map((n) => n.shadowRoot ? text(n.shadowRoot) : "").join("")
      return text(el).includes("hello1")
    }).catch(() => false), 10000, 200)
    run.record("runtime-file-git-review", result.scope && selected && patch ? "PASS" : "FAIL", { ...result, selected: !!selected, patch: !!patch })
  })
} catch (error) {
  run.record("run", "FAIL", { error: String(error.message).slice(0, 400), browserErrors: errors.slice(-2) })
} finally {
  await app?.close().catch(() => {})
  await proxy.close().catch(() => {})
  // Only remove the two files this run uniquely created in the isolated test workspace.
  for (const name of [...names, unrelated]) fs.rmSync(path.join(workspace, name), { force: true })
  process.exit(run.finish())
}
