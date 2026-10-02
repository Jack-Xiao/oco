# Sessions sidebar E2E (redesigned list + running icon)

Date: 2026-10-01. Suite: `p1b-sidebar`. model/provider: unknown (this run was not tagged by a tool result).

## Result

BLOCKED. No `results.json` with REQUIRED checks. VS Code exits before the workbench opens, so `sidebar-status-icons` was not executed and the animation screenshots were not taken.

Empty run directory (created, then the process died in `launch`): `docs/evidence/runs/20261001-153926-p1b-sidebar-55d2/` — no `results.json`, no screenshots.

## Commands

| Command | Result |
| --- | --- |
| `bun run build:extension` | PASS. `apps/extension/dist/extension.js` 123.6kb. Webview build skipped (sidebar change is extension-only). |
| Port 4517 | Already the isolated test server. cwd `.oco-test/workspace`. `GET /global/health` is 401 without the test secret. Config model `oco-mock/mock`. Mock LLM listening on 127.0.0.1:4518. Not restarted. |
| `node --check tests/e2e/p1b-sidebar.mjs` | SYNTAX_OK |
| `node tests/e2e/p1b-sidebar.mjs` | Exit 1 in 1.08s. Playwright: `Error: Process failed to launch!` (`playwright-core` electron.js `waitForLine`, stderr closed / process exited before `DevTools listening`). |

Direct binary check, same environment:

```
"/Applications/Visual Studio Code.app/Contents/MacOS/Code" --version
sandbox_extension_issue_file_to_process failed for /Applications/Visual Studio Code.app: 1 (Operation not permitted)
EXIT:139
```

Crash report `~/Library/Logs/DiagnosticReports/Code-2026-10-01-233952.ips`: `EXC_BAD_ACCESS` / `SIGSEGV`, `KERN_INVALID_ADDRESS at 0x10`. This session has `GROK_SANDBOX=workspace`. Seatbelt is applied to the whole process and is not reversible here, so a child VS Code cannot issue the sandbox extension it needs at startup and segfaults. Not a product bug in `sessions-view.ts`. Re-run this suite from a process that is not under that sandbox.

## Test edits (`tests/e2e/p1b-sidebar.mjs` only)

Source files were not modified. `sidebar-status-icons` was added to REQUIRED.

- `sidebar-list`: compares the debug list to the newest 100 server roots (page size), not 200. Each item must have `group` `recent` or `more` from `splitSessions` (updated since local yesterday, or `activity !== idle`, or `unread`), a compact-time `description`, and no Open/Running/Waiting text. `loadMore` must match `server.length >= 100`. When More or load-more exists, the More row must be visible and its text must include the more-count.
- `sidebar-create`: no longer requires description `Open`. Requires `group === "recent"`, compact time, listed first, aria-label `title, …` including that time and not `Open`.
- `sidebar-search`: the one hit must be flat (`group === "recent"` on every row, `loadMore === false`).
- `chain-permission`: status comes from aria-label `Waiting for permission` plus `activity === "permission"`. Description must be compact time and must not contain `Waiting`. Icon class is stored for the icon check.
- `sidebar-status-icons` (during the existing stop chain, while `activity === "busy"`): the row's `.custom-view-tree-node-item-icon` computed `background-image` must contain `session-running-dark.svg` or `session-running-light.svg` both before and after the shots. Two element screenshots 800ms apart (`animations: "allow"`), saved as `status-running-1.png` and `status-running-2.png` in the run dir. If those buffers match, a third shot 350ms later (`status-running-3.png`). Passes only if the buffers differ and the background is still the running SVG (so a half-period opacity match, or the icon changing because the run ended, does not pass). Also requires the permission row's icon class `codicon-circle-filled` and, after stop, the idle row's icon class `codicon-blank`.

## Not verified

Every REQUIRED check, including whether the running-icon PNG buffers differ. No product bug observed in the sessions list; the suite never attached to VS Code.
