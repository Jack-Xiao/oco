// open-file-policy: a page may only open regular files inside its bound, locally mapped session directory.
import { describe, expect, test } from "bun:test"
import { decideOpenFile, probeCaseInsensitive, splitPosition, type OpenFileEnv } from "../../apps/extension/src/open-file-policy"

/** Fake file system: path -> "file" | "dir" | { link: target }. */
function env(fs: Record<string, "file" | "dir" | { link: string }>, over: Partial<OpenFileEnv> = {}): OpenFileEnv {
  const resolve = (p: string, depth = 0): string | null => {
    // resolve any symlinked prefix
    const parts = p.split("/").filter(Boolean)
    let cur = ""
    for (const part of parts) {
      cur += "/" + part
      const node = fs[cur]
      if (node === undefined) return null
      if (typeof node === "object") {
        if (depth > 8) return null
        const rest = p.slice(cur.length)
        return resolve(node.link + rest, depth + 1)
      }
    }
    return cur || "/"
  }
  return {
    directory: "/w",
    workspaceRoots: ["/w"],
    serverLocal: true,
    caseInsensitive: async () => false,
    realpath: async (p) => resolve(p),
    isFile: async (p) => fs[p] === "file",
    ...over,
  }
}

const FS = {
  "/w": "dir",
  "/w/src": "dir",
  "/w/src/a.ts": "file",
  "/w/escape": { link: "/etc" },
  "/w/inner": { link: "/w/src" },
  "/etc": "dir",
  "/etc/hosts": "file",
} as const

describe("decideOpenFile", () => {
  test("relative path inside the session directory", async () => {
    expect(await decideOpenFile({ path: "src/a.ts", line: 3 }, env({ ...FS }))).toEqual({ ok: true, fsPath: "/w/src/a.ts", line: 3, column: undefined })
  })
  test("absolute path inside the session directory", async () => {
    expect(await decideOpenFile({ path: "/w/src/a.ts" }, env({ ...FS }))).toMatchObject({ ok: true, fsPath: "/w/src/a.ts" })
  })
  test("symlink that stays inside is allowed and reported by its real path", async () => {
    expect(await decideOpenFile({ path: "inner/a.ts" }, env({ ...FS }))).toMatchObject({ ok: true, fsPath: "/w/src/a.ts" })
  })
  test("dot-dot escape is refused before touching the file system", async () => {
    let touched = false
    const e = env({ ...FS })
    const real = e.realpath
    e.realpath = async (p) => {
      if (p.startsWith("/etc")) touched = true
      return real(p)
    }
    expect(await decideOpenFile({ path: "../etc/hosts" }, e)).toEqual({ ok: false, reason: "Path is outside the session directory" })
    expect(await decideOpenFile({ path: "/etc/hosts" }, e)).toEqual({ ok: false, reason: "Path is outside the session directory" })
    expect(touched).toBe(false)
  })
  test("symlink escape is refused", async () => {
    expect(await decideOpenFile({ path: "escape/hosts" }, env({ ...FS }))).toEqual({ ok: false, reason: "Path is outside the session directory" })
  })
  test("missing file, directory, invalid input and URI schemes", async () => {
    const e = env({ ...FS })
    expect(await decideOpenFile({ path: "src/missing.ts" }, e)).toEqual({ ok: false, reason: "File does not exist" })
    expect(await decideOpenFile({ path: "src" }, e)).toEqual({ ok: false, reason: "Not a file" })
    expect(await decideOpenFile({ path: "" }, e)).toEqual({ ok: false, reason: "Invalid path" })
    expect(await decideOpenFile({ path: "a\0b" }, e)).toEqual({ ok: false, reason: "Invalid path" })
    expect(await decideOpenFile({ path: "x".repeat(5000) }, e)).toEqual({ ok: false, reason: "Invalid path" })
    expect(await decideOpenFile({ path: "file:///w/src/a.ts" }, e)).toEqual({ ok: false, reason: "Only local file paths can be opened" })
    expect(await decideOpenFile({ path: "vscode://x" }, e)).toEqual({ ok: false, reason: "Only local file paths can be opened" })
  })
  test("session directory not mapped to a local workspace folder (remote server, other checkout)", async () => {
    expect(await decideOpenFile({ path: "src/a.ts" }, env({ ...FS }, { workspaceRoots: ["/other"] }))).toEqual({ ok: false, reason: "Session directory is not in the current workspace" })
    expect(await decideOpenFile({ path: "a.ts" }, env({ ...FS }, { directory: "/srv/remote" }))).toEqual({ ok: false, reason: "Session directory does not exist on this machine" })
    expect(await decideOpenFile({ path: "a.ts" }, env({ ...FS }, { directory: "rel" }))).toEqual({ ok: false, reason: "Invalid session directory" })
  })
  test("session directory nested inside a workspace folder is accepted", async () => {
    expect(await decideOpenFile({ path: "a.ts" }, env({ ...FS }, { directory: "/w/src" }))).toMatchObject({ ok: true, fsPath: "/w/src/a.ts" })
  })
  test("bad line/column values are dropped, not trusted", async () => {
    const e = env({ ...FS })
    expect(await decideOpenFile({ path: "src/a.ts", line: 0, column: -1 }, e)).toMatchObject({ ok: true, line: undefined, column: undefined })
    expect(await decideOpenFile({ path: "src/a.ts", line: 1.5 }, e)).toMatchObject({ ok: true, line: undefined })
    expect(await decideOpenFile({ path: "src/a.ts", line: 12, column: 4 }, e)).toMatchObject({ ok: true, line: 12, column: 4 })
  })
  test("case-insensitive file systems compare containment without case", async () => {
    const e = env({ ...FS }, { directory: "/W", caseInsensitive: async () => true, realpath: async (p) => (p.toLowerCase() === "/w" ? "/w" : p.toLowerCase() === "/w/src/a.ts" ? "/w/src/a.ts" : null) })
    expect(await decideOpenFile({ path: "src/A.ts" }, e)).toMatchObject({ ok: true, fsPath: "/w/src/a.ts" })
  })
})

describe("local mapping", () => {
  test("a non-loopback server is refused even when the path exists in the workspace", async () => {
    expect(await decideOpenFile({ path: "src/a.ts" }, env({ ...FS }, { serverLocal: false }))).toEqual({
      ok: false,
      reason: "The server is not on this machine, so the path cannot be confirmed as a local file",
    })
  })
})

describe("case sensitivity is measured, not assumed", () => {
  // Case-sensitive volume: /w/Proj and /w/proj are two different directories.
  const CS = { "/w": "dir", "/w/Proj": "dir", "/w/Proj/a.ts": "file", "/w/proj": "dir", "/w/proj/a.ts": "file" } as const
  test("sensitive volume: session dir differing from the workspace root only by case is refused", async () => {
    const e = env({ ...CS }, { directory: "/w/proj", workspaceRoots: ["/w/Proj"] })
    expect(await decideOpenFile({ path: "a.ts" }, e)).toEqual({ ok: false, reason: "Session directory is not in the current workspace" })
  })
  test("measured insensitive volume: the same spelling difference is one directory and allowed", async () => {
    // One directory. Differently cased paths realpath to that one place, but the two realpath strings
    // still differ by case — only the measured-insensitive compare may treat them as the same.
    const canon: Record<string, string> = { "/w/proj": "/w/proj", "/w/Proj": "/w/Proj", "/w/proj/a.ts": "/w/Proj/a.ts" }
    const one = async (p: string) => canon[p] ?? null
    const e = env({}, { directory: "/w/proj", workspaceRoots: ["/w/Proj"], realpath: one, isFile: async (p) => p === "/w/Proj/a.ts", caseInsensitive: async () => true })
    expect(await decideOpenFile({ path: "a.ts" }, e)).toMatchObject({ ok: true, fsPath: "/w/Proj/a.ts" })
    const sensitive = env({}, { directory: "/w/proj", workspaceRoots: ["/w/Proj"], realpath: one, isFile: async (p) => p === "/w/Proj/a.ts", caseInsensitive: async () => false })
    expect(await decideOpenFile({ path: "a.ts" }, sensitive)).toEqual({ ok: false, reason: "Session directory is not in the current workspace" })
  })
  test("sensitive volume: a sibling differing only by case is outside the session directory", async () => {
    const e = env({ ...CS, "/w/src": "dir", "/w/src/a.ts": "file", "/w/Src": "dir", "/w/Src/a.ts": "file" }, { directory: "/w/src" })
    expect(await decideOpenFile({ path: "../Src/a.ts" }, e)).toEqual({ ok: false, reason: "Path is outside the session directory" })
    expect(await decideOpenFile({ path: "/w/Src/a.ts" }, e)).toEqual({ ok: false, reason: "Path is outside the session directory" })
  })
  test("probeCaseInsensitive: same inode, different inode, no letters, error", async () => {
    const st = (m: Record<string, number>) => async (p: string) => {
      if (!(p in m)) throw new Error("ENOENT")
      return { dev: 1, ino: m[p] }
    }
    expect(await probeCaseInsensitive("/Users/me/Proj", st({ "/Users/me/Proj": 7, "/Users/me/pROJ": 7 }))).toBe(true)
    expect(await probeCaseInsensitive("/Users/me/Proj", st({ "/Users/me/Proj": 7, "/Users/me/pROJ": 8 }))).toBe(false)
    expect(await probeCaseInsensitive("/Users/me/Proj", st({ "/Users/me/Proj": 7 }))).toBe(false)
    expect(await probeCaseInsensitive("/1/2", st({ "/1/2": 7 }))).toBe(false)
  })
  test("a failing probe is treated as case-sensitive", async () => {
    const e = env({ ...CS }, { directory: "/w/proj", workspaceRoots: ["/w/Proj"], caseInsensitive: async () => Promise.reject(new Error("x")) })
    expect(await decideOpenFile({ path: "a.ts" }, e)).toEqual({ ok: false, reason: "Session directory is not in the current workspace" })
  })
})

describe("position suffix", () => {
  const P = { ...FS, "/w/weird:3": "file" } as const
  test("path:line, path:line:col and #L open the file at that position", async () => {
    const e = env({ ...P })
    expect(await decideOpenFile({ path: "src/a.ts:12" }, e)).toEqual({ ok: true, fsPath: "/w/src/a.ts", line: 12, column: undefined })
    expect(await decideOpenFile({ path: "src/a.ts:12:5" }, e)).toEqual({ ok: true, fsPath: "/w/src/a.ts", line: 12, column: 5 })
    expect(await decideOpenFile({ path: "src/a.ts#L7" }, e)).toEqual({ ok: true, fsPath: "/w/src/a.ts", line: 7, column: undefined })
    expect(await decideOpenFile({ path: "src/a.ts#L7C2" }, e)).toEqual({ ok: true, fsPath: "/w/src/a.ts", line: 7, column: 2 })
  })
  test("a bare file name with a position is not mistaken for a URI scheme", async () => {
    const e = env({ ...P, "/w/math.ts": "file" })
    expect(await decideOpenFile({ path: "math.ts:4" }, e)).toEqual({ ok: true, fsPath: "/w/math.ts", line: 4, column: undefined })
    expect(await decideOpenFile({ path: "math.ts:4:2" }, e)).toMatchObject({ ok: true, line: 4, column: 2 })
    expect(await decideOpenFile({ path: "file:12x" }, e)).toEqual({ ok: false, reason: "Only local file paths can be opened" })
    expect(await decideOpenFile({ path: "vscode:4/x" }, e)).toEqual({ ok: false, reason: "Only local file paths can be opened" })
  })
  test("an existing literal file wins over parsing", async () => {
    expect(await decideOpenFile({ path: "weird:3" }, env({ ...P }))).toEqual({ ok: true, fsPath: "/w/weird:3", line: undefined, column: undefined })
  })
  test("parsed paths go through the same checks", async () => {
    const e = env({ ...P })
    expect(await decideOpenFile({ path: "missing.ts:3" }, e)).toEqual({ ok: false, reason: "File does not exist" })
    expect(await decideOpenFile({ path: "../x.ts:3" }, e)).toEqual({ ok: false, reason: "Path is outside the session directory" })
    expect(await decideOpenFile({ path: "../etc/hosts:3" }, e)).toEqual({ ok: false, reason: "Path is outside the session directory" })
    expect(await decideOpenFile({ path: "escape/hosts:3" }, e)).toEqual({ ok: false, reason: "Path is outside the session directory" })
    expect(await decideOpenFile({ path: "src:3" }, e)).toEqual({ ok: false, reason: "Not a file" })
  })
  test("an explicit line disables parsing", async () => {
    expect(await decideOpenFile({ path: "src/a.ts:12", line: 2 }, env({ ...P }))).toEqual({ ok: false, reason: "File does not exist" })
  })
})

describe("splitPosition", () => {
  test("path:line and path:line:col", () => {
    expect(splitPosition("src/a.ts:12")).toEqual({ path: "src/a.ts", line: 12, column: undefined })
    expect(splitPosition("src/a.ts:12:3")).toEqual({ path: "src/a.ts", line: 12, column: 3 })
  })
  test("#L anchors", () => {
    expect(splitPosition("src/a.ts#L7")).toEqual({ path: "src/a.ts", line: 7, column: undefined })
    expect(splitPosition("src/a.ts#L7C2")).toEqual({ path: "src/a.ts", line: 7, column: 2 })
  })
  test("plain paths and Windows drives are left alone", () => {
    expect(splitPosition("src/a.ts")).toEqual({ path: "src/a.ts" })
    expect(splitPosition("C:12")).toEqual({ path: "C:12" })
  })
})
