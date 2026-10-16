# 卡 8 第 1 项：卡 6 导航命令默认 chord 键位（2026-10-16）

分支 claude/sad-mirzakhani-d4a775（app worktree）。提交 `fdb6c6f`：package.json contributes.keybindings、单测、USER-GUIDE / README / CHANGELOG；随后一次文档提交：STATUS / NEXT / PROGRESS / 本文件。未合入 main，未推送。

第二批（同日，分支 claude/nostalgic-allen-aed66d，先合入上面的分支再改）：侧栏一路改为宿主自设上下文键 `oco.sidebarFocused`，when 改为 `activeWebviewPanelId == 'oco.chat' || oco.sidebarFocused`，并用 E2E c34-keybindings 证明三种位置的行为（见「when 条件」与「验证」）。

## 结果

所有 7 条共用 when `activeWebviewPanelId == 'oco.chat' || oco.sidebarFocused`（第一批是 `… || focusedView == 'oco.sessions'`，侧栏一路实际不生效）。

| 命令 | key（win / linux） | mac |
| --- | --- | --- |
| `oco.inbox.next` | `ctrl+alt+u i` | `cmd+alt+u i` |
| `oco.session.parent` | `ctrl+alt+u p` | `cmd+alt+u p` |
| `oco.session.child` | `ctrl+alt+u c` | `cmd+alt+u c` |
| `oco.session.nextSibling` | `ctrl+alt+u n` | `cmd+alt+u n` |
| `oco.session.previousSibling` | `ctrl+alt+u shift+n` | `cmd+alt+u shift+n` |
| `oco.session.recent` | `ctrl+alt+u r` | `cmd+alt+u r` |
| `oco.follow.toggle` | `ctrl+alt+u f` | `cmd+alt+u f` |

## 冲突核对（本机 VS Code 1.141.0，commit 2a59476c）

方法：
1. 扫描 `/Applications/Visual Studio Code.app/Contents/Resources/app/out/vs/workbench/workbench.desktop.main.js`（20.3 MB）的全部数值字面量，取低 16 位等于 `CtrlCmd|Alt|Key<字母>`（2560 + 31…56）或 `WinCtrl|Alt|Key<字母>`（768 + 31…56）且上下文含 primary / mac / keybinding 的位置（chord 的首键也在低 16 位）。
2. 内置扩展 `app/extensions/*/package.json` 与本机 `~/.vscode/extensions/*/package.json` 的 contributes.keybindings 里 `ctrl|cmd+alt+<字母>`。
3. 用户 keybindings.json：无 alt+o / alt+u。
4. code.visualstudio.com 的默认键位页由客户端渲染，curl 取不到表格，不作依据。

结果：
- `ctrl/cmd+alt+o`：核心 `workbench.action.remote.showMenu`（Show Remote Menu，weight 200，无 when，三平台 primary）；mac 另有 `editor.action.toggleOvertypeInsertMode`（mac primary）。任务示例前缀放弃。
- a–z 中核心与扩展都无命中的只有 d / e / h / q / u / z；d、h 是 macOS 系统快捷键（隐藏 Dock、隐藏其他）；e / q / z 是常见 AltGr 组合（€、@、ż），会让对应键盘布局的用户在聊天输入框里打不出字符；取 `u`（已知 Hungarian AltGr+U = €，可在 Keyboard Shortcuts 覆盖）。
- 其他字母占用（节选）：a roo-cline；b Toggle Secondary Side Bar；c / f / r / w 查找替换、列表查找；g 终端；i Chat；k claude-code；x gemini；y 列表 check all。

## when 条件

- `activeWebviewPanelId == 'oco.chat'`：`VIEW_TYPE` 见 `apps/extension/src/panels.ts`。只要 oco 面板是当前编辑器即成立，不要求焦点（终端有焦点时也放行）。
- `focusedView == 'oco.sessions'`：VS Code 源码（main，2026-10-16 取）`webviewViewPane.ts` 注释写明 webview iframe 位于 document 根的 overlay，`overlayWebview.ts` 把它 appendChild 到 layoutService 容器；`viewPane.ts` 的 `render()` 用 `trackFocus(this.element)` 驱动焦点事件。因此 Sessions webview 内容有焦点时 `focusedView` 不成立，只有视图容器（tabIndex=0 的代理元素）本身有焦点时成立。本机已装的 Claude Code（`claude-vscode.sideBarActive`）与 Kilo Code（`kilo-code.new.sidebarFocused`）都为此自设上下文键。未做按键 E2E。
- 替代：不限焦点可用 `view.oco.sessions.visible`（VS Code 为每个视图设的可见性键）；要严格焦点需宿主自设 `oco.sidebarFocused`。
- 首键只在 when 成立时进入 chord 等待（`KeybindingResolver.resolve` 对首键也过 when），其他位置 `ctrl/cmd+alt+u` 原样放行。

- 2026-10-16 第二批（分支 claude/nostalgic-allen-aed66d）：when 改为 `activeWebviewPanelId == 'oco.chat' || oco.sidebarFocused`。`oco.sidebarFocused` 由宿主自设：侧栏页面 `media/sessions-list/index.js` 在 `window` 的 focus / blur 事件（以及加载时 `document.hasFocus()` 为真）时 post `{ type: "focus" | "blur" }`，`SessionsWebview`（`apps/extension/src/sessions-webview.ts`）按变化执行 `setContext oco.sidebarFocused`，视图隐藏、关闭或 dispose 时清为 false；页面每次事件都发、宿主去重，避免视图隐藏后再显示时状态卡住。`FromPage` 是该文件内部类型，不涉及 packages/contracts。`oco.debugState` 导出里 `sidebar.webList.sidebarFocused` 与 `focus` / `blur` 计数（E2E 用）。
- 保留的限制：焦点在 webview 内的文本框（聊天面板 composer、侧栏搜索框）时，VS Code 把按键转发给宿主做键位匹配，但不能在 webview 内 preventDefault，第二键字母仍会输入到文本框；不是本批可解决的问题，USER-GUIDE 已写明。

## 验证

| 项 | 结果 |
| --- | --- |
| `bun run typecheck` | 第一批 0；第二批 0 |
| `bun run test:unit` | 第一批 471 pass / 0 fail，35 文件（新增 1 个测试）；第二批 474 pass / 0 fail，35 文件（新增 3 个：focus / blur 置位与去重、隐藏 / 关闭 / dispose 清除、manifest when 与常量一致） |
| `bun run build` | 第一批 PASS（webview 4674 modules 18.3 s；extension.js 306.8 kB）；第二批 PASS（extension.js 307.8 kB） |
| `scripts/package-vsix.sh` + `scripts/install-local.sh` | `oco-0.0.4-fdb6c6f.vsix`（13.9 MB，包内 manifest 含 7 条 keybindings）14:47:47 装到 `~/.vscode/extensions/oco-local-test.oco-0.0.4`（VS Code CLI 日志 `logs/20261016T144746`：Deleted existing / Extracted / Renamed / installed successfully；install-local.sh 的 extension.js / index.html SHA256 校验通过）。14:49:21 另一会话（worktree `upbeat-spence-b71c1d`）向同一槽位安装了它的 VSIX（日志 `logs/20261016T144921`），之后本机 manifest 无 keybindings（与 main 4f114ec 相同）。未重装，避免两个会话互相覆盖；合入 main 后重装。注意 install-local.sh 只校验 extension.js / index.html，manifest-only 的改动被覆盖时它查不出来，建议加 package.json 校验（脚本不在本任务写入范围）。|
| 第二批 `scripts/package-vsix.sh` + `scripts/install-local.sh` | `oco-0.0.4-d611734.vsix`（13.9 MB）15:30:22 装到 `~/.vscode/extensions/oco-local-test.oco-0.0.4`；extension.js、media/chat/index.html、package.json（去掉 VS Code 安装时加的 `__metadata` 后）SHA256 均与包内一致（后者是本批给 install-local.sh 新加的校验）；装好的 manifest 7 条 keybindings，when 全为新子句；包内 sessions-list/index.js 含 focus / blur 上报。 |
| 按键 E2E（面板 / 侧栏实际触发） | 第一批 NOT RUN。第二批 `tests/e2e/c34-keybindings.mjs`（Claude 子代理 Sonnet 运行，mock 模型，服务端 1.18.33）：第 3 轮 `docs/evidence/runs/20261016-072538-c34-keybindings-bc5f/results.json` 与脚本定稿后的第 4 轮 `docs/evidence/runs/20261016-072621-c34-keybindings-c9d7/results.json`（scriptSha256 与提交的文件一致）均为必需 4/4 PASS——`sidebar-chord-opens-inbox`（Untitled 编辑器为活动编辑器、焦点在侧栏 iframe：`workbenchActiveElement` IFRAME.webview，`frameFocused` true，进入 chord 模式，QuickPick「OpenCode Inbox」打开）、`editor-chord-passes-through`（编辑器内 `ab` → 按 cmd+alt+u、i 后 `abi`，未进 chord 模式，无 QuickPick）、`sidebar-blur-clears-context`（焦点离开侧栏后 `sidebarFocused` false，focus / blur 消息各 1）、`panel-chord-opens-inbox`（聊天面板 composer 有焦点，chord 触发，QuickPick 打开）。前两轮为测试侧问题：VS Code 1.141 编辑器输入节点是 `.native-edit-context` 而非 `textarea.inputarea`；侧栏在列表为空、页面未加载完时执行 Focus on Sessions View 焦点不进 iframe（改为先建会话、页面加载后再聚焦）。 |
| 真实模型 | NOT RUN |

## 委派记录

| task_id | 唯一写入范围 | requested_route | actual_provider/model | agent_id/run_id | 状态 | 结果路径 | fallback_reason / 主线程接手理由 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| card8-kb-impl | package.json contributes.keybindings、settings-contribution 单测、USER-GUIDE / README / CHANGELOG | main（Fable 5.1） | claude/fable-5.1 | unknown | 验收通过 | fdb6c6f | 任务 ≤ 10 处编辑、无独立模块；发起会话注明「主线程直接做也算合规，但要在证据里写一行理由」。冲突核对用本机 VS Code 安装包离线脚本完成，不需外部调研。 |
| card8-kb-sidebar-impl | sessions-webview.ts、media/sessions-list/index.js、package.json when、settings-contribution / sessions-view 单测、tests/e2e/c34-keybindings.mjs、install-local.sh、文档 | main（Fable 5.1，分支 claude/nostalgic-allen-aed66d） | claude/fable-5.1 | unknown | 验收通过 | 见本文件「验证」 | 契约与同一文件内集成（FromPage 类型、setContext、when 子句、E2E 用例设计）由主线程保留；按任务要求 E2E 运行交 Claude 子代理。 |
| card8-kb-e2e-run | tests/e2e/c34-keybindings.mjs（仅测试侧修复）、docs/evidence/c34-keybindings-e2e.md、docs/evidence/runs/ | claude-subagent/sonnet（Agent general-purpose，model sonnet） | claude-sonnet-5-5（子代理自报） | unknown | 验收通过 | `docs/evidence/runs/20261016-072621-c34-keybindings-c9d7/results.json`（4/4 PASS；第 3 轮 bc5f 同为 4/4）；过程见 `docs/evidence/c34-keybindings-e2e.md` | AGENTS.md：要启动 VS Code / Playwright 的 E2E 直接交 Claude 子代理（Grok 沙箱不能启动 Code，Gemini 包装层对长命令空等）。37 次工具调用、约 11 分钟、4 轮运行（前 2 轮测试侧修复：编辑器输入节点选择器、侧栏聚焦时序）；主线程复核测试改动与 results.json，发现缺陷 0。 |

## 环境

app worktree 无 vendor/opencode；按 memory「worktree-vendor-setup」：`git -C /Users/xiaojiang/Ai-Project/oco/vendor/opencode worktree add --detach <worktree>/vendor/opencode 51ef4be`，补丁 0001–0028 应用 28/28，`bun install --frozen-lockfile` 4667 包 22 s，`apps/chat-webview/node_modules` 软链。删除本 worktree 后 `git -C /Users/xiaojiang/Ai-Project/oco/vendor/opencode worktree prune`。

第二批 worktree `nostalgic-allen-aed66d` 同法：vendor git worktree 51ef4be，补丁 0001–0028 应用 28/28，`bun install --frozen-lockfile` 4667 包 75 s，`apps/chat-webview/node_modules` 软链；删除后同样需要 `git -C /Users/xiaojiang/Ai-Project/oco/vendor/opencode worktree prune`。
