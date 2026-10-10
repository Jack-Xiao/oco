# 当前队列

本文件是唯一的当前队列。状态只看 [STATUS](STATUS.md)。不要执行 HANDOFF 或 P1B-NEXT-STEPS 里的旧提示词。

当前基线：main `ce17cd8`。运行视图 M1–M5（补丁 0020）已随 PR #4 / #5 合入 main；补丁 0001–0020 干净重放；vendor OpenCode v1.18.33。gcp-workstation 已不存在，Remote 相关验证统一 BLOCKED；本机查看走 `bash scripts/package-vsix.sh && bash scripts/install-local.sh` 后 Reload Window。

## 0. 本批：收口（2026-10-10，已完成，证据见 [cleanup-2026-10-10](evidence/cleanup-2026-10-10.md)）

- [DONE] `.gitignore` 忽略 `.oco-e2e-*.log`；根目录只留最新 vsix；删除已合并且 worktree 干净的 `claude/*` 分支。保留 4 个有未提交改动的 worktree：`first-session-slow-open-c83e72`、`musing-solomon-847dba`、`nostalgic-gates-ef74ca`、`practical-shamir-62b821`，由各自会话处理。`.codex/`、`.kilo/` 下的 worktree 属于其他工具，不动。
- [DONE] STATUS 瘦身为当前事实，批次历史整段搬到 PROGRESS。
- [DONE；真实模型 c5 24/4，剩余 FAIL 与这三处修复无直接对应，见 fail-diag] M5 三个小坑：子会话翻完全部历史（原只同步最近 20 条）；step 时间旁表随 `dropSessionCaches` 清理；`snapshotAt` 的 token / 花费泄漏。
- [DONE] `scripts/regen-patch.sh`：在临时 worktree 里按序应用前序补丁重建基线，再生成目标补丁并校验干净重放。旧基线 `deb241e` 在当前浅克隆中已不存在，0020 与前序补丁有 3 个文件重叠，不能直接 `git diff HEAD`。
- [DONE] 代码落地后：0020 用 `regen-patch.sh` 再生成（58 文件，+20179 −8），0001–0020 干净重放且重放树与工作树一致；根 typecheck 0、unit 190/0；session 单测 427/0；`bun run build` PASS；本机已装 `oco-0.0.4-ce17cd8.vsix`（需 Reload Window）。第 1 节真实模型回归已跑一轮，结果见下。

## 1. 真实模型回归（本批第二步）

- [DONE 一轮] 真实模型全量 E2E：21 套件，首轮 16 套件无 FAIL；修测试后重跑 p1a-chat、p1a-identity 通过。见 [fail-diag](evidence/cleanup-2026-10-10-fail-diag.md)。
- [TODO] p1b-narrow「新面板未出现」：两次落在不同宽度（320、260），先用 mock 模式循环复现，判定是否为产品侧打开新面板的竞态。
- [TODO，测试侧] c4 live-update / subagent-row、c5 tool-turn / tool-fail / retry：按 `modelMode` 把依赖 mock 口令或模型时序的断言改判 N/A 或放宽采样；c5 真实模式外层超时调到 ≥ 30 分钟。
- [DONE 2026-10-10] 真实模型新对话运行视图：阶段序列与流式递增正常；轮末 tools-k 复核见第 3 节。
- [NOT RUN] 嵌套 ≥2 层子代理：big-pickle 两次提示都只派一层；要验证得给 mock 补孙会话再加 E2E，或换会递归派发的模型。
- [DONE 2026-10-10] 亮色主题目视：仅轨迹时间线圆点对比度偏低（第 3 节小项）。
- [TODO，长期] 数小时运行与长会话内存趋势；数千行长会话滚动（工作站上最长只有 12 次请求）。
- [BLOCKED，无主机] Remote 断网恢复、Remote 窗口查看轨迹与运行视图；本机粘贴图片（A11 剩余）仍 NOT RUN。

## 2. 多 agent 驾驶舱（下一阶段；先写 ADR-009 划界，再动手）

oco 是 OpenCode 的客户端，不自建调度引擎。上游 1.18.33 已有 `task` 后台子代理、`prompt_async`、`permission.ask` 等钩子。按杠杆排序：

- [DONE 2026-10-10] [ADR-009](adr/009-multi-agent-cockpit-boundary.md)：oco 只通过 OpenCode API 发起会话、选择 agent / 模型、投递提示词、批复权限；不做推理循环、不执行工具、不自建权限库、不内置定时器。
- [DONE 2026-10-10，证据 [cockpit-inbox-2026-10-10](evidence/cockpit-inbox-2026-10-10.md)，E2E c6-inbox] 跨会话「待处理」收件箱：侧栏新分区列出等权限 / 等提问 / 报错 / 完成未读的会话（含子代理），就地批复，状态栏计数 + VS Code 通知。数据源为 session-feed 已接收的 SSE 事件，不改桥契约。验收：三个后台子代理同时等授权，不打开任何会话即可全部批完。
- [TODO] 批量发起与任务队列：任务清单文件逐项经 `prompt_async` 发成独立会话，打批次标签，侧栏按批次分组（兼做 T009），并发上限可配。
- [TODO] 每会话结果卡与批次汇总：改动文件、耗时、花费、最后一条输出，一键打开 diff（复用运行视图索引）。
- [TODO，按需] 最小化恢复 Agent 定义编辑（T013 的权限 / 模型子集），按 ARCHITECTURE §8 的 hash 校验与写回规则。
- 不做：oco 内置 cron / 定时器（夜间批量用脚本包 `opencode run` 交给 launchd）；多模型竞赛；团队 RBAC。

## 2b. 运行视图 M5 设计评审建议（2026-10-10，待用户圈选后立项）

- 来源 [runtime-m5-critique-2026-10-10](design/runtime-m5-critique-2026-10-10.md)。主线程建议先做只改显示、代价小的 5 条：顶栏状态写阶段与已等时长（P1-1）；本轮结束后忽略态收敛为一行（P1-3 后半）；环上计数合并「等 2（工具 1 · 子代理 1）」并删航道 / 泊位术语（P2-5）；「第 N 次请求」与上下文去重（P2-6）；组装阶段卡片改打包清单（P2-7）。提问态改造（P1-2）要接输入框，单独立项；窄布局三条合成一轮。
- 做法：先改样稿模板（`scripts/runtime-m5-mockup-build.mjs` 重建 + 关键帧截图）给用户看，确认后再进产品补丁 0020，每条附截图定位。
- 顺手：`vendor/opencode/packages/app/src/components/session/fixtures/runtime-m5-oracle.json` k09 / k10 的 tone 随下次 0020 再生成改为 faint。

## 3. 小项（按需）

- 收件箱：提问就地作答（环心输入框，与 NEXT §2b P1-2 合并考虑）；真实模型下目视通知与收件箱；亮色主题下看一次分区与按钮。
- 轮末工具台 tools-k：在 end 后 ≥2 s 再采样确认收到 0（2026-10-10 探查只采到 end 瞬间的 0.380，`dk` 为逐帧过渡值）。
- 亮色主题下轨迹时间线圆点 rgb(205,214,228) 对比度偏低。
- c4 / c5 在真实模型模式下跳过或分支 mock 专属断言（live-update、subagent-row、tool-turn、tool-fail、retry）；与另一会话的 fail-diag 协调，不要同时改 tests/e2e。
- 轨迹页子智能体行跳转子会话（对话卡片已走宿主 `openSession`，轨迹行复用同一路径）。
- 轨迹页「子智能体」标签改用子代理蓝；矮航道作业区标签隐藏。
- 切换大会话时新数据到达前没有加载提示；首开后第一次点击仍可能等一次 `/provider`。
- 运行视图嵌套 ≥2 层 mock E2E（需 mock 产生孙会话）。
- 真实「断连」需宿主新增消息（改桥契约），v1 不做。
- 补丁 0020 体量（56 个文件，多为新文件）：可选把纯新增文件移出补丁改为构建时叠加目录，只在 vendor 升级吃力时再做。

## 4. 仍未做的 v0.1 项（按需单独立项）

- T009 多连接 / 多工作区分组（分页与服务端搜索已完成；批次分组见第 2 节）。
- T010 键盘可访问性、主题配色专项检查。
- T011 附件 / 图片大小限制与远端来源区分。
- T014 管理页外壳。T018 正式 publisher、oco 自身许可证（需用户决定）。
- 不做，除非用户另行决定：记录实际系统提示词 / 原始请求（需 OpenCode 插件钩子，只能托管模式注入）；工具页签按权限标灰、MCP 工具分组。

## 执行约束

- 开工读 AGENTS.md；STATUS / NEXT 先定位标题，只读任务相关段落，以及本任务点名的契约。
- 调查、独立实现、测试和文档检查先实际委派。主代理保留契约、集成和关键抽验；接手例外、实际执行证据与 fallback 记入本批证据，按 [AGENTS](../AGENTS.md) 执行。
- 历史 E2E 不是本轮通过；mock 运行不计真实模型验收。
- 真实 IME、系统剪贴板、Windows 仍按 STATUS 的未验证标记。缺环境就标 NOT RUN 或 BLOCKED。
- 你不是唯一工作者：提交只按路径加入自己的文件，不用 `git add -A`。
- 任务写明授权时可以本地提交。不自动推送或发布。
