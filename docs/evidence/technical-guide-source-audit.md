# 技术手册源码事实（2026-10-01）

范围：当前工作区里面向初学者手册需要的**实现事实**。只读了点名的扩展宿主、聊天 webview、契约。不是 ADR 目标，也不是 STATUS 里的验收叙事。未跑 E2E，未改产品代码。

**工作区脏文件（另一会话正在改会话列表，不当稳定基线）：**

- 已修改未提交：`apps/extension/src/session-feed.ts`（+57/−若干）、`session-store.ts`（+17）、`sessions-view.ts`（+175）。`git diff --stat` 合计约 +198/−51。
- 未跟踪：`apps/extension/src/session-groups.ts`。
- 下面凡是会话列表分页、`mergeRoots`、`loadMore`、分组，都标「工作区，未提交」。手册不要写成已发布行为。
- `packages/contracts/src/sessions.ts`、面板/桥/托管/开文件策略这次 `git status` 未显示为已改。

行号是本次阅读时的工作区行号。脏文件提交后行号会漂。

---

## 1. 运行时：不是 iframe，是把上游 App 源码打进 webview 再挂上

初学者可以把它想成：VS Code 给扩展一块自带网页的标签（webview）。oco 不在这块网页里再套一层 iframe 去打开 OpenCode 网站，而是把**已经编译好的官方 App**和一层很薄的 oco 壳放进同一张页面，由 Solid 直接 `render` 到 `#root`。

证据：

- `apps/extension/src` 内对 `iframe` 无匹配。唯一接近的句子在 `apps/chat-webview/src/app.tsx:82-84`：普通 `location.reload()` 会让 VS Code webview 变空白，因为「它的内层框没有可重新加载的 URL」。这里的框是 VS Code 自己的 webview，不是 oco 嵌的 iframe。恢复方式是宿主重写 `panel.webview.html`（`panels.ts:292-297`）。
- 开面板：`panels.ts:113-120` `createWebviewPanel`，`enableScripts: true`，`retainContextWhenHidden: true`，`localResourceRoots` 只到扩展的 `media`。
- 页面正文来自打包后的 `media/chat/index.html`（`panels.ts:310-340`），再注入 CSP、`<base>`、nonce 和一段 shim（`panels.ts:345-388`）。
- 挂载官方 UI：`apps/chat-webview/src/app.tsx:1-3, 11-17, 72-105, 176-187`。从 `@opencode-ai/app` 引入 `AppBaseProviders` / `AppInterface` / `PlatformProvider`，`render(...)` 到 `#root`。`platform.embedded = true`，`platform.fetch = bridgeFetch`，`platform.platform = "web"`。注释写明模仿 `vendor/opencode/packages/desktop/src/renderer/index.tsx`，但换了 VS Code 的 Platform。本轮没有打开 vendor 源码核对那一行。
- 路由是内存路由 `MemoryRouter`（`app.tsx:108-141`），不是浏览器地址栏。页面自己不能改会话；只有宿主消息 `navigate` 能换（`app.tsx:9, 206-217`；契约 `packages/contracts/src/bridge.ts:102-104`）。

Remote 上的「打包挂载」多一步，仍然不是 iframe：

- `app-loader.ts:4-10, 15-36`：构建旁路放着 `app-*.js.gz`。Remote（或 `OCO_PACKED_APP=1`）时 `panels.ts:332-340` 用 `findPackedApp` + `loaderScript` 替换入口 script。页面 `fetch` 这个 `.gz`，`DecompressionStream` 解开，用 **import map + blob URL** 交给模块图。`import.meta.url` 和相对动态 import 被改回资源原点，懒加载块和 worker 仍从资源通道拿。失败则退回普通入口 script。
- 本机没有 `vscode.env.remoteName` 时不走这条，注释写资源通道相当于读盘（`panels.ts:332`）。

限制：

- 官方 App 是编译进扩展媒体目录的一份，不是运行时去拉上游网站。
- `disableHealthCheck={false}`（`app.tsx:181`）。官方健康检查闪屏仍会跑；STATUS 里「闪屏在骨架下面」是历史观察，不是本文件从源码推出的时序保证。
- WebSocket 被 shim 换成一构造就抛错的类（`panels.ts:344, 383`）。注释：唯一用户是终端，v0.1 不支持。
- Worker 不能直接用资源原点 URL 启动（注释 `panels.ts:341-343`）。shim 把 worker 换成 blob 引导脚本，主线程把脚本文本再送进去。worker 只能再要 `shiki-langs/<名>.json`（`panels.ts:374`）。

---

## 2. 消息桥：虚拟源点，按「文档代」隔离

初学者：网页里的官方 App 以为自己在访问 `http://oco.bridge`。这是由 bridgeFetch 接管的虚拟源，不是需要部署或解析的服务器；若绕过接管，CSP 应阻止业务直连。扩展宿主收 `postMessage`，检查允许之后，才用自己保管的账号去访问真实 OpenCode。

契约 `packages/contracts/src/bridge.ts`：

- 协议版本 `PROTOCOL_VERSION = 2`（第 9 行）。
- `BRIDGE_ORIGIN = "http://oco.bridge"`（第 14 行）。注释 11-13 行：必须是**非回环的 http**，官方 App 才会把 SSE 走 `platform.fetch`，并指向 `vendor/opencode/packages/app/src/context/server-sdk.tsx:191-199`。本轮未打开该 vendor 文件，手册应写成「契约注释如此声称」。
- 网页 → 宿主：`hello`、`fetch.request`、`fetch.abort`、`store.op`、`blob.op`、`ui`、`draft.ack`、`ready`（第 55-79 行）。
- 宿主 → 网页：`welcome`、`fetch.head` / `chunk` / `end` / `error`、`store.result`、`draft.insert`、`connection`、`navigate`（第 82-105 行）。
- `parseWebviewMessage`（第 132-174 行）拒绝坏消息。`fetch.request` 的 URL 必须通过 `bridgeTarget`（第 143-144、176-187 行）：只接受该虚拟源点，拒绝用户名密码。
- `connection` 通知明确不带地址、凭据或服务器原文（第 96-100 行）。

代（generation）：

- 每张文档用随机 `docId` 发 `hello`（`apps/chat-webview/src/bridge.ts:14, 113`）。宿主 `BridgeCore.handle` 先 `retire()` 再 `++generationSeq`（`bridge-core.ts:109-118`）。`generationSeq` 是进程内递增，注释写跨面板、跨文档不复用（第 58 行）。
- 欢迎之前网页把消息放进 outbox（`bridge.ts:29-35, 68-72`）。代不对的入站消息直接丢掉（`bridge.ts:75`；宿主 `bridge-core.ts:121-123`）。
- 回复若已不是当前代，计入 `staleDropped`，不 `postMessage`（`bridge-core.ts:78-84`）。
- `retire()` 中止该桥所有飞行中的 `AbortController`，代归零，直到下次 `hello`（`bridge-core.ts:8-9, 94-100`）。

一个面板一个 `BridgeCore`（`bridge-host.ts:114-151`）。`post` 就是 `webview.postMessage`。`baseUrl` 用**打开面板时**的端点；配置改到另一台服务器会抛错，避免把本绑定和凭据带到新服务器（`bridge-host.ts:98-126`）。

策略 `bridge-policy.ts`（纯函数，无 vscode）：

- 虚拟源点只保证「不会去抓任意网址」。会话边界在策略里（第 3-5 行）。
- 目录查询参数只能重复绑定目录，然后被删掉，改由宿主写头 `x-opencode-directory`（第 86-97、121-127 行）。
- 读（GET/HEAD/OPTIONS）放行（第 99 行）。写要求工作区受信任（第 100 行）。
- 永远拒绝：`/pty`、`/tui/`、`/global/upgrade|dispose`、`/instance/dispose`（第 26 行）。
- 允许的无会话写：`POST /session`（在绑定目录建会话）、`POST /log`（第 29-32 行）。
- 其他写必须打到绑定会话，或向上最多 8 层父会话能走到绑定会话的子会话（第 63-78、103-106 行）。权限回复、提问回复/拒绝要先查出属于哪个会话（第 108-117 行）。
- 网页带来的 `authorization`、`cookie`、`host`、`origin`、目录头等被剥掉，再由宿主填目录和 Basic 认证（第 121-142 行）。

首屏让路（不是背压）：`bridge-core.ts:48-55, 182-188`。文档第一次绘制前，GET `/provider`、`/lsp`、`/mcp`、`/vcs`、`/command`、`/reference`、`/experimental/resource` 先挂起，直到页面发 `ui` action `painted`，或最多 `DEFER_MS = 10_000`。注释：这些请求会占住单线程服务器，而第一屏要的是会话消息。

限制：桥不解释业务 JSON。除了下面的 SSE 标题旁路，宿主不解析聊天正文。

---

## 3. SSE：没有一条大家共用的事件流

两套完全分开的流。

**A. 每个聊天面板自己的流（官方 App 经桥发出的 HTTP）。**

- 官方 App 的 `fetch` 被换成 `bridgeFetch`（`app.tsx:88`，`bridge.ts:122-190`）。响应若 `content-type` 含 `text/event-stream`，宿主按块转发，并 `streamsOpen++`（`bridge-core.ts:200-224`）。
- **不共享。** 合并只存在于 `SHARED = /^\/(api\/)?provider$/` 的 GET（`bridge-core.ts:55, 198-199, 238-251`）。条件是：同一文档、同一「写计数轮次」、URL 和头完全相同、且第一次请求还在飞。第一次请求的 `signal` 被拿掉（`signal: undefined`），避免一个调用方取消毁掉别人；每个调用方拿到 `res.clone()`。响应一旦结束就从 Map 删掉，**不缓存**。SSE 不走这条。
- 因此：两个面板看同一会话 = 两条独立的桥 SSE（再加上侧栏那条）。隐藏面板因为 `retainContextWhenHidden` 不会拆代、也不会关流（`panels.ts:216-218`）。
- 宿主只**只读旁路**当前会话的 `session.updated` 来改标签标题（`bridge-host.ts:73-97`）。缓冲超过 1_000_000 字符就清空，不当存储。

**B. 每个窗口一条侧栏流。**

- `session-feed.ts:4-12`：给原生侧栏和状态栏用，`GET {origin}/event`，`accept: text/event-stream`（第 207-209 行）。注释写明聊天面板仍走自己的桥。
- 连接顺序：先开 `/event` 并缓冲事件 → 拉快照 → `applySnapshot` → 把缓冲回放 → 之后实时 `applyEvent`（第 7-8、207-274 行）。快照是 `GET /session?roots=true`、`/session/status`、`/permission`、`/question`（第 248-254 行）。
- **工作区未提交，不要写进稳定手册：** `rootLimit` / `loadMore` / `mergeRoots`（`session-feed.ts:81-82, 111-119`；`session-store.ts:121-134`）。这是会话列表分页，正在被改。

限制：面板流和侧栏流都会打到同一个 OpenCode 进程，但是 oco **没有**把字节扇出给多个面板。也没有「一个 SSE 连接，多个 webview 订阅」。

---

## 4. 背压与恢复：没有端到端背压；恢复是作废再连

**背压：当前没有。**

- 宿主 `for await` 读完一块就 `send` → `postMessage`（`bridge-core.ts:216-220`）。不看网页是否还堆着块，也没有 highWaterMark 回传。
- 网页 `ReadableStream` 只在 `cancel` 时发 `fetch.abort`（`bridge.ts:139-147`）。没有 `pull()` 去暂停宿主。`controller.enqueue`（第 168-170 行）队列变长不会让 Node `fetch` 停读。
- `bridge-core.ts:219` 的「shared buffer」只说明 zlib 输出是共享内存视图，gzip 块必须拷贝成独立 `Uint8Array` 才能 `postMessage`。这不是流量控制。
- gzip 明确跳过 SSE（`bridge-core.ts:205-207` 的 `!sse`）。Remote 下只对 JSON、且（服务器曾压缩过，或 `content-length` ≥ 32 KiB）重新 gzip。测试可用 `OCO_BRIDGE_GZIP=1` 把门槛降到 0（`bridge-host.ts:133-136`）。网页用 `DecompressionStream` 解开（`bridge.ts:165`）。

所以一块很大的 SSE 或 JSON 会一直往 webview 塞，直到取消、换代或连接断。

**恢复（作废旧尝试，不续传字节）：**

- 换文档 / 重载 / `dispose`：`retire()` 中止本面板全部飞行请求，旧代的块被丢（见第 2 节）。用户看到的是新文档重新拉，不是从上次字节偏移续上。
- 网页 `AbortSignal`：`bridge.ts:148-158` 发 `fetch.abort`；宿主 `bridge-core.ts:130-131, 156, 180, 188, 217, 226-231` 用该请求自己的 `AbortController`。重复 id 时新请求中止旧的。错误消息是 `"aborted"` 且 `aborted: true`，其它失败一律 `"network error"`（不把服务器正文传回）。
- 侧栏流：任何重试、配置变化、停滞、流结束都会 `token++` 并 abort 上一次，保证不同时活两条（`session-feed.ts:9-11, 150-156`）。停滞默认 35_000 ms 无字节即失败（第 28-29、216-223 行）；注释说服务器约 10 秒心跳。失败后退避：`min(30000, 1000 * 2^min(attempt-1, 5))`，再乘 0.8–1.2 抖动（第 195-204 行）。401 关掉流并且**不再自动重试**，直到凭据/配置触发 `restart`（第 11、177-184 行）。流正常结束也当失败重连（第 230 行）。换服务器或目录会先清空会话再连，避免串台（第 165-170 行）。
- 同目录换会话：不重载文档，`retarget` + `navigate`（`panels.ts:128-137`，`bridge-host.ts:142-146`）。跨目录：拆掉桥、重写 HTML（`panels.ts:138-144`）。
- 草稿在 `workspaceState` 键 `oco.pendingDrafts.v1/...`，页面 `draft.ack` 才删（`panels.ts:170-187, 269-278`）。面板不可见就不投递；再次可见才 flush（第 183-184、216-218 行）。页面若会话不对会拒绝，宿主不会因此改绑定（第 271-275 行）。
- 连接通知：`panels.ts:399-408` 把侧栏那份状态发给每个已 ready 的页面，`bound` 表示是不是这块面板当初的 connectionId。页面恢复壳见 `recovery.tsx:3-4`（注释：不展示原始错误、服务器响应、地址或凭据；草稿留在面板存储，不发送）。本轮未逐行读 `recovery.tsx` 的按钮实现。

限制：没有 SSE `Last-Event-ID` 或字节续传。侧栏靠「缓冲 + 快照 + 回放」补洞；聊天面板靠官方 App 自己重新 `fetch`（经桥）。本轮没有读官方 App 的重连代码。

---

## 5. 取消网络 ≠ 取消模型

三件不同的事，源码没有把它们合成一个开关。

1. **取消这一次 HTTP（含面板上的 SSE 连接）。**
   网页流被 cancel 或 `AbortSignal` 触发 → `fetch.abort` → 宿主 abort Node `fetch`。服务器可能看到客户端断开，但 oco 没有因此调用「停止生成」接口。指定文件里**没有**「取消模型」的路径常量。

2. **关掉或重载面板。**
   `panels.ts:220-221`：`bridge.dispose()`「只中止本面板的请求和流；会话在服务器上继续跑」。`bridge-host.ts:147-149` 同样：`core.retire()` 关掉本面板的流，**从不**停止服务器或这次运行。

3. **用户在官方 UI 里按停止（模型运行被服务器中止）。**
   侧栏事件处理把 `session.error` 且 `err.name === "MessageAbortedError"` 当成**不是失败**（`session-store.ts:93-99`）。这只说明：事件到了侧栏存储时，不把该会话标红。它不证明 oco 自己发了 abort 请求。那次 POST 若存在，会是官方 App 经 `platform.fetch` 发出、再被 `BridgePolicy` 按「绑定会话上的写」放行（`bridge-policy.ts:34, 103-106`）。具体 URL 在本轮点名文件里看不到，手册不要写死成某个路径。
   另外，`submit-status.ts` 的 Cancel / Esc 是**还没发出去的排队发送**（模型列表还没好、草稿保留），不是停止已经在服务器上跑的模型。本轮只根据文件头注释 `submit-status.ts:3-6` 和按钮文案附近（grep 第 18-21、91-95 行），没有通读。

`session-store.ts` 有未提交 diff。`MessageAbortedError` 这几行在当前工作区；没有对 HEAD 做逐行 diff，手册若要当已发布事实，应再对 `git show HEAD:apps/extension/src/session-store.ts` 核对。不要把未提交的列表分页算进去。

---

## 6. 存储：按键、按范围，不在网页里放服务器密码

`host-store.ts:1-12` 规则（初学者版）：

- 每个（范围、表名、键）是 VS Code Memento 里单独一项。两个面板写不同键，不会用一份过期的整表快照互相覆盖。
- 同一项的写按到达顺序串行（第 81-90 行）。写失败会回报页面。旧文档的消息已被桥丢掉，所以旧文档写不进来。
- 范围 `ui | connection | draft | panel`（第 20、27-34 行）。`drafts` → draft。名字像窗口/标签/布局 → panel（工作区 Memento）。设置/语言类 → ui（全局 Memento，各面板各连接共享）。其余默认 connection，隔离键是 `connectionId`，不是虚拟服务器 URL。
- localStorage 垫片的键再分一次（第 45-60 行）：`opencode.window.*` 仅本面板；设置和一小份 UI 全局键共享；其它（服务器列表、项目、模型、按虚拟 URL 存的工作区状态）按连接隔开。
- 旧的整表 `oco.store.<name>` 只当回退读，不删；迁走后用 `null` 墓碑，避免旧值又冒出来（第 11-12 行）。
- 网页侧：`app.tsx:89-102` 把 `platform.storage` 和草稿 blob 都交给宿主。`local-storage.ts` 是挂上官方 `localStorage` 的垫片（`main.tsx` 第 5 行 import）。本轮未逐行读该垫片。
- 二进制草稿：`blob.op` put/get（契约第 66 行；`bridge-core.ts:254-264`）。
- 面板角色的轻量状态：`vscode.setState({ binding, role })`（`app.tsx:203`）。这是 webview 状态，不是服务器会话正文。
- 待插入草稿文本在 `workspaceState`（`panels.ts:170-180`），按会话绑定键，不按面板实例。主面板会换会话，所以注释写草稿属于会话而不是面板。

限制：聊天消息正文不在这些键里。事实来源是服务器。这里是偏好、草稿、布局、连接隔离。密码见下一节，不进 Memento 键值。

---

## 7. 面板

- 视图类型由 `createWebviewPanel` 创建（`panels.ts:113`）。最多一个 `role: "main"`；已有主面板再开则是 `pinned`（第 112、191-192 行）。恢复时若出现第二个 main，降成 pinned。
- 打开顺序（第 95-120 行）：已经显示该会话的面板就 reveal；否则主面板原地切换；否则新开主面板。`newPanel` 则开固定面板（仍会先 reveal 已经显示它的那块）。
- 原地切换不重载（同 connectionId + directory）：`ready = false`，策略 `retarget`，发 `navigate`（第 128-137 行）。页面 `onNavigate` 改内存路由（`app.tsx:206-217`）。
- 隐藏保持文档、代和流（第 115-117、216-218 行）。处置只断本面板的桥（第 220-221 行）。
- 页面内导航到**另一个**会话变成 `ui openSession`，由宿主决定切这块还是打开/聚焦别的面板（`app.tsx:5-9, 112-122`）。其它路由记 `blockedNavigation` 并拉回当前路由。
- 子会话是否允许被**操作**（发消息、回复权限）由策略的父链决定，和「路由能不能自己跳」是两层。

限制：本轮没读 `sessions-view.ts` / `session-groups.ts`。侧栏怎么画列表、分组、搜索，正在被改，不写入本事实。

---

## 8. 服务所有权

`connection.ts:7-14, 23-40`：

- **attached（默认）**：oco 不启动、不停止、不改服务器。地址来自设置 `oco.serverUrl`（默认 `http://127.0.0.1:4096`）和用户名（默认 `opencode`）。注释：端点来自机器级设置，工作区/仓库不能把扩展指到别处。本轮未读 `package.json` 的 `configuration` 作用域，不要把「机器级」写成已经核对过 contributes。
- **managed**：端点是本窗口 `ManagedServer` 拉起来的进程。密钥只在内存。身份是二进制路径 + 进程启动目录，所以换活动文件夹不会让已开面板丢掉绑定（第 37-38 行）。

`managed-server.ts:1-3, 31-32, 61-98, 123-126, 135`：

- 每窗口一个 `opencode serve --hostname 127.0.0.1 --port 0`。所有面板共用这一进程（注释第 1 行）。
- 只向**这个类 spawn 出来的子进程**发信号。附着的服务器永不碰。
- 密码 `crypto.randomBytes(18).toString("hex")`，每次 start 轮换，不写入磁盘。环境变量里先删再设 `OPENCODE_SERVER_PASSWORD`，避免继承外部值（第 73-76 行）。日志经 `scrub` 去掉密码、家目录、看起来像 token 的片段（第 23-28 行）。
- 意外退出不自动重启，状态变成 `exited`，要用户执行「Restart Managed Server」（第 123-126 行）。启动超时默认 30 s，超时则 SIGTERM，约 3 s 后 SIGKILL（第 96-98、135 行附近）。
- 并发 `start()` 共享同一次 `spawnOnce`（第 53-58 行）。

密码怎么用（`connection.ts:71-99`）：

- managed：内存密码。
- attached：`context.secrets`，键 `oco.secret.v1.${connectionId}`。换 URL 不会沿用另一个端点的密码。
- 仅非生产 + 回环 + `OCO_DEV_PASSWORD_FILE` 才读测试文件。
- `auth()` 做成 Basic，只放在宿主发出的头里。

`Connection.request`（第 101 行起）是侧栏和策略查询用的宿主直连，不经 webview。重定向 `redirect: "manual"`，避免凭据跟着重定向走（桥里同样，`bridge-core.ts:196`）。

限制：managed 绑在 `127.0.0.1`。它不是「帮用户启动并守护他们已经在跑的那个 serve」。attached 模式下扩展退出也不该去杀用户的服务；本轮没有再读 `extension.ts` 的 deactivate 去核对清理顺序。

---

## 9. 安全（网页能做什么，不能做什么）

- CSP（`panels.ts:315-325`）：`default-src 'none'`。脚本只能 nonce、扩展资源、`wasm-unsafe-eval`、blob。**connect-src 没有服务器源点**，只有扩展资源、data、blob。注释：一切服务器请求必须走宿主桥。
- 网页消息先过 `parseWebviewMessage`，再过代检查，再过 `BridgePolicy`。
- 凭据、Cookie、Host、Origin 从网页头里剥掉（`bridge-policy.ts:131-142`）。
- 不受信任工作区：读可以，写 403（`bridge-policy.ts:100`；`bridge-host.ts:112` 用 `vscode.workspace.isTrusted`）。
- 开文件 `open-file-policy.ts:1-16, 90`：页面只报路径。要同时满足：服务器是回环地址（远程服务器上的路径即使本机有同名目录也拒绝）；绑定目录 realpath 后落在某个 `file:` 工作区文件夹里；请求路径解析后仍在该目录内且是普通文件。大小写是否敏感靠探测，不靠「是不是 macOS」（第 14-16 行）。**残留风险写在第 11-12 行：** 本机端口被 SSH 转发到远程、且目录布局碰巧一致时，分不出来。
- 外链只接受 `http(s)` 再 `openExternal`（`panels.ts:281`）。
- Worker 资源白名单只有 shiki 语言 JSON（`panels.ts:374`）。
- 托管日志脱敏（上一节）。连接条不带地址和密码（契约第 96-97 行）。

限制：策略放行的 GET 很宽（绑定目录下的读）。「不能任意读服务器」不等于「不能读该目录下任意 GET 路径」。写才收紧到会话。

---

## 10. Remote 在这些文件里实际做的事

- `vscode.env.remoteName` 为真：走 app 包 gzip + import map（`panels.ts:333`），并且桥对大 JSON 再 gzip（`bridge-host.ts:133-136`）。
- 面板仍在 UI 侧，流量过隧道。注释 `bridge-host.ts:133-134`。
- 开文件在「服务器不是本机回环」时直接拒绝（上一节）。Remote-SSH 上服务器和文件都在远端、扩展宿主也在远端时，回环判断相对的是**扩展宿主那台机器**。本轮没有读 `isLoopbackHost` 实现（`connection.ts` 从 `./endpoint` 引入）。手册不要写成「Remote 一定打不开文件」或「一定打得开」。
- 侧栏 `/event` 在 Extension Host 内消费并更新原生视图；聊天桥的 SSE 数据需要传到本机 Webview。不能把侧栏完整 SSE 字节也说成必然经过 VS Code 隧道。没有跨面板合并 SSE。
- 历史 STATUS 里的字节数、部署哈希、gcp-workstation 截图不是本文件的源码事实。

---

## 11. 刻意没当成现状的东西

- ADR-007 / STATUS 里的耗时、内存、E2E 通过次数：是当时运行记录，不是这次读到的代码行为。
- `vendor/opencode/.../server-sdk.tsx:191-199`：只出现在契约注释，未打开。
- 会话列表 UI、分组、`session-groups.ts`、未提交的分页：不稳定。
- 相关单测文件本轮没有打开。上面的结论不依赖测试名。
- 未全仓搜索，未读 `extension.ts` 激活顺序以外的零星引用（只在 iframe 搜索时扫到 `extension.ts:399` 也设置了 `localResourceRoots`）。

## 12. 本次怎么核对的

- 目录可读：`apps/extension/src`、`apps/chat-webview/src`、`packages/contracts/src`。`docs/evidence/` 可列，本文件是唯一写入。
- 命令：`git status --short` 与 `git diff --stat`，仅上述会话列表路径。未提交、未跑 E2E、未改产品代码或 STATUS/NEXT。
- model/provider：本次工具返回里没有 model 或 provider 字段，记 **unknown**。系统自称 Grok 4.7，不把它写成工具测量值。

## 13. 集成人补核（2026-10-02）

为核实委派中明确未打开的关键边界，主线程定向读取 `vendor/opencode/packages/app/src/context/server-sdk.tsx:187-208`：`eventFetch` 仅在 `platform.fetch` 存在且 URL 为非回环 HTTP 时返回该 fetch。这证实了桥契约对虚拟源形式的说明，不再只依赖注释。另核对扩展清单 `extensionKind=["workspace"]`，以及 `tests/e2e/run.mjs:8` 的 DEFAULT_SUITES 实际为 20 项。未因此重新执行产品测试。
