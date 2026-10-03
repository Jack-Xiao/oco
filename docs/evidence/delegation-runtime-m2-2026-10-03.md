# 委派记录：运行视图 M2/M3（2026-10-03）

健康检查：Gemini（agy）最小请求 2026-10-03 成功，3.0 s，`status: SUCCESS`。Grok 未检查（M1 记录额度不足；需要时先检查）。

| task_id | 唯一写入范围 | requested_route | actual_provider/model | agent_id/run_id | 状态 | 结果路径 | fallback_reason / 接手理由 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| m2-preflight | `docs/evidence/runtime-m2-preflight.md` | gemini-worker（agy） | Gemini (Antigravity) / unknown | gem-murysey5-3l6xj | 验收通过（主线程抽查 3 处） | docs/evidence/runtime-m2-preflight.md | — |
| m2-plan | `docs/superpowers/plans/2026-10-03-runtime-dashboard-m2.md` | 主线程 | Claude | — | 已返回 | 同左 | 计划与公共模型契约属主线程（AGENTS：范围、架构、契约） |
| m2-t1 | vendor `session-runtime-keyed.ts`/`.test.ts`、`session-runtime.tsx`、`session-runtime-model.ts`/`.test.ts`（仅 inFlightOf） | gemini-worker（agy） | Gemini (Antigravity) / unknown | unknown | 失败 | t1-checkpoint.md（子目标 1 完成，keyed 两文件未验证） | agy 运行中 400 FAILED_PRECONDITION “User location is not supported”，retryable=false；同批 Gemini 复查同样 400 地域错误（确认不可用）；Grok 最小请求 7.3 s OK → 换 Grok |
| m2-t6 | `tests/e2e/lib/mock-llm.mjs`、`tests/unit/mock-llm.test.ts` | gemini-worker（agy） | Gemini (Antigravity) / unknown | gem-murz9z2w-uu9tx | 验收通过（主线程复跑 3/3，评审由主线程完成：改动 28 行） | 提交 0e3b913 | — |
| m2-t1-grok | 同 m2-t1 | grok-worker | Grok Build / unknown | run-murzzpdt-51o3d4 | 已返回，需修复（双 Solid 运行时） | vendor fa612b5 | 接替 m2-t1（Gemini 地域错误） |
| m2-t1-fix | keyed.ts、src 与 test-browser 的 keyed 测试 | grok-worker | Grok Build / unknown | run-mus0ln99-c6suu9 | 已返回（主线程复跑 96/0、browser 3/0、tsgo 0） | vendor 84495f0 | — |
| m2-t1-review | 只读 | general-purpose（sonnet，评审，非任务主体） | Claude Sonnet | unknown | 已返回：无 Critical/Important，Ready: Yes | 账本 | 评审按 M1 惯例由 Claude 做 |
| m2-t2 | vendor `session-runtime-model.ts`/`.test.ts` | grok-worker | Grok Build / unknown | run-mus0ph6o-9cds9q | 已返回（主线程复跑 104/0、tsgo 0；checkpoint 因沙箱 EPERM 未写） | vendor b3d8b84 | Gemini 复查仍 400 地域错误（确认不可用），沿用 Grok |
| m2-t2-review | 只读 | general-purpose（sonnet，评审） | Claude Sonnet | unknown | 已返回：2 Important（接受），Ready: Yes | 账本 | — |
| m2-t3 | vendor `session-runtime.tsx`、`-i18n.ts`/`.test.ts`、`-actions.ts`/`.test.ts`、`pages/session.tsx` | grok-worker | Grok Build / unknown | run-mus1ad0n-yruart | 已返回（主线程复跑 114/0、tsgo 0） | vendor 4ce61a7 | Gemini 已确认不可用 |
| m2-t3-review | 只读 | general-purpose（sonnet，评审） | Claude Sonnet | unknown | 已返回：2 Important（接受），Ready: No | 账本 | 修复并入 Task 4 第 0 步 |
| m2-t2-fix | vendor `session-runtime-model.ts`/`.test.ts` | grok-worker | Grok Build / unknown | run-mus1pzke-ivvsxv | 验收通过（主线程复跑 121/0、tsgo 0，读 diff 核对 I1/I2） | vendor 8815155 | — |
| m2-t4 | vendor `session-runtime.tsx`、`session-runtime-child.tsx`（新）、`-actions.ts`/`.test.ts` | grok-worker | Grok Build / unknown | unknown（外层 Claude 会话额度耗尽，报告丢失） | 已返回（提交已落盘；新会话主线程复跑 131/0、tsgo 0） | vendor cfded63（t3 修复）、de22ac0（t4） | pin/unpin 是否实现待评审确认 |
| m2-t5（首派） | vendor `session-runtime-events.test.ts` | grok-worker | unknown | unknown | 中止（外层会话额度耗尽，无改动落盘） | — | — |
| 健康检查（新会话） | — | agy / grok 最小请求 | — | — | agy 400 FAILED_PRECONDITION 地域错误（8 s）；grok OK（7 s） | — | Gemini 继续不可用，沿用 Grok |
| m2-t5 | vendor `session-runtime-events.test.ts` | grok-worker | 首轮 Grok Build（Grok 会话 6387ff44，只写 checkpoint 与 1 行 import）；续轮 Grok 402 Payment Required，外层 Claude 转发层自行完成任务主体 | unknown | 失败（越界且不合格） | — | 续轮违规：在外层仓库提交了手改的 `patches/opencode/0019-oco-runtime-view.patch`（b2e783d，未推送，主线程已 `reset` 撤回）；vendor 中 5 个用例未覆盖计划第 2/3/6 条、断言多为 `>0`，已丢弃；其报告与 checkpoint 两个证据文件已删除 |
| m2-t4-review | 只读（覆盖 cfded63、de22ac0） | general-purpose（sonnet，评审） | Claude Sonnet | unknown | 已返回：1 Important（自动 sync 上限按每次 effect 计而非总数，接受），Ready: No；cfded63 的 I1/I2/Minor 均确认已修；pin/unpin 已实现 | 账本 | 修复轮见 m2-t4-fix |
| m2-t4-fix | vendor `session-runtime-actions.ts`/`.test.ts`、`session-runtime.tsx` | 主线程 | Claude Opus 5.5 | — | 已返回（138/0、tsgo 0） | vendor 36e6fe9 | 两路均不可用（见下行）。修：自动 sync 按轮总上限 8（新单测：两次调用不超限）；展开时对失败的 sync 重试，自动 sync 不重试；sync 调用包 `untrack`；停止按钮需 `!!props.onStop`。记为限制：时钟偏差（Task 3 已记）；已结束子会话不 pin，缓存回收后生命周期回到“未知”（符合裁定 8）；回看中展开/打开按钮保留（导航，不属裁定 6 的操作） |
| 健康检查（m2-t5 续轮后复查） | — | agy / grok 最小请求 | — | — | agy 400 地域错误；grok `http_status: 402`（5 s） | — | 两条订阅路线均不可用 → 主线程接手 m2-t5、m2-t4-fix |
| m2-t5-main | vendor `session-runtime-events.test.ts` | 主线程 | Claude Opus 5.5 | — | 已返回（events 11/0；session 137/0；tsgo 0；4 处模型变异均使对应新用例失败：回看 attentionKnown、MessageAbortedError、子会话 busy、retry 状态） | vendor d47fabe | 两路均不可用 |
| m2-t7 | `tests/e2e/c5-runtime.mjs`、`docs/evidence/runtime-m2-e2e.md` | 主线程 | Claude Opus 5.5 | — | 已返回：c5-runtime en 16/16、zh 16/16，c4-trajectory 17/17 | docs/evidence/runtime-m2-e2e.md | 两路均不可用（Grok 402、Gemini 地域错误） |
| m2-t8 | `patches/opencode/0019-oco-runtime-view.patch` | 主线程 | Claude Opus 5.5 | — | 已返回：`git diff deb241e 36e6fe9 -- packages/app`，15 文件 +4120/−5，`diff --check` 干净；干净 `51ef4be` 上 0001→0019 依序 check+apply 19/19；`packages/app/src` 与 `test-browser` 与开发树 `diff -r` 一致；重放树 session 单测 138/0 | 同左 | 计划指定主线程 |
