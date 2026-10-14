import { describe, expect, mock, test } from "bun:test"

mock.module("vscode", () => ({}))
import { formatTerminalOutput } from "../../apps/extension/src/terminal-output"

describe("formatTerminalOutput", () => {
  test("strips ANSI and OSC sequences and keeps the visible text in a fence", () => {
    const raw = "\u001B[31mred\u001B[0m \u001B]0;secret-title\u0007ok\u001B]8;;http://example.com\u001B\\link"
    const { text, source } = formatTerminalOutput({ command: "echo", exitCode: 0, output: raw })
    expect(text.startsWith("Terminal: `echo` (exit 0)\n```\n")).toBe(true)
    expect(text).toContain("red oklink")
    expect(text).not.toContain("secret-title")
    expect(text).not.toContain("example.com")
    expect(text).not.toContain("\u001B")
    expect(source).toEqual({ kind: "terminal", command: "echo", exitCode: 0, truncated: false })
  })
  test("includes a non-zero exit code and omits it when the shell did not report one", () => {
    const failed = formatTerminalOutput({ command: "npm test", exitCode: 1, output: "fail\n" })
    expect(failed.text.startsWith("Terminal: `npm test` (exit 1)\n")).toBe(true)
    expect(failed.text).toContain("```\nfail\n```")
    expect(failed.source).toEqual({ kind: "terminal", command: "npm test", exitCode: 1, truncated: false })
    const unknown = formatTerminalOutput({ command: "echo hi", output: "hi" })
    expect(unknown.text.startsWith("Terminal: `echo hi`\n")).toBe(true)
    expect(unknown.text).not.toContain("exit")
    expect(unknown.source).toEqual({ kind: "terminal", command: "echo hi", truncated: false })
  })
  test("truncation keeps the header and the tail of the fenced output", () => {
    const output = ["line-1", "line-2", "line-3", "line-4"].join("\n")
    const { text, source } = formatTerminalOutput({ command: "cmd", exitCode: 2, output }, { maxLines: 2 })
    expect(source).toEqual({ kind: "terminal", command: "cmd", exitCode: 2, truncated: true })
    expect(text).toBe(["Terminal: `cmd` (exit 2)", "… showing last 2 of 6 lines", "line-4", "```"].join("\n"))
    expect(text).not.toContain("line-1")
  })
})
