# 后台任务 ID ↔ 子会话映射调查（M4 第二批前提）

日期 2026-10-04。执行：主线程（Grok 402 额度耗尽、Gemini Antigravity 资格检查 EOF，见 [委派记录](delegation-runtime-m4.md)）。
来源：`~/.cache/opencode/packages/oh-my-openagent/node_modules/oh-my-openagent/dist/index.js`（只读 grep；行号为该文件当前版本）。未查用户数据库。

## 结论

能可靠对上，不需要按时间猜。

- **派发**：后台派发的工具调用在 `state.metadata` 里同时带 `backgroundTaskId`（`bg_…`）和 `sessionId`（`ses_…`），另有 `agent`、`description`、`run_in_background`、`model`、`prompt`。见 132483–132494 行和续跑分支 131390–131405 行。
  - `sessionId` 只在派发时子会话已经建好才有（`...sessionId ? {taskId, sessionId} : {}`），所以可能缺。
  - 工具输出文本末尾另有一段 `session_id: … / background_task_id: … / subagent: …`（`buildTaskMetadataBlock`，107415 行）。metadata 缺字段时可以从这里正则提取。
- **取回**：主代理用 `background_output` 工具取回结果（128262 行）。
  - `input.task_id` 是 `bg_…`，不是会话 ID。
  - 工具一开始就把 `metadata.backgroundTaskId`、`agent`、`description` 和 `sessionId`（如果有）写进去（128283–128292 行）。
- **重试**：重试会换新的子会话。通知里写 `Failed session: ses_…`（旧会话），`ID` 仍是同一个 `bg_…`（141355–141370 行）。
  - 所以映射的主键要用 `backgroundTaskId`，子会话 ID 取最新出现的那个。
- **通知**：完成、出错、重试都通过 `<system-reminder>[BACKGROUND TASK …]` 注入到主会话的用户消息里。正文带 `bg_…`，失败时带旧 `ses_…`。可以作为状态来源，但它是文本，解析要容错。

## 映射链（第二批实现用）

1. 派发：tool part 的 `metadata.backgroundTaskId` → 这是一个后台任务；`metadata.sessionId`（或输出文本里的 `session_id:`）→ 子会话。
2. 状态：子会话的 `session_status` 和消息（现有 `childLifecycleOf`）。
3. 取回：同一个主会话里，`background_output` 的 `input.task_id` 等于该 `bg_…`，且该 tool part 完成 → 已取回；它所在的请求就是「第几次请求取回」。
4. 重试：同一个 `bg_…` 出现新的 `sessionId` 时，换成新会话；旧会话标为失败的一次尝试，不另算一个子代理。

## 对现有代码的影响

- `session-runtime-model.ts` 现在用 `part.state.input.background === true` 判断后台。这个插件的参数名是 `run_in_background`，而且 `metadata.backgroundTaskId` 更可靠，第二批要改。
- `background_output` 现在被当成普通工具，界面上直接显示 JSON 输入；第二批要把它归到对应子代理名下，作为「取回」动作。

## 未查项

- 没有用用户数据库核对真实 part，结论只来自插件源码。第二批开工时，用 mock 或一次真实后台派发核对一遍字段。
- 插件里另一条 `call_omo_agent` 路线没有查。
