# Overnight E2E 20261016-152648

- mode: real (OCO_E2E_MODEL=real); loop: 1; port: 4537
- started: 2026-10-16 15:26:48 +0800
- commit: f5ff439 on mini/mini-real
- command: bash scripts/overnight-e2e.sh 

| # | suite | iter | exit | time | PASS | FAIL | NOT RUN | BLOCKED | N/A | model | notes | results | log |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | c10-sidebar-answer | 1 | 1 | 44s | 0 | 1 | 0 | 0 | 0 | real | FAIL: run; missing: question-row, form-open, answer-sent, inbox-cleared | docs/evidence/runs/20261016-072650-c10-sidebar-answer-9c52/results.json | docs/evidence/runs/overnight-20261016-152648/01-c10-sidebar-answer.log |
| 2 | c11-sidebar-organize | 1 | 1 | 28s | 5 | 1 | 1 | 0 | 0 | real | FAIL: todo-badge | docs/evidence/runs/20261016-072734-c11-sidebar-organize-36e7/results.json | docs/evidence/runs/overnight-20261016-152648/02-c11-sidebar-organize.log |
| 3 | c12-new-session-draft | 1 | 1 | 170s | 11 | 2 | 0 | 0 | 0 | real | FAIL: send-reply-shown, worktree-reply-fast | docs/evidence/runs/20261016-072802-c12-new-session-draft-be93/results.json | docs/evidence/runs/overnight-20261016-152648/03-c12-new-session-draft.log |
| 4 | c13-worktree-inbox | 1 | 1 | 164s | 5 | 1 | 0 | 0 | 0 | real | FAIL: worktree-sessions-waiting | docs/evidence/runs/20261016-073053-c13-worktree-inbox-cfed/results.json | docs/evidence/runs/overnight-20261016-152648/04-c13-worktree-inbox.log |
| 5 | c14-review-notes | 1 | 1 | 79s | 5 | 1 | 0 | 0 | 0 | real | FAIL: draft-acked | docs/evidence/runs/20261016-073336-c14-review-notes-abc1/results.json | docs/evidence/runs/overnight-20261016-152648/05-c14-review-notes.log |
| 6 | c15-fix-with-opencode | 1 | 0 | 53s | 5 | 0 | 0 | 0 | 0 | real |  | docs/evidence/runs/20261016-073455-c15-fix-with-opencode-981d/results.json | docs/evidence/runs/overnight-20261016-152648/06-c15-fix-with-opencode.log |
| 7 | p1b-sidebar | 1 | 1 | 68s | 12 | 1 | 0 | 0 | 0 | real | FAIL: chain-draft | docs/evidence/runs/20261016-073549-p1b-sidebar-100d/results.json | docs/evidence/runs/overnight-20261016-152648/07-p1b-sidebar.log |
| 8 | p1b-narrow | 1 | 1 | 883s | 8 | 3 | 0 | 0 | 0 | real | FAIL: layout-260, allow-320, question-320; missing: allow-260, question-260 | docs/evidence/runs/20261016-073656-p1b-narrow-9da0/results.json | docs/evidence/runs/overnight-20261016-152648/08-p1b-narrow.log |
| 9 | c5-runtime | 1 | 1 | 243s | 11 | 2 | 0 | 0 | 0 | real | FAIL: trajectory-still-works, run; missing: plan-chip, perm-approve, reply-in-panel, perm-reject, tool-fail, question-route, dismiss, fold, same-command, no-leak, stop, retry, subagent, strip, replay-no-actions, keyboard, think-card, think-expand, width-560, width-wide, ring, motion-on, reduced-motion, width-1600, parallel-subagents, focus-stable, focus-on-change, geometry-stable, tools-k-collapse, legend, summary, fill | docs/evidence/runs/20261016-075140-c5-runtime-beb2/results.json | docs/evidence/runs/overnight-20261016-152648/09-c5-runtime.log |
| 10 | c4-trajectory | 1 | 1 | 41s | 0 | 1 | 0 | 0 | 0 | real | FAIL: run; missing: toggle-open, locale-copy, compact-groups, rows-match-server, scale-toggle, tool-detail, request-timing, raw-content, tools-tab, live-update, back-to-chat, switch-resets, narrow-detail, subagent-row, subagent-link | docs/evidence/runs/20261016-075543-c4-trajectory-079f/results.json | docs/evidence/runs/overnight-20261016-152648/10-c4-trajectory.log |

- finished: 2026-10-16 15:56:23 +0800; suites run: 10, failed: 9
