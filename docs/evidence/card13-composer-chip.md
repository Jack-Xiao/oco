# 卡 13：M13 composer chip + 自动附带编辑器选区（2026-10-16）

分支 `claude/great-keller-c26ae2`（NEXT §0b 认领行写的是 `claude/card13-composer-chip`，实际由 app 建的 worktree 分支名不同；合入 main 时以本文件为准）。基线 main `969a4a0`（卡 11 已合入；Mac mini 的卡 12 `claude/card12-bookmarks` 尚未合入，补丁 0027 归它）。Claude Code 对照项：2.1.300 `claudeCode.attachSelection`（编辑器选区自动随消息附带、以 pill 显示）。

## 范围与设计

- 契约（主线程）：`packages/contracts/src/bridge.ts` 新增 `DraftChip = { label, path, startLine?, endLine?, mime?, auto? }`，`DraftInsert` 增加可选 `chip`。无 `chip` 的消息与以前完全一样（补丁 0001 的纯文本插入）；`auto` 标记宿主的自动选区 chip：同一时间只一枚、新的替换旧的、`text: ""` + `auto` 表示移除。
- 宿主（Gemini）：`apps/extension/src/attach-selection.ts`（新）：`oco.addSelectionToDraft` 改为发 chip（文本 = 选区原文，chip.label = `路径:起-止`）；设置 `oco.draft.attachSelection`（默认 true）开启时监听选区变化（去抖 250 ms）与活动编辑器切换，非空选区 → 给主面板会话附自动 chip；选区清空 → 移除；同一选区只附一次（用户删掉后不再加）；焦点进 webview（activeTextEditor 为 undefined）不动 chip；自动 chip 超过 400 行截断。`extension.ts` 只把原命令整段换成一行 `...registerAttachSelection(panels),`。
- 宿主队列（主线程）：`panels.ts` `insertDraft(entry, text, source, chip?)`；自动 chip 在待发队列里只保留一条（面板隐藏时不累积旧选区）；自动 chip 被页面拒绝只记日志，不弹警告。
- 嵌入端（Gemini，补丁 **0028**）：`prompt-input-v2.tsx` 的 0001 处理器收到 `chip` 时不插文本，而是构造上游 `ImageAttachmentPart`（`mime: text/plain`、`filename = label`、blob 经 `platform.draftStore.putBlob`）加进 prompt；上游 `image-attachments.tsx` 已把非 image mime 渲染为文件卡片 + 文件名 + ×；发送时上游 `submit.ts` 把它作为 `text/plain` 的 file part（data URL）发出，服务端 `session/prompt.ts` 对 `data:` + `text/plain` 生成合成文本部分交给模型。自动 chip 固定 id `oco-auto-selection`。
- 终端输出 / Problems / Git diff 三个命令保持纯文本插入，不扩范围。

## 委派记录

| task_id | 唯一写入范围 | requested_route | actual_provider/model | agent_id/run_id | 状态 | 结果路径 | fallback_reason / 接手理由 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| card13-contract | `packages/contracts/src/bridge.ts`、`apps/extension/src/panels.ts`、`apps/chat-webview/src/app.tsx` | 主线程（公共契约 + 集成，AGENTS 划归） | claude-fable-5-1 | — | 已完成；typecheck 0 | 本文件 | 契约与同文件集成归主线程 |
| card13-host | `apps/extension/src/attach-selection.ts`（新）、`extension.ts`（一行）、`apps/extension/package.json`（设置）、`tests/unit/attach-selection.test.ts`、`tests/unit/settings-contribution.test.ts` | gemini-worker（探测 10:14 SUCCESS 3.8 s，job gem-mvac3k8q-u5j6c） | gemini（Antigravity 订阅；模型名工具未返回 → unknown） | job gem-mvacf36h-k2c1g | 已返回（682 s，7 次工具调用，自报 typecheck 0、unit 461/0）；主线程验收通过（复跑同数），并补了一处精度：`selectionLines` 让止于下一行第 0 列的选区不多算一行（+2 单测 → 463） | 本文件「实现」 | — |
| card13-vendor | `vendor/opencode/packages/app/src/components/prompt-input-v2.tsx`（0001 处理器段） | gemini-worker | gemini（Antigravity 订阅；模型名工具未返回 → unknown） | job gem-mvacf42q-97cx4 / conversation 8c92c8f1 | 已返回（包装层报 `{"status":"ERROR"}`，448 s，5 次工具调用；产物完整：+84/−1 行，自报 `tsgo -b` 0 错误；主线程复核 diff 与规范一致，只把一行中文注释改成英文，vendor typecheck 复跑 0 错误） | 本文件「补丁」 | 与 2026-10-10 记录相同的 Gemini 包装层假失败 |
| card13-vendor-grok | 同上 | grok-worker（`grok-bridge.mjs check` ready: true） | — | — | 中止（按规则换路由后 60 s 内发现 Gemini 产物已完整，TaskStop 停掉，`run-worker` 进程一并结束；vendor 文件未被它改动） | — | 避免两个代理同时改同一文件 |
| card13-patch | `patches/opencode/0028-oco-composer-chip.patch`（regen-patch.sh 生成；0001 不改） | 主线程（上游补丁归集成人） | claude-fable-5-1 | — | 已完成；链 0001–0028 在干净 vendor HEAD 重放 26/26 | 本文件「补丁」 | — |
| card13-e2e | `tests/e2e/c33-composer-chip.mjs`、`docs/evidence/mini-card13.md`、`docs/evidence/runs/` | Mac mini（`scripts/mini/dispatch.sh card13 docs/mini/card13.md`，mini 内 Claude Sonnet） | 待返回 | 待返回 | 计划 | `docs/evidence/mini-card13.md` | — |

## 补丁

- `0028-oco-composer-chip.patch`：只改 `packages/app/src/components/prompt-input-v2.tsx`（+50 −1）：0001 处理器的 `detail` 增加 `chip`；有 `chip` 时构造 `ImageAttachmentPart`（`id` 自动 chip 固定 `oco-auto-selection`、手动 `uuid()`；`filename = chip.label`；`sourcePath = chip.path`；`mime = chip.mime ?? "text/plain"`；blob 经 `platform.draftStore.putBlob` / `createBlobReference`），自动 chip 先过滤同 id 再追加；`auto` + 空 `text` 只移除；无 `chip` 的分支一字未改。
- 生成：`regen-patch.sh` 对不存在的编号会以「no … to overwrite; pass --out」退出（即使给了 `--out`），先 `: > patches/opencode/0028-oco-composer-chip.patch` 占位再 `bash scripts/regen-patch.sh 0028 --add packages/app/src/components/prompt-input-v2.tsx --out <同一路径>`（TMPDIR 指到 scratchpad）。0028 是顶层补丁，默认 source（本 worktree 的 vendor）即可，不需要 memory「regen-patch-non-top」的临时树。
- 校验：vendor app `bun run typecheck`（`tsgo -b`）0 错误；在干净 vendor HEAD `51ef4be` 的临时 worktree 上依次 `git apply` 0001–0028 全部成功（26/26），重放后的 `prompt-input-v2.tsx` 与工作副本逐字节相同。
- 第二版（Mac mini 首轮 c33 发现两处产品问题后，主线程改）：(1) 发出的 file part `filename` 只有 `math.ts`——上游 `build-request-parts.ts:203` 发送 `sourcePath ?? filename`，Gemini 把 `chip.path` 放进了 `sourcePath`，行号范围丢失；改为不设 `sourcePath`，file part 名 = 标签 `math.ts:2-3`。(2) 自动附带开着时执行手动命令会出现同一选区的两枚 chip（自动 + 手动），发送时两个 file part；改为「每个标签一枚」：手动 chip 取代同标签的自动 chip，自动 chip 遇到同标签的手动 chip 则跳过（保留手动，手动 chip 不会被选区清空移除）。重新 regen 0028（+50 −1）、重放 26/26、vendor typecheck 0、webview 重建。

## 实现（主线程验收）

- `attach-selection.ts`（Gemini + 主线程 `selectionLines`）：`chipLabel` / `selectionChip` / `AutoSelectionTracker` 纯函数；`registerAttachSelection(panels, deps?)` 返回 `Disposable[]`（按 memory「bun-vscode-mock-export-names」不用 `Disposable.from`，collaborators 经 deps 注入）；命令 `oco.addSelectionToDraft` 流程不变（无编辑器 / 无会话面板的警告文案、quick pick），只是改发 chip；自动附带：`onDidChangeTextEditorSelection` + `onDidChangeActiveTextEditor` 去抖 250 ms → 设置关 / 无活动编辑器（焦点在 webview）/ scheme 不在 file·untitled·vscode-remote·vscode-vfs / 无主面板会话 → 不动；非空选区且 key 变化 → auto chip；选区清空 → 空 text 的 auto 消息移除 chip；同一选区不重复发（用户删掉后不再加）；自动 chip 超过 400 行只保留前 400 行。
- `panels.ts`：auto chip 不 `reveal`（不抢编辑器焦点、不盖住正在选的编辑器），只在面板可见时送达；待发队列里 auto 只留一条；auto 被页面拒绝只记日志不弹警告。
- 单测 `tests/unit/attach-selection.test.ts` 15 用例（label 两种形态、chip 字段、auto 键有无、401→400 截断、tracker 序列、旧路径 `formatProblems` 无 chip、命令整文件、自动附带 / 清空、scheme 过滤、`selectionLines`）；`settings-contribution.test.ts` 键列表加 `oco.draft.attachSelection`。

## 检查（本机 worktree，提交 bb25a93）

- `bun run typecheck`：0 错误。chat-webview 单独 `tsc -p apps/chat-webview`：只有 vendor `packages/ui/src/theme/context.tsx` 的 2 个上游既有错误（与本卡无关；根 typecheck 不含 chat-webview）。
- `bun run test:unit`：463 pass / 0 fail（34 文件；基线 448）。
- `bun run build`：webview 18 s PASS；extension `dist/extension.js` 301 kb PASS。
- vendor app `bun run typecheck`（tsgo -b）：0 错误；补丁链 0001–0028 干净重放 26/26。
- E2E：见下「E2E（Mac mini）」。

## 环境

- 本 worktree 没有 `vendor/opencode`（gitignored）：按 setup.sh 的步骤手工建——`git -C /Users/xiaojiang/Ai-Project/oco/vendor/opencode worktree add --detach vendor/opencode 51ef4be`，用绝对路径 `git apply` 0001–0025（97 个文件改动），`bun install --frozen-lockfile`（4667 packages，69 s），链接 `apps/chat-webview/node_modules`。
- 基线：`bun run typecheck` 通过；`bun run test:unit` 448 pass / 0 fail（33 文件）。
