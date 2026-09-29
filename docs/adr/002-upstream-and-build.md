# ADR-002：上游源码、构建与补丁

状态：已采纳（P0）。日期：2026-09-29。证据：`docs/evidence/upstream.md`（SOURCE）、`docs/evidence/p0-spike.md`（BUILD/UI）。

## 决定

- 上游：`https://github.com/anomalyco/opencode` tag `v1.18.33`，SHA `51ef4be1d3c122f18fefb510dca8d778571f4f18`，MIT 许可（许可证随 `vendor/opencode/LICENSE` 保留；打包时需要把 LICENSE 带入 VSIX，T018）。
- 引入方式：`scripts/setup.sh` 浅克隆到 `vendor/opencode`（gitignore），校验 SHA，应用 `patches/opencode/*.patch`，按上游锁文件 `bun install --frozen-lockfile`。不用 submodule；不复用邻近的 opencode 工作目录。
- 构建：`apps/chat-webview` 用上游 `packages/app` 的 Vite 与插件（`@opencode-ai/app/vite`：solid、tailwind、别名 `@`），模块解析借用 `vendor/opencode/packages/app/node_modules`（符号链接）。输出到 `apps/extension/media/chat`。扩展宿主用 esbuild 打包，运行时不需要 Bun。
- oco 自有的构建期调整（不改上游源码）：
  1. `oco:inline-sprites`：provider/file 图标 sprite 内联到 DOM（webview 禁止跨源 `<use>`）。
  2. `oco:worker-iife`：Worker 打包为自包含 IIFE（webview 中 Worker 无法访问资源源）。
- 上游补丁（P1a 后共 2 个，均由 `scripts/setup.sh` 按序应用）：
  1. `0001-oco-draft-insert.patch`（`prompt-input-v2.tsx`，+29/-1）：宿主把文本追加到当前 composer 草稿，不发送；P1a 起 composer 先核对目标 sessionID，并以 `oco:draft-inserted` 回报结果。回归：`tests/e2e/p1a-identity.mjs` 的 `draft-after-attacks`、`forged-draft-rejected`。
  2. `0002-oco-embedded-single-session.patch`（`platform.tsx`、`layout.tsx`、`titlebar.tsx`、`use-session-commands.tsx`，约 +32/-14）：`Platform.embedded` 时不渲染/不注册内部标签条、home、新建标签/会话与终端命令，终端恒关闭。无现成 prop。回归：`no-internal-tabs`、`nav-shortcuts-deeplink`。
- 宿主侧适配（不改上游）：P1a 在 webview 启动时安装面板级 `localStorage` 垫片（见 ADR-005 §5），而不是修改 `utils/persist.ts`。

## 升级流程

1. 修改 `scripts/setup.sh` 中 TAG/SHA；2. 删除 `vendor/opencode` 后运行 setup，补丁必须 `git apply --check` 通过；3. `bun run build`；4. 跑 `tests/e2e/t004.mjs`、`t005.mjs` 并对照同版本服务；5. 记录到本 ADR。不跟随上游 dev 分支。

## 代价

- 包体 36 MB（其中 markdown worker 9.9 MB）。
- 依赖上游内部接口（`AppInterface`、`Platform`、路由格式 `/server/<base64 key>/session/<id>`），无稳定性承诺。
