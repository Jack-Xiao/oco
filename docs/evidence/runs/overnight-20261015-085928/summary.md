# Overnight E2E 20261015-085928

- mode: mock (OCO_E2E_MODEL=mock); loop: 1; port: 4517
- started: 2026-10-15 08:59:28 +0800
- commit: 71bfce4 on claude/roadmap-batch-2026-10-14
- command: bash scripts/overnight-e2e.sh 

| # | suite | iter | exit | time | PASS | FAIL | NOT RUN | BLOCKED | N/A | model | notes | results | log |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | _perf-old | 1 | 1 | 48s | ? | ? | ? | ? | ? | unknown |  | (no results.json) | docs/evidence/runs/overnight-20261015-085928/01-_perf-old.log |
| 2 | perf | 1 | 0 | 45s | 4 | 0 | 0 | 0 | 0 | mock |  | docs/evidence/runs/20261015-010019-perf-355b/results.json | docs/evidence/runs/overnight-20261015-085928/02-perf.log |

- finished: 2026-10-15 09:01:03 +0800; suites run: 2, failed: 1
