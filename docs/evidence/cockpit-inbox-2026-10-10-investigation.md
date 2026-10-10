# 跨会话待处理收件箱 — 只读调查

- 日期：2026-10-10
- 范围：只读。唯一写入本文件。未改产品代码、未提交。
- 状态：6/6 已答
- 下一步：无（调查结束）

## 委派记录

- task_id: cockpit-inbox-2026-10-10
- 唯一写入范围: docs/evidence/cockpit-inbox-2026-10-10-investigation.md
- requested_route: grok-worker（本任务即被委派的调查）
- actual_provider/model: unknown（工具返回未带 provider/model）
- agent_id/run_id: unknown
- 状态: 已返回
- 结果路径: 本文件
- fallback_reason: 无

点名的 `vendor/opencode/packages/sdk/js/src/gen/types.gen.ts`（3907 行）**没有** `PermissionRequest` / `QuestionRequest` / `permission.asked` / `question.asked`。该文件是旧面：`Permission` 含 `type`/`title`/`time`/`callID`（423–437），事件是 `permission.updated` 与 `permission.replied.properties.permissionID`（439–450）。当前 HTTP 面在 `schema/src/v1/*`，与 `sdk/js/src/v2/gen/types.gen.ts` 的 `PermissionRequest`（2471–2484）/`QuestionRequest`（2455–2463）一致。下面以路由 + v1 schema 为准。

---

## 1. GET /permission、GET /question 与回复体

路由：

- `GET /permission` → `Schema.Array(PermissionV1.Request)`。`groups/permission.ts` 11–23。
- `POST /permission/:requestID/reply` body `ReplyPayload`。同文件 12–15、31–35。
- `GET /question` → `Schema.Array(Question.Request)`。`groups/question.ts` 12–24。
- `POST /question/:requestID/reply` body `{ answers }`。同文件 12–16、32–36。
- `POST /question/:requestID/reject` **无 body**。同文件 45–49。

三组都挂 `WorkspaceRoutingQuery` + `InstanceContextMiddleware` + `WorkspaceRoutingMiddleware` + `Authorization`（permission.ts 52–54；question.ts 64–66）。

### GET /permission 每一项（`schema/src/v1/permission.ts` 27–36）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | string，品牌，必须以 `per` 开头 | 10–13 行 |
| sessionID | SessionID | |
| permission | string | 权限名，**不是** `type` |
| patterns | string[] | |
| metadata | Record<string, unknown> | |
| always | string[] | 可“总是允许”的 pattern |
| tool? | `{ messageID, callID }` | callID 在 tool 内，不在顶层 |

**没有** `title`、`time`、顶层 `type`、顶层 `callID`。服务端入队对象与此相同：`permission/index.ts` 87–95，并发 `permission.asked`（100 行）。

### POST /permission/:requestID/reply

```json
{ "reply": "once" | "always" | "reject", "message"?: string }
```

`permission.ts` schema 12–15、38。`once` = 允许一次，`always` = 总是允许，`reject` = 拒绝。成功 boolean。v2 SDK `PermissionReplyData` 9267–9279 同形。

另有会话域端点，不是本题主路径：`POST /session/:sessionID/permissions/:permissionID`，body `{ response: "once"|"always"|"reject" }`（无 `message`）。`groups/session.ts` 74–76、395；handler `handlers/session.ts` 362–377，转成 `permissionSvc.reply({ requestID, reply: payload.response })`。

### GET /question 每一项（`schema/src/v1/question.ts` 15–40）

| 字段 | 类型 |
| --- | --- |
| id | string，必须以 `que` 开头（10–12） |
| sessionID | SessionID |
| questions | `{ question, header, options: { label, description }[], multiple?, custom? }[]` |
| tool? | `{ messageID, callID }` |

**没有** `permission`、`title`、`patterns`、`metadata`、`time`。

### 提问回复

- `POST /question/:requestID/reply`：`{ answers: string[][] }`（每个问题一个选中 label 数组）。question.ts schema 41–46；路由 `groups/question.ts` 12–16。
- `POST /question/:requestID/reject`：无 JSON body。成功 boolean。

### directory / 头

- Query **可选**：`directory?`、`workspace?`。`middleware/workspace-routing.ts` 22–27。缺省：`url.searchParams.get("directory") || request.headers["x-opencode-directory"] || process.cwd()`（87 行）。
- 不是必须查询参数。oco 客户端两种都发：`session-feed.ts` 208、248–253（query `directory=` + 头 `x-opencode-directory`，值 `encodeURIComponent(directory)`），外加 `auth()` 返回的头。
- 开了服务端密码时要 `Authorization: Basic …`，或 URL query token。`middleware/authorization.ts` 73–82、118–123。未开密码则中间件放行。
- 面板桥会丢掉 webview 自带的 auth/directory 头，改由宿主注入（`bridge-policy.ts` 121–127）。侧栏不是面板桥。

---

## 2. SSE 事件与 session-store 归约

线上 `/event` 的 JSON 是 `{ id, type, properties }`，`properties` = schema 的 `data`。`handlers/event.ts` 40；`event-v2-bridge.ts` 43 对 GlobalBus 做同样映射。`session-feed.ts` `SseParser` 46–68 把 SSE `data:` 解析成带 `type` 的对象，原样交给 `applyEvent`。Store 读 `e.properties`（`session-store.ts` 69）。

| 发生什么 | type | properties |
| --- | --- | --- |
| 权限发起 | `permission.asked` | 与 GET 项相同：id, sessionID, permission, patterns, metadata, always, tool?（v1/permission.ts 61） |
| 权限回复 | `permission.replied` | `{ sessionID, requestID, reply }`（62–65）。reply 为 once/always/reject |
| 提问发起 | `question.asked` | 与 GET 项相同（v1/question.ts 58） |
| 提问回复 | `question.replied` | `{ sessionID, requestID, answers }`（47–59） |
| 提问拒绝 | `question.rejected` | `{ sessionID, requestID }`（54–60） |
| 状态变化 | `session.status` | `{ sessionID, status }`。status 仅 `idle` \| `busy` \| `{ type:"retry", attempt, message, next, action? }`（`schema/src/session-status-event.ts` 8–41）。**没有** `completed` |
| 空闲（deprecated，与 idle 的 status 一起发） | `session.idle` | `{ sessionID }`（43–48）。`session/status.ts` 39–45：set(idle) 时先发 status 再发 idle，并从 status map **删掉**该 id |
| 报错 | `session.error` | `{ sessionID?, error? }`（v1/session.ts 651–657）。error 是 `{ name, data }` 联合：ProviderAuthError、UnknownError、MessageOutputLengthError、MessageAbortedError、StructuredOutputError、ContextOverflowError、ContentFilterError、APIError（385–394） |
| 创建/更新/删除 | `session.created` / `session.updated` / `session.deleted` | created/updated：`{ sessionID, info }`；deleted 同（572–595）。info 含 parentID?、directory、title、time |

完成 = 回到 idle，不是单独事件。`session.compacted` 存在于旧 SDK（types.gen.ts 482–486），store 不处理。

### store 归约（`session-store.ts` 71–113、208–237）

保留并可能改列表：

- `session.created` / `session.updated` → `upsert(info)`。缺 id/directory、目录不属于本工作区、或 `time.archived`：归档走 remove，其余 `ignore()`。
- `session.deleted`：有 sessionID 则删行并丢掉该 sid 的 pending。
- `session.status`：行必须已在 store。`busy` 清掉 `row.error`。status 类型变化或 type===busy 时返回 true。
- `session.idle`：把行标 idle。
- `session.error`：`MessageAbortedError` 直接 `return false`（**不**计入 ignored，不当失败）。否则 `row.error = error.data.message || error.name || "error"`。
- `permission.asked` / `question.asked`：sid 已在 rows 且 `id` 为 string 才 `setPending`（只存 requestId → sessionId）。
- `permission.replied`：按 `requestID` 删除。`question.replied` 与 `question.rejected` 同样只认 `requestID`。

`stats.ignored++` **只**在 `ignore()`（235–237）：

- status/idle/error 的 session 不在 rows
- asked 缺 sid、sid 不在 rows、或 id 不是 string
- upsert 缺 id/directory，或 directory 不属于本工作区

**不**进 ignored（`return false`）：未知 type（`message.*`、`session.diff`、`session.compacted`、`server.heartbeat`、`server.connected`、旧的 `permission.updated`）、replied/rejected 缺 requestID、deleted 缺 sessionID、abort 错误、重复事件（重复走 `stats.duplicates`，60–64 行）。

快照只留 `{ id, sessionID }`（18、54–55 行）。permission 名、patterns、question 文本都丢掉。列表优先级是 permission > question > busy/retry > error > idle（176–184）。`packages/contracts/src/sessions.ts` 32 行注释写成 error 高于 busy，与 store 不符；以 store 为准。

---

## 3. 子代理

**parentID 怎么来**

- 创建入参可选：`session/session.ts` `CreateInput` 260–269 `parentID?`。HTTP `POST /session` 用该 payload（`groups/session.ts` 203–206）。落库 `parent_id`（session.ts 125、85）。
- 子代理工具：`tool/task.ts` 157–160 `sessions.create({ parentID: ctx.sessionID, title: description + " (@name subagent)", ... })`。
- 行上字段：`SessionInfo.parentID?`（v1/session.ts 550）。

**GET /session 是否排除子会话**

- 仅当 query `roots=true`（boolean）。`ListQuery.roots` 可选（groups/session.ts 34）。为真时 `isNull(parent_id)`（session.ts 985–987；global list 558）。**默认不排除。**
- oco 侧栏始终带 `roots=true`：`session-feed.ts` 250、286。

**GET /session/status**

- `handlers/session.ts` 77–78 返回内存 Map 的 entries。`session/status.ts` 35–45：只保留非 idle；变成 idle 就 delete。**无 parent 过滤**，busy/retry 的子会话在里面；已空闲的子会话不在。

**rootOf**（session-store.ts 144–152）

- 从 id 沿 `row.session.parentID` 向上，最多 32 步。父 id 不在 rows 就停，返回当前 id。

**子会话待批权限是否算到根上**

- 是，只要子行和父链都在 store。`countByRoot`（199–205）把 permission/question 记到 `rootOf(sid)`；`list()` 只输出 `rootOf(id)===id` 的行（169）。单测 `tests/unit/session-store.test.ts` 328–338：child 的 permission 显示在 root 上，`pendingPermissions: 1`。
- 连接时 feed 会补拉不在根页里、但出现在 status/permission/question 的 session，并沿 parentID 再拉，深度 `< 4`、每层最多 50 个（session-feed.ts 255–267）。父链拉不全时 `rootOf` 停在子会话，该子会话会**当作根**出现在列表里，计数不折叠。
- 快照会丢掉 session 不在 rows 的 pending（54–55）。事件 asked 对未知 sid 走 ignore。

契约写明计数含后代：`packages/contracts/src/sessions.ts` 35–43。

---

## 4. 侧栏结构与「待处理」要改哪里

分组不在页面里算。`sessions-view.ts` `groups()` 147–157：搜索时全放 recent；否则 `splitSessions`（`session-groups.ts` 45–58）——自昨天 0 点起更新过、或 activity 非 idle、或未读 → `recent`，其余 → `more`。没有单独的待处理分区。未读是宿主 `UnreadTracker`（session-groups.ts 61–65）：离开 busy/retry 进入 idle/error 且不是当前打开的会话。

`webModel()` 95–112 把 recent/more 预格式化成 `WebRow`（19 行）：`id, title, time, status(running|waiting|unread|error|""), tooltip, aria`。权限/提问都变成 `status:"waiting"`，行上**没有** request id。

页面 `media/sessions-list/index.js`：

- `renderList` 194–218：先 recent 行，再 “More” 头，展开后 more 行和 Load more。
- 行点击/中键/Enter：`postOpen` → `{ type:"open", id, newPanel? }`（96–114、339–352、369–372）。
- 右键**不** postMessage。行上 `data-vscode-context`：`webviewSection:"session"`、`sessionId`（143–147）。菜单在 `apps/extension/package.json` 175–195：`oco.openSessionInNewPanel` / `renameSession` / `archiveSession` / `deleteSession`。
- 按钮只出现在空态/错误态 `messageActions`，点击 `{ type:"command", command }`（228–244）。允许的 command 白名单在 `sessions-webview.ts` 8–15。

### postMessage 全集

页 → 宿主（`sessions-webview.ts` 17–22，`handle` 80–93）：

| type | 字段 |
| --- | --- |
| ready | 无 |
| open | id, newPanel? |
| search | query |
| loadMore | 无 |
| command | command（须在 COMMANDS） |

宿主 → 页（index.js 381–386；webview 77、103–104）：

| type | 字段 |
| --- | --- |
| state | webModel 展开 |
| reveal | id |
| focusSearch | 无 |

### CSP

`sessions-webview.ts` 109–126：`default-src 'none'; style-src ${cspSource}; script-src 'nonce-${nonce}'`。初始 state 在带 nonce 的 JSON script 里。`enableScripts: true`，`localResourceRoots` 仅 `media/sessions-list`。行内按钮必须在已加载的 `index.js` 里 `createElement`，不能写 HTML `onclick`。现有 nonce CSP **不用改**，只要不往 HTML 里加内联脚本。

### 新增「待处理」分区 + 行内 允许/拒绝/总是允许

今天没有回复客户端：`apps/extension/src` 不调用 `POST /permission` 或 `/question`（bridge 只做面板归属校验，`bridge-policy.ts` 35–36、108–116；面板必须已绑定该会话或其祖先）。

建议改动面（本调查未改）：

1. `session-store.ts` — `PendingRequest` 现在只有 id+sessionID。行内按钮至少要 request id；要显示权限名/问题文本还得留下 `permission`/`patterns`/`questions`。
2. `session-groups.ts` + `sessions-view.ts` — 新分组；`WebRow` 要带可批复的请求，而不是一个 waiting 计数。
3. `media/sessions-list/index.js` + `index.css` — 第三段分区和行内按钮；点击不能走现有 `command`（那是空态 vscode 命令）。
4. `sessions-webview.ts` — `FromPage` 加例如 `{ type:"permissionReply", id, reply:"once"|"always"|"reject" }`，`handle` 里由**宿主**发 POST。问题不能用这三个 reply：问题要 `answers` 或空 body reject。
5. 宿主 HTTP：`session-feed` 或 connection 的 request，带 directory query/头。不要走面板 `BridgePolicy`（侧栏没有 bound session，会被 403）。
6. `package.json` 仅当还要右键菜单项。

按钮语义对应 `reply`: 允许=`once`，总是允许=`always`，拒绝=`reject`。

---

## 5. 状态栏与通知

`SessionsView.updateChrome`：`sessions-view.ts` 160–218。

- 163：`waiting` = activity 为 permission 或 question 的**根会话个数**（不是请求条数）。
- 168：webview badge `{ value: waiting, tooltip: "N session(s) waiting" }`。
- 174–178：已连接时状态栏 `$(oco-logo) oco`，有 waiting 则加 `$(bell-dot) ${waiting}`，颜色不改；点击 `oco.sessions.focus`。
- 180–214：connecting / reconnecting / error / unauthorized / 未配置 / managed 失败或启动中，改图标、tooltip、背景色。与待批权限无关。

`sessions-view.ts` 内**没有** `showWarningMessage` / `showInformationMessage` / `showErrorMessage`。全扩展里这些调用在 `extension.ts`（启动失败、受限模式、删会话确认、明文 HTTP 等）和 `panels.ts` 282：面板不在前台时，把 webview `{ action:"notify", title }` 转成 `showInformationMessage`。那是官方页的通用 notify，**未确认**它是否会因待批权限触发。侧栏本身今天不弹待批通知。

---

## 6. E2E mock

**不能**用现有 E2E mock 造 N 个带 `parentID` 的会话并各挂一条待批权限。

- `tests/e2e/lib/mock-llm.mjs` 是 OpenAI 兼容 chat mock（`createServer` 约 226 行），没有 `/session`、`/permission`、`/question`。
- `tests/e2e` 里没有 OpenCode HTTP 假服务器。`parentID` 出现在 `c2-diff-unavailable.mjs`、`t010-recover.mjs` 的是**消息** parentID，不是会话。
- 真服务器可以 `POST /session` body `{ parentID, title? }` 造子会话（见第 3 问）。没有“插入一条 pending permission”的 HTTP API；pending 只由 `Permission.ask` 产生（`permission/index.ts` 86–100）。提问同理。

可复用的是**真服务器**上的批复，不是 mock：

| 文件 | 做什么 |
| --- | --- |
| `tests/e2e/p1b-sidebar.mjs` 39–40、318–350 | 清掉 pending；侧栏出现 Waiting for permission；在面板里答，不在侧栏答 |
| `tests/e2e/t004.mjs` 50–82 | 真工具触发 permission dock，再 GET /permission；question dock |
| `tests/e2e/t005.mjs` 120–145 | 两个会话并发 permission，分开答 |
| `tests/e2e/c4-trajectory.mjs` 143–144 | `POST /permission/${id}/reply` `{ reply:"once" }` |
| `tests/e2e/c5-runtime.mjs` 217、424–454、861 | 同上，reply once 或 reject |
| `tests/e2e/p1a-chat.mjs` 103+、`p1a-identity.mjs` 308、`p1b-narrow.mjs` 107、207 | GET /permission，清理时 reject |

子会话权限折叠的现成证据在单元测试 `tests/unit/session-store.test.ts` 328–338，不是 E2E。

---

## 未确认

- 官方聊天页的 `notify` 是否在待批权限时出现（只看到 panels.ts 282 的通用转发）。
- 权限等待期间子会话的 `/session/status` 一定是 `busy` 还是可能已 idle：status 与 permission 是两条通道，代码没有把 ask 和 status 绑死。
- 点名的 `sdk/js/src/gen/types.gen.ts` 与现行路由不一致；未核对该旧文件是否仍被 oco 运行时引用。
