# mini-ccfeat evidence
- 范围：c26-export / c27-docks / c28-status-hud mock E2E + 默认回归
- 开始：2026-10-16 00:45
- 委派例外：本任务由 Mac mini 执行机（run-task）直接执行，主线程即执行者。

## 新套件（mock，OCO_E2E_MODEL=mock，端口 4527/4528）
环境注意：`~/oco-bin/env.sh` 的 `OCO_VSCODE_BIN` 指向不存在的 `.../MacOS/Electron`（本机为 `.../MacOS/Code`），已在本 shell 覆盖，未改文件（待修）。

| 套件 | 用例 | 结果 | 备注 |
| --- | --- | --- | --- |
| c26-export | export-text | PASS | 命令面板路径；untitled、状态栏语言 Markdown、含 `# 标题` / `## User` / `## Assistant` / 用户与助手文本 |
| c26-export | export-tools | PASS | 失败的 read 工具调用，导出含 `<details><summary>🔧 read — error`（bash 工具会卡在权限请求，导出显示 running，故改用 read） |
| c27-docks | todo-dock | PASS | 仅在 turn 运行期间显示（上游 `todoDockAtBoundary`：todos 未全完成且 session live），所以用第二个慢 turn 保持；"1 of 3 todos completed"，折叠/展开 data-collapsed false→true→false |
| c27-docks | revert-dock | PASS | 嵌入模式无逐条消息回退按钮；入口是 composer 斜杠命令 `/undo`。"1 rolled back message"，服务端 session.revert 置位，Restore 后 dock 消失且 revert 清空 |
| c28-status-hud | hud-shown | PASS | 文本 `mock · 0k tok`（mock 无价格，成本按设计省略） |
| c28-status-hud | hud-disabled | PASS | 改 settings.json `oco.statusBar.hud=false` 后项消失，改回 true 恢复 |

未覆盖：侧栏行菜单导出入口（只测命令面板路径）；`oco.exportSessionToFile`（系统保存对话框）。

## 受影响回归
c7-result-card 6/6 PASS；c16-sidebar-stop 5/5 PASS；c11-sidebar-organize 6 PASS + archive-batch/delete-batch NOT RUN（既有，非本批）；
c3-fork：首轮 fork-user FAIL（重跑 fork-response-last 也偶发 FAIL）。诊断：测试侧竞态——`waitReply` 返回时第二条助手文本尚未写入，`before` 快照含空 `assistant:`，与稍后读取不一致；产品行为正确。修复（唯一一处测试侧修改）：`tests/e2e/c3-fork.mjs` 快照前等待末条回复有文本并稳定 1.5s；修复后连跑 3 次 4/4 PASS。

## 产品缺陷
- 未发现产品缺陷。观察：todo dock 仅 turn 运行时可见（上游设计）；嵌入模式回退只有 `/undo`，无逐条消息回退按钮（产品结论，未改 vendor）。

## 默认回归
`bash scripts/overnight-e2e.sh --mock`（commit 9c6f4a4 + 本批未提交测试改动；`OCO_VSCODE_BIN` 覆盖为 `.../MacOS/Code`）。13 套件，11 通过，2 失败。
汇总：docs/evidence/runs/overnight-20261016-010603/summary.md；日志 ~/oco-mini-logs/mini-ccfeat.e2e.log。

| 套件 | 结果 | 重跑 |
| --- | --- | --- |
| c6-inbox / c10-sidebar-answer / c11-sidebar-organize（6 PASS，2 NOT RUN 既有）/ c12-new-session-draft / c13-worktree-inbox / c14-review-notes / c15-fix-with-opencode / c16-sidebar-stop / c17-subagent-aggregate / p1b-sidebar / c4-trajectory | PASS | — |
| p1b-narrow | FAIL 11/1（首跑 deny-260） | 重跑仍 FAIL（question-260，不同用例，260px 窄宽度几何） |
| c5-runtime | FAIL 43/1（think-card：思考卡片宽度 337→344 抖动） | 重跑仍 FAIL；临时关掉 `oco.statusBar.hud` 再跑仍 FAIL（排除 HUD，临时改动已还原） |

结论：这两个失败未归因。mini-card7 / mini-compat 记录同两个套件在 main 上 PASS，但 mini-card7 也记录 think-card（舞台高度抖动）与 p1b-narrow（fitGroups 上下文销毁）偶发。本次连续两次复现 c5 think-card，不能简单当偶发；未做 main 基线对照（需另建构建好的工作树），建议合入前在基线 3f89430 同机跑 c5-runtime 对照。HUD 已排除，导出/会话变更无关联迹象。
注：overnight 默认集不含 c26–c28、c3、c7，这些见上。
