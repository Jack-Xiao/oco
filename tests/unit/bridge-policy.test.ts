// BridgePolicy: directory is forced to the panel binding; writes must target that session or a verified child.
import { describe, expect, test } from "bun:test"
import { BridgePolicy, type Lookup, type PolicyBinding } from "../../apps/extension/src/bridge-policy"

const BINDING = { directory: "/w", sessionId: "ses_A" }

function harness(opts?: {
  trusted?: boolean
  sessionParent?: Lookup["sessionParent"]
  permissionSession?: Lookup["permissionSession"]
  questionSession?: Lookup["questionSession"]
}) {
  const calls = { parents: [] as string[], permissions: [] as string[], questions: [] as string[] }
  const lookup: Lookup = {
    async sessionParent(id) {
      calls.parents.push(id)
      return opts?.sessionParent ? opts.sessionParent(id) : { exists: false }
    },
    async permissionSession(id) {
      calls.permissions.push(id)
      return opts?.permissionSession ? opts.permissionSession(id) : undefined
    },
    async questionSession(id) {
      calls.questions.push(id)
      return opts?.questionSession ? opts.questionSession(id) : undefined
    },
  }
  const policy = new BridgePolicy(BINDING, lookup, () => opts?.trusted ?? true)
  return { policy, calls }
}

const search = (q = "") => new URLSearchParams(q)

/** sN → s(N-1) → … → s1 → ses_A, every record in /w. Eight hops are inside the cap; nine are not. */
async function chainParent(id: string) {
  if (id === "s1") return { exists: true, parentID: "ses_A", directory: "/w" }
  const m = /^s(\d+)$/.exec(id)
  if (!m) return { exists: false }
  return { exists: true, parentID: `s${Number(m[1]) - 1}`, directory: "/w" }
}

describe("BridgePolicy.decide", () => {
  test("GET allows an ordinary path and strips a directory query that repeats the binding", async () => {
    const { policy } = harness()
    expect(await policy.decide("GET", "/health", search())).toEqual({ ok: true, path: "/health", directory: "/w" })
    // Reads are not session-scoped: an unbound session id is still readable.
    expect(await policy.decide("GET", "/session/ses_B/message", search("directory=/w"))).toEqual({
      ok: true,
      path: "/session/ses_B/message",
      directory: "/w",
    })
    expect(await policy.decide("GET", "/event", search("keep=1&directory=/w&also=2"))).toEqual({
      ok: true,
      path: "/event?keep=1&also=2",
      directory: "/w",
    })
  })

  test("a different directory query or any workspace query is rejected", async () => {
    const { policy } = harness()
    expect(await policy.decide("GET", "/event", search("directory=/other"))).toEqual({
      ok: false,
      status: 403,
      reason: "directory override not allowed",
    })
    expect(await policy.decide("GET", "/event", search("workspace=/w"))).toEqual({
      ok: false,
      status: 403,
      reason: "workspace override not allowed",
    })
    expect(await policy.decide("GET", "/event", search("directory=/w&workspace=/other"))).toEqual({
      ok: false,
      status: 403,
      reason: "workspace override not allowed",
    })
  })

  test("a path containing .. or // is rejected with 400", async () => {
    const { policy } = harness()
    for (const method of ["GET", "POST"]) {
      for (const pathname of ["/a/../b", "/../x", "/a//b", "//secret"]) {
        const decision = await policy.decide(method, pathname, search())
        expect({ method, pathname, decision }).toEqual({
          method,
          pathname,
          decision: { ok: false, status: 400, reason: "invalid path" },
        })
      }
    }
  })

  test("pty, tui, upgrade and instance dispose are rejected for every method", async () => {
    const { policy } = harness()
    const blocked = ["/pty", "/api/pty/x", "/tui/x", "/global/upgrade", "/instance/dispose"]
    for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE"]) {
      for (const pathname of blocked) {
        const decision = await policy.decide(method, pathname, search())
        expect({ method, pathname, decision }).toEqual({
          method,
          pathname,
          decision: { ok: false, status: 403, reason: "not available in oco" },
        })
      }
    }
  })

  test("bound session writes are allowed and an unbound session is rejected", async () => {
    const { policy, calls } = harness()
    expect(await policy.decide("POST", "/session/ses_A/prompt_async", search())).toEqual({
      ok: true,
      path: "/session/ses_A/prompt_async",
      directory: "/w",
    })
    expect(await policy.decide("POST", "/api/session/ses_A/interrupt", search())).toEqual({
      ok: true,
      path: "/api/session/ses_A/interrupt",
      directory: "/w",
    })
    expect(calls.parents).toEqual([])
    expect(await policy.decide("POST", "/session/ses_B/abort", search())).toEqual({
      ok: false,
      status: 403,
      reason: "session not bound to this panel",
    })
  })

  test("a child whose parent is the bound session is allowed once and then cached", async () => {
    const { policy, calls } = harness({
      sessionParent: async (id) => (id === "ses_B" ? { exists: true, parentID: "ses_A", directory: "/w" } : { exists: false }),
    })
    expect(await policy.decide("POST", "/session/ses_B/abort", search())).toEqual({
      ok: true,
      path: "/session/ses_B/abort",
      directory: "/w",
    })
    expect(policy.stats.verifiedChildren).toBe(1)
    expect(calls.parents).toEqual(["ses_B"])

    expect(await policy.decide("POST", "/session/ses_B/prompt_async", search())).toEqual({
      ok: true,
      path: "/session/ses_B/prompt_async",
      directory: "/w",
    })
    expect(policy.stats.verifiedChildren).toBe(1)
    expect(calls.parents).toEqual(["ses_B"])
  })

  test("a parent chain that leaves the bound directory is rejected", async () => {
    const direct = harness({
      sessionParent: async (id) => (id === "ses_B" ? { exists: true, parentID: "ses_A", directory: "/elsewhere" } : { exists: false }),
    })
    expect(await direct.policy.decide("POST", "/session/ses_B/abort", search())).toEqual({
      ok: false,
      status: 403,
      reason: "session not bound to this panel",
    })
    expect(direct.policy.stats.verifiedChildren).toBe(0)

    // ses_C (/w) → ses_B (/elsewhere) → ses_A. The walk must stop on the foreign record.
    const chain = harness({
      sessionParent: async (id) => {
        if (id === "ses_C") return { exists: true, parentID: "ses_B", directory: "/w" }
        if (id === "ses_B") return { exists: true, parentID: "ses_A", directory: "/elsewhere" }
        return { exists: false }
      },
    })
    expect(await chain.policy.decide("POST", "/session/ses_C/abort", search())).toEqual({
      ok: false,
      status: 403,
      reason: "session not bound to this panel",
    })
    expect(chain.policy.stats.verifiedChildren).toBe(0)
  })

  test("a parent chain of 8 hops is allowed and a longer chain is rejected", async () => {
    // Separate policies: verifying s8 must not make s8 an allowed ancestor for a later s9.
    const within = harness({ sessionParent: chainParent })
    expect(await within.policy.decide("POST", "/session/s8/prompt_async", search())).toEqual({
      ok: true,
      path: "/session/s8/prompt_async",
      directory: "/w",
    })
    expect(within.policy.stats.verifiedChildren).toBe(1)

    const over = harness({ sessionParent: chainParent })
    expect(await over.policy.decide("POST", "/session/s9/prompt_async", search())).toEqual({
      ok: false,
      status: 403,
      reason: "session not bound to this panel",
    })
    expect(over.policy.stats.verifiedChildren).toBe(0)
  })

  test("permission replies require a session owned by this panel", async () => {
    const owned = harness({ permissionSession: async (id) => (id === "per_1" ? "ses_A" : undefined) })
    expect(await owned.policy.decide("POST", "/permission/per_1/reply", search())).toEqual({
      ok: true,
      path: "/permission/per_1/reply",
      directory: "/w",
    })
    expect(owned.calls.permissions).toEqual(["per_1"])
    expect(owned.calls.questions).toEqual([])

    const other = harness({ permissionSession: async () => "ses_B" })
    expect(await other.policy.decide("POST", "/permission/per_1/reply", search())).toEqual({
      ok: false,
      status: 403,
      reason: "permission request not owned by this panel",
    })

    const missing = harness({ permissionSession: async () => undefined })
    expect(await missing.policy.decide("POST", "/permission/per_1/reply", search())).toEqual({
      ok: false,
      status: 403,
      reason: "permission request not owned by this panel",
    })
    expect(missing.calls.parents).toEqual([])
  })

  test("question reply and reject require a session owned by this panel", async () => {
    for (const action of ["reply", "reject"]) {
      const path = `/question/q1/${action}`
      const owned = harness({ questionSession: async (id) => (id === "q1" ? "ses_A" : undefined) })
      expect(await owned.policy.decide("POST", path, search())).toEqual({ ok: true, path, directory: "/w" })
      expect(owned.calls.questions).toEqual(["q1"])
      expect(owned.calls.permissions).toEqual([])

      const other = harness({ questionSession: async () => "ses_B" })
      expect(await other.policy.decide("POST", path, search())).toEqual({
        ok: false,
        status: 403,
        reason: "question not owned by this panel",
      })

      const missing = harness({ questionSession: async () => undefined })
      expect(await missing.policy.decide("POST", path, search())).toEqual({
        ok: false,
        status: 403,
        reason: "question not owned by this panel",
      })
      expect(missing.calls.parents).toEqual([])
    }
  })

  test("creating a session and posting a log are allowed; other writes are rejected", async () => {
    const { policy } = harness()
    expect(await policy.decide("POST", "/session", search())).toEqual({ ok: true, path: "/session", directory: "/w" })
    expect(await policy.decide("POST", "/log", search())).toEqual({ ok: true, path: "/log", directory: "/w" })
    for (const [method, pathname] of [
      ["PATCH", "/config"],
      ["POST", "/mcp/x/connect"],
      ["PUT", "/auth/x"],
    ] as const) {
      const decision = await policy.decide(method, pathname, search())
      expect({ method, pathname, decision }).toEqual({
        method,
        pathname,
        decision: { ok: false, status: 403, reason: "operation not available in this panel" },
      })
    }
    expect(await policy.decide("POST", "/experimental/worktree", search())).toEqual({
      ok: false,
      status: 403,
      reason: "worktrees are created from a new-session page only",
    })
  })

  test("an untrusted workspace can read but cannot write", async () => {
    const { policy, calls } = harness({ trusted: false })
    expect(await policy.decide("POST", "/session/ses_A/prompt_async", search())).toEqual({
      ok: false,
      status: 403,
      reason: "workspace not trusted",
    })
    expect(calls.parents).toEqual([])
    expect(await policy.decide("GET", "/session/ses_A/prompt_async", search())).toEqual({
      ok: true,
      path: "/session/ses_A/prompt_async",
      directory: "/w",
    })
  })
})

describe("BridgePolicy.forwardHeaders", () => {
  test("drops credential, host and directory headers and pins the binding directory plus auth", () => {
    const headers = BridgePolicy.forwardHeaders(
      [
        ["Authorization", "Bearer stolen"],
        ["authorization", "Bearer also-stolen"],
        ["CoOkIe", "sid=1"],
        ["HOST", "evil.example"],
        ["X-OpenCode-Directory", encodeURIComponent("/evil")],
        ["X-OPENCODE-WORKSPACE", encodeURIComponent("/evil")],
        ["Accept", "application/json"],
        ["X-Request-Id", "req-1"],
      ],
      "/w",
      { authorization: "Basic bound", "x-oco-auth": "yes" },
    )
    expect(headers.get("authorization")).toBe("Basic bound")
    expect(headers.get("cookie")).toBeNull()
    expect(headers.get("host")).toBeNull()
    expect(headers.get("x-opencode-directory")).toBe(encodeURIComponent("/w"))
    expect(headers.get("x-opencode-workspace")).toBeNull()
    expect(headers.get("accept")).toBe("application/json")
    expect(headers.get("x-request-id")).toBe("req-1")
    expect(headers.get("x-oco-auth")).toBe("yes")
  })
})

describe("retarget (ADR-007: main panel switches session in place)", () => {
  test("writes follow the new session; the previous session and its children are dropped", async () => {
    const { policy } = harness({ sessionParent: async (id) => (id === "ses_A_child" ? { exists: true, parentID: "ses_A", directory: "/w" } : { exists: false }) })
    expect((await policy.decide("POST", "/session/ses_A_child/abort", search())).ok).toBe(true)
    policy.retarget("ses_B")
    expect((await policy.decide("POST", "/session/ses_B/prompt_async", search())).ok).toBe(true)
    expect((await policy.decide("POST", "/session/ses_A/prompt_async", search())).ok).toBe(false)
    expect((await policy.decide("POST", "/session/ses_A_child/abort", search())).ok).toBe(false)
    // The directory binding is unchanged: another directory stays refused.
    expect((await policy.decide("GET", "/event", search("directory=/other"))).ok).toBe(false)
  })
})

function draftHarness(opts?: {
  binding?: PolicyBinding
  workspaceDirectories?: string[]
  trusted?: boolean
  sessionParent?: Lookup["sessionParent"]
  permissionSession?: Lookup["permissionSession"]
  questionSession?: Lookup["questionSession"]
}) {
  const calls = { parents: [] as string[], permissions: [] as string[], questions: [] as string[] }
  const lookup: Lookup = {
    async sessionParent(id) {
      calls.parents.push(id)
      return opts?.sessionParent ? opts.sessionParent(id) : { exists: false }
    },
    async permissionSession(id) {
      calls.permissions.push(id)
      return opts?.permissionSession ? opts.permissionSession(id) : undefined
    },
    async questionSession(id) {
      calls.questions.push(id)
      return opts?.questionSession ? opts.questionSession(id) : undefined
    },
  }
  const binding: PolicyBinding = opts?.binding ?? { directory: "/w", sessionId: "ses_draft", draft: true }
  const workspaceDirs = opts?.workspaceDirectories ?? ["/w", "/w2", "/wt/a"]
  const policy = new BridgePolicy(binding, lookup, () => opts?.trusted ?? true, () => workspaceDirs)
  return { policy, calls }
}

describe("BridgePolicy (draft panel and observes)", () => {
  test("allows GET with query directory in workspaceDirectories and rejects outside directory", async () => {
    const { policy } = draftHarness()
    expect(policy.draft).toBe(true)
    expect(await policy.decide("GET", "/session", search("directory=/w2"))).toEqual({
      ok: true,
      path: "/session",
      directory: "/w2",
    })
    expect(await policy.decide("GET", "/session", search("directory=/other"))).toEqual({
      ok: false,
      status: 403,
      reason: "directory override not allowed",
    })
  })

  test("headerDirectory overrides directory if allowed, otherwise falls back to bound directory without rejecting", async () => {
    const { policy } = draftHarness()
    // Allowed header (plain string)
    expect(await policy.decide("GET", "/session", search(), { headerDirectory: "/w2" })).toEqual({
      ok: true,
      path: "/session",
      directory: "/w2",
    })
    // Allowed header (encodeURIComponent-encoded)
    expect(await policy.decide("GET", "/session", search(), { headerDirectory: encodeURIComponent("/w2") })).toEqual({
      ok: true,
      path: "/session",
      directory: "/w2",
    })
    // Header outside allowed set falls back to bound directory /w without rejection
    expect(await policy.decide("GET", "/session", search(), { headerDirectory: "/other" })).toEqual({
      ok: true,
      path: "/session",
      directory: "/w",
    })
    expect(await policy.decide("GET", "/session", search(), { headerDirectory: encodeURIComponent("/other") })).toEqual({
      ok: true,
      path: "/session",
      directory: "/w",
    })
    // Non-draft panel: headerDirectory "/w2" also falls back to bound directory
    const { policy: nonDraftPolicy } = harness()
    expect(await nonDraftPolicy.decide("GET", "/session", search(), { headerDirectory: "/w2" })).toEqual({
      ok: true,
      path: "/session",
      directory: "/w",
    })
  })

  test("POST /api/session checks body location.directory against allowed set", async () => {
    const { policy } = draftHarness()
    const encoder = new TextEncoder()

    const allowedBody = encoder.encode(JSON.stringify({ location: { directory: "/w2" } }))
    expect(await policy.decide("POST", "/api/session", search(), { body: allowedBody })).toEqual({
      ok: true,
      path: "/api/session",
      directory: "/w",
    })

    const disallowedBody = encoder.encode(JSON.stringify({ location: { directory: "/other" } }))
    expect(await policy.decide("POST", "/api/session", search(), { body: disallowedBody })).toEqual({
      ok: false,
      status: 403,
      reason: "directory not allowed",
    })
  })

  test("draft panel allows POST /experimental/worktree?directory=/w and non-draft panel rejects it", async () => {
    const { policy } = draftHarness()
    expect(await policy.decide("POST", "/experimental/worktree", search("directory=/w"))).toEqual({
      ok: true,
      path: "/experimental/worktree",
      directory: "/w",
    })

    const { policy: nonDraft } = harness()
    expect(await nonDraft.decide("POST", "/experimental/worktree", search("directory=/w"))).toEqual({
      ok: false,
      status: 403,
      reason: "worktrees are created from a new-session page only",
    })
  })

  test("observe tracks created sessions for draft panel and enables session writes", async () => {
    const { policy } = draftHarness()

    // 1. Successful observe with { id, directory } in allowed set
    policy.observe("POST", "/session", 200, { id: "s1", directory: "/w" })
    expect(policy.created.get("s1")).toBe("/w")
    expect(await policy.decide("POST", "/session/s1/prompt_async", search())).toEqual({
      ok: true,
      path: "/session/s1/prompt_async",
      directory: "/w",
    })

    // 2. Directory not in allowed set: observe does not add to allowed or created
    policy.observe("POST", "/session", 200, { id: "s_bad", directory: "/other" })
    expect(policy.created.has("s_bad")).toBe(false)
    expect(await policy.decide("POST", "/session/s_bad/prompt_async", search())).toEqual({
      ok: false,
      status: 403,
      reason: "session not bound to this panel",
    })

    // 3. Non-draft panel observe has no effect
    const { policy: nonDraft } = harness()
    nonDraft.observe("POST", "/session", 200, { id: "s_nd", directory: "/w" })
    expect(nonDraft.created.has("s_nd")).toBe(false)
    expect(await nonDraft.decide("POST", "/session/s_nd/prompt_async", search())).toEqual({
      ok: false,
      status: 403,
      reason: "session not bound to this panel",
    })

    // 4. Observe accepts { data: { id, directory } } shape
    policy.observe("POST", "/session", 200, { data: { id: "s2", directory: "/w2" } })
    expect(policy.created.get("s2")).toBe("/w2")
    expect((await policy.decide("POST", "/session/s2/prompt_async", search())).ok).toBe(true)
  })

  test("observe on worktree creation allows subsequent query directory for that worktree", async () => {
    const { policy } = draftHarness()
    // Before observe, /new-wt is not allowed
    expect(await policy.decide("GET", "/session", search("directory=/new-wt"))).toEqual({
      ok: false,
      status: 403,
      reason: "directory override not allowed",
    })

    policy.observe("POST", "/experimental/worktree", 200, { directory: "/new-wt" })

    // After observe, /new-wt is allowed
    expect(await policy.decide("GET", "/session", search("directory=/new-wt"))).toEqual({
      ok: true,
      path: "/session",
      directory: "/new-wt",
    })
  })

  test("retarget sets new bound directory, disables draft, and revokes previously observed sessions and worktrees", async () => {
    const { policy } = draftHarness()
    policy.observe("POST", "/session", 200, { id: "s1", directory: "/w" })
    policy.observe("POST", "/session", 200, { id: "s2", directory: "/w" })
    policy.observe("POST", "/experimental/worktree", 200, { directory: "/new-wt" })

    expect(policy.draft).toBe(true)
    expect((await policy.decide("POST", "/session/s1/prompt_async", search())).ok).toBe(true)
    expect((await policy.decide("POST", "/session/s2/prompt_async", search())).ok).toBe(true)

    policy.retarget("s1", "/wt/a")

    expect(policy.draft).toBe(false)
    // s1 is the retargeted session and now bound in /wt/a
    expect(await policy.decide("POST", "/session/s1/prompt_async", search())).toEqual({
      ok: true,
      path: "/session/s1/prompt_async",
      directory: "/wt/a",
    })

    // Previously observed session s2 is no longer writable
    expect(await policy.decide("POST", "/session/s2/prompt_async", search())).toEqual({
      ok: false,
      status: 403,
      reason: "session not bound to this panel",
    })

    // Previously observed worktree /new-wt is cleared and draft is false
    expect((await policy.decide("GET", "/session", search("directory=/new-wt"))).ok).toBe(false)
  })

  test("BridgePolicy.observes only returns true for POST session and worktree creation endpoints", () => {
    expect(BridgePolicy.observes("POST", "/session")).toBe(true)
    expect(BridgePolicy.observes("POST", "/api/session")).toBe(true)
    expect(BridgePolicy.observes("POST", "/experimental/worktree")).toBe(true)

    expect(BridgePolicy.observes("GET", "/session")).toBe(false)
    expect(BridgePolicy.observes("GET", "/api/session")).toBe(false)
    expect(BridgePolicy.observes("GET", "/experimental/worktree")).toBe(false)
    expect(BridgePolicy.observes("POST", "/session/s1/prompt_async")).toBe(false)
    expect(BridgePolicy.observes("POST", "/log")).toBe(false)
    expect(BridgePolicy.observes("DELETE", "/session/s1")).toBe(false)
    expect(BridgePolicy.observes("POST", "/experimental/other")).toBe(false)
  })
})
