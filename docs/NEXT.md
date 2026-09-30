# 当前队列

本文件是唯一的当前队列。状态只看 [STATUS](STATUS.md)。不要执行 HANDOFF 或 P1B-NEXT-STEPS 里的旧提示词。

进度：P1b、C1、C2、T014 连接子集、ADR-007 面板、设置页修复（补丁 0009/0010）已完成。2026-10-01 的 v0.1 收尾批次（[计划](V01-COMPLETION-PLAN.md)、[证据](evidence/v01-completion.md)）完成了托管模式（T007）、Agents 视图（T013）、诊断与状态栏（T015）、打包部署脚本与使用说明（T018），并在 gcp-workstation Remote 上查看了已安装扩展。消息 fork 按钮（补丁 0011）由另一会话完成，等待用户确认提交。

## 1. 登记与收口（小，先做）

- [TODO] fork 批次提交后，把 `t007-managed`、`t013-agents`、`t015-diagnostics` 加入 `tests/e2e/run.mjs` 的 `DEFAULT_SUITES`（合计 19 个），同步 `tests/unit/e2e-results.test.ts` 标题和 `docs/TEST-SCOPE.md`（计数、全量列表，以及 managed-server / agents / diagnostics 三行改动范围）。PROGRESS 追加 v0.1 批次条目。
- [TODO] 用 fork 批次和本批合并后的同一提交重新构建 VSIX，部署 gcp-workstation 并用 `scripts/remote-look.mjs` 复看。

## 2. 真实模型回归（缺环境时标 BLOCKED）

- [TODO] 同一提交的真实模型全量：`node tests/e2e/run.mjs`。前提：测试服务用真实模型配置启动（`bash scripts/test-server.sh`，不带 `OCO_E2E_MODEL=mock`）且模型能回复；没有其他会话同时跑 E2E。
- [TODO] Remote 上的发送、取消、断网恢复、本机粘贴图片、点击远端文件（A11）。需要能在 Remote 窗口操作；不改用户的远端机器设置。

## 3. 性能与资源（T017）

- [TODO] `tests/e2e/perf.mjs` 按 ADR-007 改写：主面板 + 3 个固定面板、10 个已打开会话，记录各进程 RSS 与切换耗时；“隐藏释放请求”改为“隐藏保持存活且无事件流泄漏”。

## 4. 仍未做的 v0.1 项（按需单独立项）

- T007：多根工作区映射（现在只用第一个文件夹）。
- T009：多连接/多工作区分组、分页或服务端搜索。
- T010：键盘可访问性、主题配色专项检查。
- T011：附件/图片大小限制与远端来源区分。
- T013/T014：Agent 表单式编辑（目前以原文编辑为准）、管理页外壳。
- T018：正式 publisher、oco 自身许可证（需用户决定）。

## 执行约束

- 开工只读 AGENTS.md、STATUS.md、NEXT.md，以及本任务点名的契约。
- 主代理只做范围、架构、集成和关键抽验。有风险或证据矛盾再深入。
- 历史 E2E 不是本轮通过；mock 运行不计真实模型验收。
- 真实 IME、系统剪贴板、Windows 仍按 STATUS 的未验证标记。缺环境就标 NOT RUN 或 BLOCKED。
- 任务写明授权时可以本地提交。不自动推送或发布。
