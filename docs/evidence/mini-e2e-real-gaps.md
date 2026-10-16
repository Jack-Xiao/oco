# mini e2e-real-gaps

范围: mock 确认 c10/c11/c12/c18/c19/c24 + overnight-e2e.sh 清单
开始: 2026-10-16 21:43:07
提交: 882291a
结束: 2026-10-16 21:49:00

## 基线与环境
提交 882291a（基线 37da6f9）；模式 mock；端口 4567 / 4568；opencode `~/oco-bin/opencode`。

## Dry-run
- `overnight-e2e.sh --dry-run`：21 个套件，顺序与期望一致：c6-inbox c10-sidebar-answer c11-sidebar-organize c12-new-session-draft c13-worktree-inbox c14-review-notes c15-fix-with-opencode c16-sidebar-stop c17-subagent-aggregate c18-permission-note c19-label-snooze c20-inbox-nav c21-follow c22-review-threads c23-subagent-pills c24-runtime-question p1b-sidebar p1b-narrow c5-runtime c4-trajectory visual-light-sidebar
- `--real --dry-run`：15 个套件，与期望一致（上面 21 个去掉 c6 c16 c17 c18 c21 c23）：c10 c11 c12 c13 c14 c15 c19 c20 c22 c24 p1b-sidebar p1b-narrow c5-runtime c4-trajectory visual-light-sidebar

## mock 套件（汇总 docs/evidence/runs/overnight-20261016-214310/summary.md，6 个 exit 0）
| 套件 | exit | PASS/FAIL/NOT RUN/N/A | 重跑 | results.json |
| --- | --- | --- | --- | --- |
| c19-label-snooze | 0 | 5/0/0/0 | 不需要 | docs/evidence/runs/20261016-134313-c19-label-snooze-d780/results.json |
| c12-new-session-draft | 0 | 13/0/0/0 | 不需要 | docs/evidence/runs/20261016-134335-c12-new-session-draft-71b6/results.json |
| c10-sidebar-answer | 0 | 6/0/0/0 | 不需要 | docs/evidence/runs/20261016-134406-c10-sidebar-answer-80ad/results.json |
| c11-sidebar-organize | 0 | 6/0/2/0（NOT RUN 为设计内） | 不需要 | docs/evidence/runs/20261016-134414-c11-sidebar-organize-62d4/results.json |
| c24-runtime-question | 0 | 3/0/0/0 | 不需要 | docs/evidence/runs/20261016-134431-c24-runtime-question-f4d6/results.json |
| c18-permission-note | 0 | 2/0/0/0 | 不需要 | docs/evidence/runs/20261016-134441-c18-permission-note-320c/results.json |

## 第 3 步修复
无（无失败）。

## 第 4 步 c19 real
未跑：官方 opencode 1.18.33 模型探针（nemotron-3.5-lightning-free，90 秒限时）只输出 "build · nemotron-3.5-lightning-free"，无 OK，疑似免费模型停滞；按"不通就跳过"处理，未再重探。

## 限制
只跑 mock；real 下的改动（c10/c11/c12/c24 的 REAL 分支、c19 real N/A）未验证，等下一轮 mini-real。
