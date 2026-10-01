# 对话 / 轨迹视图（补丁 0012）证据

- 基线：`7cf751d` + 本批改动（提交 `3979333`、`09ce32a`）；上游 `51ef4be`（补丁 0001–0011 之上）；测试服务脚本模型（mock），本工作区独立服务 127.0.0.1:4537 / mock 4538。
- 调研结论与数据来源：[trajectory-feasibility](trajectory-feasibility.md)。

## 行为

- 会话标题栏（上下文用量圆环左侧）加「对话 | 轨迹」切换。轨迹替换对话时间线区域，输入框保留，可在轨迹里继续发送。切换会话（ADR-007 原地切换）回到「对话」。
- 汇总：请求数、工具数、输入（含缓存）、缓存命中率、输出、思考、费用。订阅/免费模型费用为 0 时标「未计价」。
- 三条泳道（输入 / 模型 / 工具），标尺可选：时长（去掉轮次之间的空闲）、轮次（每轮等宽）、调用（每次请求等宽）。模型条浅色段 = 请求开始到首 token，深色段 = 生成。点击条目选中对应行。
- 列表：系统（说明系统提示词未保存，有自定义 `system` 时显示）、用户、上下文（合成文本、附件）、思考、助手、工具（工具名 / 输入 → 输出摘要）、变更、重试、错误、压缩。每次请求的首行带圆点，每轮首行标「第 N 轮」。可搜索；↑↓ 移动选中，Esc 关闭详情。
- 详情：概述（全文、请求来源 #N、模型、智能体、状态与结束原因、Token 明细与缓存命中、费用、开始时间、总时长、首 token 延迟、生成、吞吐量；工具另有状态与耗时）、原始内容（存储的 part 或消息 JSON，超过 200k 字符截断）。面板宽 ≥ 760 px 时在列表右侧，否则覆盖列表。
- 打开轨迹时把会话历史分页加载完整（聊天视图只按滚动加载）。运行中的请求每秒刷新一次到当前时间。

## 补丁 0012 改动

| 文件 | 改动 |
| --- | --- |
| `packages/app/src/components/session/session-trajectory-model.ts`（新） | 纯函数：轮次 → 请求 → 行；part ID 时间解码；首 token / 生成 / 吞吐推算；三种标尺的时间映射；按 id 去重消息 |
| `packages/app/src/components/session/session-trajectory-model.test.ts`（新） | 11 个单元测试 |
| `packages/app/src/components/session/session-trajectory.tsx`（新） | 视图与切换按钮 |
| `packages/app/src/pages/session.tsx` | +7 行：`view` 状态（随会话切换复位）、`Match` 分支、把切换按钮传给时间线 |
| `packages/app/src/pages/session/timeline/message-timeline.tsx` | +3 行：`headerExtra` 属性，渲染在上下文用量左侧 |

替代 API：官方 app 没有逐步轨迹；「Context」侧栏页只有会话汇总。数据全部来自 sync store 里已有的消息和 part，宿主与桥策略不变（只读 GET）。补丁 0001–0012 在干净的 `51ef4be` 上按序 `git apply --check` 通过。

文案直接写中文（同补丁 0007），没有进 i18n 字典。

## 检查

| 检查 | 结果 |
| --- | --- |
| app 类型检查（`tsgo -b`） | 0 错误 |
| 模型单元测试 | 11/11 |
| app `src/pages/session` + `src/components/session` 单元测试 | 117/117 |
| `bun run verify:brief`（oco typecheck + unit） | 0 错误；164/164 |
| E2E `c4-trajectory`（mock，运行 20261001-045512-c4-trajectory-65c8） | 9/9 |
| 回归 E2E（mock）p1a-chat、c3-fork、p1b-main-panel、c2-diff-unavailable、p1b-narrow | 全部 exit 0：8/8、4/4、6/6、3/3、12/12 |

`c4-trajectory` 各项：toggle-open、rows-match-server（用户 2 / 工具 1 / 思考 1 / 模型条 3 与服务端一致）、tool-detail、request-timing（首 token 240 毫秒、生成 1.9 秒）、raw-content、live-update（在轨迹里发送，请求流式中出现并原地完成）、back-to-chat、switch-resets、narrow-detail（480 px：详情 464 = 根宽 464，无横向溢出，✕ 关闭）。

截图：`runs/20261001-045512-c4-trajectory-65c8/1-trajectory.png`、`4-request-timing.png`、`9-narrow-detail.png`。

## 开发中发现的问题

- 前一轮 E2E 里同一条用户消息在 sync store 的消息数组里出现两次（同一 id，乐观副本与服务端副本），轨迹出现重复的一轮。模型改为按 id 去重（保留最新副本、首次位置），并加单元测试。官方聊天时间线的截图里没有重复（原因未查）；官方「Context」页的消息计数是否受影响，未查。
- 本工作区路径太长，VS Code IPC socket 超过 macOS 103 字符上限，E2E 无法启动。`.oco-test` 改为链接到主检出 `.oco-test/wt-traj`（独立子目录，不与主检出的测试服务共用状态）。

## 真实数据核对（只读，只统计数值）

本机 OpenCode 数据库中助手消息最多的 12 个会话，共 260 次请求，直接喂给 `buildTrajectory`：

- 负的首 token 延迟或生成时长：0；带 token 的请求 254；没有首 token 的 4 次均为出错请求；单个会话建模最长 9.4 ms。
- 首 token 延迟中位数按模型：deepseek-flash 568 ms、deepseek-v4-flash 959 ms、gpt-5.2-codex 1651 ms、gpt-5.4-mini 2258 ms、kimi k3 3291 ms、gpt-5.4 5709 ms、openrouter stealth 44 s。长尾来自个别模型，不是推算错误。
- 首 token 取首段思考/回复/工具输入的开始。不流式输出思考的模型（如部分 OpenAI 模型），首 token 延迟包含它的隐藏思考时间。起点是 OpenCode 创建助手消息的时间，含 OpenCode 自身组装请求的耗时。

## Remote（gcp-workstation）

- 部署：`oco-0.0.1-09ce32a.vsix`（extension.js sha256 `fcaa651d…`，与上一版相同，本批只改 webview）经 `scripts/deploy-remote.sh` 安装，远端 readme 显示提交 `09ce32a`，webview 含本批代码。
- 查看方式：单独的 VS Code 实例（独立配置目录，只复制 Remote-SSH 扩展）连 `/home/user/ai`，工作站为托管模式，该窗口自己启动并在关闭时结束自己的 `opencode serve`。只打开会话、切换视图、点选条目，不发送不修改。截图含用户会话内容，只留在本机临时目录，不入库。
- 会话：该目录下最长的会话（13 条消息、12 次请求、22 次工具调用，模型 opencode/big-pickle）。打开会话到切换按钮可用 2.3 s，切到轨迹 101 ms；行数与服务端一致（用户 1、思考 12、工具 22、模型条 12），面板宽 786 px 无横向溢出，回到对话正常。
- 每次请求：合计 8.3k–25.9k tok，缓存命中 63–100%，首 token 1.1–2.3 s，生成 0.65–6.9 s，吞吐 135–214 tok/s，费用 $0（免费模型）。
- 发现并修复（`09ce32a`）：最后一次请求 42 小时前在工具执行中被中断（服务端没有结束记录，工具停在 running）。首版把它当作运行中，时间轴延伸到“现在”，其余条目全部挤在最左。改为：会话空闲时，或不是最新请求时，未完成的请求标「已中断」，条目在最后一个已保存时间处结束，显示为灰色。修复后模型条覆盖泳道 96%，该请求状态为「已中断（没有结束记录…）」。单元测试新增运行中/已中断/失败三种情形。
- 修复后复验：模型单元 11/11；app session 单元 117/117；`verify:brief` 0 错误、164/164；`c4-trajectory` 9/9（mock）；补丁 0001–0012 在干净上游上可应用。

## 未验证与限制

- NOT RUN：真实模型 E2E、全量 E2E、长会话（数千行）滚动性能（工作站上最长的会话只有 12 次请求）。列表没有虚拟化。
- 不显示实际发送的系统提示词、工具定义和原始 HTTP 请求（OpenCode 不落盘，见调研）。
- 子代理会话只在工具的原始内容里看到 `sessionId`，没有嵌套跳转（第 2 阶段）。
- 订阅模型没有费用估算（第 2 阶段）。
