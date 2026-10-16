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

## 实现 B（Grok）

- 宿主：`MessageBookmarks`（`oco.messageBookmarks`，去重 / 截 80 / `listFor` 按 at 升序 / 变更只 `view.refresh`）；`panels` 收 `ui bookmark`（connectionId 取 binding，sessionId 不符则忽略），成功 `oco: Bookmarked`；`open(..., messageId)` 已开面板也 `sendNavigate`。
- 页面：`ocoBookmarkMessage` → `ui("bookmark")`（Platform 字段用 app.tsx 局部交叉，未改 vendor）；同会话 `location.hash = #message-{id}` 并 `inner.set` 同哈希，换会话把哈希附在 `routeFor` 后。`currentRoute` 去掉哈希，避免 ready 对不上会话。
- 侧栏：行 `bookmarks { total, items }`；子列表摘要、点击 `openBookmark`（按 anchorId 滚动）、悬停 × `removeBookmark`、计数徽标。
- 验证：`bun run typecheck` exit 0。`bun test tests/unit` 460 pass / 0 fail（34 files，5.52s）。
- actual_provider/model：unknown（无工具返回；会话标识 Grok 4.7）。未改 vendor / contracts。未跑 build、未开 VS Code。chat-webview 单独 `tsc` 有既有 vendor rootDir 报错，与本次字段无关（输出中无 bookmark 类型错误）。
| c12-A | vendor：platform.tsx、message-part.tsx、message-timeline.tsx、session.tsx、ui icon、ui i18n en/zh | gemini-worker | — | — | 失败：Antigravity 要求重新 Google OAuth 登录（60 s 超时），未改文件 | — | 换 Grok |
| c12-A2 | 同上 | grok-build:grok-delegate | Grok Build / unknown | run-mvaapiql-f4yisi | 已返回（约 6 min） | 补丁 0027（8 文件 +96 -2） | Gemini 鉴权失败 |
| c12-B | apps/chat-webview/src/{app,bridge}.ts(x)、apps/extension/src/{panels,bookmarks,sessions-view,sessions-webview,extension}.ts、media/sessions-list、tests/unit/bookmarks | grok-worker | Grok Build / unknown（自称 Grok 4.7） | run-mvaanago-28qldt | 已返回（9 m 19 s） | 本文件 | — |

## 集成（主线程）

- 去掉 `app.tsx` 里为 vendor 字段未落地而加的局部类型交叉（0027 已加 `Platform.ocoBookmarkMessage`）。
- 验证：vendor app typecheck 0；仓库 typecheck 0；unit 460/0（含 bookmarks、bridge-contract 新例）；补丁 0027 由 regen-patch 生成。build / E2E 待 c32。
