# 当前状态

唯一的当前状态入口；队列见 [NEXT](NEXT.md)。详细历史和 ADR 按需读取。

## 运行视图 M3（补丁 0019 追加，2026-10-04；在分支 `claude/nostalgic-gates-ef74ca`，未合入 main，未推送，未部署 Remote）

- 运行视图改为**固定框架**（用户两轮反馈后定稿；评审稿 [v3](superpowers/specs/runtime-m3-fixed-layout-mockup.html)）：
  - 顶栏：状态、需你处理数、会话数、停止、最后事件，右侧常驻时间轴（● 实时 / ⏮ 回放 + 步骤滑块）。
  - 左栏：“需你处理”（批准/总是/拒绝只在这里，每种一次）+“其他异常 N”；子代理名册（本会话全部子代理、当前活动，点行进入）。
  - 中间树：主节点（agent、模型、第几次请求、焦点句、四段阶段条）+ 固定高度思考框；派发线 → **固定 4 条通道**（子代理优先，空槽显示“空闲”，溢出 +N）→ 汇回 → “回填 x / y”。一轮结束后保留最近一次派发（“上一次派发 · 第 N 次请求”）。
  - 卡片头打开叠加的详情面板，不挪动任何框；子代理“进入”后树换成子树，面包屑返回。
  - 会话日志最新在上；状态栏含用量、上下文、花费和图例。
  - 自带 Tokyo Night 风格配色（`--rt-*` 只在根节点定义一次），全部等宽字体。
  - 宽 ≥ 900 时整屏固定、内容变化不改变任何框的位置尺寸；窗口过矮时整体滚动而不重叠。< 900 单列堆叠（需你处理 → 树 → 名册），< 560 通道单列。
- 检查（本轮实测，vendor HEAD `6164506`）：session 单测 218/218，test:browser 48/48，vendor 类型 0 错误；根 `verify:brief` typecheck PASS、unit 190/190；E2E（mock，独立服务 4617）`c5-runtime` en 34/34、zh 34/34（含 width-1600 测内层框架不滚动且状态栏可见、parallel-subagents、geometry-stable、focus-stable 与 focus-on-change（两项均有去掉修复的对照 FAIL）、reply-in-panel），`c4-trajectory` 17/17；补丁 0001→0019 干净重放 19/19，重放树单测 218/218。终审 12 条全部处理（含窄屏竖轨、子代理加载失败可重试）。真实界面在本机最高窗口（框架 601 px）下 1600/1100 宽不滚动、状态栏可见。
- 本地包：`oco-0.0.4-a66baa8.vsix`，已安装到本机 VS Code（需 Reload Window）。
- NOT RUN / 限制：亮色主题（用户裁定不做）；嵌套 ≥2 层子代理 E2E（mock 不产生孙会话）；真实模型长会话性能；Remote（gcp-workstation）未部署。

## 运行视图 M2（补丁 0019 追加，2026-10-03；在分支 `claude/nostalgic-gates-ef74ca`，未合入 main，未推送；已部署 gcp-workstation）

- 运行视图支持在焦点区直接处理需要你的时刻：
  - 权限可以允许一次、始终允许或拒绝；提问可以“去对话中回答”或直接拒绝。回复都发给请求自己所在的会话，子会话的请求也一样。
  - 停止按钮只在实时模式、且根会话忙碌时显示；停止后先显示“已请求取消”，再显示“已取消”。
  - 429 重试会显示倒计时。
  - 子代理行可以展开一层，显示子会话的焦点、活跃工具和生命周期，并提供“在对话中打开”。task 的状态和子会话的生命周期分两段文字显示（后台 task 不会被误当作已结束）。
  - 回看时 DOM 中没有任何回复或停止按钮。
- 补丁 0019 追加 M2 后共 15 个文件，+4258/−5，在干净 `51ef4be` 上与 0001–0018 依序应用 19/19。
- 检查（本轮实测）：
  - vendor 类型 0 错误；session 单测 147/147。
  - 根 `verify:brief`：typecheck 0 错误，unit 188/188。
  - E2E（mock，独立服务 4617）：`c5-runtime` 英文 16/16、中文 16/16，回归 `c4-trajectory` 17/17。
  - 证据：[验收](evidence/runtime-m2-verification.md)、[E2E 与断言对应](evidence/runtime-m2-e2e.md)。
- NOT RUN 与限制：
  - 未验证的环境：真实模型、Remote（例如 gcp-workstation）。
  - 时钟偏差可能让“已请求取消”提前消失或一直显示。
  - 停止不清空待办和排队中的消息。
  - 一轮超过 8 个子代理、同步失败、缓存驱逐后重新拉取，这几条路径没有 E2E，也没有组件级测试。
  - M3（机制图、思考流、嵌套折叠、键盘/读屏、多宽度/主题 E2E）未做。
- 部署：`oco-0.0.4-9ff60a9.vsix` 已用 `scripts/deploy-remote.sh` 安装到 gcp-workstation。`extension.js` sha256 为 `c4530fd9…`，与上次部署相同（扩展端未变）；远端 `media/chat/index.html` 与 VSIX 内的哈希一致，前缀均为 `99ed8148…`，运行视图代码已在远端包内。需要在 Remote 窗口执行 Reload Window 才会生效。Remote 上的交互实测为 NOT RUN。
- 路由：Grok 完成 Task 1–4 后余额用尽（402）。Gemini 前期一直报地域错误；用户固定台湾出口后恢复，完成终审修复与 E2E 重跑。两路都不可用期间由主线程接手，记录在 [账本](evidence/delegation-runtime-m2-2026-10-03.md)。

## 运行视图 M1（补丁 0019，2026-10-03；本地已提交，未推送，未部署）

- 会话标题栏第三个视图“运行”（对话 | 轨迹 | 运行），只读，实时 + 按步骤回看：焦点区、阶段条、并行工具/子代理行、事件日志、用量（未知≠0、已结算标记）、最后事件 xx 前（推断）；子会话权限/提问也算“等你处理”；中断的请求/工具标“已中断（推断）”。**不显示“断连”**（嵌入页没有连接健康信号）。三语 en/zh/zht。设计与计划：[spec](superpowers/specs/2026-10-02-runtime-dashboard-design.md)、[M1 计划](superpowers/plans/2026-10-03-runtime-dashboard-m1.md)。
- 补丁 `patches/opencode/0019-oco-runtime-view.patch`（9 个文件，+2332/−5）在干净 `51ef4be` 上与 0001–0018 依序应用 19/19；不改宿主、桥、公共契约。
- 检查（本轮实测）：vendor app 类型 0 错误；session 目录单测 90/90（运行视图 67）；根 `verify:brief` typecheck 0 错误、unit 185/185；webview 构建 PASS；E2E（mock，独立服务 4617）`c5-runtime` 英文 9/9、中文 9/9，回归 `c4-trajectory` 17/17。证据：[验收](evidence/runtime-m1-verification.md)、[E2E](evidence/runtime-m1-e2e.md)。
- NOT RUN：真实模型、Remote、1000+ 消息真实性能（合成基准一次重建约 140–165 ms，其中约 116 ms 为既有 `buildTrajectory`）、子代理/审批界面/429/取消的 E2E、实时与事后重建的逐事件一致性对比。M2（审批按钮、子代理加载与下钻、取消）与 M3（机制图、思考流、嵌套折叠、键盘/读屏、多宽度/主题 E2E）未做；M3 前须先重构单一大 memo 与按对象引用重建的行。
- 过程：Gemini（agy）实现与跑 E2E，Claude 评审；Grok 额度不足未用。委派包装代理两次因 API 额度错误被中断，但 agy 任务自行完成并经主线程核对。`tests/unit/e2e-results.test.ts` 与 `docs/TEST-SCOPE.md` 已同步到 22 个全量套件。

## 项目委派规则收紧（2026-10-02；文档）

- AGENTS 已明确：调查、独立实现、测试和文档检查先实际委派；主线程接手需记录具体例外；请求路线、执行证据、fallback 和阶段结果留在一份短记录里。STATUS/NEXT 按任务段落读取，避免默认加载全文。
- 本轮 Gemini 订阅探测被地域限制拒绝，转 Grok 复核 PASS；链接、diff 格式与 4 项并发基线保护检查 PASS，见 [本批证据](evidence/delegation-rules-20261002.md)。产品检查及后续会话行为验证 NOT RUN；本批未添加强制拦截 hook。

## HTML 技术手册（2026-10-02；文档交付）

- 新增 [面向初学者的技术手册](technical-guide.html)：21 章，涵盖源码嵌入、宿主桥/流、身份与状态、Remote、前端/构建、12 项风险、18 个补丁与文档导览。离线单文件，带目录搜索、流程教学、风险筛选、主题与打印样式。README 已加入入口。
- 本轮文档验证：40 项 PASS（Chromium 147.0.7727.15；1440/390 布局、链接/锚点、JS、交互、打印、无外部资源请求及关键源码事实）；见 [验证 JSON](evidence/technical-guide-validation.json)、[复核说明](evidence/technical-guide-review.md)。产品构建/E2E/Remote NOT RUN（本轮仅文档）。
- Claude 只读观察：先前额度阻塞后已恢复，最新重连 mock 5/5 PASS（已读 results.json）；产品批次仍未提交，因本线程暂存文档而暂停提交。本轮只提交文档并释放暂存区，不包含其产品改动；本批 Remote NOT RUN。见 [观察记录](evidence/technical-guide-claude-observation.md)。

## 扩展界面英文化（提交 `85d4c3c`，2026-10-01；在 main 上，已部署 gcp-workstation；本地，未推送）

- 扩展（`apps/extension/src`、`package.json`）与 `apps/chat-webview/src/submit-status.ts` 不再有写死中文，界面只显示英文；对照表见 [i18n-english-strings](evidence/i18n-english-strings.md)。嵌入聊天界面（OpenCode 及补丁 0013/0014 的轨迹文案）仍按 OpenCode 语言设置切换，默认英文；`recovery.tsx` 保持按 locale 中英双语。
- 检查：typecheck PASS、unit 169/169、build PASS；E2E `t015-diagnostics`、`t014-connection`、`p1b-sidebar`、`p1b-pending-send`、`p1b-reconnect`、`t007-managed` 共 41 项 PASS（`search-scope-hint` 首轮因两条英文提示共用前缀导致测试提前取值而 FAIL，收紧等待条件后重跑 PASS）。部署 `oco-0.0.4-85d4c3c.vsix`，远程状态栏显示 `oco: Starting server…`。NOT RUN：其余 E2E 套件。

## 状态栏 oco 标志（提交 `e4cc861`、`588f821`，2026-10-01；在 main 上，已部署 gcp-workstation；本地，未推送）

- 已连接时状态栏用 `$(oco-logo)`（`contributes.icons`，单字形字体 `media/oco-icons.woff`，`scripts/build-icon-font.mjs` 生成），替代 `$(plug)`；版本不符时仍换成 `$(warning)`。其他状态图标不变；Connection 视图仍用 plug。
- 第二版按用户反馈改细：16px 下线宽约 1px，四周留白，与相邻 codicon 一致。
- 检查：typecheck PASS、unit 169/169；`oco-0.0.4-588f821.vsix` 部署 gcp-workstation（`extension.js` 未变，哈希 `f2b3bc3e…`），`scripts/remote-look.mjs` 截图确认状态栏显示新标志。NOT RUN：E2E（`t015` 的状态栏正则已同步为 `oco-logo|warning`）。
- 远程截图另见一次恢复的编辑器标签显示 `An error occurred while loading view: oco.chat`（测试 profile 残留标签，启动早期），未调查。

## 基线与并行工作

- 本文件更新于 2026-09-30。当前 main 含 C1 焦点收尾与 T010 错误恢复（`3e67fc7` 及其合并提交，补丁 0001–0008）与测试提速（`23c0954`、`376470e`）。本地，未推送；P1b 产品代码 `6343f7b`。实时版本以 `bun run brief` 为准。
- 已有 P0、P1a、P1b-1 的本地原型及验收记录，以及 P1b 稳定性收尾（NEXT 第 1 步与第 2 步的大部分）。产品基线见 [P1b-1 验收](evidence/p1b1-acceptance.md)、[ADR-006](adr/006-p1b1-sessions-sidebar.md)、[稳定性收尾](evidence/p1b-stability.md)。不是已发布版本。
- C1 已实现并验证（`3bc386f`）；C1 路径加固与两个点击补点已实现并验证，已提交并快进合入 main（本地，未推送）。C2 来源调查与模块测试已提交（`c427722`）；HTTP/持久化与 blob 缺失测试 5/5 PASS（本批）。单轮 Diff 展示已实现并提交（`7fd3bd5`，补丁 0007）。模型驱动的空 Diff 轮次 E2E NOT RUN。

## 连接后误显示「没有会话」（提交 `363e5c5`，2026-10-02；已部署 gcp-workstation）

- 原因：连上后 `oco.connState` 立即变成 connected，列表数据要等下一次合并刷新（150 ms）才渲染，中间树为空，空列表提示「This workspace has no OpenCode sessions yet」先出现（本机约 0.34 s，Remote 更长）。探针（切到不可达端口再切回）修复前 4/4 闪现。
- 修复：新上下文键 `oco.sessionsEmpty`，只在刷新后确认已连接且列表为空时为真；三条「已连接」空列表提示都改为依赖它；其间显示「Loading sessions…」。
- 检查：typecheck PASS；unit 185/185；build PASS；探针修复后 0/4 闪现，搜索无结果提示和真实空目录提示仍正常；`p1b-sidebar` 13/13（[结果](evidence/runs/20261002-004120-p1b-sidebar-c5d9/results.json)），connection-switch 新增 emptyFlash/loadingSeen 判定，去掉修复的对照运行判 FAIL。部署：`oco-0.0.4-363e5c5.vsix`（extension.js sha256 `c4530fd9…`）已装到 gcp-workstation，远端哈希一致，新开 Remote 窗口列表正常加载；用户窗口需 Reload Window。NOT RUN：其余 E2E。

## 侧栏会话列表改版（提交 `8d215c3`，2026-10-01；已部署 gcp-workstation）

- 分组只按时间：昨天 0 点以后（本地日历）的会话直接列出；更早的进折叠的「More」（显示数量）。运行中、等待权限/回答、未读的会话不论多旧都留在上面；上面为空时 More 自动展开；搜索结果平铺。
- 状态只用图标：出错 `error`；等待权限/回答黄色实心点；运行中灰色呼吸点（自定义 SVG，透明度 1↔0.3、1.6 s，`workbench.reduceMotion` 为 on 时改静态点）；未读蓝点（运行结束时不是活动面板，打开后清除，按工作区记在 workspaceState）；空闲用 `blank` 占位保持对齐。行尾只留短时间（now / 7m / 3h / yesterday / 3d / Sep 28），状态文字移到悬停提示和读屏标签，去掉「Open」。
- 加载：首屏 100 个根会话，「Load more…」每次再拉 100（服务端无游标，按更大 limit 重拉）；切换服务器/目录回到 100。搜索同时请求服务端 `search=`（标题，全部历史），结果并入列表；老版本服务端忽略该参数时退回本地过滤。去掉「只加载最近 200 个」提示。
- 检查：typecheck PASS；unit 185/185（新增 `session-groups`、feed/store 的 loadMore/search/mergeRoots）；build PASS；E2E（mock）`p1b-sidebar` 13/13 PASS（[结果](evidence/runs/20261001-155122-p1b-sidebar-20fc/results.json)），新增 sidebar-status-icons：真实 VS Code 中运行行图标为该 SVG，相隔 800 ms 的两张截图不同（动画在播）；Load more 点击后 100→200。
- 部署：`oco-0.0.4-8d215c3.vsix`（extension.js sha256 `670999f5…`）已用 `scripts/deploy-remote.sh` 安装到 gcp-workstation，远端哈希一致。`scripts/remote-look.mjs` 新开 Remote 窗口截图：昨天的 7 个会话平铺，More 10（2d/3d），时间与分组正确；当时无运行中会话，呼吸点未在 Remote 上目测。用户自己的 Remote 窗口需 Reload Window。
- 限制：原生 TreeView 不能右对齐或单独弱化时间，标题过长时行尾时间被省略号截掉；选中行的图标被主题改成选中前景色（等待点在选中行上显示为白色）；测试服务的会话都在今天，「More」分组未在 E2E 里出现（单元测试覆盖）。另跑 `p1b-reconnect` 5/5（比较器改为对照服务端最新 N 条，N = 侧栏行数：新会话把第 100 条挤出首页时它仍留在列表里，属预期）、`c3-fork` 4/4、`p1b-main-panel` 8/8。NOT RUN：其余 E2E、Remote。

## 嵌入模式去掉「更多」菜单（补丁 0018，2026-10-01；本地，未推送）

- 嵌入会话页不再显示三点菜单；归档改为侧栏会话右键「Archive Session」（`oco.archiveSession`，PATCH `time.archived`），重命名、删除仍在右键菜单。导出、分享在嵌入模式下不再有入口。
- 检查：typecheck PASS；unit 169/169；`tsgo -b` PASS；补丁重放一致；build PASS。NOT RUN：E2E、真实右键归档。

## 嵌入模式标题行合并（补丁 0017，2026-10-01；本地，未推送）

- 会话页不再显示标题栏整行；状态和审查面板开关移入会话标题行（对话与轨迹都有），上下文用量圆环在嵌入模式下隐藏。新会话页保留标题栏。
- 检查：`tsgo -b` PASS；build PASS；`c4-trajectory` 17/17（第 3 次运行；第 1 次 `subagent-link` 时序 FAIL，第 2 次启动时崩溃），见 [c4-header-actions-run](evidence/c4-header-actions-run.md)。NOT RUN：中文环境、Remote。

## 移除 Agents 视图，新增 Connection 视图（提交 `b405b19`，2026-10-01；在 main 上，已部署 gcp-workstation；本地，未推送）

- 用户决定：暂不要 Agents，但保留侧栏单独的 “∨ Sessions” 标题行。VS Code 会把容器里唯一的视图并入容器标题，所以加了一个默认折叠的只读 Connection 视图（状态、服务、目录、模式、版本、托管进程、受限模式；“状态”行点击同状态栏）。Agents 代码、命令、单元测试和 `t013-agents` 套件已删除，需要时从 `2b40651` 恢复。
- 检查：typecheck PASS；unit 166/166；E2E（mock）`p1b-sidebar` 连续 3 次 12/12（新增 `connection-view`），`t014-connection` 6/6、`p1a-identity` 14/14、`t015-diagnostics` 4/4、`t010-recover` 5/5（这四个跑在合入 `28c90ac` 之前）。
- 测试修复：`p1b-sidebar` 的重命名 / 搜索输入框会被对话 webview 异步抢回焦点（紧接命令面板读状态之后），改动后时序变化暴露为 6 次 3 失败；新增 `openInputBox` 等输入框稳定持有焦点。证据和时间线见 [agents-removal](evidence/agents-removal.md)。
- 部署：`oco-0.0.1-b405b19.vsix` 部署 gcp-workstation，远端 `extension.js` 哈希一致（`6de0210b…`），远端清单含 `oco.connection`、不含 `oco.agents`。用户需在 Remote 窗口 Reload Window。
- NOT RUN：真实模型、Remote 窗口里的实际外观（未截图复验）。

## 无面板时首开：黑屏、logo 闪屏与等待（提交 `1ad31ce`，2026-10-01；已部署 gcp-workstation；已快进合入 main（`28c90ac`））

- 现象：关掉所有面板后打开会话，依次看到灰色空编辑区、黑底骨架屏、官方 logo 闪屏、全黑空白，然后才是内容。原因：骨架屏在 `#root` 一有子节点就移除，之后露出官方健康检查闪屏和没有数据的空页面。
- 新窗口首开长会话多等 1.2–1.6 s：消息列表返回时放行了暂缓的 `/provider`，页面随后补取被截断的父消息（`fetchMessage(parentID)`），在单线程服务端上排在 `/provider` 后面。
- 改动：
  - 骨架屏用 VS Code 编辑区底色、层级高于闪屏，保留到 `#root` 出现文字或输入框；“无法连接”页要持续 1.5 s 才算；最多 10 s；不做淡出。
  - `/provider` 改为页面报告 `painted` 后放行，上限 10 s。
  - 试过跳过启动健康检查：只省 0–30 ms，且隧道半断时显示错误页面、不会自动恢复，已撤回。
- Remote 交替实测（与已装 `d73bf91`，新窗口里依次打开 3 个会话，各 3 组；测试版带跳过健康检查）：
  - 已装版本 18 次打开都有黑屏阶段和 logo，测试版 18 次都没有。
  - 新窗口首开中位约 2.9 → 2.3 s；消息到内容出现 1.2–1.6 s → 约 0.3 s。
  - 同窗口再开约 1 s，没有可测的提速。
- 检查：
  - typecheck 0 错误；unit 168/168；build PASS；补丁 0001–0016 重放一致。
  - E2E（mock）：`p1b-theme-load` 4/4（新增 `boot-continuous`）、`t010-recover` 5/5（`initial-unreachable` 新增骨架屏已撤的断言）、`t014-connection` 6/6、`p1b-main-panel` 8/8、`p1a-identity` 14/14、`p1a-chat` 8/8、`c4-trajectory` 15/15。
  - 与另一会话同时跑的那两轮 E2E 互相干扰，加上测试端口被占，结果作废未计。
- 证据：[cold-open](evidence/cold-open.md)、Grok 只读审查 [cold-open-review](evidence/cold-open-review.md)。NOT RUN：慢隧道交替对比、真实模型。
- 部署：`oco-0.0.1-1ad31ce.vsix` 部署 gcp-workstation，远端 `extension.js` 哈希一致（`327d8e63…`）。Remote 复验（已安装扩展，探针 `deployed-1ad31ce-1/2`，新窗口里依次打开 3 个会话，共 2 组 6 次）：6 次画面都只有编辑区底色骨架屏到内容，没有黑屏阶段；logo 闪屏每次都渲染，但都在骨架屏下面。新窗口首开 2059 / 4069 ms，4069 那次主包 4 MB 下载用了 2.66 s（隧道慢）；消息返回到内容出现 0.26 / 0.37 s。同窗口再开 993–1339 ms。`scripts/remote-chat-check.mjs` BLOCKED：脚本要不带密码访问工作站 `127.0.0.1:4096`，该服务现在返回 401，脚本列不出会话便退出，未创建或删除任何会话。按约定不读、不改用户服务凭据。合入 main：`28c90ac`，由删除 Agents 会话快进。

## 子智能体卡片打开系统浏览器（补丁 0016，提交 `37f2634`，2026-10-01；已快进合入 main 并部署 gcp-workstation；本地，未推送）

- 原因：对话里的子智能体卡片是 `<a href="/server/…/session/<子会话>">`。webview 页面的 `<base>` 是 `https://file+.vscode-resource.vscode-cdn.net/…`，这个路由被解析成 https 网址；VS Code 的 webview 点击拦截不看 `defaultPrevented`，受信任工作区里直接用系统浏览器打开它。同一次点击面板也切到了子会话。
- 修复：嵌入模式下 `DataProvider` 不提供会话 href（`directory-layout.tsx`）。卡片变成无 href 的 `role="button"`，点击仍经宿主 `openSession` 在本面板打开子会话；子会话里的「返回主会话」和父会话标题本来就是按钮。
- 检查：先写用例，未修复时 `c4-trajectory` 新项 `subagent-link` FAIL（`openExternal` 收到 https 网址），修复后英文 15/15、中文 15/15；回归 `p1a-identity` 14/14、`p1b-main-panel` 8/8（mock，独立服务 4547）。上游 app `tsgo -b` exit 0；`verify:brief` typecheck 0 错误、unit 168/168；补丁 0001–0016 在固定 SHA 上重放一致。
- 限制：失败的子智能体卡片副标题不再是链接（无法从失败卡片跳转）；轨迹里的子智能体行仍不跳转。NOT RUN：真实模型。证据见 [subagent-link-0016](evidence/subagent-link-0016.md)。
- 合入与部署：快进合入 main（`37f2634`）；主检出 `vendor/opencode` 补应用 0015、0016，与 0001–0016 重放结果一致。`oco-0.0.1-37f2634.vsix` 部署 gcp-workstation：extension.js 哈希一致（`7aaf9981…`，本批未改宿主），webview 538 个 JS 文件摘要与本地包一致。需在 Remote 窗口 Reload Window。Remote 上的点击 NOT RUN。
- 追加（点击后的长条焦点框）：VS Code 的 webview 默认样式给获得焦点的 `<a>` 画 1px 外框，卡片触发元素是整行宽的 `<a>`，点击就出现长条框；撤掉 0016 的构建上同样存在，不是 0016 引入的，之前被跳浏览器掩盖。`apps/chat-webview/index.html` 加一层样式让 `a:focus` 回到浏览器默认（只在键盘焦点显示，应用样式优先）。`c4-trajectory` 15/15（`subagent-link` 新增点击外框为 `none`）、`p1a-chat` 8/8、`c1-open-file` 6/6。提交 `7809eea`，快进合入 main；`oco-0.0.1-7809eea.vsix` 部署 gcp-workstation，远端 `index.html` 与包一致（extension.js 未变，`7aaf9981…`）；需 Reload Window，Remote 上的点击 NOT RUN。

## 会话切换黑屏与首开提速（补丁 0015，提交 `d73bf91`，2026-10-01；已快进合入 main 并部署 gcp-workstation；本地，未推送）

- 黑屏原因：页面启动时只缓存当前目录最近 5 个会话的信息。切到其余会话时，上游把整个会话工作区卸载，等 `GET /session/:id` 回来再重新挂载，之后才请求消息。补丁 0015 在嵌入模式下保持工作区挂载，首开直接用宿主给的目录（`Platform.embeddedDirectory`）。页面改为新会话的输入框真正显示后才向宿主报告 `ready`，避免草稿投到旧输入框。
- 桥接 gzip 此前在真实服务上没生效：服务端自己压缩，Node fetch 解压后保留 `content-encoding`，桥因此跳过压缩，`/provider` 以 6.56 MB 原样过隧道。现在这类响应会重新 gzip，未压缩 JSON 的门槛降到 32 KiB。
- 同一文档里同时在途、完全相同的 `GET /provider` 只发一次（启动时 4 次，计算 4 × 1.1–1.4 s → 1 次）；不缓存已返回的结果，写请求之后到达的读不合并。
- Remote 交替实测（每组 14 个会话 × 2 轮）：首访出现整页空白的切换，基线每组 9/12，修复版 4 组均 0/12；首开后第一次切换 5.5–6.6 s → 1.5 / 2.4 s；首访中位 376–625 → 236–404 ms；首开内容上屏比不预置目录少约 200 ms（一个往返）。详见 [switch-perf](evidence/switch-perf.md)。
- 检查：typecheck PASS；unit 168/168；上游 `tsgo -b` 0 错误；补丁 0001–0015 重放一致；E2E（mock）`p1b-main-panel` 8/8（新增 `switch-uncached-ready`，变异对照 FAIL；`switch-uncached-no-blank` 在本机对上游代码也通过，只作回归防护）。全量 E2E（mock，21 套件）：18 个 exit 0；`p1b-sidebar`（改名、搜索）和 `t007-multiroot`（new-session-in-folder）失败，单独重跑均通过；`t013-agents` 的 `duplicate-preserves-bytes` 失败，为已记录的环境问题（`.oco-test` 是链接目录）。`OCO_BRIDGE_GZIP=1` 下 `p1a-identity` 14/14、`p1a-chat` 8/8。
- 限制：大会话在新数据到达前保留上一会话的内容，没有加载提示；首开后约 1.5 s 内的第一次点击仍要等一次 `/provider`。NOT RUN：真实模型、慢隧道对比。
- 合入与部署：原补丁号 0014 与 main 上另一批次的 0014（轨迹）重号，改为 0015，rebase 到 main 后提交 `d73bf91` 并快进合入 main。集成后 `verify:brief --build` PASS（typecheck 0 错误、unit 168/168、build）；E2E（mock）`p1b-main-panel` 8/8、`c4-trajectory` 14/14；补丁 0001–0015 在固定 SHA 上重放与 vendor 树一致。`oco-0.0.1-d73bf91.vsix` 部署 gcp-workstation，远端 `extension.js` 哈希一致（`7aaf9981…`）。
- Remote 复验（已安装扩展，探针 `deployed-d73bf91`，14 个会话 × 2 轮）：首访空白帧 0/12；首开后第一次切换 941 ms；其余首访中位 415 / 最大 621 ms；回访中位 200 ms；页面收到的 `/provider` 为 556 KB（原 6.56 MB）。用户已打开的 Remote 窗口需 Reload Window 后才加载新代码。

## 轨迹比例按钮选中状态、子智能体行（补丁 0014，提交 `ef87ac0`，2026-10-01；本地，未推送，未部署）

- 修复「时长 / 轮次 / 调用」按钮高亮不跟随点击（选中状态只计算了一次）；按钮加 `aria-pressed`。三个按钮保留。
- 子智能体（OpenCode 通过 `task` 工具启动）在轨迹里显示为「子智能体 @名称 描述 → 回答」，精简模式下不折叠；详情显示子会话 ID。跳转子会话未做。
- 检查：app 类型检查 0 错误；轨迹单元 17/17；`verify:brief --build` 0 错误、unit 164/164、build PASS；E2E（mock）`c4-trajectory` 英文 14/14、中文 14/14（独立测试服务 4537，共用服务被其他会话占用）。
- NOT RUN：真实模型下的子智能体、Remote 部署、其他回归 E2E。证据见 [c4-trajectory-0014](evidence/c4-trajectory-0014.md)。

## 轨迹多语言、工具页签、折叠步骤（补丁 0013，提交 `dc9ecc2`，2026-10-01；本地，未推送）

- 轨迹文案移入 oco 自带字典 `session-trajectory-i18n.ts`（en/zh/zht，其他语言回退英文），没有放进上游 `src/i18n`：上游的语言一致性测试要求每个键覆盖全部约 50 种语言。
- 修复语言来源：此前宿主传给 webview 的 `zh-cn` 被应用当作未知语言，**中文 VS Code 里官方界面也显示英文**。现在用上游 `detectDesktopNativeLocale` 映射（zh-cn→zh、zh-tw→zht、pt-br→br）。开发模式下可用 `OCO_DEV_LOCALE` 覆盖，因为没装语言包时 VS Code 的 `--locale` 不改变 `vscode.env.language`。
- 系统行新增「工具」页签：数据来自 `GET /experimental/tool`，按服务端当前配置和默认智能体列出，并标明不是当时实际发送的内容；工具可展开查看描述和参数 schema。
- 列表默认「精简」：每轮里连续的思考和工具步骤折成一行摘要，点击展开（参照 DeepSeek）；可切到「全部」。
- 检查：app 类型检查 0 错误；轨迹单元 15/15；app session 单元 121/121；`verify:brief --build` 0 错误、unit 164/164、build PASS；E2E（mock）`c4-trajectory` 英文 12/12、中文（`OCO_E2E_LOCALE=zh-cn`）12/12；回归 c3-fork 4/4、p1b-main-panel 6/6、p1a-chat 8/8、p1b-narrow 12/12（首次 1 项面板创建失败，复跑通过）。
- 部署：`oco-0.0.1-dc9ecc2.vsix`（extension.js sha256 `cb95294a…`，因 `panels.ts` 改动而变化）已用 `scripts/deploy-remote.sh` 安装到 gcp-workstation，远端校验哈希一致；需在 Remote 窗口 Reload Window。
- NOT RUN：真实模型、Remote 上的界面查看、装中文语言包的真实 VS Code。证据见 [c4-trajectory-0013](evidence/c4-trajectory-0013.md)。

## 对话 / 轨迹视图（补丁 0012，提交 `3979333`、`09ce32a`，2026-10-01；已快进合入 main `fdf50a0`，本地，未推送）

- 会话标题栏加「对话 | 轨迹」切换；轨迹按轮次与每次模型请求列出用户输入、上下文、思考、回复、工具调用，带输入/模型/工具三条泳道（时长/轮次/调用标尺）、token 与缓存命中、费用、推算的首 token 延迟/生成/吞吐，以及存储的原始 JSON。输入框保留，切换会话回到对话。数据只来自 sync store，宿主与桥策略不变。详情：[c4-trajectory](evidence/c4-trajectory.md)，调研：[trajectory-feasibility](evidence/trajectory-feasibility.md)。
- 检查：app 类型检查 0 错误；模型单元 11/11；app session 单元 117/117；`verify:brief` 0 错误、unit 164/164；E2E（mock）`c4-trajectory` 9/9（已登记 `DEFAULT_SUITES`，共 21 个）；回归 p1a-chat 8/8、c3-fork 4/4、p1b-main-panel 6/6、c2-diff-unavailable 3/3、p1b-narrow 12/12。补丁 0001–0012 在干净上游上按序可应用。
- 真实数据（本机 OpenCode 库只读，12 个会话 260 次请求）：无负计时，单会话建模 ≤ 9.4 ms；首 token 中位数 deepseek-flash 568 ms 至 openrouter stealth 44 s。
- 部署：`oco-0.0.1-fdf50a0.vsix`（= main，产品内容与 `09ce32a` 相同）已用 `scripts/deploy-remote.sh` 安装到 gcp-workstation（extension.js sha256 `fcaa651d…` 不变，webview 更新）；需在 Remote 窗口 Reload Window。主检出的 `vendor/opencode` 已补应用 0012（核对过原状态正好是上游 + 0001–0011）；主检出的构建产物未重建，跑 E2E 前先 `bun run build`。用单独的 VS Code 实例在工作站上只读查看最长会话（12 次请求）：行数、计时、缓存命中正常，切换 101 ms。
- Remote 上发现并修复：中断的请求（服务端没有结束记录）被当作运行中，时间轴拉到“现在”。改为会话空闲或非最新请求时标「已中断」，在最后保存时间处结束（`09ce32a`）。复验 unit、`c4-trajectory` 9/9。
- 同时段工作站上用户的第二个 Remote 窗口扩展宿主在断线重连后未恢复，05:19:34 被 VS Code Server 回收，其托管 `opencode serve` 随之结束（oco 只结束自己启动的进程）。用户 Reload Window 后会重新启动。
- 限制：实际系统提示词、工具定义、原始 HTTP 请求 OpenCode 不保存，不显示；订阅模型费用为 0（标“未计价”）；列表未虚拟化。NOT RUN：真实模型 E2E、全量 E2E、数千行长会话。

## fork 后侧栏选中跟随（提交 `e1e0cc4`，2026-10-01）

- 侧栏原生选中跟随活动面板的会话（fork、新建、切标签）。typecheck、unit 164/164、build PASS；E2E（mock）`c3-fork` 4/4（新项 fork-sidebar-selection）、`p1b-sidebar` PASS。证据见 [c3-fork](evidence/c3-fork.md)。
- 部署：`oco-0.0.1-e1e0cc4.vsix`（extension.js sha256 `fcaa651d…`）已用 `scripts/deploy-remote.sh` 安装到 gcp-workstation；需在 Remote 窗口 Reload Window。Remote 上的 UI 行为 NOT RUN。
- `scripts/package-vsix.sh` 的 vsce 固定为 4.0.0（原 bunx 缓存损坏），已一并提交。

## 首次打开会话提速（2026-10-01）

- 第三轮（替换 `/provider` 预取）：首屏只需要会话消息，但消息请求常被服务端正在算的 `/provider`（大模型目录下每次 1.1–1.4 s，单线程）拖 1 s 以上。改为去掉预取，宿主把文档启动时的 `GET /provider` 暂缓到该文档第一个消息列表有响应之后，最多 3 s。Remote 与已部署的 `7ddac21` 交替 4 轮：冷开输入框中位 3297 → 1360 ms，同窗口第二个会话 1892 → 787 ms。详见 [首开提速证据](evidence/first-open-perf.md)。
- 第三轮检查：typecheck PASS；unit 164/164；E2E 默认 20 套件（mock）：16 套件全过；`c3-fork` 1 项失败，复跑 3/3；`t013-agents` `duplicate-preserves-bytes` 失败，基线同样失败（`.oco-test` 链接到主工作区，"隔离配置"路径判断不成立，环境原因）；`p1b-narrow` 新版 3 次各有 1–2 项失败，基线 3 次中 2 次也有类似失败（布局宽度、新面板未出现），判断为既有不稳定。
- 两个撤回的尝试：预取结果短时复用（4 份大响应同时到达面板，首屏反而慢 1 s）；先预取 `/session/:id`（没有改善）。

- 改动：markdown worker 语法按需加载（9.9 MB → 2.17 MB）；静态骨架屏 + 内联主题预载 + 主包 modulepreload；宿主在面板创建时预取 `GET /provider`（只用一次）；Remote 下宿主对 ≥256 KB 的 JSON 响应做 gzip 再发给面板（`/provider` 6.5 MB → 约 0.57 MB，面板用 `DecompressionStream` 解压）。详情、撤回的尝试和原始数据见 [首开提速证据](evidence/first-open-perf.md)。
- Remote 实测（gcp-workstation，隧道快，逐轮交替，每组 4 轮有效）：输入框出现中位 2979 → 2383 ms，内容完成中位 3237 → 2304 ms；骨架屏 336–395 ms 出现（旧版在此之前空白）。慢隧道下未做交替对比。
- gzip：用户真实会话日志（慢隧道）里首个会话约 17 s，其中 `/provider` 返回后约 5.7 s 无请求，与 6.5 MB 经隧道传输吻合。gzip 的 Remote 交替对比 NOT RUN（测试中工作站重启，用户的 4096 服务未运行）。
- 部署：`oco-0.0.1-7ddac21.vsix`（extension.js sha256 `9984e91e…`）已用 `scripts/deploy-remote.sh` 覆盖安装到 gcp-workstation，登记路径复查正确；需在 Remote 窗口 Reload Window 生效。打包时 `bunx @vscode/vsce` 缓存损坏，改用 `npx -y @vscode/vsce@3` 跑同一脚本。
- 变基到 main `344600e` 后复验：typecheck PASS；unit 165/165；E2E（mock）`p1a-chat` 8、`p1a-identity` 14、`p1b-theme-load` 3、`t010-recover` 5、`p1b-main-panel` 6、`c3-fork` 3 全部通过，`OCO_BRIDGE_GZIP=1` 下 `p1a-identity` 14/14。`scripts/deploy-remote.sh` 同样改为在扩展目录外暂存。
- 变基前：typecheck PASS；unit 145/145；E2E（mock）`p1a-identity` 连续 6 次 14/14，`p1b-theme-load`、`p1a-chat`、`t010-recover`、`p1b-main-panel` 全部通过；`OCO_BRIDGE_GZIP=1`（所有 JSON 都压缩）下这 5 个套件无失败。NOT RUN：其余 E2E、真实模型。[remote-install](remote-install.md) 已修正：暂存目录不能放在扩展目录里（否则会被 VS Code Server 登记，扩展从窗口消失）。

## 消息 fork 按钮（补丁 0011，2026-09-30；验证运行于 `d3ec2e9` + 本批改动）

- 用户消息：在 Revert 与 Copy 之间加 fork 按钮，行为同 `/fork`（新会话止于该消息之前，原文回填输入框）。
- 助手回复：在“复制回复”旁加 fork 按钮，保留整轮回复，切点为该轮之后的下一条用户消息；最后一轮则整段复制；输入框留空。输出中不显示，会话忙时不执行。
- 图标为自绘 `oco-fork`（v1/v2 图标集各加一项）。
- 新会话经宿主 `openSession` 在当前主面板原地打开（ADR-007），原会话不变。只复制对话，不回滚工作区文件。
- 证据：[c3-fork](evidence/c3-fork.md)；E2E `c3-fork` 3/3（mock）；p1a-chat、c1-open-file、c2-diff-unavailable、p1b-main-panel 均 exit 0（mock）。NOT RUN：真实模型、全量 E2E。

## 设置页高级开关（补丁 0009、0010，2026-09-30；验证运行于 `4d56f63` + 本批改动）

- 0009：设置页不再请求 `/pty/shells`（宿主拦截 → 面板崩溃）。修复前 4 个高级开关各自触发面板错误，修复后 0/4。
- 0010：面板内默认打开文件树、命令面板（搜索）、服务器状态和显示智能体；每个配置档只应用一次（`ocoEmbeddedDefaultsApplied`），用户之后关掉的保持关闭（新配置档探针：默认全开 → 关闭文件树 → 重启后仍为关）。
- 限制：截图里能看到状态按钮、侧栏按钮和智能体选择器；标题栏搜索按钮没看到，未查。脚本模型探针为临时脚本，未纳入 E2E 套件。NOT RUN：全量 E2E、真实模型。

## v0.1 收尾批次（2026-10-01；分支 `claude/v01-completion`，验证运行于 `2b40651`）

- T007 托管模式：`oco.serverMode = managed` + `oco.opencodePath`，每窗口一个 `opencode serve`（127.0.0.1、随机端口、内存随机密码），多面板共用；异常退出不自动重启；只结束自有进程。`t007-managed` 7/7（mock）。
- T013 Agents 视图（2026-10-01 已按用户决定移除，见上）：有效列表 + 来源（内置/项目文件/用户文件/配置文件）+ 待生效；新建、复制（原样）、打开原文、确认后重载配置（不重启服务，重载后侧栏立即重连）；非回环服务只读。`t013-agents` 6/6 ×2（mock）。
- T015：状态栏服务版本/模式/未验证版本提示；`oco: Export Diagnostics`（脱敏）、`oco: Show Log`。`t015-diagnostics` 4/4（mock）。
- T018：`scripts/package-vsix.sh`、`scripts/deploy-remote.sh`、[CHANGELOG](../CHANGELOG.md)、[使用与故障说明](USER-GUIDE.md)。
- Remote-SSH（gcp-workstation）：已部署；独立 VS Code 实例经 Remote-SSH 查看，连接用户服务 1.18.33、会话列表、Agents、打开会话、诊断导出均正常；新建测试会话后发送、Escape 取消（服务端 `MessageAbortedError`）、点击回复中的远端文件路径（定位到行）均通过（`scripts/remote-chat-check.mjs`，测试会话已删）。远端断网恢复、本机粘贴图片、托管模式 NOT RUN。
- 检查：typecheck 0 errors；unit 161/0；build PASS；`p1b-reconnect` 5/5（既有 search-scope-hint FAIL 未复现）。真实模型、全量 E2E NOT RUN。详情：[v01 证据](evidence/v01-completion.md)。
- T007 多根工作区：一次一个当前文件夹（默认第一个），“oco: Select Workspace Folder” 切换、按工作区记住；侧栏标题显示文件夹名；已开面板不受影响；托管模式的连接身份改用进程启动目录，切换文件夹不会让面板失去绑定。`t007-multiroot` 5/5（mock，运行 `20260930-174425-t007-multiroot-4df1`）；复跑 `t007-managed`、`p1b-sidebar`、`t014-connection` exit 0。
- T017 资源基线（ADR-007，`perf` 4/4，mock）：主面板 + 3 固定面板，渲染进程 692 MB（3 可见），12 次原地切换后 780 MB；面板数恒为 4、每面板 1 条事件流；原地切换中位 251 ms，新开面板 1.2–1.9 s。
- 集成回归（main + 未提交的 fork 批次，mock）：默认 16 个套件与 3 个新套件、perf 全部 exit 0（首轮 `p1b-sidebar`、`t010-recover` 因 Agents 视图导致的测试选择器问题失败，已修测试后复跑通过）。最终包 `oco-0.0.1-44e4b8a.vsix` 已部署 gcp-workstation 并复验发送/取消/远端文件/fork 按钮；用户窗口需 Reload Window。
- fork 批次已提交（`7a1e54d`）；`t007-managed`、`t007-multiroot`、`t013-agents`、`t015-diagnostics` 已登记进 `DEFAULT_SUITES`（共 20 个）。

## 单主面板会话切换（ADR-007 第 2–4 步，2026-09-30；验证运行于 `fe20a44` + 本批未提交改动）

- 行为：最多一个主面板，点侧栏会话、打开会话、新建会话都在主面板里原地切换（宿主发 `navigate`，页面不重载）；右键或命令 `oco: Open in New Panel` 开固定面板；已显示的会话只聚焦所在面板；Reload Window 后角色保留。跨目录切换改为重建桥并重载文档（无专门 E2E）。
- 实测（mock，本机）：原地切换 254–398 ms（含命令面板操作），新开面板冷启动 2296–2477 ms。
- 检查：typecheck PASS；unit 141/141（新增 policy retarget）；构建 PASS。
- E2E 全量 15 套件（mock，构建不含最后一处 `ready` 竞态修复）：14 个 exit 0，`p1b-narrow` 失败（测试仍用"新建会话"开三个面板），已改测试。
- 竞态修复加上之后重新构建，重跑 `p1b-narrow` 12/12、`p1b-main-panel` 6/6、`p1a-identity` 14/14、`t010-recover` 5/5，均 exit 0。
- 测试适配：`frameSession` 改读页面当前会话；需要同时开多个面板的套件（p1a-identity、p1b-narrow、p1b-sidebar 第 9 步）改用 `Open in New Panel`；`nav-link-other-session` 改为断言主面板原地切换。
- 未运行：真实模型全量；跨目录切换；常驻内存测量。

## 面板保持存活（ADR-007 第 1 步，2026-09-30；验证运行于 main `3036c00` + 本批未提交改动）

- 用户反馈：每次切换编辑器 tab 回到聊天都要重新加载。原因：`retainContextWhenHidden:false`，隐藏即销毁文档，再显示时冷启动。
- 改动：面板改为 `retainContextWhenHidden:true`；隐藏不再 retire generation，也不关闭事件流；草稿在面板再次可见时投递。ADR-005 第 1、6 节已修订；新 [ADR-007](adr/007-single-main-panel.md)（单主面板在面板内切换会话，第 2–4 步待实施）。
- 检查（mock 模型）：typecheck PASS；unit 140/140；构建 PASS；E2E `p1a-identity` 14/14（`hide-retires-generation` 改为 `hide-keeps-document`：隐藏和再显示时 generation 不变，草稿仍在）；`p1b-pending-send`、`p1b-switch-pending` exit 0；`t010-recover` 首轮 3/5，两个失败用例的前提是“隐藏即重建”，已改为用 `Developer: Reload Webviews` 重建文档、在关闭前先显示旧面板，重跑 5/5。
- 未运行：其余 E2E 套件、真实模型；常驻内存未测量。

## C1 焦点收尾 + T010 错误恢复（提交 `3e67fc7`，合并入 main，2026-09-30；验证运行于合并前的分支，基线 `33433bb` + 当时未提交的 mock 测试改动）

全部 E2E 用脚本模型（`OCO_E2E_MODEL=mock`），证明 UI/宿主行为，不证明真实模型链路。详情与运行 ID：[证据](evidence/c1-focus-t010-recovery.md)。

| 项目 | 状态 |
| --- | --- |
| C1 焦点：1 s `refocus` 误伤用户主动回到聊天 | 已复现（旧代码 `c1-focus` 回到聊天 6/6 被拉回文件）。根因：VS Code 1.139.1 webview 焦点靠 250 ms 轮询，点击带来的 `did-focus` 可能在文件打开后才到。修复：页面报告 `focusAgeMs`，宿主在该次焦点上报前等待（≤约 310 ms）再打开；删除 `refocus`。`c1-focus` 3/3（共 100 次打开 0 次迟到激活）；去掉等待的变异 FAIL |
| T010 服务不可达 | 打开中断线：面板顶部提示条（重试/打开设置）；加载时不可达：oco 界面（重试/打开设置），恢复后面板重新加载、草稿保留；PASS |
| T010 会话已删除 | oco 界面（会话列表/新建会话/关闭面板），无重试、无请求循环；新会话不带旧草稿、不自动发送；PASS。草稿决定：保留在原面板存储，不迁移、不发送（无取回入口） |
| T010 未知错误 / 未知类型 | 通用界面，不显示原始响应/路径/堆栈（修复前会原样显示），去掉 Discord/报告文案；重新加载面板不空白；未知 part/tool 兜底 PASS |
| 上游补丁 0008 | `platform.recoveryView` 钩子（5 文件）；0001–0008 在 `51ef4be` 重放一致；上游 tsgo exit 0 |

`bun run verify:brief -- --build`：typecheck PASS、unit 140/0、build PASS。E2E：`c1-focus` 3/3、`t010-recover` 5/5（两次）、`c1-open-file` 6/6、`t014-connection` 6/6、`p1b-reconnect` 4/5（`search-scope-hint` 既有 FAIL，HEAD 源码对照同样 FAIL）。其余套件、真实模型 E2E NOT RUN。T010 验收项已覆盖，但只有脚本模型证据。合并入 main 后复验：verify PASS（unit 140/0）、`c1-focus` 3/3、`t010-recover` 5/5 ×2。全量定义现为 14 个套件（含 `c1-focus`）。

## 测试提速（提交 `23c0954`、`376470e`，2026-09-30；只改测试与文档）

- 全量定义统一为 13 个套件（`run.mjs` 与 `brief` 共用），按改动选套件见 [测试范围](TEST-SCOPE.md)。
- 可选本地 mock 模型（`OCO_E2E_MODEL=mock`）：13 个套件全部 exit 0，合计约 10.2 分钟（有历史数据的 11 个约 17.5 → 9.2 分钟）。mock 运行不计验收。
- 真实模型：12 个套件 exit 0；c1-open-file 3/6 **BLOCKED**（约 12:43 起测试模型不回复，同代码 mock 6/6）。结果分布在 33433bb（dirty）/ 23c0954 / 376470e，**不是同一提交的全量**。
- 单元 136/0、typecheck PASS；构建 NOT RUN（产品代码未改）。明细与运行 ID：[证据](evidence/test-speedup.md)。

## 连接设置子集 + C2/T010 收尾（提交 `92034b8`、`20f0ea1`、`092c6b3`，2026-09-30；验证运行于其提交前的 dirty `b393df6` 工作树，内容一致）

不是完整 T014/A15。详情与运行 ID：[证据](evidence/t014-connection-c2-close.md)。

| 项目 | 状态 |
| --- | --- |
| “Open Settings”入口、中文设置说明、错误状态区分（地址无效 / 无文件夹 / 认证失败 / 离线） | 完成；单元 136/136，E2E `t014-connection` 6/6 |
| c1-open-file 焦点失败 | （已被上节取代：`refocus` 已删除）真实问题（聊天面板约 16 ms 后重新激活），宿主一次性重新展示修复；`c1-open-file` 6/6，修复后 17 次运行无焦点失败（1 次模型未出 Diff 的无关 FAIL） |
| DiffUnavailable UI | `c2-diff-unavailable` 3/3（夹具；只证 UI，不证真实快照缺失全链路） |
| T010：未知类型 / 会话消失 | 未知类型 PASS；会话消失后 Restart 原本空白，已修复，`t010-recover` 2/2；错误页文案仍为上游（含 Discord） |

`bun run verify:brief -- --build`：typecheck PASS、unit 136/0、build PASS。其余 E2E 套件本批 NOT RUN。

## P1b 稳定性收尾（代码提交 `6343f7b`；测试运行于 dirty `e67129d`）

| 项目 | 状态 | 证据 |
| --- | --- | --- |
| 旧连接晚到事件/快照不回写新连接 | 核查通过；修复快照 401 时未关事件流、被取代尝试可动看门狗的边角问题 | 单元测试（含变异检查） |
| 等模型期间不发旧请求 | 修复：原 0004 先抓草稿再等，改稿后发旧内容并清掉新稿。现为单一待发意图，改稿/Esc/取消按钮撤销并保留草稿，重复提交忽略，关面板不发送 | `p1b-pending-send` 7/7；旧版负向对照 exit 1 |
| 模型加载可见提示 | 完成（加载超过 800 ms 的提示 + 待发横幅） | `p1b-pending-send` loading-hint |
| 受控断流：重连后快照与增量一致 | 完成（硬断、增量、静默断流） | `p1b-reconnect` 5/5 |
| 会话分页与搜索范围 | 2026-10-01 改为每页 100 + Load more，搜索走服务端覆盖全部历史（旧的 200 上限提示已去掉） | `p1b-reconnect` 5/5 含 search-whole-history（205 个根会话：首屏 100、Load more 可用、搜索找到第 105 个）[结果](evidence/runs/20261001-174051-p1b-reconnect-1870/results.json) |
| 等待中切换连接 | E2E 补测通过：旧待发请求未提交到任何端点，草稿保留；机制是宿主拒绝旧绑定的提交（待发意图本身仍会触发）。变异对照（去掉宿主绑定检查）FAIL | [`p1b-switch-pending`](evidence/p1b-switch-pending.md) 2/2 |
| 会话消失/服务不可达的可恢复错误界面、未知类型兜底 | 见最上节（本批，未提交） | [证据](evidence/c1-focus-t010-recovery.md) |

以下结果运行于 dirty `e67129d` 工作树（改动随后提交为 `6343f7b`），**未对干净的 `6343f7b` 全量复验**：typecheck PASS；单元测试 100/100；默认 8 个 E2E 套件均有 exit 0 的运行。首轮 p1a-chat `stream-locked` 与 p1b-narrow `question-260` 因测试模型输出失败，各重跑一次通过。p1b-ime 的真实输入法用例 NOT RUN。明细见 [运行记录](evidence/p1b-stability-runs.md)。

## C1 编辑器联动（`3bc386f`）

| 项目 | 状态 | 证据 |
| --- | --- | --- |
| 工具部件文件名点击 → VS Code 打开并定位 | 完成：read（含上下文分组，按 offset 行）、edit/write 标题、edit/write/apply_patch 文件头。补丁 0005 | `c1-open-file` 3/3 |
| 宿主路径校验 | 完成：须在会话目录内（含符号链接）、会话目录须映射本地工作区、只开普通文件、连接变化拒绝。加固：服务须为回环地址，否则拒绝；大小写按会话目录所在卷实测，不按平台假设；`path:line` / `#L` 在字面不存在时解析；修复 `math.ts:4` 被当作 URI scheme 拒绝 | 单元 24 项 + E2E 拒绝 5/5；[加固证据](evidence/c1-path-hardening.md) |
| 选区/当前文件上下文进入请求 | 复验通过（P1a 功能，本批未改） | `p1a-identity` draft-after-attacks `serverReceived: true` |
| Diff 摘要、Markdown 路径点击 | 完成：补丁 0006。Diff 摘要点文件名打开、箭头只展开；助手正文/推理中的行内代码路径（可带 `:line[:col]`、`#L`）打开并定位，普通链接与非路径代码不拦截 | `c1-open-file` 6/6（position-parse、markdown-path、diff-summary 为新增） |
| C2 可信 Diff | 来源验证完成（模块 8/8、HTTP/持久化/blob 缺失 5/5）；单轮 Diff 展示已实现（补丁 0007）：范围标签 + 空 Diff 时“不可用”行；不做会话级 Diff 与回滚 | [展示证据](evidence/c2-display.md)（E2E `c1-open-file` 6/6，运行 e1b7）、[来源矩阵](evidence/c2-diff-sources.md)、[运行时证据](evidence/c2-runtime.md) |

C1 首批检查（`3bc386f` 产品代码）：typecheck PASS；unit 117/117；上游 tsgo 0 错误；补丁 0001–0005 在 `51ef4be` 重放一致。默认 10 个 E2E 套件均有 exit 0 的运行，但不是同一次全绿：首轮全量中 p1a-chat、p1b-theme-load、p1b-ime、p1b-pending-send、p1b-switch-pending、c1-open-file 为 exit 0；p1b-sidebar、p1b-reconnect 因 worktree 符号链接路径与服务 realpath 不一致而失败（测试夹具问题，已改为 realpath），重跑 exit 0；p1b-narrow 首轮 `question-260` 失败（已知测试模型波动），重跑 exit 0；p1a-identity 两次因模型服务 `unknown certificate verification error` 导致回复未完成（提示均送达、无串会话），第三次 exit 0。p1b-ime 的真实输入法用例 NOT RUN。明细见 [C1 证据](evidence/c1-editor.md)。

路径加固 + 补点：typecheck PASS；unit 128/128；上游 tsgo（app、session-ui）0 错误；补丁 0001–0006 重放一致；webview/extension 构建成功；`c1-open-file` 6/6 exit 0，验收运行 `20260930-071232-c1-open-file-969b`（最终代码重建扩展后复跑；更早一次 6/6 用的是旧扩展包，不计）。其余 9 个 E2E 套件本批未重跑；大小写敏感真实卷、Remote-SSH NOT RUN。明细见 [加固证据](evidence/c1-path-hardening.md)。

## C2 本轮验证（2026-09-30）

`d1a3607` 加本轮未提交测试/文档；上游 `51ef4be`，Bun 1.3.10。`node tests/integration/c2-diff-runtime.mjs` exit 0：8 PASS / 0 FAIL，31 断言；另定向上游快照测试 5 PASS / 0 FAIL。真实 Snapshot/computeDiff 配合构造的消息边界，不等于 HTTP 或模型 E2E。本轮未跑 typecheck、oco unit、build、UI E2E（产品代码未改）。见 [C2 运行时证据](evidence/c2-runtime.md)。

第二轮（基线 `c427722`）：新增 `tests/integration/c2-diff-http.test.ts`，两文件一起运行 13 PASS / 0 FAIL，54 断言，exit 0。summarize 持久化到用户消息、`GET /session/:id/diff?messageID=` 读存储且按会话/用户消息限定；快照 blob 丢失时整轮 Diff 静默变 `[]`（完好文件也丢），HTTP 200。产品代码未改，未跑 typecheck/unit/build/UI E2E。

## 省 token 工作流

- 默认只读 AGENTS.md、本文件、NEXT.md 和任务点名的契约。
- 简单独立工作使用实际可用的 Grok/Gemini 订阅代理；provider/model 缺证据就记 unknown，不凭名称猜测。
- `bun run brief`：不运行检查，只汇总当前 Git 和历史证据，终端短输出。
- `bun run verify:brief`：离线 typecheck + unit；`bun run verify:brief -- --build` 再加构建。
- 明细：`.oco-reports/latest.json` / `latest.md`（Git 忽略）。不会自动运行真实模型 E2E。
- 新工具自身测试已通过 15 项，涵盖坏证据、版本更新、负向分类、输出长度和失败退出等。
- 最近一次委派验证（2026-09-30 00:48:59 UTC，HEAD e67129d dirty true）：`bun run verify:brief` exit 0，typecheck PASS（0 errors），unit 100 PASS / 0 FAIL；未加 `--build`。`bun run brief` exit 0，stdout 27 行。历史 E2E 为 MIXED_REVISIONS（e67129d, 4082f43, 064d915），禁止跨版本拼 PASS。产品工作仍在变化；该数字是时间点记录，不是当前状态保证。
- 本次没有重新执行真实 E2E。历史记录按具体代码版本和 dirty 状态显示，不能拼成当前全绿结论。

## 历史复验

`6343f7b` 的结果见上节。更早在 `f555347` 附近曾复验 80 个单元测试、typecheck、build 通过；既有 E2E 与记录一致。详见 [阶段复核](P1B1-REVIEW-NEXT.md)。这不是本轮通过记录。

## 未验证范围

| 项目 | 状态 |
| --- | --- |
| 真实 macOS 中文输入法 | NOT RUN；浏览器合成不等价 |
| 系统剪贴板图片 | NOT RUN |
| Windows | NOT RUN |
| Remote-SSH、团队实际服务 | BLOCKED |

## 维护规则

当前事实只更新本文件，当前队列只更新 NEXT；PROGRESS 追加批次历史。完成实现后记录准确提交与证据，再改变任务状态。全量日志/截图按需查询，不作为默认交接输入。

## 个人 GCP Workstation 连接修复（2026-09-30）

独立于 oco 产品验收：修复旧 IAM 隧道复用、GUI 的 gcloud Python 3.9 不兼容，以及 15 秒连接超时。真实 VS Code 已恢复 `~/ai` 工作区与远程终端；4 项定向检查通过。冷启动、跨睡眠/数小时稳定性 NOT RUN。oco Remote-SSH 功能验收仍未执行。见 [连接证据](evidence/gcp-workstation-20260930.md)。
