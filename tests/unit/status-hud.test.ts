import { describe, expect, mock, test } from "bun:test"
import { formatHud, formatHudTooltip } from "../../apps/extension/src/status-hud"
import { SessionStore } from "../../apps/extension/src/session-store"

describe("formatHud", () => {
  test("long model id truncation (max 24 chars, add '…' when cut)", () => {
    // 24 chars: untouched
    const model24 = "claude-3-5-sonnet-latest" // 24 chars
    expect(model24.length).toBe(24)
    expect(formatHud({ model: model24 })).toBe("claude-3-5-sonnet-latest · 0k tok")

    // >24 chars: truncated to 23 + '…' = 24 chars
    const modelLong = "claude-3-7-sonnet-20260219-thinking" // 35 chars
    const hud = formatHud({ model: modelLong })
    const modelPart = hud.split(" · ")[0]
    expect(modelPart.length).toBe(24)
    expect(modelPart.endsWith("…")).toBe(true)
    expect(modelPart).toBe("claude-3-7-sonnet-20260…")
  })

  test("percent rounding when limit is known", () => {
    // 40,000 / 128,000 = 31.25% -> 31%
    expect(
      formatHud({
        model: "gpt-4o",
        tokens: { input: 30000, output: 10000 },
        limit: 128000,
      }),
    ).toBe("gpt-4o · 31%")

    // 99,600 / 100,000 = 99.6% -> 100%
    expect(
      formatHud({
        model: "gpt-4o",
        tokens: { input: 99600, output: 0 },
        limit: 100000,
      }),
    ).toBe("gpt-4o · 100%")

    // 1 / 1000 = 0.1% -> 0%
    expect(
      formatHud({
        model: "gpt-4o",
        tokens: { input: 1, output: 0 },
        limit: 1000,
      }),
    ).toBe("gpt-4o · 0%")
  })

  test("missing-limit fallback: <k>k tok", () => {
    // 58,400 tokens without limit -> 58k tok
    expect(
      formatHud({
        model: "claude-sonnet",
        tokens: { input: 50000, output: 8400 },
      }),
    ).toBe("claude-sonnet · 58k tok")

    // 0 tokens without limit -> 0k tok
    expect(
      formatHud({
        model: "claude-sonnet",
        tokens: { input: 0, output: 0 },
      }),
    ).toBe("claude-sonnet · 0k tok")

    // 1,500 tokens -> 2k tok
    expect(
      formatHud({
        model: "claude-sonnet",
        tokens: { input: 1500, output: 0 },
      }),
    ).toBe("claude-sonnet · 2k tok")
  })

  test("cost formats: $0.12, <$0.01 when 0 < cost < 0.005, omitted when 0 or undefined", () => {
    // Normal cost >= 0.005
    expect(
      formatHud({
        model: "gpt-4o",
        cost: 0.1234,
      }),
    ).toBe("gpt-4o · 0k tok · $0.12")

    // Tiny cost < 0.005
    expect(
      formatHud({
        model: "gpt-4o",
        cost: 0.002,
      }),
    ).toBe("gpt-4o · 0k tok · <$0.01")

    // Zero cost
    expect(
      formatHud({
        model: "gpt-4o",
        cost: 0,
      }),
    ).toBe("gpt-4o · 0k tok")

    // Undefined cost
    expect(
      formatHud({
        model: "gpt-4o",
      }),
    ).toBe("gpt-4o · 0k tok")
  })

  test("busy/waiting prefixes", () => {
    // Busy / running
    expect(
      formatHud({
        model: "gpt-4o",
        state: "busy",
      }),
    ).toBe("$(sync~spin) gpt-4o · 0k tok")

    expect(
      formatHud({
        model: "gpt-4o",
        state: "running",
      }),
    ).toBe("$(sync~spin) gpt-4o · 0k tok")

    expect(
      formatHud({
        model: "gpt-4o",
        state: "retry",
      }),
    ).toBe("$(sync~spin) gpt-4o · 0k tok")

    // Waiting / permission / question
    expect(
      formatHud({
        model: "gpt-4o",
        state: "waiting",
      }),
    ).toBe("$(bell) gpt-4o · 0k tok")

    expect(
      formatHud({
        model: "gpt-4o",
        state: "permission",
      }),
    ).toBe("$(bell) gpt-4o · 0k tok")

    expect(
      formatHud({
        model: "gpt-4o",
        state: "question",
      }),
    ).toBe("$(bell) gpt-4o · 0k tok")

    // Idle
    expect(
      formatHud({
        model: "gpt-4o",
        state: "idle",
      }),
    ).toBe("gpt-4o · 0k tok")
  })

  test("combines model, context %, cost, and busy prefix", () => {
    const text = formatHud({
      model: "claude-3-5-sonnet",
      tokens: { input: 20000, output: 5000, reasoning: 1000, cache: { read: 4000, write: 2000 } }, // total 32,000
      limit: 200000, // 32,000 / 200,000 = 16%
      cost: 0.15,
      state: "busy",
    })
    expect(text).toBe("$(sync~spin) claude-3-5-sonnet · 16% · $0.15")
  })
})

describe("formatHudTooltip", () => {
  test("formats detailed tooltip with token breakdown and session stats", () => {
    const tooltip = formatHudTooltip({
      title: "Fix Authentication Bug",
      state: "busy",
      providerID: "anthropic",
      modelID: "claude-3-5-sonnet",
      tokens: { input: 10000, output: 2000, reasoning: 500, cache: { read: 1000, write: 500 } },
      limit: 200000,
      cost: 0.08,
      sessionTokens: 25000,
    })

    expect(tooltip).toContain("oco: Fix Authentication Bug")
    expect(tooltip).toContain("State: busy")
    expect(tooltip).toContain("Model: anthropic/claude-3-5-sonnet")
    expect(tooltip).toContain("Context: 14,000 / 200,000 tokens (7%)")
    expect(tooltip).toContain("• Input: 10,000")
    expect(tooltip).toContain("• Output: 2,000")
    expect(tooltip).toContain("• Reasoning: 500")
    expect(tooltip).toContain("• Cache read: 1,000")
    expect(tooltip).toContain("• Cache write: 500")
    expect(tooltip).toContain("Session Total: $0.08 · 25,000 tokens")
  })
})

describe("SessionStore HUD tracking", () => {
  test("records lastTokens and sessionMetrics upon assistant message update", () => {
    const store = new SessionStore(() => true)
    store.applySnapshot({
      sessions: [{ id: "ses-test", directory: "/workspace", time: { created: 1000 } }],
      status: {},
      permissions: [],
      questions: [],
    })

    expect(store.lastTokens("ses-test")).toBeUndefined()
    expect(store.sessionMetrics("ses-test")).toEqual({ costUsd: 0, tokens: 0 })

    store.applyEvent({
      type: "message.updated",
      properties: {
        info: {
          id: "msg-1",
          sessionID: "ses-test",
          role: "assistant",
          providerID: "anthropic",
          modelID: "claude-3-5-sonnet",
          cost: 0.025,
          tokens: {
            input: 5000,
            output: 1000,
            reasoning: 200,
            cache: {
              read: 500,
              write: 100,
            },
          },
        },
      },
    })

    const lastTokens = store.lastTokens("ses-test")
    expect(lastTokens).toBeDefined()
    expect(lastTokens?.input).toBe(5000)
    expect(lastTokens?.output).toBe(1000)
    expect(lastTokens?.reasoning).toBe(200)
    expect(lastTokens?.cache?.read).toBe(500)
    expect(lastTokens?.cache?.write).toBe(100)

    const metrics = store.sessionMetrics("ses-test")
    expect(metrics.costUsd).toBe(0.025)
    expect(metrics.tokens).toBe(6800)
  })
})
