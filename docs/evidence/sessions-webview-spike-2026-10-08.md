# 会话列表 webview spike（2026-10-08）

目标：在不移除原生 TreeView 的前提下，加一个实验性 WebviewView 会话列表（设置 `oco.experimental.webviewSessions` 打开），看效果是否接近 Claude Code 的会话列表（时间右对齐、圆角选中、30px 行高），并量首次展开耗时。范围只到"显示 + 打开 + 搜索 + More/Load more + 右键菜单 + 基本键盘"。

背景：Claude Code 2.1.293 的会话列表 `claudeVSCodeSessionsList` 是 `type: webview`，`retainContextWhenHidden: true`，与聊天共用 5.5 MB 的 `webview/index.js`。

## 消息契约（宿主 ⇄ 页面）

页面文件：`apps/extension/media/sessions-list/index.js`、`index.css`（无构建步骤，原生 JS，ES2020，无依赖）。宿主生成 HTML，按 CSP nonce 加载这两个文件，并在 `<script type="application/json" id="oco-initial-state">` 里放首帧状态（与 `state` 消息同结构），页面加载时先读它，避免空白闪烁。

宿主 → 页面：

```ts
type Row = {
  id: string
  title: string
  time: string            // 已格式化的短时间：now / 7m / 3h / yesterday / 3d / Sep 28
  status: "" | "running" | "waiting" | "unread" | "error"
  tooltip: string         // 多行纯文本，用作 title 属性
  aria: string            // 读屏标签
}
type State = {
  type: "state"
  view: "list" | "message"           // message = 显示 text + actions，不显示列表
  text?: string                      // view=message 时的说明文字
  notice?: string                    // view=list 时列表上方的提示条（如"连接断开，列表可能不是最新"）
  actions?: { label: string; command: string }[]  // 按钮；点击发 {type:"command", command}
  query: string                      // 宿主当前搜索词（页面输入框以本地输入为准，仅在页面未聚焦输入框时同步）
  current?: string                   // 当前活动面板的会话 id → 选中行
  recent: Row[]                      // 置顶部分（今天/昨天/运行中/等待/未读）；搜索时为全部结果
  more: Row[]                        // 更早的会话，放在可折叠的 "More" 分组
  moreForcedOpen: boolean            // recent 为空时 More 强制展开
  loadMore: boolean                  // 是否显示 "Load more…" 行（在 More 分组末尾；more 为空时在列表末尾）
  still: boolean                     // workbench.reduceMotion=on：运行点不做呼吸动画
}
type Reveal = { type: "reveal"; id: string }   // 滚动到该行（如在 More 内且 More 折叠，则不处理）
type FocusSearch = { type: "focusSearch" }
```

页面 → 宿主：

```ts
{ type: "ready" }
{ type: "open"; id: string; newPanel?: boolean }   // 单击/回车打开；Cmd/Ctrl+单击或中键 newPanel=true
{ type: "search"; query: string }                    // 输入防抖 200ms；Esc 清空并发送空串
{ type: "loadMore" }
{ type: "command"; command: string }                 // 宿主按白名单执行
```

右键菜单：每行带 `data-vscode-context='{"webviewSection":"session","sessionId":"<id>","preventDefaultContextMenuItems":true}'`；宿主在 `package.json` 的 `webview/context` 菜单按 `webviewId == 'oco.sessionsWeb' && webviewSection == 'session'` 挂重命名、归档、删除、在新面板打开，命令参数为上述对象。

页面本地状态（`acquireVsCodeApi().setState`）：More 是否展开、滚动位置、搜索框内容。

## 委派记录

| task_id | 唯一写入范围 | requested_route | actual_provider/model | agent_id/run_id | 状态 | 结果路径 | fallback_reason / 接手理由 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| health-gemini | 无 | agy -p 最小请求 | unknown | conversation a344fbdb… | 未确认（10 s 超时，`error: interrupted`） | scratchpad/agy-health.json | 按规则换 Grok |
| health-grok | 无 | grok-build:check | grok 1.0.34，已登录 grok.com | unknown | 已返回（ready=true） | — | — |
| web-01 | apps/extension/media/sessions-list/ | grok-worker | Grok Build（model unknown） | job run-muyvs82q-6g3of2 · grok session e51c04bc | 已返回（13m34s；index.js 398 行、index.css 177 行；node --check 通过；桥报"no files changed"与实际不符，文件已在） | apps/extension/media/sessions-list/ | — |
| host-01 | apps/extension/src/sessions-webview.ts、sessions-view.ts、extension.ts、package.json | 主线程 | — | — | 已返回（typecheck PASS、build PASS、unit 185/185） | — | 公共契约与同文件集成（扩展入口、命令参数、contributes） |
| fix-01 | apps/extension/media/sessions-list/index.css（约 8 行） | 主线程 | — | — | 已返回 | — | 验收截图后的小修：时间列由固定 72px 改为按内容宽度、行高 28→30px、焦点框只在键盘操作时显示（:focus-visible） |

## 结果（2026-10-08，本机 VS Code + 隔离测试服务 1.18.x mock @4517）

脚本：临时 Playwright 脚本（`tests/e2e/vscode.mjs` 的 `launch`，开实验设置后截图；未入库）。截图：[深色整窗](sessions-webview-spike/dark-window.png)、[深色两种列表对比](sessions-webview-spike/dark-both.png)、[深色搜索](sessions-webview-spike/dark-search.png)、[浅色整窗](sessions-webview-spike/light-window.png)。

| 项目 | 结果 |
| --- | --- |
| 外观 | 时间单独一列右对齐调淡；长标题只截断标题；选中行圆角；30px 行高；深浅主题都正确 |
| 首次展开（resolve → 页面 ready） | 192 / 135 / 146 ms（三次启动） |
| 页面规模 | 128 行时 534 个 DOM 节点、JS 堆约 3.8 MB；5 行（More 折叠）时 43 个节点、约 2.1 MB |
| 搜索 | 输入到结果全部替换约 370 ms（含 200 ms 防抖与服务端搜索） |
| 点击打开 | 打开到主面板，行变为选中；宿主 posts 正常 |
| 键盘 | 搜索框 ↓ 进入列表，↓↓ 焦点到第 3 行，aria-label 正确 |
| 右键菜单 | NOT VERIFIED：macOS 上是系统原生菜单，Playwright 截图与 DOM 都拿不到 |
| 运行中呼吸点 / 等待点 / 未读点 | NOT RUN（本次没有运行中会话） |
| Remote-SSH | NOT RUN |
| 检查 | typecheck PASS；build PASS；unit 185/185（`settings-contribution` 守卫测试已加入实验视图与设置） |

## 打包与部署（2026-10-08）

- 打包 PASS：`bash scripts/package-vsix.sh` → `oco-0.0.4-a018595.vsix`（12.7 MB，构建时有未提交改动；extension.js sha256 `fe6283f2…`）。包内有 `media/sessions-list/index.js`、`index.css`，`package.json` 含 `oco.sessionsWeb`。
- 部署 BLOCKED：`scripts/deploy-remote.sh gcp-workstation` 报 "Tunnel unavailable"。只读核查：`gcloud workstations describe` 返回 NOT_FOUND（workstation `w-zhizhihwh-mumckyfl`），同一 cluster 下的 config `vscode-lab-small` 也是 NOT_FOUND，`asia-east2` 下列不出任何 cluster。远端环境已不存在，未做任何创建或修改。
- 本机安装 PASS：用 VS Code 自带 CLI（`/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code --install-extension … --force`）覆盖安装 `oco-local-test.oco@0.0.4`；安装目录 `~/.vscode/extensions/oco-local-test.oco-0.0.4` 内含 `media/sessions-list/`，extension.js sha256 前缀 `fe6283f2` 与包一致。未改用户设置，实验开关需用户自己打开。

## 第二批：webview 替换原生列表（2026-10-08）

用户要求：直接用 webview 替代原生列表；常驻搜索框改为标题行按钮触发；视图名去掉 "(Preview)"；去掉 Connection 视图（它只为保留单独的 Sessions 标题行而存在）；提 PR。

| task_id | 唯一写入范围 | requested_route | actual_provider/model | agent_id/run_id | 状态 | 结果路径 | fallback_reason / 接手理由 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| health-gemini-2 | 无 | agy -p 最小请求 | unknown | — | 未确认（11 s 超时，`context canceled`；本会话第 2 次） | scratchpad/agy-health2.json | 换 Grok |
| host-02 | apps/extension/src/*、package.json、media/sessions-list/（搜索框改为按钮触发，约 15 行）、tests/unit/* | 主线程 | — | — | 已返回（typecheck PASS、build PASS、unit 185/185） | — | 公共契约与同文件集成；页面改动 15 行与宿主命令同一功能点 |
| e2e-01 | tests/e2e/p1b-sidebar.mjs、tests/e2e/lib/sessions-web.mjs | grok-worker（只改代码，不运行） | Grok Build（model unknown） | job run-muz7ajvf-6r6lvr · grok session f4cbc625 | 已返回（21m20s；node --check 通过；桥报 no files changed 与实际不符） | — | Gemini 两次不可用；Grok 沙箱无法启动 VS Code（见 2026-10-06 记录），故 Grok 改代码、主线程运行 |
| e2e-run | tests/e2e/p1b-sidebar.mjs（运行中修正 2 处） | 主线程 | — | — | 验收通过 | — | 两条订阅路线均无法运行真实 VS Code |

### 第二批结果

- 运行中修正（主线程）：① Grok 用的 `execCommand` 在 `vscode.mjs` 里是空壳（只在 Electron 主进程回显参数，不执行 VS Code 命令），重命名改为命令面板 "oco: Rename Session" + 按会话 id 选中；② 搜索输入后先在页面内等过滤完成，再走命令面板读宿主状态（否则面板帮助函数的 Esc 会落进仍有焦点的搜索框把它清空）。
- E2E（mock，隔离服务 @4517，本机 VS Code）：`p1b-sidebar` 13/13（第 1 次 4 PASS 后卡在搜索，修正后整套通过；含运行中 `.dot.running` 动画 `oco-pulse`、等待 `.dot.waiting`、单标题行 "Oco: Sessions"）、`c3-fork` 4/4、`p1b-reconnect` 5/5、`t010-recover` 5/5、`t014-connection` 6/6。结果目录（gitignored）：`docs/evidence/runs/20261008-073842-p1b-sidebar-0b7c` 等。
- 检查：typecheck PASS；build PASS；unit 185/185（删去 Connection 视图行 3 项，新增 `listMessage` 3 项）。
- 截图：[最终整窗](sessions-webview-spike/final-window.png)、[标题栏搜索](sessions-webview-spike/final-search.png)。
- NOT VERIFIED：右键菜单（macOS 原生菜单；命令本身由 E2E 走命令面板覆盖）。NOT RUN：其余 E2E 套件、Remote（gcp-workstation 已不存在）。
