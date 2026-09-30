// P1b reconnect suite (real VS Code + real test server, native Sessions sidebar only; no chat panel is opened).
// The sidebar's event stream goes through a controllable local proxy (lib/proxy.mjs) that can cut streams,
// refuse connections and stall streams. Server-side changes are made directly against the test server
// (api() bypasses the proxy), so the sidebar can only learn about them through a snapshot or an event.
//   reconnect-hard-cut    streams cut + connections refused: reconnecting with the old list, then snapshot == server
//   reconnect-incremental after the reconnect, create/rename arrive as events (no new snapshot request)
//   reconnect-stall       a silent stream is dropped by the watchdog (OCO_DEV_STALL_MS) and recovered
//   search-scope-hint     >200 root sessions: "latest 200" hint, and the search-scope hint while searching
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { createRun } from "./lib/results.mjs"
import { startProxy } from "./lib/proxy.mjs"
import { launch, command, sleep, runShot, hostState, root } from "./vscode.mjs"
import { api } from "./server.mjs"

const REQUIRED = ["reconnect-hard-cut", "reconnect-incremental", "reconnect-stall", "search-scope-hint"]
const run = createRun({ suite: "p1b-reconnect", required: REQUIRED, scriptPath: fileURLToPath(import.meta.url) })
// server.mjs has already captured the direct URL; the proxy forwards to the same server.
const DIRECT = process.env.OCO_TEST_URL ?? "http://127.0.0.1:4517"
const secret = fs.readFileSync(path.join(root, ".oco-test/secret"), "utf8").trim()
const health = await api("GET", "/global/health").catch(() => null)
run.setEnv({ serverVersion: health?.version ?? null })
const dir = path.join(fs.realpathSync(path.join(root, ".oco-test")), "workspace")
const manyDir = path.join(fs.realpathSync(path.join(root, ".oco-test")), "workspace-many")
const rand = Math.random().toString(36).slice(2, 7)
const STALL_MS = 4000
// Read by the extension host at launch (dev builds only): shortens the 35 s heartbeat watchdog.
process.env.OCO_DEV_STALL_MS = String(STALL_MS)

const created = [] // sessions this run created in the default workspace (deleted at the end)
const MAX = 200

/** Request against the test server for an explicit directory (query parameter), independent of api(). */
async function dreq(method, p, body, directory) {
  const sep = p.includes("?") ? "&" : "?"
  const r = await fetch(`${DIRECT}${p}${directory ? `${sep}directory=${encodeURIComponent(directory)}` : ""}`, {
    method,
    headers: { authorization: "Basic " + Buffer.from("opencode:" + secret).toString("base64"), "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  })
  const t = await r.text()
  if (!r.ok) throw new Error(`${method} ${p}: HTTP ${r.status} ${t.slice(0, 120)}`)
  return t ? JSON.parse(t) : null
}

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

/** What the sidebar shows for a session: title, or the id when the title is empty (see SessionStore.list). */
const shown = (s) => `${s.id}|${s.title?.trim() || s.id}`
/** Pure comparison of sidebar rows against server rows (id + shown title), order-insensitive. */
export function diffLists(sidebarItems, serverItems) {
  const a = new Set(sidebarItems.map((i) => `${i.id}|${i.title}`))
  const b = new Set(serverItems.map(shown))
  const missing = [...b].filter((x) => !a.has(x))
  const extra = [...a].filter((x) => !b.has(x))
  return { same: missing.length === 0 && extra.length === 0 && a.size === sidebarItems.length, missing, extra }
}

/** Root sessions of a directory as the sidebar feed asks for them: newest first, top 200, not archived. */
async function serverRoots(directory = dir) {
  return ((await dreq("GET", `/session?roots=true&limit=${MAX}`, undefined, directory)) ?? []).filter((s) => !s.time?.archived).sort((a, b) => (b.time?.updated ?? 0) - (a.time?.updated ?? 0))
}
async function mkSession(title) {
  const s = await api("POST", "/session", { title })
  if (s?.directory !== dir) throw new Error(`session created in unexpected directory: ${s?.directory}`)
  created.push(s.id)
  return s
}

// Comparator self-check (negative control that needs no VS Code): a changed title, a missing row and an
// extra row must all be reported as a difference.
{
  const rows = [{ id: "a", title: "one" }, { id: "b", title: "two" }]
  const srv = [{ id: "a", title: "one" }, { id: "b", title: "two" }]
  const ok = diffLists(rows, srv).same
  const wrongTitle = !diffLists(rows, [{ id: "a", title: "one" }, { id: "b", title: "TWO" }]).same
  const missing = !diffLists(rows, srv.slice(0, 1)).same
  const extra = !diffLists(rows, [...srv, { id: "c", title: "three" }]).same
  run.record("comparator-selftest", ok && wrongTitle && missing && extra ? "PASS" : "FAIL", { ok, wrongTitle, missing, extra })
}

const proxy = await startProxy({ target: DIRECT })
let app
let page
let stateFile
const cleanup = async () => {
  proxy.refuse(false)
  await app?.close().catch(() => {})
}
run.installCrashHandlers(cleanup)

try {
  // Seed session whose title the cases rename (renaming a session of another suite would disturb it).
  const seedTitle = `reconnect-seed-${rand}`
  const seed = await mkSession(seedTitle)
  ;({ app, page, stateFile } = await launch({ profile: "p1b-reconnect", run, settings: { "oco.serverUrl": proxy.url } }))
  run.setEnv({ proxy: "127.0.0.1:<random> -> test server", stallMs: STALL_MS })
  const state = () => hostState(page, stateFile)
  const sidebar = async () => (await state()).sidebar
  const connState = async () => (await sidebar()).connection?.state
  const waitConnected = (ms = 40000) => until(async () => ((await connState()) === "connected" ? true : undefined), ms, 500)
  /** Sidebar equals the server's list (and optionally has the given id/title pairs). */
  async function waitConsistent(expect = [], ms = 25000) {
    let last
    await until(async () => {
      const sb = await sidebar()
      const d = diffLists(sb.items, await serverRoots())
      const has = expect.every(([id, title]) => sb.items.find((i) => i.id === id)?.title === title)
      last = { sb, ...d, has }
      return sb.connection?.state === "connected" && d.same && has ? true : undefined
    }, ms, 700)
    return last
  }
  const ids = (sb) => sb.items.map((i) => i.id)
  const runCase = async (id, fn) => {
    try {
      await fn()
    } catch (e) {
      proxy.refuse(false)
      proxy.stall(false)
      run.record(id, "FAIL", { error: String(e?.message ?? e).slice(0, 400) })
      await runShot(page, run, `${id}-error`)
    }
  }

  await command(page, "Focus on Sessions View")
  if (!(await waitConnected(40000))) throw new Error("sidebar did not connect through the proxy")
  {
    const base = await waitConsistent()
    run.setEnv({ baselineItems: base?.sb?.items.length ?? null, baselineConsistent: !!base?.same })
    if (!base?.same) throw new Error(`baseline sidebar differs from server: missing=${base?.missing?.length} extra=${base?.extra?.length}`)
  }
  let renamedTitle = seedTitle

  // 1. Hard cut: streams destroyed, new connections refused. The old list stays (reconnecting); changes made
  //    on the server meanwhile appear after the reconnect, through the new snapshot.
  await runCase("reconnect-hard-cut", async () => {
    const before = proxy.counters()
    const beforeIds = ids(await sidebar())
    proxy.cutStreams()
    proxy.refuse(true)
    const rec = await until(async () => {
      const sb = await sidebar()
      return sb.connection?.state === "reconnecting" ? sb : undefined
    }, 20000, 500)
    // Server changes while the sidebar cannot see the server.
    const newTitle = `reconnect-new-${rand}`
    const newS = await mkSession(newTitle)
    renamedTitle = `reconnect-renamed-${rand}`
    await api("PATCH", `/session/${seed.id}`, { title: renamedTitle })
    await sleep(3500) // several refused attempts (backoff 1 s, 2 s, ...)
    const during = await sidebar()
    await runShot(page, run, "1-outage")
    const refused = proxy.stats.refusedConnections + proxy.stats.refusedRequests
    const preserved = during.items.length > 0 && ids(during).join() === beforeIds.join()
    const staleOnly = !ids(during).includes(newS.id) && during.items.find((i) => i.id === seed.id)?.title !== renamedTitle
    proxy.refuse(false)
    const back = await waitConnected(60000)
    const fin = await waitConsistent([[newS.id, newTitle], [seed.id, renamedTitle]], 30000)
    const after = proxy.counters()
    await runShot(page, run, "1-recovered")
    run.record(
      "reconnect-hard-cut",
      rec && /连接中断/.test(during.message ?? "") && during.connection?.state === "reconnecting" && preserved && staleOnly && refused > 0 && back && fin?.same && fin.has && after.eventConnections > before.eventConnections && after.snapshotRequests > before.snapshotRequests ? "PASS" : "FAIL",
      {
        reconnectingSeen: !!rec,
        duringState: during.connection?.state,
        duringAttempt: during.connection?.attempt,
        duringMessage: (during.message ?? "").slice(0, 60),
        oldListPreserved: preserved,
        noServerChangesDuringOutage: staleOnly,
        refusedConnections: refused,
        recovered: !!back,
        consistentWithServer: !!fin?.same,
        hasNewAndRenamed: !!fin?.has,
        missing: fin?.missing?.slice(0, 3),
        extra: fin?.extra?.slice(0, 3),
        eventConnections: [before.eventConnections, after.eventConnections],
        snapshotRequests: [before.snapshotRequests, after.snapshotRequests],
      },
    )
  })

  // 2. Incremental: after the reconnect, changes arrive as events; no further snapshot request is made.
  await runCase("reconnect-incremental", async () => {
    await until(async () => (proxy.counters().openStreams >= 1 ? true : undefined), 15000, 200)
    const c0 = proxy.counters()
    const attempt0 = (await sidebar()).connection
    const newTitle = `reconnect-inc-${rand}`
    const newS = await mkSession(newTitle)
    const incTitle = `reconnect-inc-renamed-${rand}`
    await api("PATCH", `/session/${seed.id}`, { title: incTitle })
    renamedTitle = incTitle
    const fin = await waitConsistent([[newS.id, newTitle], [seed.id, incTitle]], 20000)
    const c1 = proxy.counters()
    await runShot(page, run, "2-incremental")
    run.record(
      "reconnect-incremental",
      fin?.same && fin.has && fin.sb.connection.state === "connected" && c1.snapshotRequests === c0.snapshotRequests && c1.eventConnections === c0.eventConnections ? "PASS" : "FAIL",
      {
        consistentWithServer: !!fin?.same,
        hasNewAndRenamed: !!fin?.has,
        state: fin?.sb?.connection?.state,
        snapshotRequests: [c0.snapshotRequests, c1.snapshotRequests],
        eventConnections: [c0.eventConnections, c1.eventConnections],
        attemptBefore: attempt0?.attempt,
        missing: fin?.missing?.slice(0, 3),
        extra: fin?.extra?.slice(0, 3),
      },
    )
  })

  // 3. Stall: the connection stays open but silent. Control first: an idle but healthy stream (proxy keepalives)
  //    must survive longer than the watchdog. Then stall it; the watchdog must drop it, and after the
  //    reconnect the sidebar equals the server, including a change made while the stream was silent.
  await runCase("reconnect-stall", async () => {
    await until(async () => (proxy.counters().openStreams >= 1 ? true : undefined), 15000, 200)
    const k0 = proxy.counters()
    await sleep(STALL_MS + 2500)
    const k1 = proxy.counters()
    const controlOk = k1.eventConnections === k0.eventConnections && (await connState()) === "connected"

    proxy.resetStalledCounter()
    const cuts0 = proxy.stats.cuts
    const c0 = proxy.counters()
    proxy.stall(true) // streams open now: no more bytes
    const tStall = Date.now()
    const stallTitle = `reconnect-stall-${rand}`
    const stallS = await mkSession(stallTitle) // its event is swallowed by the stalled stream
    const dropped = await proxy.stalledClosedByClient(30000)
    const watchdogMs = Date.now() - tStall
    proxy.refuse(true) // keep the sidebar in reconnecting long enough to observe it
    const rec = await until(async () => {
      const sb = await sidebar()
      return sb.connection?.state === "reconnecting" ? sb : undefined
    }, 20000, 500)
    await runShot(page, run, "3-stall-reconnecting")
    proxy.refuse(false)
    proxy.stall(false)
    const back = await waitConnected(60000)
    const fin = await waitConsistent([[stallS.id, stallTitle]], 30000)
    const c1 = proxy.counters()
    await runShot(page, run, "3-stall-recovered")
    run.record(
      "reconnect-stall",
      controlOk && dropped && watchdogMs >= STALL_MS - 1500 && watchdogMs <= STALL_MS + 6000 && proxy.stats.cuts === cuts0 && rec && back && fin?.same && fin.has && c1.eventConnections > c0.eventConnections ? "PASS" : "FAIL",
      {
        healthyIdleStreamKeptOpen: controlOk,
        droppedByClientWatchdog: dropped,
        watchdogMs,
        proxyCutsDuringStall: proxy.stats.cuts - cuts0, // the watchdog, not the proxy, must end the stream
        reconnectingSeen: !!rec,
        reconnectError: (rec?.connection?.error ?? "").slice(0, 60),
        recovered: !!back,
        consistentWithServer: !!fin?.same,
        hasStallTimeChange: !!fin?.has,
        missing: fin?.missing?.slice(0, 3),
        extra: fin?.extra?.slice(0, 3),
        eventConnections: [c0.eventConnections, c1.eventConnections],
      },
    )
  })
} catch (e) {
  run.record("run", "FAIL", { error: String(e?.message ?? e).slice(0, 500) })
  if (page) await runShot(page, run, "error")
} finally {
  proxy.refuse(false)
  await app?.close().catch(() => {})
}

// 4. Search scope hint: a dedicated workspace with more than 200 root sessions.
try {
  fs.mkdirSync(manyDir, { recursive: true })
  const realMany = fs.realpathSync(manyDir)
  let existing = (await dreq("GET", `/session?roots=true&limit=1000`, undefined, realMany)) ?? []
  const want = MAX + 5
  let n = existing.length
  while (n < want) {
    const batch = Math.min(6, want - n)
    await Promise.all(Array.from({ length: batch }, (_, i) => dreq("POST", "/session", { title: `oco-many-${rand}-${n + i}` }, realMany)))
    n += batch
  }
  const serverAll = ((await dreq("GET", `/session?roots=true&limit=1000`, undefined, realMany)) ?? []).filter((s) => !s.time?.archived).sort((a, b) => (b.time?.updated ?? 0) - (a.time?.updated ?? 0))
  const beyond = serverAll.slice(MAX).map((s) => s.id)
  ;({ app, page, stateFile } = await launch({ profile: "p1b-reconnect-many", run, workspace: manyDir, settings: { "oco.serverUrl": DIRECT } }))
  const sidebar = async () => (await hostState(page, stateFile)).sidebar
  await command(page, "Focus on Sessions View")
  const loaded = await until(async () => {
    const sb = await sidebar()
    return sb.connection?.state === "connected" && sb.items.length >= MAX ? sb : undefined
  }, 60000, 800)
  await runShot(page, run, "4-loaded")
  const idsShown = new Set((loaded?.items ?? []).map((i) => i.id))
  const beyondHidden = beyond.length >= 1 && beyond.every((id) => !idsShown.has(id))
  const topMatches = serverAll.slice(0, MAX).every((s) => idsShown.has(s.id))
  const hint = /只加载了最近 200 个会话/.test(loaded?.message ?? "") && /最近 200 个会话/.test(loaded?.message ?? "")

  await command(page, "oco: Search Sessions", { input: "oco-many" })
  const searched = await until(async () => {
    const sb = await sidebar()
    return sb.search === "oco-many" ? sb : undefined
  }, 20000, 600)
  await runShot(page, run, "4-search")
  const searchIds = new Set((searched?.items ?? []).map((i) => i.id))
  const searchHint = /搜索只在已加载的最近 200 个会话中进行/.test(searched?.message ?? "")
  const beyondNotFound = beyond.every((id) => !searchIds.has(id))
  run.record("search-scope-hint", serverAll.length > MAX && loaded?.items.length === MAX && hint && topMatches && beyondHidden && searched && searched.items.length > 0 && searchHint && beyondNotFound ? "PASS" : "FAIL", {
    serverRoots: serverAll.length,
    loadedItems: loaded?.items.length ?? null,
    loadedMessage: (loaded?.message ?? "").slice(0, 60),
    newest200Shown: topMatches,
    olderSessionsHidden: beyondHidden,
    searchItems: searched?.items.length ?? null,
    searchMessage: (searched?.message ?? "").slice(0, 60),
    olderSessionsNotInSearch: beyondNotFound,
  })
} catch (e) {
  run.record("search-scope-hint", "FAIL", { error: String(e?.message ?? e).slice(0, 400) })
  if (page) await runShot(page, run, "4-error")
} finally {
  await app?.close().catch(() => {})
  await proxy.close().catch(() => {})
  for (const id of created) await api("DELETE", `/session/${id}`).catch(() => {})
  process.exit(run.finish())
}
