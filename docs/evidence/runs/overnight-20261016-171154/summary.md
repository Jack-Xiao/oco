# Overnight E2E 20261016-171154

- mode: mock (OCO_E2E_MODEL=mock); loop: 1; port: 4537
- started: 2026-10-16 17:11:54 +0800
- commit: f5ff439 on mini/mini-real
- command: bash scripts/overnight-e2e.sh 

| # | suite | iter | exit | time | PASS | FAIL | NOT RUN | BLOCKED | N/A | model | notes | results | log |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | c14-review-notes | 1 | 1 | 79s | 5 | 1 | 0 | 0 | 0 | mock | FAIL: draft-acked | docs/evidence/runs/20261016-091156-c14-review-notes-96c2/results.json | docs/evidence/runs/overnight-20261016-171154/01-c14-review-notes.log |
| 2 | p1b-sidebar | 1 | 1 | 60s | 12 | 1 | 0 | 0 | 0 | mock | FAIL: chain-draft | docs/evidence/runs/20261016-091314-p1b-sidebar-6674/results.json | docs/evidence/runs/overnight-20261016-171154/02-p1b-sidebar.log |
| 3 | p1b-narrow | 1 | 1 | 307s | 11 | 1 | 0 | 0 | 0 | mock | FAIL: question-320 | docs/evidence/runs/20261016-091414-p1b-narrow-f781/results.json | docs/evidence/runs/overnight-20261016-171154/03-p1b-narrow.log |
| 4 | c12-new-session-draft | 1 | 0 | 32s | 13 | 0 | 0 | 0 | 0 | mock |  | docs/evidence/runs/20261016-091922-c12-new-session-draft-0582/results.json | docs/evidence/runs/overnight-20261016-171154/04-c12-new-session-draft.log |
| 5 | c19-label-snooze | 1 | 0 | 23s | 5 | 0 | 0 | 0 | 0 | mock |  | docs/evidence/runs/20261016-091953-c19-label-snooze-fb19/results.json | docs/evidence/runs/overnight-20261016-171154/05-c19-label-snooze.log |

- finished: 2026-10-16 17:20:16 +0800; suites run: 5, failed: 3
