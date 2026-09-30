# P1b stability runs (negative control + full E2E regression)

Date: 2026-09-30 (UTC). Run directories: `docs/evidence/runs/<runId>/results.json`.

## Environment

- oco git HEAD: e67129d (working tree dirty: other workers' uncommitted changes; nothing committed by this run)
- vendor/opencode HEAD: 51ef4be (upstream sha in results.json: 51ef4be1d3c1...)
- node v26.7.0, bun 1.3.10, darwin 27.2.0 arm64, OpenCode server 1.18.33 (isolated, 127.0.0.1:4517), VS Code 1.139.1
- Timeline (UTC): 00:45:51 the coordinator's `session-feed.ts` change (event pump stops after its own abort) was built into `apps/extension/dist/extension.js`. The default full run began 00:41:48, so p1a-chat and p1a-identity (first pass) started before that build; p1b-sidebar and everything after started after it.

## Segment 1: negative control (old submit.ts must be detected by the new suite)

Old version = upstream `submit.ts` at vendor HEAD + `git show HEAD:patches/opencode/0004-...patch` (the old, committed patch), `git apply` clean.

| Run | runId | exit | Result |
|---|---|---|---|
| 1a: old patch exactly as committed | 20260930-003617-p1b-pending-send-4d4e | 1 | 0/7 PASS. Every case FAIL. `loading-hint` fails because there is no hint UI signal; the other six fail at the suite's own precondition ("model not loading in fresh panel"), because the old patch never sets `data-oco-model` on `<html>`. This proves the suite rejects the old build, but the behavioural assertions (draft change, Escape, cancel button) were not reached. |
| 1b: old patch + only the `data-oco-model` marker (createEffect, same as new patch) so the cases can run | 20260930-003759-p1b-pending-send-dca2 | 1 | 1/7 PASS. PASS: loading-hint. FAIL: pending-visible-and-send, pending-duplicate, pending-draft-change (old build sent the original draft "pending-send case four"), pending-escape (old build sent the prompt "case five" despite Escape), pending-cancel-button (no "取消发送" button), pending-close. |

Conclusion: the new suite detects the old defect. Expected failures pending-draft-change, pending-escape and pending-cancel-button all fail on the old logic (1b, behaviourally; 1a, at the precondition). loading-hint passes in 1b because the hint bar comes from the webview-side `submit-status.ts`, which the old patch does not need to supply once the marker exists. Run 1b is an extra variant beyond the requested single run; its temporary edit was only the marker in submit.ts.

Restore check: backup `$TMPDIR/oco-submit.cur.ts` copied back (md5 a718a9fef2dbbfc2b112b5d6e8664ff2, identical to the pre-test file). `git -C vendor/opencode diff packages/app/src/components/prompt-input/submit.ts` vs `patches/opencode/0004-oco-embedded-submit-waits-for-model.patch`: no differences. `bun run build` (webview + extension) rebuilt afterwards, exit 0.

## Segment 2: current code

- `bun run typecheck`: exit 0 (also 0 on the final re-check).
- `bun test tests/unit`: first run 93 pass / 1 fail (94 tests). The failure was `run.mjs 套件管理 > DEFAULT_SUITES ...` in tests/unit/e2e-results.test.ts, a stale assertion (6 suites expected, run.mjs now has 8); not modified by this run. After the coordinator's update: 100 pass / 0 fail (100 tests, 8 files).

Default full run (`node tests/e2e/run.mjs`, started 00:41:48Z):

| Suite | runId | exit | Cases | Started (UTC) |
|---|---|---|---|---|
| p1a-chat | 20260930-004148-p1a-chat-e3dd | 1 | 7/8 PASS; FAIL stream-locked | 00:41:48 (before 00:45:51 build) |
| p1a-identity | 20260930-004517-p1a-identity-ce27 | 0 | 14/14 | 00:45:17 (before 00:45:51 build) |
| p1b-sidebar | 20260930-004817-p1b-sidebar-9f39 | 0 | 11/11 | 00:48:17 |
| p1b-narrow | 20260930-005009-p1b-narrow-630c | 1 | 11/12 PASS; FAIL question-260 | 00:50:09 |
| p1b-theme-load | 20260930-005327-p1b-theme-load-1d96 | 0 | 3/3 | 00:53:27 |
| p1b-ime | 20260930-005355-p1b-ime-33b4 | 0 | 1/2 PASS + ime-real-macos NOT RUN (real macOS IME not available to automation; not required) | 00:53:55 |
| p1b-reconnect | 20260930-005411-p1b-reconnect-741f | 0 | 5/5 | 00:54:11 |
| p1b-pending-send | 20260930-005452-p1b-pending-send-96f2 | 0 | 7/7 | 00:54:52 |

Failure triage (both judged test/environment side, not product):
- p1a-chat `stream-locked`: `serverChars: 0`, `distinctSamplesWhileBusy: 0`: the model produced no text, so there was nothing to stream and the case's precondition for a meaningful comparison was absent (the DOM equalled the server, which was empty). LLM/provider flake.
- p1b-narrow `question-260`: geometry and clicks all fine (`clickError: null`, both targets inside the viewport and hit themselves); the recorded answer was "Blue" while the test compares `=== "blue"` case-sensitively. The model capitalised the label; 320/480/800 widths recorded "blue".

Reruns (one each, no test files changed, no rebuild; started after the 00:45:51 build):

| Suite | runId | exit | Cases |
|---|---|---|---|
| p1a-chat | 20260930-005840-p1a-chat-968f | 0 | 8/8 |
| p1b-narrow | 20260930-010056-p1b-narrow-3017 | 0 | 12/12 |
| p1a-identity | 20260930-010418-p1a-identity-b596 | 0 | 14/14 (extra rerun because its first pass began before the 00:45:51 build) |

p1b-sidebar and p1b-reconnect started after 00:45:51 (00:48:17 and 00:54:11), so the requested rerun of those two was not needed.

Net: after reruns every default suite has an exit-0 run; the only non-PASS counts are the two flakes above (passed on rerun) and ime-real-macos.

## NOT RUN

- `p1b-ime` case `ime-real-macos`: NOT RUN (needs a real macOS IME session; recorded as NOT RUN by the suite, exit 0).
- Suites outside the default list (perf, smoke, t004, t005): not requested.
- Screenshots were not viewed (per instruction).
