# mini-bisect-draft — c14 `draft-acked` / p1b-sidebar `chain-draft` 二分

结论：两个用例的第一个坏提交相同，**bb25a93**（card 13：composer chip + 自动选区 chip）。**不是环境问题**：好端点 8d2d9db 在今天的 mini（VS Code 1.142.0）上 c14 6/0、p1b-sidebar 13/0 通过。

## 基线
- 分支 mini/bisect-draft（HEAD 2d24bab），好 8d2d9db，坏 5750dae（区间 68 个提交）。
- VS Code 1.142.0（本轮所有 results.json）；对照好运行 20261014-193021 为 1.109.5。opencode 包装脚本：`~/oco-bin/opencode`，`--version` 无输出（unknown）。vendor 固定 v1.18.33（51ef4be）。
- 开始 21:03，结束 21:38（含确认实验），总耗时约 35 分钟。链运行 1 在 21:03–21:11；链运行 2（21:14–21:34，19 分钟）。
- 命令：第 3 步原样（`bisect-e2e.sh 8d2d9db 5750dae 120`）。

## 测试台问题（已绕过，需修脚本）
链运行 1：端点判完（好/坏正确），但二分内每个中间提交都 `build=FAIL`：`git bisect run` 给子进程导出 `GIT_DIR`，`bisect-e2e-test.sh` 里 `git -C vendor/opencode ...` 命中父仓库，setup.sh 报 `vendor/opencode is at <父仓库提交>, expected 51ef4be`，全部 skip，`only-skipped-left`。处置：只在 `~/oco-mini-logs/bisect-draft/` 的脚本副本里加 `unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_PREFIX GIT_COMMON_DIR`，bisect reset 后重跑（链运行 2）。**仓库里的 scripts/mini/bisect-e2e-test.sh 仍有此缺陷，需本机会话补同样一行。** verdicts.tsv 含链运行 1 的 build=FAIL 行（可忽略）。

## 端点核对（首轮>重跑）
| 提交 | c14 draft-acked | p1b chain-draft | summary |
| --- | --- | --- | --- |
| 8d2d9db 好 | PASS | PASS（c14 6/0，p1b 13/0） | runs/overnight-20261016-210356 |
| 5750dae 坏 | FAIL>FAIL | FAIL>FAIL | runs/overnight-20261016-210616 |

## 二分过程（链运行 2，两个用例走同一条路径）
| 提交 | 主题 | 结论 |
| --- | --- | --- |
| 021c58f | card 9 land | PASS / PASS 好 |
| f77bfcd | c33 composer chip 确认 | FAIL>FAIL 坏 |
| ffc311c | card 11 Git actions | PASS / PASS 好 |
| d695dad | patch 0028 chip label | FAIL>FAIL 坏 |
| bb25a93 | card 13 chip | FAIL>FAIL 坏（父提交 969a4a0 与 ffc311c 只差 docs，判好） |

完整行见 `mini-bisect-draft.verdicts.tsv`。被跳过的提交：链运行 2 为 0 个（链运行 1 的全部 skip 是 GIT_DIR 缺陷）。

## 第一个坏提交（两个用例相同）
bb25a937749fa6f0f23186bb3eef52ddf4fefb88 — card 13: M13 composer chip + attach editor selection — DraftInsert chip (contract), patch 0028 attachment pill, `oco.draft.attachSelection` auto chip, Add Selection to Draft sends a chip。作者 Jack，2026-10-16 10:37 +0800。单父提交（非合并）。

重现：
```
git checkout --detach bb25a93 && bun run setup && bun run build && . ~/oco-mini-logs/bisect-draft.env && bash scripts/overnight-e2e.sh --mock c14-review-notes p1b-sidebar     # 两个都 FAIL
git checkout --detach bb25a93^ && bun run setup && bun run build && . ~/oco-mini-logs/bisect-draft.env && bash scripts/overnight-e2e.sh --mock c14-review-notes p1b-sidebar    # 两个都 PASS
```

## 疑似根因（两个用例，两个相关但不同的机制）
1. c14 `draft-acked`（acks 0→4，要求 +1）：`apps/extension/src/attach-selection.ts:112-177`（`handleSelection`，250 ms 防抖）对每次选区变化向 main 面板 `insertDraft(..., chip{auto:true})`（:161），页面确认后走 `apps/extension/src/panels.ts:392` 的 `draft.ack` 分支，`entry.stats.draftAcks++`。c14 的 openFileToSide / addNoteAt 多次改变选区 → 1 次评审备注 + 3 次自动 chip = 4。
2. p1b `chain-draft`（`{draftHead:"", sentMessages:0}`）：`oco.addSelectionToDraft` 由 `extension.ts` 内联的文本围栏版本换成 `attach-selection.ts:180-208`，发 chip（`auto:false`），补丁 0028 把内容渲染成药丸，不再进入 composer 文本，`tests/e2e/p1b-sidebar.mjs:331` 等 composer 文本含 "export function add"（超时得 undefined），:333 再要求 draft 含 math.ts，药丸模式下文本为空而过时。

## 确认实验（bb25a93，临时改动已还原未提交；1 次运行）
在 c14（:39）与 p1b-sidebar（:44）的 `launch(...)` 加 `settings: { "oco.draft.attachSelection": false }`，`overnight-e2e.sh --mock c14-review-notes p1b-sidebar`（runs/overnight-20261016-213843）：
- c14：6/0 通过 → 自动 chip 解释了确认计数（机制 1 成立）。
- p1b-sidebar：12/1，`chain-draft` 仍 FAIL `{"draftHead":"","sentMessages":0}` → 手动命令改成药丸本身就让该断言过时（机制 2 成立，独立于自动 chip）。
所以是两个原因，同一个提交。

## 修复方案
- c14：**测试侧（推荐）**：c14 `launch` 加 `settings: { "oco.draft.attachSelection": false }`，与 t005 同做法（t005.mjs:13），1 行；理由：该套件测评审备注确认路径，自动 chip 不属其范围。产品侧备选：自动 chip 在 `panels.ts:392` 不计入 `draftAcks`（按 `pending` 项的 `chip.auto` 过滤；注意 `pending` 在此行之后才被过滤），约 3 行，会让 `stats.draftAcks` 语义变为“人为插入”，需检查 c33 / c12 / c32 / t005 是否读该计数（未验证）。
- p1b `chain-draft`：**测试侧（推荐）**：把断言改为检查药丸（label 含 `math.ts`），并同样关掉自动 chip 避免干扰，约 5–10 行，可参照 c33 的药丸断言；产品侧无合理改法（药丸是 card 13 的预期行为）。不影响其他套件。

## 限制与未查项
- 链运行 2 前两次判定（021c58f、f77bfcd）有缓存/指纹复用；未再隔离 VS Code 版本轴，但好端点在 1.142.0 上通过已排除它。
- 产品侧备选方案未实测；未评估其他读取 `draftAcks` 的套件。
- 确认实验仅 1 次运行，无重复。
