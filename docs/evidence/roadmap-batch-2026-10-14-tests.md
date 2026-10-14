# 2026-10-14 批次：E2E 测试侧修复与夜间脚本

范围：只改 E2E 测试侧（`tests/e2e/**`）与 `scripts/overnight-e2e.sh`。本轮按用户要求**不运行任何 E2E 套件、不启动 VS Code**。
所有行为改动均为 **NOT RUN，待夜间运行**。已执行的只有语法检查、两份秒级单测，以及对新 helper / 脚本函数的隔离小测（见末尾）。

## 改动

| 文件 | 改了什么 | 为什么 |
| --- | --- | --- |
| `tests/e2e/vscode.mjs` | `command()` 拆出 `openPalette()`；`palette.fill` 限时 5 s，失败则 Escape 后重开面板重试，最多重试 2 次（共 3 次）；面板打不开仍立即抛错（行为同前）。`clearNotifications()` 改为尽力而为：失败只 `console.warn` 并返回 `false`，成功返回 `true`，不再抛出 | NEXT §3：启动时 `clearNotifications` 的命令面板 `fill` 偶发 30 s 超时（c10 8 次中 2 次，重跑即过）。面板可见但输入框被重渲染 / 抢焦点时，`fill` 会耗满默认 30 s；有界重试吃掉这类偶发，仍失败也不拖垮后续用例 |
| `tests/e2e/vscode.mjs` | 新导出 `userDataDirFor(profile)`：`.oco-test/vscode/<profile>`（先 realpath）加上 socket 名预留 24 字符超过 macOS 103 上限时，改用 `/tmp/oco-e2e-<sha1(root)[:8]>/<profile>`（`/tmp` 不可用才用 `os.tmpdir()`；`OCO_E2E_USER_DATA_ROOT` 可强制根目录）。哈希按仓库根算，同一仓库同一 profile 路径稳定，`fresh:false` 同进程重启仍用同一目录。进程 `exit` 时删除本进程创建的短目录及其空父目录 | NEXT §3：嵌套 worktree（`.claude/worktrees/<name>/.oco-test/...`）下 VS Code 的 `<ver>-main.sock` 路径超限。`launch()` 改用该函数；`--extensions-dir` 不含 socket，未动。**注意**：`tests/e2e/perf.mjs` 按命令行含 `.oco-test/vscode/perf` 过滤进程，在嵌套 worktree 且触发短路径时会匹配不到（perf 不在本轮范围，未改） |
| `tests/e2e/lib/results.mjs` | 新导出 `recordNotApplicable(run, required, id, reason, detail)`：记 `N/A`（reason 写入 detail），并把 id 从传给 `createRun` 的同一 `required` 数组里原地移除 | `computeMissingRequired` 把 required 项的 N/A 也算未满足（单测 `required 为 BLOCKED 或 N/A 亦未满足→1` 固定了该语义，未改）。要让「真实模式下 N/A」不使退出码为 1，只能把该项从本次 required 摘掉 |
| `tests/e2e/c4-trajectory.mjs` | 新增 `REAL = MODEL.mode === "real"`。**live-update**：真实模式不再要求 `40. Mock line 40.` 与 `Completed` 标签，改为要求新请求条在运行中出现、视图保持打开、完成后条数增加且文本行详情非空（detail 带 `relaxed`、`barsBefore/After`）。**subagent-row**：真实模式下模型没调 `task`（`child` 为空）→ N/A；调了则不再要求描述等于提示词（真实运行里是 `Find fork code`）和子会话输出 `subagent-ok`，只验一行、非嵌套、带「子智能体」标签与 `@explore`、详情子会话 id 等于 child。**subagent-link**：真实模式下 `child` 为空 → N/A，否则同前 | fail-diag 2026-10-10（`20261010-044323-c4-trajectory-c774`，真实模型）：live-update 因 mock 文案失败；subagent-row 因描述措辞不同且子会话仍 running 失败。mock 模式的断言与判定一字不改 |
| `tests/e2e/c5-runtime.mjs` | 新增 `REAL`。**tool-turn**：第 1 轮（权限、ask 阶段、call 卡、bash 行、end）仍全部必需；第 2 轮 result 卡（依赖 mock 的 `WITH-SLOW-SIBLING` 才能停留）仅在真实模式且 0 个采样时跳过，detail 带 `relaxed`；有采样则照常判定。**tool-fail**：真实模式没采到红色 `failed` 卡（卡片是 `round-end`）→ N/A；采到则照常判定。**retry**：真实模式没看到 `retrying` 状态（`RETRY-ONCE` 是 mock 口令）→ N/A；看到则照常判定。这一轮对话仍照常发送，后面步骤看到的会话与 mock 模式一致 | fail-diag 2026-10-10（`20261010-044704-c5-runtime-cd6b`）：三项都是 mock 口令 / 模型时序所致，非产品缺陷。mock 模式不变 |
| `tests/e2e/run.mjs` | 新导出 `suiteTimeoutMs(suite, env)`，`runSuites` 给 `spawnSync` 加 `timeout`（SIGTERM；超时打印提示）。`c5-runtime` 在 `OCO_E2E_MODEL !== "mock"`（与 `scripts/test-server.sh` 同一规则）时外层超时 35 min；`OCO_E2E_TIMEOUT_S` 可覆盖任意套件（0 = 不限）；其余套件仍无上限，`DEFAULT_SUITES` 未动 | 原先外层超时是调用方的 `timeout 900`，真实模式 c5 整套 >15 min 被杀（`run` 假失败）。要求 ≥ 30 min |
| `scripts/overnight-e2e.sh`（新） | 见下节 | NEXT §1 / §3 |

## 夜间脚本用法

```bash
bash scripts/overnight-e2e.sh            # 默认 13 个套件、mock 模型；--real 切真实模型；--loop 20 默认循环 p1b-narrow；--dry-run 只打印计划
```

- 默认套件：c6-inbox c10-sidebar-answer c11-sidebar-organize c12-new-session-draft c13-worktree-inbox c14-review-notes c15-fix-with-opencode c16-sidebar-stop c17-subagent-aggregate p1b-sidebar p1b-narrow c5-runtime c4-trajectory；也可直接列套件名覆盖。
- 复用 `node tests/e2e/run.mjs <suite>` 逐个运行（含上面的 c5 外层超时）；单套件失败不中断后续；`--loop N` 让每个列出的套件连跑 N 次（只给 `--loop` 时套件为 p1b-narrow；复现宽度竞态可加 `OCO_NARROW_WIDTHS=320`）。
- 互斥：`mkdir /tmp/oco-e2e.lock`（原子；他人用普通文件占锁同样会挡住），写 `pid` 与 `info`；持有者进程已不存在视为陈旧并清除；默认最多等 6 小时（`--lock-wait SEC`，0 = 不等）；退出（含 Ctrl-C / TERM）时只释放自己持有的锁。
- 测试服务（`scripts/test-server.sh`，端口 `OCO_TEST_PORT` 默认 4517）：已在运行且模式一致则复用且不停止；没运行则脚本按 `--real/--mock` 启动并在结束时停掉整个进程组；模式不一致则拒绝并退出（不动他人进程）。启动失败请设 `OCO_OPENCODE_BIN` 或先自行启动（本机可能没有安装的 opencode 二进制，见 card3 证据）。`OCO_VSCODE_BIN` 等环境变量原样透传。
- 产物：`docs/evidence/runs/overnight-<YYYYmmdd-HHMMSS>/summary.md`（每次运行一行：套件、迭代、退出码、耗时、PASS/FAIL/NOT RUN/BLOCKED/N/A、模型模式、FAIL / missing / N/A 的 id、`results.json` 路径、日志路径）与每次运行的 `NN-<suite>.log`、`server.log`（如由脚本启动）。每套件的 `results.json` 仍在 `docs/evidence/runs/<runId>/`。被外层超时杀掉的套件没有 `results.json`，汇总里标 `no results.json`。退出码：全部套件退出 0 才为 0；拿不到锁或服务不可用为 3。

## 验证（本轮）

| 项 | 结果 |
| --- | --- |
| `node --check` vscode.mjs / lib/results.mjs / c4-trajectory.mjs / c5-runtime.mjs / run.mjs | 通过 |
| `bash -n scripts/overnight-e2e.sh`；`--dry-run`、`--help`、未知套件名（退出 2） | 通过 |
| `bun test tests/unit/e2e-results.test.ts tests/unit/brief.test.ts` | 35 pass / 0 fail |
| `userDataDirFor` 隔离 import（不启动 VS Code）：当前路径 62 字符走原路径；强制根目录时得到 `/private/tmp/oco-e2e-<hash>/c4-trajectory`，进程退出后已清理 | 通过 |
| 脚本函数隔离小测：`summarize_run` 解析 2026-10-10 的 c5 results.json；`acquire_lock` 对陈旧锁清除、对活锁 / 无 pid 的普通文件拒绝（用 scratchpad 路径，未碰 `/tmp/oco-e2e.lock`）；`server_mode` 在 4517 无服务时返回 down | 通过 |
| 任何 E2E 套件、VS Code 启动、真实 / mock 模型运行 | **NOT RUN（待夜间）** |

## 未解决 / 待夜间确认

- 全部真实行为 NOT RUN：`command()` 重试、短路径 user-data-dir、c4 / c5 真实模式放宽、c5 35 min 外层超时、脚本的服务启停与锁，都要在夜间实跑确认；建议先 `bash scripts/overnight-e2e.sh c4-trajectory c5-runtime --real` 对照 fail-diag 的两份真实结果。
- `tests/e2e/perf.mjs` 的进程过滤路径（见上）在嵌套 worktree 触发短路径时会失效，未改（范围外）。
- c4 `rows-match-server` 的 `reasoning > 0`（fail-diag 中也是真实模型不确定性）本轮未动，任务清单未列。
- p1b-narrow「新面板未出现」是否产品侧竞态：仍待 `--loop N` 在 mock 模式下复现后判定（NEXT §1）。
