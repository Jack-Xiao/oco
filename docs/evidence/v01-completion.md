# v0.1 收尾批次证据（2026-10-01）

分支 `claude/v01-completion`，基于 `d3ec2e9`。计划见 [V01-COMPLETION-PLAN](../V01-COMPLETION-PLAN.md)。环境：macOS（Darwin 27.2），VS Code 1.139.1（commit 04c0d99f），Bun 1.3.10，上游 `51ef4be`（v1.18.33，补丁 0001–0010），测试服务 OpenCode 1.18.33（`127.0.0.1:4517`，隔离 HOME/XDG，脚本模型 mock）。

## 离线检查

| 检查 | 结果 |
| --- | --- |
| `bun run verify:brief -- --build` | typecheck 0 errors；unit 161 pass / 0 fail（新增 managed-server 10、agents 5、diagnostics 4、settings-contribution +1）；build PASS |
| `scripts/package-vsix.sh` | `oco-0.0.1-2b40651.vsix`，11.5 MB，660 个文件；包内 `extension.js` 与 webview 不含本机路径；webview 无外部 script/style URL |

## E2E（mock 模型；证明 UI/宿主行为，不证明真实模型链路）

| 套件 | 结果 | 运行 ID | 覆盖 |
| --- | --- | --- | --- |
| `t007-managed` | 7/7 | `20260930-163600-t007-managed-a780` | 托管启动（127.0.0.1 随机端口、版本 1.18.33、状态栏“托管”）；多次新建会话仍一个进程；`kill -9` 后状态为 exited、5 s 内无自动重启；手动重启换新 pid；坏路径报 `oco.opencodePath` 且无残留进程；切回 attached 结束自有进程、4517 测试服务不受影响；关窗口后自有进程退出、外部服务 pid 不变 |
| `t013-agents` | 6/6（两次） | `…-163455-t013-agents-017c`、`…-163759-t013-agents-73d6` | 内置来源、隐藏 Agent 不显示；新建项目 Agent（YAML 转义正确、待生效）；确认重载后服务生效且服务仍在；复制内置 plan；复制手改文件（注释、未知字段、正文）字节一致；外部改描述→待生效→重载→生效，侧栏事件流自动恢复 |
| `t015-diagnostics` | 4/4 | `…-163647-t015-diagnostics-e5aa` | 状态栏提示含模式与服务版本；导出不含密码、Basic 头、家目录，含版本/连接/最近日志；导出在编辑器打开；Show Log 打开日志 |
| `p1b-reconnect` | 5/5 | `…-163710-p1b-reconnect-8274` | 既有 `search-scope-hint` FAIL 本批复现不到（PASS），NEXT 中该项关闭 |

发现并修复的真实问题：

1. 重新加载配置（`/instance/dispose`）会结束服务的事件流，侧栏进入“重连中”并按退避等待。现在确认重载后立即重连（`external-edit-pending` 断言 6 s 内回到 connected）。
2. 服务实例缓存了已删除文件定义的 Agent，旧逻辑把它标成“配置文件”来源。现在既无文件也不在 `opencode.json(c)` 中的非内置 Agent 标为“待生效（可能已删除）”。

## Remote-SSH 实测（gcp-workstation，Linux x64，用户自己的 OpenCode 1.18.33 @127.0.0.1:4096）

部署：`scripts/deploy-remote.sh` 覆盖安装，远端 `extension.js` SHA-256 `4021332d…895d` 与包内一致。

查看方式：用户的 VS Code 没有被操作（桌面控制 VS Code 的授权被拒绝）。`scripts/remote-look.mjs` 另起一个 VS Code 实例（独立 profile、只带 Remote-SSH 扩展）连到同一台远端，加载的是远端已安装的扩展：

| 项目 | 结果 | 证据 |
| --- | --- | --- |
| 连接与状态栏 | 约 12–19 s 连上；提示“oco 已连接 http://127.0.0.1:4096、/home/user/ai、模式：连接已有服务、服务版本：1.18.33” | [remote-status-tooltip.png](v01-remote/remote-status-tooltip.png) |
| 会话列表与 Agents 视图 | 12 个远端会话；Agents 显示 build/plan/explore/general（内置） | [remote-sidebar-agents.png](v01-remote/remote-sidebar-agents.png) |
| 打开会话 | 官方对话界面渲染历史消息，Agent 选择器与模型显示正常；未发送消息 | [remote-chat.png](v01-remote/remote-chat.png) |
| 诊断导出 | `remoteName: ssh-remote`、`platform: linux`，无密码 | 终端输出（未存文件） |

NOT RUN（远端）：发送/取消/断网恢复、本机粘贴图片、打开远端文件点击、托管模式（远端机器设置与用户窗口共用，不改用户设置）。

## 未做 / 限制

- 多根工作区映射、Agent 表单式编辑器、管理页外壳、分页或服务端搜索、会话按多连接分组。
- 真实模型全量回归：测试服务当前为脚本模型，NOT RUN。
- 性能：旧 `perf.mjs` 的 `hidden-releases-requests` 假设“隐藏即释放”，与 ADR-007（隐藏保持存活）冲突，本批运行 FAIL（设计变化，不是回归）；`no-stream-leak` PASS。
