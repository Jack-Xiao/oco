项目：~/Ai-Project/oco-mini（分支 mini/mini-regress，基线 main 3f89430 = 卡 6 + 卡 7 合入后的 main）。目标：合入 main 后的一次默认 mock E2E 回归（NEXT「常驻」项），只记录结果。

步骤：
1. run-task 已做 `bun run setup && bun run build`。把回归放到后台：`nohup bash scripts/overnight-e2e.sh --mock > ~/oco-mini-logs/mini-regress.e2e.log 2>&1 &`，记下 PID。每 10 分钟 `sleep 600` 后看 `tail -5 ~/oco-mini-logs/mini-regress.e2e.log` 和 `ls -t docs/evidence/runs/ | head -1`，直到本次 `docs/evidence/runs/overnight-*/summary.md` 出现且进程退出。整批约 60–120 分钟。
2. 读 summary.md。每个 FAIL 套件单独重跑一次：`node tests/e2e/run.mjs <suite>`（只读 results.json，不看截图）。重跑通过 = 偶发；仍失败 = 稳定失败。
3. 稳定失败：只在明显是测试侧问题时修一次（tests/e2e/ 内），再跑一次；产品侧问题只记录文件与现象，不改产品代码。
4. 写 `docs/evidence/mini-regress-main.md`：基线、命令、每套件 PASS/FAIL、重跑结果、稳定失败清单（现象 + 疑似位置）、总耗时。首轮先落盘一个 checkpoint（范围 + 开始时间），每个子目标后更新。

唯一写入范围：`docs/evidence/mini-regress-main.md`、`docs/evidence/runs/`、`tests/e2e/`（仅测试侧修复）。不改 STATUS / NEXT / PROGRESS，不改产品代码，不推送 origin，不合入 main。
验收：summary.md 存在；evidence 文件列出每个套件结果与重跑结果。
预算：最多 30 轮工具调用 / 180 分钟。不用 pkill / killall；只停自己记下 PID 的进程。
结束：按路径 `git add docs/evidence/mini-regress-main.md docs/evidence/runs tests/e2e && git commit -m "test(mini): post-merge mock regression on main 3f89430"`（不推送）。然后 `bash scripts/mini/notify.sh "mini-regress 完成：<通过数>/<总数>，稳定失败 <n>"`。
报告 ≤15 行：套件通过 / 失败数、稳定失败列表、evidence 路径、耗时。不要粘贴日志。
