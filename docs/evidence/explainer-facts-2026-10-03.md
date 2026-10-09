# oco 当前实际实现事实清单

- 日期：2026-10-03
- 状态：已返回（调查完成；未构建、未跑测试、未改其他文件）
- 范围：只读源码与点名文档。结论分三档：**已实现** / **部分实现** / **仅拟议**。
- 引用格式：`文件:行`。行号对应该文件调查时的内容。
- 未把 STATUS 里的历史 E2E 数字当作本轮通过。

## 委派记录

- task_id: explainer-facts-2026-10-03
- 唯一写入范围: docs/evidence/explainer-facts-2026-10-03.md
- requested_route: grok-worker（本任务即被委派的调查）
- actual_provider/model: unknown（工具未返回 provider/model；会话自称 Grok 4.7）
- agent_id/run_id: unknown
- 状态: 已返回
- 结果路径: docs/evidence/explainer-facts-2026-10-03.md
- fallback_reason: 无（本代理直接完成只读调查）

进度：11/11 已写。未查项见文末。

---

## 1. 进程 / 运行位置

**已实现。** 三层，不是四个独立产品进程。

| 层 | 是什么 | 本地窗口 | Remote-SSH |
| --- | --- | --- | --- |
| Webview | `apps/chat-webview` 把打过补丁的官方 OpenCode Web App 打进扩展资源，在 VS Code Webview 里挂载。虚拟源 `http://oco.bridge`，不是直连服务器的 iframe | VS Code 客户端（本机 UI 进程） | 仍在本机 UI。资源走 `asWebviewUri` |
| Extension Host | `apps/extension`：连接、侧栏、面板、桥、策略 | 本机 | **远端**。清单 `extensionKind: ["workspace"]` |
| OpenCode Server | 会话、模型、工具、权限的事实来源 | attached：`oco.serverUrl` 指向的机器；managed：扩展宿主上的子进程，只听 `127.0.0.1` 随机端口 | 同一规则：`127.0.0.1` 是**发起 fetch / spawn 的 Extension Host**，Remote 下是远端机器 |

依据：

- 扩展必须装在工作区宿主：`apps/extension/package.json:336-338`；安装说明 `docs/remote-install.md:3`。
- 架构表述（Webview 在客户端、宿主在远端、不要把 localhost 当成同一台机器）：`docs/ARCHITECTURE.md:13-20`、`docs/ARCHITECTURE.md:141-144`。
- 面板资源：`apps/extension/src/panels.ts:312`（`asWebviewUri`）。
- managed 子进程参数：`apps/extension/src/managed-server.ts:90`（`opencode serve --hostname 127.0.0.1 --port 0`）。一个窗口一个进程，多面板共用：`managed-server.ts:1`、`extension.ts:78`。
- 官方前端构建进 `apps/extension/media/chat`：`scripts/build-webview.sh:2-8`。

**不是当前路线：** iframe 打开远端网站、自研聊天 UI、管理页 Webview。`docs/ARCHITECTURE.md:1` 写明除已落地的最小子集外其余仍为拟议。

**部署 ≠ 功能验收。** VSIX 曾装到 `gcp-workstation`（见 STATUS 各条）。STATUS 未验证表仍把「Remote-SSH、团队实际服务」标为 BLOCKED：`docs/STATUS.md:291`。

---

## 2. 消息桥

**已实现（HTTP/SSE 桥）。WebSocket 明确不支持。**

### 线上信封（不要用手册里的教学名）

公共字段只有三个：`v`、`gen`、`type`。`packages/contracts/src/bridge.ts:35`。

- `v` = `PROTOCOL_VERSION` **2**（`bridge.ts:9`）。
- `gen`：这一份 Webview **文档**的代号（hello 之后由宿主分配）。代码注释里叫 generation，**字段名不是 `generation`，也不是 `epoch`**（`bridge.ts:3-7`、`35`）。
- 请求相关 id 字段名是 **`id`**，不是 `requestId`（`bridge.ts:57-66`）。
- **面板 id、connectionId、sessionId 不在每条消息上。** 它们在页面初始化 `WebviewInit`：`panelId` + `binding { connectionId, directory, sessionId }` + `role`（`bridge.ts:16-31`）。宿主按「哪个 webview 发来的」路由。

webview → host：`hello`、`fetch.request`、`fetch.abort`、`store.op`、`blob.op`、`ui`、`draft.ack`、`ready`（`bridge.ts:56-79`）。

host → webview：`welcome`、`fetch.head`、`fetch.chunk`、`fetch.end`、`fetch.error`、`store.result`、`draft.insert`、`connection`、`navigate`（`bridge.ts:82-105`）。

运行时校验：`parseWebviewMessage`；`fetch.request` 的 URL 必须是 `http://oco.bridge/`，否则拒绝（`bridge.ts:132-145`、`177-178`）。

### fetch / SSE / 取消 / 错误

- 页面用 `bridgeFetch` 把请求序列化后 `postMessage`（`apps/chat-webview/src/bridge.ts:34`、`113`、`122`）。
- 宿主 `BridgeCore` 校验策略后 `fetch` 真实服务，按块回 `fetch.chunk`，结束 `fetch.end`。`content-type` 含 `text/event-stream` 时边读边转发，不攒到结束（`apps/extension/src/bridge-core.ts:200`、`217-220`）。
- 取消：`fetch.abort` → 该 `(gen, id)` 的 `AbortController`（`bridge-core.ts:130-131`）。
- 错误：策略拒绝或网络失败发 `fetch.error`（中止时 `aborted: true`，文案是 `aborted` / `network error`，不回传服务端正文）（`bridge-core.ts:229-231`）。策略拒绝也可先回一块带 `error` 的 JSON（`bridge-core.ts:176`）。
- 旧文档：新 `hello` 换 `gen`，在途请求 abort，旧 `gen` 的回复不送给新文档（`bridge-core.ts:3-9`、`78-80`）。
- 大响应可 gzip（`encoding: "gzip"`，`bridge.ts:83-84`；开关注释写明用于 Remote，`bridge-core.ts:41-42`）。

### bridge-policy 限制什么

`apps/extension/src/bridge-policy.ts`。虚拟源只保证不打任意网址；策略再限制目录和写操作。

- 一律拒绝：路径含 `..` 或 `//`；`/pty`、`/api/pty`、`/tui/`、`/global/upgrade|dispose`、`/instance/dispose`（`26`、`81-84`）。
- 读（GET/HEAD/OPTIONS）：除上面之外允许，但 query 里的 `directory` 只能等于绑定目录，`workspace` 覆盖直接 403；通过后目录头被改写成绑定目录（`86-99`）。
- 写：工作区不受信任则 403（`100`）。无会话的写只允许 `POST /session`（及 `/api/session`）和 `POST /log`（`29-31`）。
- 其他写必须打在绑定会话，或最多向上 8 层父会话能走到绑定会话的子会话（`63-78`、`103-107`）。
- `POST /permission/:id/reply`、`POST /question/:id/reply|reject` 必须能查到所属会话且该会话被允许（`108-116`）。
- 其余写 403 `operation not available in this panel`（`118`）。
- 转发头丢掉 webview 自带的 `authorization`、`cookie`、`host`、`origin` 等；宿主自己加认证和 `x-opencode-directory`（`121-142`）。

### WebSocket

**不支持。** 注入脚本把 `window.WebSocket` 换成一构造就抛错的类，并计数 `websocketBlocked`。注释：唯一使用者是终端，v0.1 不做（`apps/extension/src/panels.ts:344`、`383`）。ADR-003 也写「未桥接」（`docs/adr/003-transport.md:14`）。

**仅拟议 / 未做成：** 多面板共享一条服务端事件订阅、慢面板有界队列、服务端游标续传。侧栏有**一条**宿主侧 `/event`；每个聊天面板仍经桥自己订阅（`session-feed.ts:5-6`；ADR-003 的 P0 限制 `docs/adr/003-transport.md:18`，其中「隐藏即重新挂载」已被 ADR-007 推翻，见第 4 节）。

---

## 3. 连接：attached 与 managed

两种都有代码。默认 attached。

| | attached | managed |
| --- | --- | --- |
| 程度 | **已实现**：只连接，不启动、不停止、不改配置（`connection.ts:8-9`、`23-24`） | **已实现到「本窗口一个子进程」**：随机密码只在内存；意外退出不自动重启，要命令 `oco: Restart Managed Server`（`managed-server.ts:70-76`、`125-126`；`extension.ts:475-476`） |
| 地址 | 设置 `oco.serverUrl`，必须是 origin，不能带路径或密码（`endpoint.ts:14-27`）。默认 `http://127.0.0.1:4096`（`package.json` 说明 `apps/extension/package.json:240`） | 从子进程 stdout 的 `listening on` 解析；非 loopback 直接拒绝（`endpoint.ts:30-36`） |
| 谁拥有进程 | 用户。停扩展、关窗口都不杀它 | 只杀自己 spawn 的 child。不受信任工作区不启动（`extension.ts:99-101`） |
| 未做 | 不探测 OpenAPI 能力表（架构要求，见第 11 节） | 不安装/升级 OpenCode；不无限重启；不是「每面板一个 server」 |

### connectionId

不是用户起的名字，是哈希：

- attached：`"c" + sha256(origin + "|" + username)` 前 16 hex（`endpoint.ts:26`）。
- managed：`"m" + sha256("managed|" + binary + "|" + directory + "|" + username)` 前 16 hex。身份是二进制路径 + 启动目录，**不是随机端口**，重启后面板绑定还在（`endpoint.ts:30-36`）。

### SecretStorage

- attached 密码键：`oco.secret.v1.${connectionId}`，`context.secrets`（`connection.ts:71-94`）。
- managed 密码不进 SecretStorage，只在 `ManagedServer` 内存（`connection.ts:75-76`）。
- 开发模式、非 Production、且 loopback 时，可读 `OCO_DEV_PASSWORD_FILE`（`connection.ts:79-87`）。
- 认证是宿主加的 Basic（`connection.ts:96-98`）。设置作用域是 machine，工作区不能改服务器地址（`connection.ts:11`）。

### endpoint 解析

`endpointFromSetting` / `managedEndpoint`（`endpoint.ts:14-36`）。非 loopback 的 http 标 `cleartext: true`（attached）。目录是否属于本工作区：`sameDirectory`，只对 loopback 服务器做 realpath（`connection.ts:65-68`）。

### asExternalUri

**未使用。** `apps/` 内无 `asExternalUri`。当前网页不直连服务器，所以没有「把端口转发 URI 交给 webview」这条路径。`docs/ARCHITECTURE.md:144` 的 `asExternalUri` 是**若做转发就必须**的约束，不是已实现调用。静态资源用的是 `asWebviewUri`（`panels.ts:312`）。

---

## 4. 面板与会话

**单主面板：已实现**（ADR-007 第 1–4 步在代码里；ADR 文首仍写「第 2–4 步待提交」，以代码为准）。

- 最多一个 `main`（跟侧栏，原地切会话）+ 若干 `pinned`（固定一个会话）。隐藏时 `retainContextWhenHidden: true`，不销毁文档（`panels.ts:31-32`、`47`、`112`、`117`、`190-192`）。
- 恢复出第二个 main 会降为 pinned（`panels.ts:191-192`）。
- 切换由宿主发 `navigate { sessionId }`；页面路由只跟宿主（`bridge.ts:102-104`；`apps/chat-webview/src/app.tsx:206-217`）。
- 视图类型 `oco.chat`（`panels.ts:17`）。

**侧栏：已实现**，不是 Agents。

- 活动栏容器 `oco`，视图 `Sessions` + 默认折叠的只读 `Connection`（`apps/extension/package.json:256-277`）。Agents 视图已删（`docs/STATUS.md:64-66`）。
- 列表分组：昨天 0 点以后，或非 idle，或未读 → 上面；更早的进折叠 More（`session-groups.ts:47-59`；STATUS `docs/STATUS.md:45-49`）。
- 侧栏数据来自宿主一条 `/event` + 快照再回放；401 停止重试（`session-feed.ts:5-11`）。

**草稿插入：已实现。** 命令 `oco.addSelectionToDraft` 把选区文本交给 `panels.insertDraft`（`extension.ts:235`、`258`）。未发出的草稿按会话存在 `workspaceState` 键 `oco.pendingDrafts.v1/<connectionId|directory|sessionId>`，面板可见且 `ready` 后发 `draft.insert`（`panels.ts:170-186`）。上游行为由补丁 0001：追加到 composer，不自动发送。

**打开文件：已实现为「打开文本」，不是 VS Code Diff 编辑器。** `ui` action `openFile` → `decideOpenFile`：仅当服务器是 loopback、会话目录在本机工作区内、路径解析后仍在该目录且是普通文件，才 `showTextDocument`（预览、分栏、可选行列）（`open-file-policy.ts:1-12`；`panels.ts:443-485`）。SSH 隧道把远端端口转到本机 loopback 时，策略区分不开（`open-file-policy.ts:11-12`）。

**Diff：部分实现。** 差异展示在打过补丁的官方时间线里（补丁 0006、0007：摘要、Markdown 路径、单轮范围、缺前像时的不可用提示）。宿主没有 `vscode.diff`。v0.1 架构要求只展示可核对差异、不做接受/回滚（`docs/ARCHITECTURE.md:127`）。

**恢复视图：已实现。** 补丁 0008 把官方错误页/不可达/会话缺失转到 oco 的 `recovery.tsx`。文案固定，动作是固定宿主操作（重试、设置、会话列表、新建、关面板），不展示地址、凭据或原始服务错误（`apps/chat-webview/src/recovery.tsx:1-4`）。Reload Window 用 `registerWebviewPanelSerializer`：只恢复当前 connectionId 且目录仍属于本工作区的面板，否则 dispose（`extension.ts:390-400`）。页面 `setState` 存 `{ binding, role }`（`app.tsx:204`）。

---

## 5. 状态归属

| 状态 | 实际位置 | 档 |
| --- | --- | --- |
| 会话消息、运行、工具、权限 | OpenCode Server。侧栏只是宿主内存里的快照+事件（`session-feed.ts` / `session-store.ts`） | 已实现 |
| attached 密码 | SecretStorage `oco.secret.v1.<connectionId>` | 已实现 |
| managed 密码 | 进程内存，不落盘 | 已实现 |
| 服务器 URL、用户名、模式、opencode 路径 | VS Code 设置，machine 作用域 | 已实现 |
| 面板恢复（绑定 + main/pinned） | Webview `setState`（`app.tsx:204`） | 已实现 |
| 待插入草稿队列 | `workspaceState` `oco.pendingDrafts.v1/...` | 已实现 |
| 多根工作区当前文件夹 | `workspaceState` `oco.activeFolder`（`extension.ts:36`） | 已实现 |
| 未读点 | 按工作区记在 workspaceState（STATUS `docs/STATUS.md:48`；追踪器 `session-groups.ts:67`） | 已实现 |
| 官方 App 的 storage / localStorage | **不是**网页 origin 的 localStorage 当事实来源。shim 用内存 Map，写入宿主 KvStore（`local-storage.ts:1-7`）。作用域：`ui`→globalState；`panel`（`opencode.window.*`）→workspaceState；`connection` 与 `draft`→globalState，键带 connectionId 或 panelKey（`host-store.ts:20-79`）。前缀 `oco.kv.v2` | 已实现 |
| 附件 blob | `globalStorageUri/blobs/<sha256>`，上限 20 MB（`bridge-host.ts:9-21`） | 已实现 |
| 模型/Agent 选择 | 官方 UI 经上面的存储 + 服务端会话事实。扩展没有第二套模型库 | 部分实现（没有单独的「有效配置」管理页） |
| Agent 配置文件的读改写、来源、hash 防覆盖 | 无 `agents/` 模块 | 仅拟议（且用户已决定去掉 Agents 视图） |
| 架构写的「受控 DraftStore」独立类型 | 实际是 pending 队列 + 官方 drafts 命名空间，没有这个类名 | 名称是拟议，行为部分落地 |

原生 `window.localStorage` 只在安装 shim 时做一次非面板键迁移，之后不用它当隔离键（`local-storage.ts:18-32`）。

---

## 6. 构建流水线与版本

**已实现**的脚本链（本轮未执行）：

1. `scripts/setup.sh`：浅克隆上游到 `vendor/opencode`，校验 SHA，`git apply` `patches/opencode/*.patch`，上游 `bun install --frozen-lockfile`（`setup.sh:2-9`；ADR `docs/adr/002-upstream-and-build.md:7-8`）。
2. `bun run build:webview` → `scripts/build-webview.sh`：用 vendor 里的 vite 构建 `apps/chat-webview`，产物到 `apps/extension/media/chat`，再把 `app-*.js` gzip（`build-webview.sh:2-11`）。
3. `bun run build:extension`：esbuild 打 `apps/extension/src/extension.ts` → `dist/extension.js`，`@oco/contracts` 别名到 `packages/contracts/src/bridge.ts`（`apps/extension/package.json:334`）。
4. `scripts/package-vsix.sh`：再 build（可用 `OCO_SKIP_BUILD=1` 跳过），打成仓库根目录 `oco-<version>-<HEAD短sha>.vsix`，带上游 LICENSE。包内可以含未提交改动，文件名里的 SHA 只是 HEAD（`package-vsix.sh:2-3`、`39-40`）。

| 工具 | 版本 | 出处 |
| --- | --- | --- |
| 扩展版本 / publisher | **0.0.4** / `oco-local-test` | `apps/extension/package.json:5-6` |
| VS Code 引擎 | `^1.95.0`（`@types/vscode` 1.95.0） | `package.json:10-11`；根 `package.json:21` |
| Bun | 1.3.10（packageManager） | 根 `package.json:5` |
| esbuild | 0.25.10；target node20，platform node，format cjs | 根 `package.json:22`；扩展 build 脚本 |
| TypeScript | 5.8.2 | 根 `package.json:24` |
| playwright-core | 1.56.1 | 根 `package.json:23` |
| 上游 OpenCode | tag **v1.18.33**，SHA **`51ef4be1d3c122f18fefb510dca8d778571f4f18`**，MIT | `scripts/setup.sh:8-9`；`docs/adr/002-upstream-and-build.md:7`。vendor 应用包版本同为 1.18.33（`vendor/opencode/packages/app/package.json:2`） |

`vendor/` 顶层只有 `opencode/`（完整上游检出，不是 oco 自己的包）。固定 SHA **不在 vendor 目录里另存一份**，记在 `scripts/setup.sh` 和 ADR-002。上游 app 的 Vite/Solid/Tailwind 在 `package.json` 里是 `catalog:`，本轮没有展开 catalog，手册里的 7.1.4 / 1.9.10 / 4.1.11 **未复核**。

workspaces 只有 `apps/extension` 和 `packages/contracts`（根 `package.json:6`）。`apps/chat-webview` 没有自己的 package.json，构建时链到 vendor app 的 `node_modules`。

---

## 7. 18 个补丁

目录 `patches/opencode/`，0001–0018 各一个文件。下面按主题。用途来自文件名、diff 碰到的路径，以及 STATUS 对 0012–0018 的记录。本轮没有通读每个 hunk。

**草稿与发送**

- 0001 `oco-draft-insert`：宿主把文本追加进当前 composer，不发送。改 `prompt-input-v2.tsx`。
- 0004 `oco-embedded-submit-waits-for-model`：模型信息未就绪时协调提交。改 `submit.ts`。

**单会话嵌入与导航**

- 0002 `oco-embedded-single-session`：嵌入单会话，收起原导航/多标签等。改 titlebar、layout、platform、session commands。
- 0015 `oco-embedded-keep-workspace-on-switch`：切换会话时保持工作区，避免整页拆掉重载。改 prompt-input-v2、platform、session。
- 0016 `oco-embedded-session-links-not-urls`：子会话链接走宿主，不打开系统浏览器。改 `directory-layout.tsx`。
- 0017 `oco-embedded-header-actions-inline`：去掉整行标题栏，把状态/审查开关并进会话标题行。改 session-header、trajectory、titlebar、session、message-timeline。
- 0018 `oco-embedded-hide-session-more-menu`：嵌入模式去掉会话三点菜单。改 message-timeline。归档改到侧栏命令（扩展侧，不是这个补丁文件本身）。

**窄面板**

- 0003 `oco-narrow-dock-wrap`：窄宽度换行。改 `message-part.css`。

**打开文件与 Diff**

- 0005 `oco-open-file-in-host`：文件打开交给宿主。改 platform、directory-layout、session-ui data、message-part。
- 0006 `oco-open-file-diff-summary-markdown`：Diff 摘要和 Markdown 里的路径也走宿主。改 message-timeline、markdown、message-part。
- 0007 `oco-turn-diff-scope-unavailable`：单轮 Diff 范围；拿不到前像时明示不可用。改 timeline-row、rows、summary-diffs、message-timeline 及测试。

**失败与设置入口**

- 0008 `oco-embedded-recovery-view`：官方错误/不可达/缺会话转到 oco 恢复页。改 app、platform、index、error、session。
- 0009 `oco-embedded-settings-no-pty-shells`：嵌入设置里去掉 PTY/壳入口。改 settings-general 与 settings-v2 controllers。
- 0010 `oco-embedded-visibility-defaults`：嵌入可见性默认值。改 `settings.tsx`。

**Fork 与轨迹**

- 0011 `oco-message-fork-buttons`：消息上的 fork 按钮。改 session、message-timeline、message-part、图标。
- 0012 `oco-trajectory-view`：对话 / 轨迹两种视图。改 trajectory 模型与组件、session、message-timeline。
- 0013 `oco-trajectory-i18n-tools-compact`：轨迹文案、工具页签、折叠步骤。
- 0014 `oco-trajectory-toggle-state-subagent`：轨迹比例按钮的选中态、子智能体行。

ADR-002 正文仍只展开早期补丁数量（`docs/adr/002-upstream-and-build.md:14` 起写 0001）。**数量以目录 18 个为准**，升级步骤仍是改 TAG/SHA 后重放。

---

## 8. 测试分层

本轮没有跑。分层按文件头和脚本：

**unit — 已有，纯函数，不启动 VS Code。** `bun test tests/unit`（根 `package.json:13`）。文件：bridge 契约/core/policy、endpoint、host-store、managed-server、open-file-policy、session-feed/groups/store、app-loader、diagnostics、settings 贡献、brief、e2e 结果解析。

**integration — 已有，数量少，打真实或上游运行时，不是单测。**

- `tests/integration/api-probe.mjs`：对 `scripts/test-server.sh` 起的隔离服务做认证、建会话、SSE 增量、prompt_async、真实 abort。
- `c2-diff-runtime.mjs` + `c2-diff-runtime.test.ts` / `c2-diff-http.test.ts`：在固定上游测试工具里跑，快照树和 diff 是真的，不用模型生成。

**e2e — 已有。是 Playwright 驱动的真实 VS Code（Electron），不是浏览器里打开一个网站。** `tests/e2e/vscode.mjs:1-3` 用 `playwright-core` 的 `_electron`，默认二进制是本机 VS Code。Webview 通过 `vscode-webview://` frame 访问。`tests/e2e/run.mjs:7-8` 的默认套件包括聊天、身份、侧栏、窄面板、主题、输入法、重连、待发送、打开文件、焦点、diff 不可用、恢复、连接、主面板、fork、managed、多根、诊断、轨迹。模型可以是 `tests/e2e/lib/mock-llm.mjs`（`scripts/test-server.sh:13`）。隔离服务的状态在 `.oco-test/`，不碰用户的 OpenCode（`test-server.sh:2-5`）。`perf.mjs`、`smoke.mjs` 不在默认套件里。

**不是验收套件：** `scripts/remote-chat-check.mjs`、`scripts/remote-look.mjs` 只对已安装扩展做 Remote 抽查/截图。

**brief / verify:brief**

- `bun run brief` → `scripts/brief.mjs`：扫已有证据和 git 信息，写 `.oco-reports/latest.json` / `latest.md`，**不跑测试**。
- `bun run verify:brief`：`typecheck` + `bun test tests/unit`。加 `--build` 才 `bun run build`（`scripts/lib/brief-verifier.mjs:71-86`）。**不跑 E2E，不连真实模型。**

---

## 9. 版本与远程部署

- 扩展版本 **0.0.4**，发布者 **oco-local-test**（本地测试身份，不是市场发布）。`apps/extension/package.json:2-6`。README 写明这是原型（`README.md:7`）。
- 远程步骤概要（`docs/remote-install.md:1-5`、`139-160`；脚本 `scripts/deploy-remote.sh:2-5`）：
  1. 本机 `package-vsix.sh` 产出 `oco-<版本>-<提交>.vsix`。
  2. `scp` 到 SSH 主机（文档默认 `gcp-workstation`），装进 **远端 VS Code Server 的扩展目录**。只装在 Mac 上不会出现在 Remote 窗口。
  3. 同 publisher/name/version 已登记过：用覆盖安装（暂存目录必须在扩展目录外，避免 `.new` 登记指向空目录）。
  4. 第一次安装或改了版本号：在远端 `code --install-extension … --force`，或从 Mac 调 `code-server --install-extension`。
  5. 装完要 Reload Window。脚本**不**启动、停止或替换 OpenCode 服务。`*.vsix` 不入库。

---

## 10. technical-guide.html 与现状不符的地方

手册大部分机制和代码一致（虚拟源、分块、WebSocket 禁用、单主面板保活、18 个补丁、0.0.4、v1.18.33、Agents 已移除、共享事件总线仍是目标）。它自己在第 16 章列了历史文档漂移。下面是**手册仍会把读者带偏**的点：

1. **协议字段名写错了。** 第 5 章流程图写 `fetch.request { requestId, generation, url, method, body }`（`docs/technical-guide.html:48`）。第 6 章表把文档代号叫 `generation`、请求号叫 `requestId`（同文件 `:59`）。线上是 `v` + `gen` + `type`，请求号是 `id`，且带 `headers`；panel/session 不在这条消息上（`packages/contracts/src/bridge.ts:35`、`57-59`）。讲「有一张票」可以，不能当字段表抄。
2. **2026-10-02 00:32 的观察框过时。** 同文件第 18 章写「会话列表改版仍未提交」（`:127` 附近的 warning）。STATUS 写侧栏改版提交 `8d215c3`（2026-10-01）和空列表闪烁修复 `363e5c5`（2026-10-02）已部署（`docs/STATUS.md:39-51`）。文首「调查时 Claude 正并行修改会话列表」（`:26`）同样不要当成今天的 git 状态。
3. **Vite / Solid / Tailwind 三个小版本**（手册第 12 章表）本轮没从上游 catalog 复核，讲解页不要写成已核对事实。
4. 手册没有把 `asExternalUri` 说成已调用，这点与代码一致。不要从 ARCHITECTURE 第 9 节反推手册错了。

`README.md:5` 仍写「左侧管理会话和 Agent」。手册已指出这是旧说法；讲解页应以 Sessions + Connection 为准。

---

## 11. ARCHITECTURE.md 列出但仓库里没有的模块

文首已声明拟议（`docs/ARCHITECTURE.md:3`）。第 2 节目录（`:29-47`）对照实际 `apps/extension/src/*.ts`（扁平文件，没有这些子目录）：

| 拟议路径 | 实际 |
| --- | --- |
| `apps/extension/src/connections/` | **不存在**。逻辑在 `connection.ts`、`endpoint.ts`、`managed-server.ts`、`session-feed.ts` |
| `sessions/` | **不存在**。`session-store.ts`、`session-feed.ts`、`session-groups.ts`、`sessions-view.ts` |
| `panels/` | **不存在**。`panels.ts` |
| `views/` | **不存在**。`sessions-view.ts`、`connection-view.ts` |
| `editor/` | **不存在**。打开文件在 `open-file-policy.ts` + `panels.ts` |
| `agents/` | **不存在**（视图已删除） |
| `settings/` | **不存在**。设置是 `package.json` contributes + 官方 Web 设置页（补丁 0009/0010） |
| `diagnostics/` | **不存在作为目录**。有文件 `diagnostics.ts` |
| `apps/management-webview/` | **不存在** |
| `packages/opencode-adapter/` | **不存在**。适配在 extension 的 bridge-* 与 contracts |
| `packages/contracts` | **存在**，但只有 `bridge.ts`、`sessions.ts`，不是完整领域模型包 |
| `tests/{unit,integration,fixtures,e2e}` | **存在** |
| `vendor/opencode`、`patches/opencode` | **存在** |

第 1 节图（`ARCHITECTURE.md:9-11`）仍画「Sessions / Agents」、每会话一个 Webview、管理页。与 ADR-007 和当前视图不符，应视为旧图，不是现状。

第 6 节里仍只是目标、代码里没有落地的：面板间共享事件订阅、有界队列溢出后强制重同步、无游标时的统一快照协调、有副作用请求的「发送结果未知」产品状态（`ARCHITECTURE.md:111-114`）。P0 传输 ADR 写过整表存储；现已是逐 key（`host-store.ts:3-6`），那条过时。

---

## 未查项

- 未跑 `git rev-parse`，没有把手册基线 `5d99942` 和当前 HEAD 对比。
- 未在 `vendor/opencode` 里复核工作区是否正好等于固定 SHA，也未展开 Vite/Solid/Tailwind 的 catalog 版本。
- 未通读 18 个补丁的 hunk，只看了每个 `diff --git` 和 STATUS 对后几个补丁的说明。
- 未逐段读 ADR-001/004/005/006、PLAN、ACCEPTANCE；传输与面板以 ADR-003/007 和源码为准。
- 未通读 `technical-guide.html` 每一段，只核对了 h2 和上面点名的论断。
- `BridgeCore.compress` 的调用点没有逐行定位（类型和注释在 `bridge-core.ts:41-42`）。
- 未构建、未跑 unit/e2e。任何「已实现」都是读代码得出的，不是本轮运行证据。
