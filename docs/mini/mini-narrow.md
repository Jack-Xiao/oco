项目：~/Ai-Project/oco-mini（分支 mini/mini-narrow = claude/cc-features-2026-10-16 最新：会话导出 + 状态栏 HUD + 「HUD 更新不再触发侧栏整表重渲染」修复）。目标：判定 p1b-narrow 在本分支上是否稳定，决定能否合入 main。只跑、只记录，不改任何代码。

背景：本分支上 p1b-narrow 两次失败（deny-260、question-260），main 基线一次 12/12 通过；怀疑原因是 `/provider` 返回时额外触发了一次侧栏整表重渲染，撞上 260px 下的交互。修复已在本分支（`refreshHud` 只刷状态栏）。

步骤：run-task 已做 setup + build 并设 `OCO_OPENCODE_BIN`；不要 source `~/oco-bin/env.sh`；没有 `timeout` 命令，长命令用 `perl -e 'alarm 3000; exec @ARGV' bash ...` 包裹或放后台轮询。
1. `bash scripts/overnight-e2e.sh p1b-narrow --loop 5`（自带隔离测试服务器与 mock 模型；约 15–25 分钟），读 `docs/evidence/runs/overnight-*/summary.md`，记录 5 次各自 PASS / FAIL 与失败用例名。
2. `node tests/e2e/run.mjs c28-status-hud c6-inbox`（各一次，确认 HUD 与收件箱在修复后仍过），只读 results.json。
3. 写 `docs/evidence/mini-narrow.md`：基线提交号、每次结果、结论（5/5 通过 = 可合入；有失败 = 写明用例名与现象）。首轮先落盘 checkpoint。

唯一写入范围：`docs/evidence/mini-narrow.md`、`docs/evidence/runs/`。不改测试、不改产品、不推送、不合入。
预算：最多 20 轮工具调用 / 60 分钟。
结束：`git add docs/evidence/mini-narrow.md docs/evidence/runs && git commit -m "test(mini): p1b-narrow x5 + c28/c6 on cc-features (HUD refresh fix)"`（不推送）；`bash scripts/mini/notify.sh "mini-narrow 完成：p1b-narrow <通过数>/5，c28 <结果>，c6 <结果>"`。报告 ≤10 行。
