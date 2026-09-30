# C2 Diff 来源矩阵（调查结论）

日期：2026-09-30。上游 `51ef4be`（v1.18.33），`vendor/opencode/packages/opencode/src`。原始调查为只读源码调查。后续已补 [模块运行时证据](c2-runtime.md)：8/8 通过；未起服务做 HTTP/模型 E2E。下表保留原调查时的 NOT RUN，当前模块验证范围以运行时证据为准。
调查：grok-worker（Grok Build 1.0.34；自报 model Grok 4.7 / xAI，工具头为 unknown），完整发现与逐行引用见 [c2-diff-sources-raw.md](c2-diff-sources-raw.md)。主线程抽验：`session/summary.ts:82-126`、`snapshot/index.ts:24,280-290,546-750`、`tool/edit.ts:181-191`，与原始记录一致。

## 关键问题的答案

> 展示的两份内容，能否证明属于这个会话和标明的修改范围？

- **单轮（用户消息）Diff：能证明“范围”，不能证明“作者”。** `GET /session/:id/diff?messageID=` 返回存在该用户消息上的 `summary.diffs`，由该轮助手消息第一个 `step-start` 快照树到最后一个 `step-finish` 快照树计算，两端内容都来自快照仓库（`git show <tree>:<file>`），不读当前工作区。所以它确实属于“这个会话这一轮的时间窗口”。但快照拍的是整个工作区，**这一轮期间用户或其他进程（包括同目录的另一个会话）改的文件也会算进去**。
- **工具调用 Diff（edit `metadata.filediff`）：能证明是这次工具调用改的**，前像在工具执行时从磁盘读取；但只有带上下文的补丁，不是全文前后像。
- **整个会话 Diff：没有可靠来源。** `session.diff` 事件在正常轮次里固定为 `[]`，只在撤销时带数组；`Session.diff()` 是返回 `[]` 的桩。多轮累加需要客户端自己拼，且跨轮的外部修改不在任何一轮里。
- **Git 工作区差异（`GET /vcs/diff`）：与会话无关**，不得冒充会话 Diff。

## 来源矩阵

| 来源 | 范围 | 前像 / 后像从哪来 | 内容形态 | 持久化 | 关联 ID |
| --- | --- | --- | --- | --- | --- |
| 单轮 Diff `GET /session/:id/diff?messageID=` | 一次用户消息（一轮）的净变化 | 快照树 `from`（首个 step-start）→ `to`（末个 step-finish） | `FileDiff[]`：`file`、`status`(added/deleted/modified)、增删行数、**全上下文**统一补丁（`context: MAX_SAFE_INTEGER`，可还原两侧全文） | step-finish 时计算，存进用户消息 `summary.diffs`；GET 只读不重算 | 请求带 sessionID + messageID；Diff 条目本身不带 ID；快照哈希在助手消息的 step 部件上 |
| `session.diff` 事件 | 会话级 | 正常轮次为 `[]`；撤销时为撤销点到末尾（可跨多轮） | 同上 | 仅撤销时写 `session_diff` | 只有 sessionID |
| edit 工具 `metadata.filediff` | 一次工具调用、一个文件 | 执行时读磁盘 old → new（格式化后重读） | 补丁（jsdiff 默认上下文，**推断** 4 行）+ 增删数；无 status、无全文 | 随工具部件保存 | sessionID / messageID / partID（工具部件） |
| write 工具 | 一次工具调用 | 权限询问时有 diff，结果元数据**不存** diff | — | — | 同上 |
| apply_patch 工具 | 一次工具调用，多文件 | 每个文件的补丁 | 补丁，非全文 | 随工具部件保存 | 同上 |
| 快照系统 | 工作区整体，按 step 边界拍树 | 独立 git 目录（`Global.Path.data/snapshot/...`） | tree 哈希 | 清理时 `git gc --prune=7.days`（推断：旧快照树可能被清理，已存的 `summary.diffs` 不受影响） | 哈希在 step-start / step-finish 部件 |
| Git 工作区 `GET /vcs/diff` | 当前工作区 vs HEAD，**非会话** | 用户仓库 | 补丁 | 实时 | 无会话 ID |

## 边界情况（按单轮 Diff 为主）

| 情况 | 单轮 Diff | edit 元数据 | 实测 |
| --- | --- | --- | --- |
| 同文件在一轮内多次修改 | 合并为一条净变化 | 每次调用各一份 | NOT RUN |
| 同文件跨轮修改 | 每轮各自净变化；无会话级累计 | 每次调用各一份 | NOT RUN |
| 轮内外部修改 | **会被算进本轮**（无法区分作者） | 下一次 edit 的前像会包含外部修改 | NOT RUN |
| 两轮之间的外部修改 | 不在任何一轮里 | 同上 | NOT RUN |
| 新建文件 | `status: added`，前像为空 | 前像为空串 | NOT RUN |
| 删除文件 | `status: deleted`，后像为空 | — | NOT RUN |
| 轮内新建又删除 | 不出现 | 各调用各自记录 | NOT RUN |
| 快照关闭（`snapshot: false`）或非 git 项目 | 无哈希，`summary.diffs` 不写 / 为 `[]` | 仍有 | NOT RUN |
| 未跟踪且 > 2 MiB 的文件 | 不进快照，**整条缺失**（不是空前像） | 仍有 | NOT RUN |
| 二进制 | `patch: ""`，增删 0 | — | NOT RUN |
| 快照内容读取失败 | **推断**：该侧当成空串仍生成补丁，看起来像新建/全删 | — | NOT RUN |

## 最小实现建议（本批不实现）

1. 时间线每轮的 Diff 只用 `GET /session/:id/diff?messageID=<该轮用户消息>`，标题写“本轮工作区变化（含期间外部修改）”，不写“AI 修改”。
2. 展示前校验：该轮助手消息存在带 snapshot 的 step-start 与 step-finish；这是必要条件，不是内容完整性证明（哈希存在不代表 blob 可读）。缺少任一端时显示“无可靠前像”；有独立文件条目才显示文件列表，不能从空 Diff 推断没有变化。当前 `FileDiff` schema 不暴露 `binary`；`patch` 缺失或为空时，只列已有文件名，不推断其一定是二进制。对于全文前后对照，还需处理快照读取失败的完整性证据缺口，不能仅凭两端哈希就标为可信。
3. 工具部件内的 Diff 用 edit / apply_patch 自带补丁，标“本次工具调用”，只显示补丁，不宣称全文。
4. 不做会话级累计 Diff；不用 `/vcs/diff` 填任何会话视图；如需展示 Git 差异，单独入口并标“当前工作区 vs Git，与会话无关”。
5. 不做回滚（撤销依赖 `session.revert` 与快照恢复，另行调查）。

## 未做 / 下一步

- 已补真实 Snapshot / SessionSummary.computeDiff 模块测试（8/8）；完整服务的 `summary.diffs` 持久化与 HTTP 返回仍未实测，快照 blob 缺失负测仍待补。见 [运行时证据](c2-runtime.md)。
- 未查：`message-v2.ts`、`git/index.ts`、jsdiff 默认上下文、write 权限 diff 是否落库、`Global.Path.data` 具体路径、SDK v1 `FileDiff.before/after` 字段来源（原始记录称已过时）。
