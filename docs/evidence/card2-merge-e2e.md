# main merge mock E2E: card 1 (worktree inbox) + card 3 (review notes / Fix with OpenCode), 2026-10-14

Goal: confirm that the six suites touching the merged features still pass on `main` HEAD `88b56c2` (merge of `claude/card3-review-notes`, which already contains card 1). Mock model only; no real-model run, no product or test code changed.

## Env
- Code under test: `main` @ `88b56c2` (committed 2026-10-14T10:04:41+08:00). `git status` before and after the runs: only untracked files (`.DS_Store`, `.impeccable/`, `docs/.DS_Store`, `docs/evidence/card2-stop-notify-v2-2026-10-14.md`, `docs/superpowers/.DS_Store`), no tracked changes; so `ocoDirty: true` in every results.json reflects untracked files only.
- Extension bundle: `apps/extension/dist/extension.js`, mtime 2026-10-14T10:05:35+08:00 (after the HEAD commit). Not rebuilt in this batch. It contains the card 3 string ("Fix with OpenCode", 3 matching lines) and the card 1 `/global/event` code (2 matching lines).
- VS Code 1.141.0, `/Applications/Visual Studio Code.app/Contents/MacOS/Code` (default of `tests/e2e/vscode.mjs`, `OCO_VSCODE_BIN` not set), one isolated profile per suite.
- OpenCode server: `/Users/xiaojiang/.opencode/bin/opencode` 1.18.33, `serve` on 127.0.0.1:4517, state isolated under `.oco-test/`. Started with `OCO_E2E_MODEL=mock bash scripts/test-server.sh`; scripted mock LLM on 127.0.0.1:4518 (`oco-mock/mock`). Every results.json has `modelMode: mock`, `serverVersion: 1.18.33`.
- Host: node v26.7.0, darwin 27.2.0 arm64. Server log: `docs/evidence/runs/card2-merge-e2e-server.log`.
- Run method: `node tests/e2e/<suite>.mjs`, one suite at a time (one VS Code at a time), order c13, c14, c15, c6, c12, p1b (p1b last so the server already has sessions). Per-suite stdout: `docs/evidence/runs/card2-merge-e2e-<suite>.log`. Only results.json was read; no screenshots viewed.

## Results
| suite | PASS | FAIL | NOT RUN | exit | time | results.json |
| --- | --- | --- | --- | --- | --- | --- |
| c13-worktree-inbox | 6 | 0 | 0 | 0 | 24 s | docs/evidence/runs/20261014-020831-c13-worktree-inbox-8d5b/results.json |
| c14-review-notes | 6 | 0 | 0 | 0 | 79 s | docs/evidence/runs/20261014-020856-c14-review-notes-c862/results.json |
| c15-fix-with-opencode (run 1) | 5 | 0 | 0 | 0 | 52 s | docs/evidence/runs/20261014-021014-c15-fix-with-opencode-0f99/results.json |
| c15-fix-with-opencode (rerun) | 4 | 0 | 1 | 0 | 125 s | docs/evidence/runs/20261014-021319-c15-fix-with-opencode-76ff/results.json |
| c6-inbox | 5 | 0 | 0 | 0 | 12 s | docs/evidence/runs/20261014-021107-c6-inbox-7878/results.json |
| c12-new-session-draft | 13 | 0 | 0 | 0 | 38 s | docs/evidence/runs/20261014-021119-c12-new-session-draft-1a71/results.json |
| p1b-sidebar | 13 | 0 | 0 | 0 | 47 s | docs/evidence/runs/20261014-021158-p1b-sidebar-183e/results.json |

All six suites: `missingRequired` empty, exit code 0. Result against the task: 6/6 suites pass on `88b56c2`.

## Failure diagnosis
No FAIL in any suite, so no diagnosis was needed and no failure had to be rerun to separate flakiness from a defect.

The only non-PASS is a NOT RUN, from a deliberate extra rerun of c15:
- `c15 terminal-shell-integ` is environment/timing dependent. Run 1: PASS (`header: true`, `outputShown: true`). Rerun, same code and same server: NOT RUN, reason recorded by the suite: "terminal never reported a finished shell-integration command within ~25 s" (the check after it took 81 s from `terminal-no-record` to the NOT RUN record, versus 7 s in run 1). This matches card 3 (`card3-e2e-2026-10-14.md`), which recorded NOT RUN for the same check. Treat it as NOT RUN-or-PASS by environment, never as a regression signal; the positive Terminal path is only verified when shell integration happens to report in time. `terminal-no-record` (the negative path: warning "No finished command in the active terminal (shell integration required)", draft unchanged) PASSed in both runs.

## Test-side changes
None. No file under `tests/e2e/` was edited (`git diff --stat` empty, `git status` unchanged).

## Product defects
None found.

## Observations
- p1b-sidebar `sidebar-list` passed with 100 items shown / 194 server roots (the isolated server already held sessions from earlier suites and earlier days); `single-view-header` passed with container title "Oco: Sessions" (the case-insensitive check from card 1). The card 3 flakiness notes (fresh-server `sidebar-list`, one `Clear Session Search` click timeout) did not occur.
- c13: status bar count went 2 -> 0 and sidebar inbox rows 2 -> 0 after Allow on both worktree sessions; the two worktrees live under `.oco-test/xdg/data/opencode/worktree/...` (gitignored).
- Single pass only for the five suites that passed; the repeat was done for c15 alone. No stability claim beyond one run each.

## Cleanup
Only the processes started for this batch were stopped: `opencode serve` (pid 94912) and `mock-llm` (pid 94910), both children of my `scripts/test-server.sh` (pid 94894). After that 4517 and 4518 had no listener, no `opencode serve` / `mock-llm` / `test-server.sh` process remained, and no VS Code process using the test profiles remained. The user's own VS Code (user-data-dir `~/Library/Application Support/Code`) and any OpenCode desktop app were not touched.

## 委派记录
| 字段 | 值 |
| --- | --- |
| task_id | card2-merge-e2e |
| 唯一写入范围 | `docs/evidence/card2-merge-e2e.md`, `docs/evidence/runs/` (gitignored), scratchpad checkpoint |
| requested_route | claude-subagent/sonnet (E2E that launches VS Code is assigned to Claude subagents by AGENTS.md; Grok/Gemini not attempted by design) |
| actual_provider/model | Anthropic / claude-sonnet-5-5 (as stated by the agent's system prompt; the tool layer returned no separate provider field) |
| agent_id/run_id | unknown |
| 状态 | 已返回 (6/6 suites pass; acceptance by the main thread pending) |
| 结果路径 | this file and the results.json paths in the table |
| 工具轮数 / 耗时 | about 15 tool calls / about 15 min |
| 主线程发现的缺陷数 | 0 |
| fallback_reason | none |
