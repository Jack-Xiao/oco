// T007 managed process lifecycle with a fake child process (no real OpenCode needed).
import { describe, expect, test } from "bun:test"
import { EventEmitter } from "node:events"
import { ManagedServer, scrub } from "../../apps/extension/src/managed-server"
import { managedEndpoint } from "../../apps/extension/src/endpoint"

class FakeChild extends EventEmitter {
  stdout = new EventEmitter()
  stderr = new EventEmitter()
  pid = 4242
  exitCode: number | null = null
  signalCode: string | null = null
  kills: string[] = []
  kill(sig: string) {
    this.kills.push(sig)
    if (!this.stubborn || sig === "SIGKILL") queueMicrotask(() => this.exit(null, sig))
    return true
  }
  stubborn = false
  exit(code: number | null, sig: string | null = null) {
    this.exitCode = code
    this.signalCode = sig
    this.emit("exit", code, sig)
  }
}

function setup(opts: { cwd?: string | undefined; timeout?: number } = {}) {
  const spawned: { cmd: string; args: string[]; env: NodeJS.ProcessEnv; child: FakeChild }[] = []
  const states: string[] = []
  const m = new ManagedServer({
    spawn: (cmd, args, o) => {
      const child = new FakeChild()
      spawned.push({ cmd, args, env: o.env as NodeJS.ProcessEnv, child })
      return child as any
    },
    binary: () => "/opt/opencode",
    cwd: () => ("cwd" in opts ? opts.cwd : "/work"),
    env: () => ({ HOME: "/home/u", OPENCODE_SERVER_PASSWORD: "inherited" }),
    onState: (s) => states.push(s.status),
    startTimeoutMs: opts.timeout ?? 1000,
    killGraceMs: 50,
  })
  return { m, spawned, states }
}

describe("ManagedServer", () => {
  test("starts on loopback with a fresh random password and resolves the announced URL", async () => {
    const { m, spawned, states } = setup()
    const p = m.start()
    const s = spawned[0]
    expect(s.cmd).toBe("/opt/opencode")
    expect(s.args).toEqual(["serve", "--hostname", "127.0.0.1", "--port", "0"])
    expect(s.env.OPENCODE_SERVER_PASSWORD).not.toBe("inherited")
    expect(s.env.OPENCODE_SERVER_PASSWORD).toBe(m.password)
    expect(m.password.length).toBeGreaterThanOrEqual(32)
    s.child.stdout.emit("data", Buffer.from("opencode server listening on http://127.0.0.1:54321\n"))
    expect(await p).toBe("http://127.0.0.1:54321")
    expect(m.state.status).toBe("running")
    expect(states).toEqual(["starting", "running"])
  })

  test("concurrent starts share one process (many panels, one server)", async () => {
    const { m, spawned } = setup()
    const a = m.start()
    const b = m.start()
    spawned[0].child.stdout.emit("data", Buffer.from("listening on http://127.0.0.1:1234"))
    expect(await a).toBe(await b)
    expect(await m.start()).toBe("http://127.0.0.1:1234")
    expect(spawned.length).toBe(1)
  })

  test("a missing binary is a clear, actionable error", async () => {
    const { m, spawned } = setup()
    const p = m.start()
    spawned[0].child.emit("error", Object.assign(new Error("spawn ENOENT"), { code: "ENOENT" }))
    await expect(p).rejects.toThrow(/oco.opencodePath/)
    expect(m.state.status).toBe("failed")
  })

  test("exit before listening reports the scrubbed tail of the output (e.g. port or config error)", async () => {
    const { m, spawned } = setup()
    const p = m.start()
    const c = spawned[0].child
    c.stderr.emit("data", Buffer.from(`Error: failed to start, password=${m.password} home /home/u/.config\n`))
    c.exit(1)
    const err = await p.catch((e) => e as Error)
    expect(err.message).toMatch(/exit code 1/)
    expect(err.message).not.toContain(m.password)
    expect(err.message).toContain("~/.config")
  })

  test("start timeout kills the child and fails", async () => {
    const { m, spawned } = setup({ timeout: 30 })
    await expect(m.start()).rejects.toThrow(/did not start listening/)
    expect(spawned[0].child.kills).toContain("SIGTERM")
  })

  test("unexpected exit after running is reported and never restarted automatically", async () => {
    const { m, spawned } = setup()
    const p = m.start()
    spawned[0].child.stdout.emit("data", Buffer.from("listening on http://127.0.0.1:1"))
    await p
    spawned[0].child.exit(137)
    await new Promise((r) => setTimeout(r, 100))
    expect(m.state.status).toBe("exited")
    expect(m.state.error).toMatch(/will not restart automatically/)
    expect(spawned.length).toBe(1)
    expect(m.url).toBeUndefined()
  })

  test("stop signals only its own child, escalates to SIGKILL, and ends as stopped", async () => {
    const { m, spawned } = setup()
    const p = m.start()
    const c = spawned[0].child
    c.stubborn = true
    c.stdout.emit("data", Buffer.from("listening on http://127.0.0.1:1"))
    await p
    await m.stop()
    expect(c.kills).toEqual(["SIGTERM", "SIGKILL"])
    expect(m.state.status).toBe("stopped")
    await m.stop() // no child: no-op
    expect(c.kills.length).toBe(2)
  })

  test("no workspace folder: refuses to start", async () => {
    const { m, spawned } = setup({ cwd: undefined })
    await expect(m.start()).rejects.toThrow(/workspace folder/)
    expect(spawned.length).toBe(0)
  })

  test("scrub removes the secret, home and key=value secrets", () => {
    expect(scrub("pw abc123 at /home/u/x token=zzz", "abc123", "/home/u")).toBe("pw <redacted> at ~/x token=<redacted>")
  })

  test("managed identity is stable across ports and refuses non-loopback URLs", () => {
    const a = managedEndpoint("http://127.0.0.1:1111", "/opt/opencode", "/work")
    const b = managedEndpoint("http://127.0.0.1:2222", "/opt/opencode", "/work")
    expect(a.connectionId).toBe(b.connectionId)
    expect(a.origin).not.toBe(b.origin)
    expect(a.managed).toBe(true)
    expect(managedEndpoint("http://127.0.0.1:1", "/opt/opencode", "/other").connectionId).not.toBe(a.connectionId)
    expect(() => managedEndpoint("http://10.0.0.1:1", "/opt/opencode", "/work")).toThrow()
  })
})
