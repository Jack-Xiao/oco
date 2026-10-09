# 运行视图 M4 第一批验收（2026-10-04）

设计：[runtime-m4](../design/runtime-m4.md) 第 1–3 节。委派情况见 [委派记录](delegation-runtime-m4.md)：两条订阅路线都不可用，实现和测试由主线程完成。

## 改动

- **回放播放控制**：顶栏增加 ⏮ ◀ ▶/⏸ ▶|、速度 1×/2×/4×。
  - 从实时状态或停在最后一步时按 ▶，从第 1 步开始播。
  - 每步 600 ms（下限 300 ms）。播到末尾停在回放态，不切回实时。
  - 播放中拖动进度条会从新位置继续。
  - 在运行视图内点击后可用键盘：空格播放/暂停，← → 单步。输入框和按钮自己的按键不受影响。
  - 规则抽成纯函数 `session-runtime-playback.ts`，单测 8 条。
- **顶栏仍是一行**：「只读回放」徽标改为计数后面的时间（`6 / 12 · 10:23:11 AM`）；回放按钮去掉重复的 ⏮ 字符；进度条从 w-36 缩到 w-24；注意力计数药丸不换行。1100 px 下截图确认为一行。
- **会话日志**：
  - 标题改为右上角「日志 · N ⤢」；内边距收紧；时间列放宽到 100 px 并不换行（英文 `AM` 之前会折行）。88 px 高时能显示 3 条（E2E 测得 3）。
  - 点日志行跳到那一步。
  - ⤢ 打开浮层，可按「全部 / 出错 / 子代理」筛选，Esc 关闭并把焦点还给角标；浮层不受 60 条上限限制。
- **思考框**：字号 12 → 11、行距 1.4。有思考内容时显示「展开 ⤢」，在运行树框内打开全文浮层，Esc 关闭。思考框尺寸不变（E2E `think-expand` 比对矩形）。
- **i18n**：en / zh / zht 新增 15 个键。

vendor 改动文件：`session-runtime.tsx`、`session-runtime-mechanism-view.tsx`、`session-runtime-i18n.ts`；新增 `session-runtime-playback.ts`、`session-runtime-playback.test.ts`。
仓库改动：`tests/e2e/c5-runtime.mjs` 新增 `playback`、`log-overlay`、`think-expand` 三项；`reasoning` 不再把「展开」按钮算作思考框里的多余控件。

## 验证（本轮实际运行）

| 项目 | 命令 / 位置 | 结果 |
| --- | --- | --- |
| vendor 类型检查 | `packages/app`: `bun run typecheck` | 0 错误 |
| session 单测 | `bun test --conditions=solid --preload ./happydom.ts ./src/components/session` | 226 / 0（M3 为 218，新增 playback 8 条） |
| test:browser | `bun run test:browser` | 48 / 0 |
| 根离线检查 | `bun run verify:brief` | typecheck PASS，unit 190 / 0 |
| E2E c5-runtime en（mock） | `runs/20261004-022534-c5-runtime-d816` | 37 / 37 |
| E2E c5-runtime zh（mock） | `runs/20261004-022647-c5-runtime-4434` | 37 / 37 |
| E2E c4-trajectory（mock） | `runs/20261004-022800-c4-trajectory-30ee` | 17 / 17 |
| look-runtime | 1100 / 700 宽，running / done / permission / replay | 诊断 0 |
| 补丁 0019 | `git -C vendor/opencode diff deb241e -- packages/app`，新文件先 `add -N` | 25 个文件，+9283/−5，`diff --check` 干净 |
| 干净重放 | `51ef4be` 临时 worktree 上 apply 0001→0019 | 19 / 19；`src`、`test-browser` 与开发树一致；重放树 session 单测 226 / 0；临时 worktree 已删除 |

E2E 服务：`OCO_E2E_MODEL=mock OCO_TEST_PORT=4617 OCO_MOCK_LLM_PORT=4618 bash scripts/test-server.sh`，结束后已停止。没用 4517 端口，没碰用户的 VS Code。

## 未验证 / 限制

- 真实模型、Remote、亮色主题：NOT RUN。
- 键盘播放只在运行视图获得焦点后生效（点击视图内任意处），没有全局快捷键。
- 本机 VS Code 未重新安装 vsix；vendor 与仓库改动未提交。
