# 知名 AI 编程工具对 Git Worktree 处理现状调研（2025–2026）

本文档调研了当前主流 AI 编程工具（Claude Code、OpenAI Codex、Cursor、GitHub Copilot、VS Code、OpenCode、Conductor、Windsurf、Zed）对 Git Worktree 的处理机制，旨在为 oco（OpenCode 的 VS Code 客户端扩展）是否需要对 worktree 会话做特殊处理提供决策依据。

---

## 一、各工具详细调研

### 1. Claude Code（含 CLI 与 Desktop 桌面版）
1. **新建会话时创建/选择 Worktree**：
   - CLI 提供 `--worktree <name>`（或 `-w <name>`）参数；若未指定名称则自动生成。
   - 支持交互中动态进入：对话中可调用 `EnterWorktree` 工具或通过自然语言“work in a worktree”即时切换。
   - Subagent 支持配置 `isolation: "worktree"`。
   - 存放位置：默认存放在当前仓库根目录下的 `.claude/worktrees/<name>/`（若针对 PR 则为 `.claude/worktrees/pr-<number>/`）。
   - 分支命名：新建分支名为 `worktree-<name>`（PR 为 `pr-<number>`）。
   - 来源：[Anthropic Claude Code Docs](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code)
2. **会话列表显示**：
   - CLI 端通过 `claude --resume` 列表交互恢复。
   - Desktop 桌面端在左侧“多会话侧边栏”（Multi-session sidebar）统一平铺列出所有活跃会话（显示 Session ID、状态、最近回复与时间戳），会话与其底层 worktree 路径绑定，但列表中主要以会话 ID/状态展示，未单独做分组折叠。
   - 来源：[Claude Code Desktop Guide](https://claude.com)
3. **清理机制**：
   - 提供了 `WorktreeRemove` hook 钩子。为避免丢失未提交改动，会话结束时默认不静默自动物理删除代码目录。
   - Desktop 端提供可视化的归档/关闭会话 UI；也可通过终端 `git worktree remove` / `git worktree prune` 手动清理。
   - 来源：[Anthropic Claude Code Hooks Docs](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code)
4. **合并辅助**：
   - 提供辅助：支持通过 `--from-pr` 联动 GitHub/GitLab 流程；Agent 会引导用户执行 commit、创建 PR 或通过 bash 辅助执行 git merge。
   - 来源：[Anthropic Claude Code Docs](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code)

---

### 2. OpenAI Codex（CLI / Codex App / ChatGPT Desktop）
1. **新建会话时创建/选择 Worktree**：
   - 提供模式切换：支持“Local Mode”（主目录）与“Worktree Mode”（隔离目录）。Codex App / ChatGPT Desktop 新建任务时可勾选在 Worktree 中运行。
   - 存放位置：由应用管理的 worktree 默认存放在 `$CODEX_HOME/worktrees`（或 `~/.codex/worktrees/`）。
   - 分支命名：处于 detached HEAD 状态或由系统分配的任务分支名。
   - 来源：[Agentastic Codex Guide](https://agentastic.dev)、[OpenAI Help Center](https://chatgpt.com)
2. **会话列表显示**：
   - 在桌面端任务线程（Threads / Tasks）列表中混合展示所有会话，会话详情界面上标识当前处于 Local 还是 Worktree 模式。
   - 用户亦可将手动创建的现有 worktree 作为独立项目（Project）导入列表。
   - 来源：[OpenAI Codex Desktop Survey](https://chatgpt.com)
3. **清理机制**：
   - 自动清理：在应用中执行“归档线程”（Archive thread）后，系统会自动触发对底层托管 worktree 的删除与清理；长时间不活跃的托管 worktree 会在存储空间回收时清理。
   - 手动处理：用户自行在终端创建的外部 worktree 则需手动执行 `git worktree remove`。
   - 来源：[Codex Community Discussions](https://reddit.com)
4. **合并辅助**：
   - 提供辅助：界面提供专属“Handoff”功能（将 worktree 中的改动安全移回本地主工作区），并提供“Create branch here”按钮一键将改动转为正式分支提 PR。
   - 来源：[OpenAI Codex App Docs](https://chatgpt.com)

---

### 3. Cursor（Background Agents / Parallel Agents / Worktrees）
1. **新建会话时创建/选择 Worktree**：
   - Agents Window（后台代理窗口）新建任务时可选择 Worktree 作为运行工作区；Agent Chat 中提供 `/worktree [branch=<name>] <task>` 斜杠命令；Cursor CLI 支持 `agent --worktree [name]`（或 `-w`）。
   - 存放位置：默认存放在 `~/.cursor/worktrees/<reponame>/<name>`。
   - 分支命名：支持自定义分支名或自动命名；支持通过 `.cursor/worktrees.json` 配置初始化安装脚本。
   - 来源：[Cursor Worktrees Documentation](https://cursor.com/docs/configuration/worktrees)、[Cursor CLI Reference](https://cursor.com/docs/cli/using)
2. **会话列表显示**：
   - 在 Agents Window 侧边栏的任务列表中混排显示各个会话，每张任务卡片标注对应分支与路径；编辑器顶部“Changes”标签页提供 Worktree Picker 供用户快速切换。
   - 来源：[Cursor Documentation](https://cursor.com/docs/configuration/worktrees)
3. **清理机制**：
   - 命令删除：支持通过 `/delete-worktree` 斜杠命令手动删除。
   - 自动保留与清理策略：内置定时清理机制，配置项包括 `cursor.worktreeCleanupIntervalHours`（默认 6 小时检查一次）与 `cursor.worktreeMaxCount`（默认最多保留 25 个），超出上限时按时间淘汰。
   - 来源：[Cursor Worktrees Documentation](https://cursor.com/docs/configuration/worktrees)
4. **合并辅助**：
   - 提供辅助：提供专属命令 `/apply-worktree`，可一键将隔离 worktree 中的改动应用/合并回当前的主工作区。
   - 来源：[Cursor Chat Commands Docs](https://cursor.com/docs/configuration/worktrees)

---

### 4. GitHub Copilot（VS Code Agent Sessions）
1. **新建会话时创建/选择 Worktree**：
   - VS Code 提供专属配置项 `"github.copilot.chat.agent.isolationMode": "worktree"`。开启后，新建后台 Copilot 编码代理任务会自动创建独立的 Git worktree。
   - 存放位置：由 VS Code 内部集中管理（工作区临时缓存目录）。
   - 分支命名：自动生成任务分支（形如 `copilot-session-...`）。
   - 来源：[VS Code Release Notes & Docs](https://code.visualstudio.com)
2. **会话列表显示**：
   - 在 VS Code 侧边栏的 Agents Window（Chat Sessions）中混排呈现，卡片展示状态（Running, Needs-Input, Pinned, Done 等）。
   - 来源：[VS Code Copilot Agent Sessions](https://code.visualstudio.com)
3. **清理机制**：
   - 专用清理 UI：VS Code 1.141+ 引入了专属命令 **`Chat: Open Worktree Cleanup`**，弹出独立清理编辑器，可按非活跃天数（7/15/30/60/90天）筛选、查看各 worktree 磁盘占用并批量确认删除；清理前自动保存未提交改动；活跃和 Pinned 会话受保护；已合并 PR 的会话可设置自动清理。
   - 来源：[VS Code Worktree Cleanup Documentation](https://code.visualstudio.com)
4. **合并辅助**：
   - 提供辅助：任务完成后引导用户一键生成 Commit、提 GitHub PR，或在 VS Code 审查面板中比对与应用。
   - 来源：[VS Code Agent Workflows](https://code.visualstudio.com)

---

### 5. VS Code 本身原生 Git Worktree 支持
1. **新建会话时创建/选择 Worktree**：
   - VS Code 1.103+ 内置原生 Git worktree 操作。提供命令 `Git: Create Worktree`，可选择已有分支或新建分支，并输入目标路径。
   - 存放位置：用户自选任意本地目录（默认提示与当前仓库平级目录）。
   - 分支命名：由用户输入或指定已有分支。
   - 来源：[VS Code Updates v1.103](https://code.visualstudio.com/updates)
2. **会话列表显示**：
   - 在 Source Control（版本控制）视图的 Repositories 列表中自动检测并列出当前仓库的所有 Worktree（受 `git.detectWorktrees` 设置控制），可右键选择“在新窗口打开”或“在当前窗口打开”。
   - 来源：[VS Code Source Control Docs](https://code.visualstudio.com)
3. **清理机制**：
   - 提供命令 `Git: Delete Worktree`，或在 Source Control 树形节点上右键删除，底层调用 `git worktree remove`。
   - 来源：[VS Code Updates v1.103](https://code.visualstudio.com/updates)
4. **合并辅助**：
   - 无专用一键 apply/merge 按钮，走 VS Code 原生的 Git 分支合并操作（`Git: Merge...`）或 GitHub PR 扩展流程。
   - 来源：[VS Code Updates v1.103](https://code.visualstudio.com/updates)

---

### 6. OpenCode（sst/opencode, 即 anomalyco/opencode）
1. **新建会话时创建/选择 Worktree**：
   - 核心仓库架构支持 worktree 作为项目实例根路径（源码中明确区分 `worktree` 根目录与 `cwd` 运行目录）。但官方 CLI 核心**未内置开箱即用的自动化创建 worktree 命令**，通常由用户在终端提前运行 `git worktree add` 后再进入目录启动 opencode，或通过社区插件（如 `opencode-worktree-session`）实现自动化创建。
   - 存放位置：未查到官方统一定义的默认路径（用户自定义，常见为 `../feature-name`）。
   - 分支命名：未查到官方自动化命名规则（由用户定义）。
   - 来源：[github.com/anomalyco/opencode](https://github.com/anomalyco/opencode)
2. **会话列表显示**：
   - 桌面端/Web 端会话列表按普通项目与会话平铺混排展示。曾有 Issue 反馈 Desktop 端对外部手动创建的 worktree 无法平滑自动关联识别。
   - 来源：[OpenCode GitHub Issues](https://github.com/anomalyco/opencode/issues)
3. **清理机制**：
   - 官方核心未查到专有的 worktree 自动清理或专用 UI，完全交给用户手动执行 `git worktree remove`。
   - 来源：[github.com/anomalyco/opencode](https://github.com/anomalyco/opencode)
4. **合并辅助**：
   - 官方未内置专用的 apply/merge worktree 辅助操作，依赖 Agent 调用常规 git 命令或用户在终端手动合并。
   - 来源：[github.com/anomalyco/opencode](https://github.com/anomalyco/opencode)

---

### 7. Conductor（conductor.build）
1. **新建会话时创建/选择 Worktree**：
   - 核心产品逻辑即围绕 Git Worktree 展开。新建 Task 时 Conductor 会自动为其创建独立的 Workspace（即底层 Git worktree）。
   - 存放位置：集中存放在 `~/conductor/workspaces/<repo-name>/<workspace-name>`。
   - 分支命名：自动与 Workspace 同名或基于任务名生成；支持通过 `.worktreeinclude` 自动同步 `.env` 等文件。
   - 来源：[Conductor Official Website](https://www.conductor.build/)
2. **会话列表显示**：
   - 专门的 Workspace / Task 列表管理。每个工作区作为一个独立卡片项，包含独立的终端、AI 对话流和分支状态，完全按工作区分组管理。
   - 来源：[Conductor Documentation](https://www.conductor.build/)
3. **清理机制**：
   - 提供可视化清理 UI：任务完成后在界面中点击 **"Archive workspace"**，自动归档并删除底层 Git worktree；异常删除时可在主仓库中执行 `git worktree prune` 恢复状态。
   - 来源：[Conductor Guide](https://www.conductor.build/)
4. **合并辅助**：
   - 提供辅助：Conductor 界面内集成了运行测试、Diff 审查与一键创建 Pull Request / 合并分支的完整流程。
   - 来源：[Conductor Documentation](https://www.conductor.build/)

---

### 8. Windsurf（Codeium）
1. **新建会话时创建/选择 Worktree**：
   - 支持。在 Cascade AI 输入框右下角可直接勾选或切换为 **"Worktree"** 模式。
   - 存放位置：默认存储在 `~/.windsurf/worktrees/<repo_name>/`。
   - 分支命名：由 Cascade 自动生成独立工作分支；支持 `.windsurf/hooks.json` 配置 `post_setup_worktree` 钩子拷贝环境变量。
   - 来源：[Windsurf Documentation](https://windsurf.com)
2. **会话列表显示**：
   - 在 Cascade 侧边栏的会话列表中呈现，卡片上标注工作区类型。
   - 来源：[Windsurf Documentation](https://windsurf.com)
3. **清理机制**：
   - 支持在界面中对已完成任务的会话进行关闭/清理，或通过终端执行 `git worktree remove`。
   - 来源：[Windsurf Documentation](https://windsurf.com)
4. **合并辅助**：
   - 提供辅助：Cascade 任务完成后，界面直接提供 **"Merge"** 按钮，支持一键将 worktree 中的改动拉取/合并回当前主工作区。
   - 来源：[Windsurf Documentation](https://windsurf.com)

---

### 9. Zed（Parallel Agents / Worktrees）
1. **新建会话时创建/选择 Worktree**：
   - 支持。Zed 顶部标题栏内置 Worktree Picker，或通过快捷键 `ctrl-cmd-w` / `git: worktree` 命令输入新分支名创建；其 Parallel Agents 线程支持绑定到独立 worktree。
   - 存放位置：用户在创建时指定。
   - 分支命名：由用户输入分支名。新建 worktree 默认带有“安全未信任”标记，需用户显式信任后启用 LSP/MCP。
   - 来源：[Zed Official Documentation](https://zed.dev/)
2. **会话列表显示**：
   - 在 Threads 侧边栏管理 Agent 线程；顶部标题栏 Worktree 选择器中展示当前打开的 worktree。
   - 来源：[Zed Documentation](https://zed.dev/)
3. **清理机制**：
   - 若关联的 worktree 被删除，重新打开线程时 Zed 可自动重新检出/恢复；常规删除依赖 Git 命令或工作区管理。
   - 来源：[Zed Documentation](https://zed.dev/)
4. **合并辅助**：
   - 未查到专用的一键 apply/merge 按钮，依赖终端或标准 Git 工作流。
   - 来源：[Zed Documentation](https://zed.dev/)

---

## 二、功能对比表

| 工具 | 1. 新建会话创建/选择 Worktree | 默认存放路径 | 2. 会话列表展示形态 | 3. 清理机制与 UI | 4. 合并回主分支辅助 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Claude Code** | 是（CLI `--worktree`, Desktop 模式, 自然语言切换） | `.claude/worktrees/<name>/` | 侧边栏统一平铺列出（混排） | 提供 `WorktreeRemove` hook，桌面端支持归档/删除 UI，不静默强删 | 支持（`--from-pr`，引导 commit/PR/merge） |
| **OpenAI Codex** | 是（App/Desktop 提供 Worktree Mode） | `$CODEX_HOME/worktrees/` | 线程列表统一平铺展示，标明模式 | 归档线程自动删除 worktree；长期未用自动回收 | 支持（专属 "Handoff" 移回改动，"Create branch here"） |
| **Cursor** | 是（Agents Window / `/worktree` 命令 / CLI `-w`） | `~/.cursor/worktrees/<repo>/<name>` | Agents 窗口混排，顶部 Changes 标签有 Picker | 提供 `/delete-worktree`；内置定时+数量上限（默认25个）自动清理 | 支持（专属 `/apply-worktree` 命令一键应用） |
| **GitHub Copilot** | 是（VS Code 设置 `isolationMode: worktree`） | VS Code 内部临时缓存目录 | Agents 窗口平铺混排，状态卡片标注 | 专属 UI：`Chat: Open Worktree Cleanup`（按天数筛选批量删除，未存改动保护） | 支持（引导创建 PR、VS Code 审查面板比对与应用） |
| **VS Code 本身** | 是（原生 `Git: Create Worktree`） | 用户自选（默认平级或子目录） | Source Control 仓库列表平铺展示，可单/新窗口打开 | 提供 `Git: Delete Worktree` 命令及右键菜单删除 | 无专用一键合并按钮（走原生 Git 分支 Merge / PR 流程） |
| **OpenCode** | 否（官方核心仅支持识别已创建的 worktree 目录，无自动化创建命令） | 用户自定义（未查到官方默认路径） | 会话列表混排，对外部 worktree 自动识别度有限 | 未查到专用清理 UI/策略，纯手动 git 命令 | 未查到专有一键辅助（走标准 git 命令） |
| **Conductor** | 是（以 Worktree 为核心，新建 Task 必建独立 Workspace） | `~/conductor/workspaces/<repo>/<name>` | 专属 Workspace 列表（按工作区分组独立卡片） | 专属 UI：一键 "Archive workspace" 自动销毁与清理 worktree | 支持（UI 内置测试、审查与一键 Merge / PR） |
| **Windsurf** | 是（Cascade 输入框切换 Worktree 模式） | `~/.windsurf/worktrees/<repo>/` | Cascade 会话列表中管理 | 支持界面关闭/清理，或手动 git 命令 | 支持（界面提供专属一键 **"Merge"** 按钮） |
| **Zed** | 是（标题栏 Worktree Picker / `git: worktree`，支持线程隔离） | 用户自选路径 | Threads 侧边栏平铺 + 标题栏 Picker | 删掉后重新打开线程可自动恢复，常规删除走 git | 未查到专用一键合并按钮（走标准 git 流程） |

---

## 三、对 oco 的启示

1. **当前阶段不宜做重型 worktree 自动化创建**：除 Conductor 外，大多工具将 worktree 作为高级隔离手段，而 OpenCode 上游核心本身并无内建 worktree 自动管理，oco 暂无必要在会话创建流中强行插入 worktree 流程。
2. **多会话列表无需拆分单独 worktree 分组**：行业主流（Claude Code、Cursor、VS Code Copilot、Windsurf）均采用统一的平铺会话列表，只需在卡片上轻量显示工作区/分支标签（如 `worktree: feat-x`）即可。
3. **服务端会话必须严格绑定工作区路径**：OpenCode 底层依赖工作区根路径定位配置和工具上下文，oco 必须确保若会话运行于 worktree 时，请求中的工作目录（`worktree` / `directory`）与主仓库严格隔离。
4. **清理必须保证数据安全，禁止静默销毁**：各家一致原则是避免误删用户未提交代码。oco 若未来支持 worktree 清理，应效仿 VS Code 的显式确认 UI 或让用户手动使用 Git 命令，绝不静默物理删除。
5. **改动回流辅助（Apply / Merge）是真正的高价值点**：Cursor 的 `/apply-worktree` 和 Windsurf 的一键 `Merge` 是用户最满意的环节。若 oco 未来支持 worktree 会话，重点应放在“将隔离改动一键带回当前编辑区”。
