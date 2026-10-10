# Cockpit Result Card Store Checkpoint

- **Task**: Record latest run summary (`FileChange[]`, `durMs`, `costUsd`, `tokens`, `lastText`) in `SessionStore` and populate `inbox()` done/error rows.
- **Writable Files**:
  - `apps/extension/src/session-store.ts`
  - `tests/unit/session-store.test.ts`
  - `docs/evidence/cockpit-result-card-2026-10-10-store-checkpoint.md`
- **Subgoals & Progress**:
  1. [x] Read source files, tests, and evidence contracts.
  2. [x] Verify baseline tests (`bun test` 39 passed).
  3. [x] Edit `apps/extension/src/session-store.ts`:
     - Injectable clock in constructor: `now: () => number = () => Date.now()`
     - Row fields: `files`, `runStart`, `runEnd`, `assistantMessages`, `messageMetrics`, `lastText`, `lastPart`
     - Handlers for `session.status` (busy / idle), `session.idle`, `message.updated`, `message.part.updated`, `message.part.delta`, `session.diff`
     - Snapshot retention with bounds (500)
     - `inbox()` formatting for done and error rows
  4. [x] Unit tests added to `tests/unit/session-store.test.ts`:
     - busy→message.updated→part.updated→delta→session.diff→idle 后 done 行 summary/detail/result/aria
     - 新一轮 busy 清空上一轮（files 保留）
     - 用户消息 text part 与 delta 被忽略
     - delta 换 partID 时重新开始
     - message.* 与 session.diff 返回 false，session.idle 返回 true
     - snapshot 保留摘要
     - summary 各种缺失组合回退（含 <$0.01、1 file、4m12s、1h02m、80 字符截断加 …、Finished）
     - error 行保留错误 summary 并追加 result
     - retry 不开启新一轮，durMs 跨 busy/retry 到 idle 保持连续统计
     - token 分项加和回退（input+output+reasoning+cache.read+cache.write）
  5. [x] Verification:
     - `bun test tests/unit/session-store.test.ts tests/unit/sessions-view.test.ts tests/unit/session-groups.test.ts` -> 50 passed, 0 failed.
     - `bun run typecheck` (`tsc -p packages/contracts && tsc -p apps/extension --noEmit`) -> passed (exit code 0).
- **Status**: Completed.
