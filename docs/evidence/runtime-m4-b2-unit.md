# Runtime M4 Batch 2 Unit Test Execution Record

- Date: 2026-10-04
- Status: Completed
- Author: Delegated Worker (Antigravity)
- Files Created:
  - `vendor/opencode/packages/app/src/components/session/session-runtime-loop.test.ts`
  - `vendor/opencode/packages/app/src/components/session/session-runtime-model-bg.test.ts`
  - `docs/evidence/runtime-m4-b2-unit.md`

## Test Execution Summary

### Commands & Results

1. **Unit Tests**:
   - Command: `bun test --conditions=solid --preload ./happydom.ts ./src/components/session`
   - Overall Result: 273 pass, 1 todo, 1 fail (275 tests across 14 files)
   - New Test Files:
     - `session-runtime-loop.test.ts`: 29 pass, 0 fail (100% pass)
     - `session-runtime-model-bg.test.ts`: 19 pass, 1 todo, 0 fail (100% pass of executable tests)
   - Pre-existing / Untouched Test Failure:
     - `session-runtime-model.test.ts:290`: 1 fail (`tools > a completed task call is not a finished subagent; a busy child session is running`) due to Defect 1 below.

2. **TypeScript Typecheck**:
   - Command: `bun run typecheck`
   - Result: 0 errors (`$ tsgo -b` exited 0).

---

## Detailed Coverage Breakdown

### 1. `session-runtime-model-bg.test.ts`

- **`runtimeSubagentOf`**:
  - Non-task tool (`bash`) returns `undefined`.
  - Category present without `subagent_type`: uses `metadata.agent`.
  - Category present without `subagent_type` and no `metadata.agent`: falls back to `input.category`.
  - Session ID extraction: parses `session_id: ses_...` from `output` when part is `completed`.
  - Does not parse `session_id` when part is not `completed` (e.g. running).
  - `metadata.sessionId` takes precedence over output text.

- **Background dispatch & `linkBackground`**:
  - `metadata.backgroundTaskId`: marks `child.background = true`, assigns `child.backgroundTaskId`.
  - Retrieval via `background_output`:
    - When `status === "completed"` and output starts with `"Task Result"`, populates `child.retrieved = { request, at }` and `child.result = output.trim()`.
    - Retrieval tool (`background_output`) receives `agent` and `description` from the dispatch child (`retrieves: { taskId, agent, description }`), and sets its `input = description || taskId`.
    - When output starts with `"Task Status"`, does NOT mark as retrieved (`child.retrieved` and `child.result` remain `undefined`).
  - Session ID updates: subsequent tool for same `backgroundTaskId` with newer `sessionId` updates `child.sessionID`.
  - `snapshotAt` rewind: rewinding completed task preserves `backgroundTaskId`, `sessionId`, `agent`, and `description` while dropping temporary metadata.

- **`backgroundNoticesOf`**:
  - Single notices: `[BACKGROUND TASK RESULT READY]` -> `done`, `[BACKGROUND TASK ERROR]` -> `error`, `[BACKGROUND TASK CANCELLED]` -> `cancelled`, `[BACKGROUND TASK INTERRUPTED]` -> `cancelled`.
  - Summary notices: `[ALL BACKGROUND TASKS FINISHED - ...]` with multiple items correctly maps `done`, `error`, `cancelled`.
  - Single RETRYING notice clears previous notice (`out.has(id) === false`).
  - Later notice overwrites earlier notice for the same task ID.
  - Summary RETRYING notice behavior captured and documented with `test.todo` (see Defect 2).

- **`roundStartOf`**:
  - User message with `<!-- OMO_INTERNAL_INITIATOR -->` does not start a new round; skips to previous real user message.
  - User message with only synthetic parts (`synthetic: true`) does not start a new round.
  - Fallback when `messages` is undefined: falls back to the first request of the last request's `parentID`.

---

### 2. `session-runtime-loop.test.ts`

- **`probeStageOf`**:
  - Synchronous task:
    - Completed -> `absorbed`.
    - Running -> `running`.
    - Pending or missing `sessionID` -> `queued`.
    - Error in tool or lifecycle -> `stage: where`, `flag: "error"`.
    - Awaiting permission/question or `waiting-user` -> `stage: where`, `flag: "ask"`.
    - Cancelled / interrupted -> `stage: where`, `cancelled: true`.
  - Background task:
    - Completed task part without notice or retrieval -> `running` (cannot be treated as absorbed/done).
    - Notice `done` -> `docked`.
    - Live mode child lifecycle `done` -> `docked`.
    - Replay mode without notice -> remains `running`.
    - Retrieved -> `absorbed`.
    - Notice `error` or lifecycle `error` -> `stage: where`, `flag: "error"`.
    - Notice `cancelled` / lifecycle `cancelled` -> `cancelled: true`.
    - Missing `sessionID` -> `queued`.

- **`orderZone` & `layoutLoop`**:
  - Verified `LOOP_CAPACITY`: `queue: 4`, `work: 12`, `dock: 5`.
  - Stable ordering below capacity.
  - Overflow handling: slot `cap - 1` becomes cluster `+N`.
  - Anomaly swapping: flagged probe in hidden cluster swaps with the last visible unflagged probe; all other probe positions stay stable.
  - Swapping skips visible probes that are already flagged.
  - `layoutLoop` excludes `cancelled: true` and `stage: "absorbed"` probes from lane slot allocation.

- **`loopOf`**:
  - Multi-row synthesis: multiple tool rows sharing same `backgroundTaskId` are synthesized into a single probe, preserving first request's dispatch index and latest tool ID.
  - Round filtering: probes dispatched before `model.roundStart` are excluded from `probes` and counted towards `earlier`.
  - Core status:
    - `dispatching`: last request has a child tool that is pending or running without session ID.
    - `gathering`: last request has in-flight `retrieves` tool, or `absorbed > 0` with `outstanding === 0` in `model`/`fill` stage.
    - `waiting`: outstanding probes present while run is idle (live mode) or while working with all own tools settled.
    - `idle`: run is idle with 0 outstanding probes.
  - `coreTools`: filters out subagent tools (`t.child`) and retrieval tools (`t.retrieves`), aggregating own tools by name with running counts.

---

## Defects Discovered

### Defect 1: Legacy background task assigns completed output to `child.result`
- **Location**: `vendor/opencode/packages/app/src/components/session/session-runtime-model.ts` (lines 442–445, `childOf`)
- **Code**:
  ```ts
  const result =
    !backgroundTaskId && part.state.status === "completed"
      ? (/<task_result>([\s\S]*?)<\/task_result>/.exec(part.state.output)?.[1]?.trim() ?? part.state.output.trim())
      : undefined
  ```
- **Input**: A completed subagent task specifying legacy background mode (`input.background: true` or `input.run_in_background: true`) but without `metadata.backgroundTaskId`.
- **Actual**: `!backgroundTaskId` evaluates to `true`, setting `child.result = part.state.output.trim()` (e.g. `"started"`). This causes existing test `session-runtime-model.test.ts:290` to fail because `child.background` is `true` but `result` is populated.
- **Expected**: `child.result` should only be populated for synchronous tasks, i.e., `!child.background` (or `!backgroundTaskId && !raw.background && !raw.run_in_background`).

### Defect 2: Summary format notice does not delete previous notice on RETRYING
- **Location**: `vendor/opencode/packages/app/src/components/session/session-runtime-model.ts` (lines 343–346, `backgroundNoticesOf`)
- **Code**:
  ```ts
  for (const line of p.text.matchAll(/^- `(bg_[\w-]+)`:[^\n]*?(?:\s\[([A-Z_]+)\](?: - [^\n]*)?)?$/gm)) {
    const notice = ofStatus(line[2])
    if (notice) out.set(line[1], notice)
  }
  ```
- **Input**: A task `bg_x` previously recorded with notice `error`, followed by a user message containing summary notice:
  ```text
  [ALL BACKGROUND TASKS FINISHED]
  - `bg_x`: worker [RETRYING]
  ```
- **Actual**: `ofStatus("RETRYING")` returns `undefined`. `if (notice)` is false, and there is no `else out.delete(line[1])`. The previous notice (`error`) remains in the Map.
- **Expected**: A `RETRYING` status in summary notices should delete the previous notice (`out.delete(line[1])`), matching the behavior of single notices (`line 341`).
- **Test Reference**: Flagged with `test.todo` in `session-runtime-model-bg.test.ts`.
