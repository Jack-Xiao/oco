# New Session 草稿页 E2E（claude/new-session-draft）

## 委派记录
- task=c12-e2e；唯一写入范围=tests/e2e/c12-new-session-draft.mjs、tests/e2e/run.mjs（仅注册）、本文件；requested_route=claude-subagent/sonnet（启动 VS Code 的 E2E 归 Claude 子代理）；actual=claude-sonnet-5-5；状态=已返回；约 30 轮工具调用。

## 结论
- c12-new-session-draft：12/12 PASS，exitCode 0，runId 20261012-040535-c12-new-session-draft-d3dc（39 s，mock LLM，VS Code 真实窗口，隔离 test server 1.18.33）。前两轮失败均为测试侧（侧栏行选择器应为 `data-id`；D 的 pinned 面板需在 main 面板之后打开，否则 New 复用了它）。
- 回归 E：原样运行 p1a-chat（runId 20261012-040621-p1a-chat-9ab4）与 p1b-main-panel（20261012-040632-p1b-main-panel-adc7）均 FAIL，exitCode 1。原因：两个套件（共约 22 个 e2e 文件，见下）把 `oco: New Session` 当作“创建服务端会话”，现在返回草稿面板，sessionId 为 `draft-<uuid>`，服务端取消息返回错误对象（`ms.filter is not a function` / `msgs.at is not a function`）。属于预期行为变化带来的测试侧不兼容，不是产品缺陷。
- 为排除其他回归：临时副本把 New 换成“API 建会话 + oco: Open Session”后，p1a-chat 8/8 PASS（20261012-040711-p1a-chat-9b09）、p1b-main-panel 8/8 PASS（20261012-040751-p1b-main-panel-1a1c）。副本已删除，未留在仓库。

## 用例与判错依据
| 用例 | 结果 | 断言与能判错之处 |
| --- | --- | --- |
| draft-page-ui | PASS | 页面有 `session-new-design`、`[data-action=prompt-project]` 显示夹具文件夹名；点开菜单只有该文件夹，服务端另有 14 个已知项目（对照）一个都不出现；无 open/add project 项。旧行为（直接建会话）无该页面；未打补丁 0023 会列出其他项目和“添加项目”。 |
| draft-no-session | PASS | 打开页面并等 2.5 s，项目范围（scope=project）会话数不变（0→0）。 |
| draft-close-discards | PASS | 关闭全部编辑器后会话数不变且宿主 panels=0。 |
| send-creates-session | PASS | 发第一条消息后恰好 +1 会话，directory 等于夹具文件夹。 |
| send-reply-shown | PASS | 服务端用户消息和助手回复含唯一标记；面板切到新会话并有 composer。 |
| send-promote-in-place | PASS | 宿主 panels=1 且绑定新会话与其目录、无 draft-；bridge generation 不变；panel.stats.switchReloads 增量 0；页内 window 标记保留（整页重载会丢）。 |
| send-sidebar | PASS | 侧栏 `.row[data-kind=session][data-id=<新会话>]` 出现。 |
| worktree-session | PASS | 在 Git 栏选 Local→New workspace（栏上文字变为 New workspace），发送；新会话 directory ≠ 夹具文件夹、位于 `.oco-test/xdg/data/opencode/worktree/` 下且含 `.git`（会话约 1.5–2 s 创建）。 |
| worktree-reply-fast | PASS | 回复 5–6 s 内存入服务端并显示（限 60 s，未触发 5 分钟等待）。 |
| worktree-in-place | PASS | 同 send-promote-in-place，目录取 worktree 目录。 |
| worktree-sidebar | PASS | 侧栏出现该 worktree 会话。 |
| reload-drops-draft | PASS | 先有 main 会话面板，再开 pinned 会话面板，再 New（main 变草稿）；Reload Window 后只剩 pinned（对照：恢复机制有效），无草稿面板、无 `session-new-design` 页面。 |

## 备注
- 夹具：`.oco-test/c12/ws-<rand>`（git init + 提交），独立项目；运行结束清理 worktree，目录已删。test server 由本任务用 `OCO_E2E_MODEL=mock scripts/test-server.sh` 启动并在结束后停止。
- 未看任何截图。
- 需要主线程处理（测试侧，不在本任务写入范围）：约 22 个套件（tests/e2e 下 grep `"oco: New Session"`：c1-focus、c1-open-file、c2-diff-unavailable、c3-fork、c4-trajectory、c5-runtime、c9-mermaid、p1a-chat、p1a-identity、p1b-ime、p1b-main-panel、p1b-narrow、p1b-pending-send、p1b-switch-pending、p1b-theme-load、t004、t005、t007-managed、t007-multiroot、t010-recover、smoke）依赖 New 建会话。建议在 tests/e2e/vscode.mjs 加共享助手（API 建会话 + Open Session，或 New → 发消息转正），统一替换。

## 迁移批次（共享助手 + 全量回归）checkpoint
- task=e2e-new-migrate；唯一写入范围=tests/e2e/（除 c12）、本文件；requested_route=claude-subagent/sonnet；actual=claude-sonnet-5-5；状态=运行中。
- 进度：已读 AGENTS/TEST-SCOPE/上一轮记录；正在读 vscode.mjs/server.mjs 与各套件 New 用法。
- 下一步：vscode.mjs 加 createAndOpenSession；逐套件替换；分批跑；全量。
- 进度(更新1)：已在 tests/e2e/vscode.mjs 加 `createAndOpenSession(page,{title,directory,newPanel,wait})`（API 建会话 + Open Session/Open in New Panel，25 s 内无对应 frame 则重试一次）；server.mjs 的 `api` 加可选 directory 参数。已替换 21 个文件的 New 用法；t007-multiroot(new-session-in-folder) 与 p1b-sidebar(sidebar-create 的 "+") 按新行为改写（New→草稿页→发首条消息）。下一步：启动 mock 测试服务，分批跑，处理 t010 `newSession` 恢复按钮 / t007-managed / smoke。
- 进度(更新2)：批1 p1a-chat/p1b-main-panel/c1-focus/c1-open-file/c2-diff-unavailable 全部 exit 0；批2 c3-fork/c4-trajectory/p1a-identity/p1b-ime exit 0；c5-runtime 仅 `legend` 失败（图例现为 7 项，含补丁 0020 的 ticks 说明，测试仍限 5–6 项，与 New 无关，已放宽到 5–7）；c9-mermaid 需 `OCO_MOCK_LLM_EXTERNAL=1` 的服务（自带 4518 端口，不在默认 24 个内），内置 mock 下 EADDRINUSE 为既有约束。批3 运行中（p1b-narrow/pending-send/switch-pending/theme-load/t010-recover/t007-multiroot/t007-managed/p1b-sidebar）。
- 进度(更新3)：批3 通过：p1b-narrow/pending-send/switch-pending/theme-load/t010-recover/t007-managed 全 exit 0。修复测试侧：t007-multiroot（夹具两仓库 init 提交不同 + 重启测试服务清掉按路径缓存的旧项目 id，原因是 scope=project 把同项目文件夹的会话并入侧栏）、p1b-sidebar（"+"改写为草稿页发首条消息；A 改 API 建会话以保持 chain-draft 前无已发消息；列表对照改为"服务端前 100 个根会话去掉已归档"）、t010-recover 的 newSession 恢复按钮改为断言草稿页且无新服务端会话。t007-multiroot、p1b-sidebar 重跑 exit 0。下一步：mock 全量，另跑 smoke/t004/t005/c9。

## 迁移结果（共享助手 createAndOpenSession + mock 全量）
- 委派记录：task=e2e-new-migrate；requested_route=claude-subagent/sonnet；actual=claude-sonnet-5-5；状态=已返回；约 62 轮工具调用、约 95 分钟（略超 90 分钟预算）；测试服务由本任务启动并已停止。
- 共享助手：`tests/e2e/vscode.mjs` 的 `createAndOpenSession(page,{title,directory,newPanel,wait})`（API 建会话 + `oco: Open Session`/`Open in New Panel`，25 s 内无对应 frame 重试一次；`wait:false` 给自己计时首屏的套件）。`server.mjs` 的 `api` 增加可选 `directory`。
- 改用助手的套件（19，另有 t007-multiroot 改写，共改 20 个文件）：c1-focus、c1-open-file、c2-diff-unavailable、c3-fork、c4-trajectory（2 处）、c5-runtime、c9-mermaid、p1a-chat、p1a-identity、p1b-ime、p1b-main-panel、p1b-narrow、p1b-pending-send、p1b-switch-pending、p1b-theme-load、p1b-sidebar（B 会话）、t004、t005、t010-recover（t007-managed 与 smoke 保留 New，见下）。
- 判定为"测 New 本身"并按新行为改写：t007-multiroot `new-session-in-folder`（New→草稿页→发首条消息→会话 directory 为所选文件夹 B）；p1b-sidebar `sidebar-create`（点视图 "+"→草稿页→发首条消息→列表首位出现；后续 chain-draft 需要无已发消息的 A，故 A 另用 API 建）；t010-recover `session-deleted` 的"New Session"恢复按钮（断言草稿页 + 服务端会话数不变）。保留 New 不改：t007-managed `shared-by-panels`（只验证托管进程被面板共享，草稿面板同样满足；已跑通）、smoke（只看 webview 出现）。
- 其他测试侧修复（非 New 引起）：t007-multiroot 夹具两仓库 init 提交需不同（否则同一 project id，scope=project 把两文件夹会话并入侧栏；已存在的按路径缓存需重启测试服务才清）；p1b-sidebar 的 sidebar-list/connection-switch 对照改为"服务端前 100 个根会话去掉已归档"（测试服务累积了已归档会话）；c5-runtime `legend` 放宽到 5–7 项（补丁 0020 加了 ticks 说明项）。
- mock 全量 `node tests/e2e/run.mjs`（默认 24 个，起于 12:36）：23 个 exit 0，1 个 exit 1：p1b-main-panel（runId 20261012-044902-p1b-main-panel-dba6）`draft-per-session` 失败，切回 A 用了 71 s 且未找到 A 的 frame；同一套件之后单独重跑 3 次均 8/8 PASS，判定为间歇性，原因未定位（未复现，疑似 Open Session 选择器时序），产品侧无证据。run.mjs 无统一 runId，各套件 runId 见 docs/evidence/runs/（20261012-04* 起）。
- 非默认套件：c9-mermaid（需 `OCO_MOCK_LLM_EXTERNAL=1` 的服务，9/9 PASS）、t005（9/9 PASS）、smoke（正常出页面）、t004：`cancel` FAIL（mock 模型下 serverIdleAfterMs 129、文本已停止增长，但未返回 MessageAbortedError，疑为 mock 回复在点击前已结束；非 New 引起，P0 历史套件，基线未验证）。
- 副作用：t004/t005/smoke 会覆盖 docs/evidence/p0-artifacts 下被跟踪的截图与 json，已 `git checkout` 还原。
- unit：`bun test tests/unit` 297 pass / 0 fail。

## 第三轮（worktree 勾选框）结果
- 委派记录：task=c12-checkbox；唯一写入范围=tests/e2e/c12-new-session-draft.mjs、本文件；requested_route=claude-subagent/sonnet；actual=claude-sonnet-5-5；状态=已返回；约 9 轮工具调用；测试服务（`OCO_E2E_MODEL=mock scripts/test-server.sh`）由本任务启动并已停止。
- c12-new-session-draft：13/13 PASS，exitCode 0，runId 20261012-052504-c12-new-session-draft-d267（36 s）。
- 用例变化：A 新增 `draft-worktree-toggle`（恰好 1 个 `label[data-action="oco-new-worktree"] input[type=checkbox]`，文字 New worktree，默认未勾；工具栏按钮里无 Local/New workspace、无 menuitem；夹具当前分支名 main 在页面可见）。C 改为点击勾选框（断言勾选前 false、后 true）→发送：会话 directory 在 `.oco-test/xdg/data/opencode/worktree/` 下、≠ 夹具文件夹、含 `.git`；回复 4.2 s 到达（限 60 s）；面板原地换绑（generation 不变、switchReloads 0、页内标记保留）；侧栏出现。B、D 不变。
- 新截图：docs/evidence/runs/20261012-052504-c12-new-session-draft-d267/3-worktree-checked.png（替换旧的 3-new-workspace-selected）。未看截图。
- 回归：`node tests/e2e/run.mjs p1b-sidebar t007-multiroot` 两个 exit 0（p1b-sidebar 49 s，t007-multiroot 18 s），其中 sidebar-create 与 new-session-in-folder（经草稿页）PASS。
- 产品问题：无。p0-artifacts 无改动（t004/t005/smoke 未跑）。
