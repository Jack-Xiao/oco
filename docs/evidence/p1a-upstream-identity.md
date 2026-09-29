# P1a 上游身份：存储、导航、标签栏、终端、标题、提问

证据级别：全文 **SOURCE**。只读 `vendor/opencode`（tag `v1.18.33`，`HEAD` = `51ef4be1d3c122f18fefb510dca8d778571f4f18`）与宿主入口 `apps/chat-webview/src/main.tsx`。没有 `bun install`、构建或测试。行号对应当前工作区文件。路径除特别注明外相对于 `vendor/opencode/`。

oco 入口：`apps/chat-webview/src/main.tsx`。`platform: "web"`，`windowID: init.panelId`，`storage` 为宿主异步存储，`draftStore` 为宿主实现（不是 IndexedDB），`serverKey` = `ServerConnection.Key.make(init.serverUrl)`（`packages/app/src/context/server.tsx` 238 行，`make` 原样返回字符串）。未传 `canonicalLocalServer`。`MemoryRouter` 固定在 `/server/<base64 serverKey>/session/<id>`，`PanelRouter`（84–116 行）已拦截非绑定路由：其它 session 变成宿主 `openSession`，其余记 `blockedNavigation`，`back`/`forward`/`go` 为空。`notify`（62 行）只收 title/body，丢掉点击回调。

结论先说：路由守卫挡得住“切走”，挡不住标签栏把其它会话画出来，也挡不住快捷键 `preventDefault`。根因是 web 平台忽略 `platform.storage` 和 `platform.windowID`，标签存在同源共享的 `localStorage`。

## 1. 存储

证据级别：**SOURCE**。

### 1.1 名字与 key 怎么生成

`packages/app/src/utils/persist.ts`：

| 常量 / 函数 | 行号 | 存储名 |
| --- | --- | --- |
| `LEGACY_STORAGE` | 27 | `default.dat`（只给桌面迁移用） |
| `GLOBAL_STORAGE` | 28 | `opencode.global.dat` |
| `WINDOW_STORAGE` | 29 | `opencode.window` |
| `workspaceStorage(dir)` | 349–353 | `opencode.workspace.${head}.${checksum}.dat` |
| `draftStorage(id)` | 355–358 | `opencode.draft.${head}.${sum}.dat` |
| `windowStorage(id)` | 361–363 | `opencode.window.${safe}.dat` |
| `legacyWorkspaceStorage` | 366–381 | 仅 `scope === "local"` 时，把未规范化路径 / Windows 反斜杠路径的旧 workspace 名列入 `legacyStorageNames` |

`head`：输入前 12 个字符，空则 `"workspace"` / `"draft"`，`[^a-zA-Z0-9._-]` 换成 `-`。`checksum` 是 FNV-1a 32 位、无符号、base36（`packages/core/src/util/encode.ts` 22–29 行）。`pathKey`（`packages/app/src/utils/path-key.ts` 18–24 行）把 `\` 换成 `/`、去掉末尾斜杠、保留盘符根。

`Persist`（491–527 行）生成的 **逻辑 key**（还不是 localStorage 物理键）：

| 帮助函数 | 行号 | storage | key |
| --- | --- | --- | --- |
| `global(key)` | 492–494 | `opencode.global.dat` | `key` |
| `window(key)` | 495–497 | 见下 | `key` |
| `draft(id, key)` | 498–500 | `draftStorage(id)` | `draft:${key}` |
| `serverGlobal(scope, key)` | 501–504 | local 时同 `global`；否则 `opencode.global.dat` | local 时为 `key`；否则 `ScopedKey.from(scope, key)` |
| `workspace(dir, key)` | 505–507 | local workspace 名 | `workspace:${key}` |
| `serverWorkspace(scope, dir, key)` | 508–510 | 非 local：`workspaceStorage(ScopedKey.from(scope, pathKey(dir)))` | `workspace:${key}` |
| `session(dir, session, key)` | 511–513 | local workspace 名 | `session:${session}:${key}` |
| `serverSession(...)` | 514–516 | 同 `serverWorkspace` 的 storage 名 | `session:${session}:${key}` |
| `scoped` / `serverScoped` | 517–524 | 有 session 走 session，否则走 workspace | 同上 |
| `prompt(target)` | 525–527 | 原样 | 原样，并设 `draft: true` |

`ScopedKey` 用 NUL（`\u0000`）连接（`packages/app/src/utils/server-scope.ts` 8–16、53–55 行）。`ServerScope.fromServerKey`（21–26 行）：key 为 `"sidecar"` 或等于 `canonicalLocalServer` 时 scope 为 `"local"`，否则 scope 就是 server key 字符串。oco 不传 canonical，scope = `http://oco.bridge`，**不是** local。

`resolveTarget`（530–537 行）：`scope === "window"` 且 `platform !== "desktop"` 时 **windowID 写死 `"browser"`**，忽略 `platform.windowID`。物理文件名 `opencode.window.browser.dat`。

`persisted`（568–704 行）选择后端：

- `isDesktop` = `platform === "desktop" && platform.storage`（579 行）。**web 即使提供了 `platform.storage` 也不走它。**
- `config.draft && platform.draftStore`：读写 draftStore，键为 `` `${storage ?? "default"}:${key}` ``（582–589 行）。迁移仍读 localStorage（637–643 行的 `oldCurrent`）。
- 否则非桌面：没有 storage 名 → `localStorageDirect()`（434–472 行，物理键 = 逻辑 key）；有 storage 名 → `localStorageWithPrefix`（388–391 行），物理键 = `` `${storage}:${key}` ``。
- `makePersisted` 的 `name` 是逻辑 `config.key`（684 行），前缀由上面的 storage 适配器加上。
- `removePersisted`（540–566 行）：draft+draftStore 才删 draftStore；`platform.storage` 只在 desktop 删除；否则删 localStorage。

### 1.2 web + 已提供 `platform.storage` 时仍写浏览器存储的调用点

`vendor/opencode/packages` 下 **没有** `sessionStorage`。

IndexedDB：只有 `packages/app/src/utils/draft-store.ts` 97–98 行 `indexedDB.open("opencode-drafts", 1)`，由 `packages/app/src/entry.tsx` 121 行 `createBrowserDraftStore()` 调用。oco 不走 `entry.tsx`，自己传入 `draftStore`，这条路径不会打开 IndexedDB。

localStorage（生产代码，不含 e2e）：

1. `persist.ts` 400、414、426、443、456、467 行。web 上所有 **非** `draft: true` 的 `persisted()` 都落在这里。`draft: true` 的写入走宿主 draftStore，但首次迁移仍可能 `getItem` localStorage。
2. `packages/app/src/context/language.tsx` 140–151 行：模块加载时读 `opencode.global.dat:language`。写入仍走 `Persist.global("language")`（171–172 行）→ 上面的 localStorage。
3. `packages/app/src/entry.tsx` 33–56 行读写 `opencode.settings.dat:defaultServerUrl`。**oco 不挂载该入口。**
4. `packages/app/public/oc-theme-preload.js` 2–26 行读写 `opencode-theme-id`、`opencode-theme-css-light`、`opencode-theme-css-dark`、`opencode-color-scheme`。`apps/chat-webview/index.html` 第 7 行引入了这个脚本，所以 webview 会执行。`packages/app/src` 生产 TS 不写这些键。

### 1.3 五个状态各自的 name/key，以及是否含 server key / 目录 / sessionID

物理键 = 下表的 storage + `:` + key，除非写明“无 storage 名”。

**tabs**（`packages/app/src/context/tabs.tsx` 60–69 行）`Persist.window`：

| 逻辑 key | 物理键 |
| --- | --- |
| `tabs` | `opencode.window.browser.dat:tabs` |
| `tabs.recent` | `opencode.window.browser.dat:tabs.recent` |
| `tabs.info` | `opencode.window.browser.dat:tabs.info` |
| `tabs.closed` | `opencode.window.browser.dat:tabs.closed` |

name/key **不含** server key、目录、sessionID、panelId。值里的 tab 对象含 `server` 与 `sessionId` 或 draft 的 `directory`（17–30 行）。`tabKey`（47 行）：draft 为 `draft:${id}`，会话为 `` `${server}\n${href}` ``。`sessionHref`（`utils/session-route.ts` 5–6 行）= `/server/${base64Encode(server)}/session/${sessionID}`。同源所有 web 面板共享这一份列表。e2e `packages/app/e2e/regression/remote-session-settings.spec.ts` 158 行直接写 `opencode.window.browser.dat:tabs`。

**layout**（`context/layout.tsx` 270–307 行）`Persist.serverGlobal(scope, "layout", ["layout.v6"])`。非 local：storage `opencode.global.dat`，key = `http://oco.bridge\0layout`。含 server key，不含目录、不含 sessionID。值含 `terminal: { height, opened: false }`、sidebar、review、fileTree、`sessionTabs`、`sessionView`、`home.selection`。`sessionView` 内部键是 `SessionStateKey`（scope + 路由）。`dropSessionState`（322–346 行）按 session 删 prompt / terminal / file-view。

**settings**（`context/settings.tsx` 233–236 行）`persisted("settings.v3")` 与 `"app-version.v1"`：无 storage 名，物理键就是这两个字符串。不含 server key、目录、sessionID。`general.newLayoutDesigns` 从这里派生（263 行起，默认见 61 行 `newLayoutDesignsDefault = true`）。

**model-selection**（`context/local.tsx` 75–82 行）`Persist.serverWorkspace(scope, directory, "model-selection", ["model-selection.v1"])`。key = `workspace:model-selection`。storage 名含 scope + `pathKey(directory)` 的校验和，**不含 sessionID**。对 `http://oco.bridge`，scoped 串前 12 字符是 `http://oco.b`，净化后 head 为 `http---oco.b`，完整名为 `opencode.workspace.http---oco.b.<checksum>.dat`，checksum 随目录变。值形状 `{ session: Record<sessionID, State> }`（128–131、147 行）。

**prompt 草稿**（`context/prompt-state.ts` 172–176、240–255 行）包了 `Persist.prompt`，故 `draft: true`，走宿主 `draftStore`：

| 场景 | draftStore 键 |
| --- | --- |
| 有 session | `` `${workspaceStorage(scope+dir)}:session:${sessionID}:prompt` `` |
| 无 session（目录级） | `` `${同名 workspace storage}:workspace:prompt` `` |
| draft 作曲器 `createDraftPromptSession`（254–255 行） | `` `${draftStorage(draftID)}:draft:prompt` `` |
| 历史 `components/prompt-input/history-store.ts` 44–49 行 `Persist.prompt(Persist.global("prompt-history" \| "prompt-history-shell"))` | `opencode.global.dat:prompt-history` 与 `opencode.global.dat:prompt-history-shell`。不含 server、目录、session |

有 session 的 prompt 键含 server scope、目录（在 storage 名里）和 sessionID。legacy 逻辑 key（174 行）`${dir}/prompt${id?"/"+id:""}.v2` 只作迁移候选，web 上从 localStorage 直读。

### 1.4 其它 `persisted()`（web 上非 draft 即 localStorage）

| 位置 | 目标 |
| --- | --- |
| `context/server.tsx` 263 | `Persist.global("server")` |
| `context/models.tsx` 31 | `Persist.global("model")` |
| `context/language.tsx` 171 | `Persist.global("language")` |
| `context/command.tsx` 277 | `Persist.global("command.catalog.v1")` |
| `context/notification.tsx` 235 | `serverGlobal` `notification` |
| `context/permission.tsx` 191 | `serverGlobal` `permission`（自动允许规则，不是请求对象） |
| `context/comments.tsx` 184 | `serverScoped` `comments`（无 `draft: true`，localStorage；key 含 session） |
| `context/file/view-cache.ts` 40 | `serverScoped` `file-view`（同上） |
| `context/terminal.tsx` 116–158 | `serverWorkspace` `"terminal"`（PTY 列表，按目录，不含 sessionID） |
| `context/global-sync/child-store.ts` 158–177 | `serverWorkspace` `vcs` / `project` / `icon` |
| `pages/layout.tsx` 88 | `serverGlobal` `layout.page`（仅旧壳挂载时） |
| `pages/session.tsx` 606 | `serverWorkspace` `followup` |
| `pages/session/v2/review-panel-v2-state.ts` 12 | `Persist.global("review-panel-v2")` |
| `pages/session/usage-exceeded-dialogs.tsx` 43 | `Persist.global("go-upsell")` |
| `components/session/open-in-app.tsx` 166、`session-header.tsx` 220 | `Persist.global("open.app")` |
| `pages/new-session/new-session-view.tsx` 101 | `Persist.global("new-session.provider-tip")` |
| `pages/home/home-projects-controller.tsx` 26 | `Persist.global("home.servers")` |
| `components/settings-v2/models.tsx` 26 | `serverGlobal` `settings-v2.models.providers` |
| `context/highlights.tsx` 147 | 字符串 `"highlights.v1"`，直写 localStorage |

`draftPersistedKeys`（475–478 行）只是关掉 draft 标签时要删的逻辑名 `prompt` / `comments` / `file-view` / `layout`，不表示它们都进 draftStore。只有 `Persist.prompt()` 设 `draft: true`。

## 2. 会改变路由或当前会话的入口

证据级别：**SOURCE**。

新布局下嵌入路由 `/server/:serverKey/session/:id` 走 `app.tsx` 638–642 行的 `TargetSessionRoute`，**不**挂载 `pages/layout.tsx`（`LegacyLayout` 只在 `LegacyServerScopedShell`，363–368 行，包住 `/:dir` 以及旧布局的 `/`）。因此旧壳里的命令和深链接在这条路由上不注册。`NewLayout`（`pages/layout-new.tsx`）作为 router root 始终包住当前页（`app.tsx` 588–605 行）。

宿主 `PanelRouter` 会拒绝真正换路由；下面仍列出上游**试图**导航的点，因为它们会先改 tabs store，或被快捷键吃掉。

### 2.1 `navigate(` / `<Navigate>` 分类

**A. 内部标签 store**（`context/tabs.tsx`，新布局会话页会跑）

| 行号 | 行为 |
| --- | --- |
| 149–152 `navigateTab` | `navigate(tabHref(tab))`，`select` 即此函数（356 行） |
| 209–219 `newDraft` | 先 `setStore` 推入 draft，再 `navigate(/new-session?draftId=)` |
| 168–172 关闭最后一个标签 | `navigate("/")` |
| 362–373 `toggleHome` | 离开 home 时 `navigate("/")`；在 home 时回到 recent 标签 |
| 296 `removeServer` | 删掉当前 server 时 `navigate("/")` |
| 341–342 `removeSessions` | 当前标签被删则切下一个，否则 `navigate("/")` |
| 277 `reopenClosedTab` | `navigateTab` |

`pages/session.tsx` 258–264 行：进入 `/server/...` 时 `tabs.addSessionTab({ server, sessionId: session.root.id })`。子会话路由记下的是 **root**，不是子 id。`components/titlebar.tsx` 249–254 行：当前路由是 session 且没有对应标签时，`addSessionTab` 用 `s.parentID ?? s.id`。看子会话会把 **父会话** 记成标签。

**B. 标题栏历史（不是浏览器 history）**

`components/titlebar-history.ts` 11–14 行：栈空时先塞 `"/"` 再塞当前路径。`titlebar.tsx` 140–151 行 `back`/`forward` 对栈项 `navigate`。`packages/app/src` 没有 `history.back` / `popstate`。`mod+[` / `mod+]` 走的是这条栈，第一步往往是 `/`。

**C. 子会话 / task 工具**

- `packages/session-ui/src/components/message-part.tsx` 1550–1553、1978–2022 行：task 的子会话 id 取 `metadata.sessionId`（否则 `taskSession(...)`）。点击或 Enter/Space 调 `data.navigateToSession(id)`。
- 该回调只在 `pages/directory-layout.tsx` 67 行接上：`navigate(href(sessionID))`。`ResolvedTargetSessionRoute`（`session.tsx` 274 行）传入 `server`，所以 href 是 `sessionHref`（`directory-layout.tsx` 30–33 行）。
- 父会话：`pages/session/timeline/message-timeline.tsx` 881–886 行 `navigateParent`；`pages/session.tsx` 2163–2170 行 `openParent`。有 `params.serverKey` 时用 `sessionHref`。
- 归档/删除后：`pages/session/session-archive.ts` 23–39 行，依次父会话、下一个会话、或（有 serverKey 时）`tabs.newDraft`，否则 `/${params.dir}/session`。

**D. 新建会话 / 提交 / fork（多数是旧式 `/${b64目录}/session/...`）**

| 位置 | 行号 | 目标 |
| --- | --- | --- |
| `components/prompt-input/submit.ts` | 430–431 | 无 draft 时 `navigate(/${b64(dir)}/session/${id})`。有 draft 则 `tabs.promoteDraft` |
| `pages/session/composer/session-composer-controls.ts` | 101、110 | `/${b64(worktree)}/session` |
| `pages/layout/sidebar-workspace.tsx` | 422 | `/${slug}/session`（旧侧栏，新布局会话路由不挂载） |
| `components/dialog-fork.tsx` | 76 | `/${dir}/session/${forked.id}` |
| `pages/session/use-session-commands.tsx` | 454–459 | 新布局 `command.trigger("tab.new")`；旧布局 `navigate(/${params.dir}/session)` |

**E. 换服务器 / 回首页**

| 位置 | 行号 | 行为 |
| --- | --- | --- |
| `components/dialog-select-server.tsx` `select` | 384–393 | 总是 `navigate("/")`，再可选 `server.setActive` |
| `components/status-popover-body.tsx` | 145、352 | `navigate("/")` 再 `setActive` |
| `app.tsx` `LayoutCompatibility` | 251–262 | 旧布局且协议是 v2 时 `navigate("/")` 并换服务器。新布局直接 return（252 行），嵌入路由不触发 |

**F. 首页会话列表**（路由 `/`，`pages/home.tsx` `NewHome`；嵌入页默认不挂载，`home.toggle` 会试图进去）

- `pages/home/home-sessions-controller.tsx` 181–205 行 `open`，以及 148–158 行命令面板：`tabs.addSessionTab` + `tabs.select`（background 只加标签）。
- `components/command-palette.ts` 170–181 行：同样 `addSessionTab` + `select`。会话页的 `command.palette`（`session.tsx` 1147–1153 行）把面板绑到 `file.open`，不是首页那份。
- `pages/home/legacy-home.tsx` 44 行：`navigate(/${b64(directory)})`。仅旧布局 `/`。
- `pages/home/home-session-search-controller.ts` 72 行：`sessions.session.open`。

**G. 深链接**

`pages/layout/deep-links.ts`：事件名 `opencode:deep-link`（1 行）；`window.__OPENCODE__.deepLinks` 由 `drainPendingDeepLinks` 取走（45–49 行）。只认 `opencode://open-project?directory=` 与 `opencode://new-session?directory=&prompt=`（13–31 行）。唯一消费者是 `pages/layout.tsx` 1252–1281 行，且 `server.isLocal()` 才处理，导航到 `/${b64}/session`。桌面 preload 在 `packages/desktop/src/renderer/index.tsx` 66–76 行把 IPC 深链接推进 `__OPENCODE__.deepLinks` 并派发事件。**新布局的 `/server` 路由不挂载 `layout.tsx`，嵌入路径上没有监听器。**

**H. 通知点击**

`context/notification.tsx` 338–396 行：`session.idle` / `session.error`（跳过有 `parentID` 的）调用 `platform.notify(title, body, () => input.navigate(href))`。href 是旧式 `/${base64Encode(directory)}/session/${sessionID}`（357、392 行），不是 `/server/...`。受 `settings.notifications.agent()` / `.errors()` 控制。oco 的 `notify` 丢掉第三个参数，点击不会导航。官方 web `entry.tsx` 58–80 行会把 `onclick` 接到该回调。

**I. 声明式 `<Navigate>`**（`app.tsx`）

| 行号 | 行为 |
| --- | --- |
| 82–88 | 新布局下旧路径 `/:dir/session/:id` 换成 `sessionHref` |
| 194 | draft 标签不存在 → `/` |
| 199 | 旧布局的 draft → `/${b64(directory)}/session` |
| 634 | `/:dir/` → `session` |
| 648–666 | 新布局 `/:dir/session/:id` → `sessionHref` |

**J. 不换会话**

`pages/session/use-session-hash-scroll.ts` 52、59 行：`navigate(pathname + search [+ hash], { replace: true })`。`directory-layout.tsx` 36–42 行只在 **没有** `server` prop 时按目录重写路径；嵌入路由传了 server，这段不跑。111 行非法目录 → `/`，只属于 `/:dir` 布局。

**K. 仅旧壳 `pages/layout.tsx`（嵌入路由不挂载）**

327、449、455、473、891、893、1096 起的服务器对话框、1192、1202、1239、1244、1268、1326、1387、1435、1505、1540、1859、2111 行：侧栏打开项目/会话、上/下一个会话、归档后跳转。全部是 `/${b64(dir)}/session/...` 或 `/`。

### 2.2 命令 id 与默认键（嵌入的新布局会话页实际会注册的）

`mod`：Mac 为 Meta，其它为 Ctrl（`context/command.tsx` 154–157 行）。监听在 document `keydown` **捕获阶段**（397–423 行）：命中则 `preventDefault` + `stopPropagation`。可编辑目标里，未修饰且非 Tab 的键放行，除非 id 在 `EDITABLE_KEYBIND_IDS`（`terminal.toggle`、`terminal.new`、`file.attach`，16 行）或是命令面板。命令面板默认 `mod+k,mod+shift+p`（13–14 行）。

注册表前插（117–118 行）。同 id 保留先看到的（289–307 行），所以后挂载的组优先。带 key 的组只保留最新一份（121–128 行）。`when` 为真的候选优先于没有 `when` 的（97–98 行）。

| id | 默认键 | 注册位置 | 作用 |
| --- | --- | --- | --- |
| `tab.new` | `mod+t,mod+n` | `titlebar.tsx` 327–337 | `openNewTab` → `tabs.newDraft` |
| `tab.close` | `mod+w` | `titlebar.tsx` 339–347 | 关会话标签并可能 `navigate` |
| `tab.close`（同 id） | `mod+w` | `use-session-commands.tsx` 525–531 | 仅当有可关的**文件**标签；后注册，优先于标题栏 |
| `tab.reopenClosed` | `mod+shift+t` | `titlebar.tsx` 349–354 | 重开已关标签并导航 |
| `tab.prev` | `mod+option+ArrowLeft,ctrl+shift+tab` | `titlebar-tab-strip.tsx` 231–238 | 上一个内部标签 |
| `tab.next` | `mod+option+ArrowRight,ctrl+tab` | 同文件 240–246 | 下一个内部标签 |
| `tab.1`…`tab.9` | `mod+1`…`mod+9` | 同文件 400–415 `useTabShortcut` | 按可见顺序切标签 |
| `home.toggle` | `mod+b` | `titlebar.tsx` 316–324 | `tabs.toggleHome` → `/` 或回到标签 |
| `common.goBack` / `common.goForward` | `mod+[` / `mod+]` | `titlebar.tsx` 154–168 | 标题栏栈。无条件注册，不在 v2 分支里 |
| `session.new` | `mod+shift+s` | `use-session-commands.tsx` 449–460 | 新布局转发到 `tab.new` |
| `terminal.toggle` | `` ctrl+` `` | 同文件 547–560 | `view().terminal.open/close` |
| `terminal.new` | `ctrl+alt+t` | 595–600 | 新建 PTY 并打开 |
| `terminal.close` | `mod+w` | 587–593 | `when`：焦点在 `[data-component="terminal"]` 内才赢过 `tab.close` |
| `command.palette` | （键在设置里，默认 `mod+k,mod+shift+p`） | `session.tsx` 1147–1153；首页另有 `home.tsx` 路径上的 `home-sessions-controller.tsx` 134 | 会话页打开文件面板 |
| `settings.open` | `mod+comma` | `components/settings-dialog.tsx` 27–37 `useSettingsCommand` | 会话页会调用 |
| `file.open` | `mod+p` | `use-session-commands.tsx` 517–523 | 打开文件 |
| `fileTree.toggle` | `mod+\` | 568–576 | 仅 file tree 可见时 |
| `review.toggle` | `mod+shift+r` | 562–566 | 评审面板 |
| `input.focus` | `ctrl+l` | 578–582 | 聚焦输入 |
| `message.previous` / `message.next` | `mod+alt+[` / `mod+alt+]` | 604–620 | 消息，不换会话 |
| `context.addSelection` | `mod+shift+l` | 536–543 | |
| `mcp.toggle` | `mod+;` | 623–631 | |
| `permissions.autoaccept` | `mod+shift+a` | 634–642 | |
| `session.archive` | `mod+shift+backspace` | 502–510 | 可能走到 archive 导航 |
| 作曲器 | `mod+'`、`shift+mod+d`、`mod+.`、`shift+mod+.` | `use-composer-commands.tsx` 49 行起 | 不换会话 |
| prompt | `mod+u`、`mod+shift+x`、`mod+shift+e` | `prompt-input-v2.tsx` 441 行起 | 不换会话 |

**新布局会话路由上不注册**（只在 `pages/layout.tsx` 898 行起的 `"layout"` 组）：`sidebar.toggle` `mod+b`、`project.open` `mod+o`、`project.previous/next` `mod+alt+ArrowUp/Down`、`session.previous/next` `alt+ArrowUp/Down`、`session.previous.unseen/next.unseen` `shift+alt+ArrowUp/Down`、`project.1`–`project.9` `mod+数字`、`workspace.new` `mod+shift+w`、`theme.cycle` `mod+shift+t`、`theme.scheme.cycle` `mod+shift+s`、`server.switch`（无默认键）。`mod+数字` 在嵌入页属于 `tab.N`，不是 `project.N`。`home.sessions.search.focus`（`mod+f`）只在 `NewHome` 挂载时注册。

## 3. 新布局的标签栏与服务器/项目侧栏

证据级别：**SOURCE**。

挂载链：`AppInterface`（`app.tsx` 588–597 行）在 `newLayoutDesigns()` 时 router root = `TabsProvider` + `NewAppLayout`。`NewAppLayout`（371–378 行）= `SelectedServerProviders` + `ServerScopedProviders` + `NewLayout`。`pages/layout-new.tsx` `NewLayout`（9–48 行）**无条件**渲染 `Titlebar`，没有 children 插槽可以拿掉它。

`components/titlebar.tsx`：`useV2Titlebar` = `newLayoutDesigns`（74 行）。v2 分支（192–435 行）始终渲染：

- `ChannelIndicator`
- home 按钮 `grid-plus`，`onClick={toggleHome}`（375–396 行）→ 离开绑定会话去 `/`
- `TitlebarTabStrip`（398–412 行），`onNavigate` → `tabs.select`
- `+` 按钮 `openNewTab`（413–431、264–313 行）→ 新 draft
- `TitlebarV2Right`

`showNavigation`（`settings.tsx` 28、189、383 行；`titlebar.tsx` 123 行）只包住 **旧**标题栏的后退/前进按钮（538 行）。v2 分支不用它。没有 prop、没有设置能隐藏 v2 标签条、home 按钮或 `+`。

会话页本身的侧栏不是项目列表：`pages/session.tsx` 2322–2382 行是评审 `SessionSidePanel` 与 `TerminalPanelV2`。项目/服务器列表在首页 `pages/home.tsx` `NewHome`：左列 `HomeProjects`（`pages/home/home-projects.tsx`，控制器 `home-projects-controller.tsx`，内部 `useServerManagementController`）。旧项目侧栏是 `pages/layout.tsx` 的 `SidebarContent` / `sidebar-project.tsx` / `sidebar-workspace.tsx`，嵌入路由不挂载。服务器对话框组件是 `components/dialog-select-server.tsx`；v2 设置里还有 `components/settings-v2/dialog-server-v2.tsx`。

**最小补丁点：** `pages/layout-new.tsx` 的 `NewLayout` 在嵌入标志为真时不渲染 `<Titlebar>`（33–40 行）。这样标签条、home、`+`，以及 `titlebar.tsx` 里注册的 `tab.*`、`home.toggle`、`common.goBack/Forward` 一起消失。若还要标题栏外观，就改 `titlebar.tsx` v2 分支（316–357 行的 `command.register` 与 375–431 行的三个控件），用同一标志跳过。只藏 DOM 不够：`session.new`（`use-session-commands.tsx` 454–456 行）仍会 `trigger("tab.new")`，而 `newDraft` 在 `navigate` 之前已经 `setStore`。

## 4. 终端

证据级别：**SOURCE**。

打开条件是 layout store 的 `terminal.opened`，默认 `false`（`context/layout.tsx` 280–283 行）。API 在 877–887 行：`view().terminal.opened/open/close/toggle`，写入同一份 `serverGlobal` layout（所有 `http://oco.bridge` 面板共享，不含 sessionID、不含 panelId）。

谁把它打开：

| 入口 | 位置 |
| --- | --- |
| 命令 `terminal.toggle` `` ctrl+` `` | `use-session-commands.tsx` 547–560 |
| 命令 `terminal.new` `ctrl+alt+t` | 595–600，以及面板上的 +（`terminal-panel-v2.tsx` 292、314 行） |
| 会话头按钮 | `components/session/session-header.tsx` 211、457–460 行（旧头；新布局头以 v2 为准） |
| 面板自己 | `terminal-panel-v2.tsx` 76–85 行：`opened()` 且尚无 PTY 时 `terminal.new()` |

渲染：`pages/session.tsx` 2371–2378 行 `<Show when={terminalOpen()}>` 才挂 `TerminalPanelV2`。新布局下旧 `TerminalPanel`（2386–2388 行）不挂。`TerminalPanelV2` 323 行再要求 `opened() && terminal.active()` 才挂 `components/terminal.tsx` 的 `<Terminal>`。

WebSocket：`components/terminal.tsx` 620–633 行 `new WebSocket(terminalWebSocketURL(...))`。URL 在 `utils/terminal-websocket-url.ts` 3–16 行：v1 为 `${url}/pty/${id}/connect?directory&cursor`，v2 为 `${url}/api/pty/${id}/connect?location[directory]&cursor`，http→ws。PTY 列表另存 `Persist.serverWorkspace(scope, dir, "terminal")`（`context/terminal.tsx` 116–158 行），按目录共享，不是按会话。

**最小禁用：** 在 `pages/session.tsx` 2371 行的 `Show` 上再加嵌入标志，使面板不挂载，WebSocket 就不会创建。同时必须拦住 `view().terminal.open()`（`layout.tsx` 879 行，或 `use-session-commands.tsx` 547–560 与 595–600 行直接 return）。否则一次 `` ctrl+` `` 会把共享的 `terminal.opened` 写成 true，其它面板下次读取也会打开。没有现成的“禁用终端”设置或命令。

## 5. `document.title`

证据级别：**SOURCE**。

`vendor/opencode` 的 ts/tsx/js **没有** `document.title` 赋值。`packages/app/src` 没有 `@solidjs/meta` 的 `<Title>`。`app.tsx` 10、400 行只包了 `MetaProvider`。静态标题：`packages/app/index.html` 第 9 行 `<title>OpenCode</title>`；`apps/chat-webview/index.html` 第 6 行 `<title>oco</title>`。桌面 `packages/desktop/src/main/windows.ts` 128 行是 `setTitleBarOverlay`，不是窗口标题文本。`titlebar.tsx` 里的 `setTitlebar` 是主题色（`app.tsx` 275、403–404 行）。

会话标题只活在会话对象和标签 `info.title`（`tabs.tsx` 350–354 行 `rememberSessionInfo`），不写 `document.title`。宿主 `main.tsx` 140–147 行的 `MutationObserver` 在等官方应用改 `document.title`，按当前源码不会触发。

## 6. Permission / question 类型与答案落点

证据级别：**SOURCE**。

包导出：`packages/sdk/js/package.json` 12–20 行，根入口是 v1 客户端（`src/client.ts` → `src/gen`），`"./v2"` 才是应用在用的客户端。`packages/app/src` 里权限/提问类型来自 `@opencode-ai/sdk/v2/client`（例如 `context/server-session.ts` 8–9、201–202 行）。下面两边都写。

### 6.1 包根 v1（`packages/sdk/js/src/gen/types.gen.ts`）

`Permission`（423–437 行）：`id`、`type`、`pattern?`、`sessionID`、`messageID`、`callID?`（顶层，没有 `tool` 对象）、`title`、`metadata`、`time.created`。回复 `PostSessionIdPermissionsPermissionIdData`（2889–2900 行）：`POST /session/{id}/permissions/{permissionID}`，body `{ response: "once" | "always" | "reject" }`。

该目录 **没有** `Question` / `question` 类型或路由（`src/gen` 全文无匹配）。

### 6.2 应用实际使用的实例 API（生成在 `src/v2/gen/types.gen.ts`，事件名不带 `.v2`）

`PermissionRequest`（2471–2484 行）：`id`、`sessionID`、`permission`、`patterns`、`metadata`、`always`、`tool?: { messageID, callID }`。事件 `permission.asked` 的 `data` 同形（5699–5724 行）。回复 `PermissionReplyData`（9267–9279 行）：`POST /permission/{requestID}/reply`，body `{ reply: "once" | "always" | "reject", message? }`。

`QuestionRequest`（2455–2463 行）：`id`、`sessionID`、`questions: QuestionInfo[]`、`tool?: { messageID, callID }`。`QuestionInfo`（706–721 行）：`question`、`header`、`options: { label, description }[]`、`multiple?`、`custom?`。事件 `EventQuestionAsked`（6951–6962 行）字段相同。

回复 `QuestionReplyData`（9166–9180 行）：`POST /question/{requestID}/reply`，body `{ answers: QuestionAnswer[] }`。`QuestionAnswer = string[]`（728 行），与问题顺序对齐，每项是选中的 label。事件 `question.replied`（6965–6972 行）：`sessionID`、`requestID`、`answers`。拒绝：`POST /question/{requestID}/reject`（9205–9214 行），事件只有 `sessionID` 与 `requestID`（6975–6981 行）。

另有 `QuestionV2Request` / `QuestionV2Reply`（6111–6126 行）和 `PermissionV2Request`（4986–4996 行，无 `tool`，有 `action`/`resources`）。会话 UI 当前把事件收成上面的非 v2 `QuestionRequest` / `PermissionRequest`。

### 6.3 工具完成后答案在哪

工具实现 `packages/opencode/src/tool/question.ts` 34–39 行同时返回：

- `output`：给人读的句子 `` `User has answered your questions: ...` ``
- `metadata: { answers }`：`answers` 为 `ReadonlyArray<Question.Answer>`，即与问题顺序一致的 `string[][]`

`packages/opencode/src/session/prompt.ts` 399–410 行把它们写成 part 的完成态：`state.status = "completed"`，`state.output = result.output`，`state.metadata = result.metadata`，另有 `state.title`、`state.input`、`state.time`。

SDK 形状 `ToolStateCompleted`（v1 `src/gen/types.gen.ts` 259–275 行；v2 `src/v2/gen/types.gen.ts` 500–515 行）：`output: string` 与 `metadata: { [key: string]: unknown }` **都有**。结构化答案在 **`state.metadata.answers`**，不是只在 `state.output`。`state.output` 是那段格式化英文。`ToolPart` 顶层另有可选 `metadata`（v1 302–304 行），question 工具没有把 answers 放在那里。

UI：`message-part.tsx` 1540–1542 行在 `pending`/`running` 时藏起 question part；1577 行若 error 含 `"dismissed this question"` 则显示已忽略。

## 7. 与 VS Code 冲突的全局按键

证据级别：**SOURCE**。

主拦截器是第 2.2 节的 `command.tsx` 捕获监听。在嵌入的新布局会话页上，会 `preventDefault` 从而挡住 VS Code 的键：

| 键 | 命令 | VS Code 通常用途 |
| --- | --- | --- |
| Cmd/Ctrl+W | `tab.close`（文件标签优先，否则关会话标签）；终端聚焦时 `terminal.close` | 关编辑器标签 |
| Cmd/Ctrl+T | `tab.new` | 新标签 |
| Cmd/Ctrl+N | 同上，`tab.new` 的第二绑法 | 新窗口/文件 |
| Cmd/Ctrl+1…9 | `tab.1`…`tab.9` | 切编辑器标签 |
| Cmd/Ctrl+B | `home.toggle` | 切侧栏 |
| Cmd/Ctrl+[ / ] | `common.goBack` / `goForward` | 导航 |
| Cmd/Ctrl+Shift+T | `tab.reopenClosed` | 重开关闭的编辑器 |
| Cmd/Ctrl+P | `file.open` | 快速打开 |
| Cmd/Ctrl+K、Cmd/Ctrl+Shift+P | 命令面板 | 和弦 / 命令面板 |
| Ctrl+`（Mac 上也是 Ctrl，不是 Cmd） | `terminal.toggle` | 终端 |
| Cmd/Ctrl+Shift+S | `session.new` → `tab.new` | |
| Cmd/Ctrl+, | `settings.open` | 设置（与 VS Code 相同，也会被吃掉） |

不偷 W/T/数字的其它监听：

- `pages/session.tsx` 1046–1082 行 `handleKeyDown`，2002 行冒泡阶段挂上。可编辑目标直接 return；不 `preventDefault` 修饰键；无修饰的单字符会把焦点送进作曲器。
- `pages/session/file-tabs.tsx` 393–406 与 676–690 行：捕获阶段只处理 Cmd/Ctrl+F（无 Alt/Shift）。
- `packages/session-ui/src/v2/components/session-review-v2.tsx` 194–204 行：只处理无修饰的左右方向键。
- `components/settings-keybinds.tsx` 263 行、`prompt-project-selector.tsx` 275 行、`dialog-select-model-unpaid-v2.tsx` 64 行：仅对应对话框打开时。
- `packages/desktop/src/renderer/webview-zoom.ts` 119 行是桌面缩放，web 嵌入不加载。

## 建议

证据级别：**SOURCE**（补丁点来自上面的调用链；宿主行为来自 `apps/chat-webview/src/main.tsx`）。

上游最小补丁，按顺序：

1. **存储命名空间。** `persist.ts` `resolveTarget`（533 行）在 web 使用 `platform.windowID`，不要写死 `"browser"`。并且 `persisted`（579–593 行）在 web 提供了 `platform.storage` 时走它，与 desktop 相同。否则 tabs、layout、settings、model-selection 继续落在 webview 的 localStorage，且 tabs 跨面板共享。prompt 已经走宿主 `draftStore`，不必改键格式。
2. **不要画、也不要注册内部标签。** `pages/layout-new.tsx` 33 行按嵌入标志跳过 `<Titlebar>`，或在 `titlebar.tsx` 316–357 与 375–431 行跳过标签条、home、`+` 及其 `command.register`。同时让 `use-session-commands.tsx` 454–456 行的 `session.new` 在嵌入时不再 `trigger("tab.new")`。
3. **终端。** `session.tsx` 2371 行不挂面板，并在 `layout.tsx` `terminal.open`（879 行）或两个终端命令处拒绝把 `terminal.opened` 写成 true。
4. **子会话点击。** 若宿主希望点击 task 开新面板而不是在本面板换会话：现有 `navigate(sessionHref)` 已被 `PanelRouter` 转成 `openSession`。上游不必改，除非要去掉 `session.tsx` 258–264 与 `titlebar.tsx` 249–254 行对 **别的** session id 的 `addSessionTab`（路由被拦住时这两处仍会在“当前路由就是绑定会话”时写入本会话或父会话）。

宿主侧现在就能做的（不改上游则不完整）：

- **路由守卫已经在** `main.tsx` 84–116 行。它阻止 URL 换掉，但不阻止标签条渲染，也不阻止 `newDraft` 先写入 store。
- **存储：** `platform.storage` 今天被忽略。不改 `persist.ts` 的话，只能在 webview 里替换 `localStorage`，按 `panelId` 加前缀。这会同时盖住 theme preload 和 `language.tsx` 的直读。draftStore 已按宿主 `"drafts"` 存储，键本身仍是全局 `opencode.global.dat:prompt-history`，多面板会共享输入历史。
- **标题：** 不要等 `document.title`。应从会话对象 `title` 推给宿主。`main.tsx` 140–147 行的观察者对当前上游无效。
- **按键：** 守卫不阻止捕获阶段的 `preventDefault`。要让 Cmd/Ctrl+W、T、数字交回 VS Code，必须不注册对应命令（补丁 2），或在宿主更早的捕获监听里拦下并 `stopImmediatePropagation`（脆弱，且要赶在 `command.tsx` 的 `onMount` 之前）。
