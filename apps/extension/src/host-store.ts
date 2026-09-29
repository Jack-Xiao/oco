// Host-side storage for the official app (pure except for the injected Memento/blob I/O; unit-tested).
//
// P1a-02 rules:
// - One Memento entry per (namespace, name, key): two panels writing different keys can never
//   overwrite each other with a stale whole-table snapshot.
// - Writes are acknowledged only after Memento.update resolves; failures are reported to the page.
// - Writes to the same entry are serialised in arrival order (last received wins).
// - Stale documents cannot write at all: the bridge drops messages from retired generations.
// - Namespaces keep UI preferences, connection/workspace state, drafts and panel-temporary state
//   apart; the virtual server URL is never the only isolation key (connectionId is always included).
// - P0 data (whole-table `oco.store.<name>`) is read as a fallback and never deleted; removals after
//   migration are stored as `null` tombstones so old values cannot reappear.

export type Memento = {
  get<T>(key: string): T | undefined
  update(key: string, value: unknown): PromiseLike<void>
  keys(): readonly string[]
}

export type Scope = "ui" | "connection" | "draft" | "panel"

export type StoreContext = { connectionId: string; panelKey: string }

export const KV_PREFIX = "oco.kv.v2"
const LEGACY_PREFIX = "oco.store."

/** Where an official storage name lives. Unknown names default to the connection scope. */
export function scopeOf(name: string): Scope {
  if (name === "drafts") return "draft"
  // Tabs / layout / window state are per panel: every panel shows exactly one bound session.
  if (/^opencode\.(window|tabs|layout)\b/.test(name) || /\b(tabs|layout)\b/.test(name)) return "panel"
  // Language, theme, general settings are user preferences shared by all panels and connections.
  if (name === "opencode.settings.dat" || name === "opencode.global.dat" || name === "default.dat") return "ui"
  return "connection"
}

/** Name used by the webview localStorage shim (official `persisted()` state on platform "web"). */
export const LOCAL_STORAGE = "localStorage"

// opencode.global.dat keys that are plain UI preferences (no server/project data in them).
const UI_GLOBAL_KEYS = new Set(["language", "language.v1", "command.catalog.v1", "review-panel-v2", "go-upsell", "new-session.provider-tip", "open.app"])
// Bare (no storage prefix) keys that are UI preferences: official settings are written as settings.v3.
const UI_BARE_KEYS = /^(settings|language)(\.v\d+)?$/

/**
 * Scope of one official localStorage key ("<storage>:<key>" or a bare legacy key).
 * - opencode.window.* (tabs, recent/closed tabs, window layout) -> panel: a panel never sees another panel's tabs.
 * - settings and UI-only global keys -> ui.
 * - everything else (server list, projects, models, workspace/session state keyed by the virtual
 *   server URL) -> connection, so two connections sharing the virtual URL cannot mix.
 */
export function scopeOfLocalKey(fullKey: string): Scope {
  const i = fullKey.indexOf(":")
  const storage = i >= 0 ? fullKey.slice(0, i) : ""
  const key = i >= 0 ? fullKey.slice(i + 1) : fullKey
  if (storage.startsWith("opencode.window.")) return "panel"
  if (storage === "opencode.settings.dat") return "ui"
  if (storage === "opencode.global.dat" && UI_GLOBAL_KEYS.has(key)) return "ui"
  if (!storage && (UI_GLOBAL_KEYS.has(key) || UI_BARE_KEYS.test(key))) return "ui"
  return "connection"
}

export class KvStore {
  private readonly chains = new Map<string, Promise<unknown>>()
  stats = { writes: 0, writeErrors: 0, legacyReads: 0 }

  constructor(
    private readonly global: Memento,
    private readonly workspace: Memento,
  ) {}

  private memento(scope: Scope) {
    return scope === "panel" ? this.workspace : this.global
  }

  prefix(scope: Scope, name: string, ctx: StoreContext) {
    const owner = scope === "ui" ? "-" : scope === "panel" ? ctx.panelKey : ctx.connectionId
    return `${KV_PREFIX}/${scope}/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/`
  }

  private serial<T>(entry: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.chains.get(entry) ?? Promise.resolve()
    const next = prev.then(fn, fn)
    const tail = next.catch(() => undefined)
    this.chains.set(entry, tail)
    void tail.then(() => {
      if (this.chains.get(entry) === tail) this.chains.delete(entry)
    })
    return next
  }

  private legacy(name: string, key: string): string | undefined {
    const table = this.global.get<Record<string, string>>(LEGACY_PREFIX + name)
    const v = table?.[key]
    if (v !== undefined) this.stats.legacyReads++
    return v
  }

  /** All localStorage-shim entries visible to this panel (ui + its connection + its panel). */
  snapshot(ctx: StoreContext): [string, string][] {
    const out: [string, string][] = []
    for (const scope of ["ui", "connection", "panel"] as Scope[]) {
      const m = this.memento(scope)
      const pre = this.prefix(scope, LOCAL_STORAGE, ctx)
      for (const k of m.keys()) {
        if (!k.startsWith(pre)) continue
        const full = decodeURIComponent(k.slice(pre.length))
        const v = m.get<string | null>(k)
        if (typeof v === "string" && scopeOfLocalKey(full) === scope) out.push([full, v])
      }
    }
    return out
  }

  async op(ctx: StoreContext, op: string, name: string, key?: string, value?: string) {
    if (op === "snapshot") return name === LOCAL_STORAGE ? { entries: this.snapshot(ctx) } : { error: "snapshot only for localStorage" }
    const scope = name === LOCAL_STORAGE && key !== undefined ? scopeOfLocalKey(key) : scopeOf(name)
    const m = this.memento(scope)
    const pre = this.prefix(scope, name, ctx)
    switch (op) {
      case "get": {
        if (key === undefined) return { value: null }
        const v = m.get<string | null>(pre + encodeURIComponent(key))
        if (v !== undefined) return { value: v } // null = tombstone: removed after migration, no fallback
        // P0 compatibility: panel-scoped state is intentionally not migrated (it caused cross-session tabs).
        return { value: scope === "panel" ? null : (this.legacy(name, key) ?? null) }
      }
      case "set":
      case "remove": {
        if (key === undefined || (op === "set" && value === undefined)) return { error: "missing key/value" }
        const entry = pre + encodeURIComponent(key)
        return this.serial(entry, async () => {
          try {
            await m.update(entry, op === "set" ? value : null)
            this.stats.writes++
            return {}
          } catch (e) {
            this.stats.writeErrors++
            return { error: `storage write failed: ${(e as Error).message}` }
          }
        })
      }
      case "clear": {
        // Include entries whose writes were received but are still queued (not yet in the Memento),
        // so a later clear wins over an earlier set.
        const entries = new Set([...m.keys(), ...this.chains.keys()].filter((k) => k.startsWith(pre)))
        if (scope !== "panel")
          for (const k of Object.keys(this.global.get<Record<string, string>>(LEGACY_PREFIX + name) ?? {})) entries.add(pre + encodeURIComponent(k))
        try {
          await Promise.all([...entries].map((k) => this.serial(k, async () => m.update(k, null))))
          return {}
        } catch (e) {
          this.stats.writeErrors++
          return { error: `storage clear failed: ${(e as Error).message}` }
        }
      }
      case "keys": {
        const own = m
          .keys()
          .filter((k) => k.startsWith(pre) && m.get(k) !== undefined && m.get(k) !== null)
          .map((k) => decodeURIComponent(k.slice(pre.length)))
        if (scope !== "panel") {
          const table = this.global.get<Record<string, string>>(LEGACY_PREFIX + name) ?? {}
          for (const k of Object.keys(table)) if (!own.includes(k) && m.get(pre + encodeURIComponent(k)) === undefined) own.push(k)
        }
        return { keys: own }
      }
    }
    return { error: "unknown op" }
  }
}
