项目 oco，你在 Mac mini 执行机上无人值守运行，工作目录就是仓库根，分支 mini/t005-main（基线 = main 969a4a0，**不含**卡 13；setup 与 build 已由脚本完成；E2E 服务器用 `~/oco-bin/opencode`，run-task 已设 `OCO_OPENCODE_BIN`）。用户不在：不要提问，遇到阻塞用 `bash scripts/mini/notify.sh "<一句话>"` 通知后继续。

目标：对照运行。卡 13 分支上 t005 的第 6 步 `concurrent-permissions-routed` 两次都 FAIL（两个 dock 路由正确，A completed，C 会话 finish=error）。要知道它在没有卡 13 的 main 上是否也失败。只跑 `tests/e2e/t005.mjs`（这个基线上的 t005 是旧版本，第 4 步期望内联文本，不用改），记录结果。

跑法：E2E 互斥锁 `/tmp/oco-e2e.lock`（mkdir 锁，`pid` 文件记持有者），等锁、起 mock 服务器、跑套件、关服务器、放锁在同一条 Bash 命令里完成（这台机器没有 `timeout` 命令，用 `perl -e 'alarm shift; exec @ARGV' 600 node tests/e2e/run.mjs t005` 代替；mock 服务器的起停照 `~/oco-mini-logs` 里上一个任务（mini-card13-rerun）用过的 `/tmp/c33run.sh` 方式，或 `OCO_E2E_MODEL=mock bash scripts/test-server.sh` 后台起、跑完 kill 它的 pid）。跑两次；只读 `docs/evidence/p0-artifacts/t005-results.json` 与 `docs/evidence/runs/*/results.json`，不看截图。

唯一写入范围：`docs/evidence/mini-t005-main.md`（新）、`docs/evidence/runs/`、`docs/evidence/p0-artifacts/t005-*`（t005 自己会覆盖）。不改产品代码、测试、vendor、patches；不改 STATUS / NEXT / PROGRESS；不推送 origin；不合入 main；不用 pkill / killall。
验收：evidence 写明两次运行里每个用例的 PASS / FAIL，特别是 `concurrent-permissions-routed` 的 detail（`A` / `C` 的状态）与 C 会话的错误信息（从 `GET /session/:id` 或 `GET /session/:id/message` 最后一条 assistant 的 `error` 字段取，前 300 字）；results.json 路径。
预算：最多 20 轮工具调用 / 30 分钟。checkpoint：`docs/evidence/mini-t005-main.md` 首轮落盘，每次运行后更新。
结束：`git add docs/evidence/mini-t005-main.md docs/evidence/runs docs/evidence/p0-artifacts && git commit -m "evidence: t005 control run on main 969a4a0 (concurrent-permissions triage)"`（不推送）；`bash scripts/mini/notify.sh "mini-t005-main 完成：concurrent-permissions-routed <结果×2>"`。
报告 ≤12 行：两次运行各用例结果、C 会话错误信息、evidence 路径。不贴日志。
