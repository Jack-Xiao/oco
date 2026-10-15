项目：~/Ai-Project/oco-mini（分支 mini/mini-ccfeat，基线 claude/cc-features-2026-10-16 = main 3f89430 + 会话导出 + 状态栏 HUD）。目标：给本批新功能写 mock E2E 并跑通，同时核实上游 revert dock / todo dock 在 oco 嵌入模式下是否可用。

只读这些（grep 后按行读，不读全文）：tests/e2e/c3-fork.mjs、tests/e2e/c11-sidebar-organize.mjs（侧栏行菜单、todo 进度）、tests/e2e/c16-sidebar-stop.mjs（状态栏 `.statusbar` 的读取方式）、tests/e2e/lib/mock-llm.mjs（口令：`Use the todowrite tool to plan: a; b; c` 触发 todowrite；文件头列出其他口令）、tests/e2e/lib/sessions-web.mjs；产品侧只 grep：apps/extension/src/export-session.ts、apps/extension/src/status-hud.ts、apps/extension/src/sessions-webview.ts（菜单项文案）、apps/extension/package.json（命令 `oco.exportSession` / `oco.exportSessionToFile`、设置 `oco.statusBar.hud`）。

要写的套件（每个 ≤ 250 行，复用现有 helper，不改 lib 的公共行为）：
- `tests/e2e/c26-export.mjs`：mock 会话里发一条文本消息并收到回复后，从侧栏行菜单（或命令面板「oco: Export Session as Markdown」）导出 → 出现 language=markdown 的 untitled 编辑器，内容含 `# <标题>`、`## User`、`## Assistant`、用户文本与助手文本；带工具调用的会话导出含 `<details>`。
- `tests/e2e/c27-docks.mjs`：(a) 发「Use the todowrite tool to plan: a; b; c」→ 嵌入面板 composer 区出现 todo dock（`data-component="session-todo-dock"` 或文案 "of 3 todos completed"），折叠 / 展开可点。(b) revert：先在上游找逐条消息的回退入口（grep `vendor/opencode/packages/app/src/pages/session.tsx` 1850–1920 行 `roll(` 的调用者，可能在消息悬停菜单、`pages/session/use-session-commands.tsx` 或 `message-gesture.ts`），对第二条用户消息执行回退 → 出现 `data-component="session-revert-dock"`（"1 rolled back message"）→ 点 Restore 恢复。嵌入模式没有入口就记 NOT RUN，写清缺什么（这是产品结论，不要改 vendor）。
- `tests/e2e/c28-status-hud.mjs`：打开一个 mock 会话面板并完成一轮 → `.statusbar` 里 id 含 `oco.hud` 的项文本含模型名与 `$`（或 `tok`）；把设置 `oco.statusBar.hud` 设为 false 后该项消失。
然后：`node tests/e2e/run.mjs c26-export c27-docks c28-status-hud`，再跑受影响回归 `node tests/e2e/run.mjs c3-fork c7-result-card c11-sidebar-organize c16-sidebar-stop`。只读 results.json，不看截图。
最后（合入 main 前的默认回归，代替中止的 mini-regress）：`nohup bash scripts/overnight-e2e.sh --mock > ~/oco-mini-logs/mini-ccfeat.e2e.log 2>&1 &`，每 10 分钟 `sleep 600` 轮询到本次 `docs/evidence/runs/overnight-*/summary.md` 出现且进程退出；失败套件各重跑一次区分偶发；结果（每套件 PASS/FAIL + 重跑）写进同一份 evidence 的「默认回归」小节。E2E 服务器用 `~/oco-bin/opencode`（run-task 已设 `OCO_OPENCODE_BIN`；若报 opencode not found，手动 `export OCO_OPENCODE_BIN=$HOME/oco-bin/opencode`）。

唯一写入范围：`tests/e2e/c26-export.mjs`、`tests/e2e/c27-docks.mjs`、`tests/e2e/c28-status-hud.mjs`、`docs/evidence/mini-ccfeat.md`、`docs/evidence/runs/`。产品缺陷只记录（文件、现象、疑似位置），最多修一处明显的测试侧问题；不改产品代码、vendor、patches；不改 STATUS / NEXT / PROGRESS；不推送 origin；不合入 main。
验收：三个套件的 results.json 有结果；evidence 列出每个用例 PASS / FAIL / NOT RUN 与产品缺陷清单。
预算：最多 90 轮工具调用 / 270 分钟（默认回归约 60–90 分钟）；E2E 命令用 timeout 包裹（单套件 ≤ 15 分钟）。不用 pkill / killall。checkpoint：`docs/evidence/mini-ccfeat.md` 首轮落盘（范围 + 开始时间），每个套件后更新。
结束：`git add tests/e2e/c26-export.mjs tests/e2e/c27-docks.mjs tests/e2e/c28-status-hud.mjs docs/evidence/mini-ccfeat.md docs/evidence/runs && git commit -m "test(e2e): c26 export, c27 docks, c28 status hud (cc-features batch)"`（不推送）；`bash scripts/mini/notify.sh "mini-ccfeat 完成：<通过/总数>，产品缺陷 <n>"`。
报告 ≤15 行：各套件通过 / 失败数、NOT RUN 项、产品缺陷清单、evidence 路径。不贴日志。
