# Overnight E2E 20261016-214310

- mode: mock (OCO_E2E_MODEL=mock); loop: 1; port: 4567
- started: 2026-10-16 21:43:10 +0800
- commit: 882291a on mini/e2e-real-gaps
- command: bash scripts/overnight-e2e.sh 

| # | suite | iter | exit | time | PASS | FAIL | NOT RUN | BLOCKED | N/A | model | notes | results | log |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | c19-label-snooze | 1 | 0 | 23s | 5 | 0 | 0 | 0 | 0 | mock |  | docs/evidence/runs/20261016-134313-c19-label-snooze-d780/results.json | docs/evidence/runs/overnight-20261016-214310/01-c19-label-snooze.log |
| 2 | c12-new-session-draft | 1 | 0 | 31s | 13 | 0 | 0 | 0 | 0 | mock |  | docs/evidence/runs/20261016-134335-c12-new-session-draft-71b6/results.json | docs/evidence/runs/overnight-20261016-214310/02-c12-new-session-draft.log |
| 3 | c10-sidebar-answer | 1 | 0 | 8s | 6 | 0 | 0 | 0 | 0 | mock |  | docs/evidence/runs/20261016-134406-c10-sidebar-answer-80ad/results.json | docs/evidence/runs/overnight-20261016-214310/03-c10-sidebar-answer.log |
| 4 | c11-sidebar-organize | 1 | 0 | 17s | 6 | 0 | 2 | 0 | 0 | mock |  | docs/evidence/runs/20261016-134414-c11-sidebar-organize-62d4/results.json | docs/evidence/runs/overnight-20261016-214310/04-c11-sidebar-organize.log |
| 5 | c24-runtime-question | 1 | 0 | 10s | 3 | 0 | 0 | 0 | 0 | mock |  | docs/evidence/runs/20261016-134431-c24-runtime-question-f4d6/results.json | docs/evidence/runs/overnight-20261016-214310/05-c24-runtime-question.log |
| 6 | c18-permission-note | 1 | 0 | 6s | 2 | 0 | 0 | 0 | 0 | mock |  | docs/evidence/runs/20261016-134441-c18-permission-note-320c/results.json | docs/evidence/runs/overnight-20261016-214310/06-c18-permission-note.log |

- finished: 2026-10-16 21:44:47 +0800; suites run: 6, failed: 0
