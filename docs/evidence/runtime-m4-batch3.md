# 运行视图 M4 第三批（用户反馈修正，2026-10-04）

范围：用户在本 worktree 实测后的三项反馈。未提交、未部署。

## 改动（补丁 0019 追加）

1. **早轮失败子代理误留航道**：`loopOf` 的“仍在外面”规则（实时模式）排除 `flag === "error"`，失败探针折进「+N 更早的」；等授权的仍留。根因见 [调查](runtime-remount-investigation-2026-10-04.md)。用户确认切标签后回到「实时」属合理默认，不保存播放状态。
2. **动画**：航道虚线流动 / 核心环旋转不再只限实时，回放中按当时状态运行；主代理空闲时三者改为 4 s 慢呼吸（`oco-loop-breathe`）；作业区矩形在有执行中探针时流动。探针信标闪烁、轨道旋转在回放中同样运行。`prefers-reduced-motion` 仍全部关闭。
3. **左栏改为会话概况**：「需你处理」只在有待处理项时出现（置顶）；新增「本轮目标」（本轮首个请求的父用户消息，去掉 synthetic/ignored，3 行截断；回放时标「回放中只读」）、「任务清单」（实时用服务端 todo，空时回退为最近一次 `todowrite` 输入；回放只用快照内的 `todowrite`）、「本会话」（时长、轮次、请求、工具、子代理、花费、用量）。新文件 `session-runtime-overview.ts` + 单测。用户明确不要改动文件 / diff 摘要。
4. 测试侧：mock 模型新增 `Use the todowrite tool to plan: a; b; c`；`look-runtime.mjs` 先写 todo 并记录动画名与概况内容。

## 验证

| 项 | 结果 |
| --- | --- |
| vendor app `tsc --noEmit` | 0 错误 |
| session 单测 | 276 / 0（新增 loop 1 条、overview 5 条） |
| look-runtime（mock，4677/4678，宽 1800 / 800） | 运行中：`oco-loop-dash-zone, oco-loop-dash, oco-loop-spin…`；空闲：`oco-loop-breathe ×3`；回放中段：按状态流动；todo「1/3」三态显示；诊断 issues=[]。产物 `.oco-look-b3/` |
| 补丁 0019 | 重新生成 31 个文件（+overview 2 个）；无本机路径、无行尾空格；51ef4be 临时 worktree 干净重放 19/19，`packages/app/src` 与开发树一致，临时 worktree 已删 |
| vsix | `scripts/package-vsix.sh` → `oco-0.0.4-79c751d.vsix`（含未提交改动） |
| E2E c5-runtime（mock，4677） | en 37/37、zh 37/37；`docs/evidence/runs/20261004-094019-c5-runtime-d0d4`、`…094213-c5-runtime-80a2`；测试文件未改 |

已知：窗口很矮时左栏整体可滚动；运行中 OpenCode 输入框上方自带的 todo 浮层与左栏任务清单同时出现（空闲时浮层收起）。NOT RUN：真实模型、Remote、亮色主题。

## 委派记录

| task_id | 唯一写入范围 | requested_route | actual_provider/model | agent_id | 状态 | 结果 | fallback_reason / 接手理由 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| b3-impl | vendor session-runtime*、i18n、mock-llm、look-runtime | — | 主线程 | — | 完成 | 本文件 | 同批 Grok 402、Gemini ERROR（见调查文件）；改动集中在 session-runtime.tsx 同一文件集成 |
| b3-e2e | tests/e2e/c5-runtime.mjs、runtime-m4-b3-e2e.md | gemini-worker | Gemini(Antigravity) / unknown | a3f5fa7c43c4025f2 | 失败 | — | `Eligibility check failed: Post …loadCodeAssist: EOF`；Grok 同批 402 → 主线程运行 |
| b3-e2e-main | 同上 | — | 主线程 | — | 验收通过 | runs/ 两个目录 | 两路订阅均不可用 |

## 追加修正（第二轮用户反馈，2026-10-04 晚）

1. **左栏去掉「本会话」框**，关键数字移到底部状态栏：主代理 · 模型｜时长｜上下文｜花费｜用量（输入 / 输出）；子代理段只在航道上有执行 / 排队 / 待取回 / 阻塞时出现，阻塞数仍为红色。请求数、工具调用数从状态栏移除（轮次已在核心圆盘上）。变窄时图例先收成符号（悬停提示文字），再隐藏用量（≤1360）、模型（≤1220）；时长、上下文、花费一直保留。
2. **航道「每完成一个任务停一下 / 有时加速」**：原因是核心状态在两步之间短暂变为 idle（或执行区 running 降到 0）时，元素在 spin/dash 与 breathe 两个 class 之间切换，动画从头开始；dispatching/gathering 时旋转周期 6 s→1.5 s，中途改周期会跳。现在：旋转固定 6 s；空闲需持续 2 s（`IDLE_MS`）才算，空闲时用 `animation-play-state: paused` 原地停住（外层 `<g>` 做慢呼吸），恢复时从原位置继续；执行区虚线跟随整体活动。
3. 测试侧：c5 `legend` 改读 textContent（窄宽度只剩符号）；`summary` 改为检查时长存在、无请求数、无「本会话」框，子代理段出现时格式不变。`look-runtime.mjs` 记录状态栏文本和动画 play-state。

| 检查 | 结果 |
| --- | --- |
| vendor app `tsc --noEmit` | 0 错误 |
| session 单测 | 276 / 0 |
| E2E c5-runtime（mock，4677） | en 37/37（`runs/20261004-131051-c5-runtime-9f66`）、zh 37/37（`runs/20261004-131253-c5-runtime-7c06`）；这两次在给用量加「用量」前缀之前，前缀改动后未重跑 E2E |
| look-runtime（mock，宽 1800 / 1000） | 工作中 `dash-zone/dash/spin:running`；空闲 `…:paused` + `oco-loop-breathe:running`；状态栏文本含时长 / 上下文 / 用量 |
| 补丁 0019 | 从 `deb241e` 重新生成，31 个文件不变；无本机路径；51ef4be 临时 worktree 干净重放 19/19，`packages/app/src` 一致，已删 |
| vsix | 重新构建，已装本机 VS Code（需 Reload Window）；未部署 Remote（gcp-workstation 已不存在，见下） |

- gcp-workstation：`gcloud workstations list` 在 `vscode-workstation-lab` 下无集群、无工作站，部署 BLOCKED。
- 委派：未委派。改动集中在 session-runtime.tsx / loop-view 同一组件与补丁重生成，E2E 用于验收同一补丁；同日两条路线已失败（见上表），本轮未重新探测——这一点不符合"同批先重新检查"的规则，记录在此。

## 第三轮反馈（2026-10-04 夜）委派记录

| task_id | 唯一写入范围 | requested_route | actual_provider/model | agent_id/run_id | 状态 | 结果路径 | fallback / 接手理由 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| b3r3-health | — | gemini-worker / grok CLI | Gemini(Antigravity) / unknown；grok 1.0.34 可启动 | gem-mutv46wv-bnq1e | 已返回 OK | — | — |
| b3r3-impl | vendor session-runtime*、pages/session.tsx、i18n | 主线程 | — | — | 完成 | 本文件 | 同一组件文件内集成 + 补丁重生成 |
| b3r3-e2e | tests/e2e/c5-runtime.mjs、docs/evidence/runtime-m4-b3r3-e2e.md | gemini-worker | Gemini(Antigravity) / unknown | gem-mutvgpn2-tcxjq | 失败（运行 45 分钟后返回 `{"status":"ERROR"}`；测试改写已落盘，en 37/37 `runs/20261004-141106-c5-runtime-0099`，zh 最后一次 36/37 keyboard） | docs/evidence/runtime-m4-b3r3-e2e.md（checkpoint 停在 3/6） | 主线程只做最终验收：重建后 en/zh 各跑一次，未改测试 |

## 第三轮反馈：改动与验收

改动（补丁 0019 追加，测试由 Gemini 改写）：
1. 用户拒绝授权 / 忽略提问不再算失败：`RuntimeTool.declined`（"The user rejected permission…" / "The user dismissed this question"，后者取自本机 opencode.db 实际记录），日志事件 `tool.rejected` / `tool.dismissed`，非红色。
2. 删除左栏「需你处理」面板与运行视图停止按钮（连同 respond / requestStop / cancelLabel 等助手与 14 个单测、`onStop` 接线）；授权与提问由输入区原生 dock 处理（截图确认运行页可见，覆盖子会话）。顶栏徽标 `[data-oco-runtime-pending]` 只在有等待时出现。
3. 状态词：运行中 / 等你回应 / 重试中 / 待命 / 出错；回放显示「当时…」；去掉「（推断）」，实时推断改为悬停说明。删除「N 个会话」。
4. 去重 build：核心圆盘保留代理 + 轮次；焦点卡片只写「模型 · 请求 n」；状态栏去掉代理与模型。
5. 图例文字恢复常显（只有「正在流动」≤1360 隐藏）；「任务清单」改名「执行计划」，加悬停说明，条目单行省略 + 悬停全文；交接提示去掉「需要关注」。

| 检查 | 结果 |
| --- | --- |
| vendor app `tsc --noEmit` | 0 错误 |
| session 单测 | 263 / 0（删 14 个停止按钮相关、增 1 个 declined） |
| E2E c5-runtime（mock，最终构建） | en 37/37 `runs/20261004-142956-c5-runtime-316d`；zh 37/37 `runs/20261004-143155-c5-runtime-b66d`（含上一轮未重跑的「用量」前缀） |
| look-runtime 1000 px | 授权时运行页底部出现原生 dock，顶栏「1 waiting for your answer」，卡片「oco-mock/mock · Request 1」 |
| 补丁 0019 | 31 个文件不变，无本机路径；51ef4be 干净重放 19/19，src 一致 |
| vsix | 已装本机 |

- 观察：zh 中间一次 `keyboard`（Esc 取消选中）失败，前后各次均通过，记为偶发，未定位。
- 过程问题：一次 prettier 改动了未触及文件的对齐注释，已从补丁版本还原后重新施加改动。
- NOT RUN：真实模型、亮色主题、Remote（gcp-workstation 已不存在）。

## 第四轮反馈：交接卡片与状态文案（2026-10-04 夜）

- 交接卡片不再总是「点航道上的任务…」：未选中时显示本会话最新的子代理（任何轮次；已取消的只在没有别的时显示），前缀「最新子代理」；没有子代理时显示主代理最近一次工具调用（工具名、状态、用时、输入、输出最后一行；拒绝/忽略显示为「你已拒绝授权 / 你已忽略提问」）；两者都没有时显示「还没有子代理，主代理也还没调用工具」。`Loop.latest` / `Loop.lastTool`；卡片新增 `data-oco-runtime-handoff-shown`（selected / latest / tool / missing / empty），`data-oco-runtime-handoff` 仍只表示选中项。
- 状态词去掉回放前缀「当时」；「最后事件 … 前」去掉「（推断）」。
- 检查：类型 0 错误；session 单测 266/0（+3 卡片回退）；E2E（mock）en 37/37 `runs/20261004-144746-c5-runtime-2cf1`、zh 37/37 `runs/20261004-144955-c5-runtime-1539`——这两次在去掉「最后事件（推断）」之前，之后未重跑（`last-event` 只检查「最后事件 / Last event」前缀）；look-runtime 1000 px 完成态卡片显示「Latest subagent · … · explore · Absorbed」；补丁 0019 31 个文件、干净重放 19/19；vsix 已装本机。
- E2E 由主线程运行：只做本轮产品改动的验收，未改测试；上一轮 Gemini 改写同一套件耗时 45 分钟后 ERROR。
