# P0 原型运行记录（T003–T005）

```text
Run date:        2026-09-29
oco commit:      45f0423（测试时工作区代码与之相同）
upstream:        anomalyco/opencode v1.18.33 @ 51ef4be1d3c122f18fefb510dca8d778571f4f18 + patches/opencode/0001
Server:          opencode 1.18.33，本地隔离实例 127.0.0.1:4517，Basic 认证，模型 opencode/big-pickle
VS Code:         1.139.1，扩展开发宿主，隔离 profile
Client/host OS:  macOS 27.2 arm64（本地模式，客户端即宿主）
Connection:      attached（服务由 scripts/test-server.sh 独立启动）
```

所有 UI 用例由 Playwright 驱动真实 VS Code（Electron）完成，操作包括命令面板、编辑器输入、webview 内点击；结论另外通过服务端 API 核对（`tests/e2e/server.mjs`），而不是只看界面。原始结果：`p0-artifacts/t004-results.json`、`t005-results.json`、`perf-results.json`，截图同目录。

## 1. 结果

| 用例 | 对应验收 | 状态 | 观察 |
| --- | --- | --- | --- |
| 可复现构建 | A17（部分） | PASS | 干净 clone 执行 `scripts/setup.sh` + `bun run build`，资源文件名（内容哈希）与原构建一致；产物不含本机绝对路径 |
| 官方 UI 在 webview 运行 | P0-1 | PASS | 官方 App 源码构建挂载到编辑器标签页；CSP 违规 0 |
| 文本流式 | A04 | PASS | UI 渲染 7–18 次增量；服务端 `finish: stop` |
| 工具 + 权限 | A04/A05 | PASS | bash 权限 dock 出现，点“Allow once”，工具 `completed` 且输出含标记 |
| 提问交互 | A05 | PASS | 模型调用 `question` 工具；UI 选择 blue，工具 `completed` |
| 真实取消 | A06 | PASS | 点停止后服务端 141 ms 回 idle，助手消息 `MessageAbortedError`，文本不再增长 |
| 三会话同时打开 | A08 | PASS | 3 个编辑器标签页，各自会话身份 |
| 草稿隔离 + 隐藏/恢复 | A08/A09 | PASS | A/B/C 草稿互不串；隐藏的 webview 被销毁后从宿主存储恢复 |
| 重复打开聚焦 | A08 | PASS | 重复打开同一会话不新增标签页 |
| 未保存选区加入指定草稿 | A03 | PASS | 用户在 QuickPick 显式选择 B；B 追加内容且保留原草稿；A/C 不变；未自动发送 |
| 服务端收到未保存内容 | A03 | PASS | 发送后服务端用户消息含未保存的标记行和文件正文 |
| 并发权限路由 | A05 | PASS | A、C 同时待决；C 面板只显示 C 的命令并拒绝，A 面板只显示 A 的命令并允许；服务端 A `completed`、C `error` |
| 图片字节 | A07（部分） | PASS | 463 字节 PNG 以 `image/png` data URL 到达服务端，逐字节一致 |
| Reload Window 恢复 | A09 | PASS | 标签页数一致；未发送草稿恢复 |
| 关闭标签页不等于取消 | A06/A12 | PASS | 关闭运行中会话的标签页后服务端仍 busy，最终 `finish: stop` 无错误 |
| 远程（Remote-SSH） | A11 / P0-6 | BLOCKED | 无远程主机 |
| 系统剪贴板粘贴图片 | A07 | NOT RUN | 用例通过合成 `ClipboardEvent`（真实 PNG 字节）进入官方粘贴处理；未测 macOS 真实剪贴板/快捷键 |
| 中文输入法、键盘快捷键全集、主题跟随 | A07/A10 | NOT RUN | P1 |

## 2. 性能基线（单次采样，macOS arm64）

| 指标 | 值 |
| --- | --- |
| 新建会话到输入框可用 | 1.4–1.7 s（含约 0.4 s 脚本输入命令） |
| 隐藏标签重新显示到可用 | 2.6–3.0 s（含约 1.5 s 脚本输入），实际重挂载约 1.1–1.5 s |
| VS Code 进程总内存 | 空闲 1230 MB → 1 个可见会话 1586 MB → 3 个会话（1 个可见）1354–1664 MB |
| 每个可见会话 | 约 +350 MB 渲染进程内存（一个完整官方 App 实例） |
| 事件连接 | 每个已挂载面板 1 条 `/global/event` 流；T005 中每次重新显示都重新挂载，共 21 次挂载 |
| 包体 | webview 资源 36 MB，其中 markdown worker 9.9 MB（全部 Shiki 语法内联） |

`retainContextWhenHidden: false`：隐藏的标签页会释放 App 实例，因此 3 个会话的内存不是 3 倍；代价是每次切回都重新挂载并重新拉取数据。

## 3. 过程中发现并解决的问题

| 问题 | 原因 | 处理 | 位置 |
| --- | --- | --- | --- |
| 回环地址的 SSE 不走 `platform.fetch` | `server-sdk.tsx:191-199` 仅对非回环 http 使用 `platform.fetch` | webview 只知道虚拟地址 `http://oco.bridge`，所有请求（含 SSE）都经宿主；CSP `connect-src` 不含服务器，绕过者会被拦截并暴露 | `packages/contracts`、`panels.ts` |
| 图标 sprite 被拦截 | webview 中跨源 `<use href=".../sprite.svg#id">` 被 Chromium 拒绝 | 构建期把两个 sprite 内联进 DOM | `apps/chat-webview/vite.config.ts` |
| Markdown/diff Worker 崩溃，整页错误边界 | webview 中 Worker 无法从资源源加载任何内容（请求永不返回） | Worker 打包为自包含 IIFE；宿主注入垫片在主线程取码，经 blob 启动；`script-src` 增加 `blob:` | `vite.config.ts`、`panels.ts` |
| 宿主向草稿插入内容 | 官方没有外部追加草稿的入口 | 一个上游补丁：composer 监听 `oco:draft-insert` 事件并追加文本；宿主等 composer 就绪再投递 | `patches/opencode/0001-oco-draft-insert.patch` |
| 刚打开即发送提示“Select an agent and model” | 官方 App 在 agent/model 同步完成前拒绝提交 | 未修改（官方行为）；测试等待模型名出现 | P1 可在宿主显示加载状态 |

## 4. 已知问题（未解决，进入 P1）

1. **官方内部标签栏泄露其他会话**：新布局的 tabs 状态经 `Platform.storage` 全局共享，每个面板内部都显示全部已开会话，可在一个 VS Code 标签页内切到另一个会话，破坏“面板 = 会话”身份。P1 必须收敛为单会话模式（按面板隔离或禁用内部 tabs/导航），这是 T010 的首要工作。
2. 宿主存储目前为全局作用域的整表读写（`globalState`），多面板并发写同一 name 时后写覆盖；P1 需要按 key 存储或加版本。
3. VS Code 标签标题不随会话标题更新（官方内部标题已更新）。
4. 主题固定为官方浅色，不跟随 VS Code 深色主题。
5. 每次重新显示都重新挂载完整 App（约 1.1–1.5 s），并新建一条事件流；共享订阅未实现。
6. 终端：v0.1 未挂载终端，但持久化的 `terminal.opened` 可能使其建立 WebSocket（上游调查见 `upstream.md`）；经虚拟地址会被 CSP 拦截，P1 需显式禁用入口。

## 5. 如何复现

```bash
bash scripts/setup.sh
```

```bash
bun run build
```

```bash
bash scripts/test-server.sh
```

```bash
node tests/e2e/t004.mjs
```

```bash
node tests/e2e/t005.mjs
```

```bash
node tests/e2e/perf.mjs
```

E2E 需要本机安装 VS Code（路径可用 `OCO_VSCODE_BIN` 覆盖）。测试会启动独立 profile 的 VS Code 窗口，不影响日常 VS Code 配置。
