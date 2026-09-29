# oco 进度与下一步

更新时间：2026-09-30（P1b-1 完成后）。

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
