# 卡 1：worktree 会话进收件箱（2026-10-13 / 10-14）

分支 `claude/card1-worktree-inbox`（基于 main 81aff36），worktree `/Users/jarvis/Ai-Project/oco-card1`。与卡 3 并行；本卡不改 STATUS / NEXT / PROGRESS / vendor / patches，不打包、不安装、不推送。

## 委派记录

| task_id | 唯一写入范围 | requested_route | actual_provider/model | agent_id/run_id | 状态 | 结果路径 | fallback_reason / 接手理由 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| c1-setup | worktree vendor/、node_modules | 主线程 `bash scripts/setup.sh` | — | — | 已返回（exit 0） | /tmp/oco-card1-setup.log | 环境准备，非任务主体 |
| c1-check-grok | 无 | `grok-build:check` | grok 1.0.52 | — | 验收通过（ready, loggedIn） | — | — |
| c1-check-gemini | 无 | gemini-worker 最小请求 | Google Gemini 3.8 Flash（自报，Antigravity 订阅） | gem-mv7eb2zu-rdkcu | 验收通过（15s） | — | — |
| c1-investigate | 无（只读，结论由主线程代存本文件） | grok-worker | xAI Grok 4.7（自报） | run-mv7e5llo-5yczbo / grok a7254e07 | 已返回（3m12s，0 文件改动） | 本文件 §调查 | Grok 沙箱不写 docs，主线程代存 |
| c1-repro | tests/e2e/c13-repro-worktree-inbox.mjs、docs/evidence/card1-repro/ | claude-subagent/sonnet | Claude Sonnet（子代理） | a129bf63 | 验收通过（1 次运行，exit 0） | docs/evidence/card1-repro/results.json | E2E 要起 VS Code，按表交 Claude 子代理 |

## 调查（Grok，主线程代存，行号基于 vendor opencode 1.18.33）

1. `/global/event` 存在：`groups/global.ts:70,88-89`，`handlers/global.ts:70-71,119-120`。SSE data = `{ directory, project?, workspace?, payload }`（`groups/global.ts:36-49`）；`event-v2-bridge.ts:39-43` 用 `event.location.directory ?? InstanceRef.directory` 填 directory，payload = `{ id, type, properties }`；durable 另发 `payload.type="sync"`（45-59）。心跳与 `server.connected` 不带 directory（`handlers/global.ts:35-42`）。
2. `/permission`（`handlers/permission.ts:12-14`）、`/question`（`handlers/question.ts:12-14`）、`/session/status`（`handlers/session.ts:77-78`）按实例隔离；实例由 `query directory || header x-opencode-directory || cwd` 选（`middleware/workspace-routing.ts:86-88,181-182`），换 header 即可查其他目录。
3. `/event` 只放行 `location.directory === instance.directory` 且 SSE 体不带 directory（`handlers/event.ts:35-40`）→ worktree 实例的事件到不了工作区目录这条流。
4. 扩展侧：`session-feed.ts:177,234-236` 只对 `d.directory()` 开一条 `/event`；快照 `287-312` 只按该目录取 `/session?scope=project&roots=true`、`/session/status`、`/permission`、`/question`。`roots()` = workspace 文件夹 + 匹配项目 sandboxes（`connection.ts:59-60,78-82,138-157`）；roots 变化时 `feed.restart()`（`extension.ts:67-69`）；store 丢弃 `!owns(directory)`（`session-store.ts:141,441-442`）。
5. 推论：worktree 会话的权限/提问/状态在现有代码里收不到（待 mock 复现确认）。

## 复现（Sonnet 子代理，mock = 真实 `opencode serve` + 脚本化模型）

- mock 真实性：`scripts/test-server.sh:44` 启动 `opencode serve`；`scripts/test-server.mock.opencode.json` 只换 provider 为 `oco-mock/mock` 并设 `permission.bash=ask`。
- 本机无 opencode 二进制，用 `/tmp/oco-card1-bin/opencode` 包装 `bun run vendor/opencode/packages/opencode/src/index.ts`（版本报 "local"，状态栏提示 "not OpenCode v1"，不影响结论）。
- 结果（`docs/evidence/card1-repro/results.json`）：worktree 会话等 bash 权限 → 收件箱 0 行、状态栏计数 0；`GET /permission` 带 worktree 目录 header 返回 1，带工作区 header 返回 0。对照工作区会话：收件箱 1 行、计数 1。
- 结论：确认收不到。按 ADR-009 §2 新增一行的方案修：一条 `/global/event` 按 roots 过滤 + 每个 root 取快照 + 批复发往请求所属会话目录。

## 委派记录（续）

| task_id | 唯一写入范围 | requested_route | actual_provider/model | agent_id/run_id | 状态 | 结果路径 | fallback_reason / 接手理由 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| c1-adr | docs/adr/009 §2 一行 | 主线程 | — | — | 已完成 | ADR-009 §2 | 公共契约由主线程负责 |
| c1-impl | session-feed.ts、session-store.ts、sessions-webview.ts、extension.ts（接线）、对应两份单测 | gemini-worker | Google Gemini 3.8 Flash High（自报，agy） | gem-mv7ecyf6-e77oo | 验收通过（767s；主线程复核：补接 extension.ts 的 realpath 目录比较，缺陷 1） | docs/evidence/card1-impl-checkpoint.md | — |

## 实现与检查

- 改动：`session-feed.ts`（`/global/event` + roots 过滤 + 丢弃 `sync`，404 退回 `/event`；status/permission/question 按 root 取并合并，非工作区 root 失败按空处理；补链按发现目录查询）、`session-store.ts`（`pendingDirectory`）、`sessions-webview.ts`（三处批复发往请求所属会话目录）、`extension.ts`（接 `roots` 与 realpath 目录比较）、两份单测。
- 主线程复核：`bun run typecheck` 0 错误；`bun run test:unit` 302 pass / 0 fail（20 文件）；`bun run build` exit 0。

| task_id | 唯一写入范围 | requested_route | actual_provider/model | agent_id/run_id | 状态 | 结果路径 | fallback_reason / 接手理由 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| c1-e2e | tests/e2e/c13-worktree-inbox.mjs、run.mjs 注册、删除复现脚本、docs/evidence/card1-e2e/ | claude-subagent/sonnet | Claude Sonnet（子代理） | a776e4f8 | 验收通过（c13/c6/c12 PASS；p1b 测试侧修复后重跑 PASS） | docs/evidence/card1-e2e/summary.json | E2E 要起 VS Code，按表交 Claude 子代理 |
| c1-p1b-rerun | docs/evidence/card1-e2e/p1b-rerun.log、runs/ | claude-subagent/sonnet | Claude Sonnet（子代理） | a5dce2a0 | 验收通过（PASS 13/13，exit 0） | 同左 | 主线程把 `tests/e2e/p1b-sidebar.mjs` 标题检查改为大小写不敏感（单行测试侧修复，与 feed 无关） |

## E2E（mock，真实 opencode serve；结果目录 `docs/evidence/runs/` 不入库，汇总见 `docs/evidence/card1-e2e/summary.json`）

- c13-worktree-inbox：PASS 6/6，exit 0（`runs/20261014-010919-c13-worktree-inbox-43ef/results.json`）。两个 worktree 会话同时等 bash 授权、无面板 → 收件箱 2 行、状态栏 2 → 侧栏两次 Allow → 两个 worktree 目录 `GET /permission` 为空、收件箱 0、计数归零。
- c6-inbox：PASS（`runs/20261014-010939-c6-inbox-3a4b/results.json`）。
- c12-new-session-draft：PASS（`runs/20261014-010947-c12-new-session-draft-d2cb/results.json`）。
- p1b-sidebar 首跑：FAIL 1 项 `single-view-header`（`runs/20261014-011012-p1b-sidebar-41fb/results.json`）：容器标题被 VS Code 渲染为 "OCO: SESSIONS"，`p1b-sidebar.mjs:228` 大小写敏感匹配 "Sessions"；其余检查（含 chain-permission 徽标 1）PASS。与 feed 改动无关，测试侧修复后重跑见下。
- c13 未加入 `run.mjs` 的 `DEFAULT_SUITES`（按文件名可发现）；是否纳入默认集由卡 2 收尾决定。
- p1b-sidebar 重跑：PASS 13/13，exit 0（`runs/20261014-011231-p1b-sidebar-3d42/results.json`）。

## 结论与遗留

- 卡 1 验收（本会话范围）：c13 PASS；c6 / c12 / p1b-sidebar 回归 PASS；typecheck 0、unit 302/0、build PASS。按并行约定未打包/安装 VSIX、未改 STATUS / NEXT / PROGRESS，由卡 2 会话合并后统一收尾。
- 环境限制：本机无 opencode 二进制，E2E 用 `/tmp/oco-card1-bin/opencode` 包装 vendor 源码运行（版本报 "local"）；VS Code 需 `OCO_VSCODE_BIN=.../Contents/MacOS/Electron`。
- 未验证：真实模型下 worktree 会话的提问（question）与 busy 状态栏计数（单测覆盖，E2E 只测了 bash 权限）；远程（非 loopback）服务端下目录比较不做 realpath。
