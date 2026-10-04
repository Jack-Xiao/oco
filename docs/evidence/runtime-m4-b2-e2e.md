# Runtime M4 Batch 2 E2E Checkpoint

- **Task**: Adapt `tests/e2e/c5-runtime.mjs` for M4 Batch 2 loop SVG orbit (回环航道), run both en/zh with mock LLM.
- **Port config**: OCO_TEST_PORT=4637, OCO_MOCK_LLM_PORT=4638, OCO_TEST_URL=http://127.0.0.1:4637
- **Model**: OCO_E2E_MODEL=mock
- **Analysis completed**:
  1. Identified contract updates from `docs/evidence/runtime-m4-batch2.md` and `vendor/opencode/packages/app/src/components/session/`.
  2. Identified removed DOM attributes: `data-oco-runtime-lane`, `data-oco-runtime-roster`, `data-oco-runtime-fill`, `data-oco-runtime-edge`, `data-oco-runtime-tool-toggle`, `data-oco-runtime-rail`.
  3. Identified new DOM attributes: `data-oco-runtime-loop`, `data-oco-runtime-probe`, `data-oco-runtime-probe-stage`, `data-oco-runtime-probe-slot`, `data-oco-runtime-probe-zone`, `data-oco-runtime-probe-selected`, `data-oco-runtime-beam`, `data-oco-runtime-absorbed`, `data-oco-runtime-handoff`, `data-oco-runtime-handoff-open`, `data-oco-runtime-stop`, `.oco-loop-anim`.
  4. Mapped all 37 checks:
     - `subagent`: Probe click -> selected, handoff id, enter child session via handoff-open, return via breadcrumb, no roster on left.
     - `keyboard`: Tab to probe (role="button"), Enter to select, Esc to cancel; 0 nested buttons, live region text.
     - `motion-on` & `reduced-motion`: Test `.oco-loop-anim` animationName !== 'none' and reduced-motion animationName === 'none'.
     - `mechanism`: Loop container and core state, handoff box.
     - `width-420`, `width-560`, `width-wide`, `width-1600`: Responsive stack vs wide layout, no overflow, top bar single line, ~600px no scrolling, summary visible.
     - `parallel-subagents`: 3 parallel tasks: probe stage running >= 3, loop-core waiting, then all 3 absorbed, absorbed attr = 3.
     - `focus-stable` & `focus-on-change`: Probe slot/zone stability, DOM node not recreated, activeElement preserved.
     - `geometry-stable`: Main node, think box, loop box, handoff box rects stable across running, done, and replay.
     - `legend`: 5 probe states (running, waiting, failed, absorbed, flow) in en/zh.
     - `summary`: "Subagents N (n running / m blocked)" in en/zh.
     - `fill`: Background tasks without retrieving (docked + beacon) and with retrieving (absorbed + beam polling + handoff return & open).
     - `stop`: Icon button with `[data-oco-runtime-stop]`, aria-label = "Stop" / "停止".
     - Left bar has no `[data-oco-runtime-roster]`.
  5. Refinements applied:
     - `send`: Added input element scroll-into-view, focus, and explicit clearing before typing to eliminate prompt leakage across tests.
     - `tool-turn` & `perm-approve`: Removed literal `\n` in bash printf commands to avoid premature enter triggers.
     - `replay-no-actions`: Added frame scroll top reset and robust permission cleanup.
     - `keyboard`: Extended docked probe wait to 30s with 200ms poll interval.
- **Current status**: Launching English run (`c5-runtime.mjs`).
