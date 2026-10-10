# 运行视图 M5 设计评审落地批（2026-10-10）

来源：`~/Downloads/handoff`（Claude Design 第一批交接包：改后样稿 `runtime-m5-mockup.src.html`、12 帧对照截图、README）+ [critique](../design/runtime-m5-critique-2026-10-10.md)。任务：按评审内容继续完善运行视图，逐条判断是否合理再决定改不改，不照单全收。

## 结果一览

| 项 | 判断 | 落地 |
| --- | --- | --- |
| P1-1 顶栏阶段 / 对象 / 已等时长，慢调用琥珀 | 合理。「现在卡在哪」应在最显眼处答；琥珀只上文字不上圆点 / 状态词，与「需要你」（圆点 + 状态词 + 你卡片）区分。阈值 10 s 是常量 `SLOW_MS`，可调 | 样稿（交接包）+ 产品 |
| P1-3 后半 忽略态收敛 | 合理。回合已结束，划线选项列表长期占满卡片是噪声；产品本就不显示服务端英文原文。两处按产品口径改回：卡片种类仍「已忽略」（原因），状态与空闲态同为「此刻不需要你」（样稿原为「本轮结束」/「待命」） | 样稿（交接包 + 回调）+ 产品 |
| P2-5 计数合并、删航道 / 泊位术语 | 合理。三组计数口径不同要用户心算；泊位小点只画有结果停着的 | 样稿（交接包）+ 产品 |
| P2-6 去重 | 大体合理：「第 N 次请求」只留环标题、模型框去序号与上下文、工具台头只写状态。**不采用**「点阵悬停才显示」：失败请求的红点是环内唯一标记；产品按文字宽度取舍变体、本就不裁标题，样稿的裁切是 `need()` 量法的 bug（交接包已修） | 样稿回调 + 产品 |
| P2-7 组装清单 | 交接包讨论后撤回，同意：环心卡片随阶段换内容，组装阶段显示正在发的消息不是重复 | 不改 |
| P2-4 「带回结果」站 | 不采用。`st:"next"` 是真实但很短的闭环阶段（回执到 → 带上结果发下一次，夹具里 100 ms）；结果小签停在「等结果」是因为代理在那里等；改落点要动几何，删站要改用户已定的六站设计 | 不改，记录 |
| P2-8 同一命令 ≥3 升级 | 合理且便宜（计数已有）。第 3 次起小签琥珀、环上「调工具」下加「同一命令 ×n 疑似循环」；只提示不拦截 | 样稿 + 产品 |
| P3-9 浮层 | 部分成立：产品卡片浮层 `inset:12px` 铺满舞台，不是样稿的固定 520×430，高度自适应无需做；只改文案「回放中 · 文本按时间比例展开」。结果浮层翻页另立项 | 文案进样稿 + 产品 |
| P3-10 进度条 | 部分采用：加图例「刻度：轮次 / 失败 / 提问」。**不采用**统一成「≈10m17s」：长短两式是按宽度取舍的既定规则，且中文界面不混英文单位。标签压刻度另立项 | 图例进样稿 + 产品 |
| N1 模型框被站牌压住 | 产品里不成立：窄布局阈值是 980 不是 560，模型框底与「模型思考」药丸隔约 10 px | 不改 |
| N2 环心卡片右侧整列 | 成立，中等代价（几何重排） | 另立项（NEXT 2b） |
| N3 空面板不收缩 | 部分成立：`dk` 只进宽布局 | 与 N2 合成一轮 |
| P1-2 提问态合一、点选项回答 | 合理但要接宿主回答通道（现状：选项无 onClick，运行视图内无输入框，live 只有 Dismiss 走 REST） | 另立项（NEXT 2b） |

## 改动

- 样稿 `docs/superpowers/specs/runtime-m5-mockup.src.html`：交接包模板覆盖（diff 245 行，与 README 所述一致），再改回两处（点阵常显；忽略态「已忽略」/「此刻不需要你」），补 P2-8 小签 + 环上文案、P3-9 文案 ×3、P3-10 图例、变更记录与「不采用」说明；`node scripts/runtime-m5-mockup-build.mjs` 重建，`--check` 通过。`scripts/runtime-m5-oracle.mjs` 改调 `statusWord(S, F, t)`。
- 产品（补丁 0020，12 文件）：
  - `session-runtime-ring-types.ts`：`RingStatus.detail / slow`、`RingToolRow.slow`、`RingModelBox` 去 `ctx`、`LOOP_SAME`。
  - `session-runtime-ring.ts`：`SLOW_MS`、`runningOf`、`statusOf(S, F, t, live)`；pill `ring.pill.sub.flow.mix`；`loopSuspectOf` → `ring.pill.sub.loop`；模型框去 ctx；忽略态 you 状态 `ring.you.idle`、卡片 `dismissed.body / post / meta` 重排（ag → 你）；工具行 `slow`。
  - `session-runtime-ring-geo.ts`：忽略 packet 用 ⊘，标签只保留 `DISMISS_MARK_MS`=30 s。
  - `session-runtime-ring-view.tsx`：模型框去序号、carry 只显自身；工具台头去序号；忽略态一行 + `title` 选项 + hint；工具行时长琥珀（`data-oco-runtime-tool-slow`）；同一命令小签琥珀（`data-oco-runtime-tool-loop`）；泊位小点只画 docked。
  - `session-runtime.tsx`：顶栏状态词后 `data-oco-runtime-state-detail`（live 重试 / 出错时不显示；宽 ≥ 980 最宽 300 px，否则 180 px）；图例加 `ring.legend.ticks`。
  - `session-runtime-ring-sub-view.tsx`：无待取回时两种宽度都用短计数。
  - `session-runtime-i18n.ts`：三语各 +10 −5 +3 键（ring 键 246 → 256）。
  - 测试：`ring.test.ts` 补 7 的忽略态断言、新增 7b（detail / slow / flow / loop）；`keyframes.test.ts` 去掉状态行含时钟的断言；`geo.test.ts` 字面量去 `ctx`；`i18n.test.ts` 键数 256；oracle fixture 重生成（k09 / k10 tone err→faint、你卡片状态改空闲文案）。

## 验证

| 项 | 命令 | 结果 |
| --- | --- | --- |
| 样稿重建 | `node scripts/runtime-m5-mockup-build.mjs && … --check` | 写出 394139 字节，up to date |
| oracle | `node scripts/runtime-m5-oracle.mjs <fixture> <scratch>/oracle.json` + 逐帧比对 | 14 帧；与旧 fixture 只差 k09 / k10（预期），改后与新 fixture 0 差异 |
| session 单测 | `cd vendor/opencode/packages/app && bun test src/components/session` | 428 pass / 0 fail（24 文件） |
| app typecheck | `bun run typecheck`（tsgo -b） | 0 错误（中途一次 geo.test 字面量 `ctx` 报错已修） |
| 构建 | `bun run build` | PASS |
| 补丁 | `bash scripts/regen-patch.sh 0020` | 58 文件 +20336 −8；新旧补丁逐文件比对：只有本批 12 文件有差异，无其他文件变动 |
| 本机 | `bash scripts/package-vsix.sh && bash scripts/install-local.sh` | 装 `oco-0.0.4-7d71662.vsix`（需 Reload Window） |
| 样稿截图 | Playwright headless（chromium_headless_shell-1217）1100 / 560 × k05 k06 k08 k09 k10 | 页面错误 0；主线程看过 1100-k05（顶栏「运行中 · 等结果 … · write 在跑」琥珀、write 行时长琥珀）与 1100-k09（你卡片一行 ⊘ + 空闲状态，卡片「第 4 轮已结束 · 等你下一条消息」） |
| NOT RUN | mock / 真实模型 E2E、亮色主题目视、Remote | c5 的忽略断言按新文案核过：卡片正文含「已忽略」/「dismissed」，`data-oco-runtime-you-state` 仍为 `dismissed`，`[data-oco-runtime-state]` 仍只含状态词（detail 在同级 span） |

根 typecheck / 根 unit 未跑：本批不触及 `apps/extension` 与 `packages/contracts`（它们由另一会话同时在改）。

## 委派记录

| task_id | 唯一写入范围 | requested_route | actual_provider/model | agent_id/run_id | 状态 | 结果路径 | fallback_reason |
| --- | --- | --- | --- | --- | --- | --- | --- |
| inv-remaining-8 | `docs/evidence/runtime-m5-review-2026-10-10-investigation.md` | grok-worker（`grok-bridge check` ready=true，grok 1.0.34，已登录） | Grok Build / unknown | job `run-mv25gx1r-iuq04e`，Grok session `f4387b51-0d91-4ee1-9a17-af328ddb90c5` | 已返回，验收通过（9 m 26 s，6 轮） | [investigation](runtime-m5-review-2026-10-10-investigation.md)（沙箱不能写 docs，主线程按报告代存） | — |
| impl-batch1-product | `session-runtime-ring*.ts{,x}`、`session-runtime.tsx`、`session-runtime-i18n.ts` 及单测、fixture、样稿、oracle 脚本 | 主线程 | — | — | 完成 | 本文件 | 同一文件内三层联动（i18n key ↔ ring.ts 投影 ↔ view 组合），且样稿 / oracle / fixture / 产品四处必须同步改，按 AGENTS 由主线程保留集成 |

## 并发注意

- 根仓库同时有另一会话的未提交改动（`apps/extension/*`、`tests/e2e/lib/mock-llm.mjs`、`tests/e2e/run.mjs`、`docs/NEXT.md` 第 2 节 ADR-009 一行）；本批没有碰，提交时只按路径加入自己的文件。
- Grok 报告里的 "files changed" 是整个工作区的 diff（主线程同时在改的三个文件），不是 Grok 改的；Grok 自述未改源码。

## 本批文件（提交时按路径加入）

`docs/superpowers/specs/runtime-m5-mockup.src.html`、`docs/superpowers/specs/runtime-m5-animated-mockup.html`、`scripts/runtime-m5-oracle.mjs`、`patches/opencode/0020-oco-runtime-view.patch`、`docs/STATUS.md`、`docs/NEXT.md`（仅 2b）、`docs/PROGRESS.md`、`docs/design/runtime-m5-critique-2026-10-10.md`、`docs/evidence/runtime-m5-review-2026-10-10.md`、`docs/evidence/runtime-m5-review-2026-10-10-investigation.md`。
