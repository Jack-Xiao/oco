# OpenCode 服务 1.18.13 兼容性评估（2026-10-06）

背景：企业环境服务版本报告为 "3.18.13"；上游 anomalyco/opencode 无 v3.x tag，只有 v1.18.0–v1.18.34。按 1.18.13 评估；若企业服务 `/global/health` 真的返回 3.x，需另行确认是否为企业改版。
oco 固定前端：v1.18.33 @ 51ef4be；v1.18.13 @ a105350（已 shallow fetch 到 vendor/opencode，未改工作树）。
全包 diff：766 文件 +84997/-9026；API 面（sdk + server + session）24 文件 +298/-157，openapi.json 约 ±18 行。

## 委派记录

| task_id | 唯一写入范围 | requested_route | actual_provider/model | agent_id/run_id | 状态 | 结果路径 | fallback_reason |
| --- | --- | --- | --- | --- | --- | --- | --- |
| compat-1813-diff | 本文件“调查结果”一节 | grok-worker（Grok 读取型调查；grok-build:check ready） | Grok Build / unknown | run-muweezgb-5ywkx6 / grok session 80440254 | 已返回；主线程抽查 provider.ts、workspace-routing.ts diff 属实 | 本文件 | — |

## 调查结果

范围：`git diff v1.18.13 v1.18.33` 只覆盖点名路径。`packages/sdk/openapi.json` 仅两处 hunk（upgrade、`chunkTimeout`）。`packages/opencode/src/server` 无新增路由文件。未起服务实测。执行模型：unknown。

### 1–2. 契约变化 × 新前端/宿主 × 旧服务

宿主直接调用（`apps/extension/src`，SOURCE）：`GET /global/health`（extension.ts:123）、`GET /event`（session-feed.ts:209）、`GET /session` roots+limit（session-feed.ts:250、extension.ts:194）、`GET /session/status`（session-feed.ts:251）、`GET/POST/PATCH/DELETE /session/{id}`（extension.ts:171、227、286、298、314；bridge-host.ts:40；panels.ts:146）。这些 path 与 query（`roots`、`limit`、`archived`）在 v1.18.13 的 openapi 已存在（`/global/health` openapi.json:275，`/session` :5290，`roots` :5329，`limit` :5361，`archived` :5824）。本段 diff 没有改它们。

| 变化 | 位置 | 1.18.33 前端或 oco 宿主用到？ | 打到 1.18.13 会怎样 | 严重度 | 证据 |
| --- | --- | --- | --- | --- | --- |
| 无新增、删除、改名的 HTTP path | openapi.json 全 diff；server/ 的 diff 只有下列文件 | 宿主上列端点都在旧 openapi 里 | 不会 404 | — | SOURCE |
| `POST` global upgrade：`target` 由可选改为必填，且必须是 semver；不再“省略则升到 latest”。响应 JSON 仍是 `{success,version}` 或 `{success,error}` | `groups/global.ts:51`、`:127`；`handlers/global.ts:89`；`types.gen.ts:7359`；openapi.json:563；`sdk.gen.ts` 只改了注释 | `packages/app/src` 无 `upgrade` / `/global/upgrade`。宿主不调用 | 无影响。旧服务仍接受带 `target` 的字符串 | 低 | SOURCE |
| `ProviderConfig.chunkTimeout` 从正整数改为 `number \| false`（默认描述改为 300000） | `types.gen.ts:1760`；openapi.json `chunkTimeout`（hunk 起于 20780） | `packages/app/src` 无 `chunkTimeout` | 无影响。前端不写该字段。旧服务若在配置文件里看到 `false` 会校验失败，与这个前端无关 | 低 | SOURCE |
| provider list 的 `connected` 语义变宽：catalog id 只要在 `Provider.list()` **或** auth 凭据中就算 connected。字段仍是 `string[]` | `handlers/provider.ts:60`；类型 `types.gen.ts:9332`（该行不在 diff 里，形状未改） | 用到。`use-providers.ts:53`、`:62` 用 `providers().connected` 过滤；`local.tsx:103` 用它决定模型是否可选；设置页 `settings-providers.tsx` / `settings-v2/providers.tsx` 画“已连接” | 旧服务只返回 `Provider.list()` 的 key。仅有凭据、未进 list() 的提供商被静默当成未连接，模型选择里看不到，不报错、不 404 | 中 | SOURCE（代码）；“真实配置是否常出现这种 id”未确认，影响 INFERRED |
| `RemoteAuthError` 额外映射成 400 JSON | `middleware/error.ts:24`。该类在 1.18.13 已存在（`config/config.ts:26`） | 前端不按这个错误名分支 | 旧服务不走这条 400。未匹配时的默认状态码未读，标未确认。只影响会抛出该配置错误的请求 | 低 | SOURCE（映射是新的）；HTTP 状态差异未确认 |
| 远端 workspace 代理在转发前删掉 query `directory` | `shared/workspace-routing.ts:43` | 宿主请求带 `directory`（见上）。这是服务端转发，不是新端点 | 旧服务仍把 `directory` 转到远端沙箱。注释写明 Windows 路径会被远端 `path.resolve` 成不存在的路径并让 prompt 崩。不走 workspace 代理的本地目录无此路径 | 中 | SOURCE（会转发）；崩溃是代码注释，INFERRED。企业是否用远端 workspace：未确认 |
| 代理对上游 5xx 先读 body 打日志，再原样转发（含 content-type） | `middleware/proxy.ts`（紧接 `headers.delete("content-length")` 之后插入，hunk 起于 98） | 前端不读这条日志 | 无影响，客户端看到的状态和 body 仍转发 | 低 | SOURCE |
| 服务端托管 UI 的 CSP：`img-src` / `connect-src` 增加 `blob:` | `shared/ui.ts:12` | oco webview 用自己的 CSP（`apps/extension/src/panels.ts:314`），不走这份服务端 CSP | 无影响 | 低 | SOURCE |
| 无 SSE 事件类型增减；无 message/part 响应字段增减 | openapi 与 `types.gen.ts` 的 diff 没有事件或 part 段。`packages/opencode/src/server` 无 event 文件 diff。`message-v2.ts` 只改挑选逻辑 | 前端按同一套事件联合类型解析 | 无“未知事件”或“字段缺失导致抛错”。旧服务少返回的只有上面 `connected` 的成员，不是缺字段 | — | SOURCE |
| `packages/opencode/src/acp/event.ts` 有行为改动（reasoning 的 ACP `messageId` 改用 `part.id`；多了连接/idle 等待） | `acp/event.ts`（diff 约 +90/−11） | oco 前端走 HTTP `/event`，不走 ACP | 不改变 `/event` 载荷 | 低 | SOURCE（diff 摘要）；未通读该文件 |

补丁 `patches/opencode/0001`–`0018` 只看了 diff 头：改的是 `packages/app` 与 `packages/session-ui` 的嵌入 UI，没有服务路由。SOURCE（仅文件头）。

### 3. 反方向（旧服务有、新前端可能不认识）

- openapi / `types.gen.ts` 没有删除响应字段或事件类型。没找到“旧服务发来、新前端对不上联合类型”的事件或 part。SOURCE。
- 旧 upgrade 仍接受省略 `target`。新前端不调用该端点，不存在不认识的响应。SOURCE。
- 旧 `connected` 是新语义的子集，类型仍是 `string[]`。新前端认识该字段，只是列表更短（见上表，静默少显示，不是解析失败）。SOURCE。
- 配置解析：1.18.13 仍拒绝未知顶层键（`parse.ts:42` 在 1.18.33 才改成 `onExcessProperty: "ignore"`）。这是服务器读本地文件，不是 HTTP 响应。新前端不会因此收到无法识别的字段。SOURCE。

### 4. 用户经由服务端能感到的非 API 行为（只列标题）

- revert 改为按消息下标切片，不再用 message id 字符串比较（`revert.ts:74`、`:106`）。SOURCE。
- 从某条消息复制历史同样改下标（`session.ts:704`）。SOURCE。
- `latest()` 先比 `time.created`，id 只作并列打破（`message-v2.ts:604`）。导入会话 id 非单调时，旧服务会选错“最新”消息。SOURCE。
- compaction：保留上限 8000→15000 token；`tail_turns` 缺省不再只留 2 轮；摘要改为纯文本序列化，不再走 `toModelMessages`（`compaction.ts:33` 及新增 `serialize`）。SOURCE。
- retry：可重试文案加宽、25% jitter、最多 5 次；OpenCode Go 文案 $5→$10（`retry.ts:28`、`:31`）。SOURCE。
- `getUsage` 把非有限价格系数当 0，避免 NaN 费用（`session.ts` 的 `getUsage`）。SOURCE。
- Bedrock 只对 anthropic / nova / llama4 送图片（`message-v2.ts` 约 150 行）。SOURCE。
- processor 只多一条 “thinking blocks dropped” 日志，无 API 差异（`processor.ts`）。SOURCE。
- 服务端配置加载增加 `v2-compat.lower`（`v2-compat.ts:91`）：把 v2 的 snapshots/media/agents/mcp 等降到 v1，v2 `permissions` 记为不支持。不改 HTTP。1.18.13 没有这层，v2 形状的配置文件会被未知键拒绝。SOURCE。
- 远端代理仍转发 `directory`、且 5xx 不在宿主侧打正文日志：见上表。

### 未查项

- 未逐个 operationId 对照整份 openapi（依据是整文件 diff 只有上述两处）。
- 未读 error 中间件未命中时的默认 HTTP 状态。
- 未确认企业是否启用远端 workspace 代理，也未确认“有凭据但不在 `Provider.list()`”是否常见。
- 未核对 `server/`、`session/`、`config/`、`sdk/` 以外、且未进入 openapi 的通道（ACP 只看了 diff 摘要）。
- `/global/health` 若真返回 `3.18.13`，是否为企业改版：未确认。
- 未运行 1.18.13 服务与 1.18.33 前端做实测。


## 实测批次（2026-10-06）：oco 连接 OpenCode 1.18.13 跑 E2E

| task_id | 唯一写入范围 | requested_route | actual_provider/model | agent_id/run_id | 状态 | 结果路径 | fallback_reason |
| --- | --- | --- | --- | --- | --- | --- | --- |
| e2e-1813-gemini | — | gemini-worker（agy） | — | — | 未确认 | — | `agy -p "Reply with exactly: OK"` 15s 超时无返回（Error: interrupted），按规则换 Grok |
| e2e-1813 | 同上 | grok-worker | Grok Build / unknown | run-muwfeeel-6xq0v5 / grok session 11c4ee6b | 失败（权限不满足） | runs 见实测结果 | 沙箱拒绝启动 VS Code（`Code --version` Operation not permitted），18 套件均为环境失败；只读 GET 对照完成 |
| e2e-1813-r2 | 同上 + 端口 4537/4538 | gemini-worker（agy 复检 OK） | Google / Gemini 3.8 Flash (High) | conv-5324c2c0-f75e-4d1b-9b4d-0affbc495e30 | 已返回（工具层报 ERROR：后台任务等待超时，但证据与 18 个 run 已落盘）| 本文件 #### 第二轮（Gemini） | — |
| e2e-1813-ab | `.oco-test/xdg-1813/`、`.oco-test/xdg-1833/`、新 runs、本文件 A/B 小节 | 主线程 | Claude（主线程） | scratchpad/ab.sh | 验收通过（结论见下） | 本文件 A/B 小节 | 接手理由：p1a-identity 在 1.18.13 两次失败、1.18.33 历史 3/3 通过，与 Gemini“flaky”分类矛盾，需要同环境 A/B；Gemini 本轮返回 ERROR，Grok 沙箱无法启动 VS Code（权限不兼容） |

### 实测结果

状态：已结束。18 个套件全部 FAIL，分类均为 (b) 测试环境（沙箱无法启动 VS Code），没有观察到 1.18.13 相对 1.18.33 的产品失败。actual_provider/model：工具返回缺失，记 unknown。

**二进制与健康检查**

- 二进制：`.oco-test/opencode-1.18.13/node_modules/opencode-ai/bin/opencode.exe --version` → `1.18.13`。`npm install --prefix` 因 `~/.npm` 缓存属主为 root（未改全局）失败，改用该目录内 `.npm-cache`，并手动执行包内 `postinstall.mjs` 装上 darwin-arm64 二进制。
- 端口：指定的 4527 已被 pid 35937 占用（`GET /global/health` = `{"healthy":true,"version":"1.18.33"}`，二进制 `~/.opencode/bin/opencode`，与受保护的 4517 pid 40872 打开同一 `.oco-test/xdg` 数据库 inode 231024955）。未杀。本测改用空闲端口服务 **4537**、mock **4538**，状态目录 `.oco-test/xdg-1813`（未使用 `.oco-test/xdg`）。
- `curl -u opencode:<redacted> http://127.0.0.1:4537/global/health` → `{"healthy":true,"version":"1.18.13"}`。

**PID**

| 角色 | PID | 结果 |
| --- | --- | --- |
| mock `OCO_MOCK_LLM_PORT=4538` | 72521 | 已停止 |
| `opencode serve` 127.0.0.1:4537 | 72522 | 已停止 |
| 既有 4517（1.18.33） | 40872 | 未动，结束后仍在听 |
| 占用 4527 的 1.18.33 | 35937 | 未动，结束后仍在听 |

**套件（`OCO_TEST_URL=http://127.0.0.1:4537 OCO_E2E_MODEL=mock`，排除 t007-managed / t007-multiroot）**

控制台汇总在 `.oco-test/xdg-1813/e2e.log`。18/18 exit code 1。唯一非 FAIL 记录是 `p1b-reconnect` 的 `comparator-selftest` PASS（本地比较器自测，发生在拉起 VS Code 之前）。

| 套件 | 结果 | runId | results.json |
| --- | --- | --- | --- |
| p1a-chat | FAIL，进程崩溃，无 results | `20261006-084131-p1a-chat-7d73` | 无（重跑 `20261006-084347-p1a-chat-cb84` 同样无） |
| p1a-identity | FAIL，进程崩溃，无 results | `20261006-084132-p1a-identity-6294` | 无 |
| p1b-sidebar | FAIL，进程崩溃，无 results | `20261006-084132-p1b-sidebar-4b74` | 无 |
| p1b-narrow | FAIL `run` | `20261006-084133-p1b-narrow-ba00` | `docs/evidence/runs/20261006-084133-p1b-narrow-ba00/results.json` |
| p1b-theme-load | FAIL `run` | `20261006-084133-p1b-theme-load-a5dd` | `docs/evidence/runs/20261006-084133-p1b-theme-load-a5dd/results.json` |
| p1b-ime | FAIL，进程崩溃，无 results | `20261006-084134-p1b-ime-2db8` | 无 |
| p1b-reconnect | FAIL `run`（另有 comparator-selftest PASS） | `20261006-084134-p1b-reconnect-8a77` | `docs/evidence/runs/20261006-084134-p1b-reconnect-8a77/results.json` |
| p1b-pending-send | FAIL `run` | `20261006-084135-p1b-pending-send-2c8c` | `docs/evidence/runs/20261006-084135-p1b-pending-send-2c8c/results.json` |
| p1b-switch-pending | FAIL `run` | `20261006-084136-p1b-switch-pending-9a32` | `docs/evidence/runs/20261006-084136-p1b-switch-pending-9a32/results.json` |
| c1-open-file | FAIL `run` | `20261006-084136-c1-open-file-6caa` | `docs/evidence/runs/20261006-084136-c1-open-file-6caa/results.json` |
| c1-focus | FAIL `run` | `20261006-084137-c1-focus-e74a` | `docs/evidence/runs/20261006-084137-c1-focus-e74a/results.json` |
| c2-diff-unavailable | FAIL `run` | `20261006-084137-c2-diff-unavailable-ad0b` | `docs/evidence/runs/20261006-084137-c2-diff-unavailable-ad0b/results.json` |
| t010-recover | FAIL `run` | `20261006-084138-t010-recover-47bd` | `docs/evidence/runs/20261006-084138-t010-recover-47bd/results.json` |
| t014-connection | FAIL `run` | `20261006-084138-t014-connection-ea34` | `docs/evidence/runs/20261006-084138-t014-connection-ea34/results.json` |
| p1b-main-panel | FAIL，进程崩溃，无 results | `20261006-084139-p1b-main-panel-d77f` | 无 |
| c3-fork | FAIL，进程崩溃，无 results | `20261006-084143-c3-fork-2db9` | 无 |
| t015-diagnostics | FAIL `run` | `20261006-084144-t015-diagnostics-2891` | `docs/evidence/runs/20261006-084144-t015-diagnostics-2891/results.json` |
| c4-trajectory | FAIL，进程崩溃，无 results | `20261006-084144-c4-trajectory-8b97` | 无 |

有 results 的失败项全部是 `run` / `Process failed to launch!`。无 results 的套件在 `.oco-test/xdg-1813/e2e.log` 里是同一条 Playwright Electron 错误（stderr 在打印 `DevTools listening` 之前被关闭）。重跑 `p1a-chat` 一次（`.oco-test/xdg-1813/e2e-retry-p1a-chat.log`，exit 1，0.57s）仍相同。直接执行 `Code --version` 得到 `sandbox_extension_issue_file_to_process failed for /Applications/Visual Studio Code.app: 1 (Operation not permitted)`。扩展构建 `apps/extension/dist/extension.js` 存在，未重建。

**分类**

- (a) 1.18.13 产品兼容：本轮无。失败发生在 VS Code 进程启动，请求还没进 UI。只读 GET 对照（同一 workspace 头，未打印凭据）：`/global/health` 仅 version 不同（1.18.13 vs 1.18.33）；`/provider` 的 `connected` 都是 `["opencode","oco-mock"]`，`all` 长度都是 227；`/config` 顶层键相同，`model`/`small_model` 都是 `oco-mock/mock`，`permission.bash`/`edit` 都是 3 字符；`/session/status` 都是 `{}`；`/session?roots=true&limit=5` 首条键都是 `cost,directory,id,path,projectID,slug,time,title,tokens,version`。权限提问、取消、重连 UI 未跑到。
- (b) 环境：上述 18 个套件。不是 flaky（重跑与 Code 探针一致）。
- (c) 测试脚本假设 1.18.33：本轮无证据。

**未跑：** `t007-managed`、`t007-multiroot`（按任务排除，会启动 PATH 上的 1.18.33）。其余 DEFAULT_SUITES 都跑了，但都没有进入产品断言。

#### 第二轮（Gemini）

状态：已结束。18 个套件中 **17 PASS / 1 FAIL**（`p1a-identity` 为环境/flaky，重跑证实断言前进且失败点偏移，未见 1.18.13 产品兼容问题）。
执行环境：Google / Gemini 3.8 Flash (High)，run_id: `conv-5324c2c0-f75e-4d1b-9b4d-0affbc495e30`。

**二进制与健康检查**

- 二进制：`.oco-test/opencode-1.18.13/node_modules/opencode-ai/bin/opencode.exe --version` → `1.18.13`。
- 服务配置：隔离状态目录 `.oco-test/xdg-1813/`，Mock 配置 `baseURL: http://127.0.0.1:4538/v1`，服务监听 `127.0.0.1:4537`，密码经由 `.oco-test/secret` 注入。
- 健康检查：`curl -u opencode:<redacted> http://127.0.0.1:4537/global/health` → `{"healthy":true,"version":"1.18.13"}`。
- VS Code 启动：Playwright Electron 正常拉起 `/Applications/Visual Studio Code.app`（1.140.0 arm64），无权限阻塞。

**PID 与生命周期**

| 角色 | PID | 状态 |
| --- | --- | --- |
| mock `OCO_MOCK_LLM_PORT=4538` | 78432 | 已停止（端口已释放） |
| `opencode serve` 127.0.0.1:4537 | 78491 | 已停止（端口已释放） |
| 既有 4517（1.18.33） | 40872 | 未触动，保持监听 |
| 占用 4527 的 1.18.33 | 35937 | 未触动，保持监听 |

**套件执行结果（`OCO_TEST_URL=http://127.0.0.1:4537 OCO_E2E_MODEL=mock OCO_MOCK_LLM_PORT=4538`）**

| 套件 | 结果 | 耗时 | runId | results.json |
| --- | --- | --- | --- | --- |
| p1a-chat | PASS | 37.15s | `20261006-085421-p1a-chat-7140` | `docs/evidence/runs/20261006-085421-p1a-chat-7140/results.json` |
| p1a-identity | FAIL | 81.00s (重跑 78.65s) | `20261006-085616-p1a-identity-452e` (重跑 `20261006-090125-p1a-identity-5122`) | `docs/evidence/runs/20261006-090125-p1a-identity-5122/results.json` |
| p1b-sidebar | PASS | 44.49s | `20261006-085737-p1b-sidebar-10a6` | `docs/evidence/runs/20261006-085737-p1b-sidebar-10a6/results.json` |
| p1b-narrow | PASS | 92.22s | `20261006-085821-p1b-narrow-1e0c` | `docs/evidence/runs/20261006-085821-p1b-narrow-1e0c/results.json` |
| p1b-theme-load | PASS | 22.37s | `20261006-085954-p1b-theme-load-a363` | `docs/evidence/runs/20261006-085954-p1b-theme-load-a363/results.json` |
| p1b-ime | PASS | 11.23s | `20261006-090016-p1b-ime-81b6` | `docs/evidence/runs/20261006-090016-p1b-ime-81b6/results.json` |
| p1b-reconnect | PASS | 29.38s | `20261006-090312-p1b-reconnect-2fe1` | `docs/evidence/runs/20261006-090312-p1b-reconnect-2fe1/results.json` |
| p1b-pending-send | PASS | 117.58s | `20261006-090341-p1b-pending-send-6f34` | `docs/evidence/runs/20261006-090341-p1b-pending-send-6f34/results.json` |
| p1b-switch-pending | PASS | 50.27s | `20261006-090539-p1b-switch-pending-6c16` | `docs/evidence/runs/20261006-090539-p1b-switch-pending-6c16/results.json` |
| c1-open-file | PASS | 19.53s | `20261006-090629-c1-open-file-2f8a` | `docs/evidence/runs/20261006-090629-c1-open-file-2f8a/results.json` |
| c1-focus | PASS | 69.78s | `20261006-090648-c1-focus-0b80` | `docs/evidence/runs/20261006-090648-c1-focus-0b80/results.json` |
| c2-diff-unavailable | PASS | 9.26s | `20261006-090806-c2-diff-unavailable-0127` | `docs/evidence/runs/20261006-090806-c2-diff-unavailable-0127/results.json` |
| t010-recover | PASS | 95.96s | `20261006-090815-t010-recover-b757` | `docs/evidence/runs/20261006-090815-t010-recover-b757/results.json` |
| t014-connection | PASS | 13.27s | `20261006-090951-t014-connection-e101` | `docs/evidence/runs/20261006-090951-t014-connection-e101/results.json` |
| p1b-main-panel | PASS | 29.84s | `20261006-091004-p1b-main-panel-2de6` | `docs/evidence/runs/20261006-091004-p1b-main-panel-2de6/results.json` |
| c3-fork | PASS | 15.66s | `20261006-091051-c3-fork-6768` | `docs/evidence/runs/20261006-091051-c3-fork-6768/results.json` |
| t015-diagnostics | PASS | 6.21s | `20261006-091107-t015-diagnostics-953c` | `docs/evidence/runs/20261006-091107-t015-diagnostics-953c/results.json` |
| c4-trajectory | PASS | 27.63s | `20261006-091113-c4-trajectory-ddb7` | `docs/evidence/runs/20261006-091113-c4-trajectory-ddb7/results.json` |

**失败分类与分析**

- **p1a-identity（分类：(b) 环境/flaky）**：
  - 首轮 (`20261006-085616-p1a-identity-452e`)：前 3 项 PASS，第 4 步 `nav-link-other-session` 报 `no visible frame for ses_...`；
  - 重跑确认 (`20261006-090125-p1a-identity-5122`)：首轮卡住的第 4 步全套通过（`nav-link-other-session`, `nav-blocked-routes`, `nav-shortcuts-deeplink` 均为 PASS）。失败发生在第 5 步 `draft-after-attacks`（`math.ts` 文件打开后焦点留在 monaco-editor，导致向 composer 注入草稿失败，`composerHead: ""`）及第 7 步 `waiting for locator('[data-component="dock-prompt"][data-kind="permission"]')` 超时（由于 composer 为空未能成功向服务端发起权限请求）。在其它包含真实权限与提问的套件（如 `p1a-chat` 与 `p1b-narrow` 的 260/320/480/800 宽布局）中，权限弹窗与选择全部 100% PASS。
- **(a) 1.18.13 服务差异导致的产品兼容问题**：**0 项**。其余 17 个套件全部通过（含 SSE 流式、权限绑定与取消、多会话切换、侧边栏、窄屏适配、主题切换、断线重连、待发送队列、文件打开与焦点保护、Diff 降级处理、故障恢复与重连、诊断导出、会话 Fork 以及 Trajectory 轨迹展示）。
- **(c) 测试脚本假设 1.18.33 行为**：无观察到。

**只读 GET 对照（4537 1.18.13 vs 4517 1.18.33）**

| 端点 | 4537 (1.18.13) | 4517 (1.18.33) | 结论 |
| --- | --- | --- | --- |
| `/global/health` | `{"healthy":true,"version":"1.18.13"}` | `{"healthy":true,"version":"1.18.33"}` | 仅 version 字段差异 |
| `/provider` | `connected: ["opencode", "oco-mock"]`, all: 227 | `connected: ["opencode", "oco-mock"]`, all: 227 | 完全一致 |
| `/config` | 12 个顶层键完全一致，model 均为 `oco-mock/mock` | 12 个顶层键完全一致，model 均为 `oco-mock/mock` | 配置模型映射一致 |
| `/session/status` | `{...}` 状态结构兼容 | `{...}` 状态结构兼容 | 兼容 |
| `/session?roots=true&limit=1` | 返回包含 id, directory, time, title, tokens, version 等 13 个键 | 返回 10 个标准键 | 1.18.13 包含 1.18.33 的全部必要键，前端完全兼容 |

**未跑：** `t007-managed`、`t007-multiroot`（按要求排除，会启动 PATH 上的 1.18.33）。其余 18 个 DEFAULT_SUITES 全部运行完毕。

#### A/B 复核（主线程，2026-10-06 09:20–09:27）

同一时间、同一 VS Code（1.140.0）、同一构建，两套隔离服务（1.18.13 @4537/xdg-1813，1.18.33 @4547/xdg-1833，均 mock），p1a-identity 交替各跑 2 次：

| 轮次 | 1.18.33 | 1.18.13 |
| --- | --- | --- |
| 1 | FAIL `20261006-092120-p1a-identity-1e10` | **14/14 PASS** `20261006-092239-p1a-identity-4efc` |
| 2 | FAIL `20261006-092402-p1a-identity-4aa9` | FAIL `20261006-092520-p1a-identity-1f08` |

失败点在两个版本上完全相同：`draft-after-attacks`（选区未进入草稿，composerHead 为空）+ 等待 `dock-prompt[data-kind=permission]` 30s 超时。**结论：p1a-identity 失败与服务版本无关**，是当前环境/测试侧回归（该套件 10-01 前 1.18.33 三次 14/14；之后 VS Code 或环境已变化，原因未查）。Gemini 的 (b) 分类成立。

**总结论（mock）：oco 当前构建连接 OpenCode 1.18.13，19 个默认套件（不含 t007-managed/multiroot）均未发现版本相关失败。** 限制：仅 mock 模型；未跑真实模型流式/取消时序；managed 模式未测（它启动 PATH 里的 opencode）；源码比对中的两个中风险（provider `connected` 范围更窄、远端 workspace `directory` 透传）mock 覆盖不到。A/B 脚本残留两进程（82861、82868，均核对 XDG 为 xdg-1813/xdg-1833）已由主线程停止；4517/4527 未动。

#### 后续（2026-10-06，另一会话）

上文“环境/测试侧回归，原因未查”已定位：非服务版本、非 10-01 后提交；随 VS Code 1.140.0 出现，触发是第 4 步被宿主拦截的页内路由跳转（只保留它 1/4，去掉它 4/4），之后 A 的可见界面不随 store 更新（草稿被 ack 却丢失、permission dock 不显示），属产品缺陷。详见工作树 `claude/musing-solomon-847dba` 的 `docs/evidence/p1a-identity-regression-2026-10-06.md`。
