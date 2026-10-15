# mini-regress-main

- 基线: main 3f89430（分支 mini/mini-regress，工作区干净）
- 命令: `nohup bash scripts/overnight-e2e.sh --mock`（日志 ~/oco-mini-logs/mini-regress.e2e.log）
- 开始/结束: 2026-10-16 00:14:39（脚本即刻中止），总耗时 <1 分钟（加排查约 10 分钟）
- 结果: **BLOCKED**，0/13 套件运行（summary: `docs/evidence/runs/overnight-20261016-001439/summary.md`）

## 原因
`scripts/test-server.sh` 用 `OCO_OPENCODE_BIN` 或 `command -v opencode`；本机（Mac mini）没有 `opencode` 可执行文件：
`command -v opencode` 在登录交互 zsh 中为空，`/opt/homebrew/bin`、`~/.opencode`、`~/.bun/bin`、`~/.local/bin`、`/usr/local/bin` 均无。
server.log 仅写 "opencode not found"，脚本报 "test server did not come up"。

## 套件结果 / 重跑
| 套件 | 结果 |
| --- | --- |
| c6-inbox … c4-trajectory（共 13 个） | NOT RUN（BLOCKED，无 opencode） |

重跑：无（没有 FAIL 套件）。稳定失败：无（环境阻塞，不是产品或测试缺陷）。

## 下一步
在 mini 上安装/指定 OpenCode（1.19.0 对照见提交 71bfce4），然后设 `OCO_OPENCODE_BIN=<路径>` 重跑。未改全局配置、未安装任何软件（超出授权）。
