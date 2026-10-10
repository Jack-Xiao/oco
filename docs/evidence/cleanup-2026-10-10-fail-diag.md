# cleanup 2026-10-10 失败套件诊断

- 范围：p1a-chat、p1a-identity、p1b-narrow、c4-trajectory、c5-runtime。产品代码不改。
- 模型：旧 run 均为 `modelMode=real`，`opencode/big-pickle`。
- 端口：开工时 4517/4518 空闲，pid 60614 不在。准备重跑时 4517 已被 `opencode` pid 64206 占用（cwd `.oco-test/workspace`，无已建立连接，`/global/health` 401）。4518 空闲。未杀 64206，也未另起服务（同一 `.oco-test` 不能再开一个）。
- 重跑：`OCO_NARROW_WIDTHS=320 timeout 600 node tests/e2e/run.mjs p1b-narrow` → run `20261010-042812-p1b-narrow-ea44`，0.70s，exit 1，`Process failed to launch!`。直接执行 Code `--version` 退出 139，stderr：`sandbox_extension_issue_file_to_process failed ... Operation not permitted`。本环境不能启动 VS Code，五套件都未重跑成功。
- 委派：requested_route=grok-worker。actual_provider=xAI。model=grok-4.7。agent_id=unknown。状态=已返回（诊断完成，GUI 重跑 BLOCKED）。fallback_reason=无。

## 判定

| 套件 | 判定 | 证据 | 测试侧处理 |
| --- | --- | --- | --- |
| p1a-chat `run` | 真实模型不确定性；未捕获超时是测试侧 | `20261010-023308-p1a-chat-e991`：stream-locked PASS 后等 permission dock 30s。error.png：bash 句已发出，停在 Thinking + 停止，没有 permission dock。脚本当时与失败 run 的 sha 相同 | 无 request 记 NOT RUN，有 request 但无 dock 才记 FAIL。question 改为大小写不敏感 |
| p1a-identity `close-specific-tab` | 测试侧（改动已在工作区，未由本轮重跑） | `20261010-023550-p1a-identity-7f45`：busyBefore/只关该 tab/无 error 均为真；busyAfterClose=false；lastAssistant.completed=true；finish=`stop`（正常结束，不是 error）。旧断言要求仍 busy | 已有 diff：`(stillBusy \|\| completed)`。sha `8cddd294…` → `8e5b811d…` |
| p1b-narrow `question-260` | 测试侧，第二轮已过 | `20261010-023804-p1b-narrow-923f`：几何 inside/hitSelf，clickError=null，recordedAnswer=`Blue`。旧断言 `=== "blue"` | 已改为 `toLowerCase()`。`20261010-030509-p1b-narrow-7e81` 的 question-260 为 PASS |
| p1b-narrow `layout-320` | 测试侧偶发，未证实产品缺陷 | 同一次 `7e81`：260/480/800 PASS 且有 layout 图；320 在 newSession 抛 `new session panel did not appear`，无 layout-320.png。首轮 `923f` 写过 `layout-320`，说明 320 曾打开 | 等待 60s→90s，错误带上 known 个数。重跑被 GUI 沙箱挡住 |
| c4 `rows-match-server` | 真实模型不确定性，不是 app 丢行 | `20261010-025503-c4-trajectory-6256`：server/ui reasoning 都是 0，bars 3=assistant 3，user/tool 一致，totals `Thinking 0`。唯一失败子句是 `server.reasoning > 0`。error.png：assistant 文本里是字面量 `<think>`，没有 reasoning 行 | 未放宽 `> 0`。无 reasoning 行时不再 click，避免把后续检查打成 `run` |
| c4 `run` | 测试侧（上一条的连锁） | 无条件 click `[data-kind="reasoning"]` 30s。missing 含 request-timing 及之后 | 见上一行 |
| c5 `tool-turn` | 测试侧（mock 口令） | `20261010-025722-c5-runtime-b71c`：其余旗标为真，仅 `resultRows=false`。`WITH-SLOW-SIBLING` 只在 `tests/e2e/lib/mock-llm.mjs` 里追加 task 子代理；真实模型不认这个口令，就没有 `run` cell | 仅当服务端真有 `task` part 时才要求 cell=`run`；detail 带上 tools/cells |
| c5 `plan-chip` | 测试侧（mock 把第一条标完成）；芯片显示与 0/3 一致，不是画错 | 同 run：`Plan 0/3`，面板 3 条，点击/关闭都成功。提示没有要求状态；mock 对 `plan: a; b; c` 固定 completed/in_progress/pending | 提示补上三种 status。mock 正则停在句号前，避免把补充句拆进待办 |
| c5 `run` | 测试侧 | error.png：question dock 已在（Which color / red / blue，Waiting 2m12s）。`send()` 再等 `[data-component="prompt-input"]` 15s。慢模型在 15s pending 窗口之后才弹出 dock，重试发送撞上已被 dock 替换的输入框 | 已有 dock 则不再 send；pending 等待 15s→90s，dock 可见也算等到 |

## 产品侧（只报告）

没有一条被判成 app 缺陷。

- c4 行种类来自 part.type：`vendor/opencode/packages/app/src/components/session/session-trajectory-model.ts` 约 289 行（`reasoning` 与 `text` 各成一行），属性在 `session-trajectory.tsx` 约 671 行 `data-kind={entry().row.kind}`。server reasoning=0 时 UI 为 0，与截图里的 `<think>` 文本一致。若 `<think>` 应拆成 reasoning part，不在这个视图。
- c5 计划芯片：`session-runtime-ring-view.tsx` 约 821 行 `data-oco-runtime-plan={`${p().done}/${p().total}`}`。失败时文本是 `Plan 0/3`，与“三条都未完成”一致。

## 改动文件

- `tests/e2e/p1a-chat.mjs`
- `tests/e2e/p1b-narrow.mjs`
- `tests/e2e/c4-trajectory.mjs`
- `tests/e2e/c5-runtime.mjs`
- `tests/e2e/lib/mock-llm.mjs`
- 本文件

`node --check` 五个文件通过。未提交。未杀 pid 64206。未动 pid 60614。

## 未完成

五套件的修复后重跑都没跑成（VS Code 在本进程沙箱里无法启动）。需要在能启动 Code 的环境重跑：`p1a-identity`、`OCO_NARROW_WIDTHS=320 p1b-narrow`、`p1a-chat`、`c4-trajectory`、`c5-runtime`。预期：identity 的 close-specific-tab 可过；p1b question-260 已在 `7e81` 过，320 待证实；p1a-chat 若模型仍不在 90s 内请求 bash，则为 NOT RUN 而不是 `run` 崩溃；c4 的 rows-match-server 在无 reasoning part 时仍 FAIL，但不应再因 click 中断；c5 的 plan-chip 仍取决于真实模型是否按句意写 status。

## 主线程重跑（2026-10-10 12:30–13:02 北京时间，真实模型 opencode/big-pickle，服务 4517）

Grok 沙箱启动不了 VS Code，重跑由主线程在本机执行（`timeout 900 node tests/e2e/run.mjs <suite>`，串行），工作树含本批全部未提交改动。

| 套件 | run | PASS / FAIL / NOT RUN | 非 PASS 项 |
| --- | --- | --- | --- |
| p1a-chat | 20261010-043048-p1a-chat-c601 | 8 / 0 / 0 | — |
| p1a-identity | 20261010-043139-p1a-identity-9a47 | 14 / 0 / 0 | — |
| p1b-narrow | 20261010-043304-p1b-narrow-1ccc | 8 / 1 / 1 | layout-260：new session panel did not appear（known 2，90 s 等待仍未出现）；allow-800：NOT RUN，模型两次都没发起 bash 权限 |
| c4-trajectory | 20261010-044323-c4-trajectory-c774 | 15 / 2 / 0 | live-update；subagent-row（子会话仍 running，rows 1，nested false） |
| c5-runtime | 20261010-044704-c5-runtime-cd6b | 24 / 4 / 0 | tool-turn（resultSamples 0，结果卡没被采到）；tool-fail（模型读失败后自行收尾，卡片是 round-end 而非失败卡）；retry（`RETRY-ONCE` 是 mock 口令，真实模型不触发重试）；run（900 s 外层超时杀掉浏览器，不是产品错误） |

结论：

- 上次的 p1a-chat、p1a-identity、c5 plan-chip、c5 question-route 失败已消除。
- p1b-narrow 的“新面板未出现”两次落在不同宽度（320、260），其余宽度通过，等待加到 90 s 也没救回。判为偶发，**可能是产品侧打开新面板的竞态**，需 mock 模式下复现后再定。
- c4 live-update / subagent-row、c5 tool-turn / tool-fail / retry 都依赖模型的时序或 mock 口令。真实模式下这些断言应改为按模式判 N/A 或放宽采样，未改，列入 NEXT。
- c5 全套在真实模型下超过 15 分钟，默认 `timeout 900` 不够。
- 进程：Grok 起的 4517 服务（pid 64206）重跑后由主线程关闭，4517/4518 已空；用户服务 60614 未动。
