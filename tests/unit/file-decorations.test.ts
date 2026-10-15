import { describe, expect, mock, test } from "bun:test"
import * as path from "node:path"

let fireEvents: any[] = []

mock.module("vscode", () => ({
  ThemeColor: class {
    constructor(readonly id: string) {}
  },
  Uri: {
    file: (p: string) => ({ scheme: "file", fsPath: p, path: p }),
    parse: (s: string) => {
      const scheme = s.split(":")[0]
      return { scheme, fsPath: s.slice(scheme.length + 1), path: s }
    },
  },
  EventEmitter: class {
    private listeners = new Set<(arg?: any) => void>()
    event = (listener: (arg?: any) => void) => {
      this.listeners.add(listener)
      return { dispose: () => this.listeners.delete(listener) }
    }
    fire(arg?: any) {
      fireEvents.push(arg)
      for (const l of this.listeners) l(arg)
    }
    dispose() {
      this.listeners.clear()
    }
  },
  workspace: {
    getConfiguration: () => ({
      get: (_key: string, def: any) => def,
    }),
    onDidChangeConfiguration: () => ({ dispose: () => {} }),
  },
  window: {
    registerFileDecorationProvider: () => ({ dispose: () => {} }),
  },
}))

const { OcoFileDecorationProvider } = await import("../../apps/extension/src/file-decorations")

describe("file-decorations", () => {
  test("computes decoration set from open panel session summary diffs", () => {
    fireEvents = []
    const rows = new Map<string, any>()
    rows.set("s1", {
      session: { id: "s1", directory: "/workspace", title: "Refactor session" },
      files: [{ file: "src/index.ts", additions: 5, deletions: 2 }],
    })

    const panels = [
      {
        binding: { sessionId: "s1", directory: "/workspace", draft: false },
        panel: { title: "Refactor session" },
      },
    ]

    const provider = new OcoFileDecorationProvider({
      store: { changedFiles: (id: string) => { const r = rows.get(id); return r && !r.session?.time?.archived ? r.files : undefined } } as any,
      panels: { list: () => panels as any },
      isConfigEnabled: () => true,
    })

    // Modified file
    const targetUri = { scheme: "file", fsPath: path.resolve("/workspace", "src/index.ts") } as any
    const dec = provider.provideFileDecoration(targetUri, {} as any)
    expect(dec).toBeDefined()
    expect(dec?.badge).toBe("O")
    expect(dec?.tooltip).toBe("Changed by oco session: Refactor session")
    expect((dec?.color as any)?.id).toBe("gitDecoration.modifiedResourceForeground")

    // Unmodified file
    const otherUri = { scheme: "file", fsPath: path.resolve("/workspace", "src/other.ts") } as any
    expect(provider.provideFileDecoration(otherUri, {} as any)).toBeUndefined()

    // Non-file scheme
    const httpUri = { scheme: "http", fsPath: "/workspace/src/index.ts" } as any
    expect(provider.provideFileDecoration(httpUri, {} as any)).toBeUndefined()
  })

  test("clears decorations when panel closes, session is archived, or deleted", () => {
    fireEvents = []
    const rows = new Map<string, any>()
    rows.set("s1", {
      session: { id: "s1", directory: "/workspace", title: "Session 1" },
      files: [{ file: "src/index.ts", additions: 1, deletions: 0 }],
    })

    let panels = [
      {
        binding: { sessionId: "s1", directory: "/workspace", draft: false },
        panel: { title: "Session 1" },
      },
    ]

    const provider = new OcoFileDecorationProvider({
      store: { changedFiles: (id: string) => { const r = rows.get(id); return r && !r.session?.time?.archived ? r.files : undefined } } as any,
      panels: { list: () => panels as any },
      isConfigEnabled: () => true,
    })
    provider.onDidChangeFileDecorations((e) => fireEvents.push(e))

    const targetUri = { scheme: "file", fsPath: path.resolve("/workspace", "src/index.ts") } as any
    expect(provider.provideFileDecoration(targetUri, {} as any)).toBeDefined()

    // 1. Panel closed
    panels = []
    provider.refresh()
    expect(provider.provideFileDecoration(targetUri, {} as any)).toBeUndefined()
    expect(fireEvents.length).toBeGreaterThan(0)

    // Reopen panel
    panels = [
      {
        binding: { sessionId: "s1", directory: "/workspace", draft: false },
        panel: { title: "Session 1" },
      },
    ]
    provider.refresh()
    expect(provider.provideFileDecoration(targetUri, {} as any)).toBeDefined()

    // 2. Session archived
    rows.get("s1").session.time = { archived: Date.now() }
    provider.refresh()
    expect(provider.provideFileDecoration(targetUri, {} as any)).toBeUndefined()

    // Unarchive and delete
    delete rows.get("s1").session.time.archived
    provider.refresh()
    expect(provider.provideFileDecoration(targetUri, {} as any)).toBeDefined()

    // 3. Session deleted from store
    rows.delete("s1")
    provider.refresh()
    expect(provider.provideFileDecoration(targetUri, {} as any)).toBeUndefined()
  })

  test("returns undefined when configuration disabled", () => {
    const rows = new Map<string, any>()
    rows.set("s1", {
      session: { id: "s1", directory: "/workspace", title: "Session 1" },
      files: [{ file: "src/index.ts" }],
    })

    const panels = [
      {
        binding: { sessionId: "s1", directory: "/workspace", draft: false },
        panel: { title: "Session 1" },
      },
    ]

    let enabled = false
    const provider = new OcoFileDecorationProvider({
      store: { changedFiles: (id: string) => { const r = rows.get(id); return r && !r.session?.time?.archived ? r.files : undefined } } as any,
      panels: { list: () => panels as any },
      isConfigEnabled: () => enabled,
    })

    const targetUri = { scheme: "file", fsPath: path.resolve("/workspace", "src/index.ts") } as any
    expect(provider.provideFileDecoration(targetUri, {} as any)).toBeUndefined()

    enabled = true
    provider.refresh()
    expect(provider.provideFileDecoration(targetUri, {} as any)).toBeDefined()

    enabled = false
    provider.refresh()
    expect(provider.provideFileDecoration(targetUri, {} as any)).toBeUndefined()
  })
})
