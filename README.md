# oco

oco 是一个以 OpenCode 为执行引擎的 VS Code 扩展。

产品形态：左侧管理会话和 Agent，在 VS Code 编辑器标签页中进行对话，通过设置和管理入口配置工作流。首选路线是 **VS Code 原生外壳 + 复用官方对话源码 + 有边界的宿主适配**。

当前状态只看 [STATUS](docs/STATUS.md)，当前队列只看 [NEXT](docs/NEXT.md)。这是原型，不是可发布版本。请勿把本 README 当作已实现功能列表。

## 从这里开始

实施 AI 只读 [AGENTS.md](AGENTS.md)、[STATUS](docs/STATUS.md)、[NEXT](docs/NEXT.md)，以及本次任务点名的契约。下面按需再读，不是开工必读：

1. [开发计划](docs/PLAN.md)：产品范围、阶段、决策门槛、投入估计。
2. [架构与边界](docs/ARCHITECTURE.md)：进程、状态、源码复用、通信与远程开发。
3. [任务清单](docs/TASKS.md)：任务编号、依赖、文件归属、交付物、完成标准。
4. [验收矩阵](docs/ACCEPTANCE.md)：可以证明什么，如何验证，哪些缺口阻止发布。
5. [证据与待确认事项](docs/EVIDENCE.md)：已确认事实、候选基线和未知条件。
6. [进度批次](docs/PROGRESS.md) 与 [历史交接](docs/HANDOFF.md)：旧记录和旧提示词，不代表当前队列。

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

安装、连接方式（attached / managed）、Agents 视图和故障排查见 [使用与故障说明](docs/USER-GUIDE.md)；打包用 `bash scripts/package-vsix.sh`。

打包当前代码并装到 VS Code Remote（`SSH: gcp-workstation`）时，按 [构建并安装到 Remote](docs/remote-install.md) 执行。那不是上面的扩展开发宿主。

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

日常改动时只跑相关的单个套件（例如 `node tests/e2e/c1-open-file.mjs`）。想要更快、结果不受模型波动影响时，用本地脚本模型启动测试服务（识别套件里固定的提示词，按需发起 bash/question/read/write 工具调用，只监听 127.0.0.1，不访问外网）：

```bash
OCO_E2E_MODEL=mock bash scripts/test-server.sh
```

套件会从服务读取当前模型，并把 `modelMode`（`mock` / `real`）写进 `results.json`。`bun run brief` 把 mock 运行归为特殊运行（`mock-model`），不计入真实模型验收。验收前仍须用真实模型（不带该变量启动服务）跑一次。

默认套件是全量验收的 14 个（列表见 `tests/e2e/run.mjs` 的 `DEFAULT_SUITES`）。改了哪些文件该跑哪些套件、何时需要真实模型，见 [测试范围](docs/TEST-SCOPE.md)。只跑部分套件时把名字作为参数传入，例如：

```bash
node tests/e2e/run.mjs p1b-sidebar
```

## 简短验收摘要

日常交接先运行下列命令；它只扫描现有证据，不启动测试、服务或模型：

```bash
bun run brief
```

需要重新做离线检查时，批量运行类型检查和单元测试：

```bash
bun run verify:brief
```

本次改动需要验证构建时：

```bash
bun run verify:brief -- --build
```

终端只输出短摘要；完整白名单元数据写入被 Git 忽略的 `.oco-reports/latest.json` 与 `latest.md`。脚本区分本轮检查、上次检查和历史 E2E，保留版本、未提交状态和 NOT RUN；不同版本不能拼成全套 PASS。负向试验只按明确标记分类。检查失败返回非零；默认汇总遇损坏 JSON 也返回非零。没有结果的目录可能仍在运行，不代表通过。

给主代理通常只需：提交范围、短摘要、最多三个问题及证据路径。不粘贴全部调试过程；查看源码或完整日志只针对具体问题。

## 第一批工作

P0（T001–T006）、P1a 与 P1b-1 已完成。现在做什么只看 [NEXT](docs/NEXT.md)。[PROGRESS](docs/PROGRESS.md) 与 [P1b 执行指示](docs/P1B-NEXT-STEPS.md) 是历史。

产品名及仓库名为 `oco`。扩展 publisher、正式扩展 ID、发布渠道尚未确定，不能在计划阶段虚构归属。
