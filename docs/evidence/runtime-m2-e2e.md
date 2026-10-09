# 运行视图 M2 E2E（c5-runtime 扩展，2026-10-03）

执行人：主线程（Grok 402 额度用尽、Gemini 400 地域错误，见 [账本](delegation-runtime-m2-2026-10-03.md)）。
vendor HEAD `36e6fe9`。webview 用 `bash scripts/build-webview.sh` 直接从 vendor 开发树构建，extension 用 `bun run build:extension` 构建，两者均退出 0。

## 环境与命令

- 独立服务：`OCO_E2E_MODEL=mock OCO_TEST_PORT=4617 OCO_MOCK_LLM_PORT=4618 bash scripts/test-server.sh`（OpenCode `~/.opencode/bin/opencode`，本地脚本化 mock LLM）。未使用 4517，也未碰用户的 VS Code。
- en：`OCO_TEST_URL=http://127.0.0.1:4617 OCO_E2E_MODEL=mock node tests/e2e/run.mjs c5-runtime`
- zh：同上，另加 `OCO_E2E_LOCALE=zh-cn`
- 回归：`… node tests/e2e/run.mjs c4-trajectory`
- 结束后 4617/4618 无监听，无遗留的 E2E VS Code 进程；4517 仍在监听（用户服务，未动）。

## 结果

| 套件 | 结果 | results.json |
| --- | --- | --- |
| c5-runtime（en） | PASS 16/16（M1 的 9 项 + M2 的 7 项） | `runs/20261003-101738-c5-runtime-f76f/results.json` |
| c5-runtime（zh-cn） | PASS 16/16 | `runs/20261003-101822-c5-runtime-026f/results.json` |
| c4-trajectory | PASS 17/17 | `runs/20261003-101853-c4-trajectory-96f5/results.json` |

关键观测值（en；zh 相同）：
- `perm-approve`：三个回复按钮 `always,once,reject`，观察到“处理中”，工具最终 `completed`。
- `perm-reject`：工具最终 `error`，错误为 “The user rejected permission…”。
- `stop`：观察到 `requested`（非必需项），最后一条消息为 `MessageAbortedError`，焦点为 `cancelled`。
- `retry`：页面内 50 ms 轮询，状态序列为 `idle → working → retrying+retry → working → idle`。
- `subagent`：task 行文字为 “Done / Subagent finished”（zh 为“已完成 / 子代理已结束”），两段同时出现。
- `replay-no-actions`：实时模式下有 3 个回复按钮；回看时回复、提问、停止按钮数都是 0；返回实时后回复和停止按钮都回来了。

模型仅为 mock，未跑真实模型。

## 每条断言能抓到的退化

| 检查 | 实现若退化为… | 会失败的断言 |
| --- | --- | --- |
| perm-approve | 回复按钮缺少一种，或点击没有走回复通道 | `approveKinds` 不等于三种；或 `/permission` 一直不为空，`approveCleared=false` |
| perm-approve | 回复用了错的 sessionID/requestID | 服务端拒绝回复，权限一直挂着，工具不会 `completed` |
| perm-reject | “拒绝”被当成“允许” | 工具状态是 `completed` 而不是 `error` |
| question-route | “去对话中回答”没有切到对话视图 | `runtimeLeft=false`，或提问 dock 不可见 |
| question-route | attention 没有随回复清掉（缓存旧列表） | `questionCleared=false` |
| stop | 停止按钮不渲染（例如 `onStop` 没传到宿主） | `stopShown=false` |
| stop | 停止没有真正中止，或“已取消”不是来自 `MessageAbortedError` | 焦点不是 `cancelled`，或没有 `data-oco-runtime-cancel="cancelled"` |
| retry | 模型丢掉 retry 状态，或倒计时不渲染 | 序列中没有 `retrying+retry` |
| retry | 重试后卡住不结束 | 序列最后一项不是 `idle`，或回复文本里没有标签 |
| subagent | 子代理行没有展开按钮，或 `aria-expanded` 不更新 | `toggleShown` / `expanded` 为 false |
| subagent | 展开面板不显示，或没有加载子会话数据 | `panelShown=false`，或生命周期一直不是 `done` |
| subagent | task 状态和子会话生命周期被合并成一段文字 | `rowText` 里缺少其中一段 |
| replay-no-actions | 回看时按钮只是禁用、没有移除，或 `actionsVisible` 读的是实时模式 | 回看时 `replayReplies`、`replayQuestions` 或 `replayStops` 大于 0 |
| replay-no-actions | 返回实时后按钮没有回来（处理中标记被回看清掉，I1 回归） | `backReplies=false` 或 `backStop=false` |

## 已知覆盖缺口（Task 9 不要当作已验证）

- `session-runtime.tsx` 里按轮重置的自动 sync 计数（`autoTurn`/`autoCount`）没有单测：`36e6fe9` 的单测只覆盖纯函数 `autoSyncTargets`。
- “展开时重试失败的 sync”（`failedChildren`）也没有单测。
- E2E 不覆盖一轮超过 8 个子代理的情况，也不覆盖 sync 失败。
- 时钟偏差：远程服务器时钟与本机不一致时，“已请求取消”可能提前消失。本轮在本机 mock 上运行，看不到这个问题。
