# 评审剩余 8 条的产品现状（Grok 只读调查，2026-10-10）

- 委派：`grok-worker`，job `run-mv25gx1r-iuq04e`，Grok session `f4387b51-0d91-4ee1-9a17-af328ddb90c5`，provider/model：unknown（工具未返回）。用时 9m26s，6 次工具调用。
- 沙箱只允许写 `vendor/opencode`，证据文件被拒（`Operation not permitted`），本文件由主线程按 Grok 报告代存。Grok 未改源码（报告里的"files changed"是主线程同时在改的三个文件）。
- 验证方式：只对过行号，没跑测试、没开浏览器。未查：宿主 composer 在提问态的具体文案。

| 项 | 成立? | 产品现状 | 位置 | 代价 |
| --- | --- | --- | --- | --- |
| P1-2 提问态 | 部分 | 环心只显示问题正文；「你」卡片列出选项但无 onClick；提示 `ring.you.ask.hint`；运行视图内无输入框。窄卡高 70 且 overflow hidden 会裁切；宽布局不逐项省略 | `ring.ts:1453` / `ring-view.tsx:627` / `session-runtime.tsx:906` / `ring-geo.ts:207` | 中（要接宿主回答通道） |
| P2-4 带回结果站 | 部分 | `st:"next"` 只在 `finish.at` 且原因属 `LOOP_CONTINUE` 时出现，夹具里 4100→4200 共 100ms；live 空闲改成 `end`。结果小签落在「等结果」`waitR`；「带回 N 个结果」在组装站 `ring.pill.sub.res`；图例无 ↻ | `ring.ts:802` / `ring-geo.ts:323` / `session-runtime.tsx:63` | 小（但动几何） |
| P2-8 同一命令 | 成立 | `toolsOf` 写 `row.same`，视图灰色 `ring.tools.same`；≥3 无变色、环上字或顶栏提示 | `ring.ts:1574` / `ring-view.tsx:1026` | 小 |
| P3-9 浮层 | 部分 | 卡片浮层 `inset:12px` 铺满舞台，不是 520×430；子代理浮层宽上限 520、高至少 360；都不能翻同一请求其他结果；文案 key `ring.card.estimated` | `ring-view.tsx:1169` / `ring-geo.ts:370` / `i18n.ts:464` | 小 |
| P3-10 进度条 | 成立 | 空闲标签 `trackLabelsAt` 按宽度先长后短（`ring.fold.idle` / `.short`）；不避让红 / 黄刻度；底栏图例无刻度项 | `ring-track.ts:143` / `ring.ts:1719` / `session-runtime.tsx:1104` | 小 |
| N1 模型框重叠 | 不成立 | 窄布局阈值是宽 < 980 不是 560；560 下模型框底与「模型思考」药丸顶约隔 10px，标注在药丸下方 | `ring-geo.ts:224,277` | 无 |
| N2 环心卡片 | 成立 | 窄布局环心卡片是右侧整列，高等于环区列高 | `ring-geo.ts:228` | 中 |
| N3 空面板 | 部分 | `data-oco-runtime-tools-k` 两种宽度都写，但 `dk` 只进宽布局；窄工具台固定约 168–196px；空子代理区会收到 40px | `ring-view.tsx:454` / `ring-geo.ts:209,236` | 小 |

行号以 2026-10-10 13:30 前的工作树为准（主线程同时在改 ring.ts / ring-view.tsx，之后会偏移）。
