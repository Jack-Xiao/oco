# c34-keybindings E2E 结论（卡 8 默认 chord cmd+alt+u + i）

结论：4 个必需项全 PASS，连续两次（第 3、4 轮）。未发现产品侧问题；失败的前两轮都是测试侧问题，已在 `tests/e2e/c34-keybindings.mjs` 修复。

## 结果（results.json）

- 第 4 轮（最新）：`docs/evidence/runs/20261016-072621-c34-keybindings-c9d7/results.json`，PASS 4 / FAIL 0，exitCode 0，missingRequired 空，耗时 21.8 s。
- 第 3 轮：`docs/evidence/runs/20261016-072538-c34-keybindings-bc5f/results.json`，PASS 4 / FAIL 0，exitCode 0，耗时 18.7 s。
- 环境：VS Code 1.141.0，opencode serve 1.18.33（mock 模型 oco-mock/mock），node v26.7.0，darwin 27.2.0 arm64，ocoCommit bc08c40（工作树有未提交改动）。端口 4517/4518 均空闲，使用默认端口。
- 第 4 轮四项明细：
  - sidebar-chord-opens-inbox PASS：rows 6，focusedViaCommand true，frameFocused true，chordMode true，opened true，activeTab 为 Untitled-1（活动编辑器是普通文本），workbenchActiveElement 为 `IFRAME.webview ready`。
  - editor-chord-passes-through PASS：editorFocused true，chordMode false，opened false，before=ab，after=abi（第二键 i 正常输入）。
  - sidebar-blur-clears-context PASS：sidebarFocused false，focusMessages 1，blurMessages 1。
  - panel-chord-opens-inbox PASS：activeTab 为 c34-panel-*，composerClicked true，chatFrameFocused true，chordMode true，opened true；composerBefore 为空串，composerAfter 为 null（QuickPick 打开后焦点离开 composer，仅作参考，不参与判定）。

## 各轮记录

| 轮 | runId | 结果 | 原因 / 处理 |
| --- | --- | --- | --- |
| 1 | 20261016-071819-c34-keybindings-146c | FAIL（4 项 NOT RUN） | 测试侧：`page.waitForSelector('textarea.inputarea')` 15 s 超时。VS Code 1.141.0 默认用 EditContext，可聚焦输入是 `div.native-edit-context`（已在 VS Code 包里确认类名）。截图确认 Untitled-1 已打开。 |
| 2 | 20261016-072047-c34-keybindings-1251 | 1 PASS / 3 FAIL | 测试侧：焦点从未进入 webview iframe（frameFocused false，页面没发 focus/blur，focus/blur 计数 0，oco.sidebarFocused 未置位），所以侧栏与聊天面板的 chord 都没触发（chordMode false）。编辑器案例 PASS 说明按键写法本身正确。 |
| 3 | 20261016-072538-c34-keybindings-bc5f | PASS 4/4 | 修复 1、2 之后。 |
| 4 | 20261016-072621-c34-keybindings-c9d7 | PASS 4/4 | 未再改动，确认稳定。 |

## 测试侧改动（仅 tests/e2e/c34-keybindings.mjs）

1. 编辑器输入元素选择器改为 `:is(.native-edit-context, textarea.inputarea)`，`waitForSelector` 用 `state: "attached"`；editorFocused 判断改为 `activeElement.matches(".native-edit-context, textarea.inputarea")`。原因：EditContext。
2. 案例 1：先用 API 建 2 个会话使侧栏列表有行；列表加载完并稳定后再执行一次 "Focus on Sessions View"；若 iframe 仍未聚焦，用 `rows.first().focus()`（同 c20）；detail 增加 rows、focusedViaCommand。原因：套件原先只在 webview 页面加载前执行一次聚焦命令，且列表为空没有可聚焦元素。
3. 案例 3：等 `[data-component="prompt-input"]` 出现后点击 composer（真实点击），detail 增加 composerClicked。原因：面板打开后焦点停在 BODY，按键没有进入聊天 iframe。

## 判断与限制

- 产品侧：未发现问题。第 3、4 轮都看到页面 focus/blur 各 1 次、侧栏聚焦时 chord 进入并触发 oco.inbox.next、离开侧栏后 oco.sidebarFocused 为 false、普通编辑器里前缀不成 chord 且第二键输入为 i。
- 未区分第 2 轮失败的两个子原因（列表为空 / 首次聚焦命令早于页面加载）：修复 2 同时消除了两者。"空列表时 Focus on Sessions View 能否让 iframe 获得焦点" 本轮未验证，不属于必需项。
- 按键写法：Playwright `Meta+Alt+KeyU`（darwin）+ `KeyI`，与 package.json 的 `cmd+alt+u i` 对应；ctrl+alt+u（Windows/Linux）本轮未跑。
- 失败的第 1、2 轮目录仍留在 `docs/evidence/runs/`（146c、1251），只是排错记录，不作验收依据。
- 执行：Claude 子代理（Sonnet 5.5，模型 ID claude-sonnet-5-5），约 30 次工具调用 / 约 15 分钟；隔离 mock 服务器 wrapper PID 11175（子进程 mock-llm 11196、opencode serve 11198），结束时只终止了这三个进程。
