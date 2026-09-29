# T001 服务与环境基线

日期：2026-09-29。执行者：集成 AI。证据级别：INTEGRATION（本地隔离服务），企业与远程为 BLOCKED。

## 1. 本轮实际使用的环境

| 项 | 值 | 说明 |
| --- | --- | --- |
| 客户端 OS | macOS 27.2（arm64） | 作者本机 |
| VS Code | 1.139.1（`/Applications/Visual Studio Code.app`） | 隔离 user-data-dir：`.oco-test/vscode/<profile>` |
| OpenCode CLI | 1.18.33（`~/.opencode/bin/opencode`，本机已有安装，仅调用，未修改） | 与候选源码 tag 同版 |
| 测试服务 | `scripts/test-server.sh` 启动的 `opencode serve`，`127.0.0.1:4517` | 扩展之外独立启动，扩展只做 attached 连接 |
| 模型 | `opencode/big-pickle`（OpenCode Zen 免费模型） | 无需 API Key，不产生费用 |
| Bun | 1.3.10（上游 `packageManager` 声明 1.3.14，`--frozen-lockfile` 安装通过） | 仅开发构建用 |
| Node | 26.7.0 | 测试脚本；扩展运行时用 VS Code 自带 Node |

## 2. 隔离与所有权

- 测试服务的全部状态放在 `.oco-test/`（`HOME`、`OPENCODE_TEST_HOME`、四个 `XDG_*` 目录），不读写 `~/.config/opencode`、`~/.local/share/opencode`。
- 本机已有的外部服务（OpenChamber 启动的 `opencode serve`，127.0.0.1 随机端口）未连接、未终止、未修改。
- 测试服务启用 Basic 认证：随机密码写入 `.oco-test/secret`（600 权限，gitignore），用户名 `opencode`。
- 测试配置 `scripts/test-server.opencode.json`：`bash`/`edit` 权限为 `ask`（用来触发权限交互），关闭 share 与自动更新。
- 扩展从不启动或停止服务（`deactivate()` 为空；`BridgeHost.dispose()` 只中止本面板请求）。

## 3. 服务契约（实测）

| 能力 | 结果 | 证据 |
| --- | --- | --- |
| 健康/版本 | `GET /global/health` → `{"healthy":true,"version":"1.18.33"}` | curl（带认证） |
| 认证 | 无认证 401；`Authorization: Basic base64(opencode:<pw>)` 200 | curl |
| OpenAPI | `GET /doc` 200，约 479 KB；v1 路由与 `/api/*` 新路由并存 | `.oco-test/openapi.json`（本地，未入库） |
| 目录语义 | 请求头 `x-opencode-directory: <encodeURIComponent(绝对路径)>`；创建的会话 `directory` 与之相同 | `tests/integration/api-probe.mjs` |
| 事件 | `GET /event`（目录级）与 `GET /global/event` 均为 `text/event-stream`；增量为 `message.part.delta` | api-probe：15 个 delta，跨 2.7–3.0 s |
| 发送 | `POST /session/:id/prompt_async` → 204，结果从事件与 `GET /session/:id/message` 读取 | api-probe |
| 取消 | `POST /session/:id/abort` → 200 `true`；助手消息 `error.name = MessageAbortedError`，会话回到 idle | api-probe abort 模式 |
| 权限 | `GET /permission` 列出待决请求；UI 回复后 bash 工具 `completed` | tests/e2e/t004、t005 |
| 提问 | `question` 工具，UI 回答后工具 `completed` | t004 |
| 附件 | 用户消息 `file` part，`url` 为 data URL，字节与发送一致 | t005 |
| 会话状态 | `GET /session/status` 返回忙碌会话；空闲会话不在其中 | t004/t005 |

命令：

```bash
bash scripts/test-server.sh
```

```bash
node tests/integration/api-probe.mjs stream
```

```bash
node tests/integration/api-probe.mjs abort
```

## 4. 支持矩阵（初版）

| 环境 | 状态 | 说明 |
| --- | --- | --- |
| macOS 桌面 VS Code + 本地 OpenCode 1.18.33 | P0 本地验证通过 | 见 `p0-spike.md` |
| 团队实际服务（版本、企业修改、网关、认证方式） | BLOCKED | 未获得访问；不能宣称企业兼容 |
| macOS VS Code + Remote-SSH Linux | BLOCKED | 本机无远程主机；设计上网络由扩展宿主发起，未运行验证 |
| Windows 客户端 | NOT RUN | 无设备 |
| OpenCode 其他 1.x 版本 | NOT RUN | 官方 UI 与服务同版（1.18.33）才经过验证 |

## 5. 未知项与影响

- 团队服务版本：UI 源码固定在 1.18.33。若团队服务不同版，需要先验证兼容或按团队版本重新固定上游（见 ADR-002 升级流程）。
- 企业认证：本轮只验证 Basic。若企业使用网关/SSO，需要在宿主桥增加认证方式，webview 无需改动。
- 远程：P0 远程门槛未通过（BLOCKED），P1 可继续本地开发，但不得宣称远程可用。
