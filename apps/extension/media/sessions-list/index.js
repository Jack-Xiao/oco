"use strict"

const vscode = typeof acquireVsCodeApi === "function" ? acquireVsCodeApi() : null
const saved = (typeof vscode !== "undefined" && vscode && typeof vscode.getState === "function" ? vscode.getState() : null) || {}
const STAT = new Set(["running", "waiting", "unread", "error"])

let moreOpen = !!saved.moreOpen
const savedCollapsed = saved && typeof saved.collapsed === "object" && saved.collapsed !== null ? saved.collapsed : {}
let inboxCollapsed = Boolean(savedCollapsed.inbox)
let sessionsCollapsed = Boolean(savedCollapsed.sessions)
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
const inboxSection = document.createElement("section")
inboxSection.dataset.group = "inbox"
inboxSection.className = "inbox-section"

const inboxHead = el("div", "section-head inbox-head")
inboxHead.tabIndex = 0
inboxHead.setAttribute("role", "button")
inboxHead.setAttribute("aria-expanded", "true")
const inboxChevron = el("span", "chevron")
inboxChevron.setAttribute("aria-hidden", "true")
const inboxLabel = el("span", "section-label")
inboxLabel.textContent = "NEEDS ATTENTION"
const inboxCount = el("span", "section-count")
inboxHead.append(inboxChevron, inboxLabel, inboxCount)

const inboxDivider = el("div", "inbox-divider")

const sessionsHead = el("div", "section-head sessions-head")
sessionsHead.dataset.group = "sessions"
sessionsHead.tabIndex = 0
sessionsHead.setAttribute("role", "button")
sessionsHead.setAttribute("aria-expanded", "true")
const sessionsChevron = el("span", "chevron")
sessionsChevron.setAttribute("aria-hidden", "true")
const sessionsLabel = el("span", "section-label")
sessionsLabel.textContent = "SESSIONS"
const sessionsCount = el("span", "section-count")
sessionsHead.append(sessionsChevron, sessionsLabel, sessionsCount)

const pinnedHead = el("div", "section-head pinned-head")
pinnedHead.dataset.group = "pinned"
pinnedHead.tabIndex = -1
pinnedHead.setAttribute("role", "button")
const pinnedLabel = el("span", "section-label")
pinnedLabel.textContent = "Pinned"
pinnedHead.append(pinnedLabel)

const selectedSessions = new Set()
let selectionAnchor = null
const todoExpanded = new Set()

const selectionBar = el("div", "selection-bar")
selectionBar.setAttribute("data-selection-bar", "")
const selectionBarText = el("span", "selection-bar-text")
const selectionBarActions = el("div", "selection-bar-actions")

const btnStop = document.createElement("button")
btnStop.type = "button"
btnStop.className = "selection-btn selection-btn-danger"
btnStop.dataset.batch = "stop"
btnStop.textContent = "Stop"
btnStop.setAttribute("aria-label", "Stop selected sessions")
btnStop.addEventListener("click", (e) => {
  e.stopPropagation()
  if (selectedSessions.size === 0) return
  const running = getSelectedRunningIds()
  if (running.length === 0) return
  post({ type: "stop", ids: running })
})

const btnArchive = document.createElement("button")
btnArchive.type = "button"
btnArchive.className = "selection-btn"
btnArchive.dataset.batch = "archive"
btnArchive.textContent = "Archive"
btnArchive.setAttribute("aria-label", "Archive selected sessions")
btnArchive.addEventListener("click", (e) => {
  e.stopPropagation()
  if (selectedSessions.size === 0) return
  post({ type: "batch", action: "archive", ids: Array.from(selectedSessions) })
})

const btnDelete = document.createElement("button")
btnDelete.type = "button"
btnDelete.className = "selection-btn"
btnDelete.dataset.batch = "delete"
btnDelete.textContent = "Delete"
btnDelete.setAttribute("aria-label", "Delete selected sessions")
btnDelete.addEventListener("click", (e) => {
  e.stopPropagation()
  if (selectedSessions.size === 0) return
  post({ type: "batch", action: "delete", ids: Array.from(selectedSessions) })
})

const btnUnread = document.createElement("button")
btnUnread.type = "button"
btnUnread.className = "selection-btn"
btnUnread.dataset.batch = "unread"
btnUnread.textContent = "Mark unread"
btnUnread.setAttribute("aria-label", "Mark selected sessions as unread")
btnUnread.addEventListener("click", (e) => {
  e.stopPropagation()
  if (selectedSessions.size === 0) return
  post({ type: "markUnread", ids: Array.from(selectedSessions) })
})

const btnPin = document.createElement("button")
btnPin.type = "button"
btnPin.className = "selection-btn"
btnPin.dataset.batch = "pin"
btnPin.textContent = "Pin"
btnPin.setAttribute("aria-label", "Pin selected sessions")
btnPin.addEventListener("click", (e) => {
  e.stopPropagation()
  if (selectedSessions.size === 0) return
  const allPinned = areAllSelectedPinned()
  const targetPinned = !allPinned
  for (const id of selectedSessions) {
    post({ type: "pin", id: id, pinned: targetPinned })
  }
})

const btnClear = document.createElement("button")
btnClear.type = "button"
btnClear.className = "selection-btn"
btnClear.dataset.batch = "clear"
btnClear.textContent = "Clear"
btnClear.setAttribute("aria-label", "Clear selection")
btnClear.addEventListener("click", (e) => {
  e.stopPropagation()
  selectedSessions.clear()
  selectionAnchor = null
  renderList()
})

selectionBarActions.append(btnStop, btnArchive, btnDelete, btnUnread, btnPin, btnClear)
selectionBar.append(selectionBarText, selectionBarActions)

const inboxPool = new Map()
const groupPool = new Map()

function isSessionsCollapsed() {
  if (search.value && search.value.length > 0) return false
  return sessionsCollapsed
}

function toggleInboxCollapse() {
  inboxCollapsed = !inboxCollapsed
  save()
  renderList()
}

function toggleSessionsCollapse() {
  if (search.value && search.value.length > 0) return
  sessionsCollapsed = !sessionsCollapsed
  save()
  renderList()
}

function bindSectionHead(node, toggleFn) {
  node.addEventListener("click", (e) => {
    e.stopPropagation()
    focusRow(node)
    toggleFn()
  })
  node.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") {
      e.preventDefault()
      e.stopPropagation()
      toggleFn()
    }
  })
}
bindSectionHead(inboxHead, toggleInboxCollapse)
bindSectionHead(sessionsHead, toggleSessionsCollapse)

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
function post(msg) { if (vscode && typeof vscode.postMessage === "function") vscode.postMessage(msg) }

function save() {
  if (!persistReady) return
  if (typeof vscode !== "undefined" && vscode && typeof vscode.setState === "function") {
    try {
      vscode.setState({
        moreOpen: moreOpen,
        scrollTop: scroll.scrollTop,
        query: search.value,
        collapsed: { inbox: inboxCollapsed, sessions: sessionsCollapsed }
      })
    } catch (_) {}
  }
}

function expanded() { return !!(state && (state.moreForcedOpen || moreOpen)) }
function focusables() { return Array.from(list.querySelectorAll(".section-head, .row, .more-head, .inbox-group-head")) }

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
  if (node === inboxHead || node.classList.contains("inbox-head")) toggleInboxCollapse()
  else if (node === sessionsHead || node.classList.contains("sessions-head")) toggleSessionsCollapse()
  else if (node.classList.contains("inbox-group-head")) postOpen(node.dataset.parentId, false)
  else if (node.dataset.kind === "more") toggleMore()
  else if (node.dataset.kind === "load") post({ type: "loadMore" })
  else if (node.dataset.kind === "question") toggleQuestion(node.dataset.inboxId)
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

function isSessionIdRunning(sessionId) {
  if (!sessionId || !state) return false
  const sid = String(sessionId)
  const check = (arr) => {
    if (!Array.isArray(arr)) return false
    return arr.some((r) => r && String(r.id) === sid && r.stoppable === true)
  }
  return check(state.pinned) || check(state.recent) || check(state.more)
}

function getSelectedRunningIds() {
  if (selectedSessions.size === 0 || !state) return []
  const runningSet = new Set()
  const check = (arr) => {
    if (!Array.isArray(arr)) return
    for (const r of arr) {
      if (r && r.id != null && r.stoppable === true) {
        runningSet.add(String(r.id))
      }
    }
  }
  check(state.pinned)
  check(state.recent)
  check(state.more)
  const result = []
  for (const id of selectedSessions) {
    if (runningSet.has(id)) result.push(id)
  }
  return result
}

function updateSelectionBar() {
  selectionBarText.textContent = getSelectionBarText(selectedSessions.size)
  const allPinned = areAllSelectedPinned()
  btnPin.textContent = allPinned ? "Unpin" : "Pin"
  btnPin.setAttribute("aria-label", allPinned ? "Unpin selected sessions" : "Pin selected sessions")
  const runningIds = getSelectedRunningIds()
  btnStop.hidden = runningIds.length === 0
}

function getVisibleSessionIds() {
  if (!state) return []
  const pinned = Array.isArray(state.pinned) ? state.pinned : []
  const recent = Array.isArray(state.recent) ? state.recent : []
  const more = Array.isArray(state.more) ? state.more : []
  const ids = []
  const seen = new Set()
  const add = (r) => {
    if (r && r.id != null) {
      const id = String(r.id)
      if (!seen.has(id)) {
        seen.add(id)
        ids.push(id)
      }
    }
  }
  pinned.forEach(add)
  recent.forEach(add)
  if (expanded()) more.forEach(add)
  return ids
}

function areAllSelectedPinned() {
  if (selectedSessions.size === 0) return false
  const pinnedSet = new Set()
  if (state && Array.isArray(state.pinned)) {
    for (const r of state.pinned) if (r && r.id != null) pinnedSet.add(String(r.id))
  }
  if (state) {
    for (const r of (state.recent || [])) if (r && r.id != null && r.pinned) pinnedSet.add(String(r.id))
    for (const r of (state.more || [])) if (r && r.id != null && r.pinned) pinnedSet.add(String(r.id))
  }
  for (const id of selectedSessions) {
    if (!pinnedSet.has(id)) return false
  }
  return true
}

function computeRangeSelection(visibleIds, anchorId, targetId) {
  if (!Array.isArray(visibleIds) || !visibleIds.length) return []
  const targetStr = String(targetId)
  const targetIdx = visibleIds.indexOf(targetStr)
  if (targetIdx === -1) return []
  const anchorStr = anchorId != null ? String(anchorId) : null
  let anchorIdx = anchorStr != null ? visibleIds.indexOf(anchorStr) : -1
  if (anchorIdx === -1) anchorIdx = targetIdx
  const start = Math.min(anchorIdx, targetIdx)
  const end = Math.max(anchorIdx, targetIdx)
  return visibleIds.slice(start, end + 1)
}

function getSelectionBarText(count) {
  return `${count} selected`
}

function getTodoBadgeText(todo) {
  if (!todo || typeof todo.done !== "number" || typeof todo.total !== "number") return ""
  return `${todo.done}/${todo.total}`
}

function getTodoBadgeTitle(todo) {
  if (!todo || typeof todo.done !== "number" || typeof todo.total !== "number") return ""
  return `${todo.done} of ${todo.total} steps`
}

function getTodoStatusIcon(status) {
  switch (status) {
    case "completed": return "✓"
    case "in_progress": return "▸"
    case "pending": return "○"
    case "cancelled": return "✕"
    default: return "○"
  }
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

    const dot = el("span", "dot")
    const pinMark = el("span", "pin-mark")
    pinMark.setAttribute("aria-hidden", "true")
    pinMark.innerHTML = '<svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor"><path d="M4.5 1a.5.5 0 0 0-.5.5v2.8a.5.5 0 0 0 .15.35L5.5 6v3.3l-1.85 1.85a.5.5 0 0 0 .35.85H7.5V15a.5.5 0 0 0 1 0v-3h3.5a.5.5 0 0 0 .35-.85L10.5 9.3V6l1.35-1.35a.5.5 0 0 0 .15-.35V1.5a.5.5 0 0 0-.5-.5h-7z"/></svg>'

    const title = el("span", "title")

    const todoBadge = el("span", "todo-badge")
    todoBadge.addEventListener("click", (e) => {
      e.stopPropagation()
      if (todoExpanded.has(id)) todoExpanded.delete(id)
      else todoExpanded.add(id)
      renderList()
    })

    const notesBadge = el("span", "notes-badge")
    notesBadge.addEventListener("click", (e) => {
      e.stopPropagation()
      post({ type: "sendNotes", id: id })
    })

    const pinBtn = document.createElement("button")
    pinBtn.type = "button"
    pinBtn.className = "pin-btn"
    pinBtn.dataset.pin = ""
    pinBtn.innerHTML = '<svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor"><path d="M4.5 1a.5.5 0 0 0-.5.5v2.8a.5.5 0 0 0 .15.35L5.5 6v3.3l-1.85 1.85a.5.5 0 0 0 .35.85H7.5V15a.5.5 0 0 0 1 0v-3h3.5a.5.5 0 0 0 .35-.85L10.5 9.3V6l1.35-1.35a.5.5 0 0 0 .15-.35V1.5a.5.5 0 0 0-.5-.5h-7z"/></svg>'
    pinBtn.addEventListener("click", (e) => {
      e.stopPropagation()
      const isPinned = node.classList.contains("pinned")
      post({ type: "pin", id: id, pinned: !isPinned })
    })

    const stopBtn = document.createElement("button")
    stopBtn.type = "button"
    stopBtn.className = "stop-btn"
    stopBtn.dataset.stop = ""
    stopBtn.innerHTML = '<svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor"><rect x="2" y="2" width="12" height="12" rx="1.5"/></svg>'
    stopBtn.setAttribute("aria-label", "Stop session")
    stopBtn.setAttribute("title", "Stop session")
    stopBtn.addEventListener("click", (e) => {
      e.stopPropagation()
      post({ type: "stop", ids: [id] })
    })

    const time = el("span", "time")

    const todoList = el("div", "todo-list")
    todoList.setAttribute("data-todo-list", "")

    node.append(dot, pinMark, title, todoBadge, notesBadge, pinBtn, stopBtn, time, todoList)
    pool.set(id, node)
  }
  updateSessionRow(node, row)
  return node
}

function updateSessionRow(node, row) {
  const id = String(row.id)
  node.dataset.id = id
  const title = row.title == null ? "" : String(row.title)
  const time = row.time == null ? "" : String(row.time)
  const tip = row.tooltip == null ? "" : String(row.tooltip)
  const aria = row.aria == null ? "" : String(row.aria)
  const status = STAT.has(row.status) ? row.status : ""
  const isRunning = row.stoppable === true
  const isPinned = Boolean(row.pinned)
  const isSelected = selectedSessions.has(id)
  const isCurrent = !!(state && state.current != null && String(state.current) === id)

  node.classList.toggle("pinned", isPinned)
  node.classList.toggle("selected", isSelected)
  node.classList.toggle("current", isCurrent)

  if (isSelected) node.setAttribute("data-selected", "")
  else delete node.dataset.selected

  const ariaSelected = isSelected || (!selectedSessions.size && isCurrent)
  if ((node.getAttribute("aria-selected") === "true") !== ariaSelected) {
    node.setAttribute("aria-selected", ariaSelected ? "true" : "false")
  }

  const ctx = JSON.stringify({
    webviewSection: "session",
    sessionId: id,
    pinned: isPinned,
    ...(isRunning ? { running: true } : {}),
    selection: isSelected ? Array.from(selectedSessions) : [id],
    preventDefaultContextMenuItems: true,
  })
  if (node.getAttribute("data-vscode-context") !== ctx) {
    node.setAttribute("data-vscode-context", ctx)
  }

  const dot = node.children[0]
  const pinMark = node.children[1]
  const titleEl = node.children[2]
  const todoBadge = node.children[3]
  const notesBadge = node.children[4]
  const pinBtn = node.children[5]
  const stopBtn = node.children[6]
  const timeEl = node.children[7]
  const todoList = node.children[8]

  if (titleEl.textContent !== title) titleEl.textContent = title
  if (timeEl.textContent !== time) timeEl.textContent = time
  if (node.getAttribute("title") !== tip) node.setAttribute("title", tip)
  if (node.getAttribute("aria-label") !== aria) node.setAttribute("aria-label", aria)

  if (dot.dataset.status !== status) {
    dot.dataset.status = status
    dot.className = status ? "dot " + status : "dot"
  }

  pinMark.hidden = !isPinned
  const pinLabel = isPinned ? "Unpin session" : "Pin session"
  if (pinBtn.getAttribute("aria-label") !== pinLabel) pinBtn.setAttribute("aria-label", pinLabel)
  if (pinBtn.getAttribute("title") !== pinLabel) pinBtn.setAttribute("title", pinLabel)

  stopBtn.hidden = !isRunning
  const stopLabel = "Stop session"
  if (stopBtn.getAttribute("aria-label") !== stopLabel) stopBtn.setAttribute("aria-label", stopLabel)
  if (stopBtn.getAttribute("title") !== stopLabel) stopBtn.setAttribute("title", stopLabel)

  if (row.todo && typeof row.todo.total === "number" && row.todo.total > 0) {
    todoBadge.hidden = false
    const badgeText = getTodoBadgeText(row.todo)
    if (todoBadge.textContent !== badgeText) todoBadge.textContent = badgeText
    if (todoBadge.getAttribute("data-todo") !== badgeText) todoBadge.setAttribute("data-todo", badgeText)
    const badgeTitle = getTodoBadgeTitle(row.todo)
    if (todoBadge.getAttribute("title") !== badgeTitle) todoBadge.setAttribute("title", badgeTitle)

    if (todoExpanded.has(id) && Array.isArray(row.todo.items) && row.todo.items.length > 0) {
      todoList.hidden = false
      while (todoList.firstChild) todoList.removeChild(todoList.firstChild)
      for (const item of row.todo.items) {
        if (!item) continue
        const itemEl = el("div", "todo-item")
        const icon = getTodoStatusIcon(item.status)
        const contentStr = item.content == null ? "" : String(item.content)
        itemEl.setAttribute("title", contentStr)
        const iconEl = el("span", "todo-item-icon")
        iconEl.textContent = icon
        const textEl = el("span", "todo-item-text")
        textEl.textContent = contentStr
        itemEl.append(iconEl, textEl)
        todoList.appendChild(itemEl)
      }
    } else {
      todoList.hidden = true
      while (todoList.firstChild) todoList.removeChild(todoList.firstChild)
    }
  } else {
    todoBadge.hidden = true
    todoList.hidden = true
    while (todoList.firstChild) todoList.removeChild(todoList.firstChild)
  }

  if (typeof row.notes === "number" && row.notes > 0) {
    notesBadge.hidden = false
    const badgeText = `${row.notes} to send`
    if (notesBadge.textContent !== badgeText) notesBadge.textContent = badgeText
    const badgeTitle = `Send ${row.notes} review notes to the draft`
    if (notesBadge.getAttribute("title") !== badgeTitle) notesBadge.setAttribute("title", badgeTitle)
  } else {
    notesBadge.hidden = true
  }
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

function buildStepAnswer(question, selectedOptions, customText) {
  const isMultiple = Boolean(question && question.multiple)
  const isCustom = Boolean(question && question.custom) || !question || !question.options || question.options.length === 0
  const custom = typeof customText === "string" ? customText.trim() : ""
  const selected = Array.isArray(selectedOptions)
    ? selectedOptions
    : selectedOptions instanceof Set
      ? Array.from(selectedOptions)
      : []

  if (isMultiple) {
    const res = [...selected]
    if (custom && isCustom) res.push(custom)
    return res
  }

  // Single choice
  if (custom && (isCustom || selected.length === 0)) {
    return [custom]
  }
  if (selected.length > 0) {
    return [selected[0]]
  }
  return []
}

function collectAnswers(questions, stepChoices) {
  return (questions || []).map((q, i) => {
    const choice = (stepChoices && stepChoices[i]) || {}
    return buildStepAnswer(q, choice.selected || [], choice.custom || "")
  })
}

function getQuestions(row) {
  if (row && Array.isArray(row.questions) && row.questions.length > 0) return row.questions
  return [{ question: (row && row.summary) || "Question", custom: true }]
}

function findInboxRow(id) {
  if (!state || !Array.isArray(state.inbox)) return null
  for (const entry of state.inbox) {
    if (entry && entry.kind === "group") {
      for (const r of (entry.rows || [])) if (r && String(r.id) === String(id)) return r
    } else if (entry && String(entry.id) === String(id)) {
      return entry
    }
  }
  return null
}

const questionForms = new Map()

function toggleQuestion(id) {
  let qState = questionForms.get(id)
  if (!qState) {
    qState = {
      expanded: true,
      step: 0,
      answers: [],
      selected: new Set(),
      customValue: "",
      sending: false,
    }
    questionForms.set(id, qState)
  } else {
    qState.expanded = !qState.expanded
  }
  const node = inboxPool.get(id)
  if (node) {
    const row = findInboxRow(id)
    if (row) updateInboxRow(node, row)
  }
}

function submitCurrentQuestion(row, qState, node) {
  const qList = getQuestions(row)
  const currentQ = qList[qState.step] || qList[0]

  const stepAnswer = buildStepAnswer(currentQ, qState.selected, qState.customValue)
  if (stepAnswer.length === 0) return

  qState.answers[qState.step] = stepAnswer
  qState.selected = new Set()
  qState.customValue = ""

  if (qState.step < qList.length - 1) {
    qState.step++
    updateInboxRow(node, row)
  } else {
    qState.sending = true
    updateInboxRow(node, row)
    post({
      type: "questionReply",
      id: String(row.id),
      answers: qState.answers,
    })
  }
}

function renderQuestionForm(formNode, node, row, qState) {
  while (formNode.firstChild) formNode.removeChild(formNode.firstChild)

  const qList = getQuestions(row)
  const step = Math.min(qState.step, qList.length - 1)
  qState.step = step
  const currentQ = qList[step] || qList[0]

  formNode.setAttribute("aria-label", currentQ.question || "Question form")

  if (qList.length > 1) {
    const stepEl = el("div", "question-step")
    stepEl.textContent = "第 " + (step + 1) + " / " + qList.length + " 题"
    formNode.appendChild(stepEl)
  }

  if (currentQ.header) {
    const headerEl = el("div", "question-header")
    headerEl.textContent = String(currentQ.header)
    formNode.appendChild(headerEl)
  }

  const textEl = el("div", "question-text")
  textEl.textContent = String(currentQ.question || "")
  formNode.appendChild(textEl)

  const hasOptions = Array.isArray(currentQ.options) && currentQ.options.length > 0
  if (hasOptions) {
    const optionsWrap = el("div", "question-options")
    for (const opt of currentQ.options) {
      if (!opt || opt.label == null) continue
      const labelStr = String(opt.label)
      const descStr = opt.description == null ? "" : String(opt.description)
      const fullTitle = descStr ? labelStr + " — " + descStr : labelStr

      const optBtn = document.createElement("button")
      optBtn.type = "button"
      optBtn.className = "question-option-btn"
      optBtn.dataset.questionOption = labelStr
      optBtn.setAttribute("aria-label", fullTitle)
      optBtn.title = fullTitle
      if (qState.sending) optBtn.disabled = true

      const isSelected = qState.selected.has(labelStr)
      if (isSelected) {
        optBtn.classList.add("selected")
        optBtn.setAttribute("aria-pressed", "true")
      } else if (currentQ.multiple) {
        optBtn.setAttribute("aria-pressed", "false")
      }

      const labelSpan = el("span", "option-label")
      labelSpan.textContent = labelStr
      optBtn.appendChild(labelSpan)

      if (descStr) {
        const descSpan = el("span", "option-desc")
        descSpan.textContent = descStr
        optBtn.appendChild(descSpan)
      }

      optBtn.addEventListener("click", (e) => {
        e.stopPropagation()
        if (qState.sending) return
        if (currentQ.multiple) {
          if (qState.selected.has(labelStr)) qState.selected.delete(labelStr)
          else qState.selected.add(labelStr)
          updateInboxRow(node, row)
        } else {
          qState.selected = new Set([labelStr])
          qState.customValue = ""
          submitCurrentQuestion(row, qState, node)
        }
      })

      optionsWrap.appendChild(optBtn)
    }
    formNode.appendChild(optionsWrap)
  }

  // GET /question omits `custom` (v1.18.33); only an explicit false hides the free-text box (E2E c10, 2026-10-11).
  const showCustom = currentQ.custom !== false || !hasOptions
  let customInput = null
  if (showCustom) {
    customInput = document.createElement("input")
    customInput.type = "text"
    customInput.className = "question-input"
    customInput.dataset.questionInput = ""
    customInput.setAttribute("aria-label", currentQ.question || "Answer")
    customInput.placeholder = currentQ.custom ? "Type custom answer…" : "Type your answer…"
    customInput.value = qState.customValue || ""
    if (qState.sending) customInput.disabled = true

    customInput.addEventListener("input", () => {
      qState.customValue = customInput.value
    })

    customInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault()
        e.stopPropagation()
        if (qState.sending) return
        submitCurrentQuestion(row, qState, node)
      } else if (e.key === "Escape") {
        e.preventDefault()
        e.stopPropagation()
        qState.expanded = false
        updateInboxRow(node, row)
        focusRow(node)
      }
    })

    formNode.appendChild(customInput)
  }

  const showSubmit = Boolean(currentQ.multiple) || showCustom
  if (showSubmit) {
    const submitWrap = el("div", "question-submit-wrap")
    const submitBtn = document.createElement("button")
    submitBtn.type = "button"
    submitBtn.className = "inbox-btn question-submit"
    submitBtn.dataset.questionSubmit = ""
    submitBtn.textContent = qState.sending ? "Sending…" : "Submit"
    submitBtn.setAttribute("aria-label", qState.sending ? "Sending" : "Submit answer")
    if (qState.sending) submitBtn.disabled = true

    submitBtn.addEventListener("click", (e) => {
      e.stopPropagation()
      if (qState.sending) return
      submitCurrentQuestion(row, qState, node)
    })

    submitWrap.appendChild(submitBtn)
    formNode.appendChild(submitWrap)
  }

  formNode.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault()
      e.stopPropagation()
      qState.expanded = false
      updateInboxRow(node, row)
      focusRow(node)
    }
  })
}

function createInboxRow(row) {
  const node = el("div", "row inbox-row")
  node.dataset.inboxId = String(row.id)
  node.dataset.sessionId = String(row.sessionId)
  node.dataset.kind = String(row.kind)
  if (row.parentId) node.dataset.parentId = String(row.parentId)
  node.tabIndex = -1
  node.setAttribute("role", "option")
  const isRunning = isSessionIdRunning(row.sessionId)
  node.setAttribute("data-vscode-context", JSON.stringify({
    webviewSection: "session",
    sessionId: String(row.sessionId),
    ...(isRunning ? { running: true } : {}),
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

  const isRunning = isSessionIdRunning(sessionId)
  const ctx = JSON.stringify({
    webviewSection: "session",
    sessionId: sessionId,
    ...(isRunning ? { running: true } : {}),
    preventDefaultContextMenuItems: true,
  })
  if (node.getAttribute("data-vscode-context") !== ctx) {
    node.setAttribute("data-vscode-context", ctx)
  }

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

  let qState = kind === "question" ? questionForms.get(id) : null
  if (qState && qState.sending) {
    qState.sending = false
  }

  const actionKey = kind + ":" + id + ":" + (qState ? (qState.expanded ? "1" : "0") + ":" + (qState.sending ? "s" : "r") : "")
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
      bAnswer.setAttribute("aria-expanded", qState && qState.expanded ? "true" : "false")
      if (qState && qState.sending) bAnswer.disabled = true
      bAnswer.addEventListener("click", (e) => {
        e.stopPropagation()
        if (qState && qState.sending) return
        toggleQuestion(id)
      })

      const bDismiss = document.createElement("button")
      bDismiss.type = "button"
      bDismiss.className = "inbox-btn inbox-btn-secondary"
      bDismiss.dataset.reply = "reject"
      bDismiss.textContent = "Dismiss"
      if (qState && qState.sending) bDismiss.disabled = true
      bDismiss.addEventListener("click", (e) => {
        e.stopPropagation()
        if (qState && qState.sending) return
        post({ type: "questionReject", id: id })
      })

      actions.append(bAnswer, bDismiss)
    } else if (kind === "done" || kind === "error") {
      const bOpen = document.createElement("button")
      bOpen.type = "button"
      bOpen.className = "inbox-btn"
      bOpen.dataset.action = "open"
      bOpen.textContent = "Open"
      bOpen.addEventListener("click", (e) => {
        e.stopPropagation()
        postOpen(sessionId, false)
      })

      const bDiff = document.createElement("button")
      bDiff.type = "button"
      bDiff.className = "inbox-btn"
      bDiff.dataset.action = "diff"
      bDiff.textContent = "Diff"
      bDiff.addEventListener("click", (e) => {
        e.stopPropagation()
        post({ type: "openReview", id: sessionId })
      })

      actions.append(bOpen, bDiff)
      if (kind === "done") {
        const bRead = document.createElement("button")
        bRead.type = "button"
        bRead.className = "inbox-btn inbox-btn-secondary"
        bRead.dataset.action = "markRead"
        bRead.textContent = "Mark read"
        bRead.addEventListener("click", (e) => {
          e.stopPropagation()
          post({ type: "markRead", id: sessionId })
        })
        actions.append(bRead)
      }
    }
  }

  let formNode = node.querySelector(":scope > .question-form")
  if (kind === "question" && qState && qState.expanded) {
    node.classList.add("expanded")
    node.classList.toggle("sending", !!qState.sending)
    if (!formNode) {
      formNode = document.createElement("div")
      formNode.className = "question-form"
      formNode.dataset.questionForm = ""
      formNode.setAttribute("role", "group")
      node.appendChild(formNode)
    }
    renderQuestionForm(formNode, node, row, qState)
  } else {
    node.classList.remove("expanded", "sending")
    if (formNode) formNode.remove()
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

function syncInboxHead(collapsed, pendingCount) {
  const open = !collapsed
  const exp = open ? "true" : "false"
  const countText = String(pendingCount)
  const aria = "NEEDS ATTENTION, " + countText
  if (inboxCount.textContent !== countText) inboxCount.textContent = countText
  if (inboxHead.getAttribute("aria-expanded") !== exp) inboxHead.setAttribute("aria-expanded", exp)
  if (inboxHead.getAttribute("aria-label") !== aria) inboxHead.setAttribute("aria-label", aria)
  if (inboxHead.classList.contains("open") !== open) inboxHead.classList.toggle("open", open)
}

function countSessions(pinned, recent, more) {
  const set = new Set()
  if (Array.isArray(pinned)) for (const r of pinned) if (r && r.id != null) set.add(String(r.id))
  if (Array.isArray(recent)) for (const r of recent) if (r && r.id != null) set.add(String(r.id))
  if (Array.isArray(more)) for (const r of more) if (r && r.id != null) set.add(String(r.id))
  return set.size
}

function syncSessionsHead(collapsed, sessionCount) {
  const open = !collapsed
  const exp = open ? "true" : "false"
  const countText = collapsed ? String(sessionCount) : ""
  const aria = collapsed ? "SESSIONS, " + sessionCount : "SESSIONS"
  if (sessionsCount.textContent !== countText) sessionsCount.textContent = countText
  if (sessionsHead.getAttribute("aria-expanded") !== exp) sessionsHead.setAttribute("aria-expanded", exp)
  if (sessionsHead.getAttribute("aria-label") !== aria) sessionsHead.setAttribute("aria-label", aria)
  if (sessionsHead.classList.contains("open") !== open) sessionsHead.classList.toggle("open", open)
}

function syncInbox(inboxEntries) {
  const pendingCount = countPendingRows(inboxEntries)
  syncInboxHead(inboxCollapsed, pendingCount)

  const activeRowIds = new Set()
  const activeGroupIds = new Set()

  const nodes = [inboxHead]
  for (const entry of inboxEntries) {
    if (!entry) continue
    if (entry.kind === "group") {
      const key = String(entry.parentId)
      activeGroupIds.add(key)
      for (const r of (entry.rows || [])) if (r && r.id != null) activeRowIds.add(String(r.id))
      if (!inboxCollapsed) {
        let groupNode = groupPool.get(key)
        if (!groupNode) {
          groupNode = createInboxGroup(entry)
          groupPool.set(key, groupNode)
        } else {
          updateInboxGroup(groupNode, entry)
        }
        nodes.push(groupNode)
      }
    } else {
      const key = String(entry.id)
      activeRowIds.add(key)
      if (!inboxCollapsed) {
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
  for (const key of questionForms.keys()) {
    if (!activeRowIds.has(key)) questionForms.delete(key)
  }

  return inboxSection
}

function renderList() {
  const active = document.activeElement
  const inbox = Array.isArray(state.inbox) ? state.inbox : []
  const pinned = Array.isArray(state.pinned) ? state.pinned : []
  const recent = Array.isArray(state.recent) ? state.recent : []
  const more = Array.isArray(state.more) ? state.more : []
  const seen = new Set()
  const nodes = []

  if (inbox.length) {
    nodes.push(syncInbox(inbox))
    nodes.push(inboxDivider)
  } else {
    inboxPool.clear()
    groupPool.clear()
    questionForms.clear()
  }

  const sCollapsed = isSessionsCollapsed()
  const totalSessions = countSessions(pinned, recent, more)
  syncSessionsHead(sCollapsed, totalSessions)
  nodes.push(sessionsHead)

  if (!sCollapsed) {
    if (selectedSessions.size > 0) {
      updateSelectionBar()
      nodes.push(selectionBar)
    }
    const pushRow = (row) => {
      if (!row || row.id == null) return
      const id = String(row.id)
      if (seen.has(id)) return
      seen.add(id)
      nodes.push(syncSession(row))
    }
    if (pinned.length > 0) {
      nodes.push(pinnedHead)
      pinned.forEach(pushRow)
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
  } else {
    for (const row of pinned) if (row && row.id != null) seen.add(String(row.id))
    for (const row of recent) if (row && row.id != null) seen.add(String(row.id))
    for (const row of more) if (row && row.id != null) seen.add(String(row.id))
  }

  reconcile(list, nodes)
  for (const id of pool.keys()) if (!seen.has(id)) pool.delete(id)
  if (active && (active.classList.contains("row") || active.classList.contains("more-head") || active.classList.contains("inbox-group-head") || active.classList.contains("section-head")) && !active.isConnected) {
    const fallback = moreHead.isConnected ? moreHead : list.querySelector(".section-head, .row, .inbox-group-head")
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
  const validIds = new Set()
  for (const r of (next.pinned || [])) if (r && r.id != null) validIds.add(String(r.id))
  for (const r of (next.recent || [])) if (r && r.id != null) validIds.add(String(r.id))
  for (const r of (next.more || [])) if (r && r.id != null) validIds.add(String(r.id))
  for (const id of selectedSessions) {
    if (!validIds.has(id)) selectedSessions.delete(id)
  }
  if (selectionAnchor && !validIds.has(selectionAnchor)) {
    selectionAnchor = null
  }
  for (const id of todoExpanded) {
    if (!validIds.has(id)) todoExpanded.delete(id)
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
  renderList()
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
    renderList()
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
  if (event.target.closest("button, .section-head, [data-question-form], .todo-badge, .notes-badge")) return
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
  else if (node.dataset.kind === "session") {
    const id = String(node.dataset.id)
    if (event.shiftKey) {
      event.preventDefault()
      const visibleIds = getVisibleSessionIds()
      if (!selectionAnchor) selectionAnchor = id
      const range = computeRangeSelection(visibleIds, selectionAnchor, id)
      selectedSessions.clear()
      for (const rId of range) selectedSessions.add(rId)
      renderList()
      return
    }
    if (event.metaKey || event.ctrlKey) {
      event.preventDefault()
      if (selectedSessions.has(id)) selectedSessions.delete(id)
      else selectedSessions.add(id)
      selectionAnchor = id
      renderList()
      return
    }
    selectedSessions.clear()
    selectionAnchor = id
    renderList()
    postOpen(id, false)
  }
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
  if (event.altKey) return
  if (event.target.closest("[data-question-form]")) return
  if (event.key === "Escape") {
    if (selectedSessions.size > 0) {
      event.preventDefault()
      selectedSessions.clear()
      renderList()
      return
    }
    const act = document.activeElement
    if (act && act.dataset && act.dataset.kind === "question") {
      const qState = questionForms.get(act.dataset.inboxId)
      if (qState && qState.expanded) {
        event.preventDefault()
        qState.expanded = false
        const row = findInboxRow(act.dataset.inboxId)
        if (row) updateInboxRow(act, row)
        return
      }
    }
  }
  if (event.shiftKey && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
    const act = document.activeElement
    if (act && act.dataset && act.dataset.kind === "session") {
      const visibleIds = getVisibleSessionIds()
      const curIdx = visibleIds.indexOf(act.dataset.id)
      if (curIdx !== -1) {
        const nextIdx = event.key === "ArrowDown" ? Math.min(visibleIds.length - 1, curIdx + 1) : Math.max(0, curIdx - 1)
        if (nextIdx !== curIdx) {
          event.preventDefault()
          const nextId = visibleIds[nextIdx]
          if (!selectionAnchor) selectionAnchor = act.dataset.id
          const range = computeRangeSelection(visibleIds, selectionAnchor, nextId)
          selectedSessions.clear()
          for (const rId of range) selectedSessions.add(rId)
          const nextNode = pool.get(nextId)
          if (nextNode) focusRow(nextNode)
          renderList()
          return
        }
      }
    }
  }
  if (event.metaKey || event.ctrlKey) return
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
  list.setAttribute("aria-multiselectable", "true")
  const initial = readInitial()
  applyState(initial || { view: "list", query: "", inbox: [], pinned: [], recent: [], more: [], moreForcedOpen: false, loadMore: false, still: false })
  const hostQuery = initial && initial.query != null ? String(initial.query) : ""
  if (typeof saved.query === "string" && saved.query !== search.value) {
    search.value = saved.query
    layout()
    renderList()
  }
  persistReady = true
  maybeRestoreScroll()
  post({ type: "ready" })
  if (typeof saved.query === "string" && saved.query !== hostQuery) post({ type: "search", query: saved.query })
}

if (vscode) {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot)
  else boot()
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    buildStepAnswer,
    collectAnswers,
    getQuestions,
    questionForms,
    toggleQuestion,
    computeRangeSelection,
    getSelectionBarText,
    getTodoBadgeText,
    getTodoBadgeTitle,
    getTodoStatusIcon,
  }
}
