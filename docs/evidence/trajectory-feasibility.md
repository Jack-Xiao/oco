# 轨迹视图可行性调研（2026-10-01）

目标：在 oco 里提供类似 DeepSeek「轨迹」的视图（按轮次/调用/工具展开、token 与缓存、费用、思考链、耗时）。本文件只记录调研结论；第 1 阶段实现（补丁 0012）见 [c4-trajectory](c4-trajectory.md)。

## 依据

- 上游源码：`vendor/opencode` @ `51ef4be1`（只读）。
- 本机 OpenCode 1.18.33 的 `~/.local/share/opencode/opencode.db`，只读查询，仅取计数与数值，未读消息正文。

## 已持久化、可直接用的数据

| 需要展示的 | OpenCode 字段 | 结论 |
| --- | --- | --- |
| 每次模型调用的 token（输入/输出/思考/缓存读/缓存写） | `step-finish.tokens`、`AssistantMessage.tokens`（`packages/schema/src/v1/session.ts:240,453`） | 有。本机 547 个 step-finish，各 provider 的 input/output/cache.read 均有值 |
| 费用 | `step-finish.cost`、`AssistantMessage.cost` | 有字段，但订阅/OAuth 模型为 0（实测 openai、google、kimi 全 0；xai、deepseek 非 0） |
| 思考链 | `reasoning` part 的 `text`、`time.start/end` | 有（437 个） |
| 工具调用 | `tool` part：`tool`、`state.input`、`state.output`、`state.time.start/end`、`error` | 有（882 个） |
| 模型、agent、variant、finish 原因 | `AssistantMessage.modelID/providerID/agent/variant/finish` | 有 |
| 子代理 | 子会话 `parent_id`（本机 47 个），宿主策略已放行子会话读取 | 有 |
| 会话级汇总 | 官方 app 已有「Context」侧栏页（`packages/app/src/components/session/session-context-tab.tsx`：总 token、缓存、费用、上下文占比估算、原始消息 JSON、导出） | 有，但不是逐步时间线；用户截图确认 oco 面板中可以打开 |

结构：一条助手消息恰好是一次模型调用（每条 assistant message 的 step-start 最多 1 个；578 条助手消息）。所以 轮次 = 用户消息，调用 = 助手消息，步骤内容 = reasoning/text/tool part。

## 需要推导的数据

- part ID 编码了毫秒时间戳（`packages/opencode/src/id/id.ts:51-77`，`ts*4096+counter` 取低 48 位，约 795 天回绕，可用 `message.time.created` 对齐高位）。step-start / step-finish 本身没有 time 字段，用 ID 时间代替。
- 抽样一次真实调用（2 个 webfetch）：step-start +238 ms，首个 reasoning +453 ms，text 922–1261 ms，工具 1104–1493 / 1233–2092 ms，step-finish +2094 ms，输出 140 tok。
- 首 token 延迟 ≈ 首个 reasoning/text 的 start − `message.time.created`；生成时长 ≈ 首 token 到 max(text/reasoning end, 工具 start)；吞吐 = 输出 token / 生成时长。step-finish 要等工具执行完，不能直接用 step 区间算吞吐。

## 拿不到的数据

- 实际发出的系统提示词、工具定义、运行时注入的提醒：运行时组装（`session/llm.ts`、`session/system.ts`、`reminders.ts`），不落盘。只有用户自定义的 `UserMessage.system` 会存。合成文本（附件内容等）以 `synthetic: true` 的 text part 存储，可以显示。
- 原始 HTTP 请求/响应：不落盘。只能靠插件钩子（`experimental.chat.system.transform`、`chat.params`、`chat.headers`，见 `packages/plugin/src/index.ts:247-291`）记录，属于 experimental API，且要往 OpenCode 里加插件。

## 宿主侧

- 只读 GET 已放行，子会话经 parent 校验放行（`apps/extension/src/bridge-policy.ts:22,63-72`）。只读轨迹不需要改宿主策略。
