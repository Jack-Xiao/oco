# 仪表盘 v4 数据核查摘要

2026-10-02。Grok 外部只读报告由主线程代存。运行元信息和完整委派台账仅见 dashboard-v4-review-2026-10-02.md。

外部任务返回 run-muqistlx-zsi4dw；Grok session 655bf9cc-831d-436a-affb-9c432ee2b5c0；包装器 model=unknown，报告自述 grok-4.7 未作为已核实型号。未修改产品文件，未运行测试。子代理未写 checkpoint，结束时以证据补丁返回，属本轮委派过程限制。以下为报告重点，非新增实现。

## 现有投影

- `vendor/opencode/packages/app/src/components/session/session-trajectory-model.ts:15-37` 定义 `TrajectoryRequest`，所读范围没有 `RunModel`。消息作为一次模型请求，含 step/turn/message/start/firstToken?/generationEnd?/end?/windowEnd/tokens/cost/status/error?。
- 同文件 `349-376`：status 为 running/done/error/interrupted；busy + 最新 assistant 推定 live（277）。更早的未结束请求也可能被推断为 interrupted，不能当作确认的服务终止。
- 同文件 `70-91`：task 行提取 agent、description、metadata.sessionId；taskResult 从完成输出中抽取 `<task_result>`。
- 同文件 `355-361`：token 为 input/output/reasoning/cacheRead/cacheWrite，缺失值被合成 0；`170-176` 输入量合计包含 cacheRead/cacheWrite。

## 数据限制与依据

| 需求 | 核查结果 | 依据（vendor/opencode/packages 下） |
| --- | --- | --- |
| 分辨重试 | SDK SessionStatus 有 retry/attempt/message/next，当前轨迹收成 busy；历史重试未必有持久记录 | app/src/components/session/session-trajectory.tsx:240；sdk/js/src/v2/gen/types.gen.ts:673-693；opencode/src/session/processor.ts:674-686 |
| 权限等待 | 轨迹未读 permission 集合；pending/running 不能证明等权限 | app/src/components/session/session-trajectory-model.ts:303-304；SDK ToolState pending/running/completed/error |
| 断连 | 不能用 interrupted 代替传输断连；需要独立连接健康和最后同步信息 | app/src/components/session/session-trajectory-model.ts:349-353；session-trajectory-model.test.ts:114-131 |
| 按块上下文 token | provider usage 是请求级计数，无 system/schema/附件/历史块逐项计数 | opencode/src/session/session.ts:338-377 getUsage；app/src/components/session/session-trajectory-model.ts:204-211,355-361 |
| token 动画回放 | text/reasoning delta 为事件，历史保存的是最终文本及粗粒度起止时间；非逐 token 时戳 | opencode/src/session/processor.ts:294-305,513-545；app/src/context/server-session.ts:1190-1214 的 delta 合并逻辑 |
| 子代理输出 | 父 task 输出主要是子会话最后一段文本；后台启动 task 可以 completed 而子代理仍运行 | opencode/src/tool/task.ts:220-224,275-280,307-312,341-345 |
| 子代理实时内部进度 | 父轨迹仅建当前 session，需要另载子会话，不能把父工具状态当作子任务生命周期 | app/src/components/session/session-trajectory.tsx:237-243；session-trajectory-model.ts:70-85 |
| 首 token/吞吐 | firstToken 含 part 时间/id 推断；generationEnd 可能用工具开始时间；吞吐为派生值 | app/src/components/session/session-trajectory-model.ts:102-116,178-187,288-302 |

## 最小建议（未实现）

1. 保留服务端 session status，不将 retry 合成普通运行。
2. 关联 permission 到真实工具请求，独立标示等待对象。
3. 用量增加 known/settled/source 标志；运行中初始 0 不显示为已测量零消耗。
4. 子代理按 sessionId 独立加载状态；父 task 完成和子会话结束分开。
5. 历史只做有证据的步骤回看；若需要完整动态回放，单独设计事件采集、断档标记和保留策略。
6. 精确输入块占比不可得时显示不可用；字符数不能冒充 token。

尚未核查：permission 字段形状、同一 assistant 在生产流中多 step-finish 的实际发生条件、目标 Claude worktree 与本批 main 的代码差异。正式落地前在目标 checkout 复核。
