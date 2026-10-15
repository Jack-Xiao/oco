项目 oco（OpenCode 的 VS Code 客户端），你在 Mac mini 执行机上无人值守运行，工作目录就是仓库根，分支 mini/mini-remote。用户不在：不要提问，阻塞时 `bash scripts/mini/notify.sh "<一句话>"` 后按降级规则继续。

前提（用户已手动完成）：本机 `ssh -o BatchMode=yes localhost true` 可免密成功。先验证这一条，不成功就 notify 并结束，不要自己改 ~/.ssh。

先读：AGENTS.md「验证与交付」、docs/MINI.md、docs/NEXT.md §1 里 `[BLOCKED，无主机]` 那一行、docs/evidence/v01-remote/ 下的索引或 README（先 ls）。不读其他历史证据。

目标：用 VS Code Remote-SSH 连本机 localhost 作为远程主机，解除 Remote 相关 BLOCKED：Remote 窗口里打开 oco 侧栏与面板、查看轨迹与运行视图；断网恢复（停掉 / 恢复远端 opencode 服务或断开 ssh 后重连）。

唯一写入范围：tests/e2e/**（新增或修复远程套件）、docs/evidence/mini-remote.md（新）、docs/evidence/runs/**。允许把 ms-vscode-remote.remote-ssh 装进 E2E 的隔离测试 profile（不装进用户自己的 VS Code）。不改产品代码、STATUS / NEXT / PROGRESS、~/.ssh、系统设置；不推送。

步骤：找到或补写远程 E2E（隔离 profile、mock 模型）→ 跑通 → 结果表与 NOT RUN 原因写进证据 → 按路径 git commit（结尾 `Co-Authored-By: Claude <noreply@anthropic.com>`）。产品缺陷只记录复现步骤，不修。
预算：最多 3 小时；每完成一步更新证据文件。最后输出（原样发 Telegram）不超过 15 行：结论、通过 / 失败 / BLOCKED 数、证据路径、提交号。
