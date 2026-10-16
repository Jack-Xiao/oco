项目 oco（OpenCode 的 VS Code 客户端），你在 Mac mini 执行机上无人值守运行，工作目录就是仓库根，分支 mini/card13（基线：本机分支 + 本提示词；setup 与 build 已由脚本完成，补丁链 0001–0028 已套进 vendor；E2E 服务器用 `~/oco-bin/opencode`，run-task 已设 `OCO_OPENCODE_BIN`）。用户不在：不要提问，遇到阻塞用 `bash scripts/mini/notify.sh "<一句话>"` 通知后按下面的降级规则继续。

目标：为卡 13「M13 composer chip + 自动附带编辑器选区」写并跑 mock E2E `tests/e2e/c33-composer-chip.mjs`，并把 t005 里一条过时的断言改成 chip 形态。

产品行为（已实现：`apps/extension/src/attach-selection.ts`、`apps/extension/src/panels.ts` 的 `insertDraft(…, chip)`、补丁 `patches/opencode/0028-*`）：
- 命令「oco: Add Selection to Session Draft」（`oco.addSelectionToDraft`）：quick pick 选会话后，**不再**把代码文本插进输入框，而是在 composer（`[data-component="prompt-input"]`）里显示一枚附件 pill，文字是 `路径:起-止`（工作区根的 `math.ts` 第 2–3 行就是 `math.ts:2-3`；单行是 `math.ts:2`），pill 上有 × 按钮可移除（上游 `image-attachments.tsx`：非 image mime 渲染为文件卡片 + 文件名 + 带 aria-label 的 remove button）。输入框的 contenteditable 里没有代码文本。不自动发送。
- 发送后：服务端 `GET /session/:id/message` 里最后一条 role=user 的 `parts` 含一个 `type: "file"` 的 part，`filename` = pill 文字，`mime: "text/plain"`，`url` 是 `data:text/plain;base64,…`（base64 解码后就是选区原文）；服务端可能还会存合成的 `type: "text"` part（`synthetic: true`，内容是原文）。两种只要有一种含选区原文就算模型收到了。
- 设置 `oco.draft.attachSelection`（默认 true）：主面板会话打开着、设置开启时，在文件编辑器里出现非空选区（去抖 250 ms）→ 主面板 composer 自动出现同样的 pill，不用执行命令；选区变化 → pill 文字跟着变、始终只有一枚自动 pill；选区清空（光标移动、按方向键）→ pill 消失；用户点 × 删掉 pill 后，同一选区不再自动加回。焦点进聊天 webview 不会移走 pill。设置为 false → 不自动加（命令仍可用）。
- 主面板 = `createAndOpenSession(page)`（「oco: Open Session」）打开的那个面板。自动 pill 只在面板可见时送达，所以编辑器要**开在旁边的编辑器组**（c15 的写法：`Meta+P` → 输入文件名 → `Meta+Enter` 打开到侧边），让聊天面板和编辑器同时可见。

只读这些（grep 后按行读，不读全文）：
- tests/e2e/c31-git-actions.mjs 1–80 行（套件骨架与 helper：createRun / launch / sessionFrame / composer / toasts / check / step / runShot / finish）；tests/e2e/c15-fix-with-opencode.mjs 70–85 行（打开文件到侧边、`Control+G` 跳行）；tests/e2e/t005.mjs 86–110 行（`command(page, "Go to File", { input: "math.ts" })`、`Meta+A` 全选、执行命令后把会话 id 输进 quick pick）；tests/e2e/vscode.mjs 的 `export` 行（`launch({ profile, settings })` 的 `settings` 会写进该 profile 的 User/settings.json；`createAndOpenSession`、`command`、`quickInput`、`waitUntil`、`runShot`、`chatFrames`）；tests/e2e/server.mjs 的 `export` 行（`api`、`messages`、`waitIdle`、`MODEL`）。
- 产品侧只看：`apps/extension/src/attach-selection.ts` 的导出（`chipLabel`、`AUTO_SELECTION_MAX_LINES`）；`patches/opencode/0028-*.patch` 全文（≤ 80 行；固定 id `oco-auto-selection`）；vendor/opencode/packages/app/src/components/prompt-input/image-attachments.tsx 82–125 行（pill 的 DOM：文件名 span / `AttachmentCardV2 title`，remove button 的 `aria-label`）。
- 测试工作区 `.oco-test/workspace/math.ts` 固定三行：`export function add(a: number, b: number) {` / `  return a + b` / `}`。

要写的套件 `tests/e2e/c33-composer-chip.mjs`（≤ 230 行，复用现有 helper，不改 lib 公共行为）。选区操作统一用键盘：点一下 `.editor-instance .monaco-editor .view-lines`（侧边那个编辑器），`Control+G` → 输入 `2` → Enter（到第 2 行行首），`Shift+End`（选中第 2 行 → 期望 `math.ts:2`），再 `Shift+Down`（扩到第 3 行 → 期望 `math.ts:2-3`），按一次 `ArrowRight` 就清空选区。pill 判断：会话 frame 的 `document.body.innerText` 含期望文字（同时记 `[data-component="prompt-input"]` 的 innerText 前 300 字），且 `[data-component="prompt-input"] [contenteditable="true"]` 的 innerText 不含 `return a + b`。required 四个用例，按这个顺序：

- `manual-chip`：`createAndOpenSession(page)` 得 sid，等 frame `ocoModel === "ready"`；把 math.ts 打开到侧边；选中第 2–3 行；`command(page, "oco: Add Selection to Session Draft", { input: sid })`（quick pick 里输入 sid 回车）→ 20 s 内 composer 出现 pill `math.ts:2-3`，contenteditable 不含代码，且 `GET /session/:id/message` 里 role=user 条数仍为 0。detail 记 pill 文字、composer 前 300 字、userMessages。
- `send-chip`：点 composer 的 contenteditable，输入 `Reply only with OK.` 回车；`waitIdle(sid)`；最后一条 user 消息：找 `type === "file"` 且 `filename` 含 `math.ts:2` 的 part，`url` 以 `data:` 开头则 base64 解码（`Buffer.from(url.split(",")[1], "base64").toString()`），解码文本或任一 text part 含 `return a + b` → PASS。detail 记 parts 的 `[type, filename ?? "", mime ?? ""]` 列表、解码文本前 120 字；同时记发送后 composer 是否还含 `math.ts:2`（预期不含，只记录不判定）。
- `auto-chip`（设置默认 true）：回到侧边编辑器，先按 `ArrowRight` 确保无选区，`Control+G` → `2` → Enter，`Shift+End` → 10 s 内 composer 出现 `math.ts:2`（没有执行命令）；`Shift+Down` → 10 s 内变为 `math.ts:2-3`，且 body.innerText 里 `math.ts:` 只出现一次（只有一枚自动 pill；按 `occurrences` 数）；`ArrowRight` → 10 s 内 `math.ts:` 消失。三步都过才 PASS；detail 记每步的 pill 文字与耗时。
- `auto-off`：`app.close()` 后第二次 `launch({ profile: "c33-off", run, settings: { "oco.draft.attachSelection": false } })`；`createAndOpenSession`，打开 math.ts 到侧边，选中第 2 行，等 8 s → body.innerText 不含 `math.ts:2`（没有自动 pill）；然后执行命令（input sid）→ 20 s 内出现 `math.ts:2`（手动仍可用）。两步都过才 PASS。

可选（不列入 required，但要记录）：`auto-dedupe`：在第一次 launch 的 auto-chip 之后、auto-off 之前做——选中第 2 行让自动 pill 出现，找到 pill 里的 remove button（`[data-component="prompt-input"] button[aria-label]`，先把全部 aria-label 列进 detail，点离 `math.ts:2` 文字最近的那个 / 或文件卡片内的 button）点击 → pill 消失；保持选区不动等 4 s → 不再出现 → PASS；找不到按钮记 NOT RUN 并写 detail。
每个用例失败时 `runShot` 一张。pill 出现但文字形态不同（例如 `math.ts:2-2`、带路径前缀）：按实际文字记 FAIL 并把实际文字写进 detail，不要改产品代码。

t005 改动（`tests/e2e/t005.mjs` 只改第 4 步 `selection-into-chosen-draft` 的判定，其他一行不动）：现在 B 的草稿不再含 `unsaved-marker-777` 文本，而是 pill `math.ts:1-<N>`（`Meta+A` 全选整个文件）。把 `bDraft.includes("unsaved-marker-777")` 换成 `/math\.ts:1-\d+/.test(bDraft)`，detail 里把 `bHasUnsaved` 改名为 `bHasChip`（值为那个正则结果），其余条件（`bKeptOldDraft`、`aClean`、`cClean`、未自动发送）保留。第 5 步 `server-received-unsaved-buffer` 不改判定：它看 text parts 里有没有 `unsaved-marker-777` 与 `export function add`；如果服务端没把合成 text part 存进消息导致它 FAIL，就在 evidence 里记下最后一条 user 消息的 parts 类型列表与 file part 的 filename（这是产品侧结论，由主线程决定是否改判定），不要再改 t005。

跑法。E2E 互斥锁 `/tmp/oco-e2e.lock`（mkdir 锁，`pid` 文件记持有者）：等锁、跑套件、放锁必须在**同一条** Bash 命令里完成，Bash timeout 设 600000：

```
LOCK=/tmp/oco-e2e.lock; until mkdir "$LOCK" 2>/dev/null; do p=$(cat "$LOCK/pid" 2>/dev/null); if [ -n "$p" ] && ! kill -0 "$p" 2>/dev/null; then echo "stale lock (pid $p gone), removing"; rm -rf "$LOCK"; continue; fi; echo "lock held by pid ${p:-?}, waiting"; sleep 30; done; echo $$ > "$LOCK/pid"; timeout 540 node tests/e2e/run.mjs c33-composer-chip; rc=$?; rm -rf "$LOCK"; echo "suite exit=$rc"
```

命令因等锁被 10 分钟超时杀掉就原样再执行（最多 4 次）；四次都没拿到锁就 `notify.sh` 通知并把全部用例记 BLOCKED。c33 不过则按失败项最多修两轮测试侧问题（同样用上面的命令重跑）；通过（或两轮后）再用同一形式跑 `t005`（把命令里的 `c33-composer-chip` 换成 `t005`；t005 较长，timeout 仍 540）。只读 results.json，不看截图。

唯一写入范围：`tests/e2e/c33-composer-chip.mjs`（新）、`tests/e2e/t005.mjs`（只改第 4 步判定）、`docs/evidence/mini-card13.md`（新）、`docs/evidence/runs/`。不改产品代码、vendor、patches；不改 STATUS / NEXT / PROGRESS；不推送 origin；不合入 main；不用 pkill / killall。
验收：c33 四个 required 用例在 results.json 里有 PASS / FAIL / BLOCKED；evidence 列出每个用例的结果与关键 detail（pill 文字、composer 前 200 字、parts 类型列表、aria-label 列表）、t005 第 4 / 5 步结果、两份 results.json 路径。
预算：最多 50 轮工具调用 / 75 分钟；E2E 命令用 timeout 包裹（单套件 ≤ 10 分钟）。checkpoint：`docs/evidence/mini-card13.md` 首轮落盘（范围 + 开始时间），每个套件后更新。
结束：`git add tests/e2e/c33-composer-chip.mjs tests/e2e/t005.mjs docs/evidence/mini-card13.md docs/evidence/runs && git commit -m "test(e2e): c33 composer chip + auto selection; t005 expects the chip (card 13)"`（不推送）；`bash scripts/mini/notify.sh "mini-card13 完成：c33 <通过数>/4，t005 第4步 <结果> 第5步 <结果>"`。
报告 ≤15 行：各用例 PASS / FAIL / BLOCKED 与关键 detail、t005 结果、evidence 路径。不贴日志。
