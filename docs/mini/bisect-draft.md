项目 oco（OpenCode 的 VS Code 客户端），你在 Mac mini 执行机上无人值守运行，工作目录就是仓库根（~/Ai-Project/oco-mini，分支 mini/bisect-draft = 本机 main 提交本提示词后的状态；setup 与 build 已由脚本完成）。

目标：二分定位一个 mock 回归，找出第一个坏提交，读它的改动，写出疑似根因（文件:行）与修复方案。**只提案，不修产品代码、不改 patches / vendor。**

症状（mock 与 real 同败，与模型无关；约定见 docs/evidence/mini-regress-1016.md、mini-real.md）：
- `tests/e2e/c14-review-notes.mjs` 的 `draft-acked`：详情 `{acksBefore:0, acks:4, rejects:0, pending:0}`，断言要求恰好 +1。
- `tests/e2e/p1b-sidebar.mjs` 的 `chain-draft`：详情 `{draftHead:"", sentMessages:0}`（composer 里没有选区文本）。
- 好端点 **8d2d9db**（mini-card7，2026-10-14，c14 6/0、p1b-sidebar 13/0）；坏端点 **5750dae**（卡 10 + 12 合入；regress-1016、mini-real 的 mock 对照在其后都失败）。区间共 68 个提交（`git rev-list --count 8d2d9db..5750dae`），含卡 8 键位、卡 9–13、补丁 0026–0028。

⚠ 环境混淆：mini 的 VS Code 约在 2026-10-15 11:23（Info.plist 修改时间）由 1.109.5 更新到 1.142.0（可执行文件名 Electron→Code）；8d2d9db 的好结果出自 1.109.5，所有失败都出自 1.142.0。反证：卡 12 会话 2026-10-16 09:49（+0800）在同一台 mini（1.142.0）上记过 p1b-sidebar 13/13（docs/evidence/card12-bookmarks.md:57）；那时卡 13（d04ad9d，12:25 才合入 main）还不在该分支上，卡 11（ffc311c，09:24）可能在，所以更像代码回归，嫌疑偏向卡 13。脚本因此先在**今天的 mini** 上重判两个端点；好端点今天就失败 = 环境（VS Code 1.142.0 / 测试台）而非代码回归，不二分，按下面第 5 步的「端点分支」写证据。

脚本（已提交在 scripts/mini/，已在合成历史上演练过，勿改）：`bisect-e2e.sh <好> <坏> [分钟]`（逐用例：先判两个端点，再 `git bisect run`）和 `bisect-e2e-test.sh`（单个候选：`bun run setup && bun run build` → `overnight-e2e.sh --mock c14-review-notes p1b-sidebar`，失败的套件重跑一次；按「非 docs 树」指纹缓存，只差 docs 的提交共用结论；退出码 0 好 / 1 坏 / 125 跳过）。因为检出会在候选提交间切换，脚本必须放在仓库外运行。

步骤：
0. 先落盘 checkpoint：`docs/evidence/mini-bisect-draft.md`（范围、`date '+%F %T'` 开始时间、`git rev-parse --short HEAD`、VS Code 版本 `/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "/Applications/Visual Studio Code.app/Contents/Info.plist"`）。它是未跟踪文件，切换检出不受影响。
1. 环境写进 `~/oco-mini-logs/bisect-draft.env`（Bash 调用之间环境变量不保留，之后每条命令前都 `. ~/oco-mini-logs/bisect-draft.env`）：
   ```
   . ~/oco-bin/env.sh   # OCO_VSCODE_BIN、OCO_OPENCODE_BIN（vendor 包装脚本）；它设的端口 4527/4528 下一行覆盖
   export OCO_TEST_PORT=4557 OCO_MOCK_LLM_PORT=4558 OCO_TEST_URL=http://127.0.0.1:4557
   export BISECT_DIR=$HOME/oco-mini-logs/bisect-draft
   ```
   4517/4518/4527/4528 上是前任务遗留的服务（跑着旧代码），**不要动**，也不要复用：本任务只用 4557/4558。
2. 预检（失败就 `bash scripts/mini/notify.sh "<一句话>"`，不开跑，直接跳到第 7 步写 BLOCKED 证据）：`lsof -nP -iTCP:4557 -iTCP:4558 -sTCP:LISTEN` 应为空；`git merge-base --is-ancestor 8d2d9db 5750dae`；`git status --short --untracked-files=no` 应为空；`[ -x "$OCO_OPENCODE_BIN" ] && [ -x "$OCO_VSCODE_BIN" ]`。
3. 复制脚本并后台运行（预算 120 分钟）：
   ```
   mkdir -p ~/oco-mini-logs/bisect-draft && cp scripts/mini/bisect-e2e.sh scripts/mini/bisect-e2e-test.sh ~/oco-mini-logs/bisect-draft/
   nohup bash -c '. ~/oco-mini-logs/bisect-draft.env; cd ~/Ai-Project/oco-mini && exec bash ~/oco-mini-logs/bisect-draft/bisect-e2e.sh 8d2d9db 5750dae 120' > ~/oco-mini-logs/bisect-draft.chain.log 2>&1 & echo $! > ~/oco-mini-logs/bisect-draft.pid
   ```
   链运行期间**工作树归脚本所有**：不要 checkout / 改文件 / 构建 / 提交；读历史只用 `git show <sha>:路径`、`git diff`、`git log`，不要 cat 工作树文件（它是某个候选提交的版本）。
4. 轮询：Bash 带 `timeout` 600000，命令 `sleep 570; date +%H:%M; grep -E '^(===|endpoint|chain|spec=)|RESULT|first bad commit' ~/oco-mini-logs/bisect-draft.chain.log | tail -6`，直到出现 `chain done`（预计 60–90 分钟；轮询只做这一件事，40 轮预算里留约 14 轮给它）。端点判完后把 checkpoint 更新一次。单个候选超过 30 分钟没有新输出只记录；120 分钟仍未结束：`kill $(cat ~/oco-mini-logs/bisect-draft.pid)` 并对其子进程（`pgrep -P`）同样 kill，只停记录的 PID，不用 pkill / killall 按名字杀，然后 `git bisect reset; git checkout -q mini/bisect-draft`，用已有结果写证据并标注未完成。
5. 读结果（只读 `$BISECT_DIR/chain.result`、`$BISECT_DIR/verdicts.tsv`、`bisect-*.out`，不看截图）。`chain.result` 每个用例一行，`status=` 的含义：
   - `first-bad sha=…`：该用例的第一个坏提交（所有父提交均判好）。进入第 6 步。若两个用例的第一个坏提交不同，各自分析。
   - `good-ref-not-good rc=…`（端点分支）：看 `rc=`。`1` = 好端点 8d2d9db 在今天的 mini（VS Code 1.142.0）上也失败，**不是代码回归**：从该端点 summary 的 results.json 抄出失败详情，对比 docs/evidence/runs/20261014-193021-c14-review-notes-b5d8/results.json（好运行，VS Code 1.109.5）的 `vscodeVersion` 与用例详情；写明「环境导致，需要在 VS Code ≤1.141.0 上对照」，不要下载其他 VS Code 版本，不做第 6、7 步，由本机会话决定下一步。`125` = 构建失败或用例没记录（看 `$BISECT_DIR/logs/8d2d9db.build.log`、`8d2d9db.run1.log` 末尾），那是测试台问题，如实写 BLOCKED，不要当环境结论。`200` = 时限已到。
   - `bad-ref-not-bad rc=…`：坏端点今天没复现（`0` 偶发或与时间/状态有关；`125` 同上是测试台问题）：按 verdicts.tsv 的 first>second 写明，不二分，结束。
   - `only-skipped-left` / `aborted` / `checkout-failed`：列出被跳过的提交（`$BISECT_DIR/bisect-*.log`、`~/oco-mini-logs/bisect-draft.chain.log`）和原因（`logs/<sha>.build.log`、`logs/<sha>.run1.log` 末尾），给出能确定的最窄区间。
   - 第一个坏提交若是合并提交（`git rev-list --parents -n1 <sha>` 有两个父提交）：两个父提交各自判好、合并后坏 = 交互效应，用 `git diff <sha>^1 <sha> --stat` 与 `git diff <sha>^2 <sha> --stat` 看两侧各带来什么。
6. 分析第一个坏提交 B（只用 `git show` / `git diff` 读，先 `--stat` 再按路径取片段，通常 ≤80 行；失败详情用 verdicts.tsv 里的 results.json）：
   - 已知线索（**未验证**，只是读 diff 的方向，以实际 diff 与运行结果为准；B 也可能是别的提交）：
     a. `draftAcks` 在 apps/extension/src/panels.ts 的 `draft.ack` 分支（约 :410）对每个 ok 的确认累加；卡 13（bb25a93 / d04ad9d）新增的自动选区 chip（apps/extension/src/attach-selection.ts，设置 `oco.draft.attachSelection` 默认 true，`handleSelection` 约 :118，选区变化 250 ms 防抖后向 main 面板发 `auto` chip 的 DraftInsert）也走同一条确认路径；c14 的 openFileToSide / addNoteAt 会多次改变选区，可能解释 acks 0→4（1 次评审备注 + 3 次自动 chip）。
     b. `oco.addSelectionToDraft`（attach-selection.ts 约 :180）现在发 chip 形式的 DraftInsert（补丁 0028 的附件药丸）；p1b-sidebar 的 chain-draft 断言 composer 文本含 "export function add"，内容进药丸后 draftHead 为空。t005 为此在 launch 里关掉了自动 chip（tests/e2e/t005.mjs:13，`settings: { "oco.draft.attachSelection": false }`），c33 覆盖药丸流程。
     c. 卡 11 的 Git 动作（5d0395b）也向 main 面板草稿写入，可对照。
   - 写出：B 的 sha / 主题 / 作者 / 日期；疑似根因（文件:行，一句话因果链）；修复方案至少两条（产品侧 / 测试侧各一条，推荐哪条与理由，预计改动文件与大小，是否影响 c33 / t005 / c12 / c32 等其他套件）；说明为什么 c14 与 p1b-sidebar 是同一个根因还是两个。
7. 确认实验（可选；仅当已用时 ≤ 150 分钟；最多 2 次 E2E 运行）：`git checkout -q --detach <B> && bun run setup && bun run build`，对 c14-review-notes.mjs 和 p1b-sidebar.mjs 的 `launch(...)` 调用**临时**加 `settings: { "oco.draft.attachSelection": false }`（先 `grep -n 'launch(' tests/e2e/c14-review-notes.mjs tests/e2e/p1b-sidebar.mjs` 看调用形式；若 B 不是卡 13，改成你的修复方案里最小的临时改动，测试侧优先），`. ~/oco-mini-logs/bisect-draft.env; bash scripts/overnight-e2e.sh --mock c14-review-notes p1b-sidebar`，读两个用例结果；立刻 `git checkout -q -- . && git checkout -q mini/bisect-draft`，确认 `git status --short --untracked-files=no` 为空。判读：c14 通过 = 自动 chip 解释了确认计数；p1b chain-draft 仍失败 = 手动命令改成药丸本身也让该断言过时（另一个原因）。结果写进证据，临时改动**绝不提交**。
8. 写 `docs/evidence/mini-bisect-draft.md`：
   - 基线：提交、两端点、mini 的 VS Code 版本（取自 results.json 的 vscodeVersion）、opencode 包装脚本版本、开始 / 结束时间与总耗时、命令（第 3 步原样）。
   - 端点核对表（好 / 坏端点 × 两个用例：首轮>重跑、results.json 路径）。
   - 二分过程表：verdicts.tsv 逐行（sha、主题、两个用例 首轮>重跑、结论）。
   - 第一个坏提交（逐用例）：sha、主题、作者、日期、父提交结果；**重现命令**（可复制）：`git checkout --detach <B> && bun run setup && bun run build && . ~/oco-mini-logs/bisect-draft.env && bash scripts/overnight-e2e.sh --mock c14-review-notes p1b-sidebar`，以及 `<B>^` 通过的同款命令；单提交判定也可用 `BISECT_PREDICATE=any bash scripts/mini/bisect-e2e-test.sh`。
   - 疑似根因（文件:行）、修复方案、确认实验结果（NOT RUN 要写原因）。
   - 限制与未查项（例如 VS Code 版本轴没有隔离、被跳过的提交）。
9. 提交（`docs/evidence/runs/*` 被 .gitignore，必须 `git add -f`，只加 verdicts.tsv 里两个端点、第一个坏提交及其父提交那几行引用的 summary.md 与对应 results.json）：
   ```
   cp ~/oco-mini-logs/bisect-draft/verdicts.tsv docs/evidence/mini-bisect-draft.verdicts.tsv
   git add docs/evidence/mini-bisect-draft.md docs/evidence/mini-bisect-draft.verdicts.tsv
   git add -f <上述 summary.md 与 results.json>
   git commit -m "test(mini): bisect draft-acked / chain-draft regression (first bad <sha 或 环境结论>)"
   ```
   不推送。提交前 `git branch --show-current` 应为 mini/bisect-draft。最后 `bash scripts/mini/notify.sh "bisect-draft 完成：c14 第一个坏提交 <sha 主题>；p1b <sha 主题>；根因 <一句话>"`（端点分支 / 阻塞时写明结论）。

唯一写入范围：`docs/evidence/mini-bisect-draft.md`、`docs/evidence/mini-bisect-draft.verdicts.tsv`、`docs/evidence/runs/`（E2E 脚本自动写）、`~/oco-mini-logs/` 下的临时文件；第 7 步对 tests/e2e 的临时改动提交前必须还原。不改 STATUS / NEXT / PROGRESS，不改产品代码、vendor（`bun run setup` 的补丁重放除外）、patches、公共契约、全局配置（不读写 ~/.config/opencode、~/.local/share/opencode），不推送 origin，不合入 main；不用 pkill / killall，只停自己记下 PID 的进程（4557/4558 上自己起的服务除外也只按 PID 停）；不动 4517/4518/4527/4528 上遗留的服务。
验收：证据文件写明第一个坏提交（逐用例）+ 重现命令 + 疑似根因（文件:行）+ 修复方案；或端点分支 / 阻塞的明确结论与依据。
预算：最多 40 轮工具调用 / 180 分钟（链脚本自带 120 分钟上限）。首次可用工具轮次先写 checkpoint，之后每个子目标（端点判完、链结束、分析完）更新一次。
报告 ≤15 行：每个用例的第一个坏提交（sha 主题）、一句话根因、修复方案要点、确认实验结果、证据路径、总耗时、被跳过的提交数。不要粘贴日志。
