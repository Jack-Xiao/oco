# 运行视图 M1（地基）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在会话标题栏加第三个视图“运行”（对话 | 轨迹 | 运行），实时看一次运行当前在做什么、哪些工具在并行、用量是否已结算，并能按步骤回看；产出可在干净上游上重放的补丁 `0019`。

**Architecture:** 纯函数 `buildRuntime(input, now)`（无 Solid、无网络）把 sync store 里的消息/part/状态/权限转成 `RuntimeModel`；回看用 `snapshotAt(cursor)` 先过滤数据再复用同一函数。视图 `session-runtime.tsx` 只做渲染和界面状态。复用现有 `buildTrajectory` 的请求划分，不改它；`usage`、运行状态、重试读原始数据，不用它合成过的值。

**Tech Stack:** SolidJS、bun test（`--conditions=solid --preload ./happydom.ts`）、`tsgo -b`、上游 OpenCode `51ef4be`（`@opencode-ai/sdk/v2/client` 类型）。

**Spec:** `docs/superpowers/specs/2026-10-02-runtime-dashboard-design.md`（已获批准）。证据：`docs/evidence/runtime-viz-open-items.md`、`docs/evidence/runtime-viz-calibration.md`。

**与 spec 的两处偏差（实现时以此为准，完成后回写 spec）：**
1. spec 第 3 段写“改 `message-timeline.tsx`（切换两项→三项）”“改 `session-trajectory-model.ts` 导出请求划分”。实际核对：`SessionViewToggle`/`SessionViewMode` 在 `session-trajectory.tsx`，`message-timeline.tsx` 只接收 `headerExtra`，**不需要改**；`buildTrajectory(...).requests` 已是公开输出，**不需要改 `session-trajectory-model.ts`**。
2. 需要改的是 `session-trajectory.tsx`（切换三项、`onChat` → `onView`）、`session-trajectory-i18n.ts`（`view.runtime`）、`pages/session.tsx`（增加 runtime 分支）。

**范围：** 只含 M1。M2（权限/提问按钮、取消、子代理加载与下钻）和 M3（机制图、思考流、嵌套折叠、E2E 全套）在 M1 落地后各写一份计划；因此 `RuntimeModel` 的**全部字段在 M1 冻结**（含 `attention[]`、`run.retry`、`sessions[]`），M2/M3 只加界面和数据加载，不改这份接口。

## Global Constraints

- “未知≠0”：`usage` 只在请求已结算且 token 总和 > 0 时 `known=true`；运行中的 0 不显示为已测量。
- `task` 调用 `completed` ≠ 子代理结束：子代理生命周期在 M1 只有 `running`（来自子会话的 `session_status`，`evidence: "event"`）或 `unknown`（`evidence: "inferred"`）。
- 一条 assistant 消息 = 一个“请求”；不以 `step-finish` 为请求边界。
- 推断必须标 `evidence: "inferred"`（`interrupted`、状态缺失、最后事件时间）。
- 重试、权限、最后事件时间、焦点、回看游标互相独立，不压成单一 running/done。
- v1 **不得出现“断连”**，只显示“最后事件 xx 前”。
- 实时模式没有未来进度、没有完成百分比；回看只按步骤，不做逐字打字。
- 历史不记录权限等待：回看时 `run.attentionKnown=false`，界面必须写明，不能显示成“没等待过”。
- 不改宿主、桥、公共契约；不新建 agent 引擎。
- 补丁 `0019` 须在干净 `51ef4be` 上依序 `git apply --check` 0001→0019 通过；补丁是 `git diff` 的 plain `diff --git` 格式（与 0001–0018 一致）。
- 文案 en / zh / zht 三语；放在 `session-runtime-i18n.ts`（`view.runtime` 除外，它必须在 `session-trajectory-i18n.ts`，因为切换器用那份字典）。
- 验证命令：单测 `cd vendor/opencode/packages/app && bun test --conditions=solid --preload ./happydom.ts <文件>`；类型 `cd vendor/opencode/packages/app && bun run typecheck`（即 `tsgo -b`）。仓库根的 `bun run typecheck` **不覆盖** vendor 代码，不得当作 0019 的证据。

## Review Focus

spec 隐含但没有任务专门覆盖的、最可能出问题的输入（每条在所属任务里有一个测试固定）：

1. 空会话（0 条消息）：不崩溃，`focus.kind="idle"`，`usage.requests=0`（Task 5）。
2. 同一消息 id 在 store 里出现两次（乐观副本 + 服务端副本）：不重复计请求/工具（由 `buildTrajectory` 去重，Task 3 固定）。
3. 超长工具名、超长输入/输出：摘要被截断，不撑破布局（Task 3、Task 8）。
4. 回看游标早于所有消息：返回空模型且不崩溃（Task 6）。
5. `task` 工具缺 `metadata.sessionId`（子会话还没建出来）：`child.sessionID` 为 `undefined`，生命周期 `unknown`（Task 3）。

---

## File Structure

新增（`vendor/opencode/packages/app/src/components/session/`）：

| 文件 | 职责 |
|---|---|
| `session-runtime-model.ts` | 类型 + `buildRuntime` + `snapshotAt` + `eventSessionID`；无 Solid、无网络 |
| `session-runtime-model.test.ts` | 单元测试（Task 2–6、10） |
| `session-runtime-i18n.ts` | 运行视图文案 en/zh/zht + `runtimeText` |
| `session-runtime-i18n.test.ts` | 三语键一致性 |
| `session-runtime.tsx` | 视图组件：渲染 + 界面状态（回看游标、定时刷新、事件到达记录） |

修改：`session-trajectory.tsx`（切换器三项、`onChat`→`onView`）、`session-trajectory-i18n.ts`（`view.runtime`）、`pages/session.tsx`（runtime 分支、`onView`）。

新增（仓库根）：`patches/opencode/0020-oco-runtime-view.patch`、`tests/e2e/c5-runtime.mjs`（Task 11，委派）。

---

### Task 1: 隔离的 vendor 工作副本 + 基线

主检出的 `vendor/opencode` 有 31 个未提交改动且被其他工作者使用，**不得**在其中开发。在本 worktree 里建自己的副本。

**Files:**
- Create（git 忽略）: `vendor/opencode/`（本 worktree 根下；`.gitignore` 已含 `vendor/opencode/`）

**Interfaces:**
- Produces: `vendor/opencode` 是一个 git 仓库，HEAD = 提交 “oco baseline 0001-0018”，其父提交 = `51ef4be1d3c122f18fefb510dca8d778571f4f18`；`bun test` 可在 `packages/app` 里运行。后续任务的 `git diff HEAD` 即补丁 0019 的内容。

- [ ] **Step 1: 克隆并固定到上游 SHA**

```bash
cd /Users/xiaojiang/Ai-Project/oco/.claude/worktrees/nostalgic-gates-ef74ca
git clone --quiet /Users/xiaojiang/Ai-Project/oco/vendor/opencode vendor/opencode
git -C vendor/opencode checkout --quiet --detach 51ef4be1d3c122f18fefb510dca8d778571f4f18
git -C vendor/opencode status --porcelain | wc -l
```

Expected: 最后一行 `0`（本地克隆只带已提交内容，不带主检出的未提交改动）。若不是 0，运行 `git -C vendor/opencode checkout --quiet -- .` 后再查。

- [ ] **Step 2: 依序应用 0001–0018 并提交基线**

```bash
for p in $(ls patches/opencode/*.patch | sort | head -18); do
  git -C vendor/opencode apply --check "$p" && git -C vendor/opencode apply "$p" && echo "applied $(basename $p)"
done
git -C vendor/opencode add -A packages
git -C vendor/opencode -c user.name=oco -c user.email=oco@local commit --quiet -m "oco baseline 0001-0018"
git -C vendor/opencode log --oneline -2
```

Expected: 18 行 `applied ...`，`git log` 第一行 `oco baseline 0001-0018`，第二行 `51ef4be release: v1.18.33`。任何 `--check` 失败就停止并报告：说明补丁序列在干净上游上本来就不通，不是本计划的问题。

- [ ] **Step 3: 安装依赖（不要软链接 node_modules）**

```bash
cd vendor/opencode && bun install --frozen-lockfile 2>&1 | tail -3
```

Expected: 安装完成无报错。软链接主检出的 `node_modules` 会让 `@opencode-ai/*` 的相对工作区链接解析回主检出的 vendor，禁止。需要网络或本地 bun 缓存；失败则报告 BLOCKED，不要改走软链接。

- [ ] **Step 4: 证明环境可用（现有轨迹测试）**

```bash
cd vendor/opencode/packages/app && bun test --conditions=solid --preload ./happydom.ts ./src/components/session/session-trajectory-model.test.ts 2>&1 | tail -4
```

Expected: `17 pass`、`0 fail`。

- [ ] **Step 5: 记录基线类型检查结果（后面用来区分新旧错误）**

```bash
cd vendor/opencode/packages/app && bun run typecheck > /private/tmp/claude-501/runtime-m1-typecheck-baseline.txt 2>&1; echo "exit=$?"; tail -3 /private/tmp/claude-501/runtime-m1-typecheck-baseline.txt
```

Expected: 记下 `exit=` 和错误数。若基线本身有错误，后续只要求**不新增**错误。无需提交（vendor 被 git 忽略）。

---

### Task 2: 类型冻结 + 运行状态（含重试、待处理、回看下的运行状态）

**Files:**
- Create: `vendor/opencode/packages/app/src/components/session/session-runtime-model.ts`
- Test: `vendor/opencode/packages/app/src/components/session/session-runtime-model.test.ts`

**Interfaces:**
- Consumes: `buildTrajectory`、`TrajectoryRequest`、`oneLine`、`subagentOf`、`idTime`（来自 `./session-trajectory-model`）；SDK 类型 `Message`、`Part`、`ToolPart`、`SessionStatus`、`PermissionRequest`、`QuestionRequest`。
- Produces（后续所有任务依赖，**名称与形状不得再改**）：

```ts
export type Evidence = "event" | "inferred"
export type RunState = "working" | "waiting-user" | "retrying" | "idle" | "error" | "unknown"
export type Stage = "prepare" | "model" | "tools" | "fill" | "idle"
export type ToolRef = { messageID: string; callID: string }
export type RuntimeAttention =
  | { kind: "permission"; id: string; sessionID: string; permission: string; patterns: string[]; toolRef?: ToolRef }
  | { kind: "question"; id: string; sessionID: string; text: string; toolRef?: ToolRef }
export type RuntimeRun = {
  state: RunState
  evidence: Evidence
  retry?: { attempt: number; message: string; next: number }
  attention: RuntimeAttention[]
  attentionKnown: boolean
}
export type RuntimeInput = {
  mode: "live" | "replay"
  sessionID: string
  parts: (messageID: string) => Part[]
  status: SessionStatus | undefined
  permissions: PermissionRequest[]
  questions: QuestionRequest[]
  childStatus: (sessionID: string) => SessionStatus | undefined
  requests: TrajectoryRequest[]
  lastEventAt?: number
  contextLimit?: number
}
export function buildRuntime(input: RuntimeInput, now: number): RuntimeModel
```

（`RuntimeModel` 其余字段在 Task 3–5 追加；本任务先让 `buildRuntime` 返回 `{ mode, run, requests: [], tools: [], ... }` 的最小形状，其余字段用空值占位并在后续任务替换——占位仅存在于本任务的中间状态，Task 5 结束时 `RuntimeModel` 必须完整。）

`RuntimeModel` 最终形状（Task 5 完成时）：

```ts
export type RuntimeModel = {
  mode: "live" | "replay"
  freshness: RuntimeFreshness
  run: RuntimeRun
  stage: Stage
  focus: RuntimeFocus
  sessions: RuntimeSession[]
  requests: RuntimeRequest[]
  tools: RuntimeTool[]
  events: RuntimeEvent[]
  usage: RuntimeUsage
}
```

- [ ] **Step 1: 写失败测试（测试夹具 + 运行状态 5 条）**

创建 `session-runtime-model.test.ts`：

```ts
// oco (patches/opencode/0019): runtime view data model.
import { describe, expect, test } from "bun:test"
import { buildTrajectory } from "./session-trajectory-model"
import { trajectoryText } from "./session-trajectory-i18n"
import { buildRuntime, type RuntimeInput } from "./session-runtime-model"

const language = trajectoryText({ locale: () => "en", intl: () => "en" })
const T0 = 1_790_000_000_000

/** An ascending OpenCode id created at `ms` (same encoding as packages/opencode/src/id/id.ts). */
const id = (prefix: string, ms: number, counter = 0) =>
  `${prefix}_${((BigInt(ms) * 4096n + BigInt(counter)) % 2n ** 48n).toString(16).padStart(12, "0")}AbCdEfGhIjKlMn`

const user = (ms: number) =>
  ({ id: id("msg", ms), sessionID: "s", role: "user", time: { created: ms }, agent: "build", model: {} }) as any

const assistant = (parent: any, ms: number, extra: Record<string, unknown> = {}) =>
  ({
    id: id("msg", ms),
    sessionID: "s",
    role: "assistant",
    parentID: parent.id,
    time: { created: ms, completed: ms + 2000 },
    modelID: "m",
    providerID: "p",
    mode: "build",
    agent: "build",
    path: { cwd: "/", root: "/" },
    cost: 0,
    tokens: { input: 100, output: 50, reasoning: 0, cache: { read: 900, write: 0 } },
    ...extra,
  }) as any

const tool = (ms: number, name: string, state: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
  ({ id: id("prt", ms), sessionID: "s", messageID: "", type: "tool", tool: name, callID: `c${ms}`, state, ...extra }) as any

type Fixture = {
  messages: any[]
  parts?: Record<string, any[]>
  now?: number
  busy?: boolean
  input?: Partial<RuntimeInput>
}

/** Runs the real trajectory builder, then buildRuntime over its requests (the production wiring). */
const runtime = (f: Fixture) => {
  const now = f.now ?? T0 + 10_000
  const parts = (messageID: string) => (f.parts?.[messageID] ?? []) as any[]
  const trajectory = buildTrajectory({ messages: f.messages, parts, now, busy: f.busy ?? true, language })
  return buildRuntime(
    {
      mode: "live",
      sessionID: "s",
      parts,
      status: undefined,
      permissions: [],
      questions: [],
      childStatus: () => undefined,
      requests: trajectory.requests,
      ...f.input,
    },
    now,
  )
}

const u = user(T0)
const running = assistant(u, T0 + 100, { time: { created: T0 + 100 } })

describe("run state", () => {
  test("busy status without anything else is working (event evidence)", () => {
    const m = runtime({ messages: [u, running], input: { status: { type: "busy" } } })
    expect(m.run.state).toBe("working")
    expect(m.run.evidence).toBe("event")
  })

  test("retry keeps attempt and next and is not folded into working", () => {
    const status = { type: "retry", attempt: 2, message: "429 rate limit", next: T0 + 30_000 } as const
    const m = runtime({ messages: [u, running], input: { status } })
    expect(m.run.state).toBe("retrying")
    expect(m.run.retry).toEqual({ attempt: 2, message: "429 rate limit", next: T0 + 30_000 })
  })

  test("a pending permission wins the state but the retry stays visible (independent)", () => {
    const status = { type: "retry", attempt: 1, message: "x", next: T0 + 1 } as const
    const permissions = [{ id: "per_1", sessionID: "s", permission: "edit", patterns: ["a.ts"], metadata: {}, always: [] }] as any
    const m = runtime({ messages: [u, running], input: { status, permissions } })
    expect(m.run.state).toBe("waiting-user")
    expect(m.run.retry?.attempt).toBe(1)
    expect(m.run.attention).toEqual([
      { kind: "permission", id: "per_1", sessionID: "s", permission: "edit", patterns: ["a.ts"], toolRef: undefined },
    ])
  })

  test("a missing status entry means idle, marked inferred", () => {
    const m = runtime({ messages: [u, assistant(u, T0 + 100)], busy: false })
    expect(m.run.state).toBe("idle")
    expect(m.run.evidence).toBe("inferred")
  })

  test("replay mode never claims an attention list and says so", () => {
    const permissions = [{ id: "per_1", sessionID: "s", permission: "edit", patterns: [], metadata: {}, always: [] }] as any
    const m = runtime({ messages: [u, running], input: { mode: "replay", permissions } })
    expect(m.run.attention).toEqual([])
    expect(m.run.attentionKnown).toBe(false)
    expect(m.run.state).toBe("working")
    expect(m.run.evidence).toBe("inferred")
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd vendor/opencode/packages/app && bun test --conditions=solid --preload ./happydom.ts ./src/components/session/session-runtime-model.test.ts 2>&1 | tail -6
```

Expected: FAIL（`Cannot find module './session-runtime-model'`）。

- [ ] **Step 3: 写最小实现**

创建 `session-runtime-model.ts`：

```ts
// oco (patches/opencode/0019): runtime view data model. Pure functions over the sync store's data; no network,
// no Solid. Contract and rules: docs/superpowers/specs/2026-10-02-runtime-dashboard-design.md (sections 1, 4).
import type { Part, PermissionRequest, QuestionRequest, SessionStatus } from "@opencode-ai/sdk/v2/client"
import type { TrajectoryRequest } from "./session-trajectory-model"

export type Evidence = "event" | "inferred"
export type RunState = "working" | "waiting-user" | "retrying" | "idle" | "error" | "unknown"
export type Stage = "prepare" | "model" | "tools" | "fill" | "idle"
export type ToolRef = { messageID: string; callID: string }

export type RuntimeAttention =
  | { kind: "permission"; id: string; sessionID: string; permission: string; patterns: string[]; toolRef?: ToolRef }
  | { kind: "question"; id: string; sessionID: string; text: string; toolRef?: ToolRef }

export type RuntimeRun = {
  state: RunState
  evidence: Evidence
  retry?: { attempt: number; message: string; next: number }
  attention: RuntimeAttention[]
  /** false in replay: history does not record approval waits, so an empty list proves nothing. */
  attentionKnown: boolean
}

export type RuntimeInput = {
  mode: "live" | "replay"
  sessionID: string
  parts: (messageID: string) => Part[]
  /** The sync store's session_status entry; undefined = no entry (OpenCode treats that as idle). */
  status: SessionStatus | undefined
  permissions: PermissionRequest[]
  questions: QuestionRequest[]
  childStatus: (sessionID: string) => SessionStatus | undefined
  /** `buildTrajectory(...).requests`: one assistant message = one request. */
  requests: TrajectoryRequest[]
  /** Arrival time of the newest event the view saw for this session (recorded in-app). */
  lastEventAt?: number
  /** Context window of the last request's model, when known. */
  contextLimit?: number
}

export type RuntimeModel = {
  mode: "live" | "replay"
  run: RuntimeRun
}

const attentionOf = (input: RuntimeInput): RuntimeAttention[] => {
  if (input.mode !== "live") return []
  const permissions = input.permissions.map<RuntimeAttention>((p) => ({
    kind: "permission",
    id: p.id,
    sessionID: p.sessionID,
    permission: p.permission,
    patterns: p.patterns,
    toolRef: p.tool ? { messageID: p.tool.messageID, callID: p.tool.callID } : undefined,
  }))
  const questions = input.questions.map<RuntimeAttention>((q) => ({
    kind: "question",
    id: q.id,
    sessionID: q.sessionID,
    text: q.questions[0]?.question ?? "",
    toolRef: q.tool ? { messageID: q.tool.messageID, callID: q.tool.callID } : undefined,
  }))
  return [...permissions, ...questions]
}

const runOf = (input: RuntimeInput): RuntimeRun => {
  if (input.mode === "replay") {
    const working = input.requests.some((r) => r.status === "running")
    return { state: working ? "working" : "idle", evidence: "inferred", attention: [], attentionKnown: false }
  }
  const status = input.status
  const attention = attentionOf(input)
  const retry =
    status?.type === "retry" ? { attempt: status.attempt, message: status.message, next: status.next } : undefined
  const last = input.requests[input.requests.length - 1]
  const state: RunState = attention.length
    ? "waiting-user"
    : retry
      ? "retrying"
      : status?.type === "busy"
        ? "working"
        : last?.status === "error"
          ? "error"
          : "idle"
  return { state, evidence: status ? "event" : "inferred", retry, attention, attentionKnown: true }
}

export function buildRuntime(input: RuntimeInput, _now: number): RuntimeModel {
  return { mode: input.mode, run: runOf(input) }
}
```

- [ ] **Step 4: 运行测试确认通过**

同 Step 2 命令。Expected: `5 pass`、`0 fail`。

- [ ] **Step 5: 类型检查不新增错误，然后提交到 vendor 的本地历史（仅为计算补丁用）**

```bash
cd vendor/opencode/packages/app && bun run typecheck 2>&1 | tail -3
```

Expected: 与 Task 1 Step 5 的基线相同。**不要 `git commit` 到 vendor 里**——Task 12 用 `git diff HEAD` 取补丁，需要保持改动未提交。

---

### Task 3: 工具（并行、稳定顺序、等待、子代理、最后输出）

**Files:**
- Modify: `session-runtime-model.ts`
- Test: `session-runtime-model.test.ts`（追加）

**Interfaces:**
- Consumes: Task 2 的 `RuntimeInput`、`ToolRef`。`subagentOf`、`oneLine`（`./session-trajectory-model`）。
- Produces:

```ts
export type RuntimeChild = {
  sessionID?: string
  agent: string
  description: string
  background: boolean
  lifecycle: "running" | "unknown"
  evidence: Evidence
}
export type RuntimeTool = {
  id: string            // part id; stable identity across updates
  callID: string
  messageID: string
  request: number       // index in RuntimeModel.requests
  name: string
  state: "pending" | "running" | "completed" | "error"
  input: string         // one-line summary
  lastOutput?: string   // last non-empty line; never set for task (subagent) rows
  start?: number
  end?: number
  awaiting?: { kind: "permission" | "question"; id: string }
  child?: RuntimeChild
}
export function toolInputSummary(part: ToolPart): string
```

- [ ] **Step 1: 写失败测试（追加到测试文件末尾）**

```ts
const done = (ms: number, input: Record<string, unknown>, output: string) => ({
  status: "completed",
  input,
  output,
  title: "t",
  metadata: {},
  time: { start: ms, end: ms + 400 },
})

describe("tools", () => {
  test("parallel tools keep part order and identity regardless of state changes", () => {
    const a = assistant(u, T0 + 100)
    const t1 = tool(T0 + 200, "read", done(T0 + 200, { filePath: "/a.ts" }, "x"), { messageID: a.id })
    const t2 = tool(T0 + 210, "bash", { status: "running", input: { command: "bun test" }, time: { start: T0 + 210 } }, { messageID: a.id })
    const t3 = tool(T0 + 220, "grep", { status: "pending", input: { pattern: "foo" }, raw: "" }, { messageID: a.id })
    const m = runtime({ messages: [u, a], parts: { [a.id]: [t1, t2, t3] } })
    expect(m.tools.map((t) => [t.name, t.state])).toEqual([
      ["read", "completed"],
      ["bash", "running"],
      ["grep", "pending"],
    ])
    expect(m.tools.map((t) => t.id)).toEqual([t1.id, t2.id, t3.id])
    expect(m.tools[1].input).toBe("bun test")
    expect(m.tools[0].request).toBe(0)
  })

  test("last output is the last non-empty line; running bash reads metadata.output", () => {
    const a = assistant(u, T0 + 100)
    const t1 = tool(T0 + 200, "bash", done(T0 + 200, { command: "x" }, "one\n\ntwo  \n\n"), { messageID: a.id })
    const t2 = tool(
      T0 + 210,
      "bash",
      { status: "running", input: { command: "y" }, metadata: { output: "building\nlinking" }, time: { start: T0 + 210 } },
      { messageID: a.id },
    )
    const t3 = tool(T0 + 220, "edit", { status: "error", input: {}, error: "no match for\nold string", time: { start: T0 + 220, end: T0 + 230 } }, { messageID: a.id })
    const m = runtime({ messages: [u, a], parts: { [a.id]: [t1, t2, t3] } })
    expect(m.tools.map((t) => t.lastOutput)).toEqual(["two", "linking", "old string"])
  })

  test("a permission linked by {messageID, callID} marks only that tool as awaiting", () => {
    const a = assistant(u, T0 + 100)
    const t1 = tool(T0 + 200, "edit", { status: "running", input: {}, time: { start: T0 + 200 } }, { messageID: a.id, callID: "call_A" })
    const t2 = tool(T0 + 210, "read", { status: "running", input: {}, time: { start: T0 + 210 } }, { messageID: a.id, callID: "call_B" })
    const permissions = [
      { id: "per_1", sessionID: "s", permission: "edit", patterns: [], metadata: {}, always: [], tool: { messageID: a.id, callID: "call_A" } },
    ] as any
    const m = runtime({ messages: [u, a], parts: { [a.id]: [t1, t2] }, input: { permissions } })
    expect(m.tools[0].awaiting).toEqual({ kind: "permission", id: "per_1" })
    expect(m.tools[1].awaiting).toBeUndefined()
    expect(m.run.attention[0]).toMatchObject({ kind: "permission", toolRef: { messageID: a.id, callID: "call_A" } })
  })

  test("a permission without a tool ref stays session-level (no tool is marked)", () => {
    const a = assistant(u, T0 + 100)
    const t1 = tool(T0 + 200, "bash", { status: "running", input: {}, time: { start: T0 + 200 } }, { messageID: a.id })
    const permissions = [{ id: "per_2", sessionID: "s", permission: "doom_loop", patterns: [], metadata: {}, always: [] }] as any
    const m = runtime({ messages: [u, a], parts: { [a.id]: [t1] }, input: { permissions } })
    expect(m.tools[0].awaiting).toBeUndefined()
    expect(m.run.attention).toHaveLength(1)
    expect(m.run.attention[0].toolRef).toBeUndefined()
  })

  test("a completed task call is not a finished subagent; a busy child session is running", () => {
    const a = assistant(u, T0 + 100)
    const task = tool(
      T0 + 200,
      "task",
      {
        status: "completed",
        input: { subagent_type: "explore", description: "find usages", background: true },
        output: "started",
        title: "t",
        metadata: { sessionId: "ses_child" },
        time: { start: T0 + 200, end: T0 + 300 },
      },
      { messageID: a.id },
    )
    const unknown = runtime({ messages: [u, a], parts: { [a.id]: [task] } })
    expect(unknown.tools[0].state).toBe("completed")
    expect(unknown.tools[0].child).toEqual({
      sessionID: "ses_child",
      agent: "explore",
      description: "find usages",
      background: true,
      lifecycle: "unknown",
      evidence: "inferred",
    })
    expect(unknown.tools[0].lastOutput).toBeUndefined()

    const busy = runtime({
      messages: [u, a],
      parts: { [a.id]: [task] },
      input: { childStatus: (id) => (id === "ses_child" ? { type: "busy" } : undefined) },
    })
    expect(busy.tools[0].child).toMatchObject({ lifecycle: "running", evidence: "event" })
  })

  test("a task without metadata.sessionId has no child session and an unknown lifecycle", () => {
    const a = assistant(u, T0 + 100)
    const task = tool(T0 + 200, "task", { status: "pending", input: { subagent_type: "general", description: "d" }, raw: "" }, { messageID: a.id })
    const m = runtime({ messages: [u, a], parts: { [a.id]: [task] } })
    expect(m.tools[0].child?.sessionID).toBeUndefined()
    expect(m.tools[0].child?.lifecycle).toBe("unknown")
  })

  test("very long input is truncated to one short line", () => {
    const a = assistant(u, T0 + 100)
    const long = "x".repeat(5000)
    const t1 = tool(T0 + 200, "bash", { status: "running", input: { command: long }, time: { start: T0 + 200 } }, { messageID: a.id })
    const m = runtime({ messages: [u, a], parts: { [a.id]: [t1] } })
    expect(m.tools[0].input.length).toBeLessThanOrEqual(121)
  })

  test("the same message stored twice is counted once", () => {
    const a = assistant(u, T0 + 100)
    const t1 = tool(T0 + 200, "read", { status: "running", input: {}, time: { start: T0 + 200 } }, { messageID: a.id })
    const m = runtime({ messages: [u, a, { ...a }], parts: { [a.id]: [t1] } })
    expect(m.tools).toHaveLength(1)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

同 Task 2 Step 2。Expected: FAIL（`m.tools` 为 `undefined`）。

- [ ] **Step 3: 实现**

在 `session-runtime-model.ts` 顶部 import 改为：

```ts
import type { Part, PermissionRequest, QuestionRequest, SessionStatus, ToolPart } from "@opencode-ai/sdk/v2/client"
import { oneLine, subagentOf, type TrajectoryRequest } from "./session-trajectory-model"
```

在 `RuntimeModel` 之前加入类型 `RuntimeChild`、`RuntimeTool`（见上方 Interfaces），把 `RuntimeModel` 改为：

```ts
export type RuntimeModel = {
  mode: "live" | "replay"
  run: RuntimeRun
  tools: RuntimeTool[]
}
```

在 `buildRuntime` 之前加入：

```ts
const lastLine = (text: string | undefined) => {
  if (!text) return undefined
  const line = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .pop()
  return line ? oneLine(line, 160) : undefined
}

const SUMMARY_KEYS = ["command", "filePath", "path", "pattern", "query", "url", "description", "prompt"]

export function toolInputSummary(part: ToolPart): string {
  const input = part.state.input
  const picked = SUMMARY_KEYS.map((k) => input[k]).find((v) => typeof v === "string" && v)
  return oneLine(typeof picked === "string" ? picked : (JSON.stringify(input) ?? ""), 120)
}

const lastOutputOf = (part: ToolPart) => {
  const s = part.state
  if (s.status === "completed") return lastLine(s.output)
  if (s.status === "error") return lastLine(s.error)
  if (s.status === "running") {
    const out = s.metadata?.output
    return typeof out === "string" ? lastLine(out) : undefined
  }
  return undefined
}

const sameCall = (ref: { messageID: string; callID: string } | undefined, part: ToolPart) =>
  !!ref && ref.messageID === part.messageID && ref.callID === part.callID

const toolOf = (part: ToolPart, request: number, input: RuntimeInput): RuntimeTool => {
  const s = part.state
  const sub = subagentOf(part)
  const childStatus = sub?.session ? input.childStatus(sub.session) : undefined
  const childRunning = !!childStatus && childStatus.type !== "idle"
  const live = input.mode === "live"
  const permission = live ? input.permissions.find((p) => sameCall(p.tool, part)) : undefined
  const question = live ? input.questions.find((q) => sameCall(q.tool, part)) : undefined
  return {
    id: part.id,
    callID: part.callID,
    messageID: part.messageID,
    request,
    name: part.tool,
    state: s.status,
    input: toolInputSummary(part),
    lastOutput: sub ? undefined : lastOutputOf(part),
    start: s.status === "pending" ? undefined : s.time.start,
    end: s.status === "completed" || s.status === "error" ? s.time.end : undefined,
    awaiting: permission
      ? { kind: "permission", id: permission.id }
      : question
        ? { kind: "question", id: question.id }
        : undefined,
    child: sub
      ? {
          sessionID: sub.session,
          agent: sub.agent,
          description: sub.description,
          background: part.state.input.background === true,
          lifecycle: childRunning ? "running" : "unknown",
          evidence: childRunning ? "event" : "inferred",
        }
      : undefined,
  }
}

const toolsOf = (input: RuntimeInput): RuntimeTool[] => {
  const tools: RuntimeTool[] = []
  for (const r of input.requests) {
    for (const part of input.parts(r.message.id)) {
      if (part.type === "tool") tools.push(toolOf(part, r.index, input))
    }
  }
  return tools
}
```

并把 `buildRuntime` 改为：

```ts
export function buildRuntime(input: RuntimeInput, _now: number): RuntimeModel {
  return { mode: input.mode, run: runOf(input), tools: toolsOf(input) }
}
```

- [ ] **Step 4: 运行测试确认通过**

Expected: `12 pass`、`0 fail`（Task 2 的 5 条 + 本任务 7 条）。若“同一消息出现两次”失败，说明 `buildTrajectory` 没有去重——停止并报告，不要自己在这里补去重（上游注释写明它会去重，见 `buildTrajectory` 内 “same id” 一段）。

- [ ] **Step 5: 类型检查不新增错误**（同 Task 2 Step 5）。

---

### Task 4: 请求与用量（已知/已结算/部分已知）

**Files:**
- Modify: `session-runtime-model.ts`
- Test: `session-runtime-model.test.ts`（追加）

**Interfaces:**
- Consumes: `TrajectoryRequest`（`.message`、`.index`、`.start`、`.firstToken`、`.end`、`.status`、`.error`）。
- Produces:

```ts
export type RuntimeTokens = { input: number; output: number; reasoning: number; cacheRead: number; cacheWrite: number }
export type RuntimeRequest = {
  index: number
  messageID: string
  turn: number
  start: number
  firstToken?: number
  end?: number
  status: "running" | "done" | "error" | "interrupted"
  evidence: Evidence            // "inferred" only for interrupted
  error?: string
  settled: boolean              // done or error
  known: boolean                // settled and token total > 0 (raw message tokens, NOT the trajectory's 0-filled copy)
  tokens?: RuntimeTokens        // only when known
}
export type RuntimeUsage = {
  requests: number
  knownRequests: number
  settled: boolean              // every request settled
  tokens?: RuntimeTokens        // sum over known requests only; undefined when none is known
  context: { used?: number; limit?: number }   // used = last known request's input + cacheRead + cacheWrite
}
```

- [ ] **Step 1: 写失败测试（追加）**

```ts
describe("usage", () => {
  test("a running request has unknown usage even though its raw tokens are zero", () => {
    const a = assistant(u, T0 + 100, { time: { created: T0 + 100 }, tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } } })
    const m = runtime({ messages: [u, a], input: { status: { type: "busy" } } })
    expect(m.requests[0]).toMatchObject({ settled: false, known: false })
    expect(m.requests[0].tokens).toBeUndefined()
    expect(m.usage.tokens).toBeUndefined()
    expect(m.usage.settled).toBe(false)
  })

  test("a completed request with zero reported tokens is unknown, not zero", () => {
    const a = assistant(u, T0 + 100, { tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } } })
    const m = runtime({ messages: [u, a], busy: false })
    expect(m.requests[0]).toMatchObject({ settled: true, known: false })
    expect(m.usage.knownRequests).toBe(0)
  })

  test("usage sums only known requests and reports how many were known", () => {
    const a1 = assistant(u, T0 + 100)
    const a2 = assistant(u, T0 + 3000, { tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } } })
    const a3 = assistant(u, T0 + 6000, { tokens: { input: 10, output: 5, reasoning: 1, cache: { read: 200, write: 3 } } })
    const m = runtime({ messages: [u, a1, a2, a3], busy: false })
    expect(m.usage.requests).toBe(3)
    expect(m.usage.knownRequests).toBe(2)
    expect(m.usage.tokens).toEqual({ input: 110, output: 55, reasoning: 1, cacheRead: 1100, cacheWrite: 3 })
    expect(m.usage.settled).toBe(true)
  })

  test("context used is the last known request's prompt tokens; limit passes through, unknown stays undefined", () => {
    const a1 = assistant(u, T0 + 100)
    const a2 = assistant(u, T0 + 3000, { tokens: { input: 10, output: 5, reasoning: 1, cache: { read: 200, write: 3 } } })
    const withLimit = runtime({ messages: [u, a1, a2], busy: false, input: { contextLimit: 200_000 } })
    expect(withLimit.usage.context).toEqual({ used: 213, limit: 200_000 })
    const without = runtime({ messages: [u, a1, a2], busy: false })
    expect(without.usage.context).toEqual({ used: 213, limit: undefined })
  })

  test("an interrupted request is marked inferred and not settled", () => {
    const old = assistant(u, T0 + 100, { time: { created: T0 + 100 } })
    const latest = assistant(u, T0 + 5000)
    const m = runtime({ messages: [u, old, latest], busy: true })
    const r = m.requests[0]
    expect(r.status).toBe("interrupted")
    expect(r.evidence).toBe("inferred")
    expect(r.settled).toBe(false)
  })

  test("an errored request is settled and carries its error", () => {
    const a = assistant(u, T0 + 100, { error: { name: "APIError", data: { message: "boom" } } })
    const m = runtime({ messages: [u, a], busy: false })
    expect(m.requests[0]).toMatchObject({ status: "error", settled: true })
    expect(m.requests[0].error).toBeTruthy()
  })
})
```

- [ ] **Step 2: 运行测试确认失败**（`m.requests` 为 `undefined`）。

- [ ] **Step 3: 实现**

加入类型 `RuntimeTokens`、`RuntimeRequest`、`RuntimeUsage`（见 Interfaces），`RuntimeModel` 增加 `requests: RuntimeRequest[]`、`usage: RuntimeUsage`，并加入：

```ts
const rawTokens = (r: TrajectoryRequest): RuntimeTokens => {
  const t = r.message.tokens
  return { input: t.input, output: t.output, reasoning: t.reasoning, cacheRead: t.cache.read, cacheWrite: t.cache.write }
}
const tokenTotal = (t: RuntimeTokens) => t.input + t.output + t.reasoning + t.cacheRead + t.cacheWrite

const requestOf = (r: TrajectoryRequest): RuntimeRequest => {
  const settled = r.status === "done" || r.status === "error"
  const raw = rawTokens(r)
  const known = settled && tokenTotal(raw) > 0
  return {
    index: r.index,
    messageID: r.message.id,
    turn: r.turn,
    start: r.start,
    firstToken: r.firstToken,
    end: r.end,
    status: r.status,
    evidence: r.status === "interrupted" ? "inferred" : "event",
    error: r.error,
    settled,
    known,
    tokens: known ? raw : undefined,
  }
}

const usageOf = (requests: RuntimeRequest[], limit: number | undefined): RuntimeUsage => {
  const known = requests.filter((r) => r.known)
  const sum = known.reduce<RuntimeTokens>(
    (a, r) => ({
      input: a.input + r.tokens!.input,
      output: a.output + r.tokens!.output,
      reasoning: a.reasoning + r.tokens!.reasoning,
      cacheRead: a.cacheRead + r.tokens!.cacheRead,
      cacheWrite: a.cacheWrite + r.tokens!.cacheWrite,
    }),
    { input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0 },
  )
  const last = known[known.length - 1]?.tokens
  return {
    requests: requests.length,
    knownRequests: known.length,
    settled: requests.every((r) => r.settled),
    tokens: known.length ? sum : undefined,
    context: { used: last ? last.input + last.cacheRead + last.cacheWrite : undefined, limit },
  }
}
```

`buildRuntime`：

```ts
export function buildRuntime(input: RuntimeInput, _now: number): RuntimeModel {
  const requests = input.requests.map(requestOf)
  return { mode: input.mode, run: runOf(input), tools: toolsOf(input), requests, usage: usageOf(requests, input.contextLimit) }
}
```

- [ ] **Step 4: 运行测试确认通过。** Expected: `18 pass`。若 “interrupted” 一条失败，先读 `session-trajectory-model.ts` 349–376 行确认触发条件（更早的未完成请求在 `busy=true` 且不是最后一个时为 `interrupted`），调整**测试夹具**而不是放宽断言。

- [ ] **Step 5: 类型检查不新增错误。**

---

### Task 5: 阶段、焦点、事件日志、最后事件时间、会话列表

**Files:**
- Modify: `session-runtime-model.ts`
- Test: `session-runtime-model.test.ts`（追加）

**Interfaces:**
- Consumes: Task 2–4 的类型。
- Produces（`RuntimeModel` 至此完整，见 Task 2 的最终形状）：

```ts
export type RuntimeFocus =
  | { kind: "attention"; attention: RuntimeAttention }
  | { kind: "retry"; attempt: number; message: string; next: number }
  | { kind: "error"; message: string }
  | { kind: "working"; stage: Stage; tool?: RuntimeTool }
  | { kind: "done" }
  | { kind: "idle" }
export type RuntimeEvent = {
  id: string
  at: number
  role: "model" | "tool" | "subagent"
  kind: "request.start" | "request.end" | "request.error" | "tool.start" | "tool.end" | "tool.error"
  label: string            // tool name, or subagent agent; "" for model events
  request: number
}
export type RuntimeFreshness = {
  observedAt: number
  /** Newest of: arrival time recorded in-app, newest data timestamp. Always inferred. Undefined in replay. */
  lastEventAt?: number
  lastEventSource?: "arrival" | "data"
  evidence: "inferred"
}
export type RuntimeSession = { id: string; kind: "root" | "child"; agent?: string; state: RunState; evidence: Evidence }
export function eventSessionID(details: unknown): string | undefined
```

- [ ] **Step 1: 写失败测试（追加）**

```ts
import { eventSessionID } from "./session-runtime-model"

describe("stage", () => {
  test("idle session has stage idle", () => {
    const m = runtime({ messages: [u, assistant(u, T0 + 100)], busy: false })
    expect(m.stage).toBe("idle")
  })
  test("running request without first token is prepare; with first token is model", () => {
    const a = assistant(u, T0 + 100, { time: { created: T0 + 100 } })
    const prepare = runtime({ messages: [u, a], input: { status: { type: "busy" } } })
    expect(prepare.stage).toBe("prepare")
    const streaming = runtime({
      messages: [u, a],
      parts: { [a.id]: [{ id: id("prt", T0 + 500), type: "reasoning", text: "t", time: { start: T0 + 500 } }] },
      input: { status: { type: "busy" } },
    })
    expect(streaming.stage).toBe("model")
  })
  test("an active tool means tools; finished tools with the run still busy means fill", () => {
    const a = assistant(u, T0 + 100)
    const running = tool(T0 + 200, "bash", { status: "running", input: {}, time: { start: T0 + 200 } }, { messageID: a.id })
    expect(runtime({ messages: [u, a], parts: { [a.id]: [running] }, input: { status: { type: "busy" } } }).stage).toBe("tools")
    const finished = tool(T0 + 200, "bash", done(T0 + 200, {}, "ok"), { messageID: a.id })
    expect(runtime({ messages: [u, a], parts: { [a.id]: [finished] }, input: { status: { type: "busy" } } }).stage).toBe("fill")
  })
})

describe("focus", () => {
  const a = assistant(u, T0 + 100, { time: { created: T0 + 100 } })
  const running = tool(T0 + 200, "bash", { status: "running", input: { command: "bun test" }, time: { start: T0 + 200 } }, { messageID: a.id })
  test("priority: attention > retry > error > working > done", () => {
    const permissions = [{ id: "p", sessionID: "s", permission: "edit", patterns: [], metadata: {}, always: [] }] as any
    const retry = { type: "retry", attempt: 1, message: "m", next: T0 + 9 } as const
    expect(runtime({ messages: [u, a], input: { permissions, status: retry } }).focus.kind).toBe("attention")
    expect(runtime({ messages: [u, a], input: { status: retry } }).focus).toEqual({ kind: "retry", attempt: 1, message: "m", next: T0 + 9 })
    const failed = assistant(u, T0 + 100, { error: { name: "APIError", data: { message: "boom" } } })
    expect(runtime({ messages: [u, failed], busy: false }).focus.kind).toBe("error")
    const working = runtime({ messages: [u, a], parts: { [a.id]: [running] }, input: { status: { type: "busy" } } })
    expect(working.focus).toMatchObject({ kind: "working", stage: "tools", tool: { name: "bash" } })
    expect(runtime({ messages: [u, assistant(u, T0 + 100)], busy: false }).focus.kind).toBe("done")
  })
  test("an empty session is idle and does not crash", () => {
    const m = runtime({ messages: [], busy: false })
    expect(m.focus.kind).toBe("idle")
    expect(m.usage.requests).toBe(0)
    expect(m.tools).toEqual([])
    expect(m.events).toEqual([])
  })
})

describe("events", () => {
  test("one event per fact, ordered by time then insertion; a subagent call is labelled with the agent", () => {
    const a = assistant(u, T0 + 100)
    const bash = tool(T0 + 200, "bash", done(T0 + 200, { command: "x" }, "o"), { messageID: a.id })
    const task = tool(
      T0 + 210,
      "task",
      { status: "error", input: { subagent_type: "explore", description: "d" }, error: "e", time: { start: T0 + 210, end: T0 + 900 } },
      { messageID: a.id },
    )
    const m = runtime({ messages: [u, a], parts: { [a.id]: [bash, task] }, busy: false })
    expect(m.events.map((e) => [e.kind, e.role, e.label])).toEqual([
      ["request.start", "model", ""],
      ["tool.start", "tool", "bash"],
      ["tool.start", "subagent", "explore"],
      ["tool.end", "tool", "bash"],
      ["tool.error", "subagent", "explore"],
      ["request.end", "model", ""],
    ])
    expect(m.events.every((e, i, all) => i === 0 || all[i - 1].at <= e.at)).toBe(true)
  })
})

describe("freshness", () => {
  test("lastEventAt is the newest of arrival time and data, with its source", () => {
    const a = assistant(u, T0 + 100)
    const data = runtime({ messages: [u, a], busy: false, now: T0 + 60_000 })
    expect(data.freshness).toMatchObject({ observedAt: T0 + 60_000, lastEventSource: "data", evidence: "inferred" })
    expect(data.freshness.lastEventAt).toBe(T0 + 2100)
    const arrival = runtime({ messages: [u, a], busy: false, now: T0 + 60_000, input: { lastEventAt: T0 + 50_000 } })
    expect(arrival.freshness).toMatchObject({ lastEventAt: T0 + 50_000, lastEventSource: "arrival" })
  })
  test("replay has no lastEventAt", () => {
    const m = runtime({ messages: [u, assistant(u, T0 + 100)], busy: false, input: { mode: "replay", lastEventAt: T0 + 5 } })
    expect(m.freshness.lastEventAt).toBeUndefined()
  })
  test("there is no disconnect field anywhere in the model", () => {
    const m = runtime({ messages: [u], busy: false })
    expect(JSON.stringify(m).toLowerCase()).not.toContain("disconnect")
  })
})

describe("sessions", () => {
  test("root first, then each distinct child session once", () => {
    const a = assistant(u, T0 + 100)
    const mk = (ms: number, sid: string) =>
      tool(ms, "task", { status: "running", input: { subagent_type: "explore", description: "d" }, metadata: { sessionId: sid }, time: { start: ms } }, { messageID: a.id })
    const m = runtime({
      messages: [u, a],
      parts: { [a.id]: [mk(T0 + 200, "c1"), mk(T0 + 210, "c1"), mk(T0 + 220, "c2")] },
      input: { status: { type: "busy" }, childStatus: (sid) => (sid === "c2" ? { type: "busy" } : undefined) },
    })
    expect(m.sessions.map((s) => [s.id, s.kind, s.state])).toEqual([
      ["s", "root", "working"],
      ["c1", "child", "unknown"],
      ["c2", "child", "working"],
    ])
  })
})

describe("eventSessionID", () => {
  test("reads the session id from the three event shapes the reducer handles", () => {
    expect(eventSessionID({ type: "session.status", properties: { sessionID: "a" } })).toBe("a")
    expect(eventSessionID({ type: "message.updated", properties: { info: { sessionID: "b" } } })).toBe("b")
    expect(eventSessionID({ type: "message.part.updated", properties: { part: { sessionID: "c" } } })).toBe("c")
    expect(eventSessionID({ type: "server.heartbeat", properties: {} })).toBeUndefined()
    expect(eventSessionID(undefined)).toBeUndefined()
  })
})
```

（`runtime` 夹具已有 `now` 参数：`Fixture` 里 `now?: number`，本任务测试直接使用。）

- [ ] **Step 2: 运行测试确认失败。**

- [ ] **Step 3: 实现**

加入类型（见 Interfaces），`RuntimeModel` 补全为最终形状，并加入：

```ts
const stageOf = (run: RuntimeRun, requests: RuntimeRequest[], tools: RuntimeTool[]): Stage => {
  if (run.state === "idle" || run.state === "error" || run.state === "unknown") return "idle"
  const last = requests[requests.length - 1]
  if (!last) return "prepare"
  if (tools.some((t) => t.request === last.index && (t.state === "pending" || t.state === "running"))) return "tools"
  if (last.status === "running") return last.firstToken !== undefined ? "model" : "prepare"
  return tools.some((t) => t.request === last.index) ? "fill" : "prepare"
}

const focusOf = (run: RuntimeRun, stage: Stage, requests: RuntimeRequest[], tools: RuntimeTool[]): RuntimeFocus => {
  if (run.attention.length) return { kind: "attention", attention: run.attention[0] }
  if (run.retry) return { kind: "retry", ...run.retry }
  const last = requests[requests.length - 1]
  if (run.state === "error" || (run.state === "idle" && last?.status === "error"))
    return { kind: "error", message: last?.error ?? "" }
  if (run.state === "working") {
    const active = tools.filter((t) => t.state === "pending" || t.state === "running")
    return { kind: "working", stage, tool: active[active.length - 1] }
  }
  return last ? { kind: "done" } : { kind: "idle" }
}

const eventsOf = (requests: RuntimeRequest[], tools: RuntimeTool[]): RuntimeEvent[] => {
  const list: RuntimeEvent[] = []
  for (const r of requests) {
    list.push({ id: `${r.messageID}:start`, at: r.start, role: "model", kind: "request.start", label: "", request: r.index })
    if (r.end !== undefined && r.settled)
      list.push({
        id: `${r.messageID}:end`,
        at: r.end,
        role: "model",
        kind: r.status === "error" ? "request.error" : "request.end",
        label: "",
        request: r.index,
      })
  }
  for (const t of tools) {
    const role = t.child ? "subagent" : "tool"
    const label = t.child ? t.child.agent : t.name
    if (t.start !== undefined)
      list.push({ id: `${t.id}:start`, at: t.start, role, kind: "tool.start", label, request: t.request })
    if (t.end !== undefined)
      list.push({ id: `${t.id}:end`, at: t.end, role, kind: t.state === "error" ? "tool.error" : "tool.end", label, request: t.request })
  }
  return list
    .map((e, i) => ({ e, i }))
    .sort((a, b) => a.e.at - b.e.at || a.i - b.i)
    .map((x) => x.e)
}

const freshnessOf = (input: RuntimeInput, events: RuntimeEvent[], now: number): RuntimeFreshness => {
  if (input.mode === "replay") return { observedAt: now, evidence: "inferred" }
  const data = events.length ? events[events.length - 1].at : undefined
  const arrival = input.lastEventAt
  if (arrival === undefined && data === undefined) return { observedAt: now, evidence: "inferred" }
  const useArrival = arrival !== undefined && (data === undefined || arrival >= data)
  return {
    observedAt: now,
    lastEventAt: useArrival ? arrival : data,
    lastEventSource: useArrival ? "arrival" : "data",
    evidence: "inferred",
  }
}

const sessionsOf = (input: RuntimeInput, run: RuntimeRun, tools: RuntimeTool[]): RuntimeSession[] => {
  const list: RuntimeSession[] = [{ id: input.sessionID, kind: "root", state: run.state, evidence: run.evidence }]
  const seen = new Set<string>([input.sessionID])
  for (const t of tools) {
    const c = t.child
    if (!c?.sessionID || seen.has(c.sessionID)) continue
    seen.add(c.sessionID)
    list.push({
      id: c.sessionID,
      kind: "child",
      agent: c.agent,
      state: c.lifecycle === "running" ? "working" : "unknown",
      evidence: c.evidence,
    })
  }
  return list
}

/** Session an event belongs to: session.status / message.part.delta carry `sessionID`, message.updated carries
 *  `info.sessionID`, message.part.updated carries `part.sessionID`. Events without one (heartbeats) are ignored. */
export function eventSessionID(details: unknown): string | undefined {
  const p = (details as { properties?: Record<string, any> } | undefined)?.properties
  const id = p?.sessionID ?? p?.info?.sessionID ?? p?.part?.sessionID
  return typeof id === "string" ? id : undefined
}
```

`buildRuntime` 最终：

```ts
export function buildRuntime(input: RuntimeInput, now: number): RuntimeModel {
  const requests = input.requests.map(requestOf)
  const tools = toolsOf(input)
  const run = runOf(input)
  const stage = stageOf(run, requests, tools)
  const events = eventsOf(requests, tools)
  return {
    mode: input.mode,
    freshness: freshnessOf(input, events, now),
    run,
    stage,
    focus: focusOf(run, stage, requests, tools),
    sessions: sessionsOf(input, run, tools),
    requests,
    tools,
    events,
    usage: usageOf(requests, input.contextLimit),
  }
}
```

- [ ] **Step 4: 运行测试确认通过。** Expected: 全部通过（约 28 条）。若 “events 顺序” 一条因时间相同顺序不符，调整**夹具时间**（保持严格递增），不要改排序规则。

- [ ] **Step 5: 类型检查不新增错误。**

---

### Task 6: 回看游标 `snapshotAt`（不泄漏未来）

**Files:**
- Modify: `session-runtime-model.ts`
- Test: `session-runtime-model.test.ts`（追加）

**Interfaces:**
- Consumes: `idTime`（`./session-trajectory-model`）。
- Produces:

```ts
export function snapshotAt(
  messages: Message[],
  parts: (messageID: string) => Part[],
  cursor: number,
): { messages: Message[]; parts: (messageID: string) => Part[] }
```

规则（写在函数注释里）：消息按 `time.created`；part 按各自起始时间（tool 用 `state.time.start`，text/reasoning 用 `time.start`，其余/`pending` 用 `idTime(part.id, 消息 created)`，仍无则取消息 created）；游标之后才结束的 assistant 消息改成“未完成”（去掉 `completed`、`finish`、`error`）；游标之后才结束的 tool 退回 `running`（去掉 output/error）。

- [ ] **Step 1: 写失败测试（追加）**

```ts
import { snapshotAt } from "./session-runtime-model"

describe("snapshotAt", () => {
  const a1 = assistant(u, T0 + 100, { time: { created: T0 + 100, completed: T0 + 2000 } })
  const a2 = assistant(u, T0 + 3000, { time: { created: T0 + 3000, completed: T0 + 5000 } })
  const t1 = tool(T0 + 200, "bash", done(T0 + 200, { command: "a" }, "out"), { messageID: a1.id })
  const t2 = tool(T0 + 3200, "read", done(T0 + 3200, { filePath: "/b" }, "out"), { messageID: a2.id })
  const parts = (id: string) => (id === a1.id ? [t1] : id === a2.id ? [t2] : []) as any[]
  const all = [u, a1, a2]

  test("future messages and parts are not visible", () => {
    const snap = snapshotAt(all, parts, T0 + 1000)
    expect(snap.messages.map((m) => m.id)).toEqual([u.id, a1.id])
    expect(snap.parts(a2.id)).toEqual([])
  })

  test("a tool that finishes after the cursor is rewound to running without its output", () => {
    const snap = snapshotAt(all, parts, T0 + 300)
    const rewound = snap.parts(a1.id)[0] as any
    expect(rewound.state.status).toBe("running")
    expect(rewound.state.output).toBeUndefined()
    expect(rewound.state.time).toEqual({ start: T0 + 200 })
  })

  test("a message completing after the cursor becomes incomplete", () => {
    const snap = snapshotAt(all, parts, T0 + 1000)
    const m = snap.messages[1] as any
    expect(m.time.completed).toBeUndefined()
    expect(m.error).toBeUndefined()
  })

  test("a cursor before every message gives an empty snapshot that still builds", () => {
    const snap = snapshotAt(all, parts, T0 - 1)
    expect(snap.messages).toEqual([])
    const m = runtime({ messages: snap.messages, parts: { }, input: { mode: "replay" }, busy: false })
    expect(m.focus.kind).toBe("idle")
  })

  test("replay at the end has the same requests, tools and states as live (step layer)", () => {
    const end = T0 + 10_000
    const snap = snapshotAt(all, parts, end)
    const live = runtime({ messages: all, parts: { [a1.id]: [t1], [a2.id]: [t2] }, busy: false, now: end })
    const replay = runtime({ messages: snap.messages, parts: { [a1.id]: snap.parts(a1.id), [a2.id]: snap.parts(a2.id) }, busy: false, now: end, input: { mode: "replay" } })
    const key = (m: typeof live) => ({
      requests: m.requests.map((r) => [r.messageID, r.status, r.known]),
      tools: m.tools.map((t) => [t.id, t.state]),
      events: m.events.map((e) => e.id),
    })
    expect(key(replay)).toEqual(key(live))
  })

  test("mid-run replay shows the second request as running with no usage yet", () => {
    const cursor = T0 + 3500
    const snap = snapshotAt(all, parts, cursor)
    const m = runtime({
      messages: snap.messages,
      parts: { [a1.id]: snap.parts(a1.id), [a2.id]: snap.parts(a2.id) },
      busy: true,
      now: cursor,
      input: { mode: "replay" },
    })
    expect(m.requests[1]).toMatchObject({ status: "running", settled: false, known: false })
    expect(m.run.state).toBe("working")
    expect(m.run.attentionKnown).toBe(false)
  })
})
```


- [ ] **Step 2: 运行测试确认失败**（`snapshotAt` 未导出）。

- [ ] **Step 3: 实现**

import 加上 `Message`：`import type { Message, Part, ... } from "@opencode-ai/sdk/v2/client"`，`import { idTime, oneLine, subagentOf, type TrajectoryRequest } from "./session-trajectory-model"`。

```ts
const partStart = (part: Part, fallback: number): number => {
  if (part.type === "tool") {
    return part.state.status === "pending" ? (idTime(part.id, fallback) ?? fallback) : part.state.time.start
  }
  const start = (part as { time?: { start?: number } }).time?.start
  return start ?? idTime(part.id, fallback) ?? fallback
}

const rewind = (part: Part, cursor: number): Part => {
  if (part.type !== "tool") return part
  const s = part.state
  if ((s.status === "completed" || s.status === "error") && s.time.end > cursor) {
    return { ...part, state: { status: "running", input: s.input, time: { start: s.time.start } } }
  }
  return part
}

/** The session as it was at `cursor`: nothing created after it is visible, and anything that finished after it is
 *  shown still running. Items without a start time use the id's embedded time, then their message's. */
export function snapshotAt(messages: Message[], parts: (messageID: string) => Part[], cursor: number) {
  const kept: Message[] = []
  const visible = new Map<string, Part[]>()
  for (const m of messages) {
    if (m.time.created > cursor) continue
    if (m.role === "assistant" && m.time.completed !== undefined && m.time.completed > cursor) {
      kept.push({ ...m, time: { created: m.time.created }, finish: undefined, error: undefined } as Message)
    } else kept.push(m)
    const list: Part[] = []
    for (const p of parts(m.id)) {
      if (partStart(p, m.time.created) > cursor) continue
      list.push(rewind(p, cursor))
    }
    visible.set(m.id, list)
  }
  return { messages: kept, parts: (messageID: string) => visible.get(messageID) ?? [] }
}
```

- [ ] **Step 4: 运行测试确认通过。** 若 “replay at the end … same” 失败，比较 `key(replay)` 与 `key(live)` 的差异：差异应只来自夹具，不得通过改断言掩盖。

- [ ] **Step 5: 类型检查不新增错误。**

---

### Task 7: 文案（en / zh / zht）与 `view.runtime`

**Files:**
- Create: `session-runtime-i18n.ts`、`session-runtime-i18n.test.ts`
- Modify: `session-trajectory-i18n.ts`（`view.runtime`，三种语言各加一行）

**Interfaces:**
- Consumes: 与 `trajectoryText` 同样的 `language: Pick<ReturnType<typeof useLanguage>, "locale" | "intl">`。
- Produces: `export function runtimeText(language): { t(key: RuntimeKey, params?): string; intl: ... }`；`export type RuntimeKey`；`export const RUNTIME_KEYS_FOR_TEST = { en, zh, zht }`（仅测试用）。

- [ ] **Step 1: 写失败测试**

`session-runtime-i18n.test.ts`：

```ts
// oco (patches/opencode/0019): the three runtime dictionaries have the same keys and placeholders.
import { describe, expect, test } from "bun:test"
import { RUNTIME_DICTS_FOR_TEST as d, runtimeText } from "./session-runtime-i18n"

const keys = (o: Record<string, string>) => Object.keys(o).sort()
const holes = (s: string) => [...s.matchAll(/{{\s*(\w+)\s*}}/g)].map((m) => m[1]).sort()

describe("runtime copy", () => {
  test("zh and zht have exactly the keys of en", () => {
    expect(keys(d.zh)).toEqual(keys(d.en))
    expect(keys(d.zht)).toEqual(keys(d.en))
  })
  test("placeholders match per key across languages", () => {
    for (const k of Object.keys(d.en)) {
      expect(holes(d.zh[k])).toEqual(holes(d.en[k]))
      expect(holes(d.zht[k])).toEqual(holes(d.en[k]))
    }
  })
  test("no copy claims a disconnect", () => {
    for (const lang of [d.en, d.zh, d.zht]) for (const v of Object.values(lang)) expect(/disconnect|断连|斷連|斷線/i.test(v)).toBe(false)
  })
  test("t fills placeholders and falls back to English for other locales", () => {
    const t = runtimeText({ locale: () => "fr", intl: () => "fr" }).t
    expect(t("focus.retry", { attempt: 2, message: "m" })).toBe("Retrying (attempt 2): m")
  })
})
```

- [ ] **Step 2: 运行测试确认失败。**

- [ ] **Step 3: 实现**

`session-runtime-i18n.ts`：

```ts
// oco (patches/opencode/0019): copy for the runtime view. Same arrangement as session-trajectory-i18n.ts
// (patch 0013): upstream's locale-parity test would require every locale, and oco maintains en / zh / zht.
import type { useLanguage } from "@/context/language"

const en = {
  "title": "Runtime",
  "state.working": "Working",
  "state.waiting-user": "Waiting for you",
  "state.retrying": "Retrying",
  "state.idle": "Idle",
  "state.error": "Error",
  "state.unknown": "Unknown",
  "evidence.inferred": "inferred",
  "stage.label": "Request cycle",
  "stage.prepare": "Preparing request",
  "stage.model": "Model responding",
  "stage.tools": "Running tools",
  "stage.fill": "Returning results",
  "focus.attention.permission": "Waiting for your approval: {{what}}",
  "focus.attention.question": "The agent is asking you a question: {{what}}",
  "focus.attention.hint": "Answer it in the Chat view (this view does not act on requests yet).",
  "focus.retry": "Retrying (attempt {{attempt}}): {{message}}",
  "focus.error": "Failed: {{message}}",
  "focus.working.tool": "Running {{tool}}: {{input}}",
  "focus.done": "Finished",
  "focus.idle": "Nothing has run yet",
  "header.pending": "{{count}} waiting for you",
  "header.sessions": "{{count}} sessions",
  "last.event": "Last event {{ago}} ago (inferred)",
  "last.none": "No events seen yet",
  "ago.seconds": "{{value}} s",
  "ago.minutes": "{{value}} min",
  "ago.hours": "{{value}} h",
  "tools.title": "Tools and subagents",
  "tools.none": "Nothing is running",
  "tools.finished": "Finished: {{count}}",
  "tool.state.pending": "Queued",
  "tool.state.running": "Running",
  "tool.state.completed": "Done",
  "tool.state.error": "Failed",
  "tool.awaiting": "Waiting for approval",
  "tool.background": "background",
  "child.running": "Subagent running",
  "child.unknown": "Subagent state unknown: a finished task call does not mean the subagent is finished",
  "events.title": "Event log",
  "events.none": "No events",
  "event.request.start": "Model request started",
  "event.request.end": "Model request finished",
  "event.request.error": "Model request failed",
  "event.tool.start": "{{label}} started",
  "event.tool.end": "{{label}} finished",
  "event.tool.error": "{{label}} failed",
  "event.subagent.start": "{{label}} task call started",
  "event.subagent.end": "{{label}} task call returned (the subagent's own state is separate)",
  "event.subagent.error": "{{label}} task call failed",
  "usage.title": "Usage",
  "usage.counting": "Counting…",
  "usage.unknown": "Not reported",
  "usage.tokens": "In {{input}} · cache {{cache}} · out {{output}} · thinking {{reasoning}}",
  "usage.partial": "{{known}} of {{requests}} requests reported usage",
  "usage.context": "Last request input {{used}} / {{limit}}",
  "usage.context.nolimit": "Last request input {{used}} (context limit unknown)",
  "replay.pause": "Pause following",
  "replay.live": "Back to live",
  "replay.step": "Step {{n}} of {{total}}",
  "replay.new": "{{count}} new since you paused",
  "replay.attention": "History does not record approval waits, so an empty list here does not mean there were none.",
} as const

type Key = keyof typeof en
export type RuntimeKey = Key
type Params = Record<string, string | number>

const zh: Record<Key, string> = {
  "title": "运行",
  "state.working": "工作中",
  "state.waiting-user": "等你处理",
  "state.retrying": "重试中",
  "state.idle": "空闲",
  "state.error": "出错",
  "state.unknown": "未知",
  "evidence.inferred": "推断",
  "stage.label": "请求周期",
  "stage.prepare": "准备请求",
  "stage.model": "模型响应",
  "stage.tools": "执行工具",
  "stage.fill": "结果回填",
  "focus.attention.permission": "等你批准：{{what}}",
  "focus.attention.question": "智能体在向你提问：{{what}}",
  "focus.attention.hint": "请在“对话”视图里处理（本视图暂不执行这类操作）。",
  "focus.retry": "重试中（第 {{attempt}} 次）：{{message}}",
  "focus.error": "失败：{{message}}",
  "focus.working.tool": "正在运行 {{tool}}：{{input}}",
  "focus.done": "已完成",
  "focus.idle": "还没有运行过",
  "header.pending": "{{count}} 项等你处理",
  "header.sessions": "{{count}} 个会话",
  "last.event": "最后事件 {{ago}}前（推断）",
  "last.none": "还没有收到事件",
  "ago.seconds": "{{value}} 秒",
  "ago.minutes": "{{value}} 分钟",
  "ago.hours": "{{value}} 小时",
  "tools.title": "工具与子代理",
  "tools.none": "当前没有在运行的内容",
  "tools.finished": "已完成：{{count}}",
  "tool.state.pending": "排队中",
  "tool.state.running": "运行中",
  "tool.state.completed": "已完成",
  "tool.state.error": "失败",
  "tool.awaiting": "等待批准",
  "tool.background": "后台",
  "child.running": "子代理运行中",
  "child.unknown": "子代理状态未知：task 调用已完成不代表子代理已结束",
  "events.title": "事件日志",
  "events.none": "没有事件",
  "event.request.start": "模型请求开始",
  "event.request.end": "模型请求结束",
  "event.request.error": "模型请求失败",
  "event.tool.start": "{{label}} 开始",
  "event.tool.end": "{{label}} 完成",
  "event.tool.error": "{{label}} 失败",
  "event.subagent.start": "{{label}} 的 task 调用开始",
  "event.subagent.end": "{{label}} 的 task 调用已返回（子代理自身状态另算）",
  "event.subagent.error": "{{label}} 的 task 调用失败",
  "usage.title": "用量",
  "usage.counting": "统计中…",
  "usage.unknown": "未上报",
  "usage.tokens": "输入 {{input}} · 缓存 {{cache}} · 输出 {{output}} · 思考 {{reasoning}}",
  "usage.partial": "{{requests}} 次请求中有 {{known}} 次上报了用量",
  "usage.context": "最近一次请求输入 {{used}} / {{limit}}",
  "usage.context.nolimit": "最近一次请求输入 {{used}}（上下文上限未知）",
  "replay.pause": "暂停跟随",
  "replay.live": "返回实时",
  "replay.step": "第 {{n}} / {{total}} 步",
  "replay.new": "暂停后新增 {{count}} 条",
  "replay.attention": "历史不记录权限等待，所以这里为空不代表当时没有等待。",
}

const zht: Record<Key, string> = {
  "title": "運行",
  "state.working": "工作中",
  "state.waiting-user": "等你處理",
  "state.retrying": "重試中",
  "state.idle": "閒置",
  "state.error": "出錯",
  "state.unknown": "未知",
  "evidence.inferred": "推斷",
  "stage.label": "請求週期",
  "stage.prepare": "準備請求",
  "stage.model": "模型回應",
  "stage.tools": "執行工具",
  "stage.fill": "結果回填",
  "focus.attention.permission": "等你批准：{{what}}",
  "focus.attention.question": "智慧體在向你提問：{{what}}",
  "focus.attention.hint": "請在「對話」視圖處理（本視圖暫不執行這類操作）。",
  "focus.retry": "重試中（第 {{attempt}} 次）：{{message}}",
  "focus.error": "失敗：{{message}}",
  "focus.working.tool": "正在執行 {{tool}}：{{input}}",
  "focus.done": "已完成",
  "focus.idle": "尚未執行過",
  "header.pending": "{{count}} 項等你處理",
  "header.sessions": "{{count}} 個會話",
  "last.event": "最後事件 {{ago}}前（推斷）",
  "last.none": "尚未收到事件",
  "ago.seconds": "{{value}} 秒",
  "ago.minutes": "{{value}} 分鐘",
  "ago.hours": "{{value}} 小時",
  "tools.title": "工具與子代理",
  "tools.none": "目前沒有執行中的內容",
  "tools.finished": "已完成：{{count}}",
  "tool.state.pending": "排隊中",
  "tool.state.running": "執行中",
  "tool.state.completed": "已完成",
  "tool.state.error": "失敗",
  "tool.awaiting": "等待批准",
  "tool.background": "背景",
  "child.running": "子代理執行中",
  "child.unknown": "子代理狀態未知：task 呼叫已完成不代表子代理已結束",
  "events.title": "事件日誌",
  "events.none": "沒有事件",
  "event.request.start": "模型請求開始",
  "event.request.end": "模型請求結束",
  "event.request.error": "模型請求失敗",
  "event.tool.start": "{{label}} 開始",
  "event.tool.end": "{{label}} 完成",
  "event.tool.error": "{{label}} 失敗",
  "event.subagent.start": "{{label}} 的 task 呼叫開始",
  "event.subagent.end": "{{label}} 的 task 呼叫已返回（子代理自身狀態另計）",
  "event.subagent.error": "{{label}} 的 task 呼叫失敗",
  "usage.title": "用量",
  "usage.counting": "統計中…",
  "usage.unknown": "未回報",
  "usage.tokens": "輸入 {{input}} · 快取 {{cache}} · 輸出 {{output}} · 思考 {{reasoning}}",
  "usage.partial": "{{requests}} 次請求中有 {{known}} 次回報了用量",
  "usage.context": "最近一次請求輸入 {{used}} / {{limit}}",
  "usage.context.nolimit": "最近一次請求輸入 {{used}}（上下文上限未知）",
  "replay.pause": "暫停跟隨",
  "replay.live": "返回即時",
  "replay.step": "第 {{n}} / {{total}} 步",
  "replay.new": "暫停後新增 {{count}} 筆",
  "replay.attention": "歷史不記錄權限等待，所以這裡為空不代表當時沒有等待。",
}

const dicts: Partial<Record<string, Record<Key, string>>> = { zh, zht }

export const RUNTIME_DICTS_FOR_TEST = { en: en as Record<string, string>, zh: zh as Record<string, string>, zht: zht as Record<string, string> }

export type RuntimeText = ReturnType<typeof runtimeText>

/** Reads the app language reactively; call t inside tracked scopes. */
export function runtimeText(language: Pick<ReturnType<typeof useLanguage>, "locale" | "intl">) {
  const dict = () => dicts[language.locale()] ?? en
  const fill = (text: string, params: Params = {}) =>
    text.replace(/{{\s*(\w+)\s*}}/g, (_, name: string) => String(params[name] ?? ""))
  return {
    intl: language.intl,
    t: (key: Key, params?: Params) => fill(dict()[key], params),
  }
}
```

在 `session-trajectory-i18n.ts` 里，紧跟每个字典里 `"view.trajectory"` 那一行之后各加一行（先 `grep -n '"view.trajectory"' session-trajectory-i18n.ts` 找到三处）：en `"view.runtime": "Runtime",`，zh `"view.runtime": "运行",`，zht `"view.runtime": "運行",`。

- [ ] **Step 4: 运行测试确认通过。**

```bash
cd vendor/opencode/packages/app && bun test --conditions=solid --preload ./happydom.ts ./src/components/session/session-runtime-i18n.test.ts ./src/components/session/session-trajectory-model.test.ts 2>&1 | tail -4
```

Expected: 全部通过；`session-trajectory-model.test.ts` 仍 17 条通过。

- [ ] **Step 5: 类型检查不新增错误**（`zh`/`zht` 缺任何键会在这里报错）。

---

### Task 8: 视图组件 `session-runtime.tsx`

**Files:**
- Create: `session-runtime.tsx`

**Interfaces:**
- Consumes: `buildRuntime`、`snapshotAt`、`eventSessionID`、`RuntimeModel`、`RuntimeTool`、`RuntimeAttention`（Task 2–6）；`buildTrajectory`（`./session-trajectory-model`）；`trajectoryText`（`./session-trajectory-i18n`）；`runtimeText`（Task 7）；`SessionViewToggle`、`SessionViewMode`（`./session-trajectory`，Task 9 把后者改成三项）；`getSessionContext`（`./session-context-metrics`）；`useProviders`（`@/hooks/use-providers`）；`useSync`、`useSDK`、`useLanguage`。
- Produces: `export function SessionRuntime(props: { sessionID: string; onView: (view: SessionViewMode) => void; actions?: JSX.Element })`；根元素 `data-oco-runtime`，其余数据属性见下，供 E2E 使用：`data-oco-runtime-state`、`data-oco-runtime-stage`、`data-oco-runtime-focus`、`data-oco-runtime-tool`（值为 part id）、`data-oco-runtime-event`、`data-oco-runtime-last`、`data-oco-runtime-mode`（`live`/`replay`）。

本任务没有单元测试（渲染层）；验证靠类型检查 + Task 9 接线后的构建 + Task 11 的 E2E。组件不含业务规则，规则全在 Task 2–6 已测的模型里。

- [ ] **Step 1: 创建组件**

```tsx
// oco (patches/opencode/0019): 对话 / 轨迹 / 运行 — the runtime view. Read-only: it renders buildRuntime() over
// the session already in the sync store. Live updates once a second while the session is busy; "Pause following"
// replays by step (no per-token typing). It never claims a disconnect: only "last event xx ago", marked inferred.
import { createMemo, createSignal, For, Match, onCleanup, onMount, Show, Switch } from "solid-js"
import type { JSX } from "solid-js"
import type { Message, Part } from "@opencode-ai/sdk/v2/client"
import { useSync } from "@/context/sync"
import { useSDK } from "@/context/sdk"
import { useLanguage } from "@/context/language"
import { useProviders } from "@/hooks/use-providers"
import { getSessionContext } from "./session-context-metrics"
import { trajectoryText } from "./session-trajectory-i18n"
import { buildTrajectory } from "./session-trajectory-model"
import { SessionViewToggle, type SessionViewMode } from "./session-trajectory"
import { runtimeText, type RuntimeText } from "./session-runtime-i18n"
import {
  buildRuntime,
  eventSessionID,
  snapshotAt,
  type RuntimeAttention,
  type RuntimeEvent,
  type RuntimeModel,
  type RuntimeTool,
  type Stage,
} from "./session-runtime-model"

const emptyMessages: Message[] = []
const emptyParts: Part[] = []
const STAGES: Exclude<Stage, "idle">[] = ["prepare", "model", "tools", "fill"]
const GLYPH = { pending: "○", running: "◐", completed: "✓", error: "✕" } as const
const COLOR = {
  model: "var(--syntax-property)",
  tool: "var(--syntax-warning)",
  subagent: "var(--syntax-keyword)",
  attention: "var(--syntax-info)",
  error: "var(--syntax-critical)",
  ok: "var(--syntax-success)",
}

const ago = (t: RuntimeText["t"], ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return t("ago.seconds", { value: s })
  if (s < 3600) return t("ago.minutes", { value: Math.floor(s / 60) })
  return t("ago.hours", { value: Math.floor(s / 3600) })
}

const count = (n: number, locale: string) => new Intl.NumberFormat(locale, { notation: "compact" }).format(n)

const attentionText = (t: RuntimeText["t"], a: RuntimeAttention) =>
  a.kind === "permission"
    ? t("focus.attention.permission", { what: [a.permission, ...a.patterns].join(" ") })
    : t("focus.attention.question", { what: a.text })

const eventText = (t: RuntimeText["t"], e: RuntimeEvent) => {
  if (e.role === "model") return t(`event.${e.kind}` as "event.request.start")
  const kind = e.kind === "tool.start" ? "start" : e.kind === "tool.end" ? "end" : "error"
  return t(`event.${e.role}.${kind}` as "event.tool.start", { label: e.label })
}

const roleColor = (role: RuntimeEvent["role"]) => COLOR[role]

export function SessionRuntime(props: { sessionID: string; onView: (view: SessionViewMode) => void; actions?: JSX.Element }) {
  const sync = useSync()
  const sdk = useSDK()
  const providers = useProviders(() => sdk().directory)
  const language = useLanguage()
  const trajectory = trajectoryText(language)
  const copy = runtimeText(language)
  const t = copy.t

  const [now, setNow] = createSignal(Date.now())
  const [wall, setWall] = createSignal(Date.now())
  const [arrived, setArrived] = createSignal<number | undefined>()
  const [cursor, setCursor] = createSignal<number | undefined>()

  const info = createMemo(() => sync().session.get(props.sessionID))
  const messages = createMemo(() => (sync().data.message[props.sessionID] ?? emptyMessages) as Message[])
  const parts = (messageID: string) => (sync().data.part[messageID] ?? emptyParts) as Part[]
  const status = createMemo(() => sync().data.session_status[props.sessionID])
  const busy = createMemo(() => (status()?.type ?? "idle") !== "idle")
  const childIds = createMemo(
    () => new Set(live().tools.flatMap((x) => (x.child?.sessionID ? [x.child.sessionID] : []))),
  )

  const contextLimit = createMemo(() => getSessionContext(messages(), [...providers.all().values()])?.limit)

  const assemble = (view: { messages: Message[]; parts: (id: string) => Part[] }, mode: "live" | "replay", at: number) => {
    const incomplete = view.messages.some((m) => m.role === "assistant" && m.time.completed === undefined && !m.error)
    const built = buildTrajectory({
      messages: view.messages,
      parts: view.parts,
      now: at,
      busy: mode === "live" ? busy() : incomplete,
      language: trajectory,
    })
    return buildRuntime(
      {
        mode,
        sessionID: props.sessionID,
        parts: view.parts,
        status: mode === "live" ? status() : undefined,
        permissions: mode === "live" ? (sync().data.permission[props.sessionID] ?? []) : [],
        questions: mode === "live" ? (sync().data.question[props.sessionID] ?? []) : [],
        childStatus: (id) => sync().data.session_status[id],
        requests: built.requests,
        lastEventAt: arrived(),
        contextLimit: contextLimit(),
      },
      at,
    )
  }

  const live = createMemo<RuntimeModel>(() => assemble({ messages: messages(), parts }, "live", now()))
  const steps = createMemo(() => [...new Set(live().events.map((e) => e.at))])
  const replay = createMemo<RuntimeModel | undefined>(() => {
    const at = cursor()
    return at === undefined ? undefined : assemble(snapshotAt(messages(), parts, at), "replay", at)
  })
  const model = () => replay() ?? live()
  const stepIndex = createMemo(() => {
    const at = cursor()
    return at === undefined ? -1 : steps().filter((x) => x <= at).length - 1
  })
  const newSince = createMemo(() => (cursor() === undefined ? 0 : Math.max(0, steps().length - 1 - stepIndex())))

  onMount(() => {
    const tick = setInterval(() => {
      setWall(Date.now())
      if (busy() && cursor() === undefined) setNow(Date.now())
    }, 1000)
    const stop = sdk().event.listen((e) => {
      const id = eventSessionID(e.details)
      if (id && (id === props.sessionID || childIds().has(id))) setArrived(Date.now())
    })
    onCleanup(() => {
      clearInterval(tick)
      stop()
    })
  })

  const pause = () => setCursor(steps()[steps().length - 1] ?? Date.now())
  const goLive = () => {
    setCursor(undefined)
    setNow(Date.now())
  }
  const seek = (index: number) => setCursor(steps()[Math.min(Math.max(index, 0), steps().length - 1)])

  const active = createMemo(() => model().tools.filter((x) => x.state === "pending" || x.state === "running"))
  const finished = createMemo(() => model().tools.filter((x) => x.state === "completed" || x.state === "error"))
  const attention = createMemo(() => model().run.attention)
  const stateColor = () => {
    const s = model().run.state
    return s === "error" ? COLOR.error : s === "waiting-user" ? COLOR.attention : s === "working" ? COLOR.ok : undefined
  }

  const toolRow = (x: RuntimeTool) => (
    <div
      data-oco-runtime-tool={x.id}
      class="flex flex-col gap-0.5 rounded-md px-2 py-1.5 bg-surface-inset-base"
      style={{ "border-left": `3px solid ${x.child ? COLOR.subagent : COLOR.tool}` }}
    >
      <div class="flex items-center gap-2 min-w-0">
        <span aria-hidden="true">{GLYPH[x.state]}</span>
        <span class="text-12-medium text-text-strong shrink-0">{x.child ? x.child.agent : x.name}</span>
        <span class="min-w-0 truncate text-12-regular text-text-weak">{x.child ? x.child.description : x.input}</span>
        <span class="ml-auto shrink-0 text-12-regular text-text-weak">{t(`tool.state.${x.state}`)}</span>
      </div>
      <Show when={x.awaiting}>
        <div class="text-12-medium" style={{ color: COLOR.attention }}>! {t("tool.awaiting")}</div>
      </Show>
      <Show when={x.child}>
        {(c) => (
          <div class="text-12-regular text-text-weak">
            {c().lifecycle === "running" ? t("child.running") : t("child.unknown")}
            <Show when={c().background}> · {t("tool.background")}</Show>
          </div>
        )}
      </Show>
      <Show when={x.lastOutput}>
        <div class="min-w-0 truncate text-12-regular font-mono text-text-weak">{x.lastOutput}</div>
      </Show>
    </div>
  )

  return (
    <div data-oco-runtime data-oco-runtime-mode={model().mode} class="relative flex flex-col h-full min-h-0">
      <div class="shrink-0 h-12 flex items-center justify-between gap-2 pl-4 pr-3">
        <div class="min-w-0 truncate text-14-medium text-text-strong">{info()?.title ?? ""}</div>
        <div class="shrink-0 flex items-center gap-2">
          <SessionViewToggle value="runtime" onChange={props.onView} />
          {props.actions}
        </div>
      </div>

      <div class="min-h-0 flex-1 overflow-auto flex flex-col gap-4 px-4 pb-6">
        <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-12-regular text-text-weak">
          <span
            data-oco-runtime-state={model().run.state}
            class="text-12-medium"
            style={{ color: stateColor() }}
          >
            {t(`state.${model().run.state}`)}
            <Show when={model().run.evidence === "inferred"}> ({t("evidence.inferred")})</Show>
          </span>
          <Show when={attention().length}>
            <span style={{ color: COLOR.attention }}>{t("header.pending", { count: attention().length })}</span>
          </Show>
          <Show when={model().sessions.length > 1}>
            <span>{t("header.sessions", { count: model().sessions.length })}</span>
          </Show>
          <Show when={model().mode === "live"}>
            <span data-oco-runtime-last>
              {model().freshness.lastEventAt === undefined
                ? t("last.none")
                : t("last.event", { ago: ago(t, wall() - model().freshness.lastEventAt!) })}
            </span>
          </Show>
        </div>

        <div class="flex flex-wrap items-center gap-2" data-oco-runtime-replay>
          <Show
            when={cursor() !== undefined}
            fallback={
              <button type="button" class="h-6 px-2 rounded-[5px] text-12-medium bg-surface-inset-base text-text-base" onClick={pause}>
                {t("replay.pause")}
              </button>
            }
          >
            <button type="button" class="h-6 px-2 rounded-[5px] text-12-medium bg-surface-base-active text-text-strong" onClick={goLive}>
              {t("replay.live")}
            </button>
            <input
              type="range"
              aria-label={t("replay.step", { n: stepIndex() + 1, total: steps().length })}
              min={0}
              max={Math.max(0, steps().length - 1)}
              value={Math.max(0, stepIndex())}
              onInput={(e) => seek(Number(e.currentTarget.value))}
            />
            <span class="text-12-regular text-text-weak">{t("replay.step", { n: stepIndex() + 1, total: steps().length })}</span>
            <Show when={newSince() > 0}>
              <span class="text-12-regular text-text-weak">{t("replay.new", { count: newSince() })}</span>
            </Show>
          </Show>
        </div>

        <Show when={model().mode === "replay"}>
          <div class="text-12-regular text-text-weak" data-oco-runtime-replay-note>{t("replay.attention")}</div>
        </Show>

        <div
          data-oco-runtime-focus={model().focus.kind}
          class="rounded-md px-3 py-2 bg-surface-inset-base text-14-medium text-text-strong"
          style={{ "border-left": `3px solid ${model().focus.kind === "error" ? COLOR.error : model().focus.kind === "attention" ? COLOR.attention : COLOR.model}` }}
        >
          <Switch>
            <Match when={model().focus.kind === "attention" && (model().focus as { attention: RuntimeAttention }).attention}>
              {(a) => (
                <>
                  <div>{attentionText(t, a())}</div>
                  <div class="text-12-regular text-text-weak">{t("focus.attention.hint")}</div>
                </>
              )}
            </Match>
            <Match when={model().focus.kind === "retry" && (model().focus as { attempt: number; message: string })}>
              {(r) => <div>{t("focus.retry", { attempt: r().attempt, message: r().message })}</div>}
            </Match>
            <Match when={model().focus.kind === "error" && (model().focus as { message: string })}>
              {(r) => <div>{t("focus.error", { message: r().message })}</div>}
            </Match>
            <Match when={model().focus.kind === "working" && (model().focus as { tool?: RuntimeTool; stage: Stage })}>
              {(w) => (
                <div>
                  {w().tool
                    ? t("focus.working.tool", { tool: w().tool!.child?.agent ?? w().tool!.name, input: w().tool!.input })
                    : t(`stage.${w().stage === "idle" ? "prepare" : w().stage}`)}
                </div>
              )}
            </Match>
            <Match when={model().focus.kind === "done"}>
              <div>{t("focus.done")}</div>
            </Match>
            <Match when={true}>
              <div>{t("focus.idle")}</div>
            </Match>
          </Switch>
        </div>

        <ol
          aria-label={t("stage.label")}
          data-oco-runtime-stage={model().stage}
          class="m-0 p-0 list-none flex flex-wrap items-center gap-x-2 gap-y-1 text-12-regular"
        >
          <For each={STAGES}>
            {(s, i) => (
              <li
                aria-current={model().stage === s ? "step" : undefined}
                class="flex items-center gap-2"
                classList={{ "text-text-strong text-12-medium": model().stage === s, "text-text-weak": model().stage !== s }}
              >
                <Show when={i() > 0}>
                  <span aria-hidden="true">→</span>
                </Show>
                <span>{t(`stage.${s}`)}</span>
              </li>
            )}
          </For>
        </ol>

        <div class="flex flex-col gap-1.5">
          <div class="text-12-medium text-text-base">{t("tools.title")}</div>
          <Show when={active().length} fallback={<div class="text-12-regular text-text-weak">{t("tools.none")}</div>}>
            <For each={active()}>{toolRow}</For>
          </Show>
          <For each={finished().filter((x) => x.state === "error" || x.awaiting)}>{toolRow}</For>
          <Show when={finished().length}>
            <div class="text-12-regular text-text-weak">{t("tools.finished", { count: finished().length })}</div>
          </Show>
        </div>

        <div class="flex flex-col gap-1" data-oco-runtime-events>
          <div class="text-12-medium text-text-base">{t("events.title")}</div>
          <Show when={model().events.length} fallback={<div class="text-12-regular text-text-weak">{t("events.none")}</div>}>
            <For each={model().events.slice(-60)}>
              {(e) => (
                <div data-oco-runtime-event={e.kind} class="flex items-baseline gap-2 text-12-regular">
                  <span class="shrink-0 font-mono text-text-weak">{new Date(e.at).toLocaleTimeString(copy.intl())}</span>
                  <span class="min-w-0 break-words" style={{ color: roleColor(e.role) }}>{eventText(t, e)}</span>
                </div>
              )}
            </For>
          </Show>
        </div>

        <div class="flex flex-col gap-0.5 text-12-regular text-text-weak" data-oco-runtime-usage>
          <div class="text-12-medium text-text-base">{t("usage.title")}</div>
          <Show
            when={model().usage.tokens}
            fallback={<div>{model().usage.settled && model().usage.requests ? t("usage.unknown") : t("usage.counting")}</div>}
          >
            {(u) => (
              <div>
                {t("usage.tokens", {
                  input: count(u().input, copy.intl()),
                  cache: count(u().cacheRead + u().cacheWrite, copy.intl()),
                  output: count(u().output, copy.intl()),
                  reasoning: count(u().reasoning, copy.intl()),
                })}
              </div>
            )}
          </Show>
          <Show when={model().usage.requests > model().usage.knownRequests && model().usage.knownRequests > 0}>
            <div>{t("usage.partial", { known: model().usage.knownRequests, requests: model().usage.requests })}</div>
          </Show>
          <Show when={model().usage.context.used !== undefined}>
            <div>
              {model().usage.context.limit
                ? t("usage.context", { used: count(model().usage.context.used!, copy.intl()), limit: count(model().usage.context.limit!, copy.intl()) })
                : t("usage.context.nolimit", { used: count(model().usage.context.used!, copy.intl()) })}
            </div>
          </Show>
        </div>
      </div>
    </div>
  )
}
```

说明（给实现者）：`live()` 在 `childIds` 里被引用而 `live` 定义在其后——Solid 的 `createMemo` 是惰性读取，`childIds` 的函数体只在 `onMount` 的事件回调里被调用，此时 `live` 已定义，不会触发 TDZ；如类型检查报“used before declaration”，把 `childIds` 的定义移到 `live` 之后即可。

- [ ] **Step 2: 类型检查**

```bash
cd vendor/opencode/packages/app && bun run typecheck 2>&1 | grep -E 'session-runtime|session-trajectory' | head -20
```

Expected: 此时会报 `SessionViewToggle value="runtime"` 与 `SessionViewMode` 不兼容——这是 Task 9 要修的；除此之外 `session-runtime*.ts(x)` 不应有其他错误。逐条修掉**本文件内**的其他类型错误（常见：`Match` 的 `when` 返回类型、`getSessionContext` 参数），不要用 `any` 掩盖 `RuntimeModel` 的字段。

---

### Task 9: 接线（三视图切换、页面分支）

**Files:**
- Modify: `session-trajectory.tsx`（第 40、61–86、501 行附近，以实际行号为准）
- Modify: `pages/session.tsx`（第 44、2125–2131 行附近）

**Interfaces:**
- Consumes: Task 8 的 `SessionRuntime`；Task 7 的 `view.runtime` 键。
- Produces: `SessionViewMode = "chat" | "trajectory" | "runtime"`；`SessionTrajectory` 的 props 由 `{ sessionID; onChat; actions? }` 改为 `{ sessionID; onView: (view: SessionViewMode) => void; actions? }`。

- [ ] **Step 1: 改切换器**

`session-trajectory.tsx`：

```diff
-export type SessionViewMode = "chat" | "trajectory"
+export type SessionViewMode = "chat" | "trajectory" | "runtime"
```

`SessionViewToggle` 内，在 `{item("trajectory", ...)}` 之后加：

```tsx
      {item("runtime", language.t("view.runtime"))}
```

`SessionTrajectory`：

```diff
-export function SessionTrajectory(props: { sessionID: string; onChat: () => void; actions?: JSX.Element }) {
+export function SessionTrajectory(props: { sessionID: string; onView: (view: SessionViewMode) => void; actions?: JSX.Element }) {
```

```diff
-          <SessionViewToggle value="trajectory" onChange={(value) => value === "chat" && props.onChat()} />
+          <SessionViewToggle value="trajectory" onChange={(value) => value !== "trajectory" && props.onView(value)} />
```

然后 `grep -n 'props.onChat' session-trajectory.tsx`，若还有其他引用（例如“返回对话”按钮），改为 `props.onView("chat")`。

- [ ] **Step 2: 改页面**

`pages/session.tsx`：

```diff
-import { SessionTrajectory, SessionViewToggle, type SessionViewMode } from "@/components/session/session-trajectory"
+import { SessionTrajectory, SessionViewToggle, type SessionViewMode } from "@/components/session/session-trajectory"
+import { SessionRuntime } from "@/components/session/session-runtime"
```

把原 trajectory 分支改为（`onChat` → `onView`），并在其后加入 runtime 分支：

```tsx
          <Match when={params.id && store.view === "trajectory" ? params.id : undefined}>
            {(id) => (
              <SessionTrajectory
                sessionID={id()}
                onView={(view) => setStore("view", view)}
                actions={platform.embedded ? <SessionHeaderEmbeddedActions /> : undefined}
              />
            )}
          </Match>
          <Match when={params.id && store.view === "runtime" ? params.id : undefined}>
            {(id) => (
              <SessionRuntime
                sessionID={id()}
                onView={(view) => setStore("view", view)}
                actions={platform.embedded ? <SessionHeaderEmbeddedActions /> : undefined}
              />
            )}
          </Match>
```

并把 `sessionViewState` 里的注释改为 `// oco: 对话 / 轨迹 / 运行 view of the chat column; back to 对话 on every session switch.`（行为不变：`store.view` 不持久化，切会话回到 `"chat"`）。

- [ ] **Step 3: 类型检查与全部相关单测**

```bash
cd vendor/opencode/packages/app && bun run typecheck 2>&1 | tail -3
bun test --conditions=solid --preload ./happydom.ts ./src/components/session 2>&1 | tail -5
```

Expected: 类型错误数不高于 Task 1 基线；`./src/components/session` 下测试全通过（含原有 `session-context-*`、`session-trajectory-model` 与新增文件）。

- [ ] **Step 4: 构建 webview 并检查产物含新视图**

```bash
cd /Users/xiaojiang/Ai-Project/oco/.claude/worktrees/nostalgic-gates-ef74ca && ln -sfn ../../vendor/opencode/packages/app/node_modules apps/chat-webview/node_modules && bash scripts/build-webview.sh 2>&1 | tail -4
grep -l 'data-oco-runtime' apps/extension/media/chat/assets/*.js | head -2
```

Expected: 构建成功；`grep` 至少列出一个 `app-*.js`。（`apps/chat-webview/node_modules` 是仓库既有的、被 `.gitignore` 忽略的软链接；`scripts/setup.sh` 也建这条链接。）构建失败则报告并附末尾 20 行，不要改构建脚本。

---

### Task 10: 事件级测试（Section 4②）

用真实的 `applyDirectoryEvent` 驱动一个 store，再用同一个 store 喂 `buildRuntime`，验证只有事件序列才能证明的行为。

**Files:**
- Create: `vendor/opencode/packages/app/src/components/session/session-runtime-events.test.ts`

**Interfaces:**
- Consumes: `applyDirectoryEvent`（`@/context/global-sync/event-reducer`）；`State`（`@/context/global-sync/types`）；`buildTrajectory`、`buildRuntime`、`eventSessionID`。

- [ ] **Step 1: 取得 `baseState` 夹具**

```bash
cd vendor/opencode/packages/app/src/context/global-sync && grep -n 'const baseState' -A40 event-reducer.test.ts | head -60
```

把 `baseState` 的完整定义**原样复制**到新测试文件顶部（它是该测试文件内的私有 helper，不是导出的；复制时连同它依赖的 `rootSession`、`userMessage` 等小 helper 一起）。

- [ ] **Step 2: 写测试**

```ts
// oco (patches/opencode/0019): event-level checks — what only an event sequence can prove.
import { describe, expect, test } from "bun:test"
import { createStore } from "solid-js/store"
import { applyDirectoryEvent } from "@/context/global-sync/event-reducer"
import { buildTrajectory } from "./session-trajectory-model"
import { trajectoryText } from "./session-trajectory-i18n"
import { buildRuntime, eventSessionID } from "./session-runtime-model"
// ...baseState and its helpers copied from event-reducer.test.ts (Step 1)

const language = trajectoryText({ locale: () => "en", intl: () => "en" })
const SID = "ses_1"
const T0 = 1_790_000_000_000

const feed = (store: any, setStore: any, type: string, properties: unknown) =>
  applyDirectoryEvent({ event: { type, properties }, store, setStore, push() {}, directory: "/tmp", loadLsp() {} })

const runtimeOf = (store: any, now: number) => {
  const messages = store.message[SID] ?? []
  const parts = (id: string) => store.part[id] ?? []
  const built = buildTrajectory({ messages, parts, now, busy: true, language })
  return buildRuntime(
    {
      mode: "live",
      sessionID: SID,
      parts,
      status: store.session_status[SID],
      permissions: store.permission[SID] ?? [],
      questions: store.question[SID] ?? [],
      childStatus: (id: string) => store.session_status[id],
      requests: built.requests,
    },
    now,
  )
}

describe("runtime over the real reducer", () => {
  test("permission asked → replied moves the run through waiting-user and back", () => {
    const [store, setStore] = createStore(baseState({}))
    feed(store, setStore, "session.status", { sessionID: SID, status: { type: "busy" } })
    expect(runtimeOf(store, T0).run.state).toBe("working")
    feed(store, setStore, "permission.asked", { id: "per_1", sessionID: SID, permission: "edit", patterns: ["a.ts"], metadata: {}, always: [] })
    expect(runtimeOf(store, T0).run.state).toBe("waiting-user")
    feed(store, setStore, "permission.replied", { sessionID: SID, requestID: "per_1" })
    expect(runtimeOf(store, T0).run.state).toBe("working")
  })

  test("a retry status reaches the model with attempt and next, then clears on busy", () => {
    const [store, setStore] = createStore(baseState({}))
    feed(store, setStore, "session.status", { sessionID: SID, status: { type: "retry", attempt: 3, message: "429", next: T0 + 5000 } })
    expect(runtimeOf(store, T0).run.retry).toEqual({ attempt: 3, message: "429", next: T0 + 5000 })
    feed(store, setStore, "session.status", { sessionID: SID, status: { type: "busy" } })
    expect(runtimeOf(store, T0).run.retry).toBeUndefined()
  })

  test("a part delta that arrives before its part is dropped by the store (documented upstream behavior)", () => {
    const [store, setStore] = createStore(baseState({}))
    feed(store, setStore, "message.part.delta", { sessionID: SID, messageID: "msg_x", partID: "prt_x", field: "text", delta: "hi" })
    expect(store.part["msg_x"]).toBeUndefined()
    expect(store.part_text_accum_delta?.["prt_x"]).toBeUndefined()
  })

  test("eventSessionID matches the events the reducer receives, so unrelated sessions never refresh freshness", () => {
    expect(eventSessionID({ type: "session.status", properties: { sessionID: SID, status: { type: "busy" } } })).toBe(SID)
    expect(eventSessionID({ type: "permission.asked", properties: { id: "p", sessionID: SID } })).toBe(SID)
    expect(eventSessionID({ type: "server.heartbeat", properties: {} })).toBeUndefined()
  })
})
```

- [ ] **Step 3: 运行**

```bash
cd vendor/opencode/packages/app && bun test --conditions=solid --preload ./happydom.ts ./src/components/session/session-runtime-events.test.ts 2>&1 | tail -8
```

Expected: 4 条通过。若 `session.status` 事件的 `properties` 形状与上面不同（以 `event-reducer.ts` 里 `case "session.status"` 为准），修**测试**里的形状；若 `part_text_accum_delta` 断言因字段不存在而报类型错误，改为只断言 `store.part["msg_x"]` 为 `undefined`。若第 3 条实际**不**丢弃（行为与证据不符），停止并报告：这会推翻 spec 第 4 项核查结论 4，需回到设计。

- [ ] **Step 4: 类型检查不新增错误。**

---

### Task 11: E2E 套件 `c5-runtime`（委派给 Grok；失败时通用子代理）

遵循 AGENTS.md：E2E 运行与失败诊断交 Grok，主线程只读 `results.json`，不看截图。委派前先做 ≤10 秒健康检查（`grok-build:check` 或一次最小请求）；失败则换 `gemini-worker`，都失败就主线程做并写明原因。

**Files:**
- Create: `tests/e2e/c5-runtime.mjs`
- Modify: `tests/e2e/run.mjs`（`DEFAULT_SUITES` 末尾加 `"c5-runtime"`）

**Interfaces:**
- Consumes: Task 8 的数据属性（`data-oco-runtime*`、`data-oco-view="runtime"`）；`tests/e2e/c4-trajectory.mjs` 的脚手架（`createRun`、`launch`、`chatFrames`、`frameSession`、`waitUntil`、`api`、`messages`、`waitReply`、`MODEL`）。

**委派提示词（原样使用）：**

```text
项目：/Users/xiaojiang/Ai-Project/oco/.claude/worktrees/nostalgic-gates-ef74ca。目标：新增 E2E 套件 c5-runtime，验证运行视图 M1。
唯一写入范围：tests/e2e/c5-runtime.mjs、tests/e2e/run.mjs（仅在 DEFAULT_SUITES 末尾加 "c5-runtime"）。其他只读，不撤销他人改动。
要读的文件：tests/e2e/c4-trajectory.mjs（照它的脚手架：createRun、launch、chatFrames、frameSession、waitUntil、api/messages/waitReply），tests/e2e/lib/*，tests/e2e/vscode.mjs，tests/e2e/server.mjs；视图实现 vendor/opencode/packages/app/src/components/session/session-runtime.tsx（只为读选择器）。不要全仓搜索。
前提：先在本 worktree 里按 docs/superpowers/plans/2026-10-03-runtime-dashboard-m1.md 的 Task 9 Step 4 构建 webview（bash scripts/build-webview.sh），再 bun run build:extension；否则 E2E 跑的是旧 UI。
REQUIRED 检查（每条一个 run 步骤，名称固定）：
  toggle-three   标题栏切换器有 3 项，data-oco-view 依次为 chat / trajectory / runtime；点“运行/Runtime”后出现 [data-oco-runtime]，输入框仍在。
  idle-state     会话空闲时 [data-oco-runtime-state]="idle"，[data-oco-runtime-focus] 为 done 或 idle。
  tool-turn      从聊天视图发一条会触发 bash 工具的消息（沿用 c4-trajectory 里的做法），切到“运行”：出现 [data-oco-runtime-tool]，完成后 [data-oco-runtime-event="tool.end"] 至少一条，[data-oco-runtime-event="request.end"] 至少一条。
  usage-known    请求结束后 [data-oco-runtime-usage] 含数字（不是“统计中…”）；运行中不出现 0。
  last-event     [data-oco-runtime-last] 存在，文本含“last event”或“最后事件”；页面任何位置都不含“disconnect”“断连”“斷連”（大小写不敏感）。
  replay         点“暂停跟随/Pause following”后 [data-oco-runtime-mode]="replay"，出现滑块与 [data-oco-runtime-replay-note]；拖到第 0 步时工具行数量 <= 完成后的数量；点“返回实时/Back to live”回到 mode="live"。
  back-to-chat   切回“对话”，聊天时间线重新出现。
  trajectory-still-works  切到“轨迹”再点“对话”，行为与 c4-trajectory 的 toggle-open/back-to-chat 一致。
  locale-copy    OCO_E2E_LOCALE=zh-cn 时切换器第三项文案为“运行”，状态文案为中文。
不要伪造数据，不要读取或写入凭据。
验收：node tests/e2e/run.mjs --only c5-runtime（用 run.mjs 现有的选择套件方式，先读它的参数）两种 locale 各跑一次，results.json 中 REQUIRED 全部 pass；同时跑 c4-trajectory 确认它仍通过（切换器改动不得破坏它；它的 REQUIRED 里没有“第三项”，若失败是因为选择器假设两项，请在你的写入范围外只报告，不要改 c4）。
报告不超过 15 行：改动文件；命令与结果数字；每个 REQUIRED 的状态；未解决项。完整日志写入 docs/evidence/runtime-m1-e2e.md；不要回传截图或全文。
新上下文，不要附带本会话全史（API 支持时 fork_turns: none）。model/provider 以工具返回为准，缺失则写 unknown。
```

- [ ] **Step 1: 健康检查并发出委派**（见上）。
- [ ] **Step 2: 读回 `results.json` 路径与 ≤15 行报告**；若有 REQUIRED 失败，把失败项交回 Grok 诊断一次；仍失败则在 Task 13 的 STATUS 里记录为 FAIL 并附原因，不改成 PASS。
- [ ] **Step 3: 确认 c4-trajectory 仍通过**（或其失败项已如实记录）。

---

### Task 12: 生成补丁 0019 并在干净上游上重放验证

**Files:**
- Create: `patches/opencode/0020-oco-runtime-view.patch`

**Interfaces:**
- Consumes: Task 1 的基线提交；Task 2–10 在 vendor 里未提交的改动。
- Produces: 可重放的补丁文件。

- [ ] **Step 1: 确认改动范围只含预期文件**

```bash
cd vendor/opencode && git status --porcelain
```

Expected: 恰好这些：`M packages/app/src/components/session/session-trajectory-i18n.ts`、`M .../session-trajectory.tsx`、`M packages/app/src/pages/session.tsx`，以及 `??` 的 `session-runtime-model.ts`、`session-runtime-model.test.ts`、`session-runtime-events.test.ts`、`session-runtime-i18n.ts`、`session-runtime-i18n.test.ts`、`session-runtime.tsx`。若出现其他文件，查明来源，不要打进补丁。

- [ ] **Step 2: 生成补丁（plain `diff --git`，与 0001–0018 同格式）**

```bash
cd vendor/opencode && git add -N packages/app/src && git diff HEAD -- packages/app > ../../patches/opencode/0020-oco-runtime-view.patch
cd ../.. && head -3 patches/opencode/0020-oco-runtime-view.patch && grep -c '^diff --git' patches/opencode/0020-oco-runtime-view.patch
```

Expected: 第一行 `diff --git a/packages/app/...`；`diff --git` 计数为 9。

- [ ] **Step 3: 在第二份干净检出上依序重放 0001→0019**

```bash
rm -rf /private/tmp/claude-501/oco-clean && git clone --quiet /Users/xiaojiang/Ai-Project/oco/vendor/opencode /private/tmp/claude-501/oco-clean
git -C /private/tmp/claude-501/oco-clean checkout --quiet --detach 51ef4be1d3c122f18fefb510dca8d778571f4f18
for p in $(ls patches/opencode/*.patch | sort | head -19); do
  git -C /private/tmp/claude-501/oco-clean apply --check "$p" && git -C /private/tmp/claude-501/oco-clean apply "$p" && echo "ok $(basename $p)" || { echo "FAIL $p"; break; }
done
```

Expected: 19 行 `ok ...`，没有 `FAIL`。0019 单独对裸上游 `--check` 会失败（它建立在 0012–0014 之上），这是预期，不是缺陷。

- [ ] **Step 4: 重放结果与开发树一致，且单测在重放树里也通过**

```bash
diff -r /private/tmp/claude-501/oco-clean/packages/app/src vendor/opencode/packages/app/src && echo "tree identical"
```

Expected: `tree identical`（若 `bun install` 产生的差异不在 `src` 下，不影响）。再运行：

```bash
cd vendor/opencode/packages/app && bun test --conditions=solid --preload ./happydom.ts ./src/components/session 2>&1 | tail -4
```

Expected: 全部通过，记录通过数字。

- [ ] **Step 5: 提交（任务写明授权时才提交；本计划的执行者先询问用户是否授权提交）**

```bash
git add patches/opencode/0020-oco-runtime-view.patch tests/e2e/c5-runtime.mjs tests/e2e/run.mjs
git commit -m "feat: runtime view (patch 0019, M1)"
```

提交信息末尾按本会话的归因提示加上 `Co-Authored-By` 行。未获授权则只列出待提交文件，不提交。

---

### Task 13: 验收与文档

**Files:**
- Modify: `docs/STATUS.md`、`docs/PROGRESS.md`（追加批次）、`docs/superpowers/specs/2026-10-02-runtime-dashboard-design.md`（回写“与 spec 的两处偏差”）
- Create: `docs/evidence/runtime-m1-verification.md`

**Interfaces:**
- Consumes: 前面任务的命令输出数字与 `docs/evidence/runtime-m1-e2e.md`。

- [ ] **Step 1: 跑一遍离线验证并记录数字**

```bash
cd /Users/xiaojiang/Ai-Project/oco/.claude/worktrees/nostalgic-gates-ef74ca && bun run verify:brief 2>&1 | tail -8
cd vendor/opencode/packages/app && bun run typecheck 2>&1 | tail -3
bun test --conditions=solid --preload ./happydom.ts ./src/components/session 2>&1 | tail -4
```

- [ ] **Step 2: 写 `docs/evidence/runtime-m1-verification.md`**

按下表逐项填**实际**结果（PASS/FAIL/NOT RUN/BLOCKED + 命令 + 数字 + 限制），不得把历史结果当本轮通过：

| 验收项 | 证据 | 状态 |
|---|---|---|
| 单元：`buildRuntime`/`snapshotAt`/i18n | Task 2–7 命令输出 | |
| 事件级：权限/重试/delta/事件会话归属 | Task 10 | |
| 类型：vendor `tsgo -b` 不新增错误 | Task 9 Step 3 与基线对比 | |
| 补丁：0001→0019 在干净 `51ef4be` 上重放 | Task 12 Step 3–4 | |
| webview 构建含新视图 | Task 9 Step 4 | |
| E2E：c5-runtime（en/zh）与 c4-trajectory 回归 | `docs/evidence/runtime-m1-e2e.md` | |
| 真实取消 / 权限生命周期 / 回放与历史重建一致 / 真实模型长会话性能 / Remote | 本里程碑不验证 | NOT RUN |
| 子代理/权限询问/429 重试的 E2E 场景 | 现有 mock 是否能产出未查；见 M2 计划前提 | NOT RUN |

- [ ] **Step 3: 更新 STATUS 与 PROGRESS**：STATUS 只写当前事实（运行视图 M1 已完成/未完成项、补丁 0019 状态）；PROGRESS 追加本批次条目。两个文件在主检出里有他人未提交改动，**只改本 worktree 里的副本**，合并冲突由集成人处理。
- [ ] **Step 4: 回写 spec**：在 spec 第 3 段末尾追加一行“实施偏差：不改 `message-timeline.tsx` 与 `session-trajectory-model.ts`；改 `session-trajectory.tsx`、`session-trajectory-i18n.ts`、`pages/session.tsx`（见 M1 计划）”。
- [ ] **Step 5: 为 M2 准备的未决项清单**（写进证据文件末尾）：mock 能否产出子代理/权限/429；子会话加载（`sync → loadMessages`）与 4 小时回收边界；批准/拒绝按钮走现有回复通道；单个 step-finish 假设；是否把“断连”提议提交给集成人。

---

## Self-Review

**1. Spec 覆盖（M1 范围）：**
- 数据契约第 1 段：`freshness`/`run`/`sessions`/`requests`/`tools`/`usage` → Task 2–5；规则 1–7 → Global Constraints + 对应测试（未知≠0：Task 4；task≠子代理结束：Task 3；推断标记：Task 4/5；独立性：Task 2；无未来：Task 6；回看按步骤：Task 6/8；容量与组成分开：Task 4/8，组成明细 M3）。
- 画面第 2 段：顶栏、焦点区、阶段条、活跃工具、事件日志、页脚用量、回看（暂停跟随/返回实时）→ Task 8；权限按钮、子代理展开、取消 → M2；机制图、减少动画、键盘读屏全套 → M3（Task 8 已用 `button`/`ol`/`aria-current`/文字+字形，但全套验收在 M3）。
- 第 3 段落点：偏差已列明并在 Task 13 回写。
- 第 4 段测试：① 单元 Task 2–7；② 事件级 Task 10（权限生命周期、重试、delta、最后事件）；“取消在途”“运行中子会话被裁剪的边界”属 M2；“回放一致性（事后重建 vs 实时一路构建）”在 Task 6 以同一数据的步骤层一致性覆盖，**真正的“实时一路构建”对比**需要逐事件重放，留给 M2。③ E2E 的视图切换/回看/文案在 Task 11，三种宽度、明暗主题、减少动画、键盘在 M3。
- 第 5 段 M1 清单：第三视图、顶栏、焦点区、阶段条、并行工具行、事件日志、用量页脚、最后事件、实时+回看、三语 → 全覆盖；补丁 0019 与 `--check` → Task 12。

**2. 占位扫描：** 无 TBD/TODO/“稍后实现”；Task 2 的“最小形状占位”是明确的中间状态，Task 5 结束时 `RuntimeModel` 完整；Task 11 的 E2E 代码由委派者按给定的检查清单和选择器编写（计划不包含该脚本的逐行代码，这是有意的：它依赖 `c4-trajectory.mjs` 的脚手架，且 AGENTS.md 要求该类工作委派）。

**3. 类型一致性：** `RuntimeInput`/`RuntimeRun`/`RuntimeAttention`（Task 2）→ Task 3 的 `toolOf` 使用 `input.permissions`/`questions`/`childStatus`；`RuntimeTool`（Task 3）→ Task 5 的 `focusOf`/`eventsOf`/`sessionsOf`；`RuntimeRequest`（Task 4）→ `stageOf`/`focusOf`/`eventsOf`；`snapshotAt`（Task 6）→ Task 8 的 `assemble`；`runtimeText.t` 的键 → Task 8 用到的键均在 Task 7 字典内（`event.${role}.${kind}` 动态拼接对应 `event.tool.*`/`event.subagent.*`，`event.request.*` 由 `model` 角色走 `event.${e.kind}`）。

**4. Review Focus 对应：** 空会话（Task 5 “empty session”）、重复消息（Task 3）、超长输入（Task 3）、游标早于全部消息（Task 6）、task 缺 sessionId（Task 3）。

**未验证声明（诚实记录）：** 本计划里的 TypeScript 代码**没有被执行**——vendor 副本要等 Task 1 才建立，计划阶段不写产品代码。两处假设需要执行者在 Task 2–5 红/绿循环里首先确认：`QuestionInfo` 有 `question: string` 字段、`QuestionRequest.tool` 形如 `{ messageID, callID }`（若不是，改 `attentionOf` 与 `sameCall` 的类型，不改契约）；`AssistantMessage.tokens` 为非可选对象（已在 `session-context-metrics.ts` 里确认）。
