# mini-card13-rerun（卡 13 确认轮，补丁 0028 v2）

开始 2026-10-16 11:41；结束约 12:05。分支 mini/card13-rerun。服务器：run-task 未起 E2E 服务器，由 /tmp/runlock.sh 在锁内临时起 `OCO_E2E_MODEL=mock scripts/test-server.sh`，结束后只 kill 自己起的进程；本机无 `timeout`，用 `perl -e 'alarm 540; exec @ARGV'` 代替。

## 委派记录
task_id=card13-rerun；requested_route=主线程（确认轮，只重跑 + 一行测试侧改动，无可分离调查）；actual=mini 执行机本会话（Sonnet 5.5）；状态=验收通过（c33 5/5，t005 第 4/5 步 PASS）。

## c33-composer-chip（4 required + 可选）
results.json：`docs/evidence/runs/20261016-035156-c33-composer-chip-1f6a/results.json`；日志 `docs/evidence/runs/mini-card13-rerun/c33.log`

| 用例 | 结果 | 关键 detail |
| --- | --- | --- |
| manual-chip | PASS | pill `math.ts:2-3`，editable 不含代码，未发送 |
| send-chip | PASS | filePartCount=1；parts `[text,,] [file,"math.ts:2-3",text/plain] [text,,] [text,,]`；解码 `return a + b }`；发送后 composer 不再有 pill |
| auto-chip | PASS | 三步：选 line 2 出 pill、扩到 2-3 仍一枚、清选区后消失 |
| auto-off | PASS | 8 s 内无自动 pill，手动命令仍出 `math.ts:2` |
| auto-dedupe（可选） | PASS | 点 "Remove attachment" 后同选区不复现 |

## 测试侧改动（仅 tests/e2e/c33-composer-chip.mjs）
1. `focusEditor` 去掉 Go to File 兜底，只点侧边 math.ts 编辑器，返回聊天 frame 的 `visibilityState`；auto-chip 非 visible 即 FAIL。
2. 点击坐标 `x:600` 改为 `x:150`：侧边编辑器 `.view-lines` 宽度仅 353 px，x:600 落在元素外，点不到编辑器（诊断：状态栏无 Ln、Control+G 弹出 "Select an editor" 而非跳行）。
3. pill 判定在 auto-chip / auto-dedupe / send-chip 的 composerStillHasPill 里由 `body` 改为 `[data-component=prompt-input-v2-attachments]` 的 innerText：发送后聊天历史里的用户消息也含 `math.ts:2-3` 标签，会污染 body 判定（step3 永远等不到清空）。
4. send-chip detail 增加 `filePartCount`；auto-chip step1 失败时附 `editorDiag`。
判定标准未放宽。另有一次运行因 `.quick-input-widget` 偶发超时（[FAIL] run，发生在上述 1/2 修好之前的改动轮），重跑后消失。

## t005
results.json：`docs/evidence/runs/mini-card13-rerun/t005-results.json`；日志同目录 `t005.log`
- 第 4 步 selection-into-chosen-draft：PASS（bHasChip、bKeptOldDraft、aClean、cClean、notAutoSent 均 true）
- 第 5 步 server-received-unsaved-buffer：PASS
- 另：第 6 步 concurrent-permissions-routed FAIL（两个 dock 路由正确，但 C 会话 finish=error，A completed），不属于本卡范围，未处理；其余步骤 PASS。
- t005 会覆盖 `docs/evidence/p0-artifacts/t005-*`，已 `git checkout` 还原，不进本次提交。
