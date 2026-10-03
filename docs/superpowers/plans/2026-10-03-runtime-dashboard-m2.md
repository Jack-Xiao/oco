# 运行视图 M2（需要你的时刻）实施计划

**Goal:** 在运行视图里直接处理“要不要我处理”：权限批准/拒绝、提问转去回答或拒绝、停止在途运行、看清重试倒计时；子代理（含后台）单层展开，父 task 完成与子会话结束分开显示。补丁 0019 追加，不新开补丁。

**Spec:** `docs/superpowers/specs/2026-10-02-runtime-dashboard-design.md`（第 2、4、5 段）。前置核查：`docs/evidence/runtime-m2-preflight.md`（Gemini，主线程抽查 3 处与源码一致）。M1 计划：`docs/superpowers/plans/2026-10-03-runtime-dashboard-m1.md`（脚手架、验证命令、补丁流程沿用）。

**工作树：** 本 worktree（分支 `claude/nostalgic-gates-ef74ca`），vendor 开发树 `vendor/opencode`（本地草稿仓库，M1 结束于 `c861179`）。M2 基线 = 执行开始时 vendor 的 HEAD，记入账本 `.superpowers/sdd/2026-10-03-runtime-dashboard-m2/progress.md`。每个任务在 vendor 内单独提交，便于按范围评审。不合并到 main。

## 已定裁定（实现以此为准）

1. **先重构再加按钮**（原列 M3）：工具行、待处理列表、事件日志改为按稳定 id 渲染。否则流式更新时按钮被重建，键盘焦点丢失、点击可能丢。
2. **权限回复**沿用对话视图的调用：`sdk().api.permission.reply({ sessionID: 请求自己的 sessionID, requestID, reply: "once" | "always" | "reject" })`。子会话的权限因此可在根视图处理。点击后该请求进入“处理中”（按钮禁用），直到 store 里该请求消失；失败时显示错误并恢复可点。
3. **提问不在运行视图里重做回答界面**：提供“去对话中回答”（切到对话视图，由现有提问 dock 回答）和“拒绝”（`sdk().api.question.reject({ requestID })`，与 dock 的拒绝同一调用）。不复制答案逻辑。
4. **“已请求取消”只来自本视图的点击**（界面状态，不进模型）；“已取消”只来自数据（assistant 消息 `error.name === "MessageAbortedError"`，事件证据）。不从服务端数据推断“已请求”。
5. **停止**由页面传入 `onStop`，与输入框停止一致：`setFollowup("paused", id, true)` + `sdk().api.session.interrupt({ sessionID: id })`。只中断根会话；子会话由服务端级联（preflight 第 4 条）。
6. **回看永远不可操作**：回看模式不渲染任何回复/停止按钮（DOM 中不存在，不只是禁用）。
7. **子代理单层**：展开只显示一层子会话的运行摘要（焦点一句、活跃工具、生命周期）。孙会话只显示一行（代理名 + 生命周期），不再展开（≥2 层折叠属 M3）。展开期间全局顶栏、待处理列表照常显示（spec 场景 3）。
8. **子会话数据**：运行视图对“当前轮（与最后请求同一 turn）的 task 子会话”自动 `sync().session.sync(id)`，最多 8 个，每个只请求一次；展开时也会 sync。运行中的子会话在视图存活期间保持数据（若有 pin/unpin 接口则 pin，`onCleanup` 时 unpin；没有则记录为限制）。
9. **429 mock 单列任务**：仅当提示词含 `RETRY-ONCE-<tag>` 时，该 tag 第一次请求返回 429 + `retry-after: 1`，之后正常。其他套件不受影响。
10. **E2E 扩展 `c5-runtime`，不新增套件**：`DEFAULT_SUITES` 保持 22，`tests/unit/e2e-results.test.ts` 与 `docs/TEST-SCOPE.md` 不需改；若执行中改为新增套件，必须同一任务内同步这两处。
11. 后台子代理需要 `OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS`，`scripts/test-server.sh` 用 `env -i` 不透传，E2E 无法覆盖：单元测试覆盖，E2E 记为 NOT RUN（不改测试脚本的环境传递，除非另行决定）。

## 模型契约增量（只加不改名、不删除）

```ts
export type ChildLifecycle = "running" | "retrying" | "waiting-user" | "done" | "error" | "cancelled" | "unknown"
RuntimeChild.lifecycle: ChildLifecycle            // 由 "running" | "unknown" 加宽
RuntimeRequest.cancelled: boolean                 // 原始 message.error?.name === "MessageAbortedError"
RuntimeTool.cancelled: boolean                    // 实施（8815155，评审 I1）：只认工具自身的中止信号——state=error 且 error 文本为 "Tool execution aborted" 或 metadata.interrupted；不从“所属请求 cancelled”推断
RuntimeFocus 增加 { kind: "cancelled" }
RuntimeEvent.kind 增加 "request.cancelled"（代替该请求的 "request.error"）
RuntimeInput 增加:
  childMessages?: (sessionID: string) => Message[] | undefined   // undefined = 未加载
  parentOf?: (sessionID: string) => string | undefined          // 会话父链，用于孙会话待处理上溯
```

子代理生命周期（仅实时；回看一律 `unknown` + inferred，界面写明）：
1. 该子会话或其后代有待处理权限/提问 → `waiting-user`（event）
2. `childStatus` 为 retry → `retrying`；busy → `running`（event）
3. 否则已加载 `childMessages`：最后一条 assistant 为 `MessageAbortedError` → `cancelled`；其他 error → `error`；有 `time.completed` → `done`（event）；没有 assistant 或仍开着 → `unknown`（inferred）
4. 未加载 → `unknown`（inferred）

`task` 调用 completed 与子会话生命周期互不推导（后台 task 立即 completed 而子会话仍 running，必须如实显示两者）。

运行状态：最后请求 `cancelled` 且会话空闲 → `run.state = "idle"`，`focus.kind = "cancelled"`，不显示成 error。

## Global Constraints（沿用 M1，另加）

- M1 的全部约束继续有效（未知≠0、不显示“断连”、推断标 inferred、回看按步骤、三语、不改宿主/桥/公共契约）。
- 新文案 en / zh / zht 三语一致，`session-runtime-i18n.test.ts` 的键一致性测试必须继续通过。
- 验证命令：单测 `cd vendor/opencode/packages/app && bun test --conditions=solid --preload ./happydom.ts ./src/components/session`；类型 `cd vendor/opencode/packages/app && bun run typecheck`（0 错误）。仓库根 `bun run verify:brief` 不覆盖 vendor。
- 每个任务结束：单测全过、类型 0 错误、`git -C vendor/opencode diff --check` 干净，在 vendor 内提交一次。

## 数据属性（E2E 契约，Task 3/4 产出，Task 7 消费）

| 属性 | 位置 |
|---|---|
| `data-oco-runtime-attention=<id>` + `data-oco-runtime-attention-kind=permission\|question` | 每个待处理项（焦点区与列表） |
| `data-oco-runtime-reply=once\|always\|reject` | 权限按钮 |
| `data-oco-runtime-question=answer\|reject` | 提问按钮 |
| `data-oco-runtime-pending` | 处理中的待处理项 |
| `data-oco-runtime-stop` | 停止按钮 |
| `data-oco-runtime-cancel=requested\|cancelled` | 取消状态文本 |
| `data-oco-runtime-retry` | 重试倒计时文本 |
| `data-oco-runtime-child-toggle=<sessionID>` | 子代理行的展开按钮 |
| `data-oco-runtime-child=<sessionID>` + `data-oco-runtime-child-lifecycle=<ChildLifecycle>` | 展开面板 |
| `data-oco-runtime-child-open=<sessionID>` | “在对话中打开”按钮 |
| `data-oco-runtime-focus=cancelled` | 焦点（已有属性，新值） |

---

### Task 1：稳定渲染重构 + M1 遗留小项（Gemini）

**Files:** 新建 `session-runtime-keyed.ts`、`session-runtime-keyed.test.ts`；改 `session-runtime.tsx`。

- 新增 `keyed<T>(list: Accessor<T[]>, key: (x: T) => string): { ids: Accessor<string[]>; get: (id: string) => T | undefined }`：`ids` 是带内容相等比较的 memo（id 序列不变则不触发下游），`get` 读最新对象。
- 工具行（活跃、中断、出错/等待）、事件日志、待处理列表改为 `<For each={ids()}>{(id) => row(() => get(id)!)}`；行组件读 accessor，不捕获对象。
- `treeRequests` memo 加 `equals`：权限与提问数组按元素引用逐一相同则视为不变（M1 遗留：会话增删时强制重建约 150 ms）。
- `inFlightMessageID` 只看最后一条 assistant 消息（M1 遗留：较早崩溃的未完成消息 + busy 时会选错）。
- 中断的工具行不再用 ◐，改用 `◌`（文字标签已正确）。
- 测试：`keyed` 在 createRoot 中：内容相同的新数组不改变 `ids` 的引用/不触发 effect；`get` 返回最新对象；顺序变化会触发。`inFlightMessageID` 若是组件内部 memo，提取为纯函数 `inFlightOf(messages, busy)` 放进模型文件并测试 3 种情况。
- 验收：单测全过（数字记账），类型 0 错误；c5 现有选择器不变。

### Task 2：模型增量——取消、子代理生命周期、待处理上溯（Gemini）

**Files:** `session-runtime-model.ts`、`session-runtime-model.test.ts`。

按上文“模型契约增量”实现。另修 M1 遗留：
- 孙会话的待处理项让根视图里对应的 task 行 `awaiting`（用 `parentOf` 上溯到直接子会话）。
- 多个 task 行引用同一子会话 id 时，只有最后一行（请求序号最大、同请求内后出现）带 `awaiting`。

测试（每条一个用例）：
1. `MessageAbortedError` 的请求：`cancelled=true`，事件为 `request.cancelled`，`run.state="idle"`，`focus.kind="cancelled"`；其中 error 为 "Tool execution aborted" 的工具 `cancelled=true`。先用夹具确认 `buildTrajectory` 对该消息给出的 status，测试写明实际值。
2. 普通错误请求仍是 `error`，`cancelled=false`。
3. 后台 task：工具 completed、`input.background=true`，子会话 busy → `child.lifecycle="running"`，工具 state 仍 completed。
4. 前台 task completed，子会话已加载且最后 assistant 已完成、状态 idle → `done`（event）；未加载 → `unknown`（inferred）。
5. 子会话最后 assistant 为 `MessageAbortedError` → `cancelled`；为其他错误 → `error`；`childStatus` retry → `retrying`。
6. 孙会话有待处理权限 → 根的 task 行 `awaiting`、子代理 `lifecycle="waiting-user"`；焦点仍是该权限。
7. 两个 task 行共享子会话 id → 只有后一行 `awaiting`。
8. 回看模式：生命周期一律 `unknown` + inferred，`attention` 为空。
- 验收：单测全过，类型 0 错误。

### Task 3：操作——权限回复、提问去向、停止、重试倒计时（Gemini）

**Files:** `session-runtime.tsx`、`session-runtime-i18n.ts`、`session-runtime-i18n.test.ts`（如需）、`pages/session.tsx`。

- 组件新 props：`onStop?: () => void`、`onOpenSession?: (sessionID: string) => void`（Task 4 用；本任务一并接线）。
- `pages/session.tsx` 的 runtime 分支传入：`onStop` = 裁定 5；`onOpenSession` = 页面里现有的会话跳转（照 `directory-layout.tsx` 的 `onNavigateToSession`：`navigate(href(sessionID))`，在 session.tsx 中找同等的路由构造，不新写路由规则）。
- 焦点区：`attention` 焦点显示文字 + 按钮（权限：允许一次/总是允许/拒绝；提问：去对话中回答/拒绝）。焦点之外的其余待处理项在焦点下方列表显示，各带按钮。按钮只在 `mode==="live"` 渲染。
- 处理中状态：按请求 id 记录；请求从 store 消失即清除；调用失败显示 `action.failed` 文案并恢复。
- 停止按钮：实时且 `run.state ∈ {working, retrying, waiting-user}` 时显示。点击：记录 `cancelRequestedAt`，调用 `props.onStop()`。显示规则：已点击且会话仍 busy → “已请求取消”（`data-oco-runtime-cancel="requested"`）；焦点为 `cancelled` → “已取消”（`cancelled`）；busy 结束或出现 start 晚于点击时间的新请求时清除点击记录。
- 重试：焦点 retry 显示“第 N 次重试，xx 秒后”（`next - wall()`；≤0 显示“即将重试”），带 `data-oco-runtime-retry`。
- 取消的工具行用 `⊘` 与“已取消”文案；事件日志 `request.cancelled` 文案。
- 新文案三语：按钮、处理中、失败、已请求取消、已取消、重试倒计时、子代理生命周期 7 种、展开/收起、在对话中打开、回看中生命周期未知的说明。
- 测试：i18n 键一致性；若可行，为按钮渲染条件提取纯函数（`actionsVisible(mode, state)`、`cancelLabel(clickedAt, busy, focusKind, lastRequestStart)`）并单测。
- 验收：单测全过，类型 0 错误。

### Task 4：子代理展开与子会话数据（Gemini）

**Files:** `session-runtime.tsx`（可拆出 `session-runtime-child.tsx`）、`session-runtime-i18n.ts`。

- 根模型输入接 `childMessages: (id) => sync().data.message[id]`、`parentOf: (id) => sync().session.get(id)?.parentID`。
- 裁定 8 的自动加载；展开时 sync。若有 pin/unpin（`serverSync().session.pin`）就在展开/运行中 pin，`onCleanup` unpin；查不到可用接口就写进报告的限制，不自行实现回收逻辑。
- 子代理行加“展开/收起”按钮（`aria-expanded`，Enter/Space 可用）。展开面板：对子会话 id 复用 `assemble` 构建子模型，显示一句焦点、活跃工具行（不含展开按钮）、生命周期文字。“在对话中打开”按钮调用 `props.onOpenSession`。
- 父 task 行同时显示 task 状态与子会话生命周期两段文字，不合并。
- 展开状态是界面状态，按子会话 id 记录，不进模型；子模型构建只在展开时进行。
- 测试：若展开面板的数据组合可提取为纯函数，则单测；否则依赖 Task 5 事件测试与 Task 7 E2E。
- 验收：单测全过，类型 0 错误。

### Task 5：事件级测试（Gemini）

**Files:** `session-runtime-events.test.ts`（追加）。沿用 M1 的 reducer 驱动方式。

1. `permission.asked`（子会话）→ 根模型 attention 1 项且 sessionID 为子会话 → `permission.replied` → attention 清空，状态回 working。
2. 回看（`snapshotAt` + replay）时同一数据的 attention 为空、`attentionKnown=false`（不可操作的数据前提）。
3. 取消序列：busy → 工具 running → assistant 更新为 `MessageAbortedError`、工具 error "Tool execution aborted" → status idle：焦点 `cancelled`、事件含 `request.cancelled`。
4. 重试序列：status retry(attempt 1, next) → busy → idle：run.state 依次 retrying → working → idle。
5. spec 场景 3：根有待处理权限，同时子会话在运行：根模型焦点为该权限，子代理生命周期 running，两者并存。
6. 后台 task：task part completed 后子会话仍 busy → 子代理 running；子会话 idle 且最后 assistant 完成 → done。
- 验收：单测全过。

### Task 6：mock 429（Gemini）

**Files:** `tests/e2e/lib/mock-llm.mjs`、新建 `tests/unit/mock-llm.test.ts`。

- 裁定 9。tag 记录在模块级 Set；429 响应体 `{"error":{"message":"Rate limit reached (mock)","type":"rate_limit_exceeded","code":"rate_limit_exceeded"}}`，头 `retry-after: 1`。
- 单测：起 `createMockServer()` 于随机端口，同一 `RETRY-ONCE-x` 请求两次：第一次 429 且有 `retry-after`，第二次 200；不含 tag 的请求从不返回 429。
- 验收：仓库根 `bun run verify:brief` typecheck 0 错误、unit 全过（记录新总数）。

### Task 7：E2E 扩展 c5-runtime（Gemini 运行与诊断；主线程只读 results.json）

**Files:** `tests/e2e/c5-runtime.mjs`。前提：Task 1–6 完成；构建 webview（`bash scripts/build-webview.sh`）与 extension（`bun run build:extension`）。独立服务端口沿用 M1（4617/4618），不碰 4517 与用户的 VS Code；结束后确认端口释放、无遗留 VS Code。

新增 REQUIRED（保留 M1 的全部检查）：
- `perm-approve`：触发 bash ask，运行视图出现 `attention-kind=permission` 与三个回复按钮；点“允许一次”→ 处理中 → 工具完成、attention 消失。（M1 用 API 回复的步骤改为点击。）
- `perm-reject`：再次触发，点“拒绝”→ 工具以错误结束，attention 消失。
- `question-route`：触发 question，点“去对话中回答”→ 对话视图出现、提问 dock 可见；在 dock 选一项并提交，回到运行视图后 attention 消失。
- `stop`：长流提示词，点停止 → 最终 `data-oco-runtime-cancel="cancelled"` 且 `focus=cancelled`；“requested” 是否观察到记入结果（非必需）。
- `retry`：`RETRY-ONCE-<随机>` 提示词 → 观察到 `[data-oco-runtime-state="retrying"]` 与 `data-oco-runtime-retry`，随后完成。轮询间隔 ≤200 ms。观察不到就如实 FAIL 并记录 status 序列，不放宽断言。
- `subagent`：`Use the task tool with the explore agent: probe` → 出现子代理行；展开后 `data-oco-runtime-child` 出现，结束后 task 行 completed 且生命周期 `done`，两段文字同时可见。
- `replay-no-actions`：存在待处理权限时暂停跟随 → DOM 中没有任何 `data-oco-runtime-reply`/`-stop`；返回实时后按钮回来；最后拒绝掉该权限收尾。
- 每条断言必须能失败：写明“若实现退化为 X，本断言会失败”的对应关系在证据文件里。
- 验收：en、zh 各一次，REQUIRED 全过；`c4-trajectory` 回归通过。结果写 `docs/evidence/runtime-m2-e2e.md`。

### Task 8：补丁与重放（主线程）

- `git -C vendor/opencode diff <M1 基线 deb241e> -- packages/app > patches/opencode/0019-oco-runtime-view.patch`（0019 追加 M2，仍是一个补丁）。
- 干净 `51ef4be` 上依序 `git apply --check` + apply 0001→0019；`diff -r` 与开发树 `packages/app/src` 一致；重放树中 session 单测全过。

### Task 9：整分支评审、验收与文档（主线程）

- 最终评审（opus）看 M2 全部 vendor 提交；修复按 M1 惯例只开一波。
- 验收证据 `docs/evidence/runtime-m2-verification.md`；STATUS、PROGRESS、NEXT、spec 第 3 段实施偏差回写；按文件分批本地提交。

## 评审重点

1. 按钮在流式更新中是否保持同一 DOM 节点（焦点不丢）。
2. 回看时 DOM 中是否真的没有操作按钮。
3. 子会话的权限回复是否带子会话自己的 `sessionID`。
4. “已请求取消”是否只来自点击，“已取消”是否只来自 `MessageAbortedError`。
5. task completed 是否被误当成子代理结束（后台场景）。
6. 自动 sync 子会话是否有上限、是否重复请求。
