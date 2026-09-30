# 测试范围：改哪里，跑什么

目的：局部改动只跑相关检查；阶段交付再跑全量。本文件是选择规则，不是通过记录，结果以 `docs/evidence/runs/` 和 STATUS 为准。

## 检查层级

| 层级 | 命令 | 耗时（2026-09-30 实测） | 何时跑 |
|---|---|---|---|
| 离线 | `bun run verify:brief`（typecheck + 136 个单元测试） | 约 3 秒 | 每个代码改动批次 |
| 构建 | `bun run verify:brief -- --build` | 另加约 12 秒 | 改到 webview、扩展打包、上游补丁，或准备跑 E2E 前 |
| 定向 E2E（mock） | 服务用 `OCO_E2E_MODEL=mock bash scripts/test-server.sh`，再 `node tests/e2e/run.mjs <套件…>` | 单套件 10–130 秒 | 改到下表对应范围 |
| 定向 E2E（真实模型） | 服务不带该变量启动，同一命令 | 比 mock 慢，受模型与网络影响 | 发送、取消、流式、权限/问答链路的改动收尾 |
| 全量（真实模型） | `node tests/e2e/run.mjs`（默认 15 个套件） | 真实模型本轮实测合计见 STATUS | 阶段交付、公共等待逻辑、桥接协议、上游升级 |

mock 运行在 `results.json` 记 `modelMode: "mock"`，`bun run brief` 归为特殊运行，不算验收。mock 证明不了真实流式输出、取消时序和模型协议兼容。

## 改动范围 → 必要检查

| 改动范围（路径） | 单元测试 | E2E 套件 | 模型 |
|---|---|---|---|
| 纯文档 | — | — | — |
| `packages/contracts/`、`apps/extension/src/bridge-*.ts` | bridge-contract / bridge-core / bridge-policy | p1a-chat、p1a-identity | mock；协议改动收尾用真实模型 |
| `apps/extension/src/open-file-policy.ts`、补丁 0005/0006 | open-file-policy | c1-open-file | mock |
| `panels.ts` 打开文件与焦点（`settleWebviewFocus`） | bridge-contract | c1-focus、c1-open-file | mock |
| 补丁 0008、`apps/chat-webview/src/recovery.tsx`、宿主 `connection` 通知 | bridge-contract | t010-recover、t014-connection | 夹具 / mock |
| 补丁 0007（单轮 Diff 展示） | — | c2-diff-unavailable、c1-open-file | 夹具 / mock |
| `session-feed.ts`、`session-store.ts` | session-feed、session-store | p1b-sidebar、p1b-reconnect | mock |
| `sessions-view.ts` | session-store | p1b-sidebar、p1b-reconnect、t014-connection | mock |
| `connection.ts`、`endpoint.ts`、`apps/extension/package.json` 设置项 | endpoint、settings-contribution | t014-connection、p1b-switch-pending、p1b-reconnect | mock |
| `panels.ts`、`host-store.ts`（面板、草稿、恢复、主面板切换） | host-store | p1a-identity、p1b-main-panel、p1b-sidebar、t010-recover、p1b-pending-send | mock |
| `extension.ts`（命令注册、接线） | 全部单元 | p1a-identity、p1b-sidebar、t014-connection | mock |
| 补丁 0001–0002（草稿、单会话嵌入） | — | p1a-identity、p1a-chat | mock |
| 补丁 0003（窄 dock） | — | p1b-narrow | mock |
| 补丁 0004（等模型加载再发送） | — | p1b-pending-send、p1b-theme-load、p1b-switch-pending | mock |
| `apps/chat-webview/`（主题、输入） | — | p1b-theme-load、p1b-ime、p1a-chat | mock |
| 发送 / 取消 / 流式 / 权限 / 问答 链路 | 相关单元 | p1a-chat、p1b-sidebar（chain-*） | mock 定向后，收尾用真实模型 |
| `tests/e2e/vscode.mjs`、`server.mjs`、`lib/`（公共测试设施） | e2e-results | 全部 14 个 | mock 全量；等待逻辑改动再加真实模型全量 |
| `scripts/brief*.mjs`、`scripts/lib/` | brief、e2e-results | — | — |
| 上游升级、补丁重放 | 全部 | 全部 14 个 | 真实模型 |

一个改动命中多行时取并集。拿不准时，多跑一个相关套件比跑全量便宜。

## 全量的定义

`tests/e2e/run.mjs` 的 `DEFAULT_SUITES`，共 15 个：p1a-chat、p1a-identity、p1b-sidebar、p1b-narrow、p1b-theme-load、p1b-ime、p1b-reconnect、p1b-pending-send、p1b-switch-pending、c1-open-file、c1-focus、c2-diff-unavailable、t010-recover、t014-connection、p1b-main-panel。

不在默认列表中：t004、t005（P0 历史套件）、perf、smoke。p1b-ime 的 `ime-real-macos` 需要真人使用系统输入法，自动运行时恒为 NOT RUN。

## 读结果

- 成功只看 `run.mjs` 末尾的汇总表或 `bun run brief` 的短摘要。
- 失败时只读对应 `docs/evidence/runs/<runId>/results.json` 中非 PASS 的项和截图，不展开整份日志。
- 同一失败不要不加改动地连续重跑；先判断是测试侧还是产品侧。
