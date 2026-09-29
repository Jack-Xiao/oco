# ADR-002：上游源码、构建与补丁

状态：已采纳（P0）。日期：2026-09-29。证据：`docs/evidence/upstream.md`（SOURCE）、`docs/evidence/p0-spike.md`（BUILD/UI）。

## 决定

- 上游：`https://github.com/anomalyco/opencode` tag `v1.18.33`，SHA `51ef4be1d3c122f18fefb510dca8d778571f4f18`，MIT 许可（许可证随 `vendor/opencode/LICENSE` 保留；打包时需要把 LICENSE 带入 VSIX，T018）。
- 引入方式：`scripts/setup.sh` 浅克隆到 `vendor/opencode`（gitignore），校验 SHA，应用 `patches/opencode/*.patch`，按上游锁文件 `bun install --frozen-lockfile`。不用 submodule；不复用邻近的 opencode 工作目录。
- 构建：`apps/chat-webview` 用上游 `packages/app` 的 Vite 与插件（`@opencode-ai/app/vite`：solid、tailwind、别名 `@`），模块解析借用 `vendor/opencode/packages/app/node_modules`（符号链接）。输出到 `apps/extension/media/chat`。扩展宿主用 esbuild 打包，运行时不需要 Bun。
- oco 自有的构建期调整（不改上游源码）：
  1. `oco:inline-sprites`：provider/file 图标 sprite 内联到 DOM（webview 禁止跨源 `<use>`）。
  2. `oco:worker-iife`：Worker 打包为自包含 IIFE（webview 中 Worker 无法访问资源源）。
- 上游补丁（当前 1 个）：`0001-oco-draft-insert.patch`，`packages/app/src/components/prompt-input-v2.tsx`，+20/-1。目的：宿主把文本追加到当前 composer 草稿，不发送。无现成替代 API。回归用例：`tests/e2e/t005.mjs` 的 `selection-into-chosen-draft`。

## 升级流程

1. 修改 `scripts/setup.sh` 中 TAG/SHA；2. 删除 `vendor/opencode` 后运行 setup，补丁必须 `git apply --check` 通过；3. `bun run build`；4. 跑 `tests/e2e/t004.mjs`、`t005.mjs` 并对照同版本服务；5. 记录到本 ADR。不跟随上游 dev 分支。

## 代价

- 包体 36 MB（其中 markdown worker 9.9 MB）。
- 依赖上游内部接口（`AppInterface`、`Platform`、路由格式 `/server/<base64 key>/session/<id>`），无稳定性承诺。
