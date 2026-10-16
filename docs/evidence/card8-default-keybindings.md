# 卡 8 第 1 项：卡 6 导航命令默认 chord 键位（2026-10-16）

分支 claude/sad-mirzakhani-d4a775（app worktree）。提交 `fdb6c6f`：package.json contributes.keybindings、单测、USER-GUIDE / README / CHANGELOG；随后一次文档提交：STATUS / NEXT / PROGRESS / 本文件。未合入 main，未推送。

## 结果

所有 7 条共用 when `activeWebviewPanelId == 'oco.chat' || focusedView == 'oco.sessions'`。

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

## 验证

| 项 | 结果 |
| --- | --- |
| `bun run typecheck` | 0 |
| `bun run test:unit` | 471 pass / 0 fail，35 文件（新增 1 个测试） |
| `bun run build` | PASS（webview 4674 modules 18.3 s；extension.js 306.8 kB） |
| `scripts/package-vsix.sh` + `scripts/install-local.sh` | `oco-0.0.4-fdb6c6f.vsix`（13.9 MB，包内 manifest 含 7 条 keybindings）14:47:47 装到 `~/.vscode/extensions/oco-local-test.oco-0.0.4`（VS Code CLI 日志 `logs/20261016T144746`：Deleted existing / Extracted / Renamed / installed successfully；install-local.sh 的 extension.js / index.html SHA256 校验通过）。14:49:21 另一会话（worktree `upbeat-spence-b71c1d`）向同一槽位安装了它的 VSIX（日志 `logs/20261016T144921`），之后本机 manifest 无 keybindings（与 main 4f114ec 相同）。未重装，避免两个会话互相覆盖；合入 main 后重装。注意 install-local.sh 只校验 extension.js / index.html，manifest-only 的改动被覆盖时它查不出来，建议加 package.json 校验（脚本不在本任务写入范围）。|
| 按键 E2E（面板 / 侧栏实际触发） | NOT RUN |
| 真实模型 | NOT RUN |

## 委派记录

| task_id | 唯一写入范围 | requested_route | actual_provider/model | agent_id/run_id | 状态 | 结果路径 | fallback_reason / 主线程接手理由 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| card8-kb-impl | package.json contributes.keybindings、settings-contribution 单测、USER-GUIDE / README / CHANGELOG | main（Fable 5.1） | claude/fable-5.1 | unknown | 验收通过 | fdb6c6f | 任务 ≤ 10 处编辑、无独立模块；发起会话注明「主线程直接做也算合规，但要在证据里写一行理由」。冲突核对用本机 VS Code 安装包离线脚本完成，不需外部调研。 |

## 环境

app worktree 无 vendor/opencode；按 memory「worktree-vendor-setup」：`git -C /Users/xiaojiang/Ai-Project/oco/vendor/opencode worktree add --detach <worktree>/vendor/opencode 51ef4be`，补丁 0001–0028 应用 28/28，`bun install --frozen-lockfile` 4667 包 22 s，`apps/chat-webview/node_modules` 软链。删除本 worktree 后 `git -C /Users/xiaojiang/Ai-Project/oco/vendor/opencode worktree prune`。
