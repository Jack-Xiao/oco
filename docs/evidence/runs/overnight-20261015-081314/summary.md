# Overnight E2E 20261015-081314

- mode: mock (OCO_E2E_MODEL=mock); loop: 1; port: 4517
- started: 2026-10-15 08:13:14 +0800
- commit: ccb3622 on claude/roadmap-batch-2026-10-14
- command: bash scripts/overnight-e2e.sh 

| # | suite | iter | exit | time | PASS | FAIL | NOT RUN | BLOCKED | N/A | model | notes | results | log |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | t007-managed | 1 | 0 | 52s | 7 | 0 | 0 | 0 | 0 | mock |  | docs/evidence/runs/20261015-001315-t007-managed-82ff/results.json | docs/evidence/runs/overnight-20261015-081314/01-t007-managed.log |
| 2 | t007-multiroot | 1 | 0 | 22s | 5 | 0 | 0 | 0 | 0 | mock |  | docs/evidence/runs/20261015-001407-t007-multiroot-757a/results.json | docs/evidence/runs/overnight-20261015-081314/02-t007-multiroot.log |
| 3 | t010-recover | 1 | 0 | 108s | 5 | 0 | 0 | 0 | 0 | mock |  | docs/evidence/runs/20261015-001428-t010-recover-04dc/results.json | docs/evidence/runs/overnight-20261015-081314/03-t010-recover.log |
| 4 | p1a-identity | 1 | 1 | 73s | 7 | 1 | 0 | 0 | 0 | mock | FAIL: run; missing: draft-after-attacks, forged-draft-rejected, permission-after-attacks, hide-keeps-document, reload-auto-restore, close-specific-tab, image-bytes | docs/evidence/runs/20261015-001616-p1a-identity-70f2/results.json | docs/evidence/runs/overnight-20261015-081314/04-p1a-identity.log |
| 5 | p1b-main-panel | 1 | 1 | 111s | 7 | 1 | 0 | 0 | 0 | mock | FAIL: draft-per-session | docs/evidence/runs/20261015-001729-p1b-main-panel-ef5a/results.json | docs/evidence/runs/overnight-20261015-081314/05-p1b-main-panel.log |
| 6 | p1b-ime | 1 | 0 | 18s | 1 | 0 | 1 | 0 | 0 | mock |  | docs/evidence/runs/20261015-001922-p1b-ime-98f3/results.json | docs/evidence/runs/overnight-20261015-081314/06-p1b-ime.log |
| 7 | p1b-theme-load | 1 | 0 | 34s | 4 | 0 | 0 | 0 | 0 | mock |  | docs/evidence/runs/20261015-001939-p1b-theme-load-77ff/results.json | docs/evidence/runs/overnight-20261015-081314/07-p1b-theme-load.log |
| 8 | p1b-pending-send | 1 | 0 | 111s | 7 | 0 | 0 | 0 | 0 | mock |  | docs/evidence/runs/20261015-002012-p1b-pending-send-8ba5/results.json | docs/evidence/runs/overnight-20261015-081314/08-p1b-pending-send.log |
| 9 | p1b-switch-pending | 1 | 0 | 57s | 2 | 0 | 0 | 0 | 0 | mock |  | docs/evidence/runs/20261015-002203-p1b-switch-pending-4e32/results.json | docs/evidence/runs/overnight-20261015-081314/09-p1b-switch-pending.log |
| 10 | c1-open-file | 1 | 0 | 32s | 6 | 0 | 0 | 0 | 0 | mock |  | docs/evidence/runs/20261015-002300-c1-open-file-5d3c/results.json | docs/evidence/runs/overnight-20261015-081314/10-c1-open-file.log |
| 11 | c1-focus | 1 | 0 | 78s | 3 | 0 | 0 | 0 | 0 | mock |  | docs/evidence/runs/20261015-002333-c1-focus-05f2/results.json | docs/evidence/runs/overnight-20261015-081314/11-c1-focus.log |
| 12 | c2-diff-unavailable | 1 | 0 | 21s | 3 | 0 | 0 | 0 | 0 | mock |  | docs/evidence/runs/20261015-002450-c2-diff-unavailable-2a9d/results.json | docs/evidence/runs/overnight-20261015-081314/12-c2-diff-unavailable.log |
| 13 | c3-fork | 1 | 0 | 25s | 4 | 0 | 0 | 0 | 0 | mock |  | docs/evidence/runs/20261015-002512-c3-fork-b43b/results.json | docs/evidence/runs/overnight-20261015-081314/13-c3-fork.log |
| 14 | c7-result-card | 1 | 0 | 24s | 6 | 0 | 0 | 0 | 0 | mock |  | docs/evidence/runs/20261015-002537-c7-result-card-5980/results.json | docs/evidence/runs/overnight-20261015-081314/14-c7-result-card.log |
| 15 | c8-git-review | 1 | 0 | 15s | 5 | 0 | 0 | 0 | 0 | mock |  | docs/evidence/runs/20261015-002600-c8-git-review-c232/results.json | docs/evidence/runs/overnight-20261015-081314/15-c8-git-review.log |
| 16 | c9-mermaid | 1 | 1 | 1s | ? | ? | ? | ? | ? | unknown | no results.json | docs/evidence/runs/20261015-002615-c9-mermaid-8ecf (no results.json: suite killed or timed out) | docs/evidence/runs/overnight-20261015-081314/16-c9-mermaid.log |

- finished: 2026-10-15 08:26:16 +0800; suites run: 16, failed: 3
