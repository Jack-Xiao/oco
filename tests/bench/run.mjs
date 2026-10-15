#!/usr/bin/env node
// Runs the vendored app's manual performance suite (`bun run test:bench` in vendor/opencode/packages/app, run as its two halves) without
// port clashes. Background: that suite's Playwright config serves the production bundle on PLAYWRIGHT_PORT (default 3000)
// and the specs / mock server treat PLAYWRIGHT_SERVER_PORT (default 4096) as "the OpenCode server". Port 4096 is also the
// default port of OpenCode-compatible CLIs (the Kilo Code extension runs `kilo serve` there), and 3000 is a common dev
// port. Only requests to PLAYWRIGHT_SERVER_PORT / the app port are answered by the mock; the build's default server
// (VITE_OPENCODE_SERVER_PORT, taken from PLAYWRIGHT_SERVER_PORT at config load) otherwise falls through to whatever really
// listens on 4096. This wrapper picks a free port and uses it for BOTH variables, which is what the performance config
// itself assumes (it sets PLAYWRIGHT_SERVER_PORT = PLAYWRIGHT_PORT for the specs).
//
//   node tests/bench/run.mjs                       # free port, whole suite
//   PLAYWRIGHT_PORT=4321 node tests/bench/run.mjs  # fixed port
//   node tests/bench/run.mjs -- --grep "tab switch" # arguments after `--` go to the Playwright half
// Nothing here changes vendor/**; it only sets environment variables for the child process.
import net from "node:net"
import path from "node:path"
import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
const appDir = path.join(root, "vendor/opencode/packages/app")

function canListen(port) {
  return new Promise((resolve) => {
    const srv = net.createServer()
    srv.once("error", () => resolve(false))
    // The preview server binds 0.0.0.0 (--host 0.0.0.0), so probe the wildcard address, not only loopback.
    srv.listen(port, "0.0.0.0", () => srv.close(() => resolve(true)))
  })
}

/** A free port in 20000-39999: below the OS ephemeral range (49152+), so outgoing connections cannot take it mid-run. */
export async function freePort() {
  for (let i = 0; i < 50; i++) {
    const port = 20000 + Math.floor(Math.random() * 20000)
    if (await canListen(port)) return port
  }
  throw new Error("no free port found in 20000-39999")
}

/** Environment for the child: the same free port for the app and for the (mocked) OpenCode server. */
export async function benchEnv(env = process.env, pick = freePort) {
  const given = env.PLAYWRIGHT_PORT && Number(env.PLAYWRIGHT_PORT) > 0 ? Number(env.PLAYWRIGHT_PORT) : undefined
  const port = given ?? (await pick())
  return { port, env: { ...env, PLAYWRIGHT_PORT: String(port), PLAYWRIGHT_SERVER_PORT: String(port), PLAYWRIGHT_BASE_URL: `http://127.0.0.1:${port}` } }
}

// Playwright options that take a separate value, so that value is not mistaken for a file filter.
const VALUE_OPTIONS = new Set(["-g", "--grep", "--grep-invert", "--project", "-j", "--workers", "--repeat-each", "--retries", "--timeout", "--reporter", "--max-failures", "--shard", "--output", "--tag", "--global-timeout", "--trace", "--ui-host", "--ui-port"])
/** True when the arguments already contain a positional file-path filter. */
export function hasFileFilter(args) {
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a.startsWith("-")) {
      if (VALUE_OPTIONS.has(a)) i++
      continue
    }
    return true
  }
  return false
}

function run(cmd, args, env) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd: appDir, env, stdio: "inherit" })
    const forward = (sig) => child.kill(sig)
    for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(sig, forward)
    child.on("exit", (code, signal) => {
      for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) process.off(sig, forward)
      resolve(code ?? (signal ? 1 : 0))
    })
  })
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  const rest = args[0] === "--" ? args.slice(1) : args
  // The package script is `bun test ./e2e/performance/unit && playwright test --config e2e/performance/playwright.config.ts`.
  // The unit half hard-codes the default server URL (127.0.0.1:4096) in its expectations, so it runs with the untouched
  // environment; only the Playwright half gets the free port. Same two commands, run in the same order.
  const unitEnv = { ...process.env }
  delete unitEnv.PLAYWRIGHT_PORT
  delete unitEnv.PLAYWRIGHT_SERVER_PORT
  delete unitEnv.PLAYWRIGHT_BASE_URL
  const unit = await run("bun", ["test", "./e2e/performance/unit"], unitEnv)
  if (unit !== 0) process.exit(unit)
  const { port, env } = await benchEnv()
  console.log(`bench: Playwright half, app and mock server on 127.0.0.1:${port} (PLAYWRIGHT_PORT = PLAYWRIGHT_SERVER_PORT)`)
  // The config's testDir is "." and it only ignores "unit/**", so Playwright also loads timeline-stability/fixture.test.ts, a
  // bun test that imports "bun:test" and aborts the whole run under Node ("Received protocol 'bun:'"). Positional arguments
  // are file-path regexes: restrict discovery to the specs unless the caller gave their own filter.
  const filters = hasFileFilter(rest) ? [] : ["\\.spec\\.ts$"]
  process.exit(await run("bunx", ["playwright", "test", "--config", "e2e/performance/playwright.config.ts", ...filters, ...rest], env))
}
