# Overnight E2E 20261016-160120

- mode: real (OCO_E2E_MODEL=real); loop: 1; port: 4537
- started: 2026-10-16 16:01:20 +0800
- commit: f5ff439 on mini/mini-real
- command: bash scripts/overnight-e2e.sh 

| # | suite | iter | exit | time | PASS | FAIL | NOT RUN | BLOCKED | N/A | model | notes | results | log |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | c10-sidebar-answer | 1 | 1 | 116s | 0 | 1 | 0 | 0 | 0 | real | FAIL: run; missing: question-row, form-open, answer-sent, inbox-cleared | docs/evidence/runs/20261016-080122-c10-sidebar-answer-989d/results.json | docs/evidence/runs/overnight-20261016-160120/01-c10-sidebar-answer.log |
| 2 | c11-sidebar-organize | 1 | 1 | 29s | 5 | 1 | 1 | 0 | 0 | real | FAIL: todo-badge | docs/evidence/runs/20261016-080318-c11-sidebar-organize-2b1d/results.json | docs/evidence/runs/overnight-20261016-160120/02-c11-sidebar-organize.log |
| 3 | c12-new-session-draft | 1 | 1 | 169s | 11 | 2 | 0 | 0 | 0 | real | FAIL: send-reply-shown, worktree-reply-fast | docs/evidence/runs/20261016-080346-c12-new-session-draft-2e5a/results.json | docs/evidence/runs/overnight-20261016-160120/03-c12-new-session-draft.log |
| 4 | c13-worktree-inbox | 1 | 0 | 65s | 6 | 0 | 0 | 0 | 0 | real |  | docs/evidence/runs/20261016-080636-c13-worktree-inbox-3cf9/results.json | docs/evidence/runs/overnight-20261016-160120/04-c13-worktree-inbox.log |
| 5 | c14-review-notes | 1 | 1 | 79s | 5 | 1 | 0 | 0 | 0 | real | FAIL: draft-acked | docs/evidence/runs/20261016-080740-c14-review-notes-02d6/results.json | docs/evidence/runs/overnight-20261016-160120/05-c14-review-notes.log |
| 6 | c19-label-snooze | 1 | 1 | 19s | 4 | 1 | 0 | 0 | 0 | real | FAIL: run; missing: waiting-not-hidden | docs/evidence/runs/20261016-080859-c19-label-snooze-0532/results.json | docs/evidence/runs/overnight-20261016-160120/06-c19-label-snooze.log |
| 7 | c20-inbox-nav | 1 | 0 | 33s | 5 | 0 | 0 | 0 | 0 | real |  | docs/evidence/runs/20261016-080919-c20-inbox-nav-cf20/results.json | docs/evidence/runs/overnight-20261016-160120/07-c20-inbox-nav.log |
| 8 | c24-runtime-question | 1 | 1 | 95s | 1 | 2 | 0 | 0 | 0 | real | FAIL: ask-card, option-click | docs/evidence/runs/20261016-080952-c24-runtime-question-ae63/results.json | docs/evidence/runs/overnight-20261016-160120/08-c24-runtime-question.log |
| 9 | c4-trajectory | 1 | 0 | 686s | 17 | 0 | 0 | 0 | 0 | real |  | docs/evidence/runs/20261016-081127-c4-trajectory-b953/results.json | docs/evidence/runs/overnight-20261016-160120/09-c4-trajectory.log |
| 10 | c5-runtime | 1 | 1 | 1113s | 16 | 5 | 1 | 0 | 1 | real | FAIL: perm-reject, fold, same-command, no-leak, run; missing: dismiss, stop, retry, subagent, strip, replay-no-actions, keyboard, think-card, think-expand, width-560, width-wide, ring, motion-on, reduced-motion, width-1600, parallel-subagents, focus-stable, focus-on-change, geometry-stable, tools-k-collapse, legend, summary, fill; N/A: tool-fail | docs/evidence/runs/20261016-082253-c5-runtime-3a40/results.json | docs/evidence/runs/overnight-20261016-160120/10-c5-runtime.log |
| 11 | p1b-narrow | 1 | 1 | 1593s | 7 | 2 | 1 | 0 | 0 | real | FAIL: layout-260, layout-480; missing: allow-260, question-260, allow-480, question-480, deny-800 | docs/evidence/runs/20261016-084126-p1b-narrow-c4c8/results.json | docs/evidence/runs/overnight-20261016-160120/11-p1b-narrow.log |
| 12 | p1b-sidebar | 1 | 1 | 91s | 12 | 1 | 0 | 0 | 0 | real | FAIL: chain-draft | docs/evidence/runs/20261016-090758-p1b-sidebar-7088/results.json | docs/evidence/runs/overnight-20261016-160120/12-p1b-sidebar.log |

- finished: 2026-10-16 17:09:29 +0800; suites run: 12, failed: 9
