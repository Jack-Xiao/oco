# Overnight E2E 20261016-210616

- mode: mock (OCO_E2E_MODEL=mock); loop: 1; port: 4557
- started: 2026-10-16 21:06:16 +0800
- commit: 5750dae on HEAD
- command: bash scripts/overnight-e2e.sh 

| # | suite | iter | exit | time | PASS | FAIL | NOT RUN | BLOCKED | N/A | model | notes | results | log |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | c14-review-notes | 1 | 1 | 79s | 5 | 1 | 0 | 0 | 0 | mock | FAIL: draft-acked | docs/evidence/runs/20261016-130617-c14-review-notes-ddf8/results.json | docs/evidence/runs/overnight-20261016-210616/01-c14-review-notes.log |
| 2 | p1b-sidebar | 1 | 1 | 61s | 12 | 1 | 0 | 0 | 0 | mock | FAIL: chain-draft | docs/evidence/runs/20261016-130736-p1b-sidebar-902d/results.json | docs/evidence/runs/overnight-20261016-210616/02-p1b-sidebar.log |

- finished: 2026-10-16 21:08:37 +0800; suites run: 2, failed: 2
