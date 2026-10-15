# 卡 9 M04 回退入口（2026-10-16）

- 范围：Claude Code「回退到检查点」的等价物在 oco 嵌入模式是否可用；按 NEXT §0b 卡 9，只有在 c27(b) 的结论（嵌入模式没有逐条消息的回退入口）成立时才加补丁 0026。
- 基线：main `398a45e`（vendor v1.18.33 `51ef4be` + 补丁 0001–0025）。

## 调查结论（主线程 grep，2026-10-16 上午）

c27(b) 的结论**不成立**：上游 1.18.33 已经在每条用户消息的悬停操作行里渲染逐条回退按钮，嵌入模式没有被任何补丁关掉。

| 环节 | 位置 | 事实 |
| --- | --- | --- |
| 按钮 | `packages/session-ui/src/components/message-part.tsx` `UserMessageDisplay`（约 1396 行） | `<Show when={props.actions?.revert}>` 渲染 `MessageActionButton icon="reset"`，`aria-label` = `ui.message.revertMessage`（en "Revert message" / zh "撤销此消息"）；补丁 0011 的 fork 按钮紧接其后，同在 `[data-slot="user-message-copy-wrapper"]` 一行里 |
| 可见性 | `message-part.css` 162–213 行 | 该行 `opacity: 0`，消息容器 `:hover` / `:focus-within` 时为 1（和 fork、copy 按钮同一规则，c3-fork 已证明可悬停点击） |
| 传递 | `pages/session.tsx` 1989 行 `actions = { revert, fork, forkResponse, openAttachment }` → 2184 行 `<MessageTimeline actions={actions}>` → `message-timeline.tsx` 1188 行 `<Message actions={props.actions}>` → `message-part.tsx` 953 行 `<UserMessageDisplay actions={props.actions}>` | 无条件传递，与是否嵌入、是否 V2 布局无关 |
| 调用链 | `pages/session.tsx` 1861–1920 行 | `revert()` → `revertMutation`：乐观 `roll(sessionID, { messageID })` + 把该条消息文本放回 composer（`prompt.set(draft(messageID))`），请求 `halt(sessionID)`（运行中先 interrupt）→ `session.revert.stage({ sessionID, messageID })` = `POST /session/:id/revert`；失败回滚 |
| 与 `/undo` 的关系 | `pages/session/use-session-commands.tsx` 338–366 行 | `/undo` 走同一个 `session.revert.stage`，只是 messageID 固定取最后一条可见用户消息；按钮等价于「对任意一条用户消息执行 /undo」 |
| 回退 dock | `pages/session.tsx` 2250 行 `revert: () => rolled().length > 0 ? { items: rolled(), onRestore: restore }` → `session-composer-region.tsx` → `session-revert-dock.tsx` | 回退后 dock 列出从回退点起的用户消息，每条带 Restore（`restoreMutation`：恢复该条及之前，若是最后一条则 `revert.clear` = `POST /session/:id/unrevert`） |

推断 c27 结论来源：mini 的提示词让它在 `packages/app` 里 grep `roll(` 的调用者，按钮却在 `packages/session-ui` 包里，跨包边界没有追到；c27 的 revert 用例因此直接用 `/undo`，没有尝试悬停消息。

语义对照 Claude Code：Claude Code 的 rewind 分「只回退对话 / 只回退文件 / 两者」；OpenCode 的 revert 一次做两件事（服务端同时回滚消息与快照），恢复用 dock 的 Restore。上游按钮对最后一条用户消息也显示（等于 `/undo`），运行中点击先打断再回退（和 `/undo` 一致）；本卡不改这两个行为。

## 委派记录

| task_id | 唯一写入范围 | requested_route | actual_provider/model | agent_id/run_id | 状态 | 结果路径 | fallback_reason / 接手理由 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 上游调用链核对 | 只读（结论写入本文件） | 主线程 | — | — | 已返回 | 本文件「调查结论」 | §0 固定做法「先 grep 上游 roll( / session.revert / /undo 确认调用参数」是本卡点名的开工检查，约 12 次 grep / sed，未达委派门槛 |
| card9（E2E c29-rewind + 回归） | tests/e2e/c29-rewind.mjs、docs/evidence/mini-card9.md、docs/evidence/runs/ | Mac mini dispatch（run-task 默认 sonnet） | 待补 | 待补 | 计划 | docs/evidence/mini-card9.md | — |
| 补丁 0026（Gemini 实现） | vendor/opencode（session-ui message-part）| gemini-worker | — | — | 未派 | — | 调查表明入口已存在；只有 Mac mini 实测证明按钮在嵌入模式不可用时才派 |
