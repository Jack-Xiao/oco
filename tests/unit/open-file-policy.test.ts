// open-file-policy: a page may only open regular files inside its bound, locally mapped session directory.
import { describe, expect, test } from "bun:test"
import { decideOpenFile, splitPosition, type OpenFileEnv } from "../../apps/extension/src/open-file-policy"

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
    expect(await decideOpenFile({ path: "../etc/hosts" }, e)).toEqual({ ok: false, reason: "路径超出会话目录" })
    expect(await decideOpenFile({ path: "/etc/hosts" }, e)).toEqual({ ok: false, reason: "路径超出会话目录" })
    expect(touched).toBe(false)
  })
  test("symlink escape is refused", async () => {
    expect(await decideOpenFile({ path: "escape/hosts" }, env({ ...FS }))).toEqual({ ok: false, reason: "路径超出会话目录" })
  })
  test("missing file, directory, invalid input and URI schemes", async () => {
    const e = env({ ...FS })
    expect(await decideOpenFile({ path: "src/missing.ts" }, e)).toEqual({ ok: false, reason: "文件不存在" })
    expect(await decideOpenFile({ path: "src" }, e)).toEqual({ ok: false, reason: "不是文件" })
    expect(await decideOpenFile({ path: "" }, e)).toEqual({ ok: false, reason: "路径无效" })
    expect(await decideOpenFile({ path: "a\0b" }, e)).toEqual({ ok: false, reason: "路径无效" })
    expect(await decideOpenFile({ path: "x".repeat(5000) }, e)).toEqual({ ok: false, reason: "路径无效" })
    expect(await decideOpenFile({ path: "file:///w/src/a.ts" }, e)).toEqual({ ok: false, reason: "只能打开本地文件路径" })
    expect(await decideOpenFile({ path: "vscode://x" }, e)).toEqual({ ok: false, reason: "只能打开本地文件路径" })
  })
  test("session directory not mapped to a local workspace folder (remote server, other checkout)", async () => {
    expect(await decideOpenFile({ path: "src/a.ts" }, env({ ...FS }, { workspaceRoots: ["/other"] }))).toEqual({ ok: false, reason: "会话目录不在当前工作区" })
    expect(await decideOpenFile({ path: "a.ts" }, env({ ...FS }, { directory: "/srv/remote" }))).toEqual({ ok: false, reason: "会话目录在本机不存在" })
    expect(await decideOpenFile({ path: "a.ts" }, env({ ...FS }, { directory: "rel" }))).toEqual({ ok: false, reason: "会话目录无效" })
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
    const e = env({ ...FS }, { directory: "/W", caseInsensitive: true, realpath: async (p) => (p.toLowerCase() === "/w" ? "/w" : p.toLowerCase() === "/w/src/a.ts" ? "/w/src/a.ts" : null) })
    expect(await decideOpenFile({ path: "src/A.ts" }, e)).toMatchObject({ ok: true, fsPath: "/w/src/a.ts" })
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
