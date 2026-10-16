// E2E c32-bookmarks (card 12, patch 0027, M22): message bookmarks. Embedded mode only: the user-message action row and the
// assistant text-part copy row (hover) carry a button[aria-label="Bookmark message"] next to fork / Revert / copy. Click ->
// bridge ui("bookmark") -> host store (workspaceState oco.messageBookmarks) -> toast "oco: Bookmarked" (a duplicate stays silent)
// -> the session row in the SESSIONS sidebar gets `.bookmarks-badge` (count); expanded it lists `.bookmarks-list > .bookmark-row`
// (`data-message-id`, `.bookmark-summary` <= 80 chars, hover `.bookmark-remove` x). Click a row -> opens the session and scrolls to
// the turn (hash #message-{anchorId}; the anchor is the turn's USER message, also for an assistant bookmark).
// Mock model only (numbered-sentence replies make the timeline tall).
// Cases:
//   button-visible      hover a user message and an assistant reply: the bookmark button becomes visible, same row as fork / copy
//   add-user            6 turns (scrollable); bookmark turn 2's user message -> toast, sidebar badge "1", expanded summary = first line;
//                       a second click adds nothing (badge 1, no second toast)
//   add-assistant       bookmark turn 4's assistant reply -> badge "2", summary = the reply's first line (messageId = the assistant id)
//   open-same-session   scrolled to the bottom, click the turn-2 item -> turn-2 user message near the scroller top; then the turn-4
//                       item -> turn 4 in view (consecutive jumps in the same session); extra (not required): same item twice
//   open-other-session  switch to another session X, click session A's turn-2 item -> A opens and turn 2 is in view
//   remove              hover an item, click x -> badge 1, list = the remaining item
//   remove-persist      restart VS Code on the same profile -> the remaining bookmark is still listed (NOT RUN if no relaunch)
// Product defects are recorded (expected vs actual, selector), never fixed here.
import { fileURLToPath } from "node:url"
import { createRun } from "./lib/results.mjs"
import { launch, waitUntil, chatFrames, sleep, runShot, createAndOpenSession, command, clearNotifications } from "./vscode.mjs"
import { api, waitReply, waitIdle, messages, MODEL } from "./server.mjs"
import { sessionsFrame, sessionRow } from "./lib/sessions-web.mjs"

const REQUIRED = ["button-visible", "add-user", "add-assistant", "open-same-session", "open-other-session", "remove"]
const run = createRun({ suite: "c32-bookmarks", required: REQUIRED, scriptPath: fileURLToPath(import.meta.url) })
const health = await api("GET", "/global/health").catch(() => null)
run.setEnv({ serverVersion: health?.version ?? null, modelMode: MODEL.mode })
const rand = Math.random().toString(36).slice(2, 7)
const TURNS = 6
const PROFILE = "c32-bookmarks"
const BM = '[aria-label="Bookmark message"]'
const rec = (id, ok, detail) => run.record(id, ok === "NOT RUN" ? "NOT RUN" : ok ? "PASS" : "FAIL", detail)
const errMsg = (e) => String(e?.message ?? e).split("\n")[0].slice(0, 300)
const created = []
let app, page

async function frameFor(sid, timeout = 60000) {
  const end = Date.now() + timeout
  while (Date.now() < end) {
    for (const f of await chatFrames(page)) {
      const ok = await f
        .evaluate((id) => window.__OCO_DEBUG__?.sessionId?.() === id && document.visibilityState === "visible" && !!document.querySelector('[data-component="prompt-input"]'), sid)
        .catch(() => false)
      if (ok) return f
    }
    await sleep(50)
  }
  return null
}
async function type(f, text) {
  await waitUntil(async () => (await f.evaluate(() => document.documentElement.dataset.ocoModel)) === "ready", 60000, 100)
  const input = f.locator('[data-component="prompt-input"]')
  await input.click()
  await input.focus()
  await page.keyboard.type(text, { delay: 3 })
  await sleep(300)
  await page.keyboard.press("Enter")
}
/** Whole user message = first line: distinct, < 80 chars, asks the mock for 14 numbered sentences (a tall reply). */
const titleOf = (i, tag = rand) => `TURN-${i + 1}-${tag}: write 14 numbered sentences about harbors`
async function turns(sid, f, tag = rand, n = TURNS) {
  for (let i = 0; i < n; i++) {
    await type(f, titleOf(i, tag))
    await waitReply(sid)
    await waitIdle(sid, 60000)
  }
  await sleep(1200)
}
const firstLine = (t) => (String(t ?? "").split("\n").find((l) => l.trim()) ?? "").trim().slice(0, 80)

// ---- in-page helpers (chat frame)
const SCROLLER_FN = `(() => {
  const m = document.querySelector("[data-message-id]")
  for (let e = m?.parentElement; e; e = e.parentElement) {
    const o = getComputedStyle(e).overflowY
    if ((o === "auto" || o === "scroll") && e.scrollHeight > e.clientHeight + 1) return e
  }
  return null
})`
const inFrame = (f, body, arg) => f.evaluate(`(${body})(${JSON.stringify(arg ?? null)}, ${SCROLLER_FN}())`)
const scrollerState = (f) => inFrame(f, `(a, s) => s ? { top: Math.round(s.scrollTop), h: s.scrollHeight, c: s.clientHeight, fromBottom: Math.round(s.scrollHeight - s.clientHeight - s.scrollTop) } : null`)
const scrollTo = async (f, where) => {
  await inFrame(f, `(w, s) => { if (s) s.scrollTop = w === "top" ? 0 : s.scrollHeight }`, where)
  await sleep(700)
}
/** Position of the user message whose text contains `needle`, relative to the scroller top. */
const userPos = (f, needle) =>
  inFrame(
    f,
    `(needle, s) => {
      if (!s) return null
      const el = [...document.querySelectorAll('[data-component="user-message"]')].find((e) => (e.textContent ?? '').includes(needle))
      if (!el) return { found: false }
      return { found: true, top: Math.round(el.getBoundingClientRect().top - s.getBoundingClientRect().top), scrollerH: s.clientHeight }
    }`,
    needle,
  )
const inView = (p) => !!p?.found && p.top >= -8 && p.top < p.scrollerH - 24
const nearTop = (p) => inView(p) && p.top <= 200

/** Tag turn k's user message (kind "user") or its last assistant text part (kind "assistant") with data-c32; nudges the scroller when the timeline has not rendered it. */
async function tagTarget(f, kind, k) {
  let last = null
  for (let attempt = 0; attempt < 6; attempt++) {
    last = await f.evaluate(
      ([kind, k]) => {
        document.querySelectorAll("[data-c32]").forEach((e) => e.removeAttribute("data-c32"))
        const els = [...document.querySelectorAll('[data-component="user-message"], [data-component="text-part"]')]
        let u = -1
        const parts = []
        for (const e of els) {
          if (e.matches('[data-component="user-message"]')) {
            u++
            if (kind === "user" && u === k) {
              e.setAttribute("data-c32", "1")
              return { ok: true }
            }
          } else if (u === k) parts.push(e)
        }
        if (kind === "assistant") {
          const p = parts.filter((e) => e.querySelector('[aria-label="Bookmark message"]')).at(-1) ?? parts.at(-1)
          if (p) {
            p.setAttribute("data-c32", "1")
            return { ok: true, parts: parts.length }
          }
        }
        return { ok: false, users: u + 1, parts: parts.length }
      },
      [kind, k],
    )
    if (last.ok) return last
    await inFrame(f, `(k, s) => { if (s) s.scrollTop = Math.round((k / ${TURNS}) * s.scrollHeight) }`, k)
    await sleep(600)
  }
  return last
}
/** Hover turn k's user/assistant message; returns the bookmark button locator plus visibility facts. */
async function hoverTarget(f, kind, k) {
  const tag = await tagTarget(f, kind, k)
  if (!tag.ok) return { ok: false, tag }
  const msg = f.locator("[data-c32]").first()
  await msg.scrollIntoViewIfNeeded()
  const btn = msg.locator(BM).first()
  const before = (await btn.count()) ? await opacityOf(btn) : null
  await msg.hover()
  await sleep(500)
  const n = await msg.locator(BM).count()
  const after = n ? await opacityOf(btn) : null
  const sameRow = n
    ? await btn.evaluate((el) => {
        const sib = [...(el.parentElement?.querySelectorAll("button, [role=button]") ?? [])].map((b) => b.getAttribute("aria-label") ?? "")
        return sib
      })
    : []
  return { ok: true, tag, msg, btn, count: n, before, after, siblings: sameRow }
}
const opacityOf = (loc) =>
  loc.evaluate((el) => {
    let o = 1
    for (let e = el; e; e = e.parentElement) o *= Number(getComputedStyle(e).opacity)
    const r = el.getBoundingClientRect()
    return { opacity: o, w: Math.round(r.width), h: Math.round(r.height), disabled: el.disabled === true || el.getAttribute("aria-disabled") === "true" }
  })

// ---- sidebar helpers
async function waitSessionsFrame() {
  if (!(await waitUntil(async () => !!(await sessionsFrame(page)), 30000, 300))) throw new Error("Sessions sidebar frame not found")
}
async function rowVisible(title, timeout = 30000) {
  await (await sessionRow(page, title)).waitFor({ state: "visible", timeout })
}
/** Bookmark badge / list of a session row as the user sees it (null when the row is missing). */
async function bmInfo(title) {
  const row = await sessionRow(page, title)
  return row
    .evaluate((node) => {
      const b = node.querySelector(":scope > .bookmarks-badge")
      const list = node.querySelector(":scope > .bookmarks-list")
      const vis = (e) => !!e && !e.hidden && e.getBoundingClientRect().width > 0
      return {
        badgeVisible: vis(b),
        count: b && !b.hidden ? Number((b.textContent ?? "").trim()) : 0,
        aria: b?.getAttribute("aria-label") ?? null,
        expanded: b?.getAttribute("aria-expanded") ?? null,
        listVisible: vis(list),
        items: list ? [...list.querySelectorAll(".bookmark-row")].map((r) => ({ messageId: r.dataset.messageId, summary: (r.querySelector(".bookmark-summary")?.textContent ?? "").trim() })) : [],
      }
    }, null, { timeout: 5000 })
    .catch(() => null)
}
/** Expand the row's bookmark list when it is collapsed; returns the info once the list shows `n` items. */
async function expandBm(title, n) {
  const row = await sessionRow(page, title)
  const info = await waitUntil(async () => ((await bmInfo(title))?.badgeVisible ? true : null), 12000, 250)
  if (!info) return null
  let cur = await bmInfo(title)
  if (cur?.expanded !== "true") await row.locator(":scope > .bookmarks-badge").click({ timeout: 5000 })
  return waitUntil(async () => {
    const b = await bmInfo(title)
    return b?.expanded === "true" && b.listVisible && b.items.length === n ? b : null
  }, 12000, 250)
}
const waitCount = (title, n) =>
  waitUntil(async () => {
    const b = await bmInfo(title)
    return b?.count === n ? b : null
  }, 12000, 250)
const toastCount = () => page.locator(".notifications-toasts .notification-toast", { hasText: "Bookmarked" }).count()
const clickBookmark = async (btn) => {
  await clearNotifications(page)
  await btn.click({ timeout: 5000 })
}
const itemLoc = async (title, messageId) => (await sessionRow(page, title)).locator(`:scope > .bookmarks-list > .bookmark-row[data-message-id="${messageId}"]`)

try {
  if (MODEL.mode !== "mock") {
    for (const id of REQUIRED) rec(id, "NOT RUN", { reason: "needs the scripted mock model (OCO_E2E_MODEL=mock): numbered-sentence replies" })
    throw new Error("not a mock server")
  }
  ;({ app, page } = await launch({ profile: PROFILE, run }))
  run.installCrashHandlers(async () => {
    for (const id of created) await api("POST", `/session/${id}/abort`).catch(() => {})
    await app?.close().catch(() => {})
  })

  const titleA = `c32-A-${rand}`
  const titleX = `c32-X-${rand}`
  const sidA = await createAndOpenSession(page, { title: titleA })
  created.push(sidA)
  const fA = await frameFor(sidA)
  await turns(sidA, fA)
  await command(page, "Focus on Sessions View")
  await clearNotifications(page)
  await waitSessionsFrame()
  await rowVisible(titleA)
  const msgs = await messages(sidA)
  const users = msgs.filter((m) => m.info.role === "user")
  const assistants = msgs.filter((m) => m.info.role === "assistant")
  const asstOf = (k) => assistants.filter((m) => m.info.parentID === users[k].info.id).at(-1)
  const textOf = (m) => (m?.parts ?? []).filter((p) => p.type === "text").map((p) => p.text).join("")
  const u2 = users[1]?.info.id
  const a4 = asstOf(3)?.info.id
  const a4First = firstLine(textOf(asstOf(3)))
  const u2First = firstLine(textOf(users[1]))
  const sc = await scrollerState(fA)
  const scrollable = !!sc && sc.h > sc.c + 200
  if (users.length < TURNS || !u2 || !a4) throw new Error(`session A has ${users.length} user turns, ids u2=${u2} a4=${a4}`)

  // ---- a. button-visible
  try {
    const hu = await hoverTarget(fA, "user", 1)
    await runShot(page, run, "1-hover-user")
    const ha = await hoverTarget(fA, "assistant", 3)
    await runShot(page, run, "1-hover-assistant")
    const visible = async (h) => !!h.ok && h.count >= 1 && (await h.btn.isVisible()) && (h.after?.opacity ?? 0) > 0.5 && h.after.w > 4 && h.after.h > 4 && !h.after.disabled
    const uOk = await visible(hu)
    const aOk = await visible(ha)
    const rowOk = (h, label) => h.siblings?.length > 1 && h.siblings.includes(label)
    rec("button-visible", uOk && aOk, {
      selector: `[data-component="user-message"] ${BM}; [data-component="text-part"] ${BM}`,
      user: { ok: uOk, count: hu.count, before: hu.before, after: hu.after, rowButtons: hu.siblings, withRevertOrFork: rowOk(hu, "Revert message") || rowOk(hu, "Fork from here") || hu.siblings?.length > 1 },
      assistant: { ok: aOk, count: ha.count, before: ha.before, after: ha.after, rowButtons: ha.siblings },
    })
  } catch (e) {
    rec("button-visible", false, { error: errMsg(e) })
  }

  // ---- b. add-user
  let addUserOk = false
  try {
    const hu = await hoverTarget(fA, "user", 1)
    if (!hu.ok || !hu.count) throw new Error("no bookmark button on turn 2 user message: " + JSON.stringify(hu.tag))
    const before = await bmInfo(titleA)
    await clickBookmark(hu.btn)
    const toast1 = await waitUntil(async () => ((await toastCount()) >= 1 ? true : null), 6000, 200)
    const b1 = await waitCount(titleA, 1)
    const exp = await expandBm(titleA, 1)
    await runShot(page, run, "2-add-user")
    // duplicate click: nothing new, no second toast
    const hu2 = await hoverTarget(fA, "user", 1)
    await clickBookmark(hu2.btn)
    await sleep(2000)
    const toast2 = await toastCount()
    const after = await bmInfo(titleA)
    const item = exp?.items[0]
    addUserOk = !!b1 && !!exp && item?.messageId === u2 && item.summary === u2First && !!toast1 && toast2 === 0 && after?.count === 1 && after.items.length === 1
    rec("add-user", scrollable && addUserOk, {
      scrollable,
      scroller: sc,
      badgeBefore: before?.count ?? 0,
      toastOnFirstClick: !!toast1,
      toastOnDuplicate: toast2,
      expandedItems: exp?.items,
      expectedSummary: u2First,
      expectedMessageId: u2,
      afterDuplicate: after && { count: after.count, items: after.items },
      badgeAria: exp?.aria,
    })
  } catch (e) {
    rec("add-user", false, { error: errMsg(e) })
  }

  // ---- c. add-assistant
  let addAsstOk = false
  try {
    const ha = await hoverTarget(fA, "assistant", 3)
    if (!ha.ok || !ha.count) throw new Error("no bookmark button on turn 4 assistant reply: " + JSON.stringify(ha.tag))
    await clickBookmark(ha.btn)
    const toast = await waitUntil(async () => ((await toastCount()) >= 1 ? true : null), 6000, 200)
    const b2 = await waitCount(titleA, 2)
    const exp = await expandBm(titleA, 2)
    await runShot(page, run, "3-add-assistant")
    const item = exp?.items.find((i) => i.messageId === a4)
    addAsstOk = !!b2 && !!exp && !!item && item.summary === a4First && !!toast && exp.items.some((i) => i.messageId === u2)
    rec("add-assistant", addAsstOk, { toast: !!toast, expandedItems: exp?.items, expectedAssistantId: a4, expectedSummary: a4First, expectedUserAnchor: users[3].info.id })
  } catch (e) {
    rec("add-assistant", false, { error: errMsg(e) })
  }

  // ---- d. open-same-session
  try {
    if (!addUserOk || !addAsstOk) throw new Error("prerequisite bookmarks (add-user / add-assistant) missing")
    await expandBm(titleA, 2)
    await scrollTo(fA, "bottom")
    const pre = await userPos(fA, titleOf(1))
    const sBefore = await scrollerState(fA)
    await (await itemLoc(titleA, u2)).click({ timeout: 5000 })
    const p2 = await waitUntil(async () => {
      const p = await userPos(fA, titleOf(1))
      return nearTop(p) ? p : null
    }, 10000, 250)
    const pos2 = await userPos(fA, titleOf(1))
    await runShot(page, run, "4-open-turn2")
    // consecutive jump to turn 4 (assistant bookmark; anchor = turn-4 user message)
    const pre4 = await userPos(fA, titleOf(3))
    await (await itemLoc(titleA, a4)).click({ timeout: 5000 })
    const p4 = await waitUntil(async () => {
      const p = await userPos(fA, titleOf(3))
      return nearTop(p) ? p : null
    }, 10000, 250)
    const pos4 = await userPos(fA, titleOf(3))
    await runShot(page, run, "5-open-turn4")
    // extra: back to turn 2 (third consecutive jump), then scroll away by hand and click the same item again
    await (await itemLoc(titleA, u2)).click({ timeout: 5000 })
    const p2b = await waitUntil(async () => (nearTop(await userPos(fA, titleOf(1))) ? true : null), 10000, 250)
    await scrollTo(fA, "bottom")
    await (await itemLoc(titleA, u2)).click({ timeout: 5000 })
    const p2c = await waitUntil(async () => (nearTop(await userPos(fA, titleOf(1))) ? true : null), 8000, 250)
    const repeatDiag = { hash: await fA.evaluate(() => location.hash).catch(() => null), turn2: await userPos(fA, titleOf(1)), scroller: await scrollerState(fA) }
    rec("open-same-session", !inView(pre) && !!p2 && !!p4 && inView(pos2) && inView(pos4), {
      preTurn2: pre,
      scrollerBeforeClick: sBefore,
      turn2After: pos2,
      preTurn4: pre4,
      turn4After: pos4,
      expectedTopRange: [-8, 200],
      note: "precondition: turn 2 not in view when scrolled to the bottom (else the jump proves nothing)",
      extra: { backToTurn2: !!p2b, sameItemAgainAfterManualScroll: !!p2c },
    })
    if (!p2b || !p2c) run.record("open-same-session-repeat", "FAIL", { backToTurn2: !!p2b, sameItemAgainAfterManualScroll: !!p2c, ...repeatDiag, selector: ".bookmarks-list > .bookmark-row (sidebar)", expected: "both jumps scroll to turn 2 (same hash after a manual scroll too)" })
    else run.record("open-same-session-repeat", "PASS", { backToTurn2: true, sameItemAgainAfterManualScroll: true })
  } catch (e) {
    rec("open-same-session", false, { error: errMsg(e) })
  }

  // ---- e. open-other-session
  try {
    if (!addUserOk) throw new Error("prerequisite bookmark (add-user) missing")
    const sidX = await createAndOpenSession(page, { title: titleX })
    created.push(sidX)
    const fX = await frameFor(sidX)
    await rowVisible(titleX)
    await expandBm(titleA, 2)
    const shownBefore = !!fX
    await (await itemLoc(titleA, u2)).click({ timeout: 5000 })
    const fA2 = await frameFor(sidA, 60000)
    const p = fA2
      ? await waitUntil(async () => {
          const pp = await userPos(fA2, titleOf(1))
          return nearTop(pp) ? pp : null
        }, 15000, 250)
      : null
    const pos = fA2 ? await userPos(fA2, titleOf(1)) : null
    await runShot(page, run, "6-open-other-session")
    rec("open-other-session", shownBefore && !!fA2 && !!p, { openedXFirst: shownBefore, sessionAShown: !!fA2, turn2After: pos, expectedTopRange: [-8, 200] })
  } catch (e) {
    rec("open-other-session", false, { error: errMsg(e) })
  }

  // ---- f. remove (+ persistence over a restart)
  let removed = false
  try {
    if (!addUserOk || !addAsstOk) throw new Error("prerequisite bookmarks missing")
    await command(page, "Focus on Sessions View")
    await waitSessionsFrame()
    const exp = await expandBm(titleA, 2)
    if (!exp) throw new Error("list not expanded with 2 items")
    const item = await itemLoc(titleA, u2)
    await item.hover()
    await sleep(300)
    const x = item.locator(".bookmark-remove")
    const xVisible = await x.isVisible()
    await runShot(page, run, "7-hover-remove")
    await x.click({ timeout: 5000 })
    const b = await waitCount(titleA, 1)
    const exp1 = await expandBm(titleA, 1)
    removed = !!b && !!exp1 && exp1.items[0].messageId === a4 && !exp1.items.some((i) => i.messageId === u2)
    await runShot(page, run, "8-removed")
    rec("remove", xVisible && removed, { removeVisibleOnHover: xVisible, itemsAfter: exp1?.items, expectedRemaining: a4 })
  } catch (e) {
    rec("remove", false, { error: errMsg(e) })
  }

  try {
    if (!removed) throw new Error("prerequisite remove failed")
    await app.close().catch(() => {})
    app = null
    page = null
    let relaunched = null
    try {
      relaunched = await launch({ profile: PROFILE, run, fresh: false })
    } catch (e) {
      rec("remove-persist", "NOT RUN", { reason: "could not relaunch VS Code on the same user-data-dir: " + errMsg(e) })
    }
    if (relaunched) {
      app = relaunched.app
      page = relaunched.page
      await command(page, "Focus on Sessions View")
      await clearNotifications(page)
      await waitSessionsFrame()
      await rowVisible(titleA, 40000)
      const exp = await expandBm(titleA, 1)
      await runShot(page, run, "9-after-restart")
      rec("remove-persist", !!exp && exp.items[0].messageId === a4 && exp.items[0].summary === a4First, { items: exp?.items, info: exp ? undefined : await bmInfo(titleA), expectedRemaining: a4 })
    }
  } catch (e) {
    rec("remove-persist", "NOT RUN", { reason: errMsg(e) })
  }
} catch (e) {
  if (!String(e?.message).includes("not a mock server")) {
    run.record("run", "FAIL", { error: errMsg(e) })
    if (page) await runShot(page, run, "error").catch(() => {})
  }
} finally {
  for (const id of created) await api("POST", `/session/${id}/abort`).catch(() => {})
  await app?.close().catch(() => {})
  process.exit(run.finish())
}
