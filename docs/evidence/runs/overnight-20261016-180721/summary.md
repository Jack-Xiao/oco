# Overnight E2E 20261016-180721

- mode: real (OCO_E2E_MODEL=real); loop: 1; port: 4537
- started: 2026-10-16 18:07:21 +0800
- commit: 625b306 on mini/mini-real-1190
- command: bash scripts/overnight-e2e.sh 

| # | suite | iter | exit | time | PASS | FAIL | NOT RUN | BLOCKED | N/A | model | notes | results | log |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | p1a-chat | 1 | 1 | 858s | 1 | 2 | 2 | 0 | 0 | real | FAIL: stream-locked, run; missing: permission-bound, question-answer, cancel-real, policy-foreign-session, policy-directory-override, policy-unlisted-write | docs/evidence/runs/20261016-100723-p1a-chat-9006/results.json | docs/evidence/runs/overnight-20261016-180721/01-p1a-chat.log |
| 2 | t015-diagnostics | 1 | 0 | 6s | 4 | 0 | 0 | 0 | 0 | real |  | docs/evidence/runs/20261016-102141-t015-diagnostics-6377/results.json | docs/evidence/runs/overnight-20261016-180721/02-t015-diagnostics.log |

- finished: 2026-10-16 18:21:46 +0800; suites run: 2, failed: 1
