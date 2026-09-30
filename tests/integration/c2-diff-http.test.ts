// Executed by c2-diff-runtime.mjs inside the pinned upstream test harness.
// Real snapshot trees, real SessionSummary.summarize persistence, real HTTP route. Only the
// session messages/parts are written directly (no model); they carry the snapshot hashes the
// processor would write at step-start / step-finish.
import { afterEach, expect } from "bun:test"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { Global } from "@opencode-ai/core/global"
import { ModelV2 } from "@opencode-ai/core/model"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { Effect, Layer } from "effect"
import { spawnSync } from "node:child_process"
import { existsSync, readdirSync, rmSync } from "node:fs"
import path from "node:path"
import { SessionPaths } from "@/server/routes/instance/httpapi/groups/session"
import { Session } from "@/session/session"
import { Storage } from "@/storage/storage"
import { Snapshot } from "../../src/snapshot"
import { SessionSummary } from "../../src/session/summary"
import { MessageID, PartID, type SessionID } from "../../src/session/schema"
import { resetDatabase } from "../fixture/db"
import { disposeAllInstances, TestInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { httpApiLayer, requestInDirectory } from "../server/httpapi-layer"

const it = testEffect(
  Layer.mergeAll(
    LayerNode.compile(LayerNode.group([Session.node, Storage.node, Snapshot.node, SessionSummary.node, FSUtil.node])),
    httpApiLayer,
  ),
)
afterEach(async () => {
  await disposeAllInstances()
  await resetDatabase()
})

const cfg = { git: true, config: { formatter: false, lsp: false } }
const write = (file: string, content: string) => FSUtil.Service.use((fs) => fs.writeWithDirs(file, content))
const model = { providerID: ProviderV2.ID.make("test"), modelID: ModelV2.ID.make("model") }
const tokens = { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } }

const user = (sessionID: SessionID) =>
  Session.use.updateMessage({
    id: MessageID.ascending(),
    sessionID,
    role: "user",
    agent: "build",
    model,
    time: { created: Date.now() },
  })

// One assistant step of a turn: step-start(from) ... step-finish(to), as processor.ts writes them.
const step = (sessionID: SessionID, parentID: MessageID, dir: string, from?: string, to?: string) =>
  Effect.gen(function* () {
    const a = yield* Session.use.updateMessage({
      id: MessageID.ascending(),
      sessionID,
      role: "assistant",
      mode: "build",
      agent: "build",
      path: { cwd: dir, root: dir },
      cost: 0,
      tokens,
      ...model,
      parentID,
      time: { created: Date.now() },
      finish: "stop",
    })
    yield* Session.use.updatePart({ id: PartID.ascending(), messageID: a.id, sessionID, type: "step-start", snapshot: from })
    yield* Session.use.updatePart({
      id: PartID.ascending(),
      messageID: a.id,
      sessionID,
      type: "step-finish",
      reason: "stop",
      snapshot: to,
      cost: 0,
      tokens,
    })
    return a
  })

const diffUrl = (sessionID: string, messageID?: string) =>
  SessionPaths.diff.replace(":sessionID", sessionID) + (messageID ? `?messageID=${messageID}` : "")

const get = (url: string, dir: string) =>
  Effect.gen(function* () {
    const res = yield* requestInDirectory(url, dir)
    return { status: res.status, body: (yield* res.json) as any[] }
  })

const withSession = () =>
  Effect.acquireRelease(Session.use.create({}), (s) => Session.use.remove(s.id).pipe(Effect.ignore))

it.instance(
  "C2 HTTP: summarize persists turn diff on the user message and GET returns it by messageID",
  () =>
    Effect.gen(function* () {
      const { directory } = yield* TestInstance
      const snapshot = yield* Snapshot.Service
      const summary = yield* SessionSummary.Service
      const session = yield* withSession()
      yield* write(`${directory}/a.txt`, "one\n")
      const u = yield* user(session.id)
      const from = yield* snapshot.track()
      yield* write(`${directory}/a.txt`, "two\n")
      yield* write(`${directory}/b.txt`, "new\n")
      const to = yield* snapshot.track()
      yield* step(session.id, u.id, directory, from, to)
      yield* summary.summarize({ sessionID: session.id, messageID: u.id })

      // persisted on the user message, not recomputed by GET
      const stored = (yield* Session.use.messages({ sessionID: session.id })).find((m) => m.info.id === u.id)!
      const diffs = (stored.info as any).summary?.diffs
      expect(diffs.map((d: any) => [d.file, d.status])).toEqual([
        ["a.txt", "modified"],
        ["b.txt", "added"],
      ])

      const ok = yield* get(diffUrl(session.id, u.id), directory)
      expect(ok.status).toBe(200)
      expect(ok.body).toEqual(diffs)
      expect(ok.body[0].patch).toContain("-one\n")
      expect(ok.body[0].patch).toContain("+two\n")

      // GET reads the stored copy: later workspace edits do not change it
      yield* write(`${directory}/a.txt`, "three\n")
      expect((yield* get(diffUrl(session.id, u.id), directory)).body).toEqual(diffs)
    }),
  cfg,
)

it.instance(
  "C2 HTTP: route is scoped by session and user message",
  () =>
    Effect.gen(function* () {
      const { directory } = yield* TestInstance
      const snapshot = yield* Snapshot.Service
      const summary = yield* SessionSummary.Service
      const s1 = yield* withSession()
      const s2 = yield* withSession()
      const u = yield* user(s1.id)
      const from = yield* snapshot.track()
      yield* write(`${directory}/a.txt`, "x\n")
      const to = yield* snapshot.track()
      const a = yield* step(s1.id, u.id, directory, from, to)
      yield* summary.summarize({ sessionID: s1.id, messageID: u.id })

      expect((yield* get(diffUrl(s1.id, u.id), directory)).body.length).toBe(1)
      expect((yield* get(diffUrl(s1.id), directory)).body).toEqual([]) // no messageID
      expect((yield* get(diffUrl(s2.id, u.id), directory)).body).toEqual([]) // other session
      expect((yield* get(diffUrl(s1.id, a.id), directory)).body).toEqual([]) // assistant id
    }),
  cfg,
)

it.instance(
  "C2 HTTP: missing step boundary stores an empty list, indistinguishable from no change",
  () =>
    Effect.gen(function* () {
      const { directory } = yield* TestInstance
      const snapshot = yield* Snapshot.Service
      const summary = yield* SessionSummary.Service
      const session = yield* withSession()
      const u = yield* user(session.id)
      const from = yield* snapshot.track()
      yield* write(`${directory}/a.txt`, "changed\n")
      yield* step(session.id, u.id, directory, from, undefined)
      yield* summary.summarize({ sessionID: session.id, messageID: u.id })
      const res = yield* get(diffUrl(session.id, u.id), directory)
      expect(res.status).toBe(200)
      expect(res.body).toEqual([])

      const u2 = yield* user(session.id)
      const same = yield* snapshot.track()
      yield* step(session.id, u2.id, directory, same, same)
      yield* summary.summarize({ sessionID: session.id, messageID: u2.id })
      expect((yield* get(diffUrl(session.id, u2.id), directory)).body).toEqual([])
    }),
  cfg,
)

// Find and delete the loose object for a blob in the snapshot git dir(s).
const dropBlob = (content: string) => {
  const hash = spawnSync("git", ["hash-object", "--stdin"], { input: content }).stdout.toString().trim()
  const root = path.join(Global.Path.data, "snapshot")
  const hits: string[] = []
  const walk = (dir: string, depth: number) => {
    if (depth > 4 || !existsSync(dir)) return
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (!e.isDirectory()) continue
      const obj = path.join(dir, e.name, "objects", hash.slice(0, 2), hash.slice(2))
      if (existsSync(obj)) hits.push(obj)
      walk(path.join(dir, e.name), depth + 1)
    }
  }
  walk(root, 0)
  for (const f of hits) rmSync(f, { force: true })
  return hits.length
}

// Observed: git diff --numstat fails on the unreadable blob, snapshot.ts git() does not check the exit
// code, so the whole diff (every file of the turn, including intact ones) comes back as [] with no error.
const blobCase = (side: "before" | "after") =>
  Effect.gen(function* () {
    const { directory } = yield* TestInstance
    const snapshot = yield* Snapshot.Service
    const summary = yield* SessionSummary.Service
    const session = yield* withSession()
    const u = yield* user(session.id)
    yield* write(`${directory}/a.txt`, "before-c2\n")
    yield* write(`${directory}/intact.txt`, "intact-1\n")
    const from = yield* snapshot.track()
    yield* write(`${directory}/a.txt`, "after-c2\n")
    yield* write(`${directory}/intact.txt`, "intact-2\n")
    const to = yield* snapshot.track()
    // control: before damage both files are present
    expect((yield* snapshot.diffFull(from!, to!)).map((d) => d.file)).toEqual(["a.txt", "intact.txt"])
    expect(dropBlob(side === "before" ? "before-c2\n" : "after-c2\n")).toBeGreaterThan(0)
    const diffs = yield* snapshot.diffFull(from!, to!)
    console.log(`[C2-blob-missing-${side}]`, JSON.stringify(diffs))
    expect(diffs).toEqual([])
    // and it persists / serves as an empty turn diff, same as "no change"
    yield* step(session.id, u.id, directory, from, to)
    yield* summary.summarize({ sessionID: session.id, messageID: u.id })
    const res = yield* get(diffUrl(session.id, u.id), directory)
    expect(res.status).toBe(200)
    expect(res.body).toEqual([])
  })

it.instance("C2 negative: missing after-blob empties the whole turn diff", () => blobCase("after"), cfg)
it.instance("C2 negative: missing before-blob empties the whole turn diff", () => blobCase("before"), cfg)
