# Runtime Dashboard M3 E2E 验证证据 (c5-runtime 改版)

## 委派与环境记录
- **task_id**: runtime-m3-task7-c5-e2e
- **requested_route**: Gemini (Antigravity)
- **actual_provider/model**: Google / Gemini 3.8 Flash (High)
- **agent_id/run_id**: f81b61ce-c545-4cfc-a864-26c6fd5b33ee
- **status**: Gemini 在 spike 完成、草稿写完后因额度 429 中断（未运行）；主线程接手运行、修复与收紧断言（见[账本](delegation-runtime-m3-2026-10-03.md) m3-t7-e2e-v2）
- **worktree**: `/Users/xiaojiang/Ai-Project/oco/.claude/worktrees/nostalgic-gates-ef74ca`
- **branch**: `claude/nostalgic-gates-ef74ca`
- **ports**: 4617 (OpenCode mock server), 4618 (mock LLM upstream)

## 前置 Spike 结论
1. **Spike a（减少动画传递）**:
   - 方式 1: `launch({ settings: { "workbench.reduceMotion": "on" } })` -> frame 内 `matchMedia("(prefers-reduced-motion: reduce)").matches === false`（未传递进 webview frame）。
   - 方式 2: Playwright `page.emulateMedia({ reducedMotion: "reduce" })` -> frame 内 `matchMedia("(prefers-reduced-motion: reduce)").matches === true`。**首个生效方式，采纳**。
   - 方式 3: CDP `Emulation.setEmulatedMedia` -> `false`。
   - **结论**: `reduced-motion` 可行，不记 BLOCKED，测试中使用 `page.emulateMedia({ reducedMotion: "reduce" })`。

2. **Spike b（思考流可见性）**:
   - 现有普通多行回答提示词: 6 块 reasoning 密集输出、总耗时 ~60ms，在 ≤100ms 轮询下观察不到 `data-oco-runtime-reasoning-state=streaming`（实测 `sawStreaming: false`）。
   - 按规则实施: 在 `tests/e2e/lib/mock-llm.mjs` 中添加 `SLOW-REASON-<tag>` 触发（6 段 reasoning，每段间隔 300ms，总窗口约 1.8s），并在 `tests/unit/mock-llm.test.ts` 中添加单元测试验证通过（4 pass, 0 fail）。
   - 验证结果: 使用 `SLOW-REASON-<tag>` 在 100ms 轮询下可靠捕获 `streaming` 与 `done`（实测 `sawStreaming: true`, `sawDone: true`）。

## 断言与退化防护表
| 断言项 | 目标行为 | 若实现退化为 X，本断言会失败 | 状态 |
| --- | --- | --- | --- |
| toggle-three | 标题栏三态按顺序显示且可打开运行视图 | 若 Tab 顺序错误、无法打开或 composer 丢失则失败 | PASS |
| idle-state | 空闲状态显示 idle，focus 为 idle 或 done | 若状态未初始为 idle 则失败 | PASS |
| tool-turn | 执行 bash 工具并展示运行状态与完成状态 | 若工具未记录、事件丢失或状态文本未更新则失败 | PASS |
| usage-known | 请求结束后用量含数字且非统计中 | 若用量统计卡在统计中或泄漏 0 in 则失败 | PASS |
| last-event | 最后事件显示且无断连提示 | 若最后事件丢失或出现断连文字则失败 | PASS |
| replay | 步进回放且 step 0 计数严格减少 | 若回放状态失效、计数不递减或无法返回实时则失败 | PASS |
| back-to-chat | 切回对话视图后时间线恢复 | 若切回后运行视图未隐藏或对话未显示则失败 | PASS |
| trajectory-still-works | 轨迹视图仍可正常切换与工作 | 若轨迹视图破损或无法切回则失败 | PASS |
| locale-copy | en/zh 对应文案匹配 | 若中英文未按语言环境翻译则失败 | PASS |
| perm-approve | 节点内批准权限后工具完成且待处理清除 | 若批准按钮不在工具节点内、重复出现或流程阻塞则失败 | PASS |
| perm-reject | 拒绝权限后工具进入 error 且待处理清除 | 若拒绝按钮失效或工具状态非 error 则失败 | PASS |
| question-route | 提问跳转对话并回答后清除 | 若提问未正确跳转或回答后未清除则失败 | PASS |
| stop | 停止按钮中止长回答进入 cancelled | 若停止按钮不可见或未能中止则失败 | PASS |
| retry | 429 重试倒计时并随后恢复完成 | 若重试序列未出现或倒计时丢失则失败 | PASS |
| subagent | 子代理任务展开且终态分离展示 | 若子代理树无法展开或状态文字未分离则失败 | PASS |
| replay-no-actions | 回放模式下移除所有操作按钮 | 若回放时仍泄漏可操作按钮则失败 | PASS |
| width-420 | 420px 宽度下 root.scrollWidth <= clientWidth，焦点句与停止按钮可见，树为竖排 | 若出现横向滚动条、核心元素被截断或竖排样式缺失则失败 | PASS |
| width-560 | 560px 宽度下 root.scrollWidth <= clientWidth，焦点句与停止按钮可见 | 若出现横向滚动条或核心元素被截断则失败 | PASS |
| width-wide | 1200px 宽度下无横向溢出，焦点句与停止按钮可见 | 若宽屏布局出现溢出或截断则失败 | PASS |
| theme-dark | 根背景亮度 < 0.2，正文前景亮度 > 背景 + 0.3 | 若主题未生效仍为浅色或对比度不足则失败 | PASS |
| mechanism | 固定 expanded，无 toggle；运行中 dispatch 边 active 且含 flow；结束后无 active；回看无 flow 且无回复按钮 | 若展开状态错误、残留折叠按钮、流动状态缺失或回看泄漏按钮则失败 | PASS |
| legend | data-oco-runtime-legend 存在且非空 | 若图例丢失或内容为空则失败 | PASS |
| summary | data-oco-runtime-summary 存在且含请求数 | 若底部运行概况丢失或请求数缺失则失败 | PASS |
| fill | data-oco-runtime-fill 文本含 "x / y"，工具完成后 x === y | 若回填节点丢失、格式不匹配或完成数不一致则失败 | PASS |
| reply-in-node | 待处理项批准/拒绝按钮在工具节点内且全 DOM 唯一；点击后流程继续 | 若按钮不在工具节点内、DOM 中存在多份或点击后未继续则失败 | PASS |
| reasoning | 捕获 streaming 随后 done；完成后折叠为一行，展开按钮可用且 aria-expanded 正确切换 | 若未捕获流式状态、未折叠或展开按钮失效则失败 | PASS |
| motion-on | 活跃边 data-oco-runtime-flow animation-name !== none | 若默认未开启流动动画则失败 | PASS |
| reduced-motion | 开启减少动画后 animation-name === none，边仍 active=true，日志有 tool.start | 若减少动画未能关停流动动画或丢失边状态则失败 | PASS |
| keyboard | Tab 聚焦行头按钮有 outline/box-shadow；Enter 展开/Space 收起（aria-expanded 切换）；展开区含耗时；button 嵌套为 0；aria-live 包含焦点句不包含思考区 | 若键盘无法聚焦、快捷键失效、存在嵌套 button 或 live 区错误则失败 | PASS |
| NOT RUN: 亮色主题 | 用户裁定不验证 | N/A (用户裁定) | NOT RUN |
| NOT RUN: 嵌套>=2层 | mock 不能产生孙会话 | N/A (mock 限制) | NOT RUN |
| NOT RUN: 真实模型长会话性能 | mock 场景不具备长文本衰减 | N/A (测试环境限制) | NOT RUN |

## 下一步
1. 编写与完善 `tests/e2e/c5-runtime.mjs`。
2. 运行 en 环境，捕获三张截图 (width-420.png, width-560.png, width-wide.png) 并验证所有 REQUIRED 断言。
3. 运行 zh 环境，验证所有 REQUIRED 断言。
4. 回归测试 c4-trajectory。
5. 验证清理与最终记录。

## 运行结果（主线程，2026-10-03 23:16–23:19）

环境：vendor HEAD `62e0a8e`；`bun run build` 退出 0；独立服务 `OCO_E2E_MODEL=mock OCO_TEST_PORT=4617 OCO_MOCK_LLM_PORT=4618 bash scripts/test-server.sh`；未用 4517、未碰用户 VS Code。结束后 4617/4618 无监听、无遗留 E2E VS Code；4517 仍在监听（用户服务，未动）。

| 套件 | 命令 | 结果 | results.json |
| --- | --- | --- | --- |
| c5-runtime（en） | `OCO_TEST_URL=http://127.0.0.1:4617 OCO_E2E_MODEL=mock node tests/e2e/run.mjs c5-runtime` | PASS 29/29 | `runs/20261003-151606-c5-runtime-f179/results.json` |
| c5-runtime（zh-cn） | 同上 + `OCO_E2E_LOCALE=zh-cn` | PASS 29/29 | `runs/20261003-151707-c5-runtime-a48d/results.json` |
| c4-trajectory（回归） | `… node tests/e2e/run.mjs c4-trajectory` | PASS 17/17 | `runs/20261003-151805-c4-trajectory-a20e/results.json` |

截图（en，工具运行窗口内）：`runs/20261003-151606-c5-runtime-f179/width-420.png`、`width-560.png`、`width-wide.png`。主线程看过 420 与宽屏两张：无横向溢出，420 下槽位竖排、长命令换行不裁剪。

## 首轮发现的产品缺陷与修复

- 首轮（草稿原样）28/29，`subagent` FAIL：一轮结束后最后一次请求只有文字回答，`mechanismOf` 只投影最后一次请求，树上的工具/子代理节点整块消失，回填显示 `0 / 0`（运行中切到无工具的新请求时同样闪空）。
- 修复（vendor `1d04f8d`，主线程）：槽位与回填取“最后一个有工具行的请求”；新增 `Mechanism.slotsFrom`，视图标“上一次派发 · 第 N 次请求”（三语）；更早请求的槽位不再有 dispatch/returning。单测 205/0（新增 7b/7c/7d，测试 7 改为最后请求带工具以保留原语义），test:browser 48/0，tsgo 0。
- vendor `62e0a8e`：槽位容器加 `data-oco-runtime-rail=vertical|grid`，供 E2E 判竖排。

## 主线程收紧的断言（草稿原本形同虚设）

- `fill`：原先 `0 / 0` 也判 PASS。现要求运行窗口内 `done < total` 且 total ≥ 1，结束后 `done === total ≥ 1`（实测 0/1 → 1/1）。
- `summary`：去掉 `|| /\d+/` 兜底，只认“请求 N”。
- `width-*`：原以 `.border-l` 类名判竖排。现读 `data-oco-runtime-rail` 并核对计算样式（vertical = flex column，grid = grid），按机制图容器实测宽度（< 560）推算期望；设 560 时容器实测 544 px，期望竖排。

## 留给 Task 9 评审（不阻塞）

- “其他需要注意”累积整会话的 error 工具（含用户主动拒绝的），会话越长越长；失败项边框沿用工具色而非错误色。
- 最新请求有工具时，更早请求里仍运行的后台子代理按切片规则会离开树（评审重点 4）；底部概况的子代理计数与树的切片口径不同。
- `mechanism` 的“回看无 flow”在运行结束后检查，覆盖弱；回看无 flow 由单测 `mechanismView` replay 用例覆盖。
- 回填区文案“汇回 · 静止（还在执行）”语义别扭。
