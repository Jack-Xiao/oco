# STATUS 瘦身与批次历史迁移报告 (2026-10-10)

- **任务目标**: 把 `docs/STATUS.md` 从“按批次堆叠的日志”瘦身为“当前事实”（≤ 130 行），把批次历史迁移到 `docs/PROGRESS.md`。
- **改动文件**:
  - `docs/STATUS.md`
  - `docs/PROGRESS.md`
  - `docs/evidence/cleanup-2026-10-10-status-slim.md`

## 1. 规模与行数前后对比

| 指标 | 迁移前 | 迁移后 | 变化 |
| --- | --- | --- | --- |
| `docs/STATUS.md` 小节数 (`grep -c '^## '`) | 47 | 7 | -40 |
| `docs/STATUS.md` 行数 (`wc -l`) | 412 | 59 | -353 (符合 ≤130 行要求) |
| `docs/PROGRESS.md` 行数 (`wc -l`) | 545 | 956 | +411 (追加历史记录) |
| `docs/PROGRESS.md` 迁移小节数 (`### `) | 5 | 52 | +47 (47 个历史批次完整迁移) |

## 2. 旧 STATUS 47 个小节标题迁移核对（缺失项：0）

全部 47 个历史小节在 `docs/PROGRESS.md` 中以 `### ` 标题原样保留，原句未变，所有提交哈希、证据链接、NOT RUN / BLOCKED 标记 100% 保留。使用 `grep -F` 核对结果如下：

1. `补丁编号：运行视图补丁改为 0020（2026-10-09，合并 main 时）` -> PASS (found in PROGRESS.md)
2. `运行视图 M5 用户反馈修正（2026-10-09；同分支，未提交，已装本机 oco-0.0.4-dd67556-fb3.vsix，需 Reload Window）` -> PASS (found in PROGRESS.md)
3. `运行视图 M5：环形循环 + 环心卡片 + 三个坞（2026-10-08；第二批完成，本分支本地提交 8292fba、54ab5d2 及文档提交，未推送，未合入 main）` -> PASS (found in PROGRESS.md)
4. `运行视图：本机查看 + 真实数据修正（2026-10-07；同分支，2026-10-08 随 M5 进度一起本地提交）` -> PASS (found in PROGRESS.md)
5. `运行视图 M4 第三批（用户反馈修正，2026-10-04；同分支，未提交，未部署）` -> PASS (found in PROGRESS.md)
6. `运行视图 M4 第二批（补丁 0019 追加，2026-10-04；在分支 claude/nostalgic-gates-ef74ca，已提交 97251ac，未部署）` -> PASS (found in PROGRESS.md)
7. `运行视图 M4 第一批（补丁 0019 追加，2026-10-04；在分支 claude/nostalgic-gates-ef74ca，已提交 97251ac，未部署）` -> PASS (found in PROGRESS.md)
8. `运行视图 M3（补丁 0019 追加，2026-10-04；在分支 claude/nostalgic-gates-ef74ca，未合入 main，未推送，未部署 Remote）` -> PASS (found in PROGRESS.md)
9. `运行视图 M2（补丁 0019 追加，2026-10-03；在分支 claude/nostalgic-gates-ef74ca，未合入 main，未推送；已部署 gcp-workstation）` -> PASS (found in PROGRESS.md)
10. `运行视图 M1（补丁 0019，2026-10-03；本地已提交，未推送，未部署）` -> PASS (found in PROGRESS.md)
11. `会话标题行恢复上下文用量（补丁 0019，已提交到 main，2026-10-08；oco-0.0.4-24fb5da.vsix 已装本机 VS Code，需 Reload Window）` -> PASS (found in PROGRESS.md)
12. `会话侧栏改为 webview（Jack-Xiao/oco#3，2026-10-08 合并为 9b32950；已装本机 VS Code）` -> PASS (found in PROGRESS.md)
13. `仪表盘 v4 独立设计评估（2026-10-02；未实施）` -> PASS (found in PROGRESS.md)
14. `项目委派规则收紧（2026-10-02；文档）` -> PASS (found in PROGRESS.md)
15. `HTML 技术手册（2026-10-02；文档交付）` -> PASS (found in PROGRESS.md)
16. `扩展界面英文化（提交 85d4c3c，2026-10-01；在 main 上，已部署 gcp-workstation；本地，未推送）` -> PASS (found in PROGRESS.md)
17. `状态栏 oco 标志（提交 e4cc861、588f821，2026-10-01；在 main 上，已部署 gcp-workstation；本地，未推送）` -> PASS (found in PROGRESS.md)
18. `基线与并行工作` -> PASS (found in PROGRESS.md)
19. `连接后误显示「没有会话」（提交 363e5c5，2026-10-02；已部署 gcp-workstation）` -> PASS (found in PROGRESS.md)
20. `侧栏会话列表改版（提交 8d215c3，2026-10-01；已部署 gcp-workstation）` -> PASS (found in PROGRESS.md)
21. `嵌入模式去掉「更多」菜单（补丁 0018，2026-10-01；本地，未推送）` -> PASS (found in PROGRESS.md)
22. `嵌入模式标题行合并（补丁 0017，2026-10-01；本地，未推送）` -> PASS (found in PROGRESS.md)
23. `移除 Agents 视图，新增 Connection 视图（提交 b405b19，2026-10-01；在 main 上，已部署 gcp-workstation；本地，未推送）` -> PASS (found in PROGRESS.md)
24. `无面板时首开：黑屏、logo 闪屏与等待（提交 1ad31ce，2026-10-01；已部署 gcp-workstation；已快进合入 main（28c90ac））` -> PASS (found in PROGRESS.md)
25. `子智能体卡片打开系统浏览器（补丁 0016，提交 37f2634，2026-10-01；已快进合入 main 并部署 gcp-workstation；本地，未推送）` -> PASS (found in PROGRESS.md)
26. `会话切换黑屏与首开提速（补丁 0015，提交 d73bf91，2026-10-01；已快进合入 main 并部署 gcp-workstation；本地，未推送）` -> PASS (found in PROGRESS.md)
27. `轨迹比例按钮选中状态、子智能体行（补丁 0014，提交 ef87ac0，2026-10-01；本地，未推送，未部署）` -> PASS (found in PROGRESS.md)
28. `轨迹多语言、工具页签、折叠步骤（补丁 0013，提交 dc9ecc2，2026-10-01；本地，未推送）` -> PASS (found in PROGRESS.md)
29. `对话 / 轨迹视图（补丁 0012，提交 3979333、09ce32a，2026-10-01；已快进合入 main fdf50a0，本地，未推送）` -> PASS (found in PROGRESS.md)
30. `fork 后侧栏选中跟随（提交 e1e0cc4，2026-10-01）` -> PASS (found in PROGRESS.md)
31. `首次打开会话提速（2026-10-01）` -> PASS (found in PROGRESS.md)
32. `消息 fork 按钮（补丁 0011，2026-09-30；验证运行于 d3ec2e9 + 本批改动）` -> PASS (found in PROGRESS.md)
33. `设置页高级开关（补丁 0009、0010，2026-09-30；验证运行于 4d56f63 + 本批改动）` -> PASS (found in PROGRESS.md)
34. `v0.1 收尾批次（2026-10-01；分支 claude/v01-completion，验证运行于 2b40651）` -> PASS (found in PROGRESS.md)
35. `单主面板会话切换（ADR-007 第 2–4 步，2026-09-30；验证运行于 fe20a44 + 本批未提交改动）` -> PASS (found in PROGRESS.md)
36. `面板保持存活（ADR-007 第 1 步，2026-09-30；验证运行于 main 3036c00 + 本批未提交改动）` -> PASS (found in PROGRESS.md)
37. `C1 焦点收尾 + T010 错误恢复（提交 3e67fc7，合并入 main，2026-09-30；验证运行于合并前的分支，基线 33433bb + 当时未提交的 mock 测试改动）` -> PASS (found in PROGRESS.md)
38. `测试提速（提交 23c0954、376470e，2026-09-30；只改测试与文档）` -> PASS (found in PROGRESS.md)
39. `连接设置子集 + C2/T010 收尾（提交 92034b8、20f0ea1、092c6b3，2026-09-30；验证运行于其提交前的 dirty b393df6 工作树，内容一致）` -> PASS (found in PROGRESS.md)
40. `P1b 稳定性收尾（代码提交 6343f7b；测试运行于 dirty e67129d）` -> PASS (found in PROGRESS.md)
41. `C1 编辑器联动（3bc386f）` -> PASS (found in PROGRESS.md)
42. `C2 本轮验证（2026-09-30）` -> PASS (found in PROGRESS.md)
43. `省 token 工作流` -> PASS (found in PROGRESS.md)
44. `历史复验` -> PASS (found in PROGRESS.md)
45. `未验证范围` -> PASS (found in PROGRESS.md)
46. `维护规则` -> PASS (found in PROGRESS.md)
47. `个人 GCP Workstation 连接修复（2026-09-30）` -> PASS (found in PROGRESS.md)

## 3. 链接目标保留与磁盘存在性核对（缺失项：0，不存在文件：0）

旧 STATUS 中的全部 68 项链接目标（67 项相对路径、1 项 GitHub PR 链接）在新 STATUS 或 PROGRESS 中 100% 出现，且经 `ls` 实测全部 67 个本地相对目标文件均在磁盘上真实存在：

- `../CHANGELOG.md` -> 存在
- `NEXT.md` -> 存在
- `P1B1-REVIEW-NEXT.md` -> 存在
- `TEST-SCOPE.md` -> 存在
- `USER-GUIDE.md` -> 存在
- `adr/006-p1b1-sessions-sidebar.md` -> 存在
- `adr/007-single-main-panel.md` -> 存在
- `adr/008-webview-sessions-list.md` -> 存在
- `design/dashboard-v4-review-for-claude.md` -> 存在
- `evidence/agents-removal.md` -> 存在
- `evidence/c1-editor.md` -> 存在
- `evidence/c1-focus-t010-recovery.md` -> 存在
- `evidence/c1-path-hardening.md` -> 存在
- `evidence/c2-diff-sources.md` -> 存在
- `evidence/c2-display.md` -> 存在
- `evidence/c2-runtime.md` -> 存在
- `evidence/c3-fork.md` -> 存在
- `evidence/c4-header-actions-run.md` -> 存在
- `evidence/c4-trajectory-0013.md` -> 存在
- `evidence/c4-trajectory-0014.md` -> 存在
- `evidence/c4-trajectory.md` -> 存在
- `evidence/c5-context-usage.md` -> 存在
- `evidence/cold-open-review.md` -> 存在
- `evidence/cold-open.md` -> 存在
- `evidence/dashboard-v4-review-2026-10-02.md` -> 存在
- `evidence/delegation-rules-20261002.md` -> 存在
- `evidence/delegation-runtime-m2-2026-10-03.md` -> 存在
- `evidence/first-open-perf.md` -> 存在
- `evidence/gcp-workstation-20260930.md` -> 存在
- `evidence/i18n-english-strings.md` -> 存在
- `evidence/p1b-stability-runs.md` -> 存在
- `evidence/p1b-stability.md` -> 存在
- `evidence/p1b-switch-pending.md` -> 存在
- `evidence/p1b1-acceptance.md` -> 存在
- `evidence/runs/20261001-155122-p1b-sidebar-20fc/results.json` -> 存在
- `evidence/runs/20261001-174051-p1b-reconnect-1870/results.json` -> 存在
- `evidence/runs/20261002-004120-p1b-sidebar-c5d9/results.json` -> 存在
- `evidence/runtime-local-2026-10-07.md` -> 存在
- `evidence/runtime-m1-e2e.md` -> 存在
- `evidence/runtime-m1-verification.md` -> 存在
- `evidence/runtime-m2-e2e.md` -> 存在
- `evidence/runtime-m2-verification.md` -> 存在
- `evidence/runtime-m4-batch1.md` -> 存在
- `evidence/runtime-m4-batch2.md` -> 存在
- `evidence/runtime-m4-batch3.md` -> 存在
- `evidence/runtime-m4-bg-task-mapping.md` -> 存在
- `evidence/runtime-m5.md` -> 存在
- `evidence/server-1.18.13-compat-2026-10-06.md` -> 存在
- `evidence/sessions-webview-spike-2026-10-08.md` -> 存在
- `evidence/subagent-link-0016.md` -> 存在
- `evidence/switch-perf.md` -> 存在
- `evidence/t014-connection-c2-close.md` -> 存在
- `evidence/technical-guide-claude-observation.md` -> 存在
- `evidence/technical-guide-review.md` -> 存在
- `evidence/technical-guide-validation.json` -> 存在
- `evidence/test-speedup.md` -> 存在
- `evidence/trajectory-feasibility.md` -> 存在
- `evidence/v01-completion.md` -> 存在
- `https://github.com/Jack-Xiao/oco/pull/3` -> 外部 URL
- `remote-install.md` -> 存在
- `superpowers/plans/2026-10-03-runtime-dashboard-m1.md` -> 存在
- `superpowers/plans/2026-10-08-runtime-m5-ring.md` -> 存在
- `superpowers/specs/2026-10-02-runtime-dashboard-design.md` -> 存在
- `superpowers/specs/runtime-m3-fixed-layout-mockup.html` -> 存在
- `superpowers/specs/runtime-m5-animated-mockup.html` -> 存在
- `superpowers/specs/runtime-m5-keyframes.json` -> 存在
- `superpowers/specs/runtime-m5-mockup.src.html` -> 存在
- `technical-guide.html` -> 存在

## 4. 未解决项

- 无。顶部小节 `## 收口批次（2026-10-10，进行中）` 已按约定写入单行占位 `由主线程填写`，等待主线程后续填充。
