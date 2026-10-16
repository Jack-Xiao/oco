# mini-card13 — c33 composer chip + auto selection (Mac mini, mock model, 2026-10-16)

委派记录: task=card13-e2e, 写入范围=tests/e2e/c33-composer-chip.mjs、t005 第4步、本文件、docs/evidence/runs/; requested_route=mini 执行机上的 Claude (Sonnet 5.5) 直接执行（无人值守，无外部代理）; 状态=已返回。
环境: run-task 未启动 E2E 服务器，由 /tmp/c33run.sh 在锁内临时起 `OCO_E2E_MODEL=mock scripts/test-server.sh` 并在结束后关闭（本机无 `timeout`，用 perl alarm）。

## c33-composer-chip（required 2/4 通过）
results.json: docs/evidence/runs/20261016-031917-c33-composer-chip-552d/results.json
- manual-chip PASS — pill `math.ts:2-3`；composer 文本 `math.ts:2-3 TS:2-3 Ask anything…`（"TS:2-3" 是 pill 的类型标签）；contenteditable 无代码；userMessages=0。
- send-chip FAIL — 内容送达（file part 的 data: base64 解码为选区原文 `  return a + b\n}`，text part 也含原文），但两个 file part 的 `filename` 都是 `math.ts`（不含 `:2-3`），mime text/plain。parts=[text, file, file, text×4]。发送后 composer 不再含 pill。按任务判定（filename 含 `math.ts:2`）记 FAIL；产品侧：range 没进 filename。
- auto-chip FAIL — **产品缺陷（复现 3 次）**：同一会话里发过任意消息之后，自动 pill 不再出现（状态栏 `Ln 2, Col 15 (14 selected)` 证明编辑器有选区，10 s 内 composer 无 pill）。在全新会话里（发送前）同一流程 PASS：`math.ts:2` → `math.ts:2-3`（attachments 内 `math.ts:` 只出现 1 次）→ ArrowRight 后消失，各步 ~310 ms。证据: 20261016-025911-c33-dbg-6ed4/results.json（auto-chip PASS、auto-dedupe PASS、auto-off PASS）。
- auto-dedupe（可选）主流程 NOT RUN（自动 pill 没出现）；在 dbg 运行里 PASS：aria-label 列表 `["Remove attachment"]`，点 × 后消失，4 s 内不再回来。
- auto-off PASS — 设置 false：8 s 无自动 pill；命令后出现 `math.ts:2`。

测试侧发现: pill 在 `[data-component="prompt-input-v2-attachments"]`，不在 `[data-component="prompt-input"]`（后者就是 contenteditable 本身），所以判断读 `prompt-input-v2`（整个表单）/ attachments / body。manual 命令发生时自动 pill 也会同时存在（键盘选区触发），composer 里可见两枚同文字 pill（dbg 运行记录）。发送后焦点留在 webview，需 `Go to File` 才能让编辑器重新成为 activeTextEditor。

## t005（log: docs/evidence/runs/mini-card13-t005.log）
- 第4步 selection-into-chosen-draft: PASS（`bHasChip:true`；pill 在 attachments 容器里，判定里把该容器文本并入 bDraft，仅限第4步）。
- 第5步 server-received-unsaved-buffer: PASS（hasMarker:true, hasFileBody:true）。
- 其他: concurrent-permissions-routed FAIL（C 会话 error，pendingBoth=2，与本卡无关，首跑即如此）。
