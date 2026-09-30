// T007 managed mode: oco starts `opencode serve` itself (one process per window, shared by every panel).
// Ownership rule: only the child this class spawned is ever signalled. Attached servers are never touched.
// No automatic restart loop: an unexpected exit is reported and the user restarts explicitly.
import type { ChildProcess, SpawnOptions } from "node:child_process"
import * as crypto from "node:crypto"

export type ManagedStatus = "stopped" | "starting" | "running" | "failed" | "exited"
export type ManagedState = { status: ManagedStatus; url?: string; pid?: number; error?: string; exitCode?: number | null; startedAt?: number; binary?: string }

export type ManagedDeps = {
  spawn: (cmd: string, args: string[], opts: SpawnOptions) => ChildProcess
  binary: () => string
  cwd: () => string | undefined
  env: () => NodeJS.ProcessEnv
  onState?: (s: ManagedState) => void
  log?: (m: string) => void
  startTimeoutMs?: number
  killGraceMs?: number
}

const LISTEN_RE = /listening on (https?:\/\/[^\s]+)/

/** Strip the secret and home-directory details from process output before it reaches logs or UI. */
export function scrub(text: string, secret: string, home?: string) {
  let t = secret ? text.split(secret).join("<redacted>") : text
  if (home) t = t.split(home).join("~")
  return t.replace(/(authorization|password|token|api[_-]?key)(["'=:\s]+)[^\s"']+/gi, "$1$2<redacted>")
}

export class ManagedServer {
  readonly username = "opencode"
  /** Per-process secret: never persisted, rotated on every start. */
  password = ""
  private child: ChildProcess | undefined
  private starting: Promise<string> | undefined
  private stopping = false
  private tail: string[] = []
  state: ManagedState = { status: "stopped" }

  constructor(private readonly deps: ManagedDeps) {}

  private set(s: ManagedState) {
    this.state = s
    this.deps.onState?.(s)
  }

  get url() {
    return this.state.status === "running" ? this.state.url : undefined
  }

  /** Idempotent: a running server returns its URL; concurrent callers share one start. */
  start(): Promise<string> {
    if (this.state.status === "running" && this.state.url) return Promise.resolve(this.state.url)
    if (this.starting) return this.starting
    this.starting = this.spawnOnce().finally(() => (this.starting = undefined))
    return this.starting
  }

  private spawnOnce(): Promise<string> {
    const binary = this.deps.binary().trim() || "opencode"
    const cwd = this.deps.cwd()
    if (!cwd) {
      const error = "托管模式需要先打开一个工作区文件夹"
      this.set({ status: "failed", error, binary })
      return Promise.reject(new Error(error))
    }
    this.password = crypto.randomBytes(18).toString("hex")
    this.tail = []
    this.stopping = false
    const env = { ...this.deps.env() }
    delete env.OPENCODE_SERVER_PASSWORD
    env.OPENCODE_SERVER_PASSWORD = this.password
    env.OPENCODE_SERVER_USERNAME = this.username
    this.set({ status: "starting", binary })
    const home = env.HOME
    return new Promise<string>((resolve, reject) => {
      let settled = false
      let child: ChildProcess
      const fail = (error: string) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        this.set({ status: "failed", error, binary })
        reject(new Error(error))
      }
      try {
        child = this.deps.spawn(binary, ["serve", "--hostname", "127.0.0.1", "--port", "0"], { cwd, env, stdio: ["ignore", "pipe", "pipe"] })
      } catch (e) {
        fail(`无法启动 ${binary}：${(e as Error).message}`)
        return
      }
      this.child = child
      const timer = setTimeout(() => {
        fail(`托管服务 ${this.deps.startTimeoutMs ?? 30000} ms 内没有开始监听。最后输出：${this.lastOutput() || "（无）"}`)
        this.kill(child)
      }, this.deps.startTimeoutMs ?? 30000)
      const onData = (buf: Buffer) => {
        const text = scrub(buf.toString("utf8"), this.password, home)
        for (const line of text.split(/\r?\n/)) if (line.trim()) this.tail.push(line.slice(0, 400))
        this.tail = this.tail.slice(-20)
        const m = LISTEN_RE.exec(text)
        if (m && !settled) {
          settled = true
          clearTimeout(timer)
          const url = new URL(m[1]).origin
          this.set({ status: "running", url, pid: child.pid, startedAt: Date.now(), binary })
          this.deps.log?.(`managed server running pid ${child.pid} at ${url}`)
          resolve(url)
        }
      }
      child.stdout?.on("data", onData)
      child.stderr?.on("data", onData)
      child.on("error", (e: NodeJS.ErrnoException) => {
        if (e.code === "ENOENT") fail(`找不到 OpenCode 可执行文件“${binary}”。请在设置 oco.opencodePath 中填写完整路径`)
        else if (e.code === "EACCES") fail(`没有权限执行“${binary}”`)
        else fail(`无法启动 ${binary}：${e.message}`)
      })
      child.on("exit", (code, signal) => {
        if (this.child === child) this.child = undefined
        if (!settled) return fail(`托管服务启动失败（退出码 ${code ?? signal}）。最后输出：${this.lastOutput() || "（无）"}`)
        if (this.stopping) return this.set({ status: "stopped", binary })
        this.deps.log?.(`managed server exited unexpectedly code=${code} signal=${signal}`)
        this.set({ status: "exited", exitCode: code, binary, error: `托管服务意外退出（${code ?? signal}）。不会自动重启；执行“oco: Restart Managed Server”重新启动` })
      })
    })
  }

  lastOutput() {
    return this.tail.slice(-3).join(" | ")
  }

  private kill(child: ChildProcess) {
    try {
      child.kill("SIGTERM")
    } catch {}
    const t = setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) {
        try {
          child.kill("SIGKILL")
        } catch {}
      }
    }, this.deps.killGraceMs ?? 3000)
    t.unref?.()
  }

  /** Stop the process this instance owns (no-op otherwise). Resolves when it exited or after the grace period. */
  stop(): Promise<void> {
    const child = this.child
    if (!child) {
      if (this.state.status !== "stopped") this.set({ status: "stopped", binary: this.state.binary })
      return Promise.resolve()
    }
    this.stopping = true
    return new Promise((resolve) => {
      const done = () => resolve()
      child.once("exit", done)
      this.kill(child)
      setTimeout(done, (this.deps.killGraceMs ?? 3000) + 500).unref?.()
    })
  }

  async restart() {
    await this.stop()
    return this.start()
  }
}
