# Overnight E2E 20261015-032859

- mode: mock (OCO_E2E_MODEL=mock); loop: 1; port: 4527
- started: 2026-10-15 03:28:59 +0800
- commit: 8d2d9db on mini/card7
- command: bash scripts/overnight-e2e.sh 

| # | suite | iter | exit | time | PASS | FAIL | NOT RUN | BLOCKED | N/A | model | notes | results | log |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | c6-inbox | 1 | 0 | 7s | 5 | 0 | 0 | 0 | 0 | mock |  | docs/evidence/runs/20261014-192901-c6-inbox-660c/results.json | docs/evidence/runs/overnight-20261015-032859/01-c6-inbox.log |
| 2 | c10-sidebar-answer | 1 | 0 | 9s | 6 | 0 | 0 | 0 | 0 | mock |  | docs/evidence/runs/20261014-192909-c10-sidebar-answer-9c39/results.json | docs/evidence/runs/overnight-20261015-032859/02-c10-sidebar-answer.log |
| 3 | c11-sidebar-organize | 1 | 0 | 17s | 6 | 0 | 2 | 0 | 0 | mock |  | docs/evidence/runs/20261014-192917-c11-sidebar-organize-8a4f/results.json | docs/evidence/runs/overnight-20261015-032859/03-c11-sidebar-organize.log |
| 4 | c12-new-session-draft | 1 | 0 | 31s | 13 | 0 | 0 | 0 | 0 | mock |  | docs/evidence/runs/20261014-192934-c12-new-session-draft-941c/results.json | docs/evidence/runs/overnight-20261015-032859/04-c12-new-session-draft.log |
| 5 | c13-worktree-inbox | 1 | 0 | 15s | 6 | 0 | 0 | 0 | 0 | mock |  | docs/evidence/runs/20261014-193006-c13-worktree-inbox-500e/results.json | docs/evidence/runs/overnight-20261015-032859/05-c13-worktree-inbox.log |
| 6 | c14-review-notes | 1 | 0 | 80s | 6 | 0 | 0 | 0 | 0 | mock |  | docs/evidence/runs/20261014-193021-c14-review-notes-b5d8/results.json | docs/evidence/runs/overnight-20261015-032859/06-c14-review-notes.log |
| 7 | c15-fix-with-opencode | 1 | 0 | 53s | 5 | 0 | 0 | 0 | 0 | mock |  | docs/evidence/runs/20261014-193141-c15-fix-with-opencode-e7cc/results.json | docs/evidence/runs/overnight-20261015-032859/07-c15-fix-with-opencode.log |
| 8 | c16-sidebar-stop | 1 | 0 | 25s | 5 | 0 | 0 | 0 | 0 | mock |  | docs/evidence/runs/20261014-193235-c16-sidebar-stop-81ec/results.json | docs/evidence/runs/overnight-20261015-032859/08-c16-sidebar-stop.log |
| 9 | c17-subagent-aggregate | 1 | 0 | 27s | 5 | 0 | 0 | 0 | 0 | mock |  | docs/evidence/runs/20261014-193259-c17-subagent-aggregate-5f42/results.json | docs/evidence/runs/overnight-20261015-032859/09-c17-subagent-aggregate.log |
| 10 | c18-permission-note | 1 | 0 | 6s | 2 | 0 | 0 | 0 | 0 | mock |  | docs/evidence/runs/20261014-193327-c18-permission-note-98e6/results.json | docs/evidence/runs/overnight-20261015-032859/10-c18-permission-note.log |
| 11 | c19-label-snooze | 1 | 0 | 23s | 5 | 0 | 0 | 0 | 0 | mock |  | docs/evidence/runs/20261014-193333-c19-label-snooze-246f/results.json | docs/evidence/runs/overnight-20261015-032859/11-c19-label-snooze.log |
| 12 | c20-inbox-nav | 1 | 0 | 10s | 5 | 0 | 0 | 0 | 0 | mock |  | docs/evidence/runs/20261014-193356-c20-inbox-nav-75c9/results.json | docs/evidence/runs/overnight-20261015-032859/12-c20-inbox-nav.log |
| 13 | c21-follow | 1 | 0 | 13s | 3 | 0 | 0 | 0 | 0 | mock |  | docs/evidence/runs/20261014-193405-c21-follow-a1d5/results.json | docs/evidence/runs/overnight-20261015-032859/13-c21-follow.log |
| 14 | c22-review-threads | 1 | 0 | 73s | 2 | 0 | 0 | 0 | 0 | mock |  | docs/evidence/runs/20261014-193418-c22-review-threads-4b48/results.json | docs/evidence/runs/overnight-20261015-032859/14-c22-review-threads.log |
| 15 | c23-subagent-pills | 1 | 0 | 10s | 2 | 0 | 0 | 0 | 0 | mock |  | docs/evidence/runs/20261014-193531-c23-subagent-pills-0573/results.json | docs/evidence/runs/overnight-20261015-032859/15-c23-subagent-pills.log |
| 16 | c24-runtime-question | 1 | 0 | 11s | 3 | 0 | 0 | 0 | 0 | mock |  | docs/evidence/runs/20261014-193541-c24-runtime-question-dead/results.json | docs/evidence/runs/overnight-20261015-032859/16-c24-runtime-question.log |
| 17 | p1b-sidebar | 1 | 0 | 47s | 13 | 0 | 0 | 0 | 0 | mock |  | docs/evidence/runs/20261014-193552-p1b-sidebar-9739/results.json | docs/evidence/runs/overnight-20261015-032859/17-p1b-sidebar.log |
| 18 | p1b-narrow | 1 | 0 | 120s | 12 | 0 | 0 | 0 | 0 | mock |  | docs/evidence/runs/20261014-193639-p1b-narrow-0456/results.json | docs/evidence/runs/overnight-20261015-032859/18-p1b-narrow.log |
| 19 | c5-runtime | 1 | 0 | 169s | 43 | 0 | 0 | 0 | 0 | mock |  | docs/evidence/runs/20261014-193840-c5-runtime-3d11/results.json | docs/evidence/runs/overnight-20261015-032859/19-c5-runtime.log |
| 20 | c4-trajectory | 1 | 0 | 30s | 17 | 0 | 0 | 0 | 0 | mock |  | docs/evidence/runs/20261014-194129-c4-trajectory-2ce7/results.json | docs/evidence/runs/overnight-20261015-032859/20-c4-trajectory.log |
| 21 | visual-light-sidebar | 1 | 0 | 9s | 1 | 0 | 0 | 0 | 0 | mock |  | docs/evidence/runs/20261014-194159-visual-light-sidebar-cfff/results.json | docs/evidence/runs/overnight-20261015-032859/21-visual-light-sidebar.log |

- finished: 2026-10-15 03:42:08 +0800; suites run: 21, failed: 0
