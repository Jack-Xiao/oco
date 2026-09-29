# oco

oco 是一个以 OpenCode 为执行引擎的 VS Code 扩展。

产品形态：左侧管理会话和 Agent，在 VS Code 编辑器标签页中进行对话，通过设置和管理入口配置工作流。首选路线是 **VS Code 原生外壳 + 复用官方对话源码 + 有边界的宿主适配**。

当前状态：**P1b-1 已完成**：原生会话侧栏、连接状态、事件状态路由与重连去重、窄栏权限/提问、主题跟随、首次加载，见 [ADR-006](docs/adr/006-p1b1-sessions-sidebar.md) 与 [P1b-1 验收记录](docs/evidence/p1b1-acceptance.md)；此前 P1a 见 [ADR-005](docs/adr/005-p1a-identity-storage-connection.md)。远程与团队服务未验证。这是原型，不是可发布版本。

## 从这里开始

1. [开发计划](docs/PLAN.md)：产品范围、阶段、决策门槛、投入估计。
2. [架构与边界](docs/ARCHITECTURE.md)：进程、状态、源码复用、通信与远程开发。
3. [任务清单](docs/TASKS.md)：任务编号、依赖、文件归属、交付物、完成标准。
4. [验收矩阵](docs/ACCEPTANCE.md)：可以证明什么，如何验证，哪些缺口阻止发布。
5. [AI 交接说明](docs/HANDOFF.md)：可直接复制给实施 AI 的首轮提示词与协作方式。
6. [进度与下一步](docs/PROGRESS.md)：当前状态、阻塞项、下一批任务。
7. [证据与待确认事项](docs/EVIDENCE.md)：已确认事实、候选基线和未知条件。

实施 AI 先阅读 [AGENTS.md](AGENTS.md)，再领取任务。请勿将本 README 当作已实现功能列表。

## 运行原型

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

4. 用 VS Code 打开本仓库，以扩展开发宿主运行 `apps/extension`。在开发宿主的**用户设置**（machine 作用域，工作区设置无效）中把 `oco.serverUrl` 设为 `http://127.0.0.1:4517`，执行 `oco: Set Server Password`（密码在 `.oco-test/secret`，只保存给该地址），然后打开活动栏的 **OpenCode → Sessions**：新建、搜索、重命名、打开或聚焦会话；状态栏显示连接状态和等待处理的会话数。也可以用 `oco: New Session` / `oco: Open Session` / `oco: Add Selection to Session Draft`。

已知行为：嵌入的对话页不占用官方应用的新建/标签/终端快捷键，这些按键交给 VS Code（例如 Cmd+N 新建未命名文件）。

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

默认套件：`p1a-chat`、`p1a-identity`、`p1b-sidebar`、`p1b-narrow`、`p1b-theme-load`、`p1b-ime`（真实模型，约 1 小时）。只跑部分套件时把名字作为参数传入，例如：

```bash
node tests/e2e/run.mjs p1b-sidebar
```

## 第一批工作

P0（T001–T006）、P1a 与 P1b-1 已完成。后续范围见 [PROGRESS](docs/PROGRESS.md) 与 [P1b 执行指示](docs/P1B-NEXT-STEPS.md)。

产品名及仓库名为 `oco`。扩展 publisher、正式扩展 ID、发布渠道尚未确定，不能在计划阶段虚构归属。
