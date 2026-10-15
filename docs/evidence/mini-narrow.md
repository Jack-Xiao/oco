# mini-narrow：p1b-narrow 稳定性（HUD 刷新修复后）

- 基线提交：75c0be9（mini/mini-narrow，含 `refreshHud` 只刷状态栏的修复）
- 模式：mock 模型，隔离测试服务器 :4517，`scripts/overnight-e2e.sh`

## p1b-narrow --loop 5（docs/evidence/runs/overnight-20261016-023527/summary.md）

| # | 结果 | PASS/FAIL | 耗时 |
| --- | --- | --- | --- |
| 1 | PASS | 12/0 | 98s |
| 2 | PASS | 12/0 | 96s |
| 3 | PASS | 12/0 | 96s |
| 4 | PASS | 12/0 | 97s |
| 5 | PASS | 12/0 | 96s |

失败用例：无（deny-260、question-260 均未再出现失败）。

## c28 / c6（docs/evidence/runs/overnight-20261016-024443/summary.md）

- c28-status-hud：PASS 2 / FAIL 0
- c6-inbox：PASS 5 / FAIL 0
- 注：首次直接 `node tests/e2e/run.mjs` 因无测试服务器报 `fetch failed`（环境问题，非产品），改用 overnight-e2e.sh（自带服务器）后通过。

## 结论

p1b-narrow 5/5 通过，c28、c6 通过 → 本分支稳定，可合入 main。限制：仅 mock 模型、单机 5 次样本；未做真实模型运行。

委派记录：本批为纯运行记录，由主线程直接执行（用户指定的单机命令，无可分离的调查）。
