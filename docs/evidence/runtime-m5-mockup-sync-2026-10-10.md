# 运行视图 M5 样稿同步产品（2026-10-10）

目标：把设计定稿 `docs/superpowers/specs/runtime-m5-animated-mockup.html` 同步到 2026-10-09 三轮用户反馈 + D2 修订之后的产品行为，发布为可分享页面，再做一次独立设计评审，作为下一步迭代的参考。

## 生成管线（主线程，机械步骤）

- 从旧的 `runtime-m5-animated-mockup.html` 抽出时间线 → `runtime-m5-timeline.json`（103 438 字符，JSON 可解析）；M4 截图 → `runtime-m5-now-shot.webp`（123 726 字节）。
- 新增 `scripts/runtime-m5-mockup-build.mjs`：模板 + 时间线 + 截图 → 动画样稿；`--check` 只比对不写。改模板前 `--check` 通过（重建结果与已提交文件逐字节一致），管线可信。

## 委派记录

| task_id | Write scope (exclusive) | requested_route | actual_provider/model | agent_id/run_id | Status | Result path | fallback_reason |
| --- | --- | --- | --- | --- | --- | --- | --- |
| m5-sync-1 | `docs/superpowers/specs/runtime-m5-mockup.src.html` | grok-worker（Grok 健康检查 `grok-bridge check` ready=true, grok 1.0.34, 已登录） | Grok Build / unknown | run-mv1qk26y-pb2295（Grok session 298ce6d5）| 已返回 → 验收通过（本机复核）（后台，09:49 派出） | 本文件「Grok 返回」节 + checkpoint `runtime-m5-mockup-sync-grok.md` | — |
| m5-sync-2 | scratch `critique-result.md`（只读截图评审） | Claude 子代理（fresh context）——用户点名「Claude Design」给意见；内置浏览器打开 claude.ai/design 跳登录页、未登录，主线程不能替用户登录，改用 Claude 评审子代理作替代，Grok/Gemini 未用于此项 | Claude（子代理，模型 unknown） | unknown | 已返回（17 次工具调用，5 分 06 秒，看图 15 张） | `docs/design/runtime-m5-critique-2026-10-10.md`（主线程整理） | 替代原因见左 |
| m5-sync-3 | 无（只读文档检查） | gemini-worker | Gemini (Antigravity) / unknown | gem-mv1rull0-ffm29 | 已返回（228 秒，3 次工具调用） | 本节下方「文档检查」 | — |

主线程保留：范围与变更清单（本文件）、生成脚本、重建与浏览器目视验收、发布、设计评审整理、文档更新。

路线检查：Gemini 最小请求 → Antigravity 订阅，Gemini-3.8-Flash，job gem-mv1qlyaa-uwts6，11 秒返回「OK」；Grok `grok-bridge check` ready=true（grok 1.0.34，已登录）。两条路线本批可用。

## Grok 返回（25 分 25 秒，15 次工具调用）

- 改动：`runtime-m5-mockup.src.html` 1666 → 1775 行（+190 / −81），动画页只经 build 重生成（同 +190 / −81）；checkpoint `runtime-m5-mockup-sync-grok.md`。A–H 全部落地：`|◀`、删「此刻」字幕与 `.cap`、卡片去时长/去 meta、整卡可点（`role=button`、`tabindex=0`）开浮层 `#cd`、估算提示「回放：按时间估算的进度」、「计划 n/m」按钮（aria「查看计划」）开计划浮层、工具台 `data-oco-runtime-tools-k`、D18 `⊘`、底栏去「已空闲」、标题/对比开关/说明文案与 `#decide` 新小节。
- Grok 沙箱内 Chrome headless 启动即 SIGSEGV（Chrome for Testing 1208/1217、headless-shell、系统 Chrome 均 exit 139），官方 oracle 与 Playwright 截图未跑成；它用 jsdom 重放同一段判定得 14 帧与 fixture 一致。
- Grok 报告工作区另有事先已脏、非本轮改动的文件：`.gitignore`、`docs/NEXT.md`、`docs/PROGRESS.md`、`docs/STATUS.md`、`scripts/regen-patch.sh`、`docs/evidence/cleanup-2026-10-10*.md`（另一工作者的 STATUS 瘦身批次，mtime 10:02–10:08），本批保留不动。

## 主线程复核（本机，Chrome for Testing 1217 正常）

| 项 | 命令 | 结果 |
| --- | --- | --- |
| 生成一致 | `node scripts/runtime-m5-mockup-build.mjs --check` | mockup up to date（exit 0） |
| 事实不变 | `node scripts/runtime-m5-oracle.mjs vendor/opencode/packages/app/src/components/session/fixtures/runtime-m5-session.json <scratch>/oracle.json` + `diff -q` 同目录 runtime-m5-oracle.json | 14 帧，与 fixture 逐字节一致 |
| 关键帧截图 | scratch `shoot.mjs`，1100 / 560 × 14 关键帧 | 改前 28 张、改后 28 张；页面错误 0；横向滚动 0/28 |
| 交互 | scratch `interact.mjs` | 卡片 `role=button tabindex=0`；k07 思考中点开浮层：正文前缀 + ▍ + 「回放：按时间估算的进度」+ 「思考 3.1 秒 · 这次请求带回 3 个结果」，Esc 关闭；k06 结果卡片浮层含 meta；「计划 4/4」按钮 aria「查看计划」，浮层列 4 项 ✓；工具台 1100：k01 tools-k=0 / 30 px，k06、k10 tools-k=1 / 208 px；560 三帧均 tools-k=1 / 196 px（窄布局不收） |
| 文案 | grep 动画页 | 「已空闲」0 次；`#bPrev` 为 `|◀`；`#mockTitle` 带「已同步 2026-10-09 产品」 |

目视（1100 k06）：字幕行、卡片右上角时长、卡片 meta 行均已去掉，对比开关显示「M4（旧）」。

## D18 补正（主线程，评审核对后）

- 评审第 3 条指出已忽略提问仍为红色。核对：产品 `session-runtime-ring-view.tsx` 已忽略卡片 tone 为 `faint`、图例键 `ring.legend.declined` 单列「忽略 / 拒绝」，Grok 的 D18 只覆盖了工具 / 子代理行。主线程改模板 5 处：「你」卡片宽 / 窄两处 `✕` 红 → `⊘` 淡（新增 `.yq.dim`）、环心「已忽略」卡片 tone err → faint、图例拆「失败」「忽略 / 拒绝 ⊘」。
- 复核：build 重建；oracle 14 帧与 fixture 的差异恰为 k09-r4-dismiss、k10-idle 两帧 `card.tone` err → faint（`session-runtime-ring-fixture.test.ts` 不比较 tone，fixture 留待下次 0020 再生成更新）；1100 宽 k09 / k10 截图 0 错误；页面已重新发布（版本 2）。
- 第二次目视（1100 k09）仍见「你」卡片红边框 / 红头像 / 红状态字、询问弧与回传小签「✕ 你忽略了提问」为红色。核对产品 `ring-view.tsx` 第 599 行（dism 边框 `--rt-faint`）、`ring-geo.ts` 第 516–523 行（询问弧 faint、不透明度 0.45）与第 665–670 行（回传小签 tone faint、glyph ✕）后，再改模板 5 处：`.you.dism` / `.dism .av` / `.dism .ys` 改淡色、询问弧去掉 dismiss 时的 err 分支、回传小签 c err → faint（标签与 glyph ✕ 不变，与产品一致）。重建、oracle 差异仍只有 k09 / k10 tone 两行；页面重新发布（版本 3）。

## 文档检查（Gemini，只读）

- 相对链接目标全部存在；三份状态文档与评审、证据的数字一致；表格列数对齐；反引号 / 括号闭合。
- 两处问题已修：评审文档正文重复一级标题（降为二级）；STATUS / NEXT / 本文件把 `runtime-m5-oracle.json` 写成了根目录简写，改为 `vendor/opencode/packages/app/src/components/session/fixtures/` 全路径。
- 另：Gemini 启动期间工作区同时出现 `patches/opencode/0020-oco-runtime-view.patch`、`apps/extension/dist`、新 vsix 等 800+ 文件变动，属另一工作者的收口批次（补丁再生成与构建），本批未动。
