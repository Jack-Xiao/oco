# 当前状态

唯一的当前状态入口；队列见 [NEXT](NEXT.md)。详细历史和 ADR 按需读取。

## 基线与并行工作

- 本文件更新于 2026-09-30。当前 main 含 C1 焦点收尾与 T010 错误恢复（`3e67fc7` 及其合并提交，补丁 0001–0008）与测试提速（`23c0954`、`376470e`）。本地，未推送；P1b 产品代码 `6343f7b`。实时版本以 `bun run brief` 为准。
- 已有 P0、P1a、P1b-1 的本地原型及验收记录，以及 P1b 稳定性收尾（NEXT 第 1 步与第 2 步的大部分）。产品基线见 [P1b-1 验收](evidence/p1b1-acceptance.md)、[ADR-006](adr/006-p1b1-sessions-sidebar.md)、[稳定性收尾](evidence/p1b-stability.md)。不是已发布版本。
- C1 已实现并验证（`3bc386f`）；C1 路径加固与两个点击补点已实现并验证，已提交并快进合入 main（本地，未推送）。C2 来源调查与模块测试已提交（`c427722`）；HTTP/持久化与 blob 缺失测试 5/5 PASS（本批）。单轮 Diff 展示已实现并提交（`7fd3bd5`，补丁 0007）。模型驱动的空 Diff 轮次 E2E NOT RUN。

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
| 搜索只覆盖最近 200 个会话 | 侧栏与搜索框明确提示；分页/服务端搜索未做 | `p1b-reconnect` search-scope-hint |
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
