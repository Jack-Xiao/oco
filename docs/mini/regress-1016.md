项目 oco（OpenCode 的 VS Code 客户端），你在 Mac mini 执行机上无人值守运行，工作目录就是仓库根（~/Ai-Project/oco-mini，分支 mini/regress-1016 = main __MERGE__：卡 10 轮次侧轨（补丁 0026）+ 卡 12 消息书签（补丁 0027）合入后的 main；setup 与 build 已由脚本完成，补丁链 0001–0028 已套进 vendor；E2E 服务器用 `~/oco-bin/opencode`，run-task 已设好）。

目标：合入后的一次 mock E2E 回归（NEXT「常驻」项），确认 0026 / 0027 / 0028 三个补丁同时在场时既有套件与三张卡的套件都过。只记录结果，不修产品代码。

步骤：
1. 先把默认回归放到后台：`nohup bash scripts/overnight-e2e.sh --mock > ~/oco-mini-logs/regress-1016.e2e.log 2>&1 &`，记下 PID。每 10 分钟 `sleep 600` 后看 `tail -5 ~/oco-mini-logs/regress-1016.e2e.log` 和 `ls -t docs/evidence/runs/ | head -3`，直到 summary.md 出现。
2. 默认回归结束后，再跑三张卡的套件各一次：`bash scripts/overnight-e2e.sh --mock c30-turn-rail c32-bookmarks c33-composer-chip`（同样后台 + 轮询）。
3. 读两份 summary.md。每个 FAIL 套件单独重跑一次：`node tests/e2e/run.mjs <套件>`（只读 results.json，不看截图）。重跑通过 = 偶发；仍失败 = 稳定失败。已知项：c5-runtime think-card 宽度抖动是 main 既有（mini-baseline 已记录）；c32 的 open-same-session-repeat 是已知缺陷（非必需项），这两项只记录不修。
4. 稳定失败：只在明显是测试侧问题时修一次（tests/e2e/ 内），再跑一次；产品侧问题只记录文件与现象。
5. 写 `docs/evidence/mini-regress-1016.md`：基线、命令、每套件 PASS/FAIL、重跑结果、稳定失败清单（现象 + 疑似位置）、总耗时。首轮先落盘一个 checkpoint（范围 + 开始时间），每个子目标后更新。

唯一写入范围：`docs/evidence/mini-regress-1016.md`、`docs/evidence/runs/`、`tests/e2e/`（仅测试侧修复）。不改 STATUS / NEXT / PROGRESS，不改产品代码、vendor、patches，不推送 origin，不合入 main。
验收：两份 summary.md 存在；evidence 文件列出每个套件结果与重跑结果。
预算：最多 30 轮工具调用 / 180 分钟。E2E 命令用 timeout 包裹；不用 pkill / killall，只停自己记下 PID 的进程。
结束：按路径 `git add docs/evidence/mini-regress-1016.md docs/evidence/runs tests/e2e && git commit -m "test(mini): post-merge mock regression on main __MERGE__ (cards 10 + 12 landed)"`（不推送）。然后 `bash scripts/mini/notify.sh "regress-1016 完成：默认 <通过数>/<总数>，c30/c32/c33 <结果>，稳定失败 <n>"`。
报告 ≤15 行：套件通过 / 失败数、稳定失败列表、evidence 路径、耗时。不要粘贴日志。
