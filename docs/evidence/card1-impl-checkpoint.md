# Checkpoint 3: Card1 Implementation

- **Task**: Allow git worktree sessions' pending permission, question, and busy states to enter sidebar inbox and status bar count.
- **Status**: Complete and fully verified.
- **Changed files**:
  - `apps/extension/src/session-feed.ts`
  - `apps/extension/src/session-store.ts`
  - `apps/extension/src/sessions-webview.ts`
  - `apps/extension/src/extension.ts`
  - `tests/unit/session-feed.test.ts`
  - `tests/unit/session-store.test.ts`
- **Verification**:
  - `bun run typecheck`: 0 errors
  - `bun run test:unit`: 302 pass, 0 fail (2669 expect calls across 20 files)
  - `bun run build`: Success (esbuild output 188.7kb, webview assets built)
- **Budget**: Turn 26 / 30.
