项目 oco（OpenCode 的 VS Code 客户端），你在 Mac mini 执行机上无人值守运行，工作目录就是仓库根（~/Ai-Project/oco-mini，分支 mini/mini-real-1190 = 本机 main 提交本提示词后的状态；setup 与 build 已由脚本完成，补丁链已套进 vendor）。

目标：补 mini-real 没跑的一块——公共 npm 版 opencode 1.19.0 的真实模型验证（NEXT §1「[NOT RUN] 1.19.0 公共 npm 二进制的真实模型子集」）。`VERIFIED_SERVERS` 已含 1.19.0，但依据只有 mini-compat 的 mock 41 套件 0 失败；mini-real（2026-10-16，`docs/evidence/mini-real.md`）只用官方 1.18.33 跑了 21 套件。本任务把 1.19.0 装到独立目录，用与 mini-real 相同的模型、相同的方法跑其中 9 个不依赖 mock 口令的套件，与 1.18.33 的结果逐套件对照，回答一个问题：真实模型下 1.19.0 与 1.18.33 相比有没有不兼容。只记录结果，不修任何代码。方法参照 `docs/mini/mini-real.md`（环境文件 / 模型探针 / 链脚本 / 失败用例类别 A–D 的定义看它的第 4 步），1.18.33 基线只读 `docs/evidence/mini-real.md`。

9 套件（括号内是它们在 mini-real 证据表里的序号）：
- 对照 PASS 组（1.18.33 终态 PASS）：c13-worktree-inbox（#5）c15-fix-with-opencode（#7）c20-inbox-nav（#12）c22-review-threads（#14）c4-trajectory（#20）visual-light-sidebar（#21）。1.18.33 下 c13 / c20 / c4-trajectory 首轮失败、重跑通过（偶发）。
- 版本无关失败对照组（1.18.33 终态 FAIL，原因与服务端版本无关）：c11-sidebar-organize（#3，todo-badge，A 小模型不写 todo）、c12-new-session-draft（#4，send-reply-shown / worktree-reply-fast，A）、c19-label-snooze（#11，`run` 崩溃，C 测试台缺陷 `run.recordNotApplicable` 不存在）。这组看失败用例集合是否与 1.18.33 一致。
- 不跑：依赖 mock 口令的 c6 c16 c17 c18 c21 c23；失败原因另有的 c5 c10 c14 c24 p1b-sidebar p1b-narrow。证据里的结论要写明样本范围就是这 9 套件。

步骤：
0. 先落盘 checkpoint：`docs/evidence/mini-real-1190.md`（范围、`date '+%F %T'` 开始时间、`git rev-parse --short HEAD`）。
1. 安装 1.19.0 与环境（失败就 `bash scripts/mini/notify.sh "<一句话>"`，不开跑，直接跳到第 7 步写 BLOCKED 证据）：
   a. 另建目录安装；不动 `~/oco-bin/official`（1.18.33）、`~/oco-bin/opencode`、`~/oco-bin/env.sh`，不 `npm i -g`：
      ```
      mkdir -p ~/oco-bin/official-1190 && (cd ~/oco-bin/official-1190 && npm i --save-exact opencode-ai@1.19.0 2>&1 | tail -5; npm ls opencode-ai 2>&1 | head -4; grep -H '"version"' node_modules/opencode-*/package.json; ./node_modules/.bin/opencode --version; npm view opencode-ai version)
      ```
      括号是子 shell，别 `cd` 离开仓库根（Bash 调用之间工作目录会保留，之后的 `bash scripts/...` 都要在 ~/Ai-Project/oco-mini 里跑）。`--version` 必须恰为 1.19.0；`opencode-ai` 与平台二进制包（opencode-darwin-*）的 version 也应都是 1.19.0；`npm view` 的最新版只作记录。
   b. 把环境写进 `~/oco-mini-logs/mini-real-1190.env`（Bash 调用之间环境变量不保留，之后每条命令前都 `. ~/oco-mini-logs/mini-real-1190.env`）：
      ```
      . ~/oco-bin/env.sh   # VS Code 路径、端口 4527/4528、OCO_TEST_URL；它把 OCO_OPENCODE_BIN 设成 vendor 包装脚本，下面几行覆盖
      export OCO_OPENCODE_BIN="$HOME/oco-bin/official-1190/node_modules/.bin/opencode"
      export OCO_TEST_PORT=4547 OCO_MOCK_LLM_PORT=4548
      export OCO_TEST_URL=http://127.0.0.1:4547
      export OCO_E2E_REAL_MODEL=opencode/nemotron-3.5-lightning-free
      export PATH="$HOME/oco-bin/official-1190/node_modules/.bin:$PATH"
      ```
2. 预检（任何一项失败：notify，不开跑，跳到第 7 步写 BLOCKED 证据）：
   a. `"$OCO_OPENCODE_BIN" --version` 必须是 1.19.0。
   b. `lsof -nP -iTCP:4547 -iTCP:4548 -sTCP:LISTEN` 应为空；被别的进程占着就不要杀，改用 4557 / 4558（env 文件里 OCO_TEST_PORT、OCO_MOCK_LLM_PORT、OCO_TEST_URL 三处一起改）。4517 / 4518（oco-mini 的遗留服务）和 4527 / 4528（~/Ai-Project/oco 的遗留服务）都不要动。
   c. `bash scripts/overnight-e2e.sh --real --dry-run c15-fix-with-opencode c22-review-threads visual-light-sidebar c13-worktree-inbox c20-inbox-nav c4-trajectory c11-sidebar-organize c12-new-session-draft c19-label-snooze` 应列出 9 行、port 为 4547（或你改用的端口）。
   d. 备份服务端状态库（只复制，尽力而为）：`mkdir -p ~/oco-mini-logs/oco-test-db-pre-1190 && cp -p .oco-test/xdg/data/opencode/opencode.db* ~/oco-mini-logs/oco-test-db-pre-1190/`。`scripts/test-server.sh` 固定用仓库内 `.oco-test`，1.19.0 服务端会打开 1.18.33 官方二进制留下的同一份 `opencode.db`（等于一次升级路径）；证据里记一句。
   e. 模型探针（隔离目录，不碰 ~/.config/opencode；本机没有 `timeout`，用 perl alarm）：
      ```
      T=$(mktemp -d /tmp/oco-probe.XXXXXX); mkdir -p $T/h $T/c/opencode $T/d $T/s $T/k
      sed -e "s#\"model\": \"[^\"]*\"#\"model\": \"$OCO_E2E_REAL_MODEL\"#" scripts/test-server.opencode.json > $T/c/opencode/opencode.json
      (cd $T && env -i PATH="$PATH" HOME=$T/h XDG_CONFIG_HOME=$T/c XDG_DATA_HOME=$T/d XDG_STATE_HOME=$T/s XDG_CACHE_HOME=$T/k OPENCODE_DISABLE_AUTOUPDATE=1 perl -e 'alarm 90; exec @ARGV' "$OCO_OPENCODE_BIN" run "Reply with the single word OK.") 2>&1 | tail -5; rm -rf $T
      ```
      输出里有 OK 才算通过。免费模型会偶发停滞（mini-real 预检第 1 次 90 秒无输出、5 分钟后恢复）：无输出就等 5 分钟再探一次，共最多 3 次。仍不通：把 env 文件里的模型换成 `opencode/big-pickle` 再探一次；通了就用它跑，并在证据里每一处都标明「nemotron 停滞，改用 big-pickle」（与 1.18.33 基线模型不同，对照结论要降级）；还不通就 notify + 第 7 步写 BLOCKED。
3. 把下面的链脚本写成 `~/oco-mini-logs/mini-real-1190-chain.sh`，后台运行并记 PID（`--lock-wait 1200`：/tmp/oco-e2e.lock 被别的 E2E 占着最多等 20 分钟，仍占着就由脚本退出，证据里写 BLOCKED）：
   ```
   #!/usr/bin/env bash
   . ~/oco-mini-logs/mini-real-1190.env
   cd ~/Ai-Project/oco-mini || exit 1
   START=$(date +%s); echo "chain start $(date '+%F %T')"
   bash scripts/overnight-e2e.sh --real --lock-wait 1200 c15-fix-with-opencode c22-review-threads visual-light-sidebar c13-worktree-inbox c20-inbox-nav c4-trajectory
   bash scripts/overnight-e2e.sh --real --lock-wait 1200 c11-sidebar-organize c12-new-session-draft c19-label-snooze
   # 前两批里每个 FAIL（或崩溃无 results.json）的套件各重跑一次
   FAILS=$(for S in $(grep -h '^summary:' ~/oco-mini-logs/mini-real-1190.e2e.log | awk '{print $2}'); do
     awk -F'|' '$2 ~ /^ *[0-9]+ *$/ && ($5+0)!=0 && (($8+0)>0 || $8 ~ /\?/) {gsub(/ /,"",$3); print $3}' "$S"; done | sort -u | tr '\n' ' ')
   echo "rerun list: ${FAILS:-none}"
   if [ -n "$FAILS" ] && [ $(( $(date +%s) - START )) -lt 3000 ]; then bash scripts/overnight-e2e.sh --real --lock-wait 1200 $FAILS; else echo "rerun skipped (none, or elapsed over 50 min)"; fi
   echo "chain done $(date '+%F %T')"
   ```
   `nohup bash ~/oco-mini-logs/mini-real-1190-chain.sh > ~/oco-mini-logs/mini-real-1190.e2e.log 2>&1 & echo $! > ~/oco-mini-logs/mini-real-1190.pid`
4. 轮询：Bash 带 `timeout` 600000，命令 `sleep 570; date +%H:%M; grep -E '^(===|---|chain|rerun|done:|summary:)' ~/oco-mini-logs/mini-real-1190.e2e.log | tail -4`，直到出现 `chain done`。轮询只做这一件事（30 轮预算里留约 8 轮给它）。单个套件超过 30 分钟没有新的 `===` / `---` 行只记录，不干预。预算（120 分钟 / 30 轮）耗尽仍未结束：就用已有结果写证据并标注未跑完的套件，用 `kill $(cat ~/oco-mini-logs/mini-real-1190.pid)` 停链脚本，再对它的 overnight-e2e.sh 子进程（`pgrep -P <链 PID>`）同样 kill；只停记录的 PID，不用 pkill / killall 按名字杀。
5. 读结果并逐套件对照（只读各 `summary.md` 和 results.json，不看截图、不贴日志）：
   a. 1.19.0 的三份 summary 路径来自 `grep -h '^summary:' ~/oco-mini-logs/mini-real-1190.e2e.log`（批 1、批 2、重跑）。1.18.33 基线只读 `docs/evidence/mini-real.md` 表里这 9 行（`grep -E '^\| (3|4|5|7|11|12|14|20|21) \|' docs/evidence/mini-real.md`）和「稳定失败清单」里 c11 / c12 / c19 的行，每格里先是首轮、后是重跑的 results.json（目录在 `docs/evidence/runs/`，已随 main 签出）。
   b. 校验每份 1.19.0 results.json：`serverVersion` 必须是 1.19.0、`modelMode` 是 real，`model` 记实际值（不凭环境变量写）：`for f in <各 results.json>; do node -e 'const j=require(process.argv[1]);console.log(j.suite,j.serverVersion,j.modelMode,j.model,j.vscodeVersion,JSON.stringify(j.summary))' "$f"; done`。`serverVersion` 不是 1.19.0 的结果作废（多半是复用了旧服务），查原因后重跑该套件。
   c. 用例级差异（终态那一轮 vs 1.18.33 终态那一轮）：
      `node -e 'const f=p=>new Map((require(p).results||[]).map(r=>[r.id,r.status]));const [a,b]=process.argv.slice(1).map(f);for(const id of new Set([...a.keys(),...b.keys()]))if(a.get(id)!==b.get(id))console.log(id,"1.19.0=",a.get(id)??"-","1.18.33=",b.get(id)??"-");console.log("compared",a.size,b.size)' <1.19.0 的 results.json 绝对路径> <1.18.33 的 results.json 绝对路径>`
      看某个 results.json 里非 PASS 用例的 detail：`node -e 'const j=require(process.argv[1]);for(const r of j.results||[])if(r.status!=="PASS")console.log(r.status,r.id,JSON.stringify(r.detail).slice(0,200))' <results.json>`
   d. 逐套件判定（写进证据表「判定」列）：
      - 一致：终态相同，且终态 FAIL 的套件失败用例 id 集合相同。
      - 偶发路径不同：终态相同，但首轮 / 重跑路径不同（如 1.18.33 首轮 FAIL → 重跑 PASS，而 1.19.0 首轮就 PASS）。不算不兼容。
      - 待查：终态不同；或同为 FAIL 但失败用例 id 集合不同；或 1.19.0 出现 1.18.33 没有的 FAIL 用例。进第 6 步。
   e. 如果多个套件的失败都停在「等助手第一个输出」超时，疑似免费模型停滞 / 限流：标 BLOCKED（不算版本差异），用第 2 步 e 的探针确认是否恢复，恢复了就把这些套件单独再跑一次（`bash scripts/overnight-e2e.sh --real <套件…>`，同样先 `. ~/oco-mini-logs/mini-real-1190.env`）。
6. A/B 对照（只对「待查」套件；链开始起已用时 ≤ 90 分钟才做，超了就把它们标「待查，未做 A/B」写进限制）：同一时段、同一模型，把服务端换成官方 1.18.33（`~/oco-bin/official`，只读使用）再跑一次。写成 `~/oco-mini-logs/mini-real-1190-ab.sh` 后台运行并记 PID（C4 之类的套件可能超过 10 分钟，不要前台跑）：
   ```
   #!/usr/bin/env bash
   . ~/oco-mini-logs/mini-real-1190.env
   export OCO_OPENCODE_BIN="$HOME/oco-bin/official/node_modules/.bin/opencode"
   export PATH="$HOME/oco-bin/official/node_modules/.bin:$PATH"
   cd ~/Ai-Project/oco-mini || exit 1
   echo "ab start $(date '+%F %T') $("$OCO_OPENCODE_BIN" --version)"
   bash scripts/overnight-e2e.sh --real --lock-wait 1200 <待查套件…>
   echo "ab done $(date '+%F %T')"
   ```
   启动前确认链已 `chain done` 且 `lsof -nP -iTCP:4547 -sTCP:LISTEN` 为空（否则脚本会复用 1.19.0 的服务）。日志 `~/oco-mini-logs/mini-real-1190.ab.log`，轮询同第 4 步（终止条件 `ab done`）。校验 A/B 的 results.json `serverVersion` 必须是 1.18.33。注意 A/B 时 `opencode.db` 已被 1.19.0 打开过（降级路径），证据里记一句。判定：
   - A/B 的 1.18.33 也出现同样的失败 → 与版本无关（模型 / 环境波动），判「A/B 同败，非版本差异」。
   - A/B 的 1.18.33 PASS，而 1.19.0 两轮都在同一用例 FAIL → 判「疑似 1.19.0 差异」：写出套件:用例、断言位置（文件:行）、results.json 里的现象，能看出原因（事件形状 / 接口字段 / 超时）就一并写；不修。
   - A/B 的 1.18.33 PASS，而 1.19.0 一轮 FAIL 一轮 PASS → 判「样本不足」，不下版本结论。
7. 写 `docs/evidence/mini-real-1190.md`：
   - 基线：提交（`git rev-parse --short HEAD`）、安装命令与 `npm ls` / 平台包 / `--version` 输出（1.19.0）、`npm view` 的最新版、实际模型与 `serverVersion`（取自 results.json）、VS Code 版本、开始 / 结束时间与总耗时、端口、探针次数与结果、各批命令与 summary 路径、状态库备份路径与那句升级路径说明。委派记录一行：本批为 mini 机无人值守脚本任务，未委派子代理。
   - 表「9 套件：1.19.0 与 1.18.33」，正好 9 行，顺序 c11 c12 c13 c15 c19 c20 c22 c4-trajectory visual-light-sidebar：序号 | 套件 | 1.19.0 首轮（PASS/FAIL/NOT RUN/N/A，耗时）| 1.19.0 重跑 | 1.19.0 终态 | 1.18.33 首轮 | 1.18.33 重跑 | 1.18.33 终态 | 失败用例 id（1.19.0 ‖ 1.18.33）| 判定 | 1.19.0 results.json。1.18.33 各列抄自 `docs/evidence/mini-real.md`，不重算。
   - 差异明细：每个判定不是「一致」的套件一小段（失败用例 id、两个版本各自的现象、类别 A–D 沿用 mini-real 归因、是否做了 A/B 及其结果）。
   - A/B 对照表（做了才有）：套件 | 1.19.0 首轮 / 重跑 | A/B（1.18.33）| 判定。
   - 结论：① 版本核对（所有 1.19.0 results.json 的 serverVersion / modelMode / model）；② 9 套件里「一致 / 偶发路径不同 / 疑似 1.19.0 差异 / 同败非版本 / 样本不足 / BLOCKED」各几个；③ 一句话结论，三选一：「真实模型下（这 9 套件）未发现 1.19.0 与 1.18.33 的不兼容」/「发现差异：<套件:用例>」/「BLOCKED：<原因>」。
   - 限制与未查项：样本只是 9 套件（不含 mock 口令套件，以及 c5 c10 c14 c24 p1b-*，c25–c33 也没有真实模式），每套件至多两轮（A/B 一轮），同一份状态库，未看截图，没有改任何代码。
8. 提交（`docs/evidence/runs/*` 被 .gitignore，必须 `git add -f`，只加 summary.md 与 results.json）：
   ```
   git add -f docs/evidence/mini-real-1190.md
   for S in $(cat ~/oco-mini-logs/mini-real-1190.e2e.log ~/oco-mini-logs/mini-real-1190.ab.log 2>/dev/null | grep -h '^summary:' | awk '{print $2}'); do git add -f "$S"; grep -o 'docs/evidence/runs/[^ |]*results.json' "$S" | sort -u | xargs git add -f; done
   git commit -m "test(mini): real-model 1.19.0 subset (public npm opencode 1.19.0, <实际模型>)"
   ```
   不推送。结束前确认链脚本（和 A/B 脚本）已完成或已停掉。最后 `bash scripts/mini/notify.sh "mini-real-1190 完成：9 套件终态 PASS <n> / FAIL <n>；与 1.18.33 差异：<无 / 套件列表>；结论：<一句>；模型 <实际模型>，opencode <版本>"`；BLOCKED 时通知写明阻塞原因。

唯一写入范围：`docs/evidence/mini-real-1190.md`、`docs/evidence/runs/`（E2E 脚本自动写）、`~/oco-mini-logs/` 下的临时文件、`~/oco-bin/official-1190/`（新建，只用来装 opencode-ai@1.19.0）。不改 tests/e2e、产品代码、vendor、patches、scripts、STATUS / NEXT / PROGRESS、`docs/evidence/mini-real.md`；不改全局配置（不读写 ~/.config/opencode、~/.local/share/opencode，不 `npm i -g`，不碰 `~/oco-bin/official`、`~/oco-bin/opencode`、`~/oco-bin/env.sh`）；不推送 origin，不合入 main；不用 pkill / killall，只停自己记下 PID 的进程；不动 4517 / 4518、4527 / 4528 上遗留的服务。发现测试侧或产品侧问题只记录文件:行与现象，不修。
验收：evidence 文件的表正好 9 行，每行有 1.19.0 与 1.18.33 的结果和判定，附结论三选一；基线里的 opencode 版本、模型取自实际返回（`--version`、results.json），不凭环境变量写。
预算：最多 30 轮工具调用 / 120 分钟。首次可用工具轮次先写 checkpoint，之后每个子目标（安装与预检、链结束、A/B 结束）更新一次。
报告 ≤15 行：9 套件终态 PASS / FAIL 数、与 1.18.33 有差异的套件及判定、A/B 结果、结论（有无不兼容）、BLOCKED 项、evidence 路径、总耗时、实际模型与 opencode 版本。不要粘贴日志。
