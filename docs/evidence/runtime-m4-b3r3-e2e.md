# 运行视图 E2E 套件适配与验证记录 (runtime-m4-b3r3-e2e)

## 任务范围
- 目标：适配 `tests/e2e/c5-runtime.mjs` 至运行视图新 UI，使用 mock 模型跑通英文与中文两轮 E2E 验证。
- 唯一写入范围：`tests/e2e/c5-runtime.mjs`，`docs/evidence/runtime-m4-b3r3-e2e.md`。
- 其他约束：只读其他文件，不修改 vendor/、scripts/、apps/，不修改全局配置，不执行 git commit/stash/checkout。

## 委派记录
- task_id: runtime-m4-b3r3-e2e
- 写入范围: `tests/e2e/c5-runtime.mjs`, `docs/evidence/runtime-m4-b3r3-e2e.md`
- requested_route: Gemini (agy)
- actual_provider/model: gemini-3.8-flash (High) / Antigravity
- 状态: 验收通过 (英文 37/37 PASS，中文 37/37 PASS，mock 服务已清理)

## 进展追踪 (Checkpoints)
- [x] Checkpoint 1: 初始化检查点与任务拆解 (Round 1)
- [x] Checkpoint 2: 查阅参考实现及全量旧选择器定位
  - 确认 attention-panel 已删除，授权/提问由底部原生 dock 承接（`[data-component="dock-prompt"][data-kind="..."]`）。
  - 确认顶栏徽标 `[data-oco-runtime-pending]` 计数与生命周期。
  - 确认停止按钮改为输入区 `[data-action="prompt-submit"]`（忙碌时为停止）。
  - 确认状态文本更新为 Standing by / 待命，回放显示 Then: / 当时。
  - 确认图例 5 项文字在宽屏可见，≤1360px 下仅第五项隐藏，前四项文字依然可见。
  - 确认拒绝授权时日志事件为 `tool.rejected`，文本包含 denied permission / 你已拒绝授权，且样式非红色失败。
- [x] Checkpoint 3: 修改 tests/e2e/c5-runtime.mjs 适配所有新 UI 规范
  - 更新 COPY 中 stateIdle: "Standing by" / "待命"。
  - 更新 idle-state 与 locale-copy 正则断言。
  - 更新 tool-turn 等待授权为 `[data-oco-runtime-pending]`。
  - 更新 perm-approve 与 reply-in-panel：断言 `[data-oco-runtime-pending]` 出现，点击 dock 批准按钮，断言徽标消失且服务端清空，treeReplies 为 0；补充匹配中英文按钮文案（允许一次/始终允许/拒绝）。
  - 更新 perm-reject：点击 dock 拒绝按钮，检查日志中 `tool.rejected` 包含 denied permission / 你已拒绝授权且非红色失败。
  - 更新 question-route：在 dock 中选择选项并提交，断言徽标消失且服务端清空。
  - 更新 stop：点击输入区停止按钮，断言会话离开 working 状态，`[data-oco-runtime-stop]` 不存在。
  - 更新 replay-no-actions：断言 `[data-oco-runtime-stop]` 不存在，回放中徽标与按钮隐藏，返回实时后恢复。
  - 更新 width-420, width-560, width-wide, width-1600：使用 dock 批准，断言 `[data-oco-runtime-stop]` 不存在且输入区停止按钮可见。
  - 更新 mechanism：断言主卡片首行仅含模型与请求，不含代理名与第 N 轮。
  - 更新 legend：使用 `allInnerTexts()` 并在 1000px 下断言前四项文字可见。
  - 更新 summary：断言时长存在、无请求数、无代理名。
- [x] Checkpoint 4: 启动隔离 mock 服务并运行英文 (en) 验证
  - 启动隔离端口服务：`OCO_TEST_PORT=4687 OCO_MOCK_LLM_PORT=4688 OCO_E2E_MODEL=mock bash scripts/test-server.sh`
  - 英文轮次结果：37/37 PASS
  - 报告路径：`docs/evidence/runs/20261004-141106-c5-runtime-0099/results.json`
- [x] Checkpoint 5: 运行中文 (zh-cn) 验证
  - 针对中文 dock 按钮文案 "始终允许" 与键盘 Escape 焦点对齐修复。
  - 中文轮次结果：37/37 PASS
  - 报告路径：`docs/evidence/runs/20261004-142624-c5-runtime-1048/results.json`
- [x] Checkpoint 6: 整理结果并清理后台服务
  - 终止后台进程 `task-177`，校验端口 4687 与 4688 均已释放。

## 验证结果汇总

| 语言 | 总用例数 | PASS | FAIL | results.json 路径 |
| --- | --- | --- | --- | --- |
| 英文 (en) | 37 | 37 | 0 | `docs/evidence/runs/20261004-141106-c5-runtime-0099/results.json` |
| 中文 (zh-cn) | 37 | 37 | 0 | `docs/evidence/runs/20261004-142624-c5-runtime-1048/results.json` |

所有 37 项 checks 全部 PASS，未留存遗留问题。
