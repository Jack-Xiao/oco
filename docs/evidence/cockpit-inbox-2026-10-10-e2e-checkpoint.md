# E2E Checkpoint: c6-inbox (2026-10-10)

- **Task**: Write E2E test `tests/e2e/c6-inbox.mjs` and update `tests/e2e/lib/mock-llm.mjs`, `tests/e2e/run.mjs`.
- **Scope**:
  - `tests/e2e/c6-inbox.mjs` (created)
  - `tests/e2e/lib/mock-llm.mjs` (added `THREE-SUBAGENTS-NEED-PERMISSION` token branch)
  - `tests/e2e/run.mjs` (appended "c6-inbox" to DEFAULT_SUITES)
  - `docs/evidence/cockpit-inbox-2026-10-10-e2e-checkpoint.md` (checkpoint)
- **Status**: Completed.
  - `node --check tests/e2e/c6-inbox.mjs`: PASS
  - `node --check tests/e2e/lib/mock-llm.mjs`: PASS
  - `node --check tests/e2e/run.mjs`: PASS
  - `node -e` import and verify `plan(body)` token resolution: PASS
  - Test server connectivity check (60s poll): 服务器未就绪，未运行 (fetch failed)
- **Notes**:
  - `mock-llm.mjs` 已改，需重启测试服务器后场景才生效。
