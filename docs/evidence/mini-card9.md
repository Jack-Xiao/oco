# mini-card9

范围: tests/e2e/c29-rewind.mjs + 本文件。开始: 2026-10-16 07:50:03
结束: 见提交时间。模式: mock（`scripts/test-server.sh`，OCO_E2E_MODEL=mock，`~/oco-bin/opencode`）。无 `timeout` 命令（macOS），改由工具层超时。

## 结论
上游「Revert message / 撤销此消息」按钮在嵌入模式存在，与 fork 按钮同在 `[data-slot="user-message-copy-wrapper"]`，同一行。

## c29-rewind（最终 run 20261015-235116-c29-rewind-bc7e，3/3 PASS）
| 用例 | 结果 | 关键 detail |
| --- | --- | --- |
| rewind-button | PASS | revert 按钮 count=1（可见）、fork 按钮 count=1；dockText "2 rolled back messages Reply with exactly…RW-1-…"；serverRevert == 首条用户消息 id（true）；composer 含 RW-1 文本 |
| rewind-row | PASS | revert box {x1019,y182,24×24}，fork box {x1053,y182,24×24}，dy=0 |
| rewind-restore | PASS | dock 展开后 2 个 Restore；点最后一个（RW-2）一次后 dock 消失、服务端 revert 清空、时间线 2 条用户消息（Restore 恢复全部回退消息） |

测试侧修复 1 轮：首个 run（20261015-235056）rewind-button FAIL，因 dock 是乐观渲染，立即读 `GET /session/:id` 时 revert 还为 null；改为轮询服务端 revert 后通过。非产品问题。

## 回归（mock）
c27-docks 2/2 PASS（todo-dock、revert-dock），c3-fork 4/4 PASS（run 20261015-235134 / 235153）。

## 委派记录
| task_id | 唯一写入范围 | requested_route | actual | 状态 | 结果路径 | 接手理由 |
| --- | --- | --- | --- | --- | --- | --- |
| card9-c29 | tests/e2e/c29-rewind.mjs, 本文件 | 本机 headless Claude 子进程（mini 执行机本身，无外部路线可用） | claude/sonnet | 验收通过 | docs/evidence/runs/20261015-235116-c29-rewind-bc7e | 本任务即 mini 上被派发的执行单元 |
