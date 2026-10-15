# Overnight E2E 20261015-075650

- mode: mock (OCO_E2E_MODEL=mock); loop: 1; port: 4517
- started: 2026-10-15 07:56:50 +0800
- commit: ccb3622 on claude/roadmap-batch-2026-10-14
- command: bash scripts/overnight-e2e.sh 

| # | suite | iter | exit | time | PASS | FAIL | NOT RUN | BLOCKED | N/A | model | notes | results | log |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | t015-diagnostics | 1 | 0 | 22s | 4 | 0 | 0 | 0 | 0 | mock |  | docs/evidence/runs/20261014-235652-t015-diagnostics-069d/results.json | docs/evidence/runs/overnight-20261015-075650/01-t015-diagnostics.log |
| 2 | c11-sidebar-organize | 1 | 0 | 22s | 6 | 0 | 2 | 0 | 0 | mock |  | docs/evidence/runs/20261014-235715-c11-sidebar-organize-41bf/results.json | docs/evidence/runs/overnight-20261015-075650/02-c11-sidebar-organize.log |
| 3 | c14-review-notes | 1 | 0 | 86s | 6 | 0 | 0 | 0 | 0 | mock |  | docs/evidence/runs/20261014-235735-c14-review-notes-0e34/results.json | docs/evidence/runs/overnight-20261015-075650/03-c14-review-notes.log |
| 4 | c15-fix-with-opencode | 1 | 0 | 61s | 5 | 0 | 0 | 0 | 0 | mock |  | docs/evidence/runs/20261014-235902-c15-fix-with-opencode-5f54/results.json | docs/evidence/runs/overnight-20261015-075650/04-c15-fix-with-opencode.log |
| 5 | c19-label-snooze | 1 | 0 | 26s | 5 | 0 | 0 | 0 | 0 | mock |  | docs/evidence/runs/20261015-000002-c19-label-snooze-9bbd/results.json | docs/evidence/runs/overnight-20261015-075650/05-c19-label-snooze.log |
| 6 | c20-inbox-nav | 1 | 0 | 16s | 5 | 0 | 0 | 0 | 0 | mock |  | docs/evidence/runs/20261015-000029-c20-inbox-nav-949f/results.json | docs/evidence/runs/overnight-20261015-075650/06-c20-inbox-nav.log |
| 7 | c21-follow | 1 | 0 | 19s | 3 | 0 | 0 | 0 | 0 | mock |  | docs/evidence/runs/20261015-000046-c21-follow-bbf9/results.json | docs/evidence/runs/overnight-20261015-075650/07-c21-follow.log |
| 8 | c22-review-threads | 1 | 0 | 81s | 2 | 0 | 0 | 0 | 0 | mock |  | docs/evidence/runs/20261015-000105-c22-review-threads-3014/results.json | docs/evidence/runs/overnight-20261015-075650/08-c22-review-threads.log |
| 9 | c23-subagent-pills | 1 | 0 | 17s | 2 | 0 | 0 | 0 | 0 | mock |  | docs/evidence/runs/20261015-000226-c23-subagent-pills-814f/results.json | docs/evidence/runs/overnight-20261015-075650/09-c23-subagent-pills.log |
| 10 | c25-nested-subagents | 1 | 0 | 41s | 6 | 0 | 0 | 0 | 0 | mock |  | docs/evidence/runs/20261015-000243-c25-nested-subagents-21bb/results.json | docs/evidence/runs/overnight-20261015-075650/10-c25-nested-subagents.log |
| 11 | c4-trajectory | 1 | 0 | 37s | 17 | 0 | 0 | 0 | 0 | mock |  | docs/evidence/runs/20261015-000325-c4-trajectory-572a/results.json | docs/evidence/runs/overnight-20261015-075650/11-c4-trajectory.log |
| 12 | c5-runtime | 1 | 0 | 210s | 43 | 0 | 0 | 0 | 0 | mock |  | docs/evidence/runs/20261015-000402-c5-runtime-0586/results.json | docs/evidence/runs/overnight-20261015-075650/12-c5-runtime.log |
| 13 | p1a-chat | 1 | 0 | 48s | 8 | 0 | 0 | 0 | 0 | mock |  | docs/evidence/runs/20261015-000732-p1a-chat-690a/results.json | docs/evidence/runs/overnight-20261015-075650/13-p1a-chat.log |
| 14 | p1b-narrow | 1 | 0 | 128s | 12 | 0 | 0 | 0 | 0 | mock |  | docs/evidence/runs/20261015-000820-p1b-narrow-3693/results.json | docs/evidence/runs/overnight-20261015-075650/14-p1b-narrow.log |
| 15 | p1b-reconnect | 1 | 1 | 106s | 2 | 3 | 0 | 0 | 0 | mock | FAIL: reconnect-hard-cut, reconnect-incremental, reconnect-stall | docs/evidence/runs/20261015-001028-p1b-reconnect-254c/results.json | docs/evidence/runs/overnight-20261015-075650/15-p1b-reconnect.log |
| 16 | t014-connection | 1 | 0 | 15s | 6 | 0 | 0 | 0 | 0 | mock |  | docs/evidence/runs/20261015-001214-t014-connection-fe28/results.json | docs/evidence/runs/overnight-20261015-075650/16-t014-connection.log |

- finished: 2026-10-15 08:12:29 +0800; suites run: 16, failed: 1
