# mini-t005-main：t005 在 main 969a4a0（无卡 13）上的对照运行

分支 mini/t005-main，E2E 服务器 `~/oco-bin/opencode`（mock 模型），只跑 `tests/e2e/t005.mjs`（旧版）。

| 运行 | 耗时 | 套件 exit | 用例 |
| --- | --- | --- | --- |
| 1 | 173.8s | 0 | 9/9 PASS |
| 2 | 173.3s | 0 | 9/9 PASS |

用例（两次均 PASS）：three-sessions, draft-isolation+hide-restore, dedupe-open, selection-into-chosen-draft, server-received-unsaved-buffer, concurrent-permissions-routed, image-bytes-to-server, reload-window-restore, close-tab-not-cancel。

## concurrent-permissions-routed
- 运行 1 detail：`{pendingBoth:2, cDockShowsC:true, aDockShowsA:true, A:"completed", C:"error"}`
- 运行 2 detail：同上。
- 这里的 `C:"error"` 是 C 会话最后一个 bash **工具部件**的状态（用户在 dock 拒绝/未批准导致的预期 error），测试期望它为 error；A 为 completed。
- C 会话的 assistant 消息 `info.error`：两次运行（运行 2 实测，经 `GET /session/:id/message`）均为 null，`finish=stop`。main 上 C 会话没有 finish=error。运行 1 的错误采集脚本有误（返回空），故会话级错误只在运行 2 取得。
- 结论：该用例在没有卡 13 的 main 上稳定 PASS，C 会话无会话级错误；卡 13 分支上的 FAIL（C 会话 finish=error）是卡 13 引入的回归，不是基线问题。

## 结果路径
- `docs/evidence/p0-artifacts/t005-results.json`（运行 2 覆盖；运行 1 副本在 /tmp/t005ctl-1-results.json，内容一致）
- `docs/evidence/runs/*/results.json`：本次未新增。
