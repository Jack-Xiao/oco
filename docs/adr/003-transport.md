# ADR-003：传输、认证边界与状态

> P1a 更新（2026-09-29）：协议升至 v2（文档 generation 握手）、新增桥策略、凭据按服务身份隔离、存储改为逐 key 并接管官方 localStorage。以 [ADR-005](005-p1a-identity-storage-connection.md) 为准；下文保留 P0 决定作为历史。

状态：已采纳（P0 原型），部分目标架构待 P1。日期：2026-09-29。证据：`docs/evidence/p0-spike.md`。

## 决定

- **宿主持有网络连接**。webview 中的官方 App 只知道虚拟地址 `http://oco.bridge`（非回环，使官方 SSE 也走 `platform.fetch`）。`platform.fetch` 把请求序列化为消息（方法、头、ArrayBuffer body），宿主校验后映射到真实服务，加入认证，逐块回传（`fetch.head` / `fetch.chunk` / `fetch.end` / `fetch.error`），webview 以 `ReadableStream` 重建 `Response`。`AbortSignal` → `fetch.abort` → 宿主 `AbortController`。
- **凭据只在宿主**：webview 的服务器配置不含密码；宿主剥离 webview 提供的 `authorization`/`cookie`/`host` 等头。
- **桥只接受虚拟源 URL**，拒绝任意地址；消息有协议版本与面板 epoch，运行时校验（`packages/contracts/src/bridge.ts`），过期 epoch 丢弃。
- **CSP**：`default-src 'none'`；脚本仅 nonce + 资源源 + `blob:`（仅用于 Worker 垫片）；`connect-src` 不含服务器地址，任何绕过桥的请求都会被拦截。P0 E2E 中违规数 0。
- **状态**：会话与消息以服务端为准；`Platform.storage` 与草稿（含图片 blob）存在宿主（`globalState` + `globalStorageUri/blobs`，sha256 命名，20 MB 上限）；面板恢复只存会话绑定（webview state）。
- **WebSocket**：未桥接。v0.1 不提供终端，需在 P1 显式禁用入口（`upstream.md` 终端一节）。

## P0 实测限制

- 每个挂载的面板一条事件流；重新显示即重新挂载并重新订阅。共享订阅、慢面板有界队列、重连快照协调尚未实现（T008）。
- 宿主存储是整表读写，并发写需在 P1 改为逐 key。
- 远程：设计上宿主在远端、webview 在本地，桥不依赖 localhost 可达；未运行验证（BLOCKED）。
