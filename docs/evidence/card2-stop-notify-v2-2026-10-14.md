# 卡 2：合并卡 1 / 卡 3 + 侧栏停止 + 通知分级 + V2 识别（2026-10-14）

## 合并

- 来源：卡 1、卡 3 在 Mac mini（Tailscale `jarvismac-mini`）上完成，分支与 main `81aff36`（§0 卡片排期）都没推到 origin。本机经 `git fetch ssh://macmini/Users/jarvis/Ai-Project/oco` 取到 `claude/card1-worktree-inbox` c0b7e44、`claude/card3-review-notes` becbcdb；fetch 前确认 Mac mini 两个 card worktree 无未提交改动。
- main：3808026 → 快进 81aff36 → `--no-ff` 合入卡 1 → 合入卡 3 = 88b56c2，无冲突。两边重叠的 `extension.ts`、`sessions-webview.ts` 自动合并后复核：三处批复目录取卡 1 的 `pendingDirectory(id) ?? client.directory`，卡 3 的 `sendNotes` 消息与 Review Notes / Terminal / Fix 注册并存。
- 离线检查（88b56c2，`bun run verify:brief -- --build`）：typecheck 0 错误；unit 322 pass / 0 fail；build PASS。

## 委派记录

| task_id | 唯一写入范围 | requested_route | actual_provider/model | agent_id/run_id | 状态 | 结果路径 | fallback_reason / 接手理由 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| c2-merge | main 合并提交 | 主线程 | — | — | 完成 | 本文件 §合并 | 集成由主线程负责 |
| c2-merge-e2e | `docs/evidence/card2-merge-e2e.md`、`docs/evidence/runs/`；6 个套件文件的测试侧修复（须注明） | claude-subagent/sonnet | Claude Sonnet 5.5（自报） | a41a413e（19 次工具调用，约 10 分钟） | 验收通过：6 套件首跑全过，测试与产品未改，主线程发现缺陷 0 | `docs/evidence/card2-merge-e2e.md`（main a378575） | E2E 要起 VS Code，按 AGENTS 表交 Claude 子代理 |
| c2-health-grok | — | `grok-build:check` | grok 1.0.34（grok.com 已登录） | — | 通过 | — | — |
| c2-health-gemini | — | gemini-worker 最小请求 | Gemini 3.8 Flash（自报，Antigravity） | gem-mv7h3erq-9281b | 通过（10s） | — | — |
| c2-contract | `apps/extension/package.json`、`tests/unit/settings-contribution.test.ts` | 主线程 | — | — | 完成（993c94b、3f142bc） | 本文件 §契约 | 公共契约与清单测试由主线程负责 |
| c2-b-stop | `src/stop-sessions.ts`（新）、`tests/unit/stop-sessions.test.ts`（新）、`media/sessions-list/index.js`、`index.css`、`src/sessions-webview.ts` | gemini-worker | Gemini (Antigravity)，model unknown（同批健康检查自报 3.8 Flash） | gem-mv7h7ncg-cidmx（631s，7 次工具调用） | 验收通过；主线程发现缺陷 1：父会话自身空闲、子代理运行时（侧栏仍显示运行中）■ 无效，因 `planStop` 只遍历自身运行的目标。主线程修复：所有目标都遍历后代、新增 `targets`、stop-all 只取根会话、`SessionStore.sessionStates()`、Restricted Mode 门 | `/tmp/oco-card2-b-checkpoint.md` | — |
| c2-c-notify | `src/notify-policy.ts`（新）、`src/session-groups.ts`、`src/sessions-view.ts`、`tests/unit/notify-policy.test.ts`（新）、`session-groups.test.ts`、`sessions-view.test.ts` | grok-build:grok-delegate | grok-4.7 / xAI（自报） | run-mv7h9519-8x32f7（grok cbefe75a，15m14s） | 验收通过（68 pass / 0 fail）；主线程发现缺陷 0，仅把通知调用改为显式 `window.show*` | `/tmp/oco-card2-c-checkpoint.md` | — |
| c2-v2-detect | `src/server-version.ts`（新）、`src/diagnostics.ts`、`tests/unit/server-version.test.ts`（新）、`diagnostics.test.ts` | grok-build:grok-delegate | grok-4.7 / xAI（自报） | run-mv7h9xa9-8nlald（grok a80e5701） | 验收通过（14 pass / 0 fail）；主线程发现缺陷 0，文件头注释改英文 | `/tmp/oco-card2-v2-checkpoint.md` | — |
| c2-integrate | `extension.ts`（stop / V2 接线）、`sessions-view.ts`（状态栏 Stop all 项、计数用未过滤根会话）、`stop-sessions.ts` 修复、`session-store.ts`、相关单测 | 主线程 | — | — | 完成（0baf5ae）：typecheck 0；unit 381/0（26 文件）；build PASS | 本文件 §实现 | 同一文件内集成由主线程负责 |
| c2-e2e | `tests/e2e/c16-sidebar-stop.mjs`（新）、`docs/evidence/card2-e2e.md`、`docs/evidence/runs/`；回归套件文件的测试侧修复（须注明） | claude-subagent/sonnet | Claude Sonnet 5.5（自报） | a58df113（3 轮：74 / 21 / 10 次工具调用，约 22 / 8 / 4 分钟；第 1 轮超出 60 轮上限，用于 c13 / t014 诊断） | 验收通过（第 3 轮 d61dddf：c16 5/0、c6 5/0、c10 6/0）；子代理发现产品问题 2 处（等授权会话不可停、Stop 后待处理请求残留），主线程修复；主线程发现子代理缺陷 0 | `docs/evidence/card2-e2e.md` | E2E 要起 VS Code |

## 契约（主线程，card2 分支 993c94b / 3f142bc）

- 命令：`oco.sessions.stop`（参数 `{ sessionId, selection }` 或 webview 右键上下文；命令面板隐藏）、`oco.sessions.stopAllRunning`（模态确认一次）；均 `isWorkspaceTrusted`。右键菜单项 `when` 带行上下文键 `running`。
- 设置：`oco.notify.needsMe`、`oco.notify.finished`，枚举 off / windowNotFocused / always，默认 windowNotFocused，machine 范围。`oco.sessions.notifyPending` 标记弃用；只读迁移：新键都未设置且旧键显式为 false 时两类都 off，不改写用户设置。
- 文件归属：`package.json`、`extension.ts` 接线、状态栏「Stop all running」项由主线程在三路返回后合并；三路写入范围互斥，不提交、不构建（worktree 无 vendor）。

## 实现（card2 分支）

- B 侧栏一键停止（M10）：`stop-sessions.ts`（`planStop` / `stopSessions` / `rootIds` / `registerStopSessions`）。可停止 = 会话自身或任一后代在服务端 busy / retry（等授权、等提问时服务端也是 busy）；主机每次渲染用同一个 `planStop` 算出可停止的根会话，WebRow 带 `stoppable`，驱动行内 ■（悬停 / 聚焦显示）、选择栏 Stop、右键 Stop Session（上下文键 `running`）和状态栏 `$(debug-stop) N`（`oco.sessions.stopAllRunning`，模态确认一次）。宿主对每个会话按其自身目录 `POST /session/:id/abort`，发送前按服务端状态再核；父会话停下前若有运行中的子代理，确认「Its N running subagent(s) will stop too」并一并停。abort 不清服务端的待处理权限 / 提问（E2E 第 2 轮实测），所以 abort 成功后再按会话目录 reject 它们（`SessionStore.pendingOf`）。Restricted Mode 下命令拒绝、■ 与计数不显示。
- C 通知分级（M01 后半）：`notify-policy.ts`（`resolveLevel` 只读迁移、`shouldNotify`、`formatFinished`）、`session-groups.ts`（`PendingNotifier` 改按级别 + 窗口焦点；新 `FinishedNotifier`：仅根会话、busy/retry → idle/error、当前会话不弹、首次出现不算、结算后 1500 ms 取最新摘要、期间变回 busy 取消、同批多个合并为 `N sessions finished`）、`sessions-view.ts` 接线。状态栏与标题徽标仍只数等授权 / 等提问。
- V2 识别：`server-version.ts`（`probeServerVersion`：`/global/health` → `/api/info`；`v2UnsupportedMessage`），`diagnostics.ts` 的 `versionNote` / `serverInfoLines` 对 2.x 写明不支持；`extension.ts` 的 `refreshVersion` 改用探测，2.x 每个连接弹一次错误（带 Open Settings）。
- 主线程在评审中发现并修复 3 处：B 的父会话空闲缺陷（委派表 c2-b-stop）；等授权会话不可停且计数与 Stop All 不一致（E2E 子代理代码阅读指出，统一为 `stoppable`）；Stop 后待处理请求残留（E2E 第 2 轮 waiting-stop 失败，产品修复 d61dddf）。
- 提交：993c94b、3f142bc（契约）→ 0baf5ae（实现）→ cf8700c（c16、t014）→ 5a95980（stoppable）→ d61dddf（清理待处理请求）。

## 验证

- 离线（d61dddf）：typecheck 0；unit 385/0（26 文件）；build PASS。
- E2E（mock，card2 worktree，明细 [card2-e2e](card2-e2e.md)）：第 1 轮（0baf5ae）c16 4/0（两次）、c11 7/0/1（delete-batch 有意 NOT RUN）、c10 6/0（重跑）、c6 5/0、c13 6/0、p1b-sidebar 13/0、t015 4/0、t014 6/0（测试侧修复后）；第 2 轮（5a95980）c11 / c6 / c10 / p1b-sidebar 全过，c16 新增 waiting-stop 失败 → 产品修复；第 3 轮（d61dddf）c16 5/0、c6 5/0、c10 6/0（首跑启动时命令面板 fill 超时一次，8 次中第 2 次，未改共享助手）。
- 测试侧改动：`t014-connection.mjs` 401 拦截加 `/global/event`（卡 1 之后 feed 先连它）；新增 `c16-sidebar-stop.mjs`（未进 DEFAULT_SUITES）。
- E2E 环境注意：worktree 路径过长时 VS Code socket 超过 macOS 103 字符上限，`.oco-test` 用指向 `/private/tmp/claude-501/oco-c2e` 的符号链接；但服务端返回的 worktree 目录与会话目录拼写不一致会让 `bridge-policy.ts:83-87` 的精确字符串比较拒绝 worktree 新建会话（既有问题），第 2 轮起测试服务改用真实路径启动。
- NOT RUN：通知在真实窗口前台 / 后台的弹出（只有单测，Playwright 不能让窗口失焦）；真实模型下目视 ■ / 通知 / 状态栏；真实 V2 服务端。

