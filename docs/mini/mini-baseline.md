项目：~/Ai-Project/oco-mini（分支 mini/mini-baseline = main 3f89430 + `scripts/mini/run-task.sh` 包装脚本修复；产品代码与 main 完全相同）。目标：给 cc-features 批次默认回归里的两个失败套件做 main 基线对照，只跑、只记录，不修任何东西。

步骤：run-task 已做 setup + build，并已设 `OCO_OPENCODE_BIN=$HOME/oco-bin/opencode`；不要 source `~/oco-bin/env.sh`。mini 没有 `timeout` 命令，用 `perl -e 'alarm 900; exec @ARGV' node tests/e2e/run.mjs <suite>` 包裹。依次运行 `p1b-narrow` 与 `c5-runtime`：通过一次即记 PASS；失败则再跑一次并记两次的失败用例名。只读 results.json，不看截图。

唯一写入范围：`docs/evidence/mini-baseline.md`、`docs/evidence/runs/`。不改测试、不改产品代码、不推送、不合入 main。
验收：evidence 列出两套件每次运行的 PASS / FAIL 与失败用例名，并给结论：与 cc-features 分支上的失败（p1b-narrow：deny-260 / question-260；c5-runtime：think-card 宽度 337→344 抖动）是否一致。
预算：最多 15 轮工具调用 / 40 分钟。checkpoint：evidence 首轮落盘（范围 + 开始时间）。
结束：`git add docs/evidence/mini-baseline.md docs/evidence/runs && git commit -m "test(mini): main baseline for p1b-narrow / c5-runtime"`（不推送）；`bash scripts/mini/notify.sh "mini-baseline 完成：<一句话结论>"`。报告 ≤10 行。
