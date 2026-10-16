# 卡 11（M21 Git 动作 v1）mock E2E：c31-git-actions

状态：完成（2026-10-16 09:13 开始，09:21 结束）。结论：c31 四个 required 用例 + 可选 scm-button 在两次独立运行中全部 PASS；回归 c15 PASS 4 / NOT RUN 1（既有情况）。未发现需要改测试以外代码的失败；未改产品代码。

## 范围与环境

- 工作树 /Users/xiaojiang/Ai-Project/oco/.claude/worktrees/card11-git-actions-0c72f6，分支 claude/card11-git-actions-0c72f6，HEAD 9dd4853（含他人未提交的 docs 改动，本次运行时 dirty）。
- 写入范围：`tests/e2e/c31-git-actions.mjs`（新，153 行，只复用 vscode.mjs / server.mjs / lib/results.mjs）、本文件、`docs/evidence/runs/`（脚本生成）。未改 tests/e2e/lib、vscode.mjs、server.mjs、run.mjs、产品代码、STATUS / NEXT / PROGRESS；未提交。
- 环境：VS Code 1.141.0，opencode 1.18.33（隔离服务器 127.0.0.1:4517，由 scripts/overnight-e2e.sh 启动并在结束时停掉），mock 模型 `oco-mock/mock`，工作区 `.oco-test/workspace`（`git init`，分支 `main`，已提交 math.ts）。每次运行新建 `c31-<rand>.txt` 作为未跟踪改动文件，`finally` 中删除（已核对工作区只剩 math.ts，/tmp/oco-e2e.lock 已释放）。
- 委派记录：task_id `card11-c31-e2e`；唯一写入范围同上；requested_route `claude-subagent/sonnet`（AGENTS.md 表：要启动 VS Code 的 E2E 交 Claude 子代理）；actual_provider/model Claude Sonnet 5.5；agent_id unknown；状态 验收通过；工具轮数约 18；测试侧修复 0 轮（无失败）；主线程发现缺陷数 待主线程填。

## 运行记录

| # | 命令 | 时间（+0800） | 套件耗时 | 结果 | summary.md | results.json |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | overnight-e2e.sh --timeout 540 --lock-wait 600 c31-git-actions | 09:16:40–09:17:30 | 48 s（冷启动） | PASS 5 / FAIL 0 | docs/evidence/runs/overnight-20261016-091640/summary.md | docs/evidence/runs/20261016-011653-c31-git-actions-c190/results.json |
| 2 | 同上（加了 joint / where / titleBarLabels 三项诊断字段，断言不变） | 09:18:00–09:18:18 | 15 s | PASS 5 / FAIL 0 | docs/evidence/runs/overnight-20261016-091800/summary.md | docs/evidence/runs/20261016-011803-c31-git-actions-b1ca/results.json |
| 3 | 同上，套件换成 c15-fix-with-opencode（回归） | 09:18:39–09:20:49 | 128 s | PASS 4 / NOT RUN 1 / FAIL 0，exit 0 | docs/evidence/runs/overnight-20261016-091839/summary.md | docs/evidence/runs/20261016-011841-c15-fix-with-opencode-88d2/results.json |

第 2 次不是修复轮：第 1 次已全过，只是为记录“追加草稿的衔接字符”和“按钮所在位置”加了诊断字段并复跑一次，顺带确认稳定性。

## c31 用例（第 2 次运行的 detail；第 1 次结论与关键字段相同）

| 用例 | 结果 | 关键 detail |
| --- | --- | --- |
| no-session | PASS | toasts：`oco: Open a session in the main panel first`（还没有任何会话面板时执行 askCommit，10 s 内出现） |
| commit-draft | PASS | BR=`main`；文件 `c31-h336ry.txt`（第 1 次 `c31-xq4jb6.txt`）；userMessages=0（草稿落地后再等 2 s 才计数）；`Branch:` 行=`Branch: main`；gitReady=true（状态栏出现分支名）；工作区 `git status --short`=`?? c31-h336ry.txt`。composer 前 200 字：`Commit the current changes in this repository. Branch: main Changed files (1): - c31-h336ry.txt Review the diff with git first, group related changes into one or more commits with concise conventional` |
| pr-draft | PASS | 草稿追加在 commit 文本之后（commitTextKept=true）；`Open a pull request` 之后的文本含 `Branch: main`。PR 部分前 300 字：`Open a pull request for the current branch. Branch: main Uncommitted changes (1): - c31-h336ry.txt If there are uncommitted changes, commit them first. Push the branch and open the pull request with the gh CLI (or this repository's equivalent) with a title under 70 characters, a summary of what chan…` |
| open-scm | PASS | 侧栏标题：`Source Control` |
| scm-button（可选） | PASS | aria-label=`Commit with OpenCode`；位置 `pane-header`（Source Control 视图的窗格头，不在侧栏顶部标题条）；点击后 composer 里 `Commit the current changes` 出现次数 1 → 2。侧栏顶部标题条的 aria-label 只有：`Source Control actions`、`Views and More Actions...` |

判定细节：pr-draft 只在 `Open a pull request` 之后的文本里找 `Branch: ${BR}`，不会被前面 commit 草稿里的同名行蒙混；commit-draft 要求三段文字齐全且服务端 user 消息数为 0。每个失败用例会 `runShot` 一张（本次无失败，未产生失败截图）。

## 观察（不算失败，留给主线程判断）

1. 追加的草稿之间没有分隔：第 2 次运行记录的衔接字符是 `"s yourself. Do not push.Open a pull "`，即 PR 草稿紧接在 commit 草稿的最后一句之后，同一行、无换行也无空格（第 1 次的折叠文本同样是 `Do not push.Open a pull request`）。规格允许“追加”，所以 pr-draft 记 PASS；但连续用两个 Git 动作会得到一行连在一起的提示。是 git-actions 插入时没有在非空草稿前补换行，还是共用的草稿插入路径的行为，本次没有追溯（超出本任务的读取范围）。
2. “Commit with OpenCode” 在窗格头而不是侧栏顶部标题条：VS Code 把 `scm/title` 动作画在 Source Control 视图的窗格头上（视图多于一个时窗格头独立，需悬停才显示）。测试因此先悬停侧栏标题和各窗格头再找按钮；这不是产品缺陷，只是任务描述里“标题栏工具条”的实际位置。

## 未覆盖

- 只跑了 mock 模型；未跑 `--real`；未验证 agent 真的执行 commit / 开 PR（产品边界本来就只到草稿）。
- 只有一个仓库、一个未跟踪文件；未覆盖多仓库、已暂存/已修改文件、detached HEAD、超过 20 个文件的截断（按 card11-git-actions.md 的记录由单测 tests/unit/git-actions.test.ts 覆盖，本次未复核）。
- open-scm 只核对侧栏标题含 Source Control；未核对 SCM 视图里的仓库内容。
- c15 的 terminal-shell-integ 在隔离 profile 下 NOT RUN（终端 ~25 s 内没有报告 shell integration 完成的命令），是既有情况，不是本次回归。
