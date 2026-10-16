项目 oco（OpenCode 的 VS Code 客户端），你在 Mac mini 执行机上无人值守运行，工作目录就是仓库根，分支 mini/card13-rerun（基线：本机分支 + 本提示词；setup 与 build 已由脚本完成，补丁链 0001–0028 已套进 vendor；E2E 服务器用 `~/oco-bin/opencode`，run-task 已设 `OCO_OPENCODE_BIN`）。用户不在：不要提问，遇到阻塞用 `bash scripts/mini/notify.sh "<一句话>"` 通知后按下面的降级规则继续。

目标：卡 13「composer chip」的确认轮。上一轮（mini-card13）已写好 `tests/e2e/c33-composer-chip.mjs` 并改了 `tests/e2e/t005.mjs` 第 4 步；之后产品侧改了补丁 0028（发出的 file part `filename` 现在是标签 `math.ts:2-3`，不再是 `math.ts`；同一标签只保留一枚 chip：手动取代自动、自动遇手动则跳过）。本轮只重跑并记录，不写新套件。

先读（只按行读）：`docs/evidence/mini-card13.md`（上一轮的结论与失败项）、`tests/e2e/c33-composer-chip.mjs` 开头 40 行与 `auto-chip` 用例。上一轮完整套件里 auto-chip 失败而单独调试套件通过，原因在测试侧：发送消息后焦点在聊天 webview 里，套件用「Go to File」重新聚焦 math.ts——但 Go to File 会把文件开进**当前编辑器组**（聊天面板所在组），盖住聊天面板；自动 chip 只在面板可见时送达（宿主 `flushDrafts` 看 `panel.visible`），面板被盖住就永远等不到 pill。单独调试套件里文件一直开在侧边，所以通过。

要做的：
1. 把 auto-chip 用例里重新聚焦编辑器的 `command(page, "Go to File", …)`（套件约 106 行的 helper）换成点击侧边那个已打开的 math.ts 编辑器：`await page.locator(".editor-instance .monaco-editor .view-lines", { hasText: "export function add" }).first().click({ position: { x: 600, y: 5 } })`，然后 `await sleep(300)`，并断言聊天 frame 仍可见（`f.evaluate(() => document.visibilityState) === "visible"`，不可见就把它记进 detail 并 FAIL）。之后再做 `ArrowRight` / `Control+G` → `2` → Enter / `Shift+End` 等键盘操作。pill 判断用会话 frame 的 `document.body.innerText`（pill 在 `[data-component="prompt-input-v2-attachments"]` 里，不在 `prompt-input` 的 contenteditable 里）。这是唯一允许的测试侧预改动。`send-chip` 的判定保持「file part `filename` 含 `math.ts:2`」不变——产品已修，现在应当通过；如果仍然是 `math.ts`，记 FAIL 并把 parts 列表写进 detail，不要放宽判定。send-chip 里也只应有 **一个** file part（手动 chip 取代了自动 chip）：把 file part 个数记进 detail（不作判定）。
2. 用下面的锁命令跑 `c33-composer-chip`，不过则只修测试侧（最多两轮，同样的命令重跑）；然后同样跑 `t005`。只读 results.json，不看截图。

```
LOCK=/tmp/oco-e2e.lock; until mkdir "$LOCK" 2>/dev/null; do p=$(cat "$LOCK/pid" 2>/dev/null); if [ -n "$p" ] && ! kill -0 "$p" 2>/dev/null; then echo "stale lock (pid $p gone), removing"; rm -rf "$LOCK"; continue; fi; echo "lock held by pid ${p:-?}, waiting"; sleep 30; done; echo $$ > "$LOCK/pid"; timeout 540 node tests/e2e/run.mjs c33-composer-chip; rc=$?; rm -rf "$LOCK"; echo "suite exit=$rc"
```

命令因等锁被 10 分钟超时杀掉就原样再执行（最多 4 次）；四次都没拿到锁就 `notify.sh` 通知并把全部用例记 BLOCKED。

唯一写入范围：`tests/e2e/c33-composer-chip.mjs`（只允许上面说的点击一行和两轮测试侧修复）、`docs/evidence/mini-card13-rerun.md`（新）、`docs/evidence/runs/`。不改产品代码、vendor、patches、t005；不改 STATUS / NEXT / PROGRESS；不推送 origin；不合入 main；不用 pkill / killall。
验收：c33 四个 required 用例与可选 auto-dedupe 在 results.json 里有 PASS / FAIL / BLOCKED / NOT RUN；t005 第 4 / 5 步结果；evidence 列出每个用例的结果与关键 detail（pill 文字、parts 的 `[type, filename, mime]` 列表、解码文本前 120 字）、两份 results.json 路径。
预算：最多 30 轮工具调用 / 45 分钟；E2E 命令用 timeout 包裹。checkpoint：`docs/evidence/mini-card13-rerun.md` 首轮落盘（范围 + 开始时间），每个套件后更新。
结束：`git add tests/e2e/c33-composer-chip.mjs docs/evidence/mini-card13-rerun.md docs/evidence/runs && git commit -m "test(e2e): c33 composer chip confirmation run on patch 0028 v2 (card 13)"`（不推送）；`bash scripts/mini/notify.sh "mini-card13-rerun 完成：c33 <通过数>/4，t005 第4步 <结果> 第5步 <结果>"`。
报告 ≤15 行：各用例 PASS / FAIL / BLOCKED 与关键 detail、t005 结果、evidence 路径。不贴日志。
