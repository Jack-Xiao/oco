# Mac mini 卡 7 验收（分支 mini/card7）

## 环境
- 本机无 `opencode` 命令：用包装脚本 `~/oco-bin/opencode`（`bun run --conditions=browser vendor/opencode/packages/opencode/src/index.ts`，`--version` 报 `local`）。
- VS Code 可执行文件名是 `Electron`：`OCO_VSCODE_BIN=/Applications/Visual Studio Code.app/Contents/MacOS/Electron`。
- 4517/4518 被 14 小时前遗留的 oco-card1 测试服务占用（非本任务启动，未终止）；本任务用 `OCO_TEST_PORT=4527 OCO_MOCK_LLM_PORT=4528 OCO_TEST_URL=http://127.0.0.1:4527`（`~/oco-bin/env.sh`）。
- Mac mini 屏幕小，VS Code 窗口高度约 808 px，运行视图舞台 < 560 px 会触发窄布局的「矮舞台」。

## 委派记录
- 7 个 Sonnet 子代理（c18–c24）写了套件文件但没有回报、也未留下通过的结果；主线程接手补跑与修复。理由：子代理无回报且已不存活（ListAgents 看不到）。requested_route=claude-subagent/sonnet；状态=失败（无回报）。

## 结果（最终全量 mock，docs/evidence/runs/overnight-20261015-032859/summary.md；21 套件 0 失败）
| 套件 | 结果 | results.json |
| --- | --- | --- |
| c6-inbox | PASS 5 / FAIL 0 | docs/evidence/runs/20261014-192901-c6-inbox-660c/results.json |
| c10-sidebar-answer | PASS 6 / FAIL 0 | docs/evidence/runs/20261014-192909-c10-sidebar-answer-9c39/results.json |
| c11-sidebar-organize | PASS 6 / FAIL 0 | docs/evidence/runs/20261014-192917-c11-sidebar-organize-8a4f/results.json |
| c12-new-session-draft | PASS 13 / FAIL 0 | docs/evidence/runs/20261014-192934-c12-new-session-draft-941c/results.json |
| c13-worktree-inbox | PASS 6 / FAIL 0 | docs/evidence/runs/20261014-193006-c13-worktree-inbox-500e/results.json |
| c14-review-notes | PASS 6 / FAIL 0 | docs/evidence/runs/20261014-193021-c14-review-notes-b5d8/results.json |
| c15-fix-with-opencode | PASS 5 / FAIL 0 | docs/evidence/runs/20261014-193141-c15-fix-with-opencode-e7cc/results.json |
| c16-sidebar-stop | PASS 5 / FAIL 0 | docs/evidence/runs/20261014-193235-c16-sidebar-stop-81ec/results.json |
| c17-subagent-aggregate | PASS 5 / FAIL 0 | docs/evidence/runs/20261014-193259-c17-subagent-aggregate-5f42/results.json |
| c18-permission-note | PASS 2 / FAIL 0 | docs/evidence/runs/20261014-193327-c18-permission-note-98e6/results.json |
| c19-label-snooze | PASS 5 / FAIL 0 | docs/evidence/runs/20261014-193333-c19-label-snooze-246f/results.json |
| c20-inbox-nav | PASS 5 / FAIL 0 | docs/evidence/runs/20261014-193356-c20-inbox-nav-75c9/results.json |
| c21-follow | PASS 3 / FAIL 0 | docs/evidence/runs/20261014-193405-c21-follow-a1d5/results.json |
| c22-review-threads | PASS 2 / FAIL 0 | docs/evidence/runs/20261014-193418-c22-review-threads-4b48/results.json |
| c23-subagent-pills | PASS 2 / FAIL 0 | docs/evidence/runs/20261014-193531-c23-subagent-pills-0573/results.json |
| c24-runtime-question | PASS 3 / FAIL 0 | docs/evidence/runs/20261014-193541-c24-runtime-question-dead/results.json |
| p1b-sidebar | PASS 13 / FAIL 0 | docs/evidence/runs/20261014-193552-p1b-sidebar-9739/results.json |
| p1b-narrow | PASS 12 / FAIL 0 | docs/evidence/runs/20261014-193639-p1b-narrow-0456/results.json |
| c5-runtime | PASS 43 / FAIL 0 | docs/evidence/runs/20261014-193840-c5-runtime-3d11/results.json |
| c4-trajectory | PASS 17 / FAIL 0 | docs/evidence/runs/20261014-194129-c4-trajectory-2ce7/results.json |
| visual-light-sidebar | PASS 1 / FAIL 0 | docs/evidence/runs/20261014-194159-visual-light-sidebar-cfff/results.json |

- 竞态循环：`--loop 10 p1b-narrow` 第一轮 6/10 通过，4 次失败全是测试侧 `electronApplication.evaluate: Execution context was destroyed`（fitGroups 在窗口导航时求值），不是「新面板未出现」；给 fitGroups 加重试后再跑 **10/10 通过**（overnight-20261015-015316）。结论：未复现产品侧竞态。
- 真实模型 `c4-trajectory c5-runtime --real`：**BLOCKED**。服务端对 `opencode/big-pickle` 返回 HTTP 403「OpenCode's free tier can only be used from within OpenCode」（本机源码构建的服务不被免费档接受）。运行证据 overnight-20261015-021709（assistant 全部 Error）；不能算产品失败，也不能算通过。已 notify。

## 修了什么
测试侧：
- `tests/e2e/vscode.mjs`：命令面板新版 VS Code 按字母序列出模糊匹配，焦点行不是目标命令时点击精确行（否则 Enter）；`fitGroups` 的 `app.evaluate` 重试。这是 c12/c14/c17 等所有 `Open Session` 套件在 Mac mini 上全挂的根因。
- c19：label 分组后的普通行没有自己的分区头，按分组计数判断归属。c20：按键前等待稳定、`?` 用 type。c21：用活动编辑器组判断焦点、预览判定加 italic。c12：第二个面板前等 2.5 s。c14：选区没生效时重试。c5：窗口放大并缩放 0.75（矮舞台）、提问卡改读整卡文本（P1-2 新设计）。

产品侧（2 处，均补单测、typecheck 0、unit 423/0、已重建）：
1. `apps/extension/src/follow-mode.ts`：Follow 在写工具刚宣布路径、文件还没落盘时打开失败，之后被 750 ms 节流挡住，文件从不打开。失败后清节流，下一次更新重试（单测 `a failed open ...`）。
2. 补丁 0025 `session-runtime-ring-geo.ts`：窄且矮的舞台 `toolCap = 0`，`packetsAt` 用 `rows[-1]` 抛 `TypeError`，整个聊天面板进入「聊天面板出错」恢复页。`toolCap < 1` 时跳过工具包（vendor 单测 6b；已 `regen-patch.sh 0025`）。另：`recovery.tsx` 的错误日志带上 stack。

## 产品缺陷与观察（待用户决定）
1. 上面两处已修。
2. 矮舞台（< 560 px，小屏或带权限面板时）窄布局 `toolCap` 只有 1，多个工具时 `shown = slice(0, cap-1)` 为空，只剩「+N」，工具行完全看不到（小窗下 c5 tool-fail / same-command 会失败）。本批未改（设计取舍）；测试用放大窗口规避。
3. 窄布局标签分组后，未标签的普通行紧跟最后一个标签头，没有自己的分区头，视觉上像属于该标签。
4. c15（语言服务就绪时间）、c5 think-card（舞台高度 776→771→836 抖动）各偶发失败一次，重跑通过；未定位到产品原因。

## 需要用户决定
- 真实模型凭据 / 用官方 OpenCode 二进制重跑 c4 / c5 `--real`。
- 上面第 2、3 条是否要改。
- 4517/4518 上遗留的 oco-card1 测试服务（14 h）是否可以终止。

## 目视清单（`docs/evidence/runs/overnight-card7-visual/visual/`，全部 mock 模型）
- 01-inbox-permissions.png — 收件箱 3 条权限行
- 02-inbox-worktree-rows.png — 收件箱里两条 worktree 会话
- 03-sidebar-stop-hover.png — 悬停运行行的 ■ 停止
- 04-stop-all-dialog.png — 全部停止确认框
- 05-sidebar-inline-answer.png — 侧栏就地作答
- 06-review-notes-badge.png — 审阅意见徽标
- 07-review-comment-thread.png — 编辑器评论线程
- 08-fix-with-opencode-menu.png — Quick Fix 里的 Fix with OpenCode
- 09-fix-with-opencode-draft.png — Fix 后写入的草稿
- 10-subagent-badge.png — 侧栏子代理徽标（运行中）
- 11-title-row-pills.png — 面板标题行 pills
- 12-always-preview.png — Always 预览文字
- 13-deny-with-note.png — Deny with note 表单
- 14-label-section.png — 标签分区
- 15-snoozed-section.png — Snooze 分区
- 16-runtime-ask-card.png — 运行视图提问态（环心卡片）
- 17-runtime-narrow-320.png — 运行视图 320 px 窄布局（非提问态）
- 18-light-theme-sidebar.png — 亮色主题下侧栏分区与选择栏
- 缺：通知（toast）无单独截图（NOT RUN）；真实模型下的目视全部 BLOCKED。
