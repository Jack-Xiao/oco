# 运行视图：本地查看 + 真实数据修正（2026-10-07）

范围：gcp-workstation 已不存在（`gcloud workstations list` 无集群，见 runtime-m4-batch3）。改为本机 VS Code 查看运行视图，并用本机真实会话（只回放，不发 prompt）找出 mock 测不到的问题。分支 `claude/nostalgic-gates-ef74ca`，基线 `98dda03`；vendor 开发树与已提交 0019 内容一致（仅一个新文件的 index 行不同）。

## 本机为何“不能用”

- 本机 VS Code 已装 `oco-0.0.4-97251ac`（与本分支代码一致）。`oco.serverMode = managed`。
- 10-06 两次启动的 `oco.log` 都是 `managed server: failed (Managed mode needs a workspace folder open first)`：窗口没打开文件夹，托管服务不启动。用户确认保留现有“Open Folder”提示，不改作用域（不回退到 ~）。
- 另有两个 10-01 遗留的 `scripts/test-server.sh` 测试服务（4517/4527，cwd `.oco-test/workspace`，PPID 1，各约 99% CPU，`/global/health` 无响应）。经用户同意已 SIGTERM。

## 真实数据实测（主线程，隔离 profile）

- 工具：隔离 VS Code（`tests/e2e/vscode.mjs` 的 `launch`，独立 user-data-dir，extensionDevelopmentPath=本 worktree 构建），工作区 `~/Ai-Project`，`oco.serverMode=managed`（用本机真实 opencode 1.18.33 数据）。打开会话「删除 opencode 插件 Oh-my-openagent 及 Atlas」（8 个子会话、task/background_output、一次 question dismissed），切到 Runtime，live + 回放 15/40/65/90%。不发 prompt，无模型费用。
- 结果：托管服务启动→会话打开 6.4 s，运行视图 0.3 s 后可见；无 console error；1600×1000 框架不滚动。
- 主线程接手理由：运行在用户真实 opencode 数据与配置上，需由主线程控制保证不发送 prompt、不写会话（明确风险）。

真实数据发现（mock 未覆盖）：

| # | 现象 | 原因 | 级别 |
| --- | --- | --- | --- |
| D1 | 回放中交接卡片耗时显示 `3738m 40s`（≈62 h，即“现在 − 当时”） | `session-runtime.tsx` 给 `RuntimeMechanism` 传 `now={wall}`，回放也用墙钟；`loop-view` 的 `duration()` 没有小时档 | 缺陷 |
| D2 | 回放任何步骤，状态栏 Context 都是 `66K / 1M` | `summaryContext()` 用全部 `messages()`，不随回放游标 | 缺陷 |
| D3 | 思考框第二行只露出上半截字形，右侧出现滚动条 | 思考框固定 64 px，文本行 `minmax(0,1fr)` + overflow hidden，未按整行截断 | 视觉 |
| D4 | 宽布局左栏「This round's message」与「Read-only in replay」挤成两列各折两行 | h3 `justify-between` 两段都可换行 | 视觉 |
| — | 跳步后 0.7 s 截图探针叠在派发航道上 | 匀速动画途中；4 s 后探针正确在作业区（+3 溢出），不算缺陷 | — |

## 委派记录

| task_id | 唯一写入范围 | requested_route | actual_provider/model | agent_id/run_id | 状态 | 结果路径 | fallback_reason |
| --- | --- | --- | --- | --- | --- | --- | --- |
| route-check | — | gemini (agy 最小请求) | — | — | 未确认（12 s 超时 `context canceled`） | — | 按规则换 Grok |
| route-check | — | grok (`grok-bridge.mjs check --json`) | Grok Build 1.0.34 | — | ready（只证明安装/登录） | — | — |
| route-check-2 | — | gemini (agy 最小请求，10 s) | — | — | 未确认（13 s 退出 124，`context canceled`） | — | E2E 也走 Grok |
| fix-think-stream | 同 fix-d1-d4 | grok-build:grok-delegate（resume session 282b316b…） | Grok Build / unknown | run-muxk924v-34ce25（run_id 报告为 unknown，以 bridge 为准） | 已返回：270/0，typecheck 0 | 本文件 checkpoint | 主线程审 diff 发现 D3 去掉了流式思考自动滚到底（实时回归），退回修正 |
| e2e-c5 | `tests/e2e/c5-runtime.mjs`（仅测试侧）+ `docs/evidence/runs/` + 本文件 e2e checkpoint | grok-build:grok-delegate | Grok Build / unknown | run-muxkdui0-b9feru / grok session 4171fbf5-8295-4ab1-91dd-5c62d4e2e1cd | 验收通过：en 37/37、zh 37/37（主线程读 results.json 核对）；未改测试；4697/4698 已释放、无遗留进程 | `runs/20261007-034656-c5-runtime-a187`、`runs/20261007-034907-c5-runtime-5cc1` | Gemini 未确认 |
| real-look | scratchpad | 主线程 | — | — | 已返回 | 本文件 | 真实用户数据，见上 |
| fix-d1-d4 | vendor `packages/app/src/components/session/session-runtime{.tsx,-mechanism-view.tsx,-loop-view.tsx,-loop.ts}` + 对应测试 | grok-build:grok-delegate | — | unknown（bridge 未建 run） | 失败：`Timed out acquiring state lock …/nostalgic-gates-ef74ca-…/state.json.lock`（10-04 23:12 遗留的 0 字节锁，无 bridge 进程）；未改文件 | — | Gemini 未确认 |
| fix-d1-d4-r2 | 同上 | grok-build:grok-delegate（锁改名为 `.stale-20261004` 后重试一次） | Grok Build / unknown | run-muxjx5ei-o9wkou / grok session 282b316b-c728-439b-b719-14d1442f99ff | 已返回：session 单测 270/0，typecheck 0，diff --check 干净 | 本文件「fix-d1-d4」 | 同上 |

## 主线程集成与验收（2026-10-07）

| 项 | 结果 |
| --- | --- |
| 审查 Grok diff | D1–D4 实现合理；退回一处回归（流式思考自动滚到底被删），已修 |
| session 单测（主线程复跑） | 270 pass / 0 fail，15 files |
| vendor typecheck | exit 0 |
| 补丁 0019 | `git -C vendor/opencode diff deb241e -- packages/app`（新文件先 `add -N`）重新生成，31 个文件，+140/−34 相对上一版；`diff --check` 干净；无本机路径；51ef4be 临时 worktree 依序应用 0001–0019 共 19/19，`packages/app/src` 与 `test-browser` 与开发树 `diff -r` 一致，已删 |
| 根构建 / verify:brief | `bun run build` PASS；typecheck PASS（0 errors），unit 190/0 |
| 打包与本机安装 | `OCO_SKIP_BUILD=1 bash scripts/package-vsix.sh` → `oco-0.0.4-98dda03.vsix`（含未提交改动）；新增 `scripts/install-local.sh` 安装并核对 `extension.js` 与 `media/chat/index.html` 哈希一致（`c4530fd9…`） |
| E2E（mock，委派 Grok） | c5-runtime en 37/37 `runs/20261007-034656-c5-runtime-a187`，zh 37/37 `runs/20261007-034907-c5-runtime-5cc1`；测试未改 |
| 真实数据复测 | 新增 `scripts/look-local.mjs`（由 scratchpad 版本移入）；同一会话回放 15%/62%：交接卡耗时 `1s`（原 `3740m 8s`），Context 随游标 67K→54K（实时 66K），思考框两整行 + 省略号、无滚动条，左栏标题与「Read-only in replay」各占一行；无 console error |

## 复核

- D2 数据核对（opencode.db 只读）：该会话 17:22:16 起新一轮请求 input 40300、cache 0，上下文确实从约 67K 回落；回放 21:08:21 显示 54K 取自 21:08:15 开始、21:08:42 完成的请求（245+52480+1065）。细节：回放时进行中的请求按其最终 token 计（当时实际最近完成的是约 51K），差一轮请求，暂不修。
- 信任：managed 模式在受限模式下不启动（`extension.ts` startManaged）。本机 VS Code 开着工作区信任；首次打开文件夹须选择信任。look-local 用 `--disable-workspace-trust`，没有走这一步。
- 流式思考跟随最新两行：只做了代码审查，回放不流式、单测不覆盖 DOM 滚动，NOT RUN。
- 本机安装后的用户 profile 实开（非开发宿主）：NOT RUN（打开文件夹需用户信任，留给用户）。

## checkpoint

- 2026-10-07：真实数据实测完成，D1–D4 已定位；下一步委派 fix-d1-d4，主线程随后重生成 0019、干净重放、委派 E2E、装本机。

## fix-d1-d4 checkpoint

- 状态：D1–D4 已改完。provider/model：unknown（工具返回未带 provider/model）。未提交。
- D1：`elapsedClock` 回放取 `cursor ?? wall`、实时取 wall，由 `now` 传入交接卡；`formatDuration` 满 60 分钟为 `Xh Ym`（超过 24h 仍只到小时，例 `62h 18m`）。`formatElapsed` 替换 loop-view 两处耗时。
- D2：`messagesForContext` 回放直接返回已有 `view()` 快照，不另调用 snapshotAt；实时仍用全部消息。`summaryContext` 改走该函数。
- D3：思考框保持 64px（border-box，padding 6px 12px，gap 2px）。正文区 32px、行高 16px、line-clamp 2、overflow hidden，预览无滚动条。Expand 浮层仍可滚动看全文。
- D4：目标 h3 为 `flex-wrap` + `min-w-0`；标题与回放标记均 `whitespace-nowrap shrink-0`，空间不够时标记整段换行。
- 测试：在 `vendor/opencode/packages/app` 执行 `bun test --conditions=solid --preload ./happydom.ts ./src/components/session` → 270 pass / 0 fail，15 files，2474 expect。新增 4 个纯函数测试（游标时钟、开放交接卡耗时、小时档、回放 Context 取快照）。
- typecheck：`bun run typecheck`（`tsgo -b`）退出码 0。`git -C vendor/opencode diff --check` 干净。源码无本机路径或用户名。
- 未解决：未在浏览器里重放真实会话（本批验收是单测与 typecheck）。未提交。
- D3 跟随：直播中思考框不再 line-clamp，32px overflow-hidden 靠 scrollTop=scrollHeight 显示最后两行；非直播仍 line-clamp 2。复测 270 pass / 0 fail，typecheck 0，diff --check 干净。run_id unknown。

## e2e checkpoint

- 2026-10-07 首次落盘：范围仅 c5-runtime 的 en 与 zh-cn 两轮（mock，不重建 vendor）。隔离端口 OCO_TEST_PORT=4697、OCO_MOCK_LLM_PORT=4698。进度：尚未启动服务。证据目录 docs/evidence/runs/。下一步：确认无他人占用后启动 test-server.sh，先跑 en。
- provider/model：工具返回未带 model slug，记 unknown。本会话身份为 Grok。
- en 完成：37 PASS / 0 FAIL，exit 0，耗时 115.40s。results.json：`docs/evidence/runs/20261007-034656-c5-runtime-a187/results.json`。未改测试。下一步：同一 mock 服务跑 zh-cn。
- zh-cn 完成：37 PASS / 0 FAIL，exit 0，耗时 115.32s。locale-copy 为「运行 / 待命」。results.json：`docs/evidence/runs/20261007-034907-c5-runtime-5cc1/results.json`。未改测试。
- 清理：已终止本轮启动的 test-server.sh（原 PID 49072）、mock-llm（49081）、opencode serve（49083）。4697 与 4698 均无 LISTEN。未动其他进程。


## M5「此刻」改版：动画对比稿（2026-10-07，设计阶段）

- 用户否决纯文字方案（`runtime-m5-now-mockup.html`）：没有动画看不出到哪个阶段、发了什么，图形一眼可懂。方向改为：动画图形为主，每一轮（含无子代理的轮次）都要回答「到什么阶段」「发了什么」。
- 真实数据：本机 opencode.db 只读导出第 3–4 轮（路径脱敏）到 scratchpad `m5/timeline.json`；10 个关键时刻 `m5/keyframes.json`；截帧脚本 `m5/shot-frames.mjs`（1100×720 / 560×760）。

| task_id | 唯一写入范围 | requested_route | actual_provider/model | agent_id/run_id | 状态 | 结果路径 | fallback_reason |
| --- | --- | --- | --- | --- | --- | --- | --- |
| m5-anim | scratchpad `m5/drafts/`、`m5/frames/`；终稿 `docs/superpowers/specs/runtime-m5-animated-mockup.html` | Claude Workflow（用户开启 ultracode 并调用 workflow-authoring，视为授权多代理编排） | Claude / 继承会话模型 | wf_e70f712b-300（两次因额度中断后 resume） | 已返回：3 稿（A 环形航道 / B 泳道 / C 阶段环），三维评审总分 C 22 · A 20 · B 17.5；以 C 为底合成并嫁接 A/B 优点；审查第 1 轮 1 项 high（航道与工具台被 SVG 层压住）未过，修复后第 2 轮通过，1100 / 560 各 10/10 帧判读正确；主线程抽看 k03/k08/k06@560 | `docs/superpowers/specs/runtime-m5-animated-mockup.html` | 用户指定路线；未走 Grok/Gemini |
- 关键帧 k02/k03/k06/k09 原先早于对应事件 0.1–0.4 秒，评审前已挪到事件之后并重新截帧（`m5/keyframes.json`）。
- 剩余已知问题：快速派发时（21:08:19–:22）移动中的包标签停留很短；560 宽时结果卡片轻压环右缘；产品实现时「本轮结束」应接会话状态而非按事件推断。

### 用户决定后的修订（2026-10-08）

- 用户决定：①无子代理的轮次收起子代理区；②问题原文在环心、选项在「你」区；③执行计划做成环心卡片的「计划」类，无计划的对话不显示；④等待 / 空闲超 10 秒在进度条折叠；⑤英文直接显示、不加标记；另要求环心卡片更居中。
- 数据扩到第 1–4 轮（第 1 轮有 3 次 todowrite，第 2 轮有 2 个子代理），关键时刻增至 14 个。

| task_id | 唯一写入范围 | requested_route | actual_provider/model | agent_id/run_id | 状态 | 结果路径 | fallback_reason |
| --- | --- | --- | --- | --- | --- | --- | --- |
| m5-rev | scratchpad `m5/frames/final/_src/`、终稿 | Claude Workflow（用户 ultracode） | Claude / 继承会话模型 | wf_4a1cdebe-e59 | 已返回：修订 + 2 轮审查。第 2 轮 D1/D2/D4/D5/D6 通过，居中偏差 0 px（1100 / 1600）；D3 只因关键时刻 j01 早于第一次 todowrite 0.5 秒判失败，主线程已采用修订方给出的 17:11:03.6 | 终稿路径 | 用户指定路线 |
| m5-rev-main | 模板一行 CSS | 主线程 | — | — | 完成：窄屏「你」条两行截断被裁 5 px，改为 `flex:none;max-height:36px;line-height:18px`；重建后 14 时刻 × 2 宽度无半截行、无横向滚动，28 帧无报错；抽看 j01 / k06 @1100、k08 @560 | 同上 | 极小 CSS 修正（单行），不值得再起一轮代理 |

- 剩余低优先级问题（审查员列出，未修）：560 宽 k10 处「✕ 已忽略」标记压住「等结果」；相邻时刻折叠标签的文字会重排；子代理名太长时卡片标题里的路由被截掉；最终回复里的 markdown 表格按原文显示，可读性差；光点停靠时会挡住「组装请求」下方的说明。

### M5 implementation start (2026-10-08)

- The user approved the revised mockup and said "执行把" (go ahead); small issues that are hard to fix will be left. Two additional requests: (a) when the subagent area is collapsed, its connecting line is left hanging; (b) subagents must be clickable so their status can be viewed.
- Before implementing, backed up the vendor runtime view source, patch 0019 and c5-runtime.mjs to scratchpad `backup-pre-m5/`.

| task_id | Write scope (exclusive) | requested_route | actual_provider/model | agent_id/run_id | Status | Result path | fallback_reason |
| --- | --- | --- | --- | --- | --- | --- | --- |
| m5-plan | mockup template + final mockup; plan `docs/superpowers/plans/2026-10-08-runtime-m5-ring.md` | Claude Workflow (user enabled ultracode) | Claude / inherited session model | wf_b2065b60-57d | Running: mockup fix ∥ 3 read-only code maps → plan → review (one revision) | plan path | Route specified by user |
