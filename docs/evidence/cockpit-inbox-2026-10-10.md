# 多 agent 驾驶舱第一步：ADR-009 + 跨会话「待处理」收件箱（2026-10-10）

分支：`claude/cleanup-2026-10-10`（接 `7d71662`）。来源：[NEXT §2](../NEXT.md)。

## 范围

1. ADR-009：oco 只通过 OpenCode API 发起会话、选 agent / 模型、投递提示词、批复权限与提问；不做推理循环、不执行工具、不自建权限库、不内置定时器。主线程写。
2. 跨会话「待处理」收件箱：侧栏新分区列出等权限 / 等提问 / 报错 / 完成未读的会话（含子代理），就地批复；状态栏计数 + VS Code 通知。数据源为 session-feed 已接收的 SSE 事件 + `/permission`、`/question` 快照，不改桥契约。
3. 验收：三个后台子代理同时等授权，不打开任何会话即可全部批完（E2E mock）。

## 委派记录

| task_id | 唯一写入范围 | requested_route | actual_provider/model | agent_id/run_id | 状态 | 结果路径 | fallback_reason / 接手理由 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| health-gemini | 无 | gemini-worker | google / gemini-3.8-flash（自报；包装头 unknown） | gem-mv258asd-bdq4w | 已返回（OK, antigravity, 20s） | — | — |
| health-grok | 无 | grok-build:check | grok-cli 1.0.34 | — | 已返回（ready, loggedIn） | 本文件 | — |
| inv-inbox | `docs/evidence/cockpit-inbox-2026-10-10-investigation.md` | grok-worker（只读调查） | Grok Build / unknown | run-mv25a448-r98bvl（grok 会话 2d76ae1a） | 已返回（5m35s，4 轮；6 问均有行号答案，2 项未确认） | 同左 | — |
| adr-009 | `docs/adr/009-multi-agent-cockpit-boundary.md` | 主线程（契约/架构） | — | — | 已写（待实现证据） | 同左 | 公共契约由主线程负责 |
| impl-inbox | `apps/extension/src/{session-store,session-groups,sessions-view,sessions-webview,session-feed,extension}.ts`、`apps/extension/package.json`（仅设置）、`apps/extension/media/sessions-list/*`、`tests/unit/{session-store,session-groups,sessions-view*}.test.ts` | gemini-worker | Gemini (Antigravity) / unknown | gem-mv25majg-r4jxh | 已返回（1411 s，14 轮；typecheck 0、build PASS、自测 33/0；验收通过） | checkpoint `cockpit-inbox-2026-10-10-impl-checkpoint.md` | — |
| e2e-inbox | `tests/e2e/c6-inbox.mjs`（新）、`tests/e2e/lib/mock-llm.mjs`（仅加 token）、`tests/e2e/run.mjs`（仅加套件名） | gemini-worker | google / Gemini 3.8 Flash（自报；包装头 unknown） | gem-mv25mph6-7vl34 | 已返回（476 s，5 轮；node --check 通过；它探测 /config 失败故未跑场景，主线程重启服务器后代验，见下节） | checkpoint `cockpit-inbox-2026-10-10-e2e-checkpoint.md` | — |
| test-server | `.oco-test/`、scratchpad 日志 | 主线程（后台进程） | — | — | 运行中（mock-llm 改后已重启一次；批次结束后由主线程停止） | scratchpad/test-server.log | 长驻进程由主线程管理，避免包装层空等 |

## 集成契约（主线程定，实现与 E2E 共用）

不改 `packages/contracts`、不改桥契约（ADR-009 §2）。以下是侧栏 webview 与宿主之间的内部约定。

### 宿主 → 页 `state` 新增 `inbox: InboxRow[]`

```ts
type InboxRow = {
  id: string            // 权限/提问用服务端 request id；报错 "err:<sessionId>"；完成未读 "done:<sessionId>"
  kind: "permission" | "question" | "error" | "done"
  sessionId: string     // 发出请求的会话本身（子代理就是子会话 id）
  title: string         // 该会话标题（无标题用 id）
  parent?: string       // 子代理时父会话标题
  summary: string       // 权限：`${permission} ${patterns.join(" ")}`；提问：第一条问题文本；报错：错误文本；完成：最后更新时间
  time: string          // compactTime
  aria: string
}
```

排序：permission、question 在前（按 time 旧→新），再 error，再 done。`inbox` 为空时分区不渲染。

### 页 → 宿主

- `{ type: "permissionReply", id, reply: "once" | "always" | "reject" }` → 宿主 `POST /permission/:id/reply`，body `{ reply }`，带 directory。
- `{ type: "questionReject", id }` → 宿主 `POST /question/:id/reject`，空 body。
- 提问的「回答」与报错/完成行点击 → 复用现有 `{ type: "open", id: sessionId }`。
- 宿主发送前核对请求仍在 `SessionStore` 待批集合里；不在则忽略并刷新一次 state（ADR-009 §2）。回复成功后不等 SSE，先本地移除该请求再刷新。

### DOM（E2E 据此定位）

- 分区：`section[data-group="inbox"]`，标题文字 `Needs attention`。
- 行：`.row[data-inbox-id="<id>"][data-session-id="<sessionId>"][data-kind="<kind>"]`。
- 权限按钮：`button[data-reply="once"]`（文字 Allow）、`button[data-reply="always"]`（Always）、`button[data-reply="reject"]`（Deny）。
- 提问按钮：`button[data-action="answer"]`（Answer，走 open）、`button[data-reply="reject"]`（Dismiss）。
- 行内按钮用 `createElement` 挂事件；不加内联脚本，CSP 不变。

### 状态栏与通知

- 状态栏现有 `$(bell) N` 计数改为统计 inbox 中 permission + question 行数（含子代理行）。
- 通知：待批请求 id 集合出现新成员、且其会话不是当前打开的会话时，`window.showWarningMessage("<N> request(s) waiting for approval", "Show")`；Show 执行 `oco.sessions.focus`。同一时刻只保留一条通知（上一条未关闭则不再弹）。可用设置 `oco.sessions.notifyPending`（默认 true）关闭。

## mock 场景验证（主线程，2026-10-10）

测试服务器 `OCO_E2E_MODEL=mock`（opencode 1.18.33，127.0.0.1:4517）重启后，用 `tests/e2e/server.mjs` 的 `api()` 直接验证新 token `THREE-SUBAGENTS-NEED-PERMISSION`：

| 项 | 结果 |
| --- | --- |
| `GET /permission` 达到 3 条耗时 | 3.7 s |
| 3 条的 sessionID | 互不相同，`GET /session/:id` 的 parentID 均为父会话 |
| 子会话标题 | `child-alpha (@explore subagent)` 等，服务端自动加 `(@agent subagent)` 后缀 |
| `/session/status` 中子会话 | 均为 `busy`（回答了调查里「等待权限时子会话是否 busy」的未确认项） |
| 逐条 `reply: once` 后 | `GET /permission` 为 0 |

脚本：scratchpad `verify-inbox-scenario.mjs`（不入库）。

## 验证结果（主线程，2026-10-10）

| 项 | 命令 | 结果 |
| --- | --- | --- |
| 类型检查 | `bun run typecheck` | 0 错（Gemini 自验 + 主线程未改 src 后未重跑） |
| 单测 | `bun test tests/unit` | 196 pass / 0 fail（主线程修了范围外两项：`e2e-results.test.ts` 套件清单加 c6-inbox、`settings-contribution.test.ts` 加 `oco.sessions.notifyPending`；TEST-SCOPE 22 → 23） |
| 新 E2E | `node tests/e2e/run.mjs c6-inbox`（mock） | PASS 9.67 s：subagents-waiting 3、inbox-rendered 3 行且 allHaveParent / noPanelsOpen、inbox-batch-approved 3、inbox-cleared、bell-count-zero。结果 `docs/evidence/runs/20261010-091516-c6-inbox-09cb/results.json` |
| 侧栏回归 | `node tests/e2e/run.mjs p1b-sidebar p1b-reconnect t014-connection`（mock） | 24 PASS / 0 FAIL，三套件 exit 0 |

主线程接手记录（AGENTS.md 规则 3）：两次 E2E 运行由主线程后台执行而非委派。依据：同日 [cleanup-2026-10-10](cleanup-2026-10-10.md) 两程 Gemini 包装层对长命令空等 30 分钟的失败证据；本批 e2e-inbox 代理又把 `/config` 的 401 当作不可达。主线程只读 results.json 与日志摘要，不看截图。

## 第二轮：用户反馈（2026-10-10，`1e69688` 之后）

用户在真实模型（DeepSeek）下验证通过：权限行、子代理行（带父标题）、提问行均出现。反馈三点：收件箱与会话列表没有视觉分组；按钮是默认蓝色块，与现有设计不符；`external_dir...` 没有信息量，应显示路径模式，并按父会话分组子代理行。

### 契约 v2（主线程定；替代上文 `inbox: InboxRow[]`）

```ts
type InboxRow = {
  id: string; kind: "permission" | "question" | "error" | "done"
  sessionId: string; parentId?: string
  title: string          // 子代理：去掉服务端追加的 " (@xxx subagent)" 后缀
  agent?: string         // 从后缀解析出的 agent 名，如 "general"
  summary: string        // permission：patterns.join(" ")，无 patterns 时用 permission 名；question：第一条问题；error：错误文本；done："Finished"
  detail: string         // 完整提示文本，放 title 属性：permission 为 `${permission} · ${patterns.join(" ")}`
  time: string; at: number; aria: string
}
type InboxGroup = { kind: "group"; parentId: string; title: string; rows: InboxRow[] }
type InboxEntry = InboxRow | InboxGroup
// state.inbox: InboxEntry[]；有 parentId 且父会话已知的行归入同一 group，其余为顶层行；
// 顶层按最早的 at 升序（group 取其子行最早的 at），组内同样升序。分组在宿主算（纯函数，单测）。
```

页 → 宿主消息不变（permissionReply / questionReject / open）。

### 布局

- 两个区块都用同一种小节头样式（现有 `.inbox-head`：11px 大写）：`NEEDS ATTENTION · N`（N = permission + question 行数）和 `SESSIONS`。收件箱为空时不渲染节头、分隔线和 `SESSIONS` 头，列表与改动前完全一致。
- 收件箱节头可点击折叠，折叠后只剩节头与计数；折叠状态只存页面内存。
- 收件箱与会话列表之间一条分隔线：`1px solid var(--vscode-sideBarSectionHeader-border, var(--vscode-widget-border))`，左右缩进 14px，上下各 6px。
- 父会话分组：组头是一行 24px 高的元素 `.inbox-group-head[data-parent-id]`，内容为父会话标题（省略号）+ 右侧子行计数（`.more-count` 样式），点击打开父会话（走 `open`）。子行缩进 14px，左侧一条 `1px solid var(--vscode-tree-indentGuidesStroke)` 引导线。子行标题后跟一个淡色 `@agent` 标签（10px，`--vscode-descriptionForeground`），有 agent 时才显示。
- 行保持两行结构：第一行 点 + 标题 + 时间；第二行 summary（flex:1，省略号）+ 按钮组。行与组头都带 `title` 属性显示 `detail`。

### 按钮（去掉填充蓝块，贴近 VS Code 行内操作）

- 共同：高 20px，`padding: 0 8px`，11px，圆角 3px，`background: transparent`，`border: 1px solid color-mix(in srgb, var(--vscode-foreground) 22%, transparent)`；hover `background: var(--vscode-toolbar-hoverBackground)`；focus-visible `outline: 1px solid var(--vscode-focusBorder); outline-offset: -1px`；高对比主题边框改用 `--vscode-contrastBorder`。
- Allow / Answer（主操作）：文字色 `var(--vscode-textLink-foreground)`。
- Always：默认前景色。
- Deny / Dismiss：无边框纯文字，`--vscode-descriptionForeground`，hover 文字变 `--vscode-errorForeground`。
- 按钮间距 4px，按钮组靠右。

### DOM 兼容

保留 `section[data-group="inbox"]`、`.row[data-inbox-id][data-session-id][data-kind]`、`button[data-reply]`、`button[data-action="answer"]`；子行加 `data-parent-id`。E2E c6-inbox 的 `allHaveParent` 改为检查子行 `data-parent-id` 等于父会话 id 且所在组头文字为父标题。

### 第二轮委派记录

| task_id | 唯一写入范围 | requested_route | actual_provider/model | agent_id/run_id | 状态 | 结果路径 | fallback_reason / 接手理由 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| health-gemini-2 | 无 | gemini-worker | google / gemini-3.8-flash（自报） | gem-mv27qkju-9728s | 已返回（OK, antigravity, 35 s） | — | — |
| impl-inbox-2 | `apps/extension/src/{session-store,session-groups,sessions-view,sessions-webview}.ts`、`apps/extension/media/sessions-list/*`、`tests/unit/{session-store,sessions-view,session-groups}.test.ts`、`tests/e2e/c6-inbox.mjs`（仅父断言） | gemini-worker | Gemini 3.8 Flash / google（自报） | gem-mv27shgh-lh67i | 已返回（968 s，10 轮；typecheck 0、单测 202/0、build PASS；验收通过） | checkpoint `cockpit-inbox-2026-10-10-impl2-checkpoint.md` | — |
| test-server-2 | `.oco-test/` | 主线程（后台进程） | — | — | 已停止 | scratchpad/test-server2.log | 长驻进程由主线程管理 |

### 第二轮验证（主线程）

| 项 | 结果 |
| --- | --- |
| typecheck / 单测 / build | 0 错 / 202 pass 0 fail / PASS（Gemini 自验，主线程未改 src） |
| E2E `node tests/e2e/run.mjs c6-inbox p1b-sidebar`（mock） | 18 PASS / 0 FAIL；c6-inbox 12.15 s，p1b-sidebar 44.71 s；结果 `docs/evidence/runs/20261010-100808-c6-inbox-e772/results.json` |
| 视觉核对 | 主线程只看 c6 第 1 张截图：节头计数、父组头、缩进引导线、`@agent` 标签、链接色 Allow、淡色 Deny、分隔线与 SESSIONS 节头均符合规格 |
