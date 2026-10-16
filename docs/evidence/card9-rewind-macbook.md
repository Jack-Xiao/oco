# 卡 9 MacBook 会话交叉验证（2026-10-16）

- 这是 MacBook 上由规划会话 07:39 派出的卡 9 会话留下的记录。卡 9 本体由 Mac mini 会话先完成（分支 `claude/card9-rewind`，提交 1a6789a，07:42），主记录见 [card9-rewind](card9-rewind.md)；本会话发现重复后停止自己的路线，把 1a6789a / e9ce24d cherry-pick 进 main（83624b8 / a4d2c64），本文件只保留独立核对、交叉验证与委派记录。
- 结论一致：上游 1.18.33 已在每条用户消息的悬停操作行渲染「Revert message / 撤销此消息」，嵌入模式可用，不加补丁 0026。

## 调查结论（主线程 grep，07:40–07:48）

| 环节 | 位置 | 事实 |
| --- | --- | --- |
| 按钮 | `packages/session-ui/src/components/message-part.tsx` `UserMessageDisplay`（约 1396 行） | `<Show when={props.actions?.revert}>` 渲染 `MessageActionButton icon="reset"`，`aria-label` = `ui.message.revertMessage`（en "Revert message" / zh "撤销此消息"）；补丁 0011 的 fork 按钮紧接其后，同在 `[data-slot="user-message-copy-wrapper"]` 一行里 |
| 可见性 | `message-part.css` 162–213 行 | 该行 `opacity: 0`，消息容器 `:hover` / `:focus-within` 时为 1（和 fork、copy 按钮同一规则，c3-fork 已证明可悬停点击） |
| 传递 | `pages/session.tsx` 1989 行 `actions = { revert, fork, forkResponse, openAttachment }` → 2184 行 `<MessageTimeline actions={actions}>` → `message-timeline.tsx` 1188 行 `<Message actions={props.actions}>` → `message-part.tsx` 953 行 `<UserMessageDisplay actions={props.actions}>` | 无条件传递，与是否嵌入、是否 V2 布局无关 |
| 调用链 | `pages/session.tsx` 1861–1920 行 | `revert()` → `revertMutation`：乐观 `roll(sessionID, { messageID })` + 把该条消息文本放回 composer（`prompt.set(draft(messageID))`），请求 `halt(sessionID)`（运行中先 interrupt）→ `session.revert.stage({ sessionID, messageID })` = `POST /session/:id/revert`；失败回滚 |
| 与 `/undo` 的关系 | `pages/session/use-session-commands.tsx` 338–366 行 | `/undo` 走同一个 `session.revert.stage`，只是 messageID 固定取最后一条可见用户消息；按钮等价于「对任意一条用户消息执行 /undo」 |
| 回退 dock | `pages/session.tsx` 1927 行 `rolled()` = 从回退点起的用户消息 → 2250 行 `revert: () => ({ items: rolled(), onRestore: restore })` → `session-composer-region.tsx` → `session-revert-dock.tsx` | 每条带 Restore（`restoreMutation`：恢复该条及之前；若是最后一条则 `revert.clear` = `POST /session/:id/unrevert`） |

c27(b) 结论的来源：mini 的提示词让它在 `packages/app` 里 grep `roll(` 的调用者，按钮却在 `packages/session-ui` 包里，跨包没有追到；c27 的 revert 用例因此直接用 `/undo`，没有悬停消息。c27 的文件头注释已更正。

## 交叉验证（Mac mini `mini-card9`，07:49–07:52）

- 基线 main 398a45e + 提示词 `docs/mini/card9.md`（1a1aa18）；Sonnet 独立写的 3 用例变体 `c29-rewind`（回退首条用户消息），最终 run `docs/evidence/runs/20261015-235116-c29-rewind-bc7e/results.json` 3/3 PASS：rewind-button（revert / fork 各 1，dock「2 rolled back messages」，服务端 revert.messageID = 首条用户消息，composer 回填 RW-1）、rewind-row（两按钮 24×24，y 相同，dy=0）、rewind-restore（展开后 2 个 Restore，点最后一条一次恢复全部）。首个有效 run 235056 因 dock 乐观渲染后立即读服务端而 FAIL，改为轮询后通过（测试侧）。回归 c27-docks 2/2（235134）、c3-fork 4/4（235153）。详见 [mini-card9](mini-card9.md)。
- 只取其 evidence 与 5 个 results.json。它的提交 6587556（`mini/card9`）把整个被忽略的 `docs/evidence/runs/` 1816 个历史文件 `git add -f` 进去了，不合入；它的 c29 变体文件也不合入（与 1a6789a 的 4 用例版同路径，后者多 busy-revert 用例）。
- 任务结束时残留的测试服务器（`scripts/test-server.sh` 48335、mock-llm 48346、opencode 48348，端口 4517 / 4518）由本会话按 PID 停止；临时 ref `card9-src` 已删。

## 重复与协调

- 时间线：Mac mini 会话的 c29 两次运行在 07:12 / 07:36（run id 为 UTC），提交 07:42–07:44 只在 mini 本地分支；规划会话 07:39 按 main 398a45e 派出本会话，看不到认领。本会话 07:49 派 `mini-card9` 时 dispatch 把 `oco-mini` worktree 重置并 `bun run setup && bun run build`，而 Mac mini 会话 07:39:56 起的 `--real` 批次正用 `~/oco-bin/opencode` 跑 oco-mini 里的 vendor（第 4 项 c4-trajectory 约在此时运行）：若该项异常，先怀疑这次重置。
- 教训：认领标记只写在 mini 分支的 NEXT 上，MacBook 看不到；已在 NEXT §0 加「开工前先看 Mac mini 当前分支 / 最近提交」。
- 语义说明（不改）：上游按钮对最后一条用户消息也显示（= `/undo`）；运行中点击先 interrupt 再回退（与 `/undo` 一致）；Claude Code 的 rewind 可分别回退对话 / 文件，OpenCode 一次做两件事，恢复走 dock 的 Restore。

## 委派记录

| task_id | 唯一写入范围 | requested_route | actual_provider/model | agent_id/run_id | 状态 | 结果路径 | fallback_reason / 接手理由 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 上游调用链核对 | 只读（结论写入本文件） | 主线程 | — | — | 已返回 | 本文件「调查结论」 | §0 点名的开工检查，约 12 次 grep / sed，未达委派门槛 |
| mini-card9（c29 变体 + 回归） | tests/e2e/c29-rewind.mjs、docs/evidence/mini-card9.md、docs/evidence/runs/ | Mac mini dispatch（run-task 默认 sonnet） | claude/sonnet（mini 本机） | tmux mini-card9，提交 6587556 | 验收通过（3/3 + c27 2/2 + c3 4/4，07:49–07:52）；与 1a6789a 重复，只取证据 | docs/evidence/mini-card9.md、docs/evidence/runs/20261015-2350xx–2351xx | — |
| 补丁 0026（Gemini 实现） | vendor/opencode | gemini-worker | — | — | 未派 | — | 入口已存在，两条独立 E2E 证实，不加补丁 |
| Mac mini 会话的卡 9（非本会话派发） | 分支 claude/card9-rewind | Grok 调查 + Sonnet 子代理 E2E（见其记录） | 见 card9-rewind.md | run-mva5erik-lsjk95 等 | 已 cherry-pick 进 main | docs/evidence/card9-rewind.md | — |
