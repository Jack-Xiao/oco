# 卡 3：审阅意见发回 agent（M13 首版）+ Fix with OpenCode（M05 第二片）— 2026-10-13

分支 `claude/card3-review-notes`（worktree `/Users/jarvis/Ai-Project/oco-card3`，基于 main 81aff36）。与卡 1 并行；本卡不改 session-feed.ts / 连接代码，不改 STATUS / NEXT / PROGRESS / vendor / patches。

## 方案（主线程）

契约：`packages/contracts/src/bridge.ts` 的 `DraftSource` 增加三种 kind：`reviewNotes`、`terminal`、`fix`。补丁 0001 只读 id / sessionId / text，不需改补丁。

M13：
- 新模块 `apps/extension/src/review-notes.ts`：笔记按 `connectionId + sessionId` 存在宿主内存 + workspaceState（`oco.reviewNotes.v1`）；纯函数 `formatReviewNotes` 合成一条文本，头部注明「片段取自工作区当前内容，前像来自 Git 变更（HEAD vs 工作区），可能含非本会话的改动」；沿用 `truncateTail` / `isExcluded`（命中排除规则只传路径）。
- 命令：`oco.addToReviewNotes`（editor/context，有选区）、`oco.reviewNotes.sendAll`（参数 sessionId；未开面板先 `oco.openSession`，经 `panels.insertDraft` 入草稿，成功后清空）、`oco.reviewNotes.clear`。
- 侧栏：`WebRow.notes`（待发条数）→ 行内「N to send」徽标，点击发 `sendNotes` 消息 → 宿主执行 sendAll。

M05 第二片：
- 终端：shell integration `onDidEndTerminalShellExecution` 缓冲每个终端最近一条命令（命令行、退出码、输出尾部）；`oco.addToDraft` QuickPick 增「Terminal: last command output」，并加 `terminal/context` 菜单命令。
- Problems / SCM 菜单贡献点：`problems/context` → 该条诊断入草稿；`scm/title` → 工作区 diff 入草稿。
- 「Fix with OpenCode」灯泡：CodeActionProvider（QuickFix），对光标处诊断生成「诊断 + 周围代码」入草稿；排除规则命中的文件只传路径。

## 委派记录

| task_id | 唯一写入范围 | requested_route | actual_provider/model | agent_id/run_id | 状态 | 结果路径 | fallback_reason / 接手理由 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| c3-contract | packages/contracts/src/bridge.ts（DraftSource） | 主线程 | — | — | 完成 | 本文件 | 公共契约由主线程负责 |
| c3-health-gemini | — | agy 最小请求 | gemini (agy) | — | 通过（返回 OK） | — | — |
| c3-m13-impl | review-notes.ts + 单测、extension.ts/package.json/sessions-view.ts/sessions-webview.ts/media/sessions-list 接线 | gemini-worker | gemini (Antigravity)，model unknown | a03c771d / gem-mv6u9zbv-brot2 | 验收通过（包装层报 {"status":"ERROR"}，但 checkpoint 记完成，主线程复跑 typecheck 0 / unit 307 pass 0 fail / build PASS） | /tmp/card3-m13-checkpoint.md | — ；主线程发现缺陷 2（排除规则函数重复实现→改为复用 add-to-draft 导出；选区止于第 0 列时多算一行），耗时约 14 分钟 |
| c3-health-grok | — | grok-build:check | grok 1.0.52（已登录 grok.com） | — | 通过 | — | Gemini 包装层在 c3-m13-impl 报 ERROR，按规则换路由 |
| c3-m05-impl | add-to-draft.ts、新 terminal-output.ts / fix-with-opencode.ts、extension.ts 注册、package.json 菜单、对应单测 | grok-build:grok-delegate | grok 1.0.52，model unknown | a691fe96 / run-mv6v1649-botdke | 验收通过（checkpoint 8 轮；主线程复跑 typecheck 0 / unit 317 pass 0 fail / build PASS；主线程发现缺陷 0） | /tmp/card3-m05-checkpoint.md | Gemini 出现新错误后换 Grok |
| c3-e2e | tests/e2e/c14-review-notes.mjs、c15-fix-with-opencode.mjs（+run.mjs 注册行） | claude-subagent/sonnet | claude sonnet | a2d545b9 | 验收通过（54 轮，约 22 分钟；主线程发现缺陷 1：把 c14/c15 加进 run.mjs DEFAULT_SUITES 违反 TEST-SCOPE 的 24 套件单测，已撤回，按名单跑） | /tmp/card3-e2e-checkpoint.md、docs/evidence/card3-e2e-2026-10-14.md | E2E 需启动 VS Code，按表交 Claude 子代理 |

## 结果（2026-10-14）

提交：d8f14ba（M13）、189b05b（M05 第二片）、本次（E2E + panels.ts 修复 + 证据）。

检查：`bun run typecheck` 0 错误；`bun test tests/unit` 317 pass / 0 fail；`bun run build` PASS。

E2E（mock 模型，`node tests/e2e/<suite>.mjs`，明细见 [card3-e2e-2026-10-14](card3-e2e-2026-10-14.md)）：
- c14-review-notes 6/6 PASS — `docs/evidence/runs/20261013-162025-c14-review-notes-3088/results.json`
- c15-fix-with-opencode 必需 4/4 PASS，terminal-shell-integ NOT RUN（隔离 profile 下 zsh 未上报 shell integration）— `docs/evidence/runs/20261013-162509-c15-fix-with-opencode-9f9e/results.json`
- 回归 c12-new-session-draft 13/13 PASS — `docs/evidence/runs/20261013-162957-c12-new-session-draft-fe2e/results.json`
- 回归 p1b-sidebar 12/13 — `single-view-header` FAIL（标题渲染为 "OCO: SESSIONS"，本卡未改视图标题；未跑 main 基线确认，记为待确认的既有问题）— `docs/evidence/runs/20261013-163026-p1b-sidebar-33da/results.json`

E2E 暴露的产品缺陷（已修）：`panels.insertDraft` 先 `reveal()`（视图状态变化触发一次 `flushDrafts`）再自己 `flushDrafts`，同一 draft.insert 投递两次，页面不按 id 去重，草稿出现两份。修复：`flushDrafts` 跳过已投递未确认的 id（`sentDrafts`，ready / draft.ack 时清除）。影响所有入草稿来源（含原有 addSelectionToDraft）。

未解决 / 交给卡 2：
- 终端输出正向路径未在 E2E 实测，需真实终端目视（shell integration 开启的 zsh / bash）。
- p1b-sidebar `single-view-header` 需在 main 上跑基线确认是否既有。
- 侧栏「N to send」改了 sessions-view.ts、sessions-webview.ts、media/sessions-list，与卡 2 的侧栏停止可能冲突。
- c14 / c15 未加入 run.mjs 默认套件（TEST-SCOPE 定为 24 个）；是否纳入由卡 2 统一决定。
- Problems 菜单的 marker 参数形状是内部结构，只做了尽力解析，回退为当前文件 Problems；需真实 VS Code 目视。
