// checkpoint:
// 范围：apps/extension/src/add-to-draft.ts、tests/unit/add-to-draft.test.ts。未改其他文件。
// 进度：纯函数与 registerAddToDraft 已写入。typecheck 通过；bun test tests/unit 255 pass / 0 fail。
// 下一步：主线程接线 oco.addToDraft（extension.ts 注册 + package.json contributes）。命令未挂到激活路径，本批不打包。
import { describe, expect, mock, test } from "bun:test"

// The module imports "vscode" at load time (used only inside the command); the pure functions under test never touch it.
mock.module("vscode", () => ({}))
import { DRAFT_MAX_LINES, formatGitDiff, formatProblems, isExcluded, truncateTail } from "../../apps/extension/src/add-to-draft"

describe("truncateTail", () => {
  test("exactly maxLines is unchanged", () => {
    const text = "a\nb\nc"
    expect(truncateTail(text, 3)).toEqual({ text, truncated: false, total: 3 })
    expect(truncateTail("a\nb\nc\n", 3)).toEqual({ text: "a\nb\nc\n", truncated: false, total: 3 })
  })
  test("over maxLines keeps the tail and prefixes a notice", () => {
    const got = truncateTail("a\nb\nc\nd", 3)
    expect(got.truncated).toBe(true)
    expect(got.total).toBe(4)
    expect(got.text).toBe("… showing last 3 of 4 lines\nb\nc\nd")
  })
  test("default cap is 400 lines", () => {
    expect(DRAFT_MAX_LINES).toBe(400)
  })
})

describe("formatProblems", () => {
  test("groups by file, formats brackets, and hides excluded content", () => {
    const { text, source } = formatProblems(
      [
        { path: "src/a.ts", line: 10, column: 2, severity: "error", message: "Cannot find name", source: "ts", code: "2304", excluded: false },
        { path: "src/a.ts", line: 12, column: 1, severity: "warning", message: "unused", source: "eslint", excluded: false },
        { path: "node_modules/x.js", line: 1, column: 1, severity: "error", message: "SECRET_DIAG", source: "ts", code: "1", excluded: true },
        { path: "node_modules/x.js", line: 2, column: 1, severity: "warning", message: "ALSO_SECRET", excluded: true },
        { path: "src/b.ts", line: 3, column: 4, severity: "info", message: "note", excluded: false },
        { path: "src/c.ts", line: 1, column: 1, severity: "hint", message: "unused local", code: "6133", excluded: false },
      ],
      "all",
    )
    expect(text).toBe(
      [
        "Problems (all files, 6 problems)",
        "src/a.ts:10:2 error [ts(2304)] Cannot find name",
        "src/a.ts:12:1 warning [eslint] unused",
        "node_modules/x.js (excluded, 2 problems)",
        "src/b.ts:3:4 info note",
        "src/c.ts:1:1 hint [6133] unused local",
      ].join("\n"),
    )
    expect(text).not.toContain("SECRET_DIAG")
    expect(text).not.toContain("ALSO_SECRET")
    expect(source).toEqual({ kind: "problems", scope: "all", count: 6, truncated: false })
  })
  test("current file names the path and a single problem", () => {
    const { text, source } = formatProblems(
      [{ path: "src/a.ts", line: 1, column: 1, severity: "error", message: "boom", source: "ts", code: "2304", excluded: false }],
      "file",
    )
    expect(text).toBe("Problems (current file: src/a.ts, 1 problem)\nsrc/a.ts:1:1 error [ts(2304)] boom")
    expect(source).toEqual({ kind: "problems", scope: "file", path: "src/a.ts", count: 1, truncated: false })
  })
  test("truncation keeps the source line and the tail of the body", () => {
    const items = [1, 2, 3, 4].map((n) => ({
      path: "a.ts",
      line: n,
      column: 1,
      severity: "error" as const,
      message: "m" + n,
      excluded: false,
    }))
    const { text, source } = formatProblems(items, "all", { maxLines: 2 })
    expect(source.truncated).toBe(true)
    expect(text).toBe(["Problems (all files, 4 problems)", "… showing last 2 of 4 lines", "a.ts:3:1 error m3", "a.ts:4:1 error m4"].join("\n"))
  })
})

describe("formatGitDiff", () => {
  test("drops excluded hunks and keeps the others inside a diff fence", () => {
    const diff = [
      "diff --git a/src/a.ts b/src/a.ts",
      "index 111..222 100644",
      "--- a/src/a.ts",
      "+++ b/src/a.ts",
      "@@ -1 +1 @@",
      "-old",
      "+kept-line",
      "diff --git a/src/secret.ts b/src/secret.ts",
      "index 333..444 100644",
      "--- a/src/secret.ts",
      "+++ b/src/secret.ts",
      "@@ -1 +1 @@",
      "-SECRET_TOKEN",
      "+SECRET_TOKEN2",
      "diff --git a/src/b.ts b/src/b.ts",
      "index 555..666 100644",
      "--- a/src/b.ts",
      "+++ b/src/b.ts",
      "@@ -1 +1 @@",
      "-x",
      "+also-kept",
    ].join("\n")
    const { text, source } = formatGitDiff({
      diff,
      files: [
        { path: "src/a.ts", excluded: false },
        { path: "src/secret.ts", excluded: true },
        { path: "src/b.ts", excluded: false },
      ],
      scope: "working",
    })
    expect(text.startsWith("Git working tree diff (3 files)\n```diff\n")).toBe(true)
    expect(text).toContain("+kept-line")
    expect(text).toContain("+also-kept")
    expect(text).toContain("src/secret.ts (excluded)")
    expect(text).not.toContain("SECRET_TOKEN")
    expect(text).not.toContain("diff --git a/src/secret.ts")
    const fenced = text.slice(text.indexOf("```diff\n"), text.indexOf("\n```"))
    expect(fenced).not.toContain("secret")
    expect(source).toEqual({ kind: "gitDiff", scope: "working", files: 3, truncated: false })
  })
  test("staged diff with one file", () => {
    const { text, source } = formatGitDiff({
      diff: "diff --git a/src/a.ts b/src/a.ts\n@@ -1 +1 @@\n-a\n+b\n",
      files: [{ path: "src/a.ts", excluded: false }],
      scope: "staged",
    })
    expect(text.startsWith("Git staged diff (1 file)\n```diff\n")).toBe(true)
    expect(text).toContain("+b")
    expect(source).toEqual({ kind: "gitDiff", scope: "staged", files: 1, truncated: false })
  })
})

describe("isExcluded", () => {
  test("** matches across directories and not unrelated files", () => {
    const rules = { filesExclude: ["**/*.ts", "**/node_modules/**"], gitignore: [] }
    expect(isExcluded("a.ts", rules)).toBe(true)
    expect(isExcluded("src/b/c.ts", rules)).toBe(true)
    expect(isExcluded("src/b/c.js", rules)).toBe(false)
    expect(isExcluded("node_modules/pkg/index.js", rules)).toBe(true)
    expect(isExcluded("pkg/node_modules/a/b.js", rules)).toBe(true)
    expect(isExcluded("src/index.js", rules)).toBe(false)
  })
  test("trailing-slash directory rules and a leading slash anchor", () => {
    const rules = { filesExclude: [], gitignore: ["dist/", "/build/"] }
    expect(isExcluded("dist/app.js", rules)).toBe(true)
    expect(isExcluded("pkg/dist/a.js", rules)).toBe(true)
    expect(isExcluded("distinct/a.js", rules)).toBe(false)
    expect(isExcluded("build/a.js", rules)).toBe(true)
    expect(isExcluded("pkg/build/a.js", rules)).toBe(false)
  })
  test("negation overrides an earlier match, including across the two rule lists", () => {
    const rules = { filesExclude: ["*.log"], gitignore: ["!keep.log", "!/root.log"] }
    expect(isExcluded("other.log", rules)).toBe(true)
    expect(isExcluded("keep.log", rules)).toBe(false)
    expect(isExcluded("dir/keep.log", rules)).toBe(false)
    expect(isExcluded("root.log", rules)).toBe(false)
    expect(isExcluded("dir/root.log", rules)).toBe(true)
    expect(isExcluded("keep.log", { filesExclude: [], gitignore: ["*.log", "!keep.log", "*.log"] })).toBe(true)
    expect(isExcluded("a.ts", { filesExclude: [], gitignore: ["", "# comment", "*.ts"] })).toBe(true)
    expect(isExcluded("readme", { filesExclude: [], gitignore: ["# *.ts", ""] })).toBe(false)
  })
})
