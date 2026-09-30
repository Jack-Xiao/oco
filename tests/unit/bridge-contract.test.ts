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
