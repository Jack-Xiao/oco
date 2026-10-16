# mini-t005-chip：t005 在卡 13 分支上 attachSelection 关闭后复跑

分支 mini/t005-chip，E2E 服务器 `~/oco-bin/opencode`（mock 模型），只跑 `tests/e2e/t005.mjs`（`oco.draft.attachSelection=false`），未改任何测试/产品代码。

| 运行 | 耗时 | 套件 exit | 用例 |
| --- | --- | --- | --- |
| 1 | 174s | 0 | 9/9 PASS |
| 2 | 173s | 0 | 9/9 PASS |

两次均 PASS：three-sessions, draft-isolation+hide-restore, dedupe-open, selection-into-chosen-draft, server-received-unsaved-buffer, concurrent-permissions-routed, image-bytes-to-server, reload-window-restore, close-tab-not-cancel。

重点 detail（两次相同）：
- selection-into-chosen-draft：`{bHasChip:true,bKeptOldDraft:true,aClean:true,cClean:true,notAutoSent:true}`
- server-received-unsaved-buffer：`{hasMarker:true,hasFileBody:true}`
- concurrent-permissions-routed：`{pendingBoth:2,cDockShowsC:true,aDockShowsA:true,A:"completed",C:"error"}`（C 的 error 是 bash 工具部件被拒的预期值）

结论：第 6 步此前的 FAIL 由自动选区 chip 混入 bash 命令造成，关闭 attachSelection 后在卡 13 分支稳定 PASS。

## 结果路径
- `docs/evidence/p0-artifacts/t005-results.json`（运行 2 覆盖；运行 1 副本 /tmp/t005chip-1-results.json）
- `docs/evidence/runs/`：本次未新增。

## 委派记录
task_id: mini-t005-chip；本机执行机直接运行（Mac mini，无外部委派，纯命令执行）；状态：验收通过。
