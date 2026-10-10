# 下一步开发计划调研（2026-10-10）

目的：为 oco 后续批次选题提供证据，不替代 [NEXT](../NEXT.md) 的队列，也不改 [ADR-009](../adr/009-multi-agent-cockpit-boundary.md) 的边界。

方法：
1. 盘点 oco 现状（能力 / 非目标 / 进行中 / 队列），只读 15 次工具调用，未写文件。
2. 盘点上游 OpenCode v1.18.33（vendor/opencode）的 HTTP 路由、SSE 事件与官方客户端（TUI / 桌面 / web / 官方 VS Code 扩展）能力，标出 oco 已用 / 未用。
3. 调研 8 组参考项目：Cline / Roo Code / Kilo Code、Cursor、Claude Code、GitHub Copilot 与 VS Code Agents、Continue / Zed、OpenCode 官方、多 agent 驾驭舱类（Conductor / Vibe Kanban / Claude Squad / Crystal / Warp / Amp / Codex）、Windsurf Cascade / Augment / Trae / Aider。
4. 从用户价值、差异化、低成本三视角提出候选，合并为 21 项（M01–M21）。
5. 每项做两次独立审查：边界审查（对照 ADR-009 / ARCHITECTURE / TASKS / NEXT 与仓库源码）与可行性审查（对照 vendor 源码、VS Code 1.95 API、现有宿主代码）。结论取两审一致或调整后一致的形态；两审矛盾处以边界审查为准，并在第 7 节列出。

与 NEXT / ADR-009 的关系：本文只提供证据与建议，不改 STATUS / NEXT；是否采纳、何时排期由用户决定。所有候选都在 ADR-009 §1 的允许接口内（发起会话 / 选 agent 与模型 / 投递提示词 / 批复权限与提问 / 中止），没有一项要求 oco 执行工具、自建权限库、内置定时器或新建调度引擎。

## 1. 结论摘要

1. oco 已有「多会话 + 收件箱 + 结果卡」骨架；参考项目里最常见而 oco 缺的是六类：不开面板停止、提问就地作答、通知分级、撤销、会话内排队、VS Code 原生上下文入草稿。
2. 其中撤销（revert）与计划转实施（plan_exit）上游 v1.18.33 已在嵌入视图内实现，oco 不应再做；会话内排队上游 app 已实现但被设置迁移强制改为 steer，只需小补丁恢复。
3. 下一批建议 3 项，均为 S / M、不改桥契约、不动上游补丁：M10 侧栏一键停止、M11 提问就地作答、M01 通知分级与 Mark as Unread。
4. 近期 6 项：M12 恢复上游排队模式、M06 Always 范围预览 + Deny with note、M03 收件箱键盘直达、M07 压缩入口、M05 Problems / Git diff 入草稿（首片）、M02 todo 进度。
5. 批量发起（M09）维持 NEXT §2 的 DEFER 门槛（常一次发起 ≥3 个独立任务再做）；工作树隔离（M17）需先改造单目录事件流；两者都不进下一批。
6. 不建议：M04 自建回退入口（上游已有，且 TASKS T012 / ARCHITECTURE §7 标为不做）、M15 Agent 只读面板（用户 2026-10-01 已移除同类视图）、M16 计划转实施（上游 plan_exit 已做）。
7. 边界结论：21 项无一项越过 ADR-009 §1；两项需先补文档再做：M02 要在 ADR-009 §2 补数据源（GET /todo 经 session-feed）、M21 要在 ADR-009 §4 补「git 动作」一节。
8. 本轮已在 vendor 源码核实：busy 会话再次 prompt 为 steer（不排队、不拒绝）；file.edited 载荷无 sessionID；/experimental/capabilities 只含 backgroundSubagents；PATCH /session 的 permission 为 Ruleset 而非布尔；permission reply 支持 message；revert 依赖 git 快照还原文件。
9. 仍未确认：嵌入模式下上游命令面板（compact / share / export / undo）是否可达；Remote-SSH 下 window.state.focused 语义；上游将 followup queue 迁为 steer 的原因。
10. 可借鉴但不实现的交互模式见 §6.4；参考项目自身已退役或下线的功能（Roo Code 2026-05 停运、Cascade 被 Devin Local 替代、Vibe Kanban 关停、Crystal 停更）不作为规划依据。

## 2. oco 现状盘点

### 2.1 已有能力

| 领域 | 能力 | 证据 |
| --- | --- | --- |
| 会话 | Webview 会话侧栏（ADR-008）；新建 / 重命名 / 归档 / 删除；服务端搜索与分页；只列当前工作区目录 | STATUS「已合入 main」；package.json contributes；sessions-webview.ts |
| 会话 | 单主面板 + 切换保活 + 固定面板（ADR-007）；切换 270–400 ms，冷启动约 2477 ms | docs/adr/007 |
| 会话 | UnreadTracker（memento oco.unreadSessions）；多根工作区当前文件夹；子代理按父会话分组 | ADR-009 §2；USER-GUIDE；5f78b49 |
| 收件箱 | Needs attention 四类（等权限 / 等提问 / 报错 / 完成未读）；就地 Allow / Always / Deny / Dismiss；Answer 打开会话；状态栏计数 + VS Code 通知 | ADR-009 §2；cockpit-inbox-2026-10-10.md；c6-inbox 9.7 s |
| 视图 | 对话（嵌入模式补丁 0002 / 0009 / 0010 / 0015–0018）、轨迹（0012–0014）、运行视图 M5（0020，58 文件）、fork（0011）、上下文圆环（0019）、恢复界面（0008） | patches/opencode；STATUS |
| 编辑器 | 文件 / 行号 / diff 摘要 / Markdown 路径在宿主打开（0005 / 0006，路径校验）；选区加入草稿（0001，DraftInsert）；单轮 Diff 范围标签（0007） | contracts/bridge.ts；USER-GUIDE |
| 连接 | attached / managed 两模式；事件流 + 快照 + 重连退避（ADR-006）；宿主桥（fetch / store / blob 转发，UiAction 固定枚举）；状态栏连接状态 | ARCHITECTURE §3 §6；t007-managed 7/7 |
| 设置 / 诊断 | 5 个设置键；日志 / 脱敏诊断导出 / debugState；verify:brief、package-vsix、look-local、regen-patch 脚本；E2E 21 套件 | package.json；t015-diagnostics 4/4 |
| 上游 | vendor v1.18.33（51ef4be）+ 补丁 0001–0020 干净重放，0021 结果卡未跟踪 | patches/opencode；NEXT §0 |

### 2.2 明确不做（节选）

| 项 | 来源 |
| --- | --- |
| 内置 cron / 定时器；多模型并行比较；团队 RBAC；新调度引擎 / 推理循环 / 执行工具 | ADR-009 §1；AGENTS.md |
| 自建权限规则库；「总是允许」只能是上游 reply 的 always | ADR-009 §1 与「代价」 |
| 完整终端 / PTY（嵌入模式禁用） | ARCHITECTURE §6；补丁 0009 |
| 记录实际系统提示词；工具页签按权限标灰；MCP 工具分组（除非用户另行决定） | NEXT §4 |
| 回滚 / 接受修改等可能覆盖后续编辑的操作；无正确前像不提供回滚 | ARCHITECTURE §7；TASKS T012 |
| VS Code 原生 diff 编辑器承载结果卡（上游只给 patch 文本） | cockpit-result-card-2026-10-10.md |
| 常驻弹窗、声音通知 | ADR-009 §2 |
| 把批次标签写进服务端配置或改会话标题冒充元数据 | ADR-009 §3 |
| oco 侧重算 token 费用或推断模型；第二套 model / provider / 权限数据库 | ADR-009 §4 §5；ARCHITECTURE §8 |
| Agents 视图 / Agent 定义管理（2026-10-01 用户决定移除，代码在 2b40651） | TASKS T013；NEXT §2 |
| 宿主重启后自动续跑未发起的批量任务；网络错误后无条件重发 | ADR-009 §3；ARCHITECTURE §6 |

### 2.3 进行中（本地未提交）

| 项 | 状态 |
| --- | --- |
| 每会话结果卡：session-store FileChange / RunResult；侧栏行摘要（改动文件数 / 耗时 / 花费 / 最后一句）；openReview / markRead 消息；oco.openSessionReview 命令（package.json 未声明）；Navigate.review；补丁 0021 | 分支 claude/cleanup-2026-10-10，13 文件 +751 −88；NEXT §2 已标 DONE（c7 6/0），真实模型目视 NOT RUN |
| Git Review 入口改走原生 Git 范围 | session-diff-scope-2026-10-10.md 状态「运行中」；tests/e2e/c8-git-review.mjs 未跟踪 |
| 收件箱第二 / 三轮 | 已提交 5f78b49 / bb9e90e；cockpit-inbox 证据有 +19 行未提交 |
| 真实模型回归遗留：p1b-narrow「新面板未出现」、c4 / c5 按 modelMode 改判 | NEXT §1 TODO |
| STATUS 文档滞后（「收口批次」「M5 评审落地」仍标未提交，git log 已有 7d71662 / 6e41360）；USER-GUIDE 仍写 Connection 视图与「只搜最近 200 个」 | 待下次 STATUS 更新纠正 |

### 2.4 队列（NEXT）

| 项 | NEXT 实际状态 | 备注 |
| --- | --- | --- |
| 批量发起与任务队列（清单文件逐项 prompt_async、批次标签、并发上限） | §2 [DEFER]（NEXT.md:33） | 盘点输入写「队列中」，文件实际是 DEFER：先用脚本代替，常一次发起 ≥3 个独立任务再做最小「从清单文件发起」命令 |
| 结果卡批次汇总 | §2 随批量发起搁置 | — |
| Agent 定义最小编辑（权限 / 模型子集） | §2 [DEFER] | 触发条件：无人值守运行反复因权限配置出错 |
| 运行视图 P1-2 提问态；收件箱提问就地作答 | §2b / §3 | 前提是接通回答通道 |
| 运行视图窄布局 N1–N3；P3-9 / P3-10 | §2b | — |
| T010 键盘可访问性；T011 附件大小限制；T014 管理页外壳；T018 publisher / 许可证 | §4 | T018 需用户决定 |
| 嵌套 ≥2 层子代理 E2E；长会话内存 / 滚动性能；Remote-SSH 验证 | §1 §3 | 多为 BLOCKED / NOT RUN |

## 3. 上游 OpenCode 已有而 oco 未暴露的能力

| 能力 | 路由或事件 | oco 现状 | 建议 |
| --- | --- | --- | --- |
| 压缩 / 摘要 | POST /session/:id/summarize（需 providerID / modelID）；session.compacted；Session.time.compacting | 无入口；store 不消费 compacted；圆环只变色 | M07 |
| 撤销 / 恢复 | POST /session/:id/revert、/unrevert；v2 /revert/stage、clear、commit；core 按 message.snapshot 还原文件（git 仓库才有效） | 上游嵌入视图已有每条用户消息的 revert 按钮与 revert dock；补丁 0011 保留了 revert | 不做宿主入口（M04 否决）；只需嵌入模式目视确认 |
| 中止 | POST /session/:id/abort；父会话 abort 级联取消其后台子任务 | 仅面板内 composer 停止按钮 | M10 |
| 会话级权限规则 | PATCH /session/:id {permission: Ruleset}；prompt 时 Permission.merge(agent, session) | 宿主 PATCH 只用于 rename / archive | M06(3)，先核实 setPermission 覆盖语义 |
| 权限回复附理由 | POST /permission/:id/reply {reply, message?}；reject + message → CorrectedError feedback | 只发 {reply} | M06(2) |
| Always 建议模式 | permission.asked 事件 Request.always[] | store 只映射 patterns / metadata | M06(1a) |
| 提问回答 | POST /question/:id/reply {answers: label[][]}（按问题顺序，一次覆盖全部问题） | 只有 reject | M11 |
| Todo | GET /session/:id/todo；todo.updated（整表） | 上游对话内 todo dock 有；侧栏 / 收件箱无 | M02 |
| 分享 | POST / DELETE /session/:id/share；GET /config.share = manual / auto / disabled | 入口随 0018 隐藏 more-menu 消失 | M18 |
| 导出 | GET /session/:id/message（上游 app 只导出 JSON） | 无 | M18（宿主自写 Markdown 组装） |
| 子会话列表 | GET /session/:id/children | 用 /session 的 parentID 分组 | M20 |
| 会话元数据 | POST / PATCH /session 接受 metadata Record | 未用 | M09 批次标签可存 metadata（替代 memento） |
| busy 时再次 prompt | prompt / prompt_async 落库后由运行中 runner 下一步读取（steer）；BusyError 仅 shell / revert | 候选 M12 曾假设需核实 | 已核实：排队只能客户端持有；上游 app 已有 followup 队列 |
| 文件编辑事件 | file.edited {file}（无 sessionID）；session.diff（revert / summary 时发） | store 已消费 session.diff 作结果卡过渡源 | M19 只用作触发器 |
| 工作树 | GET / POST / DELETE /experimental/worktree、/reset；目录在 Global.Path.data/worktree/<projectID>/<name> | 无 | M17；探测用 GET /experimental/worktree（capabilities 不含该标志） |
| 后台子代理 | POST /experimental/session/:id/background；capabilities.backgroundSubagents | 无 | 未确认语义，暂不 |
| /init | POST /session/:id/init | 无 UI | 低价值，稍后再议 |
| 版本更新 | installation.update-available | 未用 | 可选状态栏提示，不自动升级 |
| VCS | GET /vcs {branch}、/vcs/status（仅 added / deleted / modified）、/vcs/diff | 未用 | 不足以做「已提交 / 已推送」；M21 改用 VS Code git 扩展 API |
| 斜杠命令 | GET /command、POST /session/:id/command | 面板内 composer 已有 | 不做宿主入口 |
| LSP / formatter / PTY / project / workspace / sync / tui | 多条路由 | 未用 | VS Code 原生覆盖或显式不做 |

## 4. 参考项目功能清单

### 4.1 Cline / Roo Code / Kilo Code

| 功能 | 来源 | 对 oco |
| --- | --- | --- |
| Checkpoint 三向 Restore（只还文件 / 只删消息 / 两者）；Kilo snapshots revert 横幅 | https://docs.cline.bot/features/checkpoints | 上游 revert 已覆盖；不自建 shadow git |
| 每条消息 diff 徽标 + Diff Viewer（unified / split） | https://kilo.ai/docs/code-with-ai/platforms/vscode/whats-new | 结果卡的细一层入口，稍后 |
| 行级审阅评论「Send all to chat」结构化回传 | https://blog.kilo.ai/i/192608130/the-agent-manager | M13 |
| 自动批准矩阵：tile 网格 + 风险等级 + 主开关「暂停但保留选择」 | https://roocodeinc.github.io/Roo-Code/features/auto-approving-actions | M06 原则；不自建权限库 |
| @ 上下文全集 @problems / @terminal / @git-changes / @commit | https://roocodeinc.github.io/Roo-Code/basic-usage/context-mentions | M05 |
| 消息排队（Queued Messages 卡片可编辑 / 删除） | https://roocodeinc.github.io/Roo-Code/features/message-queueing | M12（去掉隐式批准） |
| Orchestrator / Boomerang 父子任务与「暂停等待子任务」状态 | https://roocodeinc.github.io/Roo-Code/features/boomerang-tasks | M20 |
| Agent Manager：多会话 + worktree 隔离 + 结束后合并 / 开 PR | https://blog.kilo.ai/i/192608130/the-agent-manager | M17；多模型比较与内嵌终端在不做清单 |

可借鉴交互：主开关暂停但不清空精细配置；Compare 复用 VS Code diff 编辑器而非自绘；审阅意见先攒后发；队列卡片就地编辑；三段式上下文条（used / reserved / available）。

坑：Roo 队列消息被处理时会隐式放行下一个本应确认的动作；Cline / Roo 的 checkpoint 是客户端 shadow git，大仓库拖慢；Roo Code 扩展 2026-05-15 停运；Cline 新旧文档对 @ 范围不一致；Kilo v7 评论区有回退反馈，可监督性是 OpenCode 客户端的共同短板。

### 4.2 Cursor

| 功能 | 来源 | 对 oco |
| --- | --- | --- |
| Agents Window：本地 / worktree / cloud / SSH 全部 agent 一张表 | https://cursor.com/docs/agent/agents-window | 信息架构参考；oco 留在 VS Code 内不另开窗口 |
| Worktree 隔离 + /apply-worktree + .cursor/worktrees.json（第三方来源） | https://www.datacamp.com/blog/cursor-3 | M17 |
| Review → Find Issues 二段式；SCM 标签对分支整体审查 | https://cursor.com/docs/agent/review | 结果卡→Review 之后「让 agent 自查」可作 prompt 模板 |
| Checkpoints：悬停消息 Restore，只还文件 | https://cursor.com/docs/agent/chat/checkpoints | 上游 revert 已覆盖 |
| Plan Mode：计划是可编辑 Markdown 文件 | https://cursor.com/docs/agent/planning | 上游 plan agent 已写 .opencode/plans/*.md |
| @ 上下文 @Terminals / @Commit (Diff of Working State) / @Branch | https://cursor.com/docs/context/mentions | M05 |
| Rules .mdc 四种应用模式 + 嵌套 AGENTS.md | https://cursor.com/docs/context/rules | 不引入新格式 |
| 子代理定义 model / readonly / is_background | https://cursor.com/docs/subagents | M20 徽标参考 |
| Bugbot「Fix in Cursor」深链 | https://cursor.com/docs/bugbot | vscode:// URI handler，稍后 |

可借鉴交互：一个收件箱、两个维度（状态 × 环境）；在发送处选运行目标；撤销挂在消息上；审阅是结果上的动词；信任阶梯（单次 → 模式 → 会话级）；计划是文件不是气泡；深链闭环；卡片上写清谁在跑。

坑：官方文档迁移，llms.txt 直链全部 404，第三方版本号互相矛盾；检查点只恢复文件、不回退对话；子代理共享检出目录并发会冲突；并行即乘法（首次用云 agent 强制设支出上限）；Projects / autopilot / Automations 属调度引擎，ADR-009 不做。

### 4.3 Claude Code

| 功能 | 来源 | 对 oco |
| --- | --- | --- |
| 提示框内权限模式指示器（Manual / Accept edits / Plan / Auto / Bypass） | https://code.claude.com/docs/en/permission-modes | 以 agent 选择 + 权限预设表达；Auto 分类器不做 |
| Plan 模式计划以 Markdown 文档打开批注，批准即切模式 | https://code.claude.com/docs/en/vs-code | 上游 plan_exit 已覆盖切换 |
| 逐块 diff Accept / Reject；diff 行内评论 Cmd+Enter 批量回灌 | https://code.claude.com/docs/en/desktop | M13 |
| 会话列表命名分组 / 多选移动 / 状态过滤 / 自动归档可逆 | https://code.claude.com/docs/en/vs-code | M14 |
| 注意力信号：tab 彩点、Mark Session as Unread、「← N agents」计数 | https://code.claude.com/docs/en/agent-view | M01 |
| agent view 按状态分组 + 一行摘要 + peek 就地回复 | https://code.claude.com/docs/en/agent-view | M11；摘要用最后一条 assistant 文本不另推理 |
| @ 上下文 @terminal:name、Problems 诊断、排除文件只传路径 | https://code.claude.com/docs/en/vs-code | M05 |
| 检查点：Fork / Rewind code / Fork+Rewind；Summarize from here | https://code.claude.com/docs/en/checkpointing | 上游 revert / summarize 已有 |
| 消息排队：回车排队灰显、Ctrl+Enter 立即、Up 收回 | https://code.claude.com/docs/en/interactive-mode | M12 |
| 权限选项文案写明保存范围；Tab 附评论；带理由的拒绝不终止回合 | https://code.claude.com/docs/en/permissions | M06（reply.message 已核实支持） |
| Worktree：新会话勾选、.worktreeinclude、脏 worktree keep / remove | https://code.claude.com/docs/en/worktrees | M17 |
| 键盘与可访问性播报纪律、Focus last message、1–9 选菜单 | https://code.claude.com/docs/en/vs-code | T010 / M03 验收清单 |

可借鉴交互：注意力优先的会话列表（Needs input > Ready for review > Working > Completed，固定状态色）；权限选项自述范围与后果；审阅即对话；不阻塞的纠偏；模式就在输入框里；降噪但保留审计（Focus view 钉住 to-do 与待答问题）；软锁而非硬锁；播报纪律（完成只播报一次，恢复历史静默）。

坑：不少亮点是 agent 侧能力（Auto 分类器、hooks、跨会话消息、Routines、Run in background）；检查点依赖 agent 快照，oco 已核实上游 revert 走 git 快照；PR / CI 监控与 Auto-fix CI 本质是后台轮询，触碰定时器禁区；一行摘要由 Haiku 生成计费。

### 4.4 GitHub Copilot 与 VS Code Agents

| 功能 | 来源 | 对 oco |
| --- | --- | --- |
| 统一 sessions list：状态 / 类型徽标 / 文件改动统计 / Pin / Archive / 外部会话过滤 | https://code.visualstudio.com/docs/agents/sessions/chat-sessions | M14 |
| 命令中心 unread / in-progress 徽标，点击即过滤 | https://code.visualstudio.com/docs/agents/sessions/chat-sessions | M01 / M03；Dock 角标无公开 API |
| 每会话权限级别在输入框切换；审批四档；Manage Tool Approval；/yolo | https://code.visualstudio.com/docs/agents/run/approvals | M06 |
| Checkpoints：Restore / Redo / 编辑并重发 / Fork；每请求下 +N/-M 统计 | https://code.visualstudio.com/docs/agents/run/review-code-edits | 上游 revert；M19 |
| 无 pending 审阅：Changes 面板、Mark as Reviewed、Add Feedback → Submit Feedback | https://code.visualstudio.com/docs/agents/run/review-code-edits | M13 |
| 每会话 worktree 隔离，结束时 apply / merge / discard | https://code.visualstudio.com/docs/agents/run/review-code-edits | M17 |
| 运行中发送三义：Add to Queue / Steer / Stop and Send | https://code.visualstudio.com/docs/copilot/chat/chat-agent-mode | M12（上游默认 steer，queue 可恢复） |
| Related sessions 层级与父级聚合 | https://github.blog/changelog/2026-10-01-github-copilot-in-vs-code-september-2026-releases | M20 |
| 自定义 agent 文件 handoffs 按钮 | https://code.visualstudio.com/docs/copilot/customization/custom-agents | 上游 plan_exit 已覆盖同类流程 |
| #read/problems、#read/terminalLastCommand、#search/changes | https://code.visualstudio.com/docs/agents/reference/tools-reference | M05 |
| 通知三态 off / windowNotFocused / always，分「需要输入」与「已完成」 | https://code.visualstudio.com/docs/copilot/chat/chat-agent-mode | M01 |
| chatSessionsProvider 数据模型（四态 status、timing、changes、archived） | https://raw.githubusercontent.com/microsoft/vscode/main/src/vscode-dts/vscode.proposed.chatSessionsProvider.d.ts | 只作 contracts 参考，proposed API 不接入 |

可借鉴交互：状态优先的「需要我」计数可点进；审批决策放在发生处、可见且可逆；无 pending 状态的审阅 + 批注汇总提交；以「请求」为撤销锚点；三义发送按钮；handoff 按钮代替调度；三态通知默认「窗口不在前台才提醒」；来源与透明度徽标。

坑：chatSessionsProvider 是 proposed API；Chat Participant / LM Tools 依赖 Copilot 计费；VS Code 本体已能列外部会话、做 worktree 与 checkpoints，泛用列表会被同质化；终端自动批准官方定性为非安全边界；文档正从 /docs/copilot 迁到 /docs/agents；#execute/testFailure 依赖 Test API 结果读取（proposed）。

### 4.5 Continue / Zed

| 功能 | 来源 | 对 oco |
| --- | --- | --- |
| Zed Threads Sidebar 按项目分组；ctrl-tab 最近线程循环 | https://zed.dev/docs/ai/agent-panel | M03 |
| Zed Follow mode（面板 toggle / 发送时按 cmd 临时跟随） | https://zed.dev/docs/ai/agent-panel | M08 |
| Zed Review Changes：composer 上方「N files / M lines」；commit 后自动清审阅状态 | https://zed.dev/docs/ai/agent-panel | 结果卡节奏参考 |
| Zed Tool Permissions：Allow once / Deny once / Always for tool / Always for pattern，链式命令逐段 | https://zed.dev/docs/ai/tool-permissions | M06 |
| Zed Agent Profiles（工具存在性 vs 审批分离） | https://zed.dev/docs/ai/agent-profiles | M15 否决，概念留作文案 |
| Zed Restore Checkpoint 在消息卡 | https://zed.dev/docs/ai/agent-panel | 上游 revert |
| Zed 排队 / Steer / Send Now / 编辑排队消息 | https://zed.dev/docs/ai/agent-panel | M12 |
| Zed 后台时通知 + 完成音 + 防休眠 | https://zed.dev/docs/ai/agent-panel | M01（声音不做） |
| Zed @diagnostics / 分支 diff Review Diff 按钮 / 终端选区 | https://zed.dev/docs/ai/agent-panel | M05 |
| Zed Markdown 导出 / zed://agent 深链 | https://zed.dev/docs/ai/agent-panel | M18 |
| ACP 外部代理；`opencode acp` | https://zed.dev/docs/ai/external-agents；https://opencode.ai/docs/acp/ | 只作桥契约对照，不实现 ACP 客户端 |
| Continue 工具策略 Ask First / Automatic / Excluded 在 composer 工具栏 | https://docs.continue.dev/ide-extensions/agent/how-to-customize | M06 原则 |
| Continue CLI headless：ask 工具默认排除、启动前有效权限、--auto 忽略排除的反例 | https://docs.continue.dev/cli/tool-permissions | M09 预览原则 |
| Continue cn -p / --format json / cn ls | https://github.com/continuedev/continue/blob/main/extensions/cli/README.md | M09 产品形态参考 |

可借鉴交互：Follow 两种入口；改动摘要常驻 composer 上方；权限提示分级且可预览；「哪些工具存在」与「某次是否放行」拆成两个控件；Restore 锚在消息卡；运行中输入默认排队；无人值守下 ask 工具显式处理而非静默通过；通知只在失焦时发。

坑：Zed single_file_review 默认关（覆盖 git diff 装饰）；逐 hunk 接受 / 拒绝依赖编辑器持有快照，oco 不应复制 diff 引擎；权限 schema 迭代快（v0.224 改制）；Continue --auto 忽略 --exclude；Continue 文档迁移多处 404；Zed 单面板在多会话场景积累并发需求（discussion #42381）。

### 4.6 OpenCode 官方（TUI / 桌面 / web / 官方 VS Code 扩展）

| 功能 | 来源 | 对 oco |
| --- | --- | --- |
| 权限 always 带工具建议模式；auto 徽标；doom_loop 独立权限项 | https://opencode.ai/docs/permissions/ | M06 |
| /undo /redo（需 git）；revert dock | https://opencode.ai/docs/tui/ | 嵌入视图已有 |
| session_timeline（按用户轮次跳转） | https://opencode.ai/docs/keybinds/ | 稍后再议 |
| /compact + session-context-breakdown | https://opencode.ai/docs/tui/ | M07 |
| 自定义命令 .opencode/commands/*.md、斜杠弹层 | https://opencode.ai/docs/commands/ | 面板内已有 |
| Worktree：/experimental/worktree；CLI / 桌面路线（第三方转述） | https://explainx.ai/blog/opencode-desktop-tabs-sessions-worktrees-july-2026 | M17 |
| 后台会话 /experimental/session/:id/background；失败子任务 task_id（镜像 changelog） | https://www.gradually.ai/en/changelogs/opencode/ | 未确认 |
| 子会话键盘导航 session_child_*（leader+Down / Left / Right / Up） | https://opencode.ai/docs/agents/ | M20 |
| 桌面 Review 面板逐项接受 / 评论（单一第三方来源） | https://www.mejba.me/blog/opencode-desktop-app-review | 未确认 |
| Todo（GET /todo、todo.updated；桌面重复渲染 bug） | https://opencode.ai/docs/plugins/ | M02 |
| Question 工具与分事件类型提醒（questions / permissions / errors / completed） | https://opencode.ai/docs/tui/ | M11 / M01 |
| /export Markdown；/share 与 share 模式 | https://opencode.ai/docs/keybinds/；https://opencode.ai/docs/share/ | M18 |
| 官方 VS Code 扩展：cmd+esc 开终端、cmd+alt+k 插 @File#L | https://opencode.ai/docs/ide/ | 键位兼容考虑（M03） |

可借鉴交互：Always 带可见作用范围；指标旁放动作；子会话空间化导航；低噪声模式徽标；审阅即对话（待证）；一标签一会话；按事件类型分级提醒；斜杠命令作可参数化提示。

坑：桌面 Review 面板不实时（issue #52348）；新会话首条消息前面板不可用（#52348 及重复项）；Home 列表与数据库不一致（#36064）；todo 重复渲染；/undo 依赖 git；share 生成公开链接且需读 config.share；/experimental 前缀会变动；权限 glob 最后匹配者胜；上游 app v1→v2 组件过渡使补丁锚点易漂移；标题生成也计费；无公开 roadmap。

### 4.7 多 agent 驾驭舱类（Conductor / Vibe Kanban / Claude Squad / Crystal / Warp / Amp / Codex）

| 功能 | 来源 | 对 oco |
| --- | --- | --- |
| Conductor Workspace = 分支 + worktree + 上下文目录；从分支 / PR / Issue 一键开 | https://www.conductor.build/llms-full.txt | M17 |
| Conductor Setup / Run scripts、Files to copy、CONDUCTOR_PORT | https://www.conductor.build/llms-full.txt | 不做（丢弃项） |
| Conductor Diff 评论变 composer 附件；Checks 页签；一键开 PR | https://www.conductor.build/llms-full.txt | M13 / M21 |
| Warp 面板 Source / Status(Blocked) / Duration / Credit 列 | https://docs.warp.dev/agent-platform/cloud-agents/managing-cloud-agents | M09 列表语义 |
| Warp 通知 Complete / Request / Error + 导航即已读（抓取 404，摘要来源） | https://docs.warp.dev/agent-platform/capabilities/agent-notifications.md | M01 |
| Warp 子代理 pills 在父视图头部 | https://docs.warp.dev/agent-platform/cloud-agents/managing-cloud-agents | M20 |
| Amp Pin / Label / Snooze / Mark as Unread / 72h 不活跃折叠 | https://ampcode.com/docs/threads | M14 |
| Amp ⌘+Enter 排队、Esc Esc 中断；Handoff；Thread Map | https://ampcode.com/docs/threads | M12 / M07(3) |
| Codex Activity 视图 / unopened chats 默认最新未读（聚合站来源） | https://www.gradually.ai/changelogs/codex-app/ | M03 |
| Codex 审批模式 Agent / Chat / Full Access 带警示 | https://community.openai.com/t/introducing-the-codex-ide-extension/1354930 | M06 |
| Claude Squad auto-yes（实验）；checkout 暂停 / resume | https://cdn.jsdelivr.net/gh/smtg-ai/claude-squad@main/README.md | M09 Blocked 语义 |
| Vibe Kanban 看板四段（队列 / 运行 / 审阅 / 完成） | https://raw.githubusercontent.com/BloopAI/vibe-kanban/main/README.md | M09 分组语义，不做看板 UI |
| Crystal 每轮自动 commit、合并前 squash | https://github.com/stravu/crystal | 不做自动提交 |

可借鉴交互：注意力三分类 + 徽标 + 导航即清除；审阅反馈即 composer 附件；状态优先的列式行；时间衰减的侧栏；忙时排队、双击 Esc 中断；Workspace 作为单一对象；子代理 pills 而非列表行；模式选择器在输入框正下方。

坑：独立「agent 管理面板」产品生存困难（Vibe Kanban 2026-04 关停、Crystal 2026-02 停更）；worktree 隔离真正成本在「可运行」；auto-yes 仍实验性，Warp 把需要输入的无人值守运行定义为 Blocked 终态；Warp 通知接入需插件；分享功能易被砍（Amp 移除公开分享，单一来源）；git 操作必须由宿主执行；文档路径频繁迁移；Thread Map 仅 CLI。

### 4.8 Windsurf Cascade / Augment / Trae / Aider

| 功能 | 来源 | 对 oco |
| --- | --- | --- |
| Cascade Problems → Send to agent（全部 / 单文件）；Explain and Fix | https://docs.devin.ai/desktop/cascade/cascade | M05 |
| Cascade 按步骤回退 + 命名检查点；Augment 运行中回退 | https://docs.devin.ai/desktop/cascade/cascade | 上游 revert |
| Augment Tasklist：Tasks ↔ Changes 双视图、逐任务运行、Implement 按钮 | https://docs.augmentcode.com/using-augment/tasklist.md | M02；M16 否决 |
| Cascade 排队消息可编辑、↑ 召回 | https://docs.devin.ai/desktop/cascade/cascade | M12 |
| Cascade 同文件竞争警告 | https://docs.devin.ai/desktop/cascade/cascade | M19（事后提示） |
| Cascade Local / Worktree / Cloud 位置选项 + Merge 按钮 | https://docs.devin.ai/desktop/changelog | M17 |
| Cascade 原生通知 + 权限卡 Enter / Esc 快捷键 | https://docs.devin.ai/desktop/changelog | M01 / M03 |
| 规则激活模式四种（Cascade / Trae） | https://docs.devin.ai/desktop/cascade/memories；https://docs.trae.ai/ide/rules | 不引入新格式 |
| Augment CLI toolPermissions：allow / deny / ask 三级文件、最严格者胜 | https://docs.augmentcode.com/cli/permissions.md | 不自建；M06 原则 |
| Augment Agent / Agent Auto / Quick Ask 三态 | https://docs.augmentcode.com/using-augment/agent | 以 agent 选择表达 |
| 上下文 pill 带类型图标；Cosmos 附件 4 MB / 10 MB 上限 | https://www.trae.ai/blog/product_thought_0421；https://docs.augmentcode.com/cosmos/sessions-overview.md | M05 / T011 参考数字 |
| Aider /undo、--auto-commits 带署名 | https://aider.chat/docs/config/options.html | M21 手动版 |
| Aider watch files：AI / AI! / AI? 注释触发 | https://aider.chat/docs/usage/watch.html | 未入候选，见 §7 |

可借鉴交互：只在「完成」「需要输入」两事件通知并让权限卡可键盘批复；回退锚定时间线并明示不可撤销；Tasks ↔ Changes 双视图；规则与权限以文件为真源、UI 只是编辑器；输入框永不阻塞；带类型图标的上下文 pill；创建会话时就决定隔离位置；注释即指令。

坑：Cascade 已被厂商退役（v3.9.19 移除，Devin Local 替代）；回退不可撤销；Augment toolPermissions 由 CLI 遵守但其 VS Code 扩展不遵守；Trae Auto-Run 在沙箱外（第三方）；watch files 任何 AI! 注释都会触发，必须默认关；Augment Next Edit 已弃用；Aider 自动提交与多数 VS Code 用户 git 习惯冲突。

## 5. 候选功能评估矩阵

层级：host-only = 只改 apps/extension；sidebar-webview = 侧栏页 + 宿主；bridge-contract = 改 packages/contracts；upstream-patch = 新增或改 patches/opencode。规模：S < 1 天、M 1–3 天、L > 3 天（估算）。

| 编号 | 标题 | 灵感来源 | 价值 | 层级（调整后） | 规模（调整后） | 边界审查 | 可行性审查 | 结论 | 建议时程 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| M01 | 通知分级与自动已读 | Copilot 三态、Zed、Warp、Claude Code | 高 | host-only | S | adjust | accept | adjusted | 下一批 |
| M02 | 侧栏与结果卡 todo 进度 | Cline、Augment、OpenCode todo dock | 中 | sidebar-webview + 契约小改 | M | adjust | adjust | adjusted | 近期 |
| M03 | 收件箱键盘直达与会话跳转 | Codex、Claude Code、Zed、TUI | 高 | host-only + sidebar-webview | M | adjust | adjust | adjusted | 近期 |
| M04 | 消息级回退与恢复 | TUI /undo、Cline、Cursor、Zed | 高 | （上游已有） | — | reject | adjust | rejected | — |
| M05 | 原生上下文投递入草稿 | Roo、Claude Code、Copilot、Cascade | 高 | bridge-contract 小改 + host-only | L，拆片后首片 S-M | adjust | adjust | adjusted | 近期（首片） |
| M06 | 授权范围可见与会话级自动批准 | OpenCode、Zed、Claude Code、Copilot | 高 | sidebar-webview + host-only + 契约小改 | (1a)(2) S；(3) 另估 | adjust | adjust | adjusted | 近期；(3) 稍后 |
| M07 | 上下文压缩与交接 | TUI /compact、Zed、Amp | 中 | host-only + upstream-patch | S-M | adjust | adjust | adjusted | 近期；(3) 稍后 |
| M08 | 跟随 agent 编辑（Follow） | Zed Follow mode | 中 | host-only | S-M | adjust | accept | adjusted | 稍后 |
| M09 | 批量发起与任务队列 | Continue CLI、Warp、Vibe Kanban | 高 | host-only | M（边界）/ L（可行性） | adjust | adjust | adjusted | DEFER（NEXT §2 门槛） |
| M10 | 侧栏一键停止会话 | Claude Code、Warp、TUI | 高 | sidebar-webview | S | accept | accept | accepted | 下一批 |
| M11 | 提问就地作答 | Claude Code peek、Copilot askQuestions | 高 | sidebar-webview | M | accept | accept | accepted | 下一批 |
| M12 | 会话内消息排队 | Roo、Claude Code、Copilot、Amp、Zed | 高 | upstream-patch | S | adjust | adjust | adjusted | 近期 |
| M13 | 审阅评论批量回传 | Kilo、Claude Code、Copilot、Conductor | 高 | host-only（首版） | S 首版 / M–L 全量 | adjust | adjust | adjusted | 稍后（Git Review 落地后） |
| M14 | 置顶 / 标签 / 稍后处理 | Amp、Copilot、Claude Code、Augment | 中 | sidebar-webview + memento | S + S | adjust | accept | adjusted | 稍后（第一步可近期） |
| M15 | 生效配置透明面板 | Claude Code、Zed、Continue | 中 | host-only | S | reject | adjust | rejected | — |
| M16 | 计划一键转实施 | Cursor、Claude Code、Augment、Copilot | 中 | sidebar-webview + 0021 | M | reject | adjust | rejected | — |
| M17 | 工作树隔离会话 | Cursor、Claude Code、Conductor、OpenCode | 高 | host-only（含多目录 feed 改造） | M（边界）/ L（可行性） | adjust | adjust | adjusted | 稍后 |
| M18 | 导出 Markdown 与分享菜单 | TUI、Zed、Amp | 中 | host-only | S | accept | accept | accepted | 稍后（S 填充项） |
| M19 | 改动事件刷新与同文件竞争 | OpenCode #52348、Cascade | 中 | host-only | S | adjust | accept | adjusted | 稍后 |
| M20 | 子代理导航与聚合 | TUI、Warp、Copilot | 中 | host-only + upstream-patch | M | adjust | adjust | adjusted | 稍后 |
| M21 | 结果卡 Git 动作 | Conductor、Aider、Copilot | 中 | host-only（首阶段） | S 首阶段 / L 全量 | adjust（边界有问题） | adjust | adjusted | 中期 |

### 5.1 adjusted 项的调整后形态

- M01：删去子项 (3)「主面板显示会话时自动清完成未读」（UnreadTracker.update 已对 current 清除，session-groups.ts:111）。保留：设置拆为「需要我」「已完成」两类三态（off / windowNotFocused / always），旧 notifyPending=false 迁为两类 off；失焦判定用 vscode.window.state.focused；新增 Mark Session as Unread（UnreadTracker.remember 公开化并对手动标记豁免自动清除，否则 150 ms 刷新会抹掉）；报错不进状态栏计数，维持 ADR-009 验收「批复后计数归零」。
- M02：GET /session/:id/todo 的懒取（仅 busy / 可见行）必须并入 session-feed 快照路径（与现有四个 GET 同鉴权 / epoch / 401 处理），不得在 store 或 webview 另起 fetch；todo.updated 按 id 去重、整表替换。本条只做 SessionStore 投影 + 侧栏行 / 收件箱完成未读行的「3/7 步」与展开列表；运行视图环心卡进度另附到 0021 后续批次。需扩 SessionListItem 契约字段，并在 ADR-009 §2 补一行数据源。
- M03：拆两片。片 1（host-only）：收件箱动作抽为宿主共享函数并注册命令；QuickPick oco.inbox.next 分组列出四类、默认最新、回车直达并自动已读；父 / 子 / 最近会话循环（宿主新增 MRU）。片 2（sidebar-webview）：j / k / Enter / Esc / ? 速查层。allow / deny 命令只作用于当前聚焦或 QuickPick 中显式选中并显示摘要的行，不提供盲批「first」；默认不绑定与 VS Code / 官方 opencode 扩展冲突的键，其余交用户绑定，when 子句限定焦点在 oco 视图。
- M05：拆片。首片：命令面板「oco: Add to Draft…」QuickPick 两个来源——Problems（当前文件 / 全部）与 Git 工作区 / 暂存 diff（内置 git 扩展 API）；DraftInsert.source 改为带 kind 的联合类型（packages/contracts，补丁 0001 只读 id / sessionID / text，不必改）；截断策略随本片落地（尾部 N 行 + 总行数）；files.exclude / .gitignore 命中只传路径（.gitignore 需自实现匹配）。第二片：终端最近命令输出（shell integration 缓冲，Terminal.selection 为 proposed API 不可用）、Problems / SCM / 终端菜单贡献点、「Fix with OpenCode」灯泡。删除 Test Explorer 失败输出子项（vscode.tests.testResults 为 proposed API）。
- M06：(1a) 映射 permission 事件 always[] 字段，在 Always 按钮上只读预览将放行的模式；doom_loop 用独立图标与文案；不提供「编辑后确认」（reply 载荷无 patterns 字段，编辑等于本地记规则，撞 ADR-009）。(2) Deny with note 直接随 POST /permission/:id/reply 的 message 发送，删去「作为下一条 prompt」退路。(3) 改为「会话级 Ruleset」：PATCH /session/:id {permission: [{permission:'*', pattern:'*', action:'allow'}]} 由服务端判定；先核实 prompt.ts setPermission 是否覆盖 PATCH 写入、evaluate 对 "*" 的语义，可行再做带显眼可逆徽标的切换，否则只展示上游状态；不做任何客户端自动代答（上游 app 的 autoaccept 是客户端代答，不可照搬）。
- M07：先核实嵌入模式（补丁 0002）下上游 command.session.compact 是否可达。(1) 宿主命令 oco.compactSession：需跟踪最近 providerID / modelID（summarize 请求体要求）、二次确认、读 Session.time.compacting 作 busy 守卫、订阅 session.compacted 清除；首片不做「上下文接近上限」收件箱行（宿主无模型 limit）。(2) 补丁：0019 圆环可点触发 compact，悬浮用量拆分复用 session-context-breakdown，session.compacted 渲染为可折叠条目（先核实上游 reducer 是否已渲染）。(3) Hand off 独立后置；UiAction 已有 openSession，无需扩契约。
- M08：默认关的按会话 Follow 开关（面板标题行 + 状态栏），只跟随当前活动主面板会话；来源改用 message.part.updated 的 tool part（含 sessionID 与 input.filePath），file.edited 无 sessionID 只作全局信号；文件级定位、preview 组、preserveFocus:true、同文件 500 ms–1 s 节流、与用户正在编辑的文件冲突时不切换；走独立的安静打开路径（现有 openFile 会抢焦点并弹窗）；不做修饰键临时跟随与行级定位。
- M09：维持 NEXT §2 DEFER 门槛。触发后分两步：第一步最小「从清单文件发起」命令——一行一任务 → 逐项 POST /session + prompt_async，宿主节流并发默认 1（可配 k），批次标签可写会话 metadata（服务端接受）或 memento，侧栏按批次分组，等权限 / 提问会话原样进收件箱并在组内置顶，失败先查会话是否已创建再决定重发，重启后未发起项只显示待确认。第二步加组头 Σ 汇总。删去客户端权限求值预览（最多原样展示 GET /agent 的 permission 规则并标注「以服务端判定为准」）、worktree 开关（→ M17）、批次级 Stop（→ M10 之后）。
- M12：不新建宿主队列，不写新 composer 补丁。一枚小补丁在嵌入模式恢复上游既有 followup="queue"（settings.tsx:370-373、389-394 把 queue 强制迁为 steer），复用上游 followup dock 的入队 / 编辑 / 手动发送 / abort 暂停；「立即发送」直接复用上游默认 steer（服务端接受 busy 会话投递），删去 abort 再投递设计；嵌入模式加载时先置 paused 并显示待确认，避免 Reload 后自动续发。实施前查上游关闭 queue 的缘由。
- M13：首版 host-only：编辑器选区右键「Add to Review Notes」累积（文件 / 行号 / 片段 / 意见，宿主内存 + workspaceState，键 连接+sessionID）→ 侧栏该会话行显示「N 条待发」→ 一键「Send all」合成一条结构化文本经现有 draft.insert 入草稿（用户再发送）。前像来源在提示与 UI 中标注「Git 变更（HEAD vs 工作区），可能含非本会话改动」。第二步再做 Comments API 行级线程与 composer 内 chip（需扩 DraftInsert 与补丁 0001）。排在 Git Review 集成（c8-git-review）落地之后。
- M14：第一步 Pin + Mark as Unread（S，纯列表排序与现有 memento）；第二步 Label（兼做批次标签，但不带动 DEFER 的批量发起）+ Snooze。Snooze 只作用于「完成未读 / 报错」行与 SESSIONS 列表，不得隐藏等权限 / 等提问行、不得减少状态栏计数；只做事件触发（下一条消息到达）与手动取消。分区优先级固定 Pinned > 标签 / 批次 > 父会话 > 时间，并为 T009 多连接分组留键位；UI 标注「本地元数据，换机 / 重装不同步」。
- M17：改走上游 /experimental/worktree（list / create / remove / reset，目录在 Global.Path.data/worktree/<projectID>/<name>），不自建 <repo>/.oco/worktrees；可用性探测用 GET /experimental/worktree 是否 2xx。前置结构改造：SessionFeed 单 directory /event 流需改为多流或 /global/event，Connection.ownsDirectory 需扩展为含 worktree 目录，否则 worktree 会话不在侧栏。首版只挂「新建会话」入口（M09 未立项）；结束后动作缩为「打开分支 diff / 在 SCM 切到该分支」，合并由用户在 SCM 完成，删除走上游 DELETE 并二次确认。
- M19：删去「订阅 session.diff 替代轮次结束拉 /diff」（oco 从未轮询 /diff，store 已消费 session.diff，权威源为 summary.diffs）。保留 FileDecorationProvider 徽标（资源管理器标「本会话改过」，随归档 / 删除清理）。同文件竞争只能基于各会话最近一轮 summary.diffs 做事后重叠提示（上游无带 sessionID 的逐文件实时事件），推至 M09 / M17 落地后。
- M20：第一步 host-only：侧栏父会话行「等子任务 2/3」聚合徽标 + 子代理行默认折叠（有未读时父行亮点）。第二步 upstream-patch（扩 0017 标题行）：子代理 pills（状态点，窄面板折叠为计数），点击走补丁 0016 既有会话链接→宿主 openSession，不改桥契约；父 / 子 / 兄弟导航键位用带修饰键的 chord 且 when 限定 activeWebviewPanelId == 'oco.chat'（裸方向键会劫持输入框）。嵌套 ≥2 层无夹具，只在一层验收。
- M21：先在 ADR-009 §4 追加「git 动作」一节（宿主侧一次性操作、数据源为 VS Code git 扩展、不进 SessionStore、不改桥契约、不自动提交 / 推送）。首阶段 M21a（S）：侧栏行 / 命令三盏仓库级事实灯（干净 / 已提交 / 已推送，用 git 扩展 repository.state，标明是仓库级事实）+「提交本回合」在 SCM 输入框预填（会话标题 + Co-authored-by），用户确认后由 git 扩展提交；commit 后订阅 onDidCommit 与 summary.diffs 求交标「已提交」（缺摘要时不伪造）。第二阶段 M21b（M）：开 PR 二选一——用结果卡已有数据预填标题 / 正文、用户确认后宿主一次性调用 gh；或固定 prompt 交给会话由服务端 agent 自行跑 gh（权限走收件箱）。删去「oco 向会话要标题 / 正文并解析回复后调 gh」（oco 解释模型输出并替模型执行工具）。PR 状态只做手动刷新 gh pr view（GitHub PR 扩展未导出状态事件）。去掉对 M17 的依赖（getRepository(uri) 已处理多根映射）。运行视图环心卡上的灯与按钮如要做，另需桥契约信封 + 补丁 0021 扩展。

### 5.2 rejected 项的原因

- M04 消息级回退与恢复：上游 UserMessageDisplay 已在每条用户消息操作组渲染 revert 按钮（补丁 0011 的 fork 按钮正加在它旁边，actions 保留 revert），上游 app 有 session.undo / redo 命令与 revert dock，补丁 0002 / 0010 / 0017 / 0018 未隐藏；候选子项 (2) 重复。TASKS T012「回滚（按计划不做）」与 ARCHITECTURE §7「不擅自实现可能覆盖后续编辑的回滚」明确不做 oco 自有回退；core revert 调 snapshot.restore 整体还原文件，会覆盖用户之后的手工编辑，正是 §7 禁止的形态。结果卡加写操作入口也与 ADR-009 §4「结果卡只读」相悖。若将来用户修订 T012 / §7，宿主入口应与上游同用分阶段 API（/revert/stage、clear、commit）并复用其 dock。剩余动作：嵌入模式目视确认上游 revert 按钮 / dock 可见可用（STATUS 无记录）。可行性审查认为可降为 host-only S，但以边界审查为准。
- M15 生效配置透明面板与 Agent 只读入口：TASKS T013「2026-10-01 用户决定：Agents 视图已移除，暂不做（代码在 2b40651）」，被移除的视图正是只读步（来源 / 范围 / 待生效 / 打开原文）；NEXT §2 将 Agent 定义编辑标 DEFER，触发条件（无人值守运行反复因权限配置出错）未出现；NEXT §4「工具页签按权限标灰、MCP 工具分组」不做，候选的按工具 allow / ask / deny 概要与 MCP 状态是近亲。GET /config 只返回合并结果、无「本会话实际加载的指令文件」接口，只能静态推断，不满足 ARCHITECTURE §8 的来源 / 范围展示要求。若触发条件出现，应从 2b40651 恢复并裁成权限 / 模型子集，而非新造 QuickPick。
- M16 计划一键转实施：OpenCode v1.18.33 自带 plan_exit 工具（tool/plan.ts），plan agent 完成计划后由服务端提问「是否切到 build agent 开始实施」，选 Yes 即以 agent=build 继续；该提问走 /question，收件箱已列为等提问行。剩余差量「提问就地作答」就是 M11，不是 M16 的新增价值；计划本身是 .opencode/plans/*.md 磁盘文件，可直接在 VS Code 编辑后再答 Yes。oco 再加一个「切 build」按钮会与上游 plan_exit 提问并存，两处都点会投递两条实施提示。

## 6. 推荐路线

### 6.1 下一批（≤3 项）

| 项 | 做什么 | 为什么现在 | 层级 / 规模 | 依赖 | 验收要点 |
| --- | --- | --- | --- | --- | --- |
| M10 侧栏一键停止 | SESSIONS 行 / 收件箱行悬停按钮与右键「Stop」；宿主 POST /session/:id/abort（与 permissionReply 同一直连路径）；运行中行显示停止图标，乐观「停止中」以 session.status 回流为准；状态栏悬停「停止全部运行中」需一次确认；停父会话时提示会级联停后台子代理 | 多会话 / 子代理并行时止损路径最短；ADR-009 §1 明确允许 abort；差量只是侧栏消息 + 宿主请求 | sidebar-webview / S | sessions-webview.ts 消息联合类型（不是 contracts/sessions.ts）、session-store busy、Connection REST、状态栏 tooltip 改 MarkdownString | mock E2E：busy 会话从侧栏 Stop → session.status idle 回流、图标恢复、GET /session/status 不再 busy；补 T008 遗留的「真实取消」夹具；发送前核对仍为 busy，过期只提示 |
| M11 提问就地作答 | 等提问行展开问题正文 + 选项按钮 + 自由文本框，多问题逐题展开，收齐所有题答案后一次 POST /question/:id/reply {answers: label[][]}（按问题顺序，custom 以 label 字符串放入）；Reject 保留 Dismiss | 收件箱四类中唯一仍需切面板；NEXT §3 与 §2b P1-2 都以接通回答通道为前提；store 已含 options / multiple / custom，差量小；上游 plan_exit 提问也走这里 | sidebar-webview / M | sessions-webview.ts 新 questionReply 消息、isPending 过期保护、question.asked / replied 事件；core Question.Option / Answer schema 待定位 | mock：3 个后台子代理分别单选 / 多选 / custom 提问，不开面板作答 → GET /question 为空、行消失、状态栏归零；无定时自动作答；长选项在 30 px 行高下折叠 |
| M01 通知分级与 Mark as Unread | 设置拆为「需要我」「已完成」两类三态（off / windowNotFocused / always，默认 windowNotFocused），旧 notifyPending=false 迁为两类 off；失焦判定 window.state.focused；新增命令 Mark Session as Unread（UnreadTracker 公开 add + 手动标记豁免自动清除）；报错不进状态栏计数 | 收件箱落地后多会话通知噪音是第一反馈；全部在宿主，不碰契约与补丁；Mark as Unread 与 M14 共用 | host-only / S | PendingNotifier、UnreadTracker（memento）、onDidChangeWindowState、设置 deprecationMessage | 聚焦 / 失焦两态下 mock 等权限事件只在失焦弹；完成通知三态各验一次；Mark as Unread 后 150 ms 刷新不被抹掉；Remote-SSH 下 focused 语义记录（缺环境标 NOT RUN） |

### 6.2 近期（≤6 项）

| 项 | 调整后形态 | 层级 / 规模 | 前置 |
| --- | --- | --- | --- |
| M12 恢复上游排队模式 | 小补丁在嵌入模式恢复 followup="queue"，复用上游 followup dock；加载时置 paused 显示待确认；立即发送即上游 steer | upstream-patch / S | 查上游把 queue 迁为 steer 的缘由；核实补丁 0009 下 settings.general.followup 开关可见性；窄布局（0003）下 dock 正常 |
| M06 (1a)+(2) Always 预览与 Deny with note | 映射 permission 事件 always[] 只读预览；doom_loop 独立图标；Deny with note 随 reply.message | sidebar-webview + 契约小改（InboxRow.always）/ S | 无；(3) 会话级 Ruleset 待核实后另排 |
| M03 收件箱键盘直达 | 片 1 宿主命令 + QuickPick oco.inbox.next + 父 / 子 / 最近循环；片 2 webview j / k / Enter / Esc / ? | host-only + sidebar-webview / M | 作为 T010 第一片；allow / deny 只作用选中行；默认不绑冲突键 |
| M07 (1)+(2) 压缩入口 | 宿主 oco.compactSession（最近模型跟踪、二次确认、time.compacting 守卫、订阅 compacted）；0019 圆环可点 + 用量拆分 + compacted 条目 | host-only + upstream-patch / S-M | 先核实嵌入模式 compact 命令可达性；核实上游 reducer 是否已渲染 compaction 条目 |
| M05 首片 Problems / Git diff 入草稿 | 「oco: Add to Draft…」QuickPick：Problems（当前文件 / 全部）、Git 工作区 / 暂存 diff；DraftInsert.source 联合类型；截断；排除文件只传路径 | bridge-contract 小改 + host-only / S-M | 契约改动由集成人落地；T011 截断策略随本片一起做 |
| M02 todo 进度 | session-feed 快照加 GET /todo（busy / 可见懒取）+ todo.updated 投影；侧栏行与完成未读行「3/7 步」+ 展开 | sidebar-webview + 契约小改 / M | ADR-009 §2 补一行数据源；环心卡进度另附 0021 后续 |

### 6.3 稍后

- M14 置顶 / 标签 / 稍后处理：第一步 Pin + Mark as Unread（S，可提前到近期）；第二步 Label + Snooze（S），Snooze 不隐藏待批行。
- M13 审阅评论批量回传：首版选区累积 + 一键入草稿（S），排在 Git Review 集成落地后；Comments API 线程第二步。
- M20 子代理导航与聚合：先宿主聚合徽标 + 子行折叠（S），再补丁 pills + chord 键位（S-M）。
- M19 FileDecorationProvider 徽标（S）；同文件重叠提示推至 M09 / M17 落地后。
- M18 导出 Markdown 与分享菜单（S 填充项）：宿主自写 Markdown 组装；share 读 config.share，disabled 隐藏、manual 二次确认、auto 直接复制 session.share.url；SessionListItem 加 shared 标记。
- M17 工作树隔离：先做多 directory 事件流与 ownsDirectory 扩展，再接上游 /experimental/worktree；真实模型回归之后。
- M21a 结果卡 Git 事实灯 + 提交预填（S，中期）；M21b 开 PR（M，取决于 gh 路线 spike）；前置 ADR-009 §4 补节与结果卡真实模型目视。
- M08 Follow 模式（S-M）。
- M06 (3) 会话级 Ruleset、M07 (3) Hand off：核实后另估。
- M09 批量发起：按 NEXT §2 门槛触发，触发后两步走。

### 6.4 只借鉴交互模式、不实现为独立功能

| 模式 | 来自 | 用在 oco 哪里 |
| --- | --- | --- |
| 注意力三分类 + 徽标 + 导航即已读；窗口在后台才发 OS 通知 | Warp、Claude Code、Copilot 三态、Zed | M01 的分类与默认值；收件箱分组顺序 |
| Always 带可见作用范围、规则由服务端记住 | OpenCode TUI、Zed、Claude Code | M06 Always 按钮只读预览；不自建规则库 |
| 审阅意见先攒后发、位置自带 | Kilo、Claude Code 桌面、Copilot、Conductor | M13 首版合成一条 draft.insert |
| 模式 / 权限姿态就在输入框旁 | Claude Code、Codex、Copilot、Continue | 不做新控件；上游 composer 的 agent 选择器已承载，M06(3) 若做只加徽标 |
| 撤销挂在消息上，明示只还文件 | Cursor、Zed、Cline、Copilot | 上游 revert 按钮已在消息上；只需目视验证与文案 |
| 在发送处 / 新建时选运行位置（Local / Worktree） | Cursor、Copilot、Cascade、Conductor | M17 的「新建会话」入口单选项 |
| 三义发送按钮（Queue / Steer / Stop and Send） | Copilot、Zed、Amp | M12 复用上游 queue + steer，不自绘分裂按钮 |
| handoff 按钮代替调度；计划是文件 | Copilot、Cursor、Claude Code | 上游 plan_exit 与 .opencode/plans 已覆盖；只在 M11 提问行附计划路径链接 |
| 子代理 pills 在父视图头部、列表行默认折叠 | Warp、Roo | M20 |
| 时间衰减的侧栏（Pinned → Active → Inactive 折叠 → Snoozed → Archived） | Amp、Copilot、Claude Code | M14 分区顺序 |
| 规则与权限以仓库文件为真源、UI 只是编辑器 | Cascade、Trae、Augment、Claude Code | 若恢复 2b40651 Agents 视图时沿用；不引入新格式 |
| 播报纪律：完成只播报一次、恢复静默、Focus last message | Claude Code | T010 / M03 验收清单 |
| 深链闭环（外部通知一键回到会话） | Cursor Bugbot、Zed zed://agent | 稍后：vscode://<publisher>.oco URI handler，投递前须确认 |
| 一标签一会话、做完即关 | OpenCode 桌面 Tabs | 维持 ADR-007 单主面板 + 固定面板，不自绘标签栏 |
| 状态优先的列式行（Status / Duration / Cost）+ Blocked 终态 | Warp、Continue CLI | M09 触发后的批次分组视图 |

### 6.5 不建议 / 维持不做

| 项 | 原因 |
| --- | --- |
| M04 oco 自有回退入口 | 上游嵌入视图已有；TASKS T012 / ARCHITECTURE §7 标为不做；覆盖后续手工编辑 |
| M15 Agent 只读面板 / 生效配置 QuickPick | 用户 2026-10-01 已移除同类视图；NEXT DEFER 触发条件未出现；API 无法区分来源 |
| M16 计划一键转实施 | 上游 plan_exit 已做；并存会重复投递；剩余差量就是 M11 |
| 内置 cron / Routines / Automations / Cloud agents / autopilot 盯 PR | ADR-009 §1 不做定时器与调度引擎；夜间批量用脚本包 opencode run 交 launchd |
| 多模型并行比较（/best-of-n、Kilo Agent Manager 多模型） | 显式不做 |
| 完整终端 / PTY、内嵌终端标签 | 显式不做；VS Code 终端原生 |
| 独立 Agents Window / 看板 UI | Vibe Kanban 关停、Crystal 停更证明独立面板难持续；oco 留在 VS Code 侧栏内 |
| 客户端 shadow git / checkpoint（Cline / Roo 式） | 重复存储且违反 ADR-009；上游已有 git 快照 |
| 客户端自动代答权限（上游 app autoaccept 式）、Auto 分类器、Assisted permissions | 权限判定必须在服务端（ARCHITECTURE §9） |
| Roo 式队列隐式批准；Roo 式追问超时自动作答 | 绕过收件箱审批；需定时器 |
| 完成提示音 | 合并阶段丢弃：显式不做声音；Remote 场景 webview audio 不可用 |
| worktree setup 脚本系统 / 自动跑 tasks.json | 合并阶段丢弃：接近宿主代用户执行命令；M17 落地后按失败案例再议 |
| Chat Participant / Language Model Tools / chatSessionsProvider 接入 | 依赖 Copilot 计费或 proposed API，UI 分裂 |
| 客户端复刻权限 glob 求值作「本批有效权限」预览 | 等于第二套权限判定；最多原样展示 GET /agent 规则 |
| 自动提交（Aider --auto-commits 式）、自动修复 CI | 与用户 git 习惯冲突；后台轮询触碰定时器 |
| Prompt Enhancer、内置浏览器预览、语音输入、MCP marketplace、Memory Bank、repo map / 文档集索引 | 推理侧或服务端能力，oco 不做 |
| 工具页签按权限标灰、MCP 工具分组、记录原始系统提示词 | NEXT §4 维持不做 |

## 7. 未确认项与开放问题

### 7.1 需用户决策

1. M04：是否修订 TASKS T012 / ARCHITECTURE §7 的「回滚不做」。本文建议维持不做，只做嵌入模式目视验证上游 revert 按钮与 dock。
2. M21：是否在 ADR-009 §4 追加「git 动作」一节（宿主侧一次性操作、数据源 VS Code git 扩展、不进 SessionStore、不自动提交 / 推送）。不补则 M21 不立项。
3. M02：是否允许在 ADR-009 §2 的收件箱数据源中加入 GET /session/:id/todo（经 session-feed 快照路径）。
4. M09：NEXT §2 的 DEFER 门槛（常一次发起 ≥3 个独立任务）是否仍成立；本文建议维持。
5. M15：是否恢复 2b40651 的 Agents 视图并裁成权限 / 模型子集；触发条件未出现，本文建议不恢复。
6. M18：是否恢复会话分享入口（生成公网链接，受 config.share 约束并二次确认）。
7. 键位默认值：是否与官方 opencode 扩展的 cmd+esc / cmd+alt+k 对齐（两扩展并存会冲突）；本文建议只声明命令、最多给 focus 一个默认键。
8. Aider watch files 式「AI! / AI? 注释触发」未进候选（本批三视角合并时未保留）；是否另议为独立候选（默认关、按保存防抖、限定工作区、收件箱留痕）。
9. T018 publisher / 许可证仍待用户决定（与本次调研无关，顺带记录）。

### 7.2 待核实（vendor / 运行时）

| 事项 | 影响 | 建议核实方式 |
| --- | --- | --- |
| 嵌入模式下上游命令面板 compact / share / export / undo 是否可达（0002 EMBEDDED_HIDDEN 只去 session.new、terminal.*；Cmd+K 在 VS Code webview 内未实测） | M07(1)、M18 的优先级；M04 验证项 | look-local 回放 + 键盘触发 |
| Session-header Share 按钮在 0017 / 0018 下是否存活 | M18 | 目视 |
| 上游 settings.tsx 把 followup queue 强制迁为 steer 的原因；Reload 后 followup.v1 自动投递 | M12 | 读上游提交 / changelog |
| PATCH /session.permission Ruleset 与 prompt 时 setPermission 的覆盖 / 合并顺序；evaluate 对 "*" 的语义 | M06(3) | 读 vendor session/prompt.ts、permission/index.ts |
| /experimental/worktree 在 attached / managed 下可用性；非 git / 浅克隆错误形态；多目录 /event 或 /global/event 可行性 | M17 | 两种模式各发一次 POST |
| /experimental/session/:id/background 语义（未读实现） | 暂无候选 | 读 vendor |
| vscode.window.state.focused 在 Remote-SSH / 多窗口下语义 | M01 | 实测或标 NOT RUN |
| Problems 视图 view/title 贡献点可用性；shell integration 在远程 / 旧版 VS Code | M05 第二片 | 实测 |
| .gitignore 命中判断无 VS Code 公共 API | M05 | 自实现匹配或 git 子进程 |
| core Question.Option / Answer schema（custom 自由文本是否任意字符串） | M11 | 读 vendor core |
| SSE 事件名 permission.asked vs SDK gen 的 permission.updated；SDK types.gen.ts 多处过时（Session 无 permission、无 /question） | 契约依据 | 以 httpapi/groups 与 schema 包为准，不用 sdk gen |
| session.next.* 事件（仅 TUI 内部） | 无 | 不用 |
| 结果卡真实模型目视 NOT RUN | M21 前置 | NEXT §1 |
| 嵌套 ≥2 层子代理 mock 夹具 | M20 验收 | NEXT §3 |
| 上游 reducer 是否已渲染 session.compaction.* 条目 | M07(2) 避免重复 | 读 server-session-v2-reducer.ts |

### 7.3 参考项目中未核实的说法（引用时标「未确认」）

- Cursor：Review Changes 文件级 / 块级 Accept / Reject、run-modes、worktrees.json schema、Agent Tabs 网格、Side Chats、3.3 / 3.6 版本号与日期（官方页 404 或第三方）。
- Roo：concurrent-file-edits 页面 404；Roomote 定价互相矛盾。
- Kilo：worktree 上 PR 状态徽标、就地运行脚本、内嵌终端标签来自营销页摘要；7.4.x 条目来自 releasebot 聚合。
- Cline：Focus Chain UI 细节、@problems / @terminal 现状、Auto Compact 文案自相矛盾。
- Claude Code：Program Status Protocol、agent-view 页后 1/4、changelog 2.1.287 以前未读。
- Copilot：chatSessions 贡献点字段、Agent Host 进程细节（二手报道）、usage-based billing 后用量面板、Chat Participant 在 agent mode 可用性。
- Zed / Continue：Zed 无公网 Share Thread（仅 Markdown 导出与深链）；Rules Library 改 Skills 为第三方说法；Continue IDE 会话历史 / Accept-Reject 页面 404。
- OpenCode：桌面 Review 面板逐项 accept / reject 与行内评论（单一评测）；桌面 Tabs 快捷键；worktree 时间表（第三方转述）；v1.18.15 / 1.18.20 changelog 条目版本号在镜像间冲突。
- 驾驭舱类：Warp 通知页抓取 404；Crystal 功能来自第三方摘要；Codex 条目全部来自聚合站；Vibe Kanban 每 attempt 独立 worktree 来自第三方；Amp 移除公开分享单一来源；Conductor llms-full.txt 后 177k 字符未读。
- Windsurf / Augment / Trae / Aider：Turbo mode、Flows 未见于抓取内容；changelog 仅读前 100k；Augment Remote Agents 等价物 Cosmos 页面未抓取；Trae Builder / SOLO / Auto mode 未抓取；Aider 每条回复的 Cost 行未经页面核实。

## 8. 来源索引

### Cline / Roo Code / Kilo Code
- https://docs.cline.bot/features/checkpoints
- https://docs.cline.bot/features/auto-approve
- https://docs.cline.bot/features/cline-rules
- https://docs.cline.bot/features/focus-chain
- https://docs.cline.bot/features/at-mentions/overview
- https://docs.cline.bot/core-workflows/working-with-files
- https://docs.cline.bot/features/tasks/task-management
- https://docs.cline.bot/getting-started/task-management
- https://docs.cline.bot/features/memory-bank
- https://roocodeinc.github.io/Roo-Code/features/boomerang-tasks
- https://roocodeinc.github.io/Roo-Code/features/auto-approving-actions
- https://roocodeinc.github.io/Roo-Code/features/message-queueing
- https://roocodeinc.github.io/Roo-Code/basic-usage/context-mentions
- https://kilo.ai/docs/code-with-ai/platforms/vscode/whats-new
- https://blog.kilo.ai/i/192608130/the-agent-manager
- https://thenewstack.io/roo-code-cloud-ides-ai-coding/
- https://roomote.dev/product/cloud-agents
- https://releasebot.io/updates/kilo-org/kilocode
- https://kilo.ai/code
- https://github.com/Kilo-Org/kilocode/
- https://fast.io/resources/cline-token-usage/

### Cursor
- https://cursor.com/docs/agent/agents-window
- https://cursor.com/docs/cloud-agent
- https://cursor.com/docs/context/rules
- https://cursor.com/docs/context/mentions
- https://cursor.com/docs/agent/review
- https://cursor.com/docs/agent/chat/checkpoints
- https://cursor.com/docs/agent/planning
- https://cursor.com/docs/subagents
- https://cursor.com/docs/bugbot
- https://cursor.com/changelog
- https://cursor.com/docs/llms.txt
- https://www.datacamp.com/blog/cursor-3
- https://www.rapidevelopers.com/blog/cursor-changelog-every-release-update-new-feature
- https://www.agentpatterns.ai/tools/cursor/agents-window/
- https://developertoolkit.ai/en/cursor-ide/build/agents-window/
- https://techdevnotes.com/releases/cursor-docs/20260626-202020Z-6c7064724f5e/content/pages/agent/agents-window.txt

### Claude Code
- https://code.claude.com/docs/en/vs-code
- https://code.claude.com/docs/en/desktop
- https://code.claude.com/docs/en/permissions
- https://code.claude.com/docs/en/permission-modes
- https://code.claude.com/docs/en/checkpointing
- https://code.claude.com/docs/en/sessions
- https://code.claude.com/docs/en/worktrees
- https://code.claude.com/docs/en/agent-view
- https://code.claude.com/docs/en/interactive-mode
- https://code.claude.com/docs/en/memory
- https://code.claude.com/docs/en/costs
- https://code.claude.com/docs/en/hooks-guide
- https://code.claude.com/docs/en/remote-control
- https://code.claude.com/docs/en/common-workflows
- https://code.claude.com/docs/en/routines
- https://code.claude.com/docs/en/desktop-scheduled-tasks
- https://code.claude.com/docs/en/changelog

### GitHub Copilot / VS Code Agents
- https://code.visualstudio.com/docs/agents/sessions/chat-sessions
- https://code.visualstudio.com/docs/agents/run/sessions/manage-sessions
- https://code.visualstudio.com/docs/agents/run/approvals
- https://code.visualstudio.com/docs/agents/run/tools
- https://code.visualstudio.com/docs/agents/reference/tools-reference
- https://code.visualstudio.com/docs/agents/run/review-code-edits
- https://code.visualstudio.com/docs/agents/agent-types/cloud-agents
- https://code.visualstudio.com/docs/agents/agent-types/third-party-agents
- https://code.visualstudio.com/docs/agents/concepts/agent-harnesses
- https://code.visualstudio.com/docs/agents/run/agent-harnesses
- https://code.visualstudio.com/docs/copilot/customization/custom-agents
- https://code.visualstudio.com/docs/copilot/customization/custom-instructions
- https://code.visualstudio.com/docs/copilot/chat/copilot-chat-context
- https://code.visualstudio.com/docs/copilot/chat/chat-agent-mode
- https://code.visualstudio.com/docs/agents/reference/ai-features-cheat-sheet.md
- https://raw.githubusercontent.com/microsoft/vscode/main/src/vscode-dts/vscode.proposed.chatSessionsProvider.d.ts
- https://code.visualstudio.com/api/extension-guides/ai/tools
- https://code.visualstudio.com/api/extension-guides/ai/chat
- https://github.blog/changelog/2026-10-01-github-copilot-in-vs-code-september-2026-releases
- https://github.blog/changelog/2025-07-14-start-and-track-github-copilot-coding-agent-sessions-from-visual-studio-code/
- https://docs.github.com/en/enterprise-cloud@latest/copilot/how-tos/use-copilot-agents/cloud-agent/use-cloud-agent-in-your-ide
- https://code.visualstudio.com/docs/copilot/faq
- https://docs.github.com/en/copilot/reference/copilot-billing/model-multipliers-for-annual-plans
- https://www.helpnetsecurity.com/2026/07/16/vs-visual-studio-code-agent-host/
- https://visualstudiomagazine.com/articles/2026/07/23/vs-code-1-130-expands-agent-host-and-review-tools.aspx?p=1
- https://deepwiki.com/microsoft/vscode/7.5-copilot-cli-and-cloud-sessions

### Continue / Zed
- https://zed.dev/docs/ai/agent-panel
- https://zed.dev/docs/ai/external-agents
- https://zed.dev/docs/ai/tool-permissions
- https://zed.dev/docs/ai/agent-profiles
- https://zed.dev/docs/ai/agent-settings
- https://zed.dev/docs/ai/rules
- https://zed.dev/releases/preview/0.226.0
- https://zed.dev/blog/bring-your-own-agent-to-zed
- https://zed.dev/blog/jetbrains-on-acp
- https://agentclientprotocol.com
- https://github.com/zed-industries/zed/discussions/42381
- https://git.secluded.site/zed/commit/4ac67ac5aef9c35333eaaf7d5e3522ca74f4edd1
- https://git.secluded.site/zed/commit/ad69357968abf8d06ce7fd34b2554f70143cebe9
- https://docs.continue.dev/ide-extensions/agent/how-it-works
- https://docs.continue.dev/ide-extensions/agent/how-to-customize
- https://docs.continue.dev/cli/tool-permissions
- https://github.com/continuedev/continue/blob/main/extensions/cli/README.md
- https://docs.continue.dev/agents/overview
- https://docs.continue.dev/reference
- https://docs.continue.dev/customize/deep-dives/rules
- https://blog.continue.dev/what-are-continue-agents-any-workflow-your-teams-way

### OpenCode 官方
- https://opencode.ai/docs/keybinds/
- https://opencode.ai/docs/permissions/
- https://opencode.ai/docs/agents/
- https://opencode.ai/docs/commands/
- https://opencode.ai/docs/tui/
- https://opencode.ai/docs/server/
- https://opencode.ai/docs/plugins/
- https://opencode.ai/docs/ide/
- https://opencode.ai/docs/share/
- https://opencode.ai/docs/rules/
- https://opencode.ai/docs/skills/
- https://opencode.ai/docs/references/
- https://opencode.ai/docs/tools/
- https://opencode.ai/docs/acp/
- https://opencode.ai/docs/web/
- https://opencode.ai/docs/zen/
- https://opencode.ai/docs/policies/
- https://github.com/anomalyco/opencode/releases
- https://github.com/anomalyco/opencode/issues/52348
- https://github.com/anomalyco/opencode/issues/36064
- https://www.gradually.ai/en/changelogs/opencode/
- https://www.mejba.me/blog/opencode-desktop-app-review
- https://explainx.ai/blog/opencode-desktop-tabs-sessions-worktrees-july-2026
- https://alternativeto.net/news/2026/7/opencode-desktop-adds-tabbed-sessions-for-improved-workflow/
- https://arceapps.com/blog/opencode-frontends-comparison-2026/
- https://github.com/NeuralNomadsAI/CodeNomad
- https://github.com/4nkitd/opencode-workspace-sidebar
- 本地：vendor/opencode/sdks/vscode（官方 VS Code 扩展 v1.18.33）；vendor/opencode/packages/opencode/src/server/routes；vendor/opencode/packages/app/src

### 多 agent 驾驭舱类
- https://www.conductor.build/llms-full.txt
- https://www.conductor.build/workflows/run-parallel-claude-codes
- https://codepick.dev/en/guides/conductor-build-intro/
- https://raw.githubusercontent.com/BloopAI/vibe-kanban/main/README.md
- https://vibekanban.com/blog/shutdown
- https://cdn.jsdelivr.net/gh/smtg-ai/claude-squad@main/README.md
- https://github.com/stravu/crystal
- https://rywalker.com/research/crystal
- https://docs.warp.dev/agent-platform/cloud-agents/managing-cloud-agents
- https://docs.warp.dev/agent-platform/capabilities/agent-notifications.md
- https://ampcode.com/docs/threads
- https://ampcode.com/manual
- https://hackernoon.com/sourcegraph-spinoff-amp-rolls-out-thread-map-to-manage-agent-workflows
- https://learn.chatgpt.com/docs/codex/ide.md
- https://learn.chatgpt.com/docs/features.md
- https://www.gradually.ai/changelogs/codex-app/
- https://community.openai.com/t/introducing-the-codex-ide-extension/1354930
- https://codex.danielvaughan.com/2026/04/01/codex-ide-extension-vs-code-jetbrains/
- https://developers.openai.com/codex/ide/features

### Windsurf Cascade / Augment / Trae / Aider
- https://docs.devin.ai/desktop/cascade/cascade
- https://docs.devin.ai/desktop/cascade/memories
- https://docs.devin.ai/desktop/changelog
- https://docs.augmentcode.com/using-augment/agent
- https://docs.augmentcode.com/using-augment/tasklist.md
- https://docs.augmentcode.com/cosmos/sessions-overview.md
- https://docs.augmentcode.com/cli/permissions.md
- https://docs.augmentcode.com/llms.txt
- https://www.trae.ai/blog/product_thought_0421
- https://docs.trae.ai/ide/subagents
- https://docs.trae.ai/ide/ide-settings-overview
- https://docs.trae.ai/ide/rules
- https://www.trae.ai/blog/product_thought_0609
- https://aider.chat/docs/usage/commands.html
- https://aider.chat/docs/usage/watch.html
- https://aider.chat/docs/usage/modes.html
- https://aider.chat/docs/repomap.html
- https://aider.chat/docs/config/options.html

### 仓库内证据（审查引用）
- docs/adr/009-multi-agent-cockpit-boundary.md、docs/adr/007-single-main-panel.md、docs/ARCHITECTURE.md §6–§9、docs/TASKS.md T008 / T010–T013 / T018、docs/NEXT.md §1–§4、docs/STATUS.md
- docs/evidence/cockpit-result-card-2026-10-10.md、docs/evidence/cockpit-inbox-2026-10-10.md、docs/evidence/session-diff-scope-2026-10-10.md
- apps/extension/src/{sessions-view,sessions-webview,session-store,session-groups,session-feed,connection,panels,extension,open-file-policy,managed-server}.ts；apps/extension/media/sessions-list/index.js；apps/extension/package.json
- packages/contracts/src/{bridge,sessions}.ts；patches/opencode/0001、0002、0004、0005、0009、0011、0016–0021
- vendor/opencode/packages/opencode/src/{server/routes/instance/httpapi/groups,session,permission,worktree,snapshot,tool}；vendor/opencode/packages/schema/src；vendor/opencode/packages/app/src/{pages/session.tsx,context/settings.tsx,context/permission.tsx}；vendor/opencode/packages/sdk/js/src/gen/types.gen.ts（已标注过时处）

## 委派记录

用户本轮以 `/workflow-authoring` + ultracode 明确选择 Workflow 多代理编排，因此按 AGENTS.md「委派与 token 预算」的例外条款记录：任务主体由 Claude 子代理（Workflow 内 `agent()`，模型继承会话 claude-fable-5-1）执行，未走 Gemini / Grok 订阅路线。主线程只做范围设计、脚本编排、结果抽检与本节记录。

| task_id | 唯一写入范围 | requested_route | actual_provider/model | agent_id/run_id | 状态 | 结果路径 | fallback_reason / 备注 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| wf-run1（盘点 2 + 调研 8 + 提案 3 + 合并 1 + 审查 42 + 合成 1 = 57） | 只读；合成代理独写本文件 | claude-subagent/fable（Workflow，用户 ultracode 选择） | anthropic / claude-fable-5-1（Workflow 继承会话模型，hook 未改写） | wf_90a15ff9-542（task wvfz67sdj） | 部分失败：14 返回、43 失败 | journal.jsonl（见下） | 审查与合成阶段全部报「session limit · resets 21:50 Asia/Shanghai」；31.7 min，249 次工具调用，子代理 1.62M tokens |
| wf-run2（从缓存续跑：14 复用 + 批量审查 12 + 合成 1） | 同上 | claude-subagent/fable（同上） | 同上 | wf_90a15ff9-542（task ww3g8y0bz，resume） | 已返回，27/27 成功 | 本文件（643 行） | 等 21:50 重置后续跑；审查阶段改为每 4 候选一批 × 2 视角以降低再次撞额度概率；29.4 min，300 次工具调用，子代理 1.66M tokens |
| 主线程抽检 | 无写入 | — | — | — | 已完成 | 本节 | 用 grep 复核 4 条源码结论：followup 排队设置被迁为 steer 在 `packages/app/src/context/settings.tsx` 第 371–372、389–394 行（命中，审查员引用的行号正确）；`backgroundSubagents` 在 `server/routes/instance/httpapi/{groups,handlers}/experimental.ts`（命中，2 个文件）；`tool/plan.ts` 含 `plan_exit`（命中）；opencode core 源码含 steer 字样的文件 1 个（命中；「busy 会话再次 prompt 为 steer」的具体行号以审查员引用为准，主线程未逐行复核）。合成文档的 §1 / §5 / §6.1–6.2 / §7.1 经主线程通读。 |
0 处（未命中，busy 投递语义以审查员引用的行号为准） |

- 完整每代理返回：`~/.claude/projects/-Users-xiaojiang-Ai-Project-oco/338caa14-423e-4397-9f21-5dfda62ec83e/subagents/workflows/wf_90a15ff9-542/journal.jsonl`（会话目录，不入库）。
- 未走订阅路线的原因：用户本轮显式指定 Workflow（ultracode）；非路由故障。Gemini / Grok 本批未探测，不记状态。
- 本文件只是调研证据，不更新 STATUS / NEXT；采纳哪些候选由用户决定后再立项。
