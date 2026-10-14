# card 2 mock E2E: sidebar stop (new c16-sidebar-stop) + 7 regression suites, 2026-10-14

> Latest: "第 3 轮（d61dddf）" at the end: c16 5/5 PASS, c6 5/5, c10 6/6. 第 2 轮（5a95980）added case 5 waiting-stop, which failed on a product gap (the permission stayed pending after Stop); 第 3 轮 verifies the fix. Everything from here down to the 第 2 轮 section is the 第 1 轮 record on `0baf5ae` (c16 4/4 PASS, 7 regression suites PASS).

Goal: add a mock-model E2E suite for card 2 ("one-click stop in the sidebar": row ■, selection-bar Stop, Stop All Running, cascade confirm) and confirm that the 7 suites touching the sidebar / connection / inbox still pass. Mock model only; no real-model run; product code untouched; nothing committed.

## Env
- Code under test: branch `claude/card2-stop-notify-v2` @ `0baf5ae` (committed 2026-10-14T10:33:08+08:00). `apps/extension/dist/extension.js` (mtime 10:33, contains the string "Stop all ${n} running sessions?") was not rebuilt.
- VS Code 1.141.0 (`/Applications/Visual Studio Code.app`, default of `tests/e2e/vscode.mjs`), one isolated profile per suite, one VS Code at a time.
- OpenCode 1.18.33 `serve` on 127.0.0.1:4517, scripted mock LLM on 127.0.0.1:4518 (`oco-mock/mock`, `modelMode: mock` in every results.json). Host: node v26.7.0, darwin 27.2.0 arm64.
- Run method: `node tests/e2e/<suite>.mjs`, sequentially; only results.json was read (no screenshots). Server logs: `docs/evidence/runs/card2-e2e-server.log` (round 1), `card2-e2e-server2.log` (round 2). Per-suite stdout: `docs/evidence/runs/card2-e2e-*.log`.
- `.oco-test`: this worktree had none. A real directory under the worktree path makes VS Code's IPC socket path 122 chars (limit 103; `net.listen` on that path fails with EINVAL, checked), so `.oco-test` is a symlink to `/private/tmp/claude-501/oco-c2e` (precedent: `nostalgic-gates-ef74ca/.oco-test -> /tmp/oco-wt-test`). Round 1 server: `OCO_E2E_MODEL=mock bash scripts/test-server.sh` unchanged. Round 2 server: a scratchpad copy of that script whose only differences are the two lines `ROOT=` and `T=` pinned to real paths (see c13 diagnosis for why). `scripts/` itself is unchanged.

## Results (round 2 = final: pinned-path server + t014 test fix)
| suite | PASS | FAIL | NOT RUN | exit | results.json (under docs/evidence/runs/) |
| --- | --- | --- | --- | --- | --- |
| c16-sidebar-stop (run 2) | 4 | 0 | 0 | 0 | 20261014-025147-c16-sidebar-stop-065e/results.json |
| c16-sidebar-stop (run 1, round 1 env) | 4 | 0 | 0 | 0 | 20261014-024203-c16-sidebar-stop-f4c8/results.json |
| c11-sidebar-organize | 7 | 0 | 1 (delete-batch, deliberate) | 0 | 20261014-025206-c11-sidebar-organize-d2d9/results.json |
| c10-sidebar-answer (rerun) | 6 | 0 | 0 | 0 | 20261014-025457-c10-sidebar-answer-733e/results.json |
| c10-sidebar-answer (first run, flake) | 0 | 1 (`run`) | 0 | 1 | 20261014-025219-c10-sidebar-answer-4aba/results.json |
| c6-inbox | 5 | 0 | 0 | 0 | 20261014-025258-c6-inbox-f8f2/results.json |
| c13-worktree-inbox | 6 | 0 | 0 | 0 | 20261014-025308-c13-worktree-inbox-1d41/results.json |
| p1b-sidebar | 13 | 0 | 0 | 0 | 20261014-025354-p1b-sidebar-138c/results.json |
| t015-diagnostics | 4 | 0 | 0 | 0 | 20261014-025332-t015-diagnostics-0aa7/results.json |
| t014-connection | 6 | 0 | 0 | 0 | 20261014-025339-t014-connection-e0e3/results.json |

Round 1 (symlinked `.oco-test`, server from `scripts/test-server.sh` as is, t014 not yet fixed), kept as evidence of the two diagnosed failures: c11 7/0/1 (`20261014-024300-c11-sidebar-organize-6b91`), c10 6/0/0 (`20261014-024311-c10-sidebar-answer-a490`), c6 5/0/0 (`20261014-024322-c6-inbox-1ec8`), **c13 2/4/0** (`20261014-024332-c13-worktree-inbox-125d`), t015 4/0/0 (`20261014-024636-t015-diagnostics-a265`), **t014 5/1/0** (`20261014-024644-t014-connection-b384`), p1b 13/0/0 (`20261014-024718-p1b-sidebar-bba7`). p1b ran last in both rounds (server already held sessions).

## c16-sidebar-stop (`tests/e2e/c16-sidebar-stop.mjs`, new; not added to DEFAULT_SUITES)
Setup: profile `c16-sidebar-stop` with `"window.dialogStyle": "custom"` (through the existing `settings` option of `launch()`) so modal confirms render into the DOM; an idle session is kept open in the chat panel so a wrongly opened session would change `debugState().selected`. Busy sessions come from the mock prompt "Write 600 numbered sentences" (~90 s stream) started through the API. Required: row-stop, selection-stop, stop-all; cascade-confirm is optional (NOT RUN if the ~9 s subagent window is missed; not triggered in 2 runs). Stops are verified on the server (`GET /session/status` not busy, last assistant message `MessageAbortedError`, so a natural finish cannot pass) and in the sidebar DOM.
1. row-stop PASS (both runs): idle row's ■ not visible; running row's ■ visible on hover (opacity >= 0.5, pointer-events on); click -> server not busy after 346 ms / 14 ms (limit 15 s), dot no longer running, `selected` still the open idle session, no chat panel bound to the stopped session.
2. selection-stop PASS (both runs): selection of only an idle row ("1 selected") shows no Stop; two busy rows ("2 selected Stop Archive Delete Mark unread Pin Clear") -> Stop -> both idle after 12 ms / 25 ms, both aborted, dots cleared, the idle session untouched.
3. stop-all PASS (both runs): `stopText` "$(debug-stop) 2" plus one status-bar item with the debug-stop icon; palette command "oco: Stop All Running Sessions…" -> modal "Stop all 2 running sessions?" (buttons Cancel, Stop); Cancel keeps both running and the counter at 2; second run + Stop -> idle after 259 ms / 246 ms, `stopText` null, both aborted. The custom dialog rendered in the DOM, so no NOT RUN.
4. cascade-confirm PASS (both runs): parent started with `Use the read tool on math.ts with offset 1 and limit 2 WITH-SLOW-SIBLING` (read, not bash: the mock server config sets `bash: ask`, which would turn the parent into "waiting") and a running subagent; ■ -> modal `Stop "c16-casc-…"?` with detail "Its 1 running subagent(s) will stop too."; Stop -> parent and child idle after 220-232 ms, the child never reached "Mock line 60.", parent `MessageAbortedError`. The dialog showed 61-64 ms after the click, well inside the ~9 s window.

## Failure diagnosis
1. c13 round 1 (4 FAIL): environment artifact of the `.oco-test` symlink, not card 2. The worktree sessions had 0 messages; the extension log shows `GET … rejected: directory override not allowed` and `POST /session/<id>/prompt_async rejected: session not bound to this panel` right after `POST /session -> 200`. Cause: `POST /experimental/worktree` returns the worktree directory in the spelling of the server's data dir (`/Users/…/card2-stop-notify-v2/.oco-test/xdg/…`, through the symlink) while the session created in it reports the real path (`/private/tmp/claude-501/oco-c2e/xdg/…`) (checked by API); the bridge allow-list compares directories as exact strings (`apps/extension/src/bridge-policy.ts:83-87`, registered at `:100`), so the session's directory is not allowed. Restarting the server with `ROOT`/`T` pinned to real paths (no alias) -> c13 6/6 PASS (round 2). card 2 changed none of the involved files.
2. t014 round 1 (`auth-failure` FAIL, retriedRequests 0, statusText "$(oco-logo) oco"): stale test, not card 2. The feed opens `/global/event` first and falls back to `/event` only on 404 (`apps/extension/src/session-feed.ts:276-281`, card 1 commit `5edd5cb`), but t014 returned 401 only for `/event`, so the 401 never reached the extension. `session-feed.ts` is not in the `88b56c2..0baf5ae` diff. Fixed on the test side (below) -> 6/6 PASS. The suite was not in the earlier merge E2E set, which is why the staleness was not seen before.
3. c10 round 2 first run (`run` FAIL): `locator.fill` timed out for 30 s on `.quick-input-widget input` (command palette helper `command()` in `tests/e2e/vscode.mjs`) before any case ran. Rerun on the same code and server: 6/6 PASS; round 1 also 6/6. Classified as a one-off palette timing flake (1 in 3 runs); not investigated further, no change made.

## Test-side changes
- `tests/e2e/c16-sidebar-stop.mjs`: new.
- `tests/e2e/t014-connection.mjs`: line 16 (+1 comment line): the 401 intercept now also matches `/global/event` (`git diff --stat`: 2 insertions, 1 deletion).
- No change to `tests/e2e/vscode.mjs` (the existing `settings` parameter was enough), `tests/e2e/run.mjs`, other suites, or any product / vendor / script file. No commit, no stash.

## Product defects
None found in card 2: all four c16 cases pass in both runs and none of the 7 regression suites regressed. Observations, not defects and not exercised by E2E (from code reading only):
- A session that is busy but has a pending permission/question is shown as "waiting" (`session-store.ts` activity precedence ~L415-425, `sessions-view.ts:313-317`), so it has no row ■ (`index.js` `stopBtn.hidden = !isRunning`), no selection-bar Stop, and is not counted in `stopText` (`sessions-view.ts` ~L462); `oco.sessions.stopAllRunning` plans by server status (`stop-sessions.ts` `isSessionRunning`: busy/retry), so its "Stop all N" count can exceed the status-bar counter. Whether that is intended is a product decision.
- Pre-existing, not card 2: the exact-string directory comparison in `bridge-policy.ts` (c13 diagnosis) breaks "New Session in a worktree" whenever the server's data-dir path contains a symlink.

## Cleanup
Only my own processes were stopped: round 1 server (`test-server.sh` 8620, `mock-llm` 8638, `opencode serve` 8640) before the restart, round 2 server (11617, 11624, 11626) at the end. Afterwards 4517 and 4518 have no listener, and no `test-server` / `mock-llm` / test VS Code process remains (matched on `.oco-test/vscode` / `oco-c2e` in the command line). The user's VS Code and OpenCode desktop app were not touched. Left behind (gitignored): the `.oco-test` symlink in the worktree and its target `/private/tmp/claude-501/oco-c2e`; if the target disappears (reboot), the dangling link makes `mkdir -p` in `scripts/test-server.sh` fail until the link is removed.

## 委派记录
| 字段 | 值 |
| --- | --- |
| task_id | c2-e2e |
| 唯一写入范围 | `tests/e2e/c16-sidebar-stop.mjs`（新）、`docs/evidence/card2-e2e.md`、`docs/evidence/runs/`、scratchpad checkpoint；测试侧修复 `tests/e2e/t014-connection.mjs` |
| requested_route | claude-subagent/sonnet（要起 VS Code，按 AGENTS 表交 Claude 子代理） |
| actual_provider/model | Anthropic / claude-sonnet-5-5（系统提示自报，工具层无独立 provider 字段） |
| agent_id/run_id | unknown |
| 状态 | 已返回，待主线程验收 |
| 结果路径 | 本文件 + 上表 results.json |
| 工具轮数 / 耗时 | 约 70 次工具调用（超出 60 上限：多出的在 c13 / t014 两个失败的诊断与服务端重启），约 22 分钟 |
| 主线程发现的缺陷数 | 待验收 |
| fallback_reason | 无 |

## 第 2 轮（5a95980）: `stoppable` fix + waiting-stop

Context: the main thread committed my c16 / t014 work as `cf8700c` and changed the product in `5a95980` (the host computes the stoppable roots with `planStop`; `WebRow.stoppable`; row ■, selection-bar Stop, the context-menu `running` key and the `stopText` count all read it, so a session that is busy on the server but waiting for permission / a question now gets ■ and is counted). `5a95980` was already built by the main thread; I did not build. Same env as round 1 (VS Code 1.141.0, OpenCode 1.18.33, mock model; `.oco-test` symlink kept, server from the scratchpad copy of `scripts/test-server.sh` with real-path `ROOT` / `T`; log `docs/evidence/runs/card2-e2e-5a95980-server.log`; suite logs `docs/evidence/runs/card2-e2e-5a95980-<suite>.log`, c16 run 1 is `…-c16-sidebar-stop-run1.log`). Every results.json shows `ocoCommit` 5a95980; only results.json was read.

| suite | PASS | FAIL | NOT RUN | exit | results.json (under docs/evidence/runs/) |
| --- | --- | --- | --- | --- | --- |
| c16-sidebar-stop (run 2, 5 cases) | 4 | 1 (waiting-stop) | 0 | 1 | 20261014-030326-c16-sidebar-stop-2a5a/results.json |
| c16-sidebar-stop (run 1, 5 cases) | 4 | 1 (waiting-stop) | 0 | 1 | 20261014-030131-c16-sidebar-stop-3306/results.json |
| c11-sidebar-organize | 7 | 0 | 1 (delete-batch, deliberate) | 0 | 20261014-030413-c11-sidebar-organize-c643/results.json |
| c6-inbox | 5 | 0 | 0 | 0 | 20261014-030425-c6-inbox-6f11/results.json |
| c10-sidebar-answer | 6 | 0 | 0 | 0 | 20261014-030435-c10-sidebar-answer-2da0/results.json |
| p1b-sidebar (last) | 13 | 0 | 0 | 0 | 20261014-030447-p1b-sidebar-8b86/results.json |

### waiting-stop (new case 5 of c16)
A session is made to wait for a bash permission (prompt `Use the bash tool to run exactly: echo c16-wait-…`; the mock server config has `bash: ask`), then: sidebar dot `waiting`, an inbox row (`section[data-group="inbox"] .row[data-kind="permission"][data-session-id=…]`), `stopText` counts it, ■ shows on hover, ■ click, and within 15 s the server session is not busy, `GET /permission` has no request of it, the inbox row is gone. Both runs, identical:
- PASS parts: server busy while waiting; dot `waiting`; inbox row shown; `stopText` = "$(debug-stop) 1"; ■ visible on hover (the 5a95980 fix works); after the click the session is idle on the server after 44-70 ms; the status-bar counter clears; last assistant message `MessageAbortedError`.
- FAIL parts: `GET /permission` still lists the request after 15 s (`permissionStillPending: 1`), the inbox row stays, and the row's dot stays `waiting` (`permissionGoneMs`, `inboxGoneMs` null, `dotCleared` false).
- Server-side confirmation with an API-only probe (no VS Code): `POST /session/:id/abort` idles the session within 500 ms, the permission stays pending for the whole 6 s observed (the leftover of the UI run was still pending minutes later); only `POST /permission/:id/reply` with `{"reply":"reject"}` removes it.

### Product defect (found, not fixed by me)
After Stop, a permission request of the stopped session stays pending: the inbox keeps a row for a session that is no longer running, and its sidebar row still reads "waiting". Location: `apps/extension/src/stop-sessions.ts:198` (`stopSessions` only sends `POST /session/:id/abort`; it never rejects the targets' pending permissions / questions). Idea: after the aborts, reject the pending permissions (`POST /permission/:id/reply`, `{reply:"reject"}`) and questions (`POST /question/:id/reject`) of the stopped sessions and their cascaded subagents; the store already tracks them (`session-store.ts` permissions / questions maps). The acceptance as specified for waiting-stop (permission gone, inbox row gone within 15 s) cannot pass until then.

### Test-side changes (round 2)
- `tests/e2e/c16-sidebar-stop.mjs` (uncommitted; `git diff --stat`: 56 insertions, 2 deletions): new case 5 `waiting-stop` (added to the required list and the header comment), and the `finally` block now rejects permissions that this run's own sessions left pending, so the stale request does not leak into later suites' inboxes.
- No other test file, no `vscode.mjs`, no product / script file touched; nothing committed.

### Other results on 5a95980
c16 cases 1-4 still PASS in both runs (server idle 9-336 ms after the click, stop-all and cascade dialogs unchanged), and c11 / c6 / c10 / p1b show no regression. c10 passed first time this round.

### Cleanup (round 2)
My server (`test-server-pinned.sh` 14465, `mock-llm` 14473, `opencode serve` 14475) was stopped; afterwards 4517 and 4518 have no listener and no `test-server` / `mock-llm` / test VS Code process remains. `.oco-test` symlink and `/private/tmp/claude-501/oco-c2e` kept.

### 委派记录（第 2 轮）
| 字段 | 值 |
| --- | --- |
| task_id | c2-e2e-r2 |
| 唯一写入范围 | `tests/e2e/c16-sidebar-stop.mjs`、`docs/evidence/card2-e2e.md`、`docs/evidence/runs/`、scratchpad checkpoint |
| requested_route | claude-subagent/sonnet（同第 1 轮） |
| actual_provider/model | Anthropic / claude-sonnet-5-5（系统提示自报） |
| agent_id/run_id | unknown（第 1 轮同一代理续做） |
| 状态 | 已返回，待主线程验收：waiting-stop FAIL（产品缺陷，见上），其余通过 |
| 结果路径 | 本节上表 results.json |
| 工具轮数 / 耗时 | 约 20 次工具调用（12 轮，预算 30 轮），约 8 分钟 |
| 主线程发现的缺陷数 | 待验收 |
| fallback_reason | 无 |

## 第 3 轮（d61dddf）: Stop rejects the stopped sessions' pending permissions / questions

Context: the main thread fixed the 第 2 轮 defect in `d61dddf`: after each session's abort succeeds, Stop rejects that session's (and its cascaded subagents') pending permissions (`POST /permission/:id/reply`, `{reply:"reject"}`) and questions (`POST /question/:id/reject`) in the session's own directory (`stop-sessions.ts` `deps.pending` / `cleared`, `session-store.ts`, `extension.ts`). The build finished after the commit (dist 11:09:53, commit 11:09:19); I did not build. Same env as before (VS Code 1.141.0, OpenCode 1.18.33, mock model, `.oco-test` symlink, server from the scratchpad copy of `scripts/test-server.sh` with real-path `ROOT` / `T`; logs `docs/evidence/runs/card2-e2e-r3-*.log`). Every results.json shows `ocoCommit` d61dddf; only results.json was read.

| suite | PASS | FAIL | NOT RUN | exit | results.json (under docs/evidence/runs/) |
| --- | --- | --- | --- | --- | --- |
| c16-sidebar-stop (5 cases) | 5 | 0 | 0 | 0 | 20261014-031059-c16-sidebar-stop-16e0/results.json |
| c6-inbox | 5 | 0 | 0 | 0 | 20261014-031127-c6-inbox-5c74/results.json |
| c10-sidebar-answer (rerun) | 6 | 0 | 0 | 0 | 20261014-031229-c10-sidebar-answer-907e/results.json |
| c10-sidebar-answer (first run, flake) | 0 | 1 (`run`) | 0 | 1 | 20261014-031139-c10-sidebar-answer-48af/results.json |

waiting-stop now PASS. Numbers from the run (time from the ■ click): server idle after 45 ms; `GET /permission` has no request of the session after 545 ms; inbox row gone after 683 ms; sidebar dot no longer `waiting`; status-bar counter cleared; before the click `stopText` was "$(debug-stop) 1" and ■ was visible on the waiting row. Stays idle: the session was sampled 20 times over 3088 ms after the click (every ~150 ms): 0 samples running after the first idle one, and idle at the end, so the reject did not restart the run. Last assistant message `MessageAbortedError`; `permissionStillPending` 0 at the end. c16 cases 1-4 still PASS (server idle after 572 / 15 / 228 / 241 ms for row-stop / selection-stop / stop-all / cascade-confirm).

Test-side change (round 3): `tests/e2e/c16-sidebar-stop.mjs` (uncommitted, 21 insertions and 6 deletions against `d61dddf`): in waiting-stop the three `within` polls became one sampling loop that runs until 3 s after the click (and until idle, permission gone and inbox row gone have all been seen, at most 15 s) and records `stoppedMs`, `permissionGoneMs`, `inboxGoneMs`, `restartedSamples` and `idleAtEnd`; the case now also requires `restartedSamples === 0 && idleAtEnd`. No other test file, no product file touched; nothing committed.

Product defects: none found this round; the 第 2 轮 defect (permission stays pending after Stop) is fixed and verified.

c10 flake: the first run failed with the same `locator.fill` 30 s timeout on `.quick-input-widget input` as the earlier flake; the call log shows the `fill` was for ">Notifications: Clear All Notifications", i.e. the first palette use inside `launch()` (`clearNotifications` in `tests/e2e/vscode.mjs`), before any c10 logic. The immediate rerun passed 6/6. That is 2 occurrences in 8 c10 runs so far (both at startup, none related to stop); I made no change to `vscode.mjs`.

Cleanup (round 3): my server (`test-server-pinned.sh` 16978, `mock-llm` 16985, `opencode serve` 16987) was stopped; 4517 and 4518 have no listener and no `test-server` / `mock-llm` / test VS Code process remains. `.oco-test` symlink and `/private/tmp/claude-501/oco-c2e` kept.

### 委派记录（第 3 轮）
| 字段 | 值 |
| --- | --- |
| task_id | c2-e2e-r3 |
| 唯一写入范围 | `tests/e2e/c16-sidebar-stop.mjs`、`docs/evidence/card2-e2e.md`、`docs/evidence/runs/`、scratchpad checkpoint |
| requested_route | claude-subagent/sonnet（同前两轮） |
| actual_provider/model | Anthropic / claude-sonnet-5-5（系统提示自报） |
| agent_id/run_id | unknown（同一代理续做） |
| 状态 | 已返回，待主线程验收：c16 5/5、c6 5/5、c10 6/6（首跑 1 次启动期 flake，重跑通过） |
| 结果路径 | 本节上表 results.json |
| 工具轮数 / 耗时 | 约 9 次工具调用（8 轮，预算 20 轮），约 5 分钟 |
| 主线程发现的缺陷数 | 待验收 |
| fallback_reason | 无 |
