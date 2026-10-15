# Overnight E2E 20261015-083017

- mode: mock (OCO_E2E_MODEL=mock); loop: 1; port: 4517
- started: 2026-10-15 08:30:17 +0800
- commit: ccb3622 on claude/roadmap-batch-2026-10-14
- command: bash scripts/overnight-e2e.sh 

| # | suite | iter | exit | time | PASS | FAIL | NOT RUN | BLOCKED | N/A | model | notes | results | log |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | p1a-identity | 1 | 1 | 72s | 7 | 1 | 0 | 0 | 0 | mock | FAIL: run; missing: draft-after-attacks, forged-draft-rejected, permission-after-attacks, hide-keeps-document, reload-auto-restore, close-specific-tab, image-bytes | docs/evidence/runs/20261015-003019-p1a-identity-d511/results.json | docs/evidence/runs/overnight-20261015-083017/01-p1a-identity.log |
| 2 | p1b-reconnect | 1 | 1 | 104s | 3 | 2 | 0 | 0 | 0 | mock | FAIL: reconnect-hard-cut, reconnect-stall | docs/evidence/runs/20261015-003131-p1b-reconnect-edaa/results.json | docs/evidence/runs/overnight-20261015-083017/02-p1b-reconnect.log |

- finished: 2026-10-15 08:33:15 +0800; suites run: 2, failed: 2
