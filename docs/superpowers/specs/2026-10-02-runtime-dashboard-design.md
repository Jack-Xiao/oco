# 运行时可视化视图设计（待用户审阅）

状态：已批准（2026-10-02）；M1 已实施并提交（2026-10-03，补丁 0019）；用户 2026-10-03 授权继续 M2、M3。

## 目标
会话标题栏第三个视图（对话 | 轨迹 | 运行）。实时看一次运行的每一步，之后可回看历史会话。任何时刻能回答：现在在做什么、谁还在工作、要不要我处理、哪些信息是已证实的。

约束：不新造执行引擎；不改宿主边界；数据没有就显示“未知”；v1 含并行工具、思考流、权限等待、重试、后台子代理，嵌套 ≥2 层折叠。OpenCode 没有 agent team / workflow 引擎（核对 vendor/opencode@51ef4be）；有 build/plan/general/explore agent、`task` 子代理（可并行、可 background、`subagent_depth` 默认 1）、skill、plan 模式、`execute`（code-mode，内部嵌套调用）。

## 已确认决定
- 数据层：混合——纯函数 `buildRuntime(输入, now)`；实时与回看同一函数，回看的 now 为游标；不录制事件。
- 位置：会话标题栏第三个视图，新补丁 0019；v1 不改宿主、桥、公共契约。
- 机制图（用户 → 主 agent ⇄ 模型）**默认折叠**，默认只显示紧凑阶段条和当前工作。
- 回放只按步骤（请求/工具/结果），不做逐字打字；实时才显示流式文字。
- 历史不记录权限等待（权限表 0 行，询问只在事件流里），界面须写明，不能显示成“没等待过”。

## 第 1 段：数据契约（已确认）
RuntimeViewModel：`freshness`（observedAt、最后事件时间〔inferred，补丁在 app 内记录〕；v1 无连接健康）、`run`（状态：工作中/等你/重试中/空闲/出错/未知；`attention[]` 按优先级）、`sessions[]`（根+子，各自生命周期）、`requests[]`（阶段、start/firstToken/end、重试 attempt/next）、`tools[]`（状态、入参摘要、最后输出行、awaiting、childSessionId、background）、`usage`（known/source/settled）。
规则：1 未知≠0；2 task 调用完成≠子代理结束；3 推断必须标记 `evidence: event|inferred`；4 重试/权限/连接/焦点/游标互相独立；5 实时无未来进度、无完成百分比；6 回看按步骤；7 上下文容量（最近请求输入/模型上限，上限未知显示未知）与组成（只列块与数量，不给 token 占比）分开。界面状态（展开、焦点、跟随实时）不进模型。

## 第 2 段：画面与交互（已确认）
自上而下：顶栏（范围/状态/待处理数/最后事件 xx 前）→ 焦点区（一句标题+一句进度；优先级 需你处理>阻塞失败>当前工作>完成）→ 阶段条（准备请求→模型响应→执行工具→结果回填，事件驱动高亮）→ 活跃工具与子代理（一行一项，身份稳定，错误/等待不折叠）→ 最近结果 + 事件日志（一行一事件，动画的文字孪生） → 页脚用量（按需）→ 历史时间轴。
权限：焦点区直接写“允许修改 X？”+范围+批准/拒绝，走现有回复通道；历史回看不可点。重试来自 SessionStatus.retry；并行分支互不标“暂停”；事件久未更新只显示“最后事件 xx 前”（v1 不声称断连，见 4 项核查第 3 条）；取消先“已请求取消”后“已取消”。子代理：宽屏侧栏/窄屏原位展开或下钻，均保留全局摘要；父 task completed 与子会话结束分开；子代理最后文本不称“摘要”。回看用“暂停跟随/返回实时”；动画只辅助状态转换，减少动画时保留静态标签；工具行用 button，焦点可见，颜色之外有文字/图标，420px 靠换行。
不在 v1：快捷键、跨会话看板、导出。

### 动画清晰度原则（用户 2026-10-02 提出“清晰、直观”；参考外部帖子 x.com/slashui/status/2105850132365443528 中一帧静态图，未看到完整动画，下列为待用户确认的采纳项）
- 一帧只有一个视觉焦点；只有“正在发生”的连线播放流动点，空闲连线静止；流动方向即数据方向（派发向下、回填向上）。
- 角色固定配色并带图例（主 agent、工具、子代理、需你处理），颜色之外有文字/图标；状态用字形+文字（✓ 完成、◐ 运行、! 等待）。
- 机制图用“扇出→并行→汇回”的固定版式，对应主 agent → 并行工具/子代理 → 结果回填；版式不随更新频率变化。
- 底部“事件日志”一行一事件（时间 角色 事件），是动画的文字孪生：减少动画、回看、读屏时靠它完整表达。
- 页脚一行态势摘要（活跃/总数、最后事件 xx 前）。
- 不采纳：帖子中的虚构百分比/概率条（我们只显示有数据的值）；终端等宽风格硬套（用编辑器主题 token，窄屏换行不裁剪）；固定拓扑（我们的拓扑随运行动态生成）。

## 第 3 段：补丁落点与数据流（已确认）
新增（`packages/app/src/components/session/`）：`session-runtime-model.ts`、`.test.ts`、`session-runtime.tsx`、`session-runtime-i18n.ts`（en/zh/zht）。改动：`pages/session.tsx`（view 增 `runtime` 分支）、`message-timeline.tsx`（切换三项）、`session-trajectory-model.ts`（导出请求划分与时间推断，不复制）。数据流：sync store（消息、part、session_status、permission、question、子会话）→ 选择器 → buildRuntime → createMemo → 视图（运行中每秒刷新）。批准/拒绝沿用现有权限通道，仅实时且待处理时可点。补丁须在干净 `51ef4be` 上按序 `git apply --check`。
实施偏差（M1，2026-10-03）：不改 `message-timeline.tsx`（切换器在 `session-trajectory.tsx`，它只收 `headerExtra`），不改 `session-trajectory-model.ts`（复用 `buildTrajectory(...).requests` 的公开输出）；实际改动 `session-trajectory.tsx`（三项切换、`onChat`→`onView`）、`session-trajectory-i18n.ts`（`view.runtime`）、`pages/session.tsx`（runtime 分支）。模型契约在 M1 末尾有三处**增量**扩展（未改名、未删除）：`RuntimeTool.interrupted`（请求被判为中断时仍开着的工具，推断）、焦点类型 `interrupted`、`snapshotAt(...)` 返回 `busy` 并接受“实时进行中消息 id”参数；另导出 `mergeFreshness`、`collectTreeRequests`。M1 的运行状态/待处理项会收集**根会话及其所有后代会话**的权限与提问（子代理的审批在对话视图会弹出，运行视图必须同样显示）。
桥策略已放行 `/permission/*/reply`、`/question/*/(reply|reject)`，子会话向上最多 8 级放行（`apps/extension/src/bridge-policy.ts`）。

## 4 项核查结论（Grok 只读，model/provider unknown；完整依据 docs/evidence/runtime-viz-open-items.md；我核对过其中 delta 被丢弃一条与源码一致，其余按报告）
1 权限/提问能关联到具体 tool，但 `tool?` 是可选字段（`{messageID, callID}`，对应 ToolPart.callID，无 part id；doom loop 不带）。→ `attention` 项的 toolRef 可选；没有 toolRef 的权限显示为会话级待处理，不挂在工具行上。
2 一条 assistant 消息可以有多个 step-finish（每次事件新建 part，retry 不删旧 part；一次用户 prompt 的循环会新建多条 assistant）。→ “请求”以 assistant 消息为单位，step-finish 不是请求边界；usage 按消息汇总，不按 step-finish 数请求。未查明：成功流是否永远只有一个 step-finish。
3 嵌入聊天页没有连接健康信号（`server.connected`/`global.disposed` 只触发刷新；session_status 是执行状态）。→ **v1 不得显示“断连”**；只显示“最后事件 xx 前”，由补丁在 app 内记录事件到达时间，标 inferred。真正的断连状态需要宿主新增消息（改桥契约），单独提出由集成人决定，不在 v1。第 2 段里“断连显示状态未知”据此降级。
4 子会话按 sessionID 调 `sync → loadMessages`（server-session.ts:733-847）可按需加载。LRU 对 session_status≠idle 不回收；但父会话被裁掉、无待处理权限、>4h 未更新的子会话会被 global-sync 清掉，即使仍在运行。`message.part.delta` 在 part 尚不存在时被丢弃。→ 运行视图自己持有运行中子会话的数据并测试该边界；流式文字只作“显示中”，最终文本以 part.updated 为准；订阅中途接入时流式前缀可能缺失，须标注。

## 证据与参考
- 校准（207 次运行，本机）：docs/evidence/runtime-viz-calibration.md。并行工具重叠 p90=3/最大 8；并行 task 最大 3；嵌套深度最大 2；73.5% 步骤有思考；压缩、重试无数据；permission 表 0 行。舞台：常驻 4 工具槽（+N）、3 子代理槽。
- 另一 AI 的评审与数据核查（主检出，未跟踪）：docs/design/dashboard-v4-review-for-claude.md、docs/design/dashboard-focus-review.html、docs/evidence/dashboard-v4-{review,data-audit}-2026-10-02.md。已核对：TrajectoryRequest 存在、RunModel 不存在；token 缺失值被合成 0；SessionStatus 有 retry；permission 在 store 按 sessionID 存但轨迹未读。
- 原型（演示数据，非真实事件）：.superpowers/brainstorm/65846-1790910583/content/mechanism-v{3,4}.html；服务 http://localhost:58857（key 见 state/server-info）。原型的上下文条按估算 token 定宽、逐字打字回放、“220 tok 摘要”均为错误示范，不得带入实现。

## 第 4 段：测试与验收（已确认，2026-10-02；按 4 项核查结论已调整）
原则：截图只能证明画面出现，不能证明事件语义对；按“能证明什么”分三层，每层只声称它能证明的。
① 单元测试（纯函数 `buildRuntime`，数量最多，事件夹具）：并行工具交错且行身份稳定；后台 task 调用 completed 而子会话仍运行（两个状态分开）；子会话结束与父 task 结果分开、嵌套 ≥2 层折叠；重试 attempt/next 原样入模型；权限（toolRef 可选）关联工具与“运行中”区分，无 toolRef 时为会话级待处理；usage 运行中未结算 known=false 而非 0、上限未知则容量未知；`interrupted` 带 `evidence: inferred`；游标不泄漏未来、同一数据实时与回看在步骤层一致；一条 assistant 消息多个 step-finish 时按消息汇总用量；重复消息 id、缺字段、空会话、超长名称/输出。
② 事件级测试（脚本化事件序列驱动 reducer + `buildRuntime`）：权限 asked→replied，重放历史不触发真实批准；取消在途先“已请求取消”后“已取消”；**最后事件时间随事件到达刷新，超时仅显示“最后事件 xx 前”，不出现“断连”**；`message.part.delta` 先于 part 到达会被丢弃（已核实），流式文字标“显示中”，最终文本以 part.updated 为准；运行中子会话在父会话被裁剪/>4h 未更新的边界上仍由运行视图持有；回放一致性（实时一路构建 vs 事后从历史重建，步骤层相同）。
③ E2E（真实 VS Code + mock 模型，tests/e2e）：视图切换；420/560/宽屏；明暗主题；减少动画；键盘（Enter/Space 展开、焦点可见）；长工具名/长输出不破版。未查：现有 mock 能否产出子代理、权限询问、429 重试；不能则需扩展 mock，单独列为范围项，不在批内悄悄做。
8 个场景（各自须能回答：现在在做什么、谁还在工作、要不要我处理、哪些是已证实）：多工具交错输出；主任务等待而兄弟子任务继续；子代理下钻中根任务出现待批准；重试；**最后事件久未更新（替代原“断连”）**；取消在途；部分失败后结束；历史回看中出现新事件。
不能由 E2E/截图证明（验收单写 NOT RUN 或需独立证据）：真实取消、权限生命周期、回放一致性、真实模型长会话性能、Remote 环境。未跑标 NOT RUN，缺环境标 BLOCKED，不标 PASS。
分工：契约冻结后单元测试与事件夹具交 Grok/Gemini，主线程验收；E2E 运行与诊断交 Grok，只读 results.json，不看截图。验证沿用 typecheck、unit、补丁重放检查、build；前后各记结果数字。

## 第 5 段：范围与分期（已确认，2026-10-02）
三个里程碑，各自可单独验收、单独打补丁；补丁 0019 在 M1 建立，M2、M3 往同一补丁追加；每个里程碑完成时须在干净 `51ef4be` 上按序 `git apply --check`。
- **M1 地基**：`buildRuntime` + 单元测试；第三视图（对话｜轨迹｜运行）；顶栏、焦点区、阶段条、并行工具行、事件日志、用量页脚、“最后事件 xx 前”；实时 + 按步骤回看；en/zh/zht。
- **M2 需要你的时刻**：权限/提问在焦点区批准或拒绝；重试；取消在途；子代理（含后台）单层展开/下钻，父 task 完成与子会话结束分开。
- **M3 机制与打磨**：默认折叠的机制图（扇出→并行→汇回版式，仅活跃连线流动）；思考流；嵌套 ≥2 层折叠；减少动画；键盘与读屏；E2E（三种宽度、明暗主题）。
v1 不做：“断连”状态（需宿主新增消息，改桥契约，单独提给集成人）；事件录制与逐字打字回放；上下文组成的精确 token 占比；快捷键、跨会话看板、导出；改宿主/桥/公共契约、新建 agent 执行引擎；压缩（compaction）专门画面（本机无数据，按普通请求显示）。
前提未查（须在计划阶段首先落实）：①现有 e2e mock 能否产出子代理、权限询问、429 重试；不能则 M2 的 E2E 先扩展 mock，单列工作项。②后台子代理需环境变量 `OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS`，未开时只会看到前台子代理，须写入文档。③成功流是否永远只有一个 step-finish 未查明，`buildRuntime` 不得依赖此假设。
验收：每个里程碑按第 4 段分层给证据；没跑标 NOT RUN，缺环境标 BLOCKED。

## 单独提给集成人的事项（不在 v1）
真实连接状态需要宿主新增消息（桥契约变更）。

## 下一步
用户审阅本 spec → 通过后 writing-plans；此前不写产品代码。
