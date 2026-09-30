// P1b-1 T010: the chat page follows the VS Code colour theme (light -> dark at runtime, no reload),
// and a prompt sent before the directory's agents/models have loaded waits for them instead of being
// rejected with "Select an agent and model". The load race is forced with the dev-only bridge delay
// (OCO_DEV_SLOW_PATHS, honoured outside production mode only).
import fs from "node:fs"
import { fileURLToPath } from "node:url"
import { createRun } from "./lib/results.mjs"
import { launch, command, chatFrames, frameSession, sleep, runShot } from "./vscode.mjs"
import { messages, waitReply, MODEL } from "./server.mjs"

const run = createRun({ suite: "p1b-theme-load", required: ["theme-initial-light", "theme-switch-dark", "first-load-submit"], scriptPath: fileURLToPath(import.meta.url) })
let app
run.installCrashHandlers(() => app?.close())

async function newPanel(page, known = new Set(), selector = '[data-component="prompt-input"]') {
  await command(page, "oco: New Session")
  const end = Date.now() + 60000
  while (Date.now() < end) {
    for (const f of await chatFrames(page)) {
      const s = await frameSession(f).catch(() => null)
      if (s && !known.has(s) && (await f.$(selector).catch(() => null))) return { f, sid: s }
    }
    await sleep(50)
  }
  throw new Error("no new panel")
}
const scheme = (f) =>
  f.evaluate(() => ({
    appScheme: document.documentElement.dataset.colorScheme ?? null,
    bodyKind: document.body.dataset.vscodeThemeKind ?? null,
    htmlBackground: getComputedStyle(document.documentElement).backgroundColor,
    generation: window.__OCO_DEBUG__.generation(),
    theme: { ...window.__OCO_DEBUG__.theme },
  }))

// A. Theme
try {
  const l = await launch({ profile: "p1b-theme", run, settings: { "workbench.colorTheme": "Default Light Modern" } })
  app = l.app
  const { f } = await newPanel(l.page)
  await sleep(3000)
  const light = await scheme(f)
  await runShot(l.page, run, "theme-light")
  run.record("theme-initial-light", light.appScheme === "light" && light.bodyKind === "vscode-light" ? "PASS" : "FAIL", light)
  const settings = JSON.parse(fs.readFileSync(l.settingsFile, "utf8"))
  fs.writeFileSync(l.settingsFile, JSON.stringify({ ...settings, "workbench.colorTheme": "Default Dark Modern" }, null, 2))
  let dark
  const end = Date.now() + 20000
  while (Date.now() < end) {
    dark = await scheme(f).catch(() => null)
    if (dark?.appScheme === "dark") break
    await sleep(300)
  }
  await sleep(800)
  dark = await scheme(f)
  await runShot(l.page, run, "theme-dark")
  run.record("theme-switch-dark", dark.appScheme === "dark" && dark.bodyKind === "vscode-dark" && dark.generation === light.generation && dark.theme.switches >= 1 ? "PASS" : "FAIL", {
    ...dark,
    sameDocument: dark.generation === light.generation,
  })
} catch (e) {
  run.record("theme", "FAIL", { error: String(e?.message ?? e).slice(0, 400) })
} finally {
  await app?.close().catch(() => {})
}

// B. Send before agents/models are loaded.
try {
  process.env.OCO_DEV_SLOW_PATHS = "^/(agent|provider|config/providers)"
  process.env.OCO_DEV_SLOW_MS = "6000"
  run.setEnv({ firstLoadDelay: { paths: process.env.OCO_DEV_SLOW_PATHS, ms: 6000 } })
  const l = await launch({ profile: "p1b-first-load", run })
  app = l.app
  const page = l.page
  const { f, sid } = await newPanel(page)
  const input = f.locator('[data-component="prompt-input"]')
  await input.click()
  await input.focus()
  await page.keyboard.type("Reply only with the word OK.", { delay: 2 })
  const modelShownBeforeSend = await f.getByText(MODEL.label).first().isVisible().catch(() => false)
  await page.keyboard.press("Enter")
  let pendingSeen = false
  let toast = false
  const t0 = Date.now()
  let sent = null
  while (Date.now() - t0 < 40000) {
    const snap = await f
      .evaluate(() => ({ pending: document.documentElement.dataset.ocoSubmitPending ?? null, toast: /Select an agent and model|选择智能体和模型|请选择/.test(document.body.innerText) }))
      .catch(() => ({ pending: null, toast: false }))
    pendingSeen ||= snap.pending === "model"
    toast ||= snap.toast
    sent = (await messages(sid).catch(() => [])).find((m) => m.info.role === "user")
    if (sent && Date.now() - t0 > 2000) break
    await sleep(100)
  }
  const reply = sent ? await waitReply(sid, 90000) : null
  await runShot(page, run, "first-load")
  run.record("first-load-submit", pendingSeen && !toast && !!sent && !modelShownBeforeSend ? "PASS" : "FAIL", {
    modelShownBeforeSend,
    waitedForModel: pendingSeen,
    toastShown: toast,
    userMessageReachedServer: !!sent,
    sentAfterMs: sent ? sent.info.time?.created - t0 : null,
    replied: !!reply,
  })
} catch (e) {
  run.record("first-load-submit", "FAIL", { error: String(e?.message ?? e).slice(0, 400) })
} finally {
  await app?.close().catch(() => {})
  process.exit(run.finish())
}
