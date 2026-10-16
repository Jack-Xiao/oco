# Overnight E2E 20261016-213843

- mode: mock (OCO_E2E_MODEL=mock); loop: 1; port: 4557
- started: 2026-10-16 21:38:43 +0800
- commit: bb25a93 on HEAD
- command: bash scripts/overnight-e2e.sh 

| # | suite | iter | exit | time | PASS | FAIL | NOT RUN | BLOCKED | N/A | model | notes | results | log |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | c14-review-notes | 1 | 0 | 79s | 6 | 0 | 0 | 0 | 0 | mock |  | docs/evidence/runs/20261016-133844-c14-review-notes-46a8/results.json | docs/evidence/runs/overnight-20261016-213843/01-c14-review-notes.log |
| 2 | p1b-sidebar | 1 | 1 | 61s | 12 | 1 | 0 | 0 | 0 | mock | FAIL: chain-draft | docs/evidence/runs/20261016-134003-p1b-sidebar-50e1/results.json | docs/evidence/runs/overnight-20261016-213843/02-p1b-sidebar.log |

- finished: 2026-10-16 21:41:04 +0800; suites run: 2, failed: 1
