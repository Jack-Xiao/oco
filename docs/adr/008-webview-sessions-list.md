# ADR-008：会话侧栏改为 WebviewView

状态：已采纳。日期：2026-10-08。依据：[spike 记录](../evidence/sessions-webview-spike-2026-10-08.md)。修改 [ADR-006](006-p1b1-sessions-sidebar.md) §4 的"原生 TreeView"决定；数据来源、事件流、重连与去重（ADR-006 §1–3）不变。

## 背景

原生 TreeView 有三处做不到：时间单独一列右对齐并调淡（description 会和长标题一起被截断）、选中行保持状态点颜色、自定义行高和圆角选中。Claude Code 2.1.293 的会话列表本身就是 WebviewView（`retainContextWhenHidden: true`）。

## 决定

- 容器 `oco` 里只有一个 webview 视图 `oco.sessions`（name "Sessions"）。保留原 id，`oco.sessions.focus`、标题栏按钮和命令不变。Connection 视图删除：它只为保留单独的 Sessions 标题行而存在，连接信息仍在状态栏提示与 `oco: Debug State`。
- `SessionsView` 不再是 TreeDataProvider，只管状态：分组、未读、搜索、当前会话、状态栏，并产出 `webModel()`（行已格式化；无行时给出文字和按钮）。连接/空状态的文字与按钮由纯函数 `listMessage()` 生成，替代 `viewsWelcome`，有单元测试。
- `SessionsWebview` 只渲染：首帧状态随 HTML 下发（不闪空白），之后每次合并刷新（150 ms）推送一次；页面按行 id 增量更新。页面是原生 JS + CSS（`media/sessions-list/`，无构建、无依赖，约 18 KB），CSP 只允许 nonce 脚本。
- 搜索：标题栏 Search 按钮让列表顶部出现搜索框并聚焦；Esc 清空并收起。行右键菜单走 `webview/context`（`data-vscode-context` 的 `sessionId`），重命名/归档/删除/新面板打开命令接受 `{ sessionId }`。
- `retainContextWhenHidden: true`：页面很小（几百行时 JS 堆约 4 MB），换来重新显示侧栏不重建、不闪烁。

## 代价

键盘导航、读屏标签、焦点样式需要页面自己实现（已做：listbox/option、上下键/Home/End、`:focus-visible`）。E2E 要进入 webview iframe 操作；macOS 上 webview 右键菜单是系统原生菜单，Playwright 点不到，测试改为直接执行带 `{ sessionId }` 的命令。
