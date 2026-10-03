# 运行视图 M2 预检调查证据 (runtime-m2-preflight)

本文档记录针对运行视图 M2（权限/提问批准、取消在途、子代理加载与下钻、重试）的 7 个只读事实问题调查结论与代码位置证据。

---

## 1. 权限 (E2E 配置与 Permission 数据结构)

### 结论
- **E2E 测试服务配置**:
  - `bash` 配置为 `"ask"`。
  - 对于写入文件：OpenCode 没有名为 `"write"` 的权限键，文件修改统一由权限键 `"edit"` 控制（定义于 core config schema），并且在测试服务配置中明确配为了 `"ask"`。
- **独立测试服务开启 ask 的最小配置**:
  - 配置文件路径：`$ROOT/.oco-test/xdg/config/opencode/opencode.json`（测试脚本中使用 `XDG_CONFIG_HOME="$T/xdg/config"`）。
  - 最小配置内容：
    ```json
    {
      "permission": {
        "bash": "ask",
        "edit": "ask"
      }
    }
    ```
    （注：若配置为 `"permission": "ask"`，经 `normalizeInput` 会等价展开为全部权限 `"*": "ask"`）。
- **`permission.asked` 事件与 Store 字段结构**:
  - 事件类型：`"permission.asked"`。
  - Payload 结构（`PermissionRequest`）：
    - `id`: `string`（以 `"per_"` 开头的有序 ID）
    - `sessionID`: `string`（关联会话 ID）
    - `permission`: `string`（如 `"bash"`, `"edit"`, `"task"` 等）
    - `patterns`: `string[]`（匹配规则路径/参数模式）
    - `metadata`: `Record<string, unknown>`（附加元数据）
    - `always`: `string[]`（选择 always 批准时加入白名单的模式）
    - `tool`: 可选对象 `{ messageID: string, callID: string }`
  - 前端 Store：位于 `serverSync().session.data.permission[sessionID]`，存储该 session 下按 ID 排序的 `PermissionRequest[]` 数组。

### 证据
- `scripts/test-server.mock.opencode.json:6`: `"permission": { "bash": "ask", "edit": "ask" }`
- `scripts/test-server.opencode.json:6`: `"permission": { "bash": "ask", "edit": "ask" }`
- `tests/e2e/c5-runtime.mjs:153-166`: E2E 运行时验证 bash 触发 ask、通过 `GET /permission` 获取并调用 `POST /permission/${perm.id}/reply`
- `vendor/opencode/packages/core/src/v1/config/permission.ts:18-35`: 声明已知权限键包含 `read`, `edit`, `glob`, `grep`, `list`, `bash`, `task`, `question` 等，无 `write`
- `vendor/opencode/packages/core/src/v1/config/permission.ts:40-41`: `normalizeInput = (input) => typeof input === "string" ? { "*": input } : input`
- `vendor/opencode/packages/schema/src/v1/permission.ts:27-35`: `PermissionRequest` 结构定义（`id`, `sessionID`, `permission`, `patterns`, `metadata`, `always`, `tool`）
- `vendor/opencode/packages/schema/src/v1/permission.ts:61`: `const Asked = define({ type: "permission.asked", schema: Request.fields })`
- `vendor/opencode/packages/opencode/src/permission/index.ts:87-100`: `ask` 逻辑组装 `info: PermissionV1.Request` 并发布 `Event.Asked`
- `vendor/opencode/packages/app/src/context/server-session.ts:1233-1249`: `case "permission.asked"` 将 `PermissionRequest` 存入 `data.permission[permission.sessionID]`

### 未查明项
- 无。

---

## 2. 回复 (权限与提问 dock/reply 调用签名与复用性)

### 结论
- **权限回复调用签名与取值**:
  - `session-composer-state.ts` 中的 `decide` 签名：
    `(response: "once" | "always" | "reject") => void`
  - 底层 SDK 调用：
    `sdk().api.permission.reply({ sessionID: perm.sessionID, requestID: perm.id, reply: response })`
    其中 `reply` 取值为 `"once" | "always" | "reject"`。
- **权限回复复用性**:
  - `session-composer-state.ts` 中的 `createSessionComposerController()` 是一个 SolidJS hook，绑定于当前路由参数 `useParams().id` 并包含本地输入框控制状态，`decide` 是其内部闭包，**不是独立的纯函数**，无法直接跨组件导出复用。
  - 在其他视图中复用权限回复的推荐方式：
    1. 直接使用 `useSDK()` 调用 `sdk().api.permission.reply({ sessionID, requestID, reply })`；
    2. 或使用全局上下文 `usePermission().respond({ sessionID, permissionID, response: "once" | "always" | "reject", directory })`。
- **提问 Dock 组件 Props 与跨视图嵌入**:
  - 组件名：`SessionQuestionDock`（`vendor/opencode/packages/app/src/pages/session/composer/session-question-dock.tsx`）
  - Props：`{ request: QuestionRequest; onSubmit: () => void }`
  - 嵌入可行性：可以嵌入任意视图，只要宿主视图位于提供 `useSDK()`、`useServerSDK()`、`useLanguage()` 的上下文树内即可。
- **`question.reply` 与 `reject` 调用形状**:
  - `reply`：`sdk().api.question.reply({ sessionID: props.request.sessionID, requestID: props.request.id, answers: QuestionAnswer[] })`
    其中 `answers` 形状为 `string[][]`（每道题对应一个选中的 label 字符串数组）。
  - `reject`：`sdk().api.question.reject({ sessionID: props.request.sessionID, requestID: props.request.id })`

### 证据
- `vendor/opencode/packages/app/src/pages/session/composer/session-composer-state.ts:28`: `export function createSessionComposerController(...)`
- `vendor/opencode/packages/app/src/pages/session/composer/session-composer-state.ts:78-93`: `const decide = (response: "once" | "always" | "reject") => { sdk().api.permission.reply({ sessionID: perm.sessionID, requestID: perm.id, reply: response }) }`
- `vendor/opencode/packages/app/src/context/permission.tsx:155, 246-261`: `PermissionProvider` 提供的 `respond` 方法与签名
- `vendor/opencode/packages/app/src/pages/session/composer/session-question-dock.tsx:64`: `export const SessionQuestionDock: Component<{ request: QuestionRequest; onSubmit: () => void }>`
- `vendor/opencode/packages/app/src/pages/session/composer/session-question-dock.tsx:225-236`: `replyMutation` 调用 `sdk().api.question.reply({ sessionID: props.request.sessionID, requestID: props.request.id, answers })`
- `vendor/opencode/packages/app/src/pages/session/composer/session-question-dock.tsx:238-248`: `rejectMutation` 调用 `sdk().api.question.reject({ sessionID: props.request.sessionID, requestID: props.request.id })`
- `vendor/opencode/packages/schema/src/v1/question.ts:41-56`: `QuestionAnswer` 为 `string[]`，`QuestionReply` 字段为 `answers: QuestionAnswer[]`

### 未查明项
- 无。

---

## 3. 重试 (429 判定、退避、SessionStatus retry 字段与 Mock 要求)

### 结论
- **429 是否重试**:
  - 会重试。对于 openai-compatible provider（在 mock 测试中为 `oco-mock`），底层由 `@ai-sdk/openai-compatible` 发起请求并产生 `APICallError`。`ProviderError.parseAPICallError` 保留 `error.isRetryable`（429 在 AI SDK 规范中标记为 retryable）；且 `retry.ts` 正则 `RETRYABLE_MESSAGE_PATTERNS` 明确匹配 `/429/i` 及 `/rate limit|rate_limit|too many requests/i`。
- **退避公式、retry-after 与最大次数**:
  - 最大重试次数：`RETRY_MAX_RETRIES = 5`。
  - 读取 `retry-after`：优先读取并解析 `retry-after-ms`（毫秒），次选读取 `retry-after`（支持秒数浮点数转换毫秒 `parsedSeconds * 1000` 或 HTTP Date `Date.parse(...) - Date.now()`）。
  - 无头时的指数退避公式：
    - `base = RETRY_INITIAL_DELAY * Math.pow(RETRY_BACKOFF_FACTOR, attempt - 1)`
    - `delay = Math.ceil(base + base * RETRY_JITTER_FACTOR * random)`
    - 常量值：`RETRY_INITIAL_DELAY = 2000` (2s), `RETRY_BACKOFF_FACTOR = 2`, `RETRY_JITTER_FACTOR = 0.25`。
    - 上限截断：无 headers 时为 `RETRY_MAX_DELAY_NO_HEADERS = 30_000` (30s)，有 headers 时为 `RETRY_MAX_DELAY = 2_147_483_647` (2^31 - 1)。
- **`SessionStatus` retry 变体字段与单位**:
  - 变体结构：
    ```ts
    {
      type: "retry",
      attempt: number, // NonNegativeInt，当前重试轮次序号 (1-indexed, 1..5)
      message: string, // 重试原因提示文案
      action?: { reason: string, provider: string, title: string, message: string, label: string, link?: string },
      next: number     // NonNegativeInt，单位为 Unix 毫秒时间戳 (ms epoch，由 now + wait 计算得出)
    }
    ```
- **Mock 产生 429 所需返回**:
  - HTTP 状态码：`429`。
  - 响应头（可选但强烈建议）：`"retry-after": "1"`（或短秒数，以防等待默认 2s+ 退避）。
  - 响应体：JSON 错误体，如：
    ```json
    {
      "error": {
        "message": "Rate limit exceeded (mock 429)",
        "type": "requests",
        "code": "rate_limit_exceeded"
      }
    }
    ```

### 证据
- `vendor/opencode/packages/opencode/src/session/retry.ts:26-31`: 定义 `RETRY_INITIAL_DELAY = 2000`, `RETRY_BACKOFF_FACTOR = 2`, `RETRY_JITTER_FACTOR = 0.25`, `RETRY_MAX_DELAY_NO_HEADERS = 30_000`, `RETRY_MAX_RETRIES = 5`
- `vendor/opencode/packages/opencode/src/session/retry.ts:34-41`: `RETRYABLE_MESSAGE_PATTERNS` 包含 `/429|500|502|503|504|524/i` 与 `/rate increased too quickly|rate limit|rate-limit|rate_limit|too many requests/i`
- `vendor/opencode/packages/opencode/src/session/retry.ts:47-78`: `delay()` 函数解析 `retry-after-ms`、`retry-after`（秒与 HTTP Date）及回退 `exponential()`
- `vendor/opencode/packages/opencode/src/session/retry.ts:80-83`: `exponential(attempt, random)` 计算逻辑
- `vendor/opencode/packages/opencode/src/session/retry.ts:85-155`: `retryable(error, provider)` 判定逻辑
- `vendor/opencode/packages/opencode/src/session/retry.ts:188-206`: `policy()` 调度器，`const now = yield* Clock.currentTimeMillis`，`next: now + wait`
- `vendor/opencode/packages/opencode/src/provider/error.ts:188`: `isRetryable: input.providerID.startsWith("openai") ? isOpenAiErrorRetryable(input.error) : input.error.isRetryable`
- `vendor/opencode/packages/schema/src/session-status-event.ts:13-28`: `SessionStatus` 中 `type: "retry"` 字段定义（`attempt`, `message`, `action`, `next`）

### 未查明项
- 无。

---

## 4. 取消 (session.abort 级联子会话、终止态 error、app abort 入口)

### 结论
- **级联取消子会话**:
  - 是，级联取消。
  - 当根会话被 abort 时，根会话 prompt fiber 被中断，触发 task tool 的 `ctx.abort` 事件监听器 `onAbort()`，执行 `ops.cancel(nextSession.id)`；同时 task tool 的 `Effect.acquireUseRelease` 释放钩子检测到中断，会并行执行 `Effect.all([cancel, background.cancel(nextSession.id)])`。
- **取消后 assistant 消息 error 名称与 in-flight tool part 状态**:
  - Assistant 消息 error 名称：`"MessageAbortedError"`（由 `DOMException("Aborted", "AbortError")` 解析为 `AbortedError`，其 Schema 标记标识符为 `"MessageAbortedError"`）。
  - 进行中 tool part 最终状态：
    - `part.state.status`: `"error"`
    - `part.state.error`: `"Tool execution aborted"`
    - `part.state.metadata.interrupted`: `true`
- **App 中 abort 的现有调用入口**:
  - UI 绑定位置：`vendor/opencode/packages/app/src/pages/session.tsx` 约 2270 行（普通输入框）与 2300 行（PromptInputV2）：
    `onAbort: () => { const id = params.id; if (!id) return; setFollowup("paused", id, true) }`
  - 实际底层触发取消的调用：
    在 `packages/app/src/components/prompt-input/submit.ts:280-299` 中的 `abort()` 函数：
    `sdk().api.session.interrupt({ sessionID })`，并调用 `input.onAbort?.()`。在服务器端路由对应 `session.abort` / `session.interrupt` 处理程序（`promptSvc.cancel(sessionID)`）。

### 证据
- `vendor/opencode/packages/opencode/src/tool/task.ts:321-331`: `ctx.abort.addEventListener("abort", onAbort)` -> `runCancel.fork(ops.cancel(nextSession.id))`
- `vendor/opencode/packages/opencode/src/tool/task.ts:347-357`: `acquireUseRelease` cleanup：`if (Exit.hasInterrupts(exit)) yield* Effect.all([cancel, background.cancel(nextSession.id)], { discard: true })`
- `vendor/opencode/packages/opencode/src/session/processor.ts:597-606`: 终止未完成 tool call 状态更新：`status: "error"`, `error: "Tool execution aborted"`, `metadata: { ...metadata, interrupted: true }`
- `vendor/opencode/packages/opencode/src/session/processor.ts:662-668`: `Effect.onInterrupt` 捕获中断触发 `halt(new DOMException("Aborted", "AbortError"))`
- `vendor/opencode/packages/opencode/src/session/message-v2.ts:615-621`: `case e instanceof DOMException && e.name === "AbortError": return new AbortedError(...)`
- `vendor/opencode/packages/schema/src/v1/session.ts:43`: `export const AbortedError = namedError("MessageAbortedError", { message: Schema.String })`
- `vendor/opencode/packages/app/src/pages/session.tsx:2270-2274, 2300-2304`: `onAbort` 入口传递给 controller
- `vendor/opencode/packages/app/src/components/prompt-input/submit.ts:280-299`: `abort = async () => { ... sdk().api.session.interrupt({ sessionID }) ... }`
- `vendor/opencode/packages/opencode/src/server/routes/instance/httpapi/handlers/session.ts:232-235`: `abort` 路由调用 `promptSvc.cancel(ctx.params.sessionID)`

### 未查明项
- 无。

---

## 5. 子会话 (按需加载消息函数与嵌入模式跳转方式)

### 结论
- **按需加载子会话消息的函数**:
  - 上下文暴露函数：`sync().session.sync(sessionID: string, options?: { force?: boolean })`（定义于 `directory-sync.ts:115`）。
  - 底层 ServerSession 函数：`serverSync().session.sync(sessionID: string, options?: { force?: boolean; messageLimit?: number })`（定义于 `server-session.ts:836, 1310`）。
  - 生命周期保持机制：`serverSync().session.pin(sessionID)` 与 `onCleanup(() => serverSync().session.unpin(sessionID))`（防止消息被自动 evict）。
- **嵌入模式下跳转到子会话的现有方式（补丁 0014/0016）**:
  - 函数名与调用方式：
    `onNavigateToSession={(sessionID: string) => navigate(href(sessionID))}`
    其中：
    - `navigate` 为 Solid Router 的 `useNavigate()`。
    - `href` 为 `(id: string) => href({ session: id })`（生成相对会话路径）。
  - 嵌入模式特殊行为（补丁 0016）：
    在 `platform.embedded === true` 模式下，`<DataProvider>` 的 `onSessionHref` 传入 `undefined`。子代理卡片（subagent cards）检测到无 sessionHref 时放弃渲染 `<a href>` 链接（避免 VS Code webview 自动拉起系统浏览器），改为渲染为 `<button>` 并通过 `onNavigateToSession(sessionID)` 在内部执行路由切换。

### 证据
- `vendor/opencode/packages/app/src/context/directory-sync.ts:115-118`: `async sync(sessionID: string, options?: { force?: boolean }) { await serverSync.session.sync(sessionID, options); index(sessionID); }`
- `vendor/opencode/packages/app/src/context/server-session.ts:836`: `const sync = (sessionID: string, options?: { force?: boolean; messageLimit?: number }) => { ... }`
- `vendor/opencode/packages/app/src/pages/directory-layout.tsx:50-60`: `sync().session.sync(id)` 与 `serverSync().session.pin(sessionID)`
- `ROOT/patches/opencode/0016-oco-embedded-session-links-not-urls.patch:1-17`: 修改 `directory-layout.tsx`，将 `onSessionHref` 设为 `platform.embedded ? undefined : href`，并指出 embedded 模式下 link 转为 button 通过 `onNavigateToSession` 跳转
- `ROOT/patches/opencode/0014-oco-trajectory-toggle-state-subagent.patch:119-130, 221-228`: 轨迹中提取 `task` tool 的 `metadata.sessionId` 作为子会话 ID，并展示子代理信息与状态

### 未查明项
- 无。

---

## 6. 后台子代理 (OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS 与 task 工具/状态差异)

### 结论
- **环境变量读取位置**:
  - `vendor/opencode/packages/opencode/src/effect/runtime-flags.ts:43`:
    `experimentalBackgroundSubagents: enabledByExperimental("OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS")`
    通过 Effect Config 读取环境变量；若设置了 `OPENCODE_EXPERIMENTAL=true` 也会隐式开启。
- **开启后 task 工具参数与状态差异**:
  - 参数变化：开启后 `task` 工具 schema 接受可选布尔参数 `background?: boolean`（未开启时若传 `background: true` 会直接抛错 `new Error("Background subagents require OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS=true")`）。
  - **Tool part 状态差异**:
    - 前台执行（默认 / `background: false`）：父会话中 task tool 保持 `"running"` 状态阻塞等待子会话执行完毕；只有当子代理完成时 tool part 才转为 `"completed"` 并返回完整输出文本。
    - 后台执行（`background: true`）：task tool **立即返回**并完成（tool part 状态变为 `"completed"`），输出初始 XML `<task state="running"><task_summary>Background task started</task_summary></task>`，且 metadata 标记 `{ background: true, jobId: info.id }`。
  - **子会话状态与通知差异**:
    - 子会话在 `BackgroundJob` 调度下异步运行。
    - 当后台子会话运行结束（`completed` 或 `error`）时，`notifyBackgroundResult` 会通过 `ops.prompt(...)` 向父会话注入一条 synthetic 文本消息汇报后台任务执行结果。
- **测试服务能否传入该环境变量**:
  - **当前不能直接传入**。
  - 证据见 `scripts/test-server.sh:39-45`：启动命令使用了 `env -i PATH=... HOME=... XDG_*=... "$BIN" serve ...`。`env -i` 会完全清除外层环境的所有环境变量，且当前脚本没有包含 `OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS`。若需支持，必须显式在 `test-server.sh` 的 `env -i` 列表中透传该变量。
  - `tests/e2e/server.mjs` 仅作为 HTTP client 请求现有服务，不负责子进程启动与环境变量传递。

### 证据
- `vendor/opencode/packages/opencode/src/effect/runtime-flags.ts:11-14, 43`: `experimentalBackgroundSubagents` 的定义与环境变量绑定
- `vendor/opencode/packages/opencode/src/tool/task.ts:97-102`: 校验 `runInBackground && !flags.experimentalBackgroundSubagents`
- `vendor/opencode/packages/opencode/src/tool/task.ts:256-265, 299-318`: `background: true` 时立即返回 `backgroundResult()` 并启动异步 `notify` 监听
- `vendor/opencode/packages/opencode/src/tool/task.ts:328-358`: 前台模式下挂载 `ctx.abort` 监听并调用 `background.wait({ id: nextSession.id })` 阻塞等待完成
- `scripts/test-server.sh:39-45`: `env -i` 清理环境变量导致外层环境变量无法传递给 `$BIN serve`

### 未查明项
- 无。

---

## 7. Mock LLM 能力与 429 注入扩展点

### 结论
- **现有驱动能力**:
  - `task` 子代理：**能**。已有正则是 `/use the task tool with the (\S+) agent:\s*(.+)$/im`，自动返回 `tool: "task"` 并在 args 中生成子会话 prompt（`mock-llm.mjs:47-48`）。
  - `question`：**能**。已有正则是 `/question tool/i`，触发时返回 `tool: "question"` 选择题结构；并且当 tool 结果回传时能解析 `="([^"]+)"` 并回答（`mock-llm.mjs:35-37, 49-64`）。
  - 长流（用于取消）：**能**。已有正则是 `/(\d+) numbered sentences|from 1 to (\d+)|1 to (\d+)/i`，根据行数休眠流式推送（单句间隔 `SENTENCE_MS = 150ms`），并监听 `res.on("close")` 支持取消（`mock-llm.mjs:71-76, 90-91, 106-110`）。
- **支持“指定 prompt 触发一次 429 然后成功”的最小改动点描述**:
  - 文件：`tests/e2e/lib/mock-llm.mjs`。
  - 最小改动方案：
    1. 在文件模块作用域维护一个已触发记录集合，如 `const retried429 = new Set()`。
    2. 在 `complete(req, res, body)` 函数入口处（或 `createMockServer` 路由处理处）：
       从 `body.messages` 中提取最新 user prompt；
       若 prompt 命中指定触发词（例如包含 `/trigger 429/i`）且 `!retried429.has(key)`：
       标记 `retried429.add(key)`，并直接返回 HTTP 429 响应结束请求：
       ```javascript
       res.writeHead(429, {
         "content-type": "application/json",
         "retry-after": "1" // 1秒后重试，避免默认退避等待过长
       })
       res.end(JSON.stringify({
         error: {
           message: "Rate limit exceeded (mock 429)",
           type: "requests",
           code: "rate_limit_exceeded"
         }
       }))
       return
       ```
    3. 当 OpenCode 捕获 429 并根据 `retry-after` 发起第 2 次重试请求时，`retried429.has(key)` 已经为 `true`，请求将正常向下流转进入现有 SSE 响应流程，从而成功完成。

### 证据
- `tests/e2e/lib/mock-llm.mjs:47-48`: task tool 调度规则
- `tests/e2e/lib/mock-llm.mjs:35-37, 49-64`: question tool 调度与结果响应规则
- `tests/e2e/lib/mock-llm.mjs:71-76, 90-91, 106-110`: 长流文本生成、`SENTENCE_MS` 节奏控制与 `res.on("close")` 监听
- `tests/e2e/lib/mock-llm.mjs:87-116`: `complete` 函数为处理 chat completions 请求的核心入口

### 未查明项
- 无。
