// Sessions sidebar webview (view id oco.sessions). The list is inside a vscode-webview iframe;
// title-bar buttons stay in the workbench. Callers pass the Playwright page from vscode.mjs.

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/** Quote a value for a double-quoted CSS attribute selector. */
function escapeAttr(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')
}

const MISSING = "[data-oco-sessions-missing]"

/** Frame whose document contains the sessions listbox, or null before the view has loaded. */
export async function sessionsFrame(page) {
  for (const frame of page.frames()) {
    const ok = await frame.evaluate(() => !!document.querySelector('.list[role="listbox"]')).catch(() => false)
    if (ok) return frame
  }
  return null
}

/**
 * Session row matched by exact `.title` text, or by an aria-label that is the title or starts
 * with "title," (the row aria is "title, status, time"). Empty locator when the frame or title is missing.
 */
export async function sessionRow(page, title) {
  const frame = await sessionsFrame(page)
  if (!frame || title == null || title === "") return page.locator(MISSING)
  const exact = new RegExp(`^${escapeRegExp(title)}$`)
  const quoted = escapeAttr(title)
  const rows = frame.locator('.row[data-kind="session"][role="option"]')
  const byTitle = rows.filter({ has: frame.locator(".title", { hasText: exact }) })
  const byAria = frame.locator(
    `.row[data-kind="session"][role="option"][aria-label="${quoted}"], .row[data-kind="session"][role="option"][aria-label^="${quoted},"]`,
  )
  return byTitle.or(byAria).first()
}

/** "More" group header. Not in the document when the group is empty. */
export async function moreHead(page) {
  const frame = await sessionsFrame(page)
  if (!frame) return page.locator(MISSING)
  return frame.locator('.more-head[data-kind="more"]')
}

/** "Load more…" row. Rendered only when another page exists (inside an expanded More group, or at the top level). */
export async function loadMoreRow(page) {
  const frame = await sessionsFrame(page)
  if (!frame) return page.locator(MISSING)
  return frame.locator('.row.load-more[data-kind="load"]')
}

/**
 * Native title-bar button. `label` is a command-title prefix (New Session, Search Sessions, …).
 * The button lives on the container title after the single view is merged; hover that title before clicking.
 */
export function titleAction(page, label) {
  const quoted = escapeAttr(label)
  return page
    .locator(`.part.sidebar .title-actions [aria-label^="${quoted}"], .part.sidebar .actions-container [aria-label^="${quoted}"]`)
    .first()
}

/** Hover the container title, click Search Sessions, and wait until the webview search box is shown and focused. */
export async function openSearch(page) {
  await page.locator(".part.sidebar .composite.title").first().hover().catch(() => {})
  await titleAction(page, "Search Sessions").click()
  const frame = await sessionsFrame(page)
  if (!frame) return false
  return frame
    .waitForFunction(() => {
      const input = document.querySelector("input.search")
      return !!input && !input.hidden && document.activeElement === input
    }, null, { timeout: 5000 })
    .then(() => true, () => false)
}
