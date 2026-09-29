# T002 官方 UI 可复用边界

> 本文为 SOURCE 级调查。运行验证结果（SSE 经虚拟非回环地址走宿主桥、Worker/sprite 在 webview 中的实际限制与处理）见 `p0-spike.md` 与 ADR-002/003。

证据级别：全文为 **SOURCE**（只读 `vendor/opencode` 源码与只读 git 元数据）。没有启动应用、没有安装依赖、没有构建。下面凡是写到“会连接 / 会执行”，都是对源码控制流的阅读结论，不是运行记录。

路径均相对于 `vendor/opencode/`。行号对应该树当前文件。

## 基线

| 项 | 值 |
| --- | --- |
| 远程标签 | `v1.18.33`（`git describe --tags --exact-match HEAD`） |
| 精确提交 | `51ef4be1d3c122f18fefb510dca8d778571f4f18`（`git rev-parse HEAD`） |
| 克隆形态 | 浅克隆（`git rev-parse --is-shallow-repository` 为 `true`），`HEAD (no branch)` |
| 获取 / 调查日期 | 2026-09-29 |
| 根包 | `package.json`：`"private": true`，`"packageManager": "bun@1.3.14"` |
| 应用包版本 | `packages/app/package.json`、`packages/ui/package.json`、`packages/session-ui/package.json`、`packages/sdk/js/package.json` 的 `version` 均为 `1.18.33` |

`packages/app` 的 `@opencode-ai/client` 不是 workspace 包，而是 `file:vendor/opencode-ai-client-1.17.13-v2.tgz`（`packages/app/package.json` 第 57 行）。v2 HTTP/SSE 客户端实现以这个 tarball 打进 `packages/client` 的生成代码为准；版本号字符串与 app 的 `1.18.33` 不一致。

## 接口清单

### `packages/app/src/index.ts` 导出

第 1–30 行。没有默认导出。

| 导出名 | 来源 |
| --- | --- |
| `AppBaseProviders`, `AppInterface` | `./app` |
| `useLayout` | `./context/layout` |
| `useServerSDK` | `./context/server-sdk` |
| `useServerSync` | `./context/server-sync` |
| `useServer` | `./context/server` |
| `useSettings` | `./context/settings` |
| `useTabs` | `./context/tabs` |
| `useProviders` | `./hooks/use-providers` |
| `ACCEPTED_FILE_EXTENSIONS`, `ACCEPTED_FILE_TYPES`, `filePickerFilters` | `./constants/file-picker` |
| `useCommand` | `./context/command` |
| `loadLocaleDict`, `normalizeLocale`, `Locale`, `useLanguage` | `./context/language` |
| `useWslServers` | `./wsl/context` |
| `DisplayBackend`, `FatalRendererErrorLog`, `Platform`, `PlatformProvider` | `./context/platform` |
| `UpdaterPlatform`, `UpdaterState` | `./updater` |
| `WslDistroProbe` … `WslServersState`（见源文件 16–28 行） | `./wsl/types` |
| `ServerConnection` | `./context/server` |
| `createDraftStore`, `DraftStore` | `./utils/draft-store` |

`Platform` 由 `index.ts` 导出。挂载官方界面时，桌面端是先 `PlatformProvider`，再 `AppBaseProviders`，再 `AppInterface`（`packages/desktop/src/renderer/index.tsx` 第 427–434 行）。Web 入口同样顺序（`packages/app/src/entry.tsx` 第 164–173 行）。

### `AppBaseProviders` props

`packages/app/src/app.tsx` 第 393–397 行。

| Prop | 类型 / 作用 |
| --- | --- |
| `children` | `ParentProps` |
| `locale?` | `Locale`，交给 `LanguageProvider` |
| `onNativeTranslations?` | `LanguageProvider` 的同名回调。桌面用来 `window.api.setNativeTranslations`（renderer `index.tsx` 第 431 行） |

内部固定包一层：`MetaProvider`、`Font`、`ThemeProvider`（主题应用后可选调用 `window.api?.setTitlebar`，第 403–405 行）、`LanguageProvider`、`I18nProvider`、`ErrorBoundary`（`Sentry.captureException`，第 409–413 行）、`QueryClientProvider`、`WslServersProvider`、`DialogProvider`、`FileComponentProvider`。

### `AppInterface` props

`packages/app/src/app.tsx` 第 557–565 行。

| Prop | 必须 | 作用 |
| --- | --- | --- |
| `defaultServer` | 是 | `ServerConnection.Key`。`ServerProvider` 的初始/默认服务器 |
| `canonicalLocalServer?` | 否 | 传给 `ServerProvider`。Web 入口传入当前页面对应的本地 key（`entry.tsx` 第 170 行） |
| `servers?` | 否 | `ServerConnection.Any[]`。缺省时由 `ServerProvider` 自己的持久化列表决定（见 `context/server.tsx` 的 provider `init`） |
| `router?` | 否 | `Component<BaseRouterProps>`。缺省是 `@solidjs/router` 的 `Router`（浏览器历史）。桌面传入包了 `MemoryRouter` 的函数 |
| `disableHealthCheck?` | 否 | 传给 `ConnectionGate`。为真时启动健康检查直接当成功（`app.tsx` 第 438–440 行）。Web 入口传入 `true`（`entry.tsx` 第 172 行）。桌面**不传** |
| `startup?` | 否 | `Promise<void>`。健康检查通过后还要等这个 promise，期间全屏 Splash（第 459–469 行）。桌面把它绑到首次引导 |
| `serverScoped?` | 否 | 插在 `LayoutProvider` / `ModelsProvider` 之上（第 354–359、412–417 行）。桌面放 `DesktopFirstLaunchOnboarding` |
| `children?` | 否 | 放进共享 shell，桌面用来注册菜单触发器 `Inner` |

`ConnectionGate` **包不住** `GlobalProvider`。`AppInterface` 的树是 `ServerProvider` → `GlobalProvider` → `SettingsProvider` → `ConnectionGate`（第 579–611 行）。因此 `disableHealthCheck` 只关掉启动门上的那一次阻塞检查，关不掉 `GlobalProvider` 里的后台健康轮询和事件订阅（见网络路径）。

服务器身份（`packages/app/src/context/server.tsx` 第 224–234 行）：

- `type: "http"` → key 就是 `http.url`（例如 `http://127.0.0.1:4096`）
- `type: "sidecar"` 且 `variant: "base"` → key 为字面量 `"sidecar"`
- `variant: "wsl"` → `wsl:${distro}`
- `type: "ssh"` → `ssh:${host}`

`ServerConnection.local` 只把 sidecar base，以及 host 为 `localhost` / `127.0.0.1` 的 http，当成本地（第 36–39、241–242 行）。`::1` 不在这个判断里。

### 桌面如何挂载

`packages/desktop/src/renderer/index.tsx`：

- `DesktopMemoryRouter`（第 105–110 行）用 `createMemoryHistory()`。初始 URL 来自 `localStorage` 键 `opencode.desktop.window.${windowID}.last-active-url`（第 85–108 行），只接受以 `/` 开头且不以 `//` 开头的值，否则 `"/"`。历史变化写回同一键。
- `router` prop 把这个组件传进 `AppInterface`（第 353–355、407–420 行）。
- `platform.fetch` 是对全局 `fetch` 的薄包装：参数已是 `Request` 时只 `fetch(input)`，否则 `fetch(input, init)`（第 270–273 行）。它**不**把请求改道到主进程。
- 桌面同时提供 `storage`（`window.api.store*`）和 `draftStore`（`createDraftStore` + `window.api.draft*` / blob IPC）（第 139–164、228–235 行）。
- Web 入口 `packages/app/src/entry.tsx` **不**设置 `fetch`、`storage`、`updater`，`platform` 为 `"web"`，草稿用 `createBrowserDraftStore()`（IndexedDB），路由用默认浏览器 `Router`。

嵌入若要避免改浏览器地址栏，应像桌面一样传入 `MemoryRouter`，而不是依赖默认 `Router`。

### `Platform` 字段

定义在 `packages/app/src/context/platform.tsx` 第 31–134 行。`usePlatform()` 只返回 `PlatformProvider` 的 `value`（第 138–143 行）。`packages/app`、`packages/ui`、`packages/session-ui` 里，`usePlatform` 只出现在 `packages/app`。

| 字段 | 谁用（`packages/app`，测试除外） | 嵌入含义 |
| --- | --- | --- |
| `platform` + 桌面才有的 `openDirectoryPickerDialog` | 多处用 `platform.platform === "desktop"` 做分支 | `"web"` 没有目录选择器；官方目录 UI 会走别的分支或不可用 |
| `os?` | 桌面 renderer 按 UA 填写 | 可选 |
| `version?` | `highlights.tsx` 第 163、187、209 行；`settings.tsx` 布局升级比较 | 不填则发布说明请求不会发出（`highlights.tsx` 第 163、209 行先 return） |
| `openExternal` | 帮助、反馈、更新说明、终端链接、用量弹窗、Windows 菜单 | 必填。Web 实现是 `window.open`（`entry.tsx` 第 83–87 行）；桌面走 `window.api.openExternal` |
| `openPath?` | 会话头、项目、open-in-app | 仅桌面且本地服务器时展示 |
| `openLocalFile?` | `terminal.tsx` 第 385–386 行，`file:` 链接 | 只有终端挂上才走到 |
| `revealPath?` | `session.tsx` 第 1914 行，附件绝对路径 | 失败则退回 `<a download href=file.url>` |
| `restart` | 错误页按钮（`error.tsx` 第 299 行）。Web 实现是 `location.reload()`（`entry.tsx` 第 90–91 行） | 嵌入若实现成重载 webview，会丢掉内存态 |
| `notify` | `notification.tsx` 第 359、394 行；`layout.tsx` 第 449、455 行 | 桌面/Web 都在失焦时 `new Notification`，图标 URL 见网络表 |
| `openAttachmentPickerDialog?` | `prompt-input.tsx` 第 423 行；`prompt-input-v2.tsx` 第 366 行 | 没有则附件走浏览器文件输入 / 粘贴 |
| `getPathForFile?` | 两个 prompt-input | 桌面把选中文件映射回磁盘路径 |
| `saveFilePickerDialog?` | **app 源码中没有调用点**（仅类型与桌面实现） | 导出会话用的是 blob `<a download>`（`utils/session-export.ts` 第 50–59 行），不走这个对话框 |
| `storage?` | `utils/persist.ts` | 见存储一节。只有 `platform === "desktop"` 且提供了 `storage` 才不用 `localStorage` |
| `draftStore?` | `persist.ts` 中带 `draft: true` 的键；`prompt-input/attachments.ts` 第 155 行；`prompt-input-v2.tsx` 第 383 行 | 见草稿一节 |
| `windowID?` | `persist.ts` 第 530–536 行，窗口范围键 | 桌面用它隔离 tab 列表等 |
| `updater?` | `updater-action.ts`、设置页、错误页、`layout.tsx` / `layout-new.tsx` | 不提供则更新按钮禁用（`updater-action.ts` 对 `undefined` 的处理） |
| `fetch?` | 见下一节 | **普通 SDK 请求会用；SSE 多数情况不用** |
| `getDefaultServer?` / `setDefaultServer?` | `dialog-select-server.tsx`、`status-popover-body.tsx` | 桌面走 `window.api`；Web 走 `localStorage` 键 `opencode.settings.dat:defaultServerUrl`（`entry.tsx` 第 15、55–56 行） |
| `wslServers?` | `wsl/context.tsx`、设置与添加服务器对话框 | 不提供则 WSL UI 不订阅 |
| `getDisplayBackend?` / `setDisplayBackend?` | `settings-general.tsx` 第 142、192 行 | Linux 桌面显示后端 |
| `webviewZoom?` | `titlebar.tsx` 第 83 行；`terminal.tsx` 第 348 行 | 不提供则标题栏缩放按 1 |
| `windowFullscreen?` | `titlebar.tsx` 第 82 行 | 仅 macOS 交通灯布局 |
| `getPinchZoomEnabled?` / `setPinchZoomEnabled?` | `settings-general.tsx`、`settings-v2/general.tsx` | 桌面设置项 |
| `runDesktopMenuAction?` | `windows-app-menu.tsx` 第 36 行 | 不提供则菜单动作是空调用 |
| `checkAppExists?` | `open-in-app.tsx`、`session-header.tsx` | 仅桌面 “在应用中打开” |
| `readClipboardImage?` | 两个 prompt-input | 不提供则不能走桌面剪贴板图片；浏览器粘贴仍可能走 `ClipboardEvent` |
| `exportDebugLogs?` | `app.tsx` `DesktopCommands` 第 332–338 行；错误页 | 仅 `platform === "desktop"` 且函数存在时注册命令 |
| `setForceFocus?` | `debug-bar.tsx` | 调试条 |
| `recordFatalRendererError?` | `error.tsx` 第 233 行 | 可选 |

`usePlatform` 调用点（生产代码）：`app.tsx`、`server-sdk.tsx`、`server-health.ts`、`highlights.tsx`、`notification.tsx`、`layout.tsx`、`tabs.tsx`、`settings.tsx`、`persist.ts`、`wsl/*`，以及页面/组件里的外链、终端、附件、更新器、目录选择器。`packages/ui` 与 `packages/session-ui` 不读 Platform。

## 网络路径清单

### SDK 与 `platform.fetch`

`createSdkForServer`（`packages/app/src/utils/server.ts` 第 21–41 行）把 `fetch` 和 Basic `Authorization` 一并传给 `@opencode-ai/sdk/v2` 的 `createOpencodeClient`。`createApiForServer`（第 44–59 行）把同一个 `fetch` 和 Basic 头传给 `@opencode-ai/client` 的 `OpenCode.make`。

`createOpencodeClient`（`packages/sdk/js/src/v2/client.ts` 第 50–61 行）：**只有 `config.fetch` 为空**时才安装调用全局 `fetch` 的包装，并给请求对象写 `timeout = false`。传入 `platform.fetch` 时，hey-api 客户端用它（`packages/sdk/js/src/v2/gen/client/client.gen.ts` 第 38 行：`options.fetch ?? _config.fetch ?? globalThis.fetch`）。

`OpenCode.make`（`packages/client/src/generated/client.ts` 第 140–141 行）：`options.fetch ?? globalThis.fetch`。

`createServerSdkContextBase`（`packages/app/src/context/server-sdk.tsx` 第 336–368 行）把 **`platform.fetch`（可以是 `undefined`）** 传给普通 SDK / 当前 API / `createClient`。因此：

- 嵌入方设置了 `platform.fetch`：会话、文件、权限、模型、配置等 **非事件** HTTP 走该函数。Basic 头仍由 `server.ts` 根据 `http.password` 添加，不依赖 fetch 包装自己加头。
- 未设置：上述请求走全局 `fetch`。

协议探测 `detectServerProtocol`（`utils/server-protocol.ts` 第 13–34 行）用调用方传入的 fetch 直接 `GET`：

1. `/global/health`，JSON 且 `healthy === true` → `"v1"`
2. 否则 `/api/health`，有数字 `pid` → `"v2"`；或 `healthy === true` → `"v1"`
3. 否则默认 `"v2"`

`server-sdk.tsx` 第 208 行传入 `platform.fetch ?? globalThis.fetch`。服务器选择对话框同样（`dialog-select-server.tsx` 第 269、320 行）。

### SSE 是否走 `platform.fetch`

**不保证。本地回环和所有 https 的事件流不走 `platform.fetch`。**

订阅点只有一处：`packages/app/src/context/server-sdk.tsx` 第 275–279 行。

- 探测结果为 `"v1"`：`eventSdk.global.event()` → hey-api `sse.get`，URL **`/global/event`**（`packages/sdk/js/src/v2/gen/sdk.gen.ts` 第 1336–1340 行）。
- 否则：`eventApi.event.subscribe()` → effect 客户端 SSE，URL **`/api/event`**（`packages/client/src/generated/client.ts` 第 811–815 行）。

SDK 里还有但 **`packages/app` 没有调用** 的流：

- v1 `Event.subscribe`：`/event`（`sdk.gen.ts` 第 1409–1413 行）
- v2 `session.events`：`/api/session/{sessionID}/event`（第 5752–5773 行）
- v2 `Event2.subscribe`：同样是 `/api/event`（第 6555–6559 行），app 用的是 effect 客户端那条，不是这个类

没有 `new EventSource`（在 `packages/app`、`packages/ui`、`packages/session-ui` 的 ts/tsx 中无匹配）。SSE 是 `fetch` 读 body：

- v2 effect 客户端：`response.body.getReader()`（`packages/client/src/generated/client.ts` 第 192–203 行）
- v1 hey-api：`createSseClient` 里 `_fetch(request)`，`_fetch = options.fetch ?? globalThis.fetch`，再 `pipeThrough(TextDecoderStream)`（`packages/sdk/js/src/v2/gen/core/serverSentEvents.gen.ts` 第 126–135 行）。传入的是 `Request` 对象。

`eventFetch` 的选择（`server-sdk.tsx` 第 191–200 行）才是事件流用的 fetch：

```text
若没有 platform.fetch，或 URL 解析失败 → undefined
否则仅当 protocol === "http:" 且 hostname 不是 localhost / 127.0.0.1 / ::1
  → platform.fetch
其他情况（https、回环 http、函数提前 return）→ undefined
```

`undefined` 时：

- v1 `createOpencodeClient` 改用全局 `fetch`
- v2 `OpenCode.make` 使用 `globalThis.fetch`

失败日志把这两支标成 `"platform"` 与 `"webview"`（第 296–299 行）。源码没有注释说明为什么回环/https 要绕开 `platform.fetch`。

因此典型 sidecar `http://127.0.0.1:<port>` 或 `http://localhost:<port>`：**REST 可走宿主 `platform.fetch`，SSE 仍用 webview 自己的 `fetch`。** 认证头是 SDK 构造时写上的 Basic（`server.ts` 第 27–39、48–58 行），不靠 `platform.fetch` 注入。若宿主把密码只放进 fetch 包装、`http.password` 留空，则回环 SSE **不会**带上这层认证。

非回环的 `http:`（例如 `http://0.0.0.0`、局域网主机名）才会把 `platform.fetch` 用于 SSE。桌面包装对 `Request` 有特殊分支；宿主包装若只接受 `(string, RequestInit)` 或不把 `Request` 的 body/signal 读出来，这条支路会坏。`https:` 事件流始终用全局 `fetch`。

谁启动订阅：`GlobalProvider` 在 `ConnectionGate` **外面**（`app.tsx` 第 585–587 行）。它对 `server.list` 里每个连接 `ensureServerCtx`（`context/global.tsx` 第 57–60、110–111 行），`createServerSyncContext` 在 `onMount` 里无条件 `serverSDK.event.start()`（`context/server-sync.tsx` 第 633–646 行）。`start` 在已启动时直接返回（`server-sdk.tsx` 第 260–261 行），同一 server 不会叠两条循环，但 **列表里每个 server 各一条**。`pagehide` 停止、`pageshow` 且 `event.persisted` 时再 `start`（第 325–327、162–165 行）。重连间隔 250ms（第 220、308 行）。hey-api `createSseClient` 自己还有默认 3s 的重试循环（`serverSentEvents.gen.ts` 第 95–100 行）。两层重试同时存在；本次没有运行观察哪一层先返回。

`disableHealthCheck` 不参与 `event.start`。

### 健康检查

| 调用 | 文件 | fetch |
| --- | --- | --- |
| 启动门 `ConnectionGate` | `app.tsx` 第 430–448 行 | `useCheckServerHealth()`，即 `platform.fetch ?? globalThis.fetch`（`server-health.ts` 第 117–119 行）。`disableHealthCheck` 时跳过 |
| 后台轮询 | `global.tsx` 第 17–21 行调用 `useServerHealth(..., () => true)` | 同上。`server-health.ts` 第 115、164 行，间隔 10s。与启动门无关 |
| 单次检查顺序 | `checkServerHealth` 第 87–110 行 | 先 v2 `OpenCode.make(...).health.get`（`/api` 健康，effect 客户端），失败再 v1 `createSdkForServer().global.health()`（`/global/health`） |

缓存键含 url、username、password（第 26–27 行），750ms，且要求 fetch 函数引用相同。

### 绕过 `platform.fetch` 的其他网络

范围：`packages/app/src`、`packages/ui/src`、`packages/session-ui/src` 的非测试 ts/tsx。下表 “经 platform.fetch?” 指这条调用本身是否使用 `platform.fetch`。

| 路径 / 行为 | 文件 | 经 platform.fetch? | v0.1 处理建议 |
| --- | --- | --- | --- |
| REST：会话、文件、配置、权限、模型、PTY HTTP（create/update/connectToken）等 | `utils/server.ts`；`server-sdk.tsx` 第 336–368 行 | 设置了则是；否则全局 `fetch` | 保留。宿主 fetch 必须支持 body、头、状态码、二进制、`AbortSignal`。文件读取走这条，不走 `<img src=服务器>` |
| SSE `GET /global/event`（v1）或 `GET /api/event`（v2） | `server-sdk.tsx` 第 191–279 行 | **仅**非回环 `http:` | 不能假设替换 `platform.fetch` 就代理了事件。回环/https 要么允许 webview `connect-src` 直连并自带 SDK Basic 头，要么改上游让 `eventFetch` 始终用宿主 fetch。一条连接会在 `AppInterface` 挂上后为 **每个** `servers` 项启动 |
| 健康 `GET /api/health` 与 `/global/health` | `server-health.ts`、`server-protocol.ts` | 是（若设置了 `platform.fetch`） | 启动门可用 `disableHealthCheck` 关掉。`GlobalProvider` 的 10s 轮询仍会打。若不需要多服务器状态，不要往 `servers` 塞多余项 |
| `GET https://opencode.ai/changelog.json` | `context/highlights.tsx` 第 10、173–183 行 | `platform.fetch ?? fetch` | `SharedProviders` 始终挂 `HighlightsProvider`（`app.tsx` 第 319 行）。`version` 变化且发布说明开启时会请求。不传 `platform.version` 则函数早退 |
| `Notification` 图标 `https://opencode.ai/favicon-96x96-v3.png` | `entry.tsx` 第 71–73 行；桌面 `renderer/index.tsx` 第 258–260 行 | 否，浏览器通知实现自己取 | 嵌入自己的 `notify` 不要抄这个 URL；或不实现通知 |
| `<img src>` 项目头像 | `pages/layout/helpers.ts` 第 89–94 行 `getProjectAvatarSource` | 否 | 固定项目 id 使用 `https://opencode.ai/favicon.svg`。否则 `icon.override` 或服务端 `ProjectIcon.url`（`sdk` `ProjectIcon`，`types.gen.ts` 第 3170–3174 行）。若服务给出 http(s) URL，图片请求不经 `platform.fetch` |
| 用户附件 `<img src={file.url}>` 与 `<a href={file.url} download>` | `session-ui/.../message-part.tsx` 第 1282、1294 行；`session.tsx` 第 1905–1910 行 | 否 | v2 适配把 `source.type === "uri"` 的 URI 原样当作 `url`，否则 `data:${mime};base64,...`（`utils/session-message.ts` 第 216 行）。服务端多处把附件写成 `data:` URL（例如 `packages/opencode/src/session/prompt.ts` 第 767 行、`tool/read.ts` 第 321 行）。**若**某条消息的 `url` 是 http(s)，浏览器会直接请求。v0.1 要允许 `data:` / `blob:`，不要假设附件一定打到 OpenCode server |
| 评审里的图片/音频 | `session-ui/.../file-media.tsx` 第 67–120、231–232 行；`review-tab.tsx` 第 56–59 行、`review-panel-v2.tsx` 第 103–105 行 | 读文件走 SDK（因而可走 `platform.fetch`）；`<img>`/`<audio>` 用的是 `dataUrlFromMediaValue` 得到的 data URL | 保留这条，不要再指到服务器 URL |
| 草稿 `fetch(dataUrl)` / `fetch(blob:)` | `utils/draft-store.ts` 第 47、54、157 行 | 否 | 只解析 `data:` 与 `blob:`，不是 OpenCode server。宿主 `draftStore` 若自己存 blob，仍会走到这里 |
| WebSocket PTY | `components/terminal.tsx` 第 620–633 行；URL 在 `utils/terminal-websocket-url.ts` 第 15–34 行 | **否**。`new WebSocket`。v1 路径 `/pty/${id}/connect`，v2 `/api/pty/${id}/connect`，协议换成 `ws:`/`wss:` | **v0.1 禁用终端时不要挂载 `Terminal`。** 见下节。`@solid-primitives/websocket` 在 app 依赖里，但 `packages/app/src` 没有引用 |
| `window.open` | 仅 `entry.tsx` 第 87 行（`openExternal`） | 否 | 嵌入实现 `openExternal` 时不要用 `window.open` 打开任意服务器 URL；官方组件调用的是 `platform.openExternal` |
| 外链 `<a href target=_blank>` | `components/external-link.tsx` 第 11–15 行；设置/文档/Zen 等硬编码 `https://opencode.ai/...`、Discord、GitHub | 浏览器导航，不是 fetch | 保留为普通外链即可。它们不打 OpenCode server |
| `loadThemeFromUrl` 的 `fetch(url)` | `packages/ui/src/theme/loader.ts` 第 78–83 行 | 否 | `packages` 内只有定义和再导出（`ui/src/theme/index.ts` 第 36 行），没有调用方。嵌入不调用就不会请求 |
| UI 包构建时拉取 `https://models.opencode.ai`（或 `OPENCODE_MODELS_URL`） | `packages/ui/vite.config.ts` 第 47–57 行 | 否，且不在 app/desktop 渲染配置里 | **不是**嵌入入口插件。图标精灵已经在 `packages/ui/src`。不要把这段 `buildStart` 放进 webview 构建 |
| Sentry | 桌面/Web **入口**在 `VITE_SENTRY_DSN` 时 `Sentry.init`（renderer `index.tsx` 第 40 行，`entry.tsx` 第 133 行）。`AppInterface` 只在错误边界 `captureException` | 否 | 嵌入入口不初始化即不上报。错误边界仍 import `@sentry/solid` |
| Markdown / diff Worker | 见构建一节 | 不是 OpenCode HTTP。Worker 脚本是打包 URL | 对话和 diff 会创建 Worker。CSP 必须允许，否则这些功能在源码里会抛/标记不可用（`markdown-worker.ts` 第 116–123 行） |
| `ghostty-web` 动态 `import()` | `terminal.tsx` 第 35–38、392–394 行，仅 `Terminal` 的 `onMount` | 模块加载，不是 server API | 不挂载 `Terminal` 则这条动态 import 不会从这里触发 |
| Storybook `fetch("/__playground/apply-css")` | `session-ui/.../timeline-playground.stories.tsx` | 否 | 故事文件，嵌入不要打进去 |

`packages/ui/src` 与 `packages/session-ui/src` 没有 `new WebSocket`、`EventSource`、`XMLHttpRequest`、`sendBeacon`。

### 终端：禁用后还会不会连上

WebSocket **只**在 `Terminal` 组件跑到 `open()` 时创建（`terminal.tsx` 第 607–633 行）。创建前会先 `connectToken()`：v1 调 SDK `pty.connectToken`（HTTP，可走 `platform.fetch`）；v2 的 `api.pty.connectToken` 在源码里被注释掉（第 579–586 行），所以 v2 可能在没有 ticket 的情况下仍 `new WebSocket`。

`Terminal` 的挂载条件：

- 旧布局：`SessionPage` 总是渲染 `TerminalPanel`（`session.tsx` 第 2386–2388 行），但其中的 `<Terminal>` 仅当 `opened() && terminal.active()`（`terminal-panel.tsx` 第 298–305 行）。
- 新布局：`TerminalPanelV2` 只在 `terminalOpen()` 时渲染（`session.tsx` 第 2371–2378 行），内部同样要打开才挂 `Terminal`。
- 面板从关到开、且当前目录还没有 PTY 时，会 `terminal.new()`（`terminal-panel.tsx` 第 64–72 行）。`new()` 先 HTTP `pty.create`（`context/terminal.tsx` 第 324–332 行），成功后列表里出现 id，面板再挂 `Terminal` 并打开 WebSocket。
- 草稿页明确不包 `TerminalProvider`（`app.tsx` 第 381–390 行）。

`terminal.opened` 的默认值是 `false`（`context/layout.tsx` 第 280–283、820 行），存在 **服务器范围** 的 layout 存储里，不是按会话。PTY 列表存在 **目录** 存储 `terminal` 键（`context/terminal.tsx` 第 116–118、466 行，目录参数是 `base64Encode(sdk().directory)`）。因此：

- 干净存储、用户没打开终端：官方会话页不会建立 WebSocket，也不会动态加载 ghostty。
- 只 CSS 隐藏、但持久化 `opened === true` 且列表里有 PTY：一进会话页就会连 WebSocket。
- v0.1 要禁用终端，必须保证不挂载 `<Terminal>`（不要渲染官方会话页里的终端面板，或强制 `opened` 为 false 且不要调用 `terminal.new` / 终端命令）。只从产品文案里拿掉入口不够。

同一源码里，`location.origin` 与服务器 origin 不同时，v1 WebSocket 会把 Basic 材料放进查询参数 `auth_token`（`terminal-websocket-url.ts` 第 28–33 行；`sameOrigin` 在 `terminal.tsx` 第 186 行）。VS Code webview 的 origin 不是服务器，一旦连上就会把凭证放进 URL。这是禁用终端的另一个理由。

## 路由

路由表在 `packages/app/src/app.tsx` `Routes`（第 615–645 行）。

始终注册：

| 路径 | 组件 | 备注 |
| --- | --- | --- |
| `/:dir` | `DirectoryLayout` | 再嵌 `Navigate` 到 `session`，以及 `/session/:id?` → `SessionRoute` |
| `/new-session` | `DraftRoute` | 查询参数 `draftId` |

仅当 `settings.general.newLayoutDesigns()` 为假：

| 路径 | 组件 |
| --- | --- |
| `/` | `LegacyHome` |
| `/server/:serverKey/session/:id` | `LegacyTargetSessionRoute`（解析目录后 `replace` 到旧的目录 URL） |

仅当新布局为真：

| 路径 | 组件 |
| --- | --- |
| `/` | `NewHome` |
| `/:dir/session/:id` | `NewLayoutLegacySessionRedirect` → `sessionHref` |
| `/server/:serverKey/session/:id` | `TargetSessionRoute` |

新布局开关：`settings.tsx` 第 60–63、263–277 行。`oldInterfaceSunset = new Date(2026, 8, 14)`（本地日历 2026-09-14）。`oldInterfaceRetired` 的初值是 `Date.now() >= sunset`。调查日 2026-09-29 晚于该常量；若运行时系统时间同样晚于它，这段初始化会把旧界面视为已退役，`newLayoutDesigns()` 走新布局，并且 `setNewLayoutDesigns` 不能再关回去（第 432–434 行）。这是对日期常量的推演，不是运行结果。`VITE_OPENCODE_CHANNEL !== "prod"` 时，未就绪/未分类的默认值偏向新布局（第 60 行）。

### 目录与会话 URL 怎么编码

编码是 URL-safe Base64，不是查询参数里的 `encodeURIComponent(路径)`：

- `packages/core/src/util/encode.ts` 第 1–10 行：UTF-8 → `btoa` → `+`/`/` 换成 `-`/`_`，去掉 `=`。
- `packages/app/src/utils/base64.ts` 的 `decode64` 调用 `base64Decode`，失败返回 `undefined`。
- 旧目录路由：`/:dir` 用 `decodeDirectory`（`pages/directory-layout.tsx` 第 80–84、92–95 行）。解不开就 toast 并 `navigate("/", { replace: true })`。
- 新布局单会话：`sessionHref` = `` `/server/${base64Encode(server)}/session/${sessionID}` ``（`utils/session-route.ts` 第 5–7 行）。`server` 是 `ServerConnection.Key`。http 服务器的 key 就是 URL 字符串，所以先编码的是 `http://127.0.0.1:4096` 这种字符串，不是项目目录。
- `requireServerKey`（第 13–16 行）要求 `decode64` 成功且再编码与 path 段完全一致，否则抛 `Invalid server route`。
- 旧单会话：`legacySessionHref` = `` `/${base64Encode(directory)}/session/${sessionID}` ``（第 9–11 行）。目录是文件系统路径。`SessionRoute` 在新布局且带 id 时会再跳到 `sessionHref`（`app.tsx` 第 82–88 行）。
- 新会话草稿：`/new-session?draftId=${encodeURIComponent(draftID)}`（`context/tabs.tsx` 第 42 行）。没有目录段。

新布局会话页的目录不在 URL 里。`TargetSessionRouteContent` 从 `serverSync().session.lineage` 取 `session.directory`（`session.tsx` 第 159–163、246–276 行）。目录未知时不挂 `SDKProvider` / `SessionPage`（因而也不挂终端）。进入该路由还会 `tabs.addSessionTab`（第 258–264 行）。

桌面 `MemoryRouter` 见上。它持久化的是整条内存 URL，所以上次停在某个 `/server/.../session/...` 时，下次窗口会直接回到那里。嵌入若复制 `DesktopMemoryRouter`，会继承这个行为，并且它写的是 **webview `localStorage`**，不是 `Platform.storage`。

## 功能保留 / 宿主接管 / 禁用

这是按源码边界给 v0.1 嵌入的分类，不是 ADR。

| 功能 | 分类 | 原因 |
| --- | --- | --- |
| 会话消息、流式事件、提问、取消、权限、模型/Agent 选择、文件读取与 diff 展示 | 保留 | 走 SDK + 全局 SSE。取消依赖 `AbortSignal` 传到 fetch（effect/hey-api 都把 signal 放进请求） |
| `platform.fetch` 覆盖的 HTTP | 宿主接管 | 普通 API 与健康检查会调用它。必须能流式读 body，不能缓冲到结束 |
| 回环 / https 的 SSE | 宿主接管或显式允许直连 | **不经过 `platform.fetch`**。见上。P0 若每块面板一个 `AppInterface`，每块都会为 `servers` 中每个服务器拉一条全局 SSE |
| 单会话路由 | 宿主接管 | 用 `MemoryRouter` 把初始 URL 设为 `sessionHref`。官方 `AppInterface` 仍会注册主页、草稿、目录路由，并在打开会话时写 tab 存储 |
| 多标签、服务器切换、主页、命令面板里的导航命令 | 禁用或由宿主换掉 | 源码没有“单会话模式” prop。只藏 DOM 时，`document` 捕获快捷键和 `navigate` 仍在 |
| 终端 / PTY / WebSocket / ghostty | 禁用 | v0.1 不挂载 `Terminal`。见终端一节。保留时 WebSocket 必须单独实现，fetch 替换覆盖不了 |
| 启动健康门 | 可关 | `disableHealthCheck`。后台 10s 轮询仍在 |
| 草稿、设置、layout、通知列表 | 宿主接管存储 | 见下节。不提供 `storage`/`draftStore` 且 `platform === "web"` 时落到 webview `localStorage` / IndexedDB，origin 不稳定 |
| 系统通知与提示音 | 宿主接管或关掉默认值 | 默认声音和 agent 通知是开的（`settings.tsx` 第 209–220 行）。`notify` 与 `new Audio` 都在官方树里 |
| 自动更新 | 禁用 | 不传 `platform.updater` |
| WSL、SSH 桌面、目录选择器、原生打开文件、缩放、全屏 | 禁用 | 依赖桌面 Platform 字段。`"web"` 没有 `openDirectoryPickerDialog` |
| 发布说明、Sentry、桌面菜单、`window.api.setTitlebar` | 禁用 | 不传 `version`、不初始化 Sentry、不提供 `window.api` 则这些副作用不起或 no-op |
| Markdown / diff Worker | 保留，但构建和 CSP 要接住 | 聊天渲染会 `new Worker`。失败时 markdown worker 会把错误记成不可用 |

## 构建：嵌入入口要的插件和别名

桌面渲染进程没有自己的别名表。`packages/desktop/electron.vite.config.ts` 第 93–105 行只给 renderer：

- 插件：`@opencode-ai/app/vite` 的默认导出，外加 **可选** `@sentry/vite-plugin`（同时有 `SENTRY_AUTH_TOKEN`、`SENTRY_ORG`、`SENTRY_PROJECT` 才加入，第 17–32、94 行）
- `publicDir`: 相对桌面包是 `../../../app/public`，即 `packages/app/public`
- `root`: `src/renderer`
- `build.sourcemap: true`
- Rollup 输入：`src/renderer/index.html`（里面有主题预加载 script 与 `./index.tsx`）
- **没有** `optimizeDeps`、**没有** renderer 自己的 `resolve.alias` / `define`

`packages/app/vite.js` 默认导出的数组才是渲染/app 构建的实质配置（第 18–48 行）：

1. 内联插件 `opencode-desktop:config`
   - 别名：`@` → `packages/app/src`（`fileURLToPath(new URL("./src", import.meta.url))`）
   - `define`：`import.meta.env.VITE_OPENCODE_CHANNEL` 为 `dev` / `beta` / `prod`（环境变量 `OPENCODE_CHANNEL`；`latest` 当成 `prod`；缺省 `dev`）
   - `worker.format: "es"`
2. 内联插件 `opencode-desktop:theme-preload`：把 `packages/app/public/oc-theme-preload.js` 内联进 `#oc-theme-preload-script`。HTML 里没有这个标签则替换不发生
3. `@tailwindcss/vite`（`tailwindcss()`）
4. `vite-plugin-solid`（`solidPlugin()`，无额外选项）

`packages/app/vite.config.ts` 第 22–27 行在上述插件之外再加可选 Sentry，并把 dev server 设为 `0.0.0.0:3000`。嵌入入口对齐桌面渲染时，**需要的插件就是 `vite.js` 那四项；Sentry 不是功能所必需**。

不要放进嵌入构建的桌面 **main** 插件（同文件第 56–79 行）：`opencode:node-pty-narrower`、`opencode:virtual-server-module`、`opencode:copy-server-assets`（复制 `packages/opencode/dist/node` 里的 `.wasm`）。那些服务 sidecar，不是 webview。

`packages/ui/vite.config.ts` 的 `vite-plugin-solid`、`vite-plugin-icons-spritesheet`、以及构建时请求 models.dev 图标的 `provider-icons-plugin`，是 UI 包自己的 `dev`/`build`，不是 app/desktop renderer 的插件列表。

Worker / wasm / 动态加载（grep `new Worker`、`?worker`、`.wasm`、`import.meta.url`，范围 app、ui、session-ui 源码）：

| 位置 | 行为 |
| --- | --- |
| `packages/session-ui/src/components/markdown-worker.ts` 第 1、116–120 行 | `import ...?worker&url`，首次 `parseMarkdown` / highlight 时 `new Worker(..., { type: "module" })`。聊天 markdown 会走到 |
| `packages/session-ui/src/pierre/worker.ts` 第 2、9–10、27 行 | `@pierre/diffs/worker/worker.js?worker&url`，池大小 2，`preferredHighlighter: "shiki-wasm"`。`file.tsx`、`session-review-v2.tsx` 调用 `getWorkerPool`。本仓库这几个包的源码没有直接 `import` 某个 `.wasm` 文件；wasm 是否再由 `@pierre/diffs` 加载，不在本次已读源码里 |
| `packages/app/src/utils/sound.ts` 第 6–8 行 | `import.meta.glob("../../../ui/src/assets/audio/*.aac")`。提示音依赖 Vite 处理这个 glob |
| `packages/app/src/components/terminal.tsx` 第 37 行 | `import("ghostty-web")`，仅终端挂载 |
| `packages/app/vite.js` 第 6、25 行 | `import.meta.url` 只用于解析别名和主题脚本路径 |

`packages/ui/src` 没有 `new Worker` / `?worker` / `.wasm`。

嵌入入口因此至少要：Solid 插件、Tailwind v4 插件、`@` 别名、`VITE_OPENCODE_CHANNEL` define、`worker.format = "es"`，以及能解析 `?worker&url` 和 `import.meta.glob` 的 Vite。主题预加载只在沿用官方 `index.html` 时需要。公开目录要用 `packages/app/public`（字体、favicon、`oc-theme-preload.js`）。

## 存储与草稿

### 两套后端

`persisted()`（`packages/app/src/utils/persist.ts` 第 568–593 行）：

- 目标带 `draft: true` 且存在 `platform.draftStore`：读写 draft store，键为 `` `${storage ?? "default"}:${key}` ``。
- 否则若 `platform === "desktop"` 且有 `platform.storage`：按 storage 文件名调用该函数（桌面是 `window.api.store*`）。
- 否则：无 `storage` 时直接 `localStorage`；有 `storage` 时键前缀为 `` `${storage}:${key}` ``。

Web 入口不提供 `storage`，所以设置等走 webview `localStorage`。桌面 renderer 另有一处 **不经 Platform** 的 `localStorage`：窗口最后 URL（见路由）。

存储名（第 27–29、349–364、491–527 行）：

| 帮助器 | 文件名 / 键 |
| --- | --- |
| `Persist.global` | 文件 `opencode.global.dat` |
| `Persist.window` | `opencode.window.${windowID}.dat`；非桌面或没有 windowID 时退回 global（第 530–536 行） |
| `Persist.draft(draftID, key)` | 文件 `opencode.draft.${id前12位}.${checksum}.dat`，键 `draft:${key}` |
| `Persist.workspace` / `serverWorkspace` | `opencode.workspace.${path前12位}.${checksum}.dat`，键 `workspace:${key}`。非 local scope 时把 scope 编进路径再 checksum |
| `Persist.session` / `serverSession` | 同一 workspace 文件，键 `session:${sessionId}:${key}` |
| 无前缀的 `persisted("settings.v3")` 等 | Web 上就是 `localStorage["settings.v3"]` |

`settings.tsx` 第 233 行把整份设置存在 `"settings.v3"`。声音、通知、`newLayoutDesigns` 都在这里。`tabs.tsx` 第 60–69 行把标签、最近、标题、关闭栈放在 `Persist.window("tabs" | "tabs.recent" | "tabs.info" | "tabs.closed")`。

写 `localStorage` 失败且像配额错误时，`persist.ts` 会删掉其他 `opencode.` 前缀项再重试（第 112–140 行）。嵌入若共用一个 origin，这份驱逐会影响别的面板。

主题预加载脚本另用裸键 `opencode-theme-id`、`opencode-theme-css-light`、`opencode-theme-css-dark`（`theme-preload.test.ts` 第 23–25 行所断言的脚本行为）。那是 HTML 里的预加载，不是 `persisted()`。

### 草稿如何按会话分开

`PromptScope`（`context/prompt-state.ts` 第 65 行）：`{ draftID }` 或 `{ dir, id? }`。

`promptTarget`（第 172–176 行）：

- 有 `draftID`：`Persist.prompt(Persist.draft(draftID, "prompt"))` → draft store 键  
  `opencode.draft.${head}.${checksum}.dat:draft:prompt`
- 否则：`Persist.prompt(Persist.serverScoped(scope, dir, id, "prompt", [legacy]))`  
  legacy 字符串是 `` `${dir}/prompt/${id}.v2` `` 或 `` `${dir}/prompt.v2` ``

`Persist.prompt` 把 `draft: true` 设上（`persist.ts` 第 525–527 行），所以 **只要平台提供了 `draftStore`，会话草稿和新建草稿都进 draft store**，不进普通 settings 文件。没有 `draftStore` 时，同样的目标落到 `localStorage` 前缀或桌面 `storage`。

调用方传入的 `dir` **已经是目录的 base64**，不是原始路径：`context/prompt.tsx` 第 105–106 行 `dir: base64Encode(sdk().directory)`，无 id 则只有目录（旧的“新建会话”页）。注释和文件视图同样用 base64 目录作 scope（`comments.tsx` 第 242 行；文件视图缓存按 `dir\nid` 拆键，`file/view-cache.ts` 第 123–130 行）。终端 PTY 列表也用 base64 目录，但是 workspace 级，不按 session id（`terminal.tsx` 第 466 行）。

新建草稿 id：`tabs.newDraft` 用 `uuid()`（`tabs.tsx` 第 209–211 行），路由 `/new-session?draftId=`。关闭草稿时删 `draftPersistedKeys()`：`prompt`、`comments`、`file-view`、`layout`（`persist.ts` 第 475–478 行；`tabs.tsx` 第 103–107 行）。只有 `prompt` 那条会再包一层 `Persist.prompt`（因而走 draft store）。

新布局下，若当前 scope 对得上一个 tab，`prompt.tsx` 第 107–109 行优先用 tab 内存里的 `createTabPromptSession`，而不是无 tab 的 cache。同一 `draftID` 或同一 `(base64(dir), sessionId)` 才共享一份。不同会话的 `id` 不同，键就不同。

图片 blob：`createDraftStore`（`utils/draft-store.ts` 第 36–94 行）把附件里的 `data:` 收成 driver 的 blob id，读回时 `URL.createObjectURL`。浏览器 driver 是 IndexedDB `opencode-drafts` 的 `documents` / `blobs`（第 97–153 行）。桌面 driver 是主进程 draft IPC，不使用这份 IndexedDB。blob id 是内容 SHA-256，不是会话 id；隔离靠草稿文档的键，不靠 blob 库分会话。

提示历史是全局的，不按会话：`prompt-input/history-store.ts` 使用 `Persist.prompt(Persist.global("prompt-history"))` 与 shell 变体。

## 全局行为

没有 `beforeunload`（在 `vendor/opencode/packages` 的 ts/tsx/js/html 中无匹配）。相关的全局行为：

| 行为 | 位置 | 嵌入影响 |
| --- | --- | --- |
| `document` `keydown` 捕获 | `context/command.tsx` 第 397–423 行。`CommandProvider` 在共享 shell，所有路由都在（`app.tsx` 第 317–318 行） | webview 有焦点时，命令快捷键 `preventDefault` + `stopPropagation`。可编辑控件里仍放行一部分（第 406–407 行）。会和 VS Code 快捷键抢 |
| `document` `keydown`（冒泡） | `session.tsx` 第 1046–1082、2001–2002 行 | 会话页把单个可打印字符重定向到输入框并聚焦。不在捕获阶段 |
| 其他 `keydown` | `file-tabs.tsx`、`prompt-project-selector.tsx`、`settings-keybinds.tsx`、`dialog-select-model-unpaid-v2.tsx` | 面板或对话框打开时才有 |
| `pagehide` / `pageshow` | 事件流停止/恢复（`server-sdk.tsx` 第 325–327 行）；layout flush（`layout.tsx` 第 428 行） | webview 隐藏/bfcache 是否派发这些事件，源码不能证明 |
| `history.replaceState` | 仅 Web 入口去掉查询参数 `auth_token`（`entry.tsx` 第 112–116 行） | 使用 `MemoryRouter` 的桌面路径不跑这段。默认 `Router` 会占用浏览器历史 |
| `navigate` / 内存历史 | 全应用。桌面把每条 URL 写入 `localStorage` | 见路由 |
| `location.reload` | Web `restart`；切换 `newLayoutDesigns` 时 `setTimeout` 重载（`settings.tsx` 第 436 行） | 设置里一切布局会重载整个 webview |
| 通知 | 默认 agent 通知开、错误通知关（`settings.tsx` 第 209–212 行）。`platform.notify` 在桌面/Web 都会 `new Notification`，且页面可见并聚焦时直接 return | 嵌入应换成 VS Code 通知，或把设置默认改掉。官方 `notify` 的点击回调会 `navigate` 到 **旧的目录 URL**（`notification.tsx` 第 357–360 行），新布局下还会再被重定向 |
| 声音 | `utils/sound.ts` 第 89–93 行 `new Audio(src).play()`。权限/完成/错误在 `layout.tsx`、`notification.tsx`、设置预览里调用。默认开 | 不静音就会响。资源来自 UI 包的 `.aac` glob |
| 更新器 | 只有 `platform.updater` 存在才有检查/安装。桌面订阅 `window.api.updater` | 不实现即禁用 |
| 深链 | 桌面 renderer 把 URL 派发成 `window` 事件 `opencode:deep-link`（`index.tsx` 第 66–82 行）。`layout.tsx` 第 1281 行监听 | 不接 `window.api.onDeepLink` 就不会从桌面进来。事件名仍在 |
| 主题写 `document.body` | `app.tsx` `BodyDesignClass` 第 297–305 行；`ThemeProvider` 调 `window.api?.setTitlebar` | 会改 webview document 的 class/属性。没有 `window.api` 时标题栏调用被可选链吃掉 |
| Query | `refetchOnWindowFocus/Reconnect/Mount` 都是 false（`app.tsx` 第 282–288 行，`global.tsx` 第 101–108 行） | 不会因为窗口焦点自己重拉 |

## 许可证与 `package.json` 的 `private` / `exports`

根 `LICENSE`（以及 `packages/ui/LICENSE`，正文相同）：MIT，Copyright (c) 2025 opencode。条件是复制品或实质部分保留版权声明和许可声明。

| 包 | `private` | `license` | `exports` 要点 |
| --- | --- | --- | --- |
| 仓库根 `package.json` | `true` | 无字段；以根 `LICENSE` 为准 | 无库导出。workspaces 含 `packages/*`、`packages/sdk/js` 等 |
| `packages/app/package.json` | **无 `private` 字段** | `"MIT"` | `"."` → `./src/index.ts`；另有 `./desktop-menu`、`./i18n/desktop-native`、`./updater`、`./wsl/types`、`./vite` → `./vite.js`、`./index.css`。导出的是 TypeScript 源码，不是 `dist` |
| `packages/ui/package.json` | **无 `private`**。`publishConfig.access` 为 `"public"` | `"MIT"` | `"./*"` → `./src/components/*.tsx`，以及 `./context`、`./theme`、`./styles`、`./audio/*`、`./fonts/*`、`./v2/*` 等（第 35–57 行）。同样是源码 |
| `packages/session-ui/package.json` | **`"private": true`** | `"MIT"` | `"./*"` → `./src/components/*.tsx`；另有 `./pierre`、`./context`、`./styles`、`./v2/*`、prompt-input 子路径（第 6–26 行） |

三份 `exports` 都指向源码。嵌入构建是在消费这些源文件（以及 app 对 `@opencode-ai/sdk`、ui、session-ui、client tarball 的依赖），不是消费已发布的 JS 构建产物。`session-ui` 标了 private，不能当成可单独发布的 npm 包；app 与 ui 没有 `private: true`。无论 private 与否，MIT 声明都要留在复制出来的实质部分里。

## 结论与风险

1. **SSE 不总是走 `platform.fetch`。** 只有非回环的 `http:` 才走。`http://127.0.0.1`、`http://localhost`、`http://[::1]` 以及全部 `https:` 使用 webview 全局 `fetch` 读 `/global/event`（v1）或 `/api/event`（v2）。没有 `EventSource`。普通 REST 和健康检查在设置了 `platform.fetch` 时会走它。认证头由 SDK 按 `http.password` 添加；只在 fetch 包装里加认证，回环 SSE 拿不到。
2. **绕过 `platform.fetch` 的请求：** 上述 SSE；PTY WebSocket（及 v1 查询串 `auth_token`）；`fetch(data:)` / `fetch(blob:)`；`<img>`/`<audio>`/`<a href>` 上的 `data:`、`blob:`、项目图标 URL、可能出现的附件 `uri`；`https://opencode.ai/changelog.json` 与通知图标；外链页面；Worker 脚本 URL。文件内容本身是 SDK `file.read`，再变成 data URL 才进 `<img>`。
3. **嵌入 Vite 插件：** `vite-plugin-solid`、`@tailwindcss/vite`、内联 `opencode-desktop:config`（别名 `@` → `packages/app/src`，define `import.meta.env.VITE_OPENCODE_CHANNEL`，`worker.format: "es"`）、内联 `opencode-desktop:theme-preload`（仅官方 HTML 需要）。Sentry 插件可选。不要把 UI 包的 icons spritesheet / models.dev 下载，或 Electron main 的 pty/wasm 复制插件，算进 webview 入口。
4. **终端：** 干净存储下官方会话页默认 `terminal.opened === false`，不会建 WebSocket。持久化把面板打开后就会连，且 CSS 隐藏无效。v0.1 应不挂载 `Terminal`。草稿路由本身不含 `TerminalProvider`。
5. **挂上完整 `AppInterface` 就会为每个 server 启动全局 SSE 和 10 秒健康轮询**，不等进入会话路由，`disableHealthCheck` 也关不掉。多面板各挂一个 App 就是多条订阅。源码没有按会话订阅 `/api/session/{id}/event` 的调用。
6. **单会话 URL（新布局）：** `/server/${base64url(serverKey)}/session/${sessionID}`。旧布局：`/${base64url(directory)}/session/${sessionID}`。编码是无填充的 URL-safe Base64。sunset 常量是 2026-09-14；调查日已过该日，按源码分支新布局会成为默认。桌面用 `MemoryRouter`，并另把最后 URL 存进 `localStorage`。
7. **存储：** 桌面把 `persisted` 交给 `Platform.storage`，带 `draft: true` 的提示草稿交给 `Platform.draftStore`。Web 用 `localStorage` 与 IndexedDB `opencode-drafts`。会话草稿键含 base64(目录) 和 session id，或独立 `draftID`。提示历史与 layout 里的终端开关不是按会话隔离的。
8. **全局快捷键、可打印键抢焦点、布局切换重载、通知、声音**在官方树上是活的。没有 `beforeunload`。更新器只在传入 `platform.updater` 时活动。
9. **许可证：** 根与 ui/session-ui/app 均为 MIT（2025 opencode）。复制实质部分需保留版权与许可声明。`session-ui` 为 `private`；`app` 与 `ui` 不是。三者 `exports` 指向源码。
10. **未在本次源码里闭合的点：** `@pierre/diffs` 的 wasm 是否再发网络请求；VS Code webview 是否派发 `pagehide`；hey-api SSE 内层重试与 `server-sdk` 外层 250ms 重试哪一个先观察到；`ProjectIcon.url` 在真实服务上是不是 http URL。这些都不把“有接口”写成“已经在 webview 里跑通”。
