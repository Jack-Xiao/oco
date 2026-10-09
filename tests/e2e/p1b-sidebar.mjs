// P1b-1 main chain through the Sessions sidebar webview (real VS Code + real server):
// list -> create -> rename -> search -> draft -> send -> permission -> stop -> status -> switch/restore,
// then a connection-switch regression and a restricted-mode (untrusted workspace) regression.
// Rows are clicked inside the sessions webview; title actions are native buttons. The host's debug state is
// only read to check what the sidebar shows. Rename goes through oco.renameSession because the webview
// context menu is a native macOS menu Playwright cannot click.
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { createRun } from "./lib/results.mjs"
import { sessionsFrame, sessionRow, moreHead, loadMoreRow, titleAction, openSearch } from "./lib/sessions-web.mjs"
import { launch, command, chatFrames, frameSession, sleep, runShot, hostState, clearNotifications, root } from "./vscode.mjs"
import { api, messages, status, waitIdle, waitReply, waitMessageFinal } from "./server.mjs"

const REQUIRED = [
  "sidebar-list",
  "single-view-header",
  "sidebar-create",
  "sidebar-rename",
  "sidebar-search",
  "chain-draft",
  "chain-permission",
  "chain-stop",
  "sidebar-status-icons",
  "switch-restore",
  "focus-existing-group",
  "connection-switch",
  "restricted-mode",
]
const run = createRun({ suite: "p1b-sidebar", required: REQUIRED, scriptPath: fileURLToPath(import.meta.url) })
const health = await api("GET", "/global/health").catch(() => null)
run.setEnv({ serverVersion: health?.version ?? null })
const dir = path.join(fs.realpathSync(path.join(root, ".oco-test")), "workspace")
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
/** Description is only a compact age ("now", "7m", "3h", "yesterday", "3d", "Sep 28"). */
const COMPACT_TIME = /^(now|\d+m|\d+h|yesterday|\d+d|[A-Z][a-z]{2} \d{1,2}|\d{4}-\d{2}-\d{2})$/
function startOfYesterday(now = Date.now()) {
  const date = new Date(now)
  date.setHours(0, 0, 0, 0)
  date.setDate(date.getDate() - 1)
  return date.getTime()
}
/** Status dot of a session row: class (running / waiting / …) and the running pulse animation name. */
async function dotInfo(title) {
  return (await sessionRow(page, title))
    .locator(".dot")
    .evaluate((el) => ({
      className: el.className,
      status: el.getAttribute("data-status") ?? "",
      animationName: getComputedStyle(el).animationName,
    }))
    .catch(() => null)
}
const hasClass = (info, name) => !!info && String(info.className).split(/\s+/).includes(name)
/** Waiting dot, captured while a permission is pending and checked with the running dot. */
let waitingDot = null
// The only view is merged into the container title, so its buttons show on hover of that title.
const revealSessionsActions = () => page.locator(".part.sidebar .composite.title").first().hover().catch(() => {})
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
/**
 * Opens a VS Code input box with `open` and returns once the box has kept focus for a moment. Right after a
 * command-palette call (hostState), VS Code hands focus back to the active chat webview asynchronously; when
 * that lands after the box opened, the box loses focus and closes. Re-open it in that case.
 */
async function openInputBox(open) {
  const focused = () =>
    page.evaluate(() => {
      const qi = document.querySelector(".quick-input-widget")
      return !!qi && qi.style.display !== "none" && document.hasFocus() && qi.contains(document.activeElement)
    })
  for (let attempt = 0; attempt < 3; attempt++) {
    await open()
    if (!(await until(async () => (await focused()) || undefined, 3000, 100))) continue
    await sleep(400)
    if (await focused()) return true
  }
  return false
}
async function sidebarItem(id) {
  return (await sidebar()).items.find((i) => i.id === id)
}
/** The newest session created after `known`, once its panel has a composer. */
async function newSessionFromPlus(known) {
  await revealSessionsActions()
  await titleAction(page, "New Session").click()
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
  await until(async () => ((await sidebar()).connection?.state === "connected" && (await sessionsFrame(page)) ? true : undefined), 30000)

  // 1. List = the loaded page of this directory's root sessions (100), newest first, split into
  //    recent (since local yesterday, or not idle / unread) and older rows under More.
  {
    const sb = await sidebar()
    const serverSessions = await serverRoots()
    const server = serverSessions.map((s) => s.id)
    const loaded = server.slice(0, 100)
    const ids = sb.items.map((i) => i.id)
    const updated = new Map(serverSessions.map((s) => [s.id, s.time?.updated ?? 0]))
    const since = startOfYesterday()
    const expectGroup = (it) => ((updated.get(it.id) ?? 0) >= since || it.activity !== "idle" || it.unread ? "recent" : "more")
    const groupsOk = sb.items.length > 0 && sb.items.every((it) => it.group === expectGroup(it) && COMPACT_TIME.test(it.description) && !/\b(Open|Running|Waiting)\b/.test(it.description))
    const recent = sb.items.filter((i) => i.group === "recent").map((i) => i.id)
    const more = sb.items.filter((i) => i.group === "more").map((i) => i.id)
    const inOrder = (arr) => arr.every((id, i) => i === 0 || loaded.indexOf(arr[i - 1]) < loaded.indexOf(id))
    const samePage = ids.length === loaded.length && server.length > 0 && new Set(ids).size === ids.length && ids.every((id) => loaded.includes(id))
    const splitOrder = recent.concat(more).join() === ids.join() && inOrder(recent) && inOrder(more)
    const loadMoreOk = sb.loadMore === (server.length >= 100)
    let moreRowOk = true
    let lastRows = null
    let loadedAfterClick = null
    if (more.length === 0 && sb.loadMore) {
      // Every loaded session is recent: "Load more…" is a top-level row, and there is no More header.
      // The webview renders every row (no virtualization), including ones below the fold.
      const frame = await sessionsFrame(page)
      if (frame) lastRows = await frame.locator('.list[role="listbox"] [role="option"]').evaluateAll((els) => els.slice(-3).map((e) => e.getAttribute("aria-label"))).catch(() => null)
      const load = await loadMoreRow(page)
      moreRowOk = (await (await moreHead(page)).count()) === 0 && (await load.count()) > 0
      // Clicking it pulls the next page of 100.
      if (moreRowOk) {
        await load.scrollIntoViewIfNeeded().catch(() => {})
        await load.click()
        const grown = await until(async () => ((await sidebar()).items.length > ids.length ? (await sidebar()).items.length : undefined), 15000, 300)
        loadedAfterClick = grown ?? null
        moreRowOk = !!grown && grown >= Math.min(server.length, 200)
      }
    } else if (more.length > 0) {
      const head = await moreHead(page)
      await head.scrollIntoViewIfNeeded().catch(() => {})
      const text = (await head.innerText().catch(() => "")) || ""
      moreRowOk = (await head.isVisible().catch(() => false)) && text.includes("More") && text.includes(String(more.length))
    }
    await runShot(page, run, "1-list")
    run.record("sidebar-list", sb.connection.state === "connected" && samePage && ids[0] === server[0] && groupsOk && splitOrder && loadMoreOk && moreRowOk ? "PASS" : "FAIL", {
      state: sb.connection.state,
      items: ids.length,
      recent: recent.length,
      more: more.length,
      loadMore: sb.loadMore,
      serverRoots: server.length,
      firstMatches: ids[0] === server[0],
      groupsOk,
      moreRowOk,
      lastRows,
      loadedAfterClick,
      statusText: sb.statusText,
    })
  }

  // 1b. The container's only view is the Sessions webview, merged into the container title (no Connection or Agents header).
  {
    const headerNames = await page.locator(".part.sidebar .pane-header .title").evaluateAll((els) => els.map((el) => (el.textContent ?? "").trim())).catch(() => [])
    const connectionHeaders = headerNames.filter((name) => name === "Connection").length
    const agentsHeaders = headerNames.filter((name) => name === "Agents").length
    const fromLabel = ((await page.locator(".part.sidebar .composite.title .title-label").first().innerText().catch(() => "")) || "").replace(/\s+/g, " ").trim()
    const containerTitle = fromLabel || ((await page.locator(".part.sidebar .composite.title h2").first().innerText().catch(() => "")) || "").replace(/\s+/g, " ").trim()
    await revealSessionsActions()
    const newSession = await titleAction(page, "New Session").isVisible().catch(() => false)
    await runShot(page, run, "1b-single-view")
    run.record("single-view-header", connectionHeaders === 0 && agentsHeaders === 0 && containerTitle.includes("Sessions") && newSession ? "PASS" : "FAIL", {
      containerTitle,
      connectionHeaders,
      agentsHeaders,
      newSession,
      paneHeaders: headerNames,
    })
  }

  // 2. Create from the view's "+" action: a panel opens and the list shows it first in Recent.
  //    There is no "Open" marker; the row's aria-label is "title, time" while it is idle.
  let A
  {
    const before = new Set((await sidebar()).items.map((i) => i.id))
    A = await newSessionFromPlus(before)
    const item = await until(async () => {
      const it = await sidebarItem(A)
      return it?.description ? it : undefined
    })
    const first = (await sidebar()).items[0]?.id
    const server = await api("GET", `/session/${A}`)
    const aria = item ? (await (await sessionRow(page, item.title)).getAttribute("aria-label").catch(() => "")) ?? "" : ""
    const timeOk = !!item && item.group === "recent" && COMPACT_TIME.test(item.description) && !/\bOpen\b/.test(item.description)
    const ariaOk = !!item && aria.startsWith(`${item.title},`) && aria.includes(item.description) && !/\bOpen\b/.test(aria)
    run.record("sidebar-create", !!A && timeOk && ariaOk && first === A && server?.directory === dir ? "PASS" : "FAIL", { sessionId: A, listedFirst: first === A, description: item?.description, group: item?.group, activity: item?.activity, aria, serverDirectory: server?.directory === dir })
  }

  // 3. Rename through oco.renameSession -> server title, list label and editor tab follow. The webview's
  // context menu is a native menu on macOS (out of Playwright's reach): pick the session from the command's
  // quick pick by id (it matches the description), then the title input box opens.
  const newTitle = `oco-renamed-${rand}`
  {
    const box = await openInputBox(async () => {
      await command(page, "oco: Rename Session", { input: A })
    })
    if (box) {
      await page.keyboard.press("Meta+a")
      await page.keyboard.type(newTitle)
      await page.keyboard.press("Enter")
    }
    const serverTitle = await until(async () => ((await api("GET", `/session/${A}`))?.title === newTitle ? newTitle : undefined))
    const treeTitle = await until(async () => ((await sidebarItem(A))?.title === newTitle ? newTitle : undefined))
    const tabTitle = await until(async () => ((await state()).panels.find((p) => p.sessionId === A)?.title === newTitle ? newTitle : undefined))
    await runShot(page, run, "3-rename")
    run.record("sidebar-rename", serverTitle && treeTitle && tabTitle ? "PASS" : "FAIL", { serverTitle: !!serverTitle, treeTitle: !!treeTitle, tabTitle: !!tabTitle })
  }

  // 4. Search via the title action (webview input, 200ms debounce); clear via the clear action.
  {
    const total = (await sidebar()).items.length
    const opened = await openSearch(page)
    const frame = opened ? await sessionsFrame(page) : null
    if (frame) {
      await frame.locator("input.search").fill(rand)
      // Let the 200 ms debounce and the host round trip finish inside the page before the palette-driven
      // state read below: its Escape would otherwise land in the still-focused search box and clear it.
      await frame
        .waitForFunction((q) => {
          const rows = [...document.querySelectorAll('.row[data-kind="session"]')]
          return rows.length > 0 && rows.every((r) => r.textContent.includes(q))
        }, rand, { timeout: 10000 })
        .catch(() => {})
    }
    const filtered = await until(async () => {
      const sb = await sidebar()
      return sb.search === rand ? sb : undefined
    })
    const rowVisible = await (await sessionRow(page, newTitle)).isVisible().catch(() => false)
    await runShot(page, run, "4-search")
    await revealSessionsActions()
    await titleAction(page, "Clear Session Search").click()
    const cleared = await until(async () => {
      const sb = await sidebar()
      return sb.search === "" && sb.items.length === total ? sb : undefined
    })
    const flat = !!filtered && filtered.items.every((i) => i.group === "recent") && filtered.loadMore === false
    run.record("sidebar-search", filtered?.items.length === 1 && filtered.items[0].id === A && flat && rowVisible && !!cleared ? "PASS" : "FAIL", {
      matches: filtered?.items.map((i) => i.id),
      searchOpened: opened,
      flat,
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
    const permItem = sbPerm?.items.find((i) => i.id === A)
    const permAria = permItem ? (await (await sessionRow(page, permItem.title)).getAttribute("aria-label").catch(() => "")) ?? "" : ""
    if (permItem) {
      waitingDot = await until(async () => {
        const info = await dotInfo(permItem.title)
        return hasClass(info, "waiting") ? info : undefined
      }, 5000)
    }
    const permShown = !!permItem && permItem.activity === "permission" && /Waiting for permission/.test(permAria) && !/Waiting/.test(permItem.description ?? "") && COMPACT_TIME.test(permItem.description ?? "")
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
      req && sentDraft && sbPerm && sbPerm.badge >= 1 && permShown && tool?.state?.status === "completed" && idle ? "PASS" : req ? "FAIL" : "NOT RUN",
      {
        requestId: req?.id ?? null,
        sidebarActivity: permItem?.activity ?? null,
        aria: permAria,
        description: permItem?.description ?? null,
        waitingDot: waitingDot?.className ?? null,
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
    // Running dot pulses (oco-pulse, 1.6s) while the row is busy. Read it before Stop.
    const runningDot = busy && (await sidebarItem(A))?.activity === "busy"
      ? await until(async () => {
          const info = await dotInfo(newTitle)
          return hasClass(info, "running") && info.animationName !== "none" ? info : undefined
        }, 5000)
      : null
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
    const runningOk = hasClass(runningDot, "running") && !!runningDot && runningDot.animationName !== "none"
    const waitingOk = hasClass(waitingDot, "waiting")
    run.record("sidebar-status-icons", runningOk && waitingOk ? "PASS" : "FAIL", {
      runningClass: runningDot?.className ?? null,
      runningStatus: runningDot?.status ?? null,
      runningAnimation: runningDot?.animationName ?? null,
      waitingClass: waitingDot?.className ?? null,
      waitingStatus: waitingDot?.status ?? null,
    })
  }

  // 8. Switch/restore in the main panel: B replaces A in place (ADR-007); clicking A's row brings A back
  //    with its unsent draft, B keeps its own; no duplicate panels.
  let B
  {
    const fa = await frameFor(A)
    await type(fa, `draft-A-${rand}`)
    await sleep(1500)
    B = await newSessionFromPlus(new Set((await sidebar()).items.map((i) => i.id)))
    const fb = await until(() => frameFor(B))
    await type(fb, `draft-B-${rand}`)
    await sleep(1500)
    await (await sessionRow(page, newTitle)).click()
    const fa2 = await until(async () => {
      const f = await frameFor(A)
      return f && (await f.evaluate(() => document.visibilityState === "visible").catch(() => false)) && (await composer(f).catch(() => "")).includes(`draft-A-${rand}`) ? f : undefined
    }, 30000)
    const st = await state()
    const aDraft = fa2 ? await composer(fa2) : ""
    const bTitle = (await sidebarItem(B))?.title
    // B is hidden now; open it again from its row and check its own draft.
    await (await sessionRow(page, bTitle)).click()
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
    // The main panel shows B. Switch it back to A, open B in a new (pinned) panel and move that panel to a
    // new right group -> A shows in group 1 (main), B in group 2 (pinned). ADR-007.
    await (await sessionRow(page, newTitle)).click()
    await until(() => frameFor(A))
    await command(page, "oco: Open in New Panel", { input: B })
    await until(() => frameFor(B))
    await command(page, "View: Move Editor into Right Group")
    await sleep(2500)
    const before = await state()
    const bTitle = (await sidebarItem(B))?.title
    await (await sessionRow(page, bTitle)).click()
    await sleep(1500)
    const afterB = await state()
    await (await sessionRow(page, newTitle)).click()
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
    // Another server resets the list to its first page (100); search matches merged earlier are dropped.
    const beforeIds = (await sidebar()).items.map((i) => i.id)
    await command(page, "Focus on Sessions View") // the empty-state check below reads the visible view
    const settings = JSON.parse(fs.readFileSync(settingsFile, "utf8"))
    fs.writeFileSync(settingsFile, JSON.stringify({ ...settings, "oco.serverUrl": "http://127.0.0.1:4599" }, null, 2))
    const down = await until(async () => {
      const sb = await sidebar()
      return sb.connection?.state === "error" ? sb : undefined
    }, 30000, 800)
    await runShot(page, run, "10-unreachable")
    fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2))
    // While the new snapshot's rows are on their way the view shows "Loading sessions…", never the empty-state.
    let emptyFlash = false
    let loadingSeen = false
    const watch = (async () => {
      const end = Date.now() + 15000
      while (Date.now() < end) {
        const frame = await sessionsFrame(page)
        const snap = frame
          ? await frame
              .evaluate(() => {
                const shown = (el) => (el && !el.hidden ? (el.innerText ?? "") : "")
                const list = document.querySelector('.list[role="listbox"]')
                const listShown = !!list && !list.hidden && list.getAttribute("aria-hidden") !== "true"
                return {
                  text: `${shown(document.querySelector(".message"))}\n${shown(document.querySelector(".notice"))}`,
                  rows: listShown ? list.querySelectorAll('.row[data-kind="session"]').length : 0,
                }
              })
              .catch(() => ({ text: "", rows: 0 }))
          : { text: "", rows: 0 }
        if (/no OpenCode sessions yet/.test(snap.text)) emptyFlash = true
        if (/Loading sessions/.test(snap.text)) loadingSeen = true
        if (snap.rows > 3 && !/Cannot connect/.test(snap.text)) break
        await sleep(20)
      }
    })()
    const up = await until(async () => {
      const sb = await sidebar()
      return sb.connection?.state === "connected" && sb.items.length ? sb : undefined
    }, 60000, 800)
    await watch
    const ids = up?.items.map((i) => i.id) ?? []
    run.record(
      "connection-switch",
      down && down.items.length === 0 && /Not connected/.test(down.statusText) && up && new Set(ids).size === ids.length && ids.length === Math.min(beforeIds.length, 100) && ids.every((i) => beforeIds.includes(i)) && !emptyFlash ? "PASS" : "FAIL",
      {
        downState: down?.connection?.state ?? null,
        downItems: down?.items.length ?? null,
        downStatus: down?.statusText ?? null,
        downMessage: down?.message ?? null,
        upState: up?.connection?.state ?? null,
        itemsBefore: beforeIds.length,
        itemsAfter: ids.length,
        duplicates: ids.length - new Set(ids).size,
        emptyFlash,
        loadingSeen,
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
  await revealSessionsActions()
  const plus = titleAction(page, "New Session")
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
