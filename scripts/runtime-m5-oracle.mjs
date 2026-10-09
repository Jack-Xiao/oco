#!/usr/bin/env node
// M5 oracle: evaluate the approved mockup's own verdicts at every keyframe of the fixture.
// Usage: node scripts/runtime-m5-oracle.mjs <fixture.json> <out.json> [mockup.src.html]
// Browser: OCO_CHROMIUM=<executable>, else the newest Playwright "Chrome for Testing" in the user cache, else Playwright's default.
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { chromium } from "playwright-core"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const [fixtureArg, outArg, mockArg] = process.argv.slice(2)
if (!fixtureArg || !outArg) {
  console.error("usage: node scripts/runtime-m5-oracle.mjs <fixture.json> <out.json> [mockup.src.html]")
  process.exit(2)
}
const fixturePath = path.resolve(fixtureArg)
const outPath = path.resolve(outArg)
const mockPath = path.resolve(mockArg ?? path.join(ROOT, "docs/superpowers/specs/runtime-m5-mockup.src.html"))
const rel = (p) => path.relative(ROOT, p).split(path.sep).join("/")

const fixtureText = fs.readFileSync(fixturePath, "utf8")
const fixture = JSON.parse(fixtureText)
if (!Array.isArray(fixture.keyframes) || !fixture.keyframes.length) throw new Error("fixture has no keyframes")

// Escape every "<" so text such as "</task_result>" or "<!--" cannot end or confuse the <script> block; JSON.parse undoes it.
const json = fixtureText.replace(/</g, "\\u003c")
let html = fs.readFileSync(mockPath, "utf8")
if (!html.includes("/*__TIMELINE__*/")) throw new Error("mockup has no /*__TIMELINE__*/ slot")
html = html.replace("/*__TIMELINE__*/", () => json).replaceAll("__SHOT_DATA_URI__", "")

function browser() {
  if (process.env.OCO_CHROMIUM) return process.env.OCO_CHROMIUM
  const cache = path.join(os.homedir(), "Library/Caches/ms-playwright")
  if (!fs.existsSync(cache)) return undefined
  const dirs = fs
    .readdirSync(cache)
    .filter((d) => /^chromium-\d+$/.test(d))
    .sort((a, b) => Number(b.split("-")[1]) - Number(a.split("-")[1]))
  for (const d of dirs) {
    for (const arch of ["chrome-mac-arm64", "chrome-mac", "chrome-mac-x64"]) {
      const exe = path.join(cache, d, arch, "Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing")
      if (fs.existsSync(exe)) return exe
    }
  }
  return undefined
}

// Card titles (mockup words) → RingCardKind, per the i18n table (ring.card.kind.*).
const KIND = {
  待命: "idle", 消息: "message", 请求: "request", 思考: "think", 输出: "output", 调用: "call", 交接: "handoff",
  结果: "result", 失败: "failed", 返回: "return", 等待: "waiting", 提问: "ask", 授权: "permission", 回执: "receipt",
  已忽略: "dismissed", 已拒绝: "rejected", 本轮结束: "round-end", 已中止: "aborted", 计划: "plan",
}

const exe = browser()
const b = await chromium.launch(exe ? { executablePath: exe } : {})
try {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "no-preference", timezoneId: "Asia/Shanghai" })
  const page = await ctx.newPage()
  const errors = []
  page.on("pageerror", (e) => errors.push(String(e)))
  await page.setContent(html, { waitUntil: "load" })
  await page.waitForFunction(() => typeof window.mock === "object" && typeof window.mock.seek === "function")
  if (errors.length) throw new Error("mockup page error: " + errors.join("; "))

  const keys = fixture.keyframes.map((k) => ({ id: k.id, t: k.t }))
  const raw = await page.evaluate((keys) => {
    // Runs in the mockup page: its top-level functions and consts are globals of this realm.
    return keys.map(({ id, t }) => {
      window.mock.seek(t)                           // render once so geometry (G.mode) is current
      const S = stageAt(t)
      const F = facts(t, S)
      const P = payload(t, S, F)
      const pl = planAt(t)
      const [word, tone] = statusWord(S)
      const ask = F.ask && ["ask", "end", "call", "wait", "next"].includes(S.st) ? F.ask : null   // renderYou's rule
      const you =
        ask && ask.state === "pending" ? "need"
        : ask && ask.state === "dismissed" ? "dismissed"
        : ask && ask.state === "writing" ? "writing"
        : S.r && !F.ended && t - S.r.start < 3000 ? "sent"
        : S.r ? "idle" : "pre"
      const el = document.getElementById("cYou")
      const cls = ["need", "dism", "idle"].find((c) => el.classList.contains(c)) ?? ""
      const ys = el.querySelector(".ys")
      return {
        id, t,
        stage: S.st,
        why: S.why ?? null,
        endAt: S.endAt ?? null,
        title: P.k, tone: P.c,
        round: S.r ? S.r.n : null,
        m: S.q ? S.q.m : null,
        plan: pl ? { done: pl.d, inProgress: pl.p, total: pl.n, version: pl.x.ver } : null,
        own: (F.own ?? []).map((x) => [x.tool, toolSt(x, t), sameSoFar(x, t)]),
        subs: (F.subs ?? []).map((x) => [x.num, subSt(x, t)]),
        you: { state: you, cls, status: ys ? ys.textContent : "" },
        status: { word, tone },
        lane: Math.round(laneOpen(t) * 1000) / 1000,
      }
    })
  }, keys)
  if (errors.length) throw new Error("mockup page error: " + errors.join("; "))

  const frames = raw.map((f) => {
    const kind = KIND[f.title]
    if (!kind) throw new Error(`${f.id}: unknown card title ${JSON.stringify(f.title)}`)
    const out = { id: f.id, t: f.t, stage: f.stage }
    if (f.why != null) out.why = f.why
    if (f.endAt != null) out.endAt = f.endAt
    out.card = { title: f.title, kind, tone: f.tone }
    if (f.round != null) out.round = f.round
    if (f.m != null) out.m = f.m
    if (f.plan) out.plan = f.plan
    Object.assign(out, { own: f.own, subs: f.subs, you: f.you, status: f.status, lane: f.lane })
    return out
  })
  const result = {
    source: {
      mockup: rel(mockPath),
      fixture: rel(fixturePath),
      generator: "scripts/runtime-m5-oracle.mjs",
      note: "Mockup verdicts verbatim (why 'stop', red 已忽略 included); reconciling them with D5/D18 is Task 11's job.",
    },
    frames,
  }
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2) + "\n")
  console.log(`${frames.length} frames -> ${rel(outPath)}`)
} finally {
  await b.close()
}
