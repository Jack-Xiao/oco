# v0.1 收尾计划（2026-10-01，自主执行批次）

用户授权：自行制定并实施剩余计划，部署到 gcp-workstation Remote 实测，完成的合入 main。分支 `claude/v01-completion`（基于 `d3ec2e9`）。主目录里另一会话的 fork 按钮（补丁 0011）不在本批写入范围。

依据 PLAN 第 2 节 v0.1 表格与 TASKS T007–T019 的剩余项。按“能在今晚做完并拿到证据”排序；做不到的写明 NOT RUN / BLOCKED，不冒充完成。

| 批次 | 任务 | 内容 | 证据 |
| --- | --- | --- | --- |
| B1 | T015 / T007 连接可见 | 状态栏：连接状态、服务版本（`/global/health`）、目标地址与模式；点击给出操作菜单。`oco: Export Diagnostics` 生成脱敏诊断（无密码、认证头、消息正文），`oco: Show Log` | 单元（脱敏）；E2E `t015-diagnostics`（mock） |
| B2 | T007 managed | `oco.serverMode`（attached/managed）、`oco.opencodePath`（machine 作用域）。managed：扩展以随机端口和随机密码启动 `opencode serve`，每窗口一个进程，所有面板共用；只结束自己启动的进程；异常退出不自动无限重启（提示 + 手动重启）；坏路径/启动超时给出明确错误 | 单元（假进程）；集成（真实 opencode，隔离 HOME）；E2E |
| B3 | T013 Agent 管理 | 原生 “Agents” 视图：服务端 `/agent` 有效列表 + 来源（内置 / 项目文件 / 用户文件 / 配置文件）+ 文件存在但未生效的“待生效”；新建（项目/用户范围、Markdown frontmatter，不覆盖已有）、复制、打开原文；“重新加载配置”显式确认后调用 `/instance/dispose`，不重启服务；远端服务（非回环）只读 | 单元（frontmatter 生成、来源判定）；E2E `t013-agents`（mock） |
| B4 | T014 设置 | 新设置项的中文说明与作用域；密码仍只在 SecretStorage | 单元 settings-contribution |
| B5 | T009 | 修 `p1b-reconnect search-scope-hint` 既有 FAIL（提示落后一次更新） | E2E p1b-reconnect |
| B6 | T018 打包 | `scripts/package-vsix.sh`、`scripts/deploy-remote.sh`（由 remote-install.md 固化）；CHANGELOG；README 安装段 | BUILD：VSIX 可解包、无本机路径 |
| B7 | T016 远程 | 部署到 gcp-workstation，在真实 Remote 窗口里查看侧栏、状态栏、Agents、对话 | 截图 + 远端哈希 |
| B8 | T019 交接 | STATUS / NEXT / PROGRESS / TASKS 与证据；合入 main | — |

不做（超出 v0.1 或缺环境）：Windows、真实中文输入法、系统剪贴板图片、多根工作区、Agent 表单式编辑器（以原文编辑为准）、完整性能基线。
