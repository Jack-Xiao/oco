# 运行时可视化：4 个数据问题（只读）

范围：`/Users/xiaojiang/Ai-Project/oco/vendor/opencode/packages`，任务指定提交 51ef4be。本次未再执行 `git rev-parse`，行号对应当前工作区文件。未全仓搜索。model/provider：unknown。

## 1. PermissionRequest / QuestionRequest 能否挂到具体 tool 调用

结论：**能关联，但字段可选，不是每次都有。** 关联键是 `messageID` + `callID`，没有 tool part 的 `id`。

`PermissionRequest`（`sdk/js/src/v2/gen/types.gen.ts:2471-2484`，schema `schema/src/v1/permission.ts:27-35`）：

| 字段 | 类型 |
| --- | --- |
| `id` | string（`per_` 前缀） |
| `sessionID` | string |
| `permission` | string |
| `patterns` | string[] |
| `metadata` | record |
| `always` | string[] |
| `tool?` | `{ messageID: string, callID: string }` |

`QuestionRequest`（`types.gen.ts:2455-2463`，`schema/src/v1/question.ts:32-40`）：`id`、`sessionID`、`questions: QuestionInfo[]`、`tool?: { messageID, callID }`。`QuestionInfo`（`types.gen.ts:706-721`）：`question`、`header`、`options`、`multiple?`、`custom?`。

`ToolPart`（`types.gen.ts:534-545`）自带 `id`、`sessionID`、`messageID`、`type: "tool"`、`callID`、`tool`、`state`。对得上的是 `tool.messageID === part.messageID && tool.callID === part.callID`。

写入 `tool` 的位置：

- 普通工具权限：`session/tools.ts:81-88` 的 `context.ask` 固定带上 `tool: { messageID: input.processor.message.id, callID: options.toolCallId }`。`processor.ts:236-245` 用同一个 `callID`（`input.id`）创建 tool part。
- `question` 工具：`tool/question.ts:24-28`，仅 `ctx.callID` 为真时带 `tool`。
- plan 退出提问：`tool/plan.ts:30-43`，同样仅 `ctx.callID` 为真时带。
- doom loop：`processor.ts:372-379` 的 `permission.ask` **不传** `tool`。只有 `permission`、`patterns`、`sessionID`、`metadata`、`always`、`ruleset`。

`permission/index.ts:87-100` 原样保存 `request.tool` 并作为 `permission.asked` 发布。客户端按 `sessionID` 放进 `permission[sessionID]`（`event-reducer.ts:397-416`）。

`task.ts` 不发 permission/question。它在父 tool 的 metadata 里写子会话 id：`parentSessionId` / `sessionId`（`tool/task.ts:185-195`）。那是子会话关联，不是 PermissionRequest.tool。

## 2. 同一条 assistant 消息能否有多个 step-finish

结论：**是。** processor 不合并、不跳过。

条件（`processor.ts:435-469`）：流事件 `type === "step-finish"` 时，用新的 `PartID.ascending()` 写一条 `step-finish` part，`messageID` 始终是 `ctx.assistantMessage.id`。同时 `assistantMessage.finish = value.reason`（覆盖），`cost` 累加，`tokens` 换成这一次的 usage，再 `updateMessage`。没有“已经有 step-finish 就返回”。

一次 `process()`（`processor.ts:641-696`）只消费一条 `llm.stream`。`prompt.ts` 的用户请求循环每次新建一条 assistant 再 `process` 一次（`prompt.ts:1088-1132` 继续循环；`1186-1219` 新建消息；`1272` 调用 `handle.process`）。所以正常成功路径是：一条 assistant ≈ 一次模型调用 ≈ 一次 `Lifecycle.finish`。

`Lifecycle.finish` 每次推一条 `step-finish` 然后把 `stepStarted` 置回 false（`llm/src/protocols/utils/lifecycle.ts:80-99`）。OpenAI Responses 在 `response.completed` 或 `response.incomplete` 时调用它（`llm/src/protocols/openai-responses.ts:875-888`、`944-945`）。本次没有逐个协议证明每条流只能出现一次该事件。

同一条 assistant 上出现多条的明确路径：`Effect.retry` 包住整段 stream（`processor.ts:674-688`）。重试不删除已写入的 part。若第一次流已经写过 step-finish 再失败（例如之后的 `provider-error` 抛出，`processor.ts:421-422`），重试会再追加一条。`assistantMessage.finish` 只保留最后一次 reason。

对“一次请求”的划分：

- 不能用 step-finish 当作用户一次 prompt 的边界。`SessionPrompt.prompt` → `loop`（`prompt.ts:1052-1070`、`1081`）在工具调用后继续，每轮一条新的 assistant。
- 一条 assistant 上的 step-finish 更接近“这一次模型流结束”。重试时条数会大于模型调用次数。
- 消息级 `finish` / `tokens` 是最后一条 step-finish 的覆盖值，`cost` 是累加，不能靠消息字段数 step。

## 3. 嵌入聊天页有没有连接健康 / SSE 断连信号

结论：**否。** 指定的聊天数据面上没有连接状态、重连次数或最后事件时间。

查过：`global-sync/types.ts` 的 `State`、`event-reducer.ts`、`bootstrap.ts`、`server-session.ts`、`session-trajectory*.ts*`、`server-sync.tsx`、`home-session-index.ts`。

容易误用、但不是传输健康的字段：

- `State.status`: `"loading" | "partial" | "complete"`（`types.ts:34`）。这是目录 bootstrap 是否完成，不是 SSE。
- `session_status` / `session_working`（`types.ts:47-50`，`child-store.ts:232-235`）：会话执行 `idle | busy | retry`（`types.gen.ts:673-693`）。
- `provider.connected`：已连接的模型厂商 id，不是事件流。
- `server-session` 的 `meta.at[sessionID]`（`server-session.ts:729`、`854`）：该会话消息页写入缓存的时间，供 15s 内跳过 prefetch。不是 SSE 最后事件时间。

相邻事件，只触发刷新，不落成聊天页可读的健康字段：

- `server.connected`、`global.disposed` → `applyGlobalEvent` 调用 `refresh()`（`event-reducer.ts:43-45`）。
- 同上两事件 → `server-sync.tsx:565-570` 对已 active 的目录 `queue.push`。
- 首页索引内部变量 `connected`（`home-session-index.ts:76-87`、`132`）。只决定要不要 refetch 首页会话索引，不是聊天 store 字段。

未找到 `EventSource`、reconnect 计数或 last-event 时间被放进 global sync / server session / trajectory。

## 4. 子会话消息的按需加载，以及缓存回收

### 加载

结论：**按 sessionID 调用客户端 `sync`，没有单独的“子会话消息”接口。** 服务端 `Session.children` 只列会话行。

- 列子会话：`session/session.ts:596-604`，`Session.children(parentID)`，`where parent_id`。不含 messages/parts。
- 消息按需：`createServerSession` 里的 `sync(sessionID, { force?, messageLimit? })`（`server-session.ts:836-847`）。已有 `data.message[sessionID]` 且 `meta.limit` 已设、并且 `data.info` 存在、且没有 `force` 时直接返回。否则 `loadMessages`（`733-834`）。
- `loadMessages` → `fetchMessages`（`537-581`）。非 v1：`messageApi.list({ sessionID, limit, cursor | order: "desc" })`。v1：`client.session.messages({ sessionID, limit, before })`。缺的 user 父消息再 `fetchMessage` / `sessionApi.message`（`584` 起，`779-793`）。
- 打开时间线：`createTimelineModel` 对当前 `sessionID` 调 `sync().session.sync(id)`（`pages/session/timeline/model.ts:19-39`）。子会话被当作当前会话打开时走这条，不区分 parent。
- `message-timeline.tsx:799-806`：当前会话有 `parentID` 且父会话消息还没进缓存时 `sync(父 id)`。这是补父会话，不是加载子会话历史。
- `session-trajectory.tsx:443-448` 只展示子会话 id 文本，不调用 `sync`。
- 子会话 id 来自 task 工具 metadata `sessionId`（`tool/task.ts:185-195`），不是来自 PermissionRequest。

未打开的子会话不会因为 `sync` 去拉全量历史。带 `sessionID` 的实时事件仍会 `apply`：`touch` 并把 message/part 写进 server-session store（`server-session.ts:986-997` 以及后面的 `message.updated` / `message.part.updated`）。所以“未打开”不等于“缓存里一定没有 part”；只等于没有走过 `loadMessages`。

`child-store.ts` 的 child 是目录 store，不是子会话。`disposeDirectory` / `runEviction`（`103-138`）回收的是目录级 store。

### dropSessionCaches 何时回收 message/part

函数本体 `session-cache.ts:19-40`：对给定 sessionID 删除 `message`、`todo`、`session_message`、`session_diff`、`session_status`、`permission`、`question`；part 数组里任一 part 的 `sessionID` 命中则整组 part 和对应 `part_text_accum_delta` 删除。

两条 store，不要混：

**A. 聊天消息所在的 server-session store**（`evict`，`server-session.ts:477-535`）

- 每个能解析出 sessionID 的事件都 `touch`（`986-989`）→ `pickSessionCacheEvictions`，上限 `SESSION_CACHE_LIMIT = 40`（`session-cache.ts:5`、`43-61`）。
- `preserve`：pinned、requests、inflight、inflightTodo、messageLoads、optimistic、`permission.length > 0`、`question.length > 0`、`session_status.type !== "idle"`。
- `session.updated` 且 `time.archived`（`1002-1006`）、`session.deleted`（`1008-1018`）无条件 `evict`。不看是否正在运行。

正在运行但未打开：

- **若 `session_status` 已是 `busy` 或 `retry`：LRU 不会回收。** `preserve` 不要求该会话是当前打开页。`session.status` / v2 `session.execution.started` 会写 status（`1025-1028`、`963`），不依赖 `sync`。
- **若 status 还没写进 store（看起来像 idle），并且该 id 已经在 `seen` 里，又不在其他 preserve 集合：会被 LRU 回收。** 未打开本身不是保护条件。
- **从未进入 `seen`、也没 `sync` 过：没有 message/part 可回收。**

**B. global-sync 目录 store**（`event-reducer.ts`）

- `session.created` / 新插入的 `session.updated` 经 `trimSessions` 后，不在结果里的 id 走 `cleanupDroppedSessionCaches` → `dropSessionCaches`（`event-reducer.ts:80-106`、`131-143`、`167-171`）。
- `trimSessions`（`session-trim.ts:33-56`）不看 `session_status`。子会话留下的条件：父 root 仍在保留集，或自己有 pending permission，或 `time.updated`（否则 `time.created`）在 4 小时内（`types.ts:134-135`，`SESSION_RECENT_WINDOW` / `SESSION_RECENT_LIMIT = 50`）。
- 因此：父 root 已被裁掉、没有 pending permission、updated 超过 4 小时的子会话，会从这份 session 列表删掉并清这份 store 的缓存，**即使仍在运行**。
- 嵌入聊天的目录事件以 `sessionContent: false` 调用 reducer（`server-sync.tsx:509-528`）。`SESSION_CONTENT_EVENTS`（`event-reducer.ts:21-35`、`124`）包含 message/part/permission/question/session.status，这些在这份 store 上被直接 return。消息正文以 server-session 那份为准。

### message.part.delta 在 part 还不存在时

结论：**是，直接丢弃，不缓冲。**

- `event-reducer.ts:364-369`：`part[messageID]` 不存在，或按 `partID` 二分找不到，`break`。
- `server-session.ts:1190-1201`：同样 `return`。后面的累加只在 `result.found` 之后。
- 两处都没有把 delta 放进待补队列。之后若 `message.part.updated` 到达，用的是事件里的 part 快照，不是把丢掉的 delta 重放。

## 未查明

- 未逐个 LLM protocol 证明一条成功流是否永远只有一个 `step-finish`。processor 侧只证明“来一次写一条”，外加 retry 会在同一条 assistant 上再写。
- 未核对工作区 HEAD 是否正好为 51ef4be。
- 未跟踪 `ctx.ask` 的每一个工具调用点是否都能保证 `toolCallId` 非空。已确认的反例是 doom loop 不带 `tool`，以及 question/plan 在没有 `callID` 时把 `tool` 写成 `undefined`。
