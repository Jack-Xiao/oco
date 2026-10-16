// Message bookmarks (M22). Host-side only: the chat page asks over the bridge, the sidebar lists them.
// connectionId comes from the panel binding, never from the page. A repeat add is a no-op.
import * as vscode from "vscode"

export const BOOKMARKS_KEY = "oco.messageBookmarks"
const SUMMARY_MAX = 80

export type MessageBookmark = {
  connectionId: string
  sessionId: string
  messageId: string
  anchorId: string
  /** Visible label, trimmed and cut to 80 characters. */
  summary: string
  /** When the bookmark was added (ms). `listFor` sorts by this, ascending. */
  at: number
}

export type BookmarkInput = {
  connectionId: string
  sessionId: string
  messageId: string
  anchorId: string
  summary?: string
  at?: number
}

const EventEmitterClass =
  vscode.EventEmitter ??
  (class FallbackEventEmitter<T> {
    private readonly listeners = new Set<(e: T) => void>()
    readonly event = (listener: (e: T) => void) => {
      this.listeners.add(listener)
      return { dispose: () => this.listeners.delete(listener) }
    }
    fire(data: T): void {
      for (const listener of this.listeners) {
        try {
          listener(data)
        } catch {
          /* a listener must not break the store */
        }
      }
    }
    dispose(): void {
      this.listeners.clear()
    }
  } as unknown as typeof vscode.EventEmitter)

function isRecord(v: unknown): v is MessageBookmark {
  if (!v || typeof v !== "object") return false
  const b = v as MessageBookmark
  return (
    typeof b.connectionId === "string" &&
    typeof b.sessionId === "string" &&
    typeof b.messageId === "string" &&
    typeof b.anchorId === "string" &&
    typeof b.summary === "string" &&
    typeof b.at === "number"
  )
}

/** Trimmed summary, at most 80 characters (code units, same as other host labels). */
export function clipSummary(summary: string): string {
  return summary.trim().slice(0, SUMMARY_MAX)
}

export class MessageBookmarks implements vscode.Disposable {
  private readonly items: MessageBookmark[]
  private readonly emitter = new EventEmitterClass<void>()
  readonly onDidChange: vscode.Event<void> = this.emitter.event

  constructor(private readonly memento?: vscode.Memento) {
    const raw = memento?.get<unknown>(BOOKMARKS_KEY)
    this.items = Array.isArray(raw) ? raw.filter(isRecord) : []
  }

  /** True when the bookmark was stored. Same connection + session + message is a no-op (returns false). */
  add(input: BookmarkInput): boolean {
    const connectionId = input.connectionId
    const sessionId = input.sessionId
    const messageId = input.messageId
    const anchorId = input.anchorId
    if (!connectionId || !sessionId || !messageId || !anchorId) return false
    if (this.items.some((b) => b.connectionId === connectionId && b.sessionId === sessionId && b.messageId === messageId)) return false
    this.items.push({
      connectionId,
      sessionId,
      messageId,
      anchorId,
      summary: clipSummary(input.summary ?? ""),
      at: input.at ?? Date.now(),
    })
    this.persist()
    this.emitter.fire()
    return true
  }

  /** True when a bookmark was removed. */
  remove(connectionId: string, sessionId: string, messageId: string): boolean {
    const i = this.items.findIndex((b) => b.connectionId === connectionId && b.sessionId === sessionId && b.messageId === messageId)
    if (i < 0) return false
    this.items.splice(i, 1)
    this.persist()
    this.emitter.fire()
    return true
  }

  /** Bookmarks for one session, oldest first. */
  listFor(connectionId: string, sessionId: string): MessageBookmark[] {
    return this.items.filter((b) => b.connectionId === connectionId && b.sessionId === sessionId).sort((a, b) => a.at - b.at || a.messageId.localeCompare(b.messageId))
  }

  dispose() {
    this.emitter.dispose()
  }

  private persist() {
    void this.memento?.update(BOOKMARKS_KEY, this.items.map((b) => ({ ...b })))
  }
}
