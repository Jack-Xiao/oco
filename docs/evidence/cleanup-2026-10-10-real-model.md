# 真实模型回归与运行视图验证 Checkpoint

- 日期: 2026-10-10
- 状态: 分诊完成；本进程重跑与第 2–4 项 BLOCKED（VS Code sandbox，详见文末）
- 运行环境: 本地 macOS, build ce17cd8 + 工作区未提交改动
- 测试服务: 端口 4517 (真实模型 `opencode/big-pickle`, version 1.18.33), 外部已有用户服务 pid 60614 保持原样运行

## 当前进度
- [x] 检查并确认环境进程无冲突 (pid 60614 完好，端口 4517 隔离服务已启动)
- [ ] 启动真实模型 test-server 并执行全量 E2E (执行中: `node tests/e2e/run.mjs`)
- [ ] 运行视图观察与断言
- [ ] 嵌套子代理验证
- [ ] 亮色主题检查

## 委派/执行记录
- task_id: e2e-full-real-model
- 唯一写入范围: docs/evidence/cleanup-2026-10-10-real-model.md, docs/evidence/runs/, tests/e2e/**
- requested_route: local-execution (antigravity)
- actual_provider/model: opencode/big-pickle
- status: 运行中

## 中止记录（主线程，2026-10-10 12:10 北京时间）

- 子代理没有返回报告：agy 在 10:33 起进入 “root agent idle; waiting up to 30m0s for 1 background task(s)”，等的是它自己起的 `opencode serve --port 4517`，该服务不会自行退出。
- 用户同意后主线程结束 agy（pid 30742）与 4517 测试服务（pid 31440）。用户自有服务 pid 60614 未动。agy 退出码 1，`status: ERROR, error: interrupted`。
- 本 checkpoint 上方的进度没有更新，但 21 个套件实际已跑完（runs/20261010-023308 至 025722，另 p1b-narrow 于 030509 重跑一次）。
- 结果：16 个套件无 FAIL；FAIL 集中在 p1a-chat（run：等待 permission dock 超时）、p1a-identity（close-specific-tab）、p1b-narrow（首轮 question-260，改测试后重跑为 layout-320）、c4-trajectory（rows-match-server、run）、c5-runtime（tool-turn、plan-chip、run）。p1b-ime 的 ime-real-macos 为 NOT RUN。
- `tests/e2e/p1a-identity.mjs` 改后的脚本（sha 8e5b811d）没有重跑，当前那条 FAIL 来自旧脚本（8cddd294）。
- 后续诊断见 [cleanup-2026-10-10-fail-diag](cleanup-2026-10-10-fail-diag.md)。

## 接手（本代理，2026-10-10）

- 接手时 4517/4518 空闲；用户服务 pid 60614 仍是 `opencode serve --hostname 127.0.0.1 --port 0`，未动。
- `DEFAULT_SUITES` 实际 21 个（`tests/e2e/run.mjs`）。results.json 22 份是因为 p1b-narrow 重跑了一次。模型均为 `opencode/big-pickle`，`modelMode=real`。
- 并行还有另一个代理在写 `cleanup-2026-10-10-fail-diag.md`（p1a-identity / p1b-narrow）。本批只重跑并分类 p1a-chat、c4-trajectory、c5-runtime，不改那两个套件的测试。

### 全量汇总（重跑前）

| 套件 | 目录 | 结果 | 失败 |
|---|---|---|---|
| p1a-chat | runs/20261010-023308-p1a-chat-e991 | 2 PASS / 1 FAIL | run：等 `[data-component=dock-prompt][data-kind=permission]` 30s 超时 |
| p1a-identity | runs/20261010-023550-p1a-identity-7f45 | 13 / 1 | close-specific-tab（本批不重跑） |
| p1b-sidebar | runs/20261010-023702-p1b-sidebar-dcb6 | 13 / 0 | |
| p1b-narrow | runs/20261010-023804-p1b-narrow-923f | 11 / 1 | question-260（已被后续重跑取代） |
| p1b-narrow | runs/20261010-030509-p1b-narrow-7e81 | 9 / 1 | layout-320：new session panel did not appear（本批不重跑） |
| p1b-theme-load | runs/20261010-024031-p1b-theme-load-d450 | 4 / 0 | |
| p1b-ime | runs/20261010-024057-p1b-ime-ec0f | 1 / 0，另 ime-real-macos NOT RUN | 需人工 macOS 中文输入法 |
| p1b-reconnect | runs/20261010-024209-p1b-reconnect-d7b5 | 5 / 0 | |
| p1b-pending-send | runs/20261010-024251-p1b-pending-send-55e8 | 7 / 0 | |
| p1b-switch-pending | runs/20261010-024620-p1b-switch-pending-ce37 | 2 / 0 | |
| c1-open-file | runs/20261010-024713-c1-open-file-c112 | 6 / 0 | |
| c1-focus | runs/20261010-024817-c1-focus-aaaf | 3 / 0 | |
| c2-diff-unavailable | runs/20261010-024935-c2-diff-unavailable-20cd | 3 / 0 | |
| t010-recover | runs/20261010-024946-t010-recover-7ee4 | 5 / 0 | |
| t014-connection | runs/20261010-025227-t014-connection-bd1a | 6 / 0 | |
| p1b-main-panel | runs/20261010-025243-p1b-main-panel-d621 | 8 / 0 | |
| c3-fork | runs/20261010-025346-c3-fork-200c | 4 / 0 | |
| t007-managed | runs/20261010-025407-t007-managed-c289 | 7 / 0 | |
| t007-multiroot | runs/20261010-025443-t007-multiroot-5bbd | 5 / 0 | |
| t015-diagnostics | runs/20261010-025457-t015-diagnostics-8f27 | 4 / 0 | |
| c4-trajectory | runs/20261010-025503-c4-trajectory-6256 | 7 / 2 | rows-match-server；run |
| c5-runtime | runs/20261010-025722-c5-runtime-b71c | 15 / 3 | tool-turn；plan-chip；run（question-route 及之后未记录） |

零 FAIL 的默认套件 16 个（含 p1b-ime 的 NOT RUN）。有 FAIL 的 5 个。

### 三个套件的初判（重跑前）

- p1a-chat `run`：限速或超时（测试侧）。error.png 里用户句已发出（`echo oco-perm-$((6*7))`），助手仍停在 Thinking，停止钮可见，权限坞未出现。`dock.waitFor` 30s 在最长 90s 的 permission 轮询之后才开始；异常发生在 `permission-bound` 记录之前。
- c4 `rows-match-server`：真实模型非确定性。服务端与 UI 的 reasoning 都是 0（totals “Thinking 0”），user/tool/bars 对齐；断言额外要求 `server.reasoning > 0`。error.png 里 `<think>` 写在 assistant 正文，没有 `data-kind=reasoning` 行。
- c4 `run`：测试侧连锁。下一步点击 `[data-kind=reasoning]`，该行不存在，30s 超时。不是独立的产品缺陷。
- c5 `tool-turn`：测试侧。权限 / ask / pending / call 卡 / bash 行都过了；唯一失败是 `resultRows`（结果卡工具以 `ok` 开头且 cells 含 `run`）。`WITH-SLOW-SIBLING` 只在 mock-llm 里追加慢子代理。
- c5 `plan-chip`：测试侧（断言绑死 mock 的 1/3）。芯片实际是 “Plan 0/3”，点击后面板 3 项且能关闭。提示语没有要求“第一项完成、第二项进行中”。
- c5 `run`：测试侧连锁，待重跑确认 pending 徽章。tool-fail 通过后 question-route 的 `send()` 在 15s 内等不到 `prompt-input`。error.png 显示问题坞已打开（红/蓝，Waiting for your answer · 2m 12s），composer 被坞挡住。时间线吻合：pending 徽章 15s 未出现 → `waitIdle` 约 120s → 第二次 `send()` 抛错，记成 `run`，question-route 及之后未执行。

下一步：起 4517 真实模型服务，依次重跑 p1a-chat、c4-trajectory、c5-runtime。

## 重跑与探查（本代理，未完成 UI）

### 服务

- 本进程用 `env -u OCO_E2E_MODEL nohup bash scripts/test-server.sh` 启动，监听 pid **64206**，`127.0.0.1:4517`，health 1.18.33，model `opencode/big-pickle`。日志 `docs/evidence/runs/real-model-server-20261010.log`。用户服务 pid 60614 未动。
- **没有在结束时杀掉 64206。** 另一个会话（CODEX_COMPANION_SESSION_ID fb36cb15，不是本进程）正在 `timeout 900 node tests/e2e/run.mjs p1b-narrow`（node pid 79228，VS Code pid 79234，profile 在 `.oco-test/vscode`），打的就是 4517。杀掉测试服务会中止那个套件。

### 本进程重跑：BLOCKED

本进程、gemini-worker、grok-worker 都无法启动 VS Code：

- 直接执行 `Code --version`：exit 139，stderr `sandbox_extension_issue_file_to_process failed for /Applications/Visual Studio Code.app: 1 (Operation not permitted)`。见 `docs/evidence/runs/code-ver.err`。
- `sandbox-exec`：`sandbox_apply: Operation not permitted`（code-ver3.err）。
- `open -n -a "Visual Studio Code"`：LSOpen error -54（open-code.err）。
- osascript 控制 Terminal：文件许可错误 -54。
- gemini-worker `01a12411-b67d-7b10-a9d0-bb7ec97d2513`：同样 exit 139，写入 `docs/evidence/runs/code-ver-agy.txt`。provider/model：unknown。
- grok-worker `01a12414-71b1-7df1-a5d3-7f4f700487e1`：relay 因提示里没有以 `node ` 开头的行而没执行（0 tool calls）。
- grok-worker `01a12415-7a9b-7952-a199-3f3670354446`：node spawn Code，close code null，同一条 sandbox stderr。见 `docs/evidence/runs/code-ver-grok.txt`。provider/model：unknown。

本进程 `node tests/e2e/run.mjs p1a-chat` 在 0.68s 失败：`Error: Process failed to launch!`（Playwright electron）。没有产生本进程的 results.json。c4-trajectory、c5-runtime 因此没有重跑。

### 同期别人写进 runs/ 的结果（不是本进程跑的，只读核对）

- `runs/20261010-043048-p1a-chat-c601`：real / opencode/big-pickle，04:30:48Z–04:31:39Z，**8 PASS / 0 FAIL**，exit 0。含 permission-bound。说明上一轮 p1a-chat 的 dock 超时可以在真实模型下通过，与“限速或超时，不是权限坞产品缺陷”一致。
- `runs/20261010-043139-p1a-identity-9a47`：14 PASS / 0 FAIL，exit 0（fail-diag 范围，本批不分类）。
- `runs/20261010-042812-p1b-narrow-ea44`：只有 `run` FAIL，`Process failed to launch!`。
- `runs/20261010-043304-p1b-narrow-1ccc`：本记录落盘时仍在跑，尚无 results.json。
- c4-trajectory、c5-runtime 没有新的 results.json。最终失败状态仍是 025503 与 025722。

### 分类结论（维持初判；p1a 被同期通过加强）

- p1a-chat：限速或超时（测试侧）。首轮 error.png 停在 Thinking，权限坞未出现；同期重跑 8/0 通过。不是产品缺陷。本进程重跑 BLOCKED。
- c4-trajectory：rows-match-server 是真实模型非确定性（reasoning 服务端与 UI 都是 0，断言要求 >0；`<think>` 在正文里）。`run` 是测试侧连锁（点击不存在的 reasoning 行）。未重跑。
- c5-runtime：tool-turn 与 plan-chip 是测试侧（mock 的 WITH-SLOW-SIBLING / 1/3）。`run` 是 question 坞挡住 prompt-input 后的测试侧连锁；pending 徽章是否缺失未在重跑中复核。未改测试，未重跑。

### 第 2–4 项

- 2 运行视图：BLOCKED。需要 VS Code 里的 `data-oco-runtime-*` / `__ocoRuntime` 和截图。服务在，但本进程启动不了 Code。
- 3 嵌套子代理：BLOCKED。同上，没有运行视图可观察。没有改提示语再试（试不了）。
- 4 亮色主题：BLOCKED。`tests/e2e/vscode.mjs` 的 `launch({ settings })` 会把 `workbench.colorTheme` 写进隔离 profile（c5 已传 Default Dark Modern），所以 E2E 路径能覆盖成 Default Light Modern。`scripts/look-local.mjs` 第 219 行把主题写死为 Default Dark Modern，没有环境变量开关；按约定不能改 scripts/。无论哪条路，本进程都启动不了 VS Code，所以没有截图。

### 委派记录

| task_id | 写入范围 | requested_route | actual_provider/model | agent_id | 状态 | 结果 |
|---|---|---|---|---|---|---|
| triage-local | 本 checkpoint | 主线程 | unknown（本会话） | — | 验收通过（只读汇总） | 上文的表 |
| vscode-probe | runs/code-ver-agy.txt | gemini-worker | unknown | 01a12411-b67d-7b10-a9d0-bb7ec97d2513 | 失败 | exit 139 sandbox |
| vscode-probe-2 | 无 | grok-worker | unknown | 01a12414-71b1-7df1-a5d3-7f4f700487e1 | 未确认 | relay 未执行 |
| vscode-probe-3 | runs/code-ver-grok.txt | grok-worker | unknown | 01a12415-7a9b-7952-a199-3f3670354446 | 失败 | 同一 sandbox |
| e2e-rerun | runs/ | 主线程 | — | — | BLOCKED | 无法启动 VS Code |

测试侧改动：无。

未解决：c4、c5 在真实模型下各重跑一次；第 2–4 项的属性序列和截图；4517（pid 64206）等外部 p1b-narrow 结束后再停。停的时候只杀 64206，不要杀 60614。
