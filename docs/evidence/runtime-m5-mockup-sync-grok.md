# runtime-m5 样稿同步 checkpoint

- 范围：仅 `docs/superpowers/specs/runtime-m5-mockup.src.html`（手改）、`runtime-m5-animated-mockup.html`（只经 build）、本文件。
- 目标：M5 样稿显示/交互同步到 2026-10-09 之后产品（A–I）。不改时间线、KF、事件判定、oracle 依赖的顶层函数名。
- 模板：A–H 已落地。占位符 `/*__TIMELINE__*/`、`__SHOT_DATA_URI__` 仍在。源文件 1775 行（相对 HEAD：+190 / −81）。
- 本轮补了一处浮层：思考/输出的 `post` 只是光标 HTML，浮层正文已自带 ▍，不再把光标再画进附注（避免 ▍▍）。

## 验收 1 — build

```
node scripts/runtime-m5-mockup-build.mjs
```

exit 0。脚本打印 `wrote ... 390682 bytes`（这是 JS 字符串长度）。`wc -c` = 407742（UTF-8）。`NO_COLOR`/`FORCE_COLOR` 警告可忽略。生成物不含 `/*__TIMELINE__*/`、不含 `id="cap"`、不含「已空闲」、含 `|◀`。

## 验收 2 — oracle

```
node scripts/runtime-m5-oracle.mjs \
  vendor/opencode/packages/app/src/components/session/fixtures/runtime-m5-session.json \
  /private/tmp/.../scratchpad/grok/oracle.json
```

exit 1。未写出 oracle.json。失败点 `scripts/runtime-m5-oracle.mjs:57` `chromium.launch`。Chrome 主进程 `Received signal 11 SEGV_ACCERR 000000000010`，进程 exit 139。同时有 `sandbox_extension_issue_file_to_process ... Operation not permitted`、crashpad `Permission denied (1100)`、`kill EPERM`。不是页面断言失败（浏览器没起来）。

同沙箱里继续试过，全部在真正启动时 SIGSEGV（`--version` 可以）：

| 二进制 | 结果 |
| --- | --- |
| Chrome for Testing 1217（oracle 默认） | launch SIGSEGV |
| chromium-1208 Chrome for Testing | launch SIGSEGV |
| chrome-headless-shell 1217（147.0.7727.15）直接 `--headless=new --dump-dom` | exit 139 |
| 系统 Google Chrome 154.0.8037.98 | exit 139 |
| `open -na "Google Chrome"` | `_LSOpenURLsWithCompletionHandler error -54` |
| lldb | `error: Operation not permitted` |
| `ps` | operation not permitted |

环境：macOS 27.2 (26B5091g)，Node v26.7.0。把 HOME/TMPDIR 指到 scratch、加 `--disable-breakpad` 仍然 139。结论：本沙箱里没有任何 Chromium 能进入 headless，官方 oracle / Playwright 都过不了 launch。

替代（不改 oracle 脚本）：用 scratch 里的 jsdom 25.0.1 装载同一份 src，注入同一 fixture，执行 oracle 里 `page.evaluate` 的同一段（`mock.seek` → `stageAt` / `facts` / `payload` / `planAt` / `statusWord` / `toolSt` / `sameSoFar` / `subSt` / `laneOpen` / 你卡片 class）。写出 `scratchpad/grok/oracle-jsdom.json`。

```
diff -q oracle-jsdom.json vendor/.../fixtures/runtime-m5-oracle.json
```

exit 0。frames 14，整文件相同，差异 0 条。jsdom 控制台 / jsdomError：0。

## 验收 3 — 1100 / 560

Playwright 打不开页面（同上 SIGSEGV），截图未生成。同一 jsdom 页在舞台宽 1100 与 560 对关键帧 `layout()` + `seek`：

| 帧 | 1100 工具台 | k | 560 工具台 | k |
| --- | --- | --- | --- | --- |
| j01-r1-plan | 208px | 1 | 196px | 1 |
| k07-r4-think | 208px | 1 | 196px | 1 |
| j03-r2-fanout | 208px | 1 | 196px | 1 |
| k10-idle | 208px | 1 | 196px | 1 |
| k01-r3-sent | 30px | 0 | 196px | 1 |

- `#cap`：无。动画样稿源文「已空闲」出现次数：0。
- jsdom 注入 session fixture 的页面 `textContent` 有 1 处「已空闲」，来自 fixture 里关键帧 expect「此刻已空闲约 2 小时 6 分」（在 `#tl` 数据里，样稿 KEYS 文案已改掉，不渲染）。动画样稿用的 timeline 没有这句。
- 点 `#cPay`：`#cd` 从 hidden 变为打开，Esc 后关闭。k07 浮层含「回放：按时间估算的进度」且只有一个 ▍。k10 浮层 meta 为「21:10:27 · 提问等了 29 秒」，无空闲时长。
- 点 `.pchip`（aria-label 查看计划）：计划浮层打开。j01 四项 `in_progress ●` + 三枚 `pending ○`；其余帧四项 `completed ✓`。Esc 关闭。
- 横向滚动：jsdom 不排版，`scrollWidth` 为 0，不能当浏览器结果。CSS 上 `body` 与 `.stage` 均为 `overflow-x:hidden`。
- 页面错误：0。

## 验收 4 — git

`git diff --stat --` 两个 html：各 `271` 行块，合计 `380 insertions, 162 deletions`。

完整 `git diff --name-only` 还有本任务开始前就在的、本轮未改的文件：`.gitignore`、`docs/NEXT.md`、`docs/PROGRESS.md`、`docs/STATUS.md`。未撤销。本 checkpoint 为未跟踪文件。

## 未解决

官方 Playwright oracle 与截图验收被沙箱内 Chrome SIGSEGV 挡住。数据判定已用 jsdom 对齐到 0 差异；交互与工具台高度在 jsdom 里核对过，没有真实浏览器截图，也没有测到真实 scrollWidth。
