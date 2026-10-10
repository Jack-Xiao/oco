# 多 agent 驾驶舱第二步：每会话结果卡（2026-10-10）

分支：`claude/cleanup-2026-10-10`（接 `6e41360`）。来源：[NEXT §2](../NEXT.md) 第四项「每会话结果卡」；样稿 [result-card-mockup.html](../superpowers/specs/result-card-mockup.html)。批量发起与批次汇总不在本批（决策：先用脚本代替，见对话记录）。

## 范围

1. 侧栏「已完成未读」/「报错」行多一行摘要：改动文件数、耗时、花费、最后一句输出；悬停露出 打开 / diff / 标已读。
2. 运行视图环心卡片终态：改动文件列表（每行可点，走上游 Review 面板）、最后一条输出、文件数 / 花费 meta、「打开全部 diff」。
3. 侧栏「diff」→ 主面板打开该会话并展开上游 Review 面板（navigate 消息带 review 意图）。
4. 不做：VS Code 原生 diff 编辑器（上游只给 patch 文本，不给前后两份内容）；批次分组头；Agent 定义编辑。

## 数据来源（全部来自上游已有事件，oco 不重算）

| 字段 | 事件 / 字段 | 备注 |
| --- | --- | --- |
| 改动文件、增删行、状态 | `session.diff` → `properties.diff: FileDiff[]`（`file, additions, deletions, status, patch`） | 会话开始快照至今的 diff；侧栏只存前四个字段，不存 patch |
| 耗时 | `session.status` busy → `session.idle`，扩展侧记录两端时间 | 只在两端都观察到时显示 |
| 花费 / token | `message.updated` 中 `info.role === "assistant"` 的 `cost`、`tokens`，按 messageID 去重后求和 | 只统计本次运行（最近一次 busy 之后） |
| 最后一句 | `message.part.updated`（`part.type === "text"`，messageID 属于本次运行的 assistant 消息）+ `message.part.delta`（`field === "text"`） | 存全文，侧栏截一行 |
| 已读 | 现有 `UnreadTracker`（memento `oco.unreadSessions`），新增手动 `markRead` | 客户端状态 |
| 运行视图文件列表 | app 内 `sync().data.session_diff[sessionID]` | 与上游 Review 面板同源 |

## 集成契约（主线程定）

- `apps/extension/src/session-store.ts`：新增 `FileChange`、`RunResult`，`InboxRow.result?: RunResult`（已写入）。`applyEvent` 对 `message.*` / `session.diff` 返回 false（不触发重绘），`session.idle` 照旧返回 true。
- 侧栏页面 → 宿主新消息：`{ type: "openReview"; id: sessionId }`、`{ type: "markRead"; id: sessionId }`。
- 宿主命令：`oco.openSessionReview`（参数 sessionId，可选 file）。
- `@oco/contracts` `Navigate`：`{ sessionId: string; review?: { file?: string } }`；`OpenSessionRequest.review?: { file?: string }`。
- 上游补丁 0021（新）：`packages/app/src/context/oco-review-intent.ts`（意图信号）；`pages/session.tsx` 消费意图并把 `onOpenReview` 传给 `SessionRuntime`；运行视图 `RingCard.result`、ring-view 文件列表、i18n 三语新键。

## 委派记录

| task_id | 唯一写入范围 | requested_route | actual_provider/model | agent_id/run_id | 状态 | 结果路径 | fallback_reason / 接手理由 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| health-grok | 无 | grok-build:check | grok-cli 1.0.34（ready, loggedIn） | — | 已返回 | 本文件 | — |
| health-gemini | 无 | gemini-worker | Google / Gemini 3.8 Flash（自报，Antigravity） | gem-mv28wlxu-yr8p9 | 已返回（OK，17 s） | — | — |
| impl-store | `apps/extension/src/session-store.ts`、`tests/unit/session-store.test.ts` | gemini-worker | Google / Gemini 3.8 Flash（自报） | gem-mv290mu5-pc4pg | 已返回（结果落盘，包装层收尾报 `{"status":"ERROR"}`，与 memory 记录的已知现象一致；store 单测 27 / 0，checkpoint 标完成，9.9 min） | [store-checkpoint](cockpit-result-card-2026-10-10-store-checkpoint.md) | 不换路由：产物已验收 |
| impl-sidebar | `apps/extension/media/sessions-list/index.js`、`apps/extension/media/sessions-list/*.css`、`apps/extension/src/sessions-webview.ts`、`apps/extension/src/sessions-view.ts`、`tests/unit/sessions-view.test.ts` | grok-worker | Grok Build / Grok 4.7（自报） | run-mv29114k-bhz5ng（grok 会话 29bf5578） | 验收通过（4.0 min；sessions-view + session-groups 23 / 0；typecheck 0）。注：index.js / index.css 的改动随另一会话的提交 `bb9e90e`（收件箱第三轮）一起进入历史 | [sidebar-checkpoint](cockpit-result-card-2026-10-10-sidebar-checkpoint.md) | — |
| integ-main | `packages/contracts/src/{bridge,sessions}.ts`、`apps/extension/src/{extension,panels}.ts`、`apps/chat-webview/src/app.tsx`、`vendor/opencode/packages/app/src/**`（补丁 0021）、`patches/opencode/0021-*.patch`、docs | 主线程 | — | — | 完成 | 本文件 | 公共契约、桥接与上游补丁由主线程负责（AGENTS.md） |
| e2e-c7 | `tests/e2e/c7-result-card.mjs`（新）、`tests/e2e/run.mjs`（套件名）、`docs/evidence/cockpit-result-card-2026-10-10-e2e-checkpoint.md` | Claude 子代理（general-purpose / Sonnet，按 AGENTS.md 工作区版本「要启动 VS Code 的 E2E 交 Claude 子代理」） | claude / sonnet | a363630faa3672dff | 已返回（21 min，38 次工具调用）：3 PASS / 1 FAIL，见「结果」；随后定向复跑一次（≤15 轮） | `docs/evidence/runs/20261010-105723-c7-result-card-1e2e/results.json` | 订阅路线不适用：Grok 沙箱起不了 VS Code（memory），Gemini 包装层对长 E2E 不稳定（cleanup 批次记录） |

## 结果

- 实现落点：`session-store.ts`（运行摘要：busy/idle 计时、`message.updated` 花费、`message.part.updated/delta` 最后一句、`session.diff` 文件列表；`inbox()` done / error 行带 `result` 与一行 summary）；侧栏 done 行 Open / Diff / Mark read（error 行 Open / Diff），hover / focus / 选中时显示；`sessions-view.markRead`；`oco.openSessionReview` 命令；`OpenSessionRequest.review` 与 bridge `navigate.review` 契约；面板 `pendingReview` 随 navigate 发送、页面 ready 后补发；chat-webview 以 `oco:review-intent` 窗口事件转交页面；上游补丁 0021：`context/oco-review-intent.ts`、`pages/session.tsx` 消费意图（切回 chat 视图 → 打开 Review 面板 → 定位文件）并把 `onOpenReview` 传给运行视图、运行视图环心卡片 end / abort 终态显示「N files changed · +a −d」与「Open diff」，展开面板列出文件（每行可点，走上游 Review 面板）、i18n en / zh / zht。
- 验证：`bun run typecheck` 0 错；上游 app `tsgo -b` 0 错；`bun test tests/unit` 213 / 0；`bun run build:webview` 17.2 s 通过；补丁 `regen-patch.sh 0021 --check` 复核一致（5 文件 +165 −1）；vsix `oco-0.0.4-bb9e90e.vsix` 已打包并安装到本机 VS Code（`oco-local-test.oco@0.0.4`）。
- E2E c7-result-card（mock，Claude 子代理）：done-row-summary PASS（摘要 `1 file · 4s · OK`）、done-row-mark-read PASS、done-row-diff PASS（主面板切到目标会话并出现 `session-review-v2`）、runtime-result-card FAIL：测试服务器的 `session.diff` 恒为空（c2 套件已记录的快照 blob 问题），套件用直通代理注入 fixture，侧栏收到了，主面板 app 未收到，正在定向复查 fixture 的目录路由。子代理定向复查后判定为产品缺陷：嵌入 app 以 `sessionContent:false` 应用目录事件，reducer 丢弃 `session.diff`，`sync().data.session_diff` 永远为空。主线程已把结果卡数据源改为用户消息的 `summary.diffs`（上游 Review「last turn」同源，跨轮按文件取最新），补丁 0021 重生成（+170 −1）、app tsgo 0、vsix 重新打包安装。**c7 的 runtime-result-card 尚未按新数据源重跑**（fixture 需改为注入 `GET /session/:id/message` 的 summary.diffs，同 c2 做法），状态 NOT RUN。
- 限制：mock 最后一句恒为 `OK`，摘要截断只验到 `OK`；mock 的 write 工具会弹 edit 权限，套件用 API 自动 `once`；运行视图结果卡在真实模型下未目视。
- 不做：VS Code 原生 diff 编辑器、批次分组头、Agent 定义编辑（见范围）。
