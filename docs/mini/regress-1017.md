项目 oco（OpenCode 的 VS Code 客户端），你在 Mac mini 执行机上无人值守运行，工作目录就是仓库根（~/Ai-Project/oco-mini，分支 mini/regress-1017 = 2026-10-16 晚合流后的 main：卡 12 书签「同一书签再次点击不滚动」修复（补丁 0027 重生成，`oco:scroll-to-message`）+ 卡 8 默认 chord 键位两批（`oco.sidebarFocused`，新套件 c34-keybindings）+ real 测试台缺口修复（c10 / c11 / c12 / c18 / c19 / c24 的 real 分支，`overnight-e2e.sh` 默认批次改为 21 个套件）；setup 与 build 已由脚本完成，补丁链 0001–0028 已套进 vendor；E2E 服务器用 `~/oco-bin/opencode`，`run-task.sh` 已设 `OCO_OPENCODE_BIN`）。

目标：合流后的一次 mock E2E 回归（NEXT「常驻」项），确认三条分支同时在场时默认批次与新改动的套件都过。只记录结果，不修产品代码。

步骤：
1. 先把默认回归放到后台：`nohup bash scripts/overnight-e2e.sh --mock > ~/oco-mini-logs/regress-1017.e2e.log 2>&1 &`，记下 PID。默认批次现在是 21 个套件（含 c18–c24 与 visual-light-sidebar）。每 10 分钟 `sleep 600` 后看 `tail -5 ~/oco-mini-logs/regress-1017.e2e.log` 和 `ls -t docs/evidence/runs/ | head -3`，直到 summary.md 出现。
2. 默认回归结束后，再跑本次合流直接改到的套件：`bash scripts/overnight-e2e.sh --mock c32-bookmarks c32-bookmarks c34-keybindings c30-turn-rail c33-composer-chip`（c32 跑两次是为了看重复点击修复是否稳定；同样后台 + 轮询）。
3. 读两份 summary.md。每个 FAIL 套件单独重跑一次：`node tests/e2e/run.mjs <套件>`（只读 results.json，不看截图）。重跑通过 = 偶发；仍失败 = 稳定失败。已知项（只记录不修）：c5-runtime think-card 宽度抖动是 main 既有（mini-baseline）；c14 `draft-acked` 与 p1b-sidebar `chain-draft` 是卡 13 引入的已知回归（bisect-draft 已定位 bb25a93，修复另立卡）。
4. 稳定失败：只在明显是测试侧问题时修一次（tests/e2e/ 内），再跑一次；产品侧问题只记录文件与现象。
5. 写 `docs/evidence/mini-regress-1017.md`：基线（`git rev-parse --short HEAD`）、命令、每套件 PASS/FAIL、重跑结果、稳定失败清单（现象 + 疑似位置）、与 mini-regress-1016 的差异（新增 / 消失的失败）、总耗时。首轮先落盘一个 checkpoint（范围 + 开始时间），每个子目标后更新。

唯一写入范围：`docs/evidence/mini-regress-1017.md`、`docs/evidence/runs/`、`tests/e2e/`（仅测试侧修复）。不改 STATUS / NEXT / PROGRESS，不改产品代码、vendor、patches，不推送 origin，不合入 main。
验收：两份 summary.md 存在；evidence 文件列出每个套件结果与重跑结果，并与 regress-1016 对照。
预算：最多 30 轮工具调用 / 240 分钟。E2E 命令用 timeout 包裹；不用 pkill / killall，只停自己记下 PID 的进程。
结束：按路径 `git add docs/evidence/mini-regress-1017.md docs/evidence/runs tests/e2e && git commit -m "test(mini): post-merge mock regression on main (card 12 repeat fix + card 8 keybindings + real test-bench gaps)"`（不推送）。然后 `bash scripts/mini/notify.sh "regress-1017 完成：默认 <通过数>/21，c32×2/c34/c30/c33 <结果>，稳定失败 <n>"`。
报告 ≤15 行：套件通过 / 失败数、稳定失败列表、evidence 路径、耗时。不要粘贴日志。
