# 运行视图 M5（环形循环 + 环心卡片 + 三个坞）实施计划

**Goal:** 把会话“运行”页中间的主体，从 M4 的“左栏 + 主卡片 + 思考框 + 椭圆航道”，换成已批准的 M5 样稿：

- 一圈 agent 循环站点：组装请求 → 模型思考 → 模型输出 → 调工具 → 等结果 → 带回结果。
- 一个只向前走的令牌。
- 环心有一张载荷卡片，上方是计数行和模型框。
- 由总线连着三个坞：你、工具台、子代理。
- 回放时间轴把长等待折叠起来。

任意时刻 t 的画面只由 ≤ t 的事件算出。外框保留 M4 已批准的功能：播放控制与键盘、完整日志、思考全文、进入子会话、子会话加载重试、减少动画、焦点稳定、几何稳定、最后事件、暂停后新增条数、状态依据。补丁 0019 继续追加，不新开补丁。

**样稿与规格：**

- 成品样稿：`docs/superpowers/specs/runtime-m5-animated-mockup.html`。它内嵌了 base64，不要整篇读。
- 样稿源：`runtime-m5-mockup.src.html`。Task 2 会把它从 scratchpad 复制到 `docs/superpowers/specs/runtime-m5-mockup.src.html`。本文所有“样稿 Lnnn”都指这个文件的行号。
- 子代理详情规格：已收进本文“子代理详情面板与收起条”一节。
- 数据：`timeline.json`（真实会话第 1–4 轮，已脱敏）和 `keyframes.json`（14 个关键帧）。两者现在在 scratchpad，由 Task 4 收进 vendor 测试树。

**工作树与基线：**

- 工作树：本 worktree，分支 `claude/nostalgic-gates-ef74ca`，只留在本分支，不合并 main。
- vendor 开发树：`vendor/opencode`，HEAD `d69e4a2`，有未提交的 M4 改动，不得撤销。补丁基线 `deb241e`，干净上游 `51ef4be`。
- 单测基线（2026-10-08）：`bun test --conditions=solid --preload ./happydom.ts ./src/components/session` 270 pass / 0 fail；`bun run test:browser` 48 pass / 0 fail（16 个文件，其中运行视图的 2 个文件共 7 个）。
- E2E 基线：c5 en 37/37、zh 37/37，见 `docs/evidence/runs/20261007-034656-c5-runtime-a187` 和 `20261007-034907-c5-runtime-5cc1`。

**证据与委派记录：** 本批只用一份证据文件 `docs/evidence/runtime-m5.md`，由 Task 2 新建，含“委派记录”一节；不另建 delegation 文件。每个任务派发前写任务、范围、路线；派发后补实际 provider/model、run id、状态、结果路径；换路由时写 `fallback_reason`。

**路由（AGENTS 规则）：**

- 独立模块、单测、E2E 运行与诊断、文档检查：先派 Gemini（`gemini-worker`），失败按规则 3 换 Grok（`grok-worker`；较大的编码任务用 `grok-build:grok-delegate`）。
- 公共契约、`session-runtime.tsx` 集成、补丁、安装、STATUS/PROGRESS：主线程。
- 每条路线每批首次使用前做 ≤10 秒的健康检查。

---


> **执行路线（主线程，2026-10-08）：** 用户开启 ultracode 并要求执行，本批各任务由 Claude Workflow 代理实现（任务内写的 Gemini/Grok 路线不再适用）；Task 15 的补丁重新生成、干净重放、打包和本机安装仍由主线程执行。开放问题 1–11 除 D18（已改为不用红色）外均按默认处理。

## 本计划前已核实的事实（2026-10-08）

1. M4 回看用 `snapshotAt` + `buildRuntime` 重建模型（`session-runtime.tsx` 200-212），有三处问题：
   - 进行中消息的 tokens/cost 会泄漏到 t（`session-runtime-model.ts` 850-852，`requestOf` 571 的 cost 不受 settled 限制）。
   - 工具在 `idTime(id) ≤ t < state.time.start` 这段“写调用参数”时不可见（`partStart` 805-811）。
   - 文字 part 不按 t 回退。

   M5 不再走这条路，见裁定 D1。
2. `RuntimeKey` 已从 `session-runtime-i18n.ts` 导出（246 行）。`runtimeText(language)` 只有 `t` 和 `intl`（736-744）。现有键前缀里没有 `ring.`，新键全部用 `ring.` 前缀，不会和旧键冲突（旧键里有 `tools.*`、`legend.*`、`replay.*`）。
3. `idTime(id, near)`（`session-trajectory-model.ts` 106-116）的规则：id 形如 `prefix_` 加 12 位十六进制，值为 `ms * 0x1000 + counter` 的低 48 位；解码时按 `near` 对齐。夹具里合成的 id 必须按这个规则编码。
4. `__OCO_DEBUG__` 定义在 `apps/chat-webview/src/app.tsx` 192 行，不在补丁 0019 里。M5 的检查钩子改挂在运行视图根元素上，见“检查钩子”。
5. 样稿只有子代理面板淡入这一个 CSS 动画（样稿 L251-252）。令牌、包、流动虚线、空闲呼吸都由 t 驱动（样稿 L1358、L1364-1368）。
6. 样稿里不在 `--rt-*` 调色板中的十六进制颜色有 15 个：`#10141c #1f2633 #0e1218 #9fc7a8 #5a3236 #6f798c #6b3a3d #4f6f74 #3f5f49 #3c4f78 #2c2616 #243049 #1d1b16 #1a2130 #151a23`。
7. `realUser`（`session-runtime-model.ts` 359-364）和 `backgroundIdOf`（313-322）目前没有导出。`backgroundNoticesOf(messages, parts)` 已导出，是纯函数，可以对 created ≤ t 的消息前缀调用。
8. `onOpenSession` 从 `pages/session.tsx` 一路传到 `RuntimeMechanism`，但 M4 从未调用。M4 里“打开子会话”实际是视图内进入（`onEnterChild` + 面包屑）。
9. `packages/app/AGENTS.md` 有三条要求：改 session/timeline 代码前先记生产基准；优先用 `createStore`，不要堆多个 `createSignal`；不硬编码可见英文，用完整短语键。
10. 本 worktree 的 `patches/opencode/` 只有一个 0019（`0019-oco-runtime-view.patch`），重放目标是 19/19。
11. `bun test` 在 `packages/app` 里没有 Solid JSX 编译：`bunfig.toml` 只预载 `happydom.ts`，tsconfig 是 `jsx: preserve` + `jsxImportSource: solid-js`，挂载 Solid `.tsx` 组件会退回 React 经典 JSX，报 `React is not defined`（评审复现）。只为纯函数导入 `.tsx` 不受影响（`loop.test.ts` 导入 `loop-view.tsx` 即如此）。已在 scratchpad 验证替代做法：一个 `Bun.plugin` 预载，对 `.tsx` 用 `@babel/core` + `babel-preset-solid`（`generate: "dom"`，`parserOpts.plugins: ["jsx","typescript"]`）编译，再以 `loader: "ts"` 交回 Bun 去类型。两者不是 `packages/app` 的直接依赖，要用 `createRequire` 从 `vite-plugin-solid/package.json`（直接 devDependency）解析，不新增依赖。结果：Solid `.tsx` 组件挂载、点击、`<For>` 都正常（1 pass）；现有 `test-browser` 加上这个预载后仍为 48 pass / 0 fail。见 Task 2。
12. `packages/app/tsconfig.json` 是 `composite`，`include` 为 `["src", "package.json"]`。目录 include 不收 `.json`，所以在 `src` 里 `import x from "./x.json"` 会让 `tsgo -b` 报 TS6307（评审复现）。夹具因此保持 `.json`，由适配器在运行时读取（先例：`src/theme-preload.test.ts` 用 `Bun.file(new URL(…, import.meta.url))`；`@types/node`、`@types/bun` 已在 devDependencies）。见 Task 4。
13. OpenCode 的循环在 `finish` 不属于 `["tool-calls", "unknown"]` 时就结束（`packages/opencode/src/session/prompt.ts` 1111-1113、1294），不只是 `stop`；`length`、`content-filter`、`other`、`error` 都会结束本轮。见 D5。
14. `backgroundNoticesOf` 遇到 RETRY 状态时 `out.delete(id)`（`session-runtime-model.ts` 333、345、350）。逐条消息单独调用它看不到“清除”，所以单遍扫描需要导出它内部的逐条步骤。见 Task 3。

---

## 目标与非目标

**目标：**

- 中间主体照样稿重做：环、站牌、令牌、覆盖弧、环心卡片、计数行、计划小标、模型框、你坞、工具台、子代理坞（收起条 / 展开航道）、总线连线、包、子代理详情面板和列表。
- 顶栏时间轴改成可折叠的连续时间轴。状态栏改成：第 N 轮用时、已空闲、上下文（上次回执）、本轮花费（含子代理）、图例、日志入口。
- 在 560–1600 px 宽之间没有横向滚动。中文、英文、繁体中文三套文案齐全。支持减少动画。几何与焦点稳定。
- 保留 M4 已批准的功能（见下表），E2E 按新结构重写并在 en/zh 全过。

**非目标（本批不做）：**

- 回复、停止、取消这类操作按钮。回答仍在下方的 composer dock 里完成。
- 新的 Agent 调度、多模型比较、定时任务。
- 修复 `snapshotAt` 的 token/cost 泄漏。M5 视图不再读它（D1），STATUS 里记为“已知、无界面影响”。
- 回看里显示授权等待：历史没有授权时间戳，授权只在实时显示（D15）。
- 让 `onOpenSession` 真正跳到对话页（开放问题 1）。
- 亮色主题、420 px 以下宽度的视觉正确性（开放问题 2）。
- 改 `apps/chat-webview` 或 `__OCO_DEBUG__`。

## 保留 / 替换 / 删除

| M4 功能 | M5 处理 |
|---|---|
| 实时/回看分段控件，首帧/上一步/播放/下一步/速度/回到实时，Space/←/→ | **保留**。←/→ 跳到导航点 `index.nav`；速度循环 1→2→4→0.5→1 |
| 回看滑块 | **替换**为折叠时间轴，仍用原生 `input[type=range]`（D6） |
| 左栏：本轮目标、计划 | **替换**：目标放进“你”坞，计划变成计数旁的小标和“计划”卡片 |
| 主卡片 + 64 px 思考框 | **替换**为环心卡片（种类见 D-卡片表）。思考全文通过卡片的“全文”按钮打开覆盖层（D8） |
| 椭圆航道 + 交接卡片 | **替换**为子代理坞（格子/收起条）、总线上的探针和详情面板，沿用 M4 的状态语义（D16） |
| 进入子会话（面包屑） | **保留**：详情面板的“打开子会话 ↗”调用 `onEnterChild`，进入后用同一个环视图显示子会话（D9） |
| 子会话加载失败重试 | **保留**：`[data-oco-runtime-child-retry]` 出现在详情面板和进入后的子会话视图里 |
| 紧凑日志行 | **删除**（样稿没有） |
| 完整日志覆盖层 | **保留**：入口移到状态栏 `[data-oco-runtime-log-open]`，关闭时焦点回到入口（D7） |
| 状态栏 | **替换**内容，保留 `data-oco-runtime-summary`、`-duration` |
| 读屏 live region | **保留**，句子不含“思考 / reasoning”（D17） |
| 减少动画 | **保留**：t 驱动的动效全部改为跳到目标位置，面板不淡入 |
| 焦点稳定、几何稳定 | **保留**，重新定义契约（D13、D14） |
| 重试指示 `-retry`，待处理计数 `-pending` | **保留** |
| 最后事件 `-last`（“最后事件 N 秒前”，远程服务器是否还在推送的信号） | **保留**：实时模式下放在顶栏状态词和 `-pending` 之后，沿用 M4 的 `freshness().lastEventAt`、`last.*`、`ago.*` 键；窄于 720 px 时随顶栏第二行显示。E2E `last-event` 保留 |
| 回看“暂停后新增 N 条”（`replay.new`） | **保留**：回看时放在“回到实时”按钮旁，加 `data-oco-runtime-replay-new`（值为 N）。N = 实时 index 中 > 回看右端 t1 的原始事件时刻个数（`index.times` 去掉 EMIT_MS 补点后计） |
| 状态依据 `-state-evidence`（event / inferred）及其提示 | **保留**：仍挂在 `-state` 元素上；实时取 `live().run.evidence`，`inferred` 时 `title` 用 `evidence.inferred.tip`；回看固定为 `inferred`（同 M4） |
| 状态栏 token 入/出合计（`-usage`） | **替换**（样稿取代）：每次请求的入/出写在模型框回执和“回执”卡片里（`ring.model.receipt`、`ring.card.receipt.body`），状态栏只留“上下文（上次回执）”和“本轮花费”。E2E `usage-known` 改为 `context-known`。待用户确认，见开放问题 11 |
| 状态栏子代理计数（运行 N / 阻塞 N） | **替换**（样稿取代）：由子代理坞承担。收起条第二行写本会话总数，格子写各自状态，子会话树有待处理提醒的格子带 `flag=ask`。`summary` 检查不再断言这一段。待用户确认，见开放问题 11 |
| `session-runtime-mechanism-view.tsx`、`session-runtime-loop-view.tsx`、`session-runtime-child.tsx` | **删除**（Task 12），连同只为它们存在的测试段 |

---

## 已定裁定（实现以此为准）

- **D1 回看不再重建 M4 模型。** 所有“t 时刻”的事实都由 `RingIndex` 按 t 查询得出。`RingIndex` 从完整数据一次建好，查询函数只读 ≤ t 的字段。根会话的 `live()` RuntimeModel 仍保留，只用于三件事：实时提醒和运行状态、后台任务关联（`RuntimeChild.retrieved` 等）、日志事件。日志在回看里按 `at ≤ t` 过滤。`assemble(view,'replay',…)`、`assembleChild` 的回看分支、`goalOf`/`todosOf`/`reasoningAt` 都不再被视图调用。
- **D2 文字和思考：回看不预告未来（采用 `reasoningAt` 的规则）。**
  - 一个 text 或 reasoning part 的结束时刻 end 依次取：part 的 `time.end` → 下一个 part 的创建时刻 → 消息完成时刻，只取其中 ≤ t 的那个；三者都 > t 或都缺失时，这个 part 在 t 时“进行中”。
  - 回看：进行中的 part 正文为空、`streaming=true`。卡片正文槽显示 `ring.card.streaming`（faint）；字数类短语改用不带字数的变体（`ring.model.out.dur`、`ring.cap.out.dur`、`ring.card.out.meta.dur`，“模型输出”站下不写字数）；子代理面板的文字行显示 `ring.sub.act.streaming`。t ≥ end 后显示全文。
  - 实时（`frameAt` 收到 `opts.live`，或 `subDetailAt` 的 `opts.live`）：显示已经到达的全部文字，进行中加光标 ▍，字数照实写。这就是此刻的真实数据，不算预告。
  - 理由：存下来的 part 只有最终文字和 end，没有逐段到达时刻。样稿的等速显现（样稿 `reveal` L600-605）用 end 定速度、用最终文字定内容，模型先慢后快时，回看会显示 t 时还没到达的字，和同一时刻的实时画面也不一致，违反“t 时刻只用 ≤ t 的事件”。
  - 若用户要样稿的显现效果（开放问题 10）：只改 ring.ts 的 `spanAt` 和 ring-sub.ts 的文字行两处，并在 Task 5 第 13 条测试中把 `card.body`、`card.full`、上述字数短语和子代理文字行列为明确豁免（那时它们是“已接受的近似”，不再算无泄漏）。
  - `reasoningAt` 不改，它的测试保留。
- **D3 计划：** 计数采用样稿 `planCount`：cancelled 计入总数，in_progress 单独计。小标显示 `done/total`，全部完成时用完成色。实时和回看都取 t 时刻最近一次 `start ≤ t` 的 todowrite 输入，不读 `sync().data.todo`。会话从没写过 todowrite 时，什么都不画。
- **D4 轮次编号：** N = created ≤ 本轮开始时刻的真实用户消息个数（判定用 `isRealUserMessage`，见 Task 3）。通知类或纯合成的用户消息不开新轮，其后的请求并入当前轮。M = 请求在轮内的序号（从 1 开始）。代理名取用户消息 `agent` 中 “ - ” 之前的部分（样稿 L463-465 的规则）。模型名用 `providerID/modelID`。
- **D5 轮结束：** 只看 t 时刻本轮最新的那个请求 q（created ≤ t；它之后没有 created ≤ t 的请求）。按顺序判断，命中一条，本轮就在对应时刻结束；之后若又出现新请求（例如后台通知触发），本轮重新进入运行：
  1. q 以 error 完成（completed ≤ t）→ `abort`；
  2. q 有一个被忽略的提问，且 end ≤ t → `end`，`why: "dismiss"`；
  3. **循环结束谓词** `loopEnded(q, t)` 为真 → `end`，`why: "finish"`，`reason = q.finish.reason`（原文）。
     - `loopEnded(q, t)` = q 有 finish，`finish.at ≤ t`，且 `finish.reason` 不在 `LOOP_CONTINUE = ["tool-calls", "unknown"]` 中（与 OpenCode `prompt.ts` 的判定相同，见事实 13）。
     - 所以 `stop`、`length`、`content-filter`、`other`、`error` 都结束本轮；`tool-calls`、`unknown` 走 `next`。
     - reason 不是 `stop` 时，卡片 meta 加一项 `ring.card.end.reason`（reason 原文，不翻译）。
  4. **实时兜底：** 只在实时（有 `live`）时判断。`live.run === "idle"`、`live.permissions` 为空、q 已完成（completed ≤ t）、q 没有正在运行的工具，而前三条都没命中 → `end`，`why: "idle"`，`endAt = q.completed`。这条让“本轮结束”跟随服务器的会话状态（样稿评审的遗留意见），避免实时里状态词写“运行中”而会话其实已空闲。回看没有会话状态，只按 1–3 判断。

  同一个谓词也用于子会话的“做完”判定（D16 的 `childDoneAt`）。折叠几何可以用整段历史（`endOf(r, Infinity)`），但所有文字只用 min(t, to)。
- **D6 时间轴：** 原生 `<input type="range" min=0 max=TOTAL step=1000>`，值是折叠后的 v 毫秒。它透明叠在自绘轨道上方（轨道含刻度、≈ 折叠记号、标签）。`aria-valuetext` 写“时刻 · 第 N 轮”。原生方向键按 1 秒 v 移动。`playbackKey` 遇到 INPUT 已经会跳过，不用改。
- **D7 日志：** 删除紧凑日志。完整日志覆盖层不变：过滤、Esc 关闭、焦点回到入口。点日志行跳到该行时刻并进入回看。入口按钮放在状态栏右侧。
- **D8 思考全文：** 卡片上的“全文”按钮常驻，不会被卸载。卡片种类 ∈ {think, output, result, failed, return, handoff, ask, permission} 且有正文时按钮可用，否则 `disabled`。覆盖层显示 `card.full`（只含 ≤ t 的部分）。Esc 或 ✕ 关闭后焦点回到按钮。
- **D9 打开子会话：** 详情面板的“打开子会话 ↗”调用 `onEnterChild(sessionID)`，即 M4 的视图内进入。进入后，用子会话自己的 `RingIndex` 渲染同一个 `RingView`，面包屑可以返回。`onOpenSession` 不接线。
- **D10 子会话数据：** 打开详情面板、进入子会话、回看时 t 所在轮的子代理，这三种情况都会请求同步。加载中显示 `child.loading`；失败显示 `child.sync_failed` 和重试按钮（`[data-oco-runtime-child-retry]`）。子会话没加载时，详情面板“它的动态”显示加载状态，交接和返回结果照常显示（数据来自父会话的 task part）。
- **D11 两个时钟：**
  - 视觉 t 由 rAF 连续推进，驱动令牌、包、k(t)、时间轴和各种计时文字。
  - 数据版本指 store 变化。重建 `RingIndex` 最多 10 次/秒（距上次重建 ≥ 100 ms 才再建；变化停止后最后一次必建），视觉 t 不受这个节流影响。
  - 重建是增量的：M4 已有的 `sdk().event.listen` + `eventSessionID` 把收到事件的会话 id 记进 `dirty`；`buildRingIndex({ ...input, dirty }, prev)` 只重算 `dirty` 里的子会话（其余子会话的 `RingChild` 从 `prev` 复用），`changes` 用单遍扫描（不是在每个时刻上调用 `stageAt`），后台通知用单遍扫描（Task 3 的 `applyBackgroundNotices`）。子会话同步完成时把它的 id 也记进 `dirty`。
  - 每帧的 `frameAt` 只做按 t 的二分查找和当前请求内的计算，不遍历全部请求。帧对象放进 `createStore`，用 `reconcile`（行按 id）更新，视图只读具体字段，没变的 DOM 不动。
  - 预算（Task 5、Task 11 的性能测试，数字记进证据）：单轮 1500 个请求、8 个已加载子会话、100 条通知消息时，完整重建 p95 ≤ 16 ms；每帧 `frameAt + geoOf + tokenAt + wiresAt + packetsAt + placeLabels` p95 ≤ 4 ms。完整重建超预算时，再加一层复用：已完成（completed 已设且 part 都已结束）的请求按 messageID 从 `prev` 复用，只重算未完成的请求及其后的 `changes`，此时增量重建 p95 ≤ 4 ms。
  - 实时模式：`t = wall + skew`。每次 index 变化时更新 `skew = max(skew, index.lastAt − wall, 0)`（`lastAt` 只取原始消息和 part 时刻，不含 `times` 里的 +EMIT_MS 补点），防止服务器时钟比本机快时新事件被当成“未来”而藏起来（远程服务器场景）。
  - 回看模式：t 等于播放头。
  - 页面不可见（IntersectionObserver / visibilitychange）时停 rAF。
  - 实时模式里，本轮已结束且空闲超过 `IDLE_MS` 时降到 1 秒一跳。减少动画时也是 1 秒一跳，但回看播放仍用 rAF。
- **D12 卡片种类与文字以样稿为准**（样稿 `payload` L995-1045，`planCard` L1059-1074）。标题用样稿用词：调用 / 交接 / 回执 / 本轮结束 / 已中止等，见 i18n 表。英文原文（工具输出、模型文字）照录，不加标签。
- **D13 焦点稳定：**
  - 工具台行、子代理格子、探针点击层、详情面板列表行，都用 `keyed()` 加 `<For>`，按 id 保持 DOM 节点。不按帧 `innerHTML`，也不用 `<Switch>` 切换含可聚焦子元素的块。
  - 卡片是一个常驻元素，正文槽原地更新。
  - 所有覆盖层（全文、日志、详情面板）关闭时，焦点都回到打开它的元素；那个元素不存在时回到根元素。
- **D14 几何稳定：** 每个框的矩形只取决于（舞台宽高, k）。k 是航道开合度，是 t 的纯函数（样稿 `laneOpen` L507-516）。根元素写 `data-oco-runtime-lane-k`（三位小数）。E2E 只在 k 相同时比较矩形。
- **D15 授权只在实时显示：**
  - 实时有权限请求时，环停在“等结果”，状态词为“等你授权”。卡片种类为 `permission`：正文是 `permission` 加 `patterns` 原文，按钮不提供。
  - “你”坞显示授权内容，只作显示。
  - 回看里这段时间显示为工具运行中。被拒绝的授权（`declined === "rejected"`）在回看里显示为“已拒绝”卡片和工具台 ✗ 行，文字是“你已拒绝授权”。
- **D16 子代理状态（时间门控，不再看实时生命周期）。** 未派出（created > t）时不显示，其余：

  | 类型 | 派发中 | 运行中 | 待取回 | 已取回 / 失败 |
  |---|---|---|---|---|
  | 同步 task | created ≤ t < start | 其余情况 | `childDoneAt(t)` 有值且 t < end | t ≥ end；已取回或失败（status error） |
  | 后台 task（有 `backgroundTaskId`） | created ≤ t < start | 其余情况 | `childDoneAt(t)` 有值，或 at ≤ t 的最新通知是 done | `retrievedAt ≤ t` 为已取回；at ≤ t 的最新通知是 error/cancelled 为失败 |

  - **`childDoneAt(sub, t)`**（Task 6 导出）：取子会话中 created ≤ t 的最新一条 assistant 消息 c。c 已完成（completed ≤ t），并且以 error 完成或满足 D5 的循环结束谓词（`c.finish` 不在 `LOOP_CONTINUE`），返回 `c.completed`；否则返回 undefined。`c.finish` 取消息的 `finish`，没有时取它最后一个 step-finish 的 reason，都没有时视为未结束。
    - 只用 ≤ t 的数据：子会话分多步时，第 1 步完成（reason `tool-calls`）到最后一步开始之间仍是“运行中”，不会在步与步之间闪成“待取回”。夹具里 8 个子会话都有 2–3 条 assistant 消息，正好覆盖这种情形。
    - 子会话没加载时返回 undefined：同步 task 在 end 之前一直是“运行中”，后台 task 只靠通知变成“待取回”。
  - 后台通知取 at ≤ t 的**最新**一条：`retry` 类通知会清除之前的状态（Task 3 的 `applyBackgroundNotices` 记为 `cleared`），清除后回到“运行中”。
  - 后台 task 自己的 end 不算取回。
  - 探针沿用 M4 的阶段名（E2E 用）：queued→`queued`，run→`running`，docked→`docked`，done/err→`absorbed`；err 另加 `flag=error`。
  - 实时模式下子会话树有待处理的提醒时 `flag=ask`。
- **D17 读屏：** `[data-oco-runtime-live]` 只在状态词、轮次或请求号变化时更新，句子来自 `ring.live.*`，不含“思考 / thinking / reasoning”。环心卡片不是 live region。
- **D18 已忽略 / 已拒绝不用红色（主线程裁定，2026-10-08）。** 用户在 M4 第三轮反馈里定过「拒绝授权、忽略提问不再算失败」，所以不沿用样稿图例把「失败 / 忽略」合并为一项的做法：已忽略 / 已拒绝用中性灰（`--rt-faint` 线框 + `--rt-weak` 文字），文字写「已忽略 / 已拒绝 / 你已拒绝授权」，不写「失败」；图例把「失败」（`--rt-err`）和「忽略 / 拒绝」（灰）分成两项；工具台对应行用 `⊘` 而不是 `✗`。E2E `perm-reject` 断言文字含「已拒绝」且该元素颜色不是 `--rt-err`。
- **D19 子代理格子超过 6 个：** 前 5 个照常显示；第 6 格变成“+N 个”按钮，点开列表。样稿没有这种情形，见开放问题 3。
- **D20 时间显示：** 时钟用本地时区 `HH:MM:SS`（24 小时制）。时长短格式 sK：<10 秒保留一位小数，<60 秒取整，否则“m分s秒”。时长长格式 sCN：再加小时一档。token 数用 `Intl.NumberFormat` 紧凑写法（中文写“万”）。金额写 `$` 加四位小数。这些都在 i18n 模块里实现，功能代码不判断语言（`packages/app/AGENTS.md` 27 行）。

---

## 架构

```
store (messages / parts / status / permission / question / child sessions)
   │  数据版本（≤ 10 次/秒，dirty 会话集合）
   ▼
buildRingIndex(input, prev) ──► RingIndex（每个会话一份；进入子会话时为子会话另建）
   │                         ▲ 后台关联：model.ts 导出的 backgroundIdOf / retrievalOf / backgroundNoticesOf
   │  视觉 t（rAF）           │
   ▼                         │
frameAt(index, t, opts) ──► RingFrame（stage / card / you / tools / subs / counter / model / pills / k / caption / live / bar）
   │            │
   │            ├─ childDoneAt / subStateAt / subDetailAt / subListAt（ring-sub.ts）──► 子代理坞、详情面板、包
   │            └─ trackInputOf ──► trackMap / foldsOf / trackLabelsAt（ring-track.ts）──► 时间轴
   ▼
geoOf(W, H, k) ──► RingGeo ──► tokenAt / wiresAt / packetsAt（ring-geo.ts）
   ▼
RingView（ring-view.tsx）+ RingSubView（ring-sub-view.tsx）+ RingTrack（ring-track-view.tsx）
   ▲
session-runtime.tsx：时钟、模式、播放、顶栏、说明行、状态栏、日志、面包屑、子会话同步、live region、根属性、检查钩子
```

新文件全部放在 `vendor/opencode/packages/app/src/components/session/`（测试另注明）：

| 文件 | 内容 | 任务 |
|---|---|---|
| `session-runtime-ring-types.ts` | 契约：常量、类型（只放类型和常量） | 2 |
| `session-runtime-ring.ts` | `buildRingIndex`、`stageAt`、`frameAt` 等纯函数 | 5 |
| `session-runtime-ring-sub.ts` | 子代理状态、详情、列表纯函数 | 6 |
| `session-runtime-ring-track.ts` | 折叠、v↔t、刻度标签、导航 | 7 |
| `session-runtime-ring-track-view.tsx` | 时间轴组件 | 7 |
| `session-runtime-ring-geo.ts` | 宽/窄几何、连线、包、令牌、标签避让 | 8 |
| `session-runtime-ring-view.tsx` | 舞台：SVG 环与框、卡片全文覆盖层 | 9 |
| `session-runtime-ring-sub-view.tsx` | 子代理坞、点击层、详情面板与列表 | 10 |
| `fixtures/runtime-m5-session.json`、`fixtures/runtime-m5-oracle.json` | 真实数据夹具与样稿判定结果（运行时读取，不 import，见事实 12） | 4 |
| `session-runtime-ring.fixture.ts` | 夹具 → SDK 形状的适配器 | 4 |
| `packages/app/test-browser/solid-jsx-preload.ts`，`packages/app/package.json` 的 `test:browser` 脚本 | test-browser 的 Solid JSX 编译预载（事实 11） | 2 |

---

## 契约（Task 2 原样落地为 `session-runtime-ring-types.ts`）

改契约只能由主线程在证据文件里记一条“契约变更”，并通知所有在跑的任务。

```ts
// oco (patches/opencode/0019): M5 runtime ring — shared contract. Types and constants only; no logic.
import type { RuntimeKey } from "./session-runtime-i18n"
import type { Message, Part } from "@opencode-ai/sdk/v2/client"
import type { RunState } from "./session-runtime-model"

export const RING = {
  EMIT_MS: 150, IDLE_MS: 2000, LINGER_MS: 300, FADE_MS: 300, RECENT_MS: 4000,
  LANE_MS: 420, FOLD_MIN: 10_000, FOLD_LEN: 3_000, LEAD_MS: 1200, V: 0.5,
  WIDE_MIN: 980, MIN_H_WIDE: 380, MIN_H_NARROW: 470,
  STRIP_H: 40, PAY_H: 116, CTR_H: 20, SUB_CELLS: 6,
  REBUILD_MS: 100,                // live index rebuild throttle (D11)
} as const
// finish reasons that keep the agent loop going (opencode session/prompt.ts); any other reason ends the loop (D5)
export const LOOP_CONTINUE: readonly string[] = ["tool-calls", "unknown"]

// ---------- copy ----------
export type PhraseParam =
  | string | number | Phrase
  | { ms: number; long?: true }   // duration: sK, or sCN when long
  | { at: number }                // HH:MM:SS
  | { tok: number }               // token count
  | { usd: number }               // $0.0000
export type Phrase = { key: RuntimeKey; params?: Record<string, PhraseParam> }

export type Tone = "faint" | "main" | "sub" | "tool" | "acc" | "text" | "ok" | "attn" | "err"
export type RingStageId = "pre" | "say" | "asm" | "fly" | "think" | "out" | "call" | "wait" | "ask" | "next" | "end" | "abort"
export type PillId = "asm" | "think" | "out" | "call" | "wait" | "next"

// ---------- index (built once from full data; every query reads only fields at or before t) ----------
export type RingSpan = { partID: string; start: number; end?: number; text: string }
export type RingTodo = { text: string; status: "pending" | "in_progress" | "completed" | "cancelled" }
export type RingQuestion = { header: string; question: string; options: { label: string; description: string }[] }
export type RingTool = {
  id: string; callID: string; messageID: string
  name: string; kind: "tool" | "task" | "question"
  created: number                 // idTime(part.id)
  start?: number; end?: number    // state.time
  status: "pending" | "running" | "completed" | "error"
  input: Record<string, unknown>  // raw state.input
  output?: string; error?: string // raw
  arg: string                     // command ?? filePath ?? `${pattern}  ${path}` ?? url ?? query ?? name ?? description ?? ""
  key: string                     // name + "|" + JSON.stringify(input)  (same-command key)
  chars: number                   // output length in code points
  slot: number                    // own tools: order within request; tasks: order within round
  declined?: "rejected" | "dismissed"
  todos?: RingTodo[]; planVersion?: number
  question?: RingQuestion
  sub?: RingSub
}
export type RingChild = {
  messages: { created: number; completed?: number; model: string; cost: number
    finish?: string                // message.finish ?? reason of its last step-finish
    error?: boolean }[]
  acts: ({ kind: "tool"; at: number; tool: RingTool } | { kind: "text"; at: number; span: RingSpan })[]
  thinks: { start: number; end?: number }[]
}
export type RingSub = {
  uid: string                     // child session id, else `${messageID}:${callID}`
  sessionID?: string
  round: number; request: number  // N and M at dispatch
  num: number                     // #N: "subagent N" in description, else slot + 1
  name: string                    // description without a leading "Subagent N "
  type: string                    // input.subagent_type ?? metadata.agent ?? input.category ?? ""
  agent: string                   // dispatching agent (display form)
  prompt: string
  result?: string                 // <task_result> body, else output with tags stripped
  created: number; start?: number; end?: number
  failed: boolean; error?: string
  // no whole-history "child done" field: use childDoneAt(sub, t) from session-runtime-ring-sub.ts (D16)
  background?: { taskId: string; retrievedAt?: number
    notices: { at: number; kind: "done" | "error" | "cancelled" | "cleared" }[] }   // ascending; state at t = last with at <= t
  child?: RingChild               // undefined until the child session is loaded
}
export type RingRequest = {
  messageID: string; round: number; m: number
  created: number; completed?: number
  agent: string; model: string    // display agent; `${providerID}/${modelID}`
  stepStart?: number              // idTime(step-start part id)
  think: RingSpan[]; texts: RingSpan[]; tools: RingTool[]
  finish?: { at: number; reason: string; cost: number
    tokens: { total: number; input: number; output: number; reasoning: number; cacheRead: number; cacheWrite: number } }
  error?: { name: string; message: string }
}
export type RingRound = {
  n: number; userMessageID: string; start: number; text: string; agent: string
  requests: RingRequest[]
  firstTask?: number              // created of this round's first task call
  prevHadTask: boolean
  changes: { t: number; st: RingStageId; ang: number }[]   // stage change points with ring angle (sample L556-583)
}
export type RingIndex = {
  sessionID: string
  rounds: RingRound[]
  subs: RingSub[]                 // all task calls in the session, by created
  plans: RingTool[]               // todowrite calls, by created, planVersion 1..n
  times: number[]                 // every change time, ascending, unique (includes created/start + EMIT_MS)
  nav: number[]                   // ←/→ targets (sample NAV_T L584)
  firstAt?: number; lastAt?: number   // raw event times only (message/part timestamps), no EMIT_MS pads
}
export type RingSource = { messages: readonly Message[]; parts: (messageID: string) => readonly Part[] }
export type RingIndexInput = RingSource & {
  sessionID: string; child: (sessionID: string) => RingSource | undefined
  dirty?: ReadonlySet<string>      // session ids changed since `prev` (D11); absent = rebuild everything
}

// ---------- frame at t ----------
export type RingLiveInput = {
  run: RunState
  permissions: { id: string; sessionID: string; permission: string; patterns: string[]; callID?: string }[]
  childAttention: ReadonlySet<string>   // child session ids with a pending permission/question in their tree
}
export type RingStage = {
  st: RingStageId; round?: RingRound; request?: RingRequest
  ask?: RingTool                   // question tool when st === "ask" (replay and live)
  permission?: RingLiveInput["permissions"][number]  // live only, st === "ask"
  endAt?: number; why?: "finish" | "dismiss" | "abort" | "idle"; dismissed?: RingTool
  reason?: string                  // finish.reason verbatim when why === "finish" (D5)
}
export type RingCardKind =
  | "idle" | "message" | "request" | "think" | "output" | "call" | "handoff" | "result" | "failed"
  | "return" | "waiting" | "ask" | "permission" | "receipt" | "dismissed" | "rejected" | "round-end" | "aborted" | "plan"
export type RingCard = {
  kind: RingCardKind; tone: Tone
  from: string | Phrase; to: string | Phrase
  pre?: Phrase
  body: string                     // verbatim, cut to t (a prefix while streaming)
  bodyMode: "head" | "tail" | "mid"; mono: boolean; streaming: boolean
  post?: Phrase | string
  plan?: { items: { text: string; status: RingTodo["status"]; partial: boolean }[] }
  meta: Phrase[]                   // joined by ring.sep
  age?: Phrase                     // right-side timer
  full?: string                    // full-text overlay, only content at or before t
}
export type RingYou = {
  state: "pre" | "idle" | "sent" | "writing" | "need" | "dismissed" | "permission"
  status: Phrase
  round?: { n: number; agent: string; text: string }
  ask?: { header: string; question: string; options: { label: string; description: string }[]; waitedMs: number }
  dismissed?: { header: string; options: string[]; waitedMs: number; at: number }
  permission?: { permission: string; patterns: string[] }
}
export type ToolRowState = "pend" | "run" | "ok" | "err"
export type RingToolRow = {
  id: string; name: string; state: ToolRowState
  arg: string                      // "" while pend (view shows ring.tools.args.pending)
  durMs?: number; same?: [number, number]
  chars?: number; head?: string; error?: string; rejected?: boolean
}
export type RingToolsDock = { m?: number; rows: RingToolRow[]; counts: Record<ToolRowState, number>; empty?: Phrase; emptyNote?: Phrase }
export type SubState = "queued" | "run" | "docked" | "done" | "err"
export type RingSubCell = {
  uid: string; num: number; slot: number
  name?: string; type?: string     // only when t >= start
  state: SubState; elapsedMs?: number; tookMs?: number; flag?: "ask" | "error"
}
export type RingSubsDock = {
  round?: number; cells: RingSubCell[]; counts: Record<SubState, number>
  total: number                    // N(t): task calls created <= t in the whole session
  stripWhat: Phrase; stripSession: Phrase; stripButton: boolean
}
export type RingCounter = {
  agent: string; round?: number; m?: number; ended: boolean
  requests: { m: number; state: "done" | "cur" | "bad" }[]
  plan?: { done: number; inProgress: number; total: number }
}
export type RingModelBox = { model: string; m?: number; line: Phrase; tone: Tone; carry?: Phrase; ctx: Phrase; lit: boolean }
export type RingPills = Record<PillId, { lit: boolean; sub?: Phrase }>
export type RingBar = { round?: number; durMs?: number; waitMs: number; idleMs?: number; ctx?: number; costUsd?: number }
export type RingStatus = { word: Phrase; tone: Tone; state: RunState }
export type RingFrame = {
  t: number; stage: RingStage; status: RingStatus; counter: RingCounter; model: RingModelBox
  card: RingCard; pills: RingPills; you: RingYou; tools: RingToolsDock; subs: RingSubsDock
  k: number; caption: Phrase; live: Phrase; bar: RingBar
}

// ---------- subagent detail ----------
export type RingSubAct =
  | { kind: "tool"; id: string; glyph: "…" | "●" | "✓" | "✗"; name: string; arg: string; durMs?: number
      line2: Phrase; border: "line-strong" | "sub" | "ok" | "err" }
  | { kind: "text"; id: string; text: string; streaming: boolean }
export type RingSubDetail = {
  uid: string; num: number; name?: string; type?: string; state: SubState
  stateLine: Phrase; second: Phrase[]
  handoff: { text?: string; pending?: Phrase }
  acts: { more: number; items: RingSubAct[]; thinkingMs?: number; empty?: Phrase; loading?: "loading" | "failed" }
  result: { text?: string; error?: string; note?: Phrase }
  open: { enabled: boolean; note: Phrase }
}
export type RingSubList = {
  total: number
  groups: { round: number; current: boolean; rows: { uid: string; num: number; name?: string; type?: string; state: SubState; ms?: number }[] }[]
}

// ---------- track ----------
export type TrackInput = {
  t0: number; t1: number
  rounds: { n: number; start: number; endAt?: number }[]   // endAt from the whole history (geometry only)
  waits: { start: number; end?: number }[]                  // question waits
  ticks: { t: number; cls: "" | "r" | "e" | "a" }[]
}
export type Fold = { a: number; b: number; kind: "wait" | "idle"; from: number; to?: number }  // to undefined: still open (live)
export type TrackSeg = { a: number; b: number; c: number; v0: number; fold?: Fold }
export type TrackMap = { segs: TrackSeg[]; total: number; folds: Fold[]; vOf(t: number): number; tOf(v: number): number }
export type TrackLabel = { x: number; text: Phrase; cls: "" | "r"; start?: boolean }

// ---------- geometry ----------
export type Pt = { x: number; y: number }
export type Box = { x: number; y: number; w: number; h: number }
export type Poly = { pts: Pt[]; L: number; at(d: number): Pt & { dx: number; dy: number }; hold?: number }
export type RingGeo = {
  mode: "wide" | "narrow"; k: number; W: number; H: number; R: number; cx: number; cy: number; pad: number
  busO: number; busB: number
  you: Box; model: Box; ctr: Box; pay: Box; tools: Box; lane: Box; sd: Box
  rows: Box[]; toolCap: number; cells: (Box & { row: number })[]
  topY: number; botY: number; sx0: number; sx1: number
  pill: Record<PillId, Box & { cx: number; cy: number }>
  callR: Pt; waitR: Pt; asmL: Pt
  pYou: Poly; pAsk: Poly; pAskBack: Poly
  toolOut(i: number): Poly; toolBack(i: number): Poly; subOut(k: number): Poly; subBack(k: number): Poly
  obst: Box[]
}
export type Wire = { id: string; pts: Pt[]; tone: Tone; width: number; opacity: number; dash?: string; dashOffset?: number; port?: Pt; gap?: { at: Pt } }
export type Packet = {
  id: string; at: Pt; tone: Tone; opacity: number; parked: boolean
  glyph?: string; label?: Phrase | string; long?: Phrase | string
  probe?: { uid: string; stage: "queued" | "running" | "docked" | "absorbed" }
}
```

导入路径与 `session-runtime-model.ts` 第 3 行相同。

---

## 判定规则（Task 5 实现；每条对应样稿行号，照搬语义）

### 索引（样稿 L400-517，改为读 SDK 形状）

- **时刻来源：**
  - 工具 created 取 `idTime(part.id, message.time.created)`，start/end 取 `state.time`。
  - step-start、step-finish 取 `idTime(part.id)`。
  - reasoning 取 `time.start/end`。
  - text 取 `time.start`；`time.end` 按 D2 的顺序回退。查询时，part 的结束只认 ≤ t 的那个时刻（D2）。
- **请求错误：** 取 `message.error`，形状为 `{name, data.message}`（样稿 `errOf` L400-404）。
- **todowrite：** `todos` 取 `input.todos[].{content,status}`；`planVersion` 按出现先后编号。
- **question：** 取 `input.questions[0]` 的 `{header, question, options}`。`declined` 沿用 `toolOf` 的识别（错误文本含 dismissed 或 rejected）。
- **task：** 用 `runtimeSubagentOf` 得到代理、描述和会话，再按 D16 填 `background`：
  - `retrievedAt`：用 Task 3 导出的 `retrievalOf`，取取回它的 `background_output` 调用的 end。
  - `notices`：**单遍扫描**。按 created 升序遍历用户消息，对每条调用 Task 3 导出的 `applyBackgroundNotices(state, message, parts)`，它返回这条消息造成的变化；每个变化记一条 `{at: message.time.created, kind}`，被 retry 清除的记 `cleared`。总代价 O(消息数)，不再对每个前缀重跑 `backgroundNoticesOf`。
- **子会话：** 由 `input.child(sessionID)` 得到；没有就不填 `child`。`RingChild.messages[].finish` 取 `message.finish`，没有时取它最后一个 step-finish 的 reason；`error` 为 `message.error` 是否存在。增量重建时，不在 `input.dirty` 里的子会话直接复用 `prev` 中同一 sessionID 的 `RingChild`（D11）。
- **`changes`：** 结果与样稿 L557-583 相同：在本轮 `times` 上的 stage 变化点，角度单调不减；`ANG` 表见样稿 L556。**实现为单遍扫描**：按时刻顺序推进当前请求、进行中的 span、未结束的工具这几个游标，一次得出所有变化点，不在每个时刻上重新调用 `stageAt`。测试要求扫描结果与“逐时刻调用 `stageAt`”在合成会话和夹具上完全一致（Task 5）。

### stageAt(index, t, live?)（样稿 L519-555 + D5 + D15）

1. 没有轮次 → `pre`。
2. 本轮已经结束（D5 第 1–3 条：abort / dismiss / `loopEnded`）→ `end` 或 `abort`。
3. 本轮还没有请求 → `say`。
4. 取最新请求 q（created ≤ t），依次判断：
   1. q 有 finish，finish.at ≤ t，且 reason ∈ `LOOP_CONTINUE`（`tool-calls` 或 `unknown`）→ `next`。其他 reason 已在第 2 步结束本轮，不会走到这里。
   2. 没有 stepStart，或 t < stepStart → `asm`。
   3. 有 start ≤ t 且尚未结束的 question → `ask`。实时下，若 q 中有正在运行的工具对应 `live.permissions` 的 callID → 也是 `ask`，附 `permission`。
   4. 有已创建但还未 start 的工具，或最近一次发出距今 < `EMIT_MS` → `call`。
   5. 有正在进行的 think → `think`；有正在进行的 text → `out`。
   6. 已有工具 → `wait`。
   7. 最近开始的是 text → `out`；否则是 think → `think`；否则 → `fly`。
5. 实时兜底（D5 第 4 条）：只在传入 `live` 时，于第 4 步得出结果后检查；条件成立则改为 `end`，`why: "idle"`。这条不写进 `changes`（`changes` 只由事件算出），令牌停在最后一个变化点；它只影响状态词、卡片、你坞、说明行、状态栏和 live region。

### frameAt 各部分（样稿行号）

| 部分 | 规则来源 |
|---|---|
| status | `statusWord` L860-866。实时：`run === "retrying"` 时用 `state.retrying`；有权限请求时用 `ring.status.permission` |
| pills | `STATIONOF` L859，`stationSubs` L1504-1513 |
| counter | `renderCtr` L970-986（请求点规则 `pipsHtml` L966-969）；plan 用 D3 |
| model | `modelLine` L935-949，`renderModel` L950-961 |
| card | `planShown`/`planCard` L1046-1074，`payload` L995-1045；`newestDone` 用 `RECENT_MS`；permission 和 rejected 按 D15；think/output 的正文与字数按 D2（回看进行中为空）；round-end 在 `why: "finish"` 且 reason ≠ `stop` 时 meta 加 `ring.card.end.reason` |
| you | `renderYou` L908-934；实时授权用 `you.permission` |
| tools | `renderTools` L1116-1142，`sameSoFar` L616-619：只数 created ≤ t 的同 key 调用 |
| subs | `renderLane` L1177-1206（格子最多 6 个，D19），状态用 `subStateAt`（Task 6），收起条两行文案见下节 |
| k | `laneOpen` L507-516：上一轮有子代理时从 1 开始；本轮开始后按 `LANE_MS` 收起；本轮第一个 task 出现时展开；用 smoothstep；减少动画时直接取 0/1 |
| caption | `caption` L1323-1343 |
| bar | `facts` L620-669 中的 dur/wait/idle/ctx/cost：ctx 取 ≤ t 的最近一次 step-finish 的 total；cost 为本轮 ≤ t 的 step-finish cost 加子会话中 completed ≤ t 的 cost |
| live | D17 |

---

## 子代理详情面板与收起条（Task 6 纯函数，Task 10 视图）

只用于查看和导航，没有回复、停止、取消。它替代 M4 点探针弹出的交接卡片。

**数据：**

- task part：`created`、`state.time.start/end`、`status`、`input.description/subagent_type/prompt`、`metadata.sessionId`、`output`。
- 返回结果：取 `<task_result>…</task_result>` 里的文字；没有这个标签时，取去掉标签后的 output。
- 子会话的 assistant 消息：`created`、`completed`、`model`、`cost`、`finish`（没有时取最后一个 step-finish 的 reason）、`error`。
- 子会话的 part：
  - tool：`created`、`time.start/end`、`status`、`input`、`output`、`error`；
  - text：`time.start/end`（夹具里是 `created`/`updated`，由适配器换算）；
  - reasoning：`time.start/end`。
- 子会话“做完”的时刻是 t 的函数 `childDoneAt(sub, t)`（D16）：created ≤ t 的最新 assistant 消息已在 t 前完成，且以 error 完成或 finish 不在 `LOOP_CONTINUE`。不再用“全部消息 completed 的最大值”，那是整段历史的事实，会在子会话的步与步之间把“运行中”提前显示成“待取回”。下文的 `childDone` 都指 `childDoneAt(sub, t)`。
- `#N` = 本轮中 task 调用的先后序号，从 1 开始。名字 = 描述去掉开头的 “Subagent N ”。

**触发与无障碍：**

- 格子：`role=button`、`tabindex=0`，`aria-label` 用 `ring.sub.cell.aria`（start 之前用 `.noname`）。
- 探针：每帧在探针位置放一个 22 px 透明的 `role=button` 点击层；SVG 本身不接收点击。
- 收起条：只有 N>0 时是按钮，带 `aria-expanded`。
- Enter 或 Space 激活。焦点环 2 px `--rt-main`，选中的格子或探针加环。
- 格子和点击层按子会话 id 保持节点。
- 面板：`role=dialog`，`aria-labelledby` 指向标题。打开时焦点到 ✕；列表模式下到第一行。Esc 或 ✕ 关闭，焦点回到打开它的元素。
- 面板自动关闭的条件：所选子代理 created > t；或列表模式下 N(t)=0。

**位置**（Task 8 的 `finishGeo` 算出 `g.sd`）：

- 宽屏：`x0 = 你.right + 14`，`x1 = busO − 14`，`w = min(x1 − x0, 520)`，`h = min(H − 28, max(360, 2R + 60))`，以环心居中并夹在边界内。
- 窄屏：`x = 8`，`w = W − 16`，`y = 你.bottom + 10`，`h = tools.top − 8 − y`。
- 面板不盖工具台和子代理格子，所以点别的格子可以直接切换。

**头部：** [子代理 小标，--rt-sub] [#N 名字] [@type，等宽小标] …… [← 列表，仅从列表打开时] [✕]

**状态行：** 状态词用对应颜色，后接时长文字。时长用 sK。

| 状态 | 何时 | 颜色 | 时长文字 |
|---|---|---|---|
| 派发中 | created ≤ t < start | faint | `ring.sub.queued.line`（{t−created}，{agent}） |
| 运行中 | start ≤ t，`childDoneAt(sub, t)` 为 undefined，且 t < end（后台 task 另按 D16 看通知） | sub | {t−start} |
| 待取回 | `childDoneAt(sub, t)` 有值且 t < end（后台 task 按 D16） | attn | `ring.sub.docked.line`（done = childDoneAt − start，wait = t − childDoneAt；只有通知没有 childDoneAt 时，用最新 done 通知的 at 代替） |
| 已取回 | t ≥ end，完成 | ok | `ring.sub.took` |
| 失败 | t ≥ end，出错 | err | `ring.sub.tookErr` |

第二行由 `ring.sub.origin`、`ring.sub.model`、`ring.sub.requests`、`ring.sub.cost` 组成，空的部分省略：

- model：created ≤ t 的最新子会话 assistant 消息的模型；
- requests：created ≤ t 的子会话 assistant 消息个数；
- cost：completed ≤ t 的子会话 cost 之和。

**时间门：**

- 名字、@type、交接文字只在 t ≥ start 后出现。此前标题只显示 “#N”，交接框为虚线，内容是 `ring.sub.handoff.pending`。
- 动态只显示 created ≤ t 的 part：
  - 工具状态：created ≤ t < start 为 pend，start ≤ t < end 为 run，之后为 ok 或 err；output/error 在 end 之后才出现。
  - 文字：按 D2。结束时刻 = min(time.end, 下个 part created, 消息 completed) 中 ≤ t 的那个。回看里未结束的文字行只写 `ring.sub.act.streaming`，结束后显示原文；实时（`opts.live`）显示已到达的文字并带 ▍。
- 结果：
  - t ≥ end 且完成 → task output；
  - 失败 → 错误文字；
  - 待取回 → `ring.sub.result.docked`（虚线）；
  - 其余 → `ring.sub.result.wait`（虚线）。
- “打开子会话 ↗”在 t ≥ start 后可用，说明写子会话 id；此前 disabled，说明写 `ring.sub.open.disabled`。

**各段：**

- **交接**（`ring.sub.h.handoff`）：prompt 原文，保留换行，最高约 8.6em，可滚动。
- **动态**（`ring.sub.h.acts`）：
  - 显示最后 6 条（宽屏）或 4 条（窄屏），旧的在上；被省略时首行写 `ring.sub.act.more`。
  - 工具行：
    - 第一行：字形 … ● ✓ ✗、工具名（等宽粗体）、参数（command / filePath / pattern+path / url / query / description；pend 时写“参数生成中”）、右侧时长。
    - 第二行：pend 时写 `ring.tools.row.pend`；run 时写 `ring.tools.row.run`；ok 时写 `ring.tools.row.ok`（前 80 字，合并空白）；err 时写 `ring.tools.row.err`（前 90 字）。
    - 左边框颜色：line-strong / sub / ok / err。
  - 文字行：标签“输出”，后接原文（保留 `**`、反引号和换行），最多 3 行；回看中未结束时见上面“时间门”。
  - 子会话正在运行且有 reasoning 跨过 t 时，加一行 `ring.sub.act.thinking`，不显示推理正文。
  - 空状态：派发中写 `notStarted`，运行中写 `noneYet`，其他写 `none`。子会话未加载时写 `child.loading`；加载失败写 `child.sync_failed`，并给重试按钮。
- **返回结果**（`ring.sub.h.result`）：原文，保留换行；出错时用 err 色边框。
- 面板里的文字一律用“只合并空白”的截断（样稿 `revealRaw`/`cutRaw` L1167-1172），不去掉 `**` 和反引号。

**收起条（高 40 px，两行）：**

- 第一行：本轮还没派写 `ring.sub.strip.yet`，本轮结束且没派写 `.none`，展开中写 `.sent`。
- 第二行：N>0 时写 `ring.sub.session`，后接 ▸ 或 ▾（--rt-sub），整条是按钮；N=0 时用 faint 色写 `ring.sub.session.none`，不是按钮。N = created ≤ t 的全部 task 调用数。

**列表面板：**

- 标题 `ring.sub.list.title`，右侧写 `ring.sub.list.count`。
- 按轮升序分组。组标题用 `ring.sub.list.group`，当前轮用 `.current`。
- 每行是按钮，左边框用状态色，内容为：#N、名字（未开始时写参数生成中）、@type 小标，右侧写状态（时长）。
- 点一行进入详情，详情头部出现“← 列表”。

**总线连线**（Task 8 `wiresAt`，样稿 L1364-1400）：

- 去程总线 = 调工具出口 + 用到的工具行 + 航道入口（展开时为派发航道上沿，收起时为收起条的接口）。
- 回程总线 = 用到的工具行 + 回传航道（仅展开时）→ 等结果入口。什么都没回来时，回程总线和通往等结果的支线都不画。
- 收起时有一段短线：从去程总线到收起条左缘中线，末端是接口小圆。
  - 接口小圆：r=3，填 --rt-bg，描边 --rt-sub，不透明度 0.6。
  - 短线：--rt-sub，1.2 px，不透明度 0.4，虚线 3 5；跨过回程总线处留 7 px 缺口。
- 展开的 420 ms 内，短线按 (1−k) 淡出，航道按 k 淡入；减少动画时直接切换。

---

## 回放时间轴（Task 7）

- **t0 / t1：** t0 = 第一轮开始 − `LEAD_MS`。t1 在实时模式下等于当前 t（播放头在最右）；在回看模式下等于进入回看时的实时 t。
- **折叠（样稿 L672-681）：**
  - 提问等待超过 `FOLD_MIN`：fold [start+2500, end−600]，kind=wait。
  - 本轮结束到下一轮开始（实时最后一轮则到 t1）超过 `FOLD_MIN`：fold [endAt+2600, next−1200]，kind=idle。
  - 实时里末尾仍在进行的空闲是“开口折叠”：`to` 留空，b 随 t1 增长。
  - 每段折叠在 v 空间占 `FOLD_LEN`。
- **v↔t：** `vOf`/`tOf` 为分段线性，两者互逆。同一段内误差 ≤ 1 ms。
- **不预告未来：**
  - t 之后的刻度隐藏。
  - 折叠记号 ≈ 只在 t ≥ from + `FOLD_MIN` 后出现。
  - 折叠标签写已过去的真实时长 `min(t, to) − from`：`ring.fold.wait` / `ring.fold.idle`，放不下时用 `.short`。
  - 紧跟在空闲之后的轮次标签与空闲标签合并（`ring.fold.glued`）。
  - 标签按优先级放置，放不下就换短写法，再放不下就不画（样稿 L1576-1618）。
  - 轨道总长会透露会话跨度，这一点在样稿里已经接受。
- **导航：** ←/→ 跳到 `index.nav` 中严格小于（大于）t 的最近点，越界时停在 t0/t1。播放时 `v += dt × speed`，`t = tOf(v)`，dt 上限 100 ms。速度 `PLAYBACK_SPEEDS = [1, 2, 4, 0.5]`。

---

## 几何（Task 8，照搬样稿 L686-832，宽高与 k 的纯函数）

- 舞台宽 ≥ `WIDE_MIN` 用 `geoWide`，否则用 `geoNarrow`。高度不足时，宽屏补到 `MIN_H_WIDE`、窄屏补到 `MIN_H_NARROW`，舞台纵向滚动。
- 站牌宽 = 文字宽 + 20。文字宽用样稿 `textW`（L394）：CJK 字符按字号计，其余按字号 × 0.61。这样不依赖 DOM 测量，单测可以复现。
- `finishGeo`：等你回答的弧从“等结果”站牌右缘出发（宽屏）；`sd` 面板矩形；`obst` 是标签避让用的障碍物列表。
- `tokenAt`（样稿 L868-890）：线速度为 `V`；令牌停在站牌外侧，按 `SIDE` 表决定哪一侧；一次跨过多站时最多落后一站（LAG 46°）；减少动画时直接到目标。
- `packetsAt`（样稿 L1514-1555）：包的位置 = (t − 出发时刻) × V。路径上有 `hold` 的停靠点（待取回泊位）时，停到 until 再继续。运行中的工具包停在行门口。到达后先停 `LINGER_MS`，再用 `FADE_MS` 淡出。减少动画时：在途的包直接到终点，不显示停留过程。
  - 子代理包的出发与放行（只用 ≤ t 的数据；样稿是“回程出发 = childDone ?? end，放行 = end”，后台 task 不能照搬）：

    | 类型 | 去程探针留在作业区到 | 回程包出发 | 停在待取回泊位到（until） |
    |---|---|---|---|
    | 同步 task | 回程出发 | `childDoneAt(sub, t) ?? end`（都没到则不出发） | end |
    | 后台 task | 回程出发（不因 task 自己很快的 end 而消失） | min(`childDoneAt(sub, t)`, at ≤ t 的最新 done 通知的 at)；两者都没有则不出发 | `background.retrievedAt`；还没取回（undefined 或 > t）就一直停在泊位 |
    | 后台 task，最新通知为 error/cancelled | 通知时刻 | 通知时刻，按失败包（err 色） | 不停泊 |

  - 放行后走完剩下的路到“等结果”入口，再 `LINGER_MS` + `FADE_MS`。`childDoneAt` 从 Task 6 导入。
- `wiresAt`：按上节“总线连线”。流动虚线的偏移 = (−t × 0.03) mod 12，减少动画时不流动。
- 呼吸：本轮结束（或 pre）且空闲超过 `IDLE_MS` 时，环的不透明度 = 0.5 + 0.12·sin(v/900)；减少动画时固定为 0.6。这个值由视图从 t 计算。

---

## 数据属性（E2E 与检查钩子的契约）

保留（名字和含义都不变）：

- `data-oco-runtime`（根，`tabIndex=-1`）、`-mode`（live|replay）、`-layout`（舞台宽 ≥ 980 时为 `wide`，否则 `stack`）、`-frame`、`.top`（顶栏，宽 ≥ 720 时单行）。
- `-state`：值为 RunState，文本为状态词。回看里由 stage 推出：pre/end/abort → idle，ask → waiting-user，其余 → working。
- `-state-evidence`：在 `-state` 同一元素上；实时取 `live().run.evidence`，回看为 `inferred`。
- `-pending`（实时提醒数）、`-retry`。
- `-last`：顶栏“最后事件”，只在实时渲染。
- `-summary`、`-duration`、`-legend`（5 个 span）、`-log-open`、`-log-panel`、`-log-filter`、`-events`、`-event`。
- `-live`。
- `-replay`（时间轴容器，内含 `input[type=range]`）、`-replay-live`、`-replay-pause`、`-replay-first`、`-replay-prev`、`-replay-play`、`-replay-next`、`-replay-speed`、`-replay-time`。
- `-crumb`、`-child`、`-child-lifecycle`、`-child-depth`、`-child-retry`。
- `-handoff-open`：现在是详情面板里的“打开子会话 ↗”。
- `-probe`=uid、`-probe-stage`（queued|running|docked|absorbed）、`-probe-flag`、`-probe-selected`：放在探针点击层元素上。
- `.oco-loop-anim`：标记所有由 t 驱动移动的 SVG 组（令牌、包、流动虚线）。

新增：

| 属性 | 元素 | 值 |
|---|---|---|
| `data-oco-runtime-stage` | 舞台根 | RingStageId |
| `data-oco-runtime-lane-k` | 舞台根 | k，三位小数 |
| `data-oco-runtime-focus` | 说明行 `<p>` | RingStageId（M4 放在主卡片状态行，现在移到这里） |
| `data-oco-runtime-ring` | 环 SVG | — |
| `data-oco-runtime-pill` / `-pill-lit` | 站牌 `<g>` | PillId / true\|false |
| `data-oco-runtime-token` / `-token-pos` / `-token-tgt` | 令牌 `<g>` | 角度，一位小数 |
| `data-oco-runtime-model` | 模型框 | — |
| `data-oco-runtime-counter` / `-round` / `-request` / `-agent` | 计数行 | N / M / 代理名 |
| `data-oco-runtime-plan` | 计划小标（没有计划时不渲染） | `done/total` |
| `data-oco-runtime-card` / `-card-kind` / `-card-tone` | 环心卡片 | RingCardKind / Tone |
| `data-oco-runtime-card-route` / `-card-body` / `-card-meta` | 卡片各槽 | — |
| `data-oco-runtime-card-expand` | “全文”按钮（常驻） | — |
| `data-oco-runtime-card-panel` | 全文覆盖层 | — |
| `data-oco-runtime-you` / `-you-state` | 你坞 | RingYou.state |
| `data-oco-runtime-you-option` | 选项（`<li>`，不是按钮） | 序号 |
| `data-oco-runtime-tools` | 工具台 | — |
| `data-oco-runtime-tool-row` / `-tool-state` / `-tool-same` | 工具行 | part id / pend\|run\|ok\|err / `i/n` |
| `data-oco-runtime-subs` / `-subs-mode` | 子代理坞 | — / strip\|open（k<0.5 为 strip） |
| `data-oco-runtime-subs-strip` | 收起条 | — |
| `data-oco-runtime-sub-cell` / `-sub-state` | 格子 | uid / SubState |
| `data-oco-runtime-sub-panel` / `-sub-panel-mode` | 详情面板 | — / detail\|list |
| `data-oco-runtime-sub-close` / `-sub-back` / `-sub-row` | 面板按钮与列表行 | — / — / uid |
| `data-oco-runtime-replay-t` | 时间轴容器 | 当前 t，epoch ms |
| `data-oco-runtime-replay-new` | “暂停后新增 N 条”（只在回看且 N>0 时渲染） | N |
| `data-oco-runtime-fold` / `-fold-ms` | 折叠记号 | wait\|idle / 已过去毫秒 |
| `data-oco-runtime-idle` / `-context` / `-cost` | 状态栏各段 | — |

**禁用名：** 不得出现 `data-oco-runtime-question`、`-reply`、`-stop`、`-roster`、`-stats`、`-attention`。你坞的选项不得是 `<button>`，也不得带 `role=button`。

**检查钩子：** Task 12 在根元素上挂一个不可枚举属性 `__ocoRuntime`，形如 `{ seek(t: number): void; facts(): RingFacts; frame(): RingFrame }`，卸载时删除。

- `seek(t)`：t 为 epoch ms。它会进入回看、暂停，并把 t 夹在 [t0, t1] 内。
- `facts()` 返回 `{ stage, cardKind, round, request, plan, tools: [{name, state, same}], subs: [{num, state}], youState, status, k, t }`，以及与样稿 `mock.facts()` 同名的 9 段 innerText：`status`、`cap`、`ctr`、`pay`、`model`、`you`、`tools`、`lane`、`bar`。

这个钩子只用于检查和跳转，不提供任何操作。

**颜色 token**（Task 12 在根 style 中加入；视图任务只引用名字）：

| token | 值 | token | 值 | token | 值 |
|---|---|---|---|---|---|
| `--rt-chip` | #10141c | `--rt-hover` | #1f2633 | `--rt-ink` | #0e1218 |
| `--rt-ok-soft` | #9fc7a8 | `--rt-err-deep` | #5a3236 | `--rt-empty` | #6f798c |
| `--rt-err-line` | #6b3a3d | `--rt-pip-done` | #4f6f74 | `--rt-ok-deep` | #3f5f49 |
| `--rt-sub-deep` | #3c4f78 | `--rt-attn-bg` | #2c2616 | `--rt-sel` | #243049 |
| `--rt-attn-deep` | #1d1b16 | `--rt-panel-2` | #1a2130 | `--rt-panel-0` | #151a23 |

视图任务按样稿 CSS 中各十六进制值出现的位置，改成对应的 token。验收：`grep -nE '#[0-9a-fA-F]{6}' session-runtime-ring*.tsx` 无输出。

---

## i18n 键（Task 1 加入 en / zh / zht；全部以 `ring.` 开头）

- 时长、token、金额、时钟都作为参数，由视图用 `runtimeText` 新增的格式化函数填入（见 Task 1）。
- `{{dur}}` 是格式化后的时长；`{{at}}` 是时钟；`{{tok}}` 是 token；`{{cost}}` 是金额。
- 用 “ · ” 连接的若干独立事实（卡片 meta、说明行里的列表）用 `ring.sep` 连接；这种连接是事实列表，不是拼句。
- 繁体按下列词表从简体转写，并通读校对：
  - 运行→執行，调用/调→呼叫，计划→計畫，返回/回传→回傳，消息→訊息，请求→請求，轮→輪，个→個，会话→會話，参数→參數，结果→結果，输出→輸出，组装→組裝，派发→派發，授权→授權，空闲→閒置，回执→回執，花费→花費，时长/用时→用時；
  - 其余按常规简繁转换。
  - `ring.sub.*` 的繁体以下方给出的为准。

**通用、状态、格式**

| 键 | zh | en |
|---|---|---|
| ring.sep | ` · ` | ` · ` |
| ring.status.running | 运行中 | Running |
| ring.status.ask | 等你回答 | Waiting for your answer |
| ring.status.permission | 等你授权 | Waiting for your approval |
| ring.status.end | 本轮结束 · 待命 | Round finished · Standing by |
| ring.status.abort | 已中止 · 待命 | Stopped · Standing by |
| ring.fmt.s | {{n}}秒 | {{n}}s |
| ring.fmt.ms | {{m}}分{{s}}秒 | {{m}}m {{s}}s |
| ring.fmt.long.s | {{n}} 秒 | {{n}} s |
| ring.fmt.long.ms | {{m}} 分 {{s}} 秒 | {{m}} min {{s}} s |
| ring.fmt.long.hm | {{h}} 小时 {{m}} 分 | {{h}} h {{m}} min |

（pre 和空闲沿用已有的 `state.idle`，重试沿用 `state.retrying`。最后事件、暂停后新增、状态依据、待处理计数沿用 M4 的 `last.*`、`ago.*`、`replay.new`、`evidence.*`、`header.pending*` 键，不新增；Task 12 清理废键时必须保留它们。）

**环、站牌、包**

| 键 | zh | en |
|---|---|---|
| ring.pill.asm / think / out / call / wait / next | 组装请求 / 模型思考 / 模型输出 / 调工具 / 等结果 / 带回结果 | Assemble request / Model thinking / Model output / Call tools / Await results / Bring results back |
| ring.pill.sub.msg | 带上你的消息 | Carries your message |
| ring.pill.sub.res | 带回 {{n}} 个结果 | Brings back {{n}} results |
| ring.pill.sub.chars | {{n}} 字 | {{n}} chars |
| ring.pill.sub.calls | {{n}} 个调用 | {{n}} calls |
| ring.pill.sub.mixed | {{calls}} 个调用 + {{asks}} 个提问 | {{calls}} calls + {{asks}} questions |
| ring.pill.sub.asks | {{n}} 个提问 → 你 | {{n}} questions → you |
| ring.pill.sub.waited | 已等 {{dur}} | Waited {{dur}} |
| ring.pill.sub.flow | 在跑 {{run}} · 回来 {{back}} | {{run}} running · {{back}} back |
| ring.next.req | 第 {{m}} 次请求 → 模型 | Request {{m}} → model |
| ring.aborted | ■ 已中止 | ■ Stopped |
| ring.lane.out | 派发航道 → | Dispatch lane → |
| ring.lane.back | ← 回传航道 | ← Return lane |
| ring.pkt.you | 你的消息 | Your message |
| ring.pkt.handoff | #{{n}} 交接 | #{{n}} handoff |
| ring.pkt.return | #{{n}} 返回 | #{{n}} returned |
| ring.pkt.return.long | #{{n}} 返回 {{text}} | #{{n}} returned {{text}} |
| ring.pkt.ask | 提问「{{header}}」 | Question “{{header}}” |
| ring.pkt.dismissed | ✕ 你忽略了提问 | ✕ You dismissed the question |
| ring.pkt.dismissed.mark | ✕ 已忽略 | ✕ Dismissed |

**计数、计划、模型框**

| 键 | zh | en |
|---|---|---|
| ring.ctr.round | 第 {{n}} 轮 | Round {{n}} |
| ring.ctr.request | 第 {{m}} 次请求 | Request {{m}} |
| ring.ctr.request.short | 请求 {{m}} | Req {{m}} |
| ring.ctr.ended | 已结束 | Finished |
| ring.ctr.ended.total | 已结束 · 共 {{n}} 次请求 | Finished · {{n}} requests |
| ring.plan.chip | 计划 {{done}}/{{total}} | Plan {{done}}/{{total}} |
| ring.model.title | 模型 | Model |
| ring.model.waiting | 等待 | Waiting |
| ring.model.asm | 等第 {{m}} 次请求 | Waiting for request {{m}} |
| ring.model.fly | 收到请求 · 等首个回复 {{dur}} | Request received · awaiting first reply {{dur}} |
| ring.model.think | 思考中 {{dur}} | Thinking {{dur}} |
| ring.model.out | 输出中 · 已 {{n}} 字 | Writing · {{n}} chars |
| ring.model.out.dur | 输出中 {{dur}} | Writing {{dur}} |
| ring.model.call | 写调用 · 已写 {{made}} | Writing calls · {{made}} so far |
| ring.model.call.ask | 写一个给你的提问 | Writing a question for you |
| ring.model.wait | 这次回复已写完 · 等结果 | Reply written · awaiting results |
| ring.model.ask | 这次回复已写完 · 等你回答 | Reply written · waiting for your answer |
| ring.model.receipt | 回执 合计 {{total}}（入 {{in}} · 出 {{out}}）· {{cost}} | Receipt {{total}} total (in {{in}} · out {{out}}) · {{cost}} |
| ring.model.done | 这次回复已写完 | Reply written |
| ring.model.aborted | 第 {{m}} 次请求已中止 | Request {{m}} stopped |
| ring.model.carry | 这次请求：{{carry}} · {{ctx}} | This request: {{carry}} · {{ctx}} |
| ring.model.ctx | 上下文 ≈ {{tok}}（上次回执） | Context ≈ {{tok}} (last receipt) |
| ring.model.ctx.unknown | 上下文：这次回执后可知 | Context: known after this receipt |
| ring.model.ctx.above | 回执见上一行 | Receipt shown above |

**卡片**

| 键 | zh | en |
|---|---|---|
| ring.card.kind.idle / message / request / think / output / call / handoff / result / failed / return / waiting / ask / permission / receipt / dismissed / rejected / round-end / aborted / plan | 待命 / 消息 / 请求 / 思考 / 输出 / 调用 / 交接 / 结果 / 失败 / 返回 / 等待 / 提问 / 授权 / 回执 / 已忽略 / 已拒绝 / 本轮结束 / 已中止 / 计划 | Standing by / Message / Request / Thinking / Output / Call / Handoff / Result / Failed / Returned / Waiting / Question / Approval / Receipt / Dismissed / Rejected / Round finished / Stopped / Plan |
| ring.card.who.you | 你 | You |
| ring.card.who.model | 模型 | Model |
| ring.card.who.chat | 你（对话） | You (chat) |
| ring.card.who.plan | 计划 | Plan |
| ring.card.who.toolsSubs | 工具 / 子代理 | Tools / subagents |
| ring.card.who.sub | #{{n}} {{name}} | #{{n}} {{name}} |
| ring.card.idle.body | 回放从第 {{n}} 轮开始。 | Replay starts at round {{n}}. |
| ring.card.say.meta | 第 {{n}} 轮开始 · {{at}} | Round {{n}} started · {{at}} |
| ring.card.req.msg | 带上你的消息： | Carries your message: |
| ring.card.req.res | 带回 {{n}} 个结果： | Brings back {{n}} results: |
| ring.card.req.subsOk | {{n}} 个子代理 ✓ | {{n}} subagents ✓ |
| ring.card.req.subsErr | {{n}} 个子代理 有 ✗ | {{n}} subagents, some ✗ |
| ring.card.asm.meta | 组装中 · {{ctx}} | Assembling · {{ctx}} |
| ring.card.fly.meta | 已发出 {{dur}} · 等首个回复 · {{ctx}} | Sent {{dur}} ago · awaiting first reply · {{ctx}} |
| ring.card.think.meta | 思考 {{dur}} · 这次请求{{carry}} | Thinking {{dur}} · this request: {{carry}} |
| ring.card.out.meta | 已 {{n}} 字 | {{n}} chars |
| ring.card.out.meta.dur | 输出 {{dur}} | Writing {{dur}} |
| ring.card.streaming | 生成中 · 回看在这段结束后显示原文 | Streaming · replay shows the text once this part ends |
| ring.card.call.ask | 正在写一个给你的提问… | Writing a question for you… |
| ring.card.call.task | 正在写交给子代理的任务… | Writing the task for the subagent… |
| ring.card.call.tool | 正在写 {{tool}} 调用的参数… | Writing the arguments for {{tool}}… |
| ring.card.call.meta | 这次请求已写 {{made}} · 在跑 {{run}} | This request: {{made}} written · {{run}} running |
| ring.card.took | 用时 {{dur}} | took {{dur}} |
| ring.card.chars | {{n}} 字 | {{n}} chars |
| ring.card.return.chars | 返回 {{n}} 字 | {{n}} chars returned |
| ring.card.noOutput | （无输出） | (no output) |
| ring.card.waiting.pre | 还在等 {{n}} 个： | Still waiting for {{n}}: |
| ring.card.ask.wide | {{n}} 个选项见左侧「你」· 在输入框回答 | {{n}} options under “You” on the left · answer in the input box |
| ring.card.ask.narrow | {{n}} 个选项见上方「你」 | {{n}} options under “You” above |
| ring.card.permission.meta | 在下方输入框批准或拒绝 | Approve or reject below the input box |
| ring.card.rejected.body | 你拒绝了 {{tool}} 的授权。 | You rejected the {{tool}} permission request. |
| ring.card.receipt.body | 第 {{m}} 次请求完成：回执 合计 {{total}}（入 {{in}} · 出 {{out}}）· {{cost}} | Request {{m}} done: receipt {{total}} total (in {{in}} · out {{out}}) · {{cost}} |
| ring.card.receipt.post | 带上 {{n}} 个结果，发第 {{next}} 次请求 | Sends request {{next}} with {{n}} results |
| ring.card.receipt.meta | 上下文 {{tok}}（= 这次回执合计） | Context {{tok}} (= this receipt's total) |
| ring.card.dismissed.body | 你忽略了提问「{{header}}」，第 {{n}} 轮到此结束。 | You dismissed “{{header}}”; round {{n}} ends here. |
| ring.card.dismissed.meta | {{at}} · 提问等了 {{dur}} · 已空闲 {{idle}} | {{at}} · the question waited {{dur}} · idle {{idle}} |
| ring.card.end.meta | {{at}} · 已空闲 {{dur}} | {{at}} · idle {{dur}} |
| ring.card.end.reason | 结束原因 {{reason}} | Finish reason {{reason}} |
| ring.card.aborted.body | 第 {{m}} 次请求被中止：{{name}}（{{message}}）。 | Request {{m}} was stopped: {{name}} ({{message}}). |
| ring.card.aborted.post | 中止前模型在思考：{{text}} | Before the stop the model was thinking: {{text}} |
| ring.card.age.ago | {{dur}}前 | {{dur}} ago |
| ring.card.age.waited | 已等 {{dur}} | Waited {{dur}} |
| ring.card.expand | 全文 | Full text |
| ring.card.expand.aria | 展开全文 | Show the full text |
| ring.card.plan.writing | 正在写计划第 {{v}} 版 · 已写完 {{n}} 项 | Writing plan v{{v}} · {{n}} items written |
| ring.card.plan.carry | 计划第 {{v}} 版随第 {{m}} 次请求带回模型 · 完成 {{done}}/{{total}} | Plan v{{v}} goes back to the model with request {{m}} · {{done}}/{{total}} done |
| ring.card.plan.meta | 计划第 {{v}} 版 · 完成 {{done}} · 进行中 {{doing}} · 待办 {{todo}} | Plan v{{v}} · {{done}} done · {{doing}} in progress · {{todo}} to do |
| ring.card.plan.more | 另 {{n}} 项 | {{n}} more |
| ring.wait.left | 等 {{n}} 个结果回来 | Waiting for {{n}} results |
| ring.wait.all | 结果已齐 | All results in |
| ring.wait.tools | 工具 {{back}}/{{all}} 回来 | Tools {{back}}/{{all}} back |
| ring.wait.tools.err | 工具 {{back}}/{{all}} 回来（✗{{err}}） | Tools {{back}}/{{all}} back (✗{{err}}) |
| ring.wait.subs | 子代理 {{got}}/{{all}} 取回 | Subagents {{got}}/{{all}} collected |

**你坞**

| 键 | zh | en |
|---|---|---|
| ring.you.title | 你 | You |
| ring.you.idle | 此刻不需要你 | Nothing needed from you |
| ring.you.need | 等你回答 · 已等 {{dur}} | Waiting for your answer · {{dur}} |
| ring.you.dismissed | 你忽略了提问 · {{at}} | You dismissed the question · {{at}} |
| ring.you.writing | {{agent}} 正在写一个提问… | {{agent}} is writing a question… |
| ring.you.sent | 你刚发出消息 · {{dur}}前 | You just sent a message · {{dur}} ago |
| ring.you.permission | 等你授权 · {{permission}} | Waiting for your approval · {{permission}} |
| ring.you.round | 第 {{n}} 轮你说 · 发给 {{agent}} | Round {{n}}, you said · to {{agent}} |
| ring.you.round.narrow | 第 {{n}} 轮你说：{{text}} | Round {{n}}, you said: {{text}} |
| ring.you.ask.head | 提问 · {{header}} · {{n}} 个选项 | Question · {{header}} · {{n}} options |
| ring.you.ask.narrow | 提问 · {{header}} | Question · {{header}} |
| ring.you.ask.hint | 问题全文见中间卡片 · 在下方输入框回答（此处只显示） | Full question in the centre card · answer in the input box below (display only) |
| ring.you.dismissed.head | ✕ 你忽略了提问「{{header}}」 | ✕ You dismissed “{{header}}” |
| ring.you.dismissed.hint | 提问等了 {{dur}} · 第 {{n}} 轮到此结束 | The question waited {{dur}} · round {{n}} ends here |
| ring.you.dismissed.narrow | ✕ 你忽略了提问「{{header}}」· 提问等了 {{dur}} | ✕ You dismissed “{{header}}” · waited {{dur}} |
| ring.you.pre | 回放从第 {{n}} 轮开始 | Replay starts at round {{n}} |
| ring.you.permission.hint | 在下方输入框批准或拒绝（此处只显示） | Approve or reject below the input box (display only) |

**工具台**

| 键 | zh | en |
|---|---|---|
| ring.tools.title | 工具台 | Tools |
| ring.tools.counts | 在跑 {{run}} · ✓{{ok}} · ✗{{err}} | {{run}} running · ✓{{ok}} · ✗{{err}} |
| ring.tools.counts.pend | 写参数 {{n}} | {{n}} writing arguments |
| ring.tools.empty.idle | {{agent}} 待命 | {{agent}} standing by |
| ring.tools.empty.ask | 第 {{m}} 次请求只发了一个提问（给你） | Request {{m}} only sent a question (to you) |
| ring.tools.empty.none | 第 {{m}} 次请求没有调工具 | Request {{m}} called no tools |
| ring.tools.empty.yet | 第 {{m}} 次请求还没调工具 | Request {{m}} has not called tools yet |
| ring.tools.empty.carried | 上一次的 {{n}} 个结果已随这次请求带回模型 | The previous {{n}} results went back to the model with this request |
| ring.tools.row.pend | 模型在写这个调用的参数 | The model is writing this call's arguments |
| ring.tools.row.run | 运行中 {{dur}} | Running {{dur}} |
| ring.tools.row.ok | → ✓ {{n}} 字「{{head}}」 | → ✓ {{n}} chars “{{head}}” |
| ring.tools.row.empty | 无输出 | no output |
| ring.tools.row.err | → ✗ {{error}} | → ✗ {{error}} |
| ring.tools.row.rejected | 你已拒绝授权 | You rejected the permission request |
| ring.tools.args.pending | （参数生成中） | (arguments streaming) |
| ring.tools.same | 同一命令 {{i}}/{{n}} | Same command {{i}}/{{n}} |
| ring.tools.more | +{{n}} 个调用 | +{{n}} calls |

**子代理坞与面板**（zht 列以此为准）

| 键 | zh | en | zht |
|---|---|---|---|
| ring.sub.title | 子代理 | Subagent | 子代理 |
| ring.sub.state.queued / run / docked / done / err | 派发中 / 运行中 / 待取回 / 已取回 / 失败 | Dispatching / Running / Awaiting pickup / Collected / Failed | 派發中 / 執行中 / 待取回 / 已取回 / 失敗 |
| ring.sub.counts | 作业 {{run}} · 待取回 {{docked}} · 已取回 {{done}}/{{total}} | Working {{run}} · awaiting pickup {{docked}} · collected {{done}}/{{total}} | 作業 {{run}} · 待取回 {{docked}} · 已取回 {{done}}/{{total}} |
| ring.sub.counts.narrow | 作业 {{run}} · 已取回 {{done}}/{{total}} | Working {{run}} · collected {{done}}/{{total}} | 作業 {{run}} · 已取回 {{done}}/{{total}} |
| ring.sub.empty.yet | 第 {{n}} 轮还没派子代理 | No subagents yet in round {{n}} | 第 {{n}} 輪還沒派子代理 |
| ring.sub.empty.none | 第 {{n}} 轮没派子代理 | No subagents in round {{n}} | 第 {{n}} 輪沒派子代理 |
| ring.sub.empty.pre | 没有子代理 | No subagents | 沒有子代理 |
| ring.sub.strip.yet | 子代理 · 第 {{n}} 轮还没派 | Subagents · none yet in round {{n}} | 子代理 · 第 {{n}} 輪還沒派 |
| ring.sub.strip.none | 子代理 · 第 {{n}} 轮没派 | Subagents · none in round {{n}} | 子代理 · 第 {{n}} 輪沒派 |
| ring.sub.strip.sent | 子代理 · 第 {{n}} 轮派出 {{m}} 个 | Subagents · {{m}} dispatched in round {{n}} | 子代理 · 第 {{n}} 輪派出 {{m}} 個 |
| ring.sub.strip.pre | 子代理 · 没有 | Subagents · none | 子代理 · 沒有 |
| ring.sub.session | 本会话共 {{n}} 个子代理 | {{n}} subagents in this session | 本會話共 {{n}} 個子代理 |
| ring.sub.session.none | 本会话还没派过子代理 | No subagents in this session yet | 本會話還沒派過子代理 |
| ring.sub.strip.aria | 子代理：{{what}}；本会话共 {{n}} 个子代理，点开看列表 | Subagents: {{what}}; {{n}} in this session, open the list | 子代理：{{what}}；本會話共 {{n}} 個子代理，點開看列表 |
| ring.sub.cell.aria | #{{num}} {{name}} · {{state}}，点开看详情 | #{{num}} {{name}} · {{state}}, open details | #{{num}} {{name}} · {{state}}，點開看詳情 |
| ring.sub.cell.aria.noname | #{{num}} · {{state}}，点开看详情 | #{{num}} · {{state}}, open details | #{{num}} · {{state}}，點開看詳情 |
| ring.sub.cell.run | 作业 {{dur}} | Working {{dur}} | 作業 {{dur}} |
| ring.sub.cell.done | 已取回 {{dur}} | Collected {{dur}} | 已取回 {{dur}} |
| ring.sub.cell.short.queued | 派发 | Dispatch | 派發 |
| ring.sub.cell.more | +{{n}} 个 | +{{n}} | +{{n}} 個 |
| ring.sub.took | 用时 {{dur}} · {{at}} 取回 | took {{dur}} · collected {{at}} | 用時 {{dur}} · {{at}} 取回 |
| ring.sub.tookErr | 用时 {{dur}} · {{at}} | took {{dur}} · {{at}} | 用時 {{dur}} · {{at}} |
| ring.sub.queued.line | {{dur}} · {{agent}} 在写交接 | {{dur}} · {{agent}} is writing the handoff | {{dur}} · {{agent}} 在寫交接 |
| ring.sub.docked.line | {{dur}} · 做完用了 {{done}} · 已等取回 {{wait}} | {{dur}} · finished in {{done}} · waiting for pickup {{wait}} | {{dur}} · 完成用了 {{done}} · 已等取回 {{wait}} |
| ring.sub.origin | 第 {{r}} 轮第 {{q}} 次请求派出 · {{at}} | dispatched in round {{r}}, request {{q}} · {{at}} | 第 {{r}} 輪第 {{q}} 次請求派出 · {{at}} |
| ring.sub.model | 模型 {{model}} | model {{model}} | 模型 {{model}} |
| ring.sub.requests | 子会话 {{n}} 次请求 | child: {{n}} requests | 子會話 {{n}} 次請求 |
| ring.sub.cost | 花费 {{cost}} | cost {{cost}} | 花費 {{cost}} |
| ring.sub.h.handoff | 交接 · {{agent}} 给它的话（原文） | Handoff · what {{agent}} told it (verbatim) | 交接 · {{agent}} 給它的話（原文） |
| ring.sub.handoff.pending | {{agent}} 还在写交接（参数生成中） | {{agent}} is still writing the handoff (arguments streaming) | {{agent}} 還在寫交接（參數生成中） |
| ring.sub.h.acts | 它的动态 · 工具调用和文字（原文，新的在下） | Its activity · tool calls and text (verbatim, newest last) | 它的動態 · 工具呼叫和文字（原文，新的在下） |
| ring.sub.act.output | 输出 | Output | 輸出 |
| ring.sub.act.streaming | 生成中… | Streaming… | 生成中… |
| ring.sub.act.thinking | 在思考 {{dur}} | Thinking {{dur}} | 思考中 {{dur}} |
| ring.sub.act.more | 前面还有 {{n}} 条 | {{n}} earlier | 前面還有 {{n}} 條 |
| ring.sub.acts.notStarted | 子会话还没开始 | Child session not started | 子會話還沒開始 |
| ring.sub.acts.noneYet | 还没有工具调用或文字 | No tool calls or text yet | 還沒有工具呼叫或文字 |
| ring.sub.acts.none | 没有工具调用或文字 | No tool calls or text | 沒有工具呼叫或文字 |
| ring.sub.h.result | 返回结果（原文） | Returned result (verbatim) | 回傳結果（原文） |
| ring.sub.result.wait | 还没返回 | Not returned yet | 還沒回傳 |
| ring.sub.result.docked | 子代理已做完，结果停在待取回泊位，等 {{agent}} 取回 | Finished; the result is waiting at the pickup berth for {{agent}} | 子代理已完成，結果停在待取回泊位，等 {{agent}} 取回 |
| ring.sub.open | 打开子会话 ↗ | Open child session ↗ | 開啟子會話 ↗ |
| ring.sub.open.disabled | 子会话还没建立 | Child session not created yet | 子會話尚未建立 |
| ring.sub.open.note | 子会话 {{id}} | child session {{id}} | 子會話 {{id}} |
| ring.sub.list.title | 本会话的子代理 | Subagents in this session | 本會話的子代理 |
| ring.sub.list.count | 到此刻共 {{n}} 个 | {{n}} so far | 到此刻共 {{n}} 個 |
| ring.sub.list.group | 第 {{r}} 轮 · {{m}} 个 | Round {{r}} · {{m}} | 第 {{r}} 輪 · {{m}} 個 |
| ring.sub.list.group.current | 第 {{r}} 轮（本轮） · {{m}} 个 | Round {{r}} (current) · {{m}} | 第 {{r}} 輪（本輪） · {{m}} 個 |
| ring.sub.back | ← 列表 | ← List | ← 列表 |
| ring.sub.close | 关闭 | Close | 關閉 |

**时间轴、说明行、状态栏、读屏**

| 键 | zh | en |
|---|---|---|
| ring.track.aria | 回放位置 | Replay position |
| ring.track.valuetext | {{at}} · 第 {{n}} 轮 | {{at}} · round {{n}} |
| ring.track.round | 第{{n}}轮 | R{{n}} |
| ring.fold.wait | ≈ 等你 {{dur}} | ≈ waited for you {{dur}} |
| ring.fold.idle | ≈ 空闲 {{dur}} | ≈ idle {{dur}} |
| ring.fold.wait.short | ≈等你{{dur}} | ≈you {{dur}} |
| ring.fold.idle.short | ≈{{dur}} | ≈{{dur}} |
| ring.fold.glued | {{fold}} · {{round}} | {{fold}} · {{round}} |
| ring.fold.glued.short | {{fold}} {{round}} | {{fold}} {{round}} |
| ring.cap.now | 此刻 | Now |
| ring.cap.pre | {{agent}} 待命。 | {{agent}} is standing by. |
| ring.cap.say | 你发出第 {{n}} 轮消息，{{agent}} 收到。 | You sent the round {{n}} message; {{agent}} received it. |
| ring.cap.asm | {{agent}} 在组装第 {{m}} 次请求（{{carry}}）。 | {{agent}} is assembling request {{m}} ({{carry}}). |
| ring.cap.fly | 第 {{m}} 次请求已发给模型，等首个回复（{{dur}}）。 | Request {{m}} is with the model; awaiting the first reply ({{dur}}). |
| ring.cap.think | 模型在思考（{{dur}}）· 这次请求{{carry}}。 | The model is thinking ({{dur}}) · this request: {{carry}}. |
| ring.cap.out | 模型在回复你（已输出 {{n}} 字）。 | The model is replying to you ({{n}} chars so far). |
| ring.cap.out.dur | 模型在回复你（{{dur}}）。 | The model is replying to you ({{dur}}). |
| ring.cap.plan | {{agent}} 写下执行计划第 {{v}} 版（完成 {{done}}/{{total}}）。 | {{agent}} wrote plan v{{v}} ({{done}}/{{total}} done). |
| ring.cap.plan.writing | 模型在写执行计划（todowrite 第 {{v}} 版）。 | The model is writing the plan (todowrite v{{v}}). |
| ring.cap.call | 模型在写工具调用（已写 {{made}}）。 | The model is writing tool calls ({{made}} so far). |
| ring.cap.call.running | 模型在写工具调用（已写 {{made}}）· 同时在跑：工具 {{tools}} · 子代理 {{subs}}。 | The model is writing tool calls ({{made}} so far) · running meanwhile: {{tools}} tools · {{subs}} subagents. |
| ring.cap.call.ask | 模型在写一个给你的提问。 | The model is writing a question for you. |
| ring.cap.wait | {{phrase}}。 | {{phrase}}. |
| ring.cap.ask | {{agent}} 停下来等你回答「{{header}}」· 已等 {{dur}} · 在下方输入框回答。 | {{agent}} stopped to wait for your answer to “{{header}}” · {{dur}} · answer in the input box below. |
| ring.cap.permission | {{agent}} 等你授权 {{permission}} · 在下方输入框回答。 | {{agent}} is waiting for your approval of {{permission}} · answer below the input box. |
| ring.cap.next | 第 {{m}} 次请求完成，带上 {{n}} 个结果发第 {{next}} 次请求。 | Request {{m}} done; sending request {{next}} with {{n}} results. |
| ring.cap.end | 第 {{n}} 轮结束 · {{agent}} 待命 · 已空闲 {{dur}}。 | Round {{n}} finished · {{agent}} standing by · idle {{dur}}. |
| ring.cap.end.dismiss | 你忽略了提问，第 {{n}} 轮结束 · {{agent}} 待命 · 已空闲 {{dur}}。 | You dismissed the question; round {{n}} finished · {{agent}} standing by · idle {{dur}}. |
| ring.cap.abort | 第 {{n}} 轮第 {{m}} 次请求已中止（{{name}}）· {{agent}} 待命 · 已空闲 {{dur}}。 | Round {{n}}, request {{m}} stopped ({{name}}) · {{agent}} standing by · idle {{dur}}. |
| ring.bar.round | 第 {{n}} 轮用时 {{dur}} | Round {{n}} took {{dur}} |
| ring.bar.round.wait | （其中等你 {{dur}}） | (incl. {{dur}} waiting for you) |
| ring.bar.idle | 已空闲 {{dur}} | Idle {{dur}} |
| ring.bar.ctx | 上下文 {{tok}}（上次回执） | Context {{tok}} (last receipt) |
| ring.bar.cost | 本轮花费 {{cost}} | Round cost {{cost}} |
| ring.bar.cost.subs | （含子代理） | (incl. subagents) |
| ring.bar.none | — | — |
| ring.bar.log | 日志 | Log |
| ring.legend.think | 思考 | Thinking |
| ring.legend.run | 运行 | Running |
| ring.legend.ok | 完成 | Done |
| ring.legend.err | 失败 / 忽略 | Failed / dismissed |
| ring.legend.attn | 需要你 | Needs you |
| ring.live.run | {{agent}} 运行中 · 第 {{n}} 轮第 {{m}} 次请求 | {{agent}} running · round {{n}}, request {{m}} |
| ring.live.ask | {{agent}} 等你回答 | {{agent}} is waiting for your answer |
| ring.live.permission | {{agent}} 等你授权 | {{agent}} is waiting for your approval |
| ring.live.end | 第 {{n}} 轮结束 · 待命 | Round {{n}} finished · standing by |
| ring.live.abort | 第 {{n}} 轮已中止 · 待命 | Round {{n}} stopped · standing by |

状态栏要给数值单独上色时，沿用 M4 的做法：先用 `\u0001` 作参数翻译，再把结果切开，把数值放进去。不把句子拆成碎片键。

---

## 任务与波次

| 波次 | 任务 | 可并行 |
|---|---|---|
| 0 | 1 i18n、2 契约（含 test-browser 的 JSX 预载） | 1 与 2 并行；2 的类型检查等 1 合入；预载先于 3、9、10 的 test-browser 验收 |
| 1 | 3 模型小改、4 夹具、5 环纯模块、6 子代理纯函数、7 时间轴、8 几何 | 全部并行（写入范围互斥）。5 依赖 6 的 `subStateAt`/`childDoneAt` 和 3 的 `applyBackgroundNotices`，8 依赖 6 的 `childDoneAt`：3、6 先合入，5、8 的验收在其后（签名已在本文固定，可先按签名写） |
| 2 | 9 环视图、10 子代理视图、11 关键帧测试；13、14 开始写 | 并行 |
| 3 | 12 集成（主线程） | 串行 |
| 4 | 13 E2E 运行、14 真实数据查看、15 补丁/构建/安装/验收 | 13、14 并行；15 最后 |

**通用验收写法：**

- vendor 树是共享的，各任务的类型检查只看自己文件：`cd vendor/opencode/packages/app && bun run typecheck 2>&1 | grep -E '<本任务文件名的正则>'` 无输出。
- 完整的零错误类型检查放在 Task 12 的出口。
- 单测命令一律写全：`cd vendor/opencode/packages/app && bun test --conditions=solid --preload ./happydom.ts <测试文件>`（从 worktree 根执行）。

**所有任务都不得触碰：**

- 不属于自己的文件；
- `pages/session.tsx`；
- `apps/` 下的任何文件；
- `patches/`（Task 15 除外）；
- 用户自己的 OpenCode 服务和配置。

**每个委派提示**都按 AGENTS 模板写：目标、唯一写入范围、要读的文件、验收、预算（实现类最多 40 轮或 60 分钟，只读类最多 10 轮）、checkpoint（`docs/evidence/runtime-m5.md` 的本任务小节由主线程代存；子代理把阶段摘要写在报告里）。

---

### Task 1：i18n 键与格式化（Gemini → Grok）

**拥有：** `session-runtime-i18n.ts`、`session-runtime-i18n.test.ts`。

**依赖：** 本文 i18n 表；繁体词表。

**做什么：**

1. 先 `grep -n '"ring\.' session-runtime-i18n.ts`，确认没有冲突。
2. 在 en、zh、zht 三个字典里加入上表全部键，各字典的键集合与占位符必须一致。
3. 给 `runtimeText` 的返回值加上 4 个格式化函数，签名固定：

   ```ts
   dur(ms: number, long?: boolean): string   // D20 sK / sCN; uses ring.fmt.* keys
   clock(at: number): string                 // Intl.DateTimeFormat(intl(), { hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" })
   tok(n: number): string                    // Intl.NumberFormat(intl(), { notation: "compact", maximumFractionDigits: 1 })
   usd(c: number): string                    // "$" + c.toFixed(4)
   ```

4. 加 `phrase(p: Phrase): string`：递归翻译 `Phrase` 参数；`{ms}`/`{at}`/`{tok}`/`{usd}` 分别交给上面 4 个函数。`Phrase` 类型从 `session-runtime-ring-types.ts` 以 `import type` 引入。Task 2 未合入前，可以先在本文件内用等价的局部类型，合入后替换。
5. 测试：
   - 三个字典键与占位符一致（现有测试已覆盖）；
   - `dur` 边界：9_950 ms、10_000、59_999、60_000、3_600_000，长短两种格式；
   - `clock` 输出 `HH:MM:SS`；
   - `phrase` 能翻译嵌套参数；
   - 新键不含 disconnect、断连、斷連。

**验收：**

- `cd vendor/opencode/packages/app && bun test --conditions=solid --preload ./happydom.ts ./src/components/session/session-runtime-i18n.test.ts` 0 fail；
- 类型检查中 `session-runtime-i18n` 无输出；
- 报告写明新增键数，三个字典数目相同。

**不得：** 删除或改动已有键（删除由 Task 12 统一做）；改动已有英文文案。

### Task 2：契约、样稿源入库、test-browser JSX 预载、性能基线（主线程）

**拥有：**

- `session-runtime-ring-types.ts`（照抄本文“契约”一节）；
- `docs/superpowers/specs/runtime-m5-mockup.src.html`：从 `/private/tmp/claude-501/-Users-xiaojiang-Ai-Project-oco/3b0488f0-4c94-4af3-8b69-b347253b3064/scratchpad/m5/frames/final/_src/mockup.src.html` 原样复制，行号必须与本文引用一致；
- `vendor/opencode/packages/app/test-browser/solid-jsx-preload.ts`（新文件，名字里不带 `.test.`）；
- `vendor/opencode/packages/app/package.json` 中 `test:browser` 这一行脚本（不改依赖、不改其他脚本，不改 `bunfig.toml`，不动 lockfile）；
- `docs/evidence/runtime-m5.md`。

**做什么：**

1. 落地契约文件，完成类型检查。
2. 复制样稿源，记录 sha256。
3. **test-browser 的 Solid JSX 编译预载**（事实 11；Task 3、9、10 的 test-browser 验收都依赖它）：
   - `solid-jsx-preload.ts` 首行写 `// oco (patches/opencode/0019): compile Solid TSX for bun test (test-browser only)`，内容与 scratchpad 验证过的探针相同：
     ```ts
     import { plugin } from "bun"
     import { createRequire } from "node:module"
     // @babel/core and babel-preset-solid are dependencies of vite-plugin-solid, not of packages/app
     const req = createRequire(createRequire(import.meta.path).resolve("vite-plugin-solid/package.json"))
     const babel = req("@babel/core")
     const solid = req("babel-preset-solid")
     plugin({
       name: "oco-solid-jsx",
       setup(build) {
         build.onLoad({ filter: /\.tsx$/ }, async (args) => {
           const out = await babel.transformAsync(await Bun.file(args.path).text(), {
             filename: args.path, babelrc: false, configFile: false,
             parserOpts: { plugins: ["jsx", "typescript"] },
             presets: [[solid, { generate: "dom", hydratable: false }]],
           })
           return { contents: out.code, loader: "ts" }   // Bun strips the remaining types
         })
       },
     })
     ```
   - `package.json`：`"test:browser": "bun test --conditions=browser --preload ./happydom.ts --preload ./test-browser/solid-jsx-preload.ts ./test-browser"`（happydom 先载）。单测命令（`--conditions=solid`，`./src`）和 `bunfig.toml` 不变：`src` 下的测试只为纯函数导入 `.tsx`，不挂载组件。
   - 加一个最小冒烟测试 `test-browser/session-runtime-ring-jsx-smoke.test.tsx`（本任务拥有）：用 JSX 写一个带 `createSignal` 和 `<For>` 的小组件，`render` 后断言 `<li>` 个数，点一次按钮后断言属性变化，最后 `dispose`。
   - 退路：若预载在实现者环境里不工作，主线程在证据里记失败输出，把 Task 9、10 的 test-browser 断言（焦点回到 opener、行与面板节点身份、t 移到派发前时面板关闭、你坞选项不是按钮）全部移进 Task 13 的 E2E（`keyboard`、`subagent`、`focus-stable`、`question-route`），并在两处任务里写明“改由 E2E 覆盖”。
4. 记性能基线：
   - 跑 `cd vendor/opencode/packages/app && bun test --conditions=solid --preload ./happydom.ts ./src/components/session/session-runtime-perf.test.ts`，记下 p95；
   - 跑 `bun run test:bench`（`packages/app`）；它依赖 Playwright 浏览器或服务，环境不够时记 BLOCKED 并写明原因。
5. 在证据文件里建“委派记录”表，填入本批全部任务的计划行。

**验收：**

- 契约文件的类型检查无输出（Task 1 合入后）；
- 复制件 `wc -l` 为 1666；
- `cd vendor/opencode/packages/app && bun run test:browser` → 0 fail，通过数 = 48 + 冒烟测试数（证明预载不影响已有的 48 个）；
- 证据文件里有基线数字或 BLOCKED 及原因，以及预载的验证输出摘要。


**不得：** 改 vendor 中上面列出的文件以外的任何文件；改样稿源内容（只复制）；为预载新增依赖或改 lockfile。
### Task 3：模型小改与子会话同步（Gemini → Grok）

**拥有：** `session-runtime-model.ts`、`session-runtime-model.test.ts`、`session-runtime-model-bg.test.ts`、`session-runtime-child-sync.ts`、`test-browser/session-runtime-child-sync.test.ts`。

**做什么（只加导出，不改现有行为）：**

1. 把 `realUser` 导出为 `export function isRealUserMessage(messageID: string, parts: RuntimeInput["parts"]): boolean`，函数体不变，原调用点改用新名。
2. 导出 `backgroundIdOf(part: ToolPart): string | undefined`。
3. 新增 `export function retrievalOf(part: ToolPart): { taskId: string; retrieved: boolean } | undefined`：把 `linkBackground` 里“这一次 background_output / cancel 算不算取回”的判断（“Task Result”或 completed 的 full_session 输出）抽成函数，`linkBackground` 改为调用它。
4. 给 `createChildSync` 的 deps 加一个可选的 `replayTargets?: Accessor<readonly string[]>`。其中的会话 id 都会请求同步：每个 id 只同步一次，并遵守 `limit`。失败的进入 `failed`，可以重试。不 pin。
5. 把 `backgroundNoticesOf` 循环体里“处理一条用户消息”的部分抽成导出函数，`backgroundNoticesOf` 改为对每条消息调用它（行为不变）：

   ```ts
   export type BackgroundNoticeChange = { id: string; notice?: BackgroundNotice }   // notice undefined: cleared by a RETRY status
   export function applyBackgroundNotices(state: Map<string, BackgroundNotice>, message: Message, parts: RuntimeInput["parts"]): BackgroundNoticeChange[]
   ```

   它就地更新 `state`（set 或 delete），返回这条消息造成的变化（值真正变了的才算）。非用户消息返回 `[]`。Task 5 用它对整段会话做一遍扫描（事实 14）。
6. 测试：
   - model：`isRealUserMessage` 3 例（内部标记、纯合成、普通消息）；`retrievalOf` 4 例；现有 bg 测试全过（证明 `linkBackground`、`backgroundNoticesOf` 行为不变）。
   - `applyBackgroundNotices`：单条、汇总、RETRY 清除各 1 例；另在现有 `backgroundNoticesOf` 的每个测试场景上，逐条折叠的 `state` 与“对同一前缀调用 `backgroundNoticesOf`”的结果逐步相等。
   - test-browser：`replayTargets` 变化时只为新 id 请求同步，失败可重试。

**验收：**

- `cd vendor/opencode/packages/app && bun test --conditions=solid --preload ./happydom.ts ./src/components/session/session-runtime-model.test.ts ./src/components/session/session-runtime-model-bg.test.ts` 0 fail；
- `bun run test:browser` 0 fail；
- 类型检查中 `session-runtime-(model|child-sync)` 无输出。

**不得：** 改 `snapshotAt`（非目标）；改 `buildRuntime` 的输出。

### Task 4：真实数据夹具与样稿判定结果（Gemini；主线程复核脱敏）

**拥有：**

- `src/components/session/fixtures/runtime-m5-session.json`
- `src/components/session/fixtures/runtime-m5-oracle.json`
- `src/components/session/session-runtime-ring.fixture.ts`
- `src/components/session/session-runtime-ring-fixture.test.ts`
- `scripts/runtime-m5-oracle.mjs`

**输入（只读）：** scratchpad 中的 `m5/timeline.json`、`m5/keyframes.json`；`docs/superpowers/specs/runtime-m5-mockup.src.html`（Task 2 复制）。

**做什么：**

1. **精简与脱敏**，输出 `runtime-m5-session.json`：
   - 保留结构和全部时刻。
   - `output_head` 截到 ≤ 300 字；`text` 和 reasoning 截到 ≤ 600 字（同时把 `output_chars` 改为截断后的长度，保证判定结果自洽）。
   - todo 内容、提问的 header/question/options、task 的 description/subagent_type 保留原文；task 的 prompt 截到 ≤ 400 字。
   - 把 `keyframes.json` 并入，键名为 `keyframes`。
   - 目标大小 ≤ 80 KB。
   - 用 `grep -nE '/Users/|xiaojiang|@[a-z0-9.-]+\.(com|net|org)|sk-[A-Za-z0-9]{8}|ghp_|AKIA|gcp-' runtime-m5-session.json` 检查，结果须为空。
2. **适配器** `session-runtime-ring.fixture.ts`。夹具**不用 import 读入**：`packages/app/tsconfig.json` 是 composite，`include` 只有 `["src", "package.json"]`，在 `src` 里 import `.json` 会让 `bun run typecheck` 报 TS6307（事实 12）。改为运行时读取：`JSON.parse(readFileSync(new URL("./fixtures/runtime-m5-session.json", import.meta.url), "utf8"))`（`node:fs`；`@types/node` 已在 devDependencies），读入后用本文件内的宽松类型做一次顶层键检查。判定结果用同样方式读：导出 `loadM5Oracle()`。这个文件只被测试导入，不进 vite 产物。导出 `loadM5Fixture(): { input: RingIndexInput; keyframes: { id: string; t: number; expect: string }[] }`：
   - id 按 `idTime` 规则合成：`${prefix}_${((ms * 0x1000 + seq) % 2 ** 48).toString(16).padStart(12, "0")}${suffix}`。tool、step-start、step-finish 的 created 编码进 id。
   - assistant 消息：`time {created, completed}`、`providerID/modelID`（从 `"provider/model"` 拆开）、`mode/agent`、`cost`、`tokens`、`error`、`parentID`（最近的用户消息）。
   - text 的 `time` = `{start: created, end: min(updated, 下个 part created, completed)}`。
   - tool：`state {status, input, output: output_head, error, time {start, end}, metadata {sessionId}}`。
   - 子会话放进 `input.child`；子会话 assistant 消息带上 `finish`（夹具没有时，用该消息最后一个 step-finish 的 reason；都没有时，最后一条写 `stop`、其余写 `tool-calls`，并在报告里列出这样补的条数）。
3. **判定结果**：`scripts/runtime-m5-oracle.mjs <fixture> <out>`：
   - 用 Playwright 打开样稿源：把精简后的夹具注入 `/*__TIMELINE__*/`，`__SHOT_DATA_URI__` 换成空串。
   - 对每个关键帧在页面里求值：`stageAt(t).st`、`payload(t, S, F).k`（卡片标题）、轮次 `S.r.n`、`S.q?.m`、`planAt(t)`、`F.own.map(x => [x.tool, toolSt(x, t), sameSoFar(x, t)])`、`F.subs.map(x => [x.num, subSt(x, t)])`、你坞状态、`statusWord(S)[0]`、`laneOpen(t)`。
   - 写入 `runtime-m5-oracle.json`。卡片标题按 i18n 表映射成 `RingCardKind`。
4. **测试** `session-runtime-ring-fixture.test.ts`：
   - 4 个轮次的开始时刻等于 `round_starts`；
   - 8 个子会话；
   - 14 个关键帧；
   - 所有合成 id 经 `idTime` 解码后与原时刻一致；
   - 夹具里没有上面 grep 的敏感模式。

**验收：**

- `cd vendor/opencode/packages/app && bun test --conditions=solid --preload ./happydom.ts ./src/components/session/session-runtime-ring-fixture.test.ts` 0 fail；
- `node scripts/runtime-m5-oracle.mjs …` 生成 14 条；
- `cd vendor/opencode/packages/app && bun run typecheck 2>&1 | grep -E 'runtime-m5|ring\.fixture|TS6307'` 无输出；`grep -rn 'runtime-m5-[a-z]*\.json' src --include='*.ts' --include='*.tsx'` 只命中适配器里两处 `new URL(`（没有任何 import）；
- 主线程抽查脱敏：通读 `git diff --stat` 和夹具中随机 5 条消息。

**不得：** 改 scratchpad 原件；把未精简的 135 KB 原件放进 vendor。

### Task 5：环的纯模块（Gemini → `grok-build:grok-delegate`）

**拥有：** `session-runtime-ring.ts`、`session-runtime-ring.test.ts`、`session-runtime-ring-perf.test.ts`、`session-runtime-ring-perf.fixture.ts`（导出 `bigSession(opts)`，生成第 16 条的规模 A、B 合成会话；Task 11 的每帧预算测试导入它）。

**依赖：**

- 契约（Task 2）；
- i18n 键（Task 1）；
- `subStateAt`、`probeStageOfSub`、`childDoneAt`、`subDetailAt`（Task 6；`subDetailAt` 只在第 13 条测试里用）；
- `isRealUserMessage`、`backgroundIdOf`、`retrievalOf`、`applyBackgroundNotices`、`runtimeSubagentOf`（Task 3 / 现有）；
- `LOOP_CONTINUE`、`RING.REBUILD_MS`（契约）；
- `idTime`（trajectory model）。

**导出（签名固定）：**

```ts
// prev: the previous index of the same session; reuse RingChild for sessions not in input.dirty (D11).
// Without prev (or without input.dirty) everything is rebuilt. The result must equal a full rebuild.
export function buildRingIndex(input: RingIndexInput, prev?: RingIndex): RingIndex
export function roundAt(index: RingIndex, t: number): RingRound | undefined
export function stageAt(index: RingIndex, t: number, live?: RingLiveInput): RingStage
export function laneOpen(index: RingIndex, t: number, reduced: boolean): number
export function planAt(index: RingIndex, t: number): { tool: RingTool; done: number; inProgress: number; total: number } | undefined
export function frameAt(index: RingIndex, t: number, opts: { live?: RingLiveInput; reduced: boolean; wide: boolean }): RingFrame
export function trackInputOf(index: RingIndex, t1: number): TrackInput
export function liveTime(wall: number, lastAt: number | undefined, skew: number): { t: number; skew: number }
export function truncateAt(input: RingIndexInput, t: number): RingIndexInput   // tests only: data as it existed at t
```

**规则：** 见“判定规则”和 D1–D5、D11、D15–D19。

`truncateAt` 的行为：

- 删掉 created > t 的消息和 part；
- end > t 的工具回退为 running（不带 output 和 error）；start > t 的工具回退为 pending（input 为 `{}`）；
- 文字和 reasoning：按 D2 在 t 时尚未结束的 part，去掉 `time.end`，`text` 置为 `""`（t 时只知道“有一段在生成”，不知道内容）；已结束的原样保留。这样第 13 条测试比较的是真实的“t 时数据”，而不是同一条显现规则算两遍；
- completed > t 的消息去掉 completed、error、finish、tokens、cost；
- step-finish 的 at > t 时删掉；
- 后台通知：created > t 的用户消息已删，自然不出现；`background_output` 取回调用按工具规则回退；
- **子会话也截断**：返回的 `child(sessionID)` 包一层，对子会话的消息和 part 按以上同样规则截到 t；
- `dirty` 去掉（截断后的输入总是完整重建）。

**测试（每条一例）：**

1. `stageAt` 覆盖 pre/say/asm/fly/think/out/call/wait/ask/next/end/abort，各用一个最小合成会话。
   - 1a. 循环结束谓词：finish reason 为 `length`、`content-filter`、`other` 时，`finish.at` 之后 stage 为 `end`，`why: "finish"`，`reason` 为原文，卡片 meta 含 `ring.card.end.reason`；`stop` 时为 `end` 且 meta 不含该项；`tool-calls`、`unknown` 时为 `next`；同一请求以 error 完成时为 `abort`（error 先于谓词判断）。
   - 1b. 实时兜底：q 已完成、reason 为 `unknown`（事件上应走 `next`）且后面没有新请求；不传 `live` 时为 `next`；传 `live = {run: "idle", permissions: []}` 时为 `end`、`why: "idle"`；`run: "working"` 时仍为 `next`；q 有正在运行的工具时不触发。
   - 1c. `changes` 单遍扫描与“在本轮每个 `times` 点上调用 `stageAt`”的结果完全一致（合成会话全部用例 + 夹具 4 轮）。
2. `call` 的 `EMIT_MS` 窗口：最近一次发出后 149 ms 仍是 call，151 ms 变成 wait。
3. 通知消息不开新轮：轮次 N 不增加；本轮按 D5 结束之后，由通知触发的新请求让本轮重新运行。
4. 编号：轮内 M 从 1 开始，跨轮重置。
5. 同一命令：3 个同 key 调用依次得到 [1,3]、[2,3]、[3,3]；t 早于第三个调用时为 [1,2]、[2,2]。
6. 没有 todowrite 时 `counter.plan` 为 undefined；有 todowrite 时为 `{done, inProgress, total}`，cancelled 计入 total。
7. 提问：卡片种类 ask，正文为问题原文；你坞 options 与输入一致；被忽略 → 卡片 dismissed，stage end。
8. 实时权限：`live.permissions` 的 callID 指向正在运行的工具 → stage ask，卡片 permission，你坞 state permission。
9. 被拒绝的授权 → 卡片 rejected，工具台对应行 `rejected=true`。
10. 后台 task：`retrievedAt` 之前不是 done；done 通知之后是 docked；之后一条 RETRY 通知（`cleared`）让它回到 run；`notices` 由一遍扫描得出，和“对每个前缀调用 `backgroundNoticesOf`”的结果一致。
11. `laneOpen`：上一轮有子代理时，本轮开头 k=1，420 ms 后为 0；本轮第一个 task 出现后 420 ms 为 1；减少动画时只取 0/1。
12. 上下文和花费：t 落在请求进行中时，`bar.ctx` 等于上一次回执，`bar.costUsd` 不含这次请求。这条防住 M4 的泄漏。
13. **不泄漏未来（性质测试）：** 对合成会话（含一个分 3 步的子会话、一个后台 task、一段流式文字和一段流式 reasoning）和夹具的每个 `index.times` 点 t（夹具只取前后各 1 ms 的 300 个采样点），令 `A = frameAt(buildRingIndex(input), t)`、`B = frameAt(buildRingIndex(truncateAt(input, t)), t)`（都不传 `live`，即回看规则）：
    - `A` 与 `B` **整个对象**深度相等（包括 `card.body`、`card.full`、`pills`、`caption`、`model`、`tools.rows`、`subs`、`counter`、`you`、`bar`、`k`），没有豁免字段。唯一的预处理：`stage` 里引用 index 的对象（`round`、`request`、`ask`、`dismissed`）换成各自的 id（userMessageID / messageID / part id），因为它们是索引引用，不是画面内容，完整 index 里的这些对象本来就含有 t 之后的请求；
    - 对每个 created ≤ t 的子代理，`subDetailAt(sub, t, {narrow: false})` 在两份 index 上深度相等（含 `acts`、`stateLine`、`second`、`result`）；
    - 夹具里另有一条定点断言：取某子会话第 1 步完成（reason `tool-calls`）到最后一步开始之间的 t，该格子为 `run`，不是 `docked`。
    - 这条测试有效的前提是 `truncateAt` 按上面的规则去掉了 t 之后才知道的东西（包括子会话、文字内容和 finish）；若改用样稿的显现规则（开放问题 10），按 D2 列出的豁免字段处理，并在测试名里写明“近似”。
14. `liveTime`：服务器时钟比本机快 3 s 时，新事件立刻可见，并且 t 单调。
15. 增量重建：对同一输入，`buildRingIndex({...input, dirty: new Set([childID])}, prev)` 与不带 `prev` 的完整重建深度相等；不在 `dirty` 里的子会话的 `RingChild` 与 `prev` 中是同一个对象（`toBe`）。
16. 性能（`ring-perf.test.ts`，每项 50 次取 p95，数字写进报告）：
    - A：200 个请求 × 3 个工具，含 1 个 task，另有 100 个 reasoning 增量（原有规模）：完整重建 p95 ≤ 5 ms，`frameAt` p95 ≤ 1 ms；
    - B：**单轮 1500 个请求**（每个 2 个工具），8 个已加载子会话（各 20 条 assistant 消息、每条 2 个工具），100 条后台通知用户消息：完整重建 p95 ≤ 16 ms，`dirty` 只含 1 个子会话的增量重建 p95 ≤ 4 ms，`frameAt` 在 300 个采样点上 p95 ≤ 1 ms；
    - B 的完整重建超预算时，按 D11 加“已完成请求按 messageID 复用”，再测一次并报告两组数字。

**验收：**

- `cd vendor/opencode/packages/app && bun test --conditions=solid --preload ./happydom.ts ./src/components/session/session-runtime-ring.test.ts ./src/components/session/session-runtime-ring-perf.test.ts` 0 fail；
- 类型检查中 `session-runtime-ring\.ts` 无输出；
- 报告列出每条测试名。

**不得：** 引入 Solid；读 DOM；在本文件里写 i18n 文案（只返回键）。

### Task 6：子代理状态、详情与列表纯函数（Gemini → Grok）

**拥有：** `session-runtime-ring-sub.ts`、`session-runtime-ring-sub.test.ts`。

**依赖：** 契约；i18n 键；“子代理详情面板与收起条”一节。

**导出：**

```ts
export function childDoneAt(sub: RingSub, t: number): number | undefined         // D16; only data at or before t
export function subStateAt(sub: RingSub, t: number): SubState | undefined      // D16; undefined when created > t
export function probeStageOfSub(state: SubState): "queued" | "running" | "docked" | "absorbed"
export function subDetailAt(sub: RingSub, t: number, opts: { narrow: boolean; childLoad?: "loading" | "failed"; live?: boolean }): RingSubDetail | undefined
export function subListAt(subs: readonly RingSub[], t: number, currentRound?: number): RingSubList
```

`childDoneAt` 的谓词与 D5 的 `loopEnded` 相同，用契约里的 `LOOP_CONTINUE`。

**测试：**

1. 同步和后台 task 的状态表逐格测。
   - 1a. `childDoneAt`：子会话 3 条 assistant 消息，前两条 finish 为 `tool-calls`、第三条为 `stop`。在第 1、2 条完成后、第 3 条完成前的任意 t 为 undefined（格子 `run`）；第 3 条完成后为它的 completed（格子 `docked`，直到 task end）。第三条改为 `length` 时同样算做完；改为以 error 完成时也算做完；只有 1 条且 finish 为 `unknown` 时一直为 undefined；`finish` 缺失时视为未做完。
   - 1b. 后台通知：done → `docked`；随后一条 `cleared` → 回到 `run`；error → `err`。
2. 时间门：t < start 时没有名字、type、交接文字，“打开子会话”不可用；t ≥ start 后都出现。
3. 动态：pend/run/ok/err 的第二行；截取最后 6 条（窄屏 4 条）并给出“前面还有 N 条”；思考行只在 reasoning 跨过 t 时出现；文字行按 D2：回看中未结束时 `text` 为空且给出 `ring.sub.act.streaming`，结束后为原文并保留 `**` 和反引号；`live: true` 时显示已到达文字并 `streaming: true`。
4. 结果的四种情况。
5. 第二行的模型、请求数、花费只计 ≤ t 的部分。
6. 列表：按轮分组、本轮标记，只含 created ≤ t 的项；用夹具中第 3 轮开头的时刻验证，只出现第 1–2 轮的项。
7. `childLoad` 为 loading 或 failed 时，`acts.loading` 有值。

**验收：** `cd vendor/opencode/packages/app && bun test --conditions=solid --preload ./happydom.ts ./src/components/session/session-runtime-ring-sub.test.ts` 0 fail；类型检查中 `ring-sub\.ts` 无输出。


**不得：** 改 `session-runtime-ring.ts`（Task 5 只导入本文件）；在本文件里算几何或面板位置（归 Task 8）。
### Task 7：时间轴折叠与播放（Gemini → Grok）

**拥有：** `session-runtime-ring-track.ts`、`session-runtime-ring-track.test.ts`、`session-runtime-ring-track-view.tsx`、`session-runtime-playback.ts`、`session-runtime-playback.test.ts`。

**导出：**

```ts
export function foldsOf(input: TrackInput): Fold[]
export function trackMap(input: TrackInput): TrackMap
export function foldVisible(f: Fold, t: number): boolean
export function trackLabelsAt(map: TrackMap, input: TrackInput, t: number, width: number, measure: (p: Phrase) => number): TrackLabel[]
export function navStep(nav: readonly number[], t: number, dir: -1 | 1, t0: number, t1: number): number
// playback.ts: PLAYBACK_SPEEDS = [1, 2, 4, 0.5]; nextSpeed unchanged in shape
```

**视图组件** `RingTrack` 的 props：

```ts
{ map: Accessor<TrackMap>; input: Accessor<TrackInput>; t: Accessor<number>; mode: Accessor<"live" | "replay">
  text: RuntimeText; onSeek(t: number): void }
```

- 渲染 `[data-oco-runtime-replay]`：轨道、已播放的填充、刻度（隐藏 t 之后的）、≈ 记号（`data-oco-runtime-fold`）、标签。
- 原生 range 透明叠在上面：`input` 事件 → `onSeek(map.tOf(v))`。
- `aria-label`、`aria-valuetext` 按 D6。
- 写 `data-oco-runtime-replay-t`。

**测试：**

1. `vOf(tOf(v))` 往返误差 ≤ 1 ms，取 1000 个随机点。
2. 夹具的折叠：第 2 轮之后的空闲有一段 idle fold；k08 的提问等待超过 10 s 时有一段 wait fold。
3. 实时开口折叠的 b 随 t1 增长。
4. `foldVisible` 在 from + 9999 时为 false，在 from + 10000 时为 true。
5. j04（19:30）的标签写已过去时长（约 2 小时 6 分），不写整段长度。
6. t 之后没有刻度。
7. `navStep` 的边界。
8. `nextSpeed` 循环 1→2→4→0.5→1。
9. `playbackKey` 现有测试全过。

**验收：** `cd vendor/opencode/packages/app && bun test --conditions=solid --preload ./happydom.ts ./src/components/session/session-runtime-ring-track.test.ts ./src/components/session/session-runtime-playback.test.ts` 0 fail；类型检查中 `ring-track|playback` 无输出。


**不得：** 改 `session-runtime.tsx`（播放状态机的接线归 Task 12）；改 `playbackKey` 的跳过规则。
### Task 8：几何、连线、包、令牌（Gemini → Grok）

**拥有：** `session-runtime-ring-geo.ts`、`session-runtime-ring-geo.test.ts`。

**依赖：** 契约；Task 6 的 `childDoneAt`（签名已固定，可先写；验收在 Task 6 合入后）。子代理包的出发与放行按“几何”一节的表。

**导出：**

```ts
export function textW(s: string, px: number): number
export function poly(pts: Pt[]): Poly
export function stageSize(w: number, h: number): { W: number; H: number; wide: boolean }
export function geoOf(W: number, H: number, k: number, pillLabels: Record<PillId, string>, nextLabel: string): RingGeo  // geoWide/geoNarrow + finishGeo
export function tokenAt(g: RingGeo, round: RingRound | undefined, t: number, reduced: boolean): { pos: number; tgt: number } | undefined
export function wiresAt(g: RingGeo, frame: RingFrame, t: number, reduced: boolean): Wire[]
export function packetsAt(g: RingGeo, index: RingIndex, frame: RingFrame, t: number, reduced: boolean): Packet[]
export function arcPath(g: RingGeo, a1: number, a2: number, r: number): string
export function placeLabels(g: RingGeo, items: { at: Pt; text: string; tone: Tone }[]): { box: Box; text: string; tone: Tone }[]
```

**测试：**

1. 宽 560、760、979（窄）和 980、1100、1600（宽），高取 470/720/1000：所有框都在 [0, W] 内，框之间不重叠（`obst` 两两检查）；卡片中心等于环心（宽屏，误差 ≤ 0.5 px）。
2. k=0 时收起条高 `STRIP_H`；k=1 时展开；`geoOf` 的输出对相同输入完全确定。
3. **无悬空端点**：把样稿的 `_src/lines.mjs` 规则改成纯函数测试。只用手写的合成 `RingFrame`（覆盖：无工具、1–5 个工具行、收起与展开、正在开合、提问弧、什么都没回来）加 12 个开合时刻，宽度取 1100/560/1600，把检测函数导出为 `freeEnds(g, wires, packets): Pt[]`，`wiresAt` 每条折线的两端都要落在框、站牌、接口、环或另一条线上（容差 2 px）。
4. 回程总线在没有任何返回时不出现；收起短线跨回程总线处有 gap。
5. `tokenAt` 单调不减；减少动画时 pos == tgt。
6. `packetsAt`：运行中的工具包停在行门口；同步子代理的回程包在 `childDoneAt(sub, t)` 到 end 之间停在泊位（子会话分多步时，步与步之间不出发）；减少动画时没有中间位置。
6b. **后台 task 合成用例**（夹具里没有后台 task，判定结果也是样稿逻辑，必须单独测）：created 0、start 100、end 400（派发很快返回）、子会话做完 C = 5000、done 通知 D = 5200、取回调用 end R = 9000。断言：
    - t ∈ (400, 5000)：去程探针仍在（`probe.stage = "running"`），没有回程包；
    - t ∈ (5000 + 走到泊位的时间, 9000)：回程包 `parked = true`、位置在泊位、`probe.stage = "docked"`；
    - 把 R 去掉（还没取回）时，t = 60_000 仍停在泊位；
    - t > 9000 + 剩余路程：到达“等结果”入口后按 `LINGER_MS + FADE_MS` 淡出；
    - 子会话未加载（没有 C）时，出发改为 D；最新通知是 error 时，在通知时刻出发、err 色、不停泊。
7. `placeLabels` 输出互不重叠，也不与 `obst` 重叠。

**验收：** `cd vendor/opencode/packages/app && bun test --conditions=solid --preload ./happydom.ts ./src/components/session/session-runtime-ring-geo.test.ts` 0 fail；类型检查中 `ring-geo` 无输出。


**不得：** 等 Task 5 合入后才验收（本任务只用合成帧和手写的合成 index，关键帧上的连线检查归 Task 11）；在本文件里放文案；在本文件里重写子代理的“做完”判定（只调用 `childDoneAt`）。
### Task 9：环视图（Gemini → `grok-build:grok-delegate`）

**拥有：** `session-runtime-ring-view.tsx`、`test-browser/session-runtime-ring-view.test.tsx`。

**依赖：** 契约，Task 1、5、7（类型）、8，以及 Task 10 的组件签名（见下）。

**导出：**

```ts
export type RingViewProps = {
  index: Accessor<RingIndex>; frame: Accessor<RingFrame>; t: Accessor<number>
  mode: Accessor<"live" | "replay">; reduced: Accessor<boolean>; text: RuntimeText
  childLoad: (sessionID: string) => "ready" | "loading" | "failed"
  onLoadChild: (sessionID: string) => void; onRetryChild: (sessionID: string) => void
  onEnterChild: (sessionID: string) => void
  onGeo?: (g: RingGeo) => void          // integration reads lane-k / layout
}
export function RingView(props: RingViewProps): JSX.Element
```

**做什么：**

1. 舞台元素用 ResizeObserver 取宽高，`stageSize` → `geoOf`。geo 用 memo 缓存，只在 (W, H, k) 变化时重算。
2. 底层 SVG 画环、覆盖弧、站牌（`-pill`、`-pill-lit`）、站下小字、令牌（`.oco-loop-anim`、`-token-pos/-tgt`）、去程/回程总线（`wiresAt`），以及呼吸（D-几何）。
3. 绝对定位的框：你、模型、计数（含计划小标）、卡片、工具台。
4. 上层 SVG 画包（`packetsAt`）、标签（`placeLabels`）、航道线（展开时）。
5. 挂载 `<RingSubView>`（Task 10），把 geo、frame、index、t、packets、mode 和子会话回调传进去。
6. 卡片“全文”覆盖层（`data-oco-runtime-card-panel`）：Esc 或 ✕ 关闭，焦点回到按钮。
7. 文字只来自 `text.phrase()` 或原文；颜色只用 `var(--rt-*)`。
8. 状态用 `createStore`，不堆多个 signal。
9. 工具台行用 `keyed(rows, r => r.id)`。卡片、模型、计数、你坞都是常驻元素，文字原地更新。
10. 卡片正文按容量裁剪（样稿 `fitBody` L1083-1103）：head 从头保留，tail 保留结尾（流式），mid 保留最后一句。`card.body` 为空且 `card.streaming` 为真时（回看中进行中的思考/输出，D2），正文槽显示 `ring.card.streaming`（faint），“全文”按钮 disabled。
11. 你坞选项用 `<ol><li data-oco-runtime-you-option>`。

**test-browser 测试**（Solid + happy-dom，`--conditions=browser`）：

- 依赖 Task 2 的 `test-browser/solid-jsx-preload.ts`：测试文件和被测组件都按 Solid JSX 编译。用 `render(() => <RingView {...props} />, el)` 挂载，每个测试结束 `dispose()` 并移除容器。t 用测试里的 signal 驱动，`frame` 由 `frameAt` 现算。若 Task 2 记录了预载失败，按 Task 2 的退路把下列断言移进 Task 13，并在本任务报告里写明“改由 E2E 覆盖”。
- 用夹具在 k03、k05、k08 三个时刻挂载 RingView。
- 断言：`-card-kind` 与判定结果一致；`-tool-row` 个数与判定结果一致；你坞在 k08 时有 ≥ 2 个 `-you-option`，且不是按钮。
- 从 k03 推进到 k04 时，同 id 的 `-tool-row` 节点是同一个对象（节点身份不变）。
- 打开全文后按 Esc，`document.activeElement` 回到 `-card-expand`。
- 整棵树里没有任何禁用名属性。

**验收：**

- `cd vendor/opencode/packages/app && bun run test:browser` 0 fail，报告写出 `session-runtime-ring-view.test.tsx` 的通过数（必须 > 0，证明它确实挂载运行过）；
- 类型检查中 `ring-view` 无输出；
- `grep -nE '#[0-9a-fA-F]{6}' src/components/session/session-runtime-ring-view.tsx` 无输出；
- 评审项（不是 grep 门槛）：可见文字、`aria-*`、`title` 都来自 `text.phrase()` / `text.t()` 或数据原文，没有硬编码英文。


**不得：** 在根 style 里加 token（归 Task 12）；改 `session-runtime.tsx`；在视图里重算 t 时刻的事实（只读 `frame`）。
### Task 10：子代理坞与详情面板视图（Gemini → Grok）

**拥有：** `session-runtime-ring-sub-view.tsx`、`test-browser/session-runtime-ring-sub-view.test.tsx`。

**导出：**

```ts
export type RingSubViewProps = {
  geo: Accessor<RingGeo>; frame: Accessor<RingFrame>; index: Accessor<RingIndex>; t: Accessor<number>
  packets: Accessor<Packet[]>; text: RuntimeText; reduced: Accessor<boolean>
  mode: Accessor<"live" | "replay">   // passed to subDetailAt as opts.live (D2)
  childLoad: (sessionID: string) => "ready" | "loading" | "failed"
  onLoadChild: (sessionID: string) => void; onRetryChild: (sessionID: string) => void
  onEnterChild: (sessionID: string) => void
}
export function RingSubView(props: RingSubViewProps): JSX.Element
```

**做什么：** 按“子代理详情面板与收起条”一节实现：

- 子代理坞：收起条与展开头部用 k 交叉淡入淡出；格子最多 6 个（D19），按 uid keyed；
- 探针点击层：每帧定位，按 uid keyed，带 `-probe` 系列属性；
- 详情与列表面板（`-sub-panel`），按 `subDetailAt`/`subListAt` 每帧原地更新；
- 打开面板时调用 `onLoadChild`；“打开子会话 ↗”（`-handoff-open`）调用 `onEnterChild`；
- 重试按钮 `-child-retry`；
- 选择状态用 `createStore {sel?: {uid, from: "cell" | "probe" | "list" | "strip"}, list: boolean}`，焦点还给 opener。

**test-browser 测试**（挂载方式与退路同 Task 9）：

1. 在 k03 点格子打开详情：焦点到 ✕；按 Esc 关闭，焦点回到格子。
2. 在 k04 用 Enter 打开 #5，再把 t 设到 j03：面板自动关闭（未来不泄漏）。
3. 在 k10 打开列表，再设到 j03：列表只剩 Demo explore。
4. 播放推进 3 次 t：面板节点、滚动位置、焦点都不变。
5. 收起条只在 N>0 时有 `role=button` 和 `aria-expanded`。
6. 被选中的探针点击层有 `-probe-selected=true`。

**验收：** `cd vendor/opencode/packages/app && bun run test:browser` 0 fail，报告写出 `session-runtime-ring-sub-view.test.tsx` 的通过数（必须 > 0）；类型检查中 `ring-sub-view` 无输出；十六进制颜色的 grep 与硬编码英文评审项同 Task 9。


**不得：** 在根 style 里加 token；改 `session-runtime-ring-view.tsx`（挂载点归 Task 9）；在面板里放任何回复、停止、取消控件。
### Task 11：关键帧验收测试（Gemini → Grok）

**拥有：** `session-runtime-ring-keyframes.test.ts`、`session-runtime-ring-frame-perf.test.ts`。

**依赖：** Task 4、5、6、8 已合入。

**测试：** 对夹具中的 14 个关键帧，用 `frameAt(buildRingIndex(input), t)` 与 `runtime-m5-oracle.json`（经 `loadM5Oracle()` 读取）逐项比较：stage、卡片种类、N、M、plan、工具行（名字、状态、same）、子代理（num、状态）、你坞状态、状态词键、k（误差 ≤ 0.01）。

**与样稿逻辑的已知差异**（判定结果是样稿算的，本计划在两处有意不同）：

- 子代理状态：样稿用整段历史的 childDone，本计划用 `childDoneAt(sub, t)`（D16）。比较时以 `subStateAt` 为准；与判定结果不同的格子必须是“判定结果为 docked、本实现为 run，且 t 落在该子会话两步之间”（测试里逐个断言这一条件），其余格子必须一致。
- 轮结束：样稿只认 `stop`。夹具里若有其他 reason，以 D5 为准，同样逐个断言差异出自这一条。
- 两类差异都列进测试输出和证据文件。

**每帧预算**（`session-runtime-ring-frame-perf.test.ts`）：用 Task 5 `session-runtime-ring-perf.fixture.ts` 的 `bigSession` 规模 B 和夹具，在 300 个采样 t 上测 `frameAt + geoOf + tokenAt + wiresAt + packetsAt + placeLabels` 的合计耗时（宽 1100 和 560 各一次），p95 ≤ 4 ms。数字写进报告，由主线程记入证据文件。

此外断言关键帧的文字要点：

- j01：卡片为 plan，plan 为 0/4；j02：4/4。
- j03：Demo explore 为 run，google_search 为 run，webfetch 和 bash 为 ok。
- j04：stage 为 end，idle 约 2 小时 6 分（±1 分），折叠可见。
- k02：2 个 bash；k03：6 个子代理和 5 个自有工具；k05：read 为 err 且 error 含 “File not found”；k06：write 和 3 个 bash。
- k07：think；k08：ask，问题文字非空；k09：dismissed；k10：end，idle 约 30 分。

在宽 1100、560、1600 下，用夹具帧调用 Task 8 导出的 `freeEnds`，结果为空。

**验收：** `cd vendor/opencode/packages/app && bun test --conditions=solid --preload ./happydom.ts ./src/components/session/session-runtime-ring-keyframes.test.ts ./src/components/session/session-runtime-ring-frame-perf.test.ts` 0 fail。若与判定结果出现上面两类之外的不一致：先由主线程判断是实现错还是样稿与本文裁定冲突（例如 D5 的通知规则），记入证据，不能为了通过测试改判定结果。


**不得：** 为了通过测试改夹具、判定结果或被测模块（发现问题时报给主线程）。
### Task 12：集成（主线程）

**拥有：**

- `session-runtime.tsx`；
- 删除 `session-runtime-mechanism-view.tsx`、`session-runtime-loop-view.tsx`、`session-runtime-child.tsx`；
- `session-runtime-loop.test.ts` 中引用 loop-view 的 describe（L809 起的 `loopGeometry`/`routeOf`/`tripOf`）；
- Task 1 合入后的 `session-runtime-i18n.ts`（只做删除废键）；
- 再无引用的 `session-runtime-mechanism.ts` 及其测试（以 grep 为准）。

**做什么：**

1. **数据：**
   - `index = buildRingIndex({ ...input, dirty }, prev)`，按当前会话建（进入子会话时用子会话 id）。按 D11：实时重建最多每 `RING.REBUILD_MS` 一次，变化停止后补建最后一次；`dirty` 由已有的 `sdk().event.listen` + `eventSessionID` 收集，子会话同步完成时也记入；建完清空。
   - 帧：每个 rAF 算 `frameAt(index, t, …)`，写进一个 `createStore`，用 `reconcile`（行按 id）更新，视图只读具体字段。
   - `live()` 保留，用于提醒、运行状态、日志、后台关联，以及“最后事件”（`freshness().lastEventAt`）和状态依据（`run.evidence`）。
   - `RingLiveInput` 来自 `collectTreeRequests` 和 `runOf`（`run` 即 D5 实时兜底用的会话状态）。
2. **时钟：** 按 D11 实现视觉 t。回看用 `trackMap` 的 v 播放，速度 `PLAYBACK_SPEEDS`。现有 `pause`/`goLive`/`enterReplayAt`/`stepTo` 改为以 t 为单位；`playbackButton` 的固定按钮模式不变；←/→ 用 `navStep`。
3. **布局：** 根的 frame grid 改为 顶栏 / 舞台 / 说明行 / 状态栏。
   - 顶栏：状态词（带 `-state-evidence` 和 inferred 提示）、`-pending`、实时时的“最后事件” `-last`、实时/回看、播放控制、`<RingTrack>`、时钟、速度；回看时“回到实时”旁显示 `replay.new`（`-replay-new`，N>0 才渲染）；容器宽 < 720 时变两行。
   - 舞台：`<RingView>`，进入子会话时上面加面包屑。
   - 说明行：`ring.cap.now` 加 caption（`-focus`）。
   - 状态栏：`ring.bar.*`、图例 5 项、日志入口。
   - 删除左栏和紧凑日志。
4. **子会话：**
   - `childLoad` 由 `childSync.synced` 和 `failed` 推出；`onLoadChild` 调用 `requestSync`。
   - `replayTargets` = 回看时 t 所在轮所有子代理的 sessionID。
   - `onEnterChild` 和面包屑沿用 `enteredStack`。
5. **根属性和 token：** 加上“数据属性”和颜色 token；挂检查钩子 `__ocoRuntime`；live region 按 D17。
6. **清理：**
   - 删除上面列出的文件和测试段。
   - 用 `grep -rn` 确认没有残留导入。
   - 在三个字典中同时删除不再被引用的旧键（字面量和动态前缀都要查，方法见 MAP view 的 i18n 段），然后跑 i18n 测试。`last.*`、`ago.*`、`replay.new`、`evidence.*`、`header.pending*`、`state.*`、`child.loading`/`sync_failed`/`retry` 继续使用，不得删除。
7. **性能：** 跑 `session-runtime-ring-perf.test.ts`、`session-runtime-ring-frame-perf.test.ts`，以及 Task 2 的基准（同样的命令），记下改前改后。另在实时会话里用 Performance 面板或 `performance.now()` 打点抽查一次：重建频率 ≤ 10 次/秒，单帧脚本耗时 p95 写进证据（只记数字，不回传截图）。

**验收（集成出口）：**

- `bun run typecheck` 0 错误；
- `bun test --conditions=solid --preload ./happydom.ts ./src/components/session` 0 fail；
- `bun run test:browser` 0 fail（含 Task 2 冒烟、Task 3、9、10 的测试；通过数 > 48）；
- `grep -rnE 'data-oco-runtime-(question|reply|stop|roster|stats|attention)' src/components/session` 无输出；
- `grep -rnE 'session-runtime-(mechanism-view|loop-view|child)"' src` 无输出（已删文件无残留导入）。

**不得：** 改 `pages/session.tsx` 的 props（`SessionRuntime` 的组件名和 props 保持不变）。

### Task 13：E2E 重写（写：Gemini → Grok；运行与诊断：Gemini → Grok；主线程只读 results.json）

**拥有：** `tests/e2e/c5-runtime.mjs`；`tests/e2e/lib/mock-llm.mjs`（只追加触发词，不改已有触发词的行为，因为其他套件也用它）。

**mock 追加：**

- `Use the bash tool 3 times in parallel to run: <cmd>`：一次回复里给出 3 个参数完全相同的 bash 调用。
- `Use the read tool on missing file <path>`：read 一个不存在的文件，工具报错。
- 前缀 `THINK-FIRST`：在工具调用前先流出 6 段 reasoning，每段间隔 300 ms。

提问被忽略：先在 dock-prompt 找“忽略/dismiss”控件；没有的话用服务器的 question reject 路由（在 `vendor/opencode/packages/opencode/src/server` 中确认路由名）。两者都没有时记 NOT RUN，并写明原因。

**CHECKS 改动**（`REQUIRED = CHECKS` 保持同步；成组重写，不做局部修补）：

| 处理 | 检查 |
|---|---|
| 保留（断言不变或微调选择器） | toggle-three、theme-dark（`-focus` 现在在说明行）、locale-copy、last-event（`-last` 在顶栏，实时可见，含 Last event/最后事件，面板无 disconnect/断连/斷連/斷線）、back-to-chat、trajectory-still-works、stop、retry、replay-no-actions、width-560、width-wide、width-1600、focus-stable（改用 `-sub-cell`）、focus-on-change |
| 改写 | idle-state（`-state=idle`，文本含 待命/Standing by，`-stage` 为 pre 或 end） |
| 改写 | tool-turn：<br>① 轮询（50 ms）依次看到 你坞 `-you-state=permission`（且卡片 permission）→ 批准 → 卡片 `result` → `-stage=end`；工具台 bash 行为 ok。`result` 卡片在结果到达后保留 `RECENT_MS`（4 s），等待授权期间不会结束，这两步轮询不会错过。<br>② 调用卡片持续只有 created→start+150 ms，轮询会偶发错过，改为确定性检查：从 REST 取该 bash part 的 `state.time.start`，`__ocoRuntime.seek(start + 50)`（落在 `EMIT_MS` 窗口内；回看没有授权覆盖），断言 `facts().stage === "call"` 且 `cardKind === "call"`，然后回到实时 |
| 改写 | perm-approve / reply-in-panel（等待时你坞 `-you-state=permission`、卡片 permission；你坞内没有 `button`） |
| 改写 | perm-reject（卡片 rejected，工具行 err 且有“你已拒绝授权”文字，文字不含“失败/Failed”） |
| 改写 | question-route（卡片 ask 且正文含问题，你坞 `-you-option` ≥ 2 且不是按钮） |
| 改写 | subagent（点格子 → 面板 → `-handoff-open` → `-child` 和 `-crumb` → lifecycle done → 面包屑返回） |
| 改写 | keyboard（Tab 到 `-sub-cell` 或 `-probe`，Enter 打开面板，Esc 关闭且焦点回到原处；`[data-oco-runtime] button button` 为 0；live 文本不含 思考/reasoning/thinking） |
| 改写 | parallel-subagents（运行中 `-sub-state=run` ≥ 3 且 `-probe-stage=running` ≥ 3；结束后断言格子 `-sub-state=done` ≥ 3。探针点击层随包存在，回程包到达后 `LINGER_MS + FADE_MS`（600 ms）就淡出，减少动画时非停泊的包不画，所以结束后不再断言 `-probe-stage=absorbed`；`-probe-stage` 只在运行中或停泊（docked）时断言。期间卡片出现过 return，`RECENT_MS` 内可轮询到） |
| 改写 | fill（后台 task：`-sub-state=docked`；带取回的：done，面板结果含 subagent-ok） |
| 改写 | replay（暂停后 mode=replay；range 可见；`seek(t0)` 后 stage 为 pre 或 say；回到实时） |
| 改写 | playback（播放时 `-replay-t` 增大；速度循环 1×/2×/4×/0.5×；prev/next 改变 t；在根上按 ArrowLeft 让 t 变小） |
| 改写 | log-overlay（入口在状态栏；Esc 关闭后焦点回到入口；点一行进入回看） |
| 改写 | legend（5 项新文字）、summary（轮用时、花费；不再断言子代理运行/阻塞计数，见开放问题 11） |
| 改写 | think-card（原 reasoning：用 `THINK-FIRST` 或 SLOW-REASON，卡片 think 期间矩形不变）、think-expand（打开全文覆盖层，Esc 后焦点回到按钮） |
| 改写 | motion-on（实时运行中，400 ms 内 `-token-pos` 或包的 transform 有变化）、reduced-motion（`-token-pos` == `-token-tgt`；流动虚线没有 dashoffset） |
| 改写 | geometry-stable（在 lane-k 相同时，卡片、环、模型、你坞、工具台的矩形相等） |
| 改名 | usage-known → context-known（第一次回执后 `-context` 含数字；token 入/出改由模型框回执显示，见“保留 / 替换 / 删除”与开放问题 11） |
| 改名 | mechanism → ring（6 个站牌，运行中恰有 1 个 lit；计数行文字匹配 `第 \d+ 轮` 或 `Round \d+`；有模型框） |
| 新增 | plan-chip（todowrite 前没有 `-plan`；`a; b; c` 之后为 `1/3`） |
| 新增 | same-command（3 个相同 bash → `-tool-same` 为 1/3、2/3、3/3） |
| 新增 | tool-fail（缺失文件 → 卡片 failed，工具行 err） |
| 新增 | dismiss（卡片 dismissed，stage end；不可行时记 NOT RUN） |
| 新增 | fold（提问等 11 s 后，`-fold=wait` 可见且含 ≈） |
| 新增 | strip（新会话首轮 `-subs-mode=strip`；派出 task 后 lane-k 变成 1） |
| 新增 | no-leak（暂停后 seek 到某 bash 的 (`state.time.start` + `state.time.end`) / 2，两者取自 REST：该行不是 ok，卡片正文不含该命令的输出） |
| 删除 | width-420（默认退役，见开放问题 2） |

若 Task 2 记录了 test-browser 预载失败：把 Task 9、10 的组件级断言并入上表对应检查——`keyboard`（详情面板 Esc 后焦点回到格子或探针；全文覆盖层 Esc 后回到 `-card-expand`）、`focus-stable`（播放推进时 `-tool-row`、`-sub-panel` 节点身份和面板滚动不变）、`subagent`（打开详情后 `seek` 到该子代理 created 之前，面板自动关闭）、`question-route`（`-you-option` 不是按钮）。

**运行：**

- 测试服务器用隔离端口：`OCO_E2E_MODEL=mock OCO_TEST_PORT=4697 OCO_MOCK_LLM_PORT=4698 bash scripts/test-server.sh`（后台运行），跑完只停自己启动的进程。
- en：`OCO_TEST_URL=http://127.0.0.1:4697 node tests/e2e/c5-runtime.mjs`。zh：同一命令加 `OCO_E2E_LOCALE=zh-cn`。
- 运行前必须已经执行过 `bun run build`（Task 15 第 6 步）。

**验收：** en 和 zh 的 results.json 中 REQUIRED 全部 PASS（dismiss 若为 NOT RUN 需写明原因）；`c4-trajectory` 回归 PASS。报告 ≤ 20 行，含两个 results.json 路径。


**不得：** 改 vendor 源码、`tests/e2e/lib/vscode.mjs`、`server.mjs`、`results.mjs`；改 mock 中已有触发词的行为；碰用户自己在用的 OpenCode 服务（只用本任务启动的隔离端口 4697/4698）。
### Task 14：真实数据查看脚本（Gemini → Grok）

**拥有：** `scripts/look-local.mjs`。

**做什么：**

- 加 `LOOK_TIMES`（逗号分隔的 epoch ms）。默认读夹具中的 14 个关键帧时刻。
- 每个时刻：通过 `[data-oco-runtime]` 的 `__ocoRuntime.seek(t)` 跳转，等 `LOOK_SETTLE`，取 `facts()`，截图，记录根元素的 `scrollWidth ≤ clientWidth`。
- 宽度依次取 `LOOK_W` 列表 1100、560、1600。
- 报告与 `runtime-m5-oracle.json` 做结构化比较：stage、卡片种类、N、M、plan、tools、subs、你坞状态。
- 删除对 range max 和 `-goal` 的读取。
- 脚本只读，绝不发送提示词，不改用户的服务和配置。

**验收：** `node --check scripts/look-local.mjs`；对 mock 会话试跑一次（时刻取该会话自己的事件），没有异常。真实数据运行在 Task 15。


**不得：** 发送任何提示词；改用户 OpenCode 的配置、版本或进程；把截图或 facts 原文回传给主线程（只回摘要）。
### Task 15：补丁、构建、安装与验收（主线程；E2E 运行按 Task 13 委派）

**拥有：** `patches/opencode/0019-oco-runtime-view.patch`、`docs/STATUS.md`、`docs/PROGRESS.md`、`docs/NEXT.md`、`docs/evidence/runtime-m5.md`。按下节顺序执行。


**不得：** 推送、合并 main、部署到其他机器；在用户授权前本地提交；改 vendor 源码（发现问题回到对应任务）。
---

## 验证顺序（全部在本 worktree 执行；结果写入 `docs/evidence/runtime-m5.md`）

1. **类型检查：** `cd vendor/opencode/packages/app && bun run typecheck` → 退出码 0。
2. **单测：**
   - `bun test --conditions=solid --preload ./happydom.ts ./src/components/session` → 0 fail，记录通过数（基线 270，减去删除的，加上新增的）；
   - `bun run test:browser` → 0 fail（基线 48 / 16 个文件，加上 Task 2 冒烟和 Task 3、9、10 新增的）；输出里能看到 `session-runtime-ring-view.test.tsx`、`session-runtime-ring-sub-view.test.tsx` 各自的通过数 > 0（证明 JSX 预载生效、组件确实挂载过）。若 Task 2 按退路放弃了预载，这里写明“组件级断言改由 E2E 覆盖”。
3. **性能：** `session-runtime-ring-perf.test.ts`（规模 A、B 的完整/增量重建与 `frameAt`）和 `session-runtime-ring-frame-perf.test.ts`（每帧合计 ≤ 4 ms）的数字在阈值内并记入证据；`bun run test:bench` 改前改后对比，或沿用 Task 2 的 BLOCKED 原因。
4. **根检查：** 在 worktree 根执行 `bun run verify:brief` → 退出码 0；明细只读 `.oco-reports/latest.md` 的摘要。
5. **补丁 0019 重新生成与干净重放：**
   - `git -C vendor/opencode add -N packages/app/src packages/app/test-browser`（新文件 `test-browser/solid-jsx-preload.ts` 在 test-browser 里，一并收进；`package.json` 是已跟踪文件，改动自动进 diff）
   - `git -C vendor/opencode diff deb241e -- packages/app > patches/opencode/0019-oco-runtime-view.patch`
   - `git apply --stat patches/opencode/0019-oco-runtime-view.patch` 检查都在：`ring*.ts(x)`、`fixtures/runtime-m5-session.json`、`fixtures/runtime-m5-oracle.json`、`session-runtime-ring.fixture.ts`、`session-runtime-ring-perf.fixture.ts`、`test-browser/solid-jsx-preload.ts`、`test-browser/session-runtime-ring-*.test.tsx`、`packages/app/package.json`（只有 `test:browser` 一行变化）；已删除的 3 个视图文件不再出现。
   - `grep -nE '/Users/|xiaojiang|@gmail' patches/opencode/0019-oco-runtime-view.patch` → 无输出；`git diff --check` 无告警。
   - 重放：`git -C vendor/opencode worktree add --detach <scratchpad>/m5-replay 51ef4be`，按顺序对 0001–0019 逐个执行 `git apply --check` 和 `git apply` → 19/19。然后 `diff -r` 比较重放树与开发树的 `packages/app/src`、`packages/app/test-browser` → 无差异，并 `cmp` 两边的 `packages/app/package.json` → 相同。最后 `git -C vendor/opencode worktree remove <scratchpad>/m5-replay`。
6. **构建：** worktree 根 `bun run build` → webview 和 extension 都构建成功。E2E 测的是这个产物。
7. **E2E**（Task 13）：c5-runtime en、zh 全部 REQUIRED PASS；c4-trajectory PASS。主线程只读 results.json。
8. **打包与本机安装**（修改本机 VS Code 扩展，按 M4 先例由主线程执行）：
   - `OCO_SKIP_BUILD=1 bash scripts/package-vsix.sh` → 记录 VSIX 路径和 `EXTENSION_JS_SHA256`；
   - `bash scripts/install-local.sh <vsix>` → 哈希一致；
   - 请用户执行 Developer: Reload Window。
9. **真实数据检查**（Task 14 脚本；只读，不发提示词）：
   - `LOOK_WS=<用户该会话所在的工作区> LOOK_TITLE='删除 opencode 插件' node scripts/look-local.mjs`（`LOOK_TIMES` 默认就是 14 个关键帧）；
   - 期望：14/14 结构化一致，在 1100、560、1600 下都没有横向滚动；
   - 主线程只看 report 摘要，有不一致时只看一张失败截图。
   - 若该会话已不在用户的服务器上，记 BLOCKED，并以 Task 11 的夹具测试为准。
10. **文档：** STATUS 写当前事实（含“`snapshotAt` 泄漏仍在、无界面影响”）；PROGRESS 追加 M5 批次；NEXT 更新队列。没跑的写 NOT RUN，缺环境的写 BLOCKED。
11. **提交：** 用户授权后按文件分批在本分支本地提交；不推送，不合并 main。

---

## 文件归属总表

| 文件 | 任务 |
|---|---|
| `session-runtime-i18n.ts`、`session-runtime-i18n.test.ts` | 1（合入后删除废键时归 12） |
| `session-runtime-ring-types.ts`、`docs/superpowers/specs/runtime-m5-mockup.src.html`、`test-browser/solid-jsx-preload.ts`、`test-browser/session-runtime-ring-jsx-smoke.test.tsx`、`packages/app/package.json`（只限 `test:browser` 一行） | 2 |
| `session-runtime-model.ts`、`session-runtime-model.test.ts`、`session-runtime-model-bg.test.ts`、`session-runtime-child-sync.ts`、`test-browser/session-runtime-child-sync.test.ts` | 3 |
| `fixtures/runtime-m5-session.json`、`fixtures/runtime-m5-oracle.json`、`session-runtime-ring.fixture.ts`、`session-runtime-ring-fixture.test.ts`、`scripts/runtime-m5-oracle.mjs` | 4 |
| `session-runtime-ring.ts`、`session-runtime-ring.test.ts`、`session-runtime-ring-perf.test.ts`、`session-runtime-ring-perf.fixture.ts` | 5 |
| `session-runtime-ring-sub.ts`、`session-runtime-ring-sub.test.ts` | 6 |
| `session-runtime-ring-track.ts`、`session-runtime-ring-track.test.ts`、`session-runtime-ring-track-view.tsx`、`session-runtime-playback.ts`、`session-runtime-playback.test.ts` | 7 |
| `session-runtime-ring-geo.ts`、`session-runtime-ring-geo.test.ts` | 8 |
| `session-runtime-ring-view.tsx`、`test-browser/session-runtime-ring-view.test.tsx` | 9 |
| `session-runtime-ring-sub-view.tsx`、`test-browser/session-runtime-ring-sub-view.test.tsx` | 10 |
| `session-runtime-ring-keyframes.test.ts`、`session-runtime-ring-frame-perf.test.ts` | 11 |
| `session-runtime.tsx`；删除 `session-runtime-mechanism-view.tsx`、`session-runtime-loop-view.tsx`、`session-runtime-child.tsx`；`session-runtime-loop.test.ts`（只删 loop-view 段）；无引用后的 `session-runtime-mechanism.ts` 与测试 | 12 |
| `tests/e2e/c5-runtime.mjs`、`tests/e2e/lib/mock-llm.mjs` | 13 |
| `scripts/look-local.mjs` | 14 |
| `patches/opencode/0019-oco-runtime-view.patch`、`docs/STATUS.md`、`docs/PROGRESS.md`、`docs/NEXT.md`、`docs/evidence/runtime-m5.md` | 15（证据文件从 Task 2 起都由主线程写） |

未列出的 vendor 文件本批都不改，例如 `session-runtime-loop.ts`、`session-runtime-overview.ts`、`session-runtime-reasoning.ts`、`session-runtime-actions.ts`、`session-runtime-keyed.ts`、`session-trajectory*`、`pages/session.tsx`。其中 loop、overview、reasoning 在 M5 后若已无引用，留到下一批再清理，免得本批扩大。

## 评审重点

1. 每个 t 查询是否只读 ≤ t 的字段：性质测试（Task 5 第 13 条）必须覆盖夹具、子会话（`truncateAt` 截断 `child()`）和流式文字，且没有豁免字段；子代理“做完”只用 `childDoneAt(sub, t)`，代码里不得出现对子会话全部消息取 completed 最大值的写法。
   - 轮结束是否用 D5 的循环结束谓词（不只认 `stop`），实时兜底是否只在 `live` 存在时生效。
2. 键盘焦点是否在任何覆盖层关闭后回到 opener；播放推进时节点身份是否不变。
3. 你坞是否没有任何可操作控件；是否出现了禁用的属性名。
4. 宽 560、979、980、1600 是否都没有横向滚动；窄屏的详情面板是否没有盖住工具台和子代理格子。
5. 实时模式的服务器时钟偏差（D11）：远程服务器上新事件不能延迟出现。
6. 补丁 0019 是否收进了全部新文件（新增的 test-browser 文件和 `solid-jsx-preload.ts` 必须 `add -N`），`package.json` 只改了 `test:browser` 一行。
7. 性能：实时重建是否节流在 10 次/秒以内、只重算 `dirty` 的子会话；每帧合计是否在 4 ms 内（证据里有数字）。

## 开放问题（需用户裁定；未裁定前按括号里的默认做）

1. “打开子会话 ↗”是否还要另给一个跳到该子会话对话页的入口（接上 `onOpenSession`）？M4 从未接线。（默认：不加，只做视图内进入。）
2. E2E `width-420`：420 px 在 560–1600 的规格之外。（默认：退役；若要保留，只断言没有横向滚动。）
3. 一轮派出超过 6 个子代理时，第 6 格改为“+N 个”并打开列表（D19），样稿没有这种情形。（默认：按 D19。）
4. 〔已裁定：不用红色，见 D18〕已忽略 / 已拒绝用 err 色调（D18，跟随样稿图例），这改变了 M4 “拒绝不是红色”的约定，`perm-reject` 检查也相应改写。（默认：按 D18。）
5. 样稿修订带来的两处偏差按样稿采用：收起条为 40 px 两行（原为 28 px 一行）；子代理的名字和 @type 要等参数写完（t ≥ start）才显示，所以派发中约 0.3 秒内格子只显示 “#N”。（默认：采用。若必须一行，退路是“本会话共 N 个 ▸”，完整文案放进 aria-label。）
6. 本轮按 D5 结束（任何不在 `tool-calls`/`unknown` 中的 finish reason、error、忽略提问、实时会话空闲）后，后台通知又触发新请求时，视为同一轮重新运行，不开新轮；真实数据夹具里没有这种情形。（默认：按 D5。）
7. 回看时时间轴右端固定在进入回看那一刻；之后新到的事件要回到实时才看得到。（默认：如此。）
8. 本批不修 `snapshotAt` 的 token/cost 泄漏（M5 视图不再读它）。（默认：不修，在 STATUS 里记录。）
9. 主仓库检出里有一个未跟踪的 `patches/opencode/0019-oco-embedded-context-usage.patch`，属于另一条分支的工作；本 worktree 只有一个 0019。两条分支合流时编号会冲突，不在本批处理。
10. **回看里流式文字怎么显示**（D2）。样稿在 [start, end] 内按时间等速显现最终文字的前缀；这要用到 end 和最终文字，模型先慢后快时会显示 t 时还没到达的字，与“t 时刻只用 ≤ t 的事件”冲突。（默认：按 `reasoningAt` 的规则，回看中进行中的文字和思考不显示正文，写“生成中 · 回看在这段结束后显示原文”，字数类短语换成时长；实时照常显示已到达的文字。若用户要样稿效果，作为“已接受的近似”改两处函数，并在性质测试里明确豁免 `card.body`、`card.full`、字数短语和子代理文字行。）
11. **两项 M4 状态栏内容由样稿取代**：状态栏的 token 入/出合计改由模型框回执和“回执”卡片显示（每次请求的入/出），状态栏留“上下文（上次回执）”和“本轮花费”；状态栏的子代理“运行 N / 阻塞 N”改由子代理坞显示（收起条写本会话总数，格子写各自状态，等你处理的格子带 ask 标记）。（默认：按样稿取代，不在状态栏保留；E2E `usage-known` 改为 `context-known`，`summary` 不再断言子代理计数。若要保留，作为状态栏的窄屏可隐藏段加回，沿用 M4 的 `summary.tokens`、`summary.children` 键。）

