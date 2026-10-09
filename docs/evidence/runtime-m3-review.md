# 运行视图 M3 代码评审报告

- **评审范围**: M1–M3 运行视图全部改动（`vendor/opencode` 提交 `deb241e..4385e3f`）
- **重点文件**: `session-runtime.tsx`, `session-runtime-mechanism-view.tsx`, `session-runtime-mechanism.ts`, `session-runtime-child.tsx`, `session-runtime-i18n.ts`, `session-runtime-model.ts`, `session-runtime-actions.ts`
- **评审标准**: 9 项评审重点、Global Constraints 及“改版 2：固定框架”
- **执行属性**: 只读评审，0 代码变更，0 git 提交，0 构建/E2E 运行
- **执行模型**: Gemini 3.8 Flash (High) / Antigravity

---

## 缺陷汇总表（按严重度排序）

| 编号 | 严重度 | 文件与行号 | 缺陷名称 / 场景 | 核心影响 |
|---|---|---|---|---|
| **D-01** | **阻断** | `session-runtime.tsx:190`<br>`session-runtime-mechanism-view.tsx:109, 441`<br>`session-runtime-mechanism.ts:347` | 思考流高频触发全会话 `assemble` 且 `<For each={lanes()}>` 造成卡片全量 DOM 销毁重建 | 键盘焦点瞬间丢失，流式高频 GC 与重渲染 |
| **D-02** | **应修** | `session-runtime.tsx:349, 1004`<br>`session-runtime-mechanism-view.tsx:165, 343` | 进入子代理后思考框依然展示根会话思考文字 | 子代理界面显示根 Agent 思考流，且无法观察子代理实时思考 |
| **D-03** | **应修** | `session-runtime.tsx:304`<br>`session-runtime-mechanism.ts:389` | 子代理计数口径在状态栏与名册间不一致 | 底栏取未去重工具行，名册取去重子会话，数字自相矛盾 |
| **D-04** | **应修** | `session-runtime.tsx:289-295` | 用户主动拒绝的权限及已取消工具被计入“其他异常” | 永久累积成无法清除的“其他异常”警报，逻辑不合理 |
| **D-05** | **应修** | `session-runtime-mechanism-view.tsx:124, 258` | 深度 ≥2 的孙代理在面包屑与加载态显示为原始 Session ID | 孙代理不属于根 tools，查找不到 Agent 名字，退化为 UUID |
| **D-06** | **应修** | `session-runtime-mechanism-view.tsx:461` | 溢出通道属性硬编码为 `data-oco-runtime-overflow="tools"` | 子代理溢出时属性仍为 tools，违背 `tools\|children` 契约 |
| **D-07** | **应修** | `session-runtime-mechanism-view.tsx:762, 772` | 详情面板中 `Input:` 和 `Output:` 标签硬编码英文 | 多语言界面下出现未翻译英文字符串 |
| **D-08** | **建议** | `session-runtime-mechanism.ts:39-40` | `toolErrorOf` 中 `(tool as {error?}).error` 是死分支 | `RuntimeTool` 绝无 error 字段，属于无效代码 |
| **D-09** | **建议** | `session-runtime-mechanism.ts:6-20` | `MechanismSlot` 中文类型注释与仓库全英文风格不一致 | 拷贝中文规格草案注释，风格不统一 |
| **D-10** | **建议** | `session-runtime-mechanism-view.tsx:213, 666` | 空会话无请求时派发线标签显示“派发 0 · 并行”且回填“0 / 0” | 界面初始状态展示空派发标签，体验微瑕 |
| **D-11** | **建议** | `session-runtime-mechanism-view.tsx:382, 617` | < 560px 窄屏时连线未实现竖轨层级，仍保留 4 列横向总线 | 1 列卡片与 4 列横向连线视觉脱节 |
| **D-12** | **建议** | `session-runtime-mechanism-view.tsx:264` | 子代理同步失败时永久停留在“加载中…”，无错误状态或重试 | 离线或同步报错时缺少反馈与重试操作 |

---

## 逐项评审重点结论与深度分析

### 1. 思考流高频更新与 DOM / 焦点稳定性
- **结论**: **[阻断缺陷]**（D-01）
- **文件与行号**:
  - `packages/app/src/components/session/session-runtime.tsx:190`
  - `packages/app/src/components/session/session-runtime-mechanism-view.tsx:109, 441`
  - `packages/app/src/components/session/session-runtime-mechanism.ts:347-376`
  - `packages/app/src/components/session/session-trajectory-model.ts:289-296`
- **触发场景**:
  当大模型正在以流式（streaming delta）输出思考流文字时，每次 delta 更新 store 内对应 part 的 `text`。
- **原因剖析**:
  1. **全会话 assemble 泄漏**: 虽然 Task 1 决定不引入 `createRuntimeLive` 节流，但在 `session-runtime.tsx:190` 中，`live = createMemo(() => assemble(...))` 内的 `buildTrajectory` 循环读取了每一个 part 的 `text`（`session-trajectory-model.ts:289`）。Solid Store 在 delta 变更 `part.text` 时直接触发 `live` 重新计算整会话轨迹与模型，并且通过 `assembleChild` 连锁重算了全部已加载的子会话。
  2. **DOM 全量销毁与焦点丢失**: `mechanismOf` 每次返回新 `Mechanism`，`lanesOf` 每次返回全新的对象数组 `[ { kind, slot }, ... ]`。而在 `session-runtime-mechanism-view.tsx:441` 中直接使用了 `<For each={lanes()}>`。Solid 的 `<For>` 依赖对象引用判等（`===`）；由于 4 条通道对象引用全部改变，`<For>` 将所有 4 个通道卡片的 DOM 彻底 Unmount 销毁并重新创建。同理，派发/汇回连线上的 drops 也是 `<For each={lanes()}>`，名册也是 `<For each={rosterItems()}>`。
  3. **后果**: 如果用户此时正使用键盘通过 Tab 键将焦点置于某工具卡片头部的原生折叠按钮 `[data-oco-runtime-tool-toggle]` 上，下一个 reasoning delta 到来时，该按钮瞬间被从 DOM 中卸载，**键盘焦点立刻丢失并回退至 `document.body`**。此外，每秒十余次的完整卡片重构建带来严重的重排与 GC 抖动。E2E 未暴露出此问题是因为其 `keyboard` 检查是在会话已完成运行（静止状态）后执行的。
- **建议修法**:
  1. 在 `assemble` 或 `live` 中，避免对非结构性文本字段的直接追踪，将 reasoning part 的文本读取使用 `untrack` 包裹，或只订阅 part 的 ID / 状态 / `time.end` 变更，阻断 delta 触发 `live` 重算。
  2. 严禁对返回新引用的数组直接使用 `<For each={...}>`。必须使用 `keyed`（`session-runtime-keyed.ts`）为 lanes 建立稳定键（例如 `slot.toolID` 或 `empty-${index}`），或使用 Solid 的 `<Index each={lanes()}>`，使 4 个外层通道卡片 DOM 节点保持不变，仅卡片内文本/信号做细粒度刷新。名册列表同理改用 `keyed`。

---

### 2. 状态变动时延、子树更新与面包屑返回
- **结论**: **[OK / 部分应修]**（状态无延迟；但子代理思考流未切换为 D-02）
- **文件与行号**:
  - `packages/app/src/components/session/session-runtime.tsx:349, 1004`
  - `packages/app/src/components/session/session-runtime-mechanism-view.tsx:165, 343`
- **触发场景**:
  1. 状态、权限、提问、工具状态变动：由于 Task 1 未添加批处理/合并延迟，Store 变更由 Solid 响应式图谱原生同步派发，**不存在被合并逻辑延迟的问题（OK）**。
  2. 进入子代理后子树更新：`currentChildModel` 在子会话的 `message` / `session_status` 变更时能正确响应式重算并驱动机制树（OK）。
  3. 面包屑返回：点击面包屑将 `enteredStack` 清除后，`currentSessionID` 变为 undefined，界面无缝切回根会话模型（OK）。
  4. **思考流未切换缺陷 (D-02)**: 进入子代理后，`main` 节点已显示子 Agent 名称及状态，但右侧（或下方）思考框内的 `currentReasoning` 依旧消费 `props.reasoningList`。该列表是在 `session-runtime.tsx:349` 仅根据根会话计算并传入的。因此，在子代理界面中看到的居然是根会话的思考内容；若子代理正在进行流式思考，用户完全看不到子代理的思考文字。
- **建议修法**:
  将 `activeReasonings` 从外层单一根会话计算，改为在 `RuntimeMechanism` 内部基于 `activeModel()` 动态获取对应的 Assistant 消息并调用 `reasoningOf` / `reasoningAt`，保证所展示思考流与当前处于焦点的会话层级严格一致。

---

### 3. 回放一致性（游标文字泄漏、操作按钮与流动点）
- **结论**: **[OK]**
- **审查事实**:
  1. **游标后文字泄漏**: `session-runtime-reasoning.ts:35` 的 `reasoningAt` 严格检查 `end <= cursor`。对于游标时尚未结束的 reasoning part（`start <= cursor < end` 或 `end` 缺失），强制将 `text` 置为 `""` 并标记 `streaming: true`。视图中对应显示为 `t("reasoning.replay.running")`（"思考中（回看不显示进行中的文字）"），严格阻断了未来文字外泄。
  2. **回复按钮**: 左栏的审批按钮全部包裹在 `<Show when={model().mode === "live"}>` 中，回放时直接显示只读备注文本 `[data-oco-runtime-replay-note]`，无回复按钮。
  3. **停止按钮**: 停止按钮受 `actionsVisible(model().mode, ...)` 守卫，`model.mode === "replay"` 时返回 `false`，不渲染停止按钮。
  4. **流动点**: 派发和汇回连线上的 `[data-oco-runtime-flow]` 均包裹在 `<Show when={isActive && isLive()}>` 守卫中，回放时 `isLive()` 为 `false`，流动点 DOM 不渲染。

---

### 4. 后台子代理与计数口径
- **结论**: **[OK / 部分应修]**（后台子代理切片 OK；子代理计数口径不一致为 D-03）
- **文件与行号**:
  - `packages/app/src/components/session/session-runtime-mechanism.ts:145-162`
  - `packages/app/src/components/session/session-runtime.tsx:304-311`
- **触发场景**:
  1. **后台子代理切片**: `candidateChildren` 收集逻辑不仅看 `tool.request === slotRequestIndex`，还显式判断 `activeLifecycle`（`running | retrying | waiting-user`）。即使主会话已进入后续只有普通工具的请求，只要较早请求中的后台子代理处于活跃生命周期，就会被加入 `candidateChildren`，并通过 `lanesOf` 排在最优先的子代理通道中，不会从树上消失（OK）。
  2. **计数口径不一致 (D-03)**:
     - 左栏名册 `rosterOf`（`session-runtime-mechanism.ts:389`）调用 `lastChildToolIds` 严格按照 `sessionID` 对子代理进行了去重，名册标题数量代表“真实子会话数”。
     - 底部状态栏 `summaryChildren`（`session-runtime.tsx:304`）直接统计 `model().tools.filter(isSubagent).length`，未作任何去重，表示“task 工具调用行总数”。
     - 一旦同一子会话发生重试、恢复或被多次 task 工具关联，名册显示“子代理 · 1”，而状态栏却显示“子代理 [1/2 运行]”甚至“[2/2 运行]”，口径冲突。
- **建议修法**:
  将 `summaryChildren` 的统计数据源改为由 `rosterItems()` 计算，保持全视图对“子代理总数”及“运行中子代理数”的统计口径一致。

---

### 5. 待处理按钮单例性与 Button 嵌套
- **结论**: **[OK]**
- **审查事实**:
  1. **按钮单例性**: `data-oco-runtime-reply`（once/always/reject）及 `data-oco-runtime-question`（answer/reject）仅且只在 `session-runtime.tsx` 左栏的 `data-oco-runtime-attention-panel` 中渲染。通道卡片中仅显示状态字样（“等你批准 · 在左侧处理”），无重复按钮。
  2. **Button 嵌套**:
     - 通道卡片中，卡片头部折叠按钮 `[data-oco-runtime-tool-toggle]` 与底部的“进入 ›”按钮 `[data-oco-runtime-child-toggle]` 是平级兄弟节点（包含在同一个父级 `<div>` 中），不存在嵌套。
     - 名册列表项为带 `onClick` 的 `<div>`，内部无 `<button>`。
     - 面包屑为平级 `<button>` 列表。
     - 详情面板关闭按钮独立定位。
     - 全局 `button button` 选择器计数为 0。

---

### 6. 配色规范与测试代码分支
- **结论**: **[OK]**
- **审查事实**:
  1. **颜色硬编码**: 除 `session-runtime.tsx:527-541` 根节点唯一定义的 15 个 `--rt-*` CSS 自定义属性外，全仓库业务代码无任何十六进制（`#...`）颜色硬编码。所有组件均规范使用 `var(--rt-*)` 或 `color-mix(...)`。唯一一处十六进制外的显式颜色是详情面板的半透明投影 `rgba(0, 0, 0, 0.3)`，符合规范。
  2. **测试专用分支**: 源码中不存在针对 `NODE_ENV === "test"`、`isTest` 或嗅探测试专用 class 的分支。减少动画标准执行标准媒体查询 `@media (prefers-reduced-motion: reduce)` 与 Tailwind `motion-reduce:animate-none`。

---

### 7. 多语言 (i18n) 完整性与英文硬编码
- **结论**: **[应修缺陷]**（键对齐 OK；详情面板存在英文硬编码 D-07）
- **文件与行号**:
  - `packages/app/src/components/session/session-runtime-mechanism-view.tsx:762, 772`
- **审查事实**:
  1. **三语键对齐**: `session-runtime-i18n.ts` 中 `en`, `zh`, `zht` 词典键严格完全对齐，占位符一致，单测 `session-runtime-i18n.test.ts` 全部通过。
  2. **英文硬编码 (D-07)**:
     在详情面板中：
     - 行 762: `<span class="font-semibold text-text-strong">Input:</span>`
     - 行 772: `<span class="font-semibold text-text-strong">Output:</span>`
     这两处为未经 i18n 函数转译的纯硬编码英文字符串。在中文/繁体环境下，上下行的“耗时:”、“开始:”、“调用 ID:”均已汉化，唯独这两项依然显式展示英文。
- **建议修法**:
  在 `session-runtime-i18n.ts` 中新增 `"tool.detail.input"` 与 `"tool.detail.output"`，并在视图中通过 `t(...)` 渲染。

---

### 8. 已知待评审小项核查
- **结论**: **[3 项全部核实为真实缺陷 / 异味]**

#### 8a. `toolErrorOf` 中 `(tool as {error?}).error` 是死分支 (D-08)
- **文件**: `packages/app/src/components/session/session-runtime-mechanism.ts:39-40`
- **事实**: `RuntimeTool` 定义及 `toolsOf` 构造器中从未设置过 `error` 属性（错误文本均记录在 `tool.lastOutput` 中）。代码强行将其 cast 为 `{ error?: string }`，运行时永远为 `undefined`，纯属死分支。
- **建议修法**: 移除两行无效检查。

#### 8b. `session-runtime-mechanism.ts` 中文类型注释风格不一致 (D-09)
- **文件**: `packages/app/src/components/session/session-runtime-mechanism.ts:6-20`
- **事实**: `MechanismSlot` 中的多行类型注释（如 `// RuntimeTool.id，稳定身份`、`// 派发边活跃（裁定 4）`、`// 仅子代理槽...`）直接残留了计划文档的中文草稿，与 upstream 仓库及其余代码库的全英文注释约定格格不入。
- **建议修法**: 调整为纯英文技术注释。

#### 8c. “其他异常”误将用户主动拒绝算入异常 (D-04)
- **文件**: `packages/app/src/components/session/session-runtime.tsx:289-295`
- **事实**: 用户点击拒绝（Deny）权限后，OpenCode 将 tool 状态置为 `error`（"Permission denied"）。`otherAttentionTools` 使用 `t.state === "error" || t.interrupted || Boolean(t.awaiting)`，未排除已终态的取消/拒绝操作（`t.cancelled`），导致每一条被用户主动拒绝的工具在离开当前 4 槽位后，都会永久堆积在左侧“其他异常 N”中，会话越长警报越多且无法清除。
- **建议修法**: 在计算 `otherAttentionTools` 时增加对用户主动拒绝/取消状态（如 `t.cancelled`）的过滤。

---

### 9. 其他正确性缺陷与边界情况

#### 9a. 深度 ≥2 的孙代理名称丢失与生命周期回退 (D-05)
- **文件与行号**: `packages/app/src/components/session/session-runtime-mechanism-view.tsx:112-128, 258`
- **场景**: 进入多层嵌套子代理（根 -> 子 -> 孙）。
- **分析**: `agentNameFor(id)` 和 `currentChildInfo` 仅在 `props.model().tools`（根模型工具）中通过 `sessionID` 查找对应的工具行。孙代理是由子代理启动的，只存在于子代理的 `tools` 中。查找结果恒为 `undefined`，导致顶部面包屑显示为裸 UUID（如 `explore › ses_12345` 而非 `explore › worker`），且子代理加载态生命周期被盲目回退为 `"running"`。
- **建议修法**: 借助 `treeNodes` 树结构或传入的 `childOf` 递归定位孙代理对应的工具信息。

#### 9b. 溢出通道 `data-oco-runtime-overflow` 契约违背 (D-06)
- **文件与行号**: `packages/app/src/components/session/session-runtime-mechanism-view.tsx:461`
- **场景**: 当有 >3 个子代理同时运行时，第 4 通道作为溢出节点显示 `+N (k 运行中)`。
- **分析**: E2E 契约要求属性值为 `data-oco-runtime-overflow=tools|children`。代码中直接写死了 `data-oco-runtime-overflow="tools"`，即使溢出的全部为子代理亦标为 `tools`。
- **建议修法**: 根据溢出切片中主要包含的 slot 类型动态赋值为 `"children"` 或 `"tools"`。

#### 9c. 空会话连线与标签显示“派发 0 · 并行”(D-10)
- **文件与行号**: `packages/app/src/components/session/session-runtime-mechanism-view.tsx:213, 666`
- **场景**: 新建且无消息交互的空会话。
- **分析**: `mechanismOf` 返回 `empty: true`，但视图中派发连线照常绘制虚线总线，中间标签显示“派发 0 · 并行”，回填节点显示“回填 → 主 agent 0 / 0”，语义不贴切。
- **建议修法**: 当 `mechanism.empty` 为 true 时，不渲染中间派发标签文本或显示为空闲状态。

#### 9d. 窄屏（< 560px）竖排连线脱节 (D-11)
- **文件与行号**: `packages/app/src/components/session/session-runtime-mechanism-view.tsx:382, 617`
- **场景**: 宽度小于 560px 时。
- **分析**: 卡片容器已通过 `data-oco-runtime-rail="vertical"` 转为单列竖排，但派发总线和汇回总线依然在顶部和底部按 4 列横向（12.5%, 37.5%, 62.5%, 87.5%）绘制 4 条 drop 垂线，与垂直排列的卡片完全错位，未落实设计稿中“左侧虚线竖轨表示层级”的规范。
- **建议修法**: 在 `isNarrow560` 下调整连线为单轨竖向树状排布或在极窄屏下隐藏横向派发总线。

#### 9e. 子代理同步失败无反馈 (D-12)
- **文件与行号**: `packages/app/src/components/session/session-runtime-mechanism-view.tsx:264`
- **场景**: 网络异常或后端 404 导致 `sync(id)` 失败。
- **分析**: `createChildSync` 将失败项记录在 `failed` 集合中，但视图层只在 `currentChildModel()` 为空时统一显示 `{t("child.loading")}`，导致界面无限期卡死在“加载中…”，无法感知失败也不能就地重试。
- **建议修法**: 将 `childSync.failed` 接入视图，失败时替换为“加载失败，点击重试”按钮。

---

## 修复实施建议路径

1. **第一优先级（阻断修复）**:
   - 彻底修复 **D-01**: 将 `session-runtime.tsx` 中的 `live` 响应式依赖与 `part.text` 解耦；重写 `session-runtime-mechanism-view.tsx` 中的 `<For each={lanes()}>`，改用稳定键值的 `keyed` 或 `<Index>`，根治键盘焦点丢失和流式全卡重建。
2. **第二优先级（数据与多语言修复）**:
   - 修复 **D-02**: 子代理思考框绑定到当前进入的会话模型，修复思考流错位。
   - 修复 **D-03**: 统一步骤底栏与名册的子代理去重口径。
   - 修复 **D-04**: 过滤“其他异常”中用户主动拒绝与已取消的工具。
   - 修复 **D-05** 与 **D-06**: 修复孙代理面包屑 Agent 识别，及溢出通道的 `tools|children` 属性契约。
   - 修复 **D-07**: 消除 `Input:` / `Output:` 英文硬编码。
3. **第三优先级（打磨与代码质量）**:
   - 清理 **D-08** 死分支与 **D-09** 中文注释。
   - 优化 **D-10** 空状态展示、**D-11** 窄屏竖排连线与 **D-12** 同步失败重试。
