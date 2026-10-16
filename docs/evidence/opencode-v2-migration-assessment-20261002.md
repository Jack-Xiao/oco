# oco 迁移到 OpenCode V2 的工作量评估（2026-10-02）

> 只读评估，不改产品代码。上游事实见 [V2 调研](opencode-v2-upstream-20261002.md)。

## 证据级别与基线

| 项 | 值 |
| --- | --- |
| oco | `90260bb`（本评估开始时的 HEAD） |
| 上游 V1 基线 | `v1.18.33` `51ef4be1d3c122f18fefb510dca8d778571f4f18`（与 `scripts/setup.sh` 钉的 SHA 一致） |
| 上游 V2 | `v2.0.22` `527f0b931d1f9b3ebd34e106c51b31ce5db5b075`（2026-10-02 发布） |
| 证据级别 | SOURCE：只读比较两个上游 worktree 与 oco 源码；没有安装依赖、构建、运行或跑 E2E |
| NOT RUN | V2 构建、嵌入、E2E、Remote、性能 |

文中“估算”“推测”都不是实测结果，验证方式见第 5 节。

## 结论

1. 嵌入路线在 V2 仍成立：`@opencode/app` 仍导出 `AppBaseProviders`、`AppInterface`、`Platform`、`PlatformProvider`、`ServerConnection`；会话路由仍是 `/server/<key>/session/<id>`；客户端仍走 `platform.fetch`；事件仍是 SSE；Basic 认证（用户名 `opencode`）、`x-opencode-directory` 头、`opencode serve --hostname --port`、`OPENCODE_SERVER_PASSWORD` 与 `server listening on <url>` 日志都还在。SOURCE
2. 但前端几乎重写：`packages/app` 从 V1 到 V2 改了 910 个文件（+112,991/−141,153），只有 6 个文件原地修改。补丁改到的 26 个已有上游文件中有 20 个在 V2 已不存在，另外 6 个大改（如 `message-part.tsx` −2,642 行）。补丁需要按新结构重写，不能 rebase。SOURCE
3. 服务端 API 全部换成 `/api/...`（113 个路径、136 个操作），且没有 V1 兼容路由：当前 oco 的 V1 前端不能接 V2 服务，反之亦然。宿主侧直接调用的 V1 接口、事件名、桥策略都要改；V2 会话 PATCH 只接受 `title`、`metadata`、`permissions`，oco 的“归档”没有对应的公开写法。SOURCE
4. 估算：一次性迁移约 18–37 人天（常规工程口径），区间主要来自补丁/功能重写（6–14）和测试（4–8）。若同时支持 V1、V2 两种服务，另加 5–10 人天。按本项目 9/29–10/02 的实际推进节奏折算约 1–2 周日历时间。估算
5. 时机：V2 前端仍在快速变化——v2.0.0 到 v2.0.22 的三周里 `packages/app/src` 改了 513 个文件（+37,158/−56,741），GUI 扩展系统（`packages/gui-extensions/src`，807 个文件）整体是这段时间新增的；公开 API 路径数 119→113。V1 仍是 npm 默认版本并在维护。现在做补丁迁移，返工概率高。SOURCE/推测
6. 现在值得做两件小事：(a) 识别 V2 服务并给出明确提示（0.5–1 人天）。用户本机 `opencode` 变成 V2 后，当前 oco 的版本探测和事件订阅都请求不到 V1 路径，界面会表现为“版本未知 + 连接失败”（代码推断，未运行）。(b) 1–2 人天的 spike，验证 V2 能否在 webview 中构建运行，以及能否用 V2 的 GUI 扩展点替代多数补丁。
7. 建议的整体迁移启动条件：`opencode-ai@latest` 切到 2.x 或 V1 停止维护；V2 前端每周改动量明显下降；spike 证明扩展点可由嵌入方注册。

## 1. 接触面对照

| 接触点 | oco 位置 | V1.18.33 用法 | V2.0.22 现状 | 影响 |
| --- | --- | --- | --- | --- |
| 前端挂载 | `apps/chat-webview/src/app.tsx` | `@opencode-ai/app`：`AppBaseProviders`、`AppInterface`、`createDraftStore`、`PlatformProvider`、`ServerConnection`、`Platform` | `@opencode/app` 导出 `AppBaseProviders`、`AppInterface`、`preloadRoute`、`Platform`、`PlatformProvider`、`ServerConnection`；不再导出 `createDraftStore`；`AppInterface` 去掉 `disableHealthCheck`，新增 `canonicalLocalServer` | 改导入与挂载 |
| Platform | 同上 | `platform: "web"` 加 `windowID`；补丁加的 `embedded`、`embeddedDirectory`、`openFileInHost`、`recoveryView` | `web` 平台类型不允许 `windowID`；补丁字段全无；新增 `openPath`、`openLocalFile`、`revealPath`、`extensions`（GUI 扩展桥）等可选项 | 重写适配 |
| 路由 | 路由守卫 `classifyRoute` | `/server/<b64 key>/session/<id>` 与旧 `/<b64 dir>/session/<id>` | 保留前者（`shell/routes/routes.tsx`），旧格式已删；新增 `/settings` | 小改 |
| 其他导入 | `app.tsx` | `@opencode-ai/app/i18n/desktop-native`、`@opencode-ai/core/util/encode` | 前者改为 `@opencode/app/i18n/desktop-native`；app 不再依赖 core | 小改 |
| 构建 | `apps/chat-webview/vite.config.ts` | 上游 `packages/app/vite.js` + sprite 内联 + Worker IIFE + shiki 裁剪；bun 1.3.14 | `vite.js` +49/−8；markdown、pierre 两个 Worker 仍在；provider 图标 sprite 仍在；要求 bun 1.4.2；包名改为 `@opencode/*` | 中 |
| 宿主 API | `extension.ts`、`session-feed.ts`、`bridge-host.ts`、`panels.ts` | `/global/health`、`/session` CRUD、`/session?directory&roots&limit`、`/session/status`、`/permission`、`/question`、`/event` | `/api/info`、`/api/session`（列表返回 `data`+`cursor`，支持 `search`、`cursor`、`directory`）、`/api/session/active`、`/api/permission/request?location`、按会话的 `/api/session/{id}/form`、`/api/event` | 重写 |
| 事件 | `session-store.ts` | `session.created/updated/status/idle/error/deleted`、`permission.asked/replied`、`question.asked/replied/rejected` | 保留 `session.created/deleted/status/idle`、`permission.asked/replied`；无 `session.updated`（改为 `session.renamed`、`session.metadata.updated`、`session.moved`、`session.forked` 等）；无 `session.error`（改为 `session.execution.failed` 等）；`question.*` 改为 `form.created/replied/cancelled`；共 89 种事件 | 重写 reducer |
| 桥策略 | `bridge-policy.ts` | V1 路径规则；拦截 `directory` 查询覆盖；权限回复 `/permission/:id/reply` 需反查归属 | 目录用 `location[directory]` 查询或原请求头；权限回复改为 `/api/session/{id}/permission/{req}/reply`（路径含会话）；全局写接口增多（credential、integration、plugin、mcp、config、project、worktree 等） | 重写并逐项审查 |
| 认证 | `endpoint.ts`、`connection.ts` | Basic，用户名 `opencode` | 相同；另支持 `auth_token` 查询与配对会话 cookie | 无 |
| managed 启动 | `managed-server.ts` | `serve --hostname 127.0.0.1 --port 0`，`OPENCODE_SERVER_PASSWORD`，正则 `listening on (https?://…)` | 参数同名；读 `OPENCODE_PASSWORD` 或 `OPENCODE_SERVER_PASSWORD`；日志为 `server listening on <url>`，现有正则可匹配 | 基本兼容，待运行验证 |
| 版本识别 | `diagnostics.ts` `VERIFIED_SERVER = "1.18.33"` | `/global/health` | `/api/info` 返回 `version`、`pid`、`urls`、`paths` | 改 |
| 归档 | 侧栏菜单 | `PATCH /session/:id {time:{archived}}` | PATCH 只接受 `title`、`metadata`、`permissions`；schema 有 `time.archived` 字段但未找到写入接口 | 另行设计或去掉 |
| 测试 | `tests/` | E2E 6,231 行、64 个 `data-*` 选择器；mock LLM 走 `@ai-sdk/openai-compatible`；集成测试 `c2-diff-*` 直接导入 V1 服务内部模块 | 使用最多的 `data-component="prompt-input"`（50 处）与 `data-action="prompt-submit"` 在 V2 不存在；V2 core 仍依赖 `@ai-sdk/openai-compatible`；`serve` 参数兼容 | 中到大 |

## 2. 补丁逐个评估

补丁共 18 个：新建文件 1,671 行（主要是轨迹视图），改动上游已有文件 +1,336/−252 行。V2 的 GUI 扩展点（`packages/gui-extensions/src/sdk/points.ts`：Command、Menu、Panel、Setting、Server、Link、Status、Slot、Style）可能替代一部分补丁，但扩展列表来自内置清单或桌面主进程的桥（`runtime/extension/installed.ts`），嵌入方能否注册自己的扩展需要 spike 确认。

| 补丁 | 目的 | V2 对应位置 / 可能替代 | 方式 | 估算（人天） |
| --- | --- | --- | --- | --- |
| 0001 draft-insert | 宿主向草稿追加文本 | `composer/` 重写；`prompt-parts.ts`、`submission-state.ts` | 重写 | 0.5–1 |
| 0002 embedded-single-session | 关闭标签、home、新建、终端 | `shell/tabs`、`home`、`/settings` 路由；终端变为 GUI 扩展 | 重写，或 Platform 字段 + 关闭扩展 | 1–2 |
| 0003 narrow-dock-wrap | 窄屏换行 CSS | Style 扩展点 | 改用扩展或小补丁 | 0.25 |
| 0004 submit-waits-for-model | 发送前等模型就绪 | `composer/submission-state.ts` | 重写 | 0.5–1 |
| 0005 open-file-in-host | 文件名在 VS Code 打开 | Link 扩展点；`Platform.openPath` / `openLocalFile` | 可能不需要补丁 | 0.25–1 |
| 0006 diff-summary-markdown | Diff 摘要打开文件 | review 内置扩展 | spike 后决定 | 0.5–1 |
| 0007 turn-diff-scope-unavailable | 单轮 Diff 不可用提示 | `/api/session/{id}/diff`、revert stage/commit | 重写 | 0.5–1 |
| 0008 embedded-recovery-view | 自定义错误/断线页 | `shell/errors`、`session/route-error.tsx` | 重写 | 0.5–1 |
| 0009 settings-no-pty-shells | 设置页去掉 PTY | `settings/` 重写；终端为扩展 | 关闭扩展可能替代 | 0.25 |
| 0010 visibility-defaults | 嵌入默认显示项 | `settings/` 重写 | 重写 | 0.25–0.5 |
| 0011 message-fork-buttons | 每条消息的 fork 按钮 | V2 自带 `/fork` 命令与 fork 对话框 | 可改用原生 | 0–1 |
| 0012–0014 trajectory | 轨迹视图（oco 自有，约 2,200 行） | 消息/片段/事件模型都变了；可挂到 Panel 或 Slot | 重写模型与挂载 | 2–4 |
| 0015 keep-workspace-on-switch | 切会话保持工作区 | Location 语义变化 | 重写或不再需要，需验证 | 0.25–1 |
| 0016 session-links-not-urls | 子会话链接不当网址 | Link 扩展点 | 可能不需要补丁 | 0.25 |
| 0017 header-actions-inline | 标题栏操作并入 | Slot `session.header` | 可能不需要补丁 | 0.5–1 |
| 0018 hide-session-more-menu | 隐藏“更多”菜单 | 时间线重写 | 重写 | 0.25 |

合计约 8–16 人天；若扩展点路线可行，0005、0011、0016、0017 等可降到下限，补丁数也会减少。

## 3. 工作量估算

常规工程口径（一名熟悉 oco 的工程师；含测试与文档；不含等待服务、设备的时间）：

| 工作包 | 内容 | 人天 |
| --- | --- | --- |
| A spike 与决策 | V2 在 webview 中构建运行；mock 模型流式回复；验证嵌入方能否注册 GUI 扩展；定补丁还是扩展路线 | 1–2 |
| B 宿主侧 | V2 API 适配与会话 CRUD；侧栏事件流与快照（`/api/event` 无参数，事件自带 location，V2 前端在客户端按目录过滤；forms、permission）；桥策略重写与 136 个操作逐项审查；managed、版本表、诊断；归档替代方案 | 4–7 |
| C webview 挂载与构建 | 导入与 Platform 适配；DraftStore、存储垫片、主题、语言；sprite/Worker/shiki 调整；CSP；关闭不支持的内置扩展（终端、浏览器、SSH、WSL、更新、配对）；bun 1.4.2 | 2–4 |
| D 补丁与功能 | 见第 2 节 | 6–14 |
| E 测试与验证 | 单元测试；`c2-diff` 集成测试改写；E2E 选择器与 V2 测试服务；全量 E2E；Remote 部署；首开与切换性能对比 | 4–8 |
| F 文档与收尾 | 新 ADR（取代 ADR-001/002/003 的相应部分）、`setup.sh`、STATUS/NEXT/PROGRESS、技术手册 | 1–2 |
| 合计 | | 18–37 |

- 同时支持 V1 与 V2 服务：需要两套前端包、两套适配层、两组 E2E，另加约 5–10 人天，长期维护成本也翻倍。估算
- 迁移后每次跟进 V2 新版本：按当前改动速度，补丁路线每次估计 0.5–2 人天；扩展路线可能更低，要看 spike 结果。估算
- 日历时间：本项目 9/29 起步，到 10/02 已完成 P0→v0.1 和 18 个补丁（见 PROGRESS）。迁移的工作内容约相当于其中较大一部分，再加上 spike 与 V2 带来的未知项，按同样的并行委派方式约 1–2 周。这一折算假设 V2 前端在迁移期间不再大改。推测

## 4. 风险与未知

- V2 前端变动快：三周内 `packages/app/src` 改 513 个文件，GUI 扩展系统整体新增；迁移中途很可能需要再追一次版本。
- 扩展点是否对嵌入方开放未确认：内置扩展是静态导入的，“已安装”列表来自桌面主进程。可能需要一个小的注册补丁，才能把 oco 的扩展加进去。
- 内置 GUI 扩展在 webview 中的行为未知（终端的 PTY 走 WebSocket，见 `packages/client/src/solid/pty.ts`，oco 的桥不转发 WebSocket；还有浏览器、SSH/WSL、更新器），需要确认能否按平台或设置关闭。
- 功能缺口：会话归档无公开写接口；V2 不运行 LSP（对 oco 无直接依赖，但影响用户体验）。
- 包体积与首开性能：V1 包 36 MB（ADR-002）；V2 未测。
- Remote（gcp-workstation）需要全套回归。
- V1 停更时间未知；用户可能同时装了 V1 与 V2（两者都用 `opencode` 命令，`@opencode/cli` 还提供 `opencode2`）。

## 5. 建议的步骤与验收

1. 现在：识别 V2 服务。连接时探测 `/api/info`，若返回 2.x，就提示“此 oco 版本只支持 OpenCode V1，请在 `oco.opencodePath` 指定 V1 可执行文件”，并补单元测试。验收：mock 一个 V2 `/api/info` 时出现明确提示，不再显示“版本未知”。
2. spike（1–2 人天，单独分支）：
   - 用 v2.0.22 构建 webview，挂载一个会话，经宿主桥连接 `opencode serve` 2.0.22，用 mock LLM 跑通流式回复和一次权限请求。
   - 尝试用一个 Link 处理器和一个 `session.header` Slot 替代 0005 和 0017，记录需要的注册补丁行数。
   - 记录包体积、CSP 违规数、首开耗时。
   - 验收：上述三项有运行证据，并据此定下路线和更新本估算。
3. 满足启动条件后整体迁移，顺序：宿主适配层 → webview 挂载 → 补丁/扩展（先做不需补丁的）→ 测试 → Remote。每一步都跑相关 E2E。

## 6. 方法（可复现）

```bash
git -C <上游克隆> worktree add --detach ../oc-v11833 v1.18.33
git -C <上游克隆> worktree add --detach ../oc-v2022 v2.0.22
# 补丁改到的文件在两个版本中是否存在、改动量
grep -hE '^\+\+\+ b/' patches/opencode/*.patch | sed 's#^+++ b/##' | sort -u
git diff --numstat v1.18.33 v2.0.22 -- <file>
git diff --shortstat v1.18.33 v2.0.22 -- packages/app/src
git diff -M --name-status v1.18.33 v2.0.22 -- packages/app/src   # A/D/R/M 计数
git diff --shortstat v2.0.0 v2.0.22 -- packages/app/src          # V2 内部变动
python3 读取 packages/protocol/openapi.json                       # 路径、参数、请求体
grep oco 源码中的 V1 路径、事件名与 data-* 选择器
```

## 7. 委派记录

| task_id | 唯一写入范围 | requested_route | actual_provider/model | agent_id/run_id | 状态 | 结果与 fallback_reason |
| --- | --- | --- | --- | --- | --- | --- |
| v2-migration-assessment | 本文件；STATUS/PROGRESS 本批条目 | grok-worker（只读源码调查） | unknown/unknown（主线程接手；按会话规则不在仓库写入模型标识） | 当前主线程 | 已返回 | 与上一批相同：本会话代理列表无 grok-worker、gemini-worker，无 grok-build:grok-delegate 技能；容器内无 grok、gemini 命令。主线程接手，未使用其他模型子代理。checkpoint：本文件（首轮写入，完成时覆盖） |
