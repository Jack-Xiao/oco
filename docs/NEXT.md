# 当前队列

本文件是唯一的当前队列。状态只看 [STATUS](STATUS.md)。不要执行 HANDOFF 或 P1B-NEXT-STEPS 里的旧提示词。

当前基线：main `88b56c2`（2026-10-14 合入卡 1、卡 3；本机 main 领先 origin 8 个提交，未推送）。运行视图 M1–M5（补丁 0020）、结果卡（0021）、Mermaid（0022）、新建会话草稿页 + New worktree（0023）均已合入；vendor OpenCode v1.18.33；验证过的服务端为 1.18.33 和企业服务 1.18.13。gcp-workstation 已不存在，Remote 相关验证统一 BLOCKED；本机查看走 `bash scripts/package-vsix.sh && bash scripts/install-local.sh` 后 Reload Window。

## 0. 本轮路线（2026-10-13 用户确认：按建议从前往后做，一个会话做一张卡）

来源：[roadmap-research-2026-10-10](evidence/roadmap-research-2026-10-10.md) 建议的下一批（M10 / M11 / M01）只剩 M10 和 M01 后半，再加上 10-12 worktree 批次的遗留。现在 → 计划的示意图见私有页面 https://claude.ai/artifact/YUemLxbQKyocjwdfaygRHU 。2026-10-11 的 roadmap 批次（M11、M05 首片、M07 (1)(2)、M02、M14 Pin + Mark as Unread、侧栏多选）已完成，见 [roadmap-batch-2026-10-11](evidence/roadmap-batch-2026-10-11.md) 与 PROGRESS；它的剩余项已并入下面的卡片和 §1 / §3。

每个会话的固定做法（省 token）：

- 开工只读 AGENTS.md、本节和对应卡片。卡片点名的文件先 grep 定位，再按行读。不读调研全文和历史证据。
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

### 卡 2：侧栏停止 + 通知分级 + V2 识别（各 S）[进行中：合并已完成；B / C / V2 在分支 `claude/card2-stop-notify-v2`]

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

### 卡 4：和用户一起重新排期

- 待用户决定：M12 会话内排队（调查已完成，上游是「暂时移除」而非缺陷；若立项，形态为一枚小补丁：embedded 下 followup 默认 queue，加载时置 paused）；是否也连公共版 opencode（npm 最新 1.19.0，未验证）；T018。
- 候选：M03 键盘直达、M14 第二步 Label + Snooze、M20 子代理聚合、M21 结果卡 Git 动作（先补 ADR-009 §4）、§1 / §2b 的测试与目视欠账。

## 1. 真实模型回归（本批第二步）

- [DONE 一轮] 真实模型全量 E2E：21 套件，首轮 16 套件无 FAIL；修测试后重跑 p1a-chat、p1a-identity 通过。见 [fail-diag](evidence/cleanup-2026-10-10-fail-diag.md)。
- [TODO] p1b-narrow「新面板未出现」：两次落在不同宽度（320、260），先用 mock 模式循环复现，判定是否为产品侧打开新面板的竞态。
- [TODO，测试侧] c4 live-update / subagent-row、c5 tool-turn / tool-fail / retry：按 `modelMode` 把依赖 mock 口令或模型时序的断言改判 N/A 或放宽采样；c5 真实模式外层超时调到 ≥ 30 分钟。
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
- [TODO，单独立项] P1-2 提问态：环心卡片 = 问题 + 选项整行，点选项即回答。前提是产品里接通回答通道（现状：「你」卡片选项无 onClick，运行视图内无输入框，live 只有 Dismiss 按钮走 REST；见 [investigation](evidence/runtime-m5-review-2026-10-10-investigation.md) P1-2）。
- [TODO，合成一轮] 窄布局（< 980）：N2 环心卡片是右侧整列高框（`ring-geo.ts` 窄布局几何），改成环占满宽度、卡片贴环下方；N3 空工具台在窄布局不收缩（`dk` 只进宽布局）。N1「模型框被站牌压住」在产品里不成立，不做。
- [TODO，小] P3-10 剩余：进度条标签避让红 / 黄刻度（`trackLabelsAt` 目前不看刻度位置）。P3-9 剩余：结果浮层「← 3/4 →」翻同一请求其他结果。
- [TODO] 真实模型下目视本批顶栏文案与慢调用琥珀（并入第 1 节真实模型回归）。

## 3. 小项（按需）

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
