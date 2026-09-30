# 消息 fork 按钮（补丁 0011）证据

- 基线：`d3ec2e9` + 本批改动；上游 `51ef4be`；测试服务脚本模型（mock）。
- 服务端语义：`Session.fork` 复制 `messageID` 之前（不含）的消息；不传则全部复制（vendor/opencode/packages/opencode/src/session/session.ts `fork`）。
- 用户消息 fork：切点 = 该用户消息，原文经 `prompt.set` 回填新会话输入框。
- 助手回复 fork：切点 = 该回复之后第一条用户消息；没有则不传 `messageID`。
- 面板：新会话路由经 chat-webview 路由守卫变为宿主 `openSession`，主面板原地切换（面板数保持 1）。

## E2E `c3-fork`（首轮运行 20260930-155307-c3-fork-b400；图标最终版复跑 20260930-161921-c3-fork-25f3，同样 3/3）

| 项 | 结果 | 要点 |
|---|---|---|
| fork-user | PASS | 新会话 = [user FORK-1, assistant]；输入框含 FORK-2；面板 1 个；原会话 4 条不变 |
| fork-response-mid | PASS | 新会话 = [user FORK-1, assistant]；输入框空 |
| fork-response-last | PASS | 新会话 4 条，与原会话一致 |

图标：自绘 `oco-fork`（横线分叉，两支都带箭头），加在 ui 的 v1 与 v2 图标集，随补丁 0011。

截图：`runs/20260930-161921-c3-fork-25f3/1-hover-user.png`（Revert / Fork / Copy）、`2-hover-response-mid.png`（Copy / Fork）。

同批回归（mock）：p1a-chat、c1-open-file、c2-diff-unavailable、p1b-main-panel exit 0。

限制：只复制对话，不回滚工作区文件（与 `/fork` 一致）。NOT RUN：真实模型、全量 E2E。
