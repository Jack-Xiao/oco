# 技术手册事实审计：前端、构建、上游补丁、测试、文档导览

日期：2026-10-01。只读调查，未跑构建、未跑测试、未改公共文档、未提交。
写入范围仅本文件。其他工作者的改动未动。

model / provider：本次委派工具未提供，均记 `unknown`。委派前另一次健康检查返回 model `grok-4.7-build` / provider `unknown`（7.72s）；不能当成本次运行的模型身份。

官方文档 URL 本节末尾按各项目自己的文档站列出。本轮没有逐个打开这些网页，写入手册前应再确认链接仍指向入门页。

## 1. 给不懂前端的人：这些词在 oco 里怎么串起来

oco 不是一个从零写的聊天网页。它是 VS Code 扩展：侧栏是 VS Code 自带的树，对话页是一块内嵌网页（webview），里面挂的是官方 OpenCode 应用源码。密码和真正的网络请求留在扩展进程里，网页只发有限的消息。

可以把它想成两条生产线，最后在「消息桥」会合。

### 语言：TypeScript 和 TSX

- TypeScript（`.ts`）是带类型检查的 JavaScript。扩展宿主（`apps/extension`）和契约（`packages/contracts`）用它写。根脚本 `bun run typecheck` 只检查这两处（`package.json` 第 12 行），不检查对话页，也不检查上游应用。
- TSX（`.tsx`）是 TypeScript 里夹了看起来像 HTML 的标签。那些标签不是最终页面上的 HTML 文本。Solid 的编译器把它们变成「创建或更新页面节点」的普通 JavaScript。
- oco 自己的对话入口是 `apps/chat-webview/src/app.tsx`。文件头写明：它挂载官方 OpenCode v1 应用，一次只绑一个会话（第 1–9 行）。第 21 行从 `solid-js/web` 引入 `render`。真正的 `render(...)` 调用在本次只读的前 120 行之后，这里不编行号。

### DOM：浏览器里的那棵节点树

DOM 就是网页上的元素树。oco 对话页几乎不手写这棵树。唯一的 HTML 文档是 `apps/chat-webview/index.html`：

- 第 21–22 行：`<body>` 和一个空的 `<div id="root">`。聊天内容以后都画进这个空盒子。
- 第 25–35 行：`#oco-boot` 骨架屏。包还没到、字还没画出来之前，用户看到的是编辑器底色上的灰条，避免闪黑或闪 logo。`docs/TEST-SCOPE.md` 第 39 行把收起条件记在 `src/main.tsx`（本轮按授权未读该文件）。
- 第 36 行：开发时以 ES 模块加载 `./src/main.tsx`。构建后 Vite 会把它换成打包好的脚本；`vite.config.ts` 第 83–113 行的 `preloadApp` 再往 `<head>` 里插入预加载链接，让下载和宿主握手重叠。

`index.html` 第 8–16 行还有一小段手写 CSS：VS Code 会给获得焦点的链接画框，子智能体那一行整行都是链接，鼠标点一下就会出现长条框。这里把链接的焦点圈改回「只有键盘焦点才显示」。

### SolidJS 和响应式

SolidJS 是官方对话应用使用的界面库，不是 React。响应式的意思是：数据变了，只更新读到这份数据的那一小块页面，而不是整页刷新，也不是 oco 再写一套界面框架。

oco 做的是把官方应用装进 webview，并加约束：

- 第 20 行使用 `@solidjs/router` 的内存路由（不改浏览器地址栏；webview 本来也没有可刷新的普通网址，见第 82–84 行注释）。
- 第 111 行起的 `PanelRouter` 只允许停在当前会话。转到另一个会话就请宿主打开（`openSession`）；其他地址直接拒绝。页面自己不能换会话，只有宿主发来的 `navigate` 可以（第 5–9 行、第 30–31 行）。
- 第 72–105 行的 `platform` 对象是交给官方应用的「这是嵌在 VS Code 里」的说明书：打开外链、在编辑器里打开文件、重新加载面板、错误页、通知、网络、存储、草稿。注释点名了补丁 0002、0005、0008、0015。

官方应用内部怎么用 Solid 的 signal，本轮没有读上游源码，不在这里展开。

### Tailwind

Tailwind 把 `flex`、`h-dvh` 这类类名在构建时收成真正的 CSS，而不是运行时再解释一遍。`index.html` 第 21–22 行已经写了这些类名（还有 `text-12-regular`、`bg-v2-background-bg-deep` 这种上游设计令牌）。

oco 自己不安装 Tailwind。`docs/adr/002-upstream-and-build.md` 第 9 行写明：对话页用上游 `packages/app` 的 Vite 插件 `@opencode-ai/app/vite`，里面包含 Solid、Tailwind 和 `@` 别名。`vite.config.ts` 第 7 行、第 142 行确实加载了这个插件。

### Vite 和 esbuild：两个打包器，不要混成一个

| | 对话页 | 扩展宿主 |
| --- | --- | --- |
| 工具 | Vite 7.1.4（上游 catalog） | esbuild 0.25.10（oco 根 `package.json` 第 22 行） |
| 谁启动 | `scripts/build-webview.sh` 第 8 行：`OPENCODE_CHANNEL=prod`，用 vendor 里的 `vite build` | `apps/extension/package.json` 第 329 行 |
| 输入 | `apps/chat-webview` + `vendor/opencode` 里的官方应用 | `apps/extension/src/extension.ts` |
| 输出 | `apps/extension/media/chat`（`vite.config.ts` 第 162–163 行，构建前清空该目录） | `apps/extension/dist/extension.js` |
| 运行在哪 | VS Code webview（浏览器环境，`target: esnext`，无 sourcemap） | VS Code 扩展宿主，Node，CommonJS，`target=node20`，`vscode` 模块保持外部 |

esbuild 那条命令还把 `@oco/contracts` 指到 `packages/contracts/src/bridge.ts`。Vite 在 `vite.config.ts` 第 154 行做了同一件事。两边因此共用同一份消息类型，而不是各写一套。

Bun 不参与「用户打开 VS Code 之后」的运行。它是安装依赖、跑脚本、跑单元测试的工具。见下一节。

### Bun

- 根 `package.json` 第 5 行锁定包管理器 `bun@1.3.10`。`docs/STATUS.md` 在 C2 运行时那一节也写了 Bun 1.3.10。
- `scripts/setup.sh` 第 23–24 行：上游目录和 oco 根目录都 `bun install --frozen-lockfile`（按锁文件安装，不浮动版本）。
- 根 `package.json` 第 6 行的工作区只有 `apps/extension` 和 `packages/contracts`。`apps/chat-webview` 不在工作区里，也没有自己的 `package.json`。`setup.sh` 第 25 行和 `build-webview.sh` 第 6 行用符号链接把 `vendor/opencode/packages/app/node_modules` 借给它。
- ADR-002 第 9 行和 `docs/ACCEPTANCE.md` 第 74 行：打好的 VSIX 不能要求机器上有 Bun，也不能依赖本机源码路径。

### SDK

官方应用的依赖里有 `@opencode-ai/sdk`，版本 `1.18.33`，与上游 tag 相同（`vendor/opencode/packages/app/package.json` 第 60 行写 `workspace:*`；`vendor/opencode/packages/sdk/js/package.json` 第 4 行是 `1.18.33`）。

oco 的 `app.tsx` 前 26 行没有 import 这个 SDK。它 import 的是 `@opencode-ai/app`、`@opencode-ai/core/util/encode` 和 Solid 路由。网络被换成 `bridgeFetch`（`app.tsx` 第 88 行）：网页不自己拿着服务器密码去访问。因此手册不要写成「oco 直接调用 OpenCode SDK」。SDK 在官方应用内部；oco 替换的是平台上的 `fetch`。

`docs/EVIDENCE.md` 第 44 行把「所有团队服务都能使用同一 SDK」列为当时未验证、禁止当成事实的句子。那是 2026-09-29 的计划围栏，不是「现在 SDK 坏了」的结论。

### Worker

Worker 是页面旁边的后台脚本，不和界面抢同一条执行线。官方对话用它给消息里的代码上色（Shiki 语法高亮）。

VS Code webview 不允许这个后台脚本自己去下载扩展里的文件。所以 `vite.config.ts` 第 145–149 行把每个 Worker 打成一份自包含的传统脚本（IIFE），由宿主在主线程读出脚本文本再交给 Worker。

同文件第 11–58 行进一步把常用语言（约 17 种，含 TypeScript、TSX、Markdown 等）打进这份脚本；其余语言在第一次用到时通过宿主垫片 `self.__ocoAsset` 读取 `shiki-langs/<id>.json`。第 61–80 行的插件在构建时发出这些 JSON。加载失败就退回纯文本，不让整条消息失败（第 41 行注释）。

ADR-002 第 11–12 行只记录了两个 oco 自己的构建插件（图标 sprite 内联、Worker IIFE）。当前 `vite.config.ts` 第 140–151 行还有 Shiki 语言资源和预加载，ADR 没改。第 116–133 行的 sprite 内联仍然在：webview 不能跨源使用 SVG `<use>`。

## 2. 锁定的上游与本仓库版本

| 项 | 值 | 出处 |
| --- | --- | --- |
| 上游仓库 | `https://github.com/anomalyco/opencode` | ADR-002 第 7 行；`setup.sh` 第 12 行克隆该 URL |
| Tag | `v1.18.33` | `scripts/setup.sh` 第 8 行；ADR-002 第 7 行 |
| 完整 SHA | `51ef4be1d3c122f18fefb510dca8d778571f4f18` | `setup.sh` 第 9 行；ADR-002 第 7 行。`setup.sh` 第 15 行不一致就退出 |
| 引入方式 | 浅克隆该 tag 到 `vendor/opencode`（gitignore），校验 SHA，按文件名顺序 `git apply` `patches/opencode/*.patch`，不用 submodule，不复用邻近的 opencode 目录 | ADR-002 第 8 行；`setup.sh` 第 12–20 行 |
| 许可 | MIT，打包时复制 `vendor/opencode/LICENSE` | ADR-002 第 7 行；`scripts/package-vsix.sh` 第 26 行 |
| oco 扩展版本 | `0.0.4` | `apps/extension/package.json` 第 4 行 |
| 发布者 | `oco-local-test`（不是应用市场身份） | 同文件第 5 行；`package-vsix.sh` 第 31 行生成的说明 |
| VS Code 引擎 | `^1.95.0`；类型包 `@types/vscode` `1.95.0` | 扩展 `package.json` 第 11 行；根 `package.json` 第 21 行 |
| TypeScript（oco 类型检查） | `5.8.2` | 根 `package.json` 第 24 行 |
| esbuild | `0.25.10` | 根 `package.json` 第 22 行 |
| Playwright 核心（E2E） | `1.56.1` | 根 `package.json` 第 23 行 |
| Bun | `1.3.10` | 根 `package.json` 第 5 行 |
| Vite | `7.1.4` | `vendor/opencode/package.json` catalog 第 86 行 |
| solid-js | `1.9.10`（上游还有 `patches/solid-js@1.9.10.patch`，第 153 行） | 同文件第 92 行 |
| tailwindcss / `@tailwindcss/vite` | `4.1.11` / `4.1.11` | 同文件第 85、61 行 |
| `@opencode-ai/sdk`（JS 包） | `1.18.33` | `vendor/opencode/packages/sdk/js/package.json` 第 4 行 |
| 打包器 `@vscode/vsce` | `4.0.0` | `package-vsix.sh` 第 41 行 |

`@solidjs/router` 的精确版本本轮没有从 catalog 里抽出来。能确定的是 `app.tsx` 第 20 行在用它，`vite.config.ts` 第 159 行要求和 `solid-js` 去重，避免打进两份。

上游应用自己的 TypeScript 在 `packages/app/package.json` 第 45 行写成 `catalog:`，本轮没有读到 catalog 里的数字。不要把它写成 oco 根上的 5.8.2。STATUS 里另有「上游 tsgo」类型检查，那是另一条命令，不是 `bun run typecheck`。

VSIX 文件名里的短 SHA 是 **oco 仓库的 `git rev-parse --short HEAD`**（`package-vsix.sh` 第 13、39–40 行），不是上游 `51ef4be`。工作区里能看到的包名从 `oco-0.0.1-…` 到 `oco-0.0.4-588f821.vsix` 都是历史产物；当前清单版本是 0.0.4。

## 3. 十八个补丁类别

`patches/opencode/` 下有 18 个文件，`setup.sh` 按 glob 顺序全部应用。ADR-002 第 13–15 行仍写「P1a 后共 2 个」，只解释了 0001 和 0002。那两段仍然对，但总数已过时。下面的「类别」以文件名为准；行为说明只引用本次读到的文档或 `app.tsx` 注释。

| 文件 | 类别（给手册用的一句） | 本次读到的依据 |
| --- | --- | --- |
| `0001-oco-draft-insert.patch` | 宿主把文本追加进当前输入草稿，不发送；要对上会话号再回报 | ADR-002 第 14 行 |
| `0002-oco-embedded-single-session.patch` | 嵌入模式去掉内部标签、首页、新建会话和终端入口 | ADR-002 第 15 行；`app.tsx` 第 75 行 |
| `0003-oco-narrow-dock-wrap.patch` | 窄面板里权限/提问坞的按钮允许换行，避免被裁掉点不到 | ADR-006 第 49 行；TEST-SCOPE 第 43 行 |
| `0004-oco-embedded-submit-waits-for-model.patch` | 嵌入模式下，模型和代理还没加载完就先等（ADR 写最多 20 秒），再提交 | ADR-006 第 59 行；TEST-SCOPE 第 44 行 |
| `0005-oco-open-file-in-host.patch` | 工具输出里的文件名交给 VS Code 打开，路径由宿主校验 | `app.tsx` 第 79–81 行；TEST-SCOPE 第 23 行 |
| `0006-oco-open-file-diff-summary-markdown.patch` | 与打开文件、Diff 摘要、Markdown 相关的上游改动 | 仅文件名 + TEST-SCOPE 第 23 行把它和 0005 放在同一回归行。ADR 正文没有这段说明 |
| `0007-oco-turn-diff-scope-unavailable.patch` | 单轮 Diff 的范围不可用时的展示 | 文件名；TEST-SCOPE 第 26 行；STATUS 写「单轮 Diff 展示已实现（补丁 0007）」 |
| `0008-oco-embedded-recovery-view.patch` | 嵌入模式下使用 oco 自己的错误 / 不可达 / 会话缺失画面 | `app.tsx` 第 85–86 行；TEST-SCOPE 第 25 行 |
| `0009-oco-embedded-settings-no-pty-shells.patch` | 嵌入设置里不提供 PTY/shell 一类入口 | 文件名；STATUS 标题「设置页高级开关（补丁 0009、0010）」；NEXT 第 5 行 |
| `0010-oco-embedded-visibility-defaults.patch` | 嵌入模式的默认可见性 | 同上，本轮没有更细的行为句 |
| `0011-oco-message-fork-buttons.patch` | 消息上的 fork 按钮 | TEST-SCOPE 第 33 行；NEXT 第 5 行 |
| `0012-oco-trajectory-view.patch` | 对话 / 轨迹视图（上游里新增模型、视图和会话页接线） | 文件名；TEST-SCOPE 第 34 行；NEXT 第 36–38 行 |
| `0013-oco-trajectory-i18n-tools-compact.patch` | 轨迹文案多语言、系统行「工具」页签、默认折叠 | NEXT 第 39 行；TEST-SCOPE 第 35 行 |
| `0014-oco-trajectory-toggle-state-subagent.patch` | 比例按钮选中状态；`task` 显示为子智能体行 | NEXT 第 40 行；TEST-SCOPE 第 36 行 |
| `0015-oco-embedded-keep-workspace-on-switch.patch` | 切换会话时保持工作区；会话信息还没到就可以按预置目录挂载 | `app.tsx` 第 76 行；TEST-SCOPE 第 38 行。STATUS 写它曾与另一批的 0014 撞号，后改为 0015 |
| `0016-oco-embedded-session-links-not-urls.patch` | 会话链接不要变成会打开系统浏览器的 URL；在本面板打开子会话 | NEXT 第 42 行；TEST-SCOPE 第 37 行 |
| `0017-oco-embedded-header-actions-inline.patch` | 嵌入模式去掉整行标题栏，状态和审查开关并入会话标题行 | NEXT 第 44 行 |
| `0018-oco-embedded-hide-session-more-menu.patch` | 嵌入模式去掉会话三点菜单；归档改到侧栏右键 | NEXT 第 43 行 |

这些是改上游树的补丁。另外还有只存在于 oco 构建配置里的调整（sprite、Worker、Shiki 资源、预加载），不算在这 18 个文件里。

## 4. 构建产物

根 `package.json` 第 9 行：`bun run build` = 先 webview，再扩展。

1. **扩展宿主包**：`apps/extension/dist/extension.js`。清单 `"main"` 指向它（扩展 `package.json` 第 12 行）。
2. **对话页**：`apps/extension/media/chat/`。含构建后的 `index.html`、JS 块、CSS、Worker 脚本、`shiki-langs/*.json`。`emptyOutDir: true`，这个目录是生成物，不是手写源码。
3. **静态媒体**（不由 Vite 清掉的那些）：`media/icon.png`、`icon.svg`、`oco-icons.woff` 等，跟扩展清单放在一起。
4. **VSIX**：仓库根上的 `oco-<扩展版本>-<oco 短 SHA>.vsix`。暂存内容是 `dist/extension.js`、整个 `media/`、上游 `LICENSE`、`CHANGELOG.md`、脚本生成的 `README.md`，以及忽略 `*.map` 和 `src/**` 的 `.vscodeignore`（`package-vsix.sh` 第 17–41 行）。脚本最后打印 `extension.js` 的 sha256。设 `OCO_SKIP_BUILD=1` 才跳过构建。
5. **不是产物**：`vendor/opencode`（本机签出）、符号链接来的 `apps/chat-webview/node_modules`、单元测试、E2E。

`scripts/deploy-remote.sh` 本轮只确认了开头约束：同一 `publisher.name-version` 必须已经在那台主机上装过，第一次安装另看文档（第 4 行附近）；第 10 行读扩展版本；第 30 行断言远端名字等于 `publisher.name-version`。没有读它的传输细节，手册不要从本审计补步骤。

## 5. 测试层，以及不能声称已经验收的东西

操作分层以 `docs/TEST-SCOPE.md` 第 5–15 行为准：

| 层 | 命令 | 证明什么 | 不证明什么 |
| --- | --- | --- | --- |
| 离线 | `bun run verify:brief`（typecheck + `bun test tests/unit`） | 类型和单元测试在那一次运行里的结果 | 界面、远程、真实模型 |
| 构建 | `bun run verify:brief -- --build` | 上述加上 webview 和扩展能打出来 | 同上 |
| 定向 E2E，mock | `OCO_E2E_MODEL=mock` 启动测试服务，再 `node tests/e2e/run.mjs <套件>` | 脚本模型按固定提示走工具调用，结果稳定 | 真实流式、取消时序、模型协议。`results.json` 里 `modelMode: mock`，`bun run brief` 不当成验收（TEST-SCOPE 第 15 行；README 第 72 行） |
| 定向 E2E，真实模型 | 测试服务不带该变量 | 发送、取消、流式、权限/问答这一类改动的收尾 | 不是全矩阵 |
| 全量真实模型 | `node tests/e2e/run.mjs` | TEST-SCOPE 第 13 行写默认 **20** 个套件 | 见下方「不能声称」 |
| 摘要 | `bun run brief` | 只扫描已有证据 | README 第 82–84 行：不启动测试、服务或模型 |

仓库里还有 `tests/integration/`（目录列表可见；STATUS 引用过 C2 的 HTTP/运行时测试）。TEST-SCOPE 的层级表没有单独的「集成」一行。`docs/ACCEPTANCE.md` 第 5 行有「证据层级」标题，用例表里出现 UNIT / INTEGRATION / UI（例如第 25、27 行）。不要把 TEST-SCOPE 的五层说成验收矩阵已经定义完的全部证据等级。

默认全量**不**包括 `t004`、`t005`（P0 历史）、`perf`、`smoke`。`p1b-ime` 的 `ime-real-macos` 要真人输入法，自动跑恒为 NOT RUN（TEST-SCOPE 第 57 行）。

### 不能声称的验收

本轮没有执行构建或任何测试。下面全部不是新的 PASS。

1. **不能把不同提交的绿结果拼成「当前全绿」。** README 第 100 行；STATUS 第 246 行写历史 E2E 是 `MIXED_REVISIONS`，禁止跨版本拼 PASS。STATUS 顶部最近一条离线记录是扩展英文化那一节：typecheck PASS、unit **169/169**、指定的 6 个 E2E 套件 41 项 PASS，并写明 **NOT RUN：其余 E2E**（第 8 行）。这是那次提交的记录，不是本审计复跑的结果。
2. **单元测试个数以文档为准会打架。** TEST-SCOPE 第 9 行仍写「136 个单元测试」和 2026-09-30 的耗时。STATUS 更早还有 100、165、166、168，顶部是 169。手册应写「以某次命令输出为准」，不要写死 136。
3. **默认套件数 README 是旧的。** README 第 74 行写 14 个；TEST-SCOPE 第 13 行和 NEXT 第 9 行写 20 个。以 TEST-SCOPE / `tests/e2e/run.mjs` 的 `DEFAULT_SUITES` 为准（本轮没有打开 `run.mjs`）。
4. **mock 通过 ≠ 真实模型验收。** NEXT 第 14 行仍是 TODO：同一次提交上、不带 mock 的 `node tests/e2e/run.mjs`。
5. **正式验收矩阵没有收口。** `docs/ACCEPTANCE.md` 第 3 行仍写「正式验收（T017）尚未开始」，未出现在 P0 记录里的用例都是 NOT RUN。NEXT 第 18–26 行显示 T017 里性能基线有 DONE，长时间内存和真实模型切换耗时仍是 TODO。正确读法：矩阵文件的开头没改；部分性能项做过；整张矩阵不能标完成。
6. **Remote-SSH 不能写成产品功能已验收。** ADR-004 当时写远程门槛未过。后来 STATUS 有 gcp-workstation 上的安装和若干复验，但 NEXT 第 16 行仍 TODO：断网恢复、本机粘贴图片（A11 剩余）。第 25 行有一条「已部署、Remote 未测」的主包压缩。多次写明用户必须 Reload Window。验收矩阵第 73 行：宣称可用的取消、图片、远程、恢复，缺真实验证就是发布阻断。
7. **不能宣称可发布。** README 第 7、108 行：原型；publisher 和正式扩展 ID 未定。NEXT 第 34 行 T018 仍要用户决定 publisher 和许可证。
8. **不能宣称有 Agents 管理视图。** 见第 6 节。
9. **ADR-002 第 23 行的包体「36 MB，其中 markdown worker 9.9 MB」是 2026-09-29 的数字。** 本轮没重新打包。STATUS 后来说主包从 4.04 MB 压到 1.18 MB gzip，那是另一次测量，也不能在本审计里当成刚刚称过的重量。
10. **`bun run brief` 或某次 typecheck 通过，不能用来声称 UI、远程、图片或真实取消已通过。** 这是仓库执行约定，也和 README 第 82–100 行一致。

## 6. 文档导览：设计、历史、当前入口

| 角色 | 文件 | 怎么读 |
| --- | --- | --- |
| 当前事实 | `docs/STATUS.md` | AGENTS.md 和 README 第 7 行指定的唯一现状。文件是新段落在上。顶部两节是 2026-10-01。第 19 行「本文件更新于 2026-09-30」属于下面那一节的写作日期，不是整份文件的日期。 |
| 当前队列 | `docs/NEXT.md` | 第 3 行：唯一队列；不要执行 HANDOFF 或 P1B-NEXT-STEPS 里的旧提示词。但它里面大量是 DONE 日志，不是一张干净的待办。未做的以仍标着 TODO 的行为准（真实模型全量、A11 剩余、长时内存、T009/T010/T011、管理页、正式 publisher 等）。 |
| 开工入口 | `AGENTS.md`、README 第 9–18 行 | 先 STATUS、NEXT 和任务点名的契约。PLAN、架构、任务、验收、证据按需。PROGRESS 和 HANDOFF 明确是旧记录（README 第 18 行）。 |
| 给人用的说明 | `docs/USER-GUIDE.md` | 安装、attached/managed、侧栏操作。产品行为以它和扩展清单为准，不以 PLAN 的设想为准。 |
| 设计 / 计划当时的话 | `docs/PLAN.md`、`docs/EVIDENCE.md`（日期 2026-09-29）、ADR-001 到 ADR-004 的「当时决定」 | 见下面的矛盾。它们解释为什么这样选，不是 2026-10-01 的实现清单。 |
| 仍有效的构建决定 | ADR-002 的 tag、SHA、Bun 不进运行时、Vite+esbuild 分工、升级时要重放补丁 | 补丁个数、插件列表、包体大小已经落后于树。 |
| 历史批次 | `docs/PROGRESS.md`、`docs/HANDOFF.md`、`docs/P1B-NEXT-STEPS.md`、STATUS 中下部每一节 | 只说明那一次提交证明了什么。 |

### 过时或互相矛盾的描述

1. **活动栏名字。** 扩展清单 `viewsContainers` 标题是 `oco`（`apps/extension/package.json` 第 259–261 行），视图名是 Sessions / Connection。README 第 43 行和 USER-GUIDE 第 28、30 行仍写「侧栏 OpenCode → Sessions / Connection」。解读：用户在活动栏上看到的字是清单里的 `oco`；文档沿用了早期产品名。不要两边都当成界面原文。
2. **Agent 视图。** README 第 5 行产品形态仍是「左侧管理会话和 Agent」。`docs/EVIDENCE.md` 第 8、29、34 行把 Agent 列表写成需求来源。USER-GUIDE 第 3 行写「oco 不自己跑 Agent」。NEXT 第 33 行和 STATUS「移除 Agents 视图」那一节：用户决定去掉 Agents，改成默认折叠的 Connection；代码可从提交 `2b40651` 恢复。解读：README 开篇和 EVIDENCE 是设计输入；当前界面没有 Agents 视图。
3. **上游 tag 是否已锁定。** PLAN 第 57 行：`v1.18.33` 只是候选，不是已确认兼容版本。ADR-002 第 7 行和 `setup.sh` 第 8–15 行已经锁定 tag 和 SHA。EVIDENCE 第 15 行：邻近目录的 opencode 检出是 `dev`，`git describe` 为 `v1.4.11-1810-g2c4ad9f40`，当地看不到这个 tag；那只说明那个目录不是基线。解读：手册写 SHA 时引用 setup.sh / ADR-002，不要引用 PLAN 的「候选」句，也不要引用邻近目录。
4. **测试运行器。** PLAN 第 55 行优先 Vitest。根 `package.json` 没有 Vitest，第 14 行是 `bun test tests/unit`。解读：计划没回写；现在就是 Bun 自带测试。
5. **补丁数量与构建插件。** ADR-002 第 13 行「共 2 个」对不上磁盘上的 0001–0018。插件也不止 ADR 列出的两个。解读：ADR-002 仍是「如何钉上游、如何升级」的合同；补丁清单以 `patches/opencode/` 为准。
6. **套件数与单元测试数。** README 14 套对 TEST-SCOPE/NEXT 的 20 套；TEST-SCOPE 136 个单元对 STATUS 顶部 169。解读：README「第一批工作」和第 74 行没随 v0.1 更新。README 第 7 行已经警告不要把 README 当功能列表，当前队列看 NEXT。
7. **STATUS 自相矛盾的日期。** 顶部是 2026-10-01 的部署记录，第 19 行又说文件更新于 2026-09-30。解读：按节阅读，不要把第 19 行当成整文件时间戳。
8. **NEXT 自己也叠了旧部署。** 第 10 行 DONE 的包是 `oco-0.0.1-44e4b8a.vsix`；第 43 行版本已到 0.0.4。解读：DONE 行是当时的事实，不是「现在装的就是 0.0.1」。当前清单版本看扩展 `package.json`。
9. **ACCEPTANCE 开头对不上 NEXT。** 「T017 尚未开始」与 NEXT 里已经 DONE 的性能基线并存，同时全量真实模型和 A11 剩余仍未做。解读：没有一份文档等于「验收已全部通过」或「验收完全没开始」。
10. **EVIDENCE 第 39–48 行的「禁止当作既成事实」。** 其中包括「官方 App 已经能在 webview 里跑」。P0 之后的 STATUS 表明打过补丁的官方应用可以在 webview 里跑。解读：那一节是开工前的围栏，防止把讨论当成证明。不能把整节抄进手册当现状，也不能反过来把围栏里每一条都标成已经证明（例如「替换 fetch 就覆盖全部 SSE、WebSocket、图片和取消」仍然没有被这轮审计证明；ADR-003 第 14 行写 WebSocket 未桥接，v0.1 不提供终端）。
11. **EVIDENCE 第 55–58 行** 说 `acceptance-<date>.md` 要在 T017 创建。本次 `docs/` 列表里有 `ACCEPTANCE.md`，以及 `docs/evidence/p1a-acceptance.md`、`p1b1-acceptance.md`，没有看到 `acceptance-<date>.md` 这个名字。解读：验收记录换了文件名，不要空等那个文件名。
12. **开发宿主端口和默认服务器。** README 第 43 行让开发宿主把 `oco.serverUrl` 设为 `http://127.0.0.1:4517`（隔离测试服务）。扩展清单默认是 `http://127.0.0.1:4096`（第 238 行）。USER-GUIDE 第 19 行的例子也是 4096。解读：4096 是普通 `opencode serve` 的例子；4517 是本仓库测试服务。不是两套产品默认值打架。
13. **package-vsix 与某次历史打包。** STATUS 曾写 vsce 缓存坏了、改用 `npx @vscode/vsce@3`。脚本现在钉的是 `bunx @vscode/vsce@4.0.0`（第 41 行）。解读：以脚本为准，那次是例外。

## 7. 官方一手入门文档（未在本轮打开）

以下是各项目自己的文档，不是转载教程。Solid、Vite、esbuild、TypeScript、Tailwind、Bun、MDN、VS Code、OpenCode 的域名都是项目或标准文档的常规入口。本轮没有用浏览器打开它们。

- TypeScript 手册：<https://www.typescriptlang.org/docs/handbook/intro.html>
- TSX 所用的 JSX：<https://www.typescriptlang.org/docs/handbook/jsx.html>
- Solid 入门：<https://docs.solidjs.com/guides/getting-started>
- Solid 响应式：<https://docs.solidjs.com/guides/reactivity>
- Solid Router：<https://docs.solidjs.com/solid-router/getting-started/installation>
- DOM 介绍（MDN）：<https://developer.mozilla.org/en-US/docs/Web/API/Document_Object_Model/Introduction>
- Web Worker（MDN）：<https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers>
- Vite 入门：<https://vite.dev/guide/>
- esbuild 入门：<https://esbuild.github.io/getting-started/>
- Bun 文档：<https://bun.com/docs>
- Tailwind 配合 Vite（v4）：<https://tailwindcss.com/docs/installation/using-vite>
- VS Code Webview：<https://code.visualstudio.com/api/extension-guides/webview>（EVIDENCE 第 26 行已引用）
- OpenCode 文档与 Server：<https://opencode.ai/docs/> 、<https://opencode.ai/docs/server/>（EVIDENCE 第 32 行已引用）

OpenCode SDK 的公开入门页没有出现在本次授权阅读的文档里。版本只锁定到 vendor 里的 `1.18.33`，不猜文档路径。

## 8. 本轮限制

- 工具调用主要用于点名文件。`app.tsx` 只读了前 120 行。`deploy-remote.sh` 只抽了版本断言，没有抄部署步骤。
- 未读 `src/main.tsx`、`tests/e2e/run.mjs`、ADR-002 以外的上游源码。补丁 0006、0009、0010 没有独立的行为段落可引用。
- 未测量当前 VSIX 或 worker 体积，未重放补丁，未核对 tag 是否仍能从 GitHub 克隆。
- 官方 URL 未逐个打开。
