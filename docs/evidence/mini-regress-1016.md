# mini regress-1016：合入卡 10 + 12 后的 mock 回归

- 基线：main 5750dae（补丁 0001–0028），分支 mini/regress-1016，HEAD 4f114ec；mock 模式，端口 4517
- 开始 14:28，结束约 15:13，总耗时约 45 分钟（含等待锁）
- 备注：14:27:36 另有一次同参数的默认回归先启动（overnight-20261016-142736，commit 2f56e5d 标注，同一结果：c14/p1b-sidebar/c5 FAIL，p1b-narrow 通过）；本轮的 14:28:36 运行排在其锁后，结果见下。

## 命令
1. `bash scripts/overnight-e2e.sh --mock` → docs/evidence/runs/overnight-20261016-142836/summary.md
2. `bash scripts/overnight-e2e.sh --mock c30-turn-rail c32-bookmarks c33-composer-chip` → docs/evidence/runs/overnight-20261016-145905/summary.md
3. FAIL 套件重跑：`OCO_E2E_MODEL=mock node tests/e2e/run.mjs <套件>`

## 默认回归：9/13 套件通过，4 个 FAIL
| 套件 | 首轮 | 重跑 | 结论 |
| --- | --- | --- | --- |
| c6-inbox, c10, c11（6 PASS/2 NOT RUN）, c12, c13, c15, c16, c17, c4-trajectory | PASS | - | 通过 |
| c14-review-notes | FAIL draft-acked (5/1) | FAIL 同项 | 稳定失败 |
| p1b-sidebar | FAIL chain-draft (12/1) | FAIL 同项 | 稳定失败 |
| p1b-narrow | FAIL allow-260 (11/1) | PASS 12/12 | 偶发（慢，306s vs 96s） |
| c5-runtime | FAIL think-card (43/1) | FAIL 同项 | 已知项（think-card 宽度抖动，main 既有） |

## 三张卡套件
| 套件 | 首轮 | 重跑 |
| --- | --- | --- |
| c30-turn-rail | PASS 7/0 | - |
| c32-bookmarks | FAIL open-same-session-repeat (7/1) | PASS | 已知缺陷项，偶发表现 |
| c33-composer-chip | PASS 5/0 | - |

## 稳定失败清单
- c14-review-notes `draft-acked`：{acksBefore:0, acks:4, rejects:0, pending:0}，评审备注写入草稿的确认计数不符；两次现象一致。疑似位置：评审备注→草稿确认链（c14 测试断言），是否与 0026/0027/0028 相关未查；mini-baseline 与 STATUS 中无此项记录。
- p1b-sidebar `chain-draft`：{draftHead:"", sentMessages:0}，链式草稿未发出；两次一致。疑似位置同为草稿链；未与合入前基线对照，不能判定是回归。
- c5-runtime `think-card`：已知，不计入。
- 未做测试侧修复；未对照合入前基线（后续可在 5750dae 之前的提交上单跑 c14 与 p1b-sidebar 确认是否回归）。
