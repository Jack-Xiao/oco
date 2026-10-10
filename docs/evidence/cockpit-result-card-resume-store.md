# cockpit result card — user summary.diffs → run files

## Checkpoint

- 范围：侧栏每会话最近运行 files 来自 user `message.updated` 的 `info.summary.diffs`（file/additions/deletions/status，不存 patch）。新 busy 清除上一轮 authoritative 摘要。摘要可在 idle 之后到达，`applyEvent` 在 files 变化时返回 true。旧 user 按 `time.created` 再 `id` 不覆盖新轮。未知会话、无 summary、非法 diff 不改 files。assistant 计费/文本不动。`session.diff` 仍作兼容，但不能覆盖 authoritative user 摘要。
- 写入：`apps/extension/src/session-store.ts`、`tests/unit/session-store.test.ts`、本文件。不改上游补丁与 c7。
- 上游事实：`summary.ts` summarize 先 `publish(Session.Event.Diff, diff: [])`，再 `target.info.summary.diffs = msgDiffs` 且 `updateMessage`（role=user）。排序同 `message-v2.ts` `isAfter`：`time.created`，相等再比 `id`。
- 状态：单测与 typecheck 已通过。未跑全量 unit、未启动服务或 VS Code。


## 2026-10-10 顺序缺口

- 主线程发现缺陷数：1
- 缺陷：每个新 busy 无条件 seal 最新 `summaryWatermark`。上游先 `createUserMessage`（常无 summary）再 busy 时，同 id 稍后的 summary 被当成旧消息拒绝，文件数缺失。
- 修复：`idle`（busy/retry → idle）把当前 watermark id 写入 `completedUserId`；新 busy 只 seal 该 id。idle 之后才到的无 summary 新 user 不记入。不比较宿主 `now` 与 server timestamp。snapshot 保留 `completedUserId`。
- 单测：`user(无summary)→busy→同user summary→idle`；`previous idle→新user(无summary)→busy→新summary`。旧 user 晚到仍过。
- 验证：`bun test tests/unit/session-store.test.ts` → 35 pass, 0 fail。未跑 E2E。

委派台账见 [本批证据](cockpit-result-card-2026-10-10.md#codex-接续验收2026-10-10)，本文件仅为 checkpoint。
