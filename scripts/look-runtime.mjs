// Dev aid (not a test suite): open the runtime view in an isolated VS Code, drive a parallel-subagent turn and a
// pending permission, and save screenshots plus layout diagnostics at several widths.
// Usage: OCO_TEST_URL=http://127.0.0.1:4617 OCO_E2E_MODEL=mock LOOK_OUT=<dir> [LOOK_WIDTHS=1600,1100,700] node scripts/look-runtime.mjs
import fs from "node:fs"
import path from "node:path"
import { launch, command, waitUntil, chatFrames, frameSession, sleep, fitGroups } from "../tests/e2e/vscode.mjs"
import { messages, waitIdle } from "../tests/e2e/server.mjs"

const OUT = process.env.LOOK_OUT ?? path.resolve(".oco-look")
const WIDTHS = (process.env.LOOK_WIDTHS ?? "1600,1100,700").split(",").map(Number)
const HEIGHT = Number(process.env.LOOK_HEIGHT ?? 0) // window height in px; 0 keeps the default (short) window
fs.mkdirSync(OUT, { recursive: true })
const { app, page } = await launch({ profile: "look-runtime", settings: { "workbench.colorTheme": "Default Dark Modern" } })
let A

async function frameFor(sid) {
  for (let i = 0; i < 1200; i++) {
    for (const f of await chatFrames(page)) {
      const ok = await f.evaluate((id) => window.__OCO_DEBUG__?.sessionId?.() === id && document.visibilityState === "visible", sid).catch(() => false)
      if (ok) return f
    }
    await sleep(50)
  }
  throw new Error("no frame")
}
async function send(f, text) {
  const users = async () => ((await messages(A)) ?? []).filter((m) => m.info.role === "user").length
  const before = await users()
  const input = f.locator('[data-component="prompt-input"]')
  await input.click()
  await page.keyboard.type(text, { delay: 2 })
  await page.keyboard.press("Enter")
  await waitUntil(async () => (await users()) > before, 30000, 100)
}
// Boxes that must not overlap each other or spill outside the runtime root.
const diagnose = (f) =>
  f.evaluate(() => {
    const R = (e) => e?.getBoundingClientRect()
    const root = document.querySelector("[data-oco-runtime]")
    const q = (s) => document.querySelector(s)
    const parts = {
      attention: q("[data-oco-runtime-attention-panel]"),
      tree: q("[data-oco-runtime-mechanism]"),
      log: q("[data-oco-runtime-events]"),
      summary: q("[data-oco-runtime-summary]"),
    }
    const frame = q("[data-oco-runtime-frame]")
    const out = {
      layout: root?.getAttribute("data-oco-runtime-layout"),
      root: R(root) && [Math.round(R(root).width), Math.round(R(root).height)],
      frameScrolls: frame ? frame.scrollHeight > frame.clientHeight + 1 : null,
      summaryVisible: frame && parts.summary ? R(parts.summary).bottom <= R(frame).bottom + 1 : null,
      issues: [],
    }
    const names = Object.keys(parts).filter((k) => parts[k])
    for (let i = 0; i < names.length; i++)
      for (let j = i + 1; j < names.length; j++) {
        const a = R(parts[names[i]]), b = R(parts[names[j]])
        if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) out.issues.push(`overlap ${names[i]}/${names[j]}`)
      }
    const tree = parts.tree && R(parts.tree)
    if (tree)
      for (const e of parts.tree.querySelectorAll("[data-oco-runtime-loop],[data-oco-runtime-handoff],[data-oco-runtime-think],[data-oco-runtime-node]")) {
        const r = R(e)
        if (r.bottom > tree.bottom + 1 || r.right > tree.right + 1 || r.top < tree.top - 1) out.issues.push(`spill ${e.getAttribute("data-oco-runtime-lane") ?? e.getAttribute("data-oco-runtime-node") ?? (e.hasAttribute("data-oco-runtime-think") ? "think" : "fill")}`)
      }
    for (const e of document.querySelectorAll("[data-oco-runtime] *")) {
      const cs = getComputedStyle(e)
      if ((cs.overflow === "hidden" || cs.overflowY === "hidden") && e.scrollHeight > e.clientHeight + 2 && e.clientHeight > 20 && e.closest("[data-oco-runtime-loop],[data-oco-runtime-handoff],[data-oco-runtime-node],[data-oco-runtime-attention-panel]") === e)
    out.issues.push(`clipped ${e.getAttribute("data-oco-runtime-lane") ?? e.getAttribute("data-oco-runtime-node") ?? (e.hasAttribute("data-oco-runtime-roster") ? "roster" : "attention")} ${e.scrollHeight}/${e.clientHeight}`)
    }
    out.probes = [...document.querySelectorAll("[data-oco-runtime-probe]")].map((e) => `${e.getAttribute("data-oco-runtime-probe-stage")}${e.getAttribute("data-oco-runtime-probe-flag") ? "!" + e.getAttribute("data-oco-runtime-probe-flag") : ""}`)
    out.core = q("[data-oco-runtime-loop]")?.getAttribute("data-oco-runtime-loop-core")
    // Which loop decorations animate, and with what (flow/spin while working, breathe while idle).
    out.motion = [...document.querySelectorAll("[data-oco-runtime-loop] .oco-loop-anim")].map((e) => `${getComputedStyle(e).animationName}:${getComputedStyle(e).animationPlayState}`).join(",")
    out.overview = {
      goal: q("[data-oco-runtime-goal]")?.textContent?.slice(0, 80),
      todo: q("[data-oco-runtime-todo] h3")?.textContent,
      todoItems: [...document.querySelectorAll("[data-oco-runtime-todo-item]")].map((e) => e.getAttribute("data-oco-runtime-todo-item")).join(","),
      summary: q("[data-oco-runtime-summary]")?.textContent?.replace(/\s+/g, " ").slice(0, 200),
      attention: !!parts.attention,
    }
    return out
  })

try {
  await command(page, "oco: New Session")
  await waitUntil(async () => {
    for (const f of await chatFrames(page)) A = await frameSession(f).catch(() => null)
    return !!A
  }, 60000, 200)
  const f = await frameFor(A)
  await f.locator('[data-oco-view="runtime"]').click()
  await f.locator("[data-oco-runtime]").waitFor({ state: "visible", timeout: 10000 })
  const report = {}
  if (HEIGHT)
    await app.evaluate(({ BrowserWindow }, h) => {
      const win = BrowserWindow.getAllWindows()[0]
      win.setSize(win.getSize()[0], h)
    }, HEIGHT)
  // A todo list first (mock: first item done, second in progress), so the overview has one to show.
  await send(f, "Use the todowrite tool to plan: read the config; patch the loader; run the tests")
  await waitIdle(A)
  for (const w of WIDTHS) {
    await fitGroups(app, page, w)
    await send(f, "Use the task tool 3 times in parallel: find callers of loadOmoConfig; check plugin cache path; read plugin docs")
    await waitUntil(async () => (await f.locator('[data-oco-runtime-probe-stage="running"]').count()) >= 3, 20000, 100).catch(() => {})
    await sleep(400)
    report[`${w}-running`] = await diagnose(f)
    await page.screenshot({ path: path.join(OUT, `${w}-running.png`) })
    await waitIdle(A)
    await sleep(600)
    report[`${w}-done`] = await diagnose(f)
    await page.screenshot({ path: path.join(OUT, `${w}-done.png`) })
  }
  // Background dispatches (tests/e2e/lib/bg-task-plugin.mjs): one left in the dock, one collected.
  await fitGroups(app, page, WIDTHS[0])
  await send(f, "Use the task tool in the background without retrieving with the explore agent: index the plugin cache")
  await waitIdle(A)
  await sleep(800)
  report.docked = await diagnose(f)
  await page.screenshot({ path: path.join(OUT, `${WIDTHS[0]}-docked.png`) })
  await send(f, "Use the task tool in the background with the explore agent: summarise plugin docs")
  await waitIdle(A)
  await sleep(800)
  await f.locator("[data-oco-runtime-probe]").last().click().catch(() => {})
  await sleep(300)
  report.absorbed = await diagnose(f)
  await page.screenshot({ path: path.join(OUT, `${WIDTHS[0]}-absorbed.png`) })
  // Pending permission at the first width, then replay.
  await send(f, "Use the bash tool to run exactly: rm -rf /tmp/oco-look-nothing . Then reply with the output.")
  await waitUntil(async () => (await f.locator("[data-oco-runtime-attention]").count()) >= 1, 30000, 100).catch(() => {})
  await sleep(400)
  report.permission = await diagnose(f)
  await page.screenshot({ path: path.join(OUT, `${WIDTHS[0]}-permission.png`) })
  await f.locator('[data-oco-runtime-reply="once"]').first().click({ timeout: 5000 }).catch((e) => (report.permissionClick = String(e.message).slice(0, 300)))
  await waitIdle(A)
  await f.locator("[data-oco-runtime-replay-pause]").click().catch(() => {})
  await f.locator('[data-oco-runtime-replay] input[type="range"]').evaluate((el) => {
    el.value = String(Math.floor(Number(el.max) * 0.5))
    el.dispatchEvent(new Event("input", { bubbles: true }))
  }).catch(() => {})
  await sleep(400)
  report.replay = await diagnose(f)
  await page.screenshot({ path: path.join(OUT, `${WIDTHS[0]}-replay.png`) })
  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report))
} finally {
  await app.close().catch(() => {})
}
