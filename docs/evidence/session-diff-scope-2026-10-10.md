# 当前会话 Diff 范围核对（2026-10-10）

用户反馈：同一 session 两次输入分别修改文件，Review「上一轮变更」显示两文件；要求定位真实会话并核对机制，希望看到整个 session 的改动。

## 范围与 checkpoint

- 本批先核对真实记录与源码，保留现有工作区改动，不修改服务、凭据、产品代码或会话内容。
- VS Code Computer Use 返回未获应用访问许可；通过 oco 日志、OpenCode 后端的只读会话数据定位，不绕过 UI 权限。
- 独立代理只读源码机制，主线程负责会话定位、涉及凭据的读取及最终范围判断。

## 委派记录

| task_id | 唯一写入范围 | requested_route | actual_provider/model | agent_id/run_id | 状态 | 结果路径 | fallback_reason / 接手理由 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| diff-scope-source | 无；限定 summary/snapshot/Review 源码 | grok_worker | Grok Build / unknown | /root/session_diff_mechanism；run-mv2elkl0-ppz4tn；session 22968c0e-1553-4478-88c1-5c684aaf8c29 | 验收通过，6m19s | 本文件代存 | CLI 1.0.34 ready/loggedIn 轻量检查通过；包装层把主线程并发编辑本证据列为代理改动，实际未有代理文件写入 |
| diff-scope-live | 本证据文件；后端会话数据只读 | 主线程 | Codex / unknown | unknown | 核对完成 | 本文件 | 主线程只读真实数据与快照；无产品代码 / 服务 / 凭据修改 |
| diff-competitors | `docs/evidence/session-diff-competitor-checkpoint-2026-10-10.md`；仅官方文档 | gemini_worker | Google Antigravity / unknown（报告自称 Gemini 3.8 Flash High） | /root/diff_reuse_compare；gem-mv2flzd1-cqnjz | 已返回，145s；主线程修正两处过度推断 | [checkpoint](session-diff-competitor-checkpoint-2026-10-10.md) | 原生 subscription_worker 协议不兼容，使用已探测成功的外部 shim；包装层把主线程写本证据误算为代理修改 |
| git-review-integration | 上游 session.tsx / 补丁 0021；本证据及 STATUS/NEXT/PROGRESS | 主线程 | Codex / unknown | unknown | 验收通过 | 本文件 | 用户已确认使用 Git 变更，公共上游补丁由主线程负责；一行模式切换为紧耦合工作 |
| git-review-e2e | `tests/e2e/c8-git-review.mjs`（新）、c7 文件定位断言；结果 docs/evidence/runs/ | 主线程 | Codex / unknown | unknown | 验收通过，c8 4/0 + c7 6/0；首次 c7 5/1 已修正定位后重跑 | 下方结果 | 本环境无原生 Claude/Sonnet 子代理（不推断本批实际额度）；Grok Code exit139、Gemini 长 E2E 不适用（AGENTS.md 已记录）。不使用 GPT 子代理。c7 原有他人 fixture 改动保留，只追加原生筛选定位，避免 Git 完整文件树超出首屏 |

## 真实会话核对

- 本机 oco 的 managed 服务 PID 46779，工作目录 `/Users/xiaojiang/Ai-Project/oco`，监听 127.0.0.1:4096；HTTP 返回 401，未读取 / 修改凭据。由该进程已打开的 DB 路径确认目标，SQLite 以 `mode=ro` 打开，无写入。
- 扩展 window2 日志最后切换到 `ses_eda24a22effe8cdXFA8XoIt2mY`（20:51:57）；数据库标题「更新 Markdown 文件状态并测试改动效果」，版本 1.18.33。window1 为另一会话；目标按文件路径和 +2/−2 与截图精确匹配，不声称拥有前台 UI 访问证明。

| 用户输入时间（上海） | user message | 持久化 summary.diffs | 本轮快照 |
| --- | --- | --- | --- |
| 20:48:15 | `msg_125db5e240017j4uM4okhWjKMs` | `docs/STATUS.md` +2/−2 | `9b9a797cd6fbf8e8c73a394ed107d4015cbb40b0` → `90c54c8bf9dfa5025a28645420191b37641307a1` |
| 20:53:09 | `msg_125dfd6da001WPw2jPZeVBPBiG` | `docs/NEXT.md` +1/−1，`docs/TEST-SCOPE.md` +1/−1 | `90c54c8bf9dfa5025a28645420191b37641307a1` → `647e43d167e74e72911deafaeff92b2617c12df0` |

- 当前截图的 NEXT.md / TEST-SCOPE.md +2/−2 精确对应第二轮；第一轮 STATUS.md 不在该列表。不是整个会话累计。
- 源码 `pages/session.tsx:667` 取 `lastUserMessage()?.summary?.diffs`；`summary.ts:119-126` 只选当前 user 与 parentID 匹配的 assistant 消息；`computeDiff:82-99` 选该消息集合首个 step-start 与末个 step-finish 快照。
- 真实 whole-session 快照起止可得：第一轮开始 `9b9a797…` 至最后一轮结束 `647e43d…`。只读比较本机 OpenCode snapshot 仓库，结果记录见下方；不把两个每轮 patch 的增删数字简单相加冒充净变更。

### 全会话快照比较（真实只读结果）

`git --git-dir=<OpenCode snapshot repo> diff --no-ext-diff --numstat 9b9a797cd6fbf8e8c73a394ed107d4015cbb40b0 647e43d167e74e72911deafaeff92b2617c12df0`，exit 0：

```text
1  1  docs/NEXT.md
2  2  docs/STATUS.md
1  1  docs/TEST-SCOPE.md
```

- 所需「本会话变更」在这个实例应是 3 文件、+4/−4，原「上一轮变更」是 2 文件、+2/−2。
- 这是首轮开始到最后一轮结束的工作区快照净差，不等于对 agent 作者身份的严格归属；同目录并发修改的归属需要另定契约。当前截图匹配任务的实际工具改动和该净差一致。
- 原先把 `session.diff` 说成总为空过于绝对：普通 `summarize` 发空数组，`revert.ts:78` 会发 `computeDiff` 结果。Review 的非空内容可来自最近用户消息摘要或 vcs working/branch API，需区分事件名与显示来源。

## 独立源码核对与需求结论

- Grok 确认 `summary.ts:82-99,119-126` 是单 user 输入轮的首 / 末快照比较；`processor.ts:99-109,424-463` 在处理开始前及 step-finish 时记录快照。下一轮基线已包含上一轮改动，共享影子 Git index 本身不会让已完成上一轮的文件再次出现在本轮。
- `snapshot/index.ts:71,687-689`：仓库按 project/worktree 共用，两棵树作差。Diff 不是严格的 agent 文件作者归因；实际会包括同快照窗口内的其他写入。
- 现有 `GET /session/:id/diff` 在没有 messageID 时是空数组（`summary.ts:129-135`），并不是全 session API。`revert` 会写服务状态，不能为了读取全会话变更调用它。
- 用户期望应独立定义为 Review「本会话变更」：第一轮执行前快照至最近一轮完成后快照的净差，保留原「上一轮变更」作为另一个范围。不能用 working-tree diff、最后一轮 diff 或各轮最后版本覆盖当作 session 净 diff。
- 一个准确的上游实现方向是新增只读 `scope=session` 查询，复用 `computeDiff`，考虑 revert 截断、压缩后最早快照缺失、缺快照状态。不可自动替换用户现有 OpenCode 服务；本批仅完成机制与真实数据核对，未实现该新能力。
- 对本实例而言，本会话视图应显示 STATUS.md、NEXT.md、TEST-SCOPE.md，3 文件 +4/−4。运行卡目前按最后一轮实现，与用户此次明确的 session 范围目标不一致，需要在新的范围契约下调整；不把改标题当作功能实现。
- 产品检查 / E2E：NOT RUN（本批未改产品代码）。已有 AGENTS.md、STATUS、NEXT、TEST-SCOPE 的用户会话修改保持原样。

## 用户后续约束：直接复用现有能力（2026-10-10）

- 用户明确不希望再开发这些功能，要求对照其他 agent 并优先调用 OpenCode 现有能力。上节新增 `scope=session` 是技术可行方向，按最新约束不推荐推进，不增加服务端快照 / 会话 Diff 系统。
- 当前固定 1.18.33 的 Review 已有 `git` / `branch` / `turn`：中文标签为「Git 变更」「分支变更」「上一轮变更」（`ui/src/i18n/zh.ts:7-9`）。`pages/session.tsx:389` 原生默认 git；`667-677` 显示可用选项；`718-722` 切换 vcs 或 last-user summary 数据源。
- oco 补丁 0021 新入口在 `pages/session.tsx:1183` 强制 `setMode("turn")`，这是 oco 后加的范围限制，不是 OpenCode 原生只能看最后一轮。最小后续调整是移除强制选 turn，尊重原生 Review 当前 / 记忆范围；本轮是评估，不改产品代码。
- 零开发可用方案：点「上一轮变更」旁下拉选「Git 变更」，看到跨多轮累积的当前工作目录未提交修改；它会包含原有或其他来源改动，不能叫严格 session Diff。需要包含本任务已提交结果时用「分支变更」。需要任务归属清楚时，一个任务对应独立 worktree / 分支，复用原生 Git / Branch review，不新增 UI 管理页或自研追踪。
- OpenAI 官方已抓取文档 https://learn.chatgpt.com/docs/code-review?surface=app：Codex 默认 Unstaged；另有 Staged / Commit / Branch / Last turn，Review 反映 Git 仓库状态，包含用户 / 其他来源修改。Last turn 同样只是可选范围，不必把精确 session 归属作为基本审查方式。
- Gemini 健康探测通过：`gem-mv2fkj04-429jy`，10s，Antigravity 订阅 / actual model unknown（报告自称 Gemini 3.8 Flash High），无编辑 / 命令。外部 shim 路线可用；此前原生 subscription_worker 协议错误不影响本次 gemini_worker 请求。

- 对照结论：Claude Code Desktop 提供 Git worktree 隔离和 Diff 审查；Cursor 在编辑过程中实时 Diff、可按消息恢复 checkpoint；不能仅凭文档未提内部结构断言它们没有自建 session diff。相关官方 URL 见独立 checkpoint。
- 本轮仅调查和建议，产品代码 / 现用服务 / 配置均未修改。优先使用原生 Git / Branch Review，不推进上一节 `scope=session` 新开发方案。

- 最终推荐：当前用户直接从 Review 范围下拉切到「Git 变更」，无需开发；日常查看未提交累计改动，跨提交查看「分支变更」。共享工作目录无法严格按聊天 session 分离修改，需要隔离时先使用任务 worktree / 分支再沿用原生 Review。
- 收回新增 session diff 接口作为当前推荐；oco 最小后续纠偏仅为撤掉补丁 0021 强制选 turn，打开原生 Review 并尊重用户选择。用户本轮只要求比较和建议，因此尚未执行这项代码调整。

## 用户确认 Git 变更后的实施

- 授权：用户明确回复「行 git 变更吧」。结果卡 / 侧栏 Diff 入口统一选择原生 `git` 范围，替换之前强制 `turn` 的一行；保留原生下拉手动选择其它范围的能力。
- 保留开工时用户及其他工作者已有的 AGENTS.md、STATUS/NEXT/TEST-SCOPE、c7 和其历史 checkpoint 改动；不修改运行中的用户 OpenCode 服务。
- 验收重点：同一测试会话两轮各改一文件，最近一轮摘要只含第二文件，而点击 Diff 能通过原生 Git 范围同时看见两个文件；文件动作仍定位对应 diff。

### Git 变更实施结果

- 唯一产品变化：0021 的 openReview 选择 git，保留原生其它范围下拉。补丁 5 文件 +168/−1，重放与 vendor app 一致；补丁 SHA256 `7a7482ae8853fa884831546ceb57a10dfb879e7d3c9d81debb34043f80342fd9`。
- 根 `bun run verify:brief`：typecheck exit 0，unit 221/0；app tsgo exit 0；`bun run build` exit 0。日志 `runs/git-review-offline.log`、`git-review-app-typecheck.log`、`git-review-build.log`、`git-review-patch.log`。
- [c8 results](runs/20261010-140833-c8-git-review-6796/results.json)：4/0、16.75s；同 session 两轮各写一真实文件，最后 user 摘要 fixture 仅含第二文件，Git API 未拦截；侧栏 / Runtime Open diff 均展示两文件，单文件动作选中第二文件及 hello1 的原生 patch。
- 首次 c7 5/1：done-row-diff 没在未筛选的完整 Git 文件树找到本轮文件。保留他人原有消息 fixture，追加原生筛选框定位；[最终 c7 results](runs/20261010-141242-c7-result-card-7678/results.json) 6/0、22.63s。没有修改产品代码来迎合该断言。
- 打包期间另一会话提交 2cb3c4c（仅更新原结果卡证据的一行），主线程按打包实际输出使用 `oco-0.0.4-2cb3c4c.vsix`，不回退他人提交。包内含本批未提交 Git 模式修改；安装 extension.js / chat index 均与包内一致。extension.js SHA256 `e14010b3cf287be61af9258b5bd47a2f11aab630391883d6be2b7bcddc0e8e2a`；webview 改动通过新的 chat 资源与 index 对应，需 Reload Window。
- 当前卡片元数据仍为本轮，不把 Git Review 的整个工作目录范围称作严格 session diff。本轮真实模型目视 NOT RUN；模型为本机 mock，验证的是原生 Git 取数和路由。新 c8 为定向回归，默认套件保持 23，c7 仍是默认套件。
- 实施完成时尚未提交 / 推送 / 部署；用户已有未提交 AGENTS.md、c7 fixture、旧 checkpoint、文档和样稿改动保留。当前事实已同步 STATUS，队列 NEXT，历史追加 PROGRESS。

- 收尾：本轮启动的 4517 隔离服务按命令 / cwd 核对后 SIGTERM 关闭（退出 143，包装脚本清理 mock）；用户的 4096 服务未操作。文档本地链接检查与 git diff --check 均 PASS。

### 本地提交授权与范围

- 用户随后明确授权「提交你改的代码」。只提交本线程的 Git Review 补丁、c7 筛选定位、c8 定向测试及相关文档 / 证据；不推送。
- 混合文件按改动内容分段暂存：排除他人 c7 消息 fixture、NEXT 的补丁文件数修正、TEST-SCOPE 的旧单测数量修正、STATUS 的旧补丁链修正；这些改动留在工作区，AGENTS.md / 旧 checkpoint / 样稿同样保留。
