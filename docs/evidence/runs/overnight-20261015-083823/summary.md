# Overnight E2E 20261015-083823

- mode: mock (OCO_E2E_MODEL=mock); loop: 1; port: 4517
- started: 2026-10-15 08:38:23 +0800
- commit: ccb3622 on claude/roadmap-batch-2026-10-14
- command: bash scripts/overnight-e2e.sh 

| # | suite | iter | exit | time | PASS | FAIL | NOT RUN | BLOCKED | N/A | model | notes | results | log |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | p1b-reconnect | 1 | 0 | 41s | 5 | 0 | 0 | 0 | 0 | mock |  | docs/evidence/runs/20261015-003825-p1b-reconnect-d401/results.json | docs/evidence/runs/overnight-20261015-083823/01-p1b-reconnect.log |
| 2 | t014-connection | 1 | 0 | 14s | 6 | 0 | 0 | 0 | 0 | mock |  | docs/evidence/runs/20261015-003906-t014-connection-e930/results.json | docs/evidence/runs/overnight-20261015-083823/02-t014-connection.log |
| 3 | t010-recover | 1 | 0 | 104s | 5 | 0 | 0 | 0 | 0 | mock |  | docs/evidence/runs/20261015-003921-t010-recover-5cd2/results.json | docs/evidence/runs/overnight-20261015-083823/03-t010-recover.log |
| 4 | p1b-switch-pending | 1 | 0 | 55s | 2 | 0 | 0 | 0 | 0 | mock |  | docs/evidence/runs/20261015-004105-p1b-switch-pending-df58/results.json | docs/evidence/runs/overnight-20261015-083823/04-p1b-switch-pending.log |
| 5 | c2-diff-unavailable | 1 | 0 | 14s | 3 | 0 | 0 | 0 | 0 | mock |  | docs/evidence/runs/20261015-004200-c2-diff-unavailable-e3ba/results.json | docs/evidence/runs/overnight-20261015-083823/05-c2-diff-unavailable.log |
| 6 | c17-subagent-aggregate | 1 | 0 | 30s | 5 | 0 | 0 | 0 | 0 | mock |  | docs/evidence/runs/20261015-004214-c17-subagent-aggregate-f9cd/results.json | docs/evidence/runs/overnight-20261015-083823/06-c17-subagent-aggregate.log |
| 7 | c8-git-review | 1 | 0 | 13s | 5 | 0 | 0 | 0 | 0 | mock |  | docs/evidence/runs/20261015-004243-c8-git-review-f4ff/results.json | docs/evidence/runs/overnight-20261015-083823/07-c8-git-review.log |

- finished: 2026-10-15 08:42:56 +0800; suites run: 7, failed: 0
