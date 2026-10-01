# 会话切换黑屏与首开提速（Remote，2026-10-01）

用户反馈：打开会话仍然有点慢；连续打开多个会话时，前几个切换很快，后面的会慢、有时黑一下。本机不明显，Remote 上明显。基线为已部署的 `dc9ecc2`。

## 测量方法

- 探针 [switch-probe.mjs](switch-perf/switch-probe.mjs)：本机真实 VS Code 1.139.1，独立配置档（`.oco-test/sw`）经 Remote-SSH 连 gcp-workstation（`/home/user/ai`，托管模式，探针窗口自己的 `opencode serve`），基线用远端已安装的扩展，修复版用 `--extensionDevelopmentPath` 加载 `~/oco-perf/<版本>`，不动已安装扩展。依次点侧栏前 14 个会话（主面板原地切换），第二轮再全部点一遍。
- 每帧采样（rAF）：屏上第一行时间线的 `data-message-id`、输入框、`#root` 文本长度。消息 ID 事先从工作站数据库只读取出。**上屏** = 第一行属于目标会话（空会话：没有行）；**空白帧** = `#root` 文本长度为 0（整个面板空，深色主题下即黑屏）。
- 页面桥接记录每个请求的开始、响应头、结束和字节数（`__OCO_STATS__.fetchRecent`，最近 300 条）；宿主切换时写日志 `switch in place to <id>`。
- 隧道速度在不同组之间波动，所以基线和修复版逐组交替运行。原始数据：`switch-perf/ab-*.json`，汇总：`node switch-perf/summarize.mjs ab-base2 ab-fix3 …`。
- 早期几组（`base1`、`diag1` 等）用“有消息行”判定完成，会把上一个会话还没撤下的内容也算成新会话；它们只保留作请求时间线参考，结论不引用其耗时。

## 发现

1. **黑屏**：上游 `ResolvedTargetSessionRoute` 用 `<Show when={directory()}>` 包住整个会话工作区，目录取自会话信息缓存。页面启动时只载入当前目录最近 5 个根会话（`context/global-sync/child-store.ts` 的 `limit: 5`）。切到第 6 个及以后的会话时，信息不在缓存里，整个工作区（输入框、文件树）被卸载，等 `GET /session/:id` 回来才重新挂载全部 provider，之后才请求消息，并重新拉 `/command`、`/mcp`、`/experimental/resource`。结果是整页空白一个往返，再串行一个往返。基线每组 12 次首访里都有 9 次出现空白帧，正好是前 5 个之外的那些。上游注释也写明它依赖切换目标已被侧栏预取，而 oco 用的是 VS Code 侧栏。
2. **桥接 gzip 实际没生效**：服务端对 fetch 默认的 `Accept-Encoding` 自己做了 gzip，Node fetch 解压后仍保留 `content-encoding`，桥的条件 `!content-encoding` 因此跳过压缩，解压后的内容原样经隧道发给面板。工作站实测：`/provider` 服务端发 387 KB，面板收到 6.56 MB（宿主 level 1 重压缩为 556 KB，耗时 31–44 ms）；472 KB 会话的消息列表服务端发 283 KB，面板收到 482 KB。服务端压缩与否对它自己的耗时影响不大（交替 3 轮各 1.1–1.5 s）。
3. **首开后的第一次切换要 5.5–6.6 s**：文档启动时有 4 个 `GET /provider`。策略层会把 `?directory=` 改写成请求头，所以到服务端时这 4 个完全相同。它们在首屏之后被同时放出；服务端单线程，每个算 1.1–1.4 s，排队约 5 s。远端 `oco.log`：08:15:14.24 切换，该会话的 `/session` 直到 08:15:20.08，也就是 4 个 `/provider` 都返回之后，才有响应。
4. **首开**：主包加载完后有 3 段串行往返：健康检查 → 会话信息 → 挂载工作区后才请求消息。
5. 有一组（`diag1` 第二轮）出现过点击到页面收到 `navigate` 0.4–2.5 s 的延迟，期间页面没有请求在跑；宿主处理是同步的，其他各组没有复现，判断为隧道抖动（未确认）。

## 改动

| 项 | 内容 | 位置 |
| --- | --- | --- |
| 1 | 补丁 0015：嵌入模式下目录记忆为“最近一次已知”，首开用宿主给的目录（`Platform.embeddedDirectory`），切到未缓存会话时工作区不卸载。会话信息和消息并行请求；上一会话的内容由上游 transition 保留到新会话数据到达 | `patches/opencode/0015-…`（`pages/session.tsx`、`context/platform.tsx`）、`apps/chat-webview/src/app.tsx` |
| 2 | 输入框在显示的会话变化后发 `oco:composer-session`；页面收到新会话的这个事件后才向宿主报告 `ready`（最多等 5 s）。原来是 `navigate` 后两帧就报告，transition 未提交时草稿会投到旧输入框并被拒绝 | 补丁 0015（`prompt-input-v2.tsx`）、`app.tsx` |
| 3 | 桥接 gzip：服务端已压缩（fetch 已解压）的 JSON 也重新 gzip，并去掉过时的 `content-length` / `content-encoding`；未压缩 JSON 的门槛 256 KiB → 32 KiB | `apps/extension/src/bridge-core.ts` |
| 4 | 同一文档里同时在途、完全相同的 `GET /provider` 只发一次到服务端，各自拿一份完整响应。不缓存已返回的结果；页面有任何写请求之后到达的读不并入之前的请求（按到达顺序记写序号） | `bridge-core.ts` |
| 5 | 诊断：页面 `fetchRecent`（带计时）；宿主切换日志 | `apps/chat-webview/src/bridge.ts`、`apps/extension/src/panels.ts` |

## 结果（Remote，逐组交替，每组 14 个会话 × 2 轮）

| 组 | 版本 | 首开上屏 | 首开后第一次切换 | 其余首访中位 / 最大 | 首访有空白帧 | 回访中位 |
| --- | --- | --- | --- | --- | --- | --- |
| ab-base2 | 已装 dc9ecc2 | 1879 | 6289 | 625 / 877 | 9/12 | 197 |
| ab-base3 | 已装 | 1386 | 5665 | 388 / 604 | 9/12 | 120 |
| ab-base4 | 已装 | 1484 | 5696 | 376 / 554 | 9/12 | 120 |
| ab-fix1 | 改动 1–3 | 1714 | 6587 | 277 / 562 | 0/12 | 137 |
| ab-fix2 | 改动 1–3 | 1569 | 5543 | 266 / 468 | 0/12 | 135 |
| ab-fix3 | 改动 1–4 | 1495 | 1477 | 236 / 523 | 0/12 | 112 |
| ab-fix4 | 改动 1–4 | 2193 | 2404 | 404 / 611 | 0/12 | 201 |

单位 ms，从点击侧栏到目标会话自己的内容上屏。`ab-base1` 因托管服务启动慢、侧栏 30 s 未出现而没有数据。

- 黑屏：基线 3 组每组 9/12，修复版 4 组均为 0/12。
- 首开后第一次切换：5.5–6.6 s → 1.5 / 2.4 s。剩下的是等服务端算一次 `/provider`。
- 首访其余会话：同一隧道状态下修复版更低（236–404 对 376–625 ms 中位），但受隧道波动影响，不作精确倍数比较。

首开预置目录（改动 1 的 `embeddedDirectory` 部分），与不预置的版本交替各 4 次，每次只开 3 个会话（`open-fix3-*` 对 `open-fix5-*`）：

| | 不预置 | 预置 |
| --- | --- | --- |
| 健康检查发出 → 消息请求发出 | 287 / 410 / 392 / 271，中位约 340 ms | 193 / 193 / 111 / 177，中位约 185 ms |
| 健康检查发出 → 内容上屏 | 882 / 877 / 733 / 575，中位约 805 ms | 691 / 602 / 416 / 569，中位约 585 ms |
| 点击 → 内容上屏（含主包加载） | 1803 / 2041 / 1910 / 1426 | 1826 / 1704 / 1140 / 1395 |

## 本机检查（mock 模型，最终构建）

- typecheck PASS；unit 168/168（新增 4 条：服务端已压缩的 JSON 重新 gzip、64 KB JSON 压缩、在途 `/provider` 合并、写请求之后不合并）；上游 `tsgo -b` 0 错误；补丁 0001–0015 在固定 SHA 上重放，结果与 vendor 树一致。
- E2E `p1b-main-panel` 新增 2 项（共 8 项）：
  - `switch-uncached-ready`：切到页面未缓存、会话信息和消息都被扣 3 s 的会话 D2。期间屏上仍是上一会话，宿主 `ready=false`；D2 上屏（3.05 s）后 `ready=true`。**变异**（改回“两帧后报告 ready”）：`midReady: true`，FAIL。
  - `switch-uncached-no-blank`：只扣 3 s 会话信息（模拟 Remote：消息先回）的会话 D1，要求 D1 在信息到达前上屏且没有空白帧。**限制**：本机上游代码（撤掉 0015 的目录记忆）也通过（D1 在 55 ms 上屏、无空白帧）。在本机没能复现“整页卸载”的条件，原因未查明（时间盒用完）。所以此项只是回归防护，消除黑屏的证据是上面的 Remote 数据。
- 全量 E2E（mock，21 套件）：18 个 exit 0；`p1b-sidebar`（改名、搜索）和 `t007-multiroot`（new-session-in-folder）失败，单独重跑均通过；`t013-agents` 的 `duplicate-preserves-bytes` 失败，为已记录的环境问题（`.oco-test` 是链接目录）。`OCO_BRIDGE_GZIP=1` 下 `p1a-identity` 14/14、`p1a-chat` 8/8。

## 合入与部署后复验

- 合入与部署：原补丁号 0014 与 main 上另一批次的 0014（轨迹）重号，改为 0015，rebase 到 main 后提交 `d73bf91` 并快进合入 main。集成后 `verify:brief --build` PASS（typecheck 0 错误、unit 168/168、build）；E2E（mock）`p1b-main-panel` 8/8、`c4-trajectory` 14/14；补丁 0001–0015 在固定 SHA 上重放与 vendor 树一致。`oco-0.0.1-d73bf91.vsix` 部署 gcp-workstation，远端 `extension.js` 哈希一致（`7aaf9981…`）。
- Remote 复验（已安装扩展，探针 `deployed-d73bf91`，14 个会话 × 2 轮）：首访空白帧 0/12；首开后第一次切换 941 ms；其余首访中位 415 / 最大 621 ms；回访中位 200 ms；页面收到的 `/provider` 为 556 KB（原 6.56 MB）。用户已打开的 Remote 窗口需 Reload Window 后才加载新代码。与修复前已装版本（`ab-base2`–`ab-base4`：每组 9/12，首开后第一次切换 5.7–6.3 s）对照。

## 限制与未解决

- 大会话：新会话数据到达前，屏上保留的是上一个会话的内容（上游 transition 行为），没有加载提示。472 KB 的会话在快隧道下约 0.5 s。
- 首开后约 1.5 s 内的第一次点击，仍要等服务端算完一次 `/provider`（1.2–1.4 s）。缓存 `/provider` 结果曾导致 `p1a-identity` 失败（见 [首开提速证据](first-open-perf.md)），这次没有再做。
- 首开仍有健康检查一个往返；窗口内第一次加载静态资源（约 4.5 MB）仍要经过隧道。
- 跨目录切换仍会重载文档（工作站上只有一个会话在 `/home/user`）。
- NOT RUN：真实模型 E2E；慢隧道状态下的交替对比。已安装扩展上的复验见上节。
