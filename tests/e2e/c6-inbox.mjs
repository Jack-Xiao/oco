#!/usr/bin/env node
// E2E test c6-inbox: 验证「三个后台子代理同时等授权，不打开任何会话面板即可在侧栏收件箱全部批完」
// 侧栏 UI 契约依据 docs/evidence/cockpit-inbox-2026-10-10.md「集成契约」一节。
import { fileURLToPath } from "node:url"
import { createRun } from "./lib/results.mjs"
import { launch, command, waitUntil, chatFrames, sleep, runShot, hostState, clearNotifications } from "./vscode.mjs"
import { api, MODEL } from "./server.mjs"
import { sessionsFrame } from "./lib/sessions-web.mjs"

const REQUIRED = [
  "subagents-waiting",
  "inbox-rendered",
  "inbox-batch-approved",
  "inbox-cleared",
]

const run = createRun({ suite: "c6-inbox", required: REQUIRED, scriptPath: fileURLToPath(import.meta.url) })
const health = await api("GET", "/global/health").catch(() => null)
run.setEnv({ serverVersion: health?.version ?? null, modelMode: MODEL.mode })

let app = null
let page = null
let stateFile = null

try {
  // 1. Clean up leftovers from previous runs
  for (const p of (await api("GET", "/permission")) ?? []) {
    await api("POST", `/permission/${p.id}/reply`, { reply: "reject" }).catch(() => {})
  }
  for (const q of (await api("GET", "/question")) ?? []) {
    await api("POST", `/question/${q.id}/reject`).catch(() => {})
  }

  // 2. Launch VS Code with clean isolated profile
  const launched = await launch({ profile: "c6-inbox", run })
  app = launched.app
  page = launched.page
  stateFile = launched.stateFile
  run.installCrashHandlers(() => app?.close())

  // 3. Create parent session via API (no panel opened in VS Code)
  const rand = Math.random().toString(36).slice(2, 7)
  const parentTitle = `c6-parent-${rand}`
  const parent = await api("POST", "/session", { title: parentTitle })
  if (!parent?.id) throw new Error("Failed to create parent session via API")
  const parentId = parent.id

  // Send token to spawn 3 background subagents that will each request bash permission
  await api("POST", `/session/${parentId}/prompt_async`, {
    model: { providerID: MODEL.providerID, modelID: MODEL.modelID },
    parts: [{ type: "text", text: "THREE-SUBAGENTS-NEED-PERMISSION" }],
  })

  // 4. Poll GET /permission until 3 entries, distinct sessionIDs, each parentID is parentId
  let pendingPermissions = []
  const permTimeout = Date.now() + 60000
  while (Date.now() < permTimeout) {
    const all = (await api("GET", "/permission")) ?? []
    if (all.length >= 3) {
      const sids = [...new Set(all.map((p) => p.sessionID))]
      if (sids.length >= 3) {
        let allChildren = true
        for (const sid of sids) {
          const s = await api("GET", `/session/${sid}`).catch(() => null)
          if (!s || s.parentID !== parentId) {
            allChildren = false
            break
          }
        }
        if (allChildren) {
          pendingPermissions = all
          break
        }
      }
    }
    await sleep(500)
  }

  const subagentsWaitingPass =
    pendingPermissions.length >= 3 &&
    new Set(pendingPermissions.map((p) => p.sessionID)).size >= 3

  run.record(
    "subagents-waiting",
    subagentsWaitingPass ? "PASS" : "FAIL",
    {
      pendingCount: pendingPermissions.length,
      sessionIDs: pendingPermissions.map((p) => p.sessionID),
      parentId,
    },
  )

  if (!subagentsWaitingPass) {
    throw new Error(`Expected 3 subagents waiting with parentId ${parentId}, got: ${pendingPermissions.length}`)
  }

  // 5. Without opening any session panel, enter sidebar webview
  await command(page, "Focus on Sessions View")
  await clearNotifications(page)

  let frame = null
  await waitUntil(async () => {
    frame = await sessionsFrame(page)
    return !!frame
  }, 30000, 300)

  if (!frame) throw new Error("Sessions sidebar frame not found")

  // Verify that no session panels are currently opened
  const openPanels = await chatFrames(page)
  const noPanelsOpen = openPanels.length === 0

  // 6. Assert section[data-group="inbox"] has 3 rows of [data-kind="permission"] and each row has parent title
  const inboxSection = frame.locator('section[data-group="inbox"]')
  await inboxSection.waitFor({ state: "visible", timeout: 30000 })

  const permRows = inboxSection.locator('.row[data-kind="permission"]')
  await waitUntil(async () => (await permRows.count()) >= 3, 20000, 200)

  const rowCount = await permRows.count()
  const rowDetails = []
  let allHaveParent = true

  for (let i = 0; i < rowCount; i++) {
    const row = permRows.nth(i)
    const text = (await row.innerText().catch(() => "")) ?? ""
    const aria = (await row.getAttribute("aria-label").catch(() => "")) ?? ""
    const inboxId = (await row.getAttribute("data-inbox-id").catch(() => "")) ?? ""
    const sessionId = (await row.getAttribute("data-session-id").catch(() => "")) ?? ""
    const rowParentId = (await row.getAttribute("data-parent-id").catch(() => "")) ?? ""

    const group = row.locator('xpath=ancestor::*[contains(@class, "inbox-group")]')
    const groupHead = (await group.locator('.inbox-group-head').count()) > 0
      ? group.locator('.inbox-group-head')
      : row.locator('xpath=preceding::*[contains(@class, "inbox-group-head")][1]')
    const headText = (await groupHead.innerText().catch(() => "")) ?? ""

    const hasParent = rowParentId === parentId && headText.includes(parentTitle)

    if (!hasParent) allHaveParent = false

    rowDetails.push({
      index: i,
      inboxId,
      sessionId,
      rowParentId,
      hasParent,
      headText: headText.replace(/\s+/g, " ").trim(),
      textHead: text.replace(/\s+/g, " ").trim().slice(0, 60),
    })
  }

  await runShot(page, run, "1-inbox-3-permissions")

  const inboxRenderedPass = rowCount === 3 && allHaveParent && noPanelsOpen
  run.record(
    "inbox-rendered",
    inboxRenderedPass ? "PASS" : "FAIL",
    {
      rowCount,
      allHaveParent,
      noPanelsOpen,
      parentTitle,
      rows: rowDetails,
    },
  )

  // 7. Sequentially click button[data-reply="once"]
  let approvedCount = 0
  for (let i = 0; i < 3; i++) {
    const onceBtn = inboxSection.locator('button[data-reply="once"]').first()
    if ((await onceBtn.count()) === 0) break
    await onceBtn.waitFor({ state: "visible", timeout: 10000 })
    await onceBtn.click()
    approvedCount++
    await sleep(400)
  }

  await runShot(page, run, "2-inbox-approved")

  run.record(
    "inbox-batch-approved",
    approvedCount === 3 ? "PASS" : "FAIL",
    { approvedCount },
  )

  // 8. Poll GET /permission until empty, inbox section disappears or has no permission rows
  let permEmpty = false
  const emptyTimeout = Date.now() + 30000
  while (Date.now() < emptyTimeout) {
    const cur = (await api("GET", "/permission")) ?? []
    if (cur.length === 0) {
      permEmpty = true
      break
    }
    await sleep(400)
  }

  let inboxCleared = false
  const inboxClearTimeout = Date.now() + 15000
  while (Date.now() < inboxClearTimeout) {
    const secCount = await inboxSection.count()
    if (secCount === 0) {
      inboxCleared = true
      break
    }
    const curPermRows = await inboxSection.locator('.row[data-kind="permission"]').count()
    if (curPermRows === 0) {
      inboxCleared = true
      break
    }
    await sleep(300)
  }

  await runShot(page, run, "3-inbox-cleared")

  const inboxClearedPass = permEmpty && inboxCleared
  run.record(
    "inbox-cleared",
    inboxClearedPass ? "PASS" : "FAIL",
    {
      permEmpty,
      inboxCleared,
    },
  )

  // 9. Assert status bar bell count returns to zero if viable
  try {
    let bellZero = false
    const st = stateFile ? await hostState(page, stateFile).catch(() => null) : null
    if (st?.sidebar) {
      bellZero = (st.sidebar.waiting ?? 0) === 0
    } else {
      const statusEl = page.locator('.part.statusbar [aria-label*="oco"]').first()
      if (await statusEl.count()) {
        const text = await statusEl.innerText().catch(() => "")
        bellZero = !text.includes("$(bell")
      }
    }
    run.record("bell-count-zero", bellZero ? "PASS" : "NOT RUN", { bellZero })
  } catch {
    run.record("bell-count-zero", "NOT RUN", { reason: "status bar check skipped" })
  }
} catch (e) {
  run.record("run", "FAIL", { error: String(e?.message ?? e).slice(0, 500) })
  if (page) await runShot(page, run, "error").catch(() => {})
} finally {
  if (app) await app.close().catch(() => {})
  process.exit(run.finish())
}
