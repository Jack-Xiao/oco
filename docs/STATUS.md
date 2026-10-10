# 当前状态

唯一的当前状态入口；队列见 [NEXT](NEXT.md)。详细历史和 ADR 按需读取。

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

- 上游基线：vendor OpenCode v1.18.33（提交 `51ef4be`，浅克隆；旧文档里的补丁基线 `deb241e` 已不存在，补丁再生成改用 `scripts/regen-patch.sh` 在临时 worktree 重建基线）。
- 补丁链：`patches/opencode/` 0001–0020 全部干净重放通过（`0019-oco-embedded-context-usage.patch` 恢复标题行上下文用量；`0020-oco-runtime-view.patch` 为运行视图，历史文档中提到补丁 0019 运行视图的均指现在的 0020）。
- 本机扩展：已装 `oco-0.0.4-ce17cd8.vsix`（main `ce17cd8` + 2026-10-10 收口批次改动；extension.js sha256 `5fc58a8c…`；位于 `~/.vscode/extensions/oco-local-test.oco-0.0.4`，需 Reload Window）。

## 已合入 main 的能力

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

- 遵循 [AGENTS.md](../AGENTS.md)：Gemini（agy）优先，不可用时换 Grok，两路均不可用时由主线程接手并在证据文件中记录账本。
