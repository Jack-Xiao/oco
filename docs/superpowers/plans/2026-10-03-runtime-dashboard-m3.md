# 运行视图 M3（机制与打磨）实施计划

**Goal:** 在运行视图里补上 spec 第 5 段 M3：默认折叠的机制图（扇出→并行→汇回，仅活跃连线流动）、思考流、嵌套 ≥2 层折叠、减少动画、键盘与读屏、E2E（三种宽度 + 暗色主题）。补丁 0019 继续追加，不新开补丁。

**Spec:** `docs/superpowers/specs/2026-10-02-runtime-dashboard-design.md`（第 2、4、5 段）。前置核查：`docs/evidence/runtime-m3-preflight.md`（Gemini，主线程抽查 3 处与源码一致）。M1/M2 计划的脚手架、验证命令、补丁流程沿用：`docs/superpowers/plans/2026-10-03-runtime-dashboard-m{1,2}.md`。

**工作树：** 本 worktree（分支 `claude/nostalgic-gates-ef74ca`，只留在本分支，不合并 main）。vendor 开发树 `vendor/opencode`，`M3_BASELINE=474534a`（M2 结束）。账本 `.superpowers/sdd/2026-10-03-runtime-dashboard-m3/progress.md`，委派记录 `docs/evidence/delegation-runtime-m3-2026-10-03.md`。每个任务在 vendor 内单独提交。

**路由：** Grok 402 余额不足，实际只有 Gemini（agy，台湾固定出口）。每个任务派发前按 AGENTS 规则 2 检查；Gemini 失败（M2 出现过 400 location）先存失败证据，再检查一次 Grok；两路都不可用时记“两路均不可用”，主线程接手并写入账本。评审沿用 M2：任务评审 general-purpose sonnet，最终评审 opus。

## 本计划前已核实的事实（2026-10-03，主线程）

- mock 已能产出 reasoning：多行回答先发 6 段 `reasoning_content`（`tests/e2e/lib/mock-llm.mjs:128-133`），走 `@ai-sdk/openai-compatible`。这 6 段是一次连发，“显示中”的可见时间很短；是否需要更慢的思考流见 Task 7 第 0 步。
- E2E 不能产生孙会话：`task.ts:111` 默认 `subagent_depth ?? 1`，mock 给子代理的提示词固定为回复 `subagent-ok`，子会话不会再调 task。嵌套 ≥2 层只做单测和组件测试，E2E 预先记为 NOT RUN（不为此改 mock 配置，除非另行决定）。
- `ReasoningPart` 有 `time`（start/end），流式 delta 通过 `message.part.delta` 追加到 store 里的 `part.text`。
- `snapshotAt` 按游标过滤 part（`partStart > cursor` 的丢弃，其余 `rewind`），但文字无法按游标回退：游标落在思考进行中时，part 仍带最终全文。
- `test-browser/` 目前没有挂载运行视图组件的先例（只有 `session-runtime-keyed.test.ts`）；已有的做法是把响应式接线抽成可导出的工厂，用 `createSignal`/`createStore` 假数据驱动（`session-lineage.test.ts`）。`src/` 下的测试用 `--conditions=solid`（服务端构建），memo 不响应，响应式断言只能放 `test-browser/`。
- mock 的 bash 触发句 `Use the bash tool to run: <cmd>`（`mock-llm.mjs:44`），可用 `sleep 3` 制造确定的“工具运行中”窗口；bash 走 ask 权限，先批准再运行。

## 已定裁定（实现以此为准）

1. **先量再改（性能）。** `live()` 每个 part delta 都会对整个会话跑 `buildTrajectory` + `buildRuntime`（预检第 1 条）。Task 1 先用夹具量出数字，再按决策规则改。无论选哪种改法，都要守住：
   - 思考文字由独立的细粒度 accessor 直接读 store 中的 part 渲染，**不进 `RuntimeModel`**。
   - 若对重算做合并，**只合并 part 文字内容变化**（text/reasoning 的 delta）引起的重算。消息增删、part 增删、工具 `state.status` 变化、part `time.end`、`session_status`、权限、提问的变化必须立即触发（M2 的 retry 轮询 ≤200 ms、pending 清除都依赖它们）。
   - 合并必须同时覆盖已展开的子代理面板（`assembleChild` 与根共用 `assemble`），不能让面板失去对子会话 part 的追踪。
   - **测试方式**：响应式接线抽成可导出的工厂（见 Task 1、Task 5），在 `test-browser/` 里用假 store 驱动；不在测试里复制一份逻辑再测。
2. **机制图是纯函数投影** `mechanismOf(model)`，配单测；视图只渲染投影结果。版式固定：主 agent → 工具槽（4 个 + “+N”）与子代理槽（3 个 + “+N”）→ 汇回。槽位数来自校准（并行工具 p90=3、最大 8；并行 task 最大 3）。
3. **切片规则。** 工具槽 = 最后一个请求的非 task 工具；子代理槽 = 最后一个请求的 task 行 **加上** 任何请求中子会话生命周期为 `running | retrying | waiting-user` 的 task 行（后台 task 早已 completed 但子会话仍在运行，spec 规则 2）。同一子会话只占一个槽（取最后一行，与 `lastChildToolIds` 一致）。槽位按 `model.tools` 中的出现顺序排（`start` 可能缺失，不用它排序），超出的计入 “+N”，并写明其中运行中的个数；不按状态重排，避免槽位跳动。
4. **连线活跃规则。**
   - 派发边：工具 `pending | running` 且无 `awaiting`、非 `interrupted`，且 `stage === "tools"`；子代理槽在生命周期 `running | retrying` 时活跃。`awaiting` 显示 “!”、`interrupted` 显示 “◌”，连线静止。
   - 汇回边：只在 `stage === "fill"` 时，最后一个请求的槽位汇回边活跃。**不用“tool.end 后 N 秒”这类时间窗口**（破坏回看一致性，且会闪烁）。
   - 回看：用同一投影，但只静态高亮，不播放流动。
5. **机制图默认折叠**，展开状态是界面状态（不进模型）。折叠时只有切换按钮，不渲染图本体。
6. **思考流。**
   - 实时：显示进行中那条 assistant 消息的 reasoning 尾部（最多约 6 行，换行不裁剪），标“显示中”；并写明“中途接入时开头可能缺失”。part 结束（`time.end` 存在）后改为“思考完成”，折叠成一行，可展开看全文。
   - 回看：不逐字播放。只显示 `time.end ≤ 游标` 的 reasoning（最终文本，折叠成一行，可展开）；游标时仍在进行的 part 只显示“思考中（回看不显示进行中的文字）”，不显示全文（游标不泄漏未来）。
   - 思考区**不放进 aria-live**。
7. **嵌套 ≥2 层。** 子代理面板改为递归组件，带 `depth`；depth ≥2 的面板默认折叠，展开逻辑与第 1 层相同。递归上限 8 层（与 `bridge-policy.ts` 的 8 级上溯一致），超出只给“在对话中打开”；同一会话 id 在祖先链上出现时不再递归（防 `parentOf` 成环导致无限渲染）。
   - 后代发现：从**已加载的**子会话消息里的 task part（`RuntimeTool.child.sessionID`）逐层发现；孙会话要等子会话消息加载后才可见，这是已知时序，不另查 `sync().data.session`。
   - 后代的“当前轮”：该后代的父会话里，引用它的 task 行属于父会话最后一个请求，或其生命周期为 `running | retrying | waiting-user`。
   - 自动同步与 pin 扩展到整棵会话树，仍受“每轮 8 个”上限约束（“轮”仍以根会话的 turn 计）；目标按“离根近者优先、同层按开始顺序”取前 8。
8. **键盘与读屏，不加快捷键**（spec：快捷键不在 v1）。工具行的“行头”改为原生 `<button aria-expanded>`。折叠态保持现有内容（字形、名称、状态、入参摘要、最后输出行，换行不裁剪，不靠 CSS 截断制造差别）；展开区显示**折叠态没有的信息**：开始时间、结束时间与耗时（缺失写“未知”）、`evidence`、错误文本（error 时）、`callID`、子会话 id（task 时）；**button 不嵌套 button**：行头按钮与“展开子代理”“在对话中打开”等操作按钮是兄弟节点。所有按钮有 `focus-visible` 样式（用主题 token 的 ring/outline，不硬编码颜色）。`aria-live="polite"` 只挂在焦点句与运行状态上；待处理项出现时不额外用 `role="alert"`（避免重复播报），由焦点句播报。
9. **减少动画：产品端只认标准 `prefers-reduced-motion`**（Tailwind `motion-reduce:`）。不采纳预检“测试往 DOM 塞 class、产品同时认这个 class”的建议（产品代码里的测试专用分支，M2 Task 1 已驳回同类做法）。减少动画时流动点不播放，连线的活跃状态仍由线型/字形 + 文字表达，事件日志（文字孪生）完整保留。
10. **主题。** E2E 只跑暗色（`"workbench.colorTheme": "Default Dark Modern"`，用户裁定）。样式仍全部用编辑器主题 token，不写死暗色值；亮色主题不验证，记 NOT RUN（用户裁定不做）。
11. **视觉细节只按 spec 第 5 段已确认的范围做**（默认折叠、扇出→并行→汇回、仅活跃连线流动）。第 2 段“动画清晰度原则”中标为“待用户确认”的项（固定角色配色 + 图例、页脚态势摘要）在用户答复前不做，见文末问题。状态字形（✓ ◐ ! ◌ ⊘）M1/M2 已在用，沿用。
12. **E2E 扩展 `c5-runtime`，不新增套件**（`DEFAULT_SUITES` 保持 22）。

## 新增契约（只加不改名、不删除）

```ts
// session-runtime-mechanism.ts（新文件）
export type MechanismSlot = {
  toolID: string                 // RuntimeTool.id，稳定身份
  kind: "tool" | "child"
  label: string                  // 工具名或子代理 agent
  state: RuntimeTool["state"]
  lifecycle?: ChildLifecycle     // 仅 child
  awaiting: boolean
  interrupted: boolean
  dispatch: boolean              // 派发边活跃（裁定 4）
  returning: boolean             // 汇回边活跃（裁定 4）
}
export type Mechanism = {
  stage: Stage
  tools: MechanismSlot[]         // ≤ 4
  toolsOverflow: { total: number; running: number }
  children: MechanismSlot[]      // ≤ 3
  childrenOverflow: { total: number; running: number }
  empty: boolean                 // 无请求
}
export function mechanismOf(model: RuntimeModel): Mechanism

// session-runtime-reasoning.ts（新文件）
export type RuntimeReasoning = { partID: string; messageID: string; text: string; streaming: boolean; start?: number; end?: number }
export function reasoningOf(parts: Part[], inFlight: boolean): RuntimeReasoning[]   // streaming = inFlight && time.end 缺失

// session-runtime-actions.ts（追加）
export type TreeNode = { sessionID: string; parent: string; depth: number; order: number; current: boolean; lifecycle: ChildLifecycle }
export function treeNodes(rootTools: RuntimeTool[], childModel: (sessionID: string) => RuntimeModel | undefined, maxDepth = 8): TreeNode[]
  // 从根的 task 行出发，逐层读已加载子会话模型里的 task 行；current 按裁定 7；祖先链出现过的 id 跳过
export function treeSyncTargets(nodes: TreeNode[], done: ReadonlySet<string>, limit = 8): string[]   // current 且未同步过，depth 升序、order 升序
export function treePinTargets(nodes: TreeNode[], open: ReadonlySet<string>): string[]              // running/retrying/waiting-user 或已展开

// session-runtime-live.ts（新文件，Task 1；仅在走合并路径时）
export function createRuntimeLive(deps: {...}): { live: Accessor<RuntimeModel>; track: (sessionID: string) => void }
  // track(sessionID)：订阅该会话的结构签名（消息/part id、工具 state.status、part time.end）+ 文字合并 tick；根与子面板都调用
```

`RuntimeModel` 本身不新增字段。

## 数据属性（E2E 契约，Task 3–6 产出，Task 7 消费）

| 属性 | 位置 |
|---|---|
| `data-oco-runtime-mechanism=collapsed\|expanded` | 机制图容器 |
| `data-oco-runtime-mechanism-toggle`（`aria-expanded`） | 机制图切换按钮 |
| `data-oco-runtime-node=main\|<toolID>` + `data-oco-runtime-node-kind=main\|tool\|child` | 机制图节点 |
| `data-oco-runtime-overflow=tools\|children` + 文本 “+N” | 溢出计数 |
| `data-oco-runtime-edge=<toolID>` + `data-oco-runtime-edge-dir=dispatch\|return` + `data-oco-runtime-edge-active=true\|false` | 连线 |
| `data-oco-runtime-flow` | 活跃连线上的流动元素（减少动画时计算样式 `animation-name: none`） |
| `data-oco-runtime-reasoning=<partID>` + `data-oco-runtime-reasoning-state=streaming\|done` | 思考区 |
| `data-oco-runtime-child-depth=<n>` | 子代理面板（与已有 `data-oco-runtime-child` 同节点） |
| `data-oco-runtime-tool-toggle=<toolID>`（`aria-expanded`） | 工具行行头按钮 |
| `data-oco-runtime-tool-detail=<toolID>` | 工具行展开内容 |
| `data-oco-runtime-live` | `aria-live="polite"` 区域（焦点句 + 状态） |

M1/M2 的全部属性保持不变。

## Global Constraints（沿用 M1/M2，另加）

- M1/M2 约束继续有效：未知≠0、不显示“断连”、推断标 inferred、回看按步骤且不可操作、三语、不改宿主/桥/公共契约。
- 新文案 en / zh / zht 三语一致，`session-runtime-i18n.test.ts` 键一致性必须通过。
- 验证命令：单测 `cd vendor/opencode/packages/app && bun test --conditions=solid --preload ./happydom.ts ./src/components/session`；组件/响应式测试 `bun run test:browser`；类型 `bun run typecheck`（0 错误）。仓库根 `bun run verify:brief` 不覆盖 vendor。
- 每个任务结束：单测全过、test:browser 全过、类型 0 错误、`git -C vendor/opencode diff --check` 干净，在 vendor 内提交一次。checkpoint 写在 `vendor/opencode/.oco-m3/<task>.md`（M2 经验：写到 vendor 外会 EPERM；不能放 `packages/app` 下，否则会进补丁 0019），该目录不提交。
- 响应式测试只放 `test-browser/`；测试驱动的必须是产品代码导出的函数/工厂，不得在测试里复制逻辑。

## 顺序

T1 ∥ T2（文件互斥）→ T3 → T4 → T5 → T6（同一 `session-runtime.tsx`，串行）→ T7 → T8 → T9。

---

### Task 1：性能——先量再改（Gemini）

**Files:** 新建 `src/components/session/session-runtime-perf.test.ts`（只测耗时，纯函数）；走合并路径时新建 `session-runtime-live.ts` 与 `test-browser/session-runtime-live.test.ts`，改 `session-runtime.tsx`。

1. **测量夹具**（src 下，纯函数直接调用 `buildTrajectory` + `buildRuntime`）：200 个请求（每请求 3 个工具，其中 1 个 task）+ 末尾进行中消息，向其 reasoning part 追加 100 次 delta。量：每次 delta 触发的 `assemble` 次数、`assemble` 单次耗时的中位数与 p95（`performance.now()`，跑 5 轮取中位）。数字写入 checkpoint 与报告。
2. **决策规则**：
   - 单次 `assemble` p95 ≤ 4 ms：不合并重算，只做裁定 1 的思考文字独立 accessor（Task 3 使用）。
   - p95 > 4 ms：把 `live` 接线抽成 `createRuntimeLive` 工厂。`assemble` 内对 parts 的读取放在 `untrack` 下；`track(sessionID)` 订阅两样东西：(i) 结构签名 memo（带 `equals`：消息 id 序列、各消息 part id 序列、工具 `state.status`、part `time.end`），变化立即触发；(ii) 文字 tick：追踪该会话 text/reasoning part 的 `text`，尾沿最多每 100 ms 递增一次。`live()` 调 `track(根)` 并依赖 `status()`、`treeRequests()`、`contextLimit()`；子面板的 memo 调 `track(子会话)`。
3. **测试**（`test-browser/`，驱动 `createRuntimeLive`，假 store）：(a) 100 次文字 delta 在 1 s 内触发的重算 ≤ 12 次；(b) `session_status` 变为 retry、新增权限、工具 part 从 running 变 completed 时，`live()` 同步更新（不等 100 ms）；(c) 对子会话 `track` 后更新子会话工具状态，子模型随之更新（面板不冻住）。若走第一条路，只交测量用例，并在报告写明 (b)(c) 由现状天然满足的依据。
- 验收：测量数字、所选路径与理由写进报告；单测与 test:browser 全过，类型 0 错误。

### Task 2：机制图投影（Gemini，可与 Task 1 并行）

**Files:** 新建 `session-runtime-mechanism.ts`、`session-runtime-mechanism.test.ts`。只读 `session-runtime-model.ts`。

按“新增契约”与裁定 2–4 实现。测试（每条一个用例）：
1. 无请求 → `empty=true`，无槽位。
2. 最后请求 5 个并行工具，其中第 5 个运行中 → 4 槽 + `toolsOverflow {total:1, running:1}`；槽位顺序为 `model.tools` 出现顺序。
3. 某工具完成后再次投影：槽位顺序与身份不变（不重排）。
4. `stage="tools"`：运行中工具 `dispatch=true`；`awaiting` 的工具 `dispatch=false, awaiting=true`；`interrupted` 的工具 `dispatch=false`。
5. `stage="fill"`：最后请求的槽位 `returning=true`，`dispatch=false`；其他阶段 `returning=false`。
6. 后台 task：较早请求中 task completed、子会话 `running` → 仍出现在子代理槽，`dispatch=true`；同一子会话被两行引用只占一槽。
7. 子代理生命周期 `done` 且不在最后请求 → 不出现在子代理槽。
8. 回看模型（生命周期 `unknown`）→ 子代理槽不因生命周期活跃，投影不抛错。
9. 超长工具名不截断数据（截断由视图换行负责）。
- 验收：单测全过，类型 0 错误。

### Task 3：思考流（Gemini）

**Files:** 新建 `session-runtime-reasoning.ts`、`session-runtime-reasoning.test.ts`；改 `session-runtime.tsx`、`session-runtime-i18n.ts`。前提：Task 1 已提交。

- `reasoningOf` 纯函数：取 parts 中 `type === "reasoning"` 的项，`streaming = inFlight && !time.end`；空文本的 part 跳过。
- 视图：实时模式读 `inFlightMessageID()` 对应消息的 parts（直接读 store，细粒度），显示尾部 ≤6 行 + “显示中”+ “中途接入时开头可能缺失”；完成后折叠为一行 + 展开按钮。回看读游标所在请求消息的 reasoning 最终文本，折叠为一行 + 展开按钮。位置：焦点区下方、阶段条之上。
- 数据属性按契约表；不放进 aria-live。
- 三语文案：显示中、思考完成、开头可能缺失、展开/收起思考。
- 测试：`reasoningOf` 4 例（无 reasoning、进行中、已结束、非 inFlight 的未结束 part 视为非 streaming）；回看 1 例：用 `snapshotAt` 把游标放在 reasoning part 的 start 与 end 之间，回看投影不含该 part 的文字（只有“思考中”状态）；游标在 end 之后则有全文；若 Task 1 走合并路径，test-browser 1 例：思考 accessor 在 delta 后同步更新，而 `live()` 的重算次数不随之增加。
- 验收：单测与 test:browser 全过，类型 0 错误。

### Task 4：机制图视图与减少动画（Gemini）

**Files:** 新建 `session-runtime-mechanism.tsx`；改 `session-runtime.tsx`、`session-runtime-i18n.ts`。

- 默认折叠；切换按钮 `aria-expanded`。展开后按 `mechanismOf(model())` 渲染：顶部主 agent 节点 → 中间两组槽位（工具、子代理）→ 底部“结果回填”。节点用 `<For each={ids}>` 按 `toolID` 稳定渲染（沿用 `keyed`）。
- 节点：字形 + 文字（工具名/agent、状态），颜色之外有文字；awaiting “!”、interrupted “◌”。
- 连线：用 CSS（或内联 SVG）画；活跃边上放 `data-oco-runtime-flow` 元素做流动动画，方向即数据方向（派发向下、汇回向上）；`motion-reduce:animate-none`。非活跃边静止。回看不渲染 `data-oco-runtime-flow`。
- 420 px：两组槽位纵向堆叠、文字换行，不出现横向滚动；不裁剪文字。
- 颜色只用主题 token（`text-*`、`border-*`、`bg-surface-*`），不新增角色配色与图例（裁定 11）。
- 测试：纯函数层由 Task 2 覆盖；视图渲染（折叠时无节点、展开后节点数 = 槽位数 + 1、回看无 `data-oco-runtime-flow`）由 Task 7 E2E 覆盖。若能把“节点/边列表”做成纯函数 `mechanismView(mechanism, mode)` 则在 src 下单测。
- 验收：单测与 test:browser 全过，类型 0 错误。

### Task 5：嵌套 ≥2 层 + 整树同步/pin + M2 遗留组件测试（Gemini）

**Files:** `session-runtime-child.tsx`、`session-runtime-actions.ts`、`session-runtime-actions.test.ts`、`session-runtime.tsx`；test:browser 新增测试文件。

- `RuntimeChildPanel` 改为递归，带 `depth`；面板内子代理行有展开按钮，depth ≥2 默认折叠；去掉“孙会话只显示一行”的限制注释与逻辑。展开状态仍按会话 id 记录。
- 自动同步：把自动同步与 pin 接线抽成工厂 `createChildSync(deps)`（`session-runtime-child-sync.ts`，依赖注入 `sync(id)`、`pin/unpin`、`messagesOf(id)`、根 turn），用 `treeNodes` + `treeSyncTargets` 替换只看 `live().tools` 的逻辑；展开时补 sync。
- pin：`treePinTargets` 覆盖整棵树中运行中（running/retrying/waiting-user）或已展开的后代；沿用 M2 的增量 pin/unpin 与 `onCleanup`。
- 单测（actions）：深度 3 的树，目标顺序近根优先；超过 8 截断；同一轮不重复；新一轮重置计数；运行中的孙会话进入 pin 目标。
- 单测（actions）另加：`parentOf`/task 引用成环时 `treeNodes` 终止；深度超过 8 截断。
- **响应式测试（`test-browser/session-runtime-child-sync.test.ts`，驱动 `createChildSync`，M2 遗留缺口，必须本任务内补上）**：(a) 自动同步计数按根 turn 重置；(b) 同步失败（reject）后展开时重试；(c) 缓存驱逐（假 store 删掉该会话消息）后展开触发重新拉取，期间生命周期为 unknown；(d) 运行中的孙会话被 pin，结束且未展开后 unpin。
- 验收：单测与 test:browser 全过，类型 0 错误；嵌套 E2E 记 NOT RUN（已知限制，见“已核实的事实”）。

### Task 6：键盘与读屏（Gemini）

**Files:** `session-runtime.tsx`、`session-runtime-child.tsx`、`session-runtime-mechanism.tsx`、`session-runtime-i18n.ts`。

- 工具行：行头改为 `<button type="button" aria-expanded aria-controls>`，内容为字形 + 名称 + 状态文字；展开区显示完整入参摘要与 `lastOutput`。行内其他按钮（展开子代理、在对话中打开、权限回复）是行头按钮的兄弟节点，不嵌套。
- 所有运行视图按钮加统一的 `focus-visible` 样式（主题 token），提取为常量与 `BTN` 并列。
- `data-oco-runtime-live` 区域：`aria-live="polite"`，内容为焦点句 + 运行状态文字；停止按钮加 `aria-label`。
- 状态字形保持 `aria-hidden`，旁边有文字。
- 测试：由 Task 7 E2E 覆盖（Enter/Space 切换 `aria-expanded`、`button button` 为空、`aria-live` 位置）；若展开区内容由纯函数生成（`toolDetail(tool, t)`），在 src 下单测其字段（缺失时间写“未知”）。
- 验收：单测与 test:browser 全过，类型 0 错误。

### Task 7：E2E 扩展 c5-runtime（Gemini 运行与诊断；主线程只读 results.json）

**Files:** `tests/e2e/c5-runtime.mjs`；如第 0 步需要，另加 `tests/e2e/lib/vscode.mjs` 的辅助函数与 `tests/e2e/lib/mock-llm.mjs`（单独提交，附单测）。前提：Task 1–6 完成；构建 webview 与 extension；端口沿用 4617/4618，不碰 4517 与用户的 VS Code；结束后确认端口释放、无遗留 VS Code。

0. **两个前置 spike（结果写进证据文件，按规则决定）**：
   - 减少动画能否传到 webview 内的 frame：依次试 `launch({ settings: { "workbench.reduceMotion": "on" } })` → Playwright `emulateMedia({ reducedMotion: "reduce" })` → 对该 frame 的 target 发 CDP `Emulation.setEmulatedMedia`（`prefers-reduced-motion: reduce`）。以 frame 内 `matchMedia("(prefers-reduced-motion: reduce)").matches === true` 为准，取第一个生效的。三者都不生效：`reduced-motion` 记 BLOCKED，**不改产品代码去认测试 class**。
   - 思考流可见性：用现有多行回答提示词，看能否在 `streaming` 状态下观察到 `data-oco-runtime-reasoning-state=streaming`（轮询 ≤100 ms）。观察不到时，在 mock 加 `SLOW-REASON-<tag>` 触发（6 段 reasoning 每段间隔 300 ms，其他套件不受影响，附 `tests/unit/mock-llm.test.ts` 用例），而不是放宽断言。
1. 启动统一用暗色：`settings: { "workbench.colorTheme": "Default Dark Modern" }`。
2. 新增 REQUIRED（保留 M1/M2 全部检查）：
   - **确定的“工具运行中”窗口**：提示词 `Use the bash tool to run: sleep 3`，用 M2 的点击流程批准，之后约 3 s 工具处于 running；需要运行中状态的断言都在此窗口内做，轮询 ≤100 ms。
   - `width-420` / `width-560` / `width-wide`（`fitGroups` 设到 420、560、1200）：各宽度下机制图展开、存在长工具名与长输出时，运行视图根节点 `scrollWidth ≤ clientWidth`，且焦点句、停止按钮可见。
   - `theme-dark`：运行视图根节点（向上找到第一个不透明背景）的背景相对亮度 < 0.2，且正文前景相对亮度 > 背景亮度 + 0.3（亮色主题下必然失败）。
   - `mechanism`：默认 `collapsed`；点切换 → `expanded`；在运行窗口内至少一条 `edge-dir=dispatch` 的 `edge-active=true` 且带 `data-oco-runtime-flow`；运行结束后没有 `edge-active=true`；暂停跟随（回看）时没有 `data-oco-runtime-flow`。
   - `reasoning`：出现 `reasoning-state=streaming`，随后变为 `done`；完成后思考区折叠为一行，展开按钮可用。
   - `motion-on`（正向对照，必跑）：不开减少动画时，运行窗口内活跃边的 `data-oco-runtime-flow` 计算样式 `animation-name` 不是 `none`。
   - `reduced-motion`（第 0 步可行时）：开启后同一场景下 `animation-name` 为 `none`，该边仍 `edge-active=true`，事件日志仍有对应 `tool.start` 行。
   - `keyboard`：Tab 聚焦到工具行行头按钮，焦点元素的 `:focus-visible` 计算样式有非 none 的 outline 或 box-shadow；Enter 展开、Space 收起（`aria-expanded` 切换），展开区出现 `data-oco-runtime-tool-detail` 且含耗时文字；`[data-oco-runtime] button button` 数量为 0；`aria-live="polite"` 区域包含焦点句且不包含思考区。
3. 每条断言写明“若实现退化为 X，本断言会失败”的对应关系。
4. 不在 E2E 中验证：亮色主题（用户裁定不做，NOT RUN）、嵌套 ≥2 层（NOT RUN，原因见上）、真实模型长会话性能（NOT RUN）。
- 验收：en、zh 各一次，REQUIRED 全过；`c4-trajectory` 回归通过。结果写 `docs/evidence/runtime-m3-e2e.md`。

### Task 8：补丁与重放（主线程）

- `git -C vendor/opencode diff deb241e -- packages/app > patches/opencode/0019-oco-runtime-view.patch`（0019 追加 M3，仍是一个补丁）。
- 干净 `51ef4be` 上依序 `git apply --check` + apply 0001→0019；`diff -r` 与开发树 `packages/app/src` 一致；重放树中 session 单测全过。

### Task 9：整分支评审、验收与文档（主线程）

- 最终评审（opus）看 M3 全部 vendor 提交；修复按惯例只开一波。
- 验收证据 `docs/evidence/runtime-m3-verification.md`（按 spec 第 4 段三层分别给数字；未跑 NOT RUN，缺环境 BLOCKED）。
- STATUS、PROGRESS、NEXT、spec 第 3 段实施偏差回写；按文件分批本地提交。不推送、不部署（部署 gcp-workstation 需用户另行决定）。

## 评审重点

1. 思考流的高频更新是否仍在触发整会话 `assemble`（Task 1 决策是否落实）。
2. 状态、权限、提问、工具状态的变化是否被合并逻辑延迟；展开的子面板是否仍随子会话更新。
3. 回看时思考区是否泄漏游标之后的文字。
4. 后台子代理是否因切片规则从机制图消失。
5. 回看时是否有流动动画或操作按钮。
6. 是否出现 button 嵌套 button；焦点在流式更新中是否保持在同一 DOM 节点。
7. 减少动画时，活跃状态是否仍有非动画的表达（线型/字形/文字）。
8. 是否有写死的颜色值或测试专用的产品代码分支。

## 待用户确认（不阻塞 Task 1–3，只影响 Task 4 的视觉范围）

1. 机制图是否采用“固定角色配色 + 图例”（主 agent、工具、子代理、需你处理）？未确认前只用主题 token 的中性色 + 字形与文字。
2. 是否加页脚一行态势摘要（活跃数/总数、最后事件 xx 前）？未确认前不加（“最后事件 xx 前”已在顶栏）。
