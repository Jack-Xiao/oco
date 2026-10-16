项目 oco（OpenCode 的 VS Code 客户端），你在 Mac mini 执行机上无人值守运行，工作目录就是仓库根（~/Ai-Project/oco-mini，分支 mini/mini-real-1190 = 本机 main 提交本提示词后的状态；setup 与 build 已由脚本完成，补丁链已套进 vendor）。

背景：mini-real 第一阶段（官方 opencode 1.18.33 + 免费模型 `opencode/nemotron-3.5-lightning-free`，21 套件）已在 f5ff439 上跑完并合入 main（docs/evidence/mini-real.md：终态 PASS 6 / FAIL 9 / N/A 6；提示词 docs/mini/mini-real.md）。用户补充：真实模型回归还要验公共 npm 版 opencode 1.19.0（`VERIFIED_SERVERS` 已含 1.19.0，提交 ead5758；此前依据只有 mock 41 套件 0 失败，见 docs/evidence/mini-compat.md）。本次是第二阶段：只跑 1.19.0 子集，同一个免费模型。只记录结果，不修任何代码。

子集 = `p1a-chat c4-trajectory c5-runtime t015-diagnostics`。对照：c4 / c5 在 1.18.33 下的结果已在 docs/evidence/mini-real.md「21 套件结果」表里（c4：首轮 `run` 崩溃偶发、重跑 17/17；c5：两轮均 FAIL，`run` 15 s 超时崩溃，其余用例不稳定，对照本身不稳定）；p1a-chat 与 t015-diagnostics 不在那 21 套件里，所以本次要在 1.18.33 官方二进制上各跑一次作基线。t015 的 `status-version` 用例对 `$(oco-logo)` 与 `$(warning)` 两种图标都判 PASS，所以要读 results.json 里它的 detail（`version`、`statusText`）：1.19.0 已入 VERIFIED_SERVERS，期望 `$(oco-logo) oco`，不再是 `$(warning) oco`。

步骤：
0. 在 `docs/evidence/mini-real.md` 末尾追加一段 `## 1.19.0 子集（opencode-ai@1.19.0，第二阶段）`（只追加，不改已有内容），先落盘 checkpoint：范围、`date '+%F %T'` 开始时间、`git rev-parse --short HEAD`、状态「预检中」；之后每个子目标更新这一段。把环境写进 `~/oco-mini-logs/mini-real-1190.env`（Bash 调用之间环境变量不保留，之后每条命令前都 `. ~/oco-mini-logs/mini-real-1190.env`）：
   ```
   . ~/oco-bin/env.sh   # VS Code 路径、OCO_TEST_URL；它把 OCO_OPENCODE_BIN 设成 vendor 包装脚本、端口设成 4527/4528，下面全部覆盖
   export OCO_OPENCODE_BIN="$HOME/oco-bin/official-1190/node_modules/opencode-darwin-arm64/bin/opencode"
   export OCO_E2E_REAL_MODEL=opencode/nemotron-3.5-lightning-free
   export OCO_TEST_PORT=4537 OCO_MOCK_LLM_PORT=4538 OCO_TEST_URL=http://127.0.0.1:4537
   export PATH="$HOME/oco-bin/official-1190/node_modules/.bin:$PATH"
   ```
1. 装 1.19.0（不全局安装、不碰 `~/oco-bin/official` 里的 1.18.33、不动全局配置）：`mkdir -p ~/oco-bin/official-1190 && cd ~/oco-bin/official-1190 && npm i --save-exact opencode-ai@1.19.0 2>&1 | tail -3`；`ls node_modules` 应有 `opencode-ai` 与 `opencode-darwin-arm64`；`"$OCO_OPENCODE_BIN" --version` 必须是 1.19.0（不是就 notify 并走第 7 步写 BLOCKED）。
2. 预检（失败就 `bash scripts/mini/notify.sh "<一句话>"`，不开跑，跳到第 7 步写 BLOCKED 证据）：
   a. `lsof -nP -iTCP:4537 -iTCP:4538 -sTCP:LISTEN` 应为空；被占就改 4547 / 4548（env 文件里三处一起改）。4517 / 4527 上是前任务遗留的 mock 服务，不要动。
   b. `bash scripts/overnight-e2e.sh --real --dry-run p1a-chat c4-trajectory c5-runtime t015-diagnostics` 应列出 4 个套件。
   c. 模型探针（隔离目录，不碰 ~/.config/opencode；本机没有 `timeout` 命令，用 perl alarm）：
      ```
      T=$(mktemp -d /tmp/oco-probe.XXXXXX); mkdir -p $T/h $T/c/opencode $T/d $T/s $T/k
      sed -e "s#\"model\": \"[^\"]*\"#\"model\": \"$OCO_E2E_REAL_MODEL\"#" scripts/test-server.opencode.json > $T/c/opencode/opencode.json
      (cd $T && env -i PATH="$PATH" HOME=$T/h XDG_CONFIG_HOME=$T/c XDG_DATA_HOME=$T/d XDG_STATE_HOME=$T/s XDG_CACHE_HOME=$T/k OPENCODE_DISABLE_AUTOUPDATE=1 perl -e 'alarm 90; exec @ARGV' "$OCO_OPENCODE_BIN" run "Reply with the single word OK.") 2>&1 | tail -5; rm -rf $T
      ```
      输出里有 OK 才算通过。免费模型会偶发停滞（mini-real 预检第 1 次 90 秒无输出、5 分钟后恢复）：无输出就等 5 分钟再探，共最多 3 次。这次不回退 big-pickle（两个版本的对照必须同一个模型）：3 次都不通就 notify + 第 7 步写 BLOCKED。
3. 把下面的链脚本写成 `~/oco-mini-logs/mini-real-1190-chain.sh`，后台运行并记 PID：
   ```
   #!/usr/bin/env bash
   . ~/oco-mini-logs/mini-real-1190.env
   cd ~/Ai-Project/oco-mini || exit 1
   START=$(date +%s); echo "chain start $(date '+%F %T')"
   echo "== A: 1.19.0 subset"
   bash scripts/overnight-e2e.sh --real p1a-chat c4-trajectory c5-runtime t015-diagnostics
   echo "== B: 1.18.33 baseline (p1a-chat, t015-diagnostics)"
   OCO_OPENCODE_BIN="$HOME/oco-bin/official/node_modules/.bin/opencode" bash scripts/overnight-e2e.sh --real p1a-chat t015-diagnostics
   # 批 A 里每个 FAIL（或崩溃无 results.json）的套件在 1.19.0 上各重跑一次；已用超过 50 分钟就跳过
   SA=$(grep -h '^summary:' ~/oco-mini-logs/mini-real-1190.e2e.log | head -1 | awk '{print $2}')
   FAILS=$(awk -F'|' '$2 ~ /^ *[0-9]+ *$/ && ($5+0)!=0 && (($8+0)>0 || $8 ~ /\?/) {gsub(/ /,"",$3); print $3}' "$SA" | sort -u | tr '\n' ' ')
   echo "rerun list: ${FAILS:-none}"
   if [ -n "$FAILS" ] && [ $(( $(date +%s) - START )) -lt 3000 ]; then echo "== C: 1.19.0 rerun"; bash scripts/overnight-e2e.sh --real $FAILS; else echo "rerun skipped (none, or elapsed over 50 min)"; fi
   echo "chain done $(date '+%F %T')"
   ```
   `nohup bash ~/oco-mini-logs/mini-real-1190-chain.sh > ~/oco-mini-logs/mini-real-1190.e2e.log 2>&1 & echo $! > ~/oco-mini-logs/mini-real-1190.pid`
   批 A 第一份 results.json 出来后核对：`serverVersion` 必须是 1.19.0、`model` 必须是 nemotron；批 B 的 `serverVersion` 必须是 1.18.33。对不上就 notify 并按实际写进证据（版本错了的批次不能算对照）。
4. 轮询：Bash 带 `timeout` 600000，命令 `sleep 540; date +%H:%M; grep -E '^(==|===|---|chain|rerun|done:|summary:)' ~/oco-mini-logs/mini-real-1190.e2e.log | tail -4`（sleep 加后面的 grep 总共别超过 10 分钟），直到出现 `chain done`。轮询只做这一件事。单个套件超过 45 分钟没有新的 `===` / `---` 行只记录，不干预。预算耗尽仍未结束：用已有结果写证据并标注未跑完的套件，`kill $(cat ~/oco-mini-logs/mini-real-1190.pid)` 停链脚本，再对它的 overnight-e2e.sh 子进程（`pgrep -P <链 PID>`）同样 kill；只停记录的 PID，不用 pkill / killall。
5. 读结果（只读各 `summary.md` 和 results.json，不看截图、不贴日志）。三份 summary 路径来自 `grep -h '^summary:' ~/oco-mini-logs/mini-real-1190.e2e.log`（依次是批 A、批 B、批 C）。看某个 results.json 里非 PASS 的用例：
   `node -e 'const j=require(process.argv[1]);for(const r of j.results||[])if(r.status!=="PASS")console.log(r.status,r.id,JSON.stringify(r.detail).slice(0,200));console.log("missingRequired",JSON.stringify(j.missingRequired),"serverVersion",j.serverVersion,"model",JSON.stringify(j.model))' <results.json 的绝对路径>`
   t015 的 status-version：`node -e 'const j=require(process.argv[1]);const r=(j.results||[]).find(x=>x.id==="status-version");console.log(r&&r.status,JSON.stringify(r&&r.detail).slice(0,300),j.serverVersion)' <t015 results.json 的绝对路径>`（1.19.0 与 1.18.33 基线各看一次）。
   分类沿用 docs/evidence/mini-real.md 的口径：失败用例类别 A 模型行为 / B 测试只支持 mock / C 环境、测试台或 UI 偶发 / D 疑似产品缺陷；首轮 FAIL、重跑 PASS = 偶发；同一用例 id 两轮都 FAIL = 稳定失败。版本对照：1.19.0 稳定失败而 1.18.33 对照（c4 / c5 取 mini-real 表里的行，p1a-chat / t015 取本次批 B）同一用例 PASS = 「1.19.0 特有失败（版本相关嫌疑）」，写出现象与疑似位置（文件:行）；两版都失败 = 与版本无关；对照不稳定（如 c5）= 记「对照不稳定，不判版本差异」。免费模型停滞（多个套件都停在等助手第一个输出）记 BLOCKED，不算稳定失败，用步骤 2c 的探针确认恢复后单独再跑。
6. 写证据：把 `docs/evidence/mini-real.md` 末尾那一段补全，只动这一段：
   - 基线：提交、`"$OCO_OPENCODE_BIN" --version`、实际模型（取自 results.json 的 model 字段）、各 results.json 的 serverVersion、VS Code 版本、开始 / 结束时间与总耗时、端口、各批命令与三份 summary 路径、探针结果。
   - 表：套件 | 1.19.0 首轮（PASS/FAIL/NOT RUN/N/A、耗时）| serverVersion | 1.19.0 重跑 | 1.18.33 对照（来源）| 差异 / 类别 | results.json。必须正好 4 行（p1a-chat c4-trajectory c5-runtime t015-diagnostics），每行一个结论：PASS / FAIL / N/A。
   - t015 `status-version`：1.19.0 与 1.18.33 各自的 version、statusText（是否含 `$(warning)`）。
   - 1.19.0 特有失败（版本相关嫌疑）清单：套件:用例、现象、两版对照；没有写「无」。
   - 结论：一句话——真实模型下 1.19.0 相对 1.18.33 有无新增失败 / 不兼容。
   - 限制与未查项（样本小、c5 对照不稳定等）。
7. 提交（`docs/evidence/runs/*` 被 .gitignore，必须 `git add -f`，只加这几类）：
   ```
   git add -f docs/evidence/mini-real.md
   for S in $(grep -h '^summary:' ~/oco-mini-logs/mini-real-1190.e2e.log | awk '{print $2}'); do git add -f "$S"; grep -o 'docs/evidence/runs/[^ |]*results.json' "$S" | sort -u | xargs git add -f; done
   git commit -m "test(mini): real-model subset on opencode 1.19.0 (p1a-chat c4 c5 t015, <实际模型>)"
   ```
   不推送。结束前确认链脚本已完成（日志里有 `chain done`）或已停掉。最后 `bash scripts/mini/notify.sh "mini-real-1190 完成：1.19.0 子集 PASS <n> / FAIL <n>（稳定 <m>），serverVersion <实际>，版本相关嫌疑 <k> 处，模型 <实际模型>"`；BLOCKED 时通知写明阻塞原因。

唯一写入范围：`docs/evidence/mini-real.md`（只在末尾追加一段）、`docs/evidence/runs/`（E2E 脚本自动写）、`~/oco-bin/official-1190/`、`~/oco-mini-logs/` 下的临时文件。不改 tests/e2e、产品代码、vendor、patches、STATUS / NEXT / PROGRESS，不改全局配置（不读写 ~/.config/opencode、~/.local/share/opencode），不推送 origin，不合入 main；不用 pkill / killall，只停自己记下 PID 的进程；不动 4517 / 4527 上遗留的服务，不动 `~/oco-bin/official`。发现测试侧或产品侧问题只记录文件:行与现象，不修。
验收：证据文件末尾的 1.19.0 段表里正好 4 行、每行 PASS / FAIL / N/A 之一，写明各批 serverVersion 与实际模型、t015 status-version 的 statusText、版本相关嫌疑清单；基线里的版本和模型取自实际返回。
预算：最多 30 轮工具调用 / 120 分钟（子集运行本身 ≤ 60 分钟，链脚本自带保护）。首个可用工具轮次先写 checkpoint，之后每个子目标（预检、批 A / B 结束、重跑结束）更新一次。
报告 ≤15 行：4 个套件的 PASS / FAIL / N/A、版本相关嫌疑清单、t015 statusText、serverVersion、BLOCKED 项、evidence 路径、总耗时、实际模型。不要粘贴日志。
