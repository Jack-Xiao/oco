# Competitor Session-Diff Research Checkpoint (2026-10-10)

## 1. Claude Code (Desktop & CLI)
- **范围与机制**: Claude Code Desktop 可在新会话时选择 Git worktree，实现多会话并行与环境隔离（不是所有会话强制使用 worktree），其变更检查和隔离依赖 Git 分支与工作树（worktree-based isolation）；文档未足以判定其内部是否有额外 session diff 实现；CLI 变更亦直接作用于当前 Git 工作副本。
- **精确 URL**: `https://code.claude.com/docs/en/desktop`
- **支持摘录**:
  - Description: "Get more out of Claude Code Desktop: parallel sessions with Git isolation, drag-and-drop pane layout, integrated terminal and file editor, side chats, computer use, Dispatch sessions from your phone, visual diff review, app previews, PR monitoring..."
  - Worktree: "Sessions that run in their own worktree need Git. If you see... On Windows, Claude Desktop versions before 1.49585.0 asked for Git before starting any local session; if you see that prompt and aren't using worktrees, update..."
- **Session 归属确认**: 严格会话级独立 diff 系统为 **unknown**（文档说明 Git worktree 隔离与 diff 审查，未给出足以确认内部实现或严格 session 归属的定义）。

## 2. Cursor (Agent Mode)
- **范围与机制**: Cursor Agent 的变更直接实时写入当前工作区（working tree）文件，审查（Review changes）通过编辑器的实时 Diff View 进行行级/文件级拒绝或接受；撤销/回滚则基于消息时间线的 Checkpoint（Restore Checkpoint）机制。官方文档未定义独立的跨多轮 session-diff 系统，多轮修改累积在工作树中。
- **精确 URL**: `https://cursor.com/help/ai-features/agent` (文档重定向至 `https://docs.cursor.com/agent`)
- **支持摘录**:
  - Review changes: "Agent's edits are applied as it works. Review them in the diff view and reject anything you don't want. For PR-level reviews, [review locally / PR]..."
  - Checkpoint / Multi-turn: "How do I undo Agent changes? Hover over any previous message and click **Restore Checkpoint** in the bottom right to roll back all changes Agent made after that point. Restoring reverts files..."
- **跨多轮审查确认**: 官方文档明确支持按消息卡片“Restore Checkpoint”回滚多轮修改，但 Review changes 本质为工作区实时 diff，官方**未明确**提供脱离 Git/Checkpoint 的跨多轮独立 Diff 会话对比系统。


## 主线程复核

- 官方未明确提供某机制，不等于能证明没有自研该机制；不采用“双方均未自建 session diff 服务”的过度推断。
- Cursor Agent 页面由主线程实际打开，确认实时 diff 与消息 checkpoint；不能由此断言它的 Review 就等于全工作区 git diff。
- 执行元数据与委派台账集中于 [本批证据](session-diff-scope-2026-10-10.md)，实际任务 run 为 `gem-mv2flzd1-cqnjz`；`gem-mv2fkj04-429jy` 仅为健康探测。

- Claude Desktop 主线程打开官方 HTML 并核对正文：Review changes with diff view 描述文件列表 / 逐行评论；Work in parallel with sessions 指明在分支名旁选择 worktree 选项获得隔离目录。不能把 worktree 说成所有会话的必选项。
