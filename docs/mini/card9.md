项目 oco（OpenCode 的 VS Code 客户端），你在 Mac mini 执行机上无人值守运行，工作目录就是仓库根，分支 mini/card9（基线 main 398a45e + 本提示词；setup 与 build 已由脚本完成；E2E 服务器用 `~/oco-bin/opencode`，run-task 已设 `OCO_OPENCODE_BIN`）。用户不在：不要提问，遇到阻塞用 `bash scripts/mini/notify.sh "<一句话>"` 通知后按下面的降级规则继续。

目标：证明（或证伪）oco 嵌入模式里每条用户消息的悬停操作行已经有上游的逐条回退按钮——`aria-label` 为 "Revert message" / "撤销此消息"（icon reset），紧挨 fork 按钮（"Fork to new session" / "从此消息创建新会话"），两者同在 `[data-slot="user-message-copy-wrapper"]`——并把「点按钮回退 → revert dock → Restore」写成 mock E2E。这是 Claude Code「回退到检查点」在 oco 的等价物（卡 9）。

只读这些（grep 后按行读，不读全文）：tests/e2e/c27-docks.mjs（(b) 用例：dock、Restore、`api()`、`rec` helper 的写法）、tests/e2e/c3-fork.mjs 22–63 行（hover `[data-component="user-message"]` 容器并按 aria-label 点击的写法）、tests/e2e/vscode.mjs 与 tests/e2e/server.mjs 的 `export` 行、docs/evidence/card9-rewind.md 的「调查结论」表（主线程已核对的上游 DOM 位置与调用链）。需要看产品代码时只 grep `vendor/opencode/packages/session-ui/src/components/message-part.tsx` 1380–1430 行。

要写的套件 `tests/e2e/c29-rewind.mjs`（≤ 200 行，复用现有 helper，不改 lib 公共行为）。一个 mock 会话发两轮：`Reply with exactly this line and nothing else: RW-1-<rand>`、同样的 `RW-2-<rand>`，每轮 `waitReply`。required 三个用例：

- `rewind-button`：hover 第一条用户消息（hasText RW-1）→ 它的 copy-wrapper 里 revert 按钮与 fork 按钮都存在（各 count ≥ 1，revert 可见）→ 点 revert（必要时 `{ force: true }`）→ `[data-component="session-revert-dock"]` 出现且文本匹配 /2 rolled back messages/（从回退点起的两条用户消息）→ `GET /session/:id` 的 `revert.messageID` 等于第一条用户消息的 id（`GET /session/:id/message` 里第一条 role=user 的 `info.id`）→ composer `[data-component="prompt-input"]` 的 innerText 含 `RW-1-<rand>`（回退会把该条文本放回输入框）。detail 记 dockText、serverRevert、composer 前 80 字、两个按钮各自的 count。
- `rewind-row`：hover 状态下 revert 与 fork 按钮 `boundingBox()` 的 y 中心差 ≤ 3px（同一行）。detail 记两个 box。
- `rewind-restore`：按 c27 的做法展开 dock，点最后一条（RW-2）的 Restore → dock 消失、`GET /session/:id` 无 revert、时间线里 `[data-component="user-message"]` 重新是 2 条。若 dock 只露出一个 Restore 按钮，先点它并记下随后的 dock 文本，再按需点第二次；detail 写清顺序和每步 dock 文本。

按钮找不到（hover 后 revert 按钮 count 为 0）：三个用例都记 NOT RUN，detail 写该 copy-wrapper 里所有 button 的 aria-label 列表与 wrapper outerHTML 前 300 字，`runShot` 一张；这是产品结论，不改 vendor / patches / apps。

然后：`timeout 600 node tests/e2e/run.mjs c29-rewind`；不过则按失败项最多修两轮测试侧问题；通过后跑回归 `timeout 900 node tests/e2e/run.mjs c27-docks c3-fork`。只读 results.json，不看截图。

唯一写入范围：`tests/e2e/c29-rewind.mjs`、`docs/evidence/mini-card9.md`（新）、`docs/evidence/runs/`。不改产品代码、vendor、patches；不改 STATUS / NEXT / PROGRESS；不推送 origin；不合入 main。
验收：c29-rewind 三个用例在 results.json 里有 PASS / FAIL / NOT RUN；evidence 列出每个用例的结果与关键 detail（dockText、serverRevert 是否等于首条用户消息 id、按钮 aria-label 是否存在）、回归两套件结果。
预算：最多 40 轮工具调用 / 60 分钟；E2E 命令用 timeout 包裹（单套件 ≤ 10 分钟）。不用 pkill / killall。checkpoint：`docs/evidence/mini-card9.md` 首轮落盘（范围 + 开始时间），每个套件后更新。
结束：`git add tests/e2e/c29-rewind.mjs docs/evidence/mini-card9.md docs/evidence/runs && git commit -m "test(e2e): c29 rewind button -> revert dock -> restore (card 9)"`（不推送）；`bash scripts/mini/notify.sh "mini-card9 完成：c29 <通过数>/3，回归 <结果>"`。
报告 ≤15 行：各用例 PASS / FAIL / NOT RUN 与关键 detail、回归结果、evidence 路径。不贴日志。
