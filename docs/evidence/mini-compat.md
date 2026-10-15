# 公共版 opencode 兼容性评估（分支 claude/roadmap-batch-2026-10-14，2026-10-15）

执行方：本机（Mac mini 上 Claude 登出，见 ccb3622），由本机 Claude 子代理直接执行；未再委派 Grok / Gemini（原因：全部工作是在同一个 mock 服务、同一把 `/tmp/oco-e2e.lock` 和同一个状态目录上串行跑 E2E，并随跑随改测试侧；用户指令指定本机执行）。

## 结论

- 公共版：npm `opencode-ai@1.19.0`（`npm view opencode-ai version` = 1.19.0），darwin-arm64 二进制，装在临时目录，未全局安装，未碰用户已有的 opencode（`~/.opencode/bin/opencode` = 1.18.33）。
- **oco 可以连接 1.19.0，未发现产品侧不兼容**。mock 模型下 41 个套件在 1.19.0 上全部通过（共 4 个套件首轮失败，全部归为测试侧，已修并复跑通过，见「差异报告」）。
- 唯一与版本有关的表现：`1.19.0` 不在 `VERIFIED_SERVERS`（`1.18.33`、`1.18.13`）里，状态栏图标显示 `$(warning) oco`，提示 `Server 1.19.0 is not verified by oco (verified: 1.18.33, 1.18.13)`。功能不受影响。
- 建议：若决定支持公共版，把 `1.19.0` 加入 `apps/extension/src/diagnostics.ts` 的 `VERIFIED_SERVERS`（产品代码，本任务不改），或把规则放宽为「同主版本 1.x 且次版本不高于已验证的最高次版本」。真实模型下的验证仍是 NOT RUN（big-pickle 在本机 403，见 mini-card7）。

## 步骤 1：服务与宿主判定

| 项 | 1.19.0 实测 |
| --- | --- |
| 二进制 | `<scratchpad>/oco-compat/node_modules/opencode-darwin-arm64/bin/opencode --version` = `1.19.0`（Mach-O arm64） |
| 启动 | `OCO_E2E_MODEL=mock OCO_OPENCODE_BIN=<上面> bash scripts/test-server.sh`（端口 4517，mock LLM 4518，同一份 `scripts/test-server.mock.opencode.json`） |
| `GET /global/health` | `{"healthy":true,"version":"1.19.0"}`，HTTP 200 |
| `GET /api/info` | HTTP 返回 SPA 的 HTML（不是 JSON），无版本；宿主 `server-version.ts` 先查 `/global/health`，所以不依赖它 |
| `server-version.ts` 判定 | `source: "health"`，`generation: "v1"`；未走 V2 不支持分支 |
| `versionNote("1.19.0")` | `Server 1.19.0 is not verified by oco (verified: 1.18.33, 1.18.13)`（t015-diagnostics `status-version` PASS，状态栏文本 `$(warning) oco`，tooltip 含 `Server version: 1.19.0` 与上述 Note；诊断导出 `server.version = 1.19.0`，无泄漏） |
| OpenAPI（`GET /doc`） | 与仓库里保存的 `.oco-test/openapi.json`（2026-09-29，1.18.x）逐字段比较：路径集合相同，唯一差异是配置项 `autoupdate` 的描述文字（1.19：「只提示更新，从不自动安装；true 与 'notify' 等价」）。无新增 / 删除 / 改名的路径或字段 |
| 事件流 | `GET /global/event` 返回 SSE，首包 `server.connected`（payload 形状与 1.18.33 相同，侧栏 feed 的 `/global/event` 优先、404 回退 `/event` 的逻辑沿用） |

## 步骤 2：mock 回归（1.19.0）

任务点名的 9 个套件（`overnight-20261015-075052`）：

| 套件 | PASS | FAIL | 备注 | results.json（`docs/evidence/runs/` 下） |
| --- | --- | --- | --- | --- |
| c6-inbox | 5 | 0 | | 20261014-235052-c6-inbox-0e78 |
| c10-sidebar-answer | 6 | 0 | | 20261014-235108-c10-sidebar-answer-1f25 |
| c12-new-session-draft | 13 | 0 | | 20261014-235119-c12-new-session-draft-3861 |
| c13-worktree-inbox | 6 | 0 | | 20261014-235208-c13-worktree-inbox-5a1d |
| c16-sidebar-stop | 5 | 0 | | 20261014-235237-c16-sidebar-stop-5cee |
| c17-subagent-aggregate | 5 | 0 | | 20261014-235304-c17-subagent-aggregate-a4c8 |
| c18-permission-note | 2 | 0 | | 20261014-235336-c18-permission-note-a012 |
| c24-runtime-question | 3 | 0 | | 20261014-235344-c24-runtime-question-87ea |
| p1b-sidebar | 13 | 0 | | 20261014-235358-p1b-sidebar-5b00 |

结果里 `serverVersion` 均为 `1.19.0`，`modelMode` 为 `mock`。

为给「是否支持公共版」更完整的证据，又把验收集里其余套件也在 1.19.0 上跑了一遍（同一批 mock，`overnight-20261015-075650` 与 `-081314`）：

| 套件 | PASS | FAIL | NOT RUN | 备注 | results.json |
| --- | --- | --- | --- | --- | --- |
| t015-diagnostics | 4 | 0 | 0 | 版本告警文案见上 | 20261014-235652-t015-diagnostics-069d |
| c11-sidebar-organize | 6 | 0 | 2 | NOT RUN：archive-batch（`dialogStyle=custom`，没有原生模态框）、delete-batch（破坏性，刻意不跑）。与服务端版本无关 | 20261014-235715-c11-sidebar-organize-41bf |
| c14-review-notes | 6 | 0 | 0 | | 20261014-235735-c14-review-notes-0e34 |
| c15-fix-with-opencode | 5 | 0 | 0 | | 20261014-235902-c15-fix-with-opencode-5f54 |
| c19-label-snooze | 5 | 0 | 0 | | 20261015-000002-c19-label-snooze-9bbd |
| c20-inbox-nav | 5 | 0 | 0 | | 20261015-000029-c20-inbox-nav-949f |
| c21-follow | 3 | 0 | 0 | | 20261015-000046-c21-follow-bbf9 |
| c22-review-threads | 2 | 0 | 0 | | 20261015-000105-c22-review-threads-3014 |
| c23-subagent-pills | 2 | 0 | 0 | | 20261015-000226-c23-subagent-pills-814f |
| c25-nested-subagents | 6 | 0 | 0 | 孙会话 | 20261015-000243-c25-nested-subagents-21bb |
| c4-trajectory | 17 | 0 | 0 | | 20261015-000325-c4-trajectory-572a |
| c5-runtime | 43 | 0 | 0 | 加 tools-k 检查后 44/0（见 mini-probe），见下「偶发」 | 20261015-000402-c5-runtime-0586 |
| p1a-chat | 8 | 0 | 0 | | 20261015-000732-p1a-chat-690a |
| p1b-narrow | 12 | 0 | 0 | | 20261015-000820-p1b-narrow-3693 |
| t014-connection | 6 | 0 | 0 | | 20261015-001214-t014-connection-fe28 |
| t007-managed | 7 | 0 | 0 | 受管模式：`oco.opencodePath` 指向包装脚本，包装脚本 exec 的是 1.19.0（`OCO_OPENCODE_BIN`） | 20261015-001315-t007-managed-82ff |
| t007-multiroot | 5 | 0 | 0 | | 20261015-001407-t007-multiroot-757a |
| t010-recover | 5 | 0 | 0 | | 20261015-001428-t010-recover-04dc |
| p1b-ime | 1 | 0 | 1 | NOT RUN：`ime-real-macos` 需要真人用中文输入法打字 | 20261015-001922-p1b-ime-98f3 |
| p1b-theme-load | 4 | 0 | 0 | | 20261015-001939-p1b-theme-load-77ff |
| p1b-pending-send | 7 | 0 | 0 | | 20261015-002012-p1b-pending-send-8ba5 |
| p1b-switch-pending | 2 | 0 | 0 | | 20261015-002203-p1b-switch-pending-4e32 |
| c1-open-file | 6 | 0 | 0 | | 20261015-002300-c1-open-file-5d3c |
| c1-focus | 3 | 0 | 0 | | 20261015-002333-c1-focus-05f2 |
| c2-diff-unavailable | 3 | 0 | 0 | | 20261015-002450-c2-diff-unavailable-2a9d |
| c3-fork | 4 | 0 | 0 | | 20261015-002512-c3-fork-b43b |
| c7-result-card | 6 | 0 | 0 | | 20261015-002537-c7-result-card-5980 |
| c8-git-review | 5 | 0 | 0 | | 20261015-002600-c8-git-review-c232 |

首轮失败的 4 个套件（复跑 / 修复后）：

| 套件 | 首轮 | 最终（1.19.0） | 归类 | results.json |
| --- | --- | --- | --- | --- |
| p1b-reconnect | 2 PASS / 3 FAIL（`overnight-20261015-075650`，20261015-001028-p1b-reconnect-254c） | 5 / 0（`overnight-20261015-083823`，20261015-003825-p1b-reconnect-d401） | 测试侧，与版本无关 | 见下 |
| p1a-identity | 7 PASS / 1 FAIL，后 7 项没跑到（`-081314`、`-082800`，两次相同） | 14 / 0（`overnight-20261015-085507`，20261015-005510-p1a-identity-ad77） | 测试侧，与版本无关 | 见下 |
| p1b-main-panel | 7 / 1（`draft-per-session`，切回 A 用了 70972 ms） | 8 / 0（`overnight-20261015-082800`，20261015-002913-p1b-main-panel-31ea） | 偶发（未改任何代码，复跑通过） | |
| c9-mermaid | 无 results.json（`EADDRINUSE 4518`，20261015-002615-c9-mermaid-8ecf 空目录） | 9 / 0（`overnight-20261015-084317`，20261015-004317-c9-mermaid-bf89） | 套件需要「外置 mock」服务（`OCO_MOCK_LLM_EXTERNAL=1`，套件自己绑 4518），与批量 mock 服务冲突；换外置模式启动即通过 | |

另有 c5-runtime 一次 `think-card` FAIL（`overnight-20261015-084342`，20261015-004343-c5-runtime-1a5c；舞台高度在 675/672/670/669 间抖动，同一 key 下出现两种矩形），随后 3 次复跑 44/0、44/0（含第一次 43/0）；与 mini-card7 记录的偶发现象一致，未定位到产品原因，不是 1.19 特有。

对照组（同一测试在 1.18.33 上，`overnight-20261015-083017`）：p1a-identity 同样 7/1，p1b-reconnect 3/2（reconnect-hard-cut、reconnect-stall）。证明这两项失败在 1.18.33 上同样存在，不是 1.19 引入。

## 步骤 3：差异报告

没有产品侧不兼容。失败项逐条：

| 项 | 归类 | 原因与最小复现 | 处理 |
| --- | --- | --- | --- |
| p1b-reconnect：reconnect-hard-cut / reconnect-incremental / reconnect-stall | **测试侧（既有缺陷）** | 提交 5edd5cb 起侧栏 feed 先订阅 `GET /global/event`，404 才回退 `/event`；`tests/e2e/lib/proxy.mjs` 只把 `GET /event` 当事件流，所以代理对侧栏的流既不计数、也不切断、也不 stall：`eventConnections` 恒为 `[0,0]`，不会进入 reconnecting。1.18.33 与 1.19.0 上现象相同。复现：`OCO_E2E_MODEL=mock bash scripts/overnight-e2e.sh p1b-reconnect`（修复前） | `proxy.mjs` 把 `/global/event` 也当事件流。修复后 1.18.33 与 1.19.0 上均 5/0；其余使用代理的套件（t014-connection、t010-recover、p1b-switch-pending、c2-diff-unavailable、c17-subagent-aggregate、c8-git-review）在两个版本上各复跑 6 / 6 全过（`-083416`、`-083823`） |
| p1a-identity：`run` 超时，后 7 项缺失 | **测试侧（环境相关）** | `editorLines.click()` 点 `.view-lines` 的中心，三个聊天面板同时打开时编辑器组很窄，中心落在垂直滚动条的 `.slider` 上，Playwright 报 `<div class="slider"> … subtree intercepts pointer events`，重试 30 s 超时。1.18.33 与 1.19.0 相同 | 改为点左上角 `position: {x: 8, y: 8}`，14/0 |
| p1b-main-panel：draft-per-session | 偶发 | `switchToAMs` 70972 ms，第二轮 `switchToAMs` 正常，8/0。1 次 / 3 次 | 记录，未改 |
| c9-mermaid：EADDRINUSE | 套件用法 | 见上 | 无需改动，文档里已写明需外置 mock 模式 |
| c5-runtime think-card | 偶发 | 见上 | 记录，未改 |

API 路径、事件载荷、字段改名：均未发现。行为差异：只有 `autoupdate` 配置语义的说明文字变化（1.19 不再自动安装更新），oco 的测试服务和受管模式都已设 `OPENCODE_DISABLE_AUTOUPDATE=1` / `"autoupdate": false`，不受影响。

## 测试侧改动

- `tests/e2e/lib/proxy.mjs`：`/global/event` 也算事件流（计数 / 切断 / stall / keepalive）。
- `tests/e2e/p1a-identity.mjs`：编辑器点击改点左上角。
- 没有为切换服务端改任何测试脚本：`scripts/test-server.sh` 与受管包装脚本本来就读 `OCO_OPENCODE_BIN`。

## 环境与清理

- 公共版装在 scratchpad 临时目录（`npm install opencode-ai@1.19.0`），没有全局安装。
- 跑 1.19.0 前备份了 `.oco-test/xdg`（服务端状态；1.19 可能迁移 SQLite），对照组 1.18.33 用备份的副本跑，结束后恢复原目录，临时副本已删。
- 自己启动的测试服务（PID 98177、17337 及调试用一个）都按进程组停掉，4517 / 4518 无监听，`/tmp/oco-e2e.lock` 已释放；没有按名字杀进程，没有碰用户的 VS Code 与 opencode 进程。
- 第 0 步：`bun run setup && bun run build` 退出码 0，输出在 `.oco-reports/local-setup.log`。

## 委派记录

| task_id | 写入范围 | requested_route | 状态 | 说明 |
| --- | --- | --- | --- | --- |
| mini-compat（本机） | tests/e2e/**、本文件、docs/evidence/runs/** | 主线程直接执行（用户指令：Mac mini 登出，改本机） | 完成 | 例外理由：不可分割的依赖（串行 E2E 共用一个服务、锁、状态目录，随跑随改测试侧），且任务由用户明确指定本机执行 |

## NOT RUN

- 真实模型下的 1.19.0：NOT RUN（big-pickle 在本机 403）。
- 企业服务（1.18.13）、Remote：与本任务无关，未跑。
- 1.19.0 的 `/api/info`：返回 HTML，宿主已在 `/global/health` 取到版本，未发现需要它的路径。
