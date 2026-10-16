# e2e-real-gaps：mini-real 暴露的测试台缺口（测试侧修复）

范围：只改测试侧（`tests/e2e/`、`scripts/overnight-e2e.sh`）与 NEXT / PROGRESS 状态行；不动产品代码、patches、vendor。依据 [mini-real](mini-real.md) 的稳定失败清单（NEXT §1「类别 C 测试台」「类别 A」两行）。分支 `claude/lucid-kirch-64cf81`（本机 worktree），基线 37da6f9，日期 2026-10-16。

## 委派记录

| task_id | 唯一写入范围 | requested_route | actual_provider/model | agent_id/run_id | 状态 | 结果路径 | 备注 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| real-gaps-suites | `tests/e2e/c10-sidebar-answer.mjs`、`c11-sidebar-organize.mjs`、`c12-new-session-draft.mjs`、`c24-runtime-question.mjs`；checkpoint `.oco-reports/real-gaps/checkpoint.md`（本地，不入库） | `gemini-worker`（Antigravity 订阅，Gemini 优先） | Gemini（Antigravity）；包装层回报 model unknown，worker 自报 Gemini 3.8 Flash (High) | job `gem-mvas6ln8-ebryk` | 验收通过（主线程逐行审阅 4 个 diff：功能缺陷 0，1 处注释措辞改写；mock 路径未发现行为变化） | 4 个套件的 `git diff`；任务书 `.oco-reports/prompts/real-gaps-suites.md`（本地，不入库） | 426 s / 5 次工具调用；未触发换路由。派发前健康检查：Gemini 最小请求 `gem-mvas51pj-uk3ch` SUCCESS（`OK`，5.3 s） |
| main-thread | `tests/e2e/c19-label-snooze.mjs`、`c18-permission-note.mjs`、`scripts/overnight-e2e.sh`、docs（NEXT / PROGRESS / 本文件 / `docs/mini/e2e-real-gaps.md`） | 主线程 | - | - | 完成 | - | 理由：每处只是一个调用签名或一份套件清单，且 c18 / c19 / 脚本的 dry-run 需要同时核对；不构成对上一行可分离工作的包办 |
| mini-confirm | `docs/evidence/mini-e2e-real-gaps.md`、`docs/evidence/runs/` | Mac mini 执行机（`scripts/mini/dispatch.sh`，提示词 [e2e-real-gaps](../mini/e2e-real-gaps.md)） | - | - | **排队中**：18:00 时 mini 上 `mini-mini-real-1190` 在跑（tmux，17:40 起），`dispatch.sh` 会拒绝（一次只跑一个 `mini-*` 任务，先到先得） | - | 本机后台脚本每 3 分钟查 mini 的 tmux，没有 `mini-*` 会话就执行 `bash scripts/mini/dispatch.sh e2e-real-gaps docs/mini/e2e-real-gaps.md`（dispatch 自带占用检查，被别人抢先就继续等），上限 4 h；结果出来后再更新本行 |

## 变更

| 文件 | 改动 |
| --- | --- |
| `tests/e2e/c19-label-snooze.mjs` | 导入 `recordNotApplicable`；`waiting-not-hidden` 的 N/A 分支改为 `recordNotApplicable(run, REQUIRED, "waiting-not-hidden", e.message)`（原 `run.recordNotApplicable(...)` 不存在，real 下 `run` 崩溃）。 |
| `tests/e2e/c18-permission-note.mjs` | 同类潜在缺陷：`always-preview` 的 N/A 分支（服务端权限无 `always` 模式）也调了不存在的 `run.recordNotApplicable(...)`；`REQUIRED` 提成常量后改用导入函数。mock 下该分支不触发。 |
| `scripts/overnight-e2e.sh` | `DEFAULT_SUITES` 由 13 个改为 21 个（并入 c18–c24 与 visual-light-sidebar，顺序同 `overnight-20261015-032859/summary.md`）；`--real` 的 `MOCK_ONLY` 由 c6 c16 c17 扩为 c6 c16 c17 c18 c21 c23；头注释同步，`usage()` 的行范围 2–20 改为 2–21。 |
| `tests/e2e/c12-new-session-draft.mjs` | real 下回复等待上限 180 s（`REPLY_WAIT_MS`，mock 仍 60 s）；`send-reply-shown` / `worktree-reply-fast` 在回复已完成但没抄标记时记 N/A。标记在提示词里（`Reply with exactly this line…`），不是 mock 口令；两轮 61.1 / 61.2 s 恰是 60 s 限制到了。 |
| `tests/e2e/c10-sidebar-answer.mjs` | real 下：强提示词（`Use the question tool (not plain text)… exactly two options: red and blue`，c5 的 question-route 用它在 nemotron 上 PASS）、等问题 180 s、按文字 `/blue/i` 点选项（没有就第一个）、`form-open` 只要求 ≥2 个选项；180 s 内没有问题 → 4 个必需用例与 multi / custom 记 N/A 并 abort 会话、reject 其问题；multi / custom 两轮依赖 mock 口令，real 下记 N/A；`finally` 里 abort 本次创建的会话（mini-real 的 c11 侧栏里出现过 c10 遗留的待答会话）。 |
| `tests/e2e/c24-runtime-question.mjs` | real 下：同样的强提示词与 180 s；180 s 内没有问题 → `ask-card` / `option-click` / `question-cleared` 记 N/A（避免 `question-cleared` 在没有问题时空转 PASS）、abort 会话并 reject 问题；`sid` 提到模块级供 `finally` 清理。 |
| `tests/e2e/c11-sidebar-organize.mjs` | real 下 `todo-badge` 等待 90 s；通过判据放宽为「徽标 `d/n` 的分母 = 展开列表项数且 > 0」；服务端确实没有 todo（`GET /session/:id/todo` 为 `[]`）→ `todo-badge` / `todo-collapse` 记 N/A，服务端有 todo 而侧栏没徽标仍是 FAIL（产品缺陷）。 |

更正 mini-real 的归因：c10 / c24 的失败主因是免费模型延迟（c24 第 1 轮 60 s 后才出现待答问题，`remaining` 非空）与 mock 固定的选项文字（c10 找 `blue`）；「模型不调 question 工具」只在 c10 第 2 轮有支持。c12 的标记不是 mock 口令。上述 real 分支都是「前提成立才断言、不成立记 N/A」，不会把模型行为记成 PASS，也不再记成 FAIL。

## 验证（本机，离线）

| 检查 | 结果 |
| --- | --- |
| `bun run typecheck` | exit 0 |
| `bun run test:unit` | 470 pass / 0 fail（35 个文件） |
| `node --check`：c10 c11 c12 c18 c19 c24；`bash -n scripts/overnight-e2e.sh` | 全部通过 |
| `tsc --allowJs --checkJs`（只看未定义名 TS2304 / TS2552 / 先用后声明） | 0 条（其余为 JS 推断噪声，未处理） |
| `bash scripts/overnight-e2e.sh --dry-run` | 21 个套件，顺序 c6-inbox c10-sidebar-answer c11-sidebar-organize c12-new-session-draft c13-worktree-inbox c14-review-notes c15-fix-with-opencode c16-sidebar-stop c17-subagent-aggregate c18-permission-note c19-label-snooze c20-inbox-nav c21-follow c22-review-threads c23-subagent-pills c24-runtime-question p1b-sidebar p1b-narrow c5-runtime c4-trajectory visual-light-sidebar |
| `bash scripts/overnight-e2e.sh --real --dry-run` | **15 个**（21 去掉 c6 c16 c17 c18 c21 c23）。任务书写的「real 18 个」是 21 − 旧清单 3，补上 c18 c21 c23 后应为 15。显式套件名与 `--loop` 的 dry-run 不受影响。 |
| c19 的 N/A 路径（离线模拟：`createRun` + 抛 `{na:true}` + `recordNotApplicable`） | exit 0，summary PASS 1 / N/A 1，`missingRequired` 为空 |

NOT RUN：mock E2E（c19 c12 c10 c11 c24 c18）——按 [MINI](../MINI.md) 交 Mac mini，当时 mini 被 `mini-mini-real-1190` 占用，未派发；real 下的 c10 / c11 / c12 / c24 / c19 新分支也未执行（本批不跑 real，等下一轮 mini-real）。因此 mock 路径「行为不变」目前只有代码审阅 + 语法 / 未定义名检查，尚无运行证据。

## 没动的

- `tests/e2e/run.mjs` 自己的 `DEFAULT_SUITES`（24 个，`brief` 用）与 overnight 脚本的清单是两份，未改。
- 历史提示词 `docs/mini/mini-real.md`、`docs/mini/card7.md` 里「默认 13 个套件」是当时的事实，未改；NEXT 里卡 7 的作废提示词那一行（原「默认 13 个套件」）补了现状说明。
- c14 `draft-acked`、p1b-sidebar `chain-draft`（另立二分）、c5-runtime `run` 崩溃、p1b-narrow `layout-260`（产品 / real 行为，未定位）：不在本批范围。
