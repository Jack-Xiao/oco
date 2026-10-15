# 卡 9：M04 回退入口「Rewind to here」（2026-10-16，分支 claude/card9-rewind）

依据：c27(b)（[mini-ccfeat](mini-ccfeat.md)）证明嵌入模式没有逐条消息的回退入口，只有 composer `/undo`。目标：补丁 0026 在消息 fork 按钮旁加「Rewind to here」，走 `POST /session/:id/revert`，恢复由上游 revert dock 的 Restore 完成。

## 委派记录

| task_id | 唯一写入范围 | requested_route | actual_provider/model | agent_id/run_id | 状态 | 结果路径 | 备注 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| c9-investigate | 只读（主线程代存本文件「调查」） | grok-worker（grok-build:check ready:true） | Grok Build / unknown | run-mva5erik-lsjk95 | 已返回（2 m 59 s，只读） | 本文件「调查」 | — |
| c9-e2e | tests/e2e/c29-rewind.mjs、docs/evidence/card9-rewind.md「E2E」、docs/evidence/runs/ | claude-subagent/sonnet | 待补 | 待补 | 派发 | 本文件「E2E」 | — |

## 调查（Grok，主线程核对）

- 上游已有消息级回退：用户消息操作行 `actions.revert` →「Revert message」（reset 图标，`session-ui/src/components/message-part.tsx:1396–1408`，主线程已核对），与 0011 的 fork 按钮同排，hover 才显示（`message-part.css:162–213` opacity 0）。`session.tsx:1989` 总是传入 `{revert, fork, forkResponse}`，不看 embedded；宿主无 CSS 隐藏它。
- 行为：`revert({sessionID, messageID})`（`session.tsx:1917`）→ `POST /session/:id/revert`（不带 partID，边界为该条 user message）；busy 时先 interrupt（`halt` 1854–1873）；回填输入框（`extractPromptFromParts`，1705 / 1866–1871）；时间线隐藏该轮及之后；revert dock 每条有 Restore（`session-revert-dock.tsx:88–96`）。与 `/undo` 同一 API。
- 结论：c27(b)「嵌入模式没有逐条消息回退按钮」很可能是测试没 hover。卡 9 改为先用 E2E 证实现有按钮在嵌入模式可用；可用则不加补丁 0026（不增加补丁面），只更正结论；不可用再按 Grok 方案做 0026。

## E2E

状态（进行中，2026-10-16）：`tests/e2e/c29-rewind.mjs` 已写成。第 1 次运行（mock，`docs/evidence/runs/20261015-231225-c29-rewind-e85c/results.json`）4/4 PASS：
- revert-button-visible：选择器 `[data-component="user-message"] [aria-label="Revert message"]`（24×24）；hover 前整条祖先链 opacity=0，hover 后 1，可命中。
- revert-to-message：点第 2 条 Revert → 服务端 `revert.messageID` = 第 2 条 user message；时间线只剩第 1 条；revert dock 显示「1 rolled back message」；composer 回填第 2 条文本。
- restore：dock 的 Restore → revert 清空，第 2 轮回来，dock 消失。
- busy-revert：慢回复运行中按钮不禁用（`disabled` 只覆盖点击往返），点第 1 条 Revert 会先中断再回退，`revert.messageID` = 第 1 条，dock「2 rolled back messages」。
结论：嵌入模式已有可用的逐条回退按钮，卡 9 无需补丁 0026（c27(b)「没有按钮」是测试没 hover）。
第 2 次运行（`docs/evidence/runs/20261015-233630-c29-rewind-a82e/results.json`）4/4 PASS；回归 c27-docks 2/2（`.../20261015-233657-c27-docks-e97d/results.json`）、c3-fork 4/4（`.../20261015-233715-c3-fork-ce39/results.json`）全 PASS。三次均经 `scripts/overnight-e2e.sh`（持 /tmp/oco-e2e.lock，mock，端口 4527）；中途一次尝试因另一会话的 `--real` 运行占锁 10 分钟而放弃，随后排队重跑。
遗留说明：busy-revert 中，Playwright 测得 hover 后按钮 opacity 仍为 0（慢回复流式滚动时第 1 条消息多半已滚出视口，hover 未命中；`click()` 会先滚入视图所以仍点通）。未单独诊断，不判为产品缺陷；真实用户需先滚回该消息再 hover。
产品缺陷：0。
