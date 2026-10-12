# M07 compact precheck (2026-10-11)

Status: complete (A/B/C read-only source check). Line numbers refer to the patched working tree in vendor/opencode (packages/app/src = APP, packages/opencode/src = OC).
Delegation: main thread did it (task was assigned directly as a small read-only lookup; no external route used).

## A. Embedded reachability of compact command
- Command id `session.compact`, slash `/compact`, defined APP/pages/session/use-session-commands.tsx:482-489; disabled only when `!params.id || visibleUserMessages().length===0`. No keybind (lines 483-489 have none).
- EMBEDDED_HIDDEN = {session.new, terminal.toggle, terminal.new} (use-session-commands.tsx:27, filter at :662); session.compact is NOT in it, so it is registered in embedded mode. Patch: patches/opencode/0002-oco-embedded-single-session.patch:96,127.
- Handler `compact()` (use-session-commands.tsx:402-418): model = `local.model.current()` (toast and return if none, :405-411); calls `sdk().api.session.compact({sessionID, model:{providerID: model.provider.id, modelID: model.id}})`. V1-server compat (APP/utils/server-compat.ts:274-290) turns it into `legacy().session.summarize({sessionID, providerID, modelID})` (throws if no model).
- Palette: default keybind "mod+k,mod+shift+p" (APP/context/command.tsx:14); session page registers hidden `command.palette` -> `file.open` (APP/pages/session.tsx:1162-1168), file.open has keybind mod+p (use-session-commands.tsx:522-526). Palette lists commands via palette-v2 (APP/components/dialog-command-palette-v2.tsx:39-47, commandEntries). Patches 0009, 0010, 0017, 0018 contain no palette/command-hiding changes (rg palette|EMBEDDED in those patches: only platform.embedded layout/header/settings gates). Conclusion by source: compact is reachable in embedded mode via Cmd+K/Cmd+Shift+P palette and via typing `/compact` in the composer slash menu. Not verified at runtime that VS Code does not swallow Cmd+K (VS Code uses it as chord prefix; Cmd+Shift+P is VS Code's own palette), so webview keybind delivery is unconfirmed.
- Visual run in VS Code webview: NOT RUN. Reason: needs a live session with messages plus a configured model (compact is disabled on empty sessions and calls a real model), and E2E fixtures in tests/e2e/vscode.mjs only cover the VS Code palette; not enough budget to set up safely without mutating the user's OpenCode service.

## B. Reducer / rendering of compaction
- v2 reducer projects compaction events into a `compaction` message: APP/context/server-session-v2-reducer.ts:335-393 (`session.compaction.started` -> running, `.delta` appends summary, `.ended` -> completed with summary/reason/recent, `.failed` -> failed with error). Note: there is no `session.compacted` case in the app (rg of "session.compacted" in APP finds nothing outside i18n).
- Message -> legacy part: APP/utils/session-message.ts:107-118 turns a compaction message into a part `{type:"compaction", auto: reason==="auto"}` on the parent user message (summary text/status/error are dropped).
- Rendering: APP/pages/session/timeline/rows.ts:117,162-168 emits a TurnDivider(label "compaction"); rendered at APP/pages/session/timeline/message-timeline.tsx:1198-1212 as a plain MessageDivider with text i18n `ui.messagePart.compaction` = "Session compacted" (packages/ui/src/i18n/en.ts:104). Not collapsible, no summary body, no running/failed state shown.
- oco trajectory view also shows it: APP/components/session/session-trajectory-model.ts:255-262 (label "Compaction", "Automatic context compaction"/"Context compaction"; patches 0012/0013).
- So: already rendered, as a minimal divider; running/failed/summary text not surfaced in the main timeline.

## C. Server facts
- POST /session/:id/summarize (OC/server/routes/instance/httpapi/groups/session.ts:94,303-316), operation id `session.summarize`, response boolean. Body `SummarizePayload` (groups/session.ts:65-69): `{providerID: string, modelID: string, auto?: boolean}`. Handler (handlers/session.ts:273-292) cleans revert, creates compaction with default `auto=false`, then runs the prompt loop.
- `Session.time.compacting`: exists, optional non-negative int (OC/session/session.ts:205; db column time_compacting at :114,:156).
- Event `session.compacted` (type string in SDK v2 gen: packages/sdk/js/src/v2/gen/types.gen.ts:1540,5961,6986); published at OC/session/compaction.ts:554 as `events.publish(Event.Compacted, {sessionID})` (payload: sessionID only). Newer v2 events `session.compaction.started/delta/ended/failed` carry reason/text/recent/inputID/error (reducer 335-393).

## Unchecked
- Runtime visual check of palette search "compact" in VS Code (NOT RUN, see A); exact `session.compacted` data field shape in types.gen.ts:5961 not read beyond the type string.
