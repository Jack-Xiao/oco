# Runtime Dashboard M3 E2E 验证证据 (c5-runtime 改版)

## 委派与环境记录
- **task_id**: runtime-m3-task7-c5-e2e
- **requested_route**: Gemini (Antigravity)
- **actual_provider/model**: Google / Gemini 3.8 Flash (High)
- **agent_id/run_id**: f81b61ce-c545-4cfc-a864-26c6fd5b33ee
- **status**: 运行中 (Spike 完成，准备扩充 c5-runtime.mjs)
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
| toggle-three | 标题栏三态按顺序显示且可打开运行视图 | 若 Tab 顺序错误、无法打开或 composer 丢失则失败 | 待测 |
| idle-state | 空闲状态显示 idle，focus 为 idle 或 done | 若状态未初始为 idle 则失败 | 待测 |
| tool-turn | 执行 bash 工具并展示运行状态与完成状态 | 若工具未记录、事件丢失或状态文本未更新则失败 | 待测 |
| usage-known | 请求结束后用量含数字且非统计中 | 若用量统计卡在统计中或泄漏 0 in 则失败 | 待测 |
| last-event | 最后事件显示且无断连提示 | 若最后事件丢失或出现断连文字则失败 | 待测 |
| replay | 步进回放且 step 0 计数严格减少 | 若回放状态失效、计数不递减或无法返回实时则失败 | 待测 |
| back-to-chat | 切回对话视图后时间线恢复 | 若切回后运行视图未隐藏或对话未显示则失败 | 待测 |
| trajectory-still-works | 轨迹视图仍可正常切换与工作 | 若轨迹视图破损或无法切回则失败 | 待测 |
| locale-copy | en/zh 对应文案匹配 | 若中英文未按语言环境翻译则失败 | 待测 |
| perm-approve | 节点内批准权限后工具完成且待处理清除 | 若批准按钮不在工具节点内、重复出现或流程阻塞则失败 | 待测 |
| perm-reject | 拒绝权限后工具进入 error 且待处理清除 | 若拒绝按钮失效或工具状态非 error 则失败 | 待测 |
| question-route | 提问跳转对话并回答后清除 | 若提问未正确跳转或回答后未清除则失败 | 待测 |
| stop | 停止按钮中止长回答进入 cancelled | 若停止按钮不可见或未能中止则失败 | 待测 |
| retry | 429 重试倒计时并随后恢复完成 | 若重试序列未出现或倒计时丢失则失败 | 待测 |
| subagent | 子代理任务展开且终态分离展示 | 若子代理树无法展开或状态文字未分离则失败 | 待测 |
| replay-no-actions | 回放模式下移除所有操作按钮 | 若回放时仍泄漏可操作按钮则失败 | 待测 |
| width-420 | 420px 宽度下 root.scrollWidth <= clientWidth，焦点句与停止按钮可见，树为竖排 | 若出现横向滚动条、核心元素被截断或竖排样式缺失则失败 | 待测 |
| width-560 | 560px 宽度下 root.scrollWidth <= clientWidth，焦点句与停止按钮可见 | 若出现横向滚动条或核心元素被截断则失败 | 待测 |
| width-wide | 1200px 宽度下无横向溢出，焦点句与停止按钮可见 | 若宽屏布局出现溢出或截断则失败 | 待测 |
| theme-dark | 根背景亮度 < 0.2，正文前景亮度 > 背景 + 0.3 | 若主题未生效仍为浅色或对比度不足则失败 | 待测 |
| mechanism | 固定 expanded，无 toggle；运行中 dispatch 边 active 且含 flow；结束后无 active；回看无 flow 且无回复按钮 | 若展开状态错误、残留折叠按钮、流动状态缺失或回看泄漏按钮则失败 | 待测 |
| legend | data-oco-runtime-legend 存在且非空 | 若图例丢失或内容为空则失败 | 待测 |
| summary | data-oco-runtime-summary 存在且含请求数 | 若底部运行概况丢失或请求数缺失则失败 | 待测 |
| fill | data-oco-runtime-fill 文本含 "x / y"，工具完成后 x === y | 若回填节点丢失、格式不匹配或完成数不一致则失败 | 待测 |
| reply-in-node | 待处理项批准/拒绝按钮在工具节点内且全 DOM 唯一；点击后流程继续 | 若按钮不在工具节点内、DOM 中存在多份或点击后未继续则失败 | 待测 |
| reasoning | 捕获 streaming 随后 done；完成后折叠为一行，展开按钮可用且 aria-expanded 正确切换 | 若未捕获流式状态、未折叠或展开按钮失效则失败 | 待测 |
| motion-on | 活跃边 data-oco-runtime-flow animation-name !== none | 若默认未开启流动动画则失败 | 待测 |
| reduced-motion | 开启减少动画后 animation-name === none，边仍 active=true，日志有 tool.start | 若减少动画未能关停流动动画或丢失边状态则失败 | 待测 |
| keyboard | Tab 聚焦行头按钮有 outline/box-shadow；Enter 展开/Space 收起（aria-expanded 切换）；展开区含耗时；button 嵌套为 0；aria-live 包含焦点句不包含思考区 | 若键盘无法聚焦、快捷键失效、存在嵌套 button 或 live 区错误则失败 | 待测 |
| NOT RUN: 亮色主题 | 用户裁定不验证 | N/A (用户裁定) | NOT RUN |
| NOT RUN: 嵌套>=2层 | mock 不能产生孙会话 | N/A (mock 限制) | NOT RUN |
| NOT RUN: 真实模型长会话性能 | mock 场景不具备长文本衰减 | N/A (测试环境限制) | NOT RUN |

## 下一步
1. 编写与完善 `tests/e2e/c5-runtime.mjs`。
2. 运行 en 环境，捕获三张截图 (width-420.png, width-560.png, width-wide.png) 并验证所有 REQUIRED 断言。
3. 运行 zh 环境，验证所有 REQUIRED 断言。
4. 回归测试 c4-trajectory。
5. 验证清理与最终记录。
