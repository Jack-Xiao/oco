# Overnight E2E 20261016-155623

- mode: real (OCO_E2E_MODEL=real); loop: 1; port: 4537
- started: 2026-10-16 15:56:23 +0800
- commit: f5ff439 on mini/mini-real
- command: bash scripts/overnight-e2e.sh 

| # | suite | iter | exit | time | PASS | FAIL | NOT RUN | BLOCKED | N/A | model | notes | results | log |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | c18-permission-note | 1 | 0 | 1s | 0 | 0 | 2 | 0 | 0 | real | missing: always-preview, deny-note | docs/evidence/runs/20261016-075625-c18-permission-note-8442/results.json | docs/evidence/runs/overnight-20261016-155623/01-c18-permission-note.log |
| 2 | c19-label-snooze | 1 | 1 | 19s | 4 | 1 | 0 | 0 | 0 | real | FAIL: run; missing: waiting-not-hidden | docs/evidence/runs/20261016-075625-c19-label-snooze-83a2/results.json | docs/evidence/runs/overnight-20261016-155623/02-c19-label-snooze.log |
| 3 | c20-inbox-nav | 1 | 1 | 99s | 3 | 2 | 0 | 0 | 0 | real | FAIL: inbox-quickpick-opens, inbox-enter-opens-session | docs/evidence/runs/20261016-075645-c20-inbox-nav-2ed7/results.json | docs/evidence/runs/overnight-20261016-155623/03-c20-inbox-nav.log |
| 4 | c21-follow | 1 | 1 | 1s | 0 | 0 | 3 | 0 | 0 | unknown | missing: follow-on, preview-open, focus-stays | docs/evidence/runs/20261016-075824-c21-follow-d334/results.json | docs/evidence/runs/overnight-20261016-155623/04-c21-follow.log |
| 5 | c22-review-threads | 1 | 0 | 72s | 2 | 0 | 0 | 0 | 0 | real |  | docs/evidence/runs/20261016-075824-c22-review-threads-a528/results.json | docs/evidence/runs/overnight-20261016-155623/05-c22-review-threads.log |
| 6 | c23-subagent-pills | 1 | 1 | 0s | 0 | 0 | 2 | 0 | 0 | real | missing: pills-visible, pill-open-child | docs/evidence/runs/20261016-075936-c23-subagent-pills-86cd/results.json | docs/evidence/runs/overnight-20261016-155623/06-c23-subagent-pills.log |
| 7 | c24-runtime-question | 1 | 1 | 95s | 0 | 3 | 0 | 0 | 0 | real | FAIL: ask-card, option-click, question-cleared | docs/evidence/runs/20261016-075937-c24-runtime-question-ee61/results.json | docs/evidence/runs/overnight-20261016-155623/07-c24-runtime-question.log |
| 8 | visual-light-sidebar | 1 | 0 | 9s | 1 | 0 | 0 | 0 | 0 | real |  | docs/evidence/runs/20261016-080111-visual-light-sidebar-e1b3/results.json | docs/evidence/runs/overnight-20261016-155623/08-visual-light-sidebar.log |

- finished: 2026-10-16 16:01:20 +0800; suites run: 8, failed: 5
