# 运行视图 M2 E2E 重跑结果（vendor aafff9c / 474534a 修复后）

## 1. vendor HEAD

- vendor HEAD: `474534a679cd15d988084cbf384d162cafb92d79` (`474534a`)
- Commit 信息: `style(runtime): drop trailing blank lines`
- 说明: 直接 parent 即为目标修复提交 `aafff9c1e55682bdc33586d76d2a403b383ea5f9` (`aafff9c`)，包含停止按钮改为根会话 busy 时显示的完整逻辑与单测（`actionsVisible` 包含 `busy` 判断，`lastChildToolIds` 与 `pinDiff` 均生效）。

## 2. 构建结果

- `bash scripts/build-webview.sh`: 退出码 0（耗时 12.25s）
- `bun run build:extension`: 退出码 0（esbuild 打包完成，dist/extension.js 123.9kb）

## 3. 测试运行统计与 results.json 路径

| 测试套件 | 语言环境 | 结果 | results.json 相对路径 |
| --- | --- | --- | --- |
| c5-runtime | en (default) | 16 PASS / 0 FAIL | `docs/evidence/runs/20261003-104950-c5-runtime-13de/results.json` |
| c5-runtime | zh-cn | 16 PASS / 0 FAIL | `docs/evidence/runs/20261003-105051-c5-runtime-c189/results.json` |
| c4-trajectory | en (default) | 17 PASS / 0 FAIL | `docs/evidence/runs/20261003-105145-c4-trajectory-fd3d/results.json` |

三个套件合计：49/49 PASS，0 FAIL。

## 4. 关键用例 detail JSON（原样一行）

### c5-runtime (en)
- stop: `{"stopShown":true,"stopRequestedSeen":true,"stopCancelled":true,"lastError":"MessageAbortedError","focus":"cancelled"}`
- replay-no-actions: `{"replayAsked":true,"liveReplies":3,"inReplay":true,"replayReplies":0,"replayQuestions":0,"replayStops":0,"backReplies":true,"backStop":true}`

### c5-runtime (zh-cn)
- stop: `{"stopShown":true,"stopRequestedSeen":true,"stopCancelled":true,"lastError":"MessageAbortedError","focus":"cancelled"}`
- replay-no-actions: `{"replayAsked":true,"liveReplies":3,"inReplay":true,"replayReplies":0,"replayQuestions":0,"replayStops":0,"backReplies":true,"backStop":true}`

## 5. 端口与进程清理结果

- 启动的服务进程：
  - 端口 4618: mock-llm (node, PID 44379)
  - 端口 4617: opencode serve (PID 44381)
- 终止操作：`kill 44379 44381`
- 清理验证：
  - `lsof -nP -iTCP:4617 -iTCP:4618 -sTCP:LISTEN` -> 退出码 1（无监听）
  - `lsof -nP -iTCP:4517 -sTCP:LISTEN` -> 退出码 0，用户进程 PID 40872 仍在监听且未受任何影响
