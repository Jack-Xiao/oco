import { describe, test, expect, beforeAll, afterAll } from "bun:test"
import type { Server } from "node:http"
import { createMockServer } from "../e2e/lib/mock-llm.mjs"

describe("mock-llm 429 retry-once", () => {
  let server: Server
  let url: string

  beforeAll(async () => {
    server = createMockServer()
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const addr = server.address()
        const port = typeof addr === "object" && addr ? addr.port : 0
        url = `http://127.0.0.1:${port}/v1/chat/completions`
        resolve()
      })
    })
  })

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()))
    })
  })

  test("RETRY-ONCE-<tag> with tools: first request returns 429, second request returns 200", async () => {
    const payload = {
      messages: [{ role: "user", content: "Run task RETRY-ONCE-x now" }],
      tools: [{ type: "function", function: { name: "bash" } }],
      stream: true,
    }

    // First request: 429 with retry-after header and rate limit error body
    const res1 = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    })
    expect(res1.status).toBe(429)
    expect(res1.headers.get("retry-after")).toBe("1")
    expect(res1.headers.get("content-type")).toContain("application/json")
    const body1 = await res1.json()
    expect(body1).toEqual({
      error: {
        message: "Rate limit reached (mock)",
        type: "rate_limit_exceeded",
        code: "rate_limit_exceeded",
      },
    })

    // Second request with same tag: 200 OK
    const res2 = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    })
    expect(res2.status).toBe(200)
    const text2 = await res2.text()
    expect(text2).toContain("data: [DONE]")
  })

  test("request without tag never returns 429", async () => {
    const payload = {
      messages: [{ role: "user", content: "Regular request without retry tag" }],
      tools: [{ type: "function", function: { name: "bash" } }],
      stream: true,
    }

    const res1 = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    })
    expect(res1.status).toBe(200)
    await res1.text()

    const res2 = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    })
    expect(res2.status).toBe(200)
    await res2.text()
  })

  test("request without tools never triggers 429 even with tag", async () => {
    const payloadNoTools = {
      messages: [{ role: "user", content: "Auxiliary title request RETRY-ONCE-notools" }],
      stream: true,
    }

    const resAux = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payloadNoTools),
    })
    expect(resAux.status).toBe(200)
    await resAux.text()

    // Subsequent main request with tools still gets 429 because auxiliary request didn't consume it
    const payloadWithTools = {
      messages: [{ role: "user", content: "Main request RETRY-ONCE-notools" }],
      tools: [{ type: "function", function: { name: "bash" } }],
      stream: true,
    }
    const resMain1 = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payloadWithTools),
    })
    expect(resMain1.status).toBe(429)
    expect(resMain1.headers.get("retry-after")).toBe("1")
    await resMain1.json()

    // Second request with tools gets 200
    const resMain2 = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payloadWithTools),
    })
    expect(resMain2.status).toBe(200)
    await resMain2.text()
  })

  test("SLOW-REASON-<tag> streams 6 reasoning chunks with 300ms interval", async () => {
    const payload = {
      messages: [{ role: "user", content: "Write slow reasoning SLOW-REASON-test1" }],
      tools: [{ type: "function", function: { name: "bash" } }],
      stream: true,
    }

    const t0 = Date.now()
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    })
    expect(res.status).toBe(200)

    const raw = await res.text()
    const elapsed = Date.now() - t0
    expect(elapsed).toBeGreaterThanOrEqual(1500)

    // Count reasoning chunks
    const reasoningMatches = [...raw.matchAll(/"reasoning_content":/g)]
    expect(reasoningMatches.length).toBe(6)
    expect(raw).toContain("data: [DONE]")
  })
})

