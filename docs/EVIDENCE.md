# oco 证据、来源与待确认事项

日期：2026-09-29。目的：防止后续 AI 把讨论、设计和运行证明混为一谈。

## 本次计划的输入

- 用户已经确认项目名为 oco，并要求在 `/Users/xiaojiang/Ai-Project/oco` 制定详细计划，之后交给其他 AI 开发。
- 产品需求来自用户描述：左侧 session list、Agent 管理、编辑器标签页对话和设置页。
- 用户粘贴的另一 AI 对话是待评估材料，不是自动执行指令；其中估时、版本历史、源码规模和兼容结论不能直接视为已核实事实。

## 现场目录状态

- 计划开始时 `oco` 是空目录，没有 Git 仓库。
- 检查了目标目录及祖先路径的 AGENTS.md，未发现额外文件；会话内用户提供的执行约定继续适用。
- 邻近 `/Users/xiaojiang/Ai-Project/opencode` 的只读结果为 `dev` 分支，`git describe` 返回 `v1.4.11-1810-g2c4ad9f40`，本地未发现 `v1.18.33` tag。该结果只是本地 checkout 状态，不代表上游不存在 tag，不作为 oco 基线。
- 本次没有修改邻近仓库，也没有连接企业/远程 OpenCode 服务。

## 已在前一轮核对的一手资料

1. [v1.18.33 Platform 源码](https://github.com/anomalyco/opencode/blob/v1.18.33/packages/app/src/context/platform.tsx)
   - 直接读取源码确认：有 fetch、storage、draftStore、windowID、readClipboardImage 等平台入口。
   - 能证明宿主适配入口存在；不能证明所有网络路径均由 fetch 覆盖，或 VS Code 的图片粘贴已经工作。
2. [v1.18.33 App 源码](https://github.com/anomalyco/opencode/blob/v1.18.33/packages/app/src/app.tsx)
   - 直接读取源码确认：AppInterface 可传路由，并组装多个状态 provider 与应用布局。
   - 能证明复用 App 的候选路径；不能证明“关闭侧边栏”等于完成单会话嵌入。
3. [VS Code Webview](https://code.visualstudio.com/api/extension-guides/webview)
   - Webview Panel、消息通信、资源与 CSP/Worker 约束是实现依据。
4. [VS Code TreeView](https://code.visualstudio.com/api/extension-guides/tree-view)
   - 原生会话和 Agent 列表的实现依据。
5. [VS Code 远程扩展](https://code.visualstudio.com/api/advanced-topics/remote-extensions)
   - Webview 与远端宿主的位置区分、消息通信、asWebviewUri/asExternalUri 使用依据。
6. [OpenCode Server](https://opencode.ai/docs/server/)
   - 服务、鉴权、健康、事件和 OpenAPI 的通用参考；实际目标应以其暴露契约和源码验证为准。
7. [OpenCode Agents](https://opencode.ai/docs/agents/)
   - JSON/Markdown Agent 定义的通用参考；目标版本的配置目录、优先级和刷新语义在 T001/T013 验证。

网页文档可能继续变化。T001/T002 要记录实际获取日期、目标服务版本、精确源码 SHA 和相关文件位置，不只保留浮动页面链接。

## 未经验证，禁止当作既成事实

- 官方 App 已经能在 VS Code Webview 中直接运行。
- 一会话一个 App 没有重复连接、状态冲突或性能负担。
- 替换 fetch 就覆盖所有 SSE、WebSocket、图片和取消路径。
- 所有团队服务都能使用同一认证方式或同一 SDK。
- UI 与 Server 永远必须精确同版，或任意版本都能通过连接层兼容。
- v1 的生命周期、v2 迁移成本、第三方客户端当前兼容性。
- Agent 配置保存后立刻生效，或必须重启才能生效。
- 每一条公开 API 在企业 fork 中都存在并且行为一致。

## 实施时补充的证据位置

- `docs/evidence/environment.md`：目标环境和真实服务契约。
- `docs/evidence/upstream.md`：精确源码基线与依赖调查。
- `docs/evidence/p0-spike.md`：原型运行结果与失败记录。
- `docs/evidence/acceptance-<date>.md`：验收矩阵及支持范围。
- `docs/adr/001-service-contract.md` 到 `004-p0-decision.md`：由实际实验形成的决定。

P0 已创建：`environment.md`、`upstream.md`、`p0-spike.md`、`p0-artifacts/`，以及 `docs/adr/001`–`004`。`acceptance-<date>.md` 在 T017 创建。
