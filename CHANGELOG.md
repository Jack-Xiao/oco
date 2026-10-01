# 变更记录

本地测试版本（发布者 `oco-local-test`），未发布到应用市场。每项的验证范围和未验证项见 `docs/STATUS.md`。

## 未发布

- 移除 Agents 视图及其命令（New / Duplicate / Open Agent Source / Reload OpenCode Config），按需再做。
- 新增 Connection 视图：在 Sessions 下方，默认折叠，只读列出连接状态、服务地址、当前文件夹、模式、服务版本和托管进程。它同时让 Sessions 保留独立标题行（VS Code 会把容器里唯一的视图并入容器标题）。

## 0.0.2（2026-10-01）

- 换用新的侧边栏图标和扩展图标；侧边栏标题与面板默认标题由 OpenCode 改为 oco。

## 0.0.1（v0.1 候选，2026-10-01）

### 本批新增

- 对话 / 轨迹：会话标题栏切换到轨迹，按轮次和每次模型请求列出用户输入、思考、回复和工具调用，带三条泳道时间轴（时长 / 轮次 / 调用）、token 与缓存命中、费用（订阅模型标“未计价”）、首 token 延迟、生成时长和吞吐量（由 OpenCode 保存的时间戳推算），以及存储的原始 JSON。实际发送的系统提示词与原始请求 OpenCode 不保存，不显示。
- 托管模式（`oco.serverMode = managed`）：oco 用 `oco.opencodePath` 在本窗口启动 `opencode serve`（只听 127.0.0.1、随机端口、随机内存密码），所有会话标签页共用；异常退出只提示，不自动重启；关闭窗口、停用扩展或切回 attached 时只结束自己启动的进程。命令：Restart / Stop Managed Server。
- Agents 视图：服务端生效的 Agent 列表及来源（内置 / 项目文件 / 用户文件 / 配置文件），文件与服务不一致时标“待生效”；新建（项目或用户范围）、复制（文件原样复制，内置 Agent 生成可编辑副本）、打开原文；“Reload OpenCode Config”经确认后只重载该目录的服务实例，不重启服务进程。
- 状态栏显示服务版本与模式，未验证的服务版本给出提示；`oco: Export Diagnostics` 导出脱敏诊断（无密码、认证头、消息正文、家目录路径）；`oco: Show Log`。
- 多根工作区：“oco: Select Workspace Folder” 选择侧栏、新建会话和 Agents 使用的文件夹（按工作区记住，已打开的标签页不受影响）。
- 打包与部署脚本：`scripts/package-vsix.sh`、`scripts/deploy-remote.sh`。

### 之前已有

- 连接已有 OpenCode v1 服务（Basic 认证，密码存 SecretStorage），连接错误分类与设置入口。
- 原生会话侧栏：创建、搜索（最近 200 个）、重命名、删除、运行/等待权限状态。
- 官方对话界面嵌入：单会话、主面板原地切换、在新面板打开、隐藏保持存活、草稿隔离与恢复、等模型加载后再发送、可恢复错误界面。
- 编辑器联动：选区/当前文件加入指定会话草稿（含未保存内容）；工具与 Markdown 中的文件路径点击打开并定位；单轮 Diff 范围标签与“不可用”降级。
- 设置页高级开关修复；面板内默认显示文件树、搜索、状态与 Agent。

## 许可

包内附带 OpenCode 上游的 MIT 许可证（嵌入的界面来自上游源码并打了 `patches/opencode/` 下的补丁）。oco 自身代码的许可证与正式发布者尚未确定。
