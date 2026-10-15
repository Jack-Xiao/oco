# Claude Code 新特性对照批次（2026-10-16 夜间，分支 claude/cc-features-2026-10-16）

用户要求（2026-10-15 夜）：1) 卡 6 分支合入 main 并推送，Mac mini 拉取最新；2) 从规划挑重要项做计划；3) 评估 Claude Code 新版本里适合 oco 的特性并加进来，与 Mac mini 分工，注意 token 与时间；4) 无人值守：权限卡住就绕开或跳过。

## 已做（主线程）

- main ← claude/roadmap-batch-2026-10-14：合并提交 `3f89430`（--no-ff），已推送 origin。mini/card7、mini/mini-nested 均已包含在内。
- Mac mini：`~/Ai-Project/oco` main `3f89430`；`~/Ai-Project/oco-mini`（oco 的 worktree）切到 `mini/main` = `3f89430`。
- 未合入、待用户处理的旧分支：`claude/roadmap-batch-2026-10-11`（1 个提交 1b2281b，内容疑似已以别的提交进 main）、`feat/webview-session-list`（内容已在 main，可删）、`claude/opencode-1.18.13-baseline`（停放）、`claude/nostalgic-gates-ef74ca`（运行视图特性分支，按用户要求不进 main）。
- vendor 1.18.33 核对：上游 app 已自带 revert dock（`session-revert-dock.tsx`，`session.revert.*` 事件）与 todo dock（`session-todo-dock.tsx`）、slash 命令浮层（`slash-popover.tsx`）；宿主已有 `oco.addTerminalOutputToDraft / addProblemToDraft / addGitDiffToDraft / addSelectionToDraft`、`oco.openSessionInNewPanel`、`oco.compactSession`、`oco.renameSession`。

## 委派记录

| task_id | 唯一写入范围 | requested_route | actual_provider/model | agent_id/run_id | 状态 | 结果路径 | fallback_reason / 接手理由 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| cc-changelog | 只读（报告由主线程存入本文件） | grok-worker（grok-build check ready:true） | unknown | 待补 | 运行中 | 本文件「Claude Code 2.1.280–2.1.300 变更摘要」 | — |
| mini-regress | docs/evidence/mini-regress-main.md、docs/evidence/runs/、tests/e2e/ | Mac mini dispatch（base main 3f89430） | — | — | 失败：dispatch 报 tmux server cannot read the keychain | — | mini 无 GUI tmux 服务器；按 mac-mini skill 排障（见下） |
| impl-export-hud | apps/extension/src/{export-session,status-hud,extension,sessions-view,sessions-webview,session-store,panels}.ts、apps/extension/package.json、tests/unit/{export-session,status-hud,settings-contribution}.test.ts | 待定：Gemini 探测 10 s 未返回（未确认） | unknown | 待补 | 计划 | — | — |

更新：Gemini 探测（`grok-subagent.mjs start --provider gemini`，最小请求）返回 SUCCESS「OK」，6.1 s；impl-export-hud 按规则派 gemini-worker（--write）。

## Claude Code 2.1.x（桌面 Code 页 + CLI）特性 → oco 对照

依据：本会话运行环境里可见的 Claude Code 2.1.300 能力（任务列表、收尾框、章节目录、关联会话卡、分屏、侧栏分组、PR 自动修复、Remote Control、定时任务、Artifacts、浏览器面板等）与 vendor 1.18.33 / 宿主源码核对；更新日志摘要见下一节。

| Claude Code 特性 | oco 现状（核对位置） | 决定 |
| --- | --- | --- |
| 最新消息下方固定任务列表（update_plan） | 上游 composer 区已有 todo dock（`session-todo-dock.tsx`，「x of y todos completed」）；侧栏 M02 todo 进度 | 已有；嵌入模式可见性交 Mac mini E2E 验证（c27） |
| 回退到检查点（Esc Esc rewind，恢复代码 + 对话） | 上游有 revert dock（`session-revert-dock.tsx`）与 `POST /session/:id/revert|unrevert`；`session.tsx` 1870–1908 roll() | 已有上游能力；嵌入模式的逐条消息入口待 E2E 核实（c26），缺则补丁 0026 在 fork 按钮旁加「Rewind to here」= 卡 9（M04） |
| 状态栏 status line / claude-hud（模型 · 上下文 % · 花费） | 宿主状态栏只有连接态 + 停止计数；session-store 已有 costUsd / tokens / lastModel | 本批新增 `oco.hud`（F2） |
| /export 导出转写 | 无（上游只有 share 到 opencode.ai，oco 隐藏） | 本批新增 `oco.exportSession` / `oco.exportSessionToFile`（F1 = M18 第一片） |
| 读取用户终端（read_terminal）、Problems 送入提示 | `oco.addTerminalOutputToDraft`、`oco.addProblemToDraft`、`oco.addGitDiffToDraft`、`oco.addSelectionToDraft` | 已有（M05 首片） |
| 章节目录（mark_chapter 浮动 TOC） | 上游 `pages/session/timeline/`（时间线模型 `createTimelineModel`） | 待查嵌入模式是否可见 = 卡 10（小） |
| 关联会话卡 / 新会话提议卡 / hand-off | 子代理聚合与 pills（M20、0024）、fork（0011）、worktree 会话进收件箱（卡 1） | 部分已有；提议卡无结构化数据源，不做 |
| 分屏打开会话 | `oco.openSessionInNewPanel` | 已有 |
| 侧栏分组 / 分区 / 置顶 / 未读 / 标记完成 | Pinned、本地标签、Snooze、Mark as Unread、归档、多选 | 已有 |
| 收尾框 + 回复按钮（wrap_up） | OpenCode 不产出结构化收尾数据 | 不做 |
| 权限模式（auto / plan / bypass）、Always 模式显示 | 侧栏权限行显示 Always 模式、Deny with note；agent 模式由上游 | 已有 |
| 通知分级 | 卡 2 | 已有 |
| worktree 会话（EnterWorktree） | 新建会话草稿页 New worktree + 收件箱 | 已有 |
| 计划模式审批（ExitPlanMode） | OpenCode 有 plan agent，无审批流 | 观望上游 |
| PR 绑定 / CI 自动修复 / 合并 | 依赖 GitHub 与常驻监视，ADR-009 不做定时器 | 不做；M21 Git 动作 v1 只做「让 agent 提交 / 开 PR」提示模板 + 打开 SCM（卡 11，先补 ADR-009 §4） |
| Remote Control / 云会话 / 定时任务 / Artifacts / 浏览器面板 / 模拟器 | 不属于客户端范围 | 不做 |
| 斜杠命令 / skills 面板 | 上游 `slash-popover.tsx` | 已有 |
| 用量解释（/explain-usage） | 结果卡花费；HUD tooltip 补 token 分项 | F2 顺带 |
| 空闲压缩提示 | M07 收件箱「压缩中」行部分完成 | §3 小项不变 |
| 键位自定义 | 卡 8 待用户决定默认 chord | 用户决定 |

更新 00:20：
- cc-changelog：requested grok-worker → 实际由 grok-route hook 包装成 Grok Build 任务（job `run-mv9qeyju-yv0dvg`，model unknown，3 m 36 s，0 文件改动）。提示里嵌的 `node grok-subagent.mjs start` 行在 Grok 沙箱里写 jobs 标记失败（EPERM），Grok 随后直接读文件完成了同一任务；结果见下节。教训：直接调用 grok-worker / gemini-worker 时提示只写任务正文，hook 会自己加包装命令。
- impl-export-hud：requested gemini-worker（--write）→ hook 生成 job `gem-mv9qjmhf-el622`（provider gemini，write true，prompt `jobs/toolu_01XarmzgTPowTe3TFM8eR1NR.md`）；00:12 已写 `.oco-reports/ccfeat-impl.checkpoint.md`，运行中。
- mini-regress：00:19 `dispatch.sh mini-regress docs/mini/mini-regress.md main` → `started mini-mini-regress on main`（tmux `mini-mini-regress`，基线 3f89430，Sonnet）。前提修复：Mac mini `com.jarvis.tmux-gui` LaunchAgent 00:12 经 SSH `launchctl bootstrap gui/501` 加载（用户授权夜间绕过权限卡点；回退 `launchctl bootout gui/501/com.jarvis.tmux-gui`；已记入家庭设备变更日志与 mac-mini 案例库）。
- 巡检：本会话 CronCreate 每 ~35 分钟跑 `scripts/mini/patrol.sh`（9、44 分）。

## Claude Code 2.1.280–2.1.300 变更摘要（Grok 读 CHANGELOG 提取；(新) = oco 没有等价物，(已有) = 已有）

该区间没有新增章节目录、消息下任务列表、收尾框、分屏或新的 pin / archive / unread 产品形态（这些是桌面 Code 页既有能力）。

1. 会话列表 / 侧栏：2.1.288 agents view Ctrl+F 按会话名查找、Alt+↑/↓ 跨组跳转 (新)；2.1.287 `n:<text>` 同时匹配会话名和任务，折叠分区里的命中也显示，Enter 开最佳匹配 (新)；2.1.299 agents view 裸 `/model` `/effort` `/fast` 开 picker 并决定新会话起点 (新)；2.1.299 后台会话 peek 面板加 safe mode 行 (新)；2.1.290 忙碌后台会话的 `/model` `/effort` `/rename` 立即生效 (新)。
2. 转写 / 消息视图：2.1.286 答完 question card 后转写保留 Questions 行（每问 + 所选答案）(新)；2.1.286 VS Code Bookmarks 侧栏钉住某条回复 (新)；2.1.295 Claude 发来的文件单独成行、点击在编辑器打开 (新，结果卡 files 已有)；2.1.292 `/focus` 可回合中途进入 focus view (新)；2.1.290 消息时间戳默认显示可关、文件 pill 悬停显示相对路径 (新)；2.1.286 看子代理转写时 `/compact` `/clear` `/rewind` 先确认作用对象 (新)；2.1.300 `$.ui.view({ agentId })` 把该代理转写放到主视图 (新，子代理 pill 已有)；2.1.283 全屏下其他会话的截断消息可点开 (新)；2.1.282 `maxProseWidth` 只限正文宽度 (新)。
3. 权限 / 通知 / 状态栏 / 用量：2.1.286 多个权限请求叠加显示 “2 of 5” (新)；2.1.287 等待中的权限按最旧优先、新请求不盖住正在看的 (新)；2.1.284 auto mode 对工作区外读取给 “Yes, but ask again next time” (新)；2.1.296 auto mode 未跑的工具显示暗色 “Not run” (新)；2.1.295 等权限的 MCP 工具显示服务器名 + 可读名 (新)；2.1.299 idle compaction（>20 万 token 闲置 ~54 分钟自动压缩）(新，服务端概念)；2.1.299 `/usage` 对 max effort / workflows / 常驻上下文 / 大工具结果给警告 (新)；2.1.284 `/usage` 与 status line 显示本月金额 (新)；2.1.295 OSC 7501 终端显示 working / waiting / done (新)；2.1.299 后台代理通知分三类 (新)。
4. 多会话 / 子代理 / worktree / 后台：2.1.285 `/tasks` 把系统后台工作折成一行 (新)；2.1.286 子代理视图 ctrl+enter send now 把命令转后台 (新)；2.1.285 恢复后台运行中的会话直接打开 (新)；2.1.285 Remote Control 开始处理才标已读，队列中消息下次送达 (新)；2.1.290 VS Code “Message queued.” 读屏提示、Continue After Reload (新)；2.1.285 `claude --desktop` / `--continue` / `--resume` 打开桌面同一会话 (新)；worktree 会话与消息级 fork 无新形态 (已有)。
5. 其他：2.1.287 “You should know” 侧路代理标出漏掉的事 (新，服务端)；2.1.300 `claudeCode.attachSelection` 可关掉编辑器选区自动进消息 (新，手动加入已有)；2.1.290 `/` 与 `@` 建议列表用 ❯ 标当前行 (新)；2.1.280 对话框 Enter 接受 / Esc 取消 (新)。

Grok 的 Top 5：idle compaction；权限队列 “2 of 5” + 最旧优先；Questions 行；Bookmarks 侧栏；折叠分组里的 name+task 搜索。主线程取舍：idle compaction 与 “You should know” 属服务端，不做；权限队列顺序与 Questions 行记 §3 小项候选；Bookmarks → 卡 12；attachSelection → 卡 13；搜索增强暂不做（侧栏已有搜索 + 标签分区）。

## 委派记录（结果）

| task_id | requested_route | actual_provider/model | agent_id/run_id | 状态 | 结果 | 备注 |
| --- | --- | --- | --- | --- | --- | --- |
| cc-changelog | grok-worker（check ready:true） | Grok Build / unknown | `run-mv9qeyju-yv0dvg` | 已返回，验收通过 | 本文件「变更摘要」 | 3 m 36 s，0 文件改动；嵌入的 node 行在沙箱 EPERM 后 Grok 直接读文件完成 |
| impl-export-hud | gemini-worker --write（探测 OK 6 s） | Gemini (Antigravity) / unknown | `gem-mv9qjmhf-el622` | 已返回，验收通过 | 提交 `25f9a76` | 26 m 11 s，worker 16 次工具调用；自报 typecheck 0 / unit 434（沙箱内 5 个 mock-llm socket 用例跳过）/ esbuild OK；主线程本地复跑 typecheck 0、unit 439/0、build PASS；主线程修 2 处缺陷后提交 |
| mini-regress | Mac mini dispatch（base main 3f89430，Sonnet） | claude-subagent/sonnet（mini） | tmux `mini-mini-regress` | 失败（环境） | `docs/evidence/mini-regress-main.md`（提交 692e313，已 cherry-pick 为 22158de） | 0/13：任务 shell 找不到 opencode；根因 launchd 起的 tmux PATH 没有 `~/oco-bin`，mini 本无 opencode；修复 `run-task.sh` 9c6f4a4 |
| mini-ccfeat | Mac mini dispatch（base claude/cc-features-2026-10-16 9c6f4a4，Sonnet） | claude-subagent/sonnet（mini） | tmux `mini-mini-ccfeat`，00:5x 开始 | 运行中 | `docs/evidence/mini-ccfeat.md`（待） | c26–c28 + 受影响 4 套件 + 默认回归；本会话 cron 每 35 分钟 patrol |
| 主线程保留 | — | Fable 5.1 | 本会话 | — | — | 合并 / 推送、范围与对照表、提示词、审阅与 2 处修复、Mac mini 运维（tmux-gui、opencode 包装脚本）、文档 |

## 合入规则（夜间）

mini-ccfeat 的 c26–c28、受影响套件与默认回归全绿（偶发重跑通过算绿）→ 合入 main 并推送、Mac mini 拉取、打包安装；有稳定失败 → 留在分支，失败清单写 STATUS / NEXT §0b，早上由用户决定。

## 更新 01:55：mini-ccfeat 结果与基线对照

- mini-ccfeat 已返回（tmux `mini-mini-ccfeat`，00:45–01:40，提交 `3ed2d17` → cherry-pick `4f24750`）：c26 2/2、c27 2/2、c28 2/2；c7 6/6、c16 5/5、c11 6 PASS + 2 既有 NOT RUN；c3-fork 测试侧竞态修一处后 3×4/4；默认回归 13 套件 11 过，p1b-narrow（deny-260 → 重跑 question-260）与 c5-runtime（think-card 337→344）两次失败，关掉 `oco.statusBar.hud` 仍失败。产品缺陷 0。副产物：mini 上 `~/oco-bin/env.sh` 的 `OCO_VSCODE_BIN` 指向不存在的 `MacOS/Electron`，主线程已改为 `MacOS/Code`（`tests/e2e/vscode.mjs` 默认值即 Code，不 source 该文件也可）。
- 两个失败均为 webview 内几何 / 动画用例，本批未改 vendor 与补丁；mini-card7 也记录过同两处偶发。为了不把既有偶发当本批回归、也不把本批回归当偶发，派 `mini-baseline`（临时分支 `claude/baseline-3f89430` = main + run-task 修复，产品代码与 main 相同）在 main 上各跑这两套件 ≤2 次。规则：main 同样失败 → 合入；main 两次都过 → 不合入、留分支。
