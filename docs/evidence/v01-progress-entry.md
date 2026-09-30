
## v0.1 收尾批次（2026-10-01，分支 `claude/v01-completion`，快进合入 main）

- 计划：docs/V01-COMPLETION-PLAN.md。产品：托管模式（managed-server.ts、connection.ts、endpoint.ts）、Agents 视图（agents.ts、agents-view.ts）、状态栏版本与诊断导出（diagnostics.ts、sessions-view.ts）、设置 `oco.serverMode`/`oco.opencodePath`。打包：scripts/package-vsix.sh、scripts/deploy-remote.sh、CHANGELOG、docs/USER-GUIDE.md。远端查看：scripts/remote-look.mjs、scripts/remote-chat-check.mjs（独立 VS Code 实例，不操作用户窗口）。
- 多根工作区：“oco: Select Workspace Folder”，t007-multiroot 5/5。
- 新 E2E：t007-managed 7/7、t013-agents 6/6、t015-diagnostics 4/4；perf 按 ADR-007 改写 4/4（mock）。unit 161/0。
- 真实问题：重载配置后侧栏事件流断开（改为立即重连）；已删除文件的 Agent 被误标为配置文件来源（改为待生效）；Agents 视图让 Sessions 标题按钮变为悬停显示（p1b-sidebar、t010-recover 测试已适配）。
- 集成：main + 未提交的 fork 批次，默认 16 套件 + 3 新套件 + perf 全部 exit 0（mock）。gcp-workstation 部署 `oco-0.0.1-1a6b2c7.vsix`，远端发送/取消/远端文件/fork 按钮复验通过。
- 协作：fork 按钮批次（补丁 0011）由另一会话完成，待其用户确认提交；本批未提交它，四次快进 main 时都先备份其未提交 diff，再原样重放。三个新套件的 DEFAULT_SUITES 登记与其改动行重叠，留到其提交后（NEXT 第 1 步）。
- NOT RUN：真实模型全量、远端断网恢复/图片粘贴/托管模式、Windows。
