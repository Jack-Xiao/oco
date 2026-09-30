// T010 recovery, through a fixture proxy in front of the isolated test server (lib/proxy.mjs; refuse() = server
// unreachable, intercept() = fixture answers). Cases:
//   unknown-types        a message with an unknown part type and an unknown tool still renders; the chat stays usable.
//   down-while-open      server goes away while a session is open with an unsent draft: an in-panel notice with
//                        Retry / Open Settings shows (no raw error text); when the server is back the notice goes,
//                        the draft is still there, and a new prompt gets its reply.
//   initial-unreachable  the panel document is (re)created while the server is down: oco's unreachable screen with
//                        Retry and Open Settings (Open Settings opens VS Code settings); Retry while still down keeps
//                        the screen; once the server is back the panel continues (fresh document), the draft is
//                        kept and a prompt gets its reply.
//   session-deleted      the open session is deleted on the server: oco's "no longer exists" screen, no retry
//                        button and no request loop; Sessions shows the sidebar; New Session opens a new panel whose
//                        input is empty (the old draft is not carried over) and which sends nothing by itself;
//                        Close Panel closes the stale one.
//   unknown-error        the message list answers 500 with a body that looks sensitive: oco's generic screen shows,
//                        no raw body, path, stack or upstream Discord/report text; Reload Panel recovers the chat
//                        (not blank).
import { fileURLToPath } from "node:url"
import { createRun } from "./lib/results.mjs"
import { startProxy } from "./lib/proxy.mjs"
import { launch, command, chatFrames, frameSession, sleep, runShot } from "./vscode.mjs"
import { api, messages, waitReply } from "./server.mjs"

const CASES = ["unknown-types", "down-while-open", "initial-unreachable", "session-deleted", "unknown-error"]
const run = createRun({ suite: "t010-recover", required: CASES, scriptPath: fileURLToPath(import.meta.url) })
const proxy = await startProxy({ target: process.env.OCO_TEST_URL ?? "http://127.0.0.1:4517" })
const SECRET = "SECRET-t010-abc123"
let mode = "pass"
const messageGets = new Map()
proxy.intercept((m, url) => {
  const x = /^\/session\/([^/]+)\/message$/.exec(url.pathname)
  if (m !== "GET" || !x) return
  messageGets.set(x[1], (messageGets.get(x[1]) ?? 0) + 1)
  if (mode === "fail500") return { status: 500, json: { name: "UnknownError", data: { message: `boom token=${SECRET} at /Users/someone/private` } } }
  if (mode !== "unknown") return
  const sid = x[1]
  const t = 1790000000000
  return {
    json: [
      { info: { id: "msg_f1", sessionID: sid, role: "user", time: { created: t }, summary: { diffs: [] }, agent: "build", model: { providerID: "opencode", modelID: "big-pickle" } }, parts: [{ id: "prt_f1", sessionID: sid, messageID: "msg_f1", type: "text", text: "hi" }] },
      { info: { id: "msg_f2", sessionID: sid, role: "assistant", time: { created: t + 1, completed: t + 2 }, parentID: "msg_f1", modelID: "big-pickle", providerID: "opencode", mode: "build", agent: "build", path: { cwd: "/", root: "/" }, cost: 0, tokens: { total: 0, input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } }, finish: "stop" },
        parts: [
          { id: "prt_f2", sessionID: sid, messageID: "msg_f2", type: "future-part-type", payload: 1 },
          { id: "prt_f3", sessionID: sid, messageID: "msg_f2", type: "tool", callID: "c", tool: "brand-new-tool", state: { status: "completed", input: { x: 1 }, output: "o", title: "t", metadata: {}, time: { start: t, end: t + 1 } } },
          { id: "prt_f4", sessionID: sid, messageID: "msg_f2", type: "text", text: "still here", time: { start: t, end: t + 1 } },
        ] },
    ],
  }
})
let app
run.installCrashHandlers(async () => {
  await app?.close().catch(() => {})
  await proxy.close()
})
const INPUT = '[data-component="prompt-input"]'
// Anywhere in the document: the fixture's secret-looking body and upstream report text. In the recovery screen
// itself: no stack frames or local resource paths either.
const FORBIDDEN = [SECRET, "/Users/someone", "Discord", "OpenCode team", "Report Error"]
const FORBIDDEN_IN_SCREEN = ["vscode-resource", "at async", ".js:", "Error:"]

async function waitFor(fn, ms, step = 250) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    const v = await fn().catch(() => null)
    if (v) return v
    await sleep(step)
  }
  return null
}
/** Panel state for session `sid` (or the only/first chat frame): visible text, recovery screen, banner, draft. */
async function panel(page, sid) {
  for (const f of await chatFrames(page)) {
    const s = await frameSession(f).catch(() => null)
    if (sid && s !== sid) continue
    const r = await f
      .evaluate((sel) => {
        const input = document.querySelector(sel)
        return {
          text: document.body.innerText.slice(0, 600),
          html: document.documentElement.outerHTML,
          screen: document.querySelector("[data-oco-recovery]")?.outerHTML ?? "",
          recovery: document.querySelector("[data-oco-recovery]")?.getAttribute("data-oco-recovery") ?? null,
          actions: [...document.querySelectorAll("[data-oco-recovery] [data-oco-action]")].map((b) => b.getAttribute("data-oco-action")),
          banner: document.querySelector("[data-oco-connection-banner]")?.getAttribute("data-oco-connection-banner") ?? null,
          bannerActions: [...document.querySelectorAll("[data-oco-connection-banner] [data-oco-action]")].map((b) => b.getAttribute("data-oco-action")),
          input: !!input,
          draft: input ? input.innerText.trim() : null,
          model: document.documentElement.dataset.ocoModel ?? null,
        }
      }, INPUT)
      .catch(() => null)
    if (r) return { ...r, f, sid: s }
  }
  return null
}
const leaks = (p) => [...FORBIDDEN.filter((w) => p?.html.includes(w)), ...FORBIDDEN_IN_SCREEN.filter((w) => p?.screen.includes(w))]
const brief = (p) => (p ? { recovery: p.recovery, actions: p.actions, banner: p.banner, bannerActions: p.bannerActions, input: p.input, draft: p.draft, model: p.model, text: p.text.slice(0, 160) } : null)

try {
  const l = await launch({ profile: "t010-recover", run, settings: { "oco.serverUrl": proxy.url } })
  app = l.app
  const page = l.page
  /** Bring the chat (first editor of the first group) to the front. */
  const showChat = async () => {
    await command(page, "View: Focus First Editor Group")
    await command(page, "View: Open First Editor in Group")
  }
  /** Hide the chat behind another editor in its group, then show it: the webview document is recreated. */
  const reshow = async () => {
    await command(page, "View: Focus First Editor Group")
    await command(page, "File: New Untitled Text File")
    await sleep(1000)
    await showChat()
  }
  const newPanel = async () => {
    const before = new Set((await Promise.all((await chatFrames(page)).map((f) => frameSession(f).catch(() => null)))).filter(Boolean))
    await command(page, "oco: New Session")
    return waitFor(async () => {
      for (const f of await chatFrames(page)) {
        const s = await frameSession(f).catch(() => null)
        if (s && !before.has(s) && (await f.$(INPUT).catch(() => null))) return s
      }
      return null
    }, 60000)
  }
  const typeDraft = async (sid, text) => {
    const p = await panel(page, sid)
    await p.f.locator(INPUT).click()
    await page.keyboard.type(text, { delay: 5 })
    await sleep(1200) // the app persists drafts after a short debounce
  }
  const send = async (sid, tag) => {
    const p = await waitFor(async () => {
      const x = await panel(page, sid)
      return x?.input && x.model === "ready" ? x : null
    }, 60000)
    if (!p) return { ok: false, why: "model not ready", state: brief(await panel(page, sid)) }
    const prompt = `Reply with exactly this line and nothing else: ${tag}`
    // Replace the draft; make sure the editor holds exactly the prompt before sending (typing right after a
    // select-all can lose the first keys while the editor re-renders).
    for (let i = 0; i < 3; i++) {
      await p.f.locator(INPUT).click()
      await page.keyboard.press("Meta+A")
      await page.keyboard.press("Backspace")
      await sleep(300)
      await page.keyboard.type(prompt, { delay: 2 })
      if ((await p.f.locator(INPUT).innerText()).trim() === prompt) break
    }
    await page.keyboard.press("Enter")
    const last = await waitReply(sid, 60000)
    const text = last?.parts?.filter((x) => x.type === "text").map((x) => x.text).join("") ?? ""
    return { ok: text.includes(tag), reply: text.slice(0, 80) }
  }

  // 1. Unknown part / tool types.
  try {
    mode = "unknown"
    await newPanel()
    const s = await waitFor(async () => {
      const p = await panel(page)
      return p?.input && /still here/.test(p.text) ? p : null
    }, 40000)
    await runShot(page, run, "unknown-types")
    run.record("unknown-types", s ? "PASS" : "FAIL", { text: s?.text.slice(0, 200) })
  } catch (e) {
    run.record("unknown-types", "FAIL", { error: String(e?.message ?? e).slice(0, 400) })
  }
  mode = "pass"

  // 2. Server goes away while a session is open.
  let sid
  try {
    await command(page, "View: Close All Editors").catch(() => {})
    sid = await newPanel()
    await waitFor(async () => ((await panel(page, sid))?.model === "ready" ? true : null), 60000)
    const DRAFT = "draft-before-outage"
    await typeDraft(sid, DRAFT)
    proxy.refuse(true)
    const down = await waitFor(async () => {
      const p = await panel(page, sid)
      return p?.banner ? p : null
    }, 30000)
    await runShot(page, run, "down-while-open")
    proxy.refuse(false)
    const back = await waitFor(async () => {
      const p = await panel(page, sid)
      return p && !p.banner && p.input ? p : null
    }, 60000)
    const draftKept = back?.draft === DRAFT
    const sent = back ? await send(sid, "T010-AFTER-OUTAGE") : { ok: false }
    await runShot(page, run, "down-while-open-recovered")
    run.record("down-while-open", down && down.draft === DRAFT && down.bannerActions.includes("retry") && down.bannerActions.includes("openSettings") && !leaks(down).length && back && draftKept && sent.ok ? "PASS" : "FAIL", {
      down: brief(down),
      leaks: leaks(down),
      back: brief(back),
      draftKept,
      sent,
    })
  } catch (e) {
    run.record("down-while-open", "FAIL", { error: String(e?.message ?? e).slice(0, 400) })
    proxy.refuse(false)
  }

  // 3. The panel document is created while the server is down.
  try {
    const DRAFT = "draft-before-reload"
    await typeDraft(sid, DRAFT)
    proxy.refuse(true)
    await sleep(1500)
    await reshow()
    const down = await waitFor(async () => {
      const p = await panel(page, sid)
      return p?.recovery === "unreachable" ? p : null
    }, 40000)
    await runShot(page, run, "initial-unreachable")
    // Retry while still down: stays on the screen, nothing breaks.
    if (down) await down.f.locator('[data-oco-action="retry"]').click()
    await sleep(2500)
    const still = await panel(page, sid)
    // Open Settings opens VS Code settings (filtered to oco).
    if (down) await (await panel(page, sid)).f.locator('[data-oco-action="openSettings"]').click()
    // VS Code 1.139 shows Settings as a tab or a modal overlay; either way it has the settings editor, searched for "oco".
    const settings = await waitFor(
      () => page.evaluate(() => [...document.querySelectorAll(".settings-editor .suggest-input-container .monaco-editor .view-line")].some((e) => /\boco\b/.test(e.textContent ?? "")) || null),
      10000,
    )
    await runShot(page, run, "initial-unreachable-settings")
    await page.keyboard.press("Escape")
    proxy.refuse(false)
    await showChat()
    const back = await waitFor(async () => {
      const p = await panel(page, sid)
      return p && !p.recovery && p.input && p.model === "ready" ? p : null
    }, 60000)
    const sent = back ? await send(sid, "T010-AFTER-INITIAL") : { ok: false }
    await runShot(page, run, "initial-unreachable-recovered")
    const ok =
      down && down.actions.includes("retry") && down.actions.includes("openSettings") && !leaks(down).length &&
      still?.recovery === "unreachable" && settings && back && back.draft === DRAFT && sent.ok
    run.record("initial-unreachable", ok ? "PASS" : "FAIL", { down: brief(down), leaks: leaks(down), afterRetryStillDown: brief(still), settingsOpened: !!settings, back: brief(back), draftKept: back?.draft === DRAFT, sent })
  } catch (e) {
    run.record("initial-unreachable", "FAIL", { error: String(e?.message ?? e).slice(0, 400) })
    proxy.refuse(false)
  }

  // 4. The open session is deleted on the server.
  try {
    await command(page, "View: Close All Editors").catch(() => {})
    const gone = await newPanel()
    await waitFor(async () => ((await panel(page, gone))?.model === "ready" ? true : null), 60000)
    const DRAFT = "draft-of-deleted-session"
    await typeDraft(gone, DRAFT)
    await api("DELETE", `/session/${gone}`)
    const shown = await waitFor(async () => {
      const p = await panel(page, gone)
      return p?.recovery === "session-missing" ? p : null
    }, 30000)
    await runShot(page, run, "session-deleted")
    // No retry loop: message-list requests for the deleted session stop.
    const n0 = messageGets.get(gone) ?? 0
    await sleep(6000)
    const loopRequests = (messageGets.get(gone) ?? 0) - n0
    // Sessions → the sidebar.
    if (shown) await shown.f.locator('[data-oco-action="showSessions"]').click()
    await sleep(1000)
    const sidebar = await page.evaluate(() => document.querySelector(".part.sidebar .composite.title")?.textContent ?? "")
    // New Session → a new, empty panel that sends nothing.
    if (shown) await (await panel(page, gone)).f.locator('[data-oco-action="newSession"]').click()
    const fresh = await waitFor(async () => {
      for (const f of await chatFrames(page)) {
        const s = await frameSession(f).catch(() => null)
        if (s && s !== gone && (await f.$(INPUT).catch(() => null))) return s
      }
      return null
    }, 30000)
    await sleep(3000)
    const freshState = fresh ? await panel(page, fresh) : null
    const freshMessages = fresh ? (await messages(fresh)).length : null
    // Close Panel closes the stale one.
    const stale = await panel(page, gone)
    if (stale) await stale.f.locator('[data-oco-action="closePanel"]').click()
    const closed = await waitFor(async () => ((await panel(page, gone)) ? null : true), 10000)
    await runShot(page, run, "session-deleted-after")
    const ok =
      shown && !shown.actions.includes("retry") && ["showSessions", "newSession", "closePanel"].every((a) => shown.actions.includes(a)) &&
      !leaks(shown).length && loopRequests <= 1 && /oco|会话|sessions/i.test(sidebar) &&
      fresh && freshState?.draft === "" && freshMessages === 0 && closed
    run.record("session-deleted", ok ? "PASS" : "FAIL", {
      shown: brief(shown),
      leaks: leaks(shown),
      loopRequests,
      sidebar: sidebar.slice(0, 60),
      freshPanel: !!fresh,
      freshDraft: freshState?.draft,
      freshMessages,
      staleClosed: !!closed,
      draftDecision: "kept in the deleted panel's storage; not migrated, not sent",
    })
  } catch (e) {
    run.record("session-deleted", "FAIL", { error: String(e?.message ?? e).slice(0, 400) })
  }

  // 5. Unknown error with a sensitive-looking body.
  try {
    await command(page, "View: Close All Editors").catch(() => {})
    mode = "fail500"
    const s = await newPanel().catch(() => null)
    const shown = await waitFor(async () => {
      const p = await panel(page)
      return p?.recovery ? p : null
    }, 40000)
    await runShot(page, run, "unknown-error")
    mode = "pass"
    if (shown) await shown.f.locator('[data-oco-action="reload"]').click()
    const back = await waitFor(async () => {
      const p = await panel(page)
      return p && !p.recovery && p.input ? p : null
    }, 40000)
    await runShot(page, run, "unknown-error-reloaded")
    run.record("unknown-error", shown?.recovery === "error" && !leaks(shown).length && shown.actions.includes("reload") && back ? "PASS" : "FAIL", {
      newSession: !!s,
      shown: brief(shown),
      leaks: leaks(shown),
      reloaded: brief(back),
    })
  } catch (e) {
    run.record("unknown-error", "FAIL", { error: String(e?.message ?? e).slice(0, 400) })
  }
} catch (e) {
  run.record("run", "FAIL", { error: String(e?.message ?? e).slice(0, 400) })
} finally {
  mode = "pass"
  await app?.close().catch(() => {})
  await proxy.close().catch(() => {})
  process.exit(run.finish())
}
