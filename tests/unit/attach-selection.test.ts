import { beforeEach, describe, expect, mock, test } from "bun:test"

const registeredCommands = new Map<string, (...args: any[]) => any>()
let activeEditor: any = undefined
let configValues: Record<string, any> = {}
const selectionListeners: (() => void)[] = []
const activeEditorListeners: (() => void)[] = []
const warningMessages: string[] = []

const vscodeMock = {
  commands: {
    registerCommand: (id: string, handler: (...args: any[]) => any) => {
      registeredCommands.set(id, handler)
      return {
        dispose: () => {
          registeredCommands.delete(id)
        },
      }
    },
  },
  window: {
    get activeTextEditor() {
      return activeEditor
    },
    showWarningMessage: (message: string) => {
      warningMessages.push(message)
      return Promise.resolve(undefined)
    },
    showQuickPick: (items: any[]) => Promise.resolve(items[0]),
    onDidChangeTextEditorSelection: (listener: () => void) => {
      selectionListeners.push(listener)
      return {
        dispose: () => {
          const idx = selectionListeners.indexOf(listener)
          if (idx >= 0) selectionListeners.splice(idx, 1)
        },
      }
    },
    onDidChangeActiveTextEditor: (listener: () => void) => {
      activeEditorListeners.push(listener)
      return {
        dispose: () => {
          const idx = activeEditorListeners.indexOf(listener)
          if (idx >= 0) activeEditorListeners.splice(idx, 1)
        },
      }
    },
  },
  workspace: {
    getConfiguration: (section?: string) => ({
      get: (key: string, defaultValue?: any) => {
        const fullKey = section ? `${section}.${key}` : key
        return configValues[fullKey] !== undefined ? configValues[fullKey] : defaultValue
      },
    }),
    asRelativePath: (uri: any) => (typeof uri === "string" ? uri : uri?.fsPath ?? String(uri)),
  },
  Range: class {
    constructor(public startLine: number, public startCol: number, public endLine: number, public endCol: number) {}
    get start() {
      return { line: this.startLine, character: this.startCol }
    }
    get end() {
      return { line: this.endLine, character: this.endCol }
    }
  },
  Uri: {
    file: (fsPath: string) => ({
      fsPath,
      scheme: "file",
      toString: () => `file://${fsPath}`,
    }),
  },
}

mock.module("vscode", () => vscodeMock)

const {
  AUTO_SELECTION_MAX_LINES,
  AutoSelectionTracker,
  chipLabel,
  registerAttachSelection,
  selectionChip,
} = await import("../../apps/extension/src/attach-selection")
type AttachSelectionPanels = import("../../apps/extension/src/attach-selection").AttachSelectionPanels

const { formatProblems } = await import("../../apps/extension/src/add-to-draft")
import type { Entry } from "../../apps/extension/src/panels"

describe("chipLabel", () => {
  test("formats range when start and end lines differ", () => {
    expect(chipLabel("src/math.ts", 3, 7)).toBe("src/math.ts:3-7")
  })

  test("formats single line when start and end lines are identical", () => {
    expect(chipLabel("src/math.ts", 3, 3)).toBe("src/math.ts:3")
  })

  test("normalizes backslashes to forward slashes", () => {
    expect(chipLabel("src\\utils\\math.ts", 3, 7)).toBe("src/utils/math.ts:3-7")
    expect(chipLabel("src\\utils\\math.ts", 5, 5)).toBe("src/utils/math.ts:5")
  })
})

describe("selectionChip", () => {
  test("sets label, path, line numbers, mime, and source.kind", () => {
    const res = selectionChip({
      path: "src/math.ts",
      startLine: 3,
      endLine: 7,
      text: "const x = 1\nconst y = 2",
      unsaved: true,
    })
    expect(res.text).toBe("const x = 1\nconst y = 2")
    expect(res.source).toEqual({
      kind: "selection",
      path: "src/math.ts",
      startLine: 3,
      endLine: 7,
      unsaved: true,
    })
    expect(res.chip).toEqual({
      label: "src/math.ts:3-7",
      path: "src/math.ts",
      startLine: 3,
      endLine: 7,
      mime: "text/plain",
    })
  })

  test("omits auto key when auto is false or undefined", () => {
    const withoutAuto = selectionChip({
      path: "src/math.ts",
      startLine: 1,
      endLine: 2,
      text: "hello",
      unsaved: false,
    })
    expect("auto" in withoutAuto.chip).toBe(false)
    expect(withoutAuto.chip.auto).toBeUndefined()

    const withAutoFalse = selectionChip({
      path: "src/math.ts",
      startLine: 1,
      endLine: 2,
      text: "hello",
      unsaved: false,
      auto: false,
    })
    expect("auto" in withAutoFalse.chip).toBe(false)
    expect(withAutoFalse.chip.auto).toBeUndefined()
  })

  test("includes auto: true when auto is true", () => {
    const withAuto = selectionChip({
      path: "src/math.ts",
      startLine: 1,
      endLine: 2,
      text: "hello",
      unsaved: false,
      auto: true,
    })
    expect("auto" in withAuto.chip).toBe(true)
    expect(withAuto.chip.auto).toBe(true)
  })

  test("auto chip truncates 401 lines to 400 lines plus notice, while manual chip does not truncate", () => {
    const lines401 = Array.from({ length: 401 }, (_, i) => `line ${i + 1}`).join("\n")

    const autoRes = selectionChip({
      path: "src/math.ts",
      startLine: 1,
      endLine: 401,
      text: lines401,
      unsaved: false,
      auto: true,
    })
    const autoLines = autoRes.text.split("\n")
    expect(autoLines.length).toBe(401)
    expect(autoLines[399]).toBe("line 400")
    expect(autoLines[400]).toBe(`… (first ${AUTO_SELECTION_MAX_LINES} of 401 lines)`)

    const manualRes = selectionChip({
      path: "src/math.ts",
      startLine: 1,
      endLine: 401,
      text: lines401,
      unsaved: false,
    })
    expect(manualRes.text).toBe(lines401)
    expect(manualRes.text.split("\n").length).toBe(401)
  })

  test("auto chip does not truncate when exactly 400 lines", () => {
    const lines400 = Array.from({ length: 400 }, (_, i) => `line ${i + 1}`).join("\n")
    const autoRes = selectionChip({
      path: "src/math.ts",
      startLine: 1,
      endLine: 400,
      text: lines400,
      unsaved: false,
      auto: true,
    })
    expect(autoRes.text).toBe(lines400)
  })
})

describe("AutoSelectionTracker", () => {
  test("tracks selections: same selection twice -> attach, skip; switch -> attach; clear -> clear; clear again -> skip; reselect -> attach", () => {
    const tracker = new AutoSelectionTracker()

    // 1. Same selection twice: first attach, then skip
    expect(tracker.next({ path: "src/math.ts", startLine: 1, endLine: 5 })).toBe("attach")
    expect(tracker.next({ path: "src/math.ts", startLine: 1, endLine: 5 })).toBe("skip")

    // 2. Switch selection: attach
    expect(tracker.next({ path: "src/math.ts", startLine: 2, endLine: 6 })).toBe("attach")

    // 3. Clear: clear
    expect(tracker.next(null)).toBe("clear")

    // 4. Clear again: skip
    expect(tracker.next(null)).toBe("skip")

    // 5. Reselect same place after clear: attach
    expect(tracker.next({ path: "src/math.ts", startLine: 2, endLine: 6 })).toBe("attach")
  })
})

describe("comparison with legacy draft paths", () => {
  test("formatProblems from add-to-draft does not have chip", () => {
    const problems = [
      {
        path: "src/app.ts",
        line: 10,
        column: 1,
        severity: "error" as const,
        message: "Type error",
        excluded: false,
      },
    ]
    const formatted = formatProblems(problems, "file", "src/app.ts")
    expect("chip" in formatted).toBe(false)
    expect((formatted as any).chip).toBeUndefined()
    expect(formatted.source.kind).toBe("problems")
  })
})

describe("registerAttachSelection wiring", () => {
  let insertedDrafts: { entry: Entry; text: string; source: any; chip?: any }[]
  let fakePanels: AttachSelectionPanels
  let mainEntry: Entry

  beforeEach(() => {
    insertedDrafts = []
    configValues = {}
    warningMessages.length = 0
    mainEntry = {
      role: "main",
      binding: { connectionId: "c1", directory: "/app", sessionId: "s1" },
      panel: { title: "Session 1" },
    } as any
    fakePanels = {
      list: () => [mainEntry],
      active: mainEntry,
      insertDraft: (entry, text, source, chip) => {
        insertedDrafts.push({ entry, text, source, chip })
        return Promise.resolve()
      },
    }
  })

  test("oco.addSelectionToDraft sends manual chip and handles empty selection as whole file", async () => {
    const disposables = registerAttachSelection(fakePanels, { debounceMs: 0 })

    const fakeDoc = {
      uri: { scheme: "file", fsPath: "/app/src/index.ts" },
      isDirty: false,
      lineCount: 15,
      getText: (range?: any) => (range ? "selected text" : "whole file content"),
    }
    activeEditor = {
      document: fakeDoc,
      selection: {
        isEmpty: false,
        start: { line: 2, character: 0 },
        end: { line: 4, character: 10 },
      },
    }

    const handler = registeredCommands.get("oco.addSelectionToDraft")
    expect(handler).toBeDefined()

    await handler!()
    expect(insertedDrafts.length).toBe(1)
    expect(insertedDrafts[0].chip).toEqual({
      label: "/app/src/index.ts:3-5",
      path: "/app/src/index.ts",
      startLine: 3,
      endLine: 5,
      mime: "text/plain",
    })
    expect(insertedDrafts[0].chip.auto).toBeUndefined()
    expect(insertedDrafts[0].text).toBe("selected text")

    // Empty selection takes entire file (startLine 1 to lineCount)
    activeEditor.selection = {
      isEmpty: true,
      start: { line: 0, character: 0 },
      end: { line: 0, character: 0 },
    }
    await handler!()
    expect(insertedDrafts.length).toBe(2)
    expect(insertedDrafts[1].chip).toEqual({
      label: "/app/src/index.ts:1-15",
      path: "/app/src/index.ts",
      startLine: 1,
      endLine: 15,
      mime: "text/plain",
    })
    expect(insertedDrafts[1].text).toBe("whole file content")

    for (const d of disposables) d.dispose()
  })

  test("automatic selection attaches on non-empty selection and clears on empty selection", async () => {
    const disposables = registerAttachSelection(fakePanels, { debounceMs: 0 })

    const fakeDoc = {
      uri: { scheme: "file", fsPath: "/app/src/index.ts" },
      isDirty: false,
      lineCount: 20,
      getText: () => "let a = 1",
    }
    activeEditor = {
      document: fakeDoc,
      selection: {
        isEmpty: false,
        start: { line: 0, character: 0 },
        end: { line: 0, character: 9 },
      },
    }

    // Trigger selection listener
    for (const l of selectionListeners) l()
    expect(insertedDrafts.length).toBe(1)
    expect(insertedDrafts[0].chip?.auto).toBe(true)
    expect(insertedDrafts[0].chip?.label).toBe("/app/src/index.ts:1")

    // Clearing selection triggers clear draft
    activeEditor.selection = {
      isEmpty: true,
      start: { line: 0, character: 0 },
      end: { line: 0, character: 0 },
    }
    for (const l of selectionListeners) l()
    expect(insertedDrafts.length).toBe(2)
    expect(insertedDrafts[1].text).toBe("")
    expect(insertedDrafts[1].chip).toEqual({
      label: "",
      path: "/app/src/index.ts",
      auto: true,
    })

    // When setting is false, no auto attach occurs
    configValues["oco.draft.attachSelection"] = false
    activeEditor.selection = {
      isEmpty: false,
      start: { line: 5, character: 0 },
      end: { line: 6, character: 0 },
    }
    for (const l of selectionListeners) l()
    expect(insertedDrafts.length).toBe(2)

    for (const d of disposables) d.dispose()
  })

  test("ignores disallowed document schemes and undefined editor", async () => {
    const disposables = registerAttachSelection(fakePanels, { debounceMs: 0 })

    activeEditor = undefined
    for (const l of activeEditorListeners) l()
    expect(insertedDrafts.length).toBe(0)

    activeEditor = {
      document: {
        uri: { scheme: "output", fsPath: "extension-output" },
        isDirty: false,
        lineCount: 1,
        getText: () => "log",
      },
      selection: {
        isEmpty: false,
        start: { line: 0, character: 0 },
        end: { line: 0, character: 3 },
      },
    }
    for (const l of selectionListeners) l()
    expect(insertedDrafts.length).toBe(0)

    for (const d of disposables) d.dispose()
  })
})

// Main-thread addition (card 13 review): the label does not count a line the selection only touches at column 0.
const { selectionLines } = await import("../../apps/extension/src/attach-selection")
describe("selectionLines (card 13)", () => {
  test("a selection ending at column 0 of a later line does not count that line", () => {
    expect(selectionLines({ start: { line: 1, character: 0 }, end: { line: 3, character: 0 } })).toEqual({ startLine: 2, endLine: 3 })
  })
  test("a selection ending inside a line counts it; a single-line selection is one line", () => {
    expect(selectionLines({ start: { line: 1, character: 2 }, end: { line: 2, character: 5 } })).toEqual({ startLine: 2, endLine: 3 })
    expect(selectionLines({ start: { line: 4, character: 0 }, end: { line: 4, character: 9 } })).toEqual({ startLine: 5, endLine: 5 })
  })
})
