import { describe, expect, mock, test } from "bun:test"

// Mock vscode module for bun test environment
mock.module("vscode", () => ({
  EventEmitter: class {
    private listeners = new Set<() => void>()
    event = (listener: () => void) => {
      this.listeners.add(listener)
      return { dispose: () => this.listeners.delete(listener) }
    }
    fire() {
      for (const listener of this.listeners) listener()
    }
    dispose() {
      this.listeners.clear()
    }
  },
  StatusBarAlignment: { Left: 1, Right: 2 },
  ThemeColor: class {
    constructor(public id: string) {}
  },
  ProgressLocation: {
    SourceControl: 1,
    Window: 10,
    Notification: 15,
  },
  commands: {
    registerCommand: () => ({ dispose: () => {} }),
    executeCommand: () => Promise.resolve(undefined),
  },
  window: {
    createStatusBarItem: () => ({
      name: "",
      text: "",
      tooltip: undefined,
      command: undefined,
      backgroundColor: undefined,
      show() {},
      dispose() {},
    }),
    showWarningMessage: () => Promise.resolve(undefined),
    showInformationMessage: () => Promise.resolve(undefined),
    showErrorMessage: () => Promise.resolve(undefined),
    withProgress: (_options: unknown, task: (progress: unknown, token: unknown) => Promise<unknown>) => task({}, {}),
  },
  workspace: {
    isTrusted: true,
    getConfiguration: () => ({
      get: (_key: string, fallback?: unknown) => fallback,
    }),
  },
  Uri: {
    joinPath: (...parts: any[]) => ({
      fsPath: parts.map(String).join("/"),
      toString: () => parts.map(String).join("/"),
    }),
  },
}))

const vscode = await import("vscode")

const {
  compactGuard,
  pickModelFromMessages,
  registerCompactSession,
  summarizePath,
} = await import("../../apps/extension/src/compact-session")

describe("pickModelFromMessages", () => {
  test("returns undefined for empty array or non-array input", () => {
    expect(pickModelFromMessages([])).toBeUndefined()
    expect(pickModelFromMessages(null as unknown as [])).toBeUndefined()
    expect(pickModelFromMessages(undefined as unknown as [])).toBeUndefined()
  })

  test("returns undefined when no assistant message exists", () => {
    const messages = [
      { info: { role: "user", providerID: "openai", modelID: "gpt-4o" } },
      { info: { role: "system", providerID: "openai", modelID: "gpt-4o" } },
    ]
    expect(pickModelFromMessages(messages)).toBeUndefined()
  })

  test("skips assistant messages with missing or empty providerID / modelID", () => {
    const messages = [
      { info: { role: "assistant", providerID: "p1", modelID: "m1" } },
      { info: { role: "assistant", providerID: "", modelID: "m2" } },
      { info: { role: "assistant", providerID: "p3" } },
      { info: { role: "assistant", modelID: "m4" } },
      { info: { role: "assistant", providerID: "   ", modelID: "m5" } },
      { info: { role: "user", providerID: "p_user", modelID: "m_user" } },
    ]
    expect(pickModelFromMessages(messages)).toEqual({ providerID: "p1", modelID: "m1" })
  })

  test("picks the last assistant message when multiple valid ones exist", () => {
    const messages = [
      { info: { role: "assistant", providerID: "anthropic", modelID: "claude-3-haiku" } },
      { info: { role: "user", providerID: "anthropic", modelID: "claude-3-5-sonnet" } },
      { info: { role: "assistant", providerID: "anthropic", modelID: "claude-3-5-sonnet" } },
    ]
    expect(pickModelFromMessages(messages)).toEqual({
      providerID: "anthropic",
      modelID: "claude-3-5-sonnet",
    })
  })
})

describe("compactGuard", () => {
  test("state 1: returns busy when busy is true", () => {
    expect(compactGuard({ busy: true })).toEqual({ ok: false, reason: "busy" })
    expect(compactGuard({ busy: true, compacting: 1728640000 })).toEqual({ ok: false, reason: "busy" })
  })

  test("state 2: returns compacting when busy is false and compacting is a number", () => {
    expect(compactGuard({ busy: false, compacting: 1728640000 })).toEqual({ ok: false, reason: "compacting" })
    expect(compactGuard({ busy: false, compacting: 0 })).toEqual({ ok: false, reason: "compacting" })
  })

  test("state 3: returns ok when busy is false and compacting is undefined", () => {
    expect(compactGuard({ busy: false })).toEqual({ ok: true })
    expect(compactGuard({ busy: false, compacting: undefined })).toEqual({ ok: true })
  })
})

describe("summarizePath", () => {
  test("encodes sessionID without directory", () => {
    expect(summarizePath("ses-123")).toBe("/session/ses-123/summarize")
    expect(summarizePath("ses/special?123")).toBe("/session/ses%2Fspecial%3F123/summarize")
  })

  test("encodes sessionID and directory when directory is provided", () => {
    expect(summarizePath("ses-123", "/path/to/work")).toBe("/session/ses-123/summarize?directory=%2Fpath%2Fto%2Fwork")
    expect(summarizePath("ses/1", "/a b/c?d=1")).toBe(
      "/session/ses%2F1/summarize?directory=%2Fa%20b%2Fc%3Fd%3D1",
    )
  })

  test("treats empty directory string as no directory", () => {
    expect(summarizePath("ses-123", "")).toBe("/session/ses-123/summarize")
  })
})

describe("registerCompactSession", () => {
  let warningMessages: string[] = []
  let informationMessages: string[] = []
  let errorMessages: string[] = []
  let warningDialogChoice: string | undefined = "Compact"
  let progressCallbackTracker: { ran: boolean; title?: string } = { ran: false }
  const registeredCommands = new Map<string, (arg?: unknown) => Promise<unknown>>()

  function createFixture(overrides: Partial<Parameters<typeof registerCompactSession>[0]> = {}) {
    warningMessages = []
    informationMessages = []
    errorMessages = []
    warningDialogChoice = "Compact"
    progressCallbackTracker = { ran: false }
    registeredCommands.clear()

    // Dynamically patch vscode window and commands objects (which are mutable)
    vscode.commands.registerCommand = ((id: string, handler: (arg?: unknown) => Promise<unknown>) => {
      registeredCommands.set(id, handler)
      return {
        dispose() {
          registeredCommands.delete(id)
        },
      }
    }) as unknown as typeof vscode.commands.registerCommand

    vscode.window.showWarningMessage = ((message: string, ...args: unknown[]) => {
      warningMessages.push(message)
      if (args.length > 0 && typeof args[args.length - 1] === "string") {
        return Promise.resolve(warningDialogChoice)
      }
      return Promise.resolve(undefined)
    }) as unknown as typeof vscode.window.showWarningMessage

    vscode.window.showInformationMessage = ((message: string) => {
      informationMessages.push(message)
      return Promise.resolve(undefined)
    }) as unknown as typeof vscode.window.showInformationMessage

    vscode.window.showErrorMessage = ((message: string) => {
      errorMessages.push(message)
      return Promise.resolve(undefined)
    }) as unknown as typeof vscode.window.showErrorMessage

    vscode.window.withProgress = ((
      options: { location: number; title?: string },
      task: (progress: unknown, token: unknown) => Promise<unknown>,
    ) => {
      progressCallbackTracker = { ran: true, title: options.title }
      return task({}, {})
    }) as unknown as typeof vscode.window.withProgress

    const requests: Array<{ method: string; path: string; body?: unknown; directory?: string }> = []
    const onDoneCalls: string[] = []

    const deps: Parameters<typeof registerCompactSession>[0] = {
      request: mock(async <T>(method: string, path: string, body?: unknown, directory?: string): Promise<T> => {
        requests.push({ method, path, body, directory })
        if (method === "GET" && path.includes("/message")) {
          return [
            { info: { role: "assistant", providerID: "anthropic", modelID: "claude-sonnet" } },
          ] as unknown as T
        }
        if (method === "GET" && path.includes("/session/")) {
          return {
            id: "s1",
            title: "My Session",
            directory: "/workspace",
            time: {},
          } as unknown as T
        }
        if (method === "POST" && path.includes("/summarize")) {
          return true as unknown as T
        }
        return {} as unknown as T
      }),
      lastModel: mock(() => ({ providerID: "openai", modelID: "gpt-4o" })),
      isBusy: mock(() => false),
      rowItem: mock(() => undefined),
      pickSession: mock(async () => ({ id: "s1", directory: "/workspace", title: "My Session" })),
      requireTrust: mock(() => true),
      onDone: mock((id: string) => {
        onDoneCalls.push(id)
      }),
      ...overrides,
    }

    const disposable = registerCompactSession(deps)
    const handler = registeredCommands.get("oco.compactSession")!

    return { deps, disposable, handler, requests, onDoneCalls }
  }

  test("registers command oco.compactSession and returns disposable", () => {
    const { disposable } = createFixture()
    expect(registeredCommands.has("oco.compactSession")).toBe(true)
    disposable.dispose()
    expect(registeredCommands.has("oco.compactSession")).toBe(false)
  })

  test("stops if requireTrust returns false", async () => {
    const { handler, deps, requests } = createFixture({
      requireTrust: mock(() => false),
    })
    await handler()
    expect(deps.requireTrust).toHaveBeenCalledWith("compact a session")
    expect(deps.pickSession).not.toHaveBeenCalled()
    expect(requests.length).toBe(0)
  })

  test("stops if pickSession returns undefined", async () => {
    const { handler, requests } = createFixture({
      pickSession: mock(async () => undefined),
    })
    await handler()
    expect(requests.length).toBe(0)
  })

  test("stops and warns if session is busy", async () => {
    const { handler, requests } = createFixture({
      isBusy: mock(() => true),
    })
    await handler()
    expect(warningMessages.some((m) => m.includes("Session is running"))).toBe(true)
    expect(requests.length).toBe(0)
  })

  test("stops and warns if session is already compacting on server", async () => {
    const { handler, requests } = createFixture({
      request: mock(async <T>(method: string, path: string): Promise<T> => {
        if (method === "GET") {
          return {
            id: "s1",
            directory: "/workspace",
            time: { compacting: 1728640000 },
          } as unknown as T
        }
        return true as unknown as T
      }),
    })
    await handler()
    expect(warningMessages.some((m) => m.includes("already compacting"))).toBe(true)
    expect(requests.some((r) => r.method === "POST")).toBe(false)
  })

  test("uses lastModel when present without calling GET /message", async () => {
    const { handler, requests, onDoneCalls } = createFixture({
      lastModel: mock(() => ({ providerID: "google", modelID: "gemini-pro" })),
    })
    await handler()
    expect(requests.some((r) => r.path.includes("/message"))).toBe(false)
    const postReq = requests.find((r) => r.method === "POST" && r.path.includes("/summarize"))
    expect(postReq).toBeDefined()
    expect(postReq?.body).toEqual({ providerID: "google", modelID: "gemini-pro" })
    expect(onDoneCalls).toEqual(["s1"])
    expect(informationMessages.some((m) => m.includes("Compacted session"))).toBe(true)
  })

  test("falls back to GET /message when lastModel is undefined", async () => {
    const { handler, requests, onDoneCalls } = createFixture({
      lastModel: mock(() => undefined),
    })
    await handler()
    expect(requests.some((r) => r.path.includes("/message"))).toBe(true)
    const postReq = requests.find((r) => r.method === "POST" && r.path.includes("/summarize"))
    expect(postReq?.body).toEqual({ providerID: "anthropic", modelID: "claude-sonnet" })
    expect(onDoneCalls).toEqual(["s1"])
  })

  test("warns and stops if no model can be determined", async () => {
    const { handler, requests } = createFixture({
      lastModel: mock(() => undefined),
      request: mock(async <T>(method: string, path: string): Promise<T> => {
        if (method === "GET" && path.includes("/message")) {
          return [] as unknown as T
        }
        if (method === "GET") {
          return { id: "s1", directory: "/workspace" } as unknown as T
        }
        return true as unknown as T
      }),
    })
    await handler()
    expect(warningMessages.some((m) => m.includes("cannot determine model"))).toBe(true)
    expect(requests.some((r) => r.method === "POST")).toBe(false)
  })

  test("aborts if user declines confirmation dialog", async () => {
    const { handler, requests, onDoneCalls } = createFixture()
    warningDialogChoice = undefined // user dismissed dialog
    await handler()
    expect(progressCallbackTracker.ran).toBe(false)
    expect(requests.some((r) => r.method === "POST")).toBe(false)
    expect(onDoneCalls.length).toBe(0)
  })

  test("catches error during summarize and shows error message", async () => {
    const { handler, onDoneCalls } = createFixture({
      request: mock(async <T>(method: string, path: string): Promise<T> => {
        if (method === "GET") {
          return { id: "s1", directory: "/workspace" } as unknown as T
        }
        if (method === "POST") {
          throw new Error("Server summarization failed: HTTP 500")
        }
        return true as unknown as T
      }),
    })
    await handler()
    expect(errorMessages.some((m) => m.includes("Could not compact session (Server summarization failed: HTTP 500)"))).toBe(true)
    expect(onDoneCalls.length).toBe(0)
  })

  test("uses rowItem when provided from context menu argument", async () => {
    const { handler, deps, requests } = createFixture({
      rowItem: mock((arg: unknown) => {
        if (arg === "from-menu") return { id: "s-menu", directory: "/menu-dir", title: "Menu Session" }
        return undefined
      }),
    })
    await handler("from-menu")
    expect(deps.pickSession).not.toHaveBeenCalled()
    expect(requests.some((r) => r.directory === "/menu-dir")).toBe(true)
  })
})
