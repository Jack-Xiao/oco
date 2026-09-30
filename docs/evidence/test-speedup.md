# 测试提速（2026-09-30）

代码提交：`23c0954`（等待逻辑、可选 mock 模型、单元输出降噪）、`376470e`（全量定义统一为 13 个套件、[测试范围](../TEST-SCOPE.md)）。主线程实现，未委派；model/provider unknown。本地，未推送。

## 改了什么

- 公共设施（`tests/e2e/vscode.mjs`、`server.mjs`）：启动和命令面板按条件等待，不再固定停顿；新增 `quickInput`、`waitUntil`；启动时先等 `--disable-extensions` 的提示弹出再清除（否则会盖住 dock 按钮，本批中途引入过一次，已修）。
- 可选 mock 模型：`OCO_E2E_MODEL=mock bash scripts/test-server.sh` 启动 `tests/e2e/lib/mock-llm.mjs`（OpenAI 兼容、只监听 127.0.0.1）。它识别套件的固定提示词，发起 bash / question / read / write 工具调用、长列表流式输出（含 reasoning 前导）。默认仍是真实模型。套件从服务读取模型，`results.json` 记 `modelMode`；`brief` 把 mock 运行归为特殊运行 `mock-model`，不计验收。
- 套件：c1-open-file、p1a-identity、p1b-narrow 的固定 sleep 换成廉价条件（DOM、API）；`hostState()` 每次要走命令面板（约 1 秒），不用于轮询。回复完成后的 UI 检查超时缩短（20→5 秒），模型等待超时不变。p1b-reconnect 等待侧栏提示出现后再断言（提示可能比列表晚到约 1–2 秒）。
- 单元：brief / e2e-results 测试静音 console；合并重复的 brief 用例 7 到 11；新增 mock 分类用例。输出从约 2.2 KB 降到约 110 字节，仍为 136 项。

## 结果

以前：历史成功运行的典型耗时（真实模型，不同版本）。mock / 真实：本批运行，各套件单独计时，不是一次连续全量。

| 套件 | 以前 | mock | 真实模型（本批） | 真实运行 ID | 记录版本 |
| --- | --- | --- | --- | --- | --- |
| p1a-chat | 约 130 秒 | 37 秒 8/8 | 92 秒 8/8 | 20260930-122314-p1a-chat-a66a | 33433bb dirty（内容 = 23c0954） |
| p1a-identity | 约 180 秒 | 86 秒 14/14 | 131 秒 14/14 | 20260930-122447-p1a-identity-3824 | 33433bb dirty |
| p1b-sidebar | 约 160 秒 | 46 秒 11/11 | 146 秒 11/11 | 20260930-122658-p1b-sidebar-e436 | 33433bb dirty |
| p1b-narrow | 约 210 秒 | 123 秒 12/12 | 199 秒 12/12 | 20260930-122924-p1b-narrow-6b96 | 23c0954 |
| p1b-theme-load | 约 30 秒 | 27 秒 3/3 | 28 秒 3/3 | 20260930-123244-p1b-theme-load-b02d | 23c0954 |
| p1b-ime | 约 16 秒 | 15 秒 1/2 | 73 秒 1/2 | 20260930-123312-p1b-ime-e1ac | 23c0954 |
| p1b-reconnect | 约 41 秒 | 34 秒 5/5 | 31 秒 5/5 | 20260930-123425-p1b-reconnect-f73c | 23c0954 |
| p1b-pending-send | 约 200 秒 | 127 秒 7/7 | 317 秒 7/7 | 20260930-123457-p1b-pending-send-3f03 | 23c0954 |
| p1b-switch-pending | 无记录 | 52 秒 2/2 | 145 秒 2/2 | 20260930-124014-p1b-switch-pending-b942 | 23c0954 |
| c1-open-file | 约 50 秒 | 30 秒 6/6 | **651 秒 3/6，BLOCKED** | 20260930-124241-c1-open-file-8026 | 376470e |
| c2-diff-unavailable | 约 14 秒 | 13 秒 3/3 | 13 秒 3/3 | 20260930-125332-c2-diff-unavailable-df43 | 376470e dirty |
| t010-recover | 无记录 | 10 秒 2/2 | 11 秒 2/2 | 20260930-125346-t010-recover-eae6 | 376470e dirty |
| t014-connection | 约 21 秒 | 14 秒 6/6 | 14 秒 6/6 | 20260930-125358-t014-connection-f3ce | 376470e dirty |

p1b-ime 的 `ime-real-macos` 需要真人输入法，恒为 NOT RUN。

- mock：13 个套件合计约 10.2 分钟，全部 exit 0。有历史数据的 11 个从约 17.5 分钟降到约 9.2 分钟。
- 真实模型：12 个 exit 0。c1-open-file 的 3 个 FAIL 都要等模型回复：约 12:43 起测试模型对 3 个提示都没有回复（助手消息未完成、无错误），其余 3 项 PASS。同一代码在 mock 下 6/6。记为 BLOCKED（模型服务无响应），不是代码结论。
- 真实模型耗时不作为优化后的基准：本轮后段模型明显变慢（pending-send 317 秒、ime 73 秒，同代码 mock 127 / 15 秒），随后停止响应。chat、identity 两项在模型正常时从约 130 / 180 秒降到 92 / 131 秒。
- 同一时段另一会话在 worktree `c1-focus-t010-recovery` 里跑 E2E（独立服务 4527），VS Code 窗口可能互相抢焦点。

## 不能据此得出的结论

- 这不是同一提交上的真实模型全量：结果分布在 33433bb（dirty）、23c0954、376470e 三个版本，`brief` 显示 MIXED_REVISIONS。
- mock 通过不证明真实流式输出、取消时序和模型协议兼容。
- 历史失败比例（含负向对照、跨版本调试运行）不是随机失败率，本批没有测量不稳定率。
- 未做并行执行；p1b-pending-send 的时长主要是刻意注入的 8 秒加载延迟，未改。

## 其他命令

- `bun run typecheck` PASS；`bun test tests/unit` 136 PASS / 0 FAIL。
- 构建本批 NOT RUN（产品代码未改）。
