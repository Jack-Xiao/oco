// Endpoint identity and directory comparison.
import { describe, expect, test } from "bun:test"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { endpointFromSetting, isLoopbackHost, sameDirectory } from "../../apps/extension/src/endpoint"

describe("endpointFromSetting", () => {
  test("accepts loopback http and normalizes an https origin, including a trailing slash", () => {
    const loop = endpointFromSetting("http://127.0.0.1:4517", "opencode")
    expect(loop).toMatchObject({
      origin: "http://127.0.0.1:4517",
      host: "127.0.0.1",
      username: "opencode",
      cleartext: false,
    })

    const secure = endpointFromSetting("https://h.example/", "alice")
    expect(secure.origin).toBe("https://h.example")
    expect(secure.host).toBe("h.example")
    expect(secure.username).toBe("alice")
    expect(secure.cleartext).toBe(false)
    expect(endpointFromSetting("https://H.Example", "alice").origin).toBe("https://h.example")
    expect(endpointFromSetting("http://127.0.0.1:4517/", "opencode").origin).toBe("http://127.0.0.1:4517")
  })

  test("rejects non-http protocols, embedded credentials, a path, a query, a hash, and invalid strings", () => {
    expect(() => endpointFromSetting("ftp://h.example", "opencode")).toThrow(/only supports http\/https/)
    expect(() => endpointFromSetting("ftp://127.0.0.1:4517", "opencode")).toThrow(/only supports http\/https/)
    expect(() => endpointFromSetting("http://user:pass@h.example", "opencode")).toThrow(/cannot include a username or password/)
    expect(() => endpointFromSetting("https://user:secret@127.0.0.1:4517", "opencode")).toThrow(/cannot include a username or password/)
    expect(() => endpointFromSetting("http://h.example/oc", "opencode")).toThrow(/must be an origin only/)
    expect(() => endpointFromSetting("https://h.example/a/b", "opencode")).toThrow(/must be an origin only/)
    expect(() => endpointFromSetting("http://127.0.0.1:4517?x=1", "opencode")).toThrow(/must be an origin only/)
    expect(() => endpointFromSetting("http://h.example#frag", "opencode")).toThrow(/must be an origin only/)
    expect(() => endpointFromSetting("http://h.example/a?b=1#c", "opencode")).toThrow(/must be an origin only/)
    expect(() => endpointFromSetting("not a url", "opencode")).toThrow(/not a valid URL/)
    expect(() => endpointFromSetting("://missing-scheme", "opencode")).toThrow(/not a valid URL/)
    expect(() => endpointFromSetting("", "opencode")).toThrow(/not a valid URL/)
  })

  test("the same origin and username share a connectionId; port or username changes it", () => {
    const a = endpointFromSetting("http://127.0.0.1:4517", "opencode")
    const again = endpointFromSetting("http://127.0.0.1:4517", "opencode")
    const slashed = endpointFromSetting("http://127.0.0.1:4517/", "opencode")
    const otherPort = endpointFromSetting("http://127.0.0.1:4518", "opencode")
    const otherUser = endpointFromSetting("http://127.0.0.1:4517", "other")
    const secureA = endpointFromSetting("https://h.example", "alice")
    const secureB = endpointFromSetting("https://h.example/", "alice")

    expect(a.connectionId).toBe(again.connectionId)
    expect(a.connectionId).toBe(slashed.connectionId)
    expect(secureA.connectionId).toBe(secureB.connectionId)
    expect(a.connectionId).not.toBe(otherPort.connectionId)
    expect(a.connectionId).not.toBe(otherUser.connectionId)
    expect(otherPort.connectionId).not.toBe(otherUser.connectionId)
  })

  test("cleartext is true only for non-loopback http", () => {
    expect(endpointFromSetting("http://10.0.0.1", "opencode").cleartext).toBe(true)
    expect(endpointFromSetting("http://h.example:4517", "opencode").cleartext).toBe(true)
    expect(endpointFromSetting("http://127.0.0.1:4517", "opencode").cleartext).toBe(false)
    expect(endpointFromSetting("http://localhost:4517", "opencode").cleartext).toBe(false)
    expect(endpointFromSetting("https://h.example", "opencode").cleartext).toBe(false)
    expect(endpointFromSetting("https://10.0.0.1", "opencode").cleartext).toBe(false)
    const v6 = endpointFromSetting("http://[::1]:4517", "opencode")
    expect(v6.cleartext).toBe(false)
    expect(isLoopbackHost(v6.host)).toBe(true)
  })
})

describe("isLoopbackHost", () => {
  test("recognizes localhost, 127/8 and ::1, and rejects a private address", () => {
    expect(isLoopbackHost("localhost")).toBe(true)
    expect(isLoopbackHost("LocalHost")).toBe(true)
    expect(isLoopbackHost("127.0.0.1")).toBe(true)
    expect(isLoopbackHost("127.1.2.3")).toBe(true)
    expect(isLoopbackHost("::1")).toBe(true)
    expect(isLoopbackHost("[::1]")).toBe(true)
    expect(isLoopbackHost("10.0.0.1")).toBe(false)
  })
})

describe("sameDirectory", () => {
  test("treats the same path and a trailing separator as the same directory", () => {
    expect(sameDirectory("/work/proj", "/work/proj", false)).toBe(true)
    expect(sameDirectory("/work/proj", "/work/proj/", false)).toBe(true)
    expect(sameDirectory("/work/proj/", "/work/proj", true)).toBe(true)
    expect(sameDirectory("/work/proj/", "/work/proj/", false)).toBe(true)
  })

  test("follows a symlink only when the server is local", async () => {
    const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "oco-endpoint-"))
    try {
      const real = path.join(root, "real")
      const other = path.join(root, "other")
      const link = path.join(root, "link")
      await fs.promises.mkdir(real)
      await fs.promises.mkdir(other)
      await fs.promises.symlink(real, link)
      expect(link).not.toBe(real)
      expect(sameDirectory(link, real, true)).toBe(true)
      expect(sameDirectory(real, link, true)).toBe(true)
      expect(sameDirectory(link + path.sep, real, true)).toBe(true)
      expect(sameDirectory(link, real, false)).toBe(false)
      expect(sameDirectory(real, link, false)).toBe(false)
      expect(sameDirectory(real, other, true)).toBe(false)
    } finally {
      await fs.promises.rm(root, { recursive: true, force: true })
    }
  })

  test("missing paths return false and do not throw", () => {
    const stamp = `${process.pid}-${Date.now()}`
    const a = path.join(os.tmpdir(), `oco-missing-${stamp}-a`)
    const b = path.join(os.tmpdir(), `oco-missing-${stamp}-b`)
    expect(fs.existsSync(a)).toBe(false)
    expect(fs.existsSync(b)).toBe(false)
    expect(sameDirectory(a, b, true)).toBe(false)
    expect(sameDirectory(a, b, false)).toBe(false)
    expect(sameDirectory(a, a + "-nope", true)).toBe(false)
  })
})
