# oco

oco 是一个以 OpenCode 为执行引擎的 VS Code 扩展。

产品形态：左侧管理会话和 Agent，在 VS Code 编辑器标签页中进行对话，通过设置和管理入口配置工作流。首选路线是 **VS Code 原生外壳 + 复用官方对话源码 + 有边界的宿主适配**。

当前状态：**P0 可行性原型已完成并通过本地验证（远程未验证）**，结论见 [ADR-004](docs/adr/004-p0-decision.md)，运行记录见 [p0-spike](docs/evidence/p0-spike.md)。这是原型，不是可发布版本。

## 从这里开始

1. [开发计划](docs/PLAN.md)：产品范围、阶段、决策门槛、投入估计。
2. [架构与边界](docs/ARCHITECTURE.md)：进程、状态、源码复用、通信与远程开发。
3. [任务清单](docs/TASKS.md)：任务编号、依赖、文件归属、交付物、完成标准。
4. [验收矩阵](docs/ACCEPTANCE.md)：可以证明什么，如何验证，哪些缺口阻止发布。
5. [AI 交接说明](docs/HANDOFF.md)：可直接复制给实施 AI 的首轮提示词与协作方式。
6. [进度与下一步](docs/PROGRESS.md)：当前状态、阻塞项、下一批任务。
7. [证据与待确认事项](docs/EVIDENCE.md)：已确认事实、候选基线和未知条件。

实施 AI 先阅读 [AGENTS.md](AGENTS.md)，再领取任务。请勿将本 README 当作已实现功能列表。

## 运行 P0 原型

前置：macOS、VS Code、Bun、git、本机已安装 OpenCode 1.18.33 CLI（`opencode --version`）。

1. 获取固定上游源码、应用补丁、安装依赖：

```bash
bash scripts/setup.sh
```

2. 构建 webview 与扩展：

```bash
bun run build
```

3. 另开终端启动隔离测试服务（状态全部在 `.oco-test/`，不影响本机其他 OpenCode）：

```bash
bash scripts/test-server.sh
```

4. 用 VS Code 打开本仓库，以扩展开发宿主运行 `apps/extension`（或运行端到端测试 `node tests/e2e/t005.mjs`）。在开发宿主中把 `oco.serverUrl` 设为 `http://127.0.0.1:4517`，执行 `oco: Set Server Password`（密码在 `.oco-test/secret`），然后使用 `oco: New Session` / `oco: Open Session` / `oco: Add Selection to Session Draft`。

## 第一批工作

P0（T001–T006）已完成。下一步是 T007 与 T010 的单会话嵌入模式，见 [PROGRESS](docs/PROGRESS.md)。

产品名及仓库名为 `oco`。扩展 publisher、正式扩展 ID、发布渠道尚未确定，不能在计划阶段虚构归属。
