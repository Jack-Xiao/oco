# 当前队列

本文件是唯一的当前队列。状态只看 [STATUS](STATUS.md)。不要执行 HANDOFF 或 P1B-NEXT-STEPS 里的旧提示词。

当前基线：main `1f5c6fb`（2026-10-16 夜间：卡 6 + 卡 7 合并提交 `3f89430`，Claude Code 对照批次合并提交 `1f5c6fb`，均已推送 origin；补丁 0024 / 0025 随之进入 main）。上一批基线：main `9222aa7`（2026-10-14 合入卡 1、卡 3、卡 2 与 M20 第一步，已推送 origin）。运行视图 M1–M5（补丁 0020）、结果卡（0021）、Mermaid（0022）、新建会话草稿页 + New worktree（0023）均已合入；vendor OpenCode v1.18.33；验证过的服务端为 1.18.33 和企业服务 1.18.13。gcp-workstation 已不存在，Remote 相关验证统一 BLOCKED；本机查看走 `bash scripts/package-vsix.sh && bash scripts/install-local.sh` 后 Reload Window。

## 0. 本轮路线（2026-10-13 用户确认：按建议从前往后做，一个会话做一张卡）

来源：[roadmap-research-2026-10-10](evidence/roadmap-research-2026-10-10.md) 建议的下一批（M10 / M11 / M01）只剩 M10 和 M01 后半，再加上 10-12 worktree 批次的遗留。现在 → 计划的示意图见私有页面 https://claude.ai/artifact/YUemLxbQKyocjwdfaygRHU 。2026-10-11 的 roadmap 批次（M11、M05 首片、M07 (1)(2)、M02、M14 Pin + Mark as Unread、侧栏多选）已完成，见 [roadmap-batch-2026-10-11](evidence/roadmap-batch-2026-10-11.md) 与 PROGRESS；它的剩余项已并入下面的卡片和 §1 / §3。

每个会话的固定做法（省 token）：

- 开工只读 AGENTS.md、本节和对应卡片。卡片点名的文件先 grep 定位，再按行读。不读调研全文和历史证据。
- 开工前先看 Mac mini 会话是否已认领同一张卡：`ssh macmini 'cd ~/Ai-Project/oco && git branch --show-current && git log --oneline -3'`（认领只记在 mini 本地分支的 NEXT 上，main / origin 看不到；2026-10-16 卡 9 因此被 MacBook 与 Mac mini 各做了一遍）。
- 调查交 Grok；实现交 Gemini，失败换 Grok；要起 VS Code 的 E2E 交 Claude 子代理（`model: "sonnet"`）。主线程只做方案、契约、集成、验收和提交。子代理回报不超过 15 行，完整记录和委派记录写进 `docs/evidence/<本卡批次>.md`。
- 只跑本卡相关的检查：typecheck、unit、build、本卡 E2E 和卡里点名的回归，不跑全量。E2E 只读 results.json，不看截图。
- 某一项修了两轮还不过，就记进本节，先收尾，不在本会话硬磕。
- 收尾：按路径本地提交（不推送）→ 更新 STATUS（顺带修正「基线与版本」里停在 0021 / 461ec92 的补丁链和本机扩展两行）、本节、PROGRESS → 打包并本机安装 VSIX → 停下，告诉用户下一张卡的开工提示词，以及需要用真实模型目视的项。
- 中途离开超过 1 小时，不回旧会话，按本节新开。

开工提示词（N 换成卡号）：

> 项目 oco。按 AGENTS.md，只做 docs/NEXT.md §0 的「卡 N」，开工只读 AGENTS.md、§0 和该卡点名的文件。授权：本地按路径提交，不推送。委派按 §0 的固定做法，做完按「收尾」停下。

执行方式（2026-10-13 用户要求并行）：卡 1 和卡 3 由规划会话同时开启，各在自己的 worktree 分支上做（`claude/card1-worktree-inbox`、`claude/card3-review-notes`）。并行期间两边都不改 STATUS / NEXT / PROGRESS，结果和委派记录写进各自的 `docs/evidence/card<N>-*.md`；跑 E2E 前用 `/tmp/oco-e2e.lock` 互斥；不打包、不安装、不推送。卡 2 和两边都有文件重叠，还要用到卡 1 的按会话目录逻辑，所以等两边结束后再开，由卡 2 会话先合并、再开发、最后统一收尾。

### 卡 1：worktree 会话进收件箱（验证 S，修复 M）[DONE 2026-10-14，合入 main 88b56c2，见 STATUS]

- 现在：0023 之后，worktree 会话会出现在 SESSIONS 列表（`scope=project`，`Connection.roots()` 含 sandboxes）。但 `apps/extension/src/session-feed.ts` 只订阅工作区目录的 `/event`（`x-opencode-directory` 为工作区目录），快照也按这个目录取。worktree 会话等授权、等提问或 busy 时能不能进收件箱和状态栏计数，STATUS 记为未验证；按代码推断大概率收不到。调研把它列为 M17 的前置改造（`roadmap-research-2026-10-10.md:316`）。
- 步骤：
  1. Grok 只读调查（最多 10 轮）：vendor v1.18.33 有没有 `/global/event`，载荷带不带 directory；`/permission`、`/question`、`/session/status` 能不能查其他目录；`Connection.roots()` 和 `bridge-policy.ts` 对 worktree 目录怎么放行。结论写进 `docs/evidence/worktree-inbox-<日期>.md`。
  2. Sonnet 子代理用 mock 复现：沿用 c12 新建 worktree 会话的流程，在 worktree 会话里触发一次 bash 权限请求，记录收件箱和状态栏计数有没有出现。先确认 mock 走的是真实 `opencode serve`（只替换模型）；如果事件路径也是模拟的，结论不算数。
  3. 确认收不到时：主线程定方案（按目录多开 `/event`，或改用 `/global/event` 再按目录过滤），数据源变化在 ADR-009 §2 补一行；实现交 Gemini，写入范围为 `session-feed.ts` 及其单测，确有需要再加连接相关文件。
  4. 新增 mock E2E `c13-worktree-inbox`：两个 worktree 会话同时等授权 → 不开面板，在侧栏全部 Allow → `GET /permission` 为空、计数归零。回归 c6-inbox、c12-new-session-draft、p1b-sidebar。
- 验收：c13 通过；typecheck 0、unit 全过、build PASS；VSIX 已安装。如果复现时已经能收到，只补 c13 和 STATUS，可以在同一会话接着做卡 2。

### 卡 2：侧栏停止 + 通知分级 + V2 识别（各 S）[DONE 2026-10-14，合入 main 18cae65，见 STATUS]

- [DONE 2026-10-14：本机 ssh fetch Mac mini 分支后合入 = 88b56c2，c13 / c14 / c15 / c6 / c12 / p1b-sidebar 全过，见 [card2-merge-e2e](evidence/card2-merge-e2e.md)；Mac mini 上两个 worktree 待卡 2 收尾时移除] 开工先合并：确认卡 1、卡 3 两个会话都已结束，只读两份证据文件的结论段；把 `claude/card1-worktree-inbox`、`claude/card3-review-notes` 依次合进 main，冲突以卡 1 的按会话目录逻辑为准；合并后跑 typecheck、unit、build 和两边新增的 E2E。收尾时一并 `git worktree remove` 两个 worktree。
- B 侧栏一键停止（M10，`roadmap-research-2026-10-10.md:333`）。现在侧栏没有停止入口，`oco.stopManagedServer` 停的是整个托管服务。计划：运行中的行悬停出现 ■，多选栏加 Stop，状态栏「Stop all running」先确认一次；宿主 `POST /session/:id/abort`，发送前核对仍是 busy；停父会话时提示会连带停后台子代理。mock E2E：busy 会话从侧栏 Stop → 回到 idle、转圈消失。
- C 通知分级（M01 后半，同文件第 305、335 行）。现在只有 `oco.sessions.notifyPending`：`sessions-view.ts` 里用 `showWarningMessage`，不判断窗口是否在前台，会话完成也不提醒。计划：「需要我」「已完成」两类设置，各三档 off / windowNotFocused / always，默认 windowNotFocused；旧 `notifyPending=false` 迁为两类都 off；完成通知带一行摘要和 Open / Diff；报错不进状态栏计数。只弹 VS Code 内通知，不接系统通知中心。验收：窗口在前台、不在前台各触发一次，用单测或 E2E 覆盖。
- V2 识别：连接时探测 `/api/info`，返回 2.x 就提示「此 oco 只支持 OpenCode V1，请在 oco.opencodePath 指定 V1 可执行文件」，不再显示版本未知；单测 mock 一个 V2 的 `/api/info`。依据：分支 `claude/opencode-v2-roadmap-h17kw7` 上 V2 迁移评估的 §5 第 1 步（未合入 main，需要时用 `git show` 读）。
- 委派：B 交 Gemini，C 和 V2 交 Grok，并行。两边都可能改 `sessions-view.ts` 和 `package.json`：派发前先划清文件归属，重叠的接线、命令和设置声明由主线程合并。
- 验收：typecheck 0、unit 全过、build PASS、B 的 E2E 通过；VSIX 已安装。

### 卡 3：审阅意见发回 agent + Fix with OpenCode（S + S–M）[DONE 2026-10-14，合入 main 88b56c2，见 STATUS]

- M13 首版（`roadmap-research-2026-10-10.md:314`）：编辑器选区右键「Add to Review Notes」，累积文件、行号、片段和意见（宿主内存 + workspaceState）；侧栏该会话行显示「N 条待发」；「Send all」合成一条文本，经 `draft.insert` 放进草稿，由用户发送。注明前像来自 Git 变更，可能含非本会话的改动。
- M05 第二片（同文件第 308 行）：终端最近命令输出（shell integration）、Problems / SCM 菜单贡献点、「Fix with OpenCode」灯泡；沿用 `oco.addToDraft` 的截断和排除规则。
- 两项都走草稿投递路径，按顺序做或合成一个实现任务，不要并行改同一批文件。
- 验收：各一条 mock E2E；typecheck、unit、build；VSIX 已安装。

### 卡 4：和用户一起重新排期 [DONE 2026-10-14：下一批只做 M20 子代理聚合；M12 暂不做；做完 M20 推送 origin 并让 Mac mini 更新到最新；2026-10-14 核对 Mac mini 已在 main 9c54524]

- 待用户决定：M12 会话内排队（调查已完成，上游是「暂时移除」而非缺陷；若立项，形态为一枚小补丁：embedded 下 followup 默认 queue，加载时置 paused）；是否也连公共版 opencode（npm 最新 1.19.0，未验证）；T018。
- 候选：M03 键盘直达、M14 第二步 Label + Snooze、M20 子代理聚合、M21 结果卡 Git 动作（先补 ADR-009 §4）、§1 / §2b 的测试与目视欠账。

### 卡 5：M20 子代理聚合第一步（S–M）[DONE 2026-10-14，合入 main 9222aa7，见 STATUS]

- [DONE 代码，卡 6] 剩余第二步——补丁扩 0017 标题行，子代理 pills（状态点，窄面板折叠为计数），点击走补丁 0016 既有会话链接 → 宿主 openSession；父 / 子 / 兄弟导航 chord 键位，when 限定 `activeWebviewPanelId == 'oco.chat'`。

### 卡 6：路线图剩余可做项一次做完（2026-10-14）[DONE 代码 + 离线检查，E2E / 目视待卡 7]

- 用户要求「全部完成、不跑耗时测试、省 token」。范围与委派记录见 [roadmap-batch-2026-10-14](evidence/roadmap-batch-2026-10-14.md)：M06 (1a)(2)、M14 第二步 Label + Snooze、M03 片 1 + 片 2、M19 资源管理器徽标、M08 Follow、M13 第二步评论线程、M20 第二步标题行 pills（补丁 0024）、§2b P1-2 / N2 / N3 / P3-9 / P3-10（补丁 0025）、§3 的 bridge-policy realpath、懒取上限、E2E 助手两处、c4 / c5 真实模式放宽、夜间脚本。
- 离线（25f3f9a）：typecheck 0；unit 422/0；vendor typecheck 0；build PASS；Grok 只读评审 5 处缺陷已修（snooze 丢失、非 loopback 也 realpath、评论线程路径基准、Follow 关面板后仍跟随、代理写盘被当成用户编辑）；本机已装 `oco-0.0.4-25f3f9a.vsix`。E2E 与真实模型目视全部 NOT RUN。

### 卡 7：夜间验收 [DONE 2026-10-15：mock 全过，3 处产品缺陷已修，真实模型 BLOCKED（big-pickle 403）；见 STATUS 卡 6 与 evidence/mini-card7.md] （2026-10-14 改由 Mac mini 执行：提示词 [docs/mini/card7.md](mini/card7.md)，`scripts/mini/dispatch.sh card7`；下面的会话提示词作废，步骤以 card7.md 为准）

开工提示词：

> 项目 oco，分支 claude/roadmap-batch-2026-10-14。按 AGENTS.md，只做 docs/NEXT.md §0 的「卡 7」，开工只读 AGENTS.md、§0 卡 6 / 卡 7 和卡里点名的文件。授权：本地按路径提交，不推送、不合入 main。用户在睡觉，不要提问；需要决定的事记进卡 8。委派按 §0 固定做法，E2E 交 Claude 子代理（model: "sonnet"，难题 "opus"）。

1. 新 mock E2E（Claude 子代理写并跑，套件各自独立，读 [tests 证据](evidence/roadmap-batch-2026-10-14-tests.md) 和 c10 / c16 / c17 的写法）：c18-permission-note（Always 预览文字、Deny with note 后 `GET /permission` 为空且服务端收到 message）、c19-label-snooze（加标签进分区；snooze 隐藏 / Unsnooze；新消息到达自动唤醒；等授权行不被隐藏、状态栏计数不变）、c20-inbox-nav（`oco.inbox.next` 打开并 Enter 直达；侧栏 j / k / Enter / ?）、c21-follow（开 Follow 后 agent 编辑的文件以 preview 打开且焦点不离开面板）、c22-review-threads（Add to Review Notes 后编辑器出现评论线程，Send all 后消失）、c23-subagent-pills（父会话面板标题行出现 pills，点 pill 打开子会话）、c24-runtime-question（运行视图环心点选项即回答，`GET /question` 为空）。M19 徽标若 Playwright 取不到，单测已覆盖，记 N/A。
2. 回归：`bash scripts/overnight-e2e.sh`（默认 13 个套件，mock）+ 上面新套件；`bash scripts/overnight-e2e.sh --loop 10 p1b-narrow` 判定竞态；`bash scripts/overnight-e2e.sh c4-trajectory c5-runtime --real`。
3. 失败：测试侧直接修；产品侧修两轮不过就记进卡 8，不硬磕。
4. 真实模型目视预备：对下列项各截 1 张图放 `docs/evidence/runs/overnight-*/visual/`，在证据里列清单，留给用户早上看：收件箱 / worktree 会话、侧栏停止、通知、审阅意见与评论线程、Fix with OpenCode、子代理徽标与标题行 pills、Always 预览 / Deny with note、标签 / Snooze 分区、运行视图提问态与窄布局、亮色主题下侧栏分区。
5. 收尾：更新 STATUS / PROGRESS / 本节，按路径提交，打包并本机安装 VSIX。

### 卡 8：需要用户决定（不阻塞，早上看）

- 夜间新增：真实模型怎么跑（提供模型凭据 / 用官方 OpenCode 二进制）；是否把 opencode 1.19.0 加进 VERIFIED_SERVERS（mock 41 套件全过，真实模型未跑）；两处窄布局观感（矮舞台工具行只剩「+N」；窄布局未打标签的行紧跟最后一个标签组、没有自己的分区头）；先看 18 张目视截图。
- 默认键位：`oco.inbox.next`、`oco.session.parent / child / nextSibling / previousSibling / recent`、`oco.follow.toggle` 现在都不绑定；要不要给 chord 默认值（when 限定 `activeWebviewPanelId == 'oco.chat'` 或 oco 视图焦点）。
- 卡 6 分支是否合入 main、是否推送（卡 7 通过后）。
- 立项决策：M21 Git 动作（先补 ADR-009 §4）、M18 导出与分享、M15 Agents 视图、M04 回滚入口、Aider 式注释触发、T018 publisher 与许可证、M13 composer chip（需扩 DraftInsert 契约与补丁 0001）。

### Mac mini 队列（2026-10-14 起；约定见 [MINI](MINI.md)，一次一个，提示词写到 `docs/mini/<任务>.md` 再 dispatch）

- [DONE 6885865] card7：卡 6 新功能 E2E（c18–c24）+ 13 套件回归 + p1b-narrow 循环 + c4 / c5 真实模式 + 目视截图。
- [BLOCKED：big-pickle 403，需真实模型凭据或官方 OpenCode 二进制] mini-real：卡 7 修复合入后，真实模型全量 21 套件；含 c10 / c11 遗留 NOT RUN（模态确认的批量 delete / archive、真实模型压缩目视）。
- [DONE d7fe378] mini-nested：mock 产生孙会话 + 嵌套 ≥2 层 E2E（运行视图、侧栏徽标、标题行 pills）。
- [部分 aaa22a0：perf.mjs 匹配修复 4/4、bench 端口改包装脚本（单元 43/0、Playwright 61/65，3 个失败待在干净上游检出上区分来源）；数小时内存与数千行滚动仍 TODO] mini-perf：数千行长会话滚动与数小时常驻内存趋势（先修 `perf.mjs` 按 `.oco-test/vscode/perf` 找进程、遇短路径失配的问题）；`test:bench` 端口 4096 / 3000 冲突。
- [DONE aaa22a0，本机子代理] mini-tools-k：轮末工具台 end 后 ≥2 s 采样复核（0.6 / 2.6 / 3.6 s 均为 0）。
- [DONE 71bfce4，本机子代理：1.19.0 mock 41 套件 0 失败] mini-compat：对 npm 最新公共版 opencode（1.19.x）跑 mock 回归并列出差异，供「是否支持公共版」决策。
- mini-remote（提示词 [docs/mini/mini-remote.md](mini/mini-remote.md)，card7 结束后派发）：VS Code Remote-SSH 连 Mac mini 自身，解除 Remote 断网恢复 / Remote 窗口查看轨迹与运行视图的 BLOCKED。2026-10-14 用户同意；前提是用户手动给 Mac mini 加自连 ssh key（安全配置不由代理改）。
- 常驻：每次合入 main 后跑一次 `overnight-e2e.sh` 默认回归。

本机保留（按省 token 排，每项一个新会话，开工只读 AGENTS.md + 对应卡）：
1. 早上第一件（小会话）：用 AskUserQuestion 一次问完卡 8（默认键位、合入 / 推送、M21 / M18 / M15 / M04 / Aider / T018 / M13 chip 立项），零调查成本。
2. 卡 7 与夜间 Mac mini 任务的产品缺陷：夜里能修的已由 Mac mini（mini-fix7，Opus）修并合进卡 6 分支；剩下的主线程只定方案，实现交 Gemini / Grok，回归交 Mac mini。全绿后按用户决定合入 main、推送。
3. 上游补丁与 vendor 升级：以 mini-compat 的差异报告为输入，主线程定升级与否；升级时 Grok 改 vendor、`regen-patch.sh` 再生成补丁，Mac mini 全量回归。
4. §3 / §4 产品小项与 T009 / T010 / T011：按文件归属合成 1–2 张卡，Gemini 实现，Mac mini 写 E2E；T014 管理页外壳先写 ADR 与用户确认（AGENTS.md：未经验证不批量开发管理页面）。
5. 立项的新功能（如 M21）：主线程先写 ADR / 契约，实现交 Gemini，E2E 交 Mac mini。
6. 推送与发布：只在用户明确要求时做。

## 0b. Claude Code 对照批次（2026-10-16 夜间，用户授权无人值守；分支 claude/cc-features-2026-10-16）

来源：用户 2026-10-15 夜要求「评估 Claude Code 新版本里适合 oco 的特性并加进来，与 Mac mini 分工，注意 token 与时间」。对照表与委派记录在 [cc-features-2026-10-16](evidence/cc-features-2026-10-16.md)。分工：本机主线程只做范围、契约、集成、合入与文档；实现交 Gemini（探测 OK）；只读调查交 Grok；E2E 与回归交 Mac mini（tmux-gui 守护已于 00:12 加载，见 mac-mini skill 案例库）。

本批（夜间执行，状态早上以 STATUS 为准）：

- F1 会话导出 Markdown（= M18 第一片；Claude Code `/export`）：`oco.exportSession`（untitled 编辑器）、`oco.exportSessionToFile`（保存对话框），侧栏行菜单 + 命令面板；渲染器纯函数 + 单测。[DONE 代码 25f9a76；E2E c26 2/2]
- F2 状态栏 HUD（= Claude Code status line / claude-hud）：`oco.hud` 显示聚焦会话的 模型 · 上下文 % · 花费，运行 / 等待前缀，tooltip 带 token 分项；设置 `oco.statusBar.hud`。[DONE 代码 25f9a76；E2E c28 2/2]
- F3 验证上游已有的「回退检查点」（revert dock）与「任务列表」（todo dock）在嵌入模式可用：Mac mini 写 c26-export、c27-docks、c28-status-hud 并跑受影响回归。[DONE：c27 2/2，todo dock 仅轮次运行中可见（上游设计）；嵌入模式回退只有 `/undo`，无逐条消息按钮 → 卡 9 成立]
- 常驻：合入 main 后默认 mock 回归。[DONE：mini-ccfeat 13 套件 11 过；c5-runtime think-card 为 main 既有抖动（mini-baseline 2/2 复现，见 §1）；p1b-narrow 归因 HUD 布线多触发整表重渲染，改 `refreshHud()` 后 mini-narrow ×5 全过]
- 收尾：[DONE 合并提交 `1f5c6fb` 已推送；本机已装 `oco-0.0.4-1f5c6fb.vsix`；Mac mini 已拉取]

2026-10-16 上午用户决定：按卡 9–13 顺序开工，允许并行；本机会话与 Mac mini 会话按下面的规则协调（两边都读这一段，改动只提交到各自分支，规则本身只在 main 上改）：

- 认领：开工前在本节对应卡末尾写「[认领：<会话> · <分支>]」，提交到 main 并推送；已被认领的卡不另开。现状：卡 9 DONE（main 021c58f，无补丁）；卡 10 = Mac mini 会话 · `claude/card10-toc`（补丁 0026 turn rail、c29 / c30、test-server / overnight-e2e real 模式）；卡 11 = 本机新会话 · `claude/card11-git-actions`。
- 文件归属：卡 10 = `patches/opencode/0026-*`、`tests/e2e/c29-*`、`c30-*`、`tests/e2e/server.mjs`、`scripts/test-server.sh`、`scripts/overnight-e2e.sh`、`docs/evidence/card10-*`；卡 11 = `docs/adr/009-*`（只加 §4）、`apps/extension/src/*`、`apps/extension/package.json`、`tests/unit/*`、`tests/e2e/c31-*`、`docs/evidence/card11-*`。不碰对方的文件；新补丁号卡 10 用 0026，其余卡从 0027 起，开新补丁前先看 main 上最新编号。
- 共享文档：并行期间不改 STATUS / PROGRESS；NEXT 只改自己卡那一行（认领 / DONE）。合入 main 时由合入者一次补齐 STATUS 段落、PROGRESS 条目与 NEXT 行。
- 合入顺序：先完成者先合（`--no-ff`）；合入前先把最新 main 合进自己分支，重跑 typecheck / unit（以及本卡 E2E）；合入后立刻推送 origin，并用 `bash scripts/mini/notify.sh` 或 NEXT 行通知；另一边在自己合入前再合一次 main。
- 冲突处理（2026-10-16 08:45）：Mac mini 会话在未拉到 6b99e3b 的情况下也开始了卡 11（本地分支同名 `claude/card11-git-actions`，未提交，且改了 `packages/contracts/src/bridge.ts`）。裁定：卡 11 归本机会话（ADR §4 已提交 21f9b27，实现不扩桥契约）；Mac mini 会话请停下卡 11，把草稿存到 `claude/card11-mini-draft`（只作对照，不合入 bridge.ts 改动），拉 origin/main，先按合入顺序把卡 10（`claude/card10-toc` e1b7eef）合入 main 并推送，再认领卡 12（消息级书签）。公共契约（bridge.ts）按 AGENTS.md 只由主线程集成人改。
- E2E 互斥：Mac mini 上同时只跑一个 E2E（`/tmp/oco-e2e.lock`，dispatch 的 `mini-*` 会话互斥）；本机跑 E2E 同样拿 `/tmp/oco-e2e.lock`。VSIX 由合入者在合入 main 后打包安装一次。

下一批候选（按价值 / 成本排序，早上确认后按 §0 固定做法一张卡一个会话）：

- 卡 9 M04 回退入口 [DONE 2026-10-16，Mac mini 会话分支 claude/card9-rewind，已 cherry-pick 进 main 83624b8；MacBook 卡 9 会话重复开工后只做交叉验证（见 STATUS）：上游用户消息自带「Revert message」（hover 显示，与 fork 同排），嵌入模式可用；c27(b) 结论系测试未 hover。新增 c29-rewind 4/4 ×2，不加补丁 0026。见 [card9-rewind](evidence/card9-rewind.md)]
- 卡 10 章节目录：核实上游 `pages/session/timeline/` 在嵌入模式是否可见；不可见则打开或做紧凑「跳到某轮」侧轨（Claude Code mark_chapter 的等价物）。S。[认领：Mac mini 会话 · `claude/card10-toc`，补丁 0026 turn rail 进行中] [进行中 2026-10-16：Mac mini 会话，分支 claude/card9-rewind 之后另开 claude/card10-toc；MacBook 请勿重复]
- 卡 11 M21 Git 动作 v1：先补 ADR-009 §4 边界（oco 不自己执行 git），只做「让 agent 提交 / 开 PR」提示模板 + 打开 SCM 视图；不做 CI 监视与自动合并。S + ADR。[认领：本机新会话 · `claude/card11-git-actions`] [DONE 2026-10-16，合入 main `ffc311c` 已推送，本机已装 VSIX；见 STATUS 卡 11、[card11-git-actions](evidence/card11-git-actions.md)；Mac mini 的同名草稿（45d9d86 + 自写 c31）只作对照未合入]
- 卡 12 消息级书签（Claude Code 2.1.286 Bookmarks 侧栏）：钉住某条回复，侧栏会话下方列出，点击走上游 `useSessionHashScroll` 定位。M。[认领：Mac mini 会话（按 08:45 裁定，卡 10 合入后接手）· 建议分支 `claude/card12-bookmarks`；文件归属：`apps/extension/src/bookmarks.ts`（新）、`sessions-webview.ts`、`package.json` 只加命令 / 菜单、`tests/e2e/c32-*`、`docs/evidence/card12-*`；如需 vendor 补丁用 **0027**；`extension.ts` 只加一行 `...registerBookmarks(...)`]
- 卡 13 M13 composer chip + 「自动附带编辑器选区」设置（Claude Code 2.1.300 `attachSelection`）：需扩 DraftInsert 契约与补丁 0001。M。[认领：本机新会话 · `claude/card13-composer-chip`；文件归属：`packages/contracts/src/bridge.ts`（DraftInsert chip 字段，向后兼容）、`patches/opencode/0001-*` 再生成（`scripts/regen-patch.sh`，非顶层补丁按 memory 规则用临时树）、`apps/chat-webview/*`、`apps/extension/src/add-to-draft.ts`、`package.json` 只加设置 `oco.draft.attachSelection`、`tests/unit/*`、`tests/e2e/c33-*`、`docs/evidence/card13-*`；如需新补丁用 **0028**；`extension.ts` 只改选区监听的注册一行] [DONE 2026-10-16，实际分支 `claude/great-keller-c26ae2`（app 建的 worktree 分支，非认领行写的名字），合入 main `d04ad9d` 已推送，本机已装 VSIX；见 STATUS 卡 13、[card13-composer-chip](evidence/card13-composer-chip.md)；本批（卡 9–13）至此做完，不再开新卡]
- 不做（已评估）：收尾框 / 回复按钮、提议卡、PR 绑定与 CI 自动修复、Remote Control / 云会话 / 定时任务、Artifacts、浏览器面板、idle compaction（服务端概念）。
- 仍需用户决定（卡 8 不变）：默认键位 chord、真实模型凭据、1.19.0 进 VERIFIED_SERVERS、M15 Agents 视图、T018 publisher / 许可证、Aider 式注释触发。

## 1. 真实模型回归（本批第二步）

- [既有，待修] c5-runtime think-card：思考卡片宽度 337→342→344 抖动，main 3f89430 基线 2/2 复现（[mini-baseline](evidence/mini-baseline.md)），与 cc-features 无关；和 mini-card7 记的舞台高度抖动同类，需在运行视图里定位宽度来源（补丁 0020 / 0025 的几何）。
- [DONE 2026-10-16] p1b-narrow deny-260 / question-260：根因是 HUD 布线在 `/provider` 返回等时机多触发一次侧栏整表重渲染；改为只刷状态栏的 `refreshHud()` 后 ×5 全过（[mini-narrow](evidence/mini-narrow.md)）。教训：状态栏类更新不要走 `view.refresh()`。
- [DONE 一轮] 真实模型全量 E2E：21 套件，首轮 16 套件无 FAIL；修测试后重跑 p1a-chat、p1a-identity 通过。见 [fail-diag](evidence/cleanup-2026-10-10-fail-diag.md)。
- [TODO，卡 7 `overnight-e2e.sh --loop 10 p1b-narrow`] p1b-narrow「新面板未出现」：两次落在不同宽度（320、260），先用 mock 模式循环复现，判定是否为产品侧打开新面板的竞态。
- [DONE 代码 522c08b，NOT RUN 待卡 7] c4 live-update / subagent-row、c5 tool-turn / tool-fail / retry：按 `modelMode` 把依赖 mock 口令或模型时序的断言改判 N/A 或放宽采样；c5 真实模式外层超时调到 ≥ 30 分钟。
- [DONE 2026-10-10] 真实模型新对话运行视图：阶段序列与流式递增正常；轮末 tools-k 复核见第 3 节。
- [NOT RUN] 嵌套 ≥2 层子代理：big-pickle 两次提示都只派一层；要验证得给 mock 补孙会话再加 E2E，或换会递归派发的模型。
- [DONE 2026-10-10] 亮色主题目视：仅轨迹时间线圆点对比度偏低（第 3 节小项）。
- [TODO，长期] 数小时运行与长会话内存趋势；数千行长会话滚动（工作站上最长只有 12 次请求）。
- [BLOCKED，无主机] Remote 断网恢复、Remote 窗口查看轨迹与运行视图；本机粘贴图片（A11 剩余）仍 NOT RUN。
- [TODO] 2026-10-11 批次遗留的 E2E 未覆盖项，见 c10 / c11 证据的 NOT RUN：模态确认的 delete / archive 批量、真实模型下压缩目视。

## 2. 多 agent 驾驶舱（下一阶段；先写 ADR-009 划界，再动手）

oco 是 OpenCode 的客户端，不自建调度引擎。上游 1.18.33 已有 `task` 后台子代理、`prompt_async`、`permission.ask` 等钩子。按杠杆排序：

- [DONE 2026-10-10] [ADR-009](adr/009-multi-agent-cockpit-boundary.md)：oco 只通过 OpenCode API 发起会话、选择 agent / 模型、投递提示词、批复权限；不做推理循环、不执行工具、不自建权限库、不内置定时器。
- [DONE 2026-10-10，证据 [cockpit-inbox-2026-10-10](evidence/cockpit-inbox-2026-10-10.md)，E2E c6-inbox] 跨会话「待处理」收件箱：侧栏新分区列出等权限 / 等提问 / 报错 / 完成未读的会话（含子代理），就地批复，状态栏计数 + VS Code 通知。数据源为 session-feed 已接收的 SSE 事件，不改桥契约。验收：三个后台子代理同时等授权，不打开任何会话即可全部批完。
- [DONE 2026-10-10，证据 [cockpit-result-card-2026-10-10](evidence/cockpit-result-card-2026-10-10.md)，E2E c7-result-card] 每会话结果卡：侧栏 done / error 行一行摘要（文件数 · 耗时 · 花费 · 最后一句）+ Open / Diff / Mark read；运行视图环心卡片终态列改动文件并一键打开上游 Review 面板；补丁 0021。接续验收已完成：修复 user summary 数据源、Review 模式和文件 diff 定位；c7 6/0，相关 c6 5/0、c2 3/0，221 单测通过，本机已安装。用户已确认复用原生「Git 变更」：Diff 入口切 Git；卡片文件名单独汇总本会话各轮记录，去重，不取整个 Git 目录、不显示跨轮增删行。c8 5/0 + c7 6/0，新包已装；不新增 session diff API。剩余仅真实模型目视 NOT RUN。
- [DEFER] 批量发起与任务队列：先用脚本（循环调 `prompt_async` 并打批次标签）代替；收件箱用一段时间后，若经常一次发起 ≥3 个独立任务再做最小「从清单文件发起」命令。膨胀风险：重试 / 持久化 / 跳过会把 ADR-009 的「内存队列」推向队列系统。批次汇总随之搁置（没有批次标签就没有分组头）。
- [DEFER] Agent 定义编辑（T013 权限 / 模型子集）：OpenCode 配置本就是仓库内文件，VS Code 直接编辑成本已低；只有无人值守运行反复因权限配置出错才回头做。
- 不做：oco 内置 cron / 定时器（夜间批量用脚本包 `opencode run` 交给 launchd）；多模型竞赛；团队 RBAC。

## 2b. 运行视图 M5 设计评审（2026-10-10 第一批已落地；剩余另立项）

- 已落地（样稿 + 补丁 0020，见 [STATUS](STATUS.md) 与 [runtime-m5-review-2026-10-10](evidence/runtime-m5-review-2026-10-10.md)）：P1-1 顶栏阶段 / 对象 / 已等时长 + 慢调用琥珀；P1-3 后半忽略态收敛；P2-5 计数合并；P2-6 去重；P2-8 疑似循环提示；P3-9 浮层文案；P3-10 刻度图例。不采用：P2-4、P2-7、空闲标签改短格式。
- [DONE 代码 补丁 0025，目视待卡 7] P1-2 提问态：环心卡片 = 问题 + 选项整行，点选项即回答。前提是产品里接通回答通道（现状：「你」卡片选项无 onClick，运行视图内无输入框，live 只有 Dismiss 按钮走 REST；见 [investigation](evidence/runtime-m5-review-2026-10-10-investigation.md) P1-2）。
- [DONE 代码 补丁 0025，目视待卡 7] 窄布局（< 980）：N2 环心卡片是右侧整列高框（`ring-geo.ts` 窄布局几何），改成环占满宽度、卡片贴环下方；N3 空工具台在窄布局不收缩（`dk` 只进宽布局）。N1「模型框被站牌压住」在产品里不成立，不做。
- [DONE 代码 补丁 0025] P3-10 剩余：进度条标签避让红 / 黄刻度（`trackLabelsAt` 目前不看刻度位置）。P3-9 剩余：结果浮层「← 3/4 →」翻同一请求其他结果。
- [TODO] 真实模型下目视本批顶栏文案与慢调用琥珀（并入第 1 节真实模型回归）。

## 3. 小项（按需）

- 草稿追加分隔（2026-10-16 卡 11 c31 观察）：补丁 0001 的 draft-insert 对非空草稿原样追加，连续两次插入会连成 `Do not push.Open a pull request`；应在草稿非空时先补一个换行（所有来源受益）。S。

- 收件箱：提问就地作答已在侧栏落地（2026-10-11）；环心输入框版本与 §2b P1-2 合并考虑；真实模型下目视通知、收件箱与就地作答；亮色主题下看一次分区、选择栏与按钮。
- 轮末工具台 tools-k：在 end 后 ≥2 s 再采样确认收到 0（2026-10-10 探查只采到 end 瞬间的 0.380，`dk` 为逐帧过渡值）。
- 亮色主题下轨迹时间线圆点 rgb(205,214,228) 对比度偏低。
- c4 / c5 在真实模型模式下跳过或分支 mock 专属断言（live-update、subagent-row、tool-turn、tool-fail、retry）；与另一会话的 fail-diag 协调，不要同时改 tests/e2e。
- 轨迹页子智能体行跳转子会话（对话卡片已走宿主 `openSession`，轨迹行复用同一路径）。
- 轨迹页「子智能体」标签改用子代理蓝；矮航道作业区标签隐藏。
- 切换大会话时新数据到达前没有加载提示；首开后第一次点击仍可能等一次 `/provider`。
- 运行视图嵌套 ≥2 层 mock E2E（需 mock 产生孙会话）。
- M07 后续：收件箱「压缩中」行与 `session.compacted` 订阅（现在按请求 resolve 即结束）。
- 真实「断连」需宿主新增消息（改桥契约），v1 不做。
- 补丁 0020 体量（58 个文件，多为新文件）：可选把纯新增文件移出补丁改为构建时叠加目录，只在 vendor 升级吃力时再做。

- [DONE 代码 卡 6，loopback 下 realpath] `bridge-policy.ts:83-87` 目录比较是精确字符串：服务端数据目录路径含符号链接时，返回的 worktree 目录与会话目录拼写不同，worktree 新建会话被拒（卡 2 E2E 环境发现，既有问题）。修法：loopback 下比较前 realpath，或统一规范化。
- [DONE 代码 522c08b，NOT RUN 待卡 7] E2E 共享助手偶发：`tests/e2e/vscode.mjs` 启动时 `clearNotifications` 的命令面板 `fill` 30 s 超时（c10 8 次中 2 次，重跑即过）。在嵌套 worktree 跑 E2E 时 `.oco-test` 路径过长会超过 macOS socket 103 字符上限，需指向短路径。

- [DONE 代码 卡 6：只对收件箱、pinned 与 recent 前 20 行] 子会话 / todo 懒取对每个可见 pinned / recent 行各发一次（M20 E2E：测试服务端每次连接 74–92 次，并发上限 4）；行很多时可只取前 N 行或空闲时再取。

## 4. 仍未做的 v0.1 项（按需单独立项）

- T009 多连接 / 多工作区分组（分页与服务端搜索已完成；批次分组见第 2 节）。
- T010 键盘可访问性、主题配色专项检查。
- T011 附件 / 图片大小限制与远端来源区分。
- T014 管理页外壳。T018 正式 publisher、oco 自身许可证（需用户决定）。
- 不做，除非用户另行决定：记录实际系统提示词 / 原始请求（需 OpenCode 插件钩子，只能托管模式注入）；工具页签按权限标灰、MCP 工具分组。

## 执行约束

- 开工读 AGENTS.md；STATUS / NEXT 先定位标题，只读任务相关段落，以及本任务点名的契约。
- 调查、独立实现、测试和文档检查先实际委派。主代理保留契约、集成和关键抽验；接手例外、实际执行证据与 fallback 记入本批证据，按 [AGENTS](../AGENTS.md) 执行。
- 历史 E2E 不是本轮通过；mock 运行不计真实模型验收。
- 真实 IME、系统剪贴板、Windows 仍按 STATUS 的未验证标记。缺环境就标 NOT RUN 或 BLOCKED。
- 你不是唯一工作者：提交只按路径加入自己的文件，不用 `git add -A`。
- 任务写明授权时可以本地提交。不自动推送或发布。
