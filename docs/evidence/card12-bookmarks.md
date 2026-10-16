# 卡 12：消息级书签 M22（2026-10-16，Mac mini 会话，分支 claude/card12-bookmarks）

对应 Claude Code 2.1.286 VS Code Bookmarks：钉住某条消息，侧栏会话下列出，点击打开会话并跳到该轮。

## 调查（Grok run-mva9g674-xjti0g，只读 3 m 13 s）要点

- 存储：宿主 `Memento`，与 `oco.pinnedSessions` / `oco.sessionLabels` 同处（`sessions-view.ts:25-27、159-174`）；新键 `oco.messageBookmarks`。connectionId 取面板 binding，不信页面自报。
- 入口须经桥（0011 fork 不经桥）。跳转只能落到用户消息锚点：`applyHash` 只认已加载用户消息（`use-session-hash-scroll.ts:110-118`），助手行 `data-message-id` 是其轮次的用户消息 id → 书签带 `anchorId`。
- 打开：`Navigate` 无滚动字段；`panels.open` 已打开时只有 review 才 `sendNavigate`（`panels.ts:143-147、171-173`）；`apps/chat-webview/src/app.tsx:235-256` 同会话直接 return。
- 侧栏：复用子代理子列表（`sessions-view.ts:88-99、483-514`；`media/sessions-list/index.js:676-685、861-909、401-406`）。

## 契约（主线程，`packages/contracts/src/bridge.ts`）

- `UiAction` 加 `"bookmark"`；`Ui` 加 `messageId?`、`anchorId?`（≤200 字符）；bookmark 必须带 sessionId / messageId / anchorId，`body` 为摘要（宿主再截 80 字）。
- `Navigate` 加 `messageId?`（滚动目标 = 用户消息 id）。
- v1 只做「加书签」（重复为 no-op，宿主提示一次）；删除在侧栏书签子行上做；页面不显示已收藏状态。

## 分工

- A 补丁 0027（vendor）：`platform.tsx` 加 `ocoBookmarkMessage?`；用户 / 助手消息操作行书签按钮（仅当该钩子存在 = 嵌入）；message-timeline / session.tsx 接线；i18n en / zh。
- B 宿主：chat-webview `app.tsx` 实现钩子 → `ui("bookmark")`，并处理 `Navigate.messageId`（设 `#message-{id}`）；panels.ts 存书签 + `open(…, messageId)`；sessions-view / sessions-webview / `media/sessions-list/index.js` 子列表（打开、删除）；单测。

## 委派记录

| task_id | 唯一写入范围 | requested_route | actual_provider/model | agent_id/run_id | 状态 | 结果路径 | 备注 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| c12-investigate | 只读 | grok-worker | Grok Build / unknown | run-mva9g674-xjti0g | 已返回 | 本文件 | — |
