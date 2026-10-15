import * as vscode from "vscode"
import type { SessionStore } from "./session-store"
import type { WebviewClient } from "./sessions-webview"

/**
 * Answers to a pending inbox request, shared by the sidebar webview and the inbox QuickPick (M03).
 * `message` rides along on a permission reply (M06 Deny with note): upstream turns reject + message into
 * feedback for the agent instead of ending the turn.
 */
export type PendingAnswer =
  | { kind: "permission"; reply: "once" | "always" | "reject"; message?: string }
  | { kind: "questionReply"; answers: string[][] }
  | { kind: "questionReject" }

const FAILED: Record<PendingAnswer["kind"], string> = {
  permission: "Permission reply failed",
  questionReply: "Question reply failed",
  questionReject: "Question reject failed",
}

/** POST the answer for request `id` in the directory it was asked in; drops it from the store on success. Returns false when it was no longer pending or the call failed. */
export async function answerPending(
  client: WebviewClient | undefined,
  store: SessionStore,
  refresh: () => void,
  id: string,
  answer: PendingAnswer,
): Promise<boolean> {
  if (!store.hasPending(id)) {
    refresh()
    return false
  }
  if (!client) return false
  const dir = store.pendingDirectory(id) ?? client.directory
  const q = dir ? `?directory=${encodeURIComponent(dir)}` : ""
  const rid = encodeURIComponent(id)
  try {
    if (answer.kind === "permission") {
      const note = answer.message?.trim()
      const body = note ? { reply: answer.reply, message: note } : { reply: answer.reply }
      await client.request("POST", `/permission/${rid}/reply${q}`, body)
    } else if (answer.kind === "questionReply") {
      await client.request("POST", `/question/${rid}/reply${q}`, { answers: answer.answers })
    } else {
      await client.request("POST", `/question/${rid}/reject${q}`)
    }
    store.removePending(id)
    refresh()
    return true
  } catch (e) {
    void vscode.window.showErrorMessage(`oco: ${FAILED[answer.kind]} (${(e as Error).message})`)
    refresh()
    return false
  }
}
