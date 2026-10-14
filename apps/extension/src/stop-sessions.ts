import * as vscode from "vscode"

export type StopSessionItem = {
  id: string
  parentID?: string
  status?: "idle" | "busy" | "retry" | string
  directory?: string
  title?: string
}

export type StopPlan = {
  /** Targets that are running themselves. */
  stop: StopSessionItem[]
  /** Running descendants (subagents) of any target, not already in `stop`. */
  cascade: StopSessionItem[]
  /** Targets with nothing running: neither themselves nor any descendant. */
  skipped: StopSessionItem[]
  /** Targets that are running themselves or through a descendant: what the sidebar shows as running. */
  targets: StopSessionItem[]
}

export type StopSessionsDeps = {
  request: <T = unknown>(method: string, path: string, body?: unknown, directory?: string) => Promise<T>
  sessions: () => StopSessionItem[]
  confirm: (message: string, detail?: string) => Promise<boolean>
  info: (message: string) => void
  warn: (message: string) => void
  /** Restricted Mode gate; false cancels before anything is sent. */
  requireTrust?: (what: string) => boolean
}

export type StopFailure = {
  id: string
  title: string
  error: string
}

export type StopSessionsResult = {
  stopped: string[]
  failed: StopFailure[]
  cancelled: boolean
}

export function isSessionRunning(status?: string): boolean {
  if (!status) return false
  const s = status.trim().toLowerCase()
  return s === "busy" || s === "retry"
}

export function parseSessionIds(arg: unknown): string[] {
  if (typeof arg === "string" && arg.trim() !== "") {
    return [arg.trim()]
  }
  if (arg && typeof arg === "object") {
    const obj = arg as Record<string, unknown>
    if (Array.isArray(obj.selection)) {
      const ids = obj.selection.filter((x): x is string => typeof x === "string" && x.trim() !== "")
      if (ids.length > 0) return ids
    }
    if (typeof obj.sessionId === "string" && obj.sessionId.trim() !== "") {
      return [obj.sessionId.trim()]
    }
    if (typeof obj.id === "string" && obj.id.trim() !== "") {
      return [obj.id.trim()]
    }
  }
  return []
}

/**
 * Plans which sessions to stop.
 * A sidebar row is "running" when the session or any descendant is busy, so an idle parent whose
 * subagent is busy is still a target: its running descendants (any depth) go to `cascade`.
 * Targets with nothing running at all are `skipped`.
 */
export function planStop(targetIds: Iterable<string>, sessions: StopSessionItem[]): StopPlan {
  const sessionMap = new Map<string, StopSessionItem>()
  const parentToChildren = new Map<string, StopSessionItem[]>()

  for (const s of sessions) {
    sessionMap.set(s.id, s)
    if (s.parentID) {
      const list = parentToChildren.get(s.parentID)
      if (list) {
        list.push(s)
      } else {
        parentToChildren.set(s.parentID, [s])
      }
    }
  }

  const stop: StopSessionItem[] = []
  const found: StopSessionItem[] = []
  const missing: StopSessionItem[] = []
  const stopIds = new Set<string>()
  const seenTargetIds = new Set<string>()

  for (const rawId of targetIds) {
    const id = String(rawId)
    if (seenTargetIds.has(id)) continue
    seenTargetIds.add(id)

    const session = sessionMap.get(id)
    if (!session) {
      missing.push({ id, status: "idle" })
      continue
    }
    found.push(session)
    if (isSessionRunning(session.status)) {
      stop.push(session)
      stopIds.add(session.id)
    }
  }

  const cascade: StopSessionItem[] = []
  const cascadeIds = new Set<string>()
  const visited = new Set<string>()

  function traverse(parentId: string) {
    const children = parentToChildren.get(parentId) || []
    for (const child of children) {
      if (visited.has(child.id)) continue
      visited.add(child.id)

      if (isSessionRunning(child.status)) {
        if (!stopIds.has(child.id) && !cascadeIds.has(child.id)) {
          cascade.push(child)
          cascadeIds.add(child.id)
        }
      }
      traverse(child.id)
    }
  }

  const targets: StopSessionItem[] = []
  const skipped: StopSessionItem[] = []
  for (const s of found) {
    traverse(s.id)
    if (stopIds.has(s.id) || hasRunningDescendant(s.id, new Set())) targets.push(s)
    else skipped.push(s)
  }

  function hasRunningDescendant(id: string, seen: Set<string>): boolean {
    for (const child of parentToChildren.get(id) || []) {
      if (seen.has(child.id)) continue
      seen.add(child.id)
      if (isSessionRunning(child.status) || hasRunningDescendant(child.id, seen)) return true
    }
    return false
  }

  return { stop, cascade, skipped: [...skipped, ...missing], targets }
}

/**
 * Stops the planned sessions by sending an abort POST to the server.
 */
export async function stopSessions(
  ids: Iterable<string>,
  deps: StopSessionsDeps,
  options?: { all?: boolean },
): Promise<StopSessionsResult> {
  if (deps.requireTrust && !deps.requireTrust("stop sessions")) return { stopped: [], failed: [], cancelled: true }
  const allSessions = deps.sessions()
  const plan = planStop(ids, allSessions)

  if (plan.stop.length === 0 && plan.cascade.length === 0) {
    deps.info("No running sessions to stop.")
    return { stopped: [], failed: [], cancelled: false }
  }

  const n = plan.targets.length
  const m = plan.cascade.length

  if (options?.all) {
    const message = `Stop all ${n} running sessions?`
    const detail = m > 0 ? `${m} running subagents will stop too.` : undefined
    const confirmed = await deps.confirm(message, detail)
    if (!confirmed) {
      return { stopped: [], failed: [], cancelled: true }
    }
  } else if (m > 0) {
    const title = plan.targets[0].title?.trim() || plan.targets[0].id
    const message = n === 1 ? `Stop "${title}"?` : `Stop ${n} sessions?`
    const detail = n === 1 ? `Its ${m} running subagent(s) will stop too.` : `${m} running subagent(s) will stop too.`
    const confirmed = await deps.confirm(message, detail)
    if (!confirmed) {
      return { stopped: [], failed: [], cancelled: true }
    }
  }

  const targetsToStop = [...plan.stop, ...plan.cascade]
  const stopped: string[] = []
  const failed: StopFailure[] = []

  const results = await Promise.allSettled(
    targetsToStop.map(async (s) => {
      const path = `/session/${encodeURIComponent(s.id)}/abort`
      await deps.request("POST", path, undefined, s.directory)
      return s.id
    }),
  )

  for (let i = 0; i < results.length; i++) {
    const res = results[i]
    const s = targetsToStop[i]
    if (res.status === "fulfilled") {
      stopped.push(res.value)
    } else {
      const errMsg = res.reason instanceof Error ? res.reason.message : String(res.reason)
      failed.push({
        id: s.id,
        title: s.title?.trim() || s.id,
        error: errMsg,
      })
    }
  }

  if (failed.length > 0) {
    const details = failed.map((f) => `"${f.title}": ${f.error}`).join("; ")
    deps.warn(`oco: Failed to stop ${failed.length} session(s): ${details}`)
  }

  return { stopped, failed, cancelled: false }
}

/** Sessions whose parent is not loaded: the sidebar's top-level rows. Stop-all targets these and cascades. */
export function rootIds(sessions: StopSessionItem[]): string[] {
  const ids = new Set(sessions.map((s) => s.id))
  return sessions.filter((s) => !s.parentID || !ids.has(s.parentID)).map((s) => s.id)
}

/**
 * Registers `oco.sessions.stop` and `oco.sessions.stopAllRunning` commands.
 */
export function registerStopSessions(deps: StopSessionsDeps): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand("oco.sessions.stop", async (arg?: unknown) => {
      const ids = parseSessionIds(arg)
      return stopSessions(ids, deps)
    }),
    vscode.commands.registerCommand("oco.sessions.stopAllRunning", async () => stopSessions(rootIds(deps.sessions()), deps, { all: true })),
  ]
}
