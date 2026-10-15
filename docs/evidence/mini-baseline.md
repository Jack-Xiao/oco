# mini-baseline
范围: main 基线跑 p1b-narrow / c5-runtime。开始: 2026-10-16 01:57:51
结束: 2026-10-16 ~02:10。分支 mini/mini-baseline（main 3f89430 + run-task.sh 修复，产品代码同 main）。模型模式 mock（与默认回归一致：`OCO_E2E_MODEL=mock bash scripts/test-server.sh`）。

## 无效运行（环境问题，不计入）
最初 4 次运行（p1b-narrow ×2、c5-runtime ×1–2）全部 `fetch failed`（layout-* / run）：隔离测试服务器 :4517 没有启动（run-task 只做 setup + build，不启服务）。日志在 `docs/evidence/runs/mini-baseline/failed-no-server/`。随后手动启动 mock 隔离服务器（server.log），重跑。

## 有效运行
| 套件 | 运行 | 结果 | 失败用例 | results.json |
| --- | --- | --- | --- | --- |
| p1b-narrow | 1 | PASS（12/12，含 deny-260 / question-260） | — | runs/20261015-180124-p1b-narrow-651e |
| c5-runtime | 1 | FAIL | think-card（其余 PASS） | runs/20261015-180301-c5-runtime-71e2 |
| c5-runtime | 2 | FAIL | think-card（其余 PASS） | runs/20261015-180553-c5-runtime-efef |

c5-runtime think-card 两次均为宽度抖动 `337 → 342 → 344`（thinkRects 457,456,337 / 342 / 344 / 344，36 采样）。

## 结论
- p1b-narrow：main 基线一次 PASS，deny-260 / question-260 未复现。cc-features 上的失败不是 main 固有，与 cc-features 改动相关（或属偶发；仅 1 次通过，不能排除低频竞态）。
- c5-runtime：main 基线稳定复现 think-card 337→344 抖动（2/2）。与 cc-features 上的失败一致，是 main 已有问题，非 cc-features 引入。
- 委派：本批为 Claude 子代理/mini 执行机上的纯运行与记录，无外部路线委派。
