# Overnight E2E 20261015-082800

- mode: mock (OCO_E2E_MODEL=mock); loop: 1; port: 4517
- started: 2026-10-15 08:28:00 +0800
- commit: ccb3622 on claude/roadmap-batch-2026-10-14
- command: bash scripts/overnight-e2e.sh 

| # | suite | iter | exit | time | PASS | FAIL | NOT RUN | BLOCKED | N/A | model | notes | results | log |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | p1a-identity | 1 | 1 | 72s | 7 | 1 | 0 | 0 | 0 | mock | FAIL: run; missing: draft-after-attacks, forged-draft-rejected, permission-after-attacks, hide-keeps-document, reload-auto-restore, close-specific-tab, image-bytes | docs/evidence/runs/20261015-002801-p1a-identity-b255/results.json | docs/evidence/runs/overnight-20261015-082800/01-p1a-identity.log |
| 2 | p1b-main-panel | 1 | 0 | 40s | 8 | 0 | 0 | 0 | 0 | mock |  | docs/evidence/runs/20261015-002913-p1b-main-panel-31ea/results.json | docs/evidence/runs/overnight-20261015-082800/02-p1b-main-panel.log |

- finished: 2026-10-15 08:29:53 +0800; suites run: 2, failed: 1
