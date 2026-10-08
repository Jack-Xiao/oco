# Runtime view M5 (ring cycle + centre card + three docks): implementation evidence

Plan: [2026-10-08-runtime-m5-ring.md](../superpowers/plans/2026-10-08-runtime-m5-ring.md). Mockup: [runtime-m5-animated-mockup.html](../superpowers/specs/runtime-m5-animated-mockup.html). Branch `claude/nostalgic-gates-ef74ca`, uncommitted base (on top of 98dda03 plus the 10-07 D1–D4 fixes); backup in scratchpad `backup-pre-m5/`.

## Delegation record

Route: the user enabled ultracode and asked for execution, so Tasks 1–14 are implemented by Claude Workflow agents. The main thread does the plan decisions (D18 changed to not use red; all other open questions use the defaults), reviews each wave gate, and runs Task 15 (patch, clean replay, build, install, real-data check).

| task_id | Write scope (exclusive) | requested_route | actual_provider/model | agent_id/run_id | Status | Result path | fallback_reason |
| --- | --- | --- | --- | --- | --- | --- | --- |
| m5-plan | Plan document, mockup | Claude Workflow | Claude / inherited | wf_b2065b60-57d | Passed acceptance: 15 tasks; review "revise" → revised once; main-thread review changed D18 | Plan path | Route specified by user |
| m5-impl | Each task's files per the plan's file ownership table (Tasks 1–14) | Claude Workflow | Claude / inherited | wf_9af8ca23-fa8 | Stopped (user asked to commit then stop): Wave0 T1/T2 done, gate passed; Wave1a T3/T4/T6/T7 done, first gate failed (T6 broke D18), T6 fixed, re-check not finished; later waves not started | This file | Route specified by user |
| m5-t1 | `session-runtime-i18n.ts`, `session-runtime-i18n.test.ts` | Claude Workflow (wave 0) | unknown | part of wf_9af8ca23-fa8 | Planned | This file | Route specified by user |
| m5-t2 | `session-runtime-ring-types.ts`, `docs/superpowers/specs/runtime-m5-mockup.src.html`, `test-browser/solid-jsx-preload.ts`, `test-browser/session-runtime-ring-jsx-smoke.test.tsx`, `package.json` (`test:browser` line only), this file | Claude Workflow (wave 0) | Claude / inherited | part of wf_9af8ca23-fa8 (agent id unknown) | Returned; see "Task 2" below | This file | Route specified by user |
| m5-t3 | `session-runtime-model.ts`, `session-runtime-model.test.ts`, `session-runtime-model-bg.test.ts`, `session-runtime-child-sync.ts`, `test-browser/session-runtime-child-sync.test.ts` | Claude Workflow (wave 1) | unknown | part of wf_9af8ca23-fa8 | Planned | This file | Route specified by user |
| m5-t4 | `fixtures/runtime-m5-session.json`, `fixtures/runtime-m5-oracle.json`, `session-runtime-ring.fixture.ts`, `session-runtime-ring-fixture.test.ts`, `scripts/runtime-m5-oracle.mjs` | Claude Workflow (wave 1) | unknown | part of wf_9af8ca23-fa8 | Planned | This file | Route specified by user |
| m5-t5 | `session-runtime-ring.ts`, `session-runtime-ring.test.ts`, `session-runtime-ring-perf.test.ts`, `session-runtime-ring-perf.fixture.ts` | Claude Workflow (wave 1) | unknown | part of wf_9af8ca23-fa8 | Planned | This file | Route specified by user |
| m5-t6 | `session-runtime-ring-sub.ts`, `session-runtime-ring-sub.test.ts` | Claude Workflow (wave 1) | unknown | part of wf_9af8ca23-fa8 | Planned | This file | Route specified by user |
| m5-t7 | `session-runtime-ring-track.ts`, `session-runtime-ring-track.test.ts`, `session-runtime-ring-track-view.tsx`, `session-runtime-playback.ts`, `session-runtime-playback.test.ts` | Claude Workflow (wave 1) | unknown | part of wf_9af8ca23-fa8 | Planned | This file | Route specified by user |
| m5-t8 | `session-runtime-ring-geo.ts`, `session-runtime-ring-geo.test.ts` | Claude Workflow (wave 1) | unknown | part of wf_9af8ca23-fa8 | Planned | This file | Route specified by user |
| m5-t9 | `session-runtime-ring-view.tsx`, `test-browser/session-runtime-ring-view.test.tsx` | Claude Workflow (wave 2) | unknown | part of wf_9af8ca23-fa8 | Planned | This file | Route specified by user |
| m5-t10 | `session-runtime-ring-sub-view.tsx`, `test-browser/session-runtime-ring-sub-view.test.tsx` | Claude Workflow (wave 2) | unknown | part of wf_9af8ca23-fa8 | Planned | This file | Route specified by user |
| m5-t11 | `session-runtime-ring-keyframes.test.ts`, `session-runtime-ring-frame-perf.test.ts` | Claude Workflow (wave 2) | unknown | part of wf_9af8ca23-fa8 | Planned | This file | Route specified by user |
| m5-t12 | `session-runtime.tsx`; deletes `session-runtime-mechanism-view.tsx`, `session-runtime-loop-view.tsx`, `session-runtime-child.tsx`; loop-view part of `session-runtime-loop.test.ts`; `session-runtime-mechanism.ts` and its test once unreferenced | Claude Workflow (integrate) | unknown | part of wf_9af8ca23-fa8 | Planned | This file | Route specified by user |
| m5-t13 | `tests/e2e/c5-runtime.mjs`, `tests/e2e/lib/mock-llm.mjs` (main thread reads results.json only) | Claude Workflow (wave 2 write, wave 4 run) | unknown | part of wf_9af8ca23-fa8 | Planned | This file | Route specified by user |
| m5-t14 | `scripts/look-local.mjs` | Claude Workflow (wave 2) | unknown | part of wf_9af8ca23-fa8 | Planned | This file | Route specified by user |
| m5-t15 | `patches/opencode/0019-oco-runtime-view.patch`, `docs/STATUS.md`, `docs/PROGRESS.md`, `docs/NEXT.md`, this file | Main thread | Claude / inherited | unknown | Planned | This file | Main-thread task in the plan (patch, replay, build, install) |

## Task 2: contract, mockup source, test-browser JSX preload, perf baseline (2026-10-08)

All commands from `vendor/opencode/packages/app` unless noted. Raw outputs were kept in the session scratchpad and are not in the repo.

- **Contract.** `src/components/session/session-runtime-ring-types.ts` is the plan's 契约 code block (plan lines 223-449) extracted byte for byte with `sed`, 227 lines; line 1 is the `// oco (patches/opencode/0019): M5 runtime ring — shared contract…` header. `bun run typecheck` exit 0 with 0 `error TS` lines in the whole package (so `grep -E 'session-runtime-ring-types'` prints nothing). I re-ran it after Task 1's `ring.*` keys appeared in `session-runtime-i18n.ts`. Again exit 0 with 0 errors, and nothing for `session-runtime-ring-types`.
- **Mockup source.** `docs/superpowers/specs/runtime-m5-mockup.src.html` copied with `cp` from the scratchpad `m5/frames/final/_src/mockup.src.html`; `wc -l` 1666; sha256 `03fbe5179e8ca3ce5ae5b1b58cbbb8158495be964d390da1549d94a356b91035` (same as the source); `cmp` identical.
- **JSX preload.** `test-browser/solid-jsx-preload.ts` is the plan's snippet plus the required header line. `package.json` changes only the `test:browser` line, to `bun test --conditions=browser --preload ./happydom.ts --preload ./test-browser/solid-jsx-preload.ts ./test-browser`. Dependencies, other scripts, `bunfig.toml` and the lockfile are unchanged. Smoke test: `test-browser/session-runtime-ring-jsx-smoke.test.tsx`, one test. It mounts a JSX component with `createSignal` and `<For>`, asserts 3 `<li>`, clicks the button, asserts `data-oco-smoke` goes from 0 to 1, then disposes and removes the host.

  | Run | Result |
  | --- | --- |
  | `bun run test:browser` before the change (same day, shared tree) | 48 pass / 0 fail, 16 files |
  | `bun run test:browser` after the change | 49 pass / 0 fail, 17 files (48 + 1 smoke) |
  | Smoke file with the preload | 1 pass / 0 fail |
  | Smoke file without the preload (negative control) | 0 pass / 1 fail: `ReferenceError: React is not defined` (fact 11 reproduced) |

  The preload works, so the plan's fallback (moving Task 9/10 component assertions to E2E) is not needed.
- **Perf baseline.**
  - `bun test --conditions=solid --preload ./happydom.ts ./src/components/session/session-runtime-perf.test.ts` → 1 pass / 0 fail. The 5 rounds' median assemble time is 0.62 ms and the p95 is 1.66 ms; the test prints this p95 as the median of the per-round p95s. Round p95s: 0.92, 1.50, 1.66, 2.36, 3.76 ms. Triggers per delta: 1.
  - `bun run test:bench`, unit half (`bun test ./e2e/performance/unit`) → 43 pass / 0 fail, 11 files.
  - `bun run test:bench`, Playwright half (`playwright test --config e2e/performance/playwright.config.ts`) → **BLOCKED**. Its `webServer` runs `bun run build && bun run serve -- --host 0.0.0.0 --port 3000`, and the app points at the OpenCode server on `127.0.0.1:4096` (`playwright.config.ts` default `PLAYWRIGHT_SERVER_PORT`). That port is the user's own running OpenCode, which this batch must not touch. Running it would also bind 0.0.0.0:3000 and write a production build into the vendor tree. The Chromium browsers are installed, so they are not the blocker. To run it, start an isolated OpenCode server on another port and set `PLAYWRIGHT_SERVER_PORT` and `PLAYWRIGHT_PORT`.
