# Overnight E2E 20261016-212914

- mode: mock (OCO_E2E_MODEL=mock); loop: 1; port: 4557
- started: 2026-10-16 21:29:14 +0800
- commit: bb25a93 on HEAD
- command: bash scripts/overnight-e2e.sh 

| # | suite | iter | exit | time | PASS | FAIL | NOT RUN | BLOCKED | N/A | model | notes | results | log |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | c14-review-notes | 1 | 1 | 78s | 5 | 1 | 0 | 0 | 0 | mock | FAIL: draft-acked | docs/evidence/runs/20261016-132916-c14-review-notes-4f18/results.json | docs/evidence/runs/overnight-20261016-212914/01-c14-review-notes.log |
| 2 | p1b-sidebar | 1 | 1 | 61s | 12 | 1 | 0 | 0 | 0 | mock | FAIL: chain-draft | docs/evidence/runs/20261016-133034-p1b-sidebar-bc42/results.json | docs/evidence/runs/overnight-20261016-212914/02-p1b-sidebar.log |

- finished: 2026-10-16 21:31:35 +0800; suites run: 2, failed: 2
