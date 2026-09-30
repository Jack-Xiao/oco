# 当前状态

唯一的当前状态入口；队列见 [NEXT](NEXT.md)。详细历史和 ADR 按需读取。

## 基线与并行工作

- 本文件更新于 2026-09-30。当前 main 产品基线 `d1a3607`（含 C1 与路径加固，未推送）；P1b 产品代码 `6343f7b`。实时版本以 `bun run brief` 为准。
- 已有 P0、P1a、P1b-1 的本地原型及验收记录，以及 P1b 稳定性收尾（NEXT 第 1 步与第 2 步的大部分）。产品基线见 [P1b-1 验收](evidence/p1b1-acceptance.md)、[ADR-006](adr/006-p1b1-sessions-sidebar.md)、[稳定性收尾](evidence/p1b-stability.md)。不是已发布版本。
- C1 已实现并验证（`3bc386f`）；C1 路径加固与两个点击补点已实现并验证，已提交并快进合入 main（本地，未推送）。C2 来源调查与模块测试已提交（`c427722`）；HTTP/持久化与 blob 缺失测试 5/5 PASS（本批）。单轮 Diff 展示已实现并提交（`7fd3bd5`，补丁 0007）。模型驱动的空 Diff 轮次 E2E NOT RUN。

## P1b 稳定性收尾（代码提交 `6343f7b`；测试运行于 dirty `e67129d`）

| 项目 | 状态 | 证据 |
| --- | --- | --- |
| 旧连接晚到事件/快照不回写新连接 | 核查通过；修复快照 401 时未关事件流、被取代尝试可动看门狗的边角问题 | 单元测试（含变异检查） |
| 等模型期间不发旧请求 | 修复：原 0004 先抓草稿再等，改稿后发旧内容并清掉新稿。现为单一待发意图，改稿/Esc/取消按钮撤销并保留草稿，重复提交忽略，关面板不发送 | `p1b-pending-send` 7/7；旧版负向对照 exit 1 |
| 模型加载可见提示 | 完成（加载超过 800 ms 的提示 + 待发横幅） | `p1b-pending-send` loading-hint |
| 受控断流：重连后快照与增量一致 | 完成（硬断、增量、静默断流） | `p1b-reconnect` 5/5 |
| 搜索只覆盖最近 200 个会话 | 侧栏与搜索框明确提示；分页/服务端搜索未做 | `p1b-reconnect` search-scope-hint |
| 等待中切换连接 | E2E 补测通过：旧待发请求未提交到任何端点，草稿保留；机制是宿主拒绝旧绑定的提交（待发意图本身仍会触发）。变异对照（去掉宿主绑定检查）FAIL | [`p1b-switch-pending`](evidence/p1b-switch-pending.md) 2/2 |
| 会话消失/服务不可达的可恢复错误界面、未知类型兜底 | 未做 | — |

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
