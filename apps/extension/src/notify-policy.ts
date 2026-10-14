// Pure notification policy. Reads an inspect() snapshot; never writes settings.

export type NotifyLevel = "off" | "windowNotFocused" | "always"
export type NotifyKind = "needsMe" | "finished"

/** Subset of `vscode.workspace.getConfiguration().inspect()`. Default values are not explicit. */
export type SettingInspect<T> = {
  defaultValue?: T
  globalValue?: T
  workspaceValue?: T
  workspaceFolderValue?: T
  globalLanguageValue?: T
  workspaceLanguageValue?: T
  workspaceFolderLanguageValue?: T
}

/** Inspect snapshots for the two new keys plus the legacy boolean. */
export type NotifySettingsInspect = {
  needsMe?: SettingInspect<unknown>
  finished?: SettingInspect<unknown>
  notifyPending?: SettingInspect<unknown>
}

/** Fields the sidebar result card already summarizes. Missing pieces are omitted. */
export type NotifyResult = {
  files?: readonly unknown[]
  durMs?: number
  costUsd?: number
  lastText?: string
}

const LEVELS: readonly NotifyLevel[] = ["off", "windowNotFocused", "always"]
const DEFAULT_LEVEL: NotifyLevel = "windowNotFocused"

/** Most specific scope first, matching VS Code's effective value. */
const SCOPE_KEYS = [
  "workspaceFolderLanguageValue",
  "workspaceLanguageValue",
  "globalLanguageValue",
  "workspaceFolderValue",
  "workspaceValue",
  "globalValue",
] as const

function isNotifyLevel(value: unknown): value is NotifyLevel {
  return typeof value === "string" && (LEVELS as readonly string[]).includes(value)
}

/** The most specific explicit value, or undefined when every scope is unset. Illegal values become the default. */
function explicitLevel(inspect: SettingInspect<unknown> | undefined): NotifyLevel | undefined {
  if (!inspect) return undefined
  for (const key of SCOPE_KEYS) {
    const value = inspect[key]
    if (value === undefined) continue
    return isNotifyLevel(value) ? value : DEFAULT_LEVEL
  }
  return undefined
}

function legacyExplicitlyFalse(inspect: SettingInspect<unknown> | undefined): boolean {
  if (!inspect) return false
  for (const key of SCOPE_KEYS) {
    const value = inspect[key]
    if (value === undefined) continue
    return value === false
  }
  return false
}

/**
 * New key wins when any scope sets it (illegal values use the default).
 * Otherwise an explicit legacy `oco.sessions.notifyPending: false` turns both kinds off.
 * Otherwise the default is `windowNotFocused`.
 */
export function resolveLevel(kind: NotifyKind, settings?: NotifySettingsInspect): NotifyLevel {
  const inspect = kind === "needsMe" ? settings?.needsMe : settings?.finished
  const explicit = explicitLevel(inspect)
  if (explicit !== undefined) return explicit
  if (legacyExplicitlyFalse(settings?.notifyPending)) return "off"
  return DEFAULT_LEVEL
}

export function shouldNotify(level: NotifyLevel, windowFocused: boolean): boolean {
  if (level === "off") return false
  if (level === "always") return true
  return !windowFocused
}

/**
 * Compact run length used by the sidebar result card (`SessionStore.formatDoneSummary`):
 * `5s`, `4m12s`, `1h02m`.
 */
export function formatRunDuration(durMs: number): string {
  const totalSec = Math.max(0, Math.round(durMs / 1000))
  if (totalSec < 60) return `${totalSec}s`
  if (totalSec < 3600) {
    const minutes = Math.floor(totalSec / 60)
    const seconds = totalSec % 60
    return `${minutes}m${String(seconds).padStart(2, "0")}s`
  }
  const hours = Math.floor(totalSec / 3600)
  const minutes = Math.floor((totalSec % 3600) / 60)
  return `${hours}h${String(minutes).padStart(2, "0")}m`
}

function formatCost(costUsd: number): string | undefined {
  if (!(costUsd > 0)) return undefined
  return costUsd < 0.005 ? "<$0.01" : `$${costUsd.toFixed(2)}`
}

/** First line, trimmed, capped at 80 characters — same as the sidebar result line. */
function formatLastText(lastText: string): string | undefined {
  const firstLine = lastText.trim().split(/\r?\n/)[0]?.trim() ?? ""
  if (!firstLine) return undefined
  return firstLine.length > 80 ? `${firstLine.slice(0, 80)}…` : firstLine
}

export function formatFinished(title: string, result?: NotifyResult): string {
  const parts: string[] = []
  if (result?.files && result.files.length > 0) {
    parts.push(result.files.length === 1 ? "1 file" : `${result.files.length} files`)
  }
  if (typeof result?.durMs === "number" && !Number.isNaN(result.durMs)) parts.push(formatRunDuration(result.durMs))
  if (typeof result?.costUsd === "number") {
    const cost = formatCost(result.costUsd)
    if (cost) parts.push(cost)
  }
  if (result?.lastText) {
    const text = formatLastText(result.lastText)
    if (text) parts.push(text)
  }
  return parts.length > 0 ? `"${title}" finished · ${parts.join(" · ")}` : `"${title}" finished`
}

/** Failure toast. The error itself is one line and cut at 120 characters. */
export function formatFailed(title: string, error?: string): string {
  const short = (error ?? "").replace(/\s+/g, " ").trim()
  if (!short) return `"${title}" failed`
  return `"${title}" failed: ${short.length > 120 ? short.slice(0, 120) : short}`
}
