# M20 第一步：侧栏子代理聚合（2026-10-14，分支 claude/m20-subagent-aggregation）

来源：[roadmap-research-2026-10-10](roadmap-research-2026-10-10.md) 第 318 行 M20 第一步（host-only）；卡 4 排期（2026-10-14 用户确认下一批只做 M20）。第二步（补丁扩 0017 标题行的子代理 pills + chord 键位）不在本批。

## 契约（主线程）

- 数据：`SessionStore.setChildren(parentID, sessions)` 合并子会话行；`subagents(rootId)` 只列直接子会话，每个子会话的状态按其子树汇总：running（自身或后代 busy / retry）> waiting（子树有待处理权限 / 提问）> error（自身 error）> done（其余）。
- 拉取：`SessionFeed.ensureChildren(id)` 对可见行懒取 `GET /session/:id/children`，与 todo 同队列、同 epoch、同 401 处理；ADR-009 §2 已补一行。
- WebRow：`subagents?: { done, total, running, attention, items: [{ id, title, status: "" | "running" | "waiting" | "error", time }] }`，只在 total ≥ 1 时出现；`attention` = 有子会话 waiting 或 error。
- 侧栏：父行徽标（分支图标 + `done/total`；有运行中子会话时 running 样式；attention 时高亮），点击展开 / 收起子会话列表（默认收起，展开状态存 webview state）；子会话行点击走既有 `open` 消息 → `oco.openSession`。

## 委派记录

| task_id | 唯一写入范围 | requested_route | actual_provider/model | agent_id/run_id | 状态 | 结果路径 | fallback_reason / 接手理由 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| m20-contract | `docs/adr/009-multi-agent-cockpit-boundary.md` §2 一行、本文件 §契约 | 主线程 | — | — | 完成 | 本文件 | 公共契约由主线程负责 |
| m20-impl | `session-store.ts`、`session-feed.ts`、`sessions-view.ts`、`extension.ts`（一行接线）、`media/sessions-list/index.js` / `index.css`、对应三份单测 | gemini-worker | Gemini 3.8 Flash (High)（自报） | gem-mv7k8if3-rsky9（1204s，12 次工具调用） | 验收通过（typecheck 0；unit 393/0；build PASS；主线程复核选择器与类名一一对应，发现缺陷 0） | `/tmp/oco-m20-checkpoint.md` | 同批 Gemini 健康检查已通过（c2-health-gemini） |
| m20-e2e | `tests/e2e/c17-subagent-aggregate.mjs`（新）、`docs/evidence/m20-e2e.md`、`docs/evidence/runs/`；回归套件测试侧修复（须注明） | claude-subagent/sonnet（续用卡 2 E2E 代理） | Claude Sonnet 5.5（自报） | a58df113（19 次工具调用，约 8 分钟） | 验收通过（c17 5/0 连续 3 次；c16 5/0、c11 7/0/1、c6 5/0、p1b-sidebar 13/0）；主线程发现缺陷 0 | `docs/evidence/m20-e2e.md` | E2E 要起 VS Code |

## 验证（4634d4b）

- 离线：typecheck 0；unit 393/0（26 文件）；build PASS。
- E2E（mock，明细 [m20-e2e](m20-e2e.md)）：c17-subagent-aggregate 5/0 连续 3 次——badge-running（子代理出现 0.6–2.5 s 内徽标 "0/1"、running 样式、aria-label 含 "1 running"）、badge-done（"1/1"）、expand-collapse（展开 1 行子会话、不切换当前会话）、open-child（点子会话行后 selected 为子会话）、lazy-children（同一 user-data-dir 重启 VS Code，记录代理只看到 1 次 `GET /session/<父>/children` 与 1 次 roots 快照，徽标仍为 "1/1"，即只靠懒取）。回归 c16 5/0、c11 7/0/1（delete-batch 有意 NOT RUN）、c6 5/0、p1b-sidebar 13/0。
- 观察：子会话懒取对每个可见的 pinned / recent 行各发一次（与 todo probe 同模式），测试服务端每次连接 74–92 次请求，队列并发上限 4，不会洪泛；行数多时可考虑只取前 N 行（记入 NEXT §3）。
- NOT RUN：attention 样式与 "needs you / failed" 文案的 E2E（单测覆盖）；嵌套 ≥2 层（mock 不产生孙会话，只在一层验收，与调研约定一致）；真实模型目视。

