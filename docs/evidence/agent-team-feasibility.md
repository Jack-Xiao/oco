# 智能体团队（agent team）可行性调查（2026-10-02）

只读调查，未改产品代码。所有结论来自源码阅读和公开页面；**没有在真实 OpenCode 或 oco 上运行过任何团队插件**，涉及运行行为的条目都标为 NOT RUN 或「推断」。

## 委派记录

| task_id | 唯一写入范围 | requested_route | actual_provider/model | agent_id/run_id | 状态 | 结果路径 | fallback_reason / 接手理由 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| agent-team-survey | 本文件 | grok-worker（只读调查） | 主线程（Claude Code 云会话） | unknown | 已返回 | 本文件 | 本会话（Claude Code 云容器）的 Agent 工具只提供 claude / Explore / general-purpose / Plan / claude-code-guide / statusline-setup，没有 `grok-worker`、`grok-build:grok-delegate`、`gemini-worker`。两条订阅路线都不可用，按 AGENTS.md 由主线程接手，未用其他模型子代理执行任务主体 |

## 调查对象与版本

| 对象 | 版本 / 提交 | 来源 |
| --- | --- | --- |
| OpenCode | `v1.18.33`（`51ef4be`，与 oco 当前钉住的远程标签一致，见 [upstream](upstream.md)） | `github.com/anomalyco/opencode` 浅克隆 |
| DeepSeek Harness | `main@639ed01`（2026-09-29），4 个团队包都是 `0.2.0-rc.2`，与截图里的版本一致；npm dist-tag `next=0.2.0-rc.2` | `github.com/deepseek-ai/deepseek-harness`，MIT |
| opencode-ensemble（社区插件） | `main@269207e`（2026-09-18），npm `@hueyexe/opencode-ensemble@0.18.0` | `github.com/hueyexe/opencode-ensemble`，MIT |
| 上游提案 | issue #12711，PR #12730/#12731/#12732 | `github.com/anomalyco/opencode`（2026-10-02 抓取网页） |

## 1. DeepSeek 的实现方式（源码已读）

- **组织方式**：截图里的「智能体团队」是一个 profile bundle（`agent-team-profile`）。它的运行时内容只有 `cordis.patch.yml`，作用有两点：
  - 关掉 `tool-subagent`、`tool-subagent-fork`、`tool-subagent-control`、`tool-subagent-list-agents`；
  - 插入三个插件：`agent-team`（领域服务）、`tool-agent-team`（模型工具）、`client-ui-agent-team`（Web 面板）。
  - 默认关闭，必须显式启用。
- **领域服务 `agent-team`**（约 2.5k 行 TS）：
  - 团队 id = Lead 的 `SessionId`，roster 是扁平的。每个成员是 Lead 的一个「可续接直接子会话」（continuable child），创建方式分 fresh 和 fork 两种。
  - 状态以事件形式（`team/member`、`team/task`、`team/message/queued|delivered`）追加到 **Lead 会话日志**，读状态时回放。这些事件不进入模型历史。
  - 信箱流程：先持久化 queued，再用 Steer 投递，收到后写 delivered。目标正在运行时，在下一个步骤边界注入；目标空闲时，起一个新轮次或冷恢复。崩溃后重投并去重。只承诺进程内可靠，不承诺跨进程。
  - 任务板：每次修改按 revision 做 CAS，依赖必须构成 DAG。`writeScopes` 只是提示，路径重叠时报警但不加锁。
  - **所有成员共享同一个 cwd，不使用 worktree**。设计说明里明确拒绝了自动 worktree，理由是分支、合并、清理策略应由部署方决定。
- **工具 `tool-agent-team`**：Lead 和成员都拿到同样 9 个工具：`spawn_teammate`、`send_message`、`list_agents`、`wait_agent`、`interrupt_agent`、`team_task_create/list/get/update`。其中 spawn 和 interrupt 只有 Lead 能调用（执行时检查）。系统策略规定：只有用户明确要求时才组队。
- **UI `client-ui-agent-team`**：在会话标题栏注册一个按钮（slot `conversation.session.header.actions`），读取 Lead 会话的 `agentTeam` 投影，展示 roster 和任务板，可以打开成员会话。这个面板本身不发 RPC。
- **与宿主耦合**：`static inject = ['agents','sessions','sessionPersistence','sessionProjections','subagents']`；信箱依赖 `@deepseek-ai/dsh-subagent/internal` 的 `steerHostSubagentPrompt`；UI 依赖 DSH 的 slots、uiWorkspace 和会话投影流。
  - **结论**：这些包是 DSH（Cordis）插件，**不能直接装进 OpenCode 或 oco**，能复用的只有设计。

## 2. OpenCode v1.18.33 能否扩展出团队（源码已读）

- **没有内置团队**：`packages/opencode/src`、`packages/plugin/src` 里没有 team/teammate 实现。内置的委派方式是 `task` 工具（`tool/task.ts`），属于星形结构：
  - `task_id` 可以续接已有子会话；
  - `background=true` 需要 `OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS=true`，完成后以 synthetic 用户消息注入父会话；
  - 嵌套深度由 `subagent_depth` 控制，默认 1。
  - 没有成员之间互发消息，也没有共享任务板。
- **插件可以补齐，所需原语都在**：
  - `Hooks.tool` 可以注册自定义工具，`event` 可以订阅 `session.created/status/idle`，`experimental.chat.system.transform` 可以注入团队状态；
  - `PluginInput.client` 是完整 SDK，提供 `session.create({parentID})`、`promptAsync`、`abort`、`children`、`fork`、`status`。
  - **对忙碌会话发 prompt 等同于 steer**：`SessionPrompt.prompt` 先写用户消息再 `loop`；`Runner.ensureRunning` 发现会话 `Running` 时只等待当前运行，不另起一轮；`runLoop` 每轮重新读取消息，所以新消息会在下一步被处理。HTTP `prompt_async` 没有忙碌检查。以上是代码阅读结论，NOT RUN。
  - 缺口：OpenCode 没有给插件提供持久化存储，团队状态要由插件自行落盘（ensemble 用的是 SQLite）。
- **上游状态**：
  - 设计 issue #12711（2026-02-08）和 PR 栈 #12730–#12732 至今**未合并**，网页上看不到维护者回复（2026-10-02 抓取）。PR 描述约 1.5k 行核心代码、1.1k 行 TUI、8.5k 行测试。
  - 是否会被合并：未知。
- **社区插件 opencode-ensemble**（README 与源码部分已读）：
  - 只用公开 SDK；14 个工具（8 个仅 Lead 可用）；SQLite（WAL）存储；`promptAsync` 投递消息。
  - 成员用 `session.create({ parentID: lead, title: "<name> (@agent teammate)" })` 创建，**默认每个可写成员一个 git worktree**（`worktree: false` 可关闭）。
  - 另起一个 `localhost:4747` dashboard；要求 Node ≥24 或 Bun。
  - 区分 OpenCode「v1/v2」两套插件和权限配置格式；它在 v1.18.33 上走哪条路径未验证。
  - **安全注意**：带 worktree 的可写成员会在创建会话时写入 `bash: "*" → allow`，以及该 worktree 下的 `edit → allow`（`src/tools/team-spawn.ts`）。也就是说，成员执行 bash 不再经过用户逐条审批。
- 其他实现（只看到搜索摘要，未读源码）：`rothnic/opencode-teams`、`huangli712/OCTeam`。

## 3. 在 oco 中能否实现

AGENTS.md 的边界：oco 是 OpenCode 客户端，不是新的执行引擎；「不主动加入……新 Agent 调度引擎」；不擅自覆盖用户的 OpenCode 配置。据此分成四种做法：

| 方案 | 做法 | 判断 |
| --- | --- | --- |
| A. 服务端插件 + oco 兼容 | 用户在自己的 OpenCode 里装团队插件（如 ensemble）。oco 不实现团队逻辑，只确保成员子会话能正常显示和操作 | **推荐，先做验证**。成员就是 `parentID` 子会话，oco 已有子会话链路（补丁 0014、0016，`bridge-policy.ts`） |
| B. oco 自己做团队面板 | 在 oco 里读取团队状态，展示 roster 和任务板 | 暂不做。OpenCode 没有团队 API，只能耦合第三方插件的私有 SQLite 或 4747 端口，契约不稳定 |
| C. 移植 DSH 设计，自研 OpenCode 插件 | 以插件形式实现信箱、任务板和 9 个工具 | 技术上可行（原语都在），但等于写一个新的调度引擎，超出 oco 当前边界，需要用户另行立项 |
| D. 等上游 | 跟踪 #12711/#12730 | 时间不可预期，可以和 A 并行 |

**方案 A 需要验证的风险**（下面都是代码阅读推断，NOT RUN）：

1. `apps/extension/src/bridge-policy.ts` 的 `sessionAllowed()` 在 `info.directory !== binding.directory` 时直接拒绝。ensemble 的可写成员如果把会话 directory 绑到 worktree，那么在 oco 面板里，对这些成员会话的写操作（发消息、权限回复）会被拒绝。会话的 directory 是否真的等于 worktree 路径，需要实测。
2. 成员的权限请求会出现在成员子会话上。oco 面板能否看到并回复这些请求，取决于第 1 点和子会话的加载方式。
3. `bash: "*"` 自动放行改变了用户的安全边界，oco 不应替用户安装或启用该插件。
4. 侧栏会话列表对 `parentID` 子会话的分组和显示方式没有验证；worktree 成员可能根本不在当前目录的列表里。

**建议的验证路径**（需要一个能用真实模型的 OpenCode v1.18.33 环境；本容器没有模型凭据，所以 BLOCKED）：

1. 在独立的测试 OpenCode 实例里（不碰用户现有服务）装 `@hueyexe/opencode-ensemble@0.18.0`，跑两个只读成员（`worktree:false`），观察 oco 侧栏、子会话链接和面板。
2. 再跑一个可写成员（默认 worktree），记录会话 directory、bridge 拒绝次数（`BridgePolicy.stats.rejected`）、权限请求能否在 oco 内回复。
3. 根据结果决定 oco 是否需要最小修复（比如允许「已验证的子会话位于该项目的 worktree 目录」），这个改动另行立项。
