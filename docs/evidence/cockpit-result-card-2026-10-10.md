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
| 改动文件、增删行、状态 | 最新 user `message.updated.info.summary.diffs`（`file, additions, deletions, status, patch`） | 最近一轮的摘要；侧栏不存 patch。当前上游 `session.diff` 只发空数组，不能充当真实文件来源 |
| 耗时 | `session.status` busy → `session.idle`，扩展侧记录两端时间 | 只在两端都观察到时显示 |
| 花费 / token | `message.updated` 中 `info.role === "assistant"` 的 `cost`、`tokens`，按 messageID 去重后求和 | 只统计本次运行（最近一次 busy 之后） |
| 最后一句 | `message.part.updated`（`part.type === "text"`，messageID 属于本次运行的 assistant 消息）+ `message.part.delta`（`field === "text"`） | 存全文，侧栏截一行 |
| 已读 | 现有 `UnreadTracker`（memento `oco.unreadSessions`），新增手动 `markRead` | 客户端状态 |
| 运行视图文件列表 | app 内最新 user 消息 `summary.diffs`，经上游 `utils/diffs` 校验 | 与 Review「last turn」同源，不跨轮合并；上游缺摘要时不伪造文件 / 增删行 |

## 集成契约（主线程定）

- `apps/extension/src/session-store.ts`：新增 `FileChange`、`RunResult`，`InboxRow.result?: RunResult`（已写入）。`applyEvent` 对 assistant `message.*` / 兼容 `session.diff` 返回 false；user `summary.diffs` 改变文件列表时返回 true（含 idle 后到达），`session.idle` 照旧返回 true。
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

## Codex 接续验收（2026-10-10）

- 接续基线：`1803c55`，分支 `claude/cleanup-2026-10-10`；原有 `AGENTS.md` 修改及未跟踪样稿、系统文件保留。
- 目标：修正 c7 的消息摘要 fixture，验证终态结果卡、展开文件列表和 Review 跳转；不扩展批量发起等 DEFER 功能。
- Grok 轻量检查：CLI 1.0.34，`grok-bridge.mjs check --json` 返回 ready / loggedIn，耗时 0.8 s；仅证明登录与安装。
- E2E 主线程接手理由：本环境无原生 Claude/Sonnet 子代理工具且用户报告 Claude 额度耗尽；AGENTS.md 明确记载 Grok 无法启动 Code（exit 139）、Gemini 长 E2E 包装层空等，不适用于本项。只读独立审查仍委派 Grok，不启用 GPT 子代理或付费 API。
- Grok 审查指出且主线程确认：原文件动作调用 `createOpenReviewFile` 打开全文；Review 默认 git 而卡片用 user summary；卡片跨轮按文件覆盖不等于会话净变更；侧栏真实文件来源为空。修正为最近一轮结果、Review 显式 turn 模式和 review tab、文件动作调用 `focusReviewDiff`。没有重命名上游 last-turn 语义。
- c7 先修正测试：最新 user 消息摘要注入 GET 和真实 `message.updated` SSE，保留服务端 `session.diff=[]`；卡片展开点整张卡；新增单文件 / 全部 diff 的文件名和 patch 文本断言。测试代理需禁用上游压缩，Diff 文本在 shadow root 内读取。失败过程保留在 `docs/evidence/runs/`，不当作产品通过。
- 离线首次 208 PASS / 3 FAIL：mock 单测 `listen(0)` 被沙箱禁止；允许正常环境绑定测试端口后 213 PASS / 0 FAIL、typecheck 0。侧栏新实现集成后另执行最终检查。
- 主线程发现 store 交付缺口 1 项：新 user 初始事件可能先于 busy，无条件封住 watermark 会拒绝本轮后续摘要；已退回原代理补两条真实顺序测试并修复，主线程验收通过。第二轮代理误把 checkpoint 写进历史文件，主线程已只移走本轮追加段，合并到接续 checkpoint，历史正文保持原样。

| task_id | 唯一写入范围 | requested_route | actual_provider/model | agent_id/run_id | 状态 | 结果路径 | fallback_reason / 接手理由 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| resume-review | 无；只读结果卡及 Review 数据路径 | grok_worker | Grok Build / unknown（报告自称 grok-4.7） | run-mv2akpkg-hnfbsd；session be147675-1f2b-419b-89a6-2a10baeeaae7 | 已返回，6m15s | 本节代存摘要 | 包装层误将主线程并发写入列为只读代理改动；已比对，均为主线程预期产物，未回滚 |
| resume-health-gemini | 无 | gemini / Antigravity subscription | Google Antigravity / unknown（报告自称 Gemini 3.8 Flash） | gem-mv2auasm-tn3fu | 已返回，7s | 本节 | 无编辑、无命令，返回 OK |
| resume-store | `apps/extension/src/session-store.ts`、`tests/unit/session-store.test.ts`、`docs/evidence/cockpit-result-card-resume-store.md` | gemini_subscription_worker | Antigravity / Gemini 3.8 Flash（错误返回） | /root/store_fix；run unknown | 失败 | 本节 | HTTP 400 INVALID_ARGUMENT: Requests ending with a model turn are not supported；尚未写产物，换 Grok |
| resume-store-fallback | 同 resume-store，原代理已停止 | grok_worker | Grok Build / unknown（报告自称 Grok 4.7） | run-mv2be2dn-2xchpp；session 0b4f0b4e-d751-476a-a6ce-06fc0cfbf57c | 验收通过；9m29s + 定向 6m43s（run-mv2c4kdi-0pj0w3） | [store-checkpoint](cockpit-result-card-resume-store.md) | Gemini 协议拒绝，换路由；首轮 33 单测通过，主线程发现 1 项事件顺序缺口后修复；最终 store 35/0 |
| resume-unit-diag | 无；只读失败日志和相关 unit | grok_worker | Grok Build / unknown（报告自称 grok-4.7） | run-mv2av9dd-cp5g1b；session 20d38a1b-3042-423a-8563-f12d167d07f5 | 已返回，3m | 本节代存 | 3个失败均为 localhost listen 被沙箱禁止；正常环境复跑 213/0，无需产品改动 |
| resume-e2e | `tests/e2e/c7-result-card.mjs`、关联测试清单；结果及日志 `docs/evidence/runs/` | 主线程 | Codex / unknown | unknown | 验收通过，14 PASS / 0 FAIL | 下列最终结果路径 | Claude 路线不可用，订阅路线存在上述 E2E 结构性限制 |
| resume-integration | 补丁 0021、STATUS/NEXT/PROGRESS、本证据 | 主线程 | Codex / unknown | unknown | 验收通过 | 本文件 | 公共上游补丁和最终验收由主线程负责 |

### 最终结果

- 根检查：`bun run verify:brief`，typecheck exit 0、unit 221 PASS / 0 FAIL；上游 `vendor/opencode/node_modules/.bin/tsgo -b vendor/opencode/packages/app` exit 0。日志：`docs/evidence/runs/result-card-resume-offline-final.log`、`result-card-resume-app-typecheck.log`。
- E2E（OpenCode 1.18.33，VS Code 1.141.0；mock / c7 摘要 fixture；基线 `1803c55` + 本批未提交工作区）：c7 6/0（19.25 s）、c6 5/0（9.06 s）、c2 3/0（13.29 s）。三套件均在最终 product 构建上验收；c2 在 store 顺序修复并最终构建后重新执行，未拼接早期失败结果。
  - [c7 results](runs/20261010-120022-c7-result-card-612b/results.json)：侧栏摘要 / 标已读 / Diff、运行卡与展开列表、点文件的 diff 名与 patch 文本、Open diff 全部通过；消息摘要 SSE 注入，真实空 `session.diff` 保留。
  - [c6 results](runs/20261010-120042-c6-inbox-28bb/results.json)：三个子代理侧栏授权、清空请求 / 收件箱 / bell 通过。
  - [c2 results](runs/20261010-121254-c2-diff-unavailable-4ff8/results.json)：缺失 diff 文案、宿主打开文件、非空 diff 控制通过。
- 上游补丁 0021：5 文件 +168 −1；`regen-patch.sh 0021` 重新应用 0001–0021，vendor app 内容一致；补丁 SHA256 `5808542304b7df5ac35d12436d9537e13857abd209c49d97eabfe5ccb88ef877`。构建日志 `result-card-resume-webview.log` / `result-card-resume-extension.log`，均 exit 0。
- 打包与安装：`OCO_SKIP_BUILD=1 bash scripts/package-vsix.sh`、`bash scripts/install-local.sh .../oco-0.0.4-1803c55.vsix` exit 0；包 12,810,743 bytes，安装的 extension.js 和 index.html 均与包内一致。extension.js SHA256 `e14010b3cf287be61af9258b5bd47a2f11aab630391883d6be2b7bcddc0e8e2a`。文件名指构建时 HEAD（1803c55），包含本批代码；不是旧包。VS Code 需 Reload Window。
- 收尾：当前文档本地链接检查 PASS、`git diff --check` PASS；本轮启动的本机隔离测试服务已按进程命令 / 测试目录核对后关闭，不改用户已有 OpenCode 服务。
- 边界：真实模型目视 NOT RUN；服务端真实快照 / summary.diffs 生成未在本轮验收，上游缺摘要时不捏造文件与增删行。远端、亮色主题、嵌套子代理和长会话回归不在本批。批量发起与 Agent 编辑保持 DEFER。测试产物目录 gitignored，当前事实集中在 STATUS，历史记录在 PROGRESS；原有 AGENTS.md 与样稿未提交改动保留。

## 原 Claude 批次结果（历史；接续结论以本节上方与 STATUS 为准）

- 实现落点：`session-store.ts`（运行摘要：busy/idle 计时、`message.updated` 花费、`message.part.updated/delta` 最后一句、`session.diff` 文件列表；`inbox()` done / error 行带 `result` 与一行 summary）；侧栏 done 行 Open / Diff / Mark read（error 行 Open / Diff），hover / focus / 选中时显示；`sessions-view.markRead`；`oco.openSessionReview` 命令；`OpenSessionRequest.review` 与 bridge `navigate.review` 契约；面板 `pendingReview` 随 navigate 发送、页面 ready 后补发；chat-webview 以 `oco:review-intent` 窗口事件转交页面；上游补丁 0021：`context/oco-review-intent.ts`、`pages/session.tsx` 消费意图（切回 chat 视图 → 打开 Review 面板 → 定位文件）并把 `onOpenReview` 传给运行视图、运行视图环心卡片 end / abort 终态显示「N files changed · +a −d」与「Open diff」，展开面板列出文件（每行可点，走上游 Review 面板）、i18n en / zh / zht。
- 验证：`bun run typecheck` 0 错；上游 app `tsgo -b` 0 错；`bun test tests/unit` 213 / 0；`bun run build:webview` 17.2 s 通过；补丁 `regen-patch.sh 0021 --check` 复核一致（5 文件 +165 −1）；vsix `oco-0.0.4-bb9e90e.vsix` 已打包并安装到本机 VS Code（`oco-local-test.oco@0.0.4`）。
- E2E c7-result-card（mock，Claude 子代理）：done-row-summary PASS（摘要 `1 file · 4s · OK`）、done-row-mark-read PASS、done-row-diff PASS（主面板切到目标会话并出现 `session-review-v2`）、runtime-result-card FAIL：测试服务器的 `session.diff` 恒为空（c2 套件已记录的快照 blob 问题），套件用直通代理注入 fixture，侧栏收到了，主面板 app 未收到，正在定向复查 fixture 的目录路由。子代理定向复查后判定为产品缺陷：嵌入 app 以 `sessionContent:false` 应用目录事件，reducer 丢弃 `session.diff`，`sync().data.session_diff` 永远为空。主线程已把结果卡数据源改为用户消息的 `summary.diffs`（上游 Review「last turn」同源，跨轮按文件取最新），补丁 0021 重生成（+170 −1）、app tsgo 0、vsix 重新打包安装。子代理随后把 fixture 改为同时注入 `GET /session/:id/message` 里最后一条用户消息的 `summary.diffs`（同 c2 做法）并重跑一次：`docs/evidence/runs/20261010-140107-c7-result-card-52d4/results.json`，6 / 0 PASS：done-row-summary（`1 file · 3s · OK`）、done-row-mark-read、done-row-diff（Review 面板含 fixture 文件）、runtime-result-card（`1 file changed · +1 −0`，展开 1 个文件）、runtime-file-diff、runtime-all-diffs（后两项由另一并行会话加入 c7）。
- 限制：mock 最后一句恒为 `OK`，摘要截断只验到 `OK`；mock 的 write 工具会弹 edit 权限，套件用 API 自动 `once`；运行视图结果卡在真实模型下未目视。
- 不做：VS Code 原生 diff 编辑器、批次分组头、Agent 定义编辑（见范围）。
