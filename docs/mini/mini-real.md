项目 oco（OpenCode 的 VS Code 客户端），你在 Mac mini 执行机上无人值守运行，工作目录就是仓库根（~/Ai-Project/oco-mini，分支 mini/mini-real = 本机 main 提交本提示词后的状态；setup 与 build 已由脚本完成，补丁链已套进 vendor）。

目标：真实模型全量 E2E（NEXT §1「真实模型全量 21 套件」，卡 8 决定按免费模型方案执行）。测试服务端用官方 opencode 1.18.33（`~/oco-bin/official/node_modules/.bin/opencode`，避开 vendor 源码服务端对 opencode/big-pickle 的 403），模型 `opencode/nemotron-3.5-lightning-free`（环境变量 `OCO_E2E_REAL_MODEL`，935ad43 起 E2E real 模式读服务端配置的模型）。只记录结果，不修任何代码。

21 套件 = c6-inbox c10-sidebar-answer c11-sidebar-organize c12-new-session-draft c13-worktree-inbox c14-review-notes c15-fix-with-opencode c16-sidebar-stop c17-subagent-aggregate c18-permission-note c19-label-snooze c20-inbox-nav c21-follow c22-review-threads c23-subagent-pills c24-runtime-question p1b-sidebar p1b-narrow c5-runtime c4-trajectory visual-light-sidebar。
`overnight-e2e.sh --real` 默认只有 13 个套件，并自动跳过 c6 / c16 / c17（mock 专属），所以分两批：默认 `--real` 批（10 个）+ 显式列出的另外 8 个（c18–c24、visual-light-sidebar）；c6 / c16 / c17 在表里记 N/A（mock 专属，被脚本跳过）。

步骤：
0. 先落盘 checkpoint：`docs/evidence/mini-real.md`（范围、`date '+%F %T'` 开始时间、`git rev-parse --short HEAD`）。把环境写进 `~/oco-mini-logs/mini-real.env`（Bash 调用之间环境变量不保留，之后每条命令前都 `. ~/oco-mini-logs/mini-real.env`）：
   ```
   . ~/oco-bin/env.sh   # VS Code 路径、端口 4527/4528、OCO_TEST_URL；它把 OCO_OPENCODE_BIN 设成 vendor 包装脚本，下一行覆盖
   export OCO_OPENCODE_BIN="$HOME/oco-bin/official/node_modules/.bin/opencode"
   export OCO_E2E_REAL_MODEL=opencode/nemotron-3.5-lightning-free
   export PATH="$HOME/oco-bin/official/node_modules/.bin:$PATH"
   ```
1. 预检（失败就 `bash scripts/mini/notify.sh "<一句话>"`，不开跑，直接跳到第 7 步写 BLOCKED 证据）：
   a. `"$OCO_OPENCODE_BIN" --version` 必须是 1.18.33。
   b. `lsof -nP -iTCP:4527 -iTCP:4528 -sTCP:LISTEN` 应为空；被别的进程占着就不要杀，改用 4537 / 4538（env 文件里 OCO_TEST_PORT、OCO_MOCK_LLM_PORT、OCO_TEST_URL 三处一起改）。4517 / 4518 上是前任务遗留的服务，不要动。
   c. `bash scripts/overnight-e2e.sh --real --dry-run` 应列出 10 个套件。
   d. 模型探针（隔离目录，不碰 ~/.config/opencode）：
      ```
      T=$(mktemp -d /tmp/oco-probe.XXXXXX); mkdir -p $T/h $T/c/opencode $T/d $T/s $T/k
      sed -e "s#\"model\": \"[^\"]*\"#\"model\": \"$OCO_E2E_REAL_MODEL\"#" scripts/test-server.opencode.json > $T/c/opencode/opencode.json
      (cd $T && env -i PATH="$PATH" HOME=$T/h XDG_CONFIG_HOME=$T/c XDG_DATA_HOME=$T/d XDG_STATE_HOME=$T/s XDG_CACHE_HOME=$T/k OPENCODE_DISABLE_AUTOUPDATE=1 timeout 90 "$OCO_OPENCODE_BIN" run "Reply with the single word OK.") 2>&1 | tail -5; rm -rf $T
      ```
      输出里有 OK 才算通过。免费模型 2026-10-16 凌晨停滞过一次（`opencode run` 45 秒无输出）：无输出就等 5 分钟再探一次，共最多 3 次。仍不通：把 env 文件里的模型换成 `opencode/big-pickle` 再探一次；通了就用它跑，并在证据里每一处都标明「nemotron 停滞，改用 big-pickle」；还不通就 notify + 第 7 步写 BLOCKED。
2. 把下面的链脚本写成 `~/oco-mini-logs/mini-real-chain.sh`，后台运行并记 PID：
   ```
   #!/usr/bin/env bash
   . ~/oco-mini-logs/mini-real.env
   cd ~/Ai-Project/oco-mini || exit 1
   START=$(date +%s); echo "chain start $(date '+%F %T')"
   bash scripts/overnight-e2e.sh --real
   bash scripts/overnight-e2e.sh --real c18-permission-note c19-label-snooze c20-inbox-nav c21-follow c22-review-threads c23-subagent-pills c24-runtime-question visual-light-sidebar
   # 前两批里每个 FAIL（或崩溃无 results.json）的套件各重跑一次
   FAILS=$(for S in $(grep -h '^summary:' ~/oco-mini-logs/mini-real.e2e.log | awk '{print $2}'); do
     awk -F'|' '$2 ~ /^ *[0-9]+ *$/ && ($5+0)!=0 && (($8+0)>0 || $8 ~ /\?/) {gsub(/ /,"",$3); print $3}' "$S"; done | sort -u | tr '\n' ' ')
   echo "rerun list: ${FAILS:-none}"
   if [ -n "$FAILS" ] && [ $(( $(date +%s) - START )) -lt 10800 ]; then bash scripts/overnight-e2e.sh --real $FAILS; else echo "rerun skipped (none, or elapsed over 180 min)"; fi
   echo "chain done $(date '+%F %T')"
   ```
   `nohup bash ~/oco-mini-logs/mini-real-chain.sh > ~/oco-mini-logs/mini-real.e2e.log 2>&1 & echo $! > ~/oco-mini-logs/mini-real.pid`
3. 轮询：Bash 带 `timeout` 600000，命令 `sleep 570; date +%H:%M; grep -E '^(===|---|chain|rerun|done:|summary:)' ~/oco-mini-logs/mini-real.e2e.log | tail -4`，直到出现 `chain done`。轮询只做这一件事（40 轮预算里留约 24 轮给它）。单个套件超过 45 分钟没有新的 `===` / `---` 行只记录，不干预。预算（240 分钟 / 40 轮）耗尽仍未结束：就用已有结果写证据并标注未跑完的套件，用 `kill $(cat ~/oco-mini-logs/mini-real.pid)` 停链脚本，再对它的 overnight-e2e.sh 子进程（`pgrep -P <链 PID>`）同样 kill；只停记录的 PID，不用 pkill / killall 按名字杀。
4. 读结果（只读各 `summary.md` 和 results.json，不看截图、不贴日志）。三份 summary 路径来自 `grep -h '^summary:' ~/oco-mini-logs/mini-real.e2e.log`；先读 `docs/evidence/real-model-2026-10-16.md` 的「归因表」「重跑」两节作归因参照，本轮结果与其一致的直接写「同 10-16 归因」，不再深查。看某个 results.json 里非 PASS 的用例：
   `node -e 'const j=require(process.argv[1]);for(const r of j.results||[])if(r.status!=="PASS")console.log(r.status,r.id,JSON.stringify(r.detail).slice(0,200));console.log("missingRequired",JSON.stringify(j.missingRequired),"model",JSON.stringify(j.model))' <results.json 的绝对路径>`
   分类规则：
   - 套件结果三档：PASS（exit 0）；FAIL（有 FAIL 用例或崩溃）；N/A（被 --real 跳过的 c6 / c16 / c17，或结果只有 NOT RUN / N/A 且原因是 mock 守卫，如 `not a mock server`）。
   - 失败用例类别：A 模型行为（小模型不调用工具 / 不遵循提示 / 太慢）；B 测试只支持 mock（提示词含 mock 口令，全大写连字符，如 THREE-SUBAGENTS-NEED-PERMISSION、WITH-SLOW-SIBLING，口令表见 tests/e2e/lib/mock-llm.mjs，grep 即可）；C 环境、测试台或 UI 偶发；D 疑似产品缺陷（必须有依据：mock 下同样失败，或界面行为明显错）。
   - 首轮 FAIL、重跑 PASS = 偶发；同一套件同一用例 id 两轮都 FAIL = 稳定失败；两轮失败用例不同 = 不稳定（各列 id，不进稳定失败清单）；类别 B 的用例记 N/A（mock 口令），不进稳定失败清单。
   - 如果多个套件的失败都停在「等助手第一个输出」超时，疑似免费模型停滞 / 限流：标 BLOCKED（不算稳定失败），用第 1 步 d 的探针确认是否恢复，恢复了就把这些套件单独再跑一次（`bash scripts/overnight-e2e.sh --real <套件…>`）。
5. 可选对照（已用时 ≤ 150 分钟才做）：稳定失败的套件若不依赖模型输出（c12–c15、p1b-sidebar、p1b-narrow 的布局类用例），用 `bash scripts/overnight-e2e.sh --mock <套件>` 在 mock 下各跑一次：mock 也失败 → 与模型无关（类别 C 或 D），mock 通过 → 真实模式特有。
6. 写 `docs/evidence/mini-real.md`：
   - 基线：提交、`"$OCO_OPENCODE_BIN" --version`、实际模型（取自 results.json 的 model 字段，不凭环境变量写）、VS Code 版本（results.json 的 vscodeVersion）、开始 / 结束时间与总耗时、各批命令、三份 summary 路径。
   - 表「21 套件结果」：序号 | 套件 | 结果（PASS / FAIL / N/A）| PASS/FAIL/NOT RUN/N/A 计数 | 首轮耗时 | 重跑结果 | 类别 | 失败用例 id | results.json 路径。必须正好 21 行。
   - 稳定失败清单：套件 | 用例 | 现象（一行）| 类别 | 疑似位置（文件:行）。其后列「偶发」「不稳定」「N/A 用例（mock 口令）」「BLOCKED」。
   - 遗留 NOT RUN：c10 / c11 results.json 里的 NOT RUN 用例（如 archive-batch、delete-batch）及原因；「真实模型压缩目视」没有套件，保持 NOT RUN。
   - 限制与未查项。
7. 提交（`docs/evidence/runs/*` 被 .gitignore，必须 `git add -f`，只加这几类）：
   ```
   git add -f docs/evidence/mini-real.md
   for S in $(grep -h '^summary:' ~/oco-mini-logs/mini-real.e2e.log | awk '{print $2}'); do git add -f "$S"; grep -o 'docs/evidence/runs/[^ |]*results.json' "$S" | sort -u | xargs git add -f; done
   git commit -m "test(mini): real-model full E2E (official opencode 1.18.33, <实际模型>)"
   ```
   不推送。结束前确认链脚本已完成（日志里有 `chain done`）或已停掉。最后 `bash scripts/mini/notify.sh "mini-real 完成：PASS <n> / FAIL <n>（稳定 <m>）/ N/A <k>，共 21 套件，模型 <实际模型>"`；BLOCKED 时通知写明阻塞原因。

唯一写入范围：`docs/evidence/mini-real.md`、`docs/evidence/runs/`（E2E 脚本自动写）、`~/oco-mini-logs/` 下的临时文件。不改 tests/e2e、产品代码、vendor、patches、STATUS / NEXT / PROGRESS，不改全局配置（不读写 ~/.config/opencode、~/.local/share/opencode），不推送 origin，不合入 main；不用 pkill / killall，只停自己记下 PID 的进程；不动 4517 / 4518 上遗留的服务。发现测试侧或产品侧问题只记录文件:行与现象，不修。
验收：evidence 文件的表正好 21 行，每行结果为 PASS / FAIL / N/A 之一，附稳定失败清单；基线里的模型和 opencode 版本取自实际返回。
预算：最多 40 轮工具调用 / 240 分钟。首次可用工具轮次先写 checkpoint，之后每个子目标（预检、两批结束、重跑结束）更新一次。
报告 ≤15 行：PASS / FAIL / N/A 套件数、稳定失败列表（套件:用例:类别）、BLOCKED 项、evidence 路径、总耗时、实际模型。不要粘贴日志。
