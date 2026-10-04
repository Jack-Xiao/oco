# 运行视图 M4 委派记录

设计：[runtime-m4](../design/runtime-m4.md)。分支 `claude/nostalgic-gates-ef74ca`。

## 路线检查（2026-10-04）

- Grok：`grok-bridge.mjs check --json` → ready，grok 1.0.34，已登录 grok.com（models-probe 验证）。
- Gemini：gemini-worker 最小请求 → 4 s 返回 OK，自报 Gemini 3.8 Flash (High)；工具头 model 记 unknown，job `gem-mut6eqfj-o6d55`。

- 2026-10-04 第二批前重查：Gemini OK（job `gem-mut7jr96-nsx2r`，自报 Gemini 3.8 Flash）；Grok 未重查（同日 402，额度未恢复前不用）。

## 任务

| task_id | 内容 | 唯一写入范围 | requested_route | actual_provider/model | agent_id/run_id | 状态 | 结果 | 备注 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| m4-main-b1 | 第一批 vendor 实现：回放播放、日志精简与浮层、思考框字号、i18n | `vendor/opencode/packages/app/src/components/session/session-runtime*.ts(x)` | 主线程 | Claude | — | 验收通过 | [runtime-m4-batch1](runtime-m4-batch1.md) | 上游补丁与同文件集成，按 AGENTS 由主线程负责 |
| m4-e2e-b1 | c5-runtime 新增断言 + 运行 E2E / look-runtime / 干净重放 | `tests/e2e/c5-runtime.mjs` | 主线程 | Claude | — | 验收通过 | 同上 | 接手理由：Grok 402 额度耗尽，Gemini 本批两次 EOF；未再重试同一路由 |
| m4-bg-map | 只读调查：后台任务 `task_id` 能否对上子会话 | `docs/evidence/runtime-m4-bg-task-mapping.md` | grok-worker | Grok Build / unknown | Grok session f7c47acf | 失败 | — | 402 Payment Required：Grok Build usage balance exhausted（首轮即失败） |
| m4-bg-map-r2 | 同上（换路由） | 同上 | gemini-worker | Gemini (Antigravity) / unknown | unknown | 失败 | — | Eligibility check failed: POST loadCodeAssist EOF（首轮即失败） |
| m4-bg-map-main | 同上（主线程接手） | 同上 | 主线程 | Claude | — | 已返回 | [runtime-m4-bg-task-mapping](runtime-m4-bg-task-mapping.md) | 接手理由：两条订阅路线均失败（Grok 402、Gemini EOF） |
| m4-playback-test | `session-runtime-playback.ts` 单元测试 | `…/session/session-runtime-playback.test.ts` | gemini-worker | Gemini (Antigravity) / unknown | unknown | 失败 | — | 同一 EOF；Grok 已 402，未再试；主线程接手 |

## 第二批（2026-10-04）

- 路线检查：Gemini OK（job `gem-mut7p5qs-i5prq`，4 s，自报 Gemini 3.8 Flash）；Grok 同日 402，未重查。

| task_id | 内容 | 唯一写入范围 | requested_route | actual_provider/model | agent_id/run_id | 状态 | 结果 | 备注 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| m4b2-fixture | E2E 后台派发夹具：测试插件 + mock 提示词 + 自检 | `tests/e2e/lib/bg-task-plugin.mjs`、`tests/e2e/lib/mock-llm.mjs`、`scripts/test-server.mock.opencode.json`、`docs/evidence/runtime-m4-b2-fixture.md` | gemini-worker | Gemini (Antigravity) / unknown | unknown | 失败（产物可用） | [runtime-m4-b2-fixture](runtime-m4-b2-fixture.md) | 运行 828 s 后工具返回 `{"status":"ERROR"}`，没有报告；但证据文件记录了三种形状的 API 核对，产物已落盘。主线程审阅后修两处：zod 改从 vendor 插件包的符号链接导入（原为写死版本的 `.bun` 路径）；配置里的绝对路径改为 `__OCO_ROOT__`，由 `test-server.sh` / `managed-opencode.sh` 的 sed 替换（根脚本，属集成人范围）。`background_output` 输出改为以 `Task Result` 开头。 |
| m4b2-loop-test | `session-runtime-loop.ts` 与模型后台映射单测 | `…/session/session-runtime-loop.test.ts`、`…/session/session-runtime-model-bg.test.ts` | gemini-worker | Gemini (Antigravity) / unknown | job `gem-mut80511-tzn97` | 验收通过 | [runtime-m4-b2-unit](runtime-m4-b2-unit.md) | 新增 49 条；发现 2 个缺陷（遗留 `background:true` 误填 result；汇总 RETRYING 未清除），主线程已修，记录行为的那条测试改为断言修复后行为 |
| m4b2-main | 模型改动、航道视图、配色、i18n、补丁 0019 重新生成 | `vendor/opencode/packages/app/src/components/session/session-runtime*.ts(x)`（除上面的单测）、`patches/opencode/0019-*` | 主线程 | Claude | — | 验收通过 | [runtime-m4-batch2](runtime-m4-batch2.md) | 上游补丁与同文件集成，按 AGENTS 由主线程负责 |
| m4b2-e2e | c5-runtime 航道断言改写 + 运行 | `tests/e2e/c5-runtime.mjs`、`docs/evidence/runtime-m4-b2-e2e.md` | gemini-worker | Gemini (Antigravity) → 自动换 Grok Build / unknown | Grok session 7edb1fb1 | 失败 | [runtime-m4-b2-e2e](runtime-m4-b2-e2e.md)（只有改写记录，停在「Launching English run」） | 运行约 2 h 9 min（74 次工具调用）后由 worker 转到 Grok，Grok 402 额度耗尽；c5-runtime.mjs 已改写但未见 en/zh 运行结果。期间本会话应用户要求重建并安装了 vsix，结果本就需在新构建复跑 |

### 2026-10-04 用户反馈修正（轮次 / 作业区尺寸 / 待执行停留 / full_session 取回）

| task_id | 范围 | 唯一写入范围 | requested_route | actual_provider/model | agent_id/run_id | 状态 | 结果 | 说明 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| m4fb-main | `loopOf` 轮次与沿用探针、`loopGeometry` 作业区、待执行停留、主框文案、`full_session` 取回识别 | `session-runtime-{loop,loop-view,mechanism-view,model,i18n}.ts(x)` | 主线程 | — | — | 已返回 | runtime-m4-batch2.md checkpoint | 同文件集成（公共投影 + 视图），不可分割 |
| m4fb-unit | 上述改动的单测 | `session-runtime-loop.test.ts`、`session-runtime-model-bg.test.ts` | gemini-worker | 经 Grok Build 转发，HTTP 402 | Grok session bef7fd98 | 失败 → 主线程完成 | 单测 267/0 | Gemini 路线实际走 Grok 转发，402 余额耗尽；Grok 直连同一额度，同批不可用 → 主线程接手 |

### 2026-10-04 第二批收尾（主线程）

| task_id | 内容 | 唯一写入范围 | requested_route | actual_provider/model | agent_id/run_id | 状态 | 结果 | 备注 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| m4b2-e2e-main | c5-runtime 运行、失败诊断与修复（含两处视图缺陷） | `tests/e2e/c5-runtime.mjs`、`…/session-runtime-loop-view.tsx`、`…/session-runtime-child-sync.ts`、`…/session-runtime.tsx` | 主线程 | Claude | — | 验收通过 | [runtime-m4-batch2](runtime-m4-batch2.md) | 接手理由：m4b2-e2e 两条订阅路线均失败（Gemini 运行约 2 h 后转 Grok，Grok 402） |
