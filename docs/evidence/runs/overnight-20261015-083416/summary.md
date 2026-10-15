# Overnight E2E 20261015-083416

- mode: mock (OCO_E2E_MODEL=mock); loop: 1; port: 4517
- started: 2026-10-15 08:34:16 +0800
- commit: ccb3622 on claude/roadmap-batch-2026-10-14
- command: bash scripts/overnight-e2e.sh 

| # | suite | iter | exit | time | PASS | FAIL | NOT RUN | BLOCKED | N/A | model | notes | results | log |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | t014-connection | 1 | 0 | 15s | 6 | 0 | 0 | 0 | 0 | mock |  | docs/evidence/runs/20261015-003417-t014-connection-9175/results.json | docs/evidence/runs/overnight-20261015-083416/01-t014-connection.log |
| 2 | t010-recover | 1 | 0 | 103s | 5 | 0 | 0 | 0 | 0 | mock |  | docs/evidence/runs/20261015-003432-t010-recover-1ef2/results.json | docs/evidence/runs/overnight-20261015-083416/02-t010-recover.log |
| 3 | p1b-switch-pending | 1 | 0 | 55s | 2 | 0 | 0 | 0 | 0 | mock |  | docs/evidence/runs/20261015-003615-p1b-switch-pending-01d2/results.json | docs/evidence/runs/overnight-20261015-083416/03-p1b-switch-pending.log |
| 4 | c2-diff-unavailable | 1 | 0 | 14s | 3 | 0 | 0 | 0 | 0 | mock |  | docs/evidence/runs/20261015-003710-c2-diff-unavailable-ba81/results.json | docs/evidence/runs/overnight-20261015-083416/04-c2-diff-unavailable.log |
| 5 | c17-subagent-aggregate | 1 | 0 | 29s | 5 | 0 | 0 | 0 | 0 | mock |  | docs/evidence/runs/20261015-003724-c17-subagent-aggregate-c5ac/results.json | docs/evidence/runs/overnight-20261015-083416/05-c17-subagent-aggregate.log |
| 6 | c8-git-review | 1 | 0 | 13s | 5 | 0 | 0 | 0 | 0 | mock |  | docs/evidence/runs/20261015-003754-c8-git-review-d8c8/results.json | docs/evidence/runs/overnight-20261015-083416/06-c8-git-review.log |

- finished: 2026-10-15 08:38:07 +0800; suites run: 6, failed: 0
