# 运行视图 M2 验收证据（补丁 0019 追加）

2026-10-03。范围：运行视图里需要用户处理的时刻，包括批准和拒绝权限、把提问转到对话里回答、停止、重试倒计时、子代理展开一层（含后台 task）、取消状态，以及回看时不提供任何操作。依据：[M2 计划](../superpowers/plans/2026-10-03-runtime-dashboard-m2.md)、[spec](../superpowers/specs/2026-10-02-runtime-dashboard-design.md)。

## 环境

- 上游 OpenCode `v1.18.33`（`51ef4be`），vendor 副本以 0001–0018 为基线（`deb241e`）。M1 结束于 `c861179`；M2 共 11 个提交（`c861179..474534a`）。补丁由 `git diff deb241e 474534a -- packages/app` 生成。
- Bun 1.3.10。E2E 使用 mock 模型（`OCO_E2E_MODEL=mock`），独立服务跑在 4617，mock LLM 跑在 4618，没有碰 4517 和用户的 VS Code。
- 委派与接手详见 [账本](delegation-runtime-m2-2026-10-03.md)。
  - Grok：完成 Task 1–4，之后余额用尽（402）。
  - Gemini：前期一直报地域错误（400）；用户固定台湾出口后，完成终审修复和 E2E 重跑。
  - 主线程：两条路线都不可用期间，接手 Task 5、Task 4 修复轮、Task 7 和 Task 8。
  - 评审：任务级评审用 Sonnet，整分支终审用 Opus。

## 结果

| 验收项 | 命令 / 证据 | 结果 |
|---|---|---|
| 单元：整个 session 目录 | `cd vendor/opencode/packages/app && bun test --conditions=solid --preload ./happydom.ts ./src/components/session` | PASS 147 / 0 fail（M1 结束时为 90） |
| 单元：事件级（真实 reducer），M2 新增 6 个用例 | 同上，`session-runtime-events.test.ts` | PASS 11 / 0。新增用例是否有效，用 4 处临时改坏模型验证，每处都有对应用例失败：回看 `attentionKnown`、`MessageAbortedError`、子会话 busy、retry 状态 |
| 类型：vendor `tsgo -b` | `bun run typecheck` | PASS 0 错误 |
| 仓库根离线验证 | `bun run verify:brief` | PASS：typecheck 0 错误，unit 188/188 |
| 补丁：在干净 `51ef4be` 上依序 `git apply --check` 并应用 0001→0019 | 新克隆依序重放 | PASS 19/19。`packages/app/src` 和 `test-browser` 与开发树 `diff -r` 一致；重放树 session 单测 147/0。0019 共 15 个文件，+4258/−5，`diff --check` 干净 |
| E2E `c5-runtime` 英文（终审修复后） | `runs/20261003-104950-c5-runtime-13de/results.json` | PASS 16/16（M1 的 9 项 + M2 的 7 项） |
| E2E `c5-runtime` 中文（`OCO_E2E_LOCALE=zh-cn`） | `runs/20261003-105051-c5-runtime-c189/results.json` | PASS 16/16 |
| E2E 回归 `c4-trajectory` | `runs/20261003-105145-c4-trajectory-fd3d/results.json` | PASS 17/17 |

上表 E2E 的 3 份 results.json 由主线程逐份读过，状态计数分别为 16、16、17 个 PASS。终审修复前的一轮 E2E 结果相同（en/zh 各 16/16，c4 17/17），见 [E2E 证据](runtime-m2-e2e.md)。那份证据还写了每条断言能抓到哪种退化；重跑记录见 [rerun](runtime-m2-e2e-rerun.md)。运行目录被 gitignore，没有提交，和 M1 一样。

## 评审与修复（摘要）

- Task 1–4 各做一次任务级评审，提出的 Important 均已修复：
  - 工具取消只认工具自身的中止信号。
  - 子会话 7 种状态都映射到生命周期。
  - “处理中”和“已请求取消”只读实时数据。
  - 自动同步改为每轮最多 8 个。
- 整分支终审（Opus，`c861179..36e6fe9`）：0 Critical、1 Important、4 Minor。全部在 `aafff9c` 处理（M4 改的是计划文字，不改代码）：
  - Important：pin effect 通过 `touch()` 追踪整个 store，重跑时会先全部 unpin，已展开子会话可能被驱逐，而且之后不会再拉取。现在 pin 改为增量、`untrack`，组件级 `onCleanup` 统一 unpin；数据不在缓存时再展开会重新 sync。
  - Minor 1：停止按钮要求根会话 busy 才显示。
  - Minor 2：停止失败时弹出报错，并清掉“已请求取消”。
  - Minor 3：同一子会话只在最后一个 task 行显示展开按钮。
  - Minor 4：计划里 `RuntimeTool.cancelled` 的定义改成与实现一致。
- 主线程对 Gemini 提交 `aafff9c` 复跑测试并读过 diff。另补一个提交 `474534a`，删除两个文件末尾多余的空行。

## NOT RUN / 已知限制（不得算通过）

- 未验证的环境：真实模型（本轮全部是 mock）、Remote 环境（例如 gcp-workstation）、真实大会话性能。
- 本地与远程服务器时钟不一致时，“已请求取消”可能立刻消失，也可能一直显示到会话空闲。
- 运行视图的停止不清空待办，也不撤销排队中尚未发出的消息。
- 已结束的子会话不 pin，被缓存回收后，折叠状态下生命周期会回到“未知”；展开后会重新拉取。
- 回看时“展开”和“在对话中打开”按钮仍然显示。它们是导航，不属于裁定 6 所说的操作。
- 覆盖缺口：
  - `session-runtime.tsx` 里按轮重置的自动同步计数（`autoTurn`/`autoCount`）、展开时重试失败同步、缓存驱逐后重新拉取，这三条路径只有纯函数单测。
  - E2E 不覆盖一轮超过 8 个子代理，也不覆盖同步失败。
  - 停止失败时的报错提示没有 E2E。
- 尚未推送或部署。gcp-workstation 上的效果为 NOT RUN。
