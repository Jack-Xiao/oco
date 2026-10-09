# Runtime M4 B2 Fixture Checkpoint & Evidence

- Task ID: runtime-m4-b2-fixture
- Requested Route: self / Gemini 3.8 Flash (High)
- Actual Provider/Model: gemini / gemini-3.8-flash
- Status: 验收通过
- Date: 2026-10-04T10:56:30+08:00
- Worktree: `/Users/xiaojiang/Ai-Project/oco/.claude/worktrees/nostalgic-gates-ef74ca`

## 改动范围

- `tests/e2e/lib/bg-task-plugin.mjs`: OpenCode 本地插件，实现 `tool.execute.after` 拦截 `tool === "task"` 并在 `run_in_background === true` 时向 `output.metadata` 注入 `backgroundTaskId`、`sessionId`、`agent`、`description`、`run_in_background: true`，并在输出末尾追加 `background_task_id: <id>`；并注册 `background_output` 工具，参数 `task_id: string`，执行时写入 metadata `{ backgroundTaskId, agent, description, sessionId }` 并返回 `Task result: subagent-ok`。
- `tests/e2e/lib/mock-llm.mjs`: 新增两个后台提示词分支与 tool 返回处理，优先于已有分支匹配，不影响既有同步 task 或其他分支。
- `scripts/test-server.mock.opencode.json`: 新增一行 `"plugin"` 配置，以 `file://` 绝对路径指向 `tests/e2e/lib/bg-task-plugin.mjs`。

## 验证与核对记录

### 启动测试服务器命令
独立端口（避开已有的 4517/4518）：
```bash
OCO_TEST_PORT=4617 OCO_MOCK_LLM_PORT=4618 OCO_E2E_MODEL=mock bash scripts/test-server.sh
```

### 1. 后台派发不取回 (without retrieving)
提示词：`Use the task tool in the background without retrieving with the explore agent: find background tasks`
Session: `ses_efb294cf4ffeSECV351FA7ApiT`

核对字段截取：
- `tool`: `"task"`
- `state.input`:
  - `subagent_type`: `"explore"`
  - `description`: `"find background tasks"`
  - `prompt`: `"Reply with exactly this line and nothing else: subagent-ok"`
  - `run_in_background`: `true`
- `state.metadata`:
  - `backgroundTaskId`: `"bg_a3ffd15a"`
  - `sessionId`: `"ses_efb294715ffeg8LDOFYeccix5H"`
  - `agent`: `"explore"`
  - `description`: `"find background tasks"`
  - `run_in_background`: `true`
- `state.output`: 末尾包含 `background_task_id: bg_a3ffd15a`
- 响应文本: `"OK"`（任务停留在待取回）

### 2. 后台派发并取回 (background dispatch + background_output retrieval)
提示词：`Use the task tool in the background with the explore agent: search background tasks`
Session: `ses_efb2926b7ffenJdFBhpuGzoSXT`

核对字段截取：
- 第一步 tool part (`tool: "task"`):
  - `input.run_in_background`: `true`
  - `metadata.backgroundTaskId`: `"bg_7c4267ad"`
  - `metadata.sessionId`: `"ses_efb2925b6ffeFPhafpD2uHbH0h"`
  - `metadata.agent`: `"explore"`
  - `metadata.description`: `"search background tasks"`
  - `metadata.run_in_background`: `true`
  - `output`: 末尾追加 `background_task_id: bg_7c4267ad`
- 第二步 tool part (`tool: "background_output"`):
  - `input.task_id`: `"bg_7c4267ad"` (与前一步 backgroundTaskId 相等)
  - `metadata.backgroundTaskId`: `"bg_7c4267ad"`
  - `metadata.sessionId`: `"ses_efb2925b6ffeFPhafpD2uHbH0h"`
  - `metadata.agent`: `"explore"`
  - `metadata.description`: `"search background tasks"`
  - `output`: `"Task result: subagent-ok"`
- 第三步 assistant 响应文本: `"OK"`

### 3. 同步 task 既有行为兼容核对
提示词：`Use the task tool with the explore agent: test sync task`
Session: `ses_efb28ff99ffe3uR8iq8DP8Ut2y`

核对字段截取：
- `tool`: `"task"`
- `state.input`: `subagent_type: "explore"`, `description: "test sync task"`（无 `run_in_background`）
- `state.metadata`: `sessionId: "ses_efb28fe8bffendqIGmhCtdBubH"`（无 `backgroundTaskId`，无 `run_in_background`）
- `state.output`: 正常 task 输出，无 `background_task_id:` 行
- 响应文本: `"OK"`

### 4. 进程与资源清理
- 启动的 4617 (OpenCode) 与 4618 (mock LLM) 进程在验证完成后全部终止，端口均已释放。
- 确认用户原生已有的 4517、4518 进程保持运行，未受任何干扰。
