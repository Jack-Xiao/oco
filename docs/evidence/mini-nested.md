# Mac mini：嵌套子代理（孙会话）E2E（分支 mini/mini-nested）

## 环境
- `. ~/oco-bin/env.sh`（端口 4527/4528）；mock 模型；`bun run build` 在产品修复后重建。
- 事故：我误用 `pkill -f mock-llm.mjs`，终止了 4518 上 oco-card1 遗留的 mock（4517 的测试服务随后也已不在）。已 notify；本任务不依赖它们。

## 委派记录
- 任务主体由主线程直接完成：范围小、需要在同一套 mock / 套件 / 产品代码间反复迭代，未委派给 Grok/Gemini/子代理（例外：写入只有三个相关文件，调试循环依赖实时 E2E 结果）。

## mock 如何产生孙会话
- 内置子代理拒绝 `task`，且默认 `subagent_depth=1`。套件启动时向测试工作区（`.oco-test/workspace/.opencode/`，gitignored，结束时删除）写入 `agents/nested.md`（subagent，`task: allow`）和 `opencode.json`（`subagent_depth: 2`），再 `POST /instance/dispose`。
- `tests/e2e/lib/mock-llm.mjs`：`NESTED-L1-{SLOW|PERM|FAST}` → task(nested) → `NESTED-L2-*` → task(nested) → `NESTED-L3-*`（叶：SLOW=60 句；PERM=bash 等授权；FAST=一行）。

## 结果（mock）
| 套件 | 结果 | results.json |
| --- | --- | --- |
| c25-nested-subagents ×3 | 每次 PASS 6 / FAIL 0 | docs/evidence/runs/20261014-204917-c25-nested-subagents-fd6c/ ，…-ac2a/ ，…-632c/ （results.json） |
| c17-subagent-aggregate | PASS 5 / FAIL 0 | docs/evidence/runs/20261014-204135-c17-subagent-aggregate-c3cc/results.json |
| c23-subagent-pills | PASS 2 / FAIL 0 | docs/evidence/runs/20261014-204203-c23-subagent-pills-0b9c/results.json |
| c5-runtime | PASS 43 / FAIL 0 | docs/evidence/runs/20261014-204213-c5-runtime-1ec1/results.json |

c25 用例：tree-depth（服务端 root→child→grand）、sidebar-running（孙忙时根行徽标 running，`0/1` 只数直接子代理）、pills-running（标题行 pill running）、runtime-nested（运行视图：根 1 个 sub-cell → 进入子会话 → 子会话自己的 cell → 进入孙会话，面包屑 3 层 → 返回）、settled（结束后徽标 `1/1`、pill done）、perm-attention（孙会话等授权：徽标 attention、pill waiting；reject 后离开 waiting）。

## 产品缺陷与修复（1 轮）
- 缺陷：服务端把等授权的会话报告为 busy，而汇总优先级是 running > waiting，所以孙（或子）会话等授权时父会话徽标 / pill 永远是 running，attention / waiting 实际不可达（首次跑 perm-attention：badge running、attention=false、pill running）。
- 修复：waiting > running > error > done。`apps/extension/src/session-store.ts`（subagents）、vendor `session-child-pills.tsx`（补丁 0025 重新生成，`--add` 该文件，因为 0024 已被 0025 叠在其上）；单测 `tests/unit/session-store.test.ts` 更新（typecheck 0；unit 423 pass / 0 fail）；已重建后重跑 c25 / c17 / c23 / c5。
- 观察（未改）：徽标计数只数直接子代理（根 `0/1`，不含孙会话）；这是现有设计。

## NOT RUN
- 真实模型下的嵌套：NOT RUN（big-pickle 在本机 403，见 mini-card7）。
- 本轮无截图人工查看（按约定只读 results.json）。
