# 卡 11：M21 Git 动作 v1（2026-10-16，分支 claude/card11-git-actions-0c72f6）

范围：Claude Code「commit / create PR」按钮在 oco 的等价物。oco 不自己执行 git（[ADR-009 §4](../adr/009-multi-agent-cockpit-boundary.md)）：`oco.git.askCommit` / `oco.git.askOpenPR` 把带仓库上下文（VS Code 内置 Git 扩展 API：分支、改动文件数、前 20 个文件名）的提示模板渲染后插进主面板会话草稿，不自动发送；`oco.git.openScm` 打开原生 SCM 视图；SCM 标题栏按钮「Commit with OpenCode」；设置 `oco.git.commitPrompt` / `oco.git.prPrompt`。不做 CI 监视、PR 轮询、自动合并。

## 委派记录

| task_id | 唯一写入范围 | requested_route | actual_provider/model | agent_id/run_id | 状态 | 结果路径 | fallback_reason / 接手理由 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| c11-adr | docs/adr/009 §4 | 主线程（契约 / ADR） | — | — | 已完成 | ADR-009 §4 + 验收口径一行 | 公共契约由主线程负责 |
| c11-impl | apps/extension/src/{git-actions,add-to-draft,extension}.ts、apps/extension/package.json、tests/unit/{git-actions,settings-contribution}.test.ts | gemini-worker（探测 SUCCESS 6.1 s，08:30） | 待补 | 待补 | 派发 | 本文件「实现」 | — |
| c11-e2e | tests/e2e/c31-git-actions.mjs、docs/evidence/mini-card11.md、docs/evidence/runs/ | Mac mini dispatch（docs/mini/card11.md） | 待补 | 待补 | 计划 | mini-card11.md | — |

## 实现（Gemini，主线程审阅）

待补。

## E2E（Mac mini）

待补。

## 检查

待补。
