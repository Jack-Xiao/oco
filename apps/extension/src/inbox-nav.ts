import * as vscode from "vscode"
import type { SessionStore, InboxRow } from "./session-store"
import type { WebviewClient } from "./sessions-webview"
import { answerPending } from "./inbox-actions"
import type { Entry } from "./panels"

export type InboxNavDeps = {
  store: SessionStore
  panels: {
    active: Entry | undefined
    onDidChangeActiveSession: vscode.Event<{ sessionId?: string; draft?: boolean } | undefined>
  }
  client?: () => WebviewClient | undefined
  refreshView?: () => void
  markRead?: (sessionId: string) => void
  openSession?: (sessionId: string) => Promise<void>
  unreadIds?: (id: string) => boolean
}

type InboxItem = (vscode.QuickPickItem & { row: InboxRow }) | (vscode.QuickPickItem & { row?: undefined })

export class SessionMruTracker implements vscode.Disposable {
  private mru: string[] = []
  private readonly sub: vscode.Disposable

  constructor(
    panels: {
      onDidChangeActiveSession: vscode.Event<{ sessionId?: string; draft?: boolean } | undefined>
      active?: { binding?: { sessionId?: string; draft?: boolean } }
    },
  ) {
    if (panels.active?.binding?.sessionId && !panels.active.binding.draft) {
      this.touch(panels.active.binding.sessionId)
    }
    this.sub = panels.onDidChangeActiveSession((binding) => {
      if (binding?.sessionId && !binding.draft) {
        this.touch(binding.sessionId)
      }
    })
  }

  touch(id: string) {
    this.mru = [id, ...this.mru.filter((x) => x !== id)].slice(0, 20)
  }

  list(): string[] {
    return [...this.mru]
  }

  dispose() {
    this.sub.dispose()
  }
}

async function openSessionHelper(deps: InboxNavDeps, sessionId: string): Promise<void> {
  if (deps.openSession) {
    await deps.openSession(sessionId)
  } else {
    await vscode.commands.executeCommand("oco.openSession", sessionId)
  }
}

export function buildInboxQuickPickItems(rows: InboxRow[]): InboxItem[] {
  const perm: InboxRow[] = []
  const ques: InboxRow[] = []
  const errs: InboxRow[] = []
  const done: InboxRow[] = []

  for (const r of rows) {
    if (r.kind === "permission") perm.push(r)
    else if (r.kind === "question") ques.push(r)
    else if (r.kind === "error") errs.push(r)
    else if (r.kind === "done") done.push(r)
  }

  // Inside groups: newest first
  const sortByNewest = (a: InboxRow, b: InboxRow) => b.at - a.at || a.id.localeCompare(b.id)
  perm.sort(sortByNewest)
  ques.sort(sortByNewest)
  errs.sort(sortByNewest)
  done.sort(sortByNewest)

  const items: InboxItem[] = []

  const SeparatorKind = vscode.QuickPickItemKind?.Separator ?? 1
  const ThemeIconClass =
    vscode.ThemeIcon ??
    (class ThemeIcon {
      constructor(public readonly id: string) {}
    } as any)
  const addGroup = (title: string, groupRows: InboxRow[], isPermission = false) => {
    if (groupRows.length === 0) return
    items.push({ kind: SeparatorKind as any, label: title })
    for (const row of groupRows) {
      const item: InboxItem = {
        label: row.title,
        description: row.detail || row.summary,
        row,
      }
      if (isPermission) {
        item.buttons = [
          { iconPath: new ThemeIconClass("check"), tooltip: "Allow once" },
          { iconPath: new ThemeIconClass("x"), tooltip: "Deny" },
        ]
      }
      items.push(item)
    }
  }

  addGroup("Needs permission", perm, true)
  addGroup("Needs answer", ques)
  addGroup("Errors", errs)
  addGroup("Done unread", done)

  return items
}

export function showInboxNextQuickPick(deps: InboxNavDeps): vscode.QuickPick<InboxItem> {
  const quickPick = vscode.window.createQuickPick<InboxItem>()
  quickPick.title = "OpenCode Inbox"
  quickPick.placeholder = "Select an item to open session, or click Allow/Deny for permissions"

  const populate = () => {
    const curId = deps.panels.active?.binding?.sessionId
    const rows = deps.store.inbox(curId, deps.unreadIds)
    quickPick.items = buildInboxQuickPickItems(rows)
  }

  populate()

  quickPick.onDidTriggerItemButton(async (e) => {
    const row = e.item.row
    if (!row || row.kind !== "permission") return
    const reply = e.button.tooltip === "Allow once" ? "once" : "reject"
    await answerPending(deps.client?.(), deps.store, () => deps.refreshView?.(), row.id, {
      kind: "permission",
      reply,
    })
    populate()
  })

  quickPick.onDidAccept(async () => {
    const selected = quickPick.selectedItems[0]
    if (!selected?.row) return
    const row = selected.row
    quickPick.hide()
    if (row.kind === "done" || row.kind === "error") {
      deps.markRead?.(row.sessionId)
    }
    await openSessionHelper(deps, row.sessionId)
  })

  quickPick.onDidHide(() => quickPick.dispose())
  quickPick.show()
  return quickPick
}

export function registerInboxNavCommands(deps: InboxNavDeps, mru: SessionMruTracker): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand("oco.inbox.next", () => {
      showInboxNextQuickPick(deps)
    }),

    vscode.commands.registerCommand("oco.session.parent", async () => {
      const curId = deps.panels.active?.binding?.sessionId
      if (!curId) {
        void vscode.window.showWarningMessage("oco: No active session")
        return
      }
      const state = deps.store.sessionStates().find((s) => s.id === curId)
      const parentId = state?.parentID
      if (!parentId) {
        void vscode.window.showInformationMessage("oco: No parent session")
        return
      }
      await openSessionHelper(deps, parentId)
    }),

    vscode.commands.registerCommand("oco.session.child", async () => {
      const curId = deps.panels.active?.binding?.sessionId
      if (!curId) {
        void vscode.window.showWarningMessage("oco: No active session")
        return
      }
      const children = deps.store.sessionStates().filter((s) => s.parentID === curId)
      if (children.length === 0) {
        void vscode.window.showInformationMessage("oco: No child sessions")
        return
      }
      if (children.length === 1) {
        await openSessionHelper(deps, children[0].id)
        return
      }
      const items = children.map((c) => ({
        label: c.title || c.id,
        description: c.id,
        sessionId: c.id,
      }))
      const picked = await vscode.window.showQuickPick(items, {
        placeHolder: "Select child session to open",
      })
      if (picked) {
        await openSessionHelper(deps, picked.sessionId)
      }
    }),

    vscode.commands.registerCommand("oco.session.nextSibling", async () => {
      await navigateSibling(deps, "next")
    }),

    vscode.commands.registerCommand("oco.session.previousSibling", async () => {
      await navigateSibling(deps, "prev")
    }),

    vscode.commands.registerCommand("oco.session.recent", () => {
      const list = mru.list()
      if (list.length === 0) {
        void vscode.window.showInformationMessage("oco: No recent sessions")
        return
      }
      const states = deps.store.sessionStates()
      const stateMap = new Map(states.map((s) => [s.id, s]))
      const items = list.map((id) => {
        const s = stateMap.get(id)
        return {
          label: s?.title || id,
          description: id,
          sessionId: id,
        }
      })
      const quickPick = vscode.window.createQuickPick<typeof items[number]>()
      quickPick.title = "Recent Sessions"
      quickPick.placeholder = "Select session to open"
      quickPick.items = items
      if (items.length > 1) {
        quickPick.activeItems = [items[1]]
      }
      quickPick.onDidAccept(async () => {
        const sel = quickPick.selectedItems[0]
        quickPick.hide()
        if (sel) {
          await openSessionHelper(deps, sel.sessionId)
        }
      })
      quickPick.onDidHide(() => quickPick.dispose())
      quickPick.show()
    }),
  ]
}

async function navigateSibling(deps: InboxNavDeps, direction: "next" | "prev"): Promise<void> {
  const curId = deps.panels.active?.binding?.sessionId
  if (!curId) {
    void vscode.window.showWarningMessage("oco: No active session")
    return
  }
  const states = deps.store.sessionStates()
  const current = states.find((s) => s.id === curId)
  const parentId = current?.parentID
  const siblings = states.filter((s) => s.parentID === parentId)
  if (siblings.length <= 1) {
    void vscode.window.showInformationMessage("oco: No other sibling sessions")
    return
  }
  const idx = siblings.findIndex((s) => s.id === curId)
  if (idx === -1) return
  const nextIdx = direction === "next" ? (idx + 1) % siblings.length : (idx - 1 + siblings.length) % siblings.length
  await openSessionHelper(deps, siblings[nextIdx].id)
}
