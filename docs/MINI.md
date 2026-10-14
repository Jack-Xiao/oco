# Mac mini 执行机约定

2026-10-14 用户决定：E2E、真实模型运行、循环复现、长时间测量等花时间的事交给 Mac mini（ssh 别名 `macmini`，用户 jarvis）；本机会话只做决策、契约、架构、上游补丁、集成与合入。

## 分工

| 本机（主会话） | Mac mini（执行机） |
| --- | --- |
| 决策、范围、契约、ADR、上游补丁、评审、合入 main、推送 | 写 / 跑 E2E、回归、真实模型运行、竞态循环、性能与内存测量、目视截图准备 |
| 维护 STATUS / NEXT / PROGRESS | 结果写 `docs/evidence/mini-<任务>.md` 与 `docs/evidence/runs/`，不改 STATUS / NEXT / PROGRESS |
| 产品缺陷的方案与最终修复 | 测试侧直接修；产品侧最多修两轮，仍不过就记录并通知 |

## 流程

1. 本机写提示词 `docs/mini/<任务>.md`（目标、唯一写入范围、验收、预算），提交后执行 `bash scripts/mini/dispatch.sh <任务> docs/mini/<任务>.md`：经 ssh 把当前分支推到 Mac mini 仓库（不经 origin），在 `~/Ai-Project/oco-mini` 把 `mini/<任务>` 重置到该分支，在 tmux `mini-<任务>` 里运行。
2. Mac mini `scripts/mini/run-task.sh`：`bun run setup && bun run build` → `claude -p`（默认 `--model sonnet`，可用 `OCO_MINI_MODEL` 改）→ 结束时把最后的报告发 Telegram。运行中遇到阻塞用 `bash scripts/mini/notify.sh "<一句话>"` 通知。
3. Mac mini 在 `mini/<任务>` 上按路径提交，不推送 origin、不合入 main、不改全局配置。
4. 本机 `bash scripts/mini/collect.sh <任务>` 看状态、取回分支（本地 `mini/<任务>`）和日志尾部，读证据摘要后合入工作分支。

## 约束

- 同一时间只跑一个 `mini-*` 任务（dispatch 会拒绝）；E2E 仍用 `/tmp/oco-e2e.lock`。
- 与本机共用同一个 Claude 账号，额度共享：默认 Sonnet，提示词写明轮数 / 时间预算，报告 ≤15 行。
- 通知走 Mac mini 的 OpenClaw Telegram，目标只写在 Mac mini 的 `~/.oco-mini.env`（`OCO_NOTIFY_TARGET=…`），不进仓库。
- 已有的 Remote Control 会话（tmux `rc-mini-oco`）供用户从 Claude App 手动接管或追问，不由脚本使用。
