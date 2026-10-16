项目 oco（OpenCode 的 VS Code 客户端），你在 Mac mini 执行机上无人值守运行，工作目录就是仓库根，分支 mini/card11（基线：本机分支 claude/card11-git-actions-0c72f6 + 本提示词；setup 与 build 已由脚本完成；E2E 服务器用 `~/oco-bin/opencode`，run-task 已设 `OCO_OPENCODE_BIN`）。用户不在：不要提问，遇到阻塞用 `bash scripts/mini/notify.sh "<一句话>"` 通知后按下面的降级规则继续。

目标：为卡 11「M21 Git 动作 v1」写并跑 mock E2E `tests/e2e/c31-git-actions.mjs`。产品行为（已实现在 apps/extension/src/git-actions.ts，ADR-009 §4）：命令「oco: Ask Agent to Commit Changes」（`oco.git.askCommit`）和「oco: Ask Agent to Open a Pull Request」（`oco.git.askOpenPR`）读 VS Code 内置 Git 扩展的仓库状态（分支、改动文件），渲染设置 `oco.git.commitPrompt` / `oco.git.prPrompt` 的模板（默认模板首行分别是 `Commit the current changes in this repository.` / `Open a pull request for the current branch.`，含 `Branch: <分支>` 行和 `- <文件>` 列表），插进**主面板**会话的草稿（composer），不自动发送；主面板没有会话时只弹警告 `oco: Open a session in the main panel first`；「oco: Open Source Control View」（`oco.git.openScm`）打开原生 SCM 视图；SCM 视图标题栏有按钮「Commit with OpenCode」（`oco.git.commitWithOpenCode`，与 askCommit 相同）。

只读这些（grep 后按行读，不读全文）：tests/e2e/c15-fix-with-opencode.mjs 36–60 行（`sessionFrame`、`composerText`、`toasts` helper）与 110–145 行（`command(page, "oco: …")` 后等草稿落地的写法）、tests/e2e/c28-status-hud.mjs（最短的完整套件骨架：createRun / launch / createAndOpenSession / waitUntil / runShot / finish）、tests/e2e/c8-git-review.mjs 12–20 与 60–80 行（测试工作区 `.oco-test/workspace` 的路径与在里面造文件的写法）、tests/e2e/vscode.mjs 与 tests/e2e/server.mjs 的 `export` 行。产品代码只需看 apps/extension/src/git-actions.ts 的 `DEFAULT_COMMIT_PROMPT` / `DEFAULT_PR_PROMPT` / `NO_MAIN_SESSION` 三个常量。

要写的套件 `tests/e2e/c31-git-actions.mjs`（≤ 200 行，复用现有 helper，不改 lib 公共行为）。工作区就是 launch 默认的 `.oco-test/workspace`（scripts/test-server.sh 已 `git init` 并提交 math.ts）。开头用 `execSync("git rev-parse --abbrev-ref HEAD", { cwd: workspace })` 取分支名 BR，并在工作区里新建 `c31-<rand>.txt`（写一行文本；这是一个未跟踪的改动文件，结束时删掉）。required 四个用例，按这个顺序：

- `no-session`：还没打开任何会话面板时执行 `command(page, "oco: Ask Agent to Commit Changes")` → 10 s 内 `.notifications-toasts` 里出现含 `Open a session in the main panel first` 的提示。detail 记 toasts 文本。
- `commit-draft`：`createAndOpenSession(page)` 得到 sid，等 frame 的 `ocoModel === "ready"`；执行同一命令 → 20 s 内 composer（`[data-component="prompt-input"]` innerText）含 `Commit the current changes`、`Branch: ${BR}` 和 `c31-<rand>.txt`；并且 `GET /session/:id/message` 里 role=user 的条数仍为 0（未自动发送）。detail 记 composer 前 400 字、BR、文件名、userMessages。
- `pr-draft`：执行 `command(page, "oco: Ask Agent to Open a Pull Request")` → 20 s 内 composer 含 `Open a pull request` 与 `Branch: ${BR}`（草稿是追加的，前面的 commit 文本还在也算过）。detail 记 composer 前 400 字。
- `open-scm`：执行 `command(page, "oco: Open Source Control View")` → 10 s 内侧栏标题（`.part.sidebar .composite.title h2` 或等价选择器）含 `Source Control`。detail 记标题文本。

可选（不列入 required，但要记录）：`scm-button`：打开 SCM 视图后，标题栏工具条里找 `aria-label` 含 `Commit with OpenCode` 的按钮（`.part.sidebar .actions-container a`，找不到时用 `.part.sidebar .composite.title [aria-label]` 列出全部 aria-label 写进 detail 并记 NOT RUN）；找到就点它 → composer 再次追加 `Commit the current changes`（计数增加）→ PASS。
每个用例失败时 `runShot` 一张。branch 占位符为空（composer 有模板文字但没有 `Branch: ${BR}`）是产品侧结论：commit-draft 记 FAIL，detail 写明 composer 里 `Branch:` 行的实际内容，并把 `.oco-test/workspace` 的 `git status --short` 输出记进 detail；不要为此改产品代码。

然后：先拿 E2E 互斥锁——`mkdir /tmp/oco-e2e.lock` 成功才跑（成功后 `echo $$ > /tmp/oco-e2e.lock/pid`），失败说明另一个会话正在跑 E2E：每 60 s 重试一次，最多等 30 分钟，超时则通知并把全部用例记 BLOCKED。拿到锁后 `timeout 600 node tests/e2e/run.mjs c31-git-actions`；不过则按失败项最多修两轮测试侧问题；通过后跑回归 `timeout 600 node tests/e2e/run.mjs c15-fix-with-opencode`。跑完（无论成败）`rm -rf /tmp/oco-e2e.lock`。只读 results.json，不看截图。

唯一写入范围：`tests/e2e/c31-git-actions.mjs`、`docs/evidence/mini-card11.md`（新）、`docs/evidence/runs/`。不改产品代码、vendor、patches；不改 STATUS / NEXT / PROGRESS；不推送 origin；不合入 main；不用 pkill / killall。
验收：c31 四个 required 用例在 results.json 里有 PASS / FAIL / BLOCKED；evidence 列出每个用例的结果与关键 detail（composer 前 200 字、BR、toasts、scm-button 的 aria-label 列表）、回归 c15 结果、results.json 路径。
预算：最多 40 轮工具调用 / 60 分钟；E2E 命令用 timeout 包裹（单套件 ≤ 10 分钟）。checkpoint：`docs/evidence/mini-card11.md` 首轮落盘（范围 + 开始时间），每个套件后更新。
结束：`git add tests/e2e/c31-git-actions.mjs docs/evidence/mini-card11.md docs/evidence/runs && git commit -m "test(e2e): c31 git actions -> main panel draft (card 11)"`（不推送）；`bash scripts/mini/notify.sh "mini-card11 完成：c31 <通过数>/4，c15 <结果>"`。
报告 ≤15 行：各用例 PASS / FAIL / BLOCKED 与关键 detail、回归结果、evidence 路径。不贴日志。
