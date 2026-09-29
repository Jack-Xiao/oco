// P1b-1 main chain through the native Sessions sidebar (real VS Code + real server):
// list -> create -> rename -> search -> draft -> send -> permission -> stop -> status -> switch/restore,
// then a connection-switch regression and a restricted-mode (untrusted workspace) regression.
// Tree rows, title actions and inline actions are clicked with the pointer; the host's debug state is
// only read to check what the sidebar shows.
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { createRun } from "./lib/results.mjs"
import { launch, command, chatFrames, frameSession, sleep, runShot, hostState, clearNotifications, root } from "./vscode.mjs"
import { api, messages, status, waitIdle, waitReply, waitMessageFinal } from "./server.mjs"

const REQUIRED = [
  "sidebar-list",
  "sidebar-create",
  "sidebar-rename",
  "sidebar-search",
  "chain-draft",
  "chain-permission",
  "chain-stop",
  "switch-restore",
  "focus-existing-group",
  "connection-switch",
  "restricted-mode",
]
const run = createRun({ suite: "p1b-sidebar", required: REQUIRED, scriptPath: fileURLToPath(import.meta.url) })
const health = await api("GET", "/global/health").catch(() => null)
run.setEnv({ serverVersion: health?.version ?? null })
const dir = path.join(root, ".oco-test/workspace")
const rand = Math.random().toString(36).slice(2, 7)

// Leftover pending requests from earlier model runs would make the badge/status nondeterministic.
async function rejectLeftovers() {
  for (const p of (await api("GET", "/permission")) ?? []) await api("POST", `/permission/${p.id}/reply`, { reply: "reject" })
  for (const q of (await api("GET", "/question")) ?? []) await api("POST", `/question/${q.id}/reject`)
}
await rejectLeftovers()

let { app, page, stateFile, settingsFile } = await launch({ profile: "p1b-sidebar", run })
run.installCrashHandlers(() => app?.close())
const state = () => hostState(page, stateFile)
const sidebar = async () => (await state()).sidebar

async function until(fn, ms = 20000, step = 300) {
  const end = Date.now() + ms
  let v
  while (Date.now() < end) {
    v = await fn().catch(() => undefined)
    if (v) return v
    await sleep(step)
  }
  return v
}
async function frameFor(sid) {
  for (const f of await chatFrames(page)) if ((await frameSession(f).catch(() => null)) === sid) return f
  return null
}
const row = (title) => page.locator(`.part.sidebar .monaco-list-row[aria-label^="${title}"]`).first()
const titleAction = (label) => page.locator(`.part.sidebar .title-actions [aria-label^="${label}"], .part.sidebar .actions-container [aria-label^="${label}"]`).first()
const composer = async (f) => (await f.locator('[data-component="prompt-input"]').innerText()).trim()
async function type(f, text, send = false) {
  const input = f.locator('[data-component="prompt-input"]')
  for (let attempt = 0; attempt < 2; attempt++) {
    const before = await input.innerText()
    await input.click()
    await input.focus()
    await page.keyboard.press("Meta+ArrowDown") // end of the whole composer (Meta+End is end of line)
    await page.keyboard.type(text, { delay: 4 })
    await sleep(200)
    if ((await input.innerText()).length >= before.length + text.length - 2) break
  }
  if (send) await page.keyboard.press("Enter")
}
async function sidebarItem(id) {
  return (await sidebar()).items.find((i) => i.id === id)
}
/** The newest session created after `known`, once its panel has a composer. */
async function newSessionFromPlus(known) {
  await titleAction("New Session").click()
  return until(async () => {
    for (const f of await chatFrames(page)) {
      const s = await frameSession(f).catch(() => null)
      if (s && !known.has(s) && (await f.$('[data-component="prompt-input"]').catch(() => null))) return s
    }
  }, 60000)
}
async function serverRoots() {
  return ((await api("GET", `/session?directory=${encodeURIComponent(dir)}&roots=true&limit=200`)) ?? [])
    .filter((s) => !s.time?.archived)
    .sort((a, b) => (b.time?.updated ?? 0) - (a.time?.updated ?? 0))
}

try {
  if (process.env.OCO_SIDEBAR_ONLY === "restricted") throw new Error("skipped: OCO_SIDEBAR_ONLY=restricted")
  await command(page, "Focus on Sessions View")
  await until(async () => (await sidebar()).connection?.state === "connected", 30000)

  // 1. List = the server's root sessions of this directory, newest first.
  {
    const sb = await sidebar()
    const server = (await serverRoots()).map((s) => s.id)
    const ids = sb.items.map((i) => i.id)
    const sameSet = ids.length === Math.min(server.length, 200) && ids.every((id) => server.includes(id))
    await runShot(page, run, "1-list")
    run.record("sidebar-list", sb.connection.state === "connected" && sameSet && ids[0] === server[0] && new Set(ids).size === ids.length ? "PASS" : "FAIL", {
      state: sb.connection.state,
      items: ids.length,
      serverRoots: server.length,
      firstMatches: ids[0] === server[0],
      statusText: sb.statusText,
    })
  }

  // 2. Create from the view's "+" action: a panel opens, the tree lists it first and marks it open.
  let A
  {
    const before = new Set((await sidebar()).items.map((i) => i.id))
    A = await newSessionFromPlus(before)
    const item = await until(async () => {
      const it = await sidebarItem(A)
      return it && /已打开/.test(it.description) ? it : undefined
    })
    const first = (await sidebar()).items[0]?.id
    const server = await api("GET", `/session/${A}`)
    run.record("sidebar-create", !!A && !!item && first === A && server?.directory === dir ? "PASS" : "FAIL", { sessionId: A, listedFirst: first === A, description: item?.description, serverDirectory: server?.directory === dir })
  }

  // 3. Rename through the row's inline action -> server title, tree label and editor tab follow.
  const newTitle = `oco-renamed-${rand}`
  {
    const it = await sidebarItem(A)
    const r = row(it.title)
    await r.hover()
    await r.locator('[aria-label^="Rename Session"]').click()
    await sleep(600)
    await page.keyboard.press("Meta+a")
    await page.keyboard.type(newTitle)
    await page.keyboard.press("Enter")
    const serverTitle = await until(async () => ((await api("GET", `/session/${A}`))?.title === newTitle ? newTitle : undefined))
    const treeTitle = await until(async () => ((await sidebarItem(A))?.title === newTitle ? newTitle : undefined))
    const tabTitle = await until(async () => ((await state()).panels.find((p) => p.sessionId === A)?.title === newTitle ? newTitle : undefined))
    await runShot(page, run, "3-rename")
    run.record("sidebar-rename", serverTitle && treeTitle && tabTitle ? "PASS" : "FAIL", { serverTitle: !!serverTitle, treeTitle: !!treeTitle, tabTitle: !!tabTitle })
  }

  // 4. Search via the title action; clear via the clear action.
  {
    const total = (await sidebar()).items.length
    await titleAction("Search Sessions").click()
    await sleep(600)
    await page.keyboard.type(rand)
    await page.keyboard.press("Enter")
    const filtered = await until(async () => {
      const sb = await sidebar()
      return sb.search === rand ? sb : undefined
    })
    const rowVisible = await row(newTitle).isVisible().catch(() => false)
    await runShot(page, run, "4-search")
    await titleAction("Clear Session Search").click()
    const cleared = await until(async () => {
      const sb = await sidebar()
      return sb.search === "" && sb.items.length === total ? sb : undefined
    })
    run.record("sidebar-search", filtered?.items.length === 1 && filtered.items[0].id === A && rowVisible && !!cleared ? "PASS" : "FAIL", {
      matches: filtered?.items.map((i) => i.id),
      rowVisible,
      restoredCount: cleared?.items.length,
      total,
    })
  }

  // 5. Draft: selection from math.ts into A's composer (explicit target), not sent.
  {
    await command(page, "Go to File", { input: "math.ts" })
    const lines = page.locator(".editor-group-container.active .monaco-editor .view-lines").first()
    await lines.waitFor({ timeout: 20000 })
    await lines.click()
    await page.keyboard.press("Meta+a")
    await command(page, "oco: Add Selection to Session Draft")
    await sleep(900)
    await page.keyboard.type(A)
    await sleep(400)
    await page.keyboard.press("Enter")
    const f = await until(() => frameFor(A))
    const draft = await until(async () => ((await composer(f)).includes("export function add") ? await composer(f) : undefined), 15000)
    const userMsgs = (await messages(A)).filter((m) => m.info.role === "user").length
    run.record("chain-draft", !!draft && draft.includes("math.ts") && userMsgs === 0 ? "PASS" : "FAIL", { draftHead: (draft ?? "").slice(0, 80), sentMessages: userMsgs })
  }

  // 6. Send with the draft -> permission shown in the sidebar (status + badge) -> answered in the panel.
  {
    const f = await frameFor(A)
    let req = null
    for (let attempt = 0; attempt < 2 && !req; attempt++) {
      await type(f, attempt === 0 ? " That is my file. Separately, please use the bash tool to run: echo side-perm-ok and tell me the output." : "Please use the bash tool to run: echo side-perm-ok and tell me the output.", true)
      req = await until(async () => ((await api("GET", "/permission")) ?? []).find((p) => p.sessionID === A), 90000, 500)
      if (!req) await waitIdle(A)
    }
    const sbPerm = req ? await until(async () => ((await sidebarItem(A))?.activity === "permission" ? await sidebar() : undefined)) : null
    await runShot(page, run, "6-permission-sidebar")
    const dock = f.locator('[data-component="dock-prompt"][data-kind="permission"]')
    if (req) {
      await dock.waitFor({ timeout: 30000 })
      await clearNotifications(page)
      await dock.getByRole("button", { name: /allow once|允许一次/i }).click()
    }
    await waitReply(A, 120000)
    const idle = await until(async () => ((await sidebarItem(A))?.activity === "idle" ? true : undefined), 20000)
    const tool = (await messages(A)).flatMap((m) => m.parts).find((p) => p.type === "tool" && p.callID === req?.tool?.callID)
    const firstUser = (await messages(A)).find((m) => m.info.role === "user")
    const sentDraft = (firstUser?.parts ?? []).some((p) => p.type === "text" && p.text.includes("export function add"))
    run.record(
      "chain-permission",
      req && sentDraft && sbPerm && sbPerm.badge >= 1 && /等待权限/.test(sbPerm.items.find((i) => i.id === A)?.description ?? "") && tool?.state?.status === "completed" && idle ? "PASS" : req ? "FAIL" : "NOT RUN",
      {
        requestId: req?.id ?? null,
        sidebarActivity: sbPerm?.items.find((i) => i.id === A)?.activity ?? null,
        badge: sbPerm?.badge ?? null,
        statusBar: sbPerm?.statusText ?? null,
        toolStatus: tool?.state?.status ?? null,
        sidebarIdleAfter: !!idle,
        draftWasSent: sentDraft,
      },
    )
  }

  // 7. Stop: the sidebar shows "busy" while running; after stop the server records an abort and the
  //    sidebar returns to idle (an abort is not an error).
  {
    const f = await frameFor(A)
    const known = new Set((await messages(A)).map((m) => m.info.id))
    await type(f, "Write 300 numbered sentences, each about a different city. No tools.", true)
    const busy = await until(async () => ((await sidebarItem(A))?.activity === "busy" ? true : undefined), 60000)
    const submit = f.locator('[data-action="prompt-submit"]')
    let target
    await until(async () => {
      target = (await messages(A)).find((m) => m.info.role === "assistant" && !known.has(m.info.id))
      const label = (await submit.getAttribute("aria-label").catch(() => "")) ?? ""
      const chars = (target?.parts ?? []).filter((p) => p.type === "text" || p.type === "reasoning").reduce((n, p) => n + (p.text?.length ?? 0), 0)
      return /stop|停止/i.test(label) && chars > 200 ? true : undefined
    }, 90000, 150)
    await runShot(page, run, "7-busy-sidebar")
    await submit.click()
    const final = target ? await waitMessageFinal(A, target.info.id, 30000) : null
    const idle = await until(async () => ((await sidebarItem(A))?.activity === "idle" ? true : undefined), 20000)
    run.record("chain-stop", busy && final?.info?.error?.name === "MessageAbortedError" && idle ? "PASS" : "FAIL", {
      sidebarBusy: !!busy,
      error: final?.info?.error?.name ?? null,
      sidebarIdleAfter: !!idle,
      sidebarActivity: (await sidebarItem(A))?.activity,
    })
  }

  // 8. Switch/restore in one group: B opens over A (A's document is destroyed); clicking A's row
  //    brings A back with its unsent draft, B keeps its own; no duplicate panels.
  let B
  {
    const fa = await frameFor(A)
    await type(fa, `draft-A-${rand}`)
    await sleep(1500)
    B = await newSessionFromPlus(new Set((await sidebar()).items.map((i) => i.id)))
    const fb = await until(() => frameFor(B))
    await type(fb, `draft-B-${rand}`)
    await sleep(1500)
    await row(newTitle).click()
    const fa2 = await until(async () => {
      const f = await frameFor(A)
      return f && (await f.evaluate(() => document.visibilityState === "visible").catch(() => false)) && (await composer(f).catch(() => "")).includes(`draft-A-${rand}`) ? f : undefined
    }, 30000)
    const st = await state()
    const aDraft = fa2 ? await composer(fa2) : ""
    const bTitle = (await sidebarItem(B))?.title
    // B is hidden now; open it again from its row and check its own draft.
    await row(bTitle).click()
    const fb2 = await until(async () => {
      const f = await frameFor(B)
      return f && (await composer(f).catch(() => "")).includes(`draft-B-${rand}`) ? f : undefined
    }, 30000)
    const bDraft = fb2 ? await composer(fb2) : ""
    const st2 = await state()
    const conn = (await sidebar()).connection
    const bindings = st2.panels.map((p) => p.connectionId)
    await runShot(page, run, "8-switch-restore")
    run.record(
      "switch-restore",
      fa2 && aDraft.includes(`draft-A-${rand}`) && !aDraft.includes(`draft-B-${rand}`) && fb2 && !bDraft.includes(`draft-A-${rand}`) && st.panels.filter((p) => p.sessionId === A).length === 1 && st2.panels.filter((p) => p.sessionId === B).length === 1 ? "PASS" : "FAIL",
      {
        aRestored: !!fa2,
        aDraftHasOwn: aDraft.includes(`draft-A-${rand}`),
        aDraftHasB: aDraft.includes(`draft-B-${rand}`),
        bDraftHasOwn: bDraft.includes(`draft-B-${rand}`),
        bDraftHasA: bDraft.includes(`draft-A-${rand}`),
        panelsA: st.panels.filter((p) => p.sessionId === A).length,
        panelsB: st2.panels.filter((p) => p.sessionId === B).length,
        panelConnections: [...new Set(bindings)].length,
        sidebarState: conn?.state,
      },
    )
  }

  // 9. Two visible groups: clicking a row focuses the group that already shows it (no new panel).
  {
    // B is active: move it to a new right group -> A shows in group 1, B in group 2.
    await command(page, "View: Move Editor into Right Group")
    await sleep(2500)
    const before = await state()
    const bTitle = (await sidebarItem(B))?.title
    await row(bTitle).click()
    await sleep(1500)
    const afterB = await state()
    await row(newTitle).click()
    await sleep(1500)
    const afterA = await state()
    const visible = (s) => s.panels.filter((p) => p.visible).map((p) => p.sessionId).sort()
    const activeGroupHas = async (title) => (await page.locator(".editor-group-container.active .tab.active").first().getAttribute("aria-label").catch(() => ""))?.includes(title)
    const aActive = await activeGroupHas(newTitle)
    await runShot(page, run, "9-two-groups")
    run.record(
      "focus-existing-group",
      visible(before).length === 2 && afterB.panels.length === before.panels.length && afterA.panels.length === before.panels.length && visible(afterA).length === 2 && aActive ? "PASS" : "FAIL",
      {
        visibleBefore: visible(before).length,
        panelsBefore: before.panels.length,
        panelsAfterClicks: [afterB.panels.length, afterA.panels.length],
        visibleAfter: visible(afterA).length,
        activeTabIsA: !!aActive,
      },
    )
  }

  // 10. Connection switch: unreachable URL -> error state, empty list, warning status bar; back ->
  //     connected with the same sessions and no duplicates.
  {
    const beforeIds = (await sidebar()).items.map((i) => i.id)
    const settings = JSON.parse(fs.readFileSync(settingsFile, "utf8"))
    fs.writeFileSync(settingsFile, JSON.stringify({ ...settings, "oco.serverUrl": "http://127.0.0.1:4599" }, null, 2))
    const down = await until(async () => {
      const sb = await sidebar()
      return sb.connection?.state === "error" ? sb : undefined
    }, 30000, 800)
    await runShot(page, run, "10-unreachable")
    fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2))
    const up = await until(async () => {
      const sb = await sidebar()
      return sb.connection?.state === "connected" && sb.items.length ? sb : undefined
    }, 60000, 800)
    const ids = up?.items.map((i) => i.id) ?? []
    run.record(
      "connection-switch",
      down && down.items.length === 0 && /未连接/.test(down.statusText) && up && new Set(ids).size === ids.length && ids.length === beforeIds.length && ids.every((i) => beforeIds.includes(i)) ? "PASS" : "FAIL",
      {
        downState: down?.connection?.state ?? null,
        downItems: down?.items.length ?? null,
        downStatus: down?.statusText ?? null,
        downMessage: down?.message ?? null,
        upState: up?.connection?.state ?? null,
        itemsBefore: beforeIds.length,
        itemsAfter: ids.length,
        duplicates: ids.length - new Set(ids).size,
      },
    )
  }
} catch (e) {
  run.record("run", "FAIL", { error: String(e?.message ?? e).slice(0, 500) })
  await runShot(page, run, "error")
} finally {
  await app.close().catch(() => {})
}

// 11. Restricted mode: sessions are listed, creating/renaming is disabled.
try {
  // The home folder is trusted in this VS Code setup, so use a folder outside it (OCO_RESTRICTED_DIR,
  // default: a fresh temp folder) and give it one session so there is something to list.
  const rdir = fs.mkdtempSync(path.join(process.env.OCO_RESTRICTED_DIR ?? os.tmpdir(), "oco-restricted-"))
  const secret = fs.readFileSync(path.join(root, ".oco-test/secret"), "utf8").trim()
  await fetch((process.env.OCO_TEST_URL ?? "http://127.0.0.1:4517") + `/session?directory=${encodeURIComponent(fs.realpathSync(rdir))}`, {
    method: "POST",
    headers: { authorization: "Basic " + Buffer.from("opencode:" + secret).toString("base64"), "content-type": "application/json" },
    body: JSON.stringify({ title: `oco restricted ${rand}` }),
  })
  ;({ app, page, stateFile } = await launch({ profile: "p1b-sidebar-restricted", run, trust: false, workspace: rdir }))
  run.setEnv({ restrictedWorkspace: "temp folder outside the trusted home folder" })
  await command(page, "Focus on Sessions View")
  const sb = await until(async () => {
    const s = (await hostState(page, stateFile)).sidebar
    return s.connection?.state === "connected" ? s : undefined
  }, 30000)
  const trusted = (await hostState(page, stateFile)).trusted
  const plus = titleAction("New Session")
  const plusDisabled = await plus.evaluate((el) => el.classList.contains("disabled") || el.getAttribute("aria-disabled") === "true").catch(() => null)
  const framesBefore = (await chatFrames(page)).length
  await plus.click({ force: false, timeout: 3000 }).catch(() => {})
  await sleep(2500)
  const framesAfter = (await chatFrames(page)).length
  await runShot(page, run, "11-restricted")
  run.record("restricted-mode", trusted === false && sb?.items.length > 0 && plusDisabled === true && framesAfter === framesBefore ? "PASS" : "FAIL", {
    trusted,
    listed: sb?.items.length ?? 0,
    newSessionActionDisabled: plusDisabled,
    panelsOpenedByClick: framesAfter - framesBefore,
    statusTooltipMentionsReadOnly: null,
  })
} catch (e) {
  run.record("restricted-mode", "FAIL", { error: String(e?.message ?? e).slice(0, 400) })
} finally {
  await app?.close().catch(() => {})
  await rejectLeftovers().catch(() => {})
  process.exit(run.finish())
}
