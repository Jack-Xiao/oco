# mini-real 真实模型全量 E2E（21 套件）

## 基线

- 提交：f5ff439（分支 mini/mini-real）
- opencode：`~/oco-bin/official/node_modules/.bin/opencode --version` = 1.18.33
- 实际模型：`opencode/nemotron-3.5-lightning-free`（取自各 results.json 的 model 字段；c18 / c21 / c23 因 mock 守卫在启动前退出，model 字段缺失记 unknown）
- VS Code：1.142.0（results.json 的 vscodeVersion）
- 时间：开始 2026-10-16 15:19:48（checkpoint）；链 15:26:48 → 17:09:29（102 分 41 秒）；mock 对照 17:11 → 约 17:24；证据整理完于 17:27
- 端口：4527/4528 被他人进程占用（`mock-llm.mjs` PID 73828、vendor `serve` PID 73830，未动），改用 4537/4538
- 预检：模型探针第 1 次 90 秒无输出（`perl alarm` 代替本机没有的 `timeout`），5 分钟后第 2 次返回 OK；未改用 big-pickle，全程 nemotron
- 命令：
  1. `bash scripts/overnight-e2e.sh --real`（10 套件）→ `docs/evidence/runs/overnight-20261016-152648/summary.md`
  2. `bash scripts/overnight-e2e.sh --real c18-permission-note c19-label-snooze c20-inbox-nav c21-follow c22-review-threads c23-subagent-pills c24-runtime-question visual-light-sidebar` → `docs/evidence/runs/overnight-20261016-155623/summary.md`
  3. 重跑 12 个有 FAIL 的套件（`--real`）→ `docs/evidence/runs/overnight-20261016-160120/summary.md`
  4. 对照（`--mock c14-review-notes p1b-sidebar p1b-narrow c12-new-session-draft c19-label-snooze`）→ `docs/evidence/runs/overnight-20261016-171154/summary.md`
- 委派记录：本批为 mini 机无人值守脚本任务，未委派子代理；E2E 由 `overnight-e2e.sh` 直接执行，主线程只读 summary / results.json。

## 21 套件结果

“结果”和“计数”是首轮；“重跑”是第二轮（`overnight-20261016-160120`）。终态 = 重跑结果（无重跑取首轮）。计数顺序 PASS/FAIL/NOT RUN/N/A。results.json 路径省略前缀 `docs/evidence/runs/`；每格先首轮、后重跑。

| # | 套件 | 结果 | 计数 | 首轮耗时 | 重跑结果 | 类别 | 失败用例 id | results.json |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | c6-inbox | N/A | 未运行 | - | - | B | 无（脚本在 --real 下跳过，提示用 mock 口令 THREE-SUBAGENTS-NEED-PERMISSION） | 无 |
| 2 | c10-sidebar-answer | FAIL | 0/1/0/0 | 44s | FAIL（0/1，116s） | A | run（缺 question-row、form-open、answer-sent、inbox-cleared；30s 点不到 question 行） | 20261016-072650-c10-sidebar-answer-9c52 ; 20261016-080122-c10-sidebar-answer-989d |
| 3 | c11-sidebar-organize | FAIL | 5/1/1/0 | 28s | FAIL（5/1/1，29s） | A | todo-badge（NOT RUN：delete-batch，设计内） | 20261016-072734-c11-sidebar-organize-36e7 ; 20261016-080318-c11-sidebar-organize-2b1d |
| 4 | c12-new-session-draft | FAIL | 11/2/0/0 | 170s | FAIL（11/2，169s） | A（real 特有，mock 13/13 通过） | send-reply-shown、worktree-reply-fast | 20261016-072802-c12-new-session-draft-be93 ; 20261016-080346-c12-new-session-draft-2e5a |
| 5 | c13-worktree-inbox | FAIL | 5/1/0/0 | 164s | PASS（6/0，65s） | C 偶发 | worktree-sessions-waiting（仅首轮） | 20261016-073053-c13-worktree-inbox-cfed ; 20261016-080636-c13-worktree-inbox-3cf9 |
| 6 | c14-review-notes | FAIL | 5/1/0/0 | 79s | FAIL（5/1，79s） | C/D?（mock 也败） | draft-acked | 20261016-073336-c14-review-notes-abc1 ; 20261016-080740-c14-review-notes-02d6 |
| 7 | c15-fix-with-opencode | PASS | 5/0/0/0 | 53s | 未重跑 | - | - | 20261016-073455-c15-fix-with-opencode-981d |
| 8 | c16-sidebar-stop | N/A | 未运行 | - | - | B | 无（--real 跳过，mock 专属） | 无 |
| 9 | c17-subagent-aggregate | N/A | 未运行 | - | - | B | 无（--real 跳过，mock 专属） | 无 |
| 10 | c18-permission-note | N/A | 0/0/2/0 | 1s | 未重跑 | B | 无（NOT RUN：always-preview、deny-note，“needs the scripted mock model”） | 20261016-075625-c18-permission-note-8442 |
| 11 | c19-label-snooze | FAIL | 4/1/0/0 | 19s | FAIL（4/1，19s） | C（测试台缺陷；mock 5/5 通过） | run（`run.recordNotApplicable is not a function`；缺 waiting-not-hidden） | 20261016-075625-c19-label-snooze-83a2 ; 20261016-080859-c19-label-snooze-0532 |
| 12 | c20-inbox-nav | FAIL | 3/2/0/0 | 99s | PASS（5/0，33s） | C 偶发 | inbox-quickpick-opens、inbox-enter-opens-session（仅首轮） | 20261016-075645-c20-inbox-nav-2ed7 ; 20261016-080919-c20-inbox-nav-cf20 |
| 13 | c21-follow | N/A | 0/0/3/0 | 1s | 未重跑 | B | 无（NOT RUN：follow-on、preview-open、focus-stays，“needs the scripted mock model”；exit 1 因必需用例 NOT RUN） | 20261016-075824-c21-follow-d334 |
| 14 | c22-review-threads | PASS | 2/0/0/0 | 72s | 未重跑 | - | - | 20261016-075824-c22-review-threads-a528 |
| 15 | c23-subagent-pills | N/A | 0/0/2/0 | 0s | 未重跑 | B | 无（NOT RUN：pills-visible、pill-open-child，“needs OCO_E2E_MODEL=mock”；exit 1 同上） | 20261016-075936-c23-subagent-pills-86cd |
| 16 | c24-runtime-question | FAIL | 0/3/0/0 | 95s | FAIL（1/2，95s） | A | ask-card、option-click（question-cleared 仅首轮） | 20261016-075937-c24-runtime-question-ee61 ; 20261016-080952-c24-runtime-question-ae63 |
| 17 | p1b-sidebar | FAIL | 12/1/0/0 | 68s | FAIL（12/1，91s） | C/D?（mock 也败） | chain-draft | 20261016-073549-p1b-sidebar-100d ; 20261016-090758-p1b-sidebar-7088 |
| 18 | p1b-narrow | FAIL | 8/3/0/0 | 883s | FAIL（7/2/1，1593s） | C（layout-260 real 特有；question-320 mock 也败） | 首轮 layout-260、allow-320、question-320；重跑 layout-260、layout-480（NOT RUN：deny-800） | 20261016-073656-p1b-narrow-9da0 ; 20261016-084126-p1b-narrow-c4c8 |
| 19 | c5-runtime | FAIL | 11/2/0/0 | 243s | FAIL（16/5/1/1，1113s） | A/B 混合（见下） | 首轮 trajectory-still-works、run；重跑 perm-reject、fold、same-command、no-leak、run | 20261016-075140-c5-runtime-beb2 ; 20261016-082253-c5-runtime-3a40 |
| 20 | c4-trajectory | FAIL | 0/1/0/0 | 41s | PASS（17/0，686s） | A 偶发（疑免费模型 30s 内未出 bash 工具调用） | run（`reading 'id'`，仅首轮） | 20261016-075543-c4-trajectory-079f ; 20261016-081127-c4-trajectory-b953 |
| 21 | visual-light-sidebar | PASS | 1/0/0/0 | 9s | 未重跑 | - | - | 20261016-080111-visual-light-sidebar-e1b3 |

终态汇总：PASS 6（c13 c15 c20 c22 c4 visual）/ FAIL 9（c10 c11 c12 c14 c19 c24 p1b-sidebar p1b-narrow c5）/ N/A 6（c6 c16 c17 c18 c21 c23）= 21。首轮 PASS 3 / FAIL 12 / N/A 6。

## 稳定失败清单（同套件同用例 id 两轮都 FAIL；类别 B 不计）

| 套件 | 用例 | 现象（一行） | 类别 | 疑似位置 |
| --- | --- | --- | --- | --- |
| c10-sidebar-answer | run（question-row 等 4 项缺） | 模型不调用 question 工具，30s 点不到收件箱 question 行；与 10-16 重跑归因一致（“同 10-16 归因 A”） | A | tests/e2e/c10-sidebar-answer.mjs（question 行 click） |
| c11-sidebar-organize | todo-badge | 小模型不写 todo，badge 不是 1/3；同 10-16 归因 | A | tests/e2e/c11-sidebar-organize.mjs:116 |
| c12-new-session-draft | send-reply-shown | 助手回复不含标记（assistantHasMarker=false）；mock 13/13 通过 | A（本轮新现象：10-16 此套件 PASS） | tests/e2e/c12-new-session-draft.mjs（标记断言，依赖 mock 回复文本） |
| c12-new-session-draft | worktree-reply-fast | 61s 未存回复（replyStored=false，限制 60s）；两轮 61.1s / 61.2s | A | tests/e2e/c12-new-session-draft.mjs（60s 限制） |
| c14-review-notes | draft-acked | draftAcks 从 0 跳到 4，断言要求恰好 +1；rejects=0、pending=0；mock 同败 | C/D?（与模型无关；是测试断言过严还是面板重复 ack 未判定） | tests/e2e/c14-review-notes.mjs:147 |
| c19-label-snooze | run | 测试走 N/A 分支时调用 `run.recordNotApplicable(...)`，但该方法不存在（其他套件用导入的函数 `recordNotApplicable(run, REQUIRED, ...)`），套件崩溃，缺 waiting-not-hidden；mock 5/5 通过 | C（测试台缺陷，只在 real 触发） | tests/e2e/c19-label-snooze.mjs:169（对照 c5-runtime.mjs:762、tests/e2e/lib/results.mjs） |
| c24-runtime-question | ask-card | 无待答问题（pending=false，nOpts=0）；服务端已答（answeredServerSide=true）；模型不调用 question 工具 | A（与 10-16 c10 同因） | tests/e2e/c24-runtime-question.mjs:56 |
| c24-runtime-question | option-click | 同上，无选项可点 | A | tests/e2e/c24-runtime-question.mjs |
| p1b-sidebar | chain-draft | draft 为空（draftHead=""，sentMessages=0）；mock 同败 | C/D?（与模型无关，10-16 此套件曾 PASS） | tests/e2e/p1b-sidebar.mjs:333 |
| p1b-narrow | layout-260 | 等 `[data-component="prompt-input"]` 30s 点不到；mock 下 layout-260 通过 | C（real 特有，疑新会话 frame 未渲染 / 模型相关停滞，未证实） | tests/e2e/p1b-narrow.mjs:34、:42 |

## 偶发（首轮 FAIL、重跑 PASS）

- c13-worktree-inbox：worktree-sessions-waiting（首轮 5/1，重跑 6/0）
- c20-inbox-nav：inbox-quickpick-opens、inbox-enter-opens-session（首轮 3/2，重跑 5/0）
- c4-trajectory：首轮 41s 内 run 崩溃（`reading 'id'`，沿用 10-16 checkpoint 2 的“免费模型 30s 内无 bash 工具调用”症状），重跑 17/17

## 不稳定（两轮失败用例不同；不进稳定失败清单）

- c5-runtime：首轮 trajectory-still-works、run；重跑 perm-reject、fold、same-command、no-leak、run。两轮 run 都是 15s `waitFor` 超时（崩溃后其余用例缺失，重跑缺 23 项、首轮缺 25 项），疑似与 10-16 归因的 subagent 级联同一类（A），本轮未深查。重跑的 perm-reject 是类别 B（mock 口令 WITH-SLOW-SIBLING），same-command 与 10-16 同（A）。fold、no-leak、trajectory-still-works 未归因。
- p1b-narrow（除 layout-260 外）：首轮 allow-320、question-320，重跑 layout-480；question-320 在 mock 下也败（疑与模型无关，C/D?），allow-320、layout-480 未复现。

## N/A 用例（mock 口令）

- c6 / c16 / c17：`overnight-e2e.sh --real` 跳过，类别 B。
- c18：always-preview、deny-note（needs the scripted mock model）
- c21：follow-on、preview-open、focus-stays（needs the scripted mock model）
- c23：pills-visible、pill-open-child（needs OCO_E2E_MODEL=mock）
- c5 重跑内：tool-fail（N/A，需 mock 慢兄弟），perm-reject 因同一机制失败（B）
- 注：c18 / c21 / c23 的 exit 非 0（c21、c23）或 0（c18）是必需用例 NOT RUN 所致，不是崩溃。

## BLOCKED

- 无整批阻塞。唯一一次停滞：预检探针第 1 次 90s 无输出，5 分钟后恢复；c4 首轮 41s 崩溃疑为同类短停滞，重跑恢复。

## 遗留 NOT RUN

- c10：两轮 0/1，run 崩溃使 question-row、form-open、answer-sent、inbox-cleared 缺失（A，模型不调 question）。
- c11：delete-batch NOT RUN（“destructive; kept to archive only”，设计内）。archive-batch 本轮未出现在 NOT RUN 中。
- c5 重跑：dismiss NOT RUN（无 Dismiss 控件，且没有可 reject 的待答问题，因模型未提问）；retry 等同 N/A 场景见 results.json。
- p1b-narrow 重跑：deny-800 NOT RUN（模型两次都没请求 bash 权限），且 allow-260 / question-260 / allow-480 / question-480 缺失。
- 「真实模型压缩目视」没有套件，保持 NOT RUN。

## 限制与未查项

- 本轮单次重跑，样本小；稳定 / 偶发判定只基于两轮。
- c5-runtime 的 fold、no-leak、trajectory-still-works 以及 p1b-narrow 的 allow-320 / layout-480 没有深查，也没有 mock 对照（c5 在 mock 下的结果未跑）。
- 对照只跑了 5 个套件（c14 p1b-sidebar p1b-narrow c12 c19）。c14 / p1b-sidebar / p1b-narrow:question-320 mock 同败，说明与模型无关；是测试台问题还是产品缺陷（D）本轮没有证据，未归 D。
- c12 本轮 real 下失败而 10-16 为 PASS；模型 / 服务端版本（1.18.33 官方）与 10-16 的测试环境不同，差异来源未查。
- 4527/4528 上的他人服务未动；本机无 `timeout` 命令，探针用 `perl -e 'alarm 90; exec @ARGV'`。
- 未看截图；没有改任何代码。

## 1.19.0 子集（opencode-ai@1.19.0，第二阶段）

状态：已完成（无 BLOCKED）。只记录，未改代码。

**基线**
- 提交 625b306；`$OCO_OPENCODE_BIN --version` = 1.19.0（`~/oco-bin/official-1190`，npm 本地装，未碰 `~/oco-bin/official`）；实际模型（results.json）`opencode/nemotron-3.5-lightning-free`；VS Code 1.142.0；端口 4537 / 4538。
- 开始 2026-10-16 17:41:24，链结束 18:39:51，总耗时约 58 分钟（链 17:41:47 起）。
- 探针：第 1 次即输出 OK。
- 批 A（1.19.0，`--real p1a-chat c4-trajectory c5-runtime t015-diagnostics`）：`docs/evidence/runs/overnight-20261016-174147/summary.md`，serverVersion 1.19.0。
- 批 B（1.18.33 对照，`OCO_OPENCODE_BIN=~/oco-bin/official/node_modules/.bin/opencode … p1a-chat t015-diagnostics`）：`docs/evidence/runs/overnight-20261016-180721/summary.md`，serverVersion 1.18.33。
- 批 C（1.19.0 重跑 c4-trajectory c5-runtime p1a-chat）：`docs/evidence/runs/overnight-20261016-182146/summary.md`，serverVersion 1.19.0。三批 model 均为 nemotron。

**结果（4 套件）**

| 套件 | 1.19.0 首轮 | serverVersion | 1.19.0 重跑 | 1.18.33 对照（来源） | 差异 / 类别 | results.json（首轮 / 重跑 / 对照） |
| --- | --- | --- | --- | --- | --- | --- |
| p1a-chat | FAIL（PASS 1 / FAIL 2 / NOT RUN 2，957 s） | 1.19.0 | FAIL（PASS 1 / FAIL 2 / NOT RUN 1，525 s） | FAIL（批 B：PASS 1 / FAIL 2 / NOT RUN 2，858 s） | 稳定失败，两版同样失败 = 与版本无关；类别 A/C（`stream-locked` serverChars 0 即模型无输出；`run` 点 prompt 输入框 30 s 超时；permission-bound / question-answer 模型未触发） | 20261016-094149-p1a-chat-bf33 / 20261016-103107-p1a-chat-c4f7 / 20261016-100723-p1a-chat-9006 |
| c4-trajectory | FAIL（`run` 崩溃 `Cannot read properties of undefined (reading 'id')`，0/1，40 s） | 1.19.0 | PASS 17/17（265 s） | 首轮 `run` 崩溃偶发、重跑 17/17（mini-real 表） | 偶发，与对照同形；结论 PASS | 20261016-095746-c4-trajectory-5bdb / 20261016-102148-c4-trajectory-b3a4 / — |
| c5-runtime | FAIL（PASS 12 / FAIL 2：`plan-chip`、`run` 15 s 超时，529 s） | 1.19.0 | FAIL（PASS 4 / FAIL 1：`run` 15 s 超时，293 s） | 两轮 FAIL，`run` 15 s 超时（mini-real 表） | `run` 两轮都 FAIL = 稳定失败；对照本身不稳定，不判版本差异；类别 C | 20261016-095826-c5-runtime-a7ca / 20261016-102614-c5-runtime-4a48 / — |
| t015-diagnostics | PASS 4/4（5 s） | 1.19.0 | 未重跑 | PASS 4/4（批 B，6 s） | 无差异 | 20261016-100716-t015-diagnostics-2211 / — / 20261016-102141-t015-diagnostics-6377 |

（NOT RUN 的 permission-bound / question-answer：模型未请求权限 / 未调用 question 工具，类别 A。）

**t015 `status-version`**（两版均 PASS）
- 1.19.0：version `1.19.0`，statusText `$(oco-logo) oco $(bell-dot) 3`，不含 `$(warning)`。
- 1.18.33：version `1.18.33`，statusText `$(oco-logo) oco $(bell-dot) 1`，不含 `$(warning)`。

**1.19.0 特有失败（版本相关嫌疑）**：无。

**结论**：真实模型下，1.19.0 相对 1.18.33 未见新增失败 / 不兼容；p1a-chat 两版同样失败，c4 偶发后重跑通过，c5 `run` 超时在两版都出现。

**限制与未查项**
- 样本小（每套件 1–2 轮）；免费模型输出波动（p1a-chat `serverChars: 0`、permission/question 未触发）使 p1a-chat 的多数用例无法验证，1.19.0 在这些用例上的行为未被检验。
- c5 对照本身不稳定，不能判版本差异；`run` 超时的具体位置未追查（只记录，未看截图）。
- p1a-chat `run` 失败（点 prompt 输入框超时，两版同形）与 c4 `run` 崩溃（`reading 'id'`）的测试侧位置未定位。
- 批 B 只跑了 p1a-chat 与 t015；c4 / c5 对照取自 mini-real 21 套件表，而非本次同批。
