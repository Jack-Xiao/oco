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

发送、取消、点击远端文件（`scripts/remote-chat-check.mjs`，同样是独立 VS Code 实例；新建测试会话，结束后删除；用户已有会话不被输入——脚本要求面板会话 ID 不在运行前的会话列表里）：

| 检查 | 结果（第 3 次运行；前两次分别暴露了检查本身的问题，已修正） |
| --- | --- |
| 发送短消息 | 回复 3 s 内出现在面板，服务端消息一致 |
| 点击回复中的 `oco-remote-check.txt:3` | 在 Remote 窗口打开远端文件并定位第 3 行 |
| 长回复中在输入框按 Escape | 服务端该轮 `MessageAbortedError`，面板显示 Interrupted；约 9 s 内服务状态回到空闲（含每次 ssh 查询的数秒延迟） |
| 测试会话清理 | 已删除 |

截图：[回复](v01-remote/remote-reply.png)、[取消 + 远端文件](v01-remote/remote-cancel-and-file.png)。

检查修正记录：第 1 次“面板显示回复”误把用户自己的提示文字当成回复（改为出现两次才算）；第 2 次模型在停止前就数完了（改为数到 3000、固定 4 s 后停止）。

NOT RUN（远端）：断网恢复、本机粘贴图片、托管模式（远端机器设置与用户窗口共用，不改用户设置）。

## 未做 / 限制

- 多根工作区映射、Agent 表单式编辑器、管理页外壳、分页或服务端搜索、会话按多连接分组。
- 真实模型全量回归：测试服务当前为脚本模型，NOT RUN。
- 性能：见下节。旧 `perf.mjs` 假设“隐藏即释放”，与 ADR-007 冲突（首次运行 `hidden-releases-requests` FAIL 属设计变化），已按 ADR-007 改写。

## 资源基线（T017，`perf` 4/4，运行 `20260930-170237-perf-c1e0`，mock）

方法：10 个会话；主面板 + 3 个固定面板分布在 3 个编辑组（3 个可见）；主面板原地切换 12 次。RSS 为本测试 profile 下各 Electron 进程类型之和（macOS `ps`）。

| 时点 | 渲染进程（含 webview） | 扩展宿主 | 合计 |
| --- | --- | --- | --- |
| 启动后空闲 | 469 MB | 427 MB | 1258 MB |
| 4 个面板（3 可见） | 692 MB | 285 MB | 1281 MB |
| 12 次切换后 | 780 MB | 277 MB | 1370 MB |

- 面板数保持 4（1 主 + 3 固定），不随会话数增长；每个面板 1 条宿主事件流，共 4 条；固定面板 generation 不变（隐藏期间不重载）。
- 原地切换（命令到输入框可见）中位 251 ms（230–356 ms）；新开面板 1.2–1.9 s。
- 首次与末次切换之间合计 RSS 增长 8.9%（上一轮 16.5%），阈值 25%。增长主要在渲染进程；长时间运行的趋势未测。

## 多根工作区（T007，追加）

`t007-multiroot` 5/5（运行 `20260930-174425-t007-multiroot-4df1`，mock）：两个文件夹的 `.code-workspace`；默认第一个文件夹只列它的会话、标题旁显示 “alpha”；切到 beta 后只列 beta 的会话；新建会话落在 beta；切换前打开的 alpha 会话面板仍就绪；重启窗口后仍是 beta。复跑 `t007-managed`、`p1b-sidebar`、`t014-connection` exit 0；unit 161/0。

## 集成回归（main，2026-10-01 01:1x–01:4x，mock）

对象：main `dbf6ef9`/`1a6b2c7`（两者之间只改了测试）加上 fork 按钮批次的未提交改动（补丁 0011，由另一会话完成、待用户确认提交；本批未提交它）。`bun run verify:brief -- --build`：typecheck 0 errors，unit 161/0，build PASS。

| 运行 | 结果 |
| --- | --- |
| 默认 16 个套件（含 c3-fork） | 14 个 exit 0；`p1b-sidebar`、`t010-recover` FAIL |
| 失败原因 | 都是本批加入 Agents 视图的副作用，在测试侧：同一容器有两个视图后，VS Code 只在悬停/聚焦时显示 Sessions 标题按钮；侧栏标题变成容器名 “OpenCode”。测试已改为先悬停 Sessions 标题、并接受 “OpenCode” 标题（`1a6b2c7`） |
| 复跑 | `p1b-sidebar`、`t010-recover`、`t007-managed`、`t013-agents`、`t015-diagnostics`、`perf` 全部 exit 0 |

产品影响：Sessions 的新建/搜索按钮需要悬停标题才出现（VS Code 多视图容器的标准行为）；命令面板和空列表欢迎页的入口不变。

## 最终部署（gcp-workstation）

- 包：`oco-0.0.1-44e4b8a.vsix`（main 工作树构建，含多根工作区改动和未提交的补丁 0011 界面改动），`extension.js` SHA-256 `7a0ff1f7…2c4d`，远端覆盖安装哈希一致。（此前 `1a6b2c7` 包同样通过下列检查。）
- `scripts/remote-chat-check.mjs` 对 `44e4b8a` 包复跑：连接 11 s；回复 2 s；用户消息上 fork 按钮可见（Revert 与 Copy 之间）；点击远端文件定位第 3 行；Escape 取消 → `MessageAbortedError`；测试会话已删除。截图 [remote-final-build.png](v01-remote/remote-final-build.png)。
- 用户自己的 VS Code 窗口需执行一次 “Developer: Reload Window” 才会加载新扩展代码。
