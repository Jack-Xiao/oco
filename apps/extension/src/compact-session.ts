import * as vscode from "vscode"

export type CompactDeps = {
  request: <T>(method: string, path: string, body?: unknown, directory?: string) => Promise<T>
  lastModel: (sessionID: string) => { providerID: string; modelID: string } | undefined
  isBusy: (sessionID: string) => boolean
  rowItem: (arg: unknown) => { id: string; directory: string; title: string } | undefined
  pickSession: (placeHolder: string) => Promise<{ id: string; directory: string; title?: string } | undefined>
  requireTrust: (what: string) => boolean
  onDone: (sessionID: string) => void
}

export type CompactSessionInfo = {
  id: string
  title?: string
  directory: string
  parentID?: string
  time?: {
    created?: number
    updated?: number
    archived?: number
    compacting?: number
  }
}

export type MessageInfo = {
  role?: string
  providerID?: string
  modelID?: string
  [key: string]: unknown
}

export type MessageItem = {
  info?: MessageInfo
  parts?: unknown[]
  [key: string]: unknown
}

export function summarizePath(sessionID: string, directory?: string): string {
  const encId = encodeURIComponent(sessionID)
  return directory ? `/session/${encId}/summarize?directory=${encodeURIComponent(directory)}` : `/session/${encId}/summarize`
}

export function compactGuard(input: {
  busy: boolean
  compacting?: number
}): { ok: true } | { ok: false; reason: "busy" | "compacting" } {
  if (input.busy) return { ok: false, reason: "busy" }
  if (typeof input.compacting === "number") return { ok: false, reason: "compacting" }
  return { ok: true }
}

export function pickModelFromMessages(
  messages: Array<{ info?: { role?: string; providerID?: string; modelID?: string } }>,
): { providerID: string; modelID: string } | undefined {
  if (!Array.isArray(messages)) return undefined
  for (let i = messages.length - 1; i >= 0; i--) {
    const info = messages[i]?.info
    if (
      info?.role === "assistant" &&
      typeof info.providerID === "string" &&
      info.providerID.trim() !== "" &&
      typeof info.modelID === "string" &&
      info.modelID.trim() !== ""
    ) {
      return { providerID: info.providerID, modelID: info.modelID }
    }
  }
  return undefined
}

export function registerCompactSession(deps: CompactDeps): vscode.Disposable {
  return vscode.commands.registerCommand("oco.compactSession", async (arg?: unknown) => {
    try {
      if (!deps.requireTrust("compact a session")) return

      const item = deps.rowItem(arg)
      const s = item ?? (await deps.pickSession("Select a session to compact"))
      if (!s) return

      const title = "title" in s && s.title ? s.title : s.id

      if (deps.isBusy(s.id)) {
        void vscode.window.showWarningMessage("oco: Session is running. Wait for it to finish or stop it first.")
        return
      }

      const sessionPath = s.directory
        ? `/session/${encodeURIComponent(s.id)}?directory=${encodeURIComponent(s.directory)}`
        : `/session/${encodeURIComponent(s.id)}`
      const info = await deps.request<CompactSessionInfo>("GET", sessionPath, undefined, s.directory)

      const guard = compactGuard({ busy: deps.isBusy(s.id), compacting: info?.time?.compacting })
      if (!guard.ok) {
        if (guard.reason === "compacting") {
          void vscode.window.showWarningMessage("oco: Session is already compacting.")
        } else {
          void vscode.window.showWarningMessage("oco: Session is running. Wait for it to finish or stop it first.")
        }
        return
      }

      let model = deps.lastModel(s.id)
      if (!model || !model.providerID || !model.modelID) {
        const msgPath = s.directory
          ? `/session/${encodeURIComponent(s.id)}/message?directory=${encodeURIComponent(s.directory)}`
          : `/session/${encodeURIComponent(s.id)}/message`
        const messages = await deps.request<MessageItem[]>("GET", msgPath, undefined, s.directory)
        model = pickModelFromMessages(messages)
      }

      if (!model) {
        void vscode.window.showWarningMessage("oco: This session does not have any assistant messages yet; cannot determine model.")
        return
      }

      const confirmed = await vscode.window.showWarningMessage(
        `Compact session "${title}"?`,
        {
          modal: true,
          detail: `oco will ask the server to summarize the conversation with ${model.providerID}/${model.modelID}. Older messages stay on the server; the model will see the summary instead.`,
        },
        "Compact",
      )
      if (confirmed !== "Compact") return

      await vscode.window.withProgress(
        {
          location: (vscode.ProgressLocation?.Notification ?? 15) as vscode.ProgressLocation,
          title: `oco: Compacting ${title}…`,
        },
        async () => {
          const summarizePromise = deps.request<boolean>(
            "POST",
            summarizePath(s.id, s.directory),
            { providerID: model.providerID, modelID: model.modelID },
            s.directory,
          )
          let timer: ReturnType<typeof setTimeout> | undefined
          try {
            await Promise.race([
              summarizePromise,
              new Promise<never>((_, reject) => {
                timer = setTimeout(() => reject(new Error("Compaction timed out after 3 minutes")), 3 * 60 * 1000)
                if (typeof timer === "object" && "unref" in timer) timer.unref()
              }),
            ])
          } finally {
            if (timer) clearTimeout(timer)
          }
        },
      )

      deps.onDone(s.id)
      void vscode.window.showInformationMessage(`oco: Compacted session "${title}".`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      void vscode.window.showErrorMessage(`oco: Could not compact session (${msg})`)
    }
  })
}
