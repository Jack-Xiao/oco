# 运行视图 M3 只读预检报告 (Preflight Checklist)

- 状态：已完成 (Completed)
- 检查目标：为运行视图 M3（机制图、思考流、嵌套≥2层、减少动画、键盘读屏、E2E多宽度与暗色）提供证据支持与可行性分析
- 唯一写入文件：`docs/evidence/runtime-m3-preflight.md`

---

## 1. 重构现状：keyed、单一大 memo 与重建粒度

- **现状核实**：
  - **keyed 仅作用于 DOM 渲染层**（已核实，`session-runtime.tsx:247-250`、`session-runtime-keyed.ts:13-24`）：M2 Task 1 引入的 `keyed(active, x => x.id)` 通过稳定的 `ids` memo 和 `sameIds` 比较，成功避免了 DOM 节点的反复销毁与重建。
  - **数据层依然存在“单一大 memo 整体重建”问题**（已核实，`session-runtime.tsx:136-172, 196`）：`const live = createMemo<RuntimeModel>(() => assemble({ messages: messages(), parts }, "live", Date.now()))`。`assemble` 内部每次均执行全量 `buildTrajectory(...)` 与 `buildRuntime(...)`。
- **live() / model() 的重建频率和粒度**：
  - **重建频率**（已核实，`session-runtime.tsx:114-117, 196`、`context/global-sync/event-reducer.ts:313-387`）：`live()` 依赖 `messages()`、`busy()`、`status()`、`treeRequests()`、`contextLimit()`，以及在 `buildTrajectory` 内部通过 `parts(m.id)` 读取的 `sync().data.part[messageID]`。当任何一条消息到达、任何 part 更新、以及流式文本/思考 delta（`message.part.delta`）到达时，`live()` 都会对整个会话的所有消息和 parts 重新遍历计算。粒度为**整个会话全量（Coarse-grained full rebuild）**。
- **M3 前是否需要拆层及最小拆法**：
  - **需要针对高频流式数据做隔离**（推断）：M3 将引入“思考流（reasoning stream）”，如果继续将高频流式 delta（每秒数次至数十次）喂入 `live()` 的全量 `buildTrajectory` + `buildRuntime`，大长会话在思考阶段会引发密集的全量重算。
  - **最小拆法（Minimal Split）**：
    1. **静态结构与动态流分离**：将已结算的历史 requests/tools 缓存，仅对当前 `inFlightMessageID`（`session-runtime.tsx:122`）或当前 turn 的活动 part 维持细粒度 signal / memo。
    2. **思考流独立投射（Reasoning Projection）**：不要把思考流的全文实时追加放进主 `RuntimeModel` 的全量计算管线，而是在 `session-runtime.tsx` 中建立针对当前进行中 assistant 消息的独立 `reasoningStream` accessor（读取 `sync().data.part[lastAssistantId]` 中类型为 `reasoning` 的 part），主机制图和结构模型仅读取其状态（是否在思考、字数或行数），思考文字渲染由子组件单独订阅。

## 2. 机制图的数据：“扇出→并行→汇回”与活跃流动连线

- **现有足够支持画出版式的字段**（已核实，`session-runtime-model.ts:60-137, 394-430`）：
  - **扇出源与汇回宿主（主 Agent / 模型节点）**：
    - `requests`: `RuntimeRequest[]`，当前活跃请求为末项 `requests[requests.length - 1]`，包含 `turn`、`status`（"running" | "done" | "error" | "interrupted"）。
    - `stage`: `"prepare" | "model" | "tools" | "fill" | "idle"`，明确标识当前宏观阶段。
    - `run.state`: `"working" | "waiting-user" | "retrying" | "idle" | "error" | "unknown"`。
  - **并行节点（工具与子代理）**：
    - `tools`: `RuntimeTool[]`，每项带 `request`（归属请求 index）、`name`、`state`（"pending" | "running" | "completed" | "error"）、`interrupted`、`cancelled`、`awaiting`。
    - `child`: `RuntimeChild`（若为子代理），带 `sessionID`、`agent`、`lifecycle`（"running" | "waiting-user" | "retrying" | "done" | "error" | "cancelled" | "unknown"）。
  - **会话与事件上下文**：
    - `sessions`: `RuntimeSession[]`，记录整个会话树拓扑。
    - `events`: `RuntimeEvent[]`，提供 `request.start`, `tool.start`, `tool.end` 等真实事件时间点，作为图的文字孪生。
- **缺什么（Missing Fields）**（已核实/推断）：
  - **当前轮次活动工具槽位切片**（已核实，`session-runtime-model.ts:60, 566`）：`model.tools` 是会话全历史累积列表；机制图需按 `tool.request === currentRequest.index`（或最新 turn）提取当前轮次的槽位，否则长会话历史工具会撑爆固定版式。
  - **工具级别的“汇回过渡态”**（已核实，`session-runtime-model.ts:62`）：单个工具执行完毕后，`tool.state` 直接变为终态 `"completed"`，模型中缺乏局部“正在回填结果中”的瞬间状态（例如 `fillPending`）。
- **“仅活跃连线流动”能否只靠现有的状态字段判断？**
  - **派发连线（主 Agent → 工具/子代理，向下）**：**能**（已核实，`session-runtime-model.ts:62, 398`）。只需判断 `stage === "tools"` 且该工具处于 `tool.state === "pending" || tool.state === "running"`；若 `tool.awaiting` 存在或 `tool.interrupted` 为 true 则连线挂起静止。
  - **汇回连线（工具/子代理 → 结果回填/主 Agent，向上）**：**不能仅靠单个 tool.state 判断**（推断，`session-runtime-model.ts:62, 400`）。`completed` 是不可逆终态；若所有 `completed` 都流动，历史完成的连线将永久流动。
  - **解决方案**：必须结合宏观 `stage === "fill"`（所有工具已完成，主模型接收结果），或者结合最新 `events`（最近结束的 `tool.end` 时间窗口，如完成 1 秒内），或仅在 `stage === "fill"` 时高亮汇回连线流动。

## 3. 思考流：Reasoning Part 存储、流式到达与现有视图处理

- **assistant 的 reasoning part 在 sync store 里是否存在？**
  - **存在**（已核实，`packages/sdk/js/src/gen/types.gen.ts:177-183, 395`、`context/global-sync/event-reducer.ts:20, 313-339`）：
    - `Part` 联合类型中明确定义了 `ReasoningPart = { id: string; sessionID: string; messageID: string; type: "reasoning"; text: string; ... }`。
    - `event-reducer.ts:20` 的 `SKIP_PARTS`（忽略列表）为 `["patch", "step-start", "step-finish"]`，并不包含 `"reasoning"`。
    - 当收到 `message.part.updated` 时，reasoning part 会按 `part.id` 被插入并保存在 `sync().data.part[messageID]` 数组中。
- **流式 delta 怎么到达？**
  - **通过 `message.part.delta` 事件持续追加**（已核实，`context/global-sync/event-reducer.ts:364-387`）：
    - 服务端推送 `message.part.delta` 事件，携带 `{ messageID, partID, field: "text", delta: string }`。
    - reducer 查找到该 part 后，执行 `(part[field] as string) = (existing ?? "") + props.delta`，使 store 内部的 `part.text` 实时增长。
    - 边界注意（已核实，`spec:49` 及 `event-reducer.ts:369`）：若 `message.part.delta` 到达早于 initial part 创建（`!result.found`），delta 会被直接丢弃；中途接入时文本以最终的 `part.updated` 为准。
- **运行视图目前是否完全没有显示思考？**
  - **完全没有显示思考文本**（已核实，`session-runtime.tsx:722`、`session-runtime-model.ts:75, 343`）：
    - 当前 `session-runtime.tsx` 仅在底栏页脚 token 用量中引用了 `u().reasoning`（`session-runtime.tsx:722`）。
    - `RuntimeModel` 契约中根本没有存放 reasoning 文本的字段，界面上也没有任何思考流或思考折叠/展开区域。
- **轨迹模型对 reasoning 是怎么处理的？**
  - **生成独立的 `kind: "reasoning"` 轨迹行**（已核实，`session-trajectory-model.ts:53, 289-296, 406-413`）：
    - `session-trajectory-model.ts:289-296` 遍历 message parts，若 `part.type === "reasoning"`，计算 `start` 与 `end`，将其作为 `{ id: part.id, kind: "reasoning", turn: turnIndex, request: index, text: oneLine(part.text), part, start, end }` 推入 `rows`。
    - 在紧凑视图（Compact list）算法中（lines 406-413），连续的 thinking 行与 tool calls 会按轮次聚合成可折叠段。

## 4. 嵌套 ≥2 层：孙会话及深层展开在 assemble、自动同步与 pin 机制中的限制

- **assemble 机制的限制与表现**：
  - **纯函数本身支持任意 sessionID**（已核实，`session-runtime.tsx:175-194`、`session-runtime-model.ts:564-582`）：`assembleChild(sessionID)` 是扁平结构，只要给入 sessionID 和对应的 messages、parts，即可递归或独立组装出子/孙会话的 `RuntimeModel`。
  - **组件层硬编码限制为单层**（已核实，`session-runtime-child.tsx:1, 43-70`）：`session-runtime-child.tsx` 明确标注 `// one-level subagent panel. Grandchildren are a single line; no further expand.`。当子会话中的工具有 `child`（即孙会话）时，仅渲染纯文本 `c().agent + c().lifecycle`，无折叠/展开按钮，也未递归实例化 `RuntimeChildPanel`。
- **自动同步（autoTurn / autoCount / 上限 8）的限制**：
  - **根组件自动同步完全忽略孙会话**（已核实，`session-runtime.tsx:285-294`、`session-runtime-actions.ts:60-80`）：
    - `session-runtime.tsx:285` 只遍历根会话的 `live().tools`（直接子代理），收集其 sessionID 传入 `autoSyncTargets(...)`。
    - 孙会话深藏在子代理的消息流中，根本不在 `live().tools` 里，因此**自动同步永远不会主动拉取孙会话**！
  - **上限 8 的约束**（已核实，`session-runtime.tsx:291`、`session-runtime-actions.ts:64-74`）：
    - 当前单轮自动同步硬性限制 `limit = 8`。如果未来自动同步扩展到整棵树，或者子代理并发量大，第 9 个及以后的会话不会被预取，必须等待手动点击展开或下一轮。
- **Pin 机制与缓存回收（Cache Eviction）的限制**：
  - **未展开的孙会话不会被 Pin**（已核实，`session-runtime.tsx:297-302`、`session-runtime-actions.ts:88-99`）：
    - `pinTargets` 的输入是 `live().tools` 的 child lifecycle 以及 `openChildren()`。
    - 因为 `live().tools` 只有直系子代，即使孙会话处于运行态（`running`/`retrying`/`waiting-user`），只要用户没有点开孙会话面板，它就**不会被加入 `pinnedChildren`**！
  - **缓存回收与数据丢失风险**（已核实，`runtime-m2-verification.md:50`、`spec:49`）：
    - 未被 pin 的孙会话一旦运行结束，或后台同步执行清理（如超过 4 小时或内存修剪），其消息数据会从 `sync().data.message[id]` 中被回收。
    - 展开已被回收的孙会话时，`childMessagesOf(id)` 将为 `undefined`，必须像直系子会话那样触发 `requestChildSync(id)` 重新拉取；拉取完成前生命周期会短暂显示为 `"unknown"`。
- **`parentOf` 与祖先链路判定**：
  - **树级权限上溯依赖 `sync.session`**（已核实，`session-runtime.tsx:134, 166`、`session-runtime-model.ts:224-232, 546-562`）：
    - `ascendsTo(sessionID, target, parentOf)` 通过 `sync().session.get(id)?.parentID` 逐级回溯。
    - 若中间层子会话在 `sync().data.session` 中丢失，向上回溯会中断，导致孙会话的权限与提问无法准确归属到祖先任务行上。
    - 宿主扩展侧对子会话向上回溯最多支持 8 级（已核实，`apps/extension/src/bridge-policy.ts:67`）。

## 5. 减少动画、键盘与读屏：现有 a11y、动画与 prefers-reduced-motion 处理

- **现有按钮与行的 aria 属性**（已核实，`session-runtime.tsx:433, 459, 585, 661-673`、`session-runtime-child.tsx:54`）：
  - **已有**：
    - 状态符号：`<span aria-hidden="true">` 隐藏了纯视觉符号（如 `○`, `◐`, `✓`, `✕`, `→`）。
    - 展开按钮：子会话展开按钮带有 `aria-expanded={childOpen(id())}`。
    - 回放控制：时间轴/单步按钮带有 `aria-label={t("replay.step", { n, total })}`。
    - 阶段条：容器带 `aria-label={t("stage.label")}`，当前步骤带 `aria-current={model().stage === s ? "step" : undefined}`。
  - **缺失**：
    - 工具与任务行：均为纯 `<div>`，没有 `role="button"` 或 `<button>`，没有键盘交互（Enter/Space 展开）。
    - 焦点区域与取消/报错：没有 `role="status"`、`role="alert"` 或 `aria-live="polite"`，读屏器无法即时播报状态切换与待审批提问。
    - 停止按钮：仅通过文本显示，无显式 `aria-label`。
- **现有焦点样式（Focus Styles）**（已核实，`session-runtime.tsx:10, 420-460`、`session-runtime-child.tsx:10`）：
  - 现有通用按钮样式常量为 `BTN = "h-6 px-2 rounded-[5px] text-12-medium bg-surface-inset-base text-text-base"`。
  - **目前没有任何专用的 `focus:` 或 `focus-visible:` 样式类名**（无轮廓线高亮、无 ring 偏移），仅依赖 Chromium / VS Code 默认的 outline。
- **现有动画类名与 CSS transition**（已核实，`session-runtime.tsx`、`session-runtime-child.tsx`）：
  - 当前运行视图（`session-runtime.tsx` 及 `session-runtime-child.tsx`）中**完全没有声明任何 CSS `transition` 或 `animate-` 类名**，目前为纯静态渲染，无平滑过渡。
- **opencode UI 包与全局对 prefers-reduced-motion 的处理**（已核实，`vendor/opencode/packages/app/src/index.css:163-167`、`packages/ui/src/v2/components/*.css`、`packages/ui/src/v2/components/toast-v2.tsx:266`）：
  - **组件级局部处理**：在 `index.css:163`、`loader-v2.css:28`、`toast-v2.css:209`、`text-shimmer-v2.css:109` 等文件中，局部使用标准媒体查询 `@media (prefers-reduced-motion: reduce) { animation: none; }`。
  - **脚本判断**：在 `toast-v2.tsx:266` 中使用 `window.matchMedia("(prefers-reduced-motion: reduce)").matches` 判断是否跳过弹窗动画。
  - **框架层**：基于 Tailwind CSS，天然支持 `motion-reduce:` 与 `motion-safe:` 修饰符，但尚无全应用统一的 Context 或全局 CSS 重置。

## 6. E2E 能力：vscode.mjs 设置多宽度、暗色主题与减少动画的可行性

- **设置窗口或面板宽度（420 / 560 / 宽屏）**：
  - **能直接做到**（已核实，`tests/e2e/vscode.mjs:208-234`）：
    - `vscode.mjs` 已导出 `fitGroups(app, page, width, { tolerance = 4 })` 工具函数。
    - 其原理是通过 Playwright Electron API 调用 `BrowserWindow.getAllWindows()[0].setContentSize(...)` 动态调整窗口大小，直到 `chatFrames(page)` 测得的 webview `innerWidth` 贴合指定的 CSS 像素宽度（例如 420、560）。在单面板会话场景下可以直接复用。
- **VS Code 颜色主题（暗色）**：
  - **能直接做到**（已核实，`tests/e2e/vscode.mjs:14-40`、`tests/e2e/p1b-theme-load.mjs:39, 50-51`）：
    - `launch({ settings })` 支持将任意 VS Code 设置注入隔离配置文件的 `User/settings.json`。
    - 暗色主题只需在 launch 时传入 `{ settings: { "workbench.colorTheme": "Default Dark Modern" } }` 即可生效。
    - `p1b-theme-load.mjs` 中已有直接修改 `l.settingsFile` 验证主题热重载的完备范例。
    - 针对用户裁定“主题只做暗色，不做亮色”，E2E 统一固定为 `"Default Dark Modern"`。
- **减少动画（Reduced Motion）**：
  - **能否设置**（已核实/推断）：
    - VS Code 原生设置：VS Code 支持用户配置项 `"workbench.reduceMotion": "on"`，可通过 `launch({ settings: { "workbench.reduceMotion": "on" } })` 注入。
    - Playwright 媒体仿真：Playwright 支持 `page.emulateMedia({ reducedMotion: 'reduce' })`。但在 Electron 顶层窗口与嵌套 `vscode-webview://` 跨进程/隔离 frame 之间，媒体仿真是否能可靠透传到 webview 的 CSS 媒体查询需要最小验证。
  - **最小扩展点（Minimal Extension Point）**：
    - 若 `workbench.reduceMotion` 无法在 webview 触发 `@media (prefers-reduced-motion)`，可在 `vscode.mjs` 中为 `chatFrames` 暴露辅助函数：
      ```js
      export async function setFrameReducedMotion(frame, enable = true) {
        await frame.evaluate((enable) => {
          document.documentElement.classList.toggle("reduce-motion", enable)
        }, enable)
      }
      ```
      或者在被测组件的 CSS 中同时监听 `prefers-reduced-motion` 媒体查询与 `.reduce-motion` 类选择器（与 VS Code 宿主惯例对齐）。

## 7. 风险清单 (Risk Checklist)

1. **流式高频触发全量重算**：Reasoning 流式 delta 频繁到达会触发 `live()` 重新遍历所有历史消息执行全量 `buildTrajectory` 与 `buildRuntime`，大长会话容易引起严重的界面卡顿。
2. **工具状态缺乏回填瞬态**：`RuntimeTool` 终态仅有 `completed`，缺少“正在回填”的独立过渡态，难以仅凭工具自身字段区分是“刚完成回填”还是“历史旧完成”。
3. **机制图历史工具无限堆叠**：`RuntimeModel.tools` 累积全会话所有工具，机制图固定版式若不限制为当前活跃轮次/请求的工具切片，长会话下版式将无限膨胀。
4. **孙会话不会被主动自动拉取**：当前自动同步逻辑硬编码只扫描根会话直接子代理（`live().tools`），深度 ≥2 层的孙会话在折叠状态下不会被后台自动同步。
5. **未展开孙会话面临缓存回收丢失**：未点开的孙会话不计入 `pinnedChildren`，OpenCode 背景清理或 LRU 淘汰后，再展开时会短暂降级为 `unknown` 状态并需重新网络拉取。
6. **工具行键盘焦点与语义缺失**：当前工具与任务行均为普通 `div`，未遵循 spec 实现为具备键盘聚焦、Enter/Space 展开、`button` 语义与焦点样式的可交互组件。
7. **减少动画在 webview 间隙的透传不确定**：VS Code 的 `"workbench.reduceMotion"` 配置与 Playwright 的媒体仿真能否 100% 穿透生效至 webview 内部的 `@media (prefers-reduced-motion)` 仍需防守性兜底。
8. **子代理面板组件缺乏递归折叠支持**：`RuntimeChildPanel` 当前写死仅展示单行孙会话文本，未支持多层递归展开逻辑与多级 `openChildren` 状态维护。
