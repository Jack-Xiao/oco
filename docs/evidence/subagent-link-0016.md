# 子智能体卡片打开系统浏览器（补丁 0016）证据

- 基线：main `e9449cd`（补丁 0001–0015）；上游 `51ef4be`；VS Code 1.139.1。
- 用户反馈（2026-10-01）：对话里点子智能体，会跳到一个链接。

## 原因

- 对话视图里的子智能体卡片（`task` 工具）由上游 `BasicTool` 渲染成 `<a href="/server/<b64 服务键>/session/<子会话>">`，href 来自 `DataProvider` 的 `onSessionHref`。
- oco 的 webview 页面有 `<base href="https://file+.vscode-resource.vscode-cdn.net/…/media/chat/">`（`apps/extension/src/panels.ts`），这个应用内路由因此被解析成 `https://file+.vscode-resource.vscode-cdn.net/server/…/session/<子会话>`。
- VS Code webview 的点击拦截（`webview/browser/pre/index.html` 的 `handleInnerClick`）不看 `defaultPrevented`，把每次点击的 `<a href>` 都发给工作台作为外部链接。受信任工作区里不弹确认，直接用系统浏览器打开这个无效网址。
- 同一次点击里，上游的 `onClick` 也调用了 `navigateToSession`，oco 面板路由把它转成宿主 `openSession`，面板切到子会话。所以用户看到的是：浏览器打开一个链接，面板也跳走了。
- 复现（mock 测试服务，截住 Electron 主进程的 `shell.openExternal`）：点击后 `openExternal` 被调用 1 次，参数就是上面的 https 网址；面板切到子会话。

## 改动

| 文件 | 改动 |
| --- | --- |
| `patches/opencode/0016-oco-embedded-session-links-not-urls.patch`（新） | `directory-layout.tsx`：嵌入模式（`platform.embedded`）不提供 `onSessionHref`。上游对没有 href 的宿主已有处理：卡片仍是可点击的 `<a role="button" tabindex="0">`（无 href），点击和 Enter/空格走 `navigateToSession` |
| `tests/e2e/c4-trajectory.mjs` | 新增 `subagent-link`：对话视图的卡片无 href、`role="button"`；点击后面板切到子会话；子会话标题里的父会话按钮返回原会话；全程 `openExternal` 调用 0 次 |

- 嵌入页面里其他应用内会话链接：标签栏、侧栏在嵌入模式下不显示；子会话视图的「返回主会话」和标题中的父会话都是 `<button>`。会话 href 只有 `data.sessionHref` 这一个来源。
- 限制：失败的子智能体（`ToolErrorCard`）副标题原本是链接，现在没有 href 就显示为普通文字，不能从失败卡片跳到子会话（上游对无 href 宿主的现有行为）。轨迹里的子智能体行仍不跳转（NEXT 已有待办）。

## 检查

- 先写用例后修复：未修复构建上 `c4-trajectory` 14/15，`subagent-link` FAIL（`href` 为会话路由，`opened` 含 https 网址）；修复后 15/15。
- 补丁 0001–0016 在固定 SHA 上重放，与 vendor 工作树 30 个改动文件逐字节一致。
- 上游 app `tsgo -b` exit 0；`verify:brief` typecheck 0 错误、unit 168/168。
- E2E（mock，独立测试服务 4547/4548）：`c4-trajectory` 英文 15/15、中文（`OCO_E2E_LOCALE=zh-cn`）15/15；回归 `p1a-identity` 14/14、`p1b-main-panel` 8/8。
- NOT RUN：真实模型下的子智能体、失败子智能体卡片。

## 追加：点击后的长条焦点框（2026-10-01）

- 用户反馈：点子智能体卡片时出现一个整行宽的浅蓝色长条框，OpenCode web 没有。
- 原因：VS Code 给 webview 注入默认样式（`@layer vscode-default`，插在 `<head>` 最前），其中 `a:focus { outline: 1px solid -webkit-focus-ring-color; outline-offset: -1px }`。卡片的触发元素是整行宽的 `<a>`（730 px，卡片本身 238 px），鼠标点击获得焦点就画框。浏览器里只有 `:focus-visible` 才画，上游对这个触发元素的 `:focus-visible` 用背景高亮代替外框。
- 不是 0016 引入的：探针在撤掉 0016（仍是 `<a href>`）的构建上点击，同样是 `solid 1px rgb(153, 200, 255)`、宽 730 px。之前点击同时会跳到浏览器，框被掩盖。
- 修复：`apps/chat-webview/index.html` 在 `<head>` 里加 `@layer oco-webview { a:focus { outline: revert; outline-offset: revert } }`。这个层排在 VS Code 默认层之后、应用样式（Vite 追加在 head 末尾）之前：盖过 VS Code 的默认外框，应用自己的焦点样式仍然优先，结果与浏览器一致。
- 检查：探针（修复后）点击时 outline `none`；键盘聚焦 `:focus-visible` 为 true，outline 为 `none`，由上游背景高亮表示焦点，与 web 一致。`c4-trajectory` 的 `subagent-link` 增加 `clickOutline === "none"`：修复前探针为 `solid`，修复后 15/15；回归 `p1a-chat` 8/8、`c1-open-file` 6/6（mock，独立服务 4547）。
- 未改：VS Code 默认样式里 `input/select/textarea:focus` 的外框（未见问题）。
