# Overnight E2E 20261015-075052

- mode: mock (OCO_E2E_MODEL=mock); loop: 1; port: 4517
- started: 2026-10-15 07:50:52 +0800
- commit: ccb3622 on claude/roadmap-batch-2026-10-14
- command: bash scripts/overnight-e2e.sh 

| # | suite | iter | exit | time | PASS | FAIL | NOT RUN | BLOCKED | N/A | model | notes | results | log |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | c6-inbox | 1 | 0 | 15s | 5 | 0 | 0 | 0 | 0 | mock |  | docs/evidence/runs/20261014-235052-c6-inbox-0e78/results.json | docs/evidence/runs/overnight-20261015-075052/01-c6-inbox.log |
| 2 | c10-sidebar-answer | 1 | 0 | 12s | 6 | 0 | 0 | 0 | 0 | mock |  | docs/evidence/runs/20261014-235108-c10-sidebar-answer-1f25/results.json | docs/evidence/runs/overnight-20261015-075052/02-c10-sidebar-answer.log |
| 3 | c12-new-session-draft | 1 | 0 | 49s | 13 | 0 | 0 | 0 | 0 | mock |  | docs/evidence/runs/20261014-235119-c12-new-session-draft-3861/results.json | docs/evidence/runs/overnight-20261015-075052/03-c12-new-session-draft.log |
| 4 | c13-worktree-inbox | 1 | 0 | 28s | 6 | 0 | 0 | 0 | 0 | mock |  | docs/evidence/runs/20261014-235208-c13-worktree-inbox-5a1d/results.json | docs/evidence/runs/overnight-20261015-075052/04-c13-worktree-inbox.log |
| 5 | c16-sidebar-stop | 1 | 0 | 27s | 5 | 0 | 0 | 0 | 0 | mock |  | docs/evidence/runs/20261014-235237-c16-sidebar-stop-5cee/results.json | docs/evidence/runs/overnight-20261015-075052/05-c16-sidebar-stop.log |
| 6 | c17-subagent-aggregate | 1 | 0 | 32s | 5 | 0 | 0 | 0 | 0 | mock |  | docs/evidence/runs/20261014-235304-c17-subagent-aggregate-a4c8/results.json | docs/evidence/runs/overnight-20261015-075052/06-c17-subagent-aggregate.log |
| 7 | c18-permission-note | 1 | 0 | 8s | 2 | 0 | 0 | 0 | 0 | mock |  | docs/evidence/runs/20261014-235336-c18-permission-note-a012/results.json | docs/evidence/runs/overnight-20261015-075052/07-c18-permission-note.log |
| 8 | c24-runtime-question | 1 | 0 | 14s | 3 | 0 | 0 | 0 | 0 | mock |  | docs/evidence/runs/20261014-235344-c24-runtime-question-87ea/results.json | docs/evidence/runs/overnight-20261015-075052/08-c24-runtime-question.log |
| 9 | p1b-sidebar | 1 | 0 | 63s | 13 | 0 | 0 | 0 | 0 | mock |  | docs/evidence/runs/20261014-235358-p1b-sidebar-5b00/results.json | docs/evidence/runs/overnight-20261015-075052/09-p1b-sidebar.log |

- finished: 2026-10-15 07:55:01 +0800; suites run: 9, failed: 0
