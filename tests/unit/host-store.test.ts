// KvStore: per-key memento writes, scope isolation, and read-only P0 fallback.
import { describe, expect, test } from "bun:test"
import { KvStore, scopeOf, type Memento, type Scope, type StoreContext } from "../../apps/extension/src/host-store"

/**
 * In-memory Memento.
 * Assumption about VS Code, not something this fake observed in the editor: update() applies the
 * value to memory before the returned promise settles, and a rejection does not roll that write back.
 */
class FakeMemento implements Memento {
  private readonly values = new Map<string, unknown>()
  private pendingError: Error | undefined

  constructor(initial: Record<string, unknown> = {}) {
    for (const [key, value] of Object.entries(initial)) this.values.set(key, value)
  }

  /** The next update() rejects with this error after the memory write. Later updates succeed. */
  failNext(error: Error) {
    this.pendingError = error
  }

  get<T>(key: string): T | undefined {
    return this.values.has(key) ? (this.values.get(key) as T) : undefined
  }

  update(key: string, value: unknown): Promise<void> {
    if (value === undefined) this.values.delete(key)
    else this.values.set(key, value)
    const error = this.pendingError
    this.pendingError = undefined
    return new Promise((resolve, reject) => {
      setTimeout(() => (error ? reject(error) : resolve()), 0)
    })
  }

  keys(): readonly string[] {
    return [...this.values.keys()]
  }
}

const ctxA: StoreContext = { connectionId: "c1", panelKey: "p1" }
const ctxB: StoreContext = { connectionId: "c1", panelKey: "p2" }

function pair(initial?: Record<string, unknown>) {
  const globalM = new FakeMemento(initial)
  const workspaceM = new FakeMemento()
  return { globalM, workspaceM, store: new KvStore(globalM, workspaceM) }
}

function entry(store: KvStore, scope: Scope, name: string, ctx: StoreContext, key: string) {
  return store.prefix(scope, name, ctx) + encodeURIComponent(key)
}

async function drainMicrotasks() {
  for (let i = 0; i < 20; i++) await Promise.resolve()
}

describe("KvStore concurrency", () => {
  test("two pages writing different keys from the same snapshot both keep their values", async () => {
    const { store } = pair()
    // drafts are connection-scoped, so these two panels share one map. A whole-table snapshot would clobber one key.
    expect(await store.op(ctxA, "set", "drafts", "base", "old")).toEqual({})

    expect(await store.op(ctxA, "get", "drafts", "base")).toEqual({ value: "old" })
    expect(await store.op(ctxB, "get", "drafts", "base")).toEqual({ value: "old" })
    expect(await store.op(ctxA, "get", "drafts", "k1")).toEqual({ value: null })
    expect(await store.op(ctxB, "get", "drafts", "k2")).toEqual({ value: null })

    const w1 = store.op(ctxA, "set", "drafts", "k1", "v1")
    const w2 = store.op(ctxB, "set", "drafts", "k2", "v2")
    expect(await Promise.all([w1, w2])).toEqual([{}, {}])

    expect(await store.op(ctxA, "get", "drafts", "base")).toEqual({ value: "old" })
    expect(await store.op(ctxA, "get", "drafts", "k1")).toEqual({ value: "v1" })
    expect(await store.op(ctxB, "get", "drafts", "k2")).toEqual({ value: "v2" })
    expect(await store.op(ctxA, "get", "drafts", "k2")).toEqual({ value: "v2" })
    expect(await store.op(ctxB, "get", "drafts", "k1")).toEqual({ value: "v1" })
  })

  test("concurrent sets of one key resolve in call order without error", async () => {
    const { store } = pair()
    const first = store.op(ctxA, "set", "drafts", "k", "1")
    const second = store.op(ctxB, "set", "drafts", "k", "2")
    const [r1, r2] = await Promise.all([first, second])
    expect(r1).toEqual({})
    expect(r2).toEqual({})
    expect(r1).not.toHaveProperty("error")
    expect(r2).not.toHaveProperty("error")
    expect(await store.op(ctxA, "get", "drafts", "k")).toEqual({ value: "2" })
    expect(await store.op(ctxB, "get", "drafts", "k")).toEqual({ value: "2" })
    expect(store.stats.writes).toBe(2)
    expect(store.stats.writeErrors).toBe(0)
  })

  test("a rejected memento update is reported as an error and is not acknowledged early", async () => {
    const { globalM, store } = pair()
    const key = entry(store, "connection", "notes", ctxA, "k")
    globalM.failNext(new Error("disk full"))

    let settled = false
    const pending = store.op(ctxA, "set", "notes", "k", "v")
    void pending.then(
      () => {
        settled = true
      },
      () => {
        settled = true
      },
    )
    await drainMicrotasks()
    // The memory write has already happened; the caller must still be waiting on update().
    expect(globalM.get(key)).toBe("v")
    expect(settled).toBe(false)
    expect(store.stats.writes).toBe(0)
    expect(store.stats.writeErrors).toBe(0)

    expect(await pending).toEqual({ error: "storage write failed: disk full" })
    expect(settled).toBe(true)
    expect(store.stats.writeErrors).toBe(1)
    expect(store.stats.writes).toBe(0)
    // The rejected update is assumed to leave the value in place (see FakeMemento).
    expect(await store.op(ctxA, "get", "notes", "k")).toEqual({ value: "v" })

    expect(await store.op(ctxA, "set", "notes", "k", "v2")).toEqual({})
    expect(store.stats.writes).toBe(1)
    expect(store.stats.writeErrors).toBe(1)
    expect(await store.op(ctxA, "get", "notes", "k")).toEqual({ value: "v2" })
  })
})

describe("KvStore scopes", () => {
  test("scopeOf classifies names and writes land in the matching memento", async () => {
    expect(scopeOf("drafts")).toBe("draft")
    expect(scopeOf("opencode.settings.dat")).toBe("ui")
    expect(scopeOf("opencode.tabs")).toBe("panel")
    expect(scopeOf("editor.layout")).toBe("panel")
    expect(scopeOf("opencode.window")).toBe("panel")
    expect(scopeOf("session.meta")).toBe("connection")

    const { globalM, workspaceM, store } = pair()
    expect(await store.op(ctxA, "set", "drafts", "k", "d")).toEqual({})
    expect(await store.op(ctxA, "set", "opencode.settings.dat", "k", "u")).toEqual({})
    expect(await store.op(ctxA, "set", "session.meta", "k", "c")).toEqual({})
    expect(await store.op(ctxA, "set", "opencode.tabs", "k", "p")).toEqual({})
    expect(await store.op(ctxA, "set", "editor.layout", "k", "l")).toEqual({})

    expect(globalM.get(entry(store, "draft", "drafts", ctxA, "k"))).toBe("d")
    expect(globalM.get(entry(store, "ui", "opencode.settings.dat", ctxA, "k"))).toBe("u")
    expect(globalM.get(entry(store, "connection", "session.meta", ctxA, "k"))).toBe("c")
    expect(workspaceM.get(entry(store, "panel", "opencode.tabs", ctxA, "k"))).toBe("p")
    expect(workspaceM.get(entry(store, "panel", "editor.layout", ctxA, "k"))).toBe("l")

    expect(globalM.get(entry(store, "panel", "opencode.tabs", ctxA, "k"))).toBeUndefined()
    expect(workspaceM.get(entry(store, "draft", "drafts", ctxA, "k"))).toBeUndefined()
    expect(workspaceM.get(entry(store, "ui", "opencode.settings.dat", ctxA, "k"))).toBeUndefined()
    expect(workspaceM.get(entry(store, "connection", "session.meta", ctxA, "k"))).toBeUndefined()
  })

  test("connection and draft values are isolated by connectionId; panel values by panelKey", async () => {
    const { store } = pair()
    const otherConn: StoreContext = { connectionId: "c2", panelKey: "p1" }

    expect(await store.op(ctxA, "set", "session.meta", "k", "from-c1")).toEqual({})
    expect(await store.op(otherConn, "set", "session.meta", "k", "from-c2")).toEqual({})
    expect(await store.op(ctxA, "get", "session.meta", "k")).toEqual({ value: "from-c1" })
    expect(await store.op(otherConn, "get", "session.meta", "k")).toEqual({ value: "from-c2" })

    expect(await store.op(ctxA, "set", "drafts", "k", "draft-c1")).toEqual({})
    expect(await store.op(otherConn, "set", "drafts", "k", "draft-c2")).toEqual({})
    expect(await store.op(ctxA, "get", "drafts", "k")).toEqual({ value: "draft-c1" })
    expect(await store.op(otherConn, "get", "drafts", "k")).toEqual({ value: "draft-c2" })

    expect(await store.op(ctxA, "set", "opencode.tabs", "k", "panel-1")).toEqual({})
    expect(await store.op(ctxB, "set", "opencode.tabs", "k", "panel-2")).toEqual({})
    expect(await store.op(ctxA, "get", "opencode.tabs", "k")).toEqual({ value: "panel-1" })
    expect(await store.op(ctxB, "get", "opencode.tabs", "k")).toEqual({ value: "panel-2" })
    expect(await store.op(ctxA, "set", "editor.layout", "k", "layout-1")).toEqual({})
    expect(await store.op(ctxB, "get", "editor.layout", "k")).toEqual({ value: null })
  })
})

describe("KvStore P0 compatibility", () => {
  test("legacy draft rows are readable, then shadowed by a tombstone, without rewriting the old table", async () => {
    const legacy = { k1: "old" }
    const { globalM, store } = pair({ "oco.store.drafts": legacy })

    expect(await store.op(ctxA, "get", "drafts", "k1")).toEqual({ value: "old" })
    expect(store.stats.legacyReads).toBe(1)
    expect(await store.op(ctxA, "keys", "drafts")).toEqual({ keys: ["k1"] })

    expect(await store.op(ctxA, "set", "drafts", "k1", "new")).toEqual({})
    expect(await store.op(ctxA, "get", "drafts", "k1")).toEqual({ value: "new" })
    expect(store.stats.legacyReads).toBe(1)
    expect(await store.op(ctxA, "keys", "drafts")).toEqual({ keys: ["k1"] })

    expect(await store.op(ctxA, "remove", "drafts", "k1")).toEqual({})
    expect(globalM.get(entry(store, "draft", "drafts", ctxA, "k1"))).toBeNull()
    expect(await store.op(ctxA, "get", "drafts", "k1")).toEqual({ value: null })
    expect(await store.op(ctxA, "get", "drafts", "k1")).toEqual({ value: null })
    expect(store.stats.legacyReads).toBe(1)

    expect(globalM.get("oco.store.drafts")).toBe(legacy)
    expect(legacy).toEqual({ k1: "old" })
    expect(globalM.keys()).toContain("oco.store.drafts")
  })

  test("panel scope does not fall back to a legacy table", async () => {
    const legacy = { k1: "old" }
    const { globalM, workspaceM, store } = pair({ "oco.store.opencode.tabs": legacy })
    expect(await store.op(ctxA, "get", "opencode.tabs", "k1")).toEqual({ value: null })
    expect(store.stats.legacyReads).toBe(0)
    expect(await store.op(ctxA, "keys", "opencode.tabs")).toEqual({ keys: [] })
    expect(await store.op(ctxA, "get", "editor.layout", "k1")).toEqual({ value: null })
    expect(globalM.get("oco.store.opencode.tabs")).toBe(legacy)
    expect(legacy).toEqual({ k1: "old" })
    expect(workspaceM.keys()).toEqual([])
  })

  test("clear tombstones a key whose set was already received, including one not yet in the memento", async () => {
    const { store } = pair()
    expect(await store.op(ctxA, "set", "drafts", "existing", "old")).toEqual({})

    // Arrival order is rewrite, create, clear. Clear is last and must win both keys.
    const rewrite = store.op(ctxA, "set", "drafts", "existing", "new")
    const create = store.op(ctxA, "set", "drafts", "fresh", "v")
    const cleared = store.op(ctxA, "clear", "drafts")
    await Promise.all([rewrite, create, cleared])

    expect(await store.op(ctxA, "get", "drafts", "existing")).toEqual({ value: null })
    expect(await store.op(ctxA, "get", "drafts", "fresh")).toEqual({ value: null })
  })

  test("clear returns null for every key of that name, including keys that exist only in the legacy table", async () => {
    const legacy = { k1: "old", k2: "older" }
    const { globalM, store } = pair({ "oco.store.drafts": legacy })
    expect(await store.op(ctxA, "set", "drafts", "k3", "fresh")).toEqual({})
    expect(await store.op(ctxA, "clear", "drafts")).toEqual({})

    for (const key of ["k1", "k2", "k3"]) {
      expect(await store.op(ctxA, "get", "drafts", key)).toEqual({ value: null })
      expect(globalM.get(entry(store, "draft", "drafts", ctxA, key))).toBeNull()
    }
    expect(store.stats.legacyReads).toBe(0)
    expect(globalM.get("oco.store.drafts")).toBe(legacy)
    expect(legacy).toEqual({ k1: "old", k2: "older" })
    expect(globalM.keys()).toContain("oco.store.drafts")
  })
})
