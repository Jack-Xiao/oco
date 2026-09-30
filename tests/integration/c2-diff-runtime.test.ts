// Executed by c2-diff-runtime.mjs inside the pinned upstream test harness.
import { afterEach, expect } from "bun:test"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { Effect, Layer } from "effect"
import { Snapshot } from "../../src/snapshot"
import { SessionSummary } from "../../src/session/summary"
import { disposeAllInstances, testInstanceStoreLayer, TestInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const it = testEffect(Layer.mergeAll(
  LayerNode.compile(LayerNode.group([Snapshot.node, SessionSummary.node, FSUtil.node])),
  testInstanceStoreLayer,
))
afterEach(disposeAllInstances)
const write = (file: string, content: string | Uint8Array) => FSUtil.Service.use(fs => fs.writeWithDirs(file, content))
const remove = (file: string) => FSUtil.Service.use(fs => fs.remove(file))
// Only step boundaries are synthetic; snapshot trees, Git, and computeDiff are real.
const turn = (from: string | undefined, to: string | undefined) => [
  { parts: [{ type: "step-start", snapshot: from }, { type: "step-finish", snapshot: to }] },
] as any

it.instance("C2 repeated edits and external edit within a turn form net workspace diff", Effect.gen(function* () {
  const { directory } = yield* TestInstance
  const snapshot = yield* Snapshot.Service
  const summary = yield* SessionSummary.Service
  yield* write(`${directory}/main.txt`, "base\n")
  const from = yield* snapshot.track()
  yield* write(`${directory}/main.txt`, "intermediate\n")
  const middle = yield* snapshot.track()
  yield* write(`${directory}/main.txt`, "final\n")
  yield* write(`${directory}/external.txt`, "outside writer\n")
  const to = yield* snapshot.track()
  expect(from).toBeTruthy(); expect(middle).toBeTruthy(); expect(to).toBeTruthy()
  const diffs = yield* summary.computeDiff({ messages: [...turn(from, middle), ...turn(middle, to)] })
  expect(diffs.length).toBe(2)
  const main = diffs.find(d => d.file === "main.txt")!
  expect(main.patch).toContain("-base\n"); expect(main.patch).toContain("+final\n")
  expect(main.patch).not.toContain("intermediate")
  expect(diffs.find(d => d.file === "external.txt")?.status).toBe("added")
}), { git: true })

it.instance("C2 between-turn external edit becomes next baseline, not either turn change", Effect.gen(function* () {
  const { directory } = yield* TestInstance
  const snapshot = yield* Snapshot.Service
  const summary = yield* SessionSummary.Service
  yield* write(`${directory}/main.txt`, "base\n")
  const a = yield* snapshot.track()
  yield* write(`${directory}/main.txt`, "first\n")
  const b = yield* snapshot.track()
  yield* write(`${directory}/main.txt`, "outside\n")
  const c = yield* snapshot.track()
  yield* write(`${directory}/main.txt`, "second\n")
  const d = yield* snapshot.track()
  expect([a,b,c,d].every(Boolean)).toBe(true)
  const first = yield* summary.computeDiff({ messages: turn(a,b) })
  const second = yield* summary.computeDiff({ messages: turn(c,d) })
  expect(first[0].patch).toContain("+first\n"); expect(first[0].patch).not.toContain("outside")
  expect(second[0].patch).toContain("-outside\n"); expect(second[0].patch).toContain("+second\n")
  expect(second[0].patch).not.toContain("first")
}), { git: true })

it.instance("C2 create delete and transient file statuses", Effect.gen(function* () {
  const { directory } = yield* TestInstance
  const snapshot = yield* Snapshot.Service
  yield* write(`${directory}/deleted.txt`, "old\n")
  const from = yield* snapshot.track()
  yield* write(`${directory}/added.txt`, "new\n")
  yield* write(`${directory}/transient.txt`, "temporary\n")
  yield* snapshot.track()
  yield* remove(`${directory}/transient.txt`)
  yield* remove(`${directory}/deleted.txt`)
  const to = yield* snapshot.track()
  expect(from).toBeTruthy(); expect(to).toBeTruthy()
  const diff = yield* snapshot.diffFull(from!, to!)
  expect(diff.length).toBe(2)
  expect(diff.find(d => d.file === "added.txt")?.status).toBe("added")
  expect(diff.find(d => d.file === "deleted.txt")?.status).toBe("deleted")
  expect(diff.some(d => d.file === "transient.txt")).toBe(false)
}), { git: true })

it.instance("C2 snapshot false produces no tree", Effect.gen(function* () {
  expect(yield* (yield* Snapshot.Service).track()).toBeUndefined()
}), { git: true, config: { snapshot: false } })

it.instance("C2 non-git project produces no tree", Effect.gen(function* () {
  expect(yield* (yield* Snapshot.Service).track()).toBeUndefined()
}), { git: false })

it.instance("C2 oversized untracked file is omitted while small file is present", Effect.gen(function* () {
  const { directory } = yield* TestInstance
  const snapshot = yield* Snapshot.Service
  const from = yield* snapshot.track()
  yield* write(`${directory}/large.txt`, "x".repeat(2 * 1024 * 1024 + 1))
  yield* write(`${directory}/small.txt`, "visible\n")
  const to = yield* snapshot.track()
  expect(from).toBeTruthy(); expect(to).toBeTruthy()
  const diffs = yield* snapshot.diffFull(from!, to!)
  expect(diffs.map(d => d.file)).toEqual(["small.txt"])
}), { git: true })

it.instance("C2 binary diff has empty patch and no binary field", Effect.gen(function* () {
  const { directory } = yield* TestInstance
  const snapshot = yield* Snapshot.Service
  yield* write(`${directory}/binary.dat`, new Uint8Array([0,1,2]))
  const from = yield* snapshot.track()
  yield* write(`${directory}/binary.dat`, new Uint8Array([0,3,4]))
  const to = yield* snapshot.track()
  expect(from).toBeTruthy(); expect(to).toBeTruthy()
  const diffs = yield* snapshot.diffFull(from!, to!)
  expect(diffs).toEqual([{ file: "binary.dat", patch: "", additions: 0, deletions: 0, status: "modified" }])
}), { git: true })

it.instance("C2 missing either step boundary returns empty diff", Effect.gen(function* () {
  const snapshot = yield* Snapshot.Service
  const summary = yield* SessionSummary.Service
  const hash = yield* snapshot.track()
  expect(hash).toBeTruthy()
  expect(yield* summary.computeDiff({ messages: turn(hash, undefined) })).toEqual([])
  expect(yield* summary.computeDiff({ messages: turn(undefined, hash) })).toEqual([])
}), { git: true })
