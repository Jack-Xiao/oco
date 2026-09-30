# C2 单轮 Diff 展示（补丁 0007）

日期：2026-09-30。代码提交 `7fd3bd5`（main，本地，未推送）；上游 `51ef4be` + 补丁 0001–0007。主线程实现，未委派。model/provider unknown。
依据：[来源矩阵](c2-diff-sources.md)、[运行时证据](c2-runtime.md)。

## 行为

- 时间线单轮 Diff 行（上游已有，数据源 = 用户消息 `summary.diffs`）在嵌入模式下加注“本轮工作区变化（含期间外部修改）”，不再让人理解为“AI 的修改”。
- 存储的单轮 Diff 为空、该轮已结束、且该轮有已完成的 edit / write / apply_patch 工具部件时，新增一行“本轮 Diff 不可用（快照缺失或读取失败）”，只列这些工具写过的文件（点击在 VS Code 打开，走 C1 宿主校验），不显示前后内容，也不显示“无修改”。
- 未改：不做会话级累计 Diff、不做回滚；上游评审面板的“Git 变化”模式是独立入口并有自己的标签，本批未改动（NOT RUN 专门核对）。

改动：`patches/opencode/0007-oco-turn-diff-scope-unavailable.patch`（timeline-row.ts、rows.ts、summary-diffs.ts、message-timeline.tsx，及上游单测两处）；`tests/e2e/c1-open-file.mjs` 的 diff-summary 用例增加标签断言。

## 检查

| 检查 | 结果 |
| --- | --- |
| 上游 app `tsgo --noEmit` | exit 0 |
| 上游单测 `summary-diffs.test.ts` + `rows-oco-diff.test.ts` + `rows-current.test.ts` | 9 pass / 0 fail（`turnToolFiles` 2 项、行选择 4 项：非空只出 DiffSummary；空/缺失 + 写文件工具出 DiffUnavailable；无写文件工具两者都不出；轮次进行中不出） |
| 补丁 0001–0007 在干净上游检出重放 | 一致（逐文件 cmp） |
| oco typecheck / unit | PASS / 128 pass 0 fail |
| `bun run build` | 成功，产物含标签文本 |
| E2E `c1-open-file` | 验收运行 [`20260930-093034-c1-open-file-e1b7`](runs/20260930-093034-c1-open-file-e1b7/results.json)：6/6 exit 0，oco `7fd3bd5` 干净，VS Code 1.139.1，opencode 1.18.33 测试服务 |

运行历史（未入库）：`092451`、`092628` 为环境问题（测试服务未启动，“no panel”），启动 `scripts/test-server.sh` 后恢复；`092757` diff-summary FAIL、`092918` markdown-path FAIL，两次都是文件已打开（fileOpens 1、编辑器标签存在）但 10 s 内活动标签仍是聊天页——测试的焦点判定不稳定，与本补丁无关（未改点击路径），未修。

## 限制

- DiffUnavailable 行只有单测覆盖，没有 E2E（需要构造快照关闭或 blob 丢失的真实轮次）：NOT RUN。
- `c1-open-file` 活动标签判定偶发失败（上述两次），留作测试稳定性问题。
- 其余 9 个 E2E 套件未重跑。
