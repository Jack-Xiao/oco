项目 oco，你在 Mac mini 执行机上无人值守运行，工作目录就是仓库根，分支 mini/t005-chip（基线：本机卡 13 分支 + 本提示词；setup 与 build 已由脚本完成，补丁链 0001–0028 已套进 vendor；E2E 服务器用 `~/oco-bin/opencode`，run-task 已设 `OCO_OPENCODE_BIN`）。用户不在：不要提问，遇到阻塞用 `bash scripts/mini/notify.sh "<一句话>"` 通知后继续。

目标：确认 t005 修正。卡 13 分支上 t005 第 6 步 `concurrent-permissions-routed` 之前 FAIL 的原因已查明：第 4 步全选 math.ts 后编辑器选区一直在，第 6 步从主面板 A 发 bash 提示时自动选区 chip（设置 `oco.draft.attachSelection` 默认开）跟着发出，mock 模型把消息各段文本无分隔拼接，`use the bash tool to run exactly:` 的正则把文件第一行也吞进命令（`… {`），bash 语法错误，输出里没有 `perm-A-111`。修正：`tests/e2e/t005.mjs` 的 `launch` 加了 `settings: { "oco.draft.attachSelection": false }`（t005 只测手动 chip，自动路径由 c33 覆盖）。本轮只跑 t005 两次并记录，不改任何测试。

跑法：E2E 互斥锁 `/tmp/oco-e2e.lock`（mkdir 锁，`pid` 文件记持有者），等锁、起 mock 服务器、跑套件、关服务器、放锁在同一条 Bash 命令里完成（这台机器没有 `timeout` 命令，用 `perl -e 'alarm shift; exec @ARGV' 600 node tests/e2e/run.mjs t005`；mock 服务器照上一个任务 mini-t005-main 的方式起停）。只读 `docs/evidence/p0-artifacts/t005-results.json`，不看截图。

唯一写入范围：`docs/evidence/mini-t005-chip.md`（新）、`docs/evidence/runs/`、`docs/evidence/p0-artifacts/t005-*`（t005 自己会覆盖）。不改产品代码、测试、vendor、patches；不改 STATUS / NEXT / PROGRESS；不推送 origin；不合入 main；不用 pkill / killall。
验收：evidence 写明两次运行里 9 个用例的 PASS / FAIL（重点 `selection-into-chosen-draft`、`server-received-unsaved-buffer`、`concurrent-permissions-routed` 的 detail）与 results.json 路径。
预算：最多 15 轮工具调用 / 25 分钟。checkpoint：`docs/evidence/mini-t005-chip.md` 首轮落盘，每次运行后更新。
结束：`git add docs/evidence/mini-t005-chip.md docs/evidence/runs docs/evidence/p0-artifacts && git commit -m "evidence: t005 with attachSelection off on the card 13 branch (9/9 expected)"`（不推送）；`bash scripts/mini/notify.sh "mini-t005-chip 完成：t005 <通过数>/9 ×2"`。
报告 ≤10 行：两次运行各用例结果、evidence 路径。不贴日志。
