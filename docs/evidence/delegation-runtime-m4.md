# 运行视图 M4 委派记录

设计：[runtime-m4](../design/runtime-m4.md)。分支 `claude/nostalgic-gates-ef74ca`。

## 路线检查（2026-10-04）

- Grok：`grok-bridge.mjs check --json` → ready，grok 1.0.34，已登录 grok.com（models-probe 验证）。
- Gemini：gemini-worker 最小请求 → 4 s 返回 OK，自报 Gemini 3.8 Flash (High)；工具头 model 记 unknown，job `gem-mut6eqfj-o6d55`。

## 任务

| task_id | 内容 | 唯一写入范围 | requested_route | actual_provider/model | agent_id/run_id | 状态 | 结果 | 备注 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| m4-main-b1 | 第一批 vendor 实现：回放播放、日志精简与浮层、思考框字号、i18n | `vendor/opencode/packages/app/src/components/session/session-runtime*.ts(x)` | 主线程 | Claude | — | 验收通过 | [runtime-m4-batch1](runtime-m4-batch1.md) | 上游补丁与同文件集成，按 AGENTS 由主线程负责 |
| m4-e2e-b1 | c5-runtime 新增断言 + 运行 E2E / look-runtime / 干净重放 | `tests/e2e/c5-runtime.mjs` | 主线程 | Claude | — | 验收通过 | 同上 | 接手理由：Grok 402 额度耗尽，Gemini 本批两次 EOF；未再重试同一路由 |
| m4-bg-map | 只读调查：后台任务 `task_id` 能否对上子会话 | `docs/evidence/runtime-m4-bg-task-mapping.md` | grok-worker | Grok Build / unknown | Grok session f7c47acf | 失败 | — | 402 Payment Required：Grok Build usage balance exhausted（首轮即失败） |
| m4-bg-map-r2 | 同上（换路由） | 同上 | gemini-worker | Gemini (Antigravity) / unknown | unknown | 失败 | — | Eligibility check failed: POST loadCodeAssist EOF（首轮即失败） |
| m4-bg-map-main | 同上（主线程接手） | 同上 | 主线程 | Claude | — | 已返回 | [runtime-m4-bg-task-mapping](runtime-m4-bg-task-mapping.md) | 接手理由：两条订阅路线均失败（Grok 402、Gemini EOF） |
| m4-playback-test | `session-runtime-playback.ts` 单元测试 | `…/session/session-runtime-playback.test.ts` | gemini-worker | Gemini (Antigravity) / unknown | unknown | 失败 | — | 同一 EOF；Grok 已 402，未再试；主线程接手 |
