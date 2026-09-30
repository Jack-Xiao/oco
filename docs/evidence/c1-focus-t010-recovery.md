# C1 焦点收尾 + T010 错误恢复（2026-09-30）

基线：main `33433bb` + 开工时 main 检出中的未提交测试改动（见“开工时的未提交改动”）。工作在 worktree `claude/c1-focus-t010-recovery-a216bc`，**未提交**。
环境：VS Code 1.139.1（isolated profile）；OpenCode 1.18.33（隔离测试服务 `scripts/test-server.sh`，端口 4527）；上游 `51ef4be`；Node v26.7.0；Bun 1.3.10。主线程实现，未委派；model/provider unknown。

**模型边界**：本批所有 E2E 都用脚本模型 `OCO_E2E_MODEL=mock`（`tests/e2e/lib/mock-llm.mjs`，本机 127.0.0.1，不外发）。这证明 UI/宿主行为，**不证明真实模型链路**。运行元数据 `modelMode: "mock"`，`brief` 把这类运行归为 special（`mock-model`），不计入验收。

## 开工时的未提交改动

HEAD 为 `33433bb`；worktree 本身干净，未提交改动在 main 检出（`/Users/xiaojiang/Ai-Project/oco`），且另一会话当时正在 main 上运行 E2E（端口 4517/4518）。处理：

- **未改动 main 检出**。把 main 的 `git diff`（15 个文件）与两个新文件（`scripts/test-server.mock.opencode.json`、`tests/e2e/lib/mock-llm.mjs`）原样复制进本 worktree 作为基线，未提交、未重置。
- 用途判断：脚本模型支持（mock LLM + 测试服务开关 + `server.mjs` 的 `MODEL` 探测 + 各套件改用 `MODEL.label/providerID`）；`brief` 标记 mock 运行；`vscode.mjs` 命令面板/快速输入等待改为条件等待；`c1-open-file` 去掉部分固定 sleep。完成度：可用，本批 c1-open-file 6/6 在 mock 下通过。
- 本批对其追加：`test-server.sh` 支持 `OCO_MOCK_LLM_PORT`（改写配置里的 4518）与 `OCO_MOCK_LLM_EXTERNAL=1`（不自己起 mock），以便与另一会话的 4517/4518 并存。
- 进程冲突：另一会话的 mock 清理似乎按 `mock-llm` 名杀进程，我的 mock 曾被杀；我也用过一次 `pkill -f tests/e2e/lib/mock-llm.mjs`（可能误伤对方的 mock，之后对方 4518 上的 mock 在运行）。此后本批 mock 以 `/private/tmp/oco-cft/cft-stub-model.mjs`（同一文件的副本）运行，结束时按 PID 只停自己的 4527/4528。
- `.oco-test` 在本 worktree 是指向 `/private/tmp/oco-cft` 的符号链接（IPC socket 路径长度限制）。

## 一、C1 焦点

### 根因（已定位）

VS Code 1.139.1 `out/vs/workbench/contrib/webview/browser/pre/index.html` 的 `trackFocus`：webview 的焦点只靠每 250 ms 轮询 `document.hasFocus()`，变化时才发 `did-focus`，这是唯一来源。点击聊天里的文件名时，若 webview 原本没有焦点，mousedown 让它获得焦点；如果轮询恰好落在 mousedown 与文本编辑器取走焦点之间，`did-focus` 在文件打开**之后**才被处理，聊天组被重新激活，盖住文件。

诊断（临时脚本，已删除）：页面内未发生任何程序化 `focus()`；“聊天组激活、键盘焦点在侧栏”状态下 20 次真实点击出现 2 次打开后 `panel.active=true`（旧代码 `refocus` 分支两次触发，`refocuses` 1→2）。

### 风险复现（负向对照，旧宿主代码 `33433bb` 的 panels.ts）

新套件 `tests/e2e/c1-focus.mjs`，运行 `20260930-120600-c1-focus-2d26`：

| 用例 | 结果 |
| --- | --- |
| return-via-tab（打开后约 300 ms 用户点回聊天标签） | FAIL 3/3：聊天被拉回文件 |
| return-via-webview（打开后约 300 ms 点击聊天输入框） | FAIL 3/3 |
| open-stays-on-file | 20/20 文件保持在前（旧计数器不存在，判为 FAIL） |

结论：1 s `refocus` 窗口会把用户主动回到聊天当作异常焦点，风险**已复现**。

### 修复机制

- 页面记录窗口最近一次获得焦点的时间，`openFile` 附带 `focusAgeMs`（`apps/chat-webview/src/app.tsx`；契约 `packages/contracts/src/bridge.ts`，非负有限数校验）。
- 宿主 `settleWebviewFocus`（`apps/extension/src/panels.ts`）：若 `focusAgeMs` < 250 ms 轮询 + 60 ms 余量，则**先等**该次 `did-focus`（面板变为 active）或轮询已过（最长约 310 ms），再打开文件。之后不会再有迟到的激活。
- 删除 1 s `refocus` 补偿；之后的任何激活都视为用户操作，不再干预。诊断计数 `focusWaits`（等待次数）、`lateActivations`（打开后 1 s 内的聊天激活，只计数不处理）。
- 依赖：VS Code webview 焦点轮询间隔 250 ms（1.139.1 实测源码）。若将来 VS Code 改变该机制需复核。

### 正反向证据

| 运行 | 代码 | 结果 |
| --- | --- | --- |
| `20260930-120720-c1-focus-d44c` | 修复 | 3/3 PASS；20 次打开，`focusWaits` 10，`lateActivations` 0；主动回到聊天 6/6 保持 |
| `20260930-120843-c1-focus-01ec` | 变异：去掉等待（其余同修复） | FAIL：60 次中 1 次迟到激活，第 5 次（侧栏焦点状态）聊天盖住文件 |
| `20260930-121122-c1-focus-6ebc` | 修复 | 3/3 PASS；60 次，`focusWaits` 30，`lateActivations` 0 |
| `20260930-130446-c1-focus-8465` | 最终构建 | 3/3 PASS；20 次，`focusWaits` 10，`lateActivations` 0 |

限制：竞态命中率约 3–10%/次（与轮询相位有关）。修复后三次运行共 100 次打开（50 次处于竞态状态并等待）0 次迟到激活；这是统计证据加机制证据（trace 显示 `focusAge=0` 时等待约 310 ms 后才打开），不是穷举证明。

## 二、T010 错误恢复

### 现状核查（修复前）

临时调查脚本，旧 webview：

- 会话打开时服务中断：面板内**无任何提示**（只有状态栏“oco 重连中”）。
- 面板文档在服务不可达时加载：上游 “Could not reach oco / Retrying automatically…”，无重试/设置入口；服务恢复后模型与 Agent 未加载（“Select model”，上游 toast “Failed to reload workspace”），面板实际不可用。
- 会话被删除：上游 “This session cannot be found … Close Tab”。
- 未知错误（消息列表 500）：上游错误页，**原样显示服务端消息与本机路径堆栈**（夹具里的 `token=SECRET-…`、`/Users/...`），以及 “Report Error / Please report this error to the OpenCode team on Discord”。

### 实现（复用现有机制）

- 上游补丁 `patches/opencode/0008-oco-embedded-recovery-view.patch`（5 个文件，+26/−2）：`Platform.recoveryView?` 钩子；`ErrorPage`、`ConnectionError`（启动健康检查门）、会话不存在分支在提供钩子时交给宿主页面渲染。非 oco 平台行为不变；上游自身的 1 s 自动重试保留。
- `apps/chat-webview/src/recovery.tsx`（oco 自有）：三种界面，固定文案（中文/英文按 VS Code 语言），不显示原始错误、响应、地址或凭据（错误只写入 webview 控制台）。
  - 不可达：重试（立即重试并让宿主重置退避）、打开设置。界面存在超过 1.5 s 后服务恢复（即确实经历了至少一次失败重试）时，重新加载面板文档，让应用重新引导模型/Agent。1.5 s 下限是因为上游健康门在每次正常启动时都会瞬间渲染一次该界面（`Effect.ensuring` 先切到 background 模式），否则会形成重载循环（本批实测过：宿主 generation 12 s 内到 58，已修）。
  - 会话已不存在：会话列表、新建会话、关闭面板；**不提供重试**，无请求循环。
  - 未知错误：重新加载面板（宿主重设 HTML，沿用上批的 Restart 修复）、会话列表。
- 会话打开时断线：宿主把已有的 feed 状态（`SessionFeed` → `ConnectionSummary.state`）经新消息 `connection {state, bound}` 发给面板（只含状态，不含地址/错误文本）；页面顶部显示提示条（立即重试、打开设置；认证失败/未配置时只有打开设置）。没有新的连接状态机。
- 宿主动作：`retryConnection` → `feed.restart()`；`openSettings` → `oco.openSettings`；`showSessions` → `oco.sessions.focus`；`newSession` → `oco.newSession`；`closePanel` → 关闭该面板。均为无参数固定操作。

### 草稿决定

契约未定义会话删除后的草稿处置。采用最小行为：草稿保留在原面板存储里，不迁移到其他会话，不自动发送；删除界面文案说明这一点。未提供“复制草稿”入口（NOT DONE，可另立）。

### 验收（`tests/e2e/t010-recover.mjs`，经 `lib/proxy.mjs` 夹具代理）

最终运行 `20260930-130755-t010-recover-0536`（最终构建）5/5 PASS；此前 `20260930-125945-t010-recover-7db7` 5/5 PASS。

| 用例 | 断言 | 结果 |
| --- | --- | --- |
| unknown-types | 未知 part 类型与未知工具仍渲染，输入框可用 | PASS |
| down-while-open | 断线提示条（重试/设置），无泄漏；草稿在；恢复后提示条消失、草稿在、新提示得到回复 | PASS |
| initial-unreachable | 不可达界面（重试/设置）；仍断时点重试保持该界面；打开设置确实打开 VS Code 设置（筛选 oco）；恢复后面板重新加载，草稿保留，新提示得到回复 | PASS |
| session-deleted | 真实 `DELETE /session/:id`；“已不存在”界面，无重试按钮；6 s 内该会话消息请求 0 次；会话列表打开侧栏；新建会话的输入框为空、0 条消息（旧草稿未灌入、未自动发送）；关闭面板生效 | PASS |
| unknown-error | 500 + 敏感样式正文：通用界面，文档中无夹具密钥/路径/Discord/报告文案，界面中无堆栈/资源路径；重新加载面板后恢复（不空白） | PASS |

中间失败（均已处理）：首轮空白面板为重载循环（产品缺陷，已修）；其余为测试问题（泄漏检查误把正常脚本 URL 算作泄漏、VS Code 1.139 设置以浮层打开导致标签点击被拦、全选后首字符丢失）。

## 检查汇总

| 检查 | 结果 |
| --- | --- |
| `bun run verify:brief -- --build` | typecheck PASS（0 errors）、unit 140/0、build PASS |
| 上游 `tsgo --noEmit`（packages/app） | exit 0 |
| webview `tsgo -p apps/chat-webview` | 新增/改动代码 0 错误；既有噪声（TS6307 项目列表、`bridge.ts` preconnect、`app.tsx` Uint8Array）不变 |
| 补丁 0001–0008 在干净 `51ef4be` 顺序应用 | 全部成功，与 vendor 逐字节一致 |
| E2E `c1-focus` | 见上表，最终 3/3 |
| E2E `t010-recover` | 5/5（两次） |
| E2E `c1-open-file`（回归，openFile 路径改动） | 6/6，`20260930-130309-c1-open-file-b9f3` |
| E2E `t014-connection`（回归，连接状态进入面板） | 6/6，`20260930-130340-t014-connection-9bd3` |
| E2E `p1b-reconnect`（回归，断线提示条覆盖面板） | 4/5：`search-scope-hint` FAIL（`20260930-130352-…-269a`、复跑 `…-130618-…-9311`）。用 HEAD 源码构建的扩展对照同样 FAIL（`20260930-130657-p1b-reconnect-4283`），**既有问题，非本批引入**；侧栏提示像是落后一次更新，未调查 |
| 其余 E2E 套件 | NOT RUN |
| 真实模型 E2E | NOT RUN |

## 限制与未解决

- 全部 E2E 为脚本模型；真实模型链路 NOT RUN。
- 焦点修复依赖 VS Code 250 ms 焦点轮询；其他 VS Code 版本 NOT RUN。
- 删除会话后的草稿只保留、无取回入口。
- `p1b-reconnect` `search-scope-hint` 既有 FAIL 未修。
- Remote-SSH、Windows、真实 IME 仍按 STATUS 未验证。
