# 卡 11：M21 Git 动作 v1（2026-10-16，分支 claude/card11-git-actions-0c72f6）

范围：Claude Code「commit / create PR」按钮在 oco 的等价物。oco 不自己执行 git（[ADR-009 §4](../adr/009-multi-agent-cockpit-boundary.md)）：`oco.git.askCommit` / `oco.git.askOpenPR` 把带仓库上下文（VS Code 内置 Git 扩展 API：分支、改动文件数、前 20 个文件名）的提示模板渲染后插进主面板会话草稿，不自动发送；`oco.git.openScm` 打开原生 SCM 视图；SCM 标题栏按钮「Commit with OpenCode」；设置 `oco.git.commitPrompt` / `oco.git.prPrompt`。不做 CI 监视、PR 轮询、自动合并。

## 委派记录

| task_id | 唯一写入范围 | requested_route | actual_provider/model | agent_id/run_id | 状态 | 结果路径 | fallback_reason / 接手理由 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| c11-adr | docs/adr/009 §4 | 主线程（契约 / ADR） | — | — | 已完成 | ADR-009 §4 + 验收口径一行 | 公共契约由主线程负责 |
| c11-impl | apps/extension/src/{git-actions,add-to-draft,extension}.ts、apps/extension/package.json、tests/unit/{git-actions,settings-contribution}.test.ts | gemini-worker（探测 SUCCESS 6.1 s，08:30；提示词 .oco-reports/prompts/card11-impl.md，只写任务正文） | Gemini (Antigravity) / unknown | `gem-mva8n6ru-qi8ji` | 已返回，验收通过（主线程改 4 处，见「实现」） | 本文件「实现」 | 包装层 17 m 54 s 后报 `{"status":"ERROR"}`，但 6 个文件均已落地、报告已写进 .gem.out（与 2026-10-10 记录的「收尾失败、工作已完成」同型）；自报 typecheck 0 / unit 448/0 / esbuild OK，主线程复跑一致 |
| c11-e2e | tests/e2e/c31-git-actions.mjs、docs/evidence/mini-card11.md、docs/evidence/runs/ | Mac mini dispatch（docs/mini/card11.md） | 待补 | 待补 | 计划 | mini-card11.md | — |

## 实现（Gemini，主线程审阅）

- `apps/extension/src/git-actions.ts`（新）：`renderGitPrompt(template, ctx)` 纯函数（只替换 `${branch}` `${files}` `${count}`，文件列表前 20 个 + `- … and N more`，空上下文占位留空）、`gitPromptSource`（沿用 `gitDiff` 元数据，不扩桥契约）、`pickRepository`（SCM 传入的 rootUri → 包含主面板会话目录的最深仓库 → 第一个）、`readGitContext`（`vscode.git` `getAPI(1)`：先 `repo.status()` 刷新，分支 = `HEAD.name` 或 7 位 commit，改动 = working + index + merge + untracked 去重相对路径）、`mainSessionEntry`（role main 且非草稿页）、`registerGitActions` 注册 `oco.git.askCommit` / `oco.git.commitWithOpenCode`（scm/title 按钮别名）/ `oco.git.askOpenPR` / `oco.git.openScm`（`workbench.view.scm`）。没有主面板会话 → `oco: Open a session in the main panel first`。
- `add-to-draft.ts`：`GitRepository` / `GitApi` 类型加宽并 export，`gitApi()` export；逻辑不变。`extension.ts`：`...registerGitActions({ panels, template })`，模板读 `oco.git.commitPrompt` / `oco.git.prPrompt`，空则用内置默认。`package.json`：4 个命令、scm/title（navigation 按钮 + 溢出菜单「Ask Agent to Open a Pull Request」）、commandPalette 隐藏别名、两个 machine 作用域设置（default 与代码常量逐字一致，单测校验）。
- 单测：`tests/unit/git-actions.test.ts` 8 个用例（占位符、空上下文、截断、source、默认模板与 package.json 一致、仓库选择、读取上下文含 detached HEAD / status 抛错、命令布线含 scm 传参）；`settings-contribution.test.ts` 同步设置键并加卡 11 声明检查。
- 主线程审阅改动（Gemini 产物的缺陷）：(1) 删掉 `setVsForTest` 测试钩子与 `readGitContext` 里重复实现 `gitApi` 的回退分支；(2) `vs().Disposable?.from ?? 手写` 防御改为返回 `Disposable[]`（与 `registerExportSession` 同约定，extension.ts 用展开）；(3) 单测在全量 `bun test` 下失败：bun `mock.module("vscode")` 的导出名由最先 mock 的测试文件固定，后续文件只能改已有键的值、不能加 `Disposable` / `extensions`，Gemini 用全局钩子绕过；改为 `GitActionDeps.api` 注入 git API（与 `readGitContext(hint, api)` 同一参数）；(4) 两处 `as any` 收窄为结构类型。`fix-with-opencode.test.ts` 单独或与本文件成对运行时报 `Cannot find package 'vscode'` 是既有问题（它依赖别的文件先注册 mock），全量运行不受影响，本卡不改。

## E2E（Mac mini）

待补。

## 检查

- 分支（实现提交前）：`bun run typecheck` 0 错误；`bun test tests/unit` 448/0（33 文件）；`cd apps/extension && bun run build` PASS（extension.js 297.1 kB）。完整 `bun run build`（含 webview）在合入 main 前再跑一次。
