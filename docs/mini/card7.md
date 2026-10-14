项目 oco（OpenCode 的 VS Code 客户端），你在 Mac mini 执行机上无人值守运行，工作目录就是仓库根，分支 mini/card7（基于 claude/roadmap-batch-2026-10-14，setup 与 build 已由脚本完成）。用户在睡觉：不要提问，遇到阻塞用 `bash scripts/mini/notify.sh "<一句话>"` 通知后按下面的降级规则继续。

先读：AGENTS.md「验证与交付」一节、docs/MINI.md、docs/NEXT.md §0 的「卡 6」「卡 7」（grep -n '^### 卡' 定位，只读这两张卡）、docs/evidence/roadmap-batch-2026-10-14-tests.md。不读调研全文和历史证据。

目标：给卡 6 新功能补 mock E2E 并跑通，再跑回归、竞态循环和真实模型套件，准备目视截图。

唯一写入范围：tests/e2e/**（新套件 c18–c24 与测试侧修复）、tests/e2e/server.mjs 与 mock 相关文件（仅为新套件补场景）、docs/evidence/mini-card7.md（新）、docs/evidence/runs/**。产品代码（apps/**、patches/**、vendor/**）只在步骤 3 的规则下改。不改 STATUS / NEXT / PROGRESS / AGENTS.md，不推送，不合入 main。

步骤：
1. 新 mock E2E，每个套件交一个子代理（Agent 工具，model: "sonnet"）写并跑，参考 c10 / c16 / c17 的写法，子代理回报 ≤10 行：c18-permission-note（Always 预览文字；Deny with note 后 `GET /permission` 为空且服务端收到 message）、c19-label-snooze（加标签进分区；snooze 隐藏与 Unsnooze；新消息到达自动唤醒；等授权行不被隐藏、状态栏计数不变）、c20-inbox-nav（`oco.inbox.next` 打开并 Enter 直达；侧栏 j / k / Enter / ?）、c21-follow（开 Follow 后 agent 编辑的文件以 preview 打开、焦点不离开面板）、c22-review-threads（Add to Review Notes 后出现评论线程，Send all 后消失）、c23-subagent-pills（父会话面板标题行出现 pills，点击打开子会话）、c24-runtime-question（运行视图环心点选项即回答，`GET /question` 为空）。取不到的断言记 N/A 并写原因。
2. 回归：`bash scripts/overnight-e2e.sh`（默认 13 套件，mock）+ 新套件；`bash scripts/overnight-e2e.sh --loop 10 p1b-narrow`；`bash scripts/overnight-e2e.sh c4-trajectory c5-runtime --real`（真实模型不可用就记 BLOCKED 并通知）。
3. 失败处理：测试侧直接修。产品侧缺陷最多修两轮（改动保持最小、补单测、`bun run typecheck` 与 `bun test tests/unit` 通过、重建后重跑相关套件），仍不过就停手，在证据里写清复现步骤和怀疑位置，并 notify。
4. 目视准备：对下列项各截 1 张图放进本次 runs 目录的 visual/，在证据里列清单（每项一行：文件名 — 看什么）：收件箱与 worktree 会话、侧栏停止、通知、审阅意见与评论线程、Fix with OpenCode、子代理徽标与标题行 pills、Always 预览 / Deny with note、标签 / Snooze 分区、运行视图提问态与窄布局、亮色主题下侧栏分区。
5. 收尾：docs/evidence/mini-card7.md 写结果表（套件、pass/fail/N/A、results.json 路径、修了什么）、产品缺陷清单、需要用户决定的事；按路径 git commit（结尾加 `Co-Authored-By: Claude <noreply@anthropic.com>`），不推送。

预算：最多 6 小时；每完成一步更新证据文件当 checkpoint。只读 results.json 和 summary.md，不看截图内容。
最后的输出（会原样发到 Telegram）不超过 15 行：各步骤结论、通过 / 失败数、产品缺陷数、证据路径、最后一个提交号。
