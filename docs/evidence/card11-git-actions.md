# 卡 11：M21 Git 动作 v1（2026-10-16，分支 claude/card11-git-actions-0c72f6）

范围：Claude Code「commit / create PR」按钮在 oco 的等价物。oco 不自己执行 git（[ADR-009 §4](../adr/009-multi-agent-cockpit-boundary.md)）：`oco.git.askCommit` / `oco.git.askOpenPR` 把带仓库上下文（VS Code 内置 Git 扩展 API：分支、改动文件数、前 20 个文件名）的提示模板渲染后插进主面板会话草稿，不自动发送；`oco.git.openScm` 打开原生 SCM 视图；SCM 标题栏按钮「Commit with OpenCode」；设置 `oco.git.commitPrompt` / `oco.git.prPrompt`。不做 CI 监视、PR 轮询、自动合并。

## 委派记录

| task_id | 唯一写入范围 | requested_route | actual_provider/model | agent_id/run_id | 状态 | 结果路径 | fallback_reason / 接手理由 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| c11-adr | docs/adr/009 §4 | 主线程（契约 / ADR） | — | — | 已完成 | ADR-009 §4 + 验收口径一行 | 公共契约由主线程负责 |
| c11-impl | apps/extension/src/{git-actions,add-to-draft,extension}.ts、apps/extension/package.json、tests/unit/{git-actions,settings-contribution}.test.ts | gemini-worker（探测 SUCCESS 6.1 s，08:30；提示词 .oco-reports/prompts/card11-impl.md，只写任务正文） | Gemini (Antigravity) / unknown | `gem-mva8n6ru-qi8ji` | 已返回，验收通过（主线程改 4 处，见「实现」） | 本文件「实现」 | 包装层 17 m 54 s 后报 `{"status":"ERROR"}`，但 6 个文件均已落地、报告已写进 .gem.out（与 2026-10-10 记录的「收尾失败、工作已完成」同型）；自报 typecheck 0 / unit 448/0 / esbuild OK，主线程复跑一致 |
| c11-e2e-mini | tests/e2e/c31-git-actions.mjs、docs/evidence/mini-card11.md、docs/evidence/runs/ | Mac mini dispatch（docs/mini/card11.md 已就绪） | — | — | 未派 | — | Mac mini 会话（Jarvis）未收到裁定，08:5x 起在它自己的 claude/card11-git-actions 上写了另一份 c31 并用 overnight-e2e.sh 反复跑（09:01 pid 72855、09:02 pid 73795），持续占着 /tmp/oco-e2e.lock；09:03 已向主会话报告。为避免两份 c31 抢同一把锁、同一账号额度，不再往 mini 派 |
| c11-e2e | tests/e2e/c31-git-actions.mjs、docs/evidence/card11-e2e.md、docs/evidence/runs/ | claude-subagent/sonnet（§0 固定做法：要起 VS Code 的 E2E 交 Claude 子代理；本机 09:14 起） | Claude / sonnet（显式 model） | Agent 任务（25 次工具调用，8 m 38 s） | 已返回，验收通过（主线程复核 results.json） | [card11-e2e](card11-e2e.md) | 见上一行；本机前置：从主检出复制 03:00 构建的 webview 包 apps/extension/media/chat（41 MB，vendor v1.18.33 + 补丁 0001–0025，与本分支一致），opencode 1.18.33 在 PATH，本机无锁 |

## 实现（Gemini，主线程审阅）

- `apps/extension/src/git-actions.ts`（新）：`renderGitPrompt(template, ctx)` 纯函数（只替换 `${branch}` `${files}` `${count}`，文件列表前 20 个 + `- … and N more`，空上下文占位留空）、`gitPromptSource`（沿用 `gitDiff` 元数据，不扩桥契约）、`pickRepository`（SCM 传入的 rootUri → 包含主面板会话目录的最深仓库 → 第一个）、`readGitContext`（`vscode.git` `getAPI(1)`：先 `repo.status()` 刷新，分支 = `HEAD.name` 或 7 位 commit，改动 = working + index + merge + untracked 去重相对路径）、`mainSessionEntry`（role main 且非草稿页）、`registerGitActions` 注册 `oco.git.askCommit` / `oco.git.commitWithOpenCode`（scm/title 按钮别名）/ `oco.git.askOpenPR` / `oco.git.openScm`（`workbench.view.scm`）。没有主面板会话 → `oco: Open a session in the main panel first`。
- `add-to-draft.ts`：`GitRepository` / `GitApi` 类型加宽并 export，`gitApi()` export；逻辑不变。`extension.ts`：`...registerGitActions({ panels, template })`，模板读 `oco.git.commitPrompt` / `oco.git.prPrompt`，空则用内置默认。`package.json`：4 个命令、scm/title（navigation 按钮 + 溢出菜单「Ask Agent to Open a Pull Request」）、commandPalette 隐藏别名、两个 machine 作用域设置（default 与代码常量逐字一致，单测校验）。
- 单测：`tests/unit/git-actions.test.ts` 8 个用例（占位符、空上下文、截断、source、默认模板与 package.json 一致、仓库选择、读取上下文含 detached HEAD / status 抛错、命令布线含 scm 传参）；`settings-contribution.test.ts` 同步设置键并加卡 11 声明检查。
- 主线程审阅改动（Gemini 产物的缺陷）：(1) 删掉 `setVsForTest` 测试钩子与 `readGitContext` 里重复实现 `gitApi` 的回退分支；(2) `vs().Disposable?.from ?? 手写` 防御改为返回 `Disposable[]`（与 `registerExportSession` 同约定，extension.ts 用展开）；(3) 单测在全量 `bun test` 下失败：bun `mock.module("vscode")` 的导出名由最先 mock 的测试文件固定，后续文件只能改已有键的值、不能加 `Disposable` / `extensions`，Gemini 用全局钩子绕过；改为 `GitActionDeps.api` 注入 git API（与 `readGitContext(hint, api)` 同一参数）；(4) 两处 `as any` 收窄为结构类型。`fix-with-opencode.test.ts` 单独或与本文件成对运行时报 `Cannot find package 'vscode'` 是既有问题（它依赖别的文件先注册 mock），全量运行不受影响，本卡不改。

## 对照：Mac mini 会话的卡 11 草稿（不合入）

- 经过：Mac mini 会话（Remote Control，git user Jarvis）做完卡 10 后未拉到 main 6b99e3b 的认领规则，08:41 在它本地同名分支 `claude/card11-git-actions`（基于 card10 e1b7eef）提交 `45d9d86`「M21 v1 git actions — ask the agent to commit / open a PR via draft, open SCM (ADR-009 §4a)」：`apps/extension/src/git-actions.ts` 46 行，命令 `oco.git.askCommit` / `oco.git.askPullRequest` / `oco.git.openScm`；未提交 `tests/e2e/c31-git-actions.mjs`（153 行）并从 09:01 起用 `overnight-e2e.sh c31-git-actions` 反复跑（持有 mini 的 /tmp/oco-e2e.lock）。09:14 核对：它工作树里 `packages/contracts/src/bridge.ts` 的改动是 M22 书签（`bookmark` UiAction、`Navigate.messageId`，另有未跟踪 `docs/evidence/card12-bookmarks.md`），属于它已经开始的卡 12，不是卡 11。
- 裁定（主会话 08:45 写入 main 499b7f1，用户 09:1x 确认）：卡 11 归本机会话；mini 草稿存 `claude/card11-mini-draft` 只作对照，bridge.ts 改动不合入卡 11；mini 先合卡 10 再认领卡 12。
- 差异：本分支命令名 `oco.git.askOpenPR`（任务指定）+ scm/title 别名 `oco.git.commitWithOpenCode`；模板走设置 `oco.git.commitPrompt` / `oco.git.prPrompt`；仓库上下文（分支 / 改动数 / 前 20 个文件）与仓库选择顺序按 ADR-009 §4；单测 8 + 设置同步。两边都没有扩 DraftSource。

## E2E（本机 Claude 子代理 Sonnet；Mac mini 路线见委派记录）

- 新套件 `tests/e2e/c31-git-actions.mjs`（153 行，mock）：`no-session`（无主面板会话 → toast `oco: Open a session in the main panel first`）、`commit-draft`（composer 含 `Commit the current changes`、`Branch: main`、新建的未跟踪文件 `c31-<rand>.txt`；落地 2 s 后服务端 user 消息仍为 0，未自动发送）、`pr-draft`（追加 `Open a pull request` + `Branch: main`）、`open-scm`（侧栏标题 `Source Control`）、可选 `scm-button`（`aria-label="Commit with OpenCode"` 在 Source Control 视图的窗格头工具条，点击后草稿再追加一次）。结果：**5/5 PASS**，连跑 2 次结论相同（09:16–09:17、09:18）；测试侧修复 0 轮，产品缺陷 0。`--disable-extensions` 下内置 Git 扩展仍可用（分支与改动文件都读到了）。
- 回归 `c15-fix-with-opencode`（草稿通道）：4 PASS / 1 NOT RUN（`terminal-shell-integ`，隔离 profile 下 shell integration 时有时无，既有情况）。
- 观察（不算失败，本卡不改）：连续执行两个 Git 动作时第二份草稿紧贴第一份（`Do not push.Open a pull request`）。页面侧 draft-insert（补丁 0001）对所有来源都是原样追加、不加分隔，M05 的其他来源同样；若要改应在补丁 0001 对非空草稿补一个换行，记到 NEXT §3 小项。
- 路径：c31 `docs/evidence/runs/20261016-011803-c31-git-actions-b1ca/results.json`（summary `runs/overnight-20261016-091800/summary.md`）；c15 `runs/20261016-011841-c15-fix-with-opencode-88d2/results.json`（summary `runs/overnight-20261016-091839/summary.md`）。隔离服务器由脚本停掉，本机 /tmp/oco-e2e.lock 已释放。

## 检查

- 分支（实现提交前）：`bun run typecheck` 0 错误；`bun test tests/unit` 448/0（33 文件）；`cd apps/extension && bun run build` PASS（extension.js 297.1 kB）。完整 `bun run build`（含 webview）在合入 main 前再跑一次。
