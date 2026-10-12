# Roadmap 批次（2026-10-11）：M11 / M05 首片 / M12 调查 / M07 / M02 / M14 Pin / 侧栏多选

分支 `claude/roadmap-batch-2026-10-11`（从 main 0c9ca36 切出）。依据 [roadmap-research-2026-10-10](roadmap-research-2026-10-10.md) §5.1 / §6.2，用户 2026-10-11 点名 7 项。

## 范围与决定

| 项 | 形态 | 层级 | 主线程决定 |
| --- | --- | --- | --- |
| M11 提问就地作答 | 收件箱等提问行展开问题 + 选项按钮 + 自由文本，收齐后一次 `POST /question/:id/reply {answers: label[][]}` | sidebar-webview | InboxRow 加 `questions` 透传（主线程落 store）；UI 与消息由代理实现 |
| M05 首片 | 命令 `oco.addToDraft` QuickPick：Problems（当前文件 / 全部）、Git 工作区 / 暂存 diff；T011 尾部截断随本片 | contracts 小改 + host-only | `DraftInsert.source` 改为带 `kind` 的联合类型 `DraftSource`（selection / problems / gitDiff）；补丁 0001 只读 id/sessionId/text，不动 |
| M12 恢复排队 | 先查上游为什么把 queue 迁为 steer；不查不立项 | upstream-patch | 调查结论见下文；是否立项以调查为准 |
| M07 压缩入口 | (1) 宿主 `oco.compactSession`；(2) 0019 圆环可点触发 compact | host-only + upstream-patch | 预检（[m07-compact-precheck-2026-10-11](m07-compact-precheck-2026-10-11.md)）：嵌入模式 `session.compact` 可达、reducer 已画分隔线、summarize 体 `{providerID, modelID}`；立项 |
| M02 todo 进度 | session-feed 快照懒取 `GET /session/:id/todo` + `todo.updated` 投影；侧栏行「3/7 步」 | sidebar-webview + 契约小改 | **决定：允许改 ADR-009 §2**，已补一行数据源（同鉴权 / epoch / 401，busy / 可见行懒取）；`SessionListItem.todo: TodoProgress` |
| M14 Pin | 侧栏会话置顶，本地 memento | sidebar-webview | 与多选同一代理第二阶段做 |
| 侧栏多选 | Shift 范围选 / Cmd-Ctrl 切换，批量 Delete / Archive / Mark as Unread | sidebar-webview + host | Mark as Unread 即 M01 的 UnreadTracker 公开化（手动标记豁免自动清除） |

## 主线程改动（契约 / 集成）

- `apps/extension/src/extension.ts`：注册 `oco.addToDraft`（M05）、`oco.compactSession`（M07，deps：conn.request / store.lastModel / activity busy|retry / rowItem / pickSession / requireTrust）、`oco.pinSession` / `oco.unpinSession` / `oco.markSessionsUnread`（M14）；`oco.archiveSession` / `oco.deleteSession` 接受 webview 上下文的 `selection: string[]` 做批量（≥2 行 archive 与所有 delete 走一次模态确认）；`view.setTodoProbe(feed.ensureTodo)`（M02）。
- `apps/extension/package.json`：上述 5 条命令的 contributes.commands 与 webview/context 菜单（pin/unpin 用 `pinned` 上下文键互斥）；`tests/unit/settings-contribution.test.ts` 的菜单期望随之更新。
- 并行工作者提示：同一检出里另一位工作者在本批期间切到 `claude/mermaid-render` 并提交 df50eba（补丁 0022 mermaid）；本批文件未被其提交吸收，收尾时本批用独立 worktree 只提交自己的路径。

- `packages/contracts/src/bridge.ts`：`DraftSource` 联合类型；`packages/contracts/src/sessions.ts`：`TodoStatus`、`TodoProgress`、`SessionListItem.todo`。
- `apps/extension/src/panels.ts`：`DraftSource = DraftInsert["source"]`；`extension.ts` 的 addSelectionToDraft 加 `kind: "selection"`。
- `apps/extension/src/session-store.ts`：`InboxRow.questions` 透传。
- `docs/adr/009-multi-agent-cockpit-boundary.md` §2：加入 `/session/:id/todo` 与 `todo.updated`。
- 契约改动后 `bun run typecheck` 通过；`bun test tests/unit` 221 用例 0 fail（基线）。

## 委派记录

| task_id | 唯一写入范围 | requested_route | actual_provider/model | agent_id/run_id | 状态 | 结果路径 | fallback_reason / 备注 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| health-gemini | 无 | gemini-worker | Gemini 3.8 Flash（Antigravity 订阅确认） | gem-mv3xmos7-wa2ou | 已返回（14 s） | — | 本批 Gemini 可用 |
| health-grok | 无 | grok-build:check | grok 1.0.34，已登录 | — | 已返回 | — | 本批 Grok 可用 |
| M12-investigate | 无（只读） | grok-worker | Grok Build / unknown | run-mv3xosy2-ztrdyw（grok session 45359d75） | 已返回（4 轮，5 m 32 s），验收通过 | 本文件「M12 调查结论」 | Grok 沙箱不能写 docs，由主线程代存；其「files changed」列的是整个工作树 diff，非 Grok 改动 |
| M07-precheck | docs/evidence/m07-compact-precheck-2026-10-11.md | claude-subagent/sonnet | claude sonnet | — | 已返回（11 轮，76 s） | 同左 | 要读 vendor 源码并直接写 evidence；目视 NOT RUN（压缩会调用真实模型） |
| M11-impl | sessions-view.ts、sessions-webview.ts、media/sessions-list/*、tests/unit/sessions-view.test.ts、checkpoints/m11 | gemini-worker | Gemini 3.8 Flash（Antigravity） | gem-mv3xsyhi-owipf | 已返回（11 轮，18 m 10 s；typecheck 通过，单测 272/0 fail；index.js +317 / css +156） | sessions-webview.ts `questionReply`；index.js 就地作答 UI | 禁改 session-store.ts；E2E 待跑 |
| M14+multiselect | sessions-view.ts、sessions-webview.ts、session-groups.ts、media/sessions-list/*、sessions-view/session-groups 单测、checkpoints/m14-multiselect | gemini-worker | Gemini（Antigravity）/ unknown | gem-mv3yjc0h-gu989 | 已返回（13 轮，21 m 41 s；typecheck 通过，单测 284/0 fail） | SessionsView.setPinned / isPinned / togglePin / markUnread / setTodoProbe；UnreadTracker.remember |
| E2E-c10-c11 | tests/e2e/c10-sidebar-answer.mjs、c11-sidebar-organize.mjs、lib/mock-llm.mjs（新增 2 个提示）、docs/evidence/c10-c11-sidebar-2026-10-11.md、runs/ | claude-subagent/sonnet | claude sonnet | — | 已返回，验收通过（第一轮 22 轮 5 m 45 s，发现产品缺陷 2；复核 2 轮 55 s，全部 PASS）。run.mjs DEFAULT_SUITES 未登记新套件 | c10-c11-sidebar-2026-10-11.md | 要启动 VS Code（AGENTS 表：Claude 子代理） | 宿主命令 pin/unpin/markSessionsUnread 与 archive/delete 多选参数、package.json 菜单由主线程接线 |
| M02-data | session-feed.ts、session-store.ts、对应单测、checkpoints/m02 | gemini-worker | Gemini 3.8 Flash (High)（Antigravity） | gem-mv3xtgwn-dtxqq | 已返回（11 轮，17 m 31 s；typecheck 通过，store+feed 单测 68/0 fail，+9） | session-store.ts：setTodo / hasTodo / getTodo / lastModel；session-feed.ts：ensureTodo | 顺带加 `lastModel(sessionID)` 供 M07 |
| M07-host | apps/extension/src/compact-session.ts、tests/unit/compact-session.test.ts、checkpoints/m07 | gemini-worker | Gemini（Antigravity）/ unknown | gem-mv3xzya5-rkebb | 已返回（6 轮，10 m 36 s；typecheck 通过，单测 255/0 fail，+21） | apps/extension/src/compact-session.ts | 模型来源：store.lastModel → GET /message 最后 assistant；busy / time.compacting 守卫；注册由主线程接线 |
| M07-patch-0019 | vendor session-context-usage.tsx → patches/opencode/0019 | 主线程（上游补丁归集成人） | — | — | 已完成（webview 构建通过；regen 用只叠加 0001–0019 的临时源树，`0019: 2 files, +64 -2`） | patches/opencode/0019-oco-embedded-context-usage.patch | 圆环改为「View context / Compact session」两项菜单，compact 走上游 `command.trigger("session.compact")` |
| M05-module | apps/extension/src/add-to-draft.ts、tests/unit/add-to-draft.test.ts | grok-build:grok-delegate | Grok Build / unknown | run-mv3xud2x-mt29rg（grok session 9a734fa8） | 已返回（约 12 min；typecheck 通过，单测 255/0 fail，+11）。主线程发现缺陷 1：用 `createRequire(import.meta.url)` 懒加载 vscode，在 esbuild cjs 包里 `import.meta.url` 为空会在激活时抛错；已改为直接 import + 测试 mock | apps/extension/src/add-to-draft.ts | 命令注册 / package.json 由主线程接线（已接） |

## M12 调查结论（Grok，2026-10-11，只读；主线程代存）

- 迁移来源：上游提交 `ae7e2eb3fb32b12e0c45681950540df7379e021a`（2026-04-03，adamdotdevin），信息只有「chore(app): remove queued follow-ups for now」，无 PR、无 bug 描述。改动两处：`settings.tsx` 加 effect 与 getter/setter 把 queue 改写为 steer；`settings-general.tsx` 删除 Follow-up behavior 选项。提交评论有人问是否临时，作者未回复。
- 上游态度：Issue #44108（open）说是有意暂时拿掉、等以后重做；恢复 PR #29110 / #29265 / #44117 / #52428 均未合并，#44117 写明队列逻辑仍在、只是设置被强制成 steer。
- v1.18.33 残留：客户端队列完整——`session.tsx` queueEnabled(1786) / queueFollowup(1809) / editFollowup(1829) / 空闲自动发送(1989–2002) / abort 置 paused(2296–2299, 2326–2329)；`session-followup-dock.tsx` 只有 Send now 与 Edit；`submit.ts:550` shouldQueue 时写本地队列，`sendFollowupDraft`(182) 等空闲后发普通 prompt。设置页（`settings-v2/general.tsx`、`settings-general.tsx`）已无 queue 选项，i18n 文案仍在（`en.ts:926-929`）。默认值本就是 steer（`settings.tsx:189`）。
- 可行性：小补丁去掉 `settings.tsx` 370–373 与 389–394 三处强制后，上游入队 / 编辑 / 手动发送 / abort 暂停路径可直接复用；嵌入模式要真正用 queue 还需把默认值改为 queue（或加回设置项），并按 roadmap 加载时置 paused。
- 风险：这是客户端本地暂存，不是服务端队列；子会话 `isChildSession()` 不入队；已被改写持久化的 queue 值不会自动恢复；上游标 for now，vendor 升级时可能冲突；服务端 prompt 省略 delivery 时的默认值未核实。
- 未查项：2026-04 那周 release notes；#33247 全文。
- **主线程结论**：关闭原因是「暂时移除、待重做」而非缺陷，逻辑完整，可以立项为一枚小补丁（0022，embedded 下默认 queue + 加载置 paused）。本批按用户「先调查」只交付调查，不写补丁；是否立项由用户决定。

## 验证

| 项 | 命令 / 方式 | 结果 |
| --- | --- | --- |
| typecheck | `bun run typecheck` | 0 error（契约改动后、每次接线后各跑一次） |
| unit | `bun test tests/unit` | 284 pass / 0 fail（基线 221；M11 / M02 / M05 / M07 / M14+多选各加用例） |
| webview build | `bun run build:webview` | PASS（含再生成后的 0019；54 s） |
| extension build | `bun run build:extension` | PASS（172.7 kB） |
| VSIX | `OCO_SKIP_BUILD=1 bash scripts/package-vsix.sh` + `scripts/install-local.sh` | 已打包并安装到本机 `~/.vscode/extensions/oco-local-test.oco-0.0.4`；文件名按 HEAD 取名 `oco-0.0.4-df50eba.vsix`（HEAD 当时是并行工作者的分支提交，内容为本批构建） |
| E2E 第一轮 | c10-sidebar-answer / c11-sidebar-organize（Claude 子代理，mock 服务） | c10 5/1：custom-answer FAIL；c11 5/1/1 NOT RUN：todo-badge FAIL，delete-batch NOT RUN（破坏性，只验 archive）。详见 [c10-c11-sidebar-2026-10-11](c10-c11-sidebar-2026-10-11.md) |
| E2E 发现的产品缺陷与修复 | — | (1) `GET /question` 不返回 `custom`，页面按 `Boolean(custom)` 隐藏自由文本框 → 改为 `custom !== false`；(2) 服务端 todo 条目无 `id`、`priority` 为字符串，`setTodo` 丢弃全部条目 → 接受无 id（content+位置去重）与字符串 priority |
| E2E 第二轮（修复后） | 同上重跑（顺序单独跑，先清空 /question、/permission） | c10 6 PASS / 0 FAIL（含 multi-answer、custom-answer）：runs/20261011-153920-c10-sidebar-answer-62c6；c11 7 PASS / 0 FAIL / 1 NOT RUN（delete-batch 破坏性未验；todo 徽标 1/3、展开 3 项、archive 批量 PASS）：runs/20261011-153936-c11-sidebar-organize-fa86 |
| 真实模型 | compact / 就地作答目视 | NOT RUN（压缩会调用真实模型；本批只用 mock） |

- 补丁重放：0019 用只叠加 0001–0019 的临时源树再生成（`scripts/regen-patch.sh` 的校验树只回放更低编号补丁，默认 source 带 0020+ 会报整树不一致）；0020/0021 不触及 0019 的两个文件。
