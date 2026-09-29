# ADR-001：服务契约与支持范围（P0）

状态：已采纳（P0）。日期：2026-09-29。证据：`docs/evidence/environment.md`。

## 决定

- 目标服务：OpenCode v1 HTTP 服务，已验证版本 **1.18.33**。扩展只做 `attached` 连接（设置 `oco.serverUrl`），不启动、不停止、不配置服务；`managed` 模式留到 T007。
- 认证：HTTP Basic（用户名默认 `opencode`，密码存 VS Code SecretStorage，命令 `oco: Set Server Password`）。开发模式可用 `OCO_DEV_PASSWORD_FILE` 读取测试密码文件，生产模式忽略。
- 项目目录：请求头 `x-opencode-directory`（URL 编码的绝对路径）；P0 取第一个工作区文件夹。
- 使用到的接口（实测）：`/global/health`、`/global/event`（SSE）、`/session`、`/session/:id`、`/session/:id/message`、`/session/:id/prompt_async`、`/session/:id/abort`、`/session/status`、`/permission`、`/question`、`/agent`、`/provider`、`/config` 等官方 App 自身调用的接口（全部经宿主桥，日志见 E2E profile）。
- 版本策略：官方 UI 源码与服务同版才算已验证；其他版本在连接时应显示“未验证版本”（T007 实现）。

## 未决 / 阻塞

- 团队真实服务版本、企业网关/认证：BLOCKED，需团队提供访问后重跑 `tests/integration/api-probe.mjs` 与 E2E。
- Remote-SSH：BLOCKED。
