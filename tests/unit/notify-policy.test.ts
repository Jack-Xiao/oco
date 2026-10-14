import { describe, expect, test } from "bun:test"
import {
  formatFailed,
  formatFinished,
  formatRunDuration,
  resolveLevel,
  shouldNotify,
  type NotifySettingsInspect,
} from "../../apps/extension/src/notify-policy"

describe("resolveLevel", () => {
  test("uses an explicit new key and ignores the legacy boolean", () => {
    const settings: NotifySettingsInspect = {
      needsMe: { globalValue: "always" },
      notifyPending: { globalValue: false },
    }
    expect(resolveLevel("needsMe", settings)).toBe("always")
    expect(resolveLevel("finished", { finished: { workspaceValue: "off" }, notifyPending: { globalValue: false } })).toBe("off")
  })

  test("legacy notifyPending false turns both kinds off when the new key is unset", () => {
    const settings: NotifySettingsInspect = { notifyPending: { globalValue: false } }
    expect(resolveLevel("needsMe", settings)).toBe("off")
    expect(resolveLevel("finished", settings)).toBe("off")
  })

  test("falls back to windowNotFocused when nothing is explicit", () => {
    expect(resolveLevel("needsMe")).toBe("windowNotFocused")
    expect(resolveLevel("finished", {})).toBe("windowNotFocused")
    expect(resolveLevel("needsMe", { notifyPending: { globalValue: true } })).toBe("windowNotFocused")
    expect(resolveLevel("finished", { notifyPending: { defaultValue: false }, finished: { defaultValue: "off" } })).toBe("windowNotFocused")
  })

  test("treats an illegal explicit value as the default, not the legacy off switch", () => {
    expect(
      resolveLevel("finished", {
        finished: { globalValue: "sometimes" },
        notifyPending: { globalValue: false },
      }),
    ).toBe("windowNotFocused")
    expect(resolveLevel("needsMe", { needsMe: { workspaceFolderValue: "" } })).toBe("windowNotFocused")
  })

  test("the most specific scope wins", () => {
    expect(
      resolveLevel("needsMe", {
        needsMe: { globalValue: "always", workspaceValue: "off" },
      }),
    ).toBe("off")
    expect(
      resolveLevel("finished", {
        finished: { workspaceValue: "always", workspaceFolderLanguageValue: "off" },
      }),
    ).toBe("off")
    expect(
      resolveLevel("needsMe", {
        needsMe: { globalValue: "always", workspaceValue: "nope" },
        notifyPending: { globalValue: false },
      }),
    ).toBe("windowNotFocused")
  })
})

describe("shouldNotify", () => {
  test("off, windowNotFocused, and always against focus", () => {
    for (const focused of [true, false]) {
      expect(shouldNotify("off", focused)).toBe(false)
      expect(shouldNotify("always", focused)).toBe(true)
    }
    expect(shouldNotify("windowNotFocused", true)).toBe(false)
    expect(shouldNotify("windowNotFocused", false)).toBe(true)
  })
})

describe("formatFinished / formatFailed", () => {
  test("joins present result fields and matches the sidebar duration", () => {
    expect(formatRunDuration(252_000)).toBe("4m12s")
    expect(formatRunDuration(3_720_000)).toBe("1h02m")
    expect(formatRunDuration(5_000)).toBe("5s")
    expect(formatFinished("Build", { files: [{}, {}, {}], durMs: 252_000 })).toBe(`"Build" finished · 3 files · 4m12s`)
    expect(formatFinished("Build", { files: [{}] })).toBe(`"Build" finished · 1 file`)
    expect(formatFinished("Build", { durMs: 90_000, costUsd: 0.2, lastText: "ok" })).toBe(
      `"Build" finished · 1m30s · $0.20 · ok`,
    )
    expect(formatFinished("Build", { costUsd: 0.002 })).toBe(`"Build" finished · <$0.01`)
    expect(formatFinished("Build", { costUsd: 0 })).toBe(`"Build" finished`)
    expect(formatFinished("Build")).toBe(`"Build" finished`)
    expect(formatFinished("Build", {})).toBe(`"Build" finished`)
    const long = "x".repeat(90)
    expect(formatFinished("Build", { lastText: `  ${long}\nmore` })).toBe(`"Build" finished · ${"x".repeat(80)}…`)
  })

  test("truncates the error to 120 characters", () => {
    expect(formatFailed("Build", "boom")).toBe(`"Build" failed: boom`)
    expect(formatFailed("Build", "  line1\nline2  ")).toBe(`"Build" failed: line1 line2`)
    expect(formatFailed("Build")).toBe(`"Build" failed`)
    expect(formatFailed("Build", "e".repeat(121))).toBe(`"Build" failed: ${"e".repeat(120)}`)
  })
})
