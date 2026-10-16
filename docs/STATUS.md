# 当前状态

唯一的当前状态入口；队列见 [NEXT](NEXT.md)。详细历史和 ADR 按需读取。

## 卡 12：消息级书签 M22（2026-10-16，Mac mini 会话分支 claude/card12-bookmarks，MacBook 挑选 c91c2c4 / f990a76 / 77c8acf 合入 main，合并提交 `5750dae`，已推送 origin）

- 对应 Claude Code 2.1.286 VS Code Bookmarks：钉住某条消息，侧栏该会话下方列出，点击打开会话并滚到该轮。
- 契约：`UiAction` 加 `"bookmark"`，`Ui` 加 `messageId?` / `anchorId?`（≤200 字符，bookmark 必带 sessionId / messageId / anchorId，`body` 为摘要）；`Navigate` 加 `messageId?`（滚动目标 = 该轮用户消息 id）。
- 嵌入端：补丁 `0027-oco-message-bookmarks`——`platform.ocoBookmarkMessage` 钩子（只在嵌入模式存在），用户 / 助手消息操作行多一枚书签按钮；i18n en / zh。
- 宿主：新文件 `apps/extension/src/bookmarks.ts`（`MessageBookmarks`，`oco.messageBookmarks` Memento，按连接 + 会话存，去重、摘要截 80 字）；`panels` 收 `ui bookmark`（connectionId 取面板 binding，sessionId 不符则忽略）并提示 `oco: Bookmarked`；`open(…, messageId)` 对已打开面板也 `sendNavigate`；侧栏行 `bookmarks { total, items }` 子列表（计数徽标、点击打开并按 anchorId 滚动、悬停 × 删除）；页面同会话走 `location.hash = #message-{id}`，换会话把哈希附在路由后。v1 只做「加书签」（重复为 no-op），删除在侧栏子行上做，页面不显示已收藏状态。
- 验证（Mac mini 分支）：typecheck 0；unit 460/0；vendor app typecheck 0；补丁 0027 由 regen-patch 生成；build PASS。E2E（mock，Sonnet 子代理）新 c32-bookmarks 必需 6 项 + remove-persist 两次 PASS，附加探测 open-same-session-repeat FAIL（见遗留）；回归 c29 4/4、c3-fork 4/4、c30 7/7、c17 5/5、p1b-sidebar 13/13。合入后本机：setup 全链 0001–0028 重放 28/28、typecheck 0、unit 全过、vendor typecheck 0、build PASS（见 PROGRESS 本批）。证据 [card12-bookmarks](evidence/card12-bookmarks.md)。
- 遗留（产品缺陷，轻微）：同一书签在手动滚走后再次点击不滚动（hash 未变，上游 `use-session-hash-scroll` 不重放）；修两轮未稳（先去 hash 100 ms 后设回，3 次 1 过），建议改为补丁暴露「滚到某用户消息」入口（0026 已透传的 `scrollToMessage`），宿主 navigate 带 messageId 时直接调用。无真实模型目视。
- 协调：Mac mini 卡 12 分支里夹带的卡 11 草稿（45d9d86 / 688e4cf：`git-actions.ts`、c31、ADR §4a、askCommit 侧栏消息）按 NEXT §0b 裁定未合入，`sessions-webview.ts` 冲突时只保留书签消息。

## 卡 10：轮次侧轨 / 章节目录（2026-10-16，Mac mini 会话分支 claude/card10-toc，MacBook 挑选 935ad43 / 310267e / e1b7eef 合入 main，合并提交 `5750dae`，已推送 origin）

- 结论：上游无章节目录 / 大纲，只有 jump-to-latest；补丁 `0026-oco-embedded-turn-rail`——`MessageTimeline` 的 relative 容器内加绝对定位刻度轨 `oco-turn-rail.tsx`（只在 `platform.embedded` 且可见用户轮次 ≥ 2 时渲染），每轮一枚刻度按 `i / (n - 1)` 纵向分布，title 为该轮用户消息首行（`oco-turn-title.ts`，截 80 字），点击 `scrollToMessage(message, "auto")`，高亮用独立信号不写 `store.messageId`（避免松开贴底）；rail 顶部跟随 sticky 标题栏底边 + 16 px（ResizeObserver），aria-label i18n en / zh；`session.tsx` 透传 `scrollToMessage`。Claude Code mark_chapter 的等价物。
- 顺带（935ad43，卡 10 文件归属）：E2E real 模式读 opencode 配置里的模型，`OCO_E2E_REAL_MODEL` 可覆盖，`--real` 批次跳过 mock 专属套件；`test-server.sh` / `overnight-e2e.sh` 相应加参数。另 ef07c39：c4 subagent-link 用例改按会话 id 判断返回（真实模型下等权限时不再误判）。真实模型解封记录见 [real-model-2026-10-16](evidence/real-model-2026-10-16.md)（官方 opencode 1.18.33 二进制绕过 big-pickle 403，`opencode/nemotron-3.5-lightning-free` 可用）。
- 验证（Mac mini 分支）：vendor app typecheck 0；补丁 0026（7 文件 +189）由 regen-patch 生成；build PASS。E2E（mock）新 c30-turn-rail 首轮 5/7（D1：首刻度被 sticky 标题栏盖住，真实指针点不到），修 D1 后 7/7 ×2，p1b-narrow 12/12；回归 c29 4/4、c3-fork 4/4、c4 17/17。260 px 下 timeline 横向溢出为上游既有（overflowPreExisting），不计 rail 缺陷。证据 [card10-toc](evidence/card10-toc.md)。
- 遗留：无真实模型目视；Gemini 实现自报的单测结果不实（已由主线程改为测真实实现），委派记录见证据。

## 卡 13：M13 composer chip + 自动附带编辑器选区（2026-10-16，分支 claude/great-keller-c26ae2，已合入 main，合并提交 `d04ad9d`，已推送 origin）

- 契约：`DraftInsert` 增加可选 `chip: { label, path, startLine?, endLine?, mime?, auto? }`（`DraftChip`），无 chip 的消息仍是补丁 0001 的纯文本插入（终端 / Problems / Git diff 三个命令不变）。
- 嵌入端：补丁 `0028-oco-composer-chip`——收到 chip 时不插文本，而是作为上游附件 pill（`ImageAttachmentPart`，`mime text/plain`，`filename` = `路径:起-止`，如 `math.ts:2-3`）显示在 composer 上方，可点 × 移除；发送时随消息作为 file part（data URL）发出，服务端生成合成 text part 交给模型。同一标签只一枚：手动取代自动、自动遇手动跳过。
- 宿主：`oco.addSelectionToDraft`「Add Selection to Session Draft」改为发 chip（选区原文，空选区整文件）；新设置 `oco.draft.attachSelection`（默认 true，machine）：主面板会话打开时，文件编辑器的非空选区（去抖 250 ms）自动附一枚 auto chip（固定 id，新选区替换，选区清空移除，用户删掉后同一选区不再加，焦点进 webview 不动它，超过 400 行截断，不抢焦点、面板隐藏时只排队一条）。新文件 `apps/extension/src/attach-selection.ts`；`extension.ts` 只换成一行注册。
- 验证：typecheck 0；unit 463/0（34 文件；新 `attach-selection.test.ts` 15 用例 + 设置贡献同步）；build PASS；vendor app typecheck 0；补丁链 0001–0028 干净重放 26/26。E2E（mock，Mac mini Sonnet 子代理）新 c33-composer-chip 4/4 required + auto-dedupe PASS（第二轮，补丁 v2）；t005 改为期望 chip，第 4 / 5 步 PASS，第 6 步 `concurrent-permissions-routed` FAIL（A completed / C error）——main 969a4a0 对照 `mini-t005-main`：main 969a4a0 两次 9/9 PASS（detail 相同）；根因是测试里残留的全选选区让自动 chip 混进 mock 的 bash 命令（mock-llm 无分隔拼接文本），t005 改为关掉自动附带后本分支两次 9/9 PASS（mini-t005-chip）。本机已装 `oco-0.0.4-d04ad9d.vsix`（需 Reload Window）。证据 [card13-composer-chip](evidence/card13-composer-chip.md)。
- 遗留：选区 chip 只进主面板会话（pinned 面板不自动附带）；历史里的用户消息以上游附件卡显示 chip；没有真实模型目视。

## 卡 11：M21 Git 动作 v1（2026-10-16，分支 claude/card11-git-actions-0c72f6，已合入 main，合并提交 `ffc311c`，已推送 origin）

- 边界：ADR-009 §4 补「Git 动作只投递提示」——oco 不执行 git（不提交 / 推送 / 开 PR / 合并，不内置 git 子进程，不解析 agent 输出判断是否已提交），不做 CI 监视、PR 轮询 / 绑定、自动合并；提交与开 PR 由 agent 用自己的工具完成。
- 宿主：`oco.git.askCommit`「Ask Agent to Commit Changes」、`oco.git.askOpenPR`「Ask Agent to Open a Pull Request」把模板（设置 `oco.git.commitPrompt` / `oco.git.prPrompt`，占位符 `${branch}` `${files}` `${count}`，machine 作用域，空则用内置英文模板）用内置 Git 扩展 API 的上下文（分支、改动数、前 20 个文件名；仓库取 SCM 传入根 → 含主面板会话目录的仓库 → 第一个）渲染后插进**主面板**会话草稿（M05 `draft.insert`，source 沿用 `gitDiff`，不扩桥契约），不自动发送；没有主面板会话只提示「Open a session in the main panel first」。`oco.git.openScm` 打开 SCM 视图；SCM 标题菜单按钮「Commit with OpenCode」（别名 `oco.git.commitWithOpenCode`，显示在 Source Control 视图窗格头工具条）+ 溢出菜单「Ask Agent to Open a Pull Request」。新文件 `apps/extension/src/git-actions.ts`；补丁链不变（0001–0025）。
- 验证：typecheck 0；unit 448/0（33 文件；新 `git-actions.test.ts` 8 用例 + 设置贡献同步）；build PASS；E2E（mock，本机 Sonnet 子代理）新 c31-git-actions 5/5（no-session / commit-draft / pr-draft / open-scm / scm-button）连跑 2 次，回归 c15 4/0/1（terminal-shell-integ NOT RUN，既有）。产品缺陷 0。本机已装 `oco-0.0.4-ffc311c.vsix`（需 Reload Window）。证据 [card11-git-actions](evidence/card11-git-actions.md)、[card11-e2e](evidence/card11-e2e.md)。
- 协调：Mac mini 会话未拉到认领规则也做了一份卡 11（其 45d9d86 + 自写 c31），裁定（NEXT §0b 冲突处理 + 用户确认）后只作对照（见证据「对照」）；其 bridge.ts 改动属卡 12，未合入。E2E 因 mini 的锁被它自己的 c31 循环占用，按 §0 固定做法改走本机 Claude 子代理。
- 观察（不改）：连续两次 Git 动作的草稿之间无分隔（页面侧补丁 0001 对所有来源原样追加），记 NEXT §3。

## 卡 9：消息级回退入口（2026-10-16，Mac mini 会话分支 claude/card9-rewind 1a6789a，已 cherry-pick 进 main `83624b8`，未推送）

- 结论：上游用户消息操作行已有「Revert message」（reset 图标，hover 显示，与 0011 fork 按钮同排；`session-ui/src/components/message-part.tsx:1396`），嵌入模式可用 → 不加补丁 0026。更正 c27(b)「嵌入模式无逐条消息回退按钮」：该用例未 hover。行为：`POST /session/:id/revert`（边界为该条用户消息）、回填输入框、revert dock Restore 恢复；busy 时按钮不禁用，先中断再回退。
- 验证：新 mock E2E c29-rewind（button-visible / revert-to-message / restore / busy-revert）4/4 连跑 2 次；回归 c27-docks 2/2、c3-fork 4/4。产品缺陷 0。证据 [card9-rewind](evidence/card9-rewind.md)。
- 交叉验证（MacBook 卡 9 会话，与 Mac mini 会话重复开工）：主线程 grep 独立得出同一结论；派 Mac mini `mini-card9` 在 main 398a45e 基线独立写的 c29 变体 3/3（回退首条用户消息 → dock「2 rolled back messages」、revert / fork 同排 dy=0、Restore 最后一条一次恢复全部）+ 回归 c27-docks 2/2、c3-fork 4/4，results.json 已入库。产品代码、vendor、补丁链（仍为 0001–0025）未动，本机已装的 `oco-0.0.4-1f5c6fb.vsix` 已含该按钮，无需重装。见 [card9-rewind-macbook](evidence/card9-rewind-macbook.md)、[mini-card9](evidence/mini-card9.md)。

## Claude Code 对照批次：会话导出 + 状态栏 HUD（2026-10-16 夜间，已合入 main，合并提交 `1f5c6fb`，已推送 origin）

- 前置已完成：卡 6 + 卡 7 分支合入 main（合并提交 `3f89430`，2026-10-16 00:05，已推送 origin）；Mac mini `~/Ai-Project/oco` 与 worktree `oco-mini` 同步到 `3f89430`。
- F1 会话导出（M18 第一片，对应 Claude Code `/export`）：`oco.exportSession` 把会话渲染成 Markdown 开在 untitled 编辑器，`oco.exportSessionToFile` 走保存对话框；入口为侧栏行右键菜单与命令面板。渲染器 `renderSessionMarkdown`（`export-session.ts`，纯函数）：标题 / 元数据（id、时间、模型、总花费、总 token）、每条消息一节、工具调用折叠为 `<details>`（输入 2000 / 输出 4000 字符截断）、reasoning 默认省略、`revert` 之后的消息省略并注明条数、未知 part 不抛错。数据：`GET /session/:id` + `GET /session/:id/message`。
- F2 状态栏 HUD（对应 Claude Code status line / claude-hud）：`oco.hud`（Left 8）显示聚焦会话（主面板会话，否则侧栏选中行）的 `模型 · 上下文 % · $花费`；上下文上限来自 `GET /provider` 的 `limit.context`（每连接懒取一次，失败 60 s 后重试），没有上限时显示 `Nk tok`；运行中前缀 `$(sync~spin)`，等权限 / 提问前缀 `$(bell)`（等待优先于运行中）；tooltip 带 token 分项与会话累计；点击打开会话；设置 `oco.statusBar.hud`（默认开）。session-store 新增 `lastTokens`、`sessionMetrics`；panels 暴露 `mainSessionId`。
- 验证（25f9a76，本机）：typecheck 0；unit 439/0（32 文件，新增 export-session 8、status-hud 8；settings-contribution 已更新）；esbuild build PASS；主线程审阅修 2 处（上限缓存被首失败钉死、pending 未优先于 busy）。
- E2E（Mac mini `mini-ccfeat`，00:45–01:40，提交 3ed2d17 已 cherry-pick 为 4f24750，证据 [mini-ccfeat](evidence/mini-ccfeat.md)）：新套件 c26-export 2/2、c27-docks 2/2、c28-status-hud 2/2 全过；受影响回归 c7 6/6、c16 5/5、c11 6 PASS + 2 既有 NOT RUN、c3-fork 修一处测试竞态（快照前等末条回复有文本）后连跑 3 次 4/4。默认 mock 回归 13 套件 11 过，p1b-narrow（260px 几何用例 deny-260 / question-260）与 c5-runtime（think-card 宽度 337→344 抖动）两次均失败、关掉 HUD 仍失败、未归因 → 已派 Mac mini `mini-baseline` 在 main 3f89430 上对照，结论决定是否合入（规则见 evidence）。产品缺陷 0。
- c27 的产品结论：todo dock 只在轮次运行中显示（上游 `todoDockAtBoundary` 设计）；嵌入模式没有逐条消息回退按钮，回退入口只有 composer 斜杠命令 `/undo`，Restore 走 revert dock → 卡 9（M04 回退入口）成立。未覆盖：侧栏行菜单导出入口、`oco.exportSessionToFile` 的系统保存对话框。
- 上游能力核对（vendor 1.18.33）：revert dock（回退检查点）、todo dock（任务列表）、slash 命令浮层上游已有，嵌入模式可见性与逐条消息回退入口待 c27 结论；宿主已有终端输出 / Problems / Git diff / 选区入草稿与分屏打开。对照表、取舍与下一批候选见 [cc-features-2026-10-16](evidence/cc-features-2026-10-16.md) 与 NEXT §0b。
- Mac mini：`com.jarvis.tmux-gui` LaunchAgent 00:12 加载（此前 tmux 服务器丢失导致 dispatch 拒绝派发）；`mini-regress`（合入后默认回归）因任务 shell 找不到 opencode 中止 0/13（mini 没装 opencode，E2E 一直用 card7 留下的 `~/oco-bin/opencode` 包装脚本），`run-task.sh` 已改为自动设 `OCO_OPENCODE_BIN`，默认回归并入 mini-ccfeat 末尾。
- 基线对照（Mac mini `mini-baseline`，main 3f89430）：c5-runtime think-card 抖动在 main 上 2/2 复现 → 既有问题；p1b-narrow 在 main 上 12/12 通过 → 本分支 2 次失败归因为 HUD 布线在 `/provider` 返回等时机多触发一次侧栏整表重渲染（`view.refresh()`），已改为只刷状态栏的 `refreshHud()`（75c0be9）；Mac mini `mini-narrow` 复核：p1b-narrow 5/5（每次 12/12）、c28 2/2、c6 5/5（[mini-narrow](evidence/mini-narrow.md)）→ 合入。
- 本机已装 `oco-0.0.4-1f5c6fb.vsix`（需 Reload Window）。

## 卡 6：路线图剩余可做项（2026-10-14，分支 claude/roadmap-batch-2026-10-14，未合入 main，未推送）

- 侧栏：权限行显示 Always 将放行的模式（只读，最多 3 个 + 计数）；doom_loop 独立图标与文案；Deny with note（行内输入，随 `POST /permission/:id/reply` 的 `message` 发送）。本地标签（≤32 字符，分区 Pinned > 标签组 > 其余，标注不同步）与 Snooze（只作用于非等待 / 非运行行，底部折叠分区，下一条消息到达自动唤醒，状态栏计数不变）。j / k / Enter / Esc / ? 键盘与速查浮层。子会话 / todo 懒取只对收件箱、pinned 与 recent 前 20 行。
- 宿主命令（均无默认键位）：`oco.inbox.next` 收件箱 QuickPick（按类分组，权限项按钮只作用于该项）；`oco.session.parent / child / nextSibling / previousSibling / recent`（宿主 MRU）；`oco.follow.toggle` Follow（按会话、默认关、preview + preserveFocus、750 ms 节流、用户正在编辑不切换）；资源管理器徽标标出打开面板会话上一轮改过的文件（设置 `oco.decorations.changedFiles`）；审阅意见显示为编辑器评论线程，gutter「+」可直接加意见。`bridge-policy` 在 loopback 下 realpath 后再比较目录。
- 上游补丁：`0024-oco-embedded-subagent-pills`（嵌入模式标题行子代理 pills，窄面板折叠为 `⑂ done/total`，点击走宿主 openSession）；`0025-oco-runtime-view-followups`（环心提问态点选项即回答、窄布局卡片贴环下方与空工具台收缩、进度条标签避让刻度、结果浮层 ← n/total → 翻页）。
- 验证（25f3f9a）：typecheck 0；unit 422/0（30 文件）；vendor app typecheck 0、运行视图单测 131/0；build PASS；只读评审 5 处缺陷已修。夜间（2026-10-15，Mac mini + 本机子代理）：新 mock E2E c18–c25 全过，mock 回归 21 套件 0 失败，p1b-narrow 循环 10/10（未复现产品竞态），c25 嵌套子代理 3×6/0；夜里修了 3 处产品缺陷（Follow 在文件落盘前打开失败后被节流挡住、0025 窄矮舞台 `toolCap=0` 崩成恢复页、子代理汇总 waiting 应优先于 running）；公共版 opencode 1.19.0 mock 41 套件 0 失败、无产品不兼容（未加入 VERIFIED_SERVERS，待决定）。真实模型 c4 / c5 BLOCKED：`opencode/big-pickle` 返回 403（免费档只能在官方 OpenCode 内用）。18 张目视截图（mock）在 `docs/evidence/runs/overnight-card7-visual/visual/`，待用户看。本机已装 `oco-0.0.4-2846f66.vsix`。证据 [roadmap-batch-2026-10-14](evidence/roadmap-batch-2026-10-14.md)。

## M20 第一步：侧栏子代理聚合（2026-10-14，已合入 main，合并提交 9222aa7，已推送 origin）

- 有子会话（子代理）的父会话行显示徽标：分支图标 + `done/total`；子代理运行中时为 running 样式；有子会话等授权 / 等回答或报错时高亮；悬停说明如 `Subagents: 1 done, 2 running`。点击徽标展开 / 收起直接子会话列表（默认收起，展开状态存在 webview state），点子会话行打开该子会话；点徽标不切换当前会话。每个子项状态按其子树汇总（running > waiting > error > done）。
- 数据：`SessionStore` 已有的子会话行（实时事件）+ 对可见行懒取 `GET /session/:id/children`（与 todo 同队列、同 epoch、同 401 处理，并发上限 4）；ADR-009 §2 已补一行。侧栏行内元素改按类名取，不再依赖子节点下标。
- 验证（4634d4b / 7388bce）：typecheck 0；unit 393/0；build PASS；E2E（mock）c17-subagent-aggregate 5/0 连续 3 次（含重启 VS Code 后只靠懒取恢复 "1/1"）；回归 c16 5/0、c11 7/0/1、c6 5/0、p1b-sidebar 13/0。本机已装 `oco-0.0.4-7388bce.vsix`。证据 [m20-subagent-aggregation](evidence/m20-subagent-aggregation-2026-10-14.md)、[m20-e2e](evidence/m20-e2e.md)。
- 未做 / NOT RUN：第二步（补丁扩 0017 标题行的子代理 pills 与 chord 键位）；attention 样式只有单测；嵌套 ≥2 层只在一层验收；真实模型目视。

## 卡 2：侧栏停止 + 通知分级 + V2 识别（2026-10-14，已合入 main，合并提交 18cae65，已推送 origin）

- 侧栏一键停止（M10）：会话自身或任一子代理在服务端 busy（含等授权 / 等提问）时，行悬停出现 ■；多选栏 Stop；右键 Stop Session；状态栏 `$(debug-stop) N` → Stop All Running（模态确认一次）。四处共用一套「可停止」判定（`planStop`），状态栏计数与 Stop All 的确认数一致。宿主对每个会话按其自身目录 `POST /session/:id/abort`，发送前按服务端状态再核；停父会话前若有运行中的子代理先确认，再一并停。上游 abort 不清待处理的权限 / 提问，Stop 在 abort 成功后按会话目录 reject 它们，收件箱随之清空。Restricted Mode 下不可用。
- 通知分级（M01 后半）：`oco.notify.needsMe`（等授权 / 等回答）与 `oco.notify.finished`（跑完 / 报错），各 off / windowNotFocused / always，默认 windowNotFocused。旧 `oco.sessions.notifyPending=false` 在新键未设置时视为两类都 off（只读，不改写设置）。完成通知只发根会话，结算后等 1.5 s 取结果摘要（文件数 · 耗时 · 花费 · 最后一句），同时完成的多个合并成一条；单条带 Open / Diff，报错带 Open。只弹 VS Code 窗口内通知。状态栏与标题徽标仍只数等授权 / 等提问。
- V2 识别：连接时先 `GET /global/health`，没有版本再 `GET /api/info`；2.x 每个连接弹一次「This oco build supports OpenCode V1 only…」（带 Open Settings），诊断与状态栏提示改为不支持 V2，不再显示版本未知。
- 验证（d61dddf / eca230e）：typecheck 0；unit 385/0；build PASS；E2E（mock）第 3 轮 c16-sidebar-stop 5/0（row-stop、selection-stop、stop-all 模态、cascade-confirm、waiting-stop）、c6 5/0、c10 6/0；第 1 轮回归 c11 7/0/1、c13 6/0、p1b-sidebar 13/0、t015 4/0、t014 6/0（测试侧：401 拦截加 `/global/event`，卡 1 之后 feed 先连它）。本机已装 `oco-0.0.4-eca230e.vsix`。证据 [card2-stop-notify-v2](evidence/card2-stop-notify-v2-2026-10-14.md)、[card2-e2e](evidence/card2-e2e.md)。
- 已知限制 / NOT RUN：通知在真实窗口前台 / 后台的弹出只有单测（Playwright 不能让窗口失焦）；真实模型下目视 ■ / 通知 / 状态栏 NOT RUN；V2 的 `/api/info` 形状按迁移评估假设，未对真实 V2 服务验证。

## 卡 1 worktree 会话进收件箱 + 卡 3 审阅意见 / Fix with OpenCode（2026-10-13/14 在 Mac mini 完成；2026-10-14 合入 main `88b56c2`，已推送 origin）

- 卡 1：侧栏实时事件改订阅 `/global/event`，按 `Connection.roots()`（工作区 ∪ sandboxes）过滤、丢弃 `sync`，服务端 404 时退回 `/event`；status / permission / question 快照按 root 分别取再合并；侧栏 Allow / Deny / 就地作答发往请求所属会话的目录（`pendingDirectory`）。worktree 会话等授权时进收件箱、计入状态栏，可在侧栏直接批复。ADR-009 §2 补一行数据源。
- 卡 3：M13 首版：编辑器选区右键「Add to Review Notes」累积文件 / 行号 / 片段 / 意见（宿主内存 + workspaceState），侧栏行显示「N to send」，Send all 合成一条放进草稿，由用户发送（注明前像来自 Git 变更）。M05 第二片：终端最近一条命令输出（shell integration）、Problems / SCM 菜单、「Fix with OpenCode」灯泡，都走草稿投递。顺带修复 `panels.insertDraft` 在 reveal 时把同一条 draft.insert 投递两次（影响所有入草稿来源，`sentDrafts` 去重）。
- 合并验证（本机，88b56c2）：typecheck 0；unit 322/0；build PASS；补丁链 0001–0023 在干净 vendor HEAD 上重放 23/23；E2E（mock，首跑全过）c13 6/0、c14 6/0、c15 5/0、c6 5/0、c12 13/0、p1b-sidebar 13/0，见 [card2-merge-e2e](evidence/card2-merge-e2e.md)。c15 的 terminal-shell-integ 重跑一次为 NOT RUN（隔离 profile 下 shell integration 时有时无，与卡 3 记录一致）。本机已装 `oco-0.0.4-88b56c2.vsix`。
- 已知限制 / NOT RUN：真实模型下目视收件箱（含 worktree 会话）、审阅意见、Fix with OpenCode；终端输出正向路径需真实终端目视；Problems 菜单的 marker 参数是 VS Code 内部结构，尽力解析，失败回退为当前文件的 Problems；worktree 会话的提问与 busy 计数只有单测；远程（非 loopback）服务端的目录比较不做 realpath。证据 [card1-worktree-inbox](evidence/card1-worktree-inbox-2026-10-13.md)、[card3-review-notes](evidence/card3-review-notes-2026-10-13.md)、[card3-e2e](evidence/card3-e2e-2026-10-14.md)。

## 新建会话草稿页 + New worktree 勾选框（2026-10-12，已合入 main 并推送，合并提交 cc1aebe）

- New（侧栏 +、命令、恢复页按钮）不再立即 `POST /session`，改开草稿面板（`SessionBinding.draft`，`sessionId=draft-<uuid>`）：OpenCode 原生新建会话页，项目只列 VS Code 文件夹、无"添加项目"；关掉面板服务端无残留；VS Code 重启不恢复草稿面板。
- 首条消息才建会话；桥从 `POST /session|/api/session` 响应放行新会话，宿主原地换绑（不重建桥、不重载）。worktree 只有一个"New worktree / 新建 worktree"勾选框（默认不勾 = 当前分支；勾选 = 发送时 `POST /experimental/worktree`），无"选择已有 worktree"（用户决定，参照 Claude Code / Copilot）。worktree 由用户自行删除。
- 桥策略：草稿面板允许目录集合 = 工作区文件夹 ∪ 其项目 sandboxes ∪ 本面板新建 worktree；query 目录越界 403，v2 body `location.directory` 越界 403。侧栏列表加 `scope=project`，`Connection.roots()` 纳入 sandboxes，worktree 会话与普通会话混排显示；打开文件支持 worktree 路径。补丁 0023（8 文件 +84 -1）。
- 验证：typecheck 0；vendor tsgo 0；unit 297/0；build PASS；E2E（mock）c12 13/13（`20261012-052504-c12-new-session-draft-d267`），p1b-sidebar、t007-multiroot 通过；旧套件经共享助手 `createAndOpenSession` 迁移后 mock 全量 23/24，p1b-main-panel 偶发失败一次（单独重跑 3×8/8）。真实模型 NOT RUN。
- 已知限制：同一项目的多个工作区文件夹（同仓库克隆）会互见会话；worktree 会话的实时状态事件已由卡 1 接通（2026-10-14，见顶部）；VS Code 打开的是仓库子目录时不识别其 worktree；t004 `cancel` mock 下失败未在基线定性。证据 [new-session-draft-eval](evidence/new-session-draft-eval.md)、[new-session-draft-e2e](evidence/new-session-draft-e2e.md)、[worktree-ai-tools-survey](evidence/worktree-ai-tools-survey.md)。

## Roadmap 批次：M11 / M05 首片 / M07 / M02 / M14 Pin / 侧栏多选 / M12 调查（2026-10-11，已提交 main 并推送）

- 侧栏收件箱「等提问」行可就地作答（选项按钮 / 多选 / 自由文本 / 多题逐题），一次 `POST /question/:id/reply {answers}`；Dismiss 仍走 reject。
- 命令 `oco.addToDraft`（M05 首片）：QuickPick Problems（当前文件 / 全部）、Git 工作区 / 暂存 diff → 入会话草稿；T011 尾部截断 400 行；files.exclude / .gitignore 命中只传路径。`DraftInsert.source` 改为带 `kind` 的联合类型（补丁 0001 不动）。
- 命令 `oco.compactSession`（M07(1)）：busy / `time.compacting` 守卫 → 模型取 store 最近 assistant（无则 GET /message 最后一条 assistant）→ 模态确认 → `POST /session/:id/summarize`，3 分钟超时。补丁 0019（M07(2)）：嵌入模式圆环改为「View context / Compact session」两项菜单，compact 走上游 `session.compact` 命令。
- M02：session-feed 快照对 busy 会话懒取 `GET /session/:id/todo`，可见行经 `ensureTodo` 按 epoch 去重；`todo.updated` 整表替换；侧栏行「3/7」徽标可展开清单。ADR-009 §2 已补该数据源。
- M14 第一步：Pin（memento `oco.pinnedSessions`，Pinned 分组置顶）与 Mark as Unread（UnreadTracker 手动标记豁免自动清除，打开会话时清除）。
- 侧栏多选：Shift 范围 / Cmd-Ctrl 切换 / Shift+↑↓；选择栏批量 Archive（≥2 行一次模态确认）/ Delete（总是确认）/ Mark unread / Pin；右键菜单命令按 `selection` 批量。
- M12：只做调查（上游 `ae7e2eb` 「remove queued follow-ups for now」，无缺陷原因，客户端队列逻辑在 v1.18.33 完整保留；详见 [roadmap-batch-2026-10-11](evidence/roadmap-batch-2026-10-11.md)）。是否立项小补丁待用户决定。
- 验证：typecheck 0；unit 284/0（基线 221）；webview build PASS（含新 0019）；extension build PASS；VSIX 已打包并本机安装（文件名按 HEAD 取名为 `oco-0.0.4-df50eba.vsix`）。E2E（mock）c10 就地作答 6/0（单选 / 多选 / 自由文本）、c11 Pin / 多选 / Mark unread / archive 批量 / todo 徽标 7/0，delete 批量 NOT RUN（破坏性）；第一轮暴露并修复 2 个缺陷（`custom` 缺省、todo 条目无 id），见 [c10-c11-sidebar-2026-10-11](evidence/c10-c11-sidebar-2026-10-11.md)。新套件未加入 run.mjs 默认列表，单独 `node tests/e2e/c10-sidebar-answer.mjs` 跑。真实模型下压缩与就地作答目视 NOT RUN。
- 注意：另一位工作者在同一检出里并行提交了 mermaid（df50eba，分支 claude/mermaid-render）；本批改动与之无文件重叠。

## Mermaid 图表渲染（2026-10-11，已合入 main 并推送）

- 补丁 0022（4 文件 +467）：已完成的 ```mermaid 代码块懒加载 mermaid 11.17.2 渲染为 SVG（strict、串行、按主题+源码 LRU 缓存 64、跟随明暗主题；流式中显示源码；语法错误显示一行提示并保留源码；复制仍为源码）。mermaid 为 oco 根 devDependency，经 `apps/chat-webview/vite.config.ts` alias 引入，不改上游 lockfile；懒加载分块 mermaid.core 684 kB（gzip 169 kB）。
- 本机已装干净构建 `oco-0.0.4-df50eba.vsix`（仅 df50eba，13.8 MB，extension.js sha256 `4252fc27…`）；用户真实模型目视确认效果可用。
- 验证：session-ui tsgo 0；单测 markdown-mermaid 8/0；build PASS；E2E c9-mermaid 9/0（外置 mock 服务方式，`run.mjs` 默认方式 NOT RUN，未加入默认套件）。渲染时 ResizeObserver loop 通知累计 19 次，无害。真实模型目视 NOT RUN。证据 [c9-mermaid](evidence/c9-mermaid-2026-10-11.md)。

## 多 agent 驾驶舱第二步：每会话结果卡（2026-10-10，分支 claude/cleanup-2026-10-10，本地未推送）

- 侧栏 done / error 行提供最近一次运行的摘要（文件数 · 耗时 · 花费 · 最后一句）和 Open / Diff / Mark read（error 无 Mark read）。文件来源为最新 user `message.updated.info.summary.diffs`，不保存 patch；普通轮次汇总的 `session.diff` 发空数组（回退路径可非空）。其他字段沿用上游事件与客户端 busy/idle 时间。
- 运行视图 end / abort 终态在 live 模式显示当前会话已记录的改动文件数量；点整张卡展开跨轮文件列表，按路径去重并排除被回退的轮次，不拼凑跨轮增删行数。用户确认 Git 范围后，卡片、侧栏 Diff 和单文件动作均切回 chat、显式打开原生 Review「Git 变更」；单文件动作定位 diff，不打开源码全文。卡片文件来自本会话各轮消息摘要（沿用完整历史加载，未完成时不报完整文件数）；Review 展示工作目录跨轮未提交改动；下拉保留分支 / 上一轮选择，不宣称严格 session 归属。
- 补丁 0021：5 文件 +161 −1，重生成后 0001–0021 干净重放并与 vendor app 逐文件一致；上游 app tsgo 0、webview build PASS。`navigate.review` / `oco.openSessionReview` 契约不变。c7 已加入默认 23 套件，之前枚举只有 22 项的文档偏差已修正。
- 文件卡片补齐本批验证：根 / app typecheck 0，221 单测 / 0 失败，build 与 0001–0021 重放 PASS；c8 5/0（13.45 s：两轮摘要三文件、重复路径、额外 Git 文件排除、Git 入口 / 单文件定位），c7 6/0（21.15 s）。c8 的第三会话文件及第二轮摘要为 fixture，不证明服务端归属判断；Git API 未拦截。已装 `oco-0.0.4-d83978f.vsix`（d83978f + 本批卡片修改），extension.js / chat index 安装哈希一致，需 Reload Window。记录见 [session-diff-scope](evidence/session-diff-scope-2026-10-10.md)；真实模型目视 NOT RUN。
- 委派：Grok 订阅完成独立审查、单测失败诊断和 store 修复；Gemini 健康探测成功，但原生订阅代理 HTTP 400 `Requests ending with a model turn are not supported`，已记录并换 Grok。Claude 额度及工具不可用，VS Code E2E 由主线程按记录例外接手。证据 [cockpit-result-card-2026-10-10](evidence/cockpit-result-card-2026-10-10.md)。

## 多 agent 驾驶舱第一步：ADR-009 + 跨会话「待处理」收件箱（2026-10-10，分支 claude/cleanup-2026-10-10）

- [ADR-009](adr/009-multi-agent-cockpit-boundary.md) 已采纳：oco 只经 OpenCode API 发起会话 / 选 agent 与模型 / 投递提示词 / 批复权限与提问；收件箱是宿主侧对 SessionStore 的投影，不改桥契约；批量发起只做客户端节流；不做 cron、多模型竞赛、RBAC、新调度引擎。
- 收件箱已落地：侧栏顶部「Needs attention」分区列出等权限 / 等提问 / 报错 / 完成未读的会话，子代理按自身行出现并带父会话标题。权限行 Allow / Always / Deny 由宿主直接 `POST /permission/:id/reply`（once / always / reject），提问行 Answer 打开会话、Dismiss 走 `POST /question/:id/reject`；宿主发送前核对请求仍在待批集合，过期请求只刷新不重发。状态栏 bell 计数改为含子代理的待批行数；新请求出现且不属于当前会话时弹一条可点 Show 的警告通知（同一时刻只一条），设置 `oco.sessions.notifyPending` 可关。
- 验证：`bun run typecheck` 0 错；单测 196 / 0（新增 session-store、sessions-view 用例）；新 E2E 套件 c6-inbox（mock）PASS：3 个后台子代理同时等 bash 权限 → 不打开任何面板，在侧栏 3 行逐个 Allow → `GET /permission` 为空、分区消失、状态栏归零，9.7 s；侧栏回归 p1b-sidebar / p1b-reconnect / t014-connection 24 PASS / 0 FAIL。默认套件 22 → 23，[TEST-SCOPE](TEST-SCOPE.md) 已更新。
- 第二轮（用户真实模型验证后反馈）：收件箱与会话列表分成 `NEEDS ATTENTION · N`（可折叠）/ 分隔线 / `SESSIONS` 两个区块；子代理行按父会话分组（组头点击开父会话，子行缩进带引导线和 `@agent` 标签，去掉服务端的 "(@xxx subagent)" 后缀）；权限行 summary 改为路径模式（如 `/etc/*`），悬停见 `external_directory · /etc/*`；按钮改为透明底细边框的行内样式（Allow / Answer 链接色，Deny / Dismiss 淡色悬停变红）。分组为宿主纯函数 `groupInbox`，单测 202 / 0；E2E c6-inbox + p1b-sidebar 18 PASS / 0 FAIL。
- 第三轮：两个节头左侧加 VS Code 原生式折叠箭头（› / ⌄），`SESSIONS` 节头始终显示并可折叠（收起时显示会话数，搜索时强制展开），折叠状态随 webview state 记住。E2E c6-inbox + p1b-sidebar 18 PASS / 0 FAIL。
- 未做 / 限制：提问的就地作答仍要打开会话；通知与收件箱在真实模型、亮色主题下尚未目视；「完成未读」行沿用 UnreadTracker 的判定。
- 委派：Grok 只读调查（6 问均带行号，5.6 min，2 项未确认其中「等权限时子会话是否 busy」已由主线程 API 实测为 busy）；Gemini 实现（23.5 min，自验 typecheck / build / 单测）；Gemini 写 E2E（7.9 min，其探测 `/config` 把 401 当不可达未跑场景，主线程重启服务器后用 API 代验）。两条路线本批均正常。证据：[cockpit-inbox-2026-10-10](evidence/cockpit-inbox-2026-10-10.md)，E2E 结果 `docs/evidence/runs/20261010-091516-c6-inbox-09cb/results.json`。

## 收口批次（2026-10-10，本地未提交）

- 已落地：NEXT 重写为真实队列；STATUS 瘦身（412 → 59 行，历史搬入 PROGRESS）；仓库卫生（忽略 E2E 日志、删已合并分支、清 11 个干净 worktree）；M5 三个小坑修复；`scripts/regen-patch.sh`；0020 再生成且 0001–0020 干净重放；typecheck 0、unit 190/0、session 单测 427/0、build PASS；本机装 `oco-0.0.4-ce17cd8.vsix`。证据 [cleanup-2026-10-10](evidence/cleanup-2026-10-10.md)。
- 真实模型全量 E2E（`opencode/big-pickle`，21 套件）：首轮 16 套件无 FAIL。5 个有 FAIL 的套件经 Grok 诊断、测试侧修复后由主线程重跑：p1a-chat 8/0、p1a-identity 14/0 已通过；p1b-narrow 8/1（新面板偶发未出现，宽度不固定，疑似产品侧竞态，待 mock 复现）；c4-trajectory 15/2、c5-runtime 24/4，剩余 FAIL 依赖模型时序或 mock 口令，另有 c5 超出 15 分钟外层超时。明细 [fail-diag](evidence/cleanup-2026-10-10-fail-diag.md)、[real-model](evidence/cleanup-2026-10-10-real-model.md)。
- 真实模型下的运行视图观察、嵌套 ≥2 层子代理、亮色主题目视：NOT RUN。
- 委派：Gemini 跑全量 E2E 时等待自己起的 4517 服务而挂起约 1.5 小时，经用户同意后中止；Grok 诊断返回，但沙箱启动不了 VS Code，重跑由主线程接手。

## 运行视图 M5 评审落地（2026-10-10，补丁 0020 + 样稿，本地未提交）

- 来源：Claude Design 第一批交接包（`~/Downloads/handoff`，样稿改 P1-1 / P1-3 后半 / P2-5 / P2-6）+ [critique](design/runtime-m5-critique-2026-10-10.md) 剩余 8 条。逐条判断、委派记录与验证见 [runtime-m5-review-2026-10-10](evidence/runtime-m5-review-2026-10-10.md)，剩余 8 条的产品现状见 [investigation](evidence/runtime-m5-review-2026-10-10-investigation.md)。
- 进产品（补丁 0020，12 文件改动）：顶栏「运行中」后写阶段 · 对象 · 已等时长，同一请求里超过 `SLOW_MS`=10 s 未回的调用顶栏后半与工具行时长变琥珀（P1-1）；忽略提问后「你」卡片收成一行 ⊘ + 悬停看选项、状态回「此刻不需要你」，环心卡片「第 N 轮已结束 · 等你下一条消息」+ 一行 ⊘ 脚注、门口 ⊘ 记号 30 s 后不带标签（P1-3）；环上「等 N（工具 a · 子代理 b）· 回来 M」、子代理头「a 在跑 · d/n 已回」、「派出 → / ← 回来」、泊位小点只画有结果停着的（P2-5）；「第 N 次请求」只留环标题、模型框去序号与上下文、工具台头只写状态（P2-6）；同一命令第 3 次起小签琥珀 + 环上「同一命令 ×n 疑似循环」（P2-8）；浮层文案「回放中 · 文本按时间比例展开」（P3-9）；底栏图例加「刻度：轮次 / 失败 / 提问」（P3-10）。
- 与 Claude Design 样稿不同的两处：请求点阵不改成悬停才显示（失败请求的红点是环内唯一标记，产品按文字宽度取舍变体、本就不裁标题）；忽略态卡片种类仍是「已忽略」、状态与空闲态同口径（样稿原为「本轮结束」/「待命」）。样稿已按产品口径改回并重建。
- 不采用：P2-4「带回结果」站（真实但很短的闭环阶段，改小签落点要动几何）、P2-7、P3-10 标签统一成「≈10m17s」（长短两式是按宽度取舍的既定规则）。另立项：P1-2 提问态（要接宿主回答通道）、窄布局 N2 / N3；N1 在产品里不成立（阈值 980，不重叠）。
- 验证：session 单测 428/0（含新增 7b）；app typecheck 0；`bun run build` PASS；oracle 14 帧重生成，仅 k09 / k10 的 tone err→faint、你卡片状态改空闲文案（预期）；mockup `--check` 通过；0020 用 `regen-patch.sh` 再生成（58 文件，+20336 −8），新旧补丁逐文件比对只含本批 12 文件；本机装 `oco-0.0.4-7d71662.vsix`（需 Reload Window）。NOT RUN：mock / 真实模型 E2E（c5 的忽略断言按新文案核过：卡片正文含「已忽略」/「dismissed」、`data-oco-runtime-you-state` 仍为 dismissed）、亮色主题目视。

## 运行视图 M5 样稿同步产品 + 独立设计评审（2026-10-10；只改设计文档与脚本，产品代码未动）

- 样稿 [runtime-m5-animated-mockup](superpowers/specs/runtime-m5-animated-mockup.html) 已同步 2026-10-09 三轮反馈 + D2 + D18：`|◀`、删「此刻」字幕、卡片去时长与 meta、整卡可点开浮层（流式显「生成中…」、回放显「回放：按时间估算的进度」）、「计划 n/m」按钮浮层、工具台按轮收缩（`data-oco-runtime-tools-k`，仅宽布局）、底栏去「已空闲」、已忽略提问改 ⊘ 淡色、图例拆「失败」「忽略 / 拒绝 ⊘」。生成管线固化为 `scripts/runtime-m5-mockup-build.mjs`（模板 + `runtime-m5-timeline.json` + `runtime-m5-now-shot.webp`，`--check` 校验）。已发布私有页面 https://claude.ai/artifact/EhkZr1fkh2L2VsXqUb3btR 。
- 验证（本机）：build `--check` 通过；oracle 14 帧与 `vendor/opencode/packages/app/src/components/session/fixtures/runtime-m5-oracle.json` 一致，仅 k09 / k10 卡片 tone err→faint（D18 预期；fixture 单测不比 tone，fixture 随下次 0020 再生成更新）；Playwright 截图 1100 / 560 × 14 帧页面错误 0、横向滚动 0；浮层、计划按钮、工具台 30 px 收缩逐项核过。证据：[runtime-m5-mockup-sync-2026-10-10](evidence/runtime-m5-mockup-sync-2026-10-10.md)。
- 设计评审：用户点名 Claude Design；内置浏览器 claude.ai 未登录，改由 Claude 评审子代理只看 15 张截图给出 3 P1 / 5 P2 / 2 P3 + 3 条窄布局建议，见 [runtime-m5-critique-2026-10-10](design/runtime-m5-critique-2026-10-10.md)。落地情况见下一节。

## 基线与版本

- 上游基线：vendor OpenCode v1.18.33（提交 `51ef4be`，浅克隆；旧文档里的补丁基线 `deb241e` 已不存在，补丁再生成改用 `scripts/regen-patch.sh` 在临时 worktree 重建基线）。宿主 `VERIFIED_SERVERS` = 1.18.33、1.19.0（公共 npm 版；2026-10-16 卡 8 决定加入，依据 mini-compat 的 mock 41 套件 0 失败，真实模型下的验证并入 mini-real）、1.18.13（企业服务；前端保持 1.18.33，验收对着 1.18.13 服务端跑；切到 1.18.13 前端的方案停放在本地分支 `claude/opencode-1.18.13-baseline`）。
- 补丁链：`patches/opencode/` 0001–0028 全部 28 个在干净 vendor HEAD `51ef4be` 上重放通过（2026-10-16 合入卡 10 `0026-oco-embedded-turn-rail.patch`（嵌入模式轮次侧轨）与卡 12 `0027-oco-message-bookmarks.patch`（消息书签按钮）后 `bun run setup` 全链 28/28，合并提交 `5750dae`；0028 为卡 13 `0028-oco-composer-chip.patch`（composer 附件 chip）；2026-10-14 生成 0025 时以 0001–0024 为基线校验；`0024-oco-embedded-subagent-pills.patch` 标题行子代理 pills；`0025-oco-runtime-view-followups.patch` 运行视图 M5 遗留；`0019-oco-embedded-context-usage.patch` 恢复标题行上下文用量；`0020-oco-runtime-view.patch` 为运行视图，历史文档中提到补丁 0019 运行视图的均指现在的 0020；`0021-oco-result-card.patch` 为每会话结果卡；`0022-oco-markdown-mermaid.patch` 为 Mermaid；`0023-oco-embedded-new-session-draft.patch` 为新建会话草稿页）。卡 1、卡 3 未改补丁。
- 本机扩展：已装 `oco-0.0.4-e680a7a.vsix`（main e680a7a = 5750dae 卡 10 / 卡 12 合入 + 1.19.0 进 VERIFIED_SERVERS，vendor v1.18.33 + 补丁 0001–0028；2026-10-16 14:38；extension.js sha256 `3f538d48…`；需 Reload Window）。

## 已合入 main 的能力

- 消息级书签（卡 12，2026-10-16，补丁 0027）：消息操作行书签按钮 → 宿主 Memento 存储、侧栏会话下方书签子列表（打开并滚到该轮 / 删除），`Navigate.messageId`。
- 轮次侧轨（卡 10，2026-10-16，补丁 0026）：嵌入模式消息时间线右缘每轮一枚刻度，title 为该轮首行，点击跳到该轮，键盘可达；只在轮次 ≥ 2 时显示。
- Git 动作 v1（卡 11，2026-10-16）：`oco.git.askCommit` / `oco.git.askOpenPR` 带仓库上下文的提示模板进主面板草稿、`oco.git.openScm`、SCM 标题按钮「Commit with OpenCode」；oco 不执行 git（ADR-009 §4）。
- 会话侧栏改为 webview：Claude Code 风格列表、圆角选中、30px 行高、时间右对齐、搜索由标题栏按钮触发、Connection/Agents 视图删除，验证见 [spike 记录](evidence/sessions-webview-spike-2026-10-08.md)、[ADR-008](adr/008-webview-sessions-list.md)。
- 会话标题行上下文用量（补丁 0019）：圆环阈值配色、无数字直显，替代 0017 隐藏圆环，证据见 [c5-context-usage](evidence/c5-context-usage.md)。
- 界面英文化与状态栏标志：扩展界面统一英文，状态栏采用 `$(oco-logo)` 单字形字体图标，证据见 [i18n-english-strings](evidence/i18n-english-strings.md)、[状态栏复验](evidence/gcp-workstation-20260930.md)。
- 嵌入模式标题行合并与三点菜单精简（补丁 0017、0018）：状态和审查开关并入标题行、归档转侧栏右键，证据见 [c4-header-actions-run](evidence/c4-header-actions-run.md)。
- 首开与切换提速（补丁 0015、`1ad31ce`/`28c90ac`）：骨架屏防黑屏/logo闪烁、`/provider` 延迟与单次去重、gzip 压缩、目录预置，证据见 [cold-open](evidence/cold-open.md)、[switch-perf](evidence/switch-perf.md)。
- 子智能体卡片宿主内打开（补丁 0016）：点击在当前面板内切到子会话而不是调起系统浏览器，证据见 [subagent-link-0016](evidence/subagent-link-0016.md)。
- 对话 / 轨迹视图（补丁 0012、0013、0014）：标题栏切轨迹、三泳道标尺、多语言字典、系统行工具页签与步骤折叠、子智能体行显示，证据见 [c4-trajectory](evidence/c4-trajectory.md)、[c4-trajectory-0013](evidence/c4-trajectory-0013.md)、[c4-trajectory-0014](evidence/c4-trajectory-0014.md)。
- 单主面板与会话切换保持存活（ADR-007）：`retainContextWhenHidden: true`、主面板原地切换、固定面板、草稿跨切换保留，证据见 [ADR-007](adr/007-single-main-panel.md)、[v01 证据](evidence/v01-completion.md)。
- 消息 fork 按钮（补丁 0011）：用户消息与助手回复原地 fork，证据见 [c3-fork](evidence/c3-fork.md)。
- 托管模式（T007）与诊断（T015）：多根工作区切换、`managed` 模式独立进程与随机端口、导出脱敏诊断，证据见 [v01 证据](evidence/v01-completion.md)。
- C1 编辑器联动与路径加固（补丁 0005、0006）：文件名/行号/Diff 摘要/Markdown 路径点击在宿主打开并定位、安全回环与工作区路径校验，证据见 [c1-editor](evidence/c1-editor.md)、[c1-path-hardening](evidence/c1-path-hardening.md)、[c1-focus-t010-recovery](evidence/c1-focus-t010-recovery.md)。
- C2 单轮 Diff 展示与错误恢复（补丁 0007、0008）：Diff 范围标签与不可用占位、服务不可达/会话删除/未知错误恢复界面，证据见 [c2-display](evidence/c2-display.md)、[c1-focus-t010-recovery](evidence/c1-focus-t010-recovery.md)。
- P1b 稳定性与连接状态（补丁 0001–0004、0009、0010）：单一待发意图防发旧请求、重连一致性、连接状态键与高级开关默认值，证据见 [p1b-stability](evidence/p1b-stability.md)、[t014-connection-c2-close](evidence/t014-connection-c2-close.md)。
- 运行视图 M5（补丁 0020）：环形循环 + 环心卡片 + 三个坞、全量重建复用、估算流式进度、历史翻页修复，证据见 [runtime-m5 证据](evidence/runtime-m5.md)、[e2e-fb-2026-10-09](evidence/e2e-fb-2026-10-09.md)、[round-two-investigation-2026-10-09](evidence/round-two-investigation-2026-10-09.md)。

## 本机查看与部署方式

- 环境变更：gcp-workstation 已不存在，全部验证改用本机环境。
- 本机查看：`bash scripts/package-vsix.sh && bash scripts/install-local.sh` 安装后核对哈希，执行 `Developer: Reload Window`。
- 本机要求：managed 模式需要打开受信任文件夹；若未打开文件夹，侧栏提示 Open Folder。
- 本机诊断回放：`node scripts/look-local.mjs` 在隔离 VS Code 实例中对本机真实会话做只读回放与截图诊断。
- 自动化检查：`bun run brief` 查看短摘要；`bun run verify:brief` 离线验证 typecheck + unit；`bun run verify:brief -- --build` 验证构建。

## 已知限制与 NOT RUN

- 真实模型新对话：2026-10-10 实测一次，阶段序列与流式递增正常；轮末工具台收起只差一次 end 后 ≥2 s 的采样复核（见 NEXT 小项）。
- 子代理嵌套：嵌套 ≥2 层（孙会话）仍 NOT RUN：mock 不产生孙会话，真实模型 big-pickle 2026-10-10 两次提示都只派一层子代理。
- 主题支持：主要在暗色主题下验证；亮色主题 2026-10-10 目视一次（运行视图 + 轨迹视图），仅轨迹时间线圆点对比度偏低。
- 远程环境：Remote / Remote-SSH（gcp-workstation 已不存在）相关交互为 NOT RUN / BLOCKED。
- 长会话与内存：数千行长会话的滚动性能与长时间常驻内存测量为 NOT RUN。
- 单元测试已知环境问题：`apps/extension/src/i18n/desktop-native.test.ts` 期望 "pa" 得 "en"，受主机 ICU 影响失败 1 项，上游补丁未触及。
- 平台与输入法：真实 macOS 中文输入法、系统剪贴板图片、Windows 环境 NOT RUN。
- 基准测试：`bun run test:bench` 因 Playwright 占用 4096 / 3000 端口仍处于 BLOCKED。

## M5 遗留

- 子会话翻页、step 旁表清理、`snapshotAt` 泄漏三项已在 2026-10-10 收口批次修复（见顶部）；无新遗留。

## 委派路线现状

- 2026-10-14 起 E2E、真实模型、循环复现与长时间测量交 Mac mini 执行机（[MINI](MINI.md)，`scripts/mini/*.sh`；setup 在干净克隆上重放补丁 0001–0025 通过，typecheck 0、unit 422/0；通知走 OpenClaw Telegram main 群）。
- 遵循 [AGENTS.md](../AGENTS.md)：Gemini（agy）优先，不可用时换 Grok，两路均不可用时由主线程接手并在证据文件中记录账本。
- 2026-10-16：Gemini 实现 + 单测 26 分钟正常返回（导出 + HUD）；Grok 只读调查 3.5 分钟。直接调用 grok-worker / gemini-worker 时提示只写任务正文（hook 自己加包装命令）。Mac mini 的 tmux 服务器改由 `com.jarvis.tmux-gui` 常驻；E2E 用 `~/oco-bin/opencode` 包装脚本（见 MINI.md）。
