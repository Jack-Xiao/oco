# ADR-009：多 agent 驾驶舱的边界

状态：已采纳（边界决定）。日期：2026-10-10。来源：[NEXT §2](../NEXT.md)、[ARCHITECTURE §1 / §8 / §9](../ARCHITECTURE.md)。实现证据按批次记入 [cockpit-inbox-2026-10-10](../evidence/cockpit-inbox-2026-10-10.md) 及后续证据文件；本 ADR 只定边界，不宣称任何功能已验证。

## 背景

上游 OpenCode v1.18.33 已经自带多 agent 运行所需的全部执行能力：`task` 工具在服务端派生子代理会话（`parentID` 指向父会话）、`POST /session/:id/prompt_async` 非阻塞投递、`GET /permission` / `GET /question` 列出待批请求、`POST /permission/:id/reply`、`POST /question/:id/reply|reject` 批复、`GET /session/status` 与 `/event` SSE 推送状态。oco 今天已经用这些接口在侧栏显示每个根会话的 busy / 等权限 / 等提问 / 报错状态，并在状态栏计数（`sessions-view.ts`、`session-store.ts`）。

用户想要的「驾驶舱」是：多个后台会话同时跑时，不逐个打开面板就能看到谁在等人、就地批复、按批次发起和汇总结果。诱惑在于顺手做成一个调度引擎。本 ADR 把线划清。

## 决定

### 1. oco 只是 OpenCode 的客户端

oco 对多 agent 的全部能力都只通过 OpenCode HTTP API 和 `/event` SSE 实现：

| 允许 | 对应接口 |
| --- | --- |
| 发起会话、投递提示词（同步或异步） | `POST /session`、`POST /session/:id/prompt`、`POST /session/:id/prompt_async` |
| 选择 agent 与模型 | prompt 请求体中的 `agent` / `model` 字段；候选来自 `GET /agent`、`GET /provider` |
| 批复权限与提问 | `POST /permission/:id/reply`、`POST /question/:id/reply`、`POST /question/:id/reject` |
| 中止 | `POST /session/:id/abort` |
| 观察 | `GET /session`、`GET /session/status`、`GET /permission`、`GET /question`、`/event` |

oco 不做：推理循环；执行工具或解释工具结果；自建权限规则库（「总是允许」只能是上游 reply 的 `always`，由服务端记住）；内置定时器 / cron；多模型并行竞赛；团队 RBAC；新的 Agent 调度引擎（ARCHITECTURE §8 已禁止）。夜间批量用脚本包 `opencode run` 交给 launchd。

### 2. 「待处理」收件箱是宿主侧视图，不改桥契约

- 数据源只有两处：session-feed 的快照（`/session`、`/session/status`、`/permission`、`/question`，以及 2026-10-11 为 M02 加入的 `/session/:id/todo`——只对 busy / 可见行懒取，与前四个 GET 同鉴权、epoch 与 401 处理）和它已经接收的 SSE 事件（含 `todo.updated`，按 id 去重、整表替换）。收件箱是 `SessionStore` 的另一种投影，与侧栏会话列表共用同一份状态，不单独轮询、不新开订阅。
- 2026-10-14（卡 1）：事件源由工作区目录的 `/event` 改为一条 `/global/event`，按 `Connection.roots()`（工作区文件夹 + 项目 worktree）过滤载荷的 `directory`；`/session/status`、`/permission`、`/question` 快照按每个 root 各取一次后合并。服务端不支持 `/global/event` 时退回单目录 `/event`。批复请求发往该请求所属会话的目录。仍是同一条订阅，不按目录多开。
- 批复从 Extension Host 直接调服务端，走 `Connection` 已有的请求通道；不经过 chat webview 的桥，所以 `bridge-policy` 与 `@oco/contracts` 的桥消息不变。
- 每个批复动作必须绑定 `requestId` + `sessionID`（ARCHITECTURE §9）：按钮按下时先核对该请求仍在待批集合里，已过期的请求只提示「已处理」，不重发到新请求。
- 子代理会话按自己的身份进入收件箱（显示父会话标题作为上下文），而不是只汇总到根会话计数；根会话行上的计数保持现状。
- 通知只用 VS Code 原生机制：状态栏计数 + `window.showWarningMessage` 一类的可点击通知；不做常驻弹窗、不做声音。
- 「完成未读」的判定沿用侧栏现有 `UnreadTracker`（memento 持久化），不另建一套已读状态。

### 3. 批量发起是客户端节流，不是队列系统

- 任务清单文件逐项经 `prompt_async` 发成独立会话；并发上限由 oco 在 Extension Host 内节流，队列只存在于内存并用 memento 记录「已发起 / 未发起」，宿主重启后未发起项显示为待确认，不自动续跑。
- 批次标签是视图状态（ARCHITECTURE §4）：存 oco 本地状态并以连接 + sessionID 为键，不写进服务端配置、不改会话标题冒充元数据。
- 发送失败不无条件重试（ARCHITECTURE §6）：先查会话是否已创建，查不到时标「结果未知」交给用户。

### 4. 结果卡与批次汇总只读

每会话结果卡（改动文件、耗时、花费、最后一条输出、打开 diff）全部来自服务端消息与运行视图已有索引；不在 oco 侧重算 token 费用或推断模型。

### 5. Agent 定义编辑仍按 ARCHITECTURE §8

若做，只做权限 / 模型子集（T013），按 hash 校验与原格式写回；不建立与 OpenCode 配置竞争的第二套数据库。

## 代价

- 服务端不记「批次」，批次分组只在本机、本连接可见；换机器或清缓存后标签丢失。接受，因为代价远小于自建元数据存储。
- 「总是允许」的粒度由上游决定（pattern / 工具级），oco 不能提供更细的本地规则。
- 收件箱依赖 session-feed 的事件完整性；SSE 断连期间以重连后的快照为准（ADR-006 §1–3 的重连与去重规则不变）。

## 验收口径（供后续批次引用）

- 收件箱：E2E mock 造三个后台子代理同时等授权，不打开任何会话面板即可全部批完；批复后 `GET /permission` 为空，侧栏与状态栏计数归零。
- 批量发起：清单 N 项、并发上限 k，任意时刻 busy 会话 ≤ k；全部完成后侧栏按批次分组显示 N 个会话。
- 不做项不需要验收，只需在 STATUS 保持「不做」声明。
