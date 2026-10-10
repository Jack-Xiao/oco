# 测试范围：改哪里，跑什么

目的：局部改动只跑相关检查；阶段交付再跑全量。本文件是选择规则，不是通过记录，结果以 `docs/evidence/runs/` 和 STATUS 为准。

## 检查层级

| 层级 | 命令 | 耗时（2026-09-30 实测） | 何时跑 |
|---|---|---|---|
| 离线 | `bun run verify:brief`（typecheck + 221 个单元测试） | 约 6 秒 | 每个代码改动批次 |
| 构建 | `bun run verify:brief -- --build` | 另加约 12 秒 | 改到 webview、扩展打包、上游补丁，或准备跑 E2E 前 |
| 定向 E2E（mock） | 服务用 `OCO_E2E_MODEL=mock bash scripts/test-server.sh`，再 `node tests/e2e/run.mjs <套件…>` | 单套件 10–130 秒 | 改到下表对应范围 |
| 定向 E2E（真实模型） | 服务不带该变量启动，同一命令 | 比 mock 慢，受模型与网络影响 | 发送、取消、流式、权限/问答链路的改动收尾 |
| 全量（真实模型） | `node tests/e2e/run.mjs`（默认 23 个套件） | 真实模型本轮实测合计见 STATUS | 阶段交付、公共等待逻辑、桥接协议、上游升级 |

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
| `session-store.ts`、结果卡 / `navigate.review` / 补丁 0021 | session-store、sessions-view、contracts、e2e-results | c7-result-card、c2-diff-unavailable、c6-inbox | mock + 摘要 fixture；真实模型另验 |
| `sessions-webview.ts`、`media/sessions-list/`、`session-groups.ts`（收件箱 / 行内批复 / 通知） | session-store、sessions-view、session-groups | c6-inbox、p1b-sidebar | mock |
| `connection.ts`、`endpoint.ts`、`apps/extension/package.json` 设置项 | endpoint、settings-contribution | t014-connection、p1b-switch-pending、p1b-reconnect | mock |
| `panels.ts`、`host-store.ts`（面板、草稿、恢复、主面板切换） | host-store | p1a-identity、p1b-main-panel、p1b-sidebar、t010-recover、p1b-pending-send | mock |
| `extension.ts`（命令注册、接线） | 全部单元 | p1a-identity、p1b-sidebar、t014-connection | mock |
| 补丁 0001–0002（草稿、单会话嵌入） | — | p1a-identity、p1a-chat | mock |
| 补丁 0011（消息 fork 按钮）、`session.tsx` 消息操作 | — | c3-fork、p1b-main-panel | mock |
| 补丁 0012（对话 / 轨迹视图）、`message-timeline.tsx` 标题栏 | app `session-trajectory-model.test.ts` | c4-trajectory、c3-fork、p1b-main-panel、p1b-narrow | mock；计时与费用口径用真实模型抽查 |
| 补丁 0013（轨迹多语言、工具页签、折叠）、`apps/chat-webview/src/app.tsx` 语言映射 | app `session-trajectory-model.test.ts` | c4-trajectory（默认英文，再用 `OCO_E2E_LOCALE=zh-cn` 跑一次）、p1a-chat | mock |
| 补丁 0014（比例按钮状态、子智能体行）、`tests/e2e/lib/mock-llm.mjs` 的 `task` 指令 | app `session-trajectory-model.test.ts` | c4-trajectory（英文 + `OCO_E2E_LOCALE=zh-cn`） | mock |
| 补丁 0019（运行视图 M1：对话 / 轨迹 / 运行三视图、`session-runtime-*`） | app `session-runtime-model.test.ts`、`session-runtime-i18n.test.ts`、`session-runtime-events.test.ts` | c5-runtime（英文 + `OCO_E2E_LOCALE=zh-cn`），回归 c4-trajectory | mock；子代理、权限审批界面、429 重试、取消在途 NOT RUN（M2） |
| 补丁 0016（嵌入模式不提供会话 href）、`directory-layout.tsx` 的 `DataProvider` 参数；`apps/chat-webview/index.html` 的 `a:focus` 样式层 | — | c4-trajectory（`subagent-link`）、p1a-identity、p1b-main-panel、p1a-chat、c1-open-file | mock |
| 补丁 0015（切换时保持工作区、首开预置目录、输入框会话事件）、`app.tsx` 的 ready 时机、`bridge-core.ts` 的 gzip 与 `/provider` 合并 | bridge-core | p1b-main-panel（`switch-uncached-*`）、p1a-identity、p1b-pending-send、t010-recover；gzip 再用 `OCO_BRIDGE_GZIP=1` 跑 p1a-identity、p1a-chat | mock；黑屏与耗时只能在 Remote 上用 `docs/evidence/switch-perf/switch-probe.mjs` 测 |
| `apps/chat-webview/index.html`、`src/main.tsx` 的骨架屏（保留到出现文字或输入框、“无法连接”页持续 1.5 s 才算）、`bridge-core.ts` 的 `painted` 放行 `/provider` | bridge-core | p1b-theme-load（`boot-continuous`）、t010-recover（`initial-unreachable`）、p1b-main-panel、p1a-identity | mock |
| `managed-server.ts`、`connection.ts`（托管模式、多根工作区当前文件夹） | managed-server | t007-managed、t007-multiroot、t014-connection | mock |
| `connection-view.ts`（Connection 视图）、`apps/extension/package.json` 的 views | diagnostics、settings-contribution | p1b-sidebar（`connection-view`） | mock |
| `diagnostics.ts`、状态栏、诊断导出 | diagnostics | t015-diagnostics、t014-connection、p1b-sidebar（`connection-view`） | mock |
| 补丁 0003（窄 dock） | — | p1b-narrow | mock |
| 补丁 0004（等模型加载再发送） | — | p1b-pending-send、p1b-theme-load、p1b-switch-pending | mock |
| `apps/chat-webview/`（主题、输入） | — | p1b-theme-load、p1b-ime、p1a-chat | mock |
| 发送 / 取消 / 流式 / 权限 / 问答 链路 | 相关单元 | p1a-chat、p1b-sidebar（chain-*） | mock 定向后，收尾用真实模型 |
| `tests/e2e/vscode.mjs`、`server.mjs`、`lib/`（公共测试设施） | e2e-results | 全部 23 个 | mock 全量；等待逻辑改动再加真实模型全量 |
| `scripts/brief*.mjs`、`scripts/lib/` | brief、e2e-results | — | — |
| 上游升级、补丁重放 | 全部 | 全部 23 个 | 真实模型 |

一个改动命中多行时取并集。拿不准时，多跑一个相关套件比跑全量便宜。

## 全量的定义

`tests/e2e/run.mjs` 的 `DEFAULT_SUITES`，共 23 个：p1a-chat、p1a-identity、p1b-sidebar、p1b-narrow、p1b-theme-load、p1b-ime、p1b-reconnect、p1b-pending-send、p1b-switch-pending、c1-open-file、c1-focus、c2-diff-unavailable、t010-recover、t014-connection、p1b-main-panel、c3-fork、t007-managed、t007-multiroot、t015-diagnostics、c4-trajectory、c5-runtime、c6-inbox、c7-result-card。

不在默认列表中：t004、t005（P0 历史套件）、perf、smoke、c8-git-review（切换 Review 范围时的定向回归，验证会话文件去重 / 外部 Git 文件排除、Git 入口及单文件定位）。p1b-ime 的 `ime-real-macos` 需要真人使用系统输入法，自动运行时恒为 NOT RUN。

## 读结果

- 成功只看 `run.mjs` 末尾的汇总表或 `bun run brief` 的短摘要。
- 失败时只读对应 `docs/evidence/runs/<runId>/results.json` 中非 PASS 的项和截图，不展开整份日志。
- 同一失败不要不加改动地连续重跑；先判断是测试侧还是产品侧。
