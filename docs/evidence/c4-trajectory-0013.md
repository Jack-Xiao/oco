# 轨迹：多语言、工具页签、折叠步骤（补丁 0013）证据

- 基线：main `64641a2`（补丁 0001–0012）+ 本批改动；上游 `51ef4be`。测试服务：项目共用的 mock 服务 127.0.0.1:4517 / mock 4518（`.oco-test`）。
- 用户决定（2026-10-01）：先把 0012 的文案搬进多语言，再做系统行的「工具」页签；权限标灰、MCP 分组暂不做。参照 DeepSeek 轨迹截图，再加上折叠步骤。

## 行为

- **多语言**：轨迹文案全部来自 `session-trajectory-i18n.ts`（en / zh / zht，共 113 个键），按应用当前语言实时取。其他语言回退英文。数量用 `Intl.PluralRules` 选择单复数（英文 `1 file` / `2 files`）。
  - 没有放进上游 `src/i18n/*.ts`：上游 `i18n parity` 测试要求每个键在全部约 50 种语言里都有，并带齐各语言的复数形式；app 的 AGENTS.md 也禁止只凭模型知识翻译。放进去会让该测试失败（实测 3 项失败）。
- **语言来源修复（`apps/chat-webview/src/app.tsx`）**：宿主传入 `vscode.env.language`，值是 `zh-cn`、`zh-tw`、`pt-br` 这类 BCP 47 标签。应用只认自己的 id（`zh`、`zht`、`br`），`normalizeLocale("zh-cn")` 返回 `en`。所以**此前中文 VS Code 里官方界面也是英文**。改为用上游桌面端的 `detectDesktopNativeLocale` 映射：zh-cn→zh、zh-tw→zht、pt-br→br，en、ja、ko、de、fr、es、ru、it、tr、pl、cs、hu 映射为同名 id，未知值回退 en。用户在 OpenCode 设置里手动选过的语言仍以存储值为准（未单独验证）。
  - `vite.config.ts` / `tsconfig.json` 加了子路径别名 `@opencode-ai/app/i18n/desktop-native`（vite 的别名按前缀匹配，必须放在 `@opencode-ai/app` 之前）。
- **开发用语言覆盖（`apps/extension/src/panels.ts`）**：`OCO_DEV_LOCALE` 仅在非 Production 模式下替代 `vscode.env.language`。原因：没装语言包时，VS Code 忽略 `--locale`，`vscode.env.language` 仍是 `en`（实测 `--locale=zh-cn` 得到 `init.locale = "en"`）。E2E 用 `OCO_E2E_LOCALE=zh-cn` 走这条路径。
- **工具页签**：
  - 点「系统」行，详情页签变为「系统提示词 | 工具」。
  - 「工具」页签请求 `GET /experimental/tool?provider=&model=`（SDK `tool.list`），模型取会话第一条用户消息的模型。按名称排序，按 provider/model 缓存，失败的请求不缓存。
  - 每行显示工具名和单行描述；点开后显示完整描述和参数 JSON Schema。
  - 页签顶部写明：按服务端当前配置和默认智能体列出，不是本会话实际发送的工具定义；被权限禁用的工具和 MCP 工具可能不同。
  - 服务端没有这个接口时，显示“该服务未提供工具列表（HTTP xxx）”。
  - 桥策略不变：GET 本来就放行，目录由宿主强制。
- **折叠步骤（参照 DeepSeek）**：
  - 新增「精简 | 全部」切换，默认精简。
  - 精简模式：同一轮里连续的思考、工具调用和文件变更，折成一行摘要，例如“2 个步骤 · 3 个工具调用 · read, edit”；只有思考时显示“思考”。点击摘要原地展开。
  - 用户输入、上下文、回复、重试和错误始终显示。
  - 搜索时显示全部匹配行。点泳道选中折叠内的条目时，所在组自动展开。↑↓ 只在可见行间移动。
- **测试钩子**：标签页、关闭按钮和模型条改用数据属性（`data-oco-tab`、`data-oco-detail-close`、`data-oco-request`），E2E 不再依赖中文文案。

## 改动

| 文件 | 改动 |
| --- | --- |
| `patches/opencode/0013-oco-trajectory-i18n-tools-compact.patch`（新） | 新增 `session-trajectory-i18n.ts`；改 `session-trajectory.tsx`、`session-trajectory-model.ts` 和对应测试。只动 0012 新增的文件，不改上游已有文件 |
| `apps/chat-webview/src/app.tsx`、`vite.config.ts`、`tsconfig.json` | 语言映射 |
| `apps/extension/src/panels.ts` | `OCO_DEV_LOCALE`（仅开发） |
| `tests/e2e/c4-trajectory.mjs` | 新增 locale-copy、compact-groups、tools-tab；文案按语言取；修复发送后的竞态 |

补丁 0001–0013 在干净的 `51ef4be` 上按序 `git apply --check` 通过。vendor 的 `packages/app/src` 与“上游 + 0001–0013”逐文件一致（`diff -rq` 无输出）。

## 检查

| 检查 | 结果 |
| --- | --- |
| app 类型检查（`tsgo -b`） | 0 错误 |
| 轨迹模型单元（含折叠、语言、复数） | 15/15 |
| app `src/pages/session` + `src/components/session`（`--conditions=solid`） | 121/121 |
| app `src/i18n` | 12/13；失败项 `desktop-native` 的 `pa-PK`，本批未改该文件和任何语言文件（这些文件 `git diff` 为空），判断与本批无关（未在基线单独复跑） |
| `bun run verify:brief -- --build` | typecheck 0 错误；unit 164/164；build PASS |
| E2E `c4-trajectory`（mock，英文，最终构建） | 12/12，运行 `20261001-062403-c4-trajectory-a2ae` |
| E2E `c4-trajectory`（mock，`OCO_E2E_LOCALE=zh-cn`，最终构建） | 12/12，运行 `20261001-062338-c4-trajectory-3e91` |
| 回归 E2E（mock） | c3-fork 4/4、p1b-main-panel 6/6、p1a-chat 8/8（泳道加宽前的构建）；p1b-narrow 首次 9/10（`layout-320`：新会话面板没出现，属于面板创建步骤，与轨迹无关），最终构建复跑 12/12 |

中途发现的测试竞态：`send()` 返回时服务端可能还没存下新的用户消息，`waitReply` 会把上一轮已完成的回复当作本轮，导致 `rows-match-server` 偶发失败（服务端思考数 0、界面 1）。事后读库确认数据完整。已改为先等服务端用户消息数增加，修复后中英各一次 12/12。

截图：
- `5-tools-tab.png`（中文）：系统行 → 工具页签，12 个工具，bash 展开。
- `2-compact-groups.png`（英文）：折叠摘要“1 tool call · bash”，展开后嵌套工具行。
- 英文截图里泳道标签曾被截断成 “Mo…”“To…”，已把标签列加宽（w-8 → w-11）；最终构建的截图里显示完整。

## 未验证与限制

- NOT RUN：真实模型 E2E、Remote 部署、装有中文语言包的真实 VS Code（本批用 `OCO_DEV_LOCALE` 模拟语言来源）。
- 工具列表不是当时实际发送的工具：按当前配置和默认智能体计算，不含权限过滤；MCP 工具是否包含未核实。
- 繁体中文（zht）文案未经母语者审校。
- 长会话列表仍未虚拟化，折叠只减少了可见行数。
