项目 oco（OpenCode 的 VS Code 客户端），你在 Mac mini 执行机上无人值守运行，工作目录就是仓库根，分支 mini/mini-nested（setup 与 build 已由脚本完成）。用户在睡觉：不要提问，阻塞时 `bash scripts/mini/notify.sh "<一句话>"` 后按降级规则继续。

先读：AGENTS.md「验证与交付」、docs/MINI.md、docs/evidence/mini-card7.md（了解测试服务与助手的现状，4517/4518 端口上 oco-card1 遗留的测试服务不要终止）。mock 模型与测试服务在 tests/e2e/server.mjs 及其引用的 mock 文件里，先 grep 子代理 / task 工具的 mock 场景。

目标：让 mock 能产生孙会话（子代理再派子代理，≥2 层），补嵌套 E2E，验证运行视图、侧栏子代理徽标 / 展开列表、标题行 pills 在两层嵌套下的计数与状态汇总（孙会话 busy 时父会话徽标为 running，孙会话等授权时父会话 attention）。

唯一写入范围：tests/e2e/**（mock 场景 + 新套件 c25-nested-subagents）、docs/evidence/mini-nested.md（新）、docs/evidence/runs/**。产品缺陷最多修两轮（最小改动 + 单测，typecheck / unit 通过，重建后重跑），仍不过就记录并 notify。不改 STATUS / NEXT / PROGRESS / AGENTS.md，不推送，不合 main。

收尾：跑 c25 连续 3 次 + 回归 c17-subagent-aggregate、c23-subagent-pills、c5-runtime（mock）；证据写结果表与 NOT RUN 原因；按路径 git commit（结尾 `Co-Authored-By: Claude <noreply@anthropic.com>`）。
预算：最多 3 小时；每完成一步更新证据文件。只读 results.json，不看截图。
最后输出（原样发 Telegram）不超过 12 行：结论、通过 / 失败数、产品缺陷与修复、证据路径、最后提交号。
