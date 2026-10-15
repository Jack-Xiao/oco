# Overnight E2E 20261015-084342

- mode: mock (OCO_E2E_MODEL=mock); loop: 1; port: 4517
- started: 2026-10-15 08:43:42 +0800
- commit: ccb3622 on claude/roadmap-batch-2026-10-14
- command: bash scripts/overnight-e2e.sh 

| # | suite | iter | exit | time | PASS | FAIL | NOT RUN | BLOCKED | N/A | model | notes | results | log |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | c5-runtime | 1 | 1 | 189s | 43 | 1 | 0 | 0 | 0 | mock | FAIL: think-card | docs/evidence/runs/20261015-004343-c5-runtime-1a5c/results.json | docs/evidence/runs/overnight-20261015-084342/01-c5-runtime.log |

- finished: 2026-10-15 08:46:53 +0800; suites run: 1, failed: 1
