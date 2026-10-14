import { describe, expect, mock, test } from "bun:test"

mock.module("vscode", () => ({}))
import { formatFix } from "../../apps/extension/src/fix-with-opencode"

describe("formatFix", () => {
  test("excluded files keep the path and diagnostics and drop the code", () => {
    const { text, source } = formatFix({
      path: "secrets/key.ts",
      line: 2,
      rules: { filesExclude: ["secrets/**"], gitignore: [] },
      lines: ['const token = "SECRET_VALUE"', "const x = 1", "const y = 2"],
      diagnostics: [{ message: "hardcoded secret", severity: "warning", line: 2, column: 7, source: "eslint", code: "no-secrets" }],
    })
    expect(text).toBe("Fix the following problem(s) in secrets/key.ts:2.\nsecrets/key.ts:2:7 warning [eslint(no-secrets)] hardcoded secret")
    expect(text).not.toContain("SECRET_VALUE")
    expect(source).toEqual({ kind: "fix", path: "secrets/key.ts", line: 2, count: 1, truncated: false })
  })
  test("includes a numbered window five lines around the range", () => {
    const lines = Array.from({ length: 30 }, (_, i) => `code-${i + 1}`)
    const { text, source } = formatFix({
      path: "src/a.ts",
      line: 10,
      endLine: 12,
      lines,
      language: "ts",
      diagnostics: [{ message: "bad", severity: "error", line: 10, column: 1, source: "ts", code: "2304" }],
    })
    expect(text.startsWith("Fix the following problem(s) in src/a.ts:10.\n")).toBe(true)
    expect(text).toContain("src/a.ts:10:1 error [ts(2304)] bad")
    expect(text).toContain("```ts\n")
    expect(text).toContain("5|code-5")
    expect(text).toContain("17|code-17")
    expect(text).not.toContain("4|code-4")
    expect(text).not.toContain("18|code-18")
    expect(source).toEqual({ kind: "fix", path: "src/a.ts", line: 10, count: 1, truncated: false })
  })
  test("caps the code window at 60 lines", () => {
    const lines = Array.from({ length: 100 }, (_, i) => `row-${i + 1}`)
    const { text } = formatFix({
      path: "src/a.ts",
      line: 1,
      endLine: 90,
      lines,
      diagnostics: [{ message: "wide", severity: "info", line: 1, column: 1 }],
    })
    expect(text).toContain("1|row-1")
    expect(text).toContain("60|row-60")
    expect(text).not.toContain("61|row-61")
  })
  test("truncation keeps the header and marks the source", () => {
    const diagnostics = [1, 2, 3, 4].map((n) => ({ message: `m${n}`, severity: "error" as const, line: n, column: 1 }))
    const { text, source } = formatFix({ path: "a.ts", line: 1, diagnostics }, { maxLines: 2 })
    expect(source).toEqual({ kind: "fix", path: "a.ts", line: 1, count: 4, truncated: true })
    expect(text).toBe(["Fix the following problem(s) in a.ts:1.", "… showing last 2 of 4 lines", "a.ts:3:1 error m3", "a.ts:4:1 error m4"].join("\n"))
  })
})