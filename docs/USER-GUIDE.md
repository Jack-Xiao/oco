# oco 使用与故障说明

oco 是 OpenCode 的 VS Code 客户端：会话列表、对话界面、Agent 列表都来自 OpenCode 服务，oco 不自己跑 Agent。

## 安装

1. 打包：`bash scripts/setup.sh`（首次或上游缺失时），然后 `bash scripts/package-vsix.sh`，得到 `oco-<版本>-<提交>.vsix`。
2. 本机：命令面板 “Extensions: Install from VSIX...” 选这个文件。
3. Remote-SSH：扩展要装在远端。首次在 Remote 窗口的终端里 `code --install-extension /tmp/<文件>.vsix --force`；之后同版本更新用 `bash scripts/deploy-remote.sh <ssh 主机>`，再在 Remote 窗口执行 “Developer: Reload Window”。细节见 [remote-install](remote-install.md)。

支持范围：macOS 桌面 VS Code（本机或 Remote-SSH 到 Linux），OpenCode v1（已验证 1.18.33）。Windows、VS Code Web 未验证。

## 连接服务

两种方式，设置 `oco.serverMode`（只在用户设置或远端机器设置里生效）：

| 模式 | 做什么 | 需要设置 |
| --- | --- | --- |
| `attached`（默认） | 连接已经在运行的 `opencode serve` | `oco.serverUrl`（如 `http://127.0.0.1:4096`）；有密码时执行 “oco: Set Server Password” |
| `managed` | oco 在当前窗口启动自己的 `opencode serve`（127.0.0.1、随机端口、随机密码），所有会话标签页共用 | `oco.opencodePath`（留空则按 PATH 找 `opencode`）；工作区须受信任 |

- attached 模式下 oco 从不启动、停止或修改服务。
- managed 模式下 oco 只结束自己启动的进程（关窗口、停用扩展、切回 attached 时）。进程意外退出后不会自动重启，状态栏显示“托管服务未运行”，点它或执行 “oco: Restart Managed Server”。
- 状态栏 `oco` 项的悬停提示显示：服务地址、工作区、模式、服务版本。版本不是已验证版本时图标变为警告。

## 常用操作

- 侧栏 OpenCode → Sessions：新建、搜索（只搜已加载的最近 200 个）、重命名、删除；点一下在主面板打开，右键 “Open in New Panel” 另开固定面板。
- 编辑器右键 “Add Selection to Session Draft”：把选中内容（含未保存修改）加入指定会话的草稿，不会自动发送。
- 侧栏 OpenCode → Agents：
  - 列出服务当前生效的 Agent 及来源：内置、项目文件（`<项目>/.opencode/agent/*.md`）、用户文件（OpenCode 配置目录下 `agent/*.md`）、配置文件（`opencode.json(c)`）。
  - “New Agent” 新建 Markdown 定义；“Duplicate Agent” 复制（文件原样复制，内置 Agent 生成可编辑副本）；点文件型 Agent 打开原文编辑。oco 不会改写已有文件。
  - 文件内容和服务生效的定义不一致时标“待生效”。执行 “Reload OpenCode Config”（需确认）让服务重新读取该项目配置；这会中止该项目中正在运行的任务，但不会重启服务进程。
  - 服务不在本机（非回环地址）时只读。

## 多根工作区

一个窗口打开多个文件夹时，侧栏、新建会话和 Agents 一次只对应一个“当前文件夹”（默认第一个）。Sessions 标题旁显示当前文件夹名；用标题栏的文件夹按钮或 “oco: Select Workspace Folder” 切换，选择按工作区记住。已打开的会话标签页不受切换影响。

## 出问题时

1. 看状态栏：`需要密码` → “oco: Set Server Password”；`未连接/重连中` → 服务是否在运行、地址端口是否正确，点状态栏立即重试；`托管服务未运行` → 悬停看原因。
2. “oco: Show Log” 查看 oco 日志（只有请求路径和状态码，不含消息内容）。
3. “oco: Export Diagnostics” 生成诊断 JSON：版本、设置形态、连接状态、最近日志。已去掉密码、认证头、消息正文和家目录路径；分享前请再看一遍。
4. 常见原因：
   - `找不到 OpenCode 可执行文件`：扩展宿主的 PATH 和终端不同（Remote 上尤其常见），把 `oco.opencodePath` 设为完整路径，例如 `~/.npm-global/bin/opencode` 展开后的绝对路径。
   - `认证失败`：密码按“地址+用户名”分别保存；改了地址要重新设置。
   - 会话列表缺会话：只列出属于当前工作区文件夹的会话，且最多最近 200 个。
   - 新建的 Agent 一直“待生效”：重新加载配置后仍待生效说明文件格式无效，检查 frontmatter（`description`、`mode`）。
