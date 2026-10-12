# 新建会话草稿页 + worktree 评估（2026-10-12）

范围：只评估，不改产品代码。目标：点 New 先出草稿页（项目/分支/worktree 选择），取消不建会话；支持 worktree。

## 委派记录

| task_id | 唯一写入范围 | requested_route | actual_provider/model | agent_id/run_id | 状态 | 结果路径 | fallback_reason / 接手理由 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| eval-upstream | 无（只读，结论由主线程存入本文件） | grok-worker | xAI / Grok 4.7（自报） | run-mv4o6a48-f46var | 已返回，主线程抽查 2 项属实 | 本文件“上游调查” | — |
| eval-host | 本文件 | 主线程 | — | — | 已完成 | 本文件“oco 扩展侧” | 范围/架构评估属主线程职责（AGENTS.md） |
| impl-health-gemini | 无 | gemini-worker | Gemini 3.8 Flash（自报） | gem-mv4pr8hu-f5742 | 已返回 OK | — | — |
| impl-stage4-connection | apps/extension/src/connection.ts, tests/unit/connection-sandboxes.test.ts | gemini-worker | Gemini 3.8 Flash（自报） | gem-mv4ps6zg-8a754 | 已返回；主线程审 diff 通过，5 pass | 同左 | — |
| impl-e2e-migrate | tests/e2e/（除 c12）、docs/evidence/new-session-draft-e2e.md | claude-subagent/sonnet | claude/sonnet | 见 docs/evidence/runs/（各套件 runId） | 已返回：mock 全量 23/24，p1b-main-panel 偶发失败（20261012-044902-p1b-main-panel-dba6），单独重跑 3 次 8/8；82 轮 / 约 74 分钟（超预算）；共享助手 createAndOpenSession；t004 cancel 失败未在基线验证 | docs/evidence/new-session-draft-e2e.md | E2E 需启动 VS Code，按路由表交 Claude 子代理 |
| survey-worktree-tools | docs/evidence/worktree-ai-tools-survey.md | gemini-worker | Gemini 3.8 Flash（自报） | gem-mv4r4iga-2fimb | 已返回；36 个来源链接；主线程未逐条核实；其中“OpenCode 无内建 worktree 管理”与本仓库源码不符（服务端有 /experimental/worktree 创建/删除/重置，上游 Web 有入口） | 同左 | — |
| impl-e2e-c12-checkbox | tests/e2e/c12-new-session-draft.mjs, docs/evidence/new-session-draft-e2e.md | claude-subagent/sonnet | 待返回 | unknown | 运行中 | — | E2E 需启动 VS Code |
| impl-policy-tests | tests/unit/bridge-policy.test.ts, tests/unit/session-feed.test.ts | gemini-worker | unknown | gem-mv4q1o6m-gq8o8 | 已返回；主线程复跑 296 pass / 1 fail（e2e-results 套件数，待 c12 注册后更新） | 同左 | — |
| impl-e2e-c12 | tests/e2e/c12-new-session-draft.mjs, run.mjs 注册, docs/evidence/new-session-draft-e2e.md | claude-subagent/sonnet | claude/sonnet | 20261012-040535-c12-new-session-draft-d3dc | 已返回：c12 12/12 PASS；p1a-chat、p1b-main-panel 因依赖旧 New 失败（测试侧），40 轮 / 约 10.5 分钟，主线程发现缺陷 0 | docs/evidence/new-session-draft-e2e.md | E2E 需启动 VS Code，按路由表交 Claude 子代理 |
| impl-core | contracts, bridge-*, panels, extension, session-feed, chat-webview, patch 0023 | 主线程 | — | — | 已完成；build + vendor tsgo 通过；0023 回放校验 7 文件 +47 -1 | — | 公共契约、安全边界、同文件集成与上游补丁属主线程职责（AGENTS.md） |

健康检查：grok-build:check ready=true（grok 1.0.34，已登录）。

## oco 扩展侧（主线程，2026-10-12）

- `oco.newSession`（apps/extension/src/extension.ts:267）立即 `POST /session` 再开面板，没有草稿阶段。
- 面板绑定 `SessionBinding = {connectionId, directory, sessionId}`（packages/contracts/src/bridge.ts:16），面板 key、恢复（extension.ts:482 serializer）、草稿插入、标题同步都要求 sessionId；扩展+webview 中 `sessionId` 出现约 89 处。
- webview 路由守卫（apps/chat-webview/src/app.tsx:39-62）只认绑定会话路由，`/new-session` 会被判为 other 并拒绝。
- 桥（apps/extension/src/bridge-policy.ts）：目录强制为绑定目录，覆盖一律 403；写操作只放行 `POST /session` 和 `/log`，worktree 接口不在白名单；会话写操作只放行绑定会话及已验证子会话。
- 跨目录切换（panels.ts:144-166）：重建桥并重载整页 HTML；同目录则原地 navigate。
- 侧栏只显示 `conn.ownsDirectory(dir)` 为真的会话（extension.ts:46）；worktree 目录不在工作区内，其会话默认不会出现。
- oco 目前没有任何 worktree 代码（扩展与 webview 中 grep worktree/sandbox 为 0）。

## 上游调查（Grok 摘要，主线程抽查标 ✔）

1. 草稿路由 `/new-session?draftId`（app.tsx:190-229,645）：`tabs.newDraft` 只在本地 tabs store 生成 uuid，提交前不在服务端建会话或 worktree；关闭草稿只删本地 tab 和持久化的 prompt。依赖 TabsProvider 等新布局 provider。
2. 项目选择：列表来自本地已打开项目 + `GET /project` 元数据；“添加项目”在 web 平台走应用内 DialogSelectDirectory（浏览服务端文件系统），不经 Platform。切换项目即改草稿 directory 并重挂 SDKProvider。
3. worktree：下拉来源 `project.sandboxes`；✔ 仅 `VITE_OPENCODE_CHANNEL !== "prod"` 且 vcs=git 时显示（new-session-workspace-controller.ts:6,39）。新建在提交时 `POST /experimental/worktree?directory=`，路径由服务端定（data/worktree/<project>/<slug>，分支 opencode/<name>）。✔ `worktree.ready/failed` 只在旧布局 pages/layout.tsx:390-396 监听，新布局草稿页可能一直 pending 到 5 分钟超时（submit.ts:662-676）。删除/重置接口存在：`DELETE /experimental/worktree`、`POST /experimental/worktree/reset`。
4. 提交顺序（submit.ts:430-500,687-694）：建 worktree → 建会话（directory=目标目录）→ navigate/promoteDraft → 发 prompt；发 prompt 用草稿目录的 client（v1：`POST /session/{id}/prompt_async`）。
5. Platform：草稿路径基本不读 `platform.embedded`（仅 submit.ts:257,366）；持久化用 `platform.storage`/`draftStore`。
未查：SharedProviders 内部、v2 project.list/session.prompt promise client、worktree ready 是否有第二条事件来源。

## 主线程补充核实

- oco 构建用 `OPENCODE_CHANNEL=prod`（scripts/build-webview.sh:8 → vite.js:9-13），所以草稿页的 Git/worktree 栏在 oco 里默认隐藏，需补丁放开。
- `Worktree.ready/failed` 只有旧布局 pages/layout.tsx:392,398 调用：新布局下“新建 worktree”会卡在 pending 直到 5 分钟超时。这是上游新布局本身的缺口，不是 oco 特有。
- 嵌入模式下 TabsProvider 仍在（补丁 0002 只隐藏标签条和命令），草稿路由在应用内可达；拦住它的是 oco webview 路由守卫。

## 结论与方案（评估，未实施）

可行。修正此前判断：草稿在服务端没有状态，“取消 = 关面板”天然成立；跨目录不必重载整页——桥改为“允许目录集合”并按响应放行新会话/新 worktree，宿主原地换绑，即可避开“首条消息丢失”。

阶段（相对大小）：
1. 桥：允许目录集合（VS Code 文件夹 + 其项目 sandboxes）；放行 `POST /experimental/worktree`；从 `POST /session`、`POST /experimental/worktree` 响应放行新会话 ID / 新目录；宿主原地换绑。中。
2. 草稿面板：`SessionBinding` 增加草稿形态（无 sessionId）、面板 key/恢复/标题/选区加入草稿的处理；`oco.newSession` 只开草稿面板；webview 路由守卫放行 `/new-session?draftId`，提交后接受新会话路由。中偏大。
3. 上游补丁 0023：嵌入模式放行草稿页；项目选择只列 VS Code 文件夹并隐藏“添加项目”（避免浏览服务端任意目录）；放开 worktree 栏（不受 prod 渠道限制）；新布局监听 worktree.ready/failed。中。
4. 侧栏：`ownsDirectory` 纳入工作区项目的 sandboxes，worktree 会话关面板后仍可见；打开文件/diff 支持 worktree 路径。小到中。
5. （待定）worktree 删除/重置/列表管理。小到中。

验收需真实 VS Code E2E：New→关闭不产生会话；New→发送在当前分支建会话且消息到达；New→新建 worktree→发送，会话在 worktree 目录、侧栏可见、无整页重载；VS Code 重启后草稿面板行为。

## 用户决定（2026-10-12）

- 草稿面板在 VS Code 重启后直接丢弃，不恢复（序列化器遇到草稿绑定时关闭面板，并清理本地草稿）。
- 待定：worktree 范围是否包含阶段 5（侧栏删除/重置）。

# 实施（分支 claude/new-session-draft，2026-10-12 起）

## 设计（主线程定，委派按此接口）

- 契约：`SessionBinding` 增加 `draft?: true`；草稿面板 `sessionId = "draft-<uuid>"`（只作面板身份，服务端不存在）。`WebviewInit` 增加 `folders?: string[]`（VS Code 工作区文件夹，供项目选择器）。
- New：`oco.newSession` 不再 `POST /session`，只开草稿面板；关面板 = 放弃，服务端无残留。VS Code 重启时序列化器遇到草稿绑定直接关闭面板。"选区加入草稿"不列草稿面板。
- webview 守卫：草稿模式初始路由 `/<b64 dir>/session`（上游据此 `tabs.newDraft` → `/new-session?draftId=`），两者都放行；第一次进入会话路由视为"转正"，发 `ui("promoted", {sessionId})`。
- 桥（草稿与普通面板共用）：
  - 允许目录集合 = 绑定目录 ∪（草稿面板：工作区文件夹 ∪ 其项目 sandboxes）∪ 本面板新建的 worktree 目录。query `directory` 不在集合 → 403；`x-opencode-directory` 头在集合内则采用，否则仍改写为绑定目录（与旧行为一致）。
  - 草稿面板放行写：`POST /session`（v1，query directory 在集合内）、`POST /api/session`（v2，body `location.directory` 在集合内）、`POST /experimental/worktree`（directory 为工作区文件夹）。
  - 响应放行：`POST /session|/api/session` 成功 → 新会话 ID 加入可写集合并通知宿主；`POST /experimental/worktree` 成功 → 返回的 `directory` 加入目录集合。
- 宿主转正：收到 `promoted` 且 ID 属于本面板新建 → 原地换绑 `{sessionId, directory: 会话目录, draft: 去掉}`，policy retarget，不重建桥、不重载；ID 不属于本面板 → 拒绝并记日志。
- Connection（阶段 4）：`sandboxes` 来自 `GET /project` 中 worktree 属于工作区文件夹的项目；`ownsDirectory` 与 `roots()` 包含它们；打开文件的 workspaceRoots 用 `roots()`。
- 上游补丁 0023：Platform 增加 `embeddedFolders`；嵌入模式项目选择只列这些文件夹并隐藏"添加项目"；worktree 栏在嵌入模式不受 prod 渠道限制；新布局监听 `worktree.ready/failed`。

## 用户调整（2026-10-12）：worktree 改为勾选框

- 用户决定：嵌入页不提供"选择已有 worktree"；只显示一个"New worktree / 新建 worktree"勾选框，默认不勾 = 当前分支，勾选 = 发送时新建 worktree。参照 Claude Code / Copilot。
- 实现：patches/opencode/0023 在 `components/prompt-workspace-selector.tsx` 中，`platform.embedded` 时以 `OcoWorktreeToggle` 替换下拉菜单（值 "create" / "main"），保留右侧当前分支名显示。补丁 8 文件 +84 -1，vendor tsgo 通过。
- 待办：重新构建；c12 用例 C 需改为勾选框操作并重跑；之后打包安装、提交。

## 已知限制（迁移中发现）

- 侧栏列表改为 `scope=project` 后，同一项目的多个工作区文件夹（例如同一仓库的两个克隆、初始提交相同）会互相看到对方的会话；以前按文件夹精确过滤。单文件夹工作区不受影响。
- t004 `cancel` 在 mock 下失败（回复在点击前已结束），未在 main 基线验证，未定性。
