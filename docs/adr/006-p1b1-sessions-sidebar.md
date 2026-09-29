# ADR-006：P1b-1 会话侧栏、连接状态、事件路由与窄布局

状态：已采纳（P1b-1）。日期：2026-09-30。依据：[P1b 执行指示](../P1B-NEXT-STEPS.md)、[上游调查](../evidence/p1b-upstream-survey.md)、[P1b-1 验收记录](../evidence/p1b1-acceptance.md)。在 [ADR-005](005-p1a-identity-storage-connection.md) 基础上扩展，不改变其桥接与存储决定。

## 1. 先固定的小接口

`packages/contracts/src/sessions.ts`（只用于扩展宿主，不进入 webview 协议）：

| 接口 | 内容 |
| --- | --- |
| `ConnectionSummary` | connectionId、显示地址、目录、`state`（unconfigured / connecting / connected / reconnecting / unauthorized / error）、错误、连续失败次数、下次重试时间、受信任与否 |
| `SessionListItem` | 根会话的 id、标题、目录、更新时间、`activity`、待处理权限数与提问数、最近错误 |
| `SessionActivity` | idle / busy / retry / permission / question / error；优先级 permission > question > busy/retry > error > idle |
| `OpenSessionRequest` | connectionId + directory + sessionId（+ 标题、是否聚焦）；只接受当前连接、当前工作区 |

子会话（subagent）不单独列出，其运行、权限和提问计入根会话。

## 2. 数据来源：一条宿主事件流 + 快照

- `SessionStore`（纯模块）：快照整体替换，事件逐条修补；每个处理都是幂等的。
- `SessionFeed`（纯模块，I/O 注入）：每个窗口一条 `GET /event`（按工作区目录）。连接顺序是先开事件流并缓存事件，再取快照，应用快照后回放缓存事件，避免快照与增量之间漏事件。
- 快照请求用查询参数 `directory=`，因为请求头只选实例、不按目录过滤。`/session` 带 `roots=true&limit=200`（服务端默认只返回 100 条）；`/session/status` 只列非空闲会话。快照里运行中或待处理、但不在根列表中的子会话，会沿 `parentID` 逐个补取。
- 聊天面板仍各自通过桥使用自己的事件流。这次没有做共享 SSE 重构，只多开了这一条宿主流。

## 3. 重连与去重

- 同一时间只有一个连接尝试。重试按钮、配置变化、密码变化、信任变化、心跳看门狗、事件流结束都会触发重连；每次触发都会使令牌递增并中止上一次尝试，旧尝试迟到的结果会被丢弃。
- 重连退避从 1 s 起翻倍，上限 30 s，带 ±20% 抖动。收到 401 时停在 unauthorized，不再自动重试，直到密码或配置变化。服务端每 10 s 发心跳，超过 35 s 收不到任何字节即判定断流。
- 事件去重：
  - 事件 `id` 放进有界集合（1024 条）去重；
  - `session.updated` 丢弃 `time.updated` 更旧的内容，防止乱序覆盖；
  - 本端新建会话时先回填，之后到达的 `session.created` 与之合并，不会重复插入。
- 切换连接或工作区时立即清空列表，旧服务的会话不会在连接新服务期间残留。断线重连期间保留上次列表，并提示“可能不是最新”。

## 4. 侧栏与状态栏

- 活动栏新增 “OpenCode” 容器，里面是 `Sessions` 原生 TreeView：
  - 条目显示标题、状态图标、“已打开”标记和相对时间；
  - 标题栏按钮有新建、搜索、清除搜索、重连；
  - 行内按钮有打开和重命名，重命名调用 `PATCH /session/:id`。
- 空状态、加载、错误、未认证、未配置和无搜索结果都由 `viewsWelcome` 按 `oco.connState` 显示，具体错误原因写在 `TreeView.message`。
- 等待权限或提问的会话数显示在视图角标和状态栏上。状态栏按连接状态显示已连接、连接中、重连中/未连接（警告底色，点击立即重试）、需要密码（点击设置密码）。
- 长列表只显示最近 200 个根会话，并给出提示；搜索在已加载的列表上按标题或 id 进行。
- open-or-focus：已打开的会话调用 `reveal()`，在它当前所在的编辑器组聚焦，不会新建面板；未打开的会话在当前活动组打开。
- 受限模式：列表可读；新建和重命名命令的 `enablement` 是 `isWorkspaceTrusted`，命令本身也会再检查一次。

## 5. T010：窄布局、主题、首次加载

- 上游补丁 `0003-oco-narrow-dock-wrap.patch`：权限和提问坞的页脚与按钮组允许换行，按钮组靠右，最小宽度设为 0。在 v1.18.33 原样下，约 306 CSS px 以下 “Allow once” 会被托盘的 `overflow: clip` 裁到面板外，指针点不到。
  - 支持的最小宽度：VS Code 编辑器组的最小宽度约 220 px，而补丁后按钮逐个换行，单个按钮最宽约 103 px，所以在 VS Code 能给出的任何组宽下都能点到。
  - 已实测 260、320、480、800。
  - 如果某个自定义或本地化标签比面板更宽，降级办法是 “View: Toggle Maximize Editor Group” 或把该会话移到更宽的组。
- 主题：
  - 页面读取 VS Code 写在 webview body 上的主题类。首次加载前写入官方键 `opencode-color-scheme`；运行中主题变化时，通过官方已有的 `storage` 事件通知应用切换。
  - 生成 HTML 时就预写原生存储里的这个键，让官方首屏脚本一开始就用对的亮暗模式。
  - 高对比度主题映射为 light 或 dark。只跟随亮暗，不映射 VS Code 主题的具体颜色。
  - 应用内手动选择配色，在下次加载时会被 VS Code 主题覆盖。
- 首次加载：
  - 上游补丁 `0004-oco-embedded-submit-waits-for-model.patch`：嵌入模式下，如果提交时 agent 或模型还没加载完，最多等 20 秒，拿到后继续提交，不再提示 “Select an agent and model”。
  - 等待期间重复按 Enter 会被忽略，页面根元素上带 `data-oco-submit-pending`。
  - 超时仍按官方原逻辑提示。

## 6. 测试钩子

仅在非生产模式下生效：

- `OCO_DEV_SLOW_PATHS` / `OCO_DEV_SLOW_MS`：让桥延迟匹配路径的响应，用于稳定复现首次加载竞态。
- `oco: Debug State` 增加侧栏状态：连接、条目、角标、状态栏文字、feed/store 计数。
