# oco

oco 是一个以 OpenCode 为执行引擎的 VS Code 扩展。

产品形态：左侧管理会话和 Agent，在 VS Code 编辑器标签页中进行对话，通过设置和管理入口配置工作流。首选路线是 **VS Code 原生外壳 + 复用官方对话源码 + 有边界的宿主适配**。

当前状态：**P1a 已完成**：原型边界（面板身份、请求生命周期、连接与存储）已修复并在本地重新验收，见 [ADR-005](docs/adr/005-p1a-identity-storage-connection.md) 与 [P1a 验收记录](docs/evidence/p1a-acceptance.md)。远程与团队服务未验证。这是原型，不是可发布版本。

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

4. 用 VS Code 打开本仓库，以扩展开发宿主运行 `apps/extension`。在开发宿主的**用户设置**（machine 作用域，工作区设置无效）中把 `oco.serverUrl` 设为 `http://127.0.0.1:4517`，执行 `oco: Set Server Password`（密码在 `.oco-test/secret`，只保存给该地址），然后使用 `oco: New Session` / `oco: Open Session` / `oco: Add Selection to Session Draft`。

## 测试

```bash
bun run typecheck
```

```bash
bun test tests/unit
```

端到端测试需要本机 VS Code 与第 3 步的测试服务，会启动独立 profile 的 VS Code 窗口；结果写入 `docs/evidence/runs/<runId>/`，任何失败或必需用例未执行都以非零退出：

```bash
node tests/e2e/run.mjs
```

## 第一批工作

P0（T001–T006）与 P1a 已完成。下一步是 P1b，见 [PROGRESS](docs/PROGRESS.md) 与 [HANDOFF](docs/HANDOFF.md)。

产品名及仓库名为 `oco`。扩展 publisher、正式扩展 ID、发布渠道尚未确定，不能在计划阶段虚构归属。
