# Overnight E2E 20261016-174147

- mode: real (OCO_E2E_MODEL=real); loop: 1; port: 4537
- started: 2026-10-16 17:41:47 +0800
- commit: 625b306 on mini/mini-real-1190
- command: bash scripts/overnight-e2e.sh 

| # | suite | iter | exit | time | PASS | FAIL | NOT RUN | BLOCKED | N/A | model | notes | results | log |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | p1a-chat | 1 | 1 | 957s | 1 | 2 | 2 | 0 | 0 | real | FAIL: stream-locked, run; missing: permission-bound, question-answer, cancel-real, policy-foreign-session, policy-directory-override, policy-unlisted-write | docs/evidence/runs/20261016-094149-p1a-chat-bf33/results.json | docs/evidence/runs/overnight-20261016-174147/01-p1a-chat.log |
| 2 | c4-trajectory | 1 | 1 | 40s | 0 | 1 | 0 | 0 | 0 | real | FAIL: run; missing: toggle-open, locale-copy, compact-groups, rows-match-server, scale-toggle, tool-detail, request-timing, raw-content, tools-tab, live-update, back-to-chat, switch-resets, narrow-detail, subagent-row, subagent-link | docs/evidence/runs/20261016-095746-c4-trajectory-5bdb/results.json | docs/evidence/runs/overnight-20261016-174147/02-c4-trajectory.log |
| 3 | c5-runtime | 1 | 1 | 529s | 12 | 2 | 0 | 0 | 0 | real | FAIL: plan-chip, run; missing: perm-approve, reply-in-panel, perm-reject, tool-fail, question-route, dismiss, fold, same-command, no-leak, stop, retry, subagent, strip, replay-no-actions, keyboard, think-card, think-expand, width-560, width-wide, ring, motion-on, reduced-motion, width-1600, parallel-subagents, focus-stable, focus-on-change, geometry-stable, tools-k-collapse, legend, summary, fill | docs/evidence/runs/20261016-095826-c5-runtime-a7ca/results.json | docs/evidence/runs/overnight-20261016-174147/03-c5-runtime.log |
| 4 | t015-diagnostics | 1 | 0 | 5s | 4 | 0 | 0 | 0 | 0 | real |  | docs/evidence/runs/20261016-100716-t015-diagnostics-2211/results.json | docs/evidence/runs/overnight-20261016-174147/04-t015-diagnostics.log |

- finished: 2026-10-16 18:07:21 +0800; suites run: 4, failed: 3
