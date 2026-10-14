项目 oco（OpenCode 的 VS Code 客户端），你在 Mac mini 执行机上无人值守运行，工作目录就是仓库根，分支 mini/mini-compat（setup 与 build 已由脚本完成）。用户在睡觉：不要提问，阻塞时 `bash scripts/mini/notify.sh "<一句话>"` 后按降级规则继续。不要用 pkill / killall 这类按名字杀进程的命令，只停你自己启动的进程（记下 PID）。

先读：AGENTS.md「验证与交付」、docs/MINI.md、docs/evidence/mini-card7.md 与 mini-nested.md 的测试服务说明；scripts/test-server.sh 和 tests/e2e/server.mjs 里服务端二进制 / 版本怎么选（grep VERIFIED_SERVERS、version、opencode 路径）。

目标：评估 oco 能否连接 npm 上最新公共版 opencode（包名先用 `npm view opencode-ai version` 确认，预期 1.19.x），给「是否支持公共版」决策提供证据。只装在临时目录（如 /tmp/oco-compat/），不全局安装，不改用户已有的 opencode。

步骤：
1. 用公共版二进制按测试服务的同一配置（mock 模型）起服务，记录 `/global/health` 与 `/api/info` 版本、宿主 `server-version.ts` 的判定（是否落入 VERIFIED_SERVERS 之外的警告）。
2. 对它跑 mock 回归：c6-inbox c10-sidebar-answer c12-new-session-draft c13-worktree-inbox c16-sidebar-stop c17-subagent-aggregate c18-permission-note c24-runtime-question p1b-sidebar（测试脚本若写死服务端路径，用环境变量或最小测试侧改动切换，不改产品代码）。
3. 差异报告：失败项逐条给出原因归类（API 路径 / 事件载荷 / 字段改名 / 行为差异 / 测试侧），附最小复现与建议改法（只写建议，不改产品代码）。

唯一写入范围：tests/e2e/**（仅切换服务端所需）、docs/evidence/mini-compat.md（新）、docs/evidence/runs/**。不改 apps/**、patches/**、vendor/**、STATUS / NEXT / PROGRESS / AGENTS.md，不推送，不合 main。收尾按路径 git commit（结尾 `Co-Authored-By: Claude <noreply@anthropic.com>`），停掉自己起的服务。
预算：最多 2.5 小时；每完成一步更新证据文件。只读 results.json，不看截图。
最后输出（原样发 Telegram）不超过 12 行：公共版版本、通过 / 失败数、主要不兼容点、建议、证据路径、提交号。
