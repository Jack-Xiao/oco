import * as vscode from "vscode"
import type { ConnectionSummary, SessionActivity, SessionListItem } from "@oco/contracts"
import type { SessionStore } from "./session-store"

export const SESSIONS_VIEW = "oco.sessions"
export const MAX_ITEMS = 200 // = SessionFeed.ROOT_LIMIT

const ACTIVITY: Record<SessionActivity, { label: string; icon: string; color?: string }> = {
  idle: { label: "", icon: "comment-discussion" },
  busy: { label: "运行中", icon: "sync~spin", color: "charts.blue" },
  retry: { label: "重试中", icon: "sync~spin", color: "charts.orange" },
  permission: { label: "等待权限", icon: "shield", color: "charts.yellow" },
  question: { label: "等待回答", icon: "question", color: "charts.yellow" },
  error: { label: "出错", icon: "error", color: "errorForeground" },
}

export function relativeTime(ms: number, now = Date.now()) {
  if (!ms) return ""
  const s = Math.max(0, Math.round((now - ms) / 1000))
  if (s < 60) return "刚刚"
  if (s < 3600) return `${Math.floor(s / 60)} 分钟前`
  if (s < 86400) return `${Math.floor(s / 3600)} 小时前`
  if (s < 86400 * 30) return `${Math.floor(s / 86400)} 天前`
  return new Date(ms).toISOString().slice(0, 10)
}

export class SessionItem extends vscode.TreeItem {
  constructor(readonly session: SessionListItem, open: boolean) {
    super(session.title, vscode.TreeItemCollapsibleState.None)
    const a = ACTIVITY[session.activity]
    this.id = session.id
    const count = session.activity === "permission" ? session.pendingPermissions : session.activity === "question" ? session.pendingQuestions : 0
    this.description = [a.label + (count > 1 ? ` ×${count}` : ""), open ? "已打开" : "", relativeTime(session.updated)].filter(Boolean).join(" · ")
    this.iconPath = new vscode.ThemeIcon(a.icon, a.color ? new vscode.ThemeColor(a.color) : undefined)
    this.contextValue = "oco.session"
    const tip = new vscode.MarkdownString(undefined, true)
    tip.appendText(`${session.title}\n${session.id}\n${session.directory}`)
    if (session.error) tip.appendText(`\n错误：${session.error}`)
    this.tooltip = tip
    this.accessibilityInformation = { label: [session.title, a.label, open ? "已打开" : ""].filter(Boolean).join("，") }
    this.command = { command: "oco.openSession", title: "打开会话", arguments: [session.id] }
  }
}

/** Native session list: data from SessionStore, states from the connection summary. */
export class SessionsView implements vscode.TreeDataProvider<SessionItem>, vscode.Disposable {
  private readonly changed = new vscode.EventEmitter<void>()
  readonly onDidChangeTreeData = this.changed.event
  readonly view: vscode.TreeView<SessionItem>
  private query = ""
  private summary: ConnectionSummary | undefined
  private refreshTimer: ReturnType<typeof setTimeout> | undefined
  private readonly status: vscode.StatusBarItem
  readonly stats = { renders: 0 }

  constructor(
    private readonly store: SessionStore,
    private readonly isOpen: (sessionId: string) => boolean,
  ) {
    this.view = vscode.window.createTreeView(SESSIONS_VIEW, { treeDataProvider: this, showCollapseAll: false })
    this.status = vscode.window.createStatusBarItem("oco.connection", vscode.StatusBarAlignment.Left, 10)
    this.status.name = "oco 连接"
    void vscode.commands.executeCommand("setContext", "oco.searchActive", false)
  }

  /** Coalesces bursts of events (streaming updates) into one render. */
  refresh() {
    if (this.refreshTimer) return
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = undefined
      this.changed.fire()
      this.updateChrome()
    }, 150)
  }

  get search() {
    return this.query
  }

  setSearch(q: string) {
    this.query = q.trim()
    void vscode.commands.executeCommand("setContext", "oco.searchActive", !!this.query)
    this.refresh()
  }

  setConnection(s: ConnectionSummary) {
    this.summary = s
    void vscode.commands.executeCommand("setContext", "oco.connState", s.state)
    void vscode.commands.executeCommand("setContext", "oco.connIssue", s.issue ?? "")
    this.refresh()
  }

  items(): SessionListItem[] {
    return this.store.list(this.query)
  }

  getTreeItem(e: SessionItem) {
    return e
  }

  getChildren(e?: SessionItem): SessionItem[] {
    if (e) return []
    this.stats.renders++
    const s = this.summary?.state
    // Empty tree -> the matching viewsWelcome content (loading / error / unauthorized / empty) shows.
    if (s === "unconfigured" || (s !== "connected" && s !== "reconnecting" && this.store.size === 0)) return []
    return this.items()
      .slice(0, MAX_ITEMS)
      .map((i) => new SessionItem(i, this.isOpen(i.id)))
  }

  private updateChrome() {
    const s = this.summary
    const all = this.items()
    const waiting = all.filter((i) => i.activity === "permission" || i.activity === "question").length
    this.view.description = this.query ? `搜索：${this.query}` : undefined
    let message: string | undefined
    if (s?.state === "reconnecting") message = `连接中断，正在重连（第 ${s.attempt} 次）……列表可能不是最新。${s.error ? `原因：${s.error}` : ""}`
    else if (s?.state === "error") message = `无法连接 ${s.label}：${s.error ?? ""}`
    else if (s?.state === "unauthorized" || s?.state === "unconfigured") message = s.error
    // The feed loads at most MAX_ITEMS root sessions and search runs on that loaded list only.
    else if (this.store.limitReached || all.length > MAX_ITEMS)
      message = this.query
        ? `搜索只在已加载的最近 ${MAX_ITEMS} 个会话中进行，更早的会话不会出现在结果里。`
        : `只加载了最近 ${MAX_ITEMS} 个会话，搜索也只覆盖这些会话。`
    this.view.message = message
    this.view.badge = waiting ? { value: waiting, tooltip: `${waiting} 个会话等待你处理` } : undefined

    const st = this.status
    const label = s?.label.replace(/^https?:\/\//, "") ?? ""
    switch (s?.state) {
      case "connected":
        st.text = `$(plug) oco${waiting ? ` $(bell-dot) ${waiting}` : ""}`
        st.tooltip = `oco 已连接 ${s.label}\n${s.directory ?? ""}${s.trusted ? "" : "\n受限模式：只读"}`
        st.command = "oco.sessions.focus"
        st.backgroundColor = undefined
        break
      case "connecting":
        st.text = `$(sync~spin) oco 连接中`
        st.tooltip = `正在连接 ${s.label}`
        st.command = "oco.sessions.focus"
        st.backgroundColor = undefined
        break
      case "reconnecting":
      case "error":
        st.text = `$(debug-disconnect) oco ${s.state === "error" ? "未连接" : "重连中"}`
        st.tooltip = `${label}：${s.error ?? ""}\n点击立即重试`
        st.command = "oco.reconnect"
        st.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground")
        break
      case "unauthorized":
        st.text = `$(lock) oco 需要密码`
        st.tooltip = `${s.error ?? ""}\n点击设置密码`
        st.command = "oco.setServerPassword"
        st.backgroundColor = new vscode.ThemeColor("statusBarItem.errorBackground")
        break
      default:
        st.text = `$(circle-slash) oco`
        st.tooltip = `${s?.error ?? "oco 未配置"}\n点击${s?.issue === "endpoint" ? "打开设置" : "查看侧栏"}`
        st.command = s?.issue === "endpoint" ? "oco.openSettings" : "oco.sessions.focus"
        st.backgroundColor = undefined
    }
    st.show()
  }

  debugState() {
    const s = this.summary
    return {
      connection: s ? { state: s.state, attempt: s.attempt, error: s.error, issue: s.issue, label: s.label, trusted: s.trusted } : null,
      search: this.query,
      message: this.view.message ?? null,
      badge: this.view.badge?.value ?? 0,
      statusText: this.status.text,
      items: this.getChildren().map((i) => ({ id: i.session.id, title: i.session.title, activity: i.session.activity, description: i.description })),
    }
  }

  dispose() {
    if (this.refreshTimer) clearTimeout(this.refreshTimer)
    this.changed.dispose()
    this.view.dispose()
    this.status.dispose()
  }
}
