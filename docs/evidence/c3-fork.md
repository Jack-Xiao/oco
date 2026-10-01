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

## 按钮间距（2026-10-01）

- 现象：回复行 copy→fork 的视觉间距明显大于 fork→元信息文字。按用户截图测量：回复行约 44px 对 34px，用户消息行约 33px 对 43–45px（2x 截图像素）。
- 原因：两行的 `gap` 都是 10px，按钮都是 24px；图标字形宽约 14px，按钮里左右各约 5px 空白。图标与图标之间算两份空白，图标与文字之间只算一份。
- 修复（补丁 0011，message-part.css）：`user-message-meta-wrap` 加 `margin-inline-end: 5px`，`text-part-meta` 加 `margin-inline-start: 5px`。
- 结果（运行 20261001-002141-c3-fork-cb96，3/3）：回复行 44/43，用户消息行 44/43/45（2x 截图像素，放大裁图目测）。
- 回归：`p1b-narrow` 第 1 次 `layout-480` FAIL（frame widths 537,451,451；该套件历史上也出现过 layout 项失败），复跑 exit 0（20261001-002520-p1b-narrow-ad08）。均为 mock，测试服务在隔离端口 4527。

## 侧栏选中跟随 fork（2026-10-01）

- 现象：fork 后主面板已切到新会话，侧栏仍高亮原会话。
- 原因：侧栏是原生 TreeView，选中只跟随点击；面板自行切换（fork、新建、切标签）时没人同步。
- 修复：`SessionsView.setCurrent` 记录活动面板的会话，每次渲染后 `reveal(item, { select: true, focus: false })`（侧栏不可见时跳过，显示时补同步；fork 行尚未列出时由 session.created 的刷新重试）；补 `getParent`。`panels.ts` 在活动面板变化时也触发 `onChange`。`debugState` 增加 `visible`、`selected`。
- E2E（mock，测试服务 4527）：`c3-fork` 新增 `fork-sidebar-selection`，4/4（20261001-034012-c3-fork-7785）；`p1b-sidebar` 全部 PASS。typecheck、unit 164/164、build 通过。NOT RUN：真实模型、Remote。
