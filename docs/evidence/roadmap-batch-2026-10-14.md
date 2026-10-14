# Roadmap 批次（2026-10-14，分支 claude/roadmap-batch-2026-10-14）

来源：用户 2026-10-14「做下去……不要做耗时的测试（睡觉时再做）……省 token 全部完成」。范围 = 路线图里不需要用户决策的剩余项 + NEXT §1 / §2b / §3 的可改代码欠账。耗时的 E2E 与真实模型目视放到夜间卡（见 NEXT §0 卡 7）。

不做（需用户决策）：M21、M18、M15、M04、默认键位、Aider 式注释触发、T018、M13 composer chip（需扩 DraftInsert 契约与补丁 0001）。

## 契约（主线程）

- `inbox-actions.ts` `answerPending(client, store, refresh, id, answer)`：侧栏与 QuickPick 共用；`answer = permission {reply, message?} | questionReply {answers} | questionReject`。permission 的 `message` 随 `POST /permission/:id/reply` 发送（M06(2)）。提交 6b84c4d。
- `FeedDeps.onEvent?(e)`：store 应用后对每个实时事件回调，异常吞掉；M08 Follow 的数据源。提交 b9e4842。
- 侧栏消息新增：`permissionReply.message?`；`{type:"label", ids, label: string|null}`；`{type:"snooze", ids, snoozed}`。WebRow 新增 `label?`、`snoozed?`；WebListModel 新增 `labeled: {label, rows}[]`、`snoozed: WebRow[]`。InboxEntry 新增 `always?`、`patterns?`。
- 分区优先级：Pinned > 标签 > 其余（父会话 / 时间不变）。Snooze 不隐藏等权限 / 等提问 / 运行中行，不减少状态栏计数，下一条消息到达或手动取消即唤醒。标签与 Snooze 为本地元数据，UI 标注不随机器同步。
- 宿主命令（无默认键位，键位待用户决定）：`oco.inbox.next`、`oco.session.parent`、`oco.session.child`、`oco.session.nextSibling`、`oco.session.previousSibling`、`oco.session.recent`、`oco.follow.toggle`。
- 上游补丁：本批 vendor 改动不改写既有补丁，另起 `0024`（标题行子代理 pills）与 `0025`（运行视图 M5 遗留），便于按顶层补丁再生成。

## 委派记录

健康检查：gemini-worker 最小请求通过（Gemini 3.8 Flash 自报，gem-mv86hxn9-gsa69，25s）；grok-worker 最小请求通过（grok-4.6 自报，run-mv86hxq2-3aoheu，18s）。

| task_id | 唯一写入范围 | requested_route | actual_provider/model | agent_id/run_id | 状态 | 结果路径 | fallback_reason / 接手理由 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| b14-contract | `inbox-actions.ts`、`sessions-webview.ts` 三个分支、`session-feed.ts` onEvent、本文件 | 主线程 | — | — | 完成 | 6b84c4d、b9e4842 | 公共契约由主线程负责 |
| b14-sidebar | M06 (1a)(2)、M14 第二步、M03 片 2、懒取上限 | gemini-worker | — | — | 运行中 | — | — |
| b14-host | M03 片 1、M19、M08、M13 第二步（Comments API）、bridge-policy realpath | gemini-worker | unknown | gem-mv86o1tc-v4wac（22 次工具调用，36 分钟） | 已返回（typecheck 0；本批 7 份单测 57/0；主线程复核发现 2 处 `as any` 读私有字段，待改公共方法） | inbox-nav.ts、file-decorations.ts、follow-mode.ts、review-threads.ts | — |
| b14-pills | vendor：标题行子代理 pills（M20 第二步） | grok-worker | xAI grok-4.7（自报） | run-mv86o9bn-tp1xo3（7 次工具调用，12 分钟） | 已返回（vendor typecheck 0；未 build） | 补丁 0024（3 文件） | Grok 写沙箱只放行 vendor/opencode |
| b14-runtime | vendor：§2b P1-2 / N2 / N3 / P3-9 / P3-10 | grok-worker | unknown | run-mv86ohkj-d8obc2（19 次工具调用，31 分钟） | 已返回（vendor typecheck 0；ring / i18n 单测 131/0；未 build） | 补丁 0025（11 文件） | 同上 |
| b14-tests | E2E 测试侧：助手超时 / socket 短路径、c4 / c5 modelMode、夜间运行脚本 | claude-subagent/sonnet | Claude Sonnet（自报 unknown） | afe3d392（44 次工具调用，约 6 分钟） | 已返回（node --check 5 文件过；bash -n 过；unit 35/0；E2E NOT RUN 待夜间） | [tests](roadmap-batch-2026-10-14-tests.md) | E2E 测试侧归 Claude 子代理；本批不跑长测试 |

| b14-review | 只读：本批 diff + 补丁 0024 / 0025 | grok-worker | unknown | run-mv8815fa-opnc9k（9 次工具调用，14 分钟） | 已返回：5 处缺陷，主线程全部修复（25f3f9a） | 本节下方 | — |
| mini-card7 | tests/e2e c18–c24、测试侧修复、Follow 与 0025 窄布局两处产品修复 | Mac mini 执行机（claude -p sonnet） | unknown | tmux mini-card7（约 4 小时） | 已返回并合入：21 mock 套件全过，p1b-narrow 10/10，c4 / c5 真实模式 BLOCKED（big-pickle 403），18 张目视图 | [mini-card7](mini-card7.md) | — |
| mini-nested | tests/e2e c25 + mock 孙会话；子代理汇总 waiting 优先于 running | Mac mini 执行机（claude -p sonnet） | unknown | tmux mini-mini-nested | 已返回并合入：c25 3×6/0，c17 5/0、c23 2/0、c5 43/0；注意：pills 文件（属 0024）的修改被放进了 0025，功能等价，下次动 0024 时挪回；误停 oco-card1 遗留的 4518 mock 服务（已通知） | [mini-nested](mini-nested.md) | — |
| b14-integrate | `file-decorations.ts` / `extension.ts` 两处 `as any` 改为 `SessionStore.changedFiles` / `SessionsView.isUnread`；评审修复；打包安装 | 主线程 | — | — | 完成 | a777993、25f3f9a | 集成与评审修复由主线程负责 |

## 评审修复（25f3f9a）

1. `sessions-view.ts` snooze 唤醒把不在当前列表（搜索、未加载页、快照前）的会话也清掉并持久化 → 只在会话出现且 `time.updated` 变大时唤醒。
2. `bridge-host.ts` 未传 loopback，`BridgePolicy` 默认 true，非 loopback 也 realpath → 默认改 false，宿主按 `isLoopbackHost` 传入。
3. `review-threads.ts` 意见路径是 `asRelativePath`（工作区文件夹相对），线程却按会话目录解析 → 按工作区文件夹查找存在的文件。
4. `follow-mode.ts` 面板关闭后仍跟随 → 新增 `isOpen` 依赖，活动会话变化与事件到达时清理。
5. `follow-mode.ts` 任何文档变更都算用户编辑（代理写盘重载也算）→ 只算活动编辑器里使文档变脏的变更。

修复未加专门单测（夜间 c19 / c21 / c22 覆盖）；修复后 typecheck 0、unit 422/0。

## 验证（25f3f9a）

- typecheck 0；unit 422/0（30 文件）；vendor app typecheck 0、运行视图 ring / i18n 单测 131/0；`bun run build:webview` 28 s PASS；build:extension + package PASS；本机安装 `oco-0.0.4-25f3f9a.vsix`，extension.js sha256 `39d7d70d…` 与打包一致。
- NOT RUN：全部 E2E（新功能 c18–c24 待写）、真实模型目视、p1b-narrow 循环、c4 / c5 真实模式。见 NEXT §0 卡 7。

## 其他

- Mac mini（卡 4 遗留）：2026-10-14 ssh 核对 `/Users/jarvis/Ai-Project/oco` 在 main `9c54524`，与 origin/main 一致，已是最新；两个 `locked` 的 bridge worktree 属其他会话，未动。
