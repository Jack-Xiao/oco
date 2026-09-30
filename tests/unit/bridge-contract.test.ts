// Runtime validation of webview -> host `ui` messages, openFile in particular.
import { describe, expect, test } from "bun:test"
import { parseWebviewMessage, PROTOCOL_VERSION } from "../../packages/contracts/src/bridge"

const ui = (extra: Record<string, unknown>) => ({ v: PROTOCOL_VERSION, gen: 1, type: "ui", ...extra })

describe("parseWebviewMessage ui.openFile", () => {
  test("accepts path with optional 1-based line/column", () => {
    expect(parseWebviewMessage(ui({ action: "openFile", path: "src/a.ts" }))).not.toBeNull()
    expect(parseWebviewMessage(ui({ action: "openFile", path: "src/a.ts", line: 3, column: 1 }))).not.toBeNull()
  })
  test("rejects missing or oversized path", () => {
    expect(parseWebviewMessage(ui({ action: "openFile" }))).toBeNull()
    expect(parseWebviewMessage(ui({ action: "openFile", path: 7 }))).toBeNull()
    expect(parseWebviewMessage(ui({ action: "openFile", path: "x".repeat(4097) }))).toBeNull()
  })
  test("rejects non-positive, fractional or non-numeric positions", () => {
    for (const bad of [0, -1, 1.5, "3", Number.NaN, 1e9]) {
      expect(parseWebviewMessage(ui({ action: "openFile", path: "a", line: bad }))).toBeNull()
      expect(parseWebviewMessage(ui({ action: "openFile", path: "a", line: 1, column: bad }))).toBeNull()
    }
  })
  test("unknown actions are still rejected", () => {
    expect(parseWebviewMessage(ui({ action: "openFolder", path: "a" }))).toBeNull()
  })
})

describe("parseWebviewMessage ui.openFile focusAgeMs (C1 focus)", () => {
  test("accepts a non-negative finite age or none", () => {
    for (const ok of [undefined, 0, 12.5, 250, 1e9]) expect(parseWebviewMessage(ui({ action: "openFile", path: "a", focusAgeMs: ok }))).not.toBeNull()
  })
  test("rejects negative, non-finite or non-numeric ages", () => {
    for (const bad of [-1, Infinity, NaN, "10", null, {}]) expect(parseWebviewMessage(ui({ action: "openFile", path: "a", focusAgeMs: bad }))).toBeNull()
  })
})

describe("parseWebviewMessage T010 recovery actions", () => {
  test("the fixed recovery actions are accepted", () => {
    for (const action of ["retryConnection", "openSettings", "showSessions", "newSession", "closePanel"])
      expect(parseWebviewMessage(ui({ action }))).not.toBeNull()
  })
  test("a free-form command action is not", () => {
    expect(parseWebviewMessage(ui({ action: "command", command: "workbench.action.terminal.new" }))).toBeNull()
  })
})
