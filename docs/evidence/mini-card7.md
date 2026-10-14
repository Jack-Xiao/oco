# Mac mini 卡 7 验收（分支 mini/card7）

## 环境（Step 0）
- 本机无 `opencode` 命令：用包装脚本 `~/oco-bin/opencode`（`bun run --conditions=browser vendor/opencode/packages/opencode/src/index.ts`，`--version` 报 `local`）。
- VS Code 可执行文件名是 `Electron`：`OCO_VSCODE_BIN=/Applications/Visual Studio Code.app/Contents/MacOS/Electron`。
- 4517/4518 被 14 小时前遗留的 oco-card1 测试服务占用（非本任务启动，未终止）；本任务改用 `OCO_TEST_PORT=4527 OCO_MOCK_LLM_PORT=4528 OCO_TEST_URL=http://127.0.0.1:4527`（`. ~/oco-bin/env.sh`）。
- 冒烟：c6-inbox PASS 5/0（overnight-20261014-233151）。

## 结果表
（随步骤更新）
