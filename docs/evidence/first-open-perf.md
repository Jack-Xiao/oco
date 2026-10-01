# 首次打开会话提速（2026-10-01）

用户反馈：打开第一个会话要等很久。本批在 Remote-SSH（gcp-workstation，经 gcloud IAP 隧道）上实测定位，并做了三项改动。基线 `d3ec2e9`，改动未提交。

## 测量方法

- 探针：[remote-probe.mjs](first-open-perf/remote-probe.mjs)。本机真实 VS Code 1.139.1，每次用全新配置档连 `ssh-remote+gcp-workstation`，用 `--extensionDevelopmentPath=vscode-remote://…/home/user/oco-perf/<版本>` 加载被测版本（不动远端已安装的扩展），在命令面板打开同一个已有会话（`今日测试记录`），从按下回车开始计时。
- 指标：`skeleton` 骨架屏出现；`prompt` 输入框出现；`content` 以 markdown worker 加载结束近似内容渲染完成。另记 webview 资源时间线和前 200 个桥接请求。
- 旧版和新版逐轮交替运行。原始结果：`first-open-perf/remote-*.json`。
- 远端服务：`opencode serve --port 4096`（用户已有服务，只读打开会话，不创建、不修改）。

## 发现

1. **隧道吞吐在两种状态间跳变**：同一文件在不同轮次 0.6–1 MB/s 或 6–19 MB/s。慢的时候，4 MB 主包 + 0.5 MB CSS 要 4–6 s，是首开慢的主要来源；单次对比结果不可信，只能交替多轮取中位。
2. **markdown worker 9.9 MB**：我们的 worker 构建（IIFE + `inlineDynamicImports`）把 shiki 全部约 235 种语法和约 60 个主题都内联了。慢隧道下光这个文件就要 2.7–3.8 s。
3. **远端 `/provider` 响应 6.5 MB**，服务端每次计算约 1–1.3 s，且服务端是单线程的。页面启动时会请求三次（不带目录两次、带目录一次），其中第一次处在首屏关键路径上。
4. `<head>` 里的 `oc-theme-preload.js` 会阻塞渲染，在隧道上要等一个往返，并且和主包抢带宽（实测最长等了 2.2 s）。

## 改动

| 项 | 内容 | 位置 |
| --- | --- | --- |
| 1 | worker 构建里把 `shiki` 换成同 API 的模块：内置 17 种常用语言，其余语法作为 `shiki-langs/<id>.json`（`{deps, grammar}`，共 236 个 / 6.3 MB）按需加载，经主线程垫片 `__ocoAsset` 获取（路径白名单 `shiki-langs/*.json`）；不带内置主题。加载失败的语言按纯文本显示。worker 9.9 MB → 2.17 MB | `apps/chat-webview/vite.config.ts`、`apps/extension/src/panels.ts` |
| 2 | 静态骨架屏（`#oco-boot`，内容渲染到 `#root` 后移除）；宿主内联 `oc-theme-preload.js`；构建时对 app 主包 `modulepreload` 并提前链接其 CSS，让下载和握手并行 | `apps/chat-webview/index.html`、`src/main.tsx`、`vite.config.ts`、`panels.ts` |
| 3 | 面板创建时由宿主预取 `GET /provider`，页面第一个同路径请求直接用结果（30 s 内有效，只用一次）；页面桥接请求计数和前 200 条请求日志（`__OCO_STATS__.fetchRequests/fetchLog`） | `apps/extension/src/bridge-core.ts`、`bridge-host.ts`、`apps/chat-webview/src/bridge.ts` |

尝试后撤回的做法（按测量结果）：

- webview 内合并同时发出的相同 GET：并发请求只省 3–4 / 38 个；而且变更或事件之后发出的读请求可能会并入变更前的请求，拿到旧数据。撤回。
- 桥接响应 gzip：慢隧道时桥接通道并不慢（慢的是静态资源通道），而压缩 6.5 MB JSON 在 2 核工作站上有 CPU 开销，快隧道下反而更慢。撤回。
- 同时预取 `/provider?directory=`：两次服务端计算约 2.4 s，把页面的第一个请求 `/global/health` 堵了约 1.5 s，快隧道下首开慢了约 0.9 s（5 轮一致）。撤回。
- 预取结果 10 s 内多次复用：`p1a-identity` 6 次运行中有 3 次失败（草稿已确认送达但输入框为空，之后无法提交；基线 3/3 通过、关闭预取 3/3 通过）。推断是启动之后的 `/provider` 重新请求拿到了启动时的缓存结果。改为只用一次后连续 6 次 14/14 通过。

## 结果（Remote，隧道快，逐轮交替）

| 版本 | 输入框出现 | 内容完成 | 骨架屏 |
| --- | --- | --- | --- |
| 旧版 `d3ec2e9` | 3881 / 3049 / 2908 / 2884 ms，中位 2979 | 中位 3237 | 无（空白） |
| 本批 | 2397 / 2368 / 2229 / 2913 ms，中位 2383 | 中位 2304 | 336–395 ms |

- 每组 5 轮，各有 1 轮因隧道没连上未出数据（`QUICK` 为空），不计入。
- 慢隧道：本批构建未在"慢"状态下交替实测（后几组全部落在快状态）。早期单次数据：旧版 12.9 s（worker 3.8 s），本批早期构建 8.5–9.4 s（worker 1.4–1.8 s），但受隧道波动影响，只作参考。
- 本机（mock）：影响很小，本来就在 1–1.5 s。

## 回归检查（本机，脚本模型 mock，最终构建）

- typecheck PASS；unit 143/143（新增 prefetch 2 条）。
- E2E：`p1a-identity` 连续 6 次 14/14（运行 `20260930-193523`…`194305`）；`p1b-theme-load` 3/3、`p1a-chat` 8/8、`t010-recover` 5/5、`p1b-main-panel` 6/6（运行 `194432`、`194455`、`194531`、`194712`）。
- worker 高亮探针：ts（内置）、ruby 和 vue（按需加载，含依赖）有语法着色；未知语言按纯文本显示。
- NOT RUN：其余 E2E 套件、真实模型、慢隧道下的交替对比。

## 部署事故与处理

- 按 [remote-install](../remote-install.md) 原步骤覆盖安装时，暂存目录 `<扩展>.new` 建在扩展目录内，运行中的 VS Code Server 把它登记为该扩展；改名后登记指向不存在的目录，oco 从窗口里消失。已手工把 `extensions.json` 的登记改回正确路径（原文件备份在工作站的 `~/.oco-ext-backup/`），并修改文档，把暂存目录移到扩展目录之外、替换后复查登记。
- 00:39（本地时间）另一个会话（worktree `v01-completion`，提交 `2b40651`）往同一台工作站装了它的构建。本批此后不再改动已安装的扩展，测试全部用 `--extensionDevelopmentPath` 加载独立目录。**工作站上当前装的是 `2b40651`，不是本批的构建。**

## 追加：桥接 gzip（2026-10-01 第二轮）

- 依据：用户真实会话日志（工作站 `oco.log`，VS Code 重启后恢复面板）：激活 → 面板 ready 4.8 s；首个 `/provider` 返回（00:10:41.7）到下一批请求（00:10:47.4）之间 5.7 s 无请求，与 6.5 MB 经隧道传到面板吻合（慢隧道约 1.1 MB/s）。之后第二、三次 `/provider` 又各 6.5 MB，与会话消息共用通道。基线探针 `remote-before-1.json` 的 7.5 s API 阶段同样落在慢隧道下。
- 第一轮"gzip 在快隧道更慢"的结论不成立：那次构建同时预取了 `?directory`，后来证实变慢来自该预取。
- 实现：`CoreDeps.compress`（`vscode.env.remoteName` 存在时开启）；`content-type` 含 json、`content-length` ≥ 256 KiB、非 SSE、无 `content-encoding` 时，`zlib.createGzip({ level: 1 })` 流式压缩，`fetch.head` 带 `encoding: "gzip"` 并去掉 `content-length`；页面用 `DecompressionStream("gzip")`。`/provider` 6,512,726 → 568,881 字节，远端压缩约 65 ms CPU。
- 坑：zlib 输出块是共享缓冲区上的视图，直接 `postMessage` 后面板解压失败（页面显示连不上服务器）；每块复制成独立 `Uint8Array` 后正常。
- 检查：unit 145/145（新增 2 条：大 JSON 压缩且往返一致；小响应、非 JSON、本地面板不压缩）；`OCO_BRIDGE_GZIP=1`（阈值 0，所有 JSON 都压缩）下 `p1a-chat` 8、`p1a-identity` 12+（日志被前一次中止运行的残留进程写乱，未失败）、`p1b-theme-load` 3、`t010-recover` 5、`p1b-main-panel` 6，无失败，runner exit 0。
- NOT RUN：gzip 的 Remote 交替对比（运行中工作站重启，用户的 4096 服务没有自动启动，按约定未代为启动）。

## 追加：暂缓 `/provider`（2026-10-01 第三轮，替换预取）

- 用户实测部署版（`7ddac21`）体感约 3 s。工作站上 oco 默认用托管模式（每个窗口自己启动 `opencode serve --port 0`），探针窗口同样如此。
- 页面时间线（[remote-now-1](first-open-perf/remote-now-1.json)、`ab10-*`）：首屏只需要会话消息（`GET /session/:id/message`），不需要 `/provider`；但消息请求到达服务端时，服务端常在算某个 `/provider`（宿主预取或页面自己的，每个 1.1–1.4 s，单线程），消息被拖 1–1.4 s。在临时服务（4597，测完已关）上复现：同一批里 3 个 `/provider` 串行共 3.3 s，排在后面的 `/command` 也要等 3.3 s；`/message` 单独只要 0.04 s。
- 两次失败的尝试：
  - 预取结果 5 s 内复用、任何写请求作废（`p1a-identity` 3/3 通过）：4 份大响应同时到达面板，把 `/message` 挤在后面，首屏反而慢 1 s（4.16 vs 3.17 s），撤回。
  - 先预取 `/session/:id` 再预取 `/provider`：`/session/:id` 本来就不慢，没有改善（3.36 vs 3.21 s），撤回。
- 采用：去掉 `/provider` 预取；每个文档启动时，宿主把页面的 `GET /provider`（含 `/api/provider`）暂缓到该文档第一个 `GET /session/:id/message` 有响应之后再发给服务端，最多等 3 s（`bridge-core.ts` 的 `DEFERRED` / `FIRST_PAINT` / `DEFER_MS`）。
- 结果（Remote，与已部署的 `7ddac21` 逐轮交替，各 4 轮，[ab11](first-open-perf/)）：

  | | `7ddac21` | 暂缓 `/provider` |
  | --- | --- | --- |
  | 冷开输入框出现 | 3449 / 2814 / 3355 / 3239，中位 3297 ms | 1316 / 1403 / 1237 / 1712，中位 1360 ms |
  | 同窗口第二个会话 | 1844 / 1754 / 1940 / 2032，中位 1892 ms | 802 / 772 / 741 / 1387，中位 787 ms |

  截图确认消息和模型名都已显示。`content` 指标为空是因为测试会话文字少于判定阈值。

## 未解决

- 静态资源（约 4.5 MB）只在窗口内首次加载时经隧道传输：同窗口第二次打开时旧包 0.4 s（`cache-1`，VS Code webview 资源缓存）。放到本地 UI 侧扩展可以去掉首次这部分，属于架构改动，暂不做。
- `/provider` 6.5 MB 和服务端单线程计算属于 OpenCode 服务行为；页面启动时的第二、三次请求仍会各占用服务端约 1 s，但都在首屏之后。
