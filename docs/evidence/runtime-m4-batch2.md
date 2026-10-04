# 运行视图 M4 第二批验收

设计：[runtime-m4](../design/runtime-m4.md)「第二批实施计划」。分支 `claude/nostalgic-gates-ef74ca`。委派见 [委派记录](delegation-runtime-m4.md)。

## Checkpoint

- 2026-10-04：开工核对。真实数据（本机 opencode.db，只读，61 个含 `backgroundTaskId` 的 part）确认：
  - 后台 `task` 的 `state.metadata` 带 `backgroundTaskId`、`sessionId`、`agent`、`description`、`run_in_background`；按 category 派发时 `input.subagent_type` 缺失，代理名只在 `metadata.agent` 里。
  - `background_output` 的 `input.task_id` 是 `bg_…`，metadata 同样带 `backgroundTaskId`、`sessionId`。
  - 完成/出错通知是新的 user 消息，文本 `<system-reminder>\n[BACKGROUND TASK COMPLETED|ERROR…]\n**ID:** \`bg_…\``，末尾带 `<!-- OMO_INTERNAL_INITIATOR -->`，`synthetic` 未设。所以「本轮」从最后一条不带该标记的 user 消息算起。
- 下一步：模型改动 → `session-runtime-loop.ts` 接口 → 航道视图。
- 2026-10-04 实现进度：模型改动（category 回退、`backgroundTaskId`、`background_output` 取回只认 `Task Result` 开头的输出、通知解析、`roundStart`、回放 rewind 保留后台字段）、`session-runtime-loop.ts`、`session-runtime-loop-view.tsx`（挂在 mechanism-view 第 2 行，交接详情固定 52 px）、HUD 配色、i18n（en/zh/zht）、左栏去掉名册、状态栏计数改从探针算、「需要关注」项点击定位探针。删除 `rosterOf` / `lanesOf` / `reuseLanes` 及其单测。
  - vendor `bun run typecheck` 0 错误；session 单测 261 / 0（含 Gemini 新增 49 条，删除旧 lanes/roster/reuse 用例）。`scripts/build-webview.sh` 通过。
  - data 属性契约（E2E 用）：`data-oco-runtime-loop`（`-core`=dispatching|gathering|waiting|working|idle，`data-paused`）、`data-oco-runtime-probe`=id（`-stage`、`-flag`、`-zone`、`-slot`、`-visible`、`-selected`）、`data-oco-runtime-probe-cluster`=zone、`data-oco-runtime-beam`、`data-oco-runtime-absorbed`=N、`data-oco-runtime-tick`、`data-oco-runtime-loop-earlier`、`data-oco-runtime-core-tools`、`data-oco-runtime-core-ring`、`data-oco-runtime-probe-orbit`、`data-oco-runtime-probe-beacon`、`data-oco-runtime-handoff`=id|none|missing、`data-oco-runtime-handoff-open`=sessionID、`data-oco-runtime-handoff-expand`、`data-oco-runtime-handoff-panel`、`data-oco-runtime-attention-probe`。动画元素都带 `.oco-loop-anim`。
- 下一步：等夹具返回 → look-runtime 目测 → 派发 c5-runtime 断言改写 → 补丁 0019 重新生成与干净重放。
- 2026-10-04 用户中途改版两次（以示意页为准）：
  1. 「航道才是主要视觉点」：主代理框改两行（代理 · 模型 · 请求 N；下一行大号状态句），去掉阶段按钮（阶段只留在 `data-oco-runtime-stage` 属性上）；思考框同高 64 px；左栏 290 → 230 px；顶栏停止按钮改为图标（`aria-label`/`title` = 停止）。
  2. 「之前这种（示意页）不是挺好的吗」：树区不再有外框，航道和交接详情各自成框；交接详情两行（「描述 · 代理 · 阶段 · 同步/后台 … 打开子会话 › 展开全文 ⤢」/「↓ 交给它 #N 提示词 ↑ 返回 #M 大小 · 摘要 … 工具 N · 用时」）；图例改为探针状态（执行 / 待取回·等授权 / 失败 / 已吸收 / 流向）。
  - 航道改用实际像素布局（`loopGeometry(w,h)`，ResizeObserver 测 svg 尺寸）：原来按 800×330 等比缩放，在约 140 px 高的行里字只剩 5 px。
  - 契约更新：核心状态 `data-oco-runtime-core-state` 现在在主代理框的状态句上（值 = loop core）；svg 内不再显示核心状态文字。
  - look-runtime（mock，1100 宽）：running 3 探针 / core waiting；done 全 absorbed；未取回 → docked；取回 → absorbed；诊断无重叠、无溢出；frame 不滚动（permission 一例因输入框变高、根高 581 时滚动）。
- 2026-10-04 用户建议状态栏按含义着色：代理名主代理青（原有）；「阻塞 m」仅在 m > 0 时变红（`data-oco-runtime-summary-blocked`=m），其余数字保持灰色；图例符号用状态色、文字灰色。文案拆成 `summary.children` + `summary.blocked`，整句文本不变。同时修正：只剩泊位任务时状态句写「N 个任务待取回」（`loop.core.docked`），不再是「等待 1 个任务返回」。均待 E2E 结束后重建 webview。
- 2026-10-04 用户要求先装上试用：`scripts/package-vsix.sh` → `oco-0.0.4-79c751d.vsix`（HEAD 79c751d 为他人新提交；包内含本批未提交改动，含状态栏着色与窄宽度隐藏），已用 VS Code 自带 `code --install-extension --force` 装到本机；已核对安装目录 `extension.js` sha256 前缀 `c4530fd9…` 与 webview `app-Bbj8NKdu.js` 与构建一致。gcp-workstation 未部署。此次重建发生在 Gemini E2E 运行期间，E2E 结果可能跨两个构建，需在新构建上复跑。
- 2026-10-04 用户反馈修正（另一会话，同 worktree；委派见「用户反馈修正」表）：
  - 圆环与主代理框、状态栏：`#请求序号`（整个会话第 N 次模型调用）改为「第 N 轮 · 请求 k」。N = 本轮首个请求的 trajectory turn + 1，与会话日志的「第 N 轮」一致；k = 本轮请求数。OMO 通知消息在日志里也占一个轮号，但不开新轮，所以后台等待期间圆环停在本轮号，日志轮号继续增加（待用户决定日志是否不给通知编号）。新属性：`data-oco-runtime-round`、`-round-requests`、`-round-tools`、`data-oco-runtime-main-round`。圆环下方改为「已吸收 x/y」。
  - 沿用探针：live 模式下，上一轮派发、仍在 running/queued 的探针留在航道上，不折进「+N 更早的」。
  - 作业区：`loopGeometry` 只占环的右半部分（单元格 80–120 px），新增 `workCap`（900×237 时为 8），溢出部分并入「+N」。视图按 `workCap` 自行布局，`loop.places` 仍为默认容量。
  - 待执行停留：live 模式下，打开视图后才派发的探针先在派发航道停 0.9 s 再进作业区。reduced-motion 下跳过；打开视图时已在外的探针不停留。data 属性始终跟模型一致。
  - 取回识别：`background_output` 加 `full_session` 时输出以「# Full Session Output」开头，且带「Status: completed」行，现在也算取回（本机库实测 7 例）。用户图二里的 2 个「待取回」就是这个原因。
  - 验证：vendor typecheck 0 错；session 单测 267/0（新增 6 条）；`build-webview.sh` 通过；look-runtime（mock，复用 4627 测试服务器，宽度 1800/1100/800）各状态诊断 issues=[]，宽布局不滚动，看到了派发停留。E2E 未在此构建上运行（NOT RUN），由 M4 第二批会话接手。
- 2026-10-04 E2E 主线程接手（理由：m4b2-e2e 两条订阅路线均失败——Gemini 运行约 2 h 后转 Grok、Grok 402）。c5-runtime en（mock，4627）三次：
  - 第 1、2 次：前 18 项 PASS，停在 keyboard 段等待 docked 探针（`runs/20261004-052744-c5-runtime-70bc` 的 error.png：视图停在回放 16/42）。单独脚本重放同一序列（权限→暂停→回实时→拒绝→后台不取回）：running → docked，模式一直是 live，说明是套件内问题。
  - 改测试：`send()` 改为只 focus 输入框（点击可能落到回放滑块），发送后若处于回放就切回实时并计数（`[INFO] send-left-replay`）。
  - 第 3 次：18 PASS，`tool-turn`、`replay-no-actions` 失败（没出现权限请求 / 回复按钮 0），keyboard 段仍等不到 docked；`send-left-replay: 0`。期间另一会话「运行视图 M4 优化」对同一 4627 服务器跑 look-runtime 并重建 webview，结果不可信。
  - 已请对方改用自己的测试服务器；E2E 暂停，等对方 done 后在固定构建上重跑。状态：NOT RUN（无可信结果）。
- 2026-10-04 用户反馈第二轮（同一会话）：
  - 作业区右边缘贴着框的右边（`w - 14`），圆弧最右端比它短 28 px，圆弧从作业区内部穿过。900×237 时 `workCap` = 10。
  - 探针沿航道移动：`loopGeometry` 新增 `track`（每 6 px 采样一点）和 `arc`（圆弧在 track 上的下标范围）；`routeOf` 只沿航道正向走，进作业区时从最近的航道点落下，出来时经圆弧或回传航道；`tripOf` 在阶段跳级时依次经过作业区，后台任务还经过待取泊位。移动改用 Web Animations API 实现，去掉 `.oco-loop-move` 的 CSS transition。移动途中隐藏标签（`data-oco-runtime-probe-moving`）。尺寸变化、打开视图时已在外的探针、reduced-motion 时直接跳到位，不播动画。停留结束的时序修正：先 arrived 再取消 queued，探针不再闪回圆环。
  - 验证：typecheck 0 错；session 单测 269/0；webview 已重建。轨迹采样在自己的服务器 4647/4648（mock，1100 宽）上做，结束后已停：并行任务依次经过圆环 → 上边线 → 待执行位停留 → 上边线 → 落进格子 → 下边线 → 圆环；后台任务依次经过待执行位 → 上边线 → 作业区 → 下边线（过泊位）→ 圆环。产物在 `.oco-look-fb2/trace.json`、`trace-par.png`。E2E 未在此构建上运行（NOT RUN）。
  - 已知：后台任务的探针键在拿到 `backgroundTaskId` 之前是 session/tool id，拿到后换键，探针会从圆环重新出发一次。
- 2026-10-04 修复探针换键时重新出发：`Probe` 新增 `node`，取首个 task 行的工具 part id。后台派发拿到 `backgroundTaskId` 时 `id` 从 session/tool id 换成 `bg_…`，`node` 不变；视图按 `node` 遍历，元素和位置都保留。`data-oco-runtime-probe` 仍是 `id`。typecheck 0 错；session 单测 270/0（新增 1 条）。webview 未重建，E2E 未运行（NOT RUN），由 M4 第二批会话重建后一并验证。

## 验收（2026-10-04，最终构建）

| 项 | 命令 / 证据 | 结果 |
| --- | --- | --- |
| vendor 类型检查 | `packages/app`: `bun run typecheck` | 0 错误 |
| session 单测 | `bun test --conditions=solid --preload ./happydom.ts ./src/components/session` | 270 / 0 |
| browser 单测（child-sync、keyed） | `bun test --conditions=browser --preload ./happydom.ts ./test-browser/session-runtime-{child-sync,keyed}.test.ts` | 7 / 0 |
| 根离线检查 | `bun run verify:brief` | typecheck PASS，unit 190 / 0 |
| E2E c5-runtime en（mock，每次新起服务器） | `runs/20261004-062128-c5-runtime-71ac` | 37 / 37 |
| E2E c5-runtime zh（mock，每次新起服务器） | `runs/20261004-062334-c5-runtime-8c3a` | 37 / 37 |
| 补丁 0019 | `git -C vendor/opencode diff deb241e -- packages/app`，4 个新文件先 `add -N` | 29 个文件；无本机路径、无行尾空格 |
| 干净重放 | 51ef4be 临时 worktree 上 apply 0001→0019 | 19 / 19；`src`、`test-browser` 与开发树一致；重放树 session 单测 270 / 0、browser 7 / 0；临时 worktree 已删除 |
| 安装 | `scripts/package-vsix.sh` → `oco-0.0.4-79c751d.vsix`，`code --install-extension --force` | 已装本机；安装目录 webview 资源与通过 E2E 的构建同名 |

E2E 期间发现并修复的视图缺陷（主线程）：
- 探针不能用键盘聚焦：SVG `<g>` 上 Solid 的 `tabIndex` 属性没有生效（实际 `tabindex` 为空）。改为 `tabindex` 属性，并补了可见的 focus 轮廓（原 `outline-none`）。这也是前几轮「Enter 落到日志行 → 跳进回放 16/42」的根因。
- 子会话在订阅前就结束时，已加载的消息停在未完成状态，生命周期一直是 unknown（后台任务停不进泊位）。`session-runtime-child-sync.ts`：任务行已结束而子会话仍为 unknown 时，再拉取一次，每个子会话最多一次。

测试侧修正（`tests/e2e/c5-runtime.mjs`）：`send()` 输入后核对文本，不一致就重输一次（曾出现首字被吞：「SLOW-…」变成「LOW-…」）；发送后若处于回放就切回实时（本轮计数 0）。同一服务器上「始终允许」会保留到后续运行，所以每次 E2E 都新起服务器。

未做 / 限制：
- NOT RUN：真实模型（含真实 oh-my-openagent 通知）、Remote（gcp-workstation）、亮色主题、嵌套 ≥2 层子会话。
- 航道行较矮（约 1100 宽）时作业区格子窄，探针标签隐藏，名字只在悬停提示和交接详情里。
- 「本轮」以外但仍在运行的探针，实时模式下留在航道上（另一会话按用户反馈改的，与设计文档「只显示本轮」不同，见上面 checkpoint）。
