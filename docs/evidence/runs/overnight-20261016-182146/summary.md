# Overnight E2E 20261016-182146

- mode: real (OCO_E2E_MODEL=real); loop: 1; port: 4537
- started: 2026-10-16 18:21:46 +0800
- commit: 625b306 on mini/mini-real-1190
- command: bash scripts/overnight-e2e.sh 

| # | suite | iter | exit | time | PASS | FAIL | NOT RUN | BLOCKED | N/A | model | notes | results | log |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | c4-trajectory | 1 | 0 | 265s | 17 | 0 | 0 | 0 | 0 | real |  | docs/evidence/runs/20261016-102148-c4-trajectory-b3a4/results.json | docs/evidence/runs/overnight-20261016-182146/01-c4-trajectory.log |
| 2 | c5-runtime | 1 | 1 | 293s | 4 | 1 | 0 | 0 | 0 | real | FAIL: run; missing: tool-turn, context-known, last-event, replay, playback, log-overlay, back-to-chat, trajectory-still-works, plan-chip, perm-approve, reply-in-panel, perm-reject, tool-fail, question-route, dismiss, fold, same-command, no-leak, stop, retry, subagent, strip, replay-no-actions, keyboard, think-card, think-expand, width-560, width-wide, ring, motion-on, reduced-motion, width-1600, parallel-subagents, focus-stable, focus-on-change, geometry-stable, tools-k-collapse, legend, summary, fill | docs/evidence/runs/20261016-102614-c5-runtime-4a48/results.json | docs/evidence/runs/overnight-20261016-182146/02-c5-runtime.log |
| 3 | p1a-chat | 1 | 1 | 525s | 1 | 2 | 1 | 0 | 0 | real | FAIL: stream-locked, run; missing: permission-bound, question-answer, cancel-real, policy-foreign-session, policy-directory-override, policy-unlisted-write | docs/evidence/runs/20261016-103107-p1a-chat-c4f7/results.json | docs/evidence/runs/overnight-20261016-182146/03-p1a-chat.log |

- finished: 2026-10-16 18:39:51 +0800; suites run: 3, failed: 2
