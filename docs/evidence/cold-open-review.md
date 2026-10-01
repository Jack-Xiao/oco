# 冷启动改动审查（只读）

范围：`git diff main..HEAD -- apps packages tests`（8 文件，+66/−28）。未改产品代码，未跑构建或 E2E。model/provider：unknown（本次工具返回未带）。

结论：没有 high。错误页、恢复页、logo 闪屏这三条不会把骨架屏永久留在可操作界面上。有两处 medium（慢启动时 `/provider` 仍会提前放行；`serverReady` 跳过健康检查后，启动期恢复页不再出现）。

## 确认的问题

### medium — 慢启动时 `painted` 等不到，3 s 就会放行 `/provider`

- 文件：`apps/extension/src/bridge-core.ts:53`（`DEFER_MS = 3_000`）、`:181-185`；对比 `apps/chat-webview/src/main.tsx:32`（骨架 10 s）。
- 触发：同一 generation 的 `ui "painted"` 还没到，暂缓的 `GET /provider` 在 3 s 时 `Promise.race` 结束并真正发到服务端。骨架可以一直盖到 10 s，官方健康检查自身也有 10 s 超时（`vendor/opencode/packages/app/src/app.tsx:451`）。
- 后果：Remote 首开若慢于 3 s（`docs/evidence/cold-open.md` 里改动 3 之前的 cold1 有 3.6–6.6 s），补取消息仍会排在第一次 `/provider` 后面。这正是改动 3 要避开的情况。`painted` 只在快于 3 s 时才赢。
- 同文件 `:142`：超时拆掉骨架时也会发 `painted`，所以 10 s 路径本身会开闸；缺口是 3 s 到 10 s 这一段。

### medium — `serverReady` 是写进 HTML 的一次性快照，启动期恢复页被跳过

- 文件：`apps/extension/src/panels.ts:151-154`（`state === "connected"` 且 `connectionId` 相等才为 true）、`apps/chat-webview/src/app.tsx:182`（`disableHealthCheck={init.serverReady === true}`）。
- `connectionId` 比对本身不会把「另一台服务器」标成 true。托管服务重启后 id 故意不变（`apps/extension/src/endpoint.ts:30-35`，哈希是 binary+目录+用户，不是进程代际）。过期 true 只来自：写 HTML 时宿主仍是 `connected`，页面跑起来时进程已经死了，宿主还没改状态。
- 跳过之后，`ConnectionGate` 的阻塞健康检查和它的 unreachable 恢复页在这个 document 里不会再武装（`vendor/.../app.tsx:438-440,473-487`）。断线之后：
  - 能显示的是顶栏 `ConnectionBanner`，不是整页恢复页。而且要等页面 `ready`（`apps/chat-webview/src/app.tsx:243` 无条件调用）之后宿主才送 `connection`（`panels.ts:262`、`:394-396`：未 ready 的 `setConnection` 直接丢掉）。
  - `connecting` 不显示横幅（`apps/chat-webview/src/recovery.tsx:162`）。`reconnecting` 会显示。
  - 会话抛错仍会进恢复页：找不到会话走 `recoveryView(session-missing)`（`vendor/.../session.tsx:219-221`），其它错误走 `ErrorPage` → `recoveryView`（`session.tsx:248`、`vendor/.../pages/error.tsx:222-224`）。查询停在加载、不抛错时，没有整页恢复页。
- 重载会重新 `initFor`，快照会更新。同一 document 里 `disableHealthCheck` 不会随断线改回 false。

### low — 骨架用「任意 textContent」判断，空白也算；10 s 有必要，点击会穿透

- 文件：`apps/chat-webview/src/main.tsx:26-32`；`apps/chat-webview/index.html:27`（`pointer-events: none`，z-index `2147483000`）。
- `root.textContent` 不 `trim`。任何非空文本（含纯空白、壳层上的一个标题）都会 `done("text")` 并立刻发 `painted`。闪屏本身没有文本节点（`vendor/opencode/packages/ui/src/components/logo.tsx:18-31` 只有 path），所以不会被闪屏提前拆掉。这同时说明：健康检查闪屏一直不拆骨架，**10 s 超时是必要的**，否则 `serverReady === false` 时骨架永不移除。
- 已核对、不会盖住不拆的页面：
  - 错误页 / 会话缺失 / unreachable 恢复页都在 `#root` 里且有标题正文（`apps/chat-webview/src/recovery.tsx:33-61`）。出现文本的同一次 mutation 就会拆骨架。恢复页 z-index 10000 低于骨架，但文本一出现骨架就没了。
  - 空会话输入框：旧 composer 有 `[data-component="prompt-input"]`（`vendor/.../prompt-input.tsx:1515-1516`），没文本也会 `done("composer")`。
- 残留：盖住期间点击穿透（`pointer-events: none` 是原有的，这次把盖住时间从「`#root` 出现子节点」拉长到「出现文本或 10 s」）。用户能点到还看不见的控件。没找到「无文本、无 prompt-input、又必须操作」的启动页（权限/登录不在这份 webview 里；宿主持有凭据）。
- 背景回退是 `transparent`（`index.html:27`）。`--vscode-editor-background` 若晚于首帧注入，会透出 `#root` 的深色 `bg-v2-background-bg-deep`。测量里 18 次没出现，代码上仍有这一帧的可能。

### low — 同 document 切换会话不会再发 `painted`，也不再靠 `DEFER_MS`

- 文件：`main.tsx:14-32`（只在 `#oco-boot` 存在时发 `painted`）；`bridge-core.ts:108-115`（只在 `hello` 时新建 `firstPaint`）、`:141-142`。
- 触发：同一面板、同一 directory 内切换会话不重载（`panels.ts` 的 in-place navigate）。骨架早已移除，不会再发 `painted`。闸门在第一次 `open()` 后保持 resolved，之后的 `GET /provider` 仍走进 `:182` 的 if（`deferred` 计数 +1），但 `await` 的是已完成的 promise，**不会再等 3 s**。
- 这和旧的「首个消息列表打开闸门、一开就不再关」一样，不是回归。`DEFER_MS` 只兜「这个 generation 始终没有 `painted`」（没有骨架、或页面在 10 s 前被杀掉且定时器没跑）。重载会 `retire` + 新 HTML + 新 `hello`，骨架和闸门都重新来过（`panels.ts:293-298`）。
- gen 不匹配：`bridge-core.ts:120-122` 先丢掉整个消息，`:142` 的 `firstPaint.gen === gen` 是第二道。旧 document 的 `painted` 开不了新闸。`retire()` 不把 `firstPaint` 置空，但 generation 已是 0，消息进不了 switch。
- 契约：`packages/contracts/src/bridge.ts:56,131,162-163`。`painted` 在 `UI_ACTIONS` 里，不在集合内的 action 会被 `parseWebviewMessage` 变成 null。`painted` 不转给 `onUi`（`bridge-core.ts:142-143`），面板逻辑不会误处理。

### low — MutationObserver 不是持续开销

- 文件：`main.tsx:26-31`。`subtree + characterData` 会在首屏每次批量 mutation 上跑一次回调（不是每个节点一次），回调里做 `querySelector` 和 `textContent`。一旦 `textContent` 非空或出现 prompt-input 就 `disconnect`。流式输出阶段不再观察。`characterData` 是为了接住「已有空文本节点后来被填上」。启动窗口内可以接受。

## 测试缺什么

已覆盖：

- `tests/unit/bridge-core.test.ts:177-196`：消息列表和父消息返回之后 `/provider` 仍被扣住；`generation - 1` 的 `painted` 无效；当前 gen 的 `painted` 放行；放行后再请求不再多等。解析器不认识 `painted` 的话这条会失败，所以契约登记被间接盖住。
- `tests/e2e/p1b-theme-load.mjs:43-46`：`boot.reason` 为 text 或 composer、闪屏节点没出现过、骨架已拆、`serverReady === true`。测的是「闪屏没挂载」（健康检查被跳过），不是「闪屏挂了但被 z-index 盖住」。

没覆盖：

- 不发 `painted` 时 3 s `DEFER_MS` 放行（medium 那条回退没有测试）。
- 骨架 10 s `timeout`、错误页/恢复页文本拆骨架、只有空白文本、`serverReady === false` 时闪屏被盖住而不是提前拆。
- `connectionId` 不一致必须是 false；断线后横幅 vs 整页恢复页。
- `painted` 不调用 `onUi`；同 gen 在 `retire` 之后被忽略（现有「gen-1」用例是在 `:120` 被拒，没有走到 `:142`）。
- 宿主是否收到 `painted`（e2e 只读页面上的 `__OCO_STATS__.boot`）。

## 未查

- `@opencode-ai/session-ui/v2/prompt-input` 的 DOM：新布局 composer 是否可能既没有 `[data-component="prompt-input"]` 也没有文本节点。旧 composer 和 e2e 选择器都认 `prompt-input`；v2 源文件这次没打开。
- `DialogProvider` 是否把权限对话框 portal 到 `document.body`（那样会在 `#root` 尚无文本时被骨架盖住最多 10 s，点击仍穿透）。
- 宿主把 `connected` 判成断线的探测间隔（决定过期 `serverReady` 的窗口有多长）。
- 未运行 `bridge-core` 单测和 `p1b-theme-load`。
