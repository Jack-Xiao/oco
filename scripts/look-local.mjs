// Dev aid (not a test suite): look at the M5 runtime ring view on REAL local sessions, without a remote host.
// Opens an isolated VS Code (own user-data-dir, this checkout's extension build) on a real folder in managed
// mode, so the server reads the local OpenCode data; opens one existing session by title, switches to the
// runtime view, then for every width x time: seeks the replay head through the root's `__ocoRuntime` hook,
// waits LOOK_SETTLE, reads `facts()`, screenshots, and records whether the root scrolls sideways
// (scrollWidth <= clientWidth). The facts of the keyframes are compared structurally with the M5 oracle
// (stage, card kind, N, M, plan, tool rows, subagents, "you" dock state). Read-only: it never sends a prompt
// and never touches the server or its config; `seek` only moves the replay head inside the page.
// Usage: LOOK_WS=<folder> LOOK_TITLE=<title substring> node scripts/look-local.mjs
//   LOOK_OUT=.oco-look-local   output dir (report.json, facts in it, screenshots). Holds real session text: keep it out of git.
//   LOOK_W=1100,560,1600       chat-frame widths in CSS px, visited in this order (single number also works)
//   LOOK_H=1000                window height
//   LOOK_TIMES=<ms,ms,...>     epoch ms to inspect; `auto` / `auto:N` = N evenly spaced instants of the session's own
//                              range (default 8). Unset = the 14 keyframes of the oracle (the real-data check: prints
//                              "keyframes in range X/14" and exits 1 when X < 14; if none lies inside this session's range it
//                              falls back to auto:8 so the screenshots and overflow checks still happen). For a mock or any
//                              other session pass LOOK_TIMES explicitly (event times of that session, or auto).
//   LOOK_ORACLE=<file>|none    oracle json (default: the fixture's runtime-m5-oracle.json)
//   LOOK_SETTLE=700            ms to wait after a resize / seek before reading
//   LOOK_SHOTS=0               skip screenshots
//   LOOK_DRY=1                 print the resolved configuration and exit (no VS Code, no server)
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ORACLE_DEFAULT = path.resolve(HERE, "../vendor/opencode/packages/app/src/components/session/fixtures/runtime-m5-oracle.json")
const T_TOL = 50 // ms: facts().t may differ from the requested instant by this much (fold rounding), not more
const FAR_FUTURE = 8.64e15 // seek() clamps into [t0, t1]; this reads t1 back without touching any range input

// ---------- pure helpers (exported so they can be checked without launching anything) ----------
export function parseNumberList(raw, fallback) {
  const list = String(raw ?? "")
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0)
  return list.length ? list : fallback
}

/** LOOK_TIMES -> { kind: "list", times } | { kind: "auto", n } | undefined (unset). */
export function parseTimes(raw) {
  if (raw === undefined || String(raw).trim() === "") return undefined
  const s = String(raw).trim()
  const auto = s.match(/^auto(?::(\d+))?$/i)
  if (auto) return { kind: "auto", n: Math.max(1, Number(auto[1] ?? 8)) }
  const times = s.split(",").map((x) => Number(x.trim())).filter((n) => Number.isFinite(n) && n > 0)
  if (!times.length) throw new Error(`LOOK_TIMES has no usable epoch ms: ${s}`)
  return { kind: "list", times }
}

export function autoTimes(t0, t1, n) {
  if (!Number.isFinite(t0) || !Number.isFinite(t1) || t1 < t0) return []
  const out = []
  for (let i = 0; i < n; i++) out.push(Math.round(t0 + ((t1 - t0) * (i + 0.5)) / n))
  return [...new Set(out)]
}

const num = (v) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? undefined : Number(v))

function planOf(p) {
  if (p === null || p === undefined) return undefined
  if (typeof p === "string") {
    const m = p.match(/(\d+)\s*\/\s*(\d+)/)
    return m ? { done: Number(m[1]), total: Number(m[2]) } : undefined
  }
  if (typeof p === "object") return { done: num(p.done), total: num(p.total), inProgress: num(p.inProgress) }
  return undefined
}

function sameOf(s) {
  if (s === null || s === undefined || s === "") return ""
  if (Array.isArray(s)) return s.length === 2 ? `${s[0]}/${s[1]}` : ""
  if (typeof s === "string") return s.trim()
  return ""
}

const toolKey = (t) => `${t.name}|${t.state}|${sameOf(t.same)}`
const subKey = (s) => `${s.num}|${s.state}`
const sortedBy = (list, key) => list.map(key).sort()

/** Fold an oracle frame (mockup verdicts) or a `facts()` result into the same comparable shape. */
export function normalize(x, kind) {
  if (kind === "oracle") {
    return {
      stage: x.stage,
      cardKind: x.card?.kind,
      round: num(x.round),
      request: num(x.m),
      plan: planOf(x.plan),
      tools: (x.own ?? []).map(([name, state, same]) => ({ name, state, same })),
      subs: (x.subs ?? []).map(([n, state]) => ({ num: n, state })),
      youState: x.you?.state,
      lane: num(x.lane),
    }
  }
  return {
    stage: x.stage,
    cardKind: x.cardKind,
    round: num(x.round),
    request: num(x.request),
    plan: planOf(x.plan),
    tools: Array.isArray(x.tools) ? x.tools : [],
    subs: Array.isArray(x.subs) ? x.subs : [],
    youState: x.youState,
    lane: num(x.k),
  }
}

/**
 * Structural comparison of one oracle frame against one `facts()`.
 * `diffs` break the verdict; `known` are documented departures from the mockup (plan D16) and are listed, not failed:
 * the mockup's whole-history childDone shows "docked" where the time-gated rule still says "run" between two child steps.
 * Not compared: `why`/status words (locale and D5/D18 rewording), `k` (reported as `kDelta` only).
 */
export function compareFrame(oracleFrame, facts) {
  const e = normalize(oracleFrame, "oracle")
  const a = normalize(facts ?? {}, "facts")
  const diffs = []
  const known = []
  const eq = (field, ex, ac) => {
    if ((ex ?? null) !== (ac ?? null)) diffs.push({ field, expected: ex ?? null, actual: ac ?? null })
  }
  eq("stage", e.stage, a.stage)
  eq("cardKind", e.cardKind, a.cardKind)
  eq("round", e.round, a.round)
  eq("request", e.request, a.request)
  eq("youState", e.youState, a.youState)
  // plan: done/total always; inProgress only when both sides report it
  if (!e.plan || !a.plan) {
    if (!!e.plan !== !!a.plan) diffs.push({ field: "plan", expected: e.plan ? `${e.plan.done}/${e.plan.total}` : null, actual: a.plan ? `${a.plan.done}/${a.plan.total}` : null })
  } else {
    eq("plan", `${e.plan.done}/${e.plan.total}`, `${a.plan.done}/${a.plan.total}`)
    if (e.plan.inProgress !== undefined && a.plan.inProgress !== undefined) eq("plan.inProgress", e.plan.inProgress, a.plan.inProgress)
  }
  // tool rows: name|state|same as a multiset; row order is reported separately
  const et = sortedBy(e.tools, toolKey)
  const at = sortedBy(a.tools, toolKey)
  if (et.join("\n") !== at.join("\n")) diffs.push({ field: "tools", expected: et, actual: at })
  else if (e.tools.map(toolKey).join("\n") !== a.tools.map(toolKey).join("\n")) known.push({ field: "tools.order", note: "same rows, different order" })
  // subagents by num
  const byNum = new Map(a.subs.map((s) => [s.num, s.state]))
  const eNums = new Set(e.subs.map((s) => s.num))
  const subDiffs = []
  for (const s of e.subs) {
    const got = byNum.get(s.num)
    if (got === s.state) continue
    if (s.state === "docked" && got === "run") known.push({ field: `subs.${s.num}`, expected: s.state, actual: got, note: "D16: run between child steps (docked in the mockup)" })
    else subDiffs.push({ num: s.num, expected: s.state, actual: got ?? null })
  }
  for (const s of a.subs) if (!eNums.has(s.num)) subDiffs.push({ num: s.num, expected: null, actual: s.state })
  if (subDiffs.length) diffs.push({ field: "subs", expected: sortedBy(e.subs, subKey), actual: sortedBy(a.subs, subKey), at: subDiffs })
  const kDelta = e.lane !== undefined && a.lane !== undefined ? Math.round((a.lane - e.lane) * 1000) / 1000 : undefined
  return { match: diffs.length === 0, diffs, known, kDelta }
}

export function loadOracle(file) {
  if (!file || file === "none" || !fs.existsSync(file)) return undefined
  const j = JSON.parse(fs.readFileSync(file, "utf8"))
  const frames = Array.isArray(j.frames) ? j.frames : []
  return frames.filter((f) => Number.isFinite(f?.t) && typeof f.id === "string")
}

const fmt = (v) => (Array.isArray(v) ? `[${v.join(", ")}]` : String(v))
const short = (d) => (d.field === "subs" ? `subs ${(d.at ?? []).map((x) => `#${x.num} ${x.expected}>${x.actual}`).join(" ")}` : `${d.field} ${fmt(d.expected)}>${fmt(d.actual)}`)

// ---------- main ----------
async function main() {
  const env = process.env
  const OUT = env.LOOK_OUT ?? path.resolve(".oco-look-local")
  const WIDTHS = parseNumberList(env.LOOK_W, [1100, 560, 1600])
  const H = Number(env.LOOK_H ?? 1000)
  const SETTLE = Number(env.LOOK_SETTLE ?? 700)
  const SHOTS = env.LOOK_SHOTS !== "0"
  const timesSpec = parseTimes(env.LOOK_TIMES)
  const oracle = loadOracle(env.LOOK_ORACLE ?? ORACLE_DEFAULT)
  const oracleByT = new Map((oracle ?? []).map((f) => [f.t, f]))

  if (env.LOOK_DRY === "1") {
    console.log(
      JSON.stringify({
        widths: WIDTHS,
        h: H,
        settle: SETTLE,
        shots: SHOTS,
        times: timesSpec ?? { kind: "oracle-keyframes", count: oracle?.length ?? 0, fallback: "auto:8" },
        oracleFrames: oracle?.length ?? 0,
        out: OUT,
      }),
    )
    return
  }
  if (!env.LOOK_WS || !env.LOOK_TITLE) throw new Error("set LOOK_WS and LOOK_TITLE")

  const { launch, command, waitUntil, chatFrames, sleep, fitGroups } = await import("../tests/e2e/vscode.mjs")
  fs.mkdirSync(OUT, { recursive: true })
  const report = {
    ws: env.LOOK_WS,
    title: env.LOOK_TITLE,
    widths: WIDTHS,
    h: H,
    settle: SETTLE,
    oracleFrames: oracle?.length ?? 0,
    timings: {},
    errors: [],
    sizes: {},
    points: [],
  }
  const t0 = Date.now()
  const mark = (k) => (report.timings[k] = Date.now() - t0)
  const pointFile = (id, w) => path.join(OUT, `${id.replace(/[^\w.-]+/g, "_")}-w${w}.png`)

  const { app, page } = await launch({
    workspace: env.LOOK_WS,
    profile: "look-local",
    settings: { "oco.serverMode": "managed", "workbench.colorTheme": "Default Dark Modern", "workbench.sideBar.location": "left" },
  })
  page.on("console", (m) => {
    if (m.type() === "error") report.errors.push(m.text().slice(0, 300))
  })
  try {
    await app.evaluate(({ BrowserWindow }, { w, h }) => BrowserWindow.getAllWindows()[0].setContentSize(w, h), { w: WIDTHS[0] + 60, h: H })
    mark("launched")
    // Managed server start + session list: retry the picker until a row matches.
    let f
    for (let i = 0; i < 6 && !f; i++) {
      await command(page, "oco: Open Session", { input: env.LOOK_TITLE }).catch((e) => report.errors.push("cmd " + e.message))
      f = await waitUntil(async () => {
        for (const fr of await chatFrames(page)) if (await fr.$("[data-oco-view]").catch(() => null)) return fr
      }, 15000, 300)
    }
    if (!f) throw new Error("no chat frame")
    mark("opened")
    await command(page, "View: Close Primary Side Bar").catch(() => {})
    await f.locator('[data-oco-view="runtime"]').click()
    await f.locator("[data-oco-runtime]").waitFor({ state: "visible", timeout: 20000 })
    mark("runtime")
    const hooked = await waitUntil(() => f.evaluate(() => typeof document.querySelector("[data-oco-runtime]")?.__ocoRuntime?.facts === "function"), 15000, 250)
    if (!hooked) throw new Error("the runtime root has no __ocoRuntime hook (is the installed extension build older than M5?)")
    await sleep(2500)

    const hook = (fn, arg) =>
      f.evaluate(
        ([fn, arg]) => {
          const h = document.querySelector("[data-oco-runtime]")?.__ocoRuntime
          if (!h) throw new Error("no __ocoRuntime hook")
          return h[fn](arg)
        },
        [fn, arg],
      )
    const measure = () =>
      f.evaluate(() => {
        const root = document.querySelector("[data-oco-runtime]")
        const frame = document.querySelector("[data-oco-runtime-frame]")
        return {
          innerWidth,
          layout: root?.getAttribute("data-oco-runtime-layout") ?? null,
          mode: document.querySelector("[data-oco-runtime-mode]")?.getAttribute("data-oco-runtime-mode") ?? null,
          rootScroll: root?.scrollWidth ?? null,
          rootClient: root?.clientWidth ?? null,
          frameScroll: frame?.scrollWidth ?? null,
          frameClient: frame?.clientWidth ?? null,
        }
      })
    const fit = async (w) => {
      const frames = await fitGroups(app, page, w).catch((e) => {
        report.errors.push("fit " + e.message)
        return []
      })
      await sleep(SETTLE)
      return frames
    }

    // First width, live: the page as it arrives (before the first seek leaves live mode).
    const firstFit = await fit(WIDTHS[0])
    report.live = { facts: await hook("facts").catch((e) => ({ error: String(e.message ?? e).slice(0, 200) })), ...(await measure()), fit: firstFit }
    if (SHOTS) await page.screenshot({ path: path.join(OUT, "live.png") })

    // Session range, read back through the hook's own clamping (no range input is touched).
    const clampedT = async (target) => {
      await hook("seek", target)
      await sleep(SETTLE)
      let t = num((await hook("facts")).t)
      for (let i = 0; i < 10; i++) {
        // the clamped instant is only trusted once two consecutive reads agree
        await sleep(100)
        const again = num((await hook("facts")).t)
        if (again === t) break
        t = again
      }
      return t
    }
    const lo = await clampedT(0)
    const hi = await clampedT(FAR_FUTURE)
    report.range = { t0: lo ?? null, t1: hi ?? null }
    const known = lo !== undefined && hi !== undefined && hi >= lo
    const inRange = (t) => !known || (t >= lo - 1 && t <= hi + 1)

    // Which instants to visit.
    let points
    if (timesSpec?.kind === "list") points = timesSpec.times.map((t) => ({ t, id: oracleByT.get(t)?.id ?? `t${t}`, oracle: oracleByT.get(t) }))
    else if (timesSpec?.kind === "auto") points = autoTimes(lo, hi, timesSpec.n).map((t) => ({ t, id: `auto-${t}`, oracle: undefined }))
    else if (oracle?.length && (!known || oracle.some((o) => inRange(o.t)))) points = oracle.map((o) => ({ t: o.t, id: o.id, oracle: o }))
    else {
      report.note = "no oracle keyframe lies inside this session's range: sampled auto:8 instead"
      points = autoTimes(lo, hi, 8).map((t) => ({ t, id: `auto-${t}`, oracle: undefined }))
    }
    if (!timesSpec && oracle?.length) report.keyframes = { inRange: oracle.filter((o) => inRange(o.t)).length, total: oracle.length }
    report.times = points.map((p) => p.t)
    if (!points.length) report.note = (report.note ? report.note + "; " : "") + "no instants to visit (session range unreadable)"
    mark("range")

    for (const w of WIDTHS) {
      const frames = w === WIDTHS[0] ? firstFit : await fit(w)
      const size = await measure()
      report.sizes[w] = { frames, innerWidth: size.innerWidth, layout: size.layout }
      for (const p of points) {
        const rec = { id: p.id, t: p.t, w }
        report.points.push(rec)
        if (!inRange(p.t)) {
          rec.skipped = "outside the session's range"
          continue
        }
        try {
          await hook("seek", p.t)
          await sleep(SETTLE)
          let facts = await hook("facts")
          // facts() must describe the instant we just sought to: poll (bounded) until its t has caught up
          for (let i = 0; i < 20 && !(Math.abs(num(facts?.t) - p.t) <= T_TOL); i++) {
            await sleep(100)
            facts = await hook("facts")
          }
          const m = await measure()
          rec.tDelta = num(facts.t) === undefined ? null : num(facts.t) - p.t
          rec.stale = rec.tDelta === null || Math.abs(rec.tDelta) > T_TOL
          rec.layout = m.layout
          rec.mode = m.mode
          rec.root = { scrollWidth: m.rootScroll, clientWidth: m.rootClient, ok: m.rootScroll !== null && m.rootScroll <= m.rootClient }
          rec.frame = { scrollWidth: m.frameScroll, clientWidth: m.frameClient }
          rec.facts = facts
          if (p.oracle) {
            const c = compareFrame(p.oracle, facts)
            rec.cmp = { match: c.match, diffs: c.diffs, known: c.known, kDelta: c.kDelta }
          }
          if (SHOTS) {
            rec.shot = pointFile(p.id, w)
            await page.screenshot({ path: rec.shot })
          }
        } catch (e) {
          rec.error = String(e.stack ?? e).slice(0, 400)
        }
      }
    }
    mark("done")
  } catch (e) {
    report.fatal = String(e.stack ?? e).slice(0, 800)
    await page.screenshot({ path: path.join(OUT, "fatal.png") }).catch(() => {})
  } finally {
    fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2))
    await app.close().catch(() => {})
  }
  summarize(report, OUT)
}

/** <= 15 short lines on stdout: counts, field names and values of mismatches, one screenshot path. Never facts text. */
function summarize(report, OUT) {
  const lines = []
  const live = report.points.filter((p) => !p.skipped)
  lines.push(`look-local: "${report.title}" widths ${report.widths.join(",")} settle ${report.settle}ms`)
  if (report.range) lines.push(`range ${report.range.t0 ?? "?"}..${report.range.t1 ?? "?"}; points ${report.times?.length ?? 0}${report.note ? `; ${report.note}` : ""}`)
  let bad = 0
  let firstShot
  const kf = report.keyframes
  if (kf) {
    lines.push(`keyframes in range ${kf.inRange}/${kf.total}${kf.inRange < kf.total ? "  <-- INCOMPLETE: this is not the keyframe session, or the oracle does not apply" : ""}`)
    if (kf.inRange < kf.total) bad++
  }
  for (const w of report.widths) {
    const at = live.filter((p) => p.w === w)
    const skipped = report.points.filter((p) => p.w === w && p.skipped).length
    const cmp = at.filter((p) => p.cmp)
    const matched = cmp.filter((p) => p.cmp.match).length
    const known = cmp.reduce((n, p) => n + p.cmp.known.length, 0)
    const overflow = at.filter((p) => p.root && !p.root.ok).length
    const errs = at.filter((p) => p.error).length
    const stale = at.filter((p) => p.stale).length
    const sz = report.sizes[w]
    lines.push(
      `w=${w} (frame ${sz?.innerWidth ?? "?"}px ${sz?.layout ?? "?"}): structure ${cmp.length ? `${matched}/${cmp.length}` : "n/a"}${known ? ` (+${known} known D16/order)` : ""}, overflow ${overflow}/${at.length}, stale ${stale}, errors ${errs}${skipped ? `, skipped ${skipped}` : ""}`,
    )
    for (const p of at) {
      const fail = (p.cmp && !p.cmp.match) || (p.root && !p.root.ok) || p.stale || p.error
      if (!fail) continue
      bad++
      firstShot ??= p.shot
      if (bad <= 8) lines.push(`  ${p.id}@${w}: ${p.error ? "error" : [...(p.cmp?.diffs ?? []).map(short), ...(p.root && !p.root.ok ? [`overflow ${p.root.scrollWidth}>${p.root.clientWidth}`] : []), ...(p.stale ? [`stale t (delta ${p.tDelta ?? "?"} ms)`] : [])].join("; ")}`)
    }
  }
  if (bad > 8) lines.push(`  ... ${bad - 8} more`)
  if (report.fatal) lines.push(`FATAL: ${report.fatal.split("\n")[0]}`)
  if (report.errors.length) lines.push(`console/cmd errors: ${report.errors.length} (see report.json)`)
  if (firstShot) lines.push(`first failing shot: ${firstShot}`)
  const reportLine = `report: ${path.join(OUT, "report.json")}`
  console.log([...lines.slice(0, 14), reportLine].join("\n"))
  if (report.fatal || bad) process.exitCode = 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) {
  await main().catch((e) => {
    console.error(String(e.stack ?? e).slice(0, 600))
    process.exitCode = 1
  })
}
