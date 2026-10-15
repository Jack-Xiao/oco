# 真实模型 E2E 失败归因（只读诊断，未重跑任何 E2E）

来源：docs/evidence/runs/overnight-20261016-071259/summary.md（opencode 1.18.33 官方二进制，服务端配置模型 opencode/nemotron-3.5-lightning-free，`--real` 默认 13 套件，9 失败）。
类别：A 模型行为 / B 测试只支持 mock / C 环境或测试台配置 / D 疑似产品缺陷。证据来自各套件 results.json、log、服务端 SQLite（.oco-test/xdg/data/opencode/opencode.db 的副本，只读）与测试源码。

## 关键发现：测试台把真实模型写死成 big-pickle

tests/e2e/server.mjs:19-22 `detectModel()` 在 real 模式下固定返回 `{providerID:"opencode", modelID:"big-pickle", label:"Big Pickle"}`，不读取服务端实际配置（scripts/test-server.sh:20-22 的 `OCO_E2E_REAL_MODEL` 覆盖只改 opencode.json）。后果：
- 用 `prompt_async` 直接发提示的套件（c6、c10、c11）实际用的是 big-pickle，不是 nemotron。库里这 3 个会话的助手消息 tokens 全 0、无 completed、无 error（消息一直没有产出；c11 行显示 "Retrying"），所以用例失败不能算在 nemotron 头上。
- p1b-narrow 的 `getByText('Big Pickle')` 永远等不到（界面实际显示 "Nemotron 3.5 Lightning ..."，见 c14 的 error.png）。

## 归因表

| 套件 | 用例 | 类别 | 一句证据 | 建议 |
| --- | --- | --- | --- | --- |
| c16-sidebar-stop | row-stop / selection-stop / stop-all / cascade-confirm / waiting-stop（5 个 NOT RUN） | B | tests/e2e/c16-sidebar-stop.mjs:105-108：`MODEL.mode!=="mock"` 时全部记 NOT RUN 并 `throw "not a mock server"`，在 `launch()` 之前，所以不启动 VS Code，0 秒退出；因 NOT RUN 的必需用例使 exit=1，并非崩溃 | 放进 real 豁免（overnight 脚本在 real 下跳过或把该 NOT RUN 视为预期） |
| c17-subagent-aggregate | badge-running / badge-done / expand-collapse / open-child / lazy-children（5 个 NOT RUN） | B | tests/e2e/c17-subagent-aggregate.mjs:77-79 同 c16；提示用 mock 令牌 WITH-SLOW-SIBLING 让父会话派发 9 秒慢子代理（文件头第 3 行 "Mock model only"），1 秒退出 | 放进 real 豁免 |
| c6-inbox | subagents-waiting / run；缺 inbox-rendered、inbox-batch-approved、inbox-cleared | B（叠加 C） | 提示是 mock 令牌 `THREE-SUBAGENTS-NEED-PERMISSION`（c6-inbox.mjs:41），真实模型当普通文本；并且该会话用的是 big-pickle，库里助手消息 0 token 无产出；`/permission` 轮询 60 秒得 0 条 | 放进 real 豁免；另修 server.mjs 模型探测 |
| c10-sidebar-answer | run；缺 question-row、form-open、answer-sent、inbox-cleared | C | 会话 ses_ebe27cec… 发给 big-pickle（库里确认），60 秒内无 `/question`（`waitUntil` 超时返回 null 不抛错，之后 row.click 再等 30 秒，合计约 116 秒）；截图里会话空闲、无收件箱行。修正模型后可能转为 A（nemotron 不一定调 question 工具） | 先改测试台模型探测，再重判；若仍无提问则放进 real 豁免 |
| c11-sidebar-organize | todo-badge（delete-batch 为设计内 NOT RUN） | C | 提示 "Use the todowrite tool…" 发给 big-pickle，`GET /todo` 返回 []，行状态 "Retrying"；其余 5 个 PASS，说明侧栏本身正常 | 同 c10 |
| c14-review-notes | run；缺 notes-badge-2、badge-send-draft、draft-acked、badge-cleared、no-auto-send | C（UI 偶发，未证实） | 与模型无关（不发任何提示）；notes-badge-1 PASS，第二次 `selectLines`（c14-review-notes.mjs:77 Ctrl+G 的 quick-input）5 秒内不可见；error.png 中编辑器只剩第 9 行、底部 Comments 面板已弹出，编辑器视口异常。mock 下曾通过 | 先在 mock 下复跑一次判断是否稳定复现；暂不豁免、不算产品缺陷 |
| p1b-narrow | layout-260/320/480/800；缺各宽度的 deny/allow/question | C | 每个宽度 `getByText('Big Pickle')` 等 60 秒超时（4 次≈240 秒，对应 290 秒耗时）；标签来自 server.mjs:21 写死值，界面是 Nemotron | 修 server.mjs 探测（用 `/config` 的 model 取标签）；之后若 allow/deny/question 仍依赖 mock 令牌再豁免 |
| c5-runtime | perm-reject | B | 工具状态 error、行文案 "You rejected the permission request" 都正确；只有 8 秒内要采到 card kind=`rejected`，提示带 mock 令牌 WITH-SLOW-SIBLING（c5-runtime.mjs:686、692）才能让轮次保持存活，真实模型直接结束，卡片变 `round-end` | 改测试 real 分支（仿 tool-fail 记 N/A，原因同上） |
| c5-runtime | same-command | A | 要求同一命令 3 次（["1/3","2/3","3/3"]，c5-runtime.mjs:881），模型只发出 2 次（["1/2","2/2"]），界面 "called no tools" | 放进 real 豁免，或 real 下放宽为 ≥1 次 |
| c5-runtime | subagent | A | task 工具确实被调用（subCellUid 存在、子面板与面包屑正常），但 30 秒内 `childDone=false`、`taskStatus=running`，nemotron 子代理太慢（c5-runtime.mjs:986） | real 下拉长超时或放进 real 豁免 |
| c5-runtime | run；缺 replay-no-actions、keyboard、think-card、think-expand、width-560、width-wide、ring、motion-on、reduced-motion、width-1600、parallel 等 | A（级联，具体行未确认） | 15 秒 `waitFor` 超时，此时页面停在 "Waiting for your approval / 2 waiting for your answer"：前一个 subagent 用例留下仍在跑、等待批准的子代理，后续用例全部没跑。error 只存了 500 字符，失败行无法精确定位 | 先解决 subagent 超时/残留（放进 real 豁免或收尾时中止会话），再看后续用例；N/A 的 tool-fail、retry 已有 real 分支，无需处理 |
| c4-trajectory | subagent-link | D?（低置信度，待复现） | 真实模型调用了 task（有 child 会话）；href=null、role=button、clickOutline=none、switched=true、opened=[] 全部符合，只有 `back=false`：点击子会话标题 `[data-slot="session-title-parent"]` 15 秒内没有回到父面板（c4-trajectory.mjs:441-445；点击被 `.catch(()=>{})` 吞掉，无法区分元素缺失与点击无效）。mock 两次均 `back:true`。可能是子会话仍在运行或标题尚未加载导致的真实模型时序，也可能是返回导航缺陷 | 在 mock 与 real 各复跑 c4 一次；若 real 复现，再查子会话标题父链接渲染 |

## 汇总（按行计，一行一个归因单元）

- A 3（c5 same-command、subagent、run 级联）；B 4（c16、c17、c6、c5 perm-reject）；C 4（c10、c11、c14、p1b-narrow）；D 1（c4 subagent-link，低置信度）。
- c4 其余 16 项、c12、c13、c15、p1b-sidebar 全部 PASS。
- c16 / c17 的 0 到 1 秒结束是设计内的 mock-only 早退，不是崩溃、端口或锁问题。
