import { describe, expect, mock, test } from "bun:test"

// Mock vscode module for bun test environment before dynamic import
mock.module("vscode", () => ({}))

const { sandboxesFor } = await import("../../apps/extension/src/connection")
import type { Project } from "../../apps/extension/src/connection"

const same = (a: string, b: string) => a === b

describe("sandboxesFor", () => {
  test("collects sandboxes from projects matching a workspace folder", () => {
    const projects: Project[] = [
      { worktree: "/repo/main", sandboxes: ["/repo/wt-1", "/repo/wt-2"] },
    ]
    const folders = ["/repo/main"]
    const got = sandboxesFor(projects, folders, same)
    expect(got).toEqual(["/repo/wt-1", "/repo/wt-2"])
  })

  test("ignores projects that do not match any workspace folder", () => {
    const projects: Project[] = [
      { worktree: "/repo/other", sandboxes: ["/repo/wt-other"] },
      { worktree: "/repo/main", sandboxes: ["/repo/wt-1"] },
    ]
    const folders = ["/repo/main"]
    const got = sandboxesFor(projects, folders, same)
    expect(got).toEqual(["/repo/wt-1"])
  })

  test("ignores missing or empty string sandboxes", () => {
    const projects: Project[] = [
      { worktree: "/repo/main", sandboxes: ["", "/repo/wt-1", "   ", ""] },
      { worktree: "/repo/two" },
      { worktree: "/repo/three", sandboxes: [] },
    ]
    const folders = ["/repo/main", "/repo/two", "/repo/three"]
    const got = sandboxesFor(projects, folders, same)
    expect(got).toEqual(["/repo/wt-1"])
  })

  test("deduplicates sandboxes within a project and across multiple matched projects", () => {
    const projects: Project[] = [
      { worktree: "/repo/main", sandboxes: ["/repo/wt-1", "/repo/wt-1", "/repo/wt-2"] },
      { worktree: "/repo/sub", sandboxes: ["/repo/wt-2", "/repo/wt-3"] },
    ]
    const folders = ["/repo/main", "/repo/sub"]
    const got = sandboxesFor(projects, folders, same)
    expect(got).toEqual(["/repo/wt-1", "/repo/wt-2", "/repo/wt-3"])
  })

  test("handles empty projects or empty folders gracefully", () => {
    expect(sandboxesFor([], ["/repo/main"], same)).toEqual([])
    expect(sandboxesFor([{ worktree: "/repo/main", sandboxes: ["/repo/wt-1"] }], [], same)).toEqual([])
  })
})
