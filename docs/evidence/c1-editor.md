# C1 编辑器联动：文件点击跳转与选区上下文

日期 2026-09-30。基线 `7fdc693` + 本批改动（提交号见 PROGRESS）。上游 OpenCode `51ef4be`（v1.18.33）+ 补丁 0001–0005。隔离测试服务 127.0.0.1:4517；VS Code 隔离 profile。

## 范围

| 项 | 本批 | 说明 |
| --- | --- | --- |
| 工具部件里的文件名点击 → VS Code 打开并定位 | 做 | read（含上下文分组条目，定位到 offset 行）、edit/write 标题、edit/write/apply_patch 文件头 |
| 当前文件/选区进入草稿并随请求发到服务 | 复验 | P1a 已有 `oco.addSelectionToDraft`（未保存缓冲、明确目标会话、不自动发送）；本批只重跑证据 |
| 宿主校验路径与访问范围 | 做 | `apps/extension/src/open-file-policy.ts` |
| Diff 摘要、Markdown 行内路径/链接、评审面板、附件点击 | 未做 | 调查见 [c1-file-click-survey](c1-file-click-survey.md) 第 5 节，列入 NEXT |
| 可信 Diff（C2） | 未做 | 待 base/head 来源确认 |

## 契约与数据流

- 公共契约 `packages/contracts/src/bridge.ts`：`ui` 新增 `action: "openFile"`，字段 `path`（≤4096）、`line`/`column`（1 起整数，≤10,000,000）。运行时校验拒绝缺 path、非整数、0/负数/超限。
- 上游补丁 `patches/opencode/0005-oco-open-file-in-host.patch`（4 个文件）：`PlatformBase.openFileInHost?`；session-ui `DataProvider.onOpenFile` → `useData().openFile`；`directory-layout.tsx` 仅在 platform 提供时接线；`message-part.tsx` 在上述位置加点击（`stopPropagation`，不影响折叠）。非 oco 平台不提供该方法，行为与上游一致。0001–0005 在干净的 `51ef4be` 上顺序应用后与 vendor 逐字节相同；上游 `tsgo --noEmit` 0 错误。
- 页面 `apps/chat-webview/src/app.tsx`：`openFileInHost` → `ui("openFile")`。测试钩子 `__OCO_DEBUG__.openFile` 调同一个 platform 方法，不新增能力。
- 宿主 `panels.ts` → `decideOpenFile`：
  1. 面板绑定的 connectionId 必须仍是当前端点，否则拒绝“连接已变化”。
  2. 会话目录 realpath 后必须在某个本地（`file:`）工作区文件夹内；远端服务或其他检出的路径拒绝，不猜测映射。
  3. 相对路径按会话目录解析；解析后（先字面、再 realpath）必须在会话目录内，挡 `..` 与符号链接越界；拒绝 URI scheme、空串、NUL、超长。
  4. 只打开普通文件；不存在、目录都拒绝并提示原因。macOS/Windows 按大小写不敏感比较。
  5. 以预览方式在旁边一栏打开，光标定位到 line/column。

## 检查与结果

| 检查 | 结果 |
| --- | --- |
| `bun run typecheck` | PASS |
| `bun test tests/unit` | 117 pass / 0 fail（新增 open-file-policy 13、bridge-contract 4） |
| 上游 `tsgo --noEmit`（packages/app） | 0 错误 |
| 补丁重放 0001–0005 @ `51ef4be` | 全部应用；与 vendor 逐字节一致 |
| E2E `c1-open-file` | exit 0，3/3 PASS（见下） |
| E2E `p1a-identity` `draft-after-attacks` | PASS：未保存缓冲选区进入指定会话草稿，`serverReceived: true`，无泄漏 |

`c1-open-file`：

- `open-file-line`：页面请求 `math.ts` 第 3 行 → 活动编辑器 math.ts，状态栏 `Ln 3, Col 1`，`fileOpens = 1`。
- `open-file-refused`：`../outside.txt`、`/etc/hosts`、`missing-file.ts`、`.`、`file:///etc/hosts` 共 5 次全部拒绝，0 次打开，编辑器标签不变。
- `tool-click-opens`：测试模型真实调用 read（`offset=2`）；展开上下文分组，点击文件名 → math.ts `Ln 2, Col 1`。

首轮 `open-file-line` 与 `tool-click-opens` FAIL 属测试问题（VS Code 标签显示为 `math` 不带扩展名；read 被收进上下文分组而原补丁未覆盖分组条目）。前者改断言，后者补丁补上分组条目，重跑通过。

## 限制

- Remote-SSH、Windows 未验证（NOT RUN）。远端会话目录在本机不存在时按设计拒绝。
- 编辑器行号定位依赖工具参数：只有 read 带行号；edit/write 打开文件不定位。
- 点击 grep/glob 的输出文本、Markdown 中的路径、时间线 Diff 摘要不跳转（未做）。
