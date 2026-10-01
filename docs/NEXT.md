# 当前队列

本文件是唯一的当前队列。状态只看 [STATUS](STATUS.md)。不要执行 HANDOFF 或 P1B-NEXT-STEPS 里的旧提示词。

进度：P1b、C1、C2、T014 连接子集、ADR-007 面板、设置页修复（补丁 0009/0010）已完成。2026-10-01 的 v0.1 收尾批次（[计划](V01-COMPLETION-PLAN.md)、[证据](evidence/v01-completion.md)）完成了托管模式（T007）、Agents 视图（T013）、诊断与状态栏（T015）、打包部署脚本与使用说明（T018），并在 gcp-workstation Remote 上查看了已安装扩展。消息 fork 按钮（补丁 0011）由另一会话完成并已提交（`7a1e54d`）。

## 1. 登记与收口（小，先做）

- [DONE] fork 批次已提交（`7a1e54d`）；四个新套件登记进 `DEFAULT_SUITES`（共 20 个），TEST-SCOPE 同步，PROGRESS 已追加 v0.1 批次条目。
- [DONE] fork 批次（未提交）+ 本批的 main 工作树已构建 `oco-0.0.1-44e4b8a.vsix` 并部署 gcp-workstation，远端复验通过。fork 批次提交后如有改动，按 `scripts/package-vsix.sh` + `scripts/deploy-remote.sh` 重做。

## 2. 真实模型回归（缺环境时标 BLOCKED）

- [TODO] 同一提交的真实模型全量：`node tests/e2e/run.mjs`。前提：测试服务用真实模型配置启动（`bash scripts/test-server.sh`，不带 `OCO_E2E_MODEL=mock`）且模型能回复；没有其他会话同时跑 E2E。
- [DONE] Remote 上的发送、取消、点击远端文件（`scripts/remote-chat-check.mjs`）。
- [TODO] Remote 断网恢复、本机粘贴图片（A11 剩余）。不改用户的远端机器设置。

## 3. 性能与资源（T017）

- [DONE] `tests/e2e/perf.mjs` 已按 ADR-007 改写并记录基线（见[证据](evidence/v01-completion.md)）。
- [TODO] 长时间（数小时）运行与长会话的内存趋势；真实模型下的切换耗时。
- [DONE，未提交] 会话切换黑屏与首开提速（补丁 0015、桥接 gzip 修正、在途 `/provider` 合并），见 [switch-perf](evidence/switch-perf.md)。待用户决定是否提交并部署 gcp-workstation。
- [TODO，按需] 切换到大会话时，新数据到达前没有加载提示（上游 transition 保留旧内容）；首开后第一次点击仍可能等一次 `/provider`（1.2–1.4 s）；首开的健康检查往返。

## 4. 仍未做的 v0.1 项（按需单独立项）

- T009：多连接/多工作区分组、分页或服务端搜索。
- T010：键盘可访问性、主题配色专项检查。
- T011：附件/图片大小限制与远端来源区分。
- T013/T014：Agent 表单式编辑（目前以原文编辑为准）、管理页外壳。
- T018：正式 publisher、oco 自身许可证（需用户决定）。

## 5. 对话 / 轨迹（补丁 0012、0013）

- [DONE] 第 1 阶段只读轨迹，提交 `3979333`、`09ce32a`，已快进合入 main 并部署 gcp-workstation（`fdf50a0`），在 Remote 只读查看过，见 [c4-trajectory](evidence/c4-trajectory.md)。
- [DONE] 补丁 0013：轨迹文案多语言（en/zh/zht）、系统行「工具」页签、默认折叠步骤；修复 VS Code `zh-cn` 被当作英文的问题。已提交 `dc9ecc2` 并部署 gcp-workstation，见 [c4-trajectory-0013](evidence/c4-trajectory-0013.md)。
- [DONE] 补丁 0014：比例按钮高亮修复；`task` 显示为子智能体行（含子会话 ID）。已提交，未部署，见 [c4-trajectory-0014](evidence/c4-trajectory-0014.md)。
- [TODO] 子智能体行跳转到子会话（需确认 oco 面板内切换子会话的方式）。
- [TODO] Remote 窗口 Reload Window 后查看轨迹；在装有中文语言包的 VS Code 里确认官方界面和轨迹都是中文。
- [TODO]（用户已决定暂不做）工具页签按会话智能体的权限标灰被禁用的工具；MCP 工具单独分组。
- [TODO] 数千行长会话的滚动与内存（工作站上最长只有 12 次请求）。
- [TODO] 第 2 阶段（按需）：子代理会话嵌套查看；订阅模型按 API 价目估算费用（标“估算”）；长会话列表虚拟化。
- [不做，除非用户另行决定] 记录实际系统提示词/原始请求：需往 OpenCode 加插件（experimental 钩子），只能在托管模式注入。

## 执行约束

- 开工只读 AGENTS.md、STATUS.md、NEXT.md，以及本任务点名的契约。
- 主代理只做范围、架构、集成和关键抽验。有风险或证据矛盾再深入。
- 历史 E2E 不是本轮通过；mock 运行不计真实模型验收。
- 真实 IME、系统剪贴板、Windows 仍按 STATUS 的未验证标记。缺环境就标 NOT RUN 或 BLOCKED。
- 任务写明授权时可以本地提交。不自动推送或发布。
