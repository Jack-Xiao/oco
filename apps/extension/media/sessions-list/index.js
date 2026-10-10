"use strict"

const vscode = acquireVsCodeApi()
const saved = vscode.getState() || {}
const STAT = new Set(["running", "waiting", "unread", "error"])

let moreOpen = !!saved.moreOpen
let state = null
let searchTimer = 0
let scrollTimer = 0
let persistReady = false
let restoredScroll = false

const scroll = el("div", "scroll")
const searchWrap = el("div", "search-wrap")
const search = document.createElement("input")
const notice = el("div", "notice")
const message = el("div", "message")
const messageText = el("p", "message-text")
const messageActions = el("div", "message-actions")
const list = el("div", "list")
const moreHead = el("div", "more-head")
const moreCount = el("span", "more-count")
const loadMore = el("div", "row load-more")
const pool = new Map()
let inboxCollapsed = false
const inboxSection = document.createElement("section")
inboxSection.dataset.group = "inbox"
inboxSection.className = "inbox-section"
const inboxHead = el("div", "inbox-head")
inboxHead.tabIndex = 0
inboxHead.setAttribute("role", "button")
inboxHead.setAttribute("aria-expanded", "true")
const inboxDivider = el("div", "inbox-divider")
const sessionsHead = el("div", "sessions-head")
sessionsHead.textContent = "SESSIONS"
const inboxPool = new Map()
const groupPool = new Map()

function toggleInboxCollapse() {
  inboxCollapsed = !inboxCollapsed
  renderList()
}
inboxHead.addEventListener("click", () => toggleInboxCollapse())
inboxHead.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " " || event.key === "Spacebar") {
    event.preventDefault()
    toggleInboxCollapse()
  }
})

search.type = "search"
search.className = "search"
search.placeholder = "Search"
search.setAttribute("aria-label", "Search sessions")
search.autocomplete = "off"
search.spellcheck = false
searchWrap.append(search, notice)

notice.setAttribute("role", "status")
message.append(messageText, messageActions)
messageActions.setAttribute("role", "group")
messageActions.setAttribute("aria-label", "Actions")

list.setAttribute("role", "listbox")
list.setAttribute("aria-label", "Sessions")
moreHead.dataset.kind = "more"
moreHead.tabIndex = -1
moreHead.setAttribute("role", "button")
moreHead.setAttribute("aria-expanded", "false")
const chevron = el("span", "chevron")
chevron.setAttribute("aria-hidden", "true")
const moreLabel = el("span", "more-label")
moreLabel.textContent = "More"
moreHead.append(chevron, moreLabel, moreCount)

loadMore.dataset.kind = "load"
loadMore.tabIndex = -1
loadMore.setAttribute("role", "option")
loadMore.setAttribute("aria-selected", "false")
loadMore.setAttribute("aria-label", "Load more")
const loadDot = el("span", "dot")
const loadTitle = el("span", "title")
loadTitle.textContent = "Load more…"
loadMore.append(loadDot, loadTitle)

scroll.append(searchWrap, message, list)

function el(tag, className) {
  const node = document.createElement(tag)
  node.className = className
  return node
}
function post(msg) { vscode.postMessage(msg) }

function save() {
  if (!persistReady) return
  vscode.setState({ moreOpen: moreOpen, scrollTop: scroll.scrollTop, query: search.value })
}

function expanded() { return !!(state && (state.moreForcedOpen || moreOpen)) }
function focusables() { return Array.from(list.querySelectorAll(".row, .more-head, .inbox-group-head")) }

function focusRow(node) {
  if (!node || !node.isConnected) return
  for (const item of focusables()) {
    const want = item === node ? 0 : -1
    if (item.tabIndex !== want) item.tabIndex = want
  }
  node.focus({ preventScroll: true })
  node.scrollIntoView({ block: "nearest" })
}

function ensureTabStop() {
  const items = focusables()
  if (items.some((item) => item.tabIndex === 0)) return
  const prefer = items.find((item) => item.getAttribute("aria-selected") === "true") || items[0]
  if (prefer && prefer.tabIndex !== 0) prefer.tabIndex = 0
}

function postOpen(id, newPanel) {
  if (!id) return
  const msg = { type: "open", id: id }
  if (newPanel) msg.newPanel = true
  post(msg)
}

function toggleMore() {
  if (!state || state.moreForcedOpen) return
  moreOpen = !moreOpen
  renderList()
  save()
}

function activate(node) {
  if (!node || !list.contains(node)) return
  if (node.classList.contains("inbox-group-head")) postOpen(node.dataset.parentId, false)
  else if (node.dataset.kind === "more") toggleMore()
  else if (node.dataset.kind === "load") post({ type: "loadMore" })
  else postOpen(node.dataset.sessionId || node.dataset.id, false)
}

function layout() {
  const messageView = !!(state && state.view === "message")
  // The search box shows only after the title-bar search button (focusSearch) or while it holds a query.
  const showSearch = document.activeElement === search || search.value.length > 0
  const noticeText = !messageView && state && state.notice ? String(state.notice) : ""
  search.hidden = !showSearch
  searchWrap.hidden = !showSearch && !noticeText
  scroll.classList.toggle("mode-message", messageView)
  scroll.classList.toggle("has-search", showSearch)
  notice.hidden = !noticeText
  if (noticeText && notice.textContent !== noticeText) notice.textContent = noticeText
  message.hidden = !messageView
  list.hidden = messageView
  if (messageView) list.setAttribute("aria-hidden", "true")
  else list.removeAttribute("aria-hidden")
}

function syncSession(row) {
  const id = String(row.id)
  let node = pool.get(id)
  if (!node) {
    node = el("div", "row")
    node.dataset.kind = "session"
    node.dataset.id = id
    node.tabIndex = -1
    node.setAttribute("role", "option")
    node.setAttribute("data-vscode-context", JSON.stringify({
      webviewSection: "session",
      sessionId: id,
      preventDefaultContextMenuItems: true,
    }))
    node.append(el("span", "dot"), el("span", "title"), el("span", "time"))
    pool.set(id, node)
  }
  const title = row.title == null ? "" : String(row.title)
  const time = row.time == null ? "" : String(row.time)
  const tip = row.tooltip == null ? "" : String(row.tooltip)
  const aria = row.aria == null ? "" : String(row.aria)
  const status = STAT.has(row.status) ? row.status : ""
  const selected = !!(state && state.current != null && String(state.current) === id)
  const dot = node.children[0]
  const titleEl = node.children[1]
  const timeEl = node.children[2]
  if (titleEl.textContent !== title) titleEl.textContent = title
  if (timeEl.textContent !== time) timeEl.textContent = time
  if (node.getAttribute("title") !== tip) node.setAttribute("title", tip)
  if (node.getAttribute("aria-label") !== aria) node.setAttribute("aria-label", aria)
  if ((node.getAttribute("aria-selected") === "true") !== selected) node.setAttribute("aria-selected", selected ? "true" : "false")
  if (node.classList.contains("current") !== selected) node.classList.toggle("current", selected)
  if (dot.dataset.status !== status) {
    dot.dataset.status = status
    dot.className = status ? "dot " + status : "dot"
  }
  return node
}

function syncMore(count, open) {
  const countText = String(count)
  const aria = "More, " + countText
  const exp = open ? "true" : "false"
  if (moreCount.textContent !== countText) moreCount.textContent = countText
  if (moreHead.getAttribute("aria-expanded") !== exp) moreHead.setAttribute("aria-expanded", exp)
  if (moreHead.getAttribute("aria-label") !== aria) moreHead.setAttribute("aria-label", aria)
  if (moreHead.classList.contains("open") !== open) moreHead.classList.toggle("open", open)
}

function reconcile(parent, nodes) {
  const cur = parent.children
  let same = cur.length === nodes.length
  for (let i = 0; same && i < nodes.length; i++) if (cur[i] !== nodes[i]) same = false
  if (same) return
  for (let i = 0; i < nodes.length; i++) {
    if (cur[i] !== nodes[i]) parent.insertBefore(nodes[i], cur[i] || null)
  }
  while (parent.children.length > nodes.length) parent.removeChild(parent.lastElementChild)
}

function createInboxRow(row) {
  const node = el("div", "row inbox-row")
  node.dataset.inboxId = String(row.id)
  node.dataset.sessionId = String(row.sessionId)
  node.dataset.kind = String(row.kind)
  if (row.parentId) node.dataset.parentId = String(row.parentId)
  node.tabIndex = -1
  node.setAttribute("role", "option")
  node.setAttribute("data-vscode-context", JSON.stringify({
    webviewSection: "session",
    sessionId: String(row.sessionId),
    preventDefaultContextMenuItems: true,
  }))

  const top = el("div", "inbox-row-top")
  const dot = el("span", "dot")
  const title = el("span", "title")
  const agent = el("span", "inbox-agent")
  const parent = el("span", "inbox-parent")
  const time = el("span", "time")
  top.append(dot, title, agent, parent, time)

  const bottom = el("div", "inbox-row-bottom")
  const summary = el("span", "inbox-summary")
  const actions = el("div", "inbox-actions")
  bottom.append(summary, actions)

  node.append(top, bottom)
  updateInboxRow(node, row)
  return node
}

function updateInboxRow(node, row) {
  const id = String(row.id)
  const sessionId = String(row.sessionId)
  const kind = String(row.kind)
  node.dataset.inboxId = id
  node.dataset.sessionId = sessionId
  node.dataset.kind = kind
  if (row.parentId) node.dataset.parentId = String(row.parentId)
  else delete node.dataset.parentId

  const aria = row.aria == null ? "" : String(row.aria)
  const detail = row.detail == null ? (row.summary == null ? "" : String(row.summary)) : String(row.detail)
  if (node.getAttribute("aria-label") !== aria) node.setAttribute("aria-label", aria)
  if (node.getAttribute("title") !== detail) node.setAttribute("title", detail)

  const selected = !!(state && state.current != null && String(state.current) === sessionId)
  if ((node.getAttribute("aria-selected") === "true") !== selected) node.setAttribute("aria-selected", selected ? "true" : "false")
  if (node.classList.contains("current") !== selected) node.classList.toggle("current", selected)

  const top = node.children[0]
  const bottom = node.children[1]
  const dot = top.children[0]
  const title = top.children[1]
  const agent = top.children[2]
  const parent = top.children[3]
  const time = top.children[4]
  const summary = bottom.children[0]
  const actions = bottom.children[1]

  const dotStatus = kind === "permission" || kind === "question" ? "waiting" : kind === "error" ? "error" : kind === "done" ? "unread" : ""
  if (dot.dataset.status !== dotStatus) {
    dot.dataset.status = dotStatus
    dot.className = dotStatus ? "dot " + dotStatus : "dot"
  }

  const titleText = row.title == null ? "" : String(row.title)
  if (title.textContent !== titleText) title.textContent = titleText

  if (row.agent) {
    const agentText = "@" + String(row.agent)
    if (agent.textContent !== agentText) agent.textContent = agentText
    agent.hidden = false
  } else {
    agent.hidden = true
  }

  const parentText = !row.parentId && row.parent ? "(" + String(row.parent) + ")" : ""
  if (parent.textContent !== parentText) parent.textContent = parentText
  parent.hidden = !parentText

  const timeText = row.time == null ? "" : String(row.time)
  if (time.textContent !== timeText) time.textContent = timeText

  const summaryText = row.summary == null ? "" : String(row.summary)
  if (summary.textContent !== summaryText) summary.textContent = summaryText
  if (summary.getAttribute("title") !== detail) summary.setAttribute("title", detail)

  const actionKey = kind + ":" + id
  if (actions.dataset.key !== actionKey) {
    actions.dataset.key = actionKey
    while (actions.firstChild) actions.removeChild(actions.firstChild)
    if (kind === "permission") {
      const bOnce = document.createElement("button")
      bOnce.type = "button"
      bOnce.className = "inbox-btn"
      bOnce.dataset.reply = "once"
      bOnce.textContent = "Allow"
      bOnce.addEventListener("click", (e) => {
        e.stopPropagation()
        post({ type: "permissionReply", id: id, reply: "once" })
      })

      const bAlways = document.createElement("button")
      bAlways.type = "button"
      bAlways.className = "inbox-btn"
      bAlways.dataset.reply = "always"
      bAlways.textContent = "Always"
      bAlways.addEventListener("click", (e) => {
        e.stopPropagation()
        post({ type: "permissionReply", id: id, reply: "always" })
      })

      const bReject = document.createElement("button")
      bReject.type = "button"
      bReject.className = "inbox-btn inbox-btn-secondary"
      bReject.dataset.reply = "reject"
      bReject.textContent = "Deny"
      bReject.addEventListener("click", (e) => {
        e.stopPropagation()
        post({ type: "permissionReply", id: id, reply: "reject" })
      })

      actions.append(bOnce, bAlways, bReject)
    } else if (kind === "question") {
      const bAnswer = document.createElement("button")
      bAnswer.type = "button"
      bAnswer.className = "inbox-btn"
      bAnswer.dataset.action = "answer"
      bAnswer.textContent = "Answer"
      bAnswer.addEventListener("click", (e) => {
        e.stopPropagation()
        postOpen(sessionId, false)
      })

      const bDismiss = document.createElement("button")
      bDismiss.type = "button"
      bDismiss.className = "inbox-btn inbox-btn-secondary"
      bDismiss.dataset.reply = "reject"
      bDismiss.textContent = "Dismiss"
      bDismiss.addEventListener("click", (e) => {
        e.stopPropagation()
        post({ type: "questionReject", id: id })
      })

      actions.append(bAnswer, bDismiss)
    }
  }
}

function createInboxGroup(group) {
  const node = el("div", "inbox-group")
  node.dataset.parentId = String(group.parentId)

  const head = el("div", "inbox-group-head")
  head.dataset.parentId = String(group.parentId)
  head.tabIndex = 0
  head.setAttribute("role", "button")

  const title = el("span", "inbox-group-title")
  const count = el("span", "more-count")
  head.append(title, count)

  head.addEventListener("click", (e) => {
    e.stopPropagation()
    postOpen(group.parentId, e.metaKey || e.ctrlKey)
  })
  head.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") {
      e.preventDefault()
      postOpen(group.parentId, false)
    }
  })

  const children = el("div", "inbox-group-children")
  node.append(head, children)

  updateInboxGroup(node, group)
  return node
}

function updateInboxGroup(node, group) {
  const parentId = String(group.parentId)
  node.dataset.parentId = parentId
  const head = node.children[0]
  const children = node.children[1]
  head.dataset.parentId = parentId

  const titleText = group.title == null ? "" : String(group.title)
  const countText = String(group.rows ? group.rows.length : 0)
  const aria = titleText + ", " + countText + " pending items"

  const titleEl = head.children[0]
  const countEl = head.children[1]
  if (titleEl.textContent !== titleText) titleEl.textContent = titleText
  if (countEl.textContent !== countText) countEl.textContent = countText
  if (head.getAttribute("aria-label") !== aria) head.setAttribute("aria-label", aria)
  if (head.getAttribute("title") !== titleText) head.setAttribute("title", titleText)

  const childNodes = []
  for (const r of (group.rows || [])) {
    if (!r || r.id == null) continue
    const key = String(r.id)
    let rowNode = inboxPool.get(key)
    if (!rowNode) {
      rowNode = createInboxRow(r)
      inboxPool.set(key, rowNode)
    } else {
      updateInboxRow(rowNode, r)
    }
    childNodes.push(rowNode)
  }
  reconcile(children, childNodes)
}

function countPendingRows(entries) {
  let count = 0
  for (const entry of entries) {
    if (!entry) continue
    if (entry.kind === "group") {
      for (const r of (entry.rows || [])) {
        if (r && (r.kind === "permission" || r.kind === "question")) count++
      }
    } else if (entry.kind === "permission" || entry.kind === "question") {
      count++
    }
  }
  return count
}

function syncInbox(inboxEntries) {
  const pendingCount = countPendingRows(inboxEntries)
  const headText = "NEEDS ATTENTION · " + pendingCount
  if (inboxHead.textContent !== headText) inboxHead.textContent = headText
  const exp = inboxCollapsed ? "false" : "true"
  if (inboxHead.getAttribute("aria-expanded") !== exp) inboxHead.setAttribute("aria-expanded", exp)

  const activeRowIds = new Set()
  const activeGroupIds = new Set()

  const nodes = [inboxHead]
  if (!inboxCollapsed) {
    for (const entry of inboxEntries) {
      if (!entry) continue
      if (entry.kind === "group") {
        const key = String(entry.parentId)
        activeGroupIds.add(key)
        for (const r of (entry.rows || [])) if (r && r.id != null) activeRowIds.add(String(r.id))
        let groupNode = groupPool.get(key)
        if (!groupNode) {
          groupNode = createInboxGroup(entry)
          groupPool.set(key, groupNode)
        } else {
          updateInboxGroup(groupNode, entry)
        }
        nodes.push(groupNode)
      } else {
        const key = String(entry.id)
        activeRowIds.add(key)
        let rowNode = inboxPool.get(key)
        if (!rowNode) {
          rowNode = createInboxRow(entry)
          inboxPool.set(key, rowNode)
        } else {
          updateInboxRow(rowNode, entry)
        }
        nodes.push(rowNode)
      }
    }
  }

  reconcile(inboxSection, nodes)

  for (const key of inboxPool.keys()) {
    if (!activeRowIds.has(key)) inboxPool.delete(key)
  }
  for (const key of groupPool.keys()) {
    if (!activeGroupIds.has(key)) groupPool.delete(key)
  }

  return inboxSection
}

function renderList() {
  const active = document.activeElement
  const inbox = Array.isArray(state.inbox) ? state.inbox : []
  const recent = Array.isArray(state.recent) ? state.recent : []
  const more = Array.isArray(state.more) ? state.more : []
  const seen = new Set()
  const nodes = []

  if (inbox.length) {
    nodes.push(syncInbox(inbox))
    nodes.push(inboxDivider)
    nodes.push(sessionsHead)
  } else {
    inboxPool.clear()
    groupPool.clear()
  }

  const pushRow = (row) => {
    if (!row || row.id == null) return
    const id = String(row.id)
    if (seen.has(id)) return
    seen.add(id)
    nodes.push(syncSession(row))
  }
  recent.forEach(pushRow)
  if (more.length) {
    const open = expanded()
    syncMore(more.length, open)
    nodes.push(moreHead)
    if (open) {
      more.forEach(pushRow)
      if (state.loadMore) nodes.push(loadMore)
    } else {
      for (const row of more) if (row && row.id != null) seen.add(String(row.id))
    }
  } else if (state.loadMore) nodes.push(loadMore)
  reconcile(list, nodes)
  for (const id of pool.keys()) if (!seen.has(id)) pool.delete(id)
  if (active && (active.classList.contains("row") || active.classList.contains("more-head") || active.classList.contains("inbox-group-head")) && !active.isConnected) {
    const fallback = moreHead.isConnected ? moreHead : list.querySelector(".row, .inbox-group-head")
    if (fallback) focusRow(fallback)
  }
  ensureTabStop()
}

function renderMessage() {
  const text = state.text == null ? "" : String(state.text)
  if (messageText.textContent !== text) messageText.textContent = text
  const actions = Array.isArray(state.actions) ? state.actions : []
  const key = actions.map((a) => (a && typeof a.command === "string" ? a.command : "") + "\u0000" + (a && a.label != null ? String(a.label) : "")).join("\n")
  if (messageActions.dataset.key === key) return
  messageActions.dataset.key = key
  while (messageActions.firstChild) messageActions.removeChild(messageActions.firstChild)
  for (const action of actions) {
    if (!action || typeof action.command !== "string") continue
    const button = document.createElement("button")
    button.type = "button"
    button.className = "btn"
    button.textContent = action.label == null ? action.command : String(action.label)
    button.addEventListener("click", () => post({ type: "command", command: action.command }))
    messageActions.appendChild(button)
  }
}

function applyState(next) {
  if (!next || typeof next !== "object" || Array.isArray(next)) return
  state = next
  if (document.activeElement !== search && !searchTimer) {
    const query = next.query == null ? "" : String(next.query)
    if (search.value !== query) search.value = query
  }
  document.body.classList.toggle("still", !!next.still)
  layout()
  if (next.view === "message") renderMessage()
  else renderList()
  maybeRestoreScroll()
  if (persistReady) save()
}

function maybeRestoreScroll() {
  if (restoredScroll || typeof saved.scrollTop !== "number" || !state || state.view === "message") return
  restoredScroll = true
  const top = saved.scrollTop
  requestAnimationFrame(() => { scroll.scrollTop = top; save() })
}

function reveal(id) {
  if (id == null || !state || state.view === "message") return
  const key = String(id)
  const more = Array.isArray(state.more) ? state.more : []
  const inMore = more.some((row) => row && String(row.id) === key)
  if (inMore && !expanded()) return
  const node = pool.get(key)
  if (!node || !node.isConnected) return
  node.scrollIntoView({ block: "nearest" })
}

function onFocusSearch() {
  searchWrap.hidden = false
  search.hidden = false
  search.focus()
  search.select()
  layout()
}

function readInitial() {
  const node = document.getElementById("oco-initial-state")
  if (!node) return null
  const raw = node.textContent.trim()
  if (!raw) return null
  try {
    const data = JSON.parse(raw)
    return data && typeof data === "object" && !Array.isArray(data) ? data : null
  } catch (_err) {
    return null
  }
}

search.addEventListener("input", () => {
  clearTimeout(searchTimer)
  const query = search.value
  save()
  layout()
  searchTimer = setTimeout(() => {
    searchTimer = 0
    post({ type: "search", query: query })
  }, 200)
})

search.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    event.preventDefault()
    clearTimeout(searchTimer)
    searchTimer = 0
    if (search.value !== "") search.value = ""
    post({ type: "search", query: "" })
    save()
    // Closing the search returns focus to the list, which hides the empty box.
    const first = focusables()[0]
    if (first && !list.hidden) focusRow(first)
    else search.blur()
    layout()
    return
  }
  if ((event.key === "ArrowDown" || event.key === "ArrowUp") && !list.hidden) {
    const items = focusables()
    if (!items.length) return
    event.preventDefault()
    focusRow(event.key === "ArrowDown" ? items[0] : items[items.length - 1])
  }
})

search.addEventListener("blur", () => layout())

list.addEventListener("mousedown", (event) => { if (event.button === 1) event.preventDefault() })

list.addEventListener("click", (event) => {
  if (event.target.closest("button")) return
  const groupHead = event.target.closest(".inbox-group-head")
  if (groupHead && list.contains(groupHead) && event.button === 0) {
    focusRow(groupHead)
    postOpen(groupHead.dataset.parentId, event.metaKey || event.ctrlKey)
    return
  }
  const node = event.target.closest(".row, .more-head")
  if (!node || !list.contains(node) || event.button !== 0) return
  focusRow(node)
  if (node.dataset.kind === "more") toggleMore()
  else if (node.dataset.kind === "load") post({ type: "loadMore" })
  else postOpen(node.dataset.sessionId || node.dataset.id, event.metaKey || event.ctrlKey)
})

list.addEventListener("auxclick", (event) => {
  if (event.target.closest("button")) return
  const node = event.target.closest(".row")
  if (!node || !list.contains(node) || node.dataset.kind === "load" || event.button !== 1) return
  event.preventDefault()
  postOpen(node.dataset.sessionId || node.dataset.id, true)
})

list.addEventListener("keydown", (event) => {
  if (event.altKey || event.metaKey || event.ctrlKey) return
  const items = focusables()
  const index = items.indexOf(document.activeElement)
  if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Home" || event.key === "End") {
    event.preventDefault()
    if (!items.length) return
    let next = items[0]
    if (event.key === "End") next = items[items.length - 1]
    else if (event.key === "ArrowDown") next = items[index < 0 ? 0 : Math.min(items.length - 1, index + 1)]
    else if (event.key === "ArrowUp") next = items[index < 0 ? items.length - 1 : Math.max(0, index - 1)]
    focusRow(next)
    return
  }
  if (event.key === "Enter" || event.key === " " || event.key === "Spacebar") {
    if (event.key !== "Enter" && index < 0) return
    event.preventDefault()
    activate(document.activeElement)
  }
})

scroll.addEventListener("scroll", () => {
  clearTimeout(scrollTimer)
  scrollTimer = setTimeout(save, 150)
}, { passive: true })

window.addEventListener("message", (event) => {
  const msg = event.data
  if (!msg || typeof msg !== "object") return
  if (msg.type === "state") applyState(msg)
  else if (msg.type === "reveal") reveal(msg.id)
  else if (msg.type === "focusSearch") onFocusSearch()
})

function boot() {
  document.body.appendChild(scroll)
  const initial = readInitial()
  applyState(initial || { view: "list", query: "", inbox: [], recent: [], more: [], moreForcedOpen: false, loadMore: false, still: false })
  const hostQuery = initial && initial.query != null ? String(initial.query) : ""
  if (typeof saved.query === "string" && saved.query !== search.value) {
    search.value = saved.query
    layout()
  }
  persistReady = true
  maybeRestoreScroll()
  post({ type: "ready" })
  if (typeof saved.query === "string" && saved.query !== hostQuery) post({ type: "search", query: saved.query })
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot)
else boot()
