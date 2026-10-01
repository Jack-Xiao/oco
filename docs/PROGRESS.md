# oco 进度与下一步

> 历史批次记录。当前状态只看 [STATUS](STATUS.md)，当前队列只看 [NEXT](NEXT.md)。下文保留，不代表现在该做什么。

更新时间：2026-09-30（P1b 稳定性收尾后）。

## 单主面板会话切换 — ADR-007 第 2–4 步（2026-09-30）

```text
日期 / 负责人: 2026-09-30 / 集成 AI（Claude Code 主线程），未委派
领取任务与写入范围: 主面板原地切换 + 在新面板打开。packages/contracts/src/bridge.ts；apps/extension/src/{panels,bridge-host,bridge-policy,extension}.ts、package.json；apps/chat-webview/src/{app.tsx,bridge.ts}；tests/e2e/{p1b-main-panel(新),p1a-identity,p1b-narrow,p1b-sidebar,vscode,run,perf,t005}.mjs；tests/unit/{bridge-policy,e2e-results}.test.ts；docs
已完成行为: 见 ADR-007
已运行检查及结果: typecheck PASS；unit 141/141；构建 PASS；mock 全量 15 套件 14 exit 0（p1b-narrow 测试未适配）；ready 竞态修复后重跑 p1b-narrow 12/12、p1b-main-panel 6/6、p1a-identity 14/14、t010-recover 5/5
未运行/被阻塞检查: 真实模型全量 NOT RUN；跨目录切换 NOT RUN；内存未测
证据与 ADR: docs/evidence/runs/20260930-1*；ADR-007
下一批任务: 真实模型全量回归（NEXT 3c）
```

## 面板保持存活 — ADR-007 第 1 步（2026-09-30）

```text
日期 / 负责人: 2026-09-30 / 集成 AI（Claude Code 主线程），未委派
领取任务与写入范围: 切换编辑器 tab 回来要重新加载 → 面板保持存活。apps/extension/src/{panels.ts,bridge-core.ts}；tests/e2e/{p1a-identity,t010-recover}.mjs；docs/adr/{005,007}
已完成行为: retainContextWhenHidden:true；隐藏不 retire；再次可见时投递草稿
已运行检查及结果: typecheck PASS；unit 140/140；构建 PASS；mock E2E p1a-identity 14/14、p1b-pending-send exit 0、p1b-switch-pending exit 0、t010-recover 5/5（首轮 3/5，测试前提修正后重跑）
未运行/被阻塞检查: 其余 E2E、真实模型 NOT RUN；内存占用未测
证据与 ADR: docs/evidence/runs/20260930-13*；ADR-007（新）、ADR-005 修订
下一批任务: ADR-007 第 2–4 步（单主面板在面板内切换、侧栏“在新面板打开”）
```

## C1 路径加固 + 点击补点（2026-09-30）

```text
日期 / 负责人: 2026-09-30 / 集成 AI（Claude Code 主线程）。委派：grok-worker 健康检查通过但执行中 600 s 无进展被终止、无产出；Gemini(agy) 10 s 健康检查无返回。路径策略、单测、验证由主线程完成。model/provider unknown。
领取任务与写入范围: 路径来源边界、大小写实测、行号解析接线；时间线 Diff 摘要与 Markdown 路径点击。apps/extension/src/{open-file-policy.ts,panels.ts}、packages/contracts/src/bridge.ts（仅注释）、patches/opencode/0006、tests/{unit/open-file-policy.test.ts,e2e/c1-open-file.mjs}、docs
已完成行为: 见 docs/evidence/c1-path-hardening.md
改动文件: 同上（开发于工作树 claude/path-validation-click-enhancement-5fa385，基线 a0ebb1f；原样复制到 claude/c1-finalize-c2-source-9d5520 提交并快进合入 main，未推送）
已运行检查及结果: typecheck PASS；unit 128/128；上游 tsgo 0 错误；补丁 0001–0006 重放一致；构建成功；E2E c1-open-file 6/6（验收运行 20260930-071232-c1-open-file-969b，最终代码重建扩展后复跑；06:08 那次 6/6 扩展包早于最后一次策略修改，不计）
未运行/被阻塞检查: 其余 9 个 E2E 套件未重跑（未改相关代码）；大小写敏感真实卷、Remote-SSH、Windows NOT RUN；新点击入口无变异负向对照
证据与 ADR: docs/evidence/c1-path-hardening.md；无新 ADR（契约字段不变）
下一批任务: C2 证据先行（before/after 来源、适用范围、降级规则），确认后再实现
```

## 收尾 + C1（2026-09-30）

```text
日期 / 负责人: 2026-09-30 / 集成 AI（Claude Code 主线程）。委派：grok-worker ×2 均因 cli-chat-proxy.grok.com 请求错误失败、无产出；gemini-worker ×1 返回 {"status":"ERROR"} 但已写出 docs/evidence/c1-file-click-survey.md（集成人抽验后保留）。model/provider unknown。测试与实现由集成人完成。
领取任务与写入范围: 收尾（STATUS/NEXT 版本表述、等待中切换连接 E2E）；C1（文件点击跳转、宿主路径校验、上下文复验）。packages/contracts、apps/extension、apps/chat-webview、patches/opencode/0005、tests、docs
已完成行为: 见 docs/evidence/p1b-switch-pending.md、docs/evidence/c1-editor.md
改动文件（提交 `3bc386f`）: packages/contracts/src/bridge.ts；apps/extension/src/{open-file-policy.ts,panels.ts}；apps/chat-webview/src/{app.tsx,bridge.ts}；patches/opencode/0005-oco-open-file-in-host.patch；tests/e2e/{p1b-switch-pending.mjs,c1-open-file.mjs,run.mjs,vscode.mjs,server.mjs,p1a-identity.mjs,p1b-sidebar.mjs,p1b-reconnect.mjs}；tests/unit/{open-file-policy,bridge-contract,e2e-results}.test.ts；docs
已运行检查及结果: typecheck PASS；unit 117/117；上游 tsgo 0 错误；补丁重放一致；E2E 默认 10 套件均有 exit 0 运行（非同一次，详见 STATUS）；p1b-switch-pending 变异对照 FAIL（预期）
未运行/被阻塞检查: 真实输入法 NOT RUN；Remote-SSH/Windows NOT RUN；C2 未开始
证据与 ADR: docs/evidence/{p1b-switch-pending,c1-editor,c1-file-click-survey}.md；无新 ADR（契约扩展为 ui.openFile）
下一批任务: C1 补点（Diff 摘要、Markdown 路径）；C2 先确认 base/head 来源；T010 错误界面单列
```

## P1b 稳定性收尾（2026-09-30）

```text
日期 / 负责人: 2026-09-30 / 集成 AI（Claude Code 主线程）
领取任务与写入范围: P1B1-REVIEW-NEXT 的 A（前置核查）与 B（稳定性收尾）；apps/extension/src/{session-feed,session-store,sessions-view,extension}.ts、apps/chat-webview/src/{app.tsx,submit-status.ts}、patches/opencode/0004、tests/unit/{session-feed,session-store,e2e-results}.test.ts、tests/e2e/run.mjs
已完成行为: 见 docs/evidence/p1b-stability.md（单一待发意图、加载提示、feed 401 修复、200 条范围提示）
改动文件: 6343f7b（产品与测试）；b2f6514（另一工作者的 STATUS/NEXT/AGENTS/brief，按用户要求原样提交）
已运行检查及结果: typecheck PASS；unit 100/100；p1b-reconnect 5/5；p1b-pending-send 7/7；旧 0004 负向对照 exit 1；默认 8 套件均有 exit 0（2 个模型输出偶发失败，重跑通过）
未运行/被阻塞检查: 等待中切换连接无 E2E；真实输入法、系统剪贴板、Windows NOT RUN；Remote-SSH、团队服务 BLOCKED
证据与 ADR: docs/evidence/p1b-stability.md、p1b-stability-runs.md；无新 ADR（未改公共契约）
委派: E2E 编写与回归由 general-purpose（sonnet）子代理完成（tests/e2e/p1b-{reconnect,pending-send}.mjs、tests/e2e/lib/proxy.mjs、p1b-stability-runs.md）；Grok 子代理沙箱只能写其他目录，未落地，单元测试由主线程补写
下一批任务: NEXT 第 2 步剩余的可恢复错误界面与未知类型兜底，之后才是第 3 步 T011/T012
```

## P1b-1 完成（2026-09-30）

- 范围按 [P1b 执行指示](P1B-NEXT-STEPS.md)：窄栏权限点击、会话侧栏、连接状态、事件状态路由与重连去重、主题、首次加载。见 [ADR-006](adr/006-p1b1-sessions-sidebar.md) 与 [P1b-1 验收记录](evidence/p1b1-acceptance.md)。
- 代码版本：`ad9da32`（产品代码）、`064d915`（单元测试）、`4082f43`（侧栏测试修复）；上游 v1.18.33 @ `51ef4be` + 补丁 0001–0004。
- 验收：
  - 单元测试 80/80（含变异检查）。
  - 默认 E2E 六个套件：第 1 轮 exit 0；第 2 轮 p1b-sidebar 因测试脚本把请求插进草稿代码块而 NOT RUN，其余 exit 0；修复脚本（`4082f43`）后 p1b-sidebar 连续两次 exit 0。
  - 窄栏负向对照 exit 1。
- 文件归属（本轮）：
  - 集成人（主线程）：`packages/contracts/src/sessions.ts`、`apps/extension/src/{session-store,session-feed,sessions-view,extension,panels,bridge-host}.ts`、`apps/extension/package.json`、`apps/chat-webview/src/{theme,main,app}.ts(x)`、`patches/opencode/0003*`、`0004*`、`tests/e2e/p1b-*.mjs`、`tests/e2e/{run,vscode}.mjs`。
  - Grok：`docs/evidence/p1b-upstream-survey.md`、`tests/unit/session-{store,feed}.test.ts`。
- 仍未验证：真实 macOS 中文输入法、系统剪贴板图片（NOT RUN）；Remote-SSH、团队服务（BLOCKED）；Windows（NOT RUN）。
- 本轮没有修改外部 OpenCode 服务，没有推送或发布。

## P1a 完成（2026-09-29）

- P1a-00～04 已完成并重新验收，见 [P1a 验收记录](evidence/p1a-acceptance.md) 与 [ADR-005](adr/005-p1a-identity-storage-connection.md)。
- 代码版本：`6ab04b6`（验收）→ 文档提交在其后；上游 v1.18.33 @ `51ef4be` + 补丁 0001、0002。
- 验收：单元 55/55；干净 clone 重建通过；`node tests/e2e/run.mjs` 在干净提交上连续两轮 exit 0（p1a-chat 8/8，p1a-identity 14/14）；负向对照 exit 1；泄漏基线通过。
- 仍未验证：macOS 系统剪贴板图片、中文输入法、受限模式 UI、连接变更 UI（NOT RUN）；Remote-SSH、团队服务（BLOCKED）；Windows（NOT RUN）。
- 已知问题（P1a 时）：窄面板权限按钮溢出、主题不跟随、输入历史按连接共享、首次提交同步竞态、隐藏面板重载后延迟恢复。其中窄面板、主题、首次提交已在 P1b-1 修复。
- 本轮没有修改外部 OpenCode 服务、推送或发布。

## 独立核查更新（2026-09-29）

- 本地原型与路线可继续；下文“P0 已完成”是原实施批次状态，**不等于所有门槛已重新验收通过**。
- 子代理复跑 `bun run typecheck`、`bun run build` 均通过；没有重新运行真实模型 UI 全套。原 UI 结果文件存在，但流式、答案、关页和重载等断言有覆盖缺口。
- 当前 `test:unit` 对应目录不存在，`test:e2e` 对应入口不存在，测试失败的退出语义需要修正。
- 静态审查发现：重挂载请求 ID/epoch 与旧流清理、桥的目录/会话约束、服务地址与全局凭据绑定有缺口；内部 tabs 路由仍能脱离面板绑定。存储需补持久化错误处理、作用域和可控并发验证。
- **当前下一批改为 P1a-00～04**，详见 [核查和实施指示](P0-REVIEW-P1-INSTRUCTIONS.md)。原下表的 T007/T010 队列在该批完成后继续；不要先增加管理页面。
- 本轮只更新审查/交接文档，没有修复实现、修改现有服务、推送或发布。

## 当前事实

- P0（T001–T006）已完成，结论：**继续首选路线**（ADR-004）。远程门槛 BLOCKED，不得宣称 Remote-SSH 支持。
- 已有：可复现构建（`scripts/setup.sh` + `bun run build`）、最小扩展（打开/新建会话、选区加入指定会话草稿、设置密码）、官方 v1.18.33 对话在 VS Code 标签页中经宿主桥连接真实服务。
- 已验证（本地、macOS、VS Code 1.139.1、OpenCode 1.18.33）：流式、工具+权限、提问、真实取消、三会话隔离、草稿恢复、未保存选区、图片字节、Reload Window、关闭标签不取消。见 `docs/evidence/p0-spike.md`。
- 未验证：Remote-SSH（BLOCKED）、团队实际服务（BLOCKED）、Windows、系统剪贴板图片、真实中文输入法（只验证了 Chromium 输入法合成路径）。主题亮暗跟随已在 P1b-1 验证。
- 上游补丁 4 个：`0001-oco-draft-insert`、`0002-oco-embedded-single-session`（P1a）、`0003-oco-narrow-dock-wrap`、`0004-oco-embedded-submit-waits-for-model`（P1b-1），均在 `patches/opencode/`。
- 已有原生会话侧栏（Sessions TreeView）与状态栏连接状态（P1b-1）。

## 下一批任务

| 顺序 | 任务 | 状态 | 进入条件 |
| --- | --- | --- | --- |
| 1 | T001–T006 P0 | DONE | — |
| 2 | P1a-00～04 修复原型边界 | DONE | 见 P1a 验收记录 |
| 3 | P1b-1 最小可用闭环（侧栏、连接状态、事件路由、窄栏、主题、首次加载） | DONE | 见 P1b-1 验收记录 |
| 4 | P1b 其余：T007 managed/多根工作区、T008 真实断线恢复与发送结果未知、T010 可恢复错误界面与兜底 | TODO | 按下一轮指示 |
| 5 | T011 编辑器上下文 / T013 Agent / T014 设置 | TODO | 暂缓（P1B-NEXT-STEPS 排除） |

## P0 实施记录

```text
日期 / 负责人: 2026-09-29 / 集成 AI（T002 源码调查委派给 Grok 子代理，仅写 docs/evidence/upstream.md）
领取任务与写入范围: T001–T006；根构建、apps/extension、apps/chat-webview、packages/contracts、patches/opencode、scripts、tests、docs
已完成行为: 见 docs/evidence/p0-spike.md §1
改动文件: 见 git log（b13134e 起）
已运行检查及结果: bun run typecheck PASS；干净 clone 重建 PASS；api-probe stream/abort PASS；t004 5/5 PASS；t005 9/9 PASS；perf 基线已记录
未运行/被阻塞检查: Remote-SSH BLOCKED；团队服务 BLOCKED；系统剪贴板图片、输入法、主题 NOT RUN
证据与 ADR: docs/evidence/{environment,upstream,p0-spike}.md；docs/adr/001–004
下一批任务: T007、T010（单会话嵌入模式优先）
```

## 未决项及默认处理

| 未决项 | 默认处理 | 何时必须解决 |
| --- | --- | --- |
| 目标 OpenCode 版本/企业修改 | 已固定并验证 1.18.33（本地）；团队服务仍 BLOCKED | 团队提供访问后重跑 E2E |
| 实际远程服务/测试环境 | 本地原型可先走；远程标未验证 | P0 尝试，T016 发布范围前完成 |
| Windows 优先级 | 暂不承诺 Windows 本地支持 | T001；正式支持声明前 |
| 上游源码引入与包管理 | 已决定：setup 脚本浅克隆固定 SHA + 补丁 + 上游锁文件 | ADR-002 |
| 官方 UI 网络/事件接入路径 | 已决定：虚拟服务源 + 宿主流式桥；共享订阅待 T008 | ADR-003 |
| publisher/扩展 ID/渠道 | 不发布；仅后续本地测试身份 | T018/T019 |

## 实施更新格式

由集成人每个可交付批次更新，不要求为每一条命令写日志：

```text
日期 / 负责人:
领取任务与写入范围:
已完成行为:
改动文件:
已运行检查及结果:
未运行/被阻塞检查:
证据与 ADR:
下一批任务:
```

## 当前推荐交接

P1b-1 已完成。下一轮范围取决于独立源码审查的结论和新的指示（见 [HANDOFF](HANDOFF.md) 当前轮交接）；在此之前不扩大到 managed 进程、多根工作区、Agent 或设置页。简单、独立的调查、机械修改和测试委派给子代理，集成人保留公共契约、同文件集成和验收责任。

## C2 模块边界验证（2026-09-30）

- 基线：main d1a3607；上游 51ef4be；本轮未提交、未推送。提取 fe04641 的两份来源调查文档，未合并该提交。
- 主线程实现 tests/integration/c2-diff-runtime.{mjs,test.ts}；Grok/Gemini 委派无产物，记录于 docs/evidence/c2-runtime-delegation.md，model/provider unknown。
- 命令 node tests/integration/c2-diff-runtime.mjs：8 PASS / 0 FAIL，31 断言，exit 0；上游 diffFull 定向探测 5 PASS / 0 FAIL，30 断言。Bun 1.3.10。
- 来源建议已收紧：哈希存在不是 blob 完整性证明；FileDiff 无 binary 标记；空 Diff 不能断言没有修改。
- NOT RUN：HTTP/模型 E2E、summary 持久化、blob 缺失负测、工具元数据、oco 全量验证/构建。没有改产品代码。
- 证据：docs/evidence/c2-runtime.md；下一步补 HTTP/持久化与 blob 缺失负测，再决定展示方案。

## C2 HTTP / 持久化 / blob 缺失（2026-09-30）

- 基线：main c427722；上游 51ef4be；Bun 1.3.10。主线程实现（未委派）。model/provider unknown。
- 新增 tests/integration/c2-diff-http.test.ts；runner c2-diff-runtime.mjs 改为同时运行两个文件（可传 runtime/http）。
- 命令 node tests/integration/c2-diff-runtime.mjs：13 PASS / 0 FAIL，54 断言，exit 0。
- 发现：blob 丢失时 numstat 失败被 git() 吞掉，整轮 Diff 变 []（推翻“该侧空串仍出补丁”的源码推断）；空列表与“无修改”不可区分。
- NOT RUN：模型驱动完整轮次、edit/apply_patch 元数据、快照树对象缺失/gc 后表现。产品代码未改。

## C2 单轮 Diff 展示（2026-09-30）

- 基线 main 4e30f48；代码提交 7fd3bd5（补丁 0007）。主线程实现，未委派。model/provider unknown。
- 检查：上游 tsgo exit 0；上游单测 9/0；补丁 0001–0007 重放一致；oco typecheck PASS、unit 128/0；build 成功；E2E c1-open-file 6/6（运行 20260930-093034-c1-open-file-e1b7，干净提交）。
- 过程：两次“no panel”因测试服务未启动；两次单项 FAIL 为活动标签判定不稳定（文件已打开），未修。
- NOT RUN：DiffUnavailable 行 E2E；其余 9 个 E2E 套件。

## 连接设置子集 + C2 收尾 + T010 有限检查（2026-09-30）

- 基线 main b393df6，改动未提交。主线程实现，未委派；model/provider unknown。
- 交付：`oco.openSettings` 与空态/标题栏/状态栏入口；中文设置说明；连接状态区分（`ConnectionSummary.issue`、错误文案）；c1-open-file 焦点竞态的宿主修复；webview Restart 经宿主重设 HTML（bridge UiAction `reload`）；代理 `intercept` 夹具。
- 验证：verify:brief --build PASS（unit 136/0）；E2E 定向 `t014-connection` 6/6、`c2-diff-unavailable` 3/3、`t010-recover` 2/2、`c1-open-file` 6/6（另 16 次连跑 15 PASS，1 次为模型未出 Diff 的无关 FAIL）。详见 docs/evidence/t014-connection-c2-close.md。
- NOT RUN：其余 E2E 套件、设置密码输入流程、受限模式、真实快照缺失全链路。
- 未标记 T014/A15 完成。

## 2026-09-30 — 个人 GCP Workstation Remote-SSH 修复

用户委托诊断本机 VS Code 连接。确认 STATE_RUNNING；旧隧道监听但读 EOF，全新隧道成功；GUI PATH 使用 Python 3.9 导致 gcloud 启动失败。替换专用 SSH helper 为每连接独立隧道，固定子进程 Python 3.13，连接超时设为 240 秒，保留备份。真实 VS Code `~/ai` 和远程终端恢复；定向检查 4/4 PASS。冷启动/跨睡眠/数小时测试 NOT RUN；不改变 oco 产品 Remote-SSH 验收状态。证据：`docs/evidence/gcp-workstation-20260930.md`。

## 测试提速（2026-09-30）

- 基线 main 33433bb；提交 23c0954、376470e（只改测试、脚本与文档）。主线程实现，未委派；model/provider unknown。
- 交付：E2E 条件等待替换固定停顿；可选本地 mock 模型（OCO_E2E_MODEL=mock，brief 归为 mock-model 特殊运行）；单元输出降噪、合并重复用例；全量定义统一为 13 个套件；docs/TEST-SCOPE.md。
- 验证：unit 136/0、typecheck PASS；mock 13 个套件全部 exit 0（合计约 10.2 分钟）；真实模型 12 个 exit 0，c1-open-file 3/6 BLOCKED（测试模型约 12:43 起无回复）。
- 过程：缩短启动等待曾让"扩展已禁用"提示盖住 dock 按钮（chat 权限点击超时），已改为先等提示再清除；轮询 hostState 会反复走命令面板，比固定等待更慢，已撤回相应改动。
- NOT RUN：同一提交的真实模型全量、构建、并行执行、不稳定率测量。证据：docs/evidence/test-speedup.md。

## C1 焦点收尾 + T010 错误恢复（2026-09-30）

- 基线 main 33433bb + main 检出里未提交的脚本模型测试改动（复制进 worktree `claude/c1-focus-t010-recovery-a216bc`，main 检出未动）。未提交。主线程实现，未委派；model/provider unknown。全部 E2E 用脚本模型。
- C1：定位 VS Code 1.139.1 webview 250 ms 焦点轮询为迟到激活来源；旧 `refocus` 误伤主动回到聊天已复现（6/6）。改为页面报 `focusAgeMs`、宿主等焦点上报后再打开，删除 `refocus`。`c1-focus` 3/3（100 次 0 迟到激活），去等待变异 FAIL。
- T010：补丁 0008 `platform.recoveryView`；`recovery.tsx` 三种界面 + 宿主 `connection` 通知提示条；修复不可达恢复后模型不加载（重新加载面板）与原始错误外泄；中途发现并修复重载循环。`t010-recover` 5/5 ×2。
- 检查：verify:brief --build PASS（unit 140/0）；上游 tsgo exit 0；0001–0008 重放一致；回归 c1-open-file 6/6、t014-connection 6/6、p1b-reconnect 4/5（search-scope-hint 既有 FAIL，HEAD 对照同样）。
- NOT RUN：真实模型 E2E、其余 E2E 套件、其他 VS Code 版本。证据：docs/evidence/c1-focus-t010-recovery.md。

## 合并 C1 焦点 + T010 分支入 main（2026-09-30）

- 分支 `claude/c1-focus-t010-recovery-a216bc`（提交 3e67fc7）合并 main 6cc350b。冲突处理：mock 测试设施（mock-llm、vscode.mjs、p1a-chat、p1b-narrow、test-server.sh）取 main 已提交版本，test-server.sh 再加回 `OCO_MOCK_LLM_PORT` / `OCO_MOCK_LLM_EXTERNAL`；STATUS/PROGRESS 两边保留。
- 全量定义加入 `c1-focus`（14 个套件；run.mjs、e2e-results 单测、TEST-SCOPE、README 同步）。
- 合并后复验（脚本模型）：verify:brief --build PASS（typecheck 0 errors、unit 140/0、build）；`c1-focus` 3/3（20260930-131610-c1-focus-c838，`focusWaits` 11，`lateActivations` 0）；`t010-recover` 首次 4/5（initial-unreachable 的 send 读到上一轮回复，测试竞态，产品行为正常），修测试后 5/5 ×2（20260930-131929-…-fd20、20260930-132119-…-c69c）。其余套件 NOT RUN。

## 设置页「高级」开关崩溃修复（2026-09-30）

- 现象：oco 聊天面板内打开设置，点「文件树 / 命令面板 / 服务器状态 / 显示智能体」任一开关，面板进入「The chat panel hit an error」。
- 根因：设置页 Shell 行调用 `GET /pty/shells`，宿主策略按设计拦截 `/pty`（403）；Solid resource 进入错误态，下一次渲染读 `shells.latest` 重新抛错，触发面板错误边界。开关本身和存储正常。
- 修复：补丁 0009 `oco-embedded-settings-no-pty-shells`（settings-v2/general-controllers.ts、settings-general.tsx）：embedded 下不请求 shell 列表，其他情况请求失败返回空列表。
- 检查：`bun run build` 通过；临时 E2E 探针（脚本模型，基于 4d56f63 + 本改动）：修复前 4 个开关各自 4/4 崩溃，修复后 0/4 崩溃，4 个开关均写入 true；关闭设置后面板显示服务器状态按钮、侧栏（文件树）按钮、Build 智能体选择器。截图 docs/evidence/settings-advanced-toggles-after-fix.png。
- 同批复验（含 0010）：0001–0010 在固定 SHA 上重放，与工作树 23 个文件一致；上游 app tsgo exit 0；verify:brief typecheck 0 errors、unit 141/0。
- NOT RUN：全量 E2E、真实模型。

## 会话列表菜单精简 + 删除会话（2026-09-30）

- 会话行 inline 只保留「Rename Session」（去掉 Open Session 图标）；右键菜单只剩「Rename Session」「Delete Session」。单击行仍打开会话；`oco: Open Session` / `oco: Open in New Panel` 仍在命令面板，E2E 依赖它们。
- 新命令 `oco.deleteSession`：需信任工作区，模态确认后 `DELETE /session/:id`，关闭展示该会话的面板，并立即从列表移除。
- 检查：typecheck 0 errors；unit 141/0；build:extension 通过。临时探针（脚本模型，4d56f63 + 本改动）：inline 仅 Rename；确认框出现，删除后服务器返回 NotFound，列表行消失，面板 1→0。右键菜单是 macOS 原生菜单，探针读不到，仅按 package.json 确认。
- NOT RUN：p1b-sidebar 等全量 E2E、真实模型。未提交。

## 面板内默认打开高级显示项（2026-09-30）

- 补丁 0010 `oco-embedded-visibility-defaults`（context/settings.tsx）：embedded 下一次性把 showFileTree / showSearch / showStatus / showCustomAgents 设为 true，并标记 `ocoEmbeddedDefaultsApplied`、`agentVisibilityInitialized`，之后以用户设置为准。已有的 oco 配置档也会应用一次。
- 检查：0001–0010 重放一致；tsgo exit 0；verify:brief unit 141/0；临时探针（脚本模型，新配置档）：新配置档四项均为 true → 关闭文件树 → 重启后仍为 false。截图 docs/evidence/settings-embedded-defaults-fresh.png。
- NOT RUN：全量 E2E、真实模型。

## 消息 fork 按钮（2026-09-30）

- 补丁 0011 `oco-message-fork-buttons`（session.tsx、timeline/message-timeline.tsx、session-ui message-part.tsx）：用户消息与助手回复都有 fork 按钮，复用上游 `UserActions.fork` 预留位与 `ui.message.forkMessage` 文案；助手回复新增 `forkResponse`，按下一条用户消息切分。
- 按钮图标：按用户给的样式自绘 `oco-fork` SVG，加入 ui v1/v2 图标集（补丁 0011 共 5 个文件）；两支分叉都带箭头；最终版 `c3-fork` 复跑 3/3（20260930-161921-c3-fork-25f3）。
- 新 E2E 套件 `c3-fork`（3 项），加入 DEFAULT_SUITES（16 个；run.mjs、e2e-results 单测、TEST-SCOPE 同步）。
- 检查：0001–0011 在固定 SHA 重放无冲突；app / session-ui tsgo exit 0；verify:brief typecheck 0 errors、unit 141/0；build:webview 通过；`c3-fork` 3/3（运行 20260930-155307-c3-fork-b400，mock）；p1a-chat、c1-open-file、c2-diff-unavailable、p1b-main-panel exit 0（mock）。
- 过程：第 2 次 `c3-fork` 运行中途 4517 测试服务被外部停止（面板显示重连），FAIL 为环境原因；本会话重启脚本模型测试服务后通过。
- NOT RUN：真实模型、全量 E2E。

## v0.1 收尾批次（2026-10-01，分支 `claude/v01-completion`，快进合入 main）

- 计划：docs/V01-COMPLETION-PLAN.md。产品：托管模式（managed-server.ts、connection.ts、endpoint.ts）、Agents 视图（agents.ts、agents-view.ts）、状态栏版本与诊断导出（diagnostics.ts、sessions-view.ts）、设置 `oco.serverMode`/`oco.opencodePath`。打包：scripts/package-vsix.sh、scripts/deploy-remote.sh、CHANGELOG、docs/USER-GUIDE.md。远端查看：scripts/remote-look.mjs、scripts/remote-chat-check.mjs（独立 VS Code 实例，不操作用户窗口）。
- 多根工作区：“oco: Select Workspace Folder”，t007-multiroot 5/5。
- 新 E2E：t007-managed 7/7、t013-agents 6/6、t015-diagnostics 4/4；perf 按 ADR-007 改写 4/4（mock）。unit 161/0。
- 真实问题：重载配置后侧栏事件流断开（改为立即重连）；已删除文件的 Agent 被误标为配置文件来源（改为待生效）；Agents 视图让 Sessions 标题按钮变为悬停显示（p1b-sidebar、t010-recover 测试已适配）。
- 集成：main + 未提交的 fork 批次，默认 16 套件 + 3 新套件 + perf 全部 exit 0（mock）。gcp-workstation 部署 `oco-0.0.1-1a6b2c7.vsix`，远端发送/取消/远端文件/fork 按钮复验通过。
- 协作：fork 按钮批次（补丁 0011）由另一会话完成，待其用户确认提交；本批未提交它，四次快进 main 时都先备份其未提交 diff，再原样重放。fork 批次提交（`7a1e54d`）后，四个新套件已登记进 DEFAULT_SUITES（共 20 个）。
- NOT RUN：真实模型全量、远端断网恢复/图片粘贴/托管模式、Windows。

## fork 按钮间距（2026-10-01）

- 补丁 0011 增加两条 CSS：元信息文字一侧补 5px，与图标按钮内的空白对齐，使“文字↔图标”和“图标↔图标”的视觉间距一致（回复行与用户消息行都改）。见 [证据](evidence/c3-fork.md#按钮间距2026-10-01)。
- 检查：build:webview 通过；`c3-fork` 3/3；`p1b-narrow` 第 1 次 layout-480 FAIL，复跑 exit 0（mock）。NOT RUN：真实模型。

## 首次打开会话提速（2026-10-01）

- Remote 实测定位：隧道吞吐在两种状态间跳变（0.6–1 MB/s 或 6–19 MB/s）；markdown worker 9.9 MB（内联了 shiki 全部语法和主题）；远端 `/provider` 6.5 MB、服务端约 1.2 s，在首屏关键路径上；主题预载脚本阻塞首次绘制。
- 改动：worker 构建换成按需加载语法（2.17 MB，其余 236 个语法 JSON 经 `__ocoAsset` 获取）；骨架屏、内联主题预载、主包 modulepreload；宿主预取 `/provider`（只用一次）；页面请求计数/日志。撤回：GET 合并（读到旧数据的风险）、桥接 gzip（快隧道下更慢）、预取 `?directory`（堵住服务端，慢 0.9 s）、预取复用（`p1a-identity` 3/6 失败）。
- 结果（Remote，快隧道，交替）：输入框出现中位 2979 → 2383 ms，内容完成中位 3237 → 2304 ms。unit 143/143；E2E（mock）`p1a-identity` 6×14/14，另 4 套件通过。NOT RUN：其余 E2E、真实模型、慢隧道交替对比。证据：[first-open-perf](evidence/first-open-perf.md)。
- 部署中发现 remote-install 暂存目录的问题并已修正文档；另一会话（`2b40651`）同时往同一工作站安装，本批改为用 `--extensionDevelopmentPath` 测试。未提交。

- 追加（第二轮）：Remote 下宿主对大 JSON 响应 gzip 后再发给面板（`/provider` 6.5 MB → 0.57 MB）。依据是用户真实会话日志中 `/provider` 之后 5.7 s 的传输空档。unit 145/145；`OCO_BRIDGE_GZIP=1` 下 5 个相关 E2E 套件无失败。Remote 交替对比 NOT RUN（工作站重启，用户服务未运行）。详见 [首开提速证据](evidence/first-open-perf.md)。
- 追加（第三轮）：去掉 `/provider` 预取，改为宿主把文档启动时的 `/provider` 暂缓到第一个消息列表有响应之后（≤3 s）。Remote 交替 4 轮：冷开输入框中位 3297 → 1360 ms，同窗口第二个会话 1892 → 787 ms。unit 164/164；默认 20 套件中 16 个全过，`c3-fork` 复跑通过，`t013-agents` 和 `p1b-narrow` 的失败在基线上同样出现。

## fork 后侧栏选中跟随（2026-10-01）

- 侧栏原生选中改为跟随活动面板的会话（fork、新建、切标签后不再停在旧会话）。详见 evidence/c3-fork.md。
- 检查：typecheck、unit 164/164、build；E2E（mock）`c3-fork` 4/4（含新项 fork-sidebar-selection）、`p1b-sidebar` 通过。NOT RUN：真实模型、Remote。未提交。

## 对话 / 轨迹视图（2026-10-01）

- 调研：OpenCode 已保存每次请求的 token（含缓存读写、思考）、费用、思考文本、工具输入输出与起止时间；part ID 编码毫秒时间，可推算首 token 与生成时长；系统提示词与原始请求不落盘。见 evidence/trajectory-feasibility.md。
- 实现（补丁 0012）：新组件与纯函数模型，`session.tsx` +7 行、`message-timeline.tsx` +3 行。按用户选择做成同面板「对话 | 轨迹」切换。
- 发现：sync store 可能同时持有同一 id 的两份用户消息，轨迹出现重复轮次，改为按 id 去重并加测试。工作区路径过长导致 VS Code IPC socket 超限，`.oco-test` 改链接到主检出的独立子目录。
- 检查：模型单元 11/11；app session 单元 117/117；unit 164/164；E2E（mock）`c4-trajectory` 9/9，回归 p1a-chat 8/8、c3-fork 4/4、p1b-main-panel 6/6、c2-diff-unavailable 3/3、p1b-narrow 12/12。NOT RUN：真实模型 E2E、Remote、全量。未提交。
- 追加（部署）：提交 `3979333`、`09ce32a`；`oco-0.0.1-09ce32a.vsix` 部署 gcp-workstation。单独的 VS Code 实例只读查看工作站最长会话（12 次请求），发现中断请求把时间轴拉到“现在”，改为「已中断」并在最后保存时间处结束，复验 unit、`c4-trajectory` 9/9 与 Remote。
- 追加（合并）：快进合入 main（`fdf50a0`），部署 `oco-0.0.1-fdf50a0.vsix`（内容同 `09ce32a`）；主检出 vendor 补应用 0012。

## 轨迹多语言、工具页签、折叠步骤（补丁 0013，2026-10-01）

- 用户决定：先把 0012 的文案改为多语言，再做系统行的工具页签（暂不做权限标灰和 MCP 分组）；参照 DeepSeek 轨迹截图，加入折叠步骤。
- 先把键放进上游 `src/i18n`，上游一致性测试失败 3 项（要求全部约 50 种语言），改为 oco 自带字典 `session-trajectory-i18n.ts`。
- 中文 E2E 发现语言来源问题：`zh-cn` 没有映射，官方界面在中文 VS Code 里也是英文。改用上游 `detectDesktopNativeLocale` 映射，并加开发用的 `OCO_DEV_LOCALE`（没装语言包时 `--locale` 不生效）。
- E2E 发现测试竞态：发送后服务端还没存下用户消息，`waitReply` 就返回了。已修复。
- 检查结果见 [c4-trajectory-0013](evidence/c4-trajectory-0013.md)。NOT RUN：真实模型、Remote。未提交。
- 追加（提交与部署）：提交 `dc9ecc2`；`oco-0.0.1-dc9ecc2.vsix` 部署 gcp-workstation（哈希一致）。Remote 上的界面查看 NOT RUN。

## 轨迹比例按钮选中状态、子智能体行（补丁 0014，2026-10-01）

- 用户反馈：比例按钮点击后图会变但高亮不变；子智能体只显示成 `task`。中途按用户要求删过比例按钮，随后用户撤回，已恢复；不加「合计」标注。
- 原因：按钮在 `For` 中生成，选中状态只算一次。改为访问函数并加 `aria-pressed`。
- 子智能体：识别 `task` 的 `subagent_type` 和 `metadata.sessionId`，单独标签和配色，精简模式不折叠，回答从 `<task_result>` 中取出。
- mock 模型新增 `task` 指令；E2E 新增 `scale-toggle`、`subagent-row`。共用测试服务被其他会话占用，改用临时目录里的独立服务（4537/4538），测完关闭。
- 检查结果见 [c4-trajectory-0014](evidence/c4-trajectory-0014.md)。NOT RUN：真实模型、Remote 部署。

## 会话切换黑屏与首开提速（补丁 0015，2026-10-01）

- 用户反馈：Remote 上打开会话仍慢；连开多个会话后，后面的切换会慢、会黑一下。
- 新探针 `evidence/switch-perf/switch-probe.mjs`：Remote 上依次点侧栏会话，逐帧采样，按消息 ID 判断目标会话是否上屏，并记录每个请求的计时。早期按“有消息行”判定，把上一会话的残留内容算成了完成，已改正，相关数据只作请求时间线参考。
- 找到三个原因：上游只缓存最近 5 个会话的信息，其余会话切换时卸载整个工作区（黑屏 + 串行往返）；服务端自己压缩的响应被桥解压后原样过隧道（`/provider` 6.56 MB）；启动时 4 个相同的 `/provider` 让单线程服务端排队约 5 s。
- 改动：补丁 0015（保持工作区挂载、首开预置目录、输入框会话事件）、页面在新输入框显示后才报告 ready、桥接重新 gzip、在途 `/provider` 合并。
- 本机 E2E 没能复现“整页卸载”（上游代码在本机也不卸载，原因未查明），黑屏的结论只以 Remote 数据为证；新增的 ready 门控用例有变异对照。
- 检查与结果见 [switch-perf](evidence/switch-perf.md)。
- 追加（提交与部署）：合入与部署：原补丁号 0014 与 main 上另一批次的 0014（轨迹）重号，改为 0015，rebase 到 main 后提交 `d73bf91` 并快进合入 main。集成后 `verify:brief --build` PASS（typecheck 0 错误、unit 168/168、build）；E2E（mock）`p1b-main-panel` 8/8、`c4-trajectory` 14/14；补丁 0001–0015 在固定 SHA 上重放与 vendor 树一致。`oco-0.0.1-d73bf91.vsix` 部署 gcp-workstation，远端 `extension.js` 哈希一致（`7aaf9981…`）。Remote 复验（已安装扩展，探针 `deployed-d73bf91`，14 个会话 × 2 轮）：首访空白帧 0/12；首开后第一次切换 941 ms；其余首访中位 415 / 最大 621 ms；回访中位 200 ms；页面收到的 `/provider` 为 556 KB（原 6.56 MB）。用户已打开的 Remote 窗口需 Reload Window 后才加载新代码。

## 子智能体卡片打开系统浏览器（补丁 0016，2026-10-01）

- 用户反馈：对话里点子智能体会跳到一个链接。
- 复现（mock，截住 Electron 主进程 `shell.openExternal`）：卡片 `<a href>` 在 webview `<base>` 下成为 `https://file+.vscode-resource.vscode-cdn.net/server/…/session/<子会话>`，VS Code 把点击作为外部链接打开（受信任工作区不弹确认），同时面板切到子会话。
- 改动：补丁 0016，嵌入模式不提供会话 href；`c4-trajectory` 新增 `subagent-link`（先 FAIL 后 PASS）。
- 本 worktree 的 `.oco-test` 链接到主检出 `.oco-test/wt-sublink`（避开 IPC socket 路径长度限制）。`scripts/setup.sh` 重置 vendor 时只还原已跟踪文件，补丁新增的文件残留会让 0012–0014 应用失败；本批手动 `git clean` 后重放，脚本未改。
- 检查与结果见 [subagent-link-0016](evidence/subagent-link-0016.md)。NOT RUN：真实模型。
- 追加（提交与部署）：提交 `37f2634` 快进合入 main；主检出 vendor 补应用 0015、0016（此前停在 0014）。`oco-0.0.1-37f2634.vsix` 部署 gcp-workstation，extension.js 与 webview 产物哈希均与本地一致。Remote 上的点击 NOT RUN。
- 追加（点击后的长条焦点框）：用户反馈点卡片出现整行长条框。来源是 VS Code webview 默认样式的 `a:focus` 外框，0016 之前就有（探针在撤掉 0016 的构建上复现），被跳浏览器掩盖。`apps/chat-webview/index.html` 加 `@layer oco-webview` 让 `a:focus` 回到浏览器默认；`subagent-link` 增加点击外框检查。c4-trajectory 15/15、p1a-chat 8/8、c1-open-file 6/6。

## 无面板时首开：黑屏与等待（2026-10-01）

- 用户反馈：关掉所有对话后首次打开会话，“加载一下，黑一下屏，又加载一下”，而且偏慢。
- 新探针 `evidence/cold-open/cold-probe.mjs`：Remote 新窗口里依次新建 3 个面板，CDP 截屏流按帧算亮度，同时采样页面状态和请求。定位到四段画面，以及新窗口首开时补取父消息排在 `/provider` 后面。
- 改动：
  - 骨架屏一直盖到内容出现（编辑区底色、无淡出，“无法连接”页持续 1.5 s 才算）。
  - `/provider` 等页面 `painted` 后再放行（上限 10 s）。
  - 跳过健康检查只省 0–30 ms，还有隧道半断时的回归，已撤回。回归由另一会话的 E2E 和 Grok 审查发现。
- 过程中的坑：
  - 骨架屏淡出被主线程长任务卡住，内容晚 1–1.7 s 才看得到。
  - 测试端口 4548 被占，导致一整轮 E2E 作废。
  - 与另一会话共用 `.oco-test/wt-cop` 同时跑 E2E，结果互相干扰。
- 检查和结果见 STATUS 本节和 [cold-open](evidence/cold-open.md)。
- 追加（提交与部署）：提交 `1ad31ce`。部署：`oco-0.0.1-1ad31ce.vsix` 部署 gcp-workstation，远端 `extension.js` 哈希一致（`327d8e63…`）。Remote 复验（已安装扩展，探针 `deployed-1ad31ce-1/2`，新窗口里依次打开 3 个会话，共 2 组 6 次）：6 次画面都只有编辑区底色骨架屏到内容，没有黑屏阶段；logo 闪屏每次都渲染，但都在骨架屏下面。新窗口首开 2059 / 4069 ms，4069 那次主包 4 MB 下载用了 2.66 s（隧道慢）；消息返回到内容出现 0.26 / 0.37 s。同窗口再开 993–1339 ms。`scripts/remote-chat-check.mjs` BLOCKED：脚本要不带密码访问工作站 `127.0.0.1:4096`，该服务现在返回 401，脚本列不出会话便退出，未创建或删除任何会话。按约定不读、不改用户服务凭据。合入 main：BLOCKED，main 检出目录里有另一会话（删除 Agents 功能）未提交的 `docs/NEXT.md`、`docs/TEST-SCOPE.md` 改动，`--ff-only` 被拒；已发消息请它提交前合入 `1ad31ce`。

## 移除 Agents 视图，新增 Connection 视图（2026-10-01）

- 用户要求删掉 Agents、保留 “∨ Sessions” 标题行；说明了 VS Code 单视图会并入容器标题后，用户选“删 Agents + 加默认折叠的小视图”。
- 改动：删除 Agents 视图、命令、单元测试与 `t013-agents`；新增只读 Connection 视图（`connection-view.ts`、`diagnostics.ts` 的 `connectionRows`）；文档同步（USER-GUIDE、README、CHANGELOG、TEST-SCOPE、TASKS、NEXT）。
- 应另一会话请求，在主检出用 stash → `merge --ff-only` → stash pop 把 main 快进到 `28c90ac`（冷开修复），并按其要求改了 STATUS / NEXT 里两处过时的“未合入 main”文字。
- 检查与 `p1b-sidebar` 竞态排查见 [agents-removal](evidence/agents-removal.md)。NOT RUN：真实模型、Remote 外观。
- 追加（提交与部署）：提交 `b405b19`（直接在 main）；`oco-0.0.1-b405b19.vsix` 部署 gcp-workstation，远端 `extension.js` 哈希一致（`6de0210b…`）。

## 恢复委派规则（2026-10-01）

- `b2f6514` 重写 AGENTS.md 时丢了 `2e2a0aa` 的「委派与 token 预算」任务表，且只写了 Codex 路由名、把 `general-purpose` 列为不可用，导致 Claude Code 会话基本不委派。
- 恢复任务类型 → 代理对照表，按运行环境（Claude Code / Codex）分列路由名，并入 10 秒健康检查与原规则；HANDOFF 第 18 行的引用重新有效。纯文档改动，未跑检查。

## 页面主包压缩与启动请求排序（2026-10-01）

- 压缩：`scripts/build-webview.sh` 在 `app-*.js` 旁生成 `.gz`（4,042,559 → 1,182,539 字节）；`apps/extension/src/app-loader.ts` 生成内联加载脚本，页面取 `.gz`、`DecompressionStream` 解压，把 `import.meta.url`、`import("./`、`from"./` 改成资源目录绝对地址后以 blob 经 import map 顶替原 URL；并放一个无 rel 的 `<link href>`，让懒加载块的 preload 辅助跳过 4 MB 原文件。仅 Remote（`vscode.env.remoteName`）或 `OCO_PACKED_APP=1` 启用；失败回退原入口。
- 排序：`bridge-core.ts` 的 `DEFERRED` 在 `/provider` 之外加入 `/lsp`、`/mcp`、`/vcs`、`/command`、`reference`、`experimental/resource`；`/session/:id`、`/message`、`/agent`、`/config` 等不暂缓。`SHARED` 仍只合并 `/provider`。
- 检查：typecheck PASS；unit 169/169（新增 3）；`OCO_PACKED_APP=1` 下 `p1b-theme-load`、`p1a-chat`、`p1b-main-panel` 全部 PASS（20 项）；本机调试确认 4 MB 原文件不再下载、页面渲染。
- NOT RUN：Remote 实测（未部署）；`app-*.css`（484 KB）未压缩。

## 2026-10-01 补丁 0017：标题栏操作并入会话标题行

- 改动：嵌入会话页隐藏标题栏；状态、审查面板开关移入对话/轨迹标题行；隐藏上下文用量圆环。`c4-trajectory` 新增 `header-actions-chat`、`header-actions-trajectory`。
- 结果：`tsgo -b` PASS、build PASS、`c4-trajectory` 17/17（3 次运行中第 3 次；另两次为与本补丁无关的时序问题），见 [c4-header-actions-run](evidence/c4-header-actions-run.md)。NOT RUN：中文、Remote。

## 2026-10-01 补丁 0018：嵌入模式去掉会话「更多」菜单，归档移到侧栏

- 改动：嵌入会话页隐藏三点菜单（重命名/分享/导出/归档/删除）；扩展新增 `oco.archiveSession`，会话列表右键菜单顺序为重命名、归档、删除。归档后关闭绑定该会话的面板，列表移除该行。
- 结果：typecheck PASS、unit 169/169、`tsgo -b` PASS、0001–0018 在干净树依次 apply 与 vendor 一致、build PASS。NOT RUN：E2E、真实 VS Code 右键归档。

## 2026-10-01 状态栏 oco 标志

- 改动：状态栏已连接图标由 plug 换成 oco 标志图标字体；按反馈改细一版。
- 结果：typecheck PASS、unit 169/169；部署 gcp-workstation 并截图确认。NOT RUN：E2E。
