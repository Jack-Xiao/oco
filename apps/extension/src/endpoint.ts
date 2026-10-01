// Endpoint identity and directory comparison (pure; unit-tested).
import * as crypto from "node:crypto"
import * as fs from "node:fs"
import * as path from "node:path"

export type Endpoint = { origin: string; host: string; username: string; connectionId: string; cleartext: boolean; managed?: boolean }

export function isLoopbackHost(host: string) {
  const h = host.replace(/^\[|\]$/g, "").toLowerCase()
  return h === "localhost" || h === "::1" || /^127\.\d+\.\d+\.\d+$/.test(h)
}

/** Validates the configured server URL and derives a stable connection identity from it. */
export function endpointFromSetting(raw: string, username: string): Endpoint {
  let u: URL
  try {
    u = new URL(raw.trim())
  } catch {
    throw new Error(`oco.serverUrl is not a valid URL`)
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("oco.serverUrl only supports http/https")
  if (u.username || u.password) throw new Error("oco.serverUrl cannot include a username or password. Use the “oco: Set Server Password” command")
  if ((u.pathname && u.pathname !== "/") || u.search || u.hash) throw new Error("oco.serverUrl must be an origin only (for example http://127.0.0.1:4096)")
  const user = username.trim() || "opencode"
  const origin = u.origin
  const connectionId = "c" + crypto.createHash("sha256").update(`${origin}|${user}`).digest("hex").slice(0, 16)
  return { origin, host: u.hostname, username: user, connectionId, cleartext: u.protocol === "http:" && !isLoopbackHost(u.hostname) }
}

/** Endpoint of the server oco started itself. The identity is the binary + project, not the random port,
 *  so panels stay bound across a managed restart. */
export function managedEndpoint(url: string, binary: string, directory: string, username = "opencode"): Endpoint {
  const u = new URL(url)
  if (!isLoopbackHost(u.hostname)) throw new Error("The managed server can only listen on a loopback address")
  const connectionId = "m" + crypto.createHash("sha256").update(`managed|${binary}|${directory}|${username}`).digest("hex").slice(0, 16)
  return { origin: u.origin, host: u.hostname, username, connectionId, cleartext: false, managed: true }
}

function norm(p: string) {
  let n = path.normalize(p)
  if (n.length > 1 && n.endsWith(path.sep)) n = n.slice(0, -1)
  return n
}

/** Same project directory. realpath only when the path is on this host (local server). */
export function sameDirectory(folder: string, serverDir: string, local: boolean): boolean {
  if (norm(folder) === norm(serverDir)) return true
  if (!local) return false
  try {
    return fs.realpathSync.native(folder) === fs.realpathSync.native(serverDir)
  } catch {
    return false
  }
}
