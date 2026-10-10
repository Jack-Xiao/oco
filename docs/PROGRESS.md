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

## 2026-10-01 扩展界面英文化

- 改动：扩展和待发送提示的写死中文改为英文（Grok 执行，主线程复核）；相关单元测试、E2E 断言和 `remote-look.mjs` 同步。
- 结果：typecheck PASS、unit 169/169；6 个相关 E2E 套件 41 项 PASS；已部署 gcp-workstation。NOT RUN：其余 E2E。

## 2026-10-01 侧栏会话列表改版

- 改动：按时间分组（昨天 0 点起直接列出，其余进 More）、状态图标（含灰色呼吸点 SVG 和未读蓝点）、短时间、首屏 100 + Load more、服务端搜索。Grok 实现 `session-groups.ts` 与 feed/store 分页搜索及单元测试；主线程集成 `sessions-view.ts`、`extension.ts`、`package.json`、SVG，并修 E2E（Grok 沙箱无法启动 VS Code，E2E 由主线程运行）。
- 结果：typecheck PASS、unit 185/185、build PASS；E2E（mock）`p1b-sidebar` 13/13（docs/evidence/runs/20261001-155122-p1b-sidebar-20fc）、`p1b-reconnect` 5/5（docs/evidence/runs/20261001-174051-p1b-reconnect-1870/results.json）、`c3-fork` 4/4、`p1b-main-panel` 8/8。NOT RUN：其余 E2E、Remote。


## 2026-10-02 面向初学者的 HTML 技术手册

- 主线程整合 21 章单文件手册，独立 Grok 调查运行时与构建/文档事实，均以实际源码和版本为依据；委派 model/provider 未返回则记 unknown。
- 文档验证 40 项 PASS，包含桌面/手机、交互、打印与源码/链接核对；代理浏览器启动受沙箱阻塞后，主线程使用同脚本完成，不改权限。证据：`docs/evidence/technical-guide-validation.json`、`technical-guide-review.md`；详细脚本/截图在忽略目录 `docs/evidence/runs/technical-guide/`。
- 只读查看 Claude 状态并设置截止 2026-10-02 09:30 的观察；发现额度阻塞和未提交/重跑缺口，不宣称项目完整。产品构建/E2E/部署 NOT RUN。仅本地提交文档，不含并发产品改动。

## 2026-10-02 连接后误显示「没有会话」

- 改动：`oco.sessionsEmpty` 上下文键 + 「Loading sessions…」提示；`p1b-sidebar` connection-switch 增加闪现判定（先聚焦 Sessions 视图）。
- 结果：unit 185/185、build PASS、`p1b-sidebar` 13/13（docs/evidence/runs/20261002-004120-p1b-sidebar-c5d9/results.json）；对照（去掉修复）connection-switch FAIL。NOT RUN：其余 E2E、Remote。


## 2026-10-02 委派规则执行约束

- 根据 Claude 会话审计修改 AGENTS：可委派任务先派后做；主线程接手有具体例外；健康检查、普通运行失败换路由、轻量转发开销与任务主体分开；要求实际运行记录与 checkpoint，避免重复调查。
- STATUS/NEXT 同步按任务段落读取与委派约束；保留本轮开始前的并发产品/文档改动。只改项目文档，未改全局配置或路由，未提交。
- 本批 Gemini Antigravity 订阅最小请求因地域限制失败，Grok 安装/登录检查通过，Grok 复核 PASS；链接、diff 格式及 4 项并发基线保护检查 PASS。只读代理的复核补丁由主线程代存；结果与执行记录见 [本批证据](evidence/delegation-rules-20261002.md)。产品 typecheck/unit/build/E2E 与后续会话行为 NOT RUN。

## 2026-10-02 仪表盘 v4 独立评估

- 观察现有演示、委派 Grok 数据能力核查，保存设计建议和四状态交互示意；没有改产品或 Claude 工作树。证据见 [dashboard-v4-review](evidence/dashboard-v4-review-2026-10-02.md)。
- 关键边界：请求级 usage 不能直接拆成输入块 token；历史 delta 不完整；后台 task 工具完成不等于子代理结束。真实产品检查均 NOT RUN。
- 已定位目标 Claude fork 会话；发送因桌面锁屏/网页设备重新登录受阻，文件已保存，消息尚未送达。

## 2026-10-03 原理讲解页（四种形式）

- 委派 Grok 只读核对现状，写入 [explainer-facts](evidence/explainer-facts-2026-10-03.md)；主线程抽查桥信封、managed 启动参数、WebSocket 禁用三处一致。委派记录见 [delegation-explainer](evidence/delegation-explainer-2026-10-03.md)。
- 新增 `docs/explainer/`（未提交）：讲解页（12 场景影片 + STE 速读卡 + 策略模拟器 + 补丁账本 + 实现状态表）、`narration.json`、`tts.mjs`；旁白暂用 macOS say，Gemini TTS 待密钥。已发布为私有 Artifact。产品代码未改，测试 NOT RUN。
- 事实清单发现 `technical-guide.html` 的协议字段名（`requestId`/`generation`，实为 `id`/`gen`）和“会话列表未提交”提示已过时，未修改。

## 2026-10-06 企业服务 1.18.13 兼容评估

- 企业使用 OpenCode 1.18.13（非 1.18.33）。源码比对（Grok）：对外 API 差异很小；中风险两项——provider `connected` 在旧服务不含“有凭据未列出”的提供商（模型被静默隐藏）、远端 workspace 代理不剥离 `directory`。
- E2E（mock，隔离 1.18.13 @4537）：Grok 沙箱无法启动 VS Code，无效；Gemini 跑 18 套件 17 PASS；p1a-identity 经主线程同环境 A/B 证实两版本同样失败，属环境回归，非版本问题。真实模型、managed 模式、企业实际服务 NOT RUN。证据与委派记录见 [server-1.18.13-compat](evidence/server-1.18.13-compat-2026-10-06.md)。

## 2026-10-08 会话列表 webview spike

- 起因：Claude Code 2.1.293 的会话列表是 WebviewView（`retainContextWhenHidden: true`），原生 TreeView 做不到时间右对齐、圆角选中和自定义行高。
- 新增实验设置 `oco.experimental.webviewSessions`（默认关）和视图 `oco.sessionsWeb`（"Sessions (Preview)"），与原生列表并存；数据仍由 `SessionsView.webModel()` 提供。页面由 Grok 按契约编写，宿主侧与验收由主线程完成。结果与委派记录见 [spike 记录](evidence/sessions-webview-spike-2026-10-08.md)。

## 2026-10-08 会话侧栏改为 webview（分支 `feat/webview-session-list`）

- 用户确认 spike 效果后：webview 接管 `oco.sessions`，原生 TreeView、实验开关、viewsWelcome 和 Connection 视图删除；搜索改为标题栏按钮触发；状态文字抽成纯函数 `listMessage()`。决定见 [ADR-008](adr/008-webview-sessions-list.md)。
- E2E 适配：Grok 改写 `p1b-sidebar`（只改代码），主线程运行并修正 2 处；Gemini 两次健康检查超时。结果见 [spike 记录](evidence/sessions-webview-spike-2026-10-08.md)。

## 2026-10-08 会话标题行恢复上下文用量（补丁 0019）

- 起因：用户反馈插件没有常驻的上下文占比提示，容易超限；补丁 0017 曾在嵌入模式隐藏圆环。
- 补丁 0019：`SessionContextUsage` 新增 `label` 模式（圆环 + 百分比、阈值配色、无上限显示「—」），挂到 `SessionHeaderEmbeddedActions`。`c4-trajectory` 断言改为要求圆环与标签存在。
- `scripts/setup.sh`：重放时 `git clean` 补丁新建的文件，补丁失败即退出（之前 0007、0012–0014 在重跑时被静默跳过）。
- 委派：Gemini 健康检查 10 秒超时；Grok 健康检查通过，但沙箱启动不了 VS Code，主线程运行 E2E 17/17。见 [c5-context-usage](evidence/c5-context-usage.md)。
- 跟进：用户要求不显示百分比数字（占空间，一眼看颜色即可）。改为只显示圆环并按阈值着色，数字留在悬停提示；`c4-trajectory` 改断言为无文字、`data-oco-context-usage="normal"`，重跑 17/17（`runs/20261008-101353-c4-trajectory-5b15`）。Gemini 复查仍 10 秒超时，Grok 沙箱不能启动 VS Code，主线程运行。

## 2026-10-03 运行视图 M1（补丁 0019）

- 改动：新增 `session-runtime-model/i18n/.tsx` 与三组测试，改 `session-trajectory.tsx`、`session-trajectory-i18n.ts`、`pages/session.tsx`；补丁 0019；E2E 套件 `c5-runtime`（`DEFAULT_SUITES` 22 个）；spec/计划/证据文档。
- 结果：vendor 类型 0 错误；session 单测 90/90；根 unit 185/185、typecheck 0 错误；补丁 0001→0019 干净重放 19/19；E2E（mock）c5-runtime en 9/9、zh 9/9，c4-trajectory 17/17（独立服务 4617，未触碰 4517）。评审：9 个任务级评审 + 最终整分支评审，共修复 3 个 Important 与若干回归，见 [验收](evidence/runtime-m1-verification.md)。
- NOT RUN / 限制：真实模型、Remote、真实大会话性能、子代理/审批界面/429/取消 E2E、逐事件重建一致性；M2/M3 未做；“断连”需宿主消息，另提集成人。2026-10-03 经用户授权本地提交，未推送。
- 委派：实现与 E2E 运行走 Gemini（agy，型号 unknown）；Grok 额度不足不用；包装代理 2 次 API 额度中断，主线程核对 results.json 与进程/端口后继续。

## 2026-10-03 运行视图 M2（补丁 0019 追加）

- 改动：
  - vendor 11 个提交（`c861179..474534a`）：稳定按键渲染、模型增量（取消、子代理生命周期、待处理上溯）、批准/拒绝/提问转对话/停止/重试倒计时、子代理展开（`session-runtime-child.tsx`）、事件级测试、两轮评审修复。
  - mock LLM 的 `RETRY-ONCE` 429。
  - `c5-runtime` 新增 7 项检查。
  - 补丁 0019 重新生成。
  - 计划、证据和账本。
- 结果：
  - session 单测 147/147，vendor 类型 0 错误；根 unit 188/188，typecheck 0 错误。
  - 补丁 0001→0019 干净重放 19/19。
  - E2E（mock）：c5-runtime en 16/16、zh 16/16，c4-trajectory 17/17。
  - 终审（Opus）0 Critical、1 Important、4 Minor，已全部处理。
  - 见 [验收](evidence/runtime-m2-verification.md)。
- NOT RUN / 限制：真实模型、Remote、超过 8 个子代理或同步失败的 E2E、时钟偏差。2026-10-03 本地提交，未推送，未部署。
- 委派：
  - Grok 完成 Task 1–4 后返回 402。
  - Gemini 前期报 400 地域错误，固定台湾出口后完成终审修复与 E2E 重跑。
  - 主线程接手 Task 5、Task 4 修复、Task 7、Task 8，理由是两路都不可用。
  - Task 5 第一次派发时，转发层越界提交了补丁文件，已撤回；它写的用例不合格，已丢弃。
  - E2E 重跑的转发层报告与事实不符，以 worktree 中的提交为准。
- 部署（同日，用户要求只留在本分支）：`oco-0.0.4-9ff60a9.vsix` 已安装到 gcp-workstation，远端 webview 哈希与包内一致；Remote 交互实测 NOT RUN。

## 2026-10-04 运行视图 M3（补丁 0019 追加）

- 改动：
  - vendor Task 1–6（性能测量、机制投影、思考流、键盘与读屏、嵌套同步）→ 改版 1（agent 树，4b/4c）→ 改版 2（固定框架，4d + 主线程视觉修复 `96b6e45`、`4385e3f`）；空树缺陷修复 `1d04f8d`。
  - mock：`SLOW-REASON`、一条消息并行派 N 个子代理；`scripts/look-runtime.mjs` 真实界面截图与布局诊断。
  - `c5-runtime` 扩展到 32 项；补丁 0019 重新生成。
- 结果（最终 vendor `ebb9c65`）：session 单测 218/218，test:browser 48/48，类型 0 错误；根 verify:brief typecheck PASS、unit 190/190；E2E c5 en 33/33、zh 33/33，c4 17/17；干净重放 19/19。
- 用户反馈与改版：第一版（默认折叠的机制图）被认为“没有可视化”；第二版（agent 树）被认为“不好点、忽大忽小、布局总变”；第三版按用户参考图做固定框架，评审稿三轮（加图例、精简文字、Tokyo Night 配色、放宽间距、日志最新在上）后由用户 `/goal` 授权主线程定稿实现。
- 教训：单测与代理自查都通过的界面，在真实 VS Code 里仍严重溢出重叠（底部输入框占去大量高度）。界面任务必须在真实宿主里截图诊断，已固化为 `scripts/look-runtime.mjs`。
- 委派：Gemini 完成 preflight、Task 1–6、4b、4c、4d、终审；Task 7 首次因 Gemini 额度 429 + Grok 402 由主线程接手；4d 视觉修复因“自查通过但真实界面错乱”的证据矛盾与快速迭代需要由主线程完成；见 [账本](evidence/delegation-runtime-m3-2026-10-03.md)。
- NOT RUN：亮色主题、嵌套 ≥2 层 E2E、真实模型、Remote。本地提交，未推送，未部署。
- 终审修复波（同日）：Gemini 终审 12 条，主线程修 10 条（含阻断 D-01：流式更新整卡重建致焦点丢失，新增 `focus-stable` 并做对照；内容在变的卡片仍会重建，记入 NEXT）。收尾复核又发现 `width-1600` 测错了元素、全屏下状态栏被推出可视区，已修（`ebb9c65`，按视图自身高度缩放间距）。最终包见下一行。
- 最终包：`oco-0.0.4-da3825f.vsix`（vendor `ebb9c65`），已安装到本机 VS Code，需 Reload Window。
- 补完（同日）：卡片改为按位置原地更新（内容变化时焦点保留，`focus-on-change` 有对照）、窄屏连线竖轨（D-11）、子代理加载失败可重试（D-12）；vendor `6164506`，E2E en/zh 34/34、c4 17/17，干净重放 19/19。最终包见下一行。
- 最终包：`oco-0.0.4-a66baa8.vsix`（vendor `6164506`），已安装到本机 VS Code，需 Reload Window。

## 2026-10-04 运行视图 M4 第一批（补丁 0019 追加）

- 设计：用户评审了多版示意图，第二批定为回环航道 + 终端 HUD 配色，放弃阶段看板。设计记录 `docs/design/runtime-m4.md`，示意 `docs/design/runtime-m4-loop-mockup.html`。
- 交付：回放播放控制、日志精简与浮层、思考框字号与全文浮层；E2E 新增 `playback`、`log-overlay`、`think-expand`。
- 委派：Grok 402 额度耗尽；Gemini（Antigravity）资格检查两次 EOF。映射调查、单测、E2E 由主线程接手，记录在 `docs/evidence/delegation-runtime-m4.md`。
- 结果：session 单测 226/0，E2E en/zh 37/37，c4 17/17，干净重放 19/19。未提交，未部署。

## 2026-10-04 运行视图 M4 第二批（补丁 0019 追加）

- 交付：回环航道（`session-runtime-loop.ts` 纯函数 + `session-runtime-loop-view.tsx`，实际像素布局）、模型后台映射（category 回退、`backgroundTaskId`、取回判定、通知解析、本轮起点）、HUD 配色、左栏去名册、状态栏着色与窄宽度隐藏；E2E 夹具 `tests/e2e/lib/bg-task-plugin.mjs` + mock 后台提示词；c5-runtime 改为航道断言。
- 用户中途改版：航道作为主视觉、主代理框两行、对齐示意页。另一会话「运行视图 M4 优化」在同一 worktree 按用户反馈继续改了航道（第 N 轮、沿航道移动、取回判定补充），双方用消息协调了文件归属。
- 委派：Gemini 单测 49 条（发现 2 个缺陷已修）；Gemini 夹具任务产物可用但工具返回 ERROR；Gemini E2E 任务约 2 h 后转 Grok，Grok 402，E2E 由主线程接手。记录在 `docs/evidence/delegation-runtime-m4.md`。
- E2E 中修复两处视图缺陷：探针无法键盘聚焦（SVG `tabindex`）、子会话提前结束时生命周期停在 unknown（补一次拉取）。
- 结果：session 单测 270/0，E2E en/zh 37/37，干净重放 19/19，vsix 已装本机。未提交，未部署。


### 2026-10-04 运行视图 M4 第三批（用户实测反馈）

- 早轮失败子代理不再留在航道；航道动画回放中按状态运行、空闲慢呼吸；左栏改为会话概况（需你处理 / 本轮目标 / 任务清单 / 本会话）。
- 委派：Grok 402、Gemini 两次失败（ERROR、loadCodeAssist EOF），实现与 E2E 由主线程接手，记录见 evidence/runtime-m4-batch3.md。
- 结果：session 单测 276/0，E2E en/zh 37/37，干净重放 19/19，vsix 已装本机。未提交，未部署。
- 追加：左栏「本会话」移入状态栏（时长 / 上下文 / 花费 / 用量），航道动画不再在任务间停顿或变速。单测 276/0，E2E en/zh 37/37，重放 19/19，vsix 已装本机；gcp-workstation 已删除，Remote 未部署。
- 第三轮反馈：去掉运行页的「需你处理」和停止按钮，拒绝/忽略不再记为失败，状态词与重复信息整理，图例文字恢复。单测 263/0，E2E en/zh 37/37，重放 19/19，vsix 已装本机；E2E 改写委派 Gemini（最终返回 ERROR，改写已落盘），主线程做最终验收。
- 第四轮：交接卡片默认显示最新子代理 / 最近工具调用；去掉「当时」「（推断）」。单测 266/0，E2E en/zh 37/37，vsix 已装本机。
- 文案：子代理最后一步「已吸收」改为「已取回」（英文 Absorbed → Collected），与「待取回」成对。已提交 97251ac；单测 266/0，干净重放 19/19（与 vendor 一致），E2E（mock）c5-runtime en 37/37、zh 37/37（runs/20261004-153652-c5-runtime-b6d0、20261004-153855-c5-runtime-3bbe），vsix `oco-0.0.4-97251ac` 已装本机。未部署；NOT RUN：真实模型、Remote。

### 2026-10-07 运行视图：本机查看 + 真实数据修正

- gcp-workstation 已不存在，改为本机：新增 `scripts/install-local.sh`（装到本机 VS Code 并核对哈希）与 `scripts/look-local.mjs`（隔离 VS Code + managed 模式，对本机真实会话只读回放截图）。本机此前不可用的原因是窗口没开文件夹；按用户决定保持 Open Folder 提示。
- 真实会话回放发现并修正 4 处：交接卡耗时用墙钟（`3738m` → 随游标、加小时档）、状态栏 Context 不随回放、思考框半行截断与滚动条、左栏标题按词折行。
- 委派：Gemini 两次探测未确认；Grok 首次因遗留状态锁失败，锁改名后完成修正，主线程审 diff 退回一处流式思考回归；E2E 由 Grok 跑。记录见 evidence/runtime-local-2026-10-07.md。
- 结果：session 单测 270/0，vendor 类型 0 错误，0019 干净重放 19/19，根 typecheck PASS / unit 190/0，E2E（mock）c5-runtime en/zh 37/37，`oco-0.0.4-98dda03.vsix` 已装本机。经用户同意停掉两个遗留测试服务。未提交；NOT RUN：真实模型新对话、Remote。

### 2026-10-08 运行视图 M5 设计与实现（进行中，按用户要求中止）

- 纯文字「此刻」稿被用户否决。改用多代理工作流：先做三个动画方向（环形航道 / 泳道 / 阶段环），从三个角度评审，以阶段环为底合成，逐帧审查通过。之后按用户 5 项决定和居中要求修订，补上收起时的连线和可点开的子代理。
- 计划 15 个任务；实现到第 1 波前半（Task 1/2/3/4/6/7 完成），半成品导出为 `patches/wip/runtime-m5-wip.patch`。typecheck、单测、构建、E2E 全量 NOT RUN。

### 2026-10-08 运行视图 M5 第二批：实现完成、集成、E2E、本机安装

- 接上一批（工作流 `wf_9af8ca23-fa8` 停在第 1 波前半）。vendor 半成品与 `patches/wip/runtime-m5-wip.patch` 字节一致，未恢复；Task 4 夹具脱敏抽查通过。
- 工作流 `wf_d1bdd9ad-b6b`（32 个代理，约 3 小时）：复审 T3/4/6/7 通过；T5/T8；T9/10/11/13/14；T12 集成（契约 / UI / 清理三视角门禁，两轮修复）；构建与 E2E（一轮产品修复：实时数据没有 step part）。
- 主线程裁定并由子代理落地：D18 契约（⊘ / faint）、全量重建复用与 D22 性能预算、D21 step 时间旁表（两个同步文件各加一行 import 和一行调用）。
- 结果：vendor typecheck 0；session 单测 418/0；test-browser 65/0；性能在预算内（B 根变化带 prev 2.7 ms，每帧 ≤ 0.40 ms）；verify:brief PASS；0019 重生成 55 个文件、干净重放 19/19；build PASS；E2E（mock，最终构建 54ab5d2）c5-runtime en 43/43（`runs/20261008-161513-c5-runtime-7bdc`）、zh 43/43（`runs/20261008-161824-c5-runtime-73be`）、c4-trajectory 17/17（`runs/20261008-162120-c4-trajectory-adcb`），无测试侧改动；历史翻页没有专门断言（只隐式跑到），8292fba 上的前一轮同样 43/43、43/43、17/17；look-local 修复后 14/14；`oco-0.0.4-54ab5d2.vsix` 已装本机。提交 8292fba、54ab5d2 与文档提交，未推送，未合入 main。
- 2026-10-09 真实会话 look-local 先是 12/14：第 1 轮两帧不一致。只读诊断（opus）查明重开会话只加载最近 20 条消息、运行视图不翻页；修复（sonnet 加翻页 effect，opus 查明旧页原地合并后索引不重建并补 history 钩子）后 14/14（54ab5d2），E2E 复跑通过。
- 委派：Gemini 503；Grok 健康检查通过但工作流内未真正启动，Task 14 回退 sonnet；文档一致性检查由 Grok 直接路线完成（6 处措辞/补记项，已改）；其余 Claude opus / sonnet（用户指定按能力分配）。记录见 evidence/runtime-m5.md。

### 2026-10-09 运行视图 M5 用户反馈修正（5 项）

- 用户首用反馈：「全文」偏下且结束时禁用、工具台无调用时应收缩、计划标签不可点、新会话首轮显示「第 2 轮」、结束时计数行左侧裁字。全部修正，补丁 0019 重生成（`git diff deb241e -- packages/app`，`diff --check` 干净），本机安装 fb2 包。
- 「第 2 轮」由 Gemini 只读调查定位、主线程核实：乐观消息时间戳与服务端不同导致 store 同 id 两条；修在 `message.updated` 插入路径。
- look-local 发现单测未覆盖的实时路径缺陷（`FRAME_KEYS` 漏 `dk`），已修并加编译期检查；look-local 新增 `rects` 字段（各块相对舞台的矩形）。
- E2E 首轮 c5 en/zh 各 42/1（`geometry-stable` 断言假设工具台固定），改测试后重跑 43/43、43/43；c4 17/17。委派记录见 `docs/evidence/runtime-m5.md`。
- 第二轮反馈（同日）：计划标签真实点击无效（父级 pointer-events none，单测用 el.click() 未覆盖）；「全文」按钮改为卡片整块可点；卡片去掉 meta 行。session 单测 419/0、test-browser 66/0、c5 en/zh 43/43；本机安装 fb3。
- 第三轮反馈（同日）：模型思考时中心卡片不可点（可点条件只看正文，思考阶段正文为空）→ 流式中或有 meta 即可点开，浮层显示“生成中”提示与 meta；删除与模型框/站牌/结束卡片重复的底部“Now”字幕行（`caption` 整条链路与 20 个 `ring.cap.*` 键）、卡片右上角时长（`RingCard.age`）、状态栏“已空闲”（`ring.bar.idle`）；回放“上一步”图标改为 `|◀`。typecheck 0、session 419/0、test-browser 67/0；E2E（Gemini）c5 en 43/43、zh 43/43；0020 重新生成、干净重放；本机已装。
- D2 修订（同日，用户决定）：回放中进行中的思考/输出按时间占比显示最终全文的前缀并标注“按时间估算”，无泄漏测试列明豁免字段；typecheck 0、session 420/0、test-browser 67/0；0020 重新生成、干净重放；本机已装；E2E NOT RUN。

## 2026-10-10 从 STATUS 迁移的批次记录

### 补丁编号：运行视图补丁改为 0020（2026-10-09，合并 main 时）

- main 上 2026-10-08 新增 `0019-oco-embedded-context-usage.patch`，与分支的运行视图补丁同号；合并时把运行视图补丁改名为 `0020-oco-runtime-view.patch`，两者不改同一文件。清库重放 0001–0020 全部通过（`git apply --check` 逐个应用）。历史文档中提到「补丁 0019 运行视图」的均指现在的 0020。

### 运行视图 M5 用户反馈修正（2026-10-09；同分支，未提交，已装本机 `oco-0.0.4-dd67556-fb3.vsix`，需 Reload Window）

- 修正：结束卡片「全文」可点开且垂直居中；工具台按轮收缩（本轮首次调工具展开，最后一次请求未调工具即收为 30 px 标题条；仅宽布局，窄布局不变；新属性 `data-oco-runtime-tools-k`）；「计划 n/m」改为按钮，浮层列出全部计划项；计数行改为 safe center，超长时右侧省略，不再裁掉 agent 名；新会话首轮显示「第 2 轮」——根因是乐观用户消息与服务端副本 `time.created` 不同、按 `created+id` 查找未命中而重复插入（`context/server-session.ts` 的 `message.updated` 插入前按 id 去重，补回归测试）。
- 第二轮反馈：计划标签所在计数行 `pointer-events: none` 导致真实点击无效（已修，E2E 改为 Playwright 真实点击）；去掉「全文」按钮，中心卡片整块可点（有任何文本即可，运行中也可），浮层显示标签、全文、计划项、附注和 meta；卡片内不再显示 meta 行，空间留给正文。E2E（Gemini，mock）c5-runtime en 43/43、zh 43/43。
- 第三轮反馈（2026-10-09）：(1) 模型思考阶段正文为空（回放在该段结束前不显示原文、实时未收到推理文本）时中心卡片不可点——可点条件只看文本；现在流式中或有 meta 即可点开，浮层显示“生成中”提示和 meta。(2) 删除底部“Now”字幕行（与模型框重复；帧字段 `caption`、`captionOf`、20 个 `ring.cap.*` 键一并删除，`data-oco-runtime-focus` 移到舞台元素）、卡片右上角时长（`RingCard.age`、`ring.card.age.*`；时长留在模型框与站牌）和底部状态栏“已空闲 xx”（`ring.bar.idle`；`bar.idleMs` 仍用于空闲降频）。(3) 回放“上一步”图标由 `◀` 改为 `|◀`，与“下一步” `▶|` 对称。验证：app typecheck 0；session 单测 419/0；test-browser 67/0（新增 1 项）；0020 七个文件段重新生成，20 个补丁干净重放且与工作树一致；本机已装 `oco-0.0.4-6bb648d.vsix`（安装包内已无 `ring.cap.*`）。E2E（Gemini，mock）c5-runtime en 43/43、zh 43/43（`runs/20261009-062906-c5-runtime-ca69`、`runs/20261009-065054-c5-runtime-c918`；跑在去掉“已空闲”和改图标之前的构建上，这两项 E2E 不涉及）。真实模型点击 NOT RUN。
- D2 修订（2026-10-09，用户决定）：回放中尚未结束的思考 / 输出 / 子代理文字行，按已过时间占比显示最终全文的前缀（`revealAt`，不切开代理对；结束时刻未知时仍为空），卡片标记 `estimated`，浮层显示“回放：按时间估算的进度”；字数只在该段结束后显示，保持精确。无泄漏属性测试（13/15/16 及子代理同类测试）把流式卡片的 body / full / mono / estimated 和流式子代理文字行列为唯一豁免。`ring.card.streaming` 改为“生成中…”。只改显示，不读写 OpenCode 数据库。验证：app typecheck 0；session 单测 420/0；test-browser 67/0；0020 九个文件段重新生成、20 个补丁干净重放且与工作树一致；本机已装 `oco-0.0.4-244d6b2.vsix`（安装包含 `ring.card.estimated`）。E2E NOT RUN（c5 不断言回放流式正文）；真实会话回放目视 NOT RUN。
- 实时帧字段经 `session-runtime.tsx` 的 `FRAME_KEYS` 白名单传递，新增编译期检查保证覆盖 `RingFrame` 全部字段（本轮 `dk` 漏列曾导致工具台 NaN 定位）。
- 验证（本机）：vendor typecheck 0；session 单测 419/0；test-browser 66/0；app 全量单测 1143/1（`i18n/desktop-native.test.ts` 期望 "pa" 得 "en"，主机 ICU，0019 未触及）；look-local 真实会话 1100/1600 宽各 3 时刻，溢出 0，轮末 tools-k 0 / 30 px，轮中 1 / 208 px；E2E（Gemini 执行，mock 模型）c5-runtime en 43/43、zh 43/43（`geometry-stable` 断言已改为工具台仅在 tools-k 相同时比较），c4-trajectory 17/17。证据：`docs/evidence/runtime-m5.md` 末节、`docs/evidence/e2e-fb-2026-10-09.md`、`docs/evidence/round-two-investigation-2026-10-09.md`。

### 运行视图 M5：环形循环 + 环心卡片 + 三个坞（2026-10-08；第二批完成，本分支本地提交 8292fba、54ab5d2 及文档提交，未推送，未合入 main）

- 设计已定：动画对比稿 [runtime-m5-animated-mockup](superpowers/specs/runtime-m5-animated-mockup.html)（第 1–4 轮真实数据；模板 [runtime-m5-mockup.src.html](superpowers/specs/runtime-m5-mockup.src.html)，关键帧 [runtime-m5-keyframes.json](superpowers/specs/runtime-m5-keyframes.json)）。用户决定（无子代理的轮次收起子代理区、问题原文进环心卡片、计划卡片、≥10 秒等待折叠、英文直显、卡片居中、连线不悬空、子代理可点开进子会话）和 D18（已忽略/已拒绝不用红色）全部实现。计划：[2026-10-08-runtime-m5-ring](superpowers/plans/2026-10-08-runtime-m5-ring.md)；委派与验收记录：[runtime-m5 证据](evidence/runtime-m5.md)。
- 实现：15 个任务全部完成。第一批（工作流 `wf_9af8ca23-fa8`）做了 Task 1/2/3/4/6/7；第二批（工作流 `wf_d1bdd9ad-b6b`，32 个代理，约 3 小时）复审第 1 波并完成 Task 5/8/9/10/11/12/13/14（集成门禁三个视角、两轮修复；E2E 一轮产品修复）。之后主线程三项裁定，由子代理落地：
  - D18 契约：`RingSubAct` 增加 glyph `⊘` / border `faint`，被拒绝或忽略的行由数据层直接给出，视图不再从 `✗ + line-strong` 推断；`RingSub.uid` 固定为 `${messageID}:${callID}`，`num` 为轮内 task 调用序号。
  - 性能：全量重建按 messageID 复用已完成请求（规模 B 根变化重建 12.0 → 2.7 ms p95），链式重建与全新构建 `toStrictEqual`。D22：性能断言改为空载 p95 的 2 倍（冷启动 A 8 / B 32 ms，带 prev 8 ms，子会话增量 4 ms，每帧 1 ms），避免并行测试负载误报；D11 的 4 ms 以记录数字为准。
  - D21 发送时刻：应用同步层在 4 处丢弃 step-start / step-finish part，实时与重开会话原本没有 fly（模型思考）阶段，「组装请求」会一直持续到首个 token。新增 `session-runtime-step-times.ts` 旁表在丢弃点记录时间（`global-sync/event-reducer.ts`、`server-session.ts` 各加一行 import 和一行调用），环取 min(step-start, 旁表, 第一个 part 到达) 作发送时刻；性质测试覆盖旁表截断，无豁免。旁表没有清理机制（约每请求 0.5 KB），记入 NEXT。
  - 历史翻页（2026-10-09，54ab5d2）：重开会话时应用只加载最近 20 条消息（`initialMessagePageSize`），运行视图现在像轨迹视图一样循环 `history.loadMore` 翻完历史，并按消息数变化重建索引（旧页在原数组上合并，引用不变）；根元素暴露 `data-oco-runtime-history`，钩子 `__ocoRuntime.history()` 报告 stored / indexed。子会话仍只取最近 20 条（记入 NEXT）。
- 代码位置：全部在补丁 0019（55 个文件，相对 `deb241e`；含上述两个同步文件各一处最小改动，这是对计划「不改其他 vendor 文件」的记录在案偏离）。M4 的 mechanism-view / loop-view / child 视图与 mechanism 模块已删除，21 个废 i18n 键已清理。`patches/wip/runtime-m5-wip.patch` 已删除（内容全部进入 0019）。
- 验证（2026-10-08，本机，load 5–8）：vendor `bun run typecheck` 0 错误；session 单测 418/0（23 个文件）；`bun run test:browser` 65/0（19 个文件；ring-view 7/0、ring-sub-view 8/0、JSX 冒烟 1/0）；性能：ring-perf A 全量 3.0 ms / B 全量 13.1 ms、B 根变化带 prev 2.7 ms、子会话增量 0.17 ms，每帧 p95 ≤ 0.40 ms（预算 4）；根 `bun run verify:brief` PASS（typecheck 0 错误，unit 190/0）；0019 重新生成后 `git diff --check` 无告警、无本机路径，干净重放 19/19 且重放树与开发树 `src` / `test-browser` / `package.json` 一致；`bun run build` PASS。E2E（mock，最终构建 54ab5d2）：c5-runtime en 43/43（`runs/20261008-161513-c5-runtime-7bdc`）、zh 43/43（`runs/20261008-161824-c5-runtime-73be`）、c4-trajectory 17/17（`runs/20261008-162120-c4-trajectory-adcb`），无测试侧改动；历史翻页没有专门断言（只隐式跑到），8292fba 上的前一轮同样 43/43、43/43、17/17。真实数据（`look-local`）：修复前 12/14（第 1 轮两帧：重开会话只加载最近 20 条消息，运行视图不翻页，且旧页合并时数组引用不变、索引不重建）；修复后（54ab5d2）14/14 关键帧在 1100 / 560 / 1600 三种宽度下结构一致、横向滚动 0/14、无陈旧帧，history 钩子报告 stored 33 / indexed 33。本机安装：`oco-0.0.4-54ab5d2.vsix` 已装到 `~/.vscode/extensions/oco-local-test.oco-0.0.4`（extension.js sha256 `c4530fd9…` 与打包一致；webview 产物在 vsix 内），需执行 Developer: Reload Window；无文件夹时 oco 会提示 Open Folder。
- NOT RUN：真实模型新对话（fly / 流式思考跟随只有 mock E2E 与回放）；Remote（无主机）；亮色主题；`bun run test:bench` 的 Playwright 半边仍 BLOCKED（会占用 4096 / 3000）。
- 已知遗留：`snapshotAt` 的 token / 花费泄漏仍在（M5 视图不读它，无界面影响）；`ring.cap.pre` 键已定义但未引用。
- 委派：Gemini 探测返回 503 不可用；Grok 健康检查通过，但工作流内 `grok-worker` 没拿到转发启动行、未真正启动，Task 14 由 sonnet 完成；其余按用户指示由 Claude opus / sonnet 子代理按能力分配，主线程只做契约、裁定、补丁、验收与文档。

### 运行视图：本机查看 + 真实数据修正（2026-10-07；同分支，2026-10-08 随 M5 进度一起本地提交）

- gcp-workstation 已不存在，改为本机查看：`bash scripts/package-vsix.sh && bash scripts/install-local.sh`（新增，安装后核对哈希）→ Reload Window → 打开一个文件夹并选择信任（managed 模式需要文件夹且不在受限模式下启动；没开文件夹时侧栏提示 Open Folder，用户确认保持此行为）。本机此前“不能用”只因窗口没开文件夹。`scripts/look-local.mjs`（新增）在隔离 VS Code 中对本机真实会话做只读回放截图。
- 真实会话（`~/Ai-Project`，8 个子会话）暴露并修正 4 处 mock 测不到的问题：回放中交接卡耗时用墙钟（显示 `3738m`，现随游标并有小时档）；状态栏 Context 不随回放变化；思考框第二行被截半、出现滚动条（现两整行 + 省略号；流式时跟最新两行——仅代码审查，未实测）；左栏标题与「Read-only in replay」按词折成两列。
- 验证：session 单测 270/0，vendor 类型 0 错误；0019 重新生成 31 个文件，干净重放 19/19；根 typecheck PASS、unit 190/0；`oco-0.0.4-98dda03.vsix` 已装本机（哈希一致）；真实数据回放复测 4 项均修正。E2E（mock）c5-runtime en 37/37、zh 37/37（`runs/20261007-034656-c5-runtime-a187`、`runs/20261007-034907-c5-runtime-5cc1`）。见 [本批证据](evidence/runtime-local-2026-10-07.md)。
- 另：停掉两个 10-01 遗留、各占约 99% CPU 的 `test-server.sh` 进程（4517/4527，用户同意）。NOT RUN：真实模型新对话（只做了回放，流式思考跟随未实测）、Remote（无主机）、亮色主题。

### 运行视图 M4 第三批（用户反馈修正，2026-10-04；同分支，未提交，未部署）

- 早轮失败子代理不再留在航道（修复切回「运行」后出现「阻塞 13」）；航道动画回放中也按状态运行，空闲慢呼吸；左栏改为会话概况：需你处理（有才显示）/ 本轮目标 / 任务清单 / 本会话统计。
- 验证：类型 0 错误；session 单测 276/0；look-runtime 动画与概况通过；0019 重新生成 31 文件、干净重放 19/19；E2E（mock）c5-runtime en 37/37、zh 37/37；vsix 已装本机。详见 [验收](evidence/runtime-m4-batch3.md)。
- 追加（第二轮反馈）：左栏去掉「本会话」，状态栏改为 时长 / 上下文 / 花费 / 用量，子代理段只在有任务时出现，去掉请求数与工具数；航道动画匀速，步与步之间不再停顿，空闲 2 s 后原地暂停并慢呼吸。类型 0 错误、单测 276/0、E2E en/zh 37/37（用量前缀改动后未重跑；2026-10-07 已在其上重跑 37/37）、0019 重放 19/19；vsix 已装本机。gcp-workstation 已不存在，Remote 部署 BLOCKED。
- 第三轮反馈：删「需你处理」面板与运行页停止按钮（改用输入区原生 dock / 停止）；拒绝授权、忽略提问不再算失败；状态词改为 运行中 / 等你回应 / 待命 等，回放写「当时…」，去「（推断）」与「N 个会话」；build 不再三处重复；图例文字恢复；「执行计划」单行。单测 263/0，E2E en/zh 37/37（最终构建），重放 19/19，vsix 已装本机。
- 第四轮：交接卡片未选中时显示最新子代理，没有子代理时显示主代理最近一次工具调用；去掉「当时」与「最后事件（推断）」。单测 266/0，E2E en/zh 37/37（文案改动前），重放 19/19，vsix 已装本机。
- 文案：子代理最后一步「已吸收」改为「已取回」（英文 Absorbed → Collected），与「待取回」成对。已提交 97251ac；单测 266/0，干净重放 19/19（与 vendor 一致），E2E（mock）c5-runtime en 37/37、zh 37/37（runs/20261004-153652-c5-runtime-b6d0、20261004-153855-c5-runtime-3bbe），vsix `oco-0.0.4-97251ac` 已装本机。未部署；NOT RUN：真实模型、Remote。

### 运行视图 M4 第二批（补丁 0019 追加，2026-10-04；在分支 `claude/nostalgic-gates-ef74ca`，已提交 97251ac，未部署）

- 回环航道替换运行树的子代理卡片与回填框：探针按 待执行 / 执行中 / 泊位（待取回）/ 已吸收 移动，后台任务按 `backgroundTaskId` 对上子会话，`background_output` 取到结果才算取回；点探针看交接详情、可进入子会话。左栏去掉子代理名册；主代理框两行；终端 HUD 配色；状态栏按含义着色、窄宽度隐藏低优先项；停止按钮改图标。另一会话按用户反馈加了「第 N 轮」、探针沿航道移动等（见验收 checkpoint）。
- 验证：vendor 类型 0 错误；session 单测 270/0；browser 7/0；根 typecheck PASS、unit 190/0；E2E（mock）c5-runtime en 37/37、zh 37/37；0019 重新生成（29 个文件），干净重放 19/19、重放树单测 270/0。vsix 已装本机。详见 [验收](evidence/runtime-m4-batch2.md)。
- NOT RUN：真实模型、Remote、亮色主题、嵌套 ≥2 层。

### 运行视图 M4 第一批（补丁 0019 追加，2026-10-04；在分支 `claude/nostalgic-gates-ef74ca`，已提交 97251ac，未部署）

- 回放播放控制（⏮ ◀ ▶/⏸ ▶|、1×/2×/4×、空格 / ← →）、会话日志精简 + 全文浮层（筛选、点行跳转）、思考框 11 px + 全文浮层。顶栏在 1100 px 下保持一行。
- 验证：vendor 类型 0 错误；session 单测 226/0；test:browser 48/0；根 typecheck PASS、unit 190/0；E2E（mock）c5-runtime en 37/37、zh 37/37，c4-trajectory 17/17；0019 重新生成（25 个文件，+9283/−5），干净重放 19/19、重放树单测 226/0。详见 [验收](evidence/runtime-m4-batch1.md)。
- NOT RUN：真实模型、Remote、亮色主题。（第一批 vsix 已被第二批的包替换。）
- 第二批（回环航道 + 终端 HUD 配色）未开工；后台任务映射已查清：[调查](evidence/runtime-m4-bg-task-mapping.md)。

### 运行视图 M3（补丁 0019 追加，2026-10-04；在分支 `claude/nostalgic-gates-ef74ca`，未合入 main，未推送，未部署 Remote）

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

### 运行视图 M2（补丁 0019 追加，2026-10-03；在分支 `claude/nostalgic-gates-ef74ca`，未合入 main，未推送；已部署 gcp-workstation）

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

### 运行视图 M1（补丁 0019，2026-10-03；本地已提交，未推送，未部署）

- 会话标题栏第三个视图“运行”（对话 | 轨迹 | 运行），只读，实时 + 按步骤回看：焦点区、阶段条、并行工具/子代理行、事件日志、用量（未知≠0、已结算标记）、最后事件 xx 前（推断）；子会话权限/提问也算“等你处理”；中断的请求/工具标“已中断（推断）”。**不显示“断连”**（嵌入页没有连接健康信号）。三语 en/zh/zht。设计与计划：[spec](superpowers/specs/2026-10-02-runtime-dashboard-design.md)、[M1 计划](superpowers/plans/2026-10-03-runtime-dashboard-m1.md)。
- 补丁 `patches/opencode/0020-oco-runtime-view.patch`（9 个文件，+2332/−5）在干净 `51ef4be` 上与 0001–0018 依序应用 19/19；不改宿主、桥、公共契约。
- 检查（本轮实测）：vendor app 类型 0 错误；session 目录单测 90/90（运行视图 67）；根 `verify:brief` typecheck 0 错误、unit 185/185；webview 构建 PASS；E2E（mock，独立服务 4617）`c5-runtime` 英文 9/9、中文 9/9，回归 `c4-trajectory` 17/17。证据：[验收](evidence/runtime-m1-verification.md)、[E2E](evidence/runtime-m1-e2e.md)。
- NOT RUN：真实模型、Remote、1000+ 消息真实性能（合成基准一次重建约 140–165 ms，其中约 116 ms 为既有 `buildTrajectory`）、子代理/审批界面/429/取消的 E2E、实时与事后重建的逐事件一致性对比。M2（审批按钮、子代理加载与下钻、取消）与 M3（机制图、思考流、嵌套折叠、键盘/读屏、多宽度/主题 E2E）未做；M3 前须先重构单一大 memo 与按对象引用重建的行。
- 过程：Gemini（agy）实现与跑 E2E，Claude 评审；Grok 额度不足未用。委派包装代理两次因 API 额度错误被中断，但 agy 任务自行完成并经主线程核对。`tests/unit/e2e-results.test.ts` 与 `docs/TEST-SCOPE.md` 已同步到 22 个全量套件。

### 会话标题行恢复上下文用量（补丁 0019，已提交到 main，2026-10-08；`oco-0.0.4-24fb5da.vsix` 已装本机 VS Code，需 Reload Window）

- 嵌入模式会话标题行（对话、轨迹两个视图）显示上下文圆环，不显示数字（用户要求省空间）；≥75% 黄、≥90% 红；数字只在悬停提示里，模型无上限时提示显示「—」。替代补丁 0017 隐藏圆环的做法。`scripts/setup.sh` 修复重放：清掉补丁新建的未跟踪文件，补丁失败即退出。
- 检查：补丁 0001–0019 在固定 SHA 上重放两次通过；`tsgo -b` PASS；build PASS；E2E（mock）`c4-trajectory` 17/17（去掉数字后重跑）。NOT RUN：配色阈值与「—」、窄面板、真实模型、Remote。详情 [c5-context-usage](evidence/c5-context-usage.md)。

### 会话侧栏改为 webview（[Jack-Xiao/oco#3](https://github.com/Jack-Xiao/oco/pull/3)，2026-10-08 合并为 `9b32950`；已装本机 VS Code）

- 侧栏 oco 只有一个 webview 视图 "Sessions"（id 仍为 `oco.sessions`），外观接近 Claude Code：时间右对齐、圆角选中、30px 行高。搜索改为标题栏按钮触发；Connection 视图删除。决定见 [ADR-008](adr/008-webview-sessions-list.md)，过程与委派见 [spike 记录](evidence/sessions-webview-spike-2026-10-08.md)。
- 检查：typecheck PASS；build PASS；unit 185/185；E2E（mock）`p1b-sidebar` 13/13、`c3-fork` 4/4、`p1b-reconnect` 5/5、`t010-recover` 5/5、`t014-connection` 6/6。NOT VERIFIED：右键菜单（macOS 原生菜单）。NOT RUN：其余 E2E、Remote（gcp-workstation 已不存在）。
- 部署：`oco-0.0.4-9b32950.vsix`（extension.js sha256 `fa68647b…`）用 VS Code 自带 CLI 覆盖安装到本机，安装目录哈希一致；需 Reload Window。旧实验设置 `oco.experimental.webviewSessions` 已不存在，可从用户设置删除。

### 仪表盘 v4 独立设计评估（2026-10-02；未实施）

- 已抽查独立演示的 420/560px 窗格、权限等待、实时模拟和子代理下钻；完成 Grok 只读数据核查与[设计建议](design/dashboard-v4-review-for-claude.md)。建议采用单一阅读焦点、全局分支摘要和明确数据来源；用户尚未确认全部建议。
- 只新增设计/证据，未修改 Claude 原型或产品代码。产品 typecheck/unit/build/E2E NOT RUN。用户授权向原会话发送建议；桌面锁屏且远程网页要求重新登录，尚未送达，见[本批证据](evidence/dashboard-v4-review-2026-10-02.md)。

### 项目委派规则收紧（2026-10-02；文档）

- AGENTS 已明确：调查、独立实现、测试和文档检查先实际委派；主线程接手需记录具体例外；请求路线、执行证据、fallback 和阶段结果留在一份短记录里。STATUS/NEXT 按任务段落读取，避免默认加载全文。
- 本轮 Gemini 订阅探测被地域限制拒绝，转 Grok 复核 PASS；链接、diff 格式与 4 项并发基线保护检查 PASS，见 [本批证据](evidence/delegation-rules-20261002.md)。产品检查及后续会话行为验证 NOT RUN；本批未添加强制拦截 hook。

### HTML 技术手册（2026-10-02；文档交付）

- 新增 [面向初学者的技术手册](technical-guide.html)：21 章，涵盖源码嵌入、宿主桥/流、身份与状态、Remote、前端/构建、12 项风险、18 个补丁与文档导览。离线单文件，带目录搜索、流程教学、风险筛选、主题与打印样式。README 已加入入口。
- 本轮文档验证：40 项 PASS（Chromium 147.0.7727.15；1440/390 布局、链接/锚点、JS、交互、打印、无外部资源请求及关键源码事实）；见 [验证 JSON](evidence/technical-guide-validation.json)、[复核说明](evidence/technical-guide-review.md)。产品构建/E2E/Remote NOT RUN（本轮仅文档）。
- Claude 只读观察：先前额度阻塞后已恢复，最新重连 mock 5/5 PASS（已读 results.json）；产品批次仍未提交，因本线程暂存文档而暂停提交。本轮只提交文档并释放暂存区，不包含其产品改动；本批 Remote NOT RUN。见 [观察记录](evidence/technical-guide-claude-observation.md)。

### 扩展界面英文化（提交 `85d4c3c`，2026-10-01；在 main 上，已部署 gcp-workstation；本地，未推送）

- 扩展（`apps/extension/src`、`package.json`）与 `apps/chat-webview/src/submit-status.ts` 不再有写死中文，界面只显示英文；对照表见 [i18n-english-strings](evidence/i18n-english-strings.md)。嵌入聊天界面（OpenCode 及补丁 0013/0014 的轨迹文案）仍按 OpenCode 语言设置切换，默认英文；`recovery.tsx` 保持按 locale 中英双语。
- 检查：typecheck PASS、unit 169/169、build PASS；E2E `t015-diagnostics`、`t014-connection`、`p1b-sidebar`、`p1b-pending-send`、`p1b-reconnect`、`t007-managed` 共 41 项 PASS（`search-scope-hint` 首轮因两条英文提示共用前缀导致测试提前取值而 FAIL，收紧等待条件后重跑 PASS）。部署 `oco-0.0.4-85d4c3c.vsix`，远程状态栏显示 `oco: Starting server…`。NOT RUN：其余 E2E 套件。

### 状态栏 oco 标志（提交 `e4cc861`、`588f821`，2026-10-01；在 main 上，已部署 gcp-workstation；本地，未推送）

- 已连接时状态栏用 `$(oco-logo)`（`contributes.icons`，单字形字体 `media/oco-icons.woff`，`scripts/build-icon-font.mjs` 生成），替代 `$(plug)`；版本不符时仍换成 `$(warning)`。其他状态图标不变；Connection 视图仍用 plug。
- 第二版按用户反馈改细：16px 下线宽约 1px，四周留白，与相邻 codicon 一致。
- 检查：typecheck PASS、unit 169/169；`oco-0.0.4-588f821.vsix` 部署 gcp-workstation（`extension.js` 未变，哈希 `f2b3bc3e…`），`scripts/remote-look.mjs` 截图确认状态栏显示新标志。NOT RUN：E2E（`t015` 的状态栏正则已同步为 `oco-logo|warning`）。
- 远程截图另见一次恢复的编辑器标签显示 `An error occurred while loading view: oco.chat`（测试 profile 残留标签，启动早期），未调查。

### 基线与并行工作

- 本文件更新于 2026-09-30。当前 main 含 C1 焦点收尾与 T010 错误恢复（`3e67fc7` 及其合并提交，补丁 0001–0008）与测试提速（`23c0954`、`376470e`）。本地，未推送；P1b 产品代码 `6343f7b`。实时版本以 `bun run brief` 为准。
- 已有 P0、P1a、P1b-1 的本地原型及验收记录，以及 P1b 稳定性收尾（NEXT 第 1 步与第 2 步的大部分）。产品基线见 [P1b-1 验收](evidence/p1b1-acceptance.md)、[ADR-006](adr/006-p1b1-sessions-sidebar.md)、[稳定性收尾](evidence/p1b-stability.md)。不是已发布版本。
- C1 已实现并验证（`3bc386f`）；C1 路径加固与两个点击补点已实现并验证，已提交并快进合入 main（本地，未推送）。C2 来源调查与模块测试已提交（`c427722`）；HTTP/持久化与 blob 缺失测试 5/5 PASS（本批）。单轮 Diff 展示已实现并提交（`7fd3bd5`，补丁 0007）。模型驱动的空 Diff 轮次 E2E NOT RUN。

### 连接后误显示「没有会话」（提交 `363e5c5`，2026-10-02；已部署 gcp-workstation）

- 原因：连上后 `oco.connState` 立即变成 connected，列表数据要等下一次合并刷新（150 ms）才渲染，中间树为空，空列表提示「This workspace has no OpenCode sessions yet」先出现（本机约 0.34 s，Remote 更长）。探针（切到不可达端口再切回）修复前 4/4 闪现。
- 修复：新上下文键 `oco.sessionsEmpty`，只在刷新后确认已连接且列表为空时为真；三条「已连接」空列表提示都改为依赖它；其间显示「Loading sessions…」。
- 检查：typecheck PASS；unit 185/185；build PASS；探针修复后 0/4 闪现，搜索无结果提示和真实空目录提示仍正常；`p1b-sidebar` 13/13（[结果](evidence/runs/20261002-004120-p1b-sidebar-c5d9/results.json)），connection-switch 新增 emptyFlash/loadingSeen 判定，去掉修复的对照运行判 FAIL。部署：`oco-0.0.4-363e5c5.vsix`（extension.js sha256 `c4530fd9…`）已装到 gcp-workstation，远端哈希一致，新开 Remote 窗口列表正常加载；用户窗口需 Reload Window。NOT RUN：其余 E2E。

### 侧栏会话列表改版（提交 `8d215c3`，2026-10-01；已部署 gcp-workstation）

- 分组只按时间：昨天 0 点以后（本地日历）的会话直接列出；更早的进折叠的「More」（显示数量）。运行中、等待权限/回答、未读的会话不论多旧都留在上面；上面为空时 More 自动展开；搜索结果平铺。
- 状态只用图标：出错 `error`；等待权限/回答黄色实心点；运行中灰色呼吸点（自定义 SVG，透明度 1↔0.3、1.6 s，`workbench.reduceMotion` 为 on 时改静态点）；未读蓝点（运行结束时不是活动面板，打开后清除，按工作区记在 workspaceState）；空闲用 `blank` 占位保持对齐。行尾只留短时间（now / 7m / 3h / 1d / 3d / Sep 28；昨天显示为 1d（2026-10-09 改）），状态文字移到悬停提示和读屏标签，去掉「Open」。
- 加载：首屏 100 个根会话，「Load more…」每次再拉 100（服务端无游标，按更大 limit 重拉）；切换服务器/目录回到 100。搜索同时请求服务端 `search=`（标题，全部历史），结果并入列表；老版本服务端忽略该参数时退回本地过滤。去掉「只加载最近 200 个」提示。
- 检查：typecheck PASS；unit 185/185（新增 `session-groups`、feed/store 的 loadMore/search/mergeRoots）；build PASS；E2E（mock）`p1b-sidebar` 13/13 PASS（[结果](evidence/runs/20261001-155122-p1b-sidebar-20fc/results.json)），新增 sidebar-status-icons：真实 VS Code 中运行行图标为该 SVG，相隔 800 ms 的两张截图不同（动画在播）；Load more 点击后 100→200。
- 部署：`oco-0.0.4-8d215c3.vsix`（extension.js sha256 `670999f5…`）已用 `scripts/deploy-remote.sh` 安装到 gcp-workstation，远端哈希一致。`scripts/remote-look.mjs` 新开 Remote 窗口截图：昨天的 7 个会话平铺，More 10（2d/3d），时间与分组正确；当时无运行中会话，呼吸点未在 Remote 上目测。用户自己的 Remote 窗口需 Reload Window。
- 限制：原生 TreeView 不能右对齐或单独弱化时间，标题过长时行尾时间被省略号截掉；选中行的图标被主题改成选中前景色（等待点在选中行上显示为白色）；测试服务的会话都在今天，「More」分组未在 E2E 里出现（单元测试覆盖）。另跑 `p1b-reconnect` 5/5（比较器改为对照服务端最新 N 条，N = 侧栏行数：新会话把第 100 条挤出首页时它仍留在列表里，属预期）、`c3-fork` 4/4、`p1b-main-panel` 8/8。NOT RUN：其余 E2E、Remote。

### 嵌入模式去掉「更多」菜单（补丁 0018，2026-10-01；本地，未推送）

- 嵌入会话页不再显示三点菜单；归档改为侧栏会话右键「Archive Session」（`oco.archiveSession`，PATCH `time.archived`），重命名、删除仍在右键菜单。导出、分享在嵌入模式下不再有入口。
- 检查：typecheck PASS；unit 169/169；`tsgo -b` PASS；补丁重放一致；build PASS。NOT RUN：E2E、真实右键归档。

### 嵌入模式标题行合并（补丁 0017，2026-10-01；本地，未推送）

- 会话页不再显示标题栏整行；状态和审查面板开关移入会话标题行（对话与轨迹都有），上下文用量圆环在嵌入模式下隐藏。新会话页保留标题栏。
- 检查：`tsgo -b` PASS；build PASS；`c4-trajectory` 17/17（第 3 次运行；第 1 次 `subagent-link` 时序 FAIL，第 2 次启动时崩溃），见 [c4-header-actions-run](evidence/c4-header-actions-run.md)。NOT RUN：中文环境、Remote。

### 移除 Agents 视图，新增 Connection 视图（提交 `b405b19`，2026-10-01；在 main 上，已部署 gcp-workstation；本地，未推送）

- 用户决定：暂不要 Agents，但保留侧栏单独的 “∨ Sessions” 标题行。VS Code 会把容器里唯一的视图并入容器标题，所以加了一个默认折叠的只读 Connection 视图（状态、服务、目录、模式、版本、托管进程、受限模式；“状态”行点击同状态栏）。Agents 代码、命令、单元测试和 `t013-agents` 套件已删除，需要时从 `2b40651` 恢复。
- 检查：typecheck PASS；unit 166/166；E2E（mock）`p1b-sidebar` 连续 3 次 12/12（新增 `connection-view`），`t014-connection` 6/6、`p1a-identity` 14/14、`t015-diagnostics` 4/4、`t010-recover` 5/5（这四个跑在合入 `28c90ac` 之前）。
- 测试修复：`p1b-sidebar` 的重命名 / 搜索输入框会被对话 webview 异步抢回焦点（紧接命令面板读状态之后），改动后时序变化暴露为 6 次 3 失败；新增 `openInputBox` 等输入框稳定持有焦点。证据和时间线见 [agents-removal](evidence/agents-removal.md)。
- 部署：`oco-0.0.1-b405b19.vsix` 部署 gcp-workstation，远端 `extension.js` 哈希一致（`6de0210b…`），远端清单含 `oco.connection`、不含 `oco.agents`。用户需在 Remote 窗口 Reload Window。
- NOT RUN：真实模型、Remote 窗口里的实际外观（未截图复验）。

### 无面板时首开：黑屏、logo 闪屏与等待（提交 `1ad31ce`，2026-10-01；已部署 gcp-workstation；已快进合入 main（`28c90ac`））

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

### 子智能体卡片打开系统浏览器（补丁 0016，提交 `37f2634`，2026-10-01；已快进合入 main 并部署 gcp-workstation；本地，未推送）

- 原因：对话里的子智能体卡片是 `<a href="/server/…/session/<子会话>">`。webview 页面的 `<base>` 是 `https://file+.vscode-resource.vscode-cdn.net/…`，这个路由被解析成 https 网址；VS Code 的 webview 点击拦截不看 `defaultPrevented`，受信任工作区里直接用系统浏览器打开它。同一次点击面板也切到了子会话。
- 修复：嵌入模式下 `DataProvider` 不提供会话 href（`directory-layout.tsx`）。卡片变成无 href 的 `role="button"`，点击仍经宿主 `openSession` 在本面板打开子会话；子会话里的「返回主会话」和父会话标题本来就是按钮。
- 检查：先写用例，未修复时 `c4-trajectory` 新项 `subagent-link` FAIL（`openExternal` 收到 https 网址），修复后英文 15/15、中文 15/15；回归 `p1a-identity` 14/14、`p1b-main-panel` 8/8（mock，独立服务 4547）。上游 app `tsgo -b` exit 0；`verify:brief` typecheck 0 错误、unit 168/168；补丁 0001–0016 在固定 SHA 上重放一致。
- 限制：失败的子智能体卡片副标题不再是链接（无法从失败卡片跳转）；轨迹里的子智能体行仍不跳转。NOT RUN：真实模型。证据见 [subagent-link-0016](evidence/subagent-link-0016.md)。
- 合入与部署：快进合入 main（`37f2634`）；主检出 `vendor/opencode` 补应用 0015、0016，与 0001–0016 重放结果一致。`oco-0.0.1-37f2634.vsix` 部署 gcp-workstation：extension.js 哈希一致（`7aaf9981…`，本批未改宿主），webview 538 个 JS 文件摘要与本地包一致。需在 Remote 窗口 Reload Window。Remote 上的点击 NOT RUN。
- 追加（点击后的长条焦点框）：VS Code 的 webview 默认样式给获得焦点的 `<a>` 画 1px 外框，卡片触发元素是整行宽的 `<a>`，点击就出现长条框；撤掉 0016 的构建上同样存在，不是 0016 引入的，之前被跳浏览器掩盖。`apps/chat-webview/index.html` 加一层样式让 `a:focus` 回到浏览器默认（只在键盘焦点显示，应用样式优先）。`c4-trajectory` 15/15（`subagent-link` 新增点击外框为 `none`）、`p1a-chat` 8/8、`c1-open-file` 6/6。提交 `7809eea`，快进合入 main；`oco-0.0.1-7809eea.vsix` 部署 gcp-workstation，远端 `index.html` 与包一致（extension.js 未变，`7aaf9981…`）；需 Reload Window，Remote 上的点击 NOT RUN。

### 会话切换黑屏与首开提速（补丁 0015，提交 `d73bf91`，2026-10-01；已快进合入 main 并部署 gcp-workstation；本地，未推送）

- 黑屏原因：页面启动时只缓存当前目录最近 5 个会话的信息。切到其余会话时，上游把整个会话工作区卸载，等 `GET /session/:id` 回来再重新挂载，之后才请求消息。补丁 0015 在嵌入模式下保持工作区挂载，首开直接用宿主给的目录（`Platform.embeddedDirectory`）。页面改为新会话的输入框真正显示后才向宿主报告 `ready`，避免草稿投到旧输入框。
- 桥接 gzip 此前在真实服务上没生效：服务端自己压缩，Node fetch 解压后保留 `content-encoding`，桥因此跳过压缩，`/provider` 以 6.56 MB 原样过隧道。现在这类响应会重新 gzip，未压缩 JSON 的门槛降到 32 KiB。
- 同一文档里同时在途、完全相同的 `GET /provider` 只发一次（启动时 4 次，计算 4 × 1.1–1.4 s → 1 次）；不缓存已返回的结果，写请求之后到达的读不合并。
- Remote 交替实测（每组 14 个会话 × 2 轮）：首访出现整页空白的切换，基线每组 9/12，修复版 4 组均 0/12；首开后第一次切换 5.5–6.6 s → 1.5 / 2.4 s；首访中位 376–625 → 236–404 ms；首开内容上屏比不预置目录少约 200 ms（一个往返）。详见 [switch-perf](evidence/switch-perf.md)。
- 检查：typecheck PASS；unit 168/168；上游 `tsgo -b` 0 错误；补丁 0001–0015 重放一致；E2E（mock）`p1b-main-panel` 8/8（新增 `switch-uncached-ready`，变异对照 FAIL；`switch-uncached-no-blank` 在本机对上游代码也通过，只作回归防护）。全量 E2E（mock，21 套件）：18 个 exit 0；`p1b-sidebar`（改名、搜索）和 `t007-multiroot`（new-session-in-folder）失败，单独重跑均通过；`t013-agents` 的 `duplicate-preserves-bytes` 失败，为已记录的环境问题（`.oco-test` 是链接目录）。`OCO_BRIDGE_GZIP=1` 下 `p1a-identity` 14/14、`p1a-chat` 8/8。
- 限制：大会话在新数据到达前保留上一会话的内容，没有加载提示；首开后约 1.5 s 内的第一次点击仍要等一次 `/provider`。NOT RUN：真实模型、慢隧道对比。
- 合入与部署：原补丁号 0014 与 main 上另一批次的 0014（轨迹）重号，改为 0015，rebase 到 main 后提交 `d73bf91` 并快进合入 main。集成后 `verify:brief --build` PASS（typecheck 0 错误、unit 168/168、build）；E2E（mock）`p1b-main-panel` 8/8、`c4-trajectory` 14/14；补丁 0001–0015 在固定 SHA 上重放与 vendor 树一致。`oco-0.0.1-d73bf91.vsix` 部署 gcp-workstation，远端 `extension.js` 哈希一致（`7aaf9981…`）。
- Remote 复验（已安装扩展，探针 `deployed-d73bf91`，14 个会话 × 2 轮）：首访空白帧 0/12；首开后第一次切换 941 ms；其余首访中位 415 / 最大 621 ms；回访中位 200 ms；页面收到的 `/provider` 为 556 KB（原 6.56 MB）。用户已打开的 Remote 窗口需 Reload Window 后才加载新代码。

### 轨迹比例按钮选中状态、子智能体行（补丁 0014，提交 `ef87ac0`，2026-10-01；本地，未推送，未部署）

- 修复「时长 / 轮次 / 调用」按钮高亮不跟随点击（选中状态只计算了一次）；按钮加 `aria-pressed`。三个按钮保留。
- 子智能体（OpenCode 通过 `task` 工具启动）在轨迹里显示为「子智能体 @名称 描述 → 回答」，精简模式下不折叠；详情显示子会话 ID。跳转子会话未做。
- 检查：app 类型检查 0 错误；轨迹单元 17/17；`verify:brief --build` 0 错误、unit 164/164、build PASS；E2E（mock）`c4-trajectory` 英文 14/14、中文 14/14（独立测试服务 4537，共用服务被其他会话占用）。
- NOT RUN：真实模型下的子智能体、Remote 部署、其他回归 E2E。证据见 [c4-trajectory-0014](evidence/c4-trajectory-0014.md)。

### 轨迹多语言、工具页签、折叠步骤（补丁 0013，提交 `dc9ecc2`，2026-10-01；本地，未推送）

- 轨迹文案移入 oco 自带字典 `session-trajectory-i18n.ts`（en/zh/zht，其他语言回退英文），没有放进上游 `src/i18n`：上游的语言一致性测试要求每个键覆盖全部约 50 种语言。
- 修复语言来源：此前宿主传给 webview 的 `zh-cn` 被应用当作未知语言，**中文 VS Code 里官方界面也显示英文**。现在用上游 `detectDesktopNativeLocale` 映射（zh-cn→zh、zh-tw→zht、pt-br→br）。开发模式下可用 `OCO_DEV_LOCALE` 覆盖，因为没装语言包时 VS Code 的 `--locale` 不改变 `vscode.env.language`。
- 系统行新增「工具」页签：数据来自 `GET /experimental/tool`，按服务端当前配置和默认智能体列出，并标明不是当时实际发送的内容；工具可展开查看描述和参数 schema。
- 列表默认「精简」：每轮里连续的思考和工具步骤折成一行摘要，点击展开（参照 DeepSeek）；可切到「全部」。
- 检查：app 类型检查 0 错误；轨迹单元 15/15；app session 单元 121/121；`verify:brief --build` 0 错误、unit 164/164、build PASS；E2E（mock）`c4-trajectory` 英文 12/12、中文（`OCO_E2E_LOCALE=zh-cn`）12/12；回归 c3-fork 4/4、p1b-main-panel 6/6、p1a-chat 8/8、p1b-narrow 12/12（首次 1 项面板创建失败，复跑通过）。
- 部署：`oco-0.0.1-dc9ecc2.vsix`（extension.js sha256 `cb95294a…`，因 `panels.ts` 改动而变化）已用 `scripts/deploy-remote.sh` 安装到 gcp-workstation，远端校验哈希一致；需在 Remote 窗口 Reload Window。
- NOT RUN：真实模型、Remote 上的界面查看、装中文语言包的真实 VS Code。证据见 [c4-trajectory-0013](evidence/c4-trajectory-0013.md)。

### 对话 / 轨迹视图（补丁 0012，提交 `3979333`、`09ce32a`，2026-10-01；已快进合入 main `fdf50a0`，本地，未推送）

- 会话标题栏加「对话 | 轨迹」切换；轨迹按轮次与每次模型请求列出用户输入、上下文、思考、回复、工具调用，带输入/模型/工具三条泳道（时长/轮次/调用标尺）、token 与缓存命中、费用、推算的首 token 延迟/生成/吞吐，以及存储的原始 JSON。输入框保留，切换会话回到对话。数据只来自 sync store，宿主与桥策略不变。详情：[c4-trajectory](evidence/c4-trajectory.md)，调研：[trajectory-feasibility](evidence/trajectory-feasibility.md)。
- 检查：app 类型检查 0 错误；模型单元 11/11；app session 单元 117/117；`verify:brief` 0 错误、unit 164/164；E2E（mock）`c4-trajectory` 9/9（已登记 `DEFAULT_SUITES`，共 21 个）；回归 p1a-chat 8/8、c3-fork 4/4、p1b-main-panel 6/6、c2-diff-unavailable 3/3、p1b-narrow 12/12。补丁 0001–0012 在干净上游上按序可应用。
- 真实数据（本机 OpenCode 库只读，12 个会话 260 次请求）：无负计时，单会话建模 ≤ 9.4 ms；首 token 中位数 deepseek-flash 568 ms 至 openrouter stealth 44 s。
- 部署：`oco-0.0.1-fdf50a0.vsix`（= main，产品内容与 `09ce32a` 相同）已用 `scripts/deploy-remote.sh` 安装到 gcp-workstation（extension.js sha256 `fcaa651d…` 不变，webview 更新）；需在 Remote 窗口 Reload Window。主检出的 `vendor/opencode` 已补应用 0012（核对过原状态正好是上游 + 0001–0011）；主检出的构建产物未重建，跑 E2E 前先 `bun run build`。用单独的 VS Code 实例在工作站上只读查看最长会话（12 次请求）：行数、计时、缓存命中正常，切换 101 ms。
- Remote 上发现并修复：中断的请求（服务端没有结束记录）被当作运行中，时间轴拉到“现在”。改为会话空闲或非最新请求时标「已中断」，在最后保存时间处结束（`09ce32a`）。复验 unit、`c4-trajectory` 9/9。
- 同时段工作站上用户的第二个 Remote 窗口扩展宿主在断线重连后未恢复，05:19:34 被 VS Code Server 回收，其托管 `opencode serve` 随之结束（oco 只结束自己启动的进程）。用户 Reload Window 后会重新启动。
- 限制：实际系统提示词、工具定义、原始 HTTP 请求 OpenCode 不保存，不显示；订阅模型费用为 0（标“未计价”）；列表未虚拟化。NOT RUN：真实模型 E2E、全量 E2E、数千行长会话。

### fork 后侧栏选中跟随（提交 `e1e0cc4`，2026-10-01）

- 侧栏原生选中跟随活动面板的会话（fork、新建、切标签）。typecheck、unit 164/164、build PASS；E2E（mock）`c3-fork` 4/4（新项 fork-sidebar-selection）、`p1b-sidebar` PASS。证据见 [c3-fork](evidence/c3-fork.md)。
- 部署：`oco-0.0.1-e1e0cc4.vsix`（extension.js sha256 `fcaa651d…`）已用 `scripts/deploy-remote.sh` 安装到 gcp-workstation；需在 Remote 窗口 Reload Window。Remote 上的 UI 行为 NOT RUN。
- `scripts/package-vsix.sh` 的 vsce 固定为 4.0.0（原 bunx 缓存损坏），已一并提交。

### 首次打开会话提速（2026-10-01）

- 第三轮（替换 `/provider` 预取）：首屏只需要会话消息，但消息请求常被服务端正在算的 `/provider`（大模型目录下每次 1.1–1.4 s，单线程）拖 1 s 以上。改为去掉预取，宿主把文档启动时的 `GET /provider` 暂缓到该文档第一个消息列表有响应之后，最多 3 s。Remote 与已部署的 `7ddac21` 交替 4 轮：冷开输入框中位 3297 → 1360 ms，同窗口第二个会话 1892 → 787 ms。详见 [首开提速证据](evidence/first-open-perf.md)。
- 第三轮检查：typecheck PASS；unit 164/164；E2E 默认 20 套件（mock）：16 套件全过；`c3-fork` 1 项失败，复跑 3/3；`t013-agents` `duplicate-preserves-bytes` 失败，基线同样失败（`.oco-test` 链接到主工作区，"隔离配置"路径判断不成立，环境原因）；`p1b-narrow` 新版 3 次各有 1–2 项失败，基线 3 次中 2 次也有类似失败（布局宽度、新面板未出现），判断为既有不稳定。
- 两个撤回的尝试：预取结果短时复用（4 份大响应同时到达面板，首屏反而慢 1 s）；先预取 `/session/:id`（没有改善）。

- 改动：markdown worker 语法按需加载（9.9 MB → 2.17 MB）；静态骨架屏 + 内联主题预载 + 主包 modulepreload；宿主在面板创建时预取 `GET /provider`（只用一次）；Remote 下宿主对 ≥256 KB 的 JSON 响应做 gzip 再发给面板（`/provider` 6.5 MB → 约 0.57 MB，面板用 `DecompressionStream` 解压）。详情、撤回的尝试和原始数据见 [首开提速证据](evidence/first-open-perf.md)。
- Remote 实测（gcp-workstation，隧道快，逐轮交替，每组 4 轮有效）：输入框出现中位 2979 → 2383 ms，内容完成中位 3237 → 2304 ms；骨架屏 336–395 ms 出现（旧版在此之前空白）。慢隧道下未做交替对比。
- gzip：用户真实会话日志（慢隧道）里首个会话约 17 s，其中 `/provider` 返回后约 5.7 s 无请求，与 6.5 MB 经隧道传输吻合。gzip 的 Remote 交替对比 NOT RUN（测试中工作站重启，用户的 4096 服务未运行）。
- 部署：`oco-0.0.1-7ddac21.vsix`（extension.js sha256 `9984e91e…`）已用 `scripts/deploy-remote.sh` 覆盖安装到 gcp-workstation，登记路径复查正确；需在 Remote 窗口 Reload Window 生效。打包时 `bunx @vscode/vsce` 缓存损坏，改用 `npx -y @vscode/vsce@3` 跑同一脚本。
- 变基到 main `344600e` 后复验：typecheck PASS；unit 165/165；E2E（mock）`p1a-chat` 8、`p1a-identity` 14、`p1b-theme-load` 3、`t010-recover` 5、`p1b-main-panel` 6、`c3-fork` 3 全部通过，`OCO_BRIDGE_GZIP=1` 下 `p1a-identity` 14/14。`scripts/deploy-remote.sh` 同样改为在扩展目录外暂存。
- 变基前：typecheck PASS；unit 145/145；E2E（mock）`p1a-identity` 连续 6 次 14/14，`p1b-theme-load`、`p1a-chat`、`t010-recover`、`p1b-main-panel` 全部通过；`OCO_BRIDGE_GZIP=1`（所有 JSON 都压缩）下这 5 个套件无失败。NOT RUN：其余 E2E、真实模型。[remote-install](remote-install.md) 已修正：暂存目录不能放在扩展目录里（否则会被 VS Code Server 登记，扩展从窗口消失）。

### 消息 fork 按钮（补丁 0011，2026-09-30；验证运行于 `d3ec2e9` + 本批改动）

- 用户消息：在 Revert 与 Copy 之间加 fork 按钮，行为同 `/fork`（新会话止于该消息之前，原文回填输入框）。
- 助手回复：在“复制回复”旁加 fork 按钮，保留整轮回复，切点为该轮之后的下一条用户消息；最后一轮则整段复制；输入框留空。输出中不显示，会话忙时不执行。
- 图标为自绘 `oco-fork`（v1/v2 图标集各加一项）。
- 新会话经宿主 `openSession` 在当前主面板原地打开（ADR-007），原会话不变。只复制对话，不回滚工作区文件。
- 证据：[c3-fork](evidence/c3-fork.md)；E2E `c3-fork` 3/3（mock）；p1a-chat、c1-open-file、c2-diff-unavailable、p1b-main-panel 均 exit 0（mock）。NOT RUN：真实模型、全量 E2E。

### 设置页高级开关（补丁 0009、0010，2026-09-30；验证运行于 `4d56f63` + 本批改动）

- 0009：设置页不再请求 `/pty/shells`（宿主拦截 → 面板崩溃）。修复前 4 个高级开关各自触发面板错误，修复后 0/4。
- 0010：面板内默认打开文件树、命令面板（搜索）、服务器状态和显示智能体；每个配置档只应用一次（`ocoEmbeddedDefaultsApplied`），用户之后关掉的保持关闭（新配置档探针：默认全开 → 关闭文件树 → 重启后仍为关）。
- 限制：截图里能看到状态按钮、侧栏按钮和智能体选择器；标题栏搜索按钮没看到，未查。脚本模型探针为临时脚本，未纳入 E2E 套件。NOT RUN：全量 E2E、真实模型。

### v0.1 收尾批次（2026-10-01；分支 `claude/v01-completion`，验证运行于 `2b40651`）

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

### 单主面板会话切换（ADR-007 第 2–4 步，2026-09-30；验证运行于 `fe20a44` + 本批未提交改动）

- 行为：最多一个主面板，点侧栏会话、打开会话、新建会话都在主面板里原地切换（宿主发 `navigate`，页面不重载）；右键或命令 `oco: Open in New Panel` 开固定面板；已显示的会话只聚焦所在面板；Reload Window 后角色保留。跨目录切换改为重建桥并重载文档（无专门 E2E）。
- 实测（mock，本机）：原地切换 254–398 ms（含命令面板操作），新开面板冷启动 2296–2477 ms。
- 检查：typecheck PASS；unit 141/141（新增 policy retarget）；构建 PASS。
- E2E 全量 15 套件（mock，构建不含最后一处 `ready` 竞态修复）：14 个 exit 0，`p1b-narrow` 失败（测试仍用"新建会话"开三个面板），已改测试。
- 竞态修复加上之后重新构建，重跑 `p1b-narrow` 12/12、`p1b-main-panel` 6/6、`p1a-identity` 14/14、`t010-recover` 5/5，均 exit 0。
- 测试适配：`frameSession` 改读页面当前会话；需要同时开多个面板的套件（p1a-identity、p1b-narrow、p1b-sidebar 第 9 步）改用 `Open in New Panel`；`nav-link-other-session` 改为断言主面板原地切换。
- 未运行：真实模型全量；跨目录切换；常驻内存测量。

### 面板保持存活（ADR-007 第 1 步，2026-09-30；验证运行于 main `3036c00` + 本批未提交改动）

- 用户反馈：每次切换编辑器 tab 回到聊天都要重新加载。原因：`retainContextWhenHidden:false`，隐藏即销毁文档，再显示时冷启动。
- 改动：面板改为 `retainContextWhenHidden:true`；隐藏不再 retire generation，也不关闭事件流；草稿在面板再次可见时投递。ADR-005 第 1、6 节已修订；新 [ADR-007](adr/007-single-main-panel.md)（单主面板在面板内切换会话，第 2–4 步待实施）。
- 检查（mock 模型）：typecheck PASS；unit 140/140；构建 PASS；E2E `p1a-identity` 14/14（`hide-retires-generation` 改为 `hide-keeps-document`：隐藏和再显示时 generation 不变，草稿仍在）；`p1b-pending-send`、`p1b-switch-pending` exit 0；`t010-recover` 首轮 3/5，两个失败用例的前提是“隐藏即重建”，已改为用 `Developer: Reload Webviews` 重建文档、在关闭前先显示旧面板，重跑 5/5。
- 未运行：其余 E2E 套件、真实模型；常驻内存未测量。

### C1 焦点收尾 + T010 错误恢复（提交 `3e67fc7`，合并入 main，2026-09-30；验证运行于合并前的分支，基线 `33433bb` + 当时未提交的 mock 测试改动）

全部 E2E 用脚本模型（`OCO_E2E_MODEL=mock`），证明 UI/宿主行为，不证明真实模型链路。详情与运行 ID：[证据](evidence/c1-focus-t010-recovery.md)。

| 项目 | 状态 |
| --- | --- |
| C1 焦点：1 s `refocus` 误伤用户主动回到聊天 | 已复现（旧代码 `c1-focus` 回到聊天 6/6 被拉回文件）。根因：VS Code 1.139.1 webview 焦点靠 250 ms 轮询，点击带来的 `did-focus` 可能在文件打开后才到。修复：页面报告 `focusAgeMs`，宿主在该次焦点上报前等待（≤约 310 ms）再打开；删除 `refocus`。`c1-focus` 3/3（共 100 次打开 0 次迟到激活）；去掉等待的变异 FAIL |
| T010 服务不可达 | 打开中断线：面板顶部提示条（重试/打开设置）；加载时不可达：oco 界面（重试/打开设置），恢复后面板重新加载、草稿保留；PASS |
| T010 会话已删除 | oco 界面（会话列表/新建会话/关闭面板），无重试、无请求循环；新会话不带旧草稿、不自动发送；PASS。草稿决定：保留在原面板存储，不迁移、不发送（无取回入口） |
| T010 未知错误 / 未知类型 | 通用界面，不显示原始响应/路径/堆栈（修复前会原样显示），去掉 Discord/报告文案；重新加载面板不空白；未知 part/tool 兜底 PASS |
| 上游补丁 0008 | `platform.recoveryView` 钩子（5 文件）；0001–0008 在 `51ef4be` 重放一致；上游 tsgo exit 0 |

`bun run verify:brief -- --build`：typecheck PASS、unit 140/0、build PASS。E2E：`c1-focus` 3/3、`t010-recover` 5/5（两次）、`c1-open-file` 6/6、`t014-connection` 6/6、`p1b-reconnect` 4/5（`search-scope-hint` 既有 FAIL，HEAD 源码对照同样 FAIL）。其余套件、真实模型 E2E NOT RUN。T010 验收项已覆盖，但只有脚本模型证据。合并入 main 后复验：verify PASS（unit 140/0）、`c1-focus` 3/3、`t010-recover` 5/5 ×2。全量定义现为 14 个套件（含 `c1-focus`）。

### 测试提速（提交 `23c0954`、`376470e`，2026-09-30；只改测试与文档）

- 全量定义统一为 13 个套件（`run.mjs` 与 `brief` 共用），按改动选套件见 [测试范围](TEST-SCOPE.md)。
- 可选本地 mock 模型（`OCO_E2E_MODEL=mock`）：13 个套件全部 exit 0，合计约 10.2 分钟（有历史数据的 11 个约 17.5 → 9.2 分钟）。mock 运行不计验收。
- 真实模型：12 个套件 exit 0；c1-open-file 3/6 **BLOCKED**（约 12:43 起测试模型不回复，同代码 mock 6/6）。结果分布在 33433bb（dirty）/ 23c0954 / 376470e，**不是同一提交的全量**。
- 单元 136/0、typecheck PASS；构建 NOT RUN（产品代码未改）。明细与运行 ID：[证据](evidence/test-speedup.md)。

### 连接设置子集 + C2/T010 收尾（提交 `92034b8`、`20f0ea1`、`092c6b3`，2026-09-30；验证运行于其提交前的 dirty `b393df6` 工作树，内容一致）

不是完整 T014/A15。详情与运行 ID：[证据](evidence/t014-connection-c2-close.md)。

| 项目 | 状态 |
| --- | --- |
| “Open Settings”入口、中文设置说明、错误状态区分（地址无效 / 无文件夹 / 认证失败 / 离线） | 完成；单元 136/136，E2E `t014-connection` 6/6 |
| c1-open-file 焦点失败 | （已被上节取代：`refocus` 已删除）真实问题（聊天面板约 16 ms 后重新激活），宿主一次性重新展示修复；`c1-open-file` 6/6，修复后 17 次运行无焦点失败（1 次模型未出 Diff 的无关 FAIL） |
| DiffUnavailable UI | `c2-diff-unavailable` 3/3（夹具；只证 UI，不证真实快照缺失全链路） |
| T010：未知类型 / 会话消失 | 未知类型 PASS；会话消失后 Restart 原本空白，已修复，`t010-recover` 2/2；错误页文案仍为上游（含 Discord） |

`bun run verify:brief -- --build`：typecheck PASS、unit 136/0、build PASS。其余 E2E 套件本批 NOT RUN。

### P1b 稳定性收尾（代码提交 `6343f7b`；测试运行于 dirty `e67129d`）

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

### C1 编辑器联动（`3bc386f`）

| 项目 | 状态 | 证据 |
| --- | --- | --- |
| 工具部件文件名点击 → VS Code 打开并定位 | 完成：read（含上下文分组，按 offset 行）、edit/write 标题、edit/write/apply_patch 文件头。补丁 0005 | `c1-open-file` 3/3 |
| 宿主路径校验 | 完成：须在会话目录内（含符号链接）、会话目录须映射本地工作区、只开普通文件、连接变化拒绝。加固：服务须为回环地址，否则拒绝；大小写按会话目录所在卷实测，不按平台假设；`path:line` / `#L` 在字面不存在时解析；修复 `math.ts:4` 被当作 URI scheme 拒绝 | 单元 24 项 + E2E 拒绝 5/5；[加固证据](evidence/c1-path-hardening.md) |
| 选区/当前文件上下文进入请求 | 复验通过（P1a 功能，本批未改） | `p1a-identity` draft-after-attacks `serverReceived: true` |
| Diff 摘要、Markdown 路径点击 | 完成：补丁 0006。Diff 摘要点文件名打开、箭头只展开；助手正文/推理中的行内代码路径（可带 `:line[:col]`、`#L`）打开并定位，普通链接与非路径代码不拦截 | `c1-open-file` 6/6（position-parse、markdown-path、diff-summary 为新增） |
| C2 可信 Diff | 来源验证完成（模块 8/8、HTTP/持久化/blob 缺失 5/5）；单轮 Diff 展示已实现（补丁 0007）：范围标签 + 空 Diff 时“不可用”行；不做会话级 Diff 与回滚 | [展示证据](evidence/c2-display.md)（E2E `c1-open-file` 6/6，运行 e1b7）、[来源矩阵](evidence/c2-diff-sources.md)、[运行时证据](evidence/c2-runtime.md) |

C1 首批检查（`3bc386f` 产品代码）：typecheck PASS；unit 117/117；上游 tsgo 0 错误；补丁 0001–0005 在 `51ef4be` 重放一致。默认 10 个 E2E 套件均有 exit 0 的运行，但不是同一次全绿：首轮全量中 p1a-chat、p1b-theme-load、p1b-ime、p1b-pending-send、p1b-switch-pending、c1-open-file 为 exit 0；p1b-sidebar、p1b-reconnect 因 worktree 符号链接路径与服务 realpath 不一致而失败（测试夹具问题，已改为 realpath），重跑 exit 0；p1b-narrow 首轮 `question-260` 失败（已知测试模型波动），重跑 exit 0；p1a-identity 两次因模型服务 `unknown certificate verification error` 导致回复未完成（提示均送达、无串会话），第三次 exit 0。p1b-ime 的真实输入法用例 NOT RUN。明细见 [C1 证据](evidence/c1-editor.md)。

路径加固 + 补点：typecheck PASS；unit 128/128；上游 tsgo（app、session-ui）0 错误；补丁 0001–0006 重放一致；webview/extension 构建成功；`c1-open-file` 6/6 exit 0，验收运行 `20260930-071232-c1-open-file-969b`（最终代码重建扩展后复跑；更早一次 6/6 用的是旧扩展包，不计）。其余 9 个 E2E 套件本批未重跑；大小写敏感真实卷、Remote-SSH NOT RUN。明细见 [加固证据](evidence/c1-path-hardening.md)。

### C2 本轮验证（2026-09-30）

`d1a3607` 加本轮未提交测试/文档；上游 `51ef4be`，Bun 1.3.10。`node tests/integration/c2-diff-runtime.mjs` exit 0：8 PASS / 0 FAIL，31 断言；另定向上游快照测试 5 PASS / 0 FAIL。真实 Snapshot/computeDiff 配合构造的消息边界，不等于 HTTP 或模型 E2E。本轮未跑 typecheck、oco unit、build、UI E2E（产品代码未改）。见 [C2 运行时证据](evidence/c2-runtime.md)。

第二轮（基线 `c427722`）：新增 `tests/integration/c2-diff-http.test.ts`，两文件一起运行 13 PASS / 0 FAIL，54 断言，exit 0。summarize 持久化到用户消息、`GET /session/:id/diff?messageID=` 读存储且按会话/用户消息限定；快照 blob 丢失时整轮 Diff 静默变 `[]`（完好文件也丢），HTTP 200。产品代码未改，未跑 typecheck/unit/build/UI E2E。

### 省 token 工作流

- 默认只读 AGENTS.md、本文件、NEXT.md 和任务点名的契约。
- 简单独立工作使用实际可用的 Grok/Gemini 订阅代理；provider/model 缺证据就记 unknown，不凭名称猜测。
- `bun run brief`：不运行检查，只汇总当前 Git 和历史证据，终端短输出。
- `bun run verify:brief`：离线 typecheck + unit；`bun run verify:brief -- --build` 再加构建。
- 明细：`.oco-reports/latest.json` / `latest.md`（Git 忽略）。不会自动运行真实模型 E2E。
- 新工具自身测试已通过 15 项，涵盖坏证据、版本更新、负向分类、输出长度和失败退出等。
- 最近一次委派验证（2026-09-30 00:48:59 UTC，HEAD e67129d dirty true）：`bun run verify:brief` exit 0，typecheck PASS（0 errors），unit 100 PASS / 0 FAIL；未加 `--build`。`bun run brief` exit 0，stdout 27 行。历史 E2E 为 MIXED_REVISIONS（e67129d, 4082f43, 064d915），禁止跨版本拼 PASS。产品工作仍在变化；该数字是时间点记录，不是当前状态保证。
- 本次没有重新执行真实 E2E。历史记录按具体代码版本和 dirty 状态显示，不能拼成当前全绿结论。

### 历史复验

`6343f7b` 的结果见上节。更早在 `f555347` 附近曾复验 80 个单元测试、typecheck、build 通过；既有 E2E 与记录一致。详见 [阶段复核](P1B1-REVIEW-NEXT.md)。这不是本轮通过记录。

### 未验证范围

| 项目 | 状态 |
| --- | --- |
| 真实 macOS 中文输入法 | NOT RUN；浏览器合成不等价 |
| 系统剪贴板图片 | NOT RUN |
| Windows | NOT RUN |
| Remote-SSH、团队实际服务 | BLOCKED |
| 企业服务版本 OpenCode 1.18.13（本地隔离，mock） | 19 套件无版本相关失败；p1a-identity 在 1.18.33/1.18.13 同样失败（环境回归，待查）；真实模型与企业实际服务 NOT RUN。见 [证据](evidence/server-1.18.13-compat-2026-10-06.md) |

### 维护规则

当前事实只更新本文件，当前队列只更新 NEXT；PROGRESS 追加批次历史。完成实现后记录准确提交与证据，再改变任务状态。全量日志/截图按需查询，不作为默认交接输入。

### 个人 GCP Workstation 连接修复（2026-09-30）

独立于 oco 产品验收：修复旧 IAM 隧道复用、GUI 的 gcloud Python 3.9 不兼容，以及 15 秒连接超时。真实 VS Code 已恢复 `~/ai` 工作区与远程终端；4 项定向检查通过。冷启动、跨睡眠/数小时稳定性 NOT RUN。oco Remote-SSH 功能验收仍未执行。见 [连接证据](evidence/gcp-workstation-20260930.md)。

## 2026-10-10 运行视图 M5 样稿同步产品 + 独立设计评审

- 样稿模板 `runtime-m5-mockup.src.html` 同步 2026-10-09 三轮反馈 + D2 + D18（1666 → 1775 行，再加 10 处 D18 淡色修正），动画页只经 `scripts/runtime-m5-mockup-build.mjs` 重建（时间线与 M4 截图抽成 `runtime-m5-timeline.json`、`runtime-m5-now-shot.webp`；改前 `--check` 逐字节一致）。发布私有页面 https://claude.ai/artifact/EhkZr1fkh2L2VsXqUb3btR 。
- 验证：build `--check` 通过；oracle 14 帧与 fixture 一致（仅 k09 / k10 tone err→faint，D18 预期）；截图 1100 / 560 × 14 帧 0 错误、横向滚动 0；卡片浮层 / 计划浮层 / 工具台 30 px 收缩交互核过。
- 委派：模板改动 Grok（run-mv1qk26y-pb2295，25 分 25 秒；其沙箱 Chrome 启动 SIGSEGV，用 jsdom 替代验收，主线程本机复跑官方 oracle 与截图）；Gemini 健康检查通过（Antigravity，Gemini-3.8-Flash）未用于主体；设计评审由 Claude 子代理替代用户点名的 Claude Design（内置浏览器未登录 claude.ai），17 次工具调用、15 张图。
- 产出：[runtime-m5-critique-2026-10-10](design/runtime-m5-critique-2026-10-10.md)（3 P1 / 5 P2 / 2 P3 + 3 条窄布局，未实施）；证据 [runtime-m5-mockup-sync-2026-10-10](evidence/runtime-m5-mockup-sync-2026-10-10.md)。产品代码、补丁、vsix 未动。

## 2026-10-10 收口批次（NEXT 重写、STATUS 瘦身、M5 小坑、补丁再生成、真实模型回归一轮）

- 子代理：Gemini 健康探测、STATUS 瘦身、M5 三个小坑（Gemini）；`regen-patch.sh`（Grok）；全量真实模型 E2E（Gemini，挂起后中止）；失败诊断（Grok，测试侧修 5 个文件）。主线程做 NEXT、仓库卫生、0020 再生成、构建安装和 5 个套件重跑。
- 结果：0001–0020 干净重放；typecheck 0、unit 190/0、session 单测 427/0、build PASS。真实模型 E2E 21 套件首轮 16 无 FAIL；重跑后 p1a-chat 8/0、p1a-identity 14/0、p1b-narrow 8/1、c4 15/2、c5 24/4。
- 教训：外部代理不能自己起常驻服务再等待“后台任务结束”；grok-subagent 的 wait 没有总时长上限；子代理报告的 files changed 是整个工作区 diff，同目录有别的会话并发时不能直接用来验收。
- 证据：[cleanup-2026-10-10](evidence/cleanup-2026-10-10.md)、[fail-diag](evidence/cleanup-2026-10-10-fail-diag.md)、[real-model](evidence/cleanup-2026-10-10-real-model.md)。

## 2026-10-10 收口批次（仓库卫生、文档瘦身、M5 遗留、补丁再生成脚本、真实模型回归）

- 仓库：忽略 `.oco-e2e-*.log`；删 15 个历史 vsix；删 14 个已合并 `claude/*` 分支（11 个连同干净 worktree）。
- 文档：STATUS 412 → 59 行，47 个小节原文迁入本文件上一节；NEXT 重写（收口、真实模型回归、多 agent 驾驶舱、小项、v0.1 剩余）。
- 代码（补丁 0020，58 文件）：子会话 `syncChildHistory` 翻完历史；`dropStepTimes` 随 `dropSessionCaches`；`snapshotAt` / `requestOf` 不再泄漏 t 时刻之后的 cost / tokens。session 单测 427/0，app typecheck 0，根 typecheck 0 / unit 190/0，build PASS，本机装 `oco-0.0.4-ce17cd8.vsix`。
- 新增 `scripts/regen-patch.sh`（临时 worktree 重建基线 + 干净重放 + `diff -r` 校验）；伪 source 自测与现有 0020 字节相同。
- 真实模型 E2E（big-pickle）：20 套件全量；首轮 5 套件有失败，重跑后 p1a-chat、t007-managed、c4 rows-match-server、c5 plan-chip 通过，其余为 mock 专属断言 / 非确定性 / 连锁，无产品缺陷。探查：新对话阶段序列与流式递增正常；嵌套 ≥2 层 NOT RUN（模型不派孙代理）；亮色主题仅一处圆点对比度偏低。
- 委派：Gemini A（STATUS 瘦身）、B（M5 修复）验收通过；Grok C（regen 脚本）验收通过；D 真实模型三程（Gemini 中断 → Grok 沙箱不能开 VS Code → Gemini 再中断）但产物齐全。证据：[cleanup-2026-10-10](evidence/cleanup-2026-10-10.md) 及同前缀四个文件。
