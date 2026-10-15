# 探查批：tools-k 轮末收起 / perf.mjs 进程匹配 / test:bench 端口（2026-10-15）

执行方：本机 Claude 子代理（Mac mini 登出，改本机，见 ccb3622）。分支 claude/roadmap-batch-2026-10-14。预算 1 小时，实际约 35 分钟（含 20 分钟 bench）。环境：VS Code 1.141.0，Node 26.7.0，bun 1.3.10；服务端 1.19.0（tools-k）、1.18.33（perf，默认 `opencode`）；mock 模型。

## 结果总表

| 项 | 结论 | 状态 |
| --- | --- | --- |
| 1. 轮末工具台 tools-k | mock 下一轮（并行 3 个 task）结束后，tools-k 在 idle+0.6 s、+2.6 s、+3.6 s 三次采样均为 `0.000`；运行中为 `1.000`。新增检查 `tools-k-collapse`，c5-runtime 现为 44 项，3 次运行 tools-k 3/3 PASS | PASS |
| 2. perf.mjs 进程匹配 | 已修：改为按 `userDataDirFor("perf")` 实际目录匹配。强制短路径（`OCO_E2E_USER_DATA_ROOT`）下旧脚本 `rss-bounded` 得到 0 MB 而 FAIL，新脚本 4/4 PASS | PASS |
| 3. test:bench 端口 | 占用来源查清；新增包装脚本 `tests/bench/run.mjs`（根 `package.json` 加 `test:bench`），单元半 43/0，Playwright 半 65 项：61 通过 / 4 失败，其中 1 个复跑通过（偶发），3 个复现，原因与端口无关 | 端口冲突已解决；3 个复现失败待查（见下） |

## 1. tools-k（轮末工具台收起）

- 机制：`dockOpen()`（`session-runtime-ring.ts`）——回合内第一次工具调用后用 `LANE_MS`（420 ms）平滑打开；最新一次请求「结束且没有再调工具」后用 420 ms 平滑收起到 0；`data-oco-runtime-tools-k` 是逐帧过渡值。2026-10-10 只采到 end 瞬间的 0.380，就是过渡中间值。
- 测试改动：`tests/e2e/c5-runtime.mjs`，在 `geometry-stable` 取到 `geomDone`（idle 后 0.6 s）之后再 `sleep(2000)` 采样、`sleep(1000)` 再采样一次，要求运行中 `tools-k > 0`、两次收起后采样都是 `0.000`，作为新检查 `tools-k-collapse`（加入 CHECKS / REQUIRED）。
- 结果（mock，服务端 1.19.0）：

| 运行 | tools-k-collapse | running / running2 / idle+0.6 s / idle+2.6 s / idle+3.6 s | 套件总计 |
| --- | --- | --- | --- |
| 20261015-004343-c5-runtime-1a5c | PASS | 1.000 / 1.000 / 0.000 / 0.000 / 0.000 | 43 PASS / 1 FAIL（`think-card`，已知偶发，见 mini-compat） |
| 20261015-004703-c5-runtime-ef53 | PASS | 同上 | 44 PASS / 0 FAIL |
| 20261015-005026-c5-runtime-33a8 | PASS | 同上 | 44 PASS / 0 FAIL |

- 限制：只覆盖 mock 的「并行 task 后给最终文字」这一轮；真实模型的轮末形态（例如以工具调用结束 / 被中止的回合）没有覆盖，NOT RUN（big-pickle 本机 403）。

## 2. perf.mjs 进程匹配

- 原因：`rss()` 用 `ps` 输出里是否含固定子串 `.oco-test/vscode/perf` 找本次 VS Code 进程。`vscode.mjs` 的 `userDataDirFor()` 在路径过长（嵌套 worktree、长检出路径，socket 路径上限 103 字符）或设置了 `OCO_E2E_USER_DATA_ROOT` 时，把 user-data-dir 挪到 `/tmp/oco-e2e-<hash>/perf`，子串对不上，所有进程都匹配不到。
- 复现与修复前后（同一机器，强制 `OCO_E2E_USER_DATA_ROOT=/tmp/oco-perf-short`）：

| 脚本 | rss-bounded | 说明 |
| --- | --- | --- |
| 修复前（HEAD 的 perf.mjs，另存为临时 `_perf-old.mjs` 跑后已删除） | FAIL：`firstSwitchMB 0, lastSwitchMB 0, growthPct null` | 其余 3 项 PASS；日志 `docs/evidence/runs/overnight-20261015-085928/01-_perf-old.log` |
| 修复后 | PASS：930 → 1154 MB（+24.1 %） | 4/4 PASS，20261015-010019-perf-355b |
| 修复后，默认路径 | PASS：907 → 1059 MB（+16.8 %） | 4/4 PASS，20261015-005830-perf-7d19 |

- 改法：`tests/e2e/perf.mjs` 里 `PROFILE_DIR = userDataDirFor("perf")`（在 `launch()` 之后调用，目录一致），按 `--user-data-dir=<PROFILE_DIR>`（精确，后面是空格或行尾）或 `<PROFILE_DIR>/` 匹配。
- 观察：`rss-bounded` 阈值 25 %，两次实测 16.8 %、24.1 %，后者几乎贴线（12 次切换，mock，webview 预热也在涨），不同机器上可能偶发 FAIL；阈值未改，只记录。另：切换中位 391 / 335 ms，四个面板打开 4661/1201/1443/1000 ms（首个含冷启动）。

## 3. test:bench 端口 4096 / 3000

- `test:bench` 不在仓库根，在 `vendor/opencode/packages/app/package.json`（`bun test ./e2e/performance/unit && playwright test --config e2e/performance/playwright.config.ts`），vendor 不可改，所以在测试侧加包装脚本。
- 占用来源（本次实测）：4096 被用户的 **Kilo Code VS Code 扩展**占用——pid 7838，`~/.vscode/extensions/kilocode.kilo-code-7.8.8-darwin-arm64/bin/kilo serve --port 0`，监听 127.0.0.1:4096（`--port 0` 自行选了 OpenCode 的默认端口）；未动它。3000 当时空闲。
- 为什么会冲突（读配置得出，未用 4096 上的真实服务实验）：
  - 性能配置在 `PLAYWRIGHT_PORT`（默认 3000）上 `vite preview --host 0.0.0.0 --strictPort`，`reuseExistingServer: false`，3000 被占就直接失败。
  - 基础配置在加载时取 `PLAYWRIGHT_SERVER_PORT ?? "4096"` 写进构建环境 `VITE_OPENCODE_SERVER_PORT`；性能配置随后才把 `PLAYWRIGHT_SERVER_PORT` 设成 `PLAYWRIGHT_PORT`（import 提升，顺序在后）。结果是：打包出的应用默认服务器是 127.0.0.1:4096，而 mock（`e2e/utils/mock-server.ts`）只接管 `PLAYWRIGHT_SERVER_PORT` 和应用端口的请求，其余 `route.fallback()` 走真实网络——会打到 4096 上的真实服务。
  - 单元半的两个用例把 `127.0.0.1:4096` 写死在期望里（`timeline-test-helpers.test.ts`、`mock-server.test.ts`），所以单元半必须用不改动的环境跑。
  - 另一个上游问题：性能配置 `testDir: "."` 只忽略 `unit/**`，Playwright 会去加载 `timeline-stability/fixture.test.ts`（`import "bun:test"`），整个运行在 Node 下直接报 `Received protocol 'bun:'`。
- 改法（`tests/bench/run.mjs`，根 `package.json` 加 `"test:bench": "node tests/bench/run.mjs"`）：单元半用原环境跑；Playwright 半在 20000–39999（低于系统临时端口段）里挑空闲端口，`PLAYWRIGHT_PORT` 与 `PLAYWRIGHT_SERVER_PORT` 同值（构建默认服务器 = 应用端口，由 mock 接管，不再触达 4096）；默认只加载 `*.spec.ts`；`PLAYWRIGHT_PORT` 可预设，`--` 之后的参数交给 Playwright。命令与上游脚本相同、顺序相同，只是拆成两半。
- 运行结果（`node tests/bench/run.mjs`，端口 29104，约 20.2 分钟，chromium，1 worker）：单元半 43 pass / 0 fail；Playwright 半 65 项，**61 通过 / 4 失败**。完整摘要与失败片段：`docs/evidence/runs/probe-bench/summary.txt`，全量日志在 `.oco-reports/probe-bench.clean.log`（不入库）。关键数字（均为本机无头 Chromium，mock 数据，不设阈值）：

| 场景 | 数字 |
| --- | --- |
| 首次导航绘制：未访问会话 / 新建会话页 / 子会话 | 首个目标帧 60.1 / 85.3 / 91.0 ms，稳定 72.6 / 91.9 / 99.5 ms |
| 主页点会话并绘制标题栏标签 | 内容首帧 139.1 ms，稳定 163.4 ms |
| 关闭唯一标签回主页 | 69.7 ms（稳定 72.6 ms） |
| 会话标签冷切换 | 首个目标帧 min 55.1 / median 59.2 / max 73.1 ms；缓存会话重绘首采样 6.4 ms，最大底部误差 0 px |
| 评审面板规模（改动行数 / 文件数）：100/1、1000/10、10000/100、100000/1000、1000000/10000 | 稳定就绪 194.6 / 252.4 / 237.6 / 231.7 / 737.2 ms |
| 流式时间线（4 种配置） | 首内容 172.6–390.3 ms；完成 192.9–228.6 s；RAF 间隔 P95 749–858 ms（压力脚本，非日常交互） |

- 4 个失败（与端口无关，都是页面状态断言）：

| 用例 | 失败内容 | 复跑 |
| --- | --- | --- |
| `home-tab-navigation-benchmark.spec.ts:40` stages the review body after cold session content | `[data-component="session-review"]` 10 s 内不可见 | 复现 |
| `session-parent-hydration-benchmark.spec.ts:51` hydrates an orphaned latest turn after a cold session click | 180 s 超时 | 复现 |
| `timeline-stability/adverse.spec.ts:82` preserves an explicit shell state across virtualization | `prt_virtual_shell` 期望数量 0，实际 1 | 复现 |
| `timeline-stability/scroll-interaction.spec.ts:51` keeps moving upward while drag-selecting above the timeline | `textBox` 为 null | 复跑通过（偶发） |

  这三个复现失败是否与 oco 的 vendor 补丁（或该基线本身）有关未查；上游基线 v1.18.33 的 bench 从未在本项目跑通过（STATUS 一直记为 BLOCKED），所以没有可对照的历史。建议：下一步在干净的上游 v1.18.33 检出上对这 3 个用例各跑一次，区分「补丁引入」与「上游自带」。产品代码未改。

## 测试侧改动清单

- `tests/e2e/c5-runtime.mjs`：新增 `tools-k-collapse`（CHECKS 43 → 44）。
- `tests/e2e/perf.mjs`：进程匹配改用 `userDataDirFor("perf")`。
- `tests/bench/run.mjs`（新）：bench 包装脚本；`package.json`：新增 `test:bench` 一行。
- 前一个提交（mini-compat）里的 `tests/e2e/lib/proxy.mjs`、`tests/e2e/p1a-identity.mjs` 与本批无关。

## 环境与清理

- 自己启动的进程（测试服务、bench 的 vite preview 与 Chromium）都已退出，4517 / 4518 与 bench 端口无监听；没有按名字杀进程，没有碰用户的 VS Code、Kilo、opencode。
- bench 在 `vendor/opencode/packages/app` 下生成了 `dist/`、`e2e/test-results/`、`e2e/playwright-report/`（构建 / 报告产物，vendor 的忽略规则里，不入库）。
- 验证：`bun test tests/unit` 423 pass / 0 fail。

## 委派记录

| task_id | 写入范围 | requested_route | 状态 | 说明 |
| --- | --- | --- | --- | --- |
| mini-probe（本机） | tests/e2e/**、tests/bench/**、package.json 的 test:bench 一行、本文件、docs/evidence/runs/** | 主线程（本机 Claude 子代理）直接执行，用户指令：Mac mini 登出，改本机 | 完成 | 例外理由：不可分割的依赖（三项都要在同一台机器、同一把 E2E 锁和同一个服务端上串行运行并随跑随改） |

## NOT RUN

- 真实模型下的 tools-k 与运行视图：NOT RUN（本机 403）。
- 数小时常驻内存趋势、数千行长会话滚动：本批未做（NEXT 的 mini-perf 后半）。
- 3 个复现的 bench 失败的根因：未查。
