# Runtime M1 (Runtime View) E2E Verification Report

## Environment
- **Server Mode**: `mock` (scripted local mock LLM on 127.0.0.1:4618, OpenAI-compatible SSE streaming)
- **OpenCode Server URL**: `http://127.0.0.1:4617` (isolated test instance)
- **OpenCode Binary**: `/Users/xiaojiang/.opencode/bin/opencode` (version `1.18.33`)
- **VS Code Version**: `1.140.0` (/Applications/Visual Studio Code.app/Contents/MacOS/Code)
- **Node.js**: `v26.7.0`
- **OS**: macOS (`darwin 27.2.0 arm64`)
- **Model**: `oco-mock/mock`

## Test Execution Commands
1. **Isolated Server Launch**:
   ```bash
   PATH="/Users/xiaojiang/.opencode/bin:$PATH" \
   OCO_OPENCODE_BIN="/Users/xiaojiang/.opencode/bin/opencode" \
   OCO_E2E_MODEL=mock OCO_TEST_PORT=4617 OCO_MOCK_LLM_PORT=4618 \
   bash scripts/test-server.sh
   ```
2. **Suite `c5-runtime` (en - default)**:
   ```bash
   OCO_TEST_URL=http://127.0.0.1:4617 OCO_E2E_MODEL=mock node tests/e2e/run.mjs c5-runtime
   ```
3. **Suite `c5-runtime` (zh-cn)**:
   ```bash
   OCO_E2E_LOCALE=zh-cn OCO_TEST_URL=http://127.0.0.1:4617 OCO_E2E_MODEL=mock node tests/e2e/run.mjs c5-runtime
   ```
4. **Regression Suite `c4-trajectory`**:
   ```bash
   OCO_TEST_URL=http://127.0.0.1:4617 OCO_E2E_MODEL=mock node tests/e2e/run.mjs c4-trajectory
   ```

## Results by Suite and REQUIRED Check

### Suite: `c5-runtime` (locale: default / en)
- **results.json**: `docs/evidence/runs/20261003-042142-c5-runtime-faaf/results.json`
- **Summary**: PASS: 9, FAIL: 0, NOT RUN: 0, BLOCKED: 0, exitCode: 0 (Duration: 16.59s)
- **REQUIRED Checks**:
  1. `toggle-three`: **PASS** — Toggle has 3 views in exact order `["chat", "trajectory", "runtime"]` (`viewsOrderExact: true`); clicking `Runtime` reveals `[data-oco-runtime]`; composer input `[data-component="prompt-input"]` remains visible.
  2. `idle-state`: **PASS** — Fresh session reports `[data-oco-runtime-state]="idle"` and `[data-oco-runtime-focus]="idle"`.
  3. `locale-copy`: **PASS** — Toggle label is `"Runtime"`, state text is `"Idle (inferred)"` without Chinese characters (`hasHan: false`).
  4. `tool-turn`: **PASS** — Tool row `[data-oco-runtime-tool]` appeared during the bash tool execution (`toolRowCountDuring: 1`); after completion `tool.end` = 1, `request.end` = 2; mid-turn focus was approval prompt and differed from completion (`focusDuringDiffered: true`); focus card transitioned to `"Finished"` matching English copy exactly (`focusDoneMatches: true`).
  5. `usage-known`: **PASS** — `[data-oco-runtime-usage]` contains tokens (`In 20 · cache 0 · out 20 · thinking 0`); does not show `"Counting…"`; never showed `"0 in"`.
  6. `last-event`: **PASS** — `[data-oco-runtime-last]` contains `"Last event 0 s ago (inferred)"`; no disconnect text anywhere in panel.
  7. `replay`: **PASS** — Live completed counts verified (`tool.end` = 1, `request.end` = 2); Pause button copy matches `"Pause following"`; clicking switches mode to `"replay"`, reveals range slider and replay note; slider max is 5 (>= 1); moving slider to step 0 changes step label from `"Step 6 of 6"` to `"Step 1 of 6"`; step 0 counts are strictly lower (`tool.end` = 0 < 1, `request.end` = 0 < 2); Back to live button copy matches `"Back to live"`; clicking restores mode to `"live"`.
  8. `back-to-chat`: **PASS** — Clicking Chat tab returns to the message timeline and removes `[data-oco-runtime]`.
  9. `trajectory-still-works`: **PASS** — Clicking Trajectory view opens trajectory with composer present; clicking Chat returns cleanly to chat.

### Suite: `c5-runtime` (locale: zh-cn)
- **results.json**: `docs/evidence/runs/20261003-042211-c5-runtime-5b37/results.json`
- **Summary**: PASS: 9, FAIL: 0, NOT RUN: 0, BLOCKED: 0, exitCode: 0 (Duration: 14.17s)
- **REQUIRED Checks**:
  1. `toggle-three`: **PASS** — Exactly `["chat", "trajectory", "runtime"]` in order (`viewsOrderExact: true`); runtime panel opens with composer intact.
  2. `idle-state`: **PASS** — State `"idle"` and focus `"idle"`.
  3. `locale-copy`: **PASS** — Toggle label is `"运行"`, state text is `"空闲 (推断)"` containing Han characters (`hasHan: true`).
  4. `tool-turn`: **PASS** — Tool row appeared; `tool.end` = 1, `request.end` = 2; mid-turn focus observed approval prompt differing from completion (`focusDuringDiffered: true`); focus card transitioned to `"已完成"` matching Chinese copy exactly (`focusDoneMatches: true`).
  5. `usage-known`: **PASS** — Tokens displayed in Chinese (`输入 20 · 缓存 0 · 输出 20 · 思考 0`); not counting; no literal `"0 in"`.
  6. `last-event`: **PASS** — Displays `"最后事件 1 秒前（推断）"`; no disconnect keywords.
  7. `replay`: **PASS** — Live completed counts verified (`tool.end` = 1, `request.end` = 2); Pause button matches `"暂停跟随"`; mode switches to `"replay"`; slider max is 5; step label changes from `"第 6 / 6 步"` to `"第 1 / 6 步"`; step 0 event counts lower (`tool.end` = 0 < 1, `request.end` = 0 < 2); Back to live button matches `"返回实时"`; mode returns to `"live"`.
  8. `back-to-chat`: **PASS** — Returned to chat timeline.
  9. `trajectory-still-works`: **PASS** — Trajectory opens and closes back to chat.

### Regression: `c4-trajectory`
- **results.json**: `docs/evidence/runs/20261003-042247-c4-trajectory-0a4d/results.json`
- **Summary**: PASS: 17, FAIL: 0, NOT RUN: 0, BLOCKED: 0, exitCode: 0 (Duration: 93.33s)
- **Checks**:
  - `header-actions-chat`: **PASS**
  - `header-actions-trajectory`: **PASS**
  - `toggle-open`: **PASS**
  - `locale-copy`: **PASS**
  - `compact-groups`: **PASS**
  - `rows-match-server`: **PASS**
  - `scale-toggle`: **PASS**
  - `tool-detail`: **PASS**
  - `request-timing`: **PASS**
  - `raw-content`: **PASS**
  - `tools-tab`: **PASS**
  - `live-update`: **PASS**
  - `back-to-chat`: **PASS**
  - `switch-resets`: **PASS**
  - `narrow-detail`: **PASS**
  - `subagent-row`: **PASS**
  - `subagent-link`: **PASS**

## Limits / NOT RUN
- **Model Mode**: Test runs were executed under `OCO_E2E_MODEL=mock` (local scripted mock LLM streaming OpenAI-compatible SSE). Real models were not run.
- **Untested Scenarios**: No subagent execution, permission-approval UI interactions inside the webview (approvals were handled out-of-band via OpenCode HTTP API `/permission/:id/reply`), 429-retry backoff, in-flight turn cancellation, or long-running multi-turn session degradation scenarios are covered (these are **NOT RUN**).
- **Usage Sampling Limit**: The "no '0 in' while running" assertion rests on a single point-in-time sample read from the usage card while waiting for user permission approval.
- **Strengthened Fix Round 1 Assertions**:
  - `toggle-three`: Strict deep equality check that `data-oco-view` tabs are in exact order `["chat", "trajectory", "runtime"]`.
  - `tool-turn`: Dropped the `initialFocus` clause. Strictly requires `focusDone === L.focusDone` (`"Finished"` / `"已完成"`) and additionally requires that mid-turn focus differed from the completed focus (`focusDuringDiffered: true`).
  - `replay`: Verifies live mode event counts (`tool.end >= 1` and `request.end >= 1`); verifies button label copy in active locale for both Pause and Back to live; verifies slider max `>= 1`; asserts step label text changes upon rewinding to minimum step 0; and asserts both `tool.end` and `request.end` event counts at step 0 are strictly lower than live counts (0 finished events).
- **New Run Tool-Turn Event Counts**:
  - `en` (default): `tool.end` = 1, `request.end` = 2.
  - `zh-cn`: `tool.end` = 1, `request.end` = 2.

## Product vs Test-side Defects
- **Product Defects Suspected**: **None**. All selectors, attributes (`data-oco-runtime*`, `data-oco-view`), reactive state transitions, step replay filtering, event logging, and i18n dictionaries functioned strictly according to spec.
- **Test-side Fixes Applied**:
  - Strengthened `toggle-three` from set inclusion to exact order `["chat", "trajectory", "runtime"]`.
  - Strengthened `tool-turn` focus card check to require exact string match against localized copy and proof of mid-turn transition.
  - Replaced vacuous `step0ToolCount <= liveToolCount` (0 <= 0) check in `replay` with strictly lower finished event counts (`tool.end` and `request.end`), validated slider step count and slider label text change, and verified button label copy in the active locale.

## Isolation and Cleanup
- The existing OpenCode instance on port 4517 (pid 40872) and user VS Code were untouched.
- The test server (ports 4617 and 4618) was stopped upon completion; ports 4617 and 4618 are confirmed free.

## Git Status
```
 M tests/e2e/run.mjs
?? docs/evidence/runtime-m1-e2e.md
?? docs/evidence/runtime-viz-calibration.md
?? docs/evidence/runtime-viz-open-items.md
?? docs/superpowers/
?? patches/opencode/0019-oco-runtime-view.patch
?? tests/e2e/c5-runtime.mjs
```


## Re-run after final-review fixes (2026-10-03)

### Suite Results & Paths
1. **c5-runtime (default / en)**:
   - **Path**: `docs/evidence/runs/20261003-050935-c5-runtime-d153/results.json`
   - **Counts**: PASS: 9, FAIL: 0, NOT RUN: 0, BLOCKED: 0, exitCode: 0
   - **Tool-turn Step Details**:
     - `focusDuring`: `"Waiting for your approval: bash echo rt-87d9u\nAnswer it in the Chat view (this view does not act on requests yet)."`
     - `focusDone`: `"Finished"` (`focusDoneMatches`: true, `focusDuringDiffered`: true)
     - `tool.end` count: 1 (`toolEndCount`: 1)
     - `request.end` count: 2 (`reqEndCount`: 2)
   - **Replay Step Details**:
     - Live counts: `tool.end`: 1, `request.end`: 2
     - Step-0 counts: `tool.end`: 0, `request.end`: 0
     - `sliderMax`: 5
     - Step labels: `stepLabelBefore`: `"Step 6 of 6"`, `stepLabelAfter`: `"Step 1 of 6"`
     - Buttons: `pauseBtnText`: `"Pause following"`, `liveBtnText`: `"Back to live"`

2. **c5-runtime (zh-cn)**:
   - **Path**: `docs/evidence/runs/20261003-050959-c5-runtime-ad7a/results.json`
   - **Counts**: PASS: 9, FAIL: 0, NOT RUN: 0, BLOCKED: 0, exitCode: 0
   - **Tool-turn Step Details**:
     - `focusDuring`: `"等你批准：bash echo rt-j84j8\n请在“对话”视图里处理（本视图暂不执行这类操作）。"`
     - `focusDone`: `"已完成"` (`focusDoneMatches`: true, `focusDuringDiffered`: true)
     - `tool.end` count: 1 (`toolEndCount`: 1)
     - `request.end` count: 2 (`reqEndCount`: 2)
   - **Replay Step Details**:
     - Live counts: `tool.end`: 1, `request.end`: 2
     - Step-0 counts: `tool.end`: 0, `request.end`: 0
     - `sliderMax`: 5
     - Step labels: `stepLabelBefore`: `"第 6 / 6 步"`, `stepLabelAfter`: `"第 1 / 6 步"`
     - Buttons: `pauseBtnText`: `"暂停跟随"`, `liveBtnText`: `"返回实时"`

3. **c4-trajectory (regression)**:
   - **Path**: `docs/evidence/runs/20261003-051021-c4-trajectory-befd/results.json`
   - **Counts**: PASS: 17, FAIL: 0, NOT RUN: 0, BLOCKED: 0, exitCode: 0

### Failures
- **FAIL Text**: None. All checks passed.

### Git Status (`git -C WT status --short`)
```
 M tests/e2e/run.mjs
?? docs/evidence/runtime-m1-e2e.md
?? docs/evidence/runtime-viz-calibration.md
?? docs/evidence/runtime-viz-open-items.md
?? docs/superpowers/
?? patches/opencode/0019-oco-runtime-view.patch
?? tests/e2e/c5-runtime.mjs
```
