# 补丁 0019：嵌入模式恢复上下文用量（2026-10-08）

- 起因：补丁 0017 在嵌入模式隐藏了上下文用量圆环（理由：轨迹视图已有用量），会话页没有常驻的上下文占比提示，容易不知不觉超限。
- 改动：`SessionHeaderEmbeddedActions` 前加 `SessionContextUsage label`，对话、轨迹两个视图的会话标题行都显示上下文圆环（后续按用户要求去掉百分比数字，只着色）；≥75% 用 warning 色，≥90% 用 danger 色；模型没有上下文上限时显示「—」，不显示 0%。点击仍打开审查面板的 Context 页签（上游行为）。
- 补丁：`patches/opencode/0019-oco-embedded-context-usage.patch`（2 个文件）。
- `scripts/setup.sh` 修复：重置时同时 `git clean` 补丁新建的未跟踪文件（原来重跑时 0007、0012–0014 报 already exists 且被静默跳过）；任一补丁不能应用即退出。修复后在固定 SHA 上连续重放两次，0001–0019 全部应用。
- 检查：`packages/app` `tsgo -b` PASS；`bun run build` PASS。
- E2E（mock，英文）：主线程运行 `node tests/e2e/c4-trajectory.mjs` **17/17 PASS**（`runs/20261008-093309-c4-trajectory-93c2`）；`header-actions-chat` 读到 `usageLabel: "0%"`，`header-actions-trajectory` `usageInHeader: true`。首次运行（`…-092938-…-26c0`）因测试服务未启动 `fetch failed`，启动 mock 服务后重跑。
- NOT RUN：warning/danger 配色与「—」（mock 用量低、模型有上限，未覆盖）、点击打开 Context 页签、窄于 768px、中文环境、真实模型、Remote。

## 委派记录

| task_id | 唯一写入范围 | requested_route | actual_provider/model | agent_id/run_id | 状态 | 结果路径 | fallback_reason / 接手理由 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| health-gemini | — | agy 最小请求 | unknown | unknown | 未确认 | — | 10 秒内 `context canceled` |
| health-grok | — | grok 最小请求 | grok | unknown | 已返回 | — | — |
| e2e-c4 | `tests/e2e/runs/`、本文件「E2E 结果」段 | grok-worker | xAI Grok 4.7（Grok 自报） | unknown（会话 API 断连 ECONNRESET，返回前中止） | 失败 | 本文件「E2E 结果」段 | Grok 沙箱启动不了 VS Code（同 2026-10-01）；Gemini 未确认 → 主线程接手 |
| e2e-c4-main | `docs/evidence/runs/` | 主线程 | Claude（主线程） | `20261008-093309-c4-trajectory-93c2` | 验收通过 | 见下 | 两条订阅路线均不能执行 |

## E2E 结果

- 时间：2026-10-08。命令：仓库根目录 `node tests/e2e/c4-trajectory.mjs`（未重新构建，未运行 setup）。
- 运行目录：无。约 0.84s 退出，exit code 1；`tests/e2e/runs/` 下没有本次目录，也没有 `results.json`。
- 启动失败，未进入检查项。错误原文首行：`Error: Process failed to launch!`（playwright-core Electron `waitForLine`，`electron.js:247`）。其前有一条 Node 警告：`NO_COLOR` 因 `FORCE_COLOR` 被忽略。
- 重试：0。该错误属于任务点名的启动失败，立即停止。
- 结果数量：PASS 0 / FAIL 0 / NOT RUN（套件未启动）。`header-actions-chat`、`header-actions-trajectory` 均 NOT RUN，无 `usageLabel` 等 details。
- 执行方：本委派任务在 Grok 4.7（xAI）上执行；E2E 进程本身无 provider/model 字段，记 unknown。

（以上「E2E 结果」段为 Grok 委派写入；Grok 沙箱内启动失败，有效结果是主线程运行。）

## 跟进：去掉数字（2026-10-08）

- 用户：不需要百分比数字，太占空间，一眼看大概即可。prop 改名 `tinted`，按钮回到 `size-6`，数字只在提示里。
- 补丁 0001–0019 在固定 SHA 上重放，结果与 vendor 一致；`tsgo -b` PASS；build PASS；E2E（mock）`c4-trajectory` 17/17（`runs/20261008-101353-c4-trajectory-5b15`），`usageLevel: "normal"`、`usageText: ""`。
- 委派：Gemini 复查 10 秒 `interrupted`（未确认）；Grok 沙箱已知不能启动 VS Code（本批第一次运行已证实）→ 主线程运行。
