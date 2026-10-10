# Checkpoint: sidebar done/error inbox actions

- 时间：2026-10-10
- 范围：侧栏收件箱 kind "done" / "error" 行动作按钮，并把 markRead 接到宿主。
- 唯一写入：`apps/extension/media/sessions-list/index.js`、`apps/extension/media/sessions-list/*.css`、`apps/extension/src/sessions-webview.ts`、`apps/extension/src/sessions-view.ts`、`tests/unit/sessions-view.test.ts`、本文件。不改 `session-store.ts`。
- 计划：
  1. 读 `createInboxRow` / `updateInboxRow`、inbox CSS、FromPage、`UnreadTracker.clear`、现有单测构造。
  2. `index.js`：done 三按钮 Open/Diff/Mark read；error 两按钮 Open/Diff；`data-action`。
  3. CSS：done/error 动作区默认隐藏，hover / focus-within / .current 显示。
  4. `sessions-webview.ts`：`openReview` → `oco.openSessionReview`；`markRead` → `this.list.markRead`。
  5. `sessions-view.ts`：`markRead` 调 `unread.clear`，有变化则写 memento 并 `refresh()`。
  6. 单测：清未读并写 memento；重复返回 false；`webModel()` inbox 不再含该 done 行。
  7. 验收：`bun test tests/unit/sessions-view.test.ts tests/unit/session-groups.test.ts` 与 `bun run typecheck`。
- 进度：实现完成。验收通过。
- `bun test tests/unit/sessions-view.test.ts tests/unit/session-groups.test.ts`：23 pass，0 fail，135 expect，约 199ms。
- `bun run typecheck`：exit 0（`tsc -p packages/contracts && tsc -p apps/extension --noEmit`）。
- 未跑：侧栏页面脚本未在浏览器或 VS Code 里点按；E2E 不在本批验收里。
- provider/model：Grok 4.7。
- provider/model：Grok（grok-4.7，本任务执行者）；未知项写 unknown。
