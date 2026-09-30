// T013 agent source detection and file generation (real temp directories; no VS Code runtime).
import { describe, expect, test } from "bun:test"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { agentDirs, agentFileContent, agentRows, configFiles, newAgentPath, readFrontmatter, scanAgentFiles, validateAgentName } from "../../apps/extension/src/agents"

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "oco-agents-"))
const put = (f: string, s: string) => (fs.mkdirSync(path.dirname(f), { recursive: true }), fs.writeFileSync(f, s))

describe("agent files", () => {
  test("generated file round-trips description/mode, quoting YAML-hostile text", () => {
    const text = agentFileContent({ description: 'Review: "risky" code # not a comment', mode: "subagent", model: "p/m", temperature: 0.2, prompt: "Be strict." })
    expect(readFrontmatter(text)).toEqual({ description: 'Review: "risky" code # not a comment', mode: "subagent" })
    expect(text).toContain("model: \"p/m\"")
    expect(text.trimEnd().endsWith("Be strict.")).toBe(true)
  })

  test("names: letters/digits/._- only, no traversal", () => {
    expect(validateAgentName("reviewer")).toBeUndefined()
    expect(validateAgentName("code.review_2")).toBeUndefined()
    for (const bad of ["", "../x", "a/b", ".hidden", "a..b", "中文", "x".repeat(65)]) expect(validateAgentName(bad)).toBeDefined()
  })

  test("dirs follow the server merge order: user config, project .opencode up to worktree, ~/.opencode", () => {
    const d = agentDirs({ config: "/h/.config/opencode", directory: "/repo/pkg/a", worktree: "/repo", home: "/h" })
    expect(d.map((x) => `${x.scope}:${x.dir}`)).toEqual([
      "user:/h/.config/opencode",
      "project:/repo/pkg/a/.opencode",
      "project:/repo/pkg/.opencode",
      "project:/repo/.opencode",
      "user:/h/.opencode",
    ])
    // Non-git directory (worktree "/"): only the directory itself.
    expect(agentDirs({ config: "/c", directory: "/x/y", worktree: "/", home: "/h" }).filter((x) => x.scope === "project").map((x) => x.dir)).toEqual(["/x/y/.opencode"])
  })

  test("sources: file overrides by scope order; builtin/config-only; pending when file differs or is not loaded", () => {
    const root = tmp()
    const cfg = path.join(root, "cfg"), dir = path.join(root, "proj")
    put(path.join(cfg, "agent", "reviewer.md"), agentFileContent({ description: "user reviewer", mode: "subagent", prompt: "x" }))
    put(path.join(dir, ".opencode", "agents", "reviewer.md"), agentFileContent({ description: "project reviewer", mode: "subagent", prompt: "x" }))
    put(path.join(dir, ".opencode", "agent", "nested", "deep.md"), agentFileContent({ description: "deep", mode: "primary", prompt: "x" }))
    put(path.join(dir, ".opencode", "agent", "fresh.md"), agentFileContent({ description: "not yet", mode: "primary", prompt: "x" }))
    const files = scanAgentFiles(agentDirs({ config: cfg, directory: dir, worktree: dir, home: path.join(root, "home") }))
    expect(files.get("reviewer")?.scope).toBe("project")
    expect(files.has("nested/deep")).toBe(true)
    const rows = agentRows(
      [
        { name: "build", mode: "primary", native: true, description: "default" },
        { name: "title", mode: "primary", native: true, hidden: true },
        { name: "reviewer", mode: "subagent", description: "user reviewer" },
        { name: "nested/deep", mode: "primary", description: "deep" },
        { name: "jsononly", mode: "primary", description: "from opencode.json" },
      ],
      files,
    )
    const by = Object.fromEntries(rows.map((r) => [r.name, r]))
    expect(by.title).toBeUndefined()
    expect(by.build.source).toBe("builtin")
    expect(by.jsononly.source).toBe("config")
    expect(by["nested/deep"].state).toBe("active")
    expect(by.reviewer.state).toBe("pending") // server still has the user-scope description
    expect(by.fresh.state).toBe("pending")
    expect(by.fresh.server).toBeUndefined()
    expect(rows.at(-1)?.mode).toBe("subagent")
    // With config text: an agent defined nowhere any more is stale, one still in opencode.json stays active.
    const again = Object.fromEntries(agentRows([{ name: "jsononly", mode: "primary" }, { name: "gone", mode: "primary" }], new Map(), '{ "agent": { "jsononly": {} } }').map((r) => [r.name, r]))
    expect(again.jsononly.state).toBe("active")
    expect(again.gone.state).toBe("pending")
  })

  test("new file paths per scope; config files only when they exist", () => {
    const root = tmp()
    const p = { config: path.join(root, "cfg"), directory: path.join(root, "proj") }
    expect(newAgentPath(p, "project", "a")).toBe(path.join(root, "proj", ".opencode", "agent", "a.md"))
    expect(newAgentPath(p, "user", "a")).toBe(path.join(root, "cfg", "agent", "a.md"))
    expect(configFiles(p)).toEqual([])
    put(path.join(p.directory, "opencode.jsonc"), "{}")
    expect(configFiles(p)).toEqual([path.join(p.directory, "opencode.jsonc")])
  })
})
