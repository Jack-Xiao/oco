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
| m5-t15 | `patches/opencode/0020-oco-runtime-view.patch`, `docs/STATUS.md`, `docs/PROGRESS.md`, `docs/NEXT.md`, this file | Main thread | Claude / inherited | unknown | Planned | This file | Main-thread task in the plan (patch, replay, build, install) |

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

## Batch 2 (2026-10-08, continuation after the stop): delegation record

Route checks (AGENTS rule 2): Grok `grok-build:check` → ready (grok 1.0.34, logged in, under 10 s). Gemini `gemini-worker` minimal request → failed after 24 s: `Eligibility check failed: UNAVAILABLE (code 503)`. Gemini is not used in this batch; every Gemini-first task carries `fallback_reason: Gemini route unavailable (503)`. The user asked the main thread to keep itself for the most important work and hand the rest to opus/sonnet/grok/gemini subagents by capability, with ultracode on, so the remaining tasks run as one Claude Workflow with per-task model tiers (opus for the ring module, the two views and integration; sonnet for geometry, keyframe tests, E2E rewrite and fix rounds). Task 14 (own file outside vendor) is dispatched to `grok-worker` first, Claude sonnet as fallback. Task 15 and the final acceptance stay on the main thread.

Main-thread checks before dispatch: `git -C vendor/opencode diff deb241e` is byte-identical to `patches/wip/runtime-m5-wip.patch` (44 files), so nothing had to be restored (NEXT step 1 done). Task 4 fixture spot check (NEXT step 2, main-thread part): `fixtures/runtime-m5-session.json` (96 KB) has no `/Users/`, e-mail or key-like string; 5 pseudo-random long strings (a todo tool output, a task result, a reasoning text, an abort error, a `find ~/.config/opencode …` command) contain only `~`-relative paths. PASS.

| task_id | Write scope (exclusive) | requested_route | actual_provider/model | agent_id/run_id | Status | Result path | fallback_reason |
| --- | --- | --- | --- | --- | --- | --- | --- |
| m5-b2-recheck | none (read-only gate for T3/T4/T6/T7, fix round by the owning task if needed) | Claude Workflow / opus | Claude / opus (gate and T6 fix round) | wf_d1bdd9ad-b6b | Passed after one fix round; ⊘ contract gap closed by the main thread (D18 row below) | this file | Gemini route unavailable (503) |
| m5-t5 | as above | Claude Workflow / opus | Claude / opus | wf_d1bdd9ad-b6b, then agent a1dc54d0 (perf reuse) | Accepted: 73/0 in its 5 files; gate items (perf headroom, uid/num comments) closed by D22 and the contract edit | this file | Gemini route unavailable (503); Grok kept for Task 14 only (user asked for capability-based assignment) |
| m5-t8 | as above | Claude Workflow / sonnet | Claude / sonnet | wf_d1bdd9ad-b6b | Accepted after one fix round: geo tests 34/0 | this file | same |
| m5-t9, m5-t10 | as above | Claude Workflow / opus | Claude / opus | wf_d1bdd9ad-b6b, then agent a8789a53 (D18 data layer, sonnet) | Accepted: ring-view 7/0, ring-sub-view 8/0 under test:browser | this file | same |
| m5-t11, m5-t13 (write) | as above | Claude Workflow / sonnet | Claude / sonnet | wf_d1bdd9ad-b6b | Accepted: 14 keyframes and frame-perf pass; E2E file parses and ran 43/43 later | this file | same |
| m5-t14 | `scripts/look-local.mjs` | `grok-worker` (inside the workflow), fallback Claude sonnet | grok-worker wrapper returned without starting Grok (no relay launcher line inside Workflow) → Claude / sonnet | wf_d1bdd9ad-b6b | Accepted with the mock trial NOT RUN; real-session run done by the main thread (12/14, see final section) | this file | Gemini route unavailable (503) |
| m5-t12 | as above | Claude Workflow / opus, three-lens gate (contract, UI, cleanup) | Claude / opus (T12 and the three gate lenses) | wf_d1bdd9ad-b6b, then agent a5fb9494 (D21 side table) | Accepted: typecheck 0, session unit 418/0, test:browser 65/0, grep checks empty | this file | plan assigns it to the main thread; main thread reviews the diff and owns acceptance (user asked to conserve main-thread tokens) |
| m5-t13 (run) | test-side fixes only | Claude Workflow / opus | Claude / opus | wf_d1bdd9ad-b6b (e2e-1, e2e-2), then agent aacd067f (final run) | Passed: en 43/43, zh 43/43, c4 17/17 on the final build | results.json under docs/evidence/runs | Gemini route unavailable (503) |
| m5-t15 | patch 0019, docs | main thread | Claude Fable 5.1 | this session | Done (final section below) | this file | main-thread task in the plan |

## Task 12: integration perf record and i18n cleanup (2026-10-08)

All commands from `vendor/opencode/packages/app`. Raw outputs were kept in the session scratchpad and are not in the repo. Machine: the local Mac, bun 1.3.10.

- **Perf tests, before and after integration.** Same command both times: `bun test --conditions=solid --preload ./happydom.ts ./src/components/session/session-runtime-ring-perf.test.ts ./src/components/session/session-runtime-ring-frame-perf.test.ts ./src/components/session/session-runtime-perf.test.ts` → 8 pass / 0 fail both times. "Before" is the run just before the Task 12 edits; the ring-perf and ring-frame-perf files did not exist at Task 2, so the Task 2 column has only the M4 assemble numbers. Each figure is a single run on a shared machine while other test runs were going in parallel. Ring-perf B moved by about 15–20% (full build 11.85 → 13.46 ms, root-dirty rebuild 11.25 → 13.52 ms); the other figures moved less. Every value stays far under budget: the frame p95 is at most 0.32 ms against 4 ms. Task 12 made no edits to the code these tests exercise.

  | Measure | Task 2 baseline | Before Task 12 | After Task 12 |
  | --- | --- | --- | --- |
  | ring-perf A: full build / frameAt (200 requests) | — | 3.112 / 0.042 ms | 3.554 / 0.067 ms |
  | ring-perf B: full build / incremental (1 child dirty) / root-dirty rebuild / frameAt | — | 11.849 / 0.243 / 11.254 / 0.020 ms | 13.458 / 0.227 / 13.522 / 0.022 ms |
  | ring-frame-perf p95 (budget 4 ms): fixture 1100x720 / scaleB 1100x720 | — | 0.054 / 0.266 ms | 0.065 / 0.320 ms |
  | ring-frame-perf p95: fixture 560x900 / scaleB 560x900 | — | 0.056 / 0.310 ms | 0.057 / 0.309 ms |
  | session-runtime-perf (M4 assemble) median / p95 | 0.62 / 1.66 ms | 0.65 / 1.44 ms | 0.65 / 1.49 ms |

- **Simulated live session (happy-dom, mock event stream).** A scratchpad-only test mounts the real `SessionRuntime` with the contexts (sync, sdk, server-sync, language, providers) replaced by module mocks. The store holds the Task 4 fixture (root and all children) plus a new live round at wall time: a user message and a streaming assistant message. `buildRingIndex` is wrapped by a module mock to count calls; nothing was added to `session-runtime.tsx`. `requestAnimationFrame` is replaced by a 16 ms timer that times each callback with `performance.now()`. The burst sends 600 events in 3.02 s (200 per second), each one appending to the streaming text part and calling the `sdk().event.listen` listener for the root session, then stays quiet for 1 s.
  - Rebuilds, run 1: 30 in the burst, 9.9 per second on average, at most 10 in any 1 s window (limit ≤ 10, `RING.REBUILD_MS` = 100). After the last event there was exactly one more rebuild, 71 ms later.
  - Rebuilds, run 2: 30 in the burst, 10.0 per second, at most 10 in any 1 s window, and one trailing rebuild 94 ms after the last event.
  - Script time per frame, run 1: 153 frames during the burst, p95 2.26 ms, max 6.56 ms. Over all 200 frames, including the quiet second, p95 is 3.04 ms.
  - Script time per frame, run 2: 151 frames during the burst, p95 3.17 ms, max 8.75 ms. Over all 197 frames, p95 is 3.31 ms.
  - In happy-dom the frame time covers `frameAt`, the reconcile into the store and the DOM updates.
  - Result: 1 pass / 0 fail on each run.
- **Real-browser spot check: NOT RUN.** The only OpenCode server running on this machine is the user's own, and this batch does not touch it. The Task 13 E2E, which starts its own server, belongs to the Task 13 run. The numbers above come from the happy-dom simulation, not from a browser Performance panel.
- **i18n cleanup (step 6).** The audit covered every literal key and every dynamic-prefix lookup in the `session-runtime*` sources, `pages/session.tsx`, the `test-browser/session-runtime*` files and the lookup code in `session-runtime-i18n.ts` itself. It found 21 old keys that nothing references, and they were removed from en, zh and zht together (63 lines): `title`, `lane.empty`, `detail.close`, `tool.awaiting`, `tool.interrupted`, `tool.background`, `tool.details_link`, `tool.state.{pending,running,completed}` and `tool.detail.{input,output,expand,collapse,start,end,duration,call_id,session_id,evidence,error}`.
  - The keys the plan protects are kept: `last.*`, `ago.*`, `replay.new`, `evidence.*`, `header.pending*`, `state.*` and `child.loading/sync_failed/retry`.
  - Still-used `tool.*` keys are kept: `tool.detail.unknown`, `tool.state.error` and `tool.cancelled`.
  - `detail.close` and `` lane.${lane} `` in `session-trajectory.tsx` read the separate trajectory dictionary, so they do not count as references.
  - In `session-runtime-model.ts`, `` `tool.${declined}` `` builds an event kind that is looked up as `` event.${kind} ``, not a runtime key, so `tool.` is not treated as a dynamic prefix.
  - The i18n test gives 13 pass / 0 fail, and full `bun run typecheck` exits 0. `zh` and `zht` are `Record<Key, string>`, so a removed key that was still referenced would fail the typecheck.
  - `ring.cap.pre` is defined in the plan's i18n table but is not referenced: `captionOf` in `session-runtime-ring.ts` (Task 5) returns `state.idle` for the `pre` stage. It is a new key, not an old one, so it is kept and only noted here.
- **Exit run after this round.**
  - `bun run typecheck` exits 0 (0 errors).
  - `bun test --conditions=solid --preload ./happydom.ts ./src/components/session` gives 410 pass / 0 fail in 22 files.
  - `bun run test:browser` gives 64 pass / 0 fail in 19 files. Per file in the junit report, `session-runtime-ring-view.test.tsx` has 7 tests and 0 failures, and `session-runtime-ring-sub-view.test.tsx` has 7 tests and 0 failures.
  - Both of the plan's grep checks print nothing.
  - The `SessionRuntime` name and props are unchanged.
  - The `pages/session.tsx` diff is identical to its hunk in `patches/wip/runtime-m5-wip.patch`, so Task 12 did not touch it.

### Batch 2 main-thread decisions and follow-ups (2026-10-08)

Workflow `wf_d1bdd9ad-b6b` returned after 32 agents (about 3 h 5 min): wave 1a recheck PASS (one T6 fix round, which handed the ⊘ glyph contract gap to the main thread); wave 1b gate left two T5 items for the main thread (perf headroom, uid/num comments); wave 2 PASS first time; integration gate PASS except the T5 perf flake after two fix rounds; `bun run build` PASS; E2E c5-runtime en 43/43 (`runs/20261008-145858-c5-runtime-88a4`), zh 43/43 (`runs/20261008-150154-c5-runtime-f809`), c4-trajectory 17/17 (`runs/20261008-150447-c4-trajectory-4b54`) after one product fix round (step parts missing in live data) and test-side fixes in `tests/e2e/c5-runtime.mjs`. Grok route for Task 14: the `grok-worker` wrapper inside the workflow never started Grok (it received no relay launcher line, so nothing ran); Task 14 was done by Claude sonnet instead (`fallback_reason: grok-worker relay not started inside Workflow`). Its mock-session trial run is NOT RUN until the main thread runs `look-local`.

Decisions:

- **Contract (Task 2 file, main thread):** `RingSub.uid` is always `${messageID}:${callID}` (D13 identity before and after `start`); `RingSub.num` is the task call's order within its round (`slot + 1`, plan L522). `RingSubAct` gains glyph `"⊘"` and border `"faint"` for declined rows (D18) so the view no longer infers them from `✗ + line-strong`. Data layer and view updated by a sonnet agent: ring-sub + keyframes tests 56/0, `test:browser` 65/0, typecheck 0.
- **Perf (T5 follow-up, opus):** full rebuilds now reuse settled requests from `prev` by messageID (root-dirty rebuild at scale B 12.0 → 2.7 ms p95; cold full build unchanged at about 12 ms); chained-rebuild equality test added (8 instants, `toStrictEqual` against a fresh build). **D22:** the perf test limits become 2× the unloaded p95 (cold full A 8 ms / B 32 ms, root-dirty with prev 8 ms, child-dirty 4 ms, frame 1 ms) so a loaded machine does not flake them; D11's 4 ms live target is met by the recorded numbers, not asserted.
- **D21 (send time without step parts):** the app's sync layer drops `step-start`/`step-finish` parts at 4 points (`global-sync/event-reducer.ts` ~313, `server-session.ts` ~626/~1094/~1322), so live and reopened sessions had no `stepStart` and the E2E fix made `asm` last until the first token (`fly` never shown). Investigation (opus, read-only, `scratchpad/m5-logs/step-parts-investigation.md`): using the assistant message's `created` is wrong (it rewrites `stepStart` after the fact); recording step times in a side table at the 4 drop points keeps live and reopened sessions equal and touches no other part consumer. Adopted: `session-runtime-step-times.ts` side table; `stepStart = min(step-start from parts, side table start, first part arrival)`; truncation in the property test covers the side table; patch 0019 therefore also carries one import line and one call line in each of the two sync files (a deviation from the plan's "no other vendor files", recorded here). Implementation dispatched to opus (`m5-d21`).

### Batch 2 final verification (main thread, 2026-10-08, load 5–8)

Order as in the plan's 验证顺序. Raw logs in the session scratchpad `m5-logs/final/`, not in the repo.

1. `bun run typecheck` (vendor app): exit 0, 0 errors.
2. `bun test --conditions=solid --preload ./happydom.ts ./src/components/session`: 418 pass / 0 fail, 23 files. `bun run test:browser`: 65 pass / 0 fail, 19 files; alone: ring-view 7/0, ring-sub-view 8/0, JSX smoke 1/0.
3. Perf (8 pass / 0 fail): ring-perf A full 3.045 ms, child-dirty 0.089, root-dirty with prev 0.395, frameAt 0.039; B full 13.147 ms, child-dirty 0.165, root-dirty settled 2.694, root-dirty in flight 2.800, frameAt 0.024. ring-frame-perf p95: fixture 1100x720 0.069 ms, scaleB 0.395; fixture 560x900 0.052, scaleB 0.331 (budget 4). session-runtime-perf median 0.68 / p95 1.58 ms. `test:bench` Playwright half still BLOCKED (Task 2 reason).
4. Root `bun run verify:brief`: PASS (typecheck 0 errors, unit 190/0).
5. Patch 0019 regenerated from `git diff deb241e -- packages/app` after `add -N`: 55 files, 19 733 insertions; new files include all ring*/step-times modules and tests, both fixtures, `solid-jsx-preload.ts`, the three test-browser ring files; modified: `package.json` (test:browser line only), `session-trajectory*`, `pages/session.tsx`, `global-sync/event-reducer.ts`, `server-session.ts`; no M4 view file. Sensitive scan: only the test regex line. `git diff --check`: 0 warnings (one EOF blank line removed first). Clean replay on 51ef4be: 19/19 applied, replay tree vs dev tree `src`, `test-browser` and `package.json` identical.
6. `bun run build`: PASS (webview 13.5 s, extension 123.9 kB).
7. E2E (mock, opus agent): on build 8292fba c5-runtime en 43/43 (`runs/20261008-154249-c5-runtime-eca2`), zh 43/43 (`runs/20261008-154555-c5-runtime-76b4`), c4-trajectory 17/17 (`runs/20261008-154846-c4-trajectory-b3a5`); on the final build 54ab5d2 c5-runtime en 43/43 (`runs/20261008-161513-c5-runtime-7bdc`), zh 43/43 (`runs/20261008-161824-c5-runtime-73be`), c4-trajectory 17/17 (`runs/20261008-162120-c4-trajectory-adcb`); no check asserts the new history attribute or hook, so paging ran only implicitly. No test-side change in either round.
8. look-local on the real session (14 keyframes, widths 1100/560/1600): first run on 8292fba 12/14 at every width, overflow 0/14, the two misses both in round 1 (j01: expected plan card / asm / request 9, got message card / say / none; j02: expected request 17, got 5). Diagnosis (opus, read-only, `scratchpad/m5-logs/look-local-round1-diagnosis.md`): the DB and the fixture both hold the 17 assistant messages of round 1; the app loads only the newest 20 messages (`server-session.ts:31` initialMessagePageSize) and the runtime view, unlike the trajectory view, never called `history.loadMore`. Fix round 1 (sonnet) added the paging loop but look-local stayed 12/14; fix round 2 (opus) found that older pages merge into the same array (`server-session.ts:610`) so the dirty effect never fired, switched it to the message count, added `data-oco-runtime-history` and the hook's `history()`, and made look-local wait for it. Result on 54ab5d2: 14/14 at all three widths, overflow 0/14, stale 0, history done with stored 33 / indexed 33 (protocol v1, `x-next-cursor` paging observed). Child sessions still sync only their newest 20 messages (NEXT).
9. Package / install: `OCO_SKIP_BUILD=1 bash scripts/package-vsix.sh` → `oco-0.0.4-54ab5d2.vsix`, EXTENSION_JS_SHA256 `c4530fd9084688b4d8bce8c641b066b1a9cc387cab2013387589e242599205e9`; `bash scripts/install-local.sh` → installed to `~/.vscode/extensions/oco-local-test.oco-0.0.4`, hash identical. Reload Window pending on the user's side. (An earlier `oco-0.0.4-8292fba.vsix` was installed and then replaced.)
10. Docs check: Grok Build (direct `grok-worker` route, job run-muzpxoaw-hn2b75, model unknown) read the four batch-2 doc sections and reported 6 items (wording of the sync-file hunks, install result and diagnosis still "next commit", one missing punctuation, Chinese sentences ending in ".", a scratchpad path outside the repo); all addressed in the docs commit except the scratchpad reference, which is kept as a pointer to session-local evidence.

Extra delegations after the workflow (all Claude unless noted): a1dc54d0 opus perf reuse (accepted); a1774c94 opus read-only step-parts investigation; a8789a53 sonnet D18 data layer (accepted); a5fb9494 opus D21 side table (accepted); aacd067f opus final E2E round 1; ab461059 opus read-only round-1 diagnosis; a0fadfd6 sonnet history paging (partial: effect added, 12/14); a29c51de opus history rebuild fix (accepted, 14/14); a78c84c1 opus final E2E round 2; Grok docs check as above. Gemini: unavailable (503) for the whole batch.

## Feedback batch (2026-10-09): user's first-use feedback on the installed 54ab5d2

Items: (1) 全文 button sits low and is disabled on the round-end card; (2) tools dock should collapse when there are no tool calls; (3) the plan chip cannot be opened; (4) a session's first conversation shows "第 2 轮"; (5) the counter row clips its left edge ("build" → "uild") when the round has ended.

Facts so far: (4) the DB holds exactly one user message for the reported session (`ses_ee1f4ac91ffeHAmjzXsNvb4OJW`) and `buildRingIndex` on the DB rows, full and incremental (message by message, parts arriving late), gives one round n=1; so the extra round comes from the live store (an extra user message that is not in the DB).

### Delegation record

| task_id | Write scope (exclusive) | requested_route | actual_provider/model | agent_id/run_id | Status | Result path | fallback_reason |
| --- | --- | --- | --- | --- | --- | --- | --- |
| fb-1/2/3/5 | patch 0019 sources (`session-runtime-ring*`, i18n, tests) | main thread | Claude Opus 5.5 | this session | Done | this file | upstream patch 0019 is main-thread work (AGENTS.md) |
| fb-4-investigate | `docs/evidence/round-two-investigation-2026-10-09.md` | gemini-worker | unknown | a16c3387 | Running | `docs/evidence/round-two-investigation-2026-10-09.md` | — |

Results so far (main thread, 2026-10-09):
- (1) `round-end` added to `EXPANDABLE`; the expand button is `inline-flex`, `line-height: 1`, `font-family: inherit`; the card badge now shrinks (ellipsis) before the button can be pushed out.
- (2) `dockOpen(index, t, reduced)` (session-runtime-ring.ts): round-scoped, opens over LANE_MS from the round's first tool call, closes over LANE_MS once the latest request finished without any tool; frame field `dk`, view attribute `data-oco-runtime-tools-k`; wide layout only (`baseWide` dock height lerps 30 px ↔ full); narrow layout unchanged. Collapsed header carries the empty note. Live-path bug found in look-local (NaN dock at the top-left): `session-runtime.tsx` `FRAME_KEYS` did not list `dk`; fixed, plus a compile-time check that `FRAME_KEYS` covers every `RingFrame` field.
- (3) plan chip is a button (`aria-label` key `ring.plan.chip.aria`, en/zh/zht) opening the same overlay with every plan item; Esc/✕ return focus to the chip.
- (5) counter row: `justify-content: safe center`, the round/state segment shrinks with ellipsis, width estimate keeps a 10 % margin.
- Checks: `bun typecheck` 0 errors; unit `src/components/session` 419 pass / 0 fail; `test:browser` 66 pass / 0 fail (new test: plan chip opens the list, round-end expand enabled); geo test 1b (collapsed dock clean, wide 30 px, narrow unchanged). look-local on the real session (widths 1100/1600, 3 instants each; new `rects` field in report.json): round end tools-k 0.000 / dock 30 px high; mid-round tools-k 1.000 / 208 px; overflow 0; screenshots `.oco-look-fb4/` (local only, real session text).
- Patch 0019 regenerated (`git diff deb241e -- packages/app` after `add -N`), `diff --check` clean. Installed `oco-0.0.4-dd67556-fb1.vsix` locally (needs Reload Window).
- c5-runtime E2E en/zh: NOT RUN yet (to be delegated after item 4).
- (4) Gemini report (`docs/evidence/round-two-investigation-2026-10-09.md`, Gemini 3.8 Flash per its report) verified by the main thread: `messageKey` = `time.created + id` (`utils/session-message.ts`), the optimistic user copy carries the client clock, so `message.updated` for the server copy misses the binary search and is spliced in next to it → two user messages with one id in `data.message` → `buildFull` counts two rounds. Fix in `context/server-session.ts` (`message.updated`, not-found branch only): drop any entry with the same id before inserting. Regression test in `server-session.test.ts` (failed before, passes after). Full app unit suite with the package flags: 1143 pass / 1 fail (`i18n/desktop-native.test.ts` "pa" vs "en", host ICU, file not touched by 0019). Installed `oco-0.0.4-dd67556-fb2.vsix`.

| task_id | Write scope (exclusive) | requested_route | actual_provider/model | agent_id/run_id | Status | Result path | fallback_reason |
| --- | --- | --- | --- | --- | --- | --- | --- |
| fb-4-investigate | `docs/evidence/round-two-investigation-2026-10-09.md` | gemini-worker | Google / Gemini 3.8 Flash (High) (self-reported) | a16c3387 / gem-mv08ps52-cuar9 | Returned, accepted after main-thread check | that file | — |
| fb-e2e | `docs/evidence/e2e-fb-2026-10-09.md`, `.oco-e2e-fb-*` logs | gemini-worker | Google / unknown model (oco-mock model under test) | aba845ae / gem-mv099tlq-5z13y | Returned: c5 en 42/1, zh 42/1 (geometry-stable, outdated dock assumption), c4 17/0 | `docs/evidence/e2e-fb-2026-10-09.md` | — |
- E2E (Gemini, mock model): c5-runtime en 42 PASS / 1 FAIL, zh 42 PASS / 1 FAIL, c4-trajectory 17/0 (`docs/evidence/e2e-fb-2026-10-09.md`). The failure is `geometry-stable`: it compared the tools dock between the done frame (dock collapsed, 30 px) and a mid-round replay frame (dock open, 208 px). Main thread updated the test: `geomOf` records tools-k; the tools dock rectangle is compared only at equal tools-k, the other four always. Recomputed on the recorded rects of both runs: runRun true, doneReplay true (PASS); rerun delegated below.

| task_id | Write scope (exclusive) | requested_route | actual_provider/model | agent_id/run_id | Status | Result path | fallback_reason |
| --- | --- | --- | --- | --- | --- | --- | --- |
| fb-e2e-2 | `docs/evidence/e2e-fb-2026-10-09.md` (append), `.oco-e2e-fb-*` logs | gemini-worker | Google / Gemini 3.8 Flash (High) (self-reported) | ac48911f / gem-mv09t2xz-aa16h | Returned, accepted: c5 en 43/43, zh 43/43 (results.json checked by main thread) | same file | — |

Feedback round 2 (2026-10-09): (a) the plan chip still could not be clicked: the counter row it sits in has `pointer-events: none`, and the browser test used `el.click()`, which skips hit-testing. Fix: `pointer-events: auto` on the chip; c5 `plan-chip` now does a real Playwright click and requires the plan overlay with 3 items. (b) The 全文 button is removed; the whole card is the opener (`role="button"`, `tabIndex` 0, Enter/Space, `aria-disabled` when the card has no text), enabled whenever the card shows any text (body/full/pre/post/plan), so running cards open too. The overlay shows pre, full text, plan items, post and the meta line. (c) The meta line is no longer in the card (its height goes to the body); it is in the overlay and the bottom caption. i18n `ring.card.expand` removed (268 ring keys). Checks: typecheck 0; session unit 419/0; test-browser 66/0; look-local 1600 px on the real session: the waiting card shows the full route, no button, no meta line. Installed `oco-0.0.4-dd67556-fb3.vsix`.

| task_id | Write scope (exclusive) | requested_route | actual_provider/model | agent_id/run_id | Status | Result path | fallback_reason |
| --- | --- | --- | --- | --- | --- | --- | --- |
| fb-e2e-3 | `docs/evidence/e2e-fb-2026-10-09.md` (append), `.oco-e2e-fb-*` logs | gemini-worker | unknown / Gemini 3.8 Flash (High) (self-reported) | a5819f40 / gem-mv0bcauq-hka3a | Returned, accepted: c5 en 43/43, zh 43/43; plan-chip real click opens 3 items (results.json checked by main thread) | same file | — |
