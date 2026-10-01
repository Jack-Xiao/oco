# 移除 Agents 视图，新增 Connection 视图（2026-10-01）

## 用户决定

- 用户：暂时不要 Agents，删掉；但要保留侧栏里单独的 “∨ Sessions” 标题行。
- 限制：VS Code 会把容器里唯一的视图并入容器标题（插件自定义容器固定 `mergeViewWithContainerWhenSingleView`），只剩 Sessions 时标题变成 “OPENCODE: SESSIONS”，没有单独的 Sessions 行。v0.1 之前就是这个样子（见 `1a6b2c7` 的说明）。
- 给了三个选项，用户选“删 Agents + 加一个默认折叠的小视图”。

## 改动

- 删除 `agents.ts`、`agents-view.ts`、`tests/unit/agents.test.ts`、`tests/e2e/t013-agents.mjs`；清单去掉 `oco.agents` 视图、5 个命令、菜单和欢迎页；`DEFAULT_SUITES` 去掉 `t013-agents`（现 20 个）。诊断导出去掉 `agents` 字段。
- 新增 `connection-view.ts`：视图 `oco.connection`（名称 Connection，`visibility: collapsed`），只读行：状态、服务、目录（文件夹名，悬停看完整路径）、模式、版本（未验证标“未验证”）、托管进程、受限模式。行由 `diagnostics.ts` 的纯函数 `connectionRows` 生成；“状态”行的点击动作与状态栏一致（重连 / 设置密码 / 打开设置），托管进程失败行点击重启。
- 代码恢复：Agents 的完整实现在 `2b40651`。

## 检查（mock，测试服务 127.0.0.1:4517）

- typecheck PASS；unit 166/166（删去 agents 用例，新增 `connectionRows` 3 项、清单断言改为 Sessions + 折叠的 Connection 且不含 `oco.agents`）。合入 `28c90ac` 后复跑相同结果。
- E2E（`f37bda0` + 本改动）：`t014-connection` 6/6、`p1a-identity` 14/14、`t015-diagnostics` 4/4、`t010-recover` 5/5。
- E2E（`28c90ac` + 本改动，最终测试文件）：`p1b-sidebar` 连续 3 次 12/12（`20261001-124342-p1b-sidebar-c21b`、`-124427-…-c6c6`、`-124510-…-c126`）。新用例 `connection-view`：Sessions 标题行可见、无 Agents 标题行、Connection 默认折叠、展开后“状态=已连接”、再次折叠。截图 `1b-connection.png`（展开）和 `1-list.png`（默认折叠在底部）。

## p1b-sidebar 重命名 / 搜索偶发失败（测试竞态，已修测试）

- 现象：本改动后 `sidebar-rename` / `sidebar-search` 6 次里 3 次失败（输入框没收到文字），改动前基线（`28c90ac`）4/4 通过。中途还有两类环境干扰，已排除：另一会话 11:26–12:00 并行跑 VS Code E2E 抢焦点；mock 模型进程（4518）中途退出，重启后恢复。
- 取证：页面内被动记录 focusin / window blur / 输入框显隐的时间线（不插入等待）。测试用命令面板读宿主状态（`hostState`），面板关闭后 VS Code 会异步把焦点还给当前的对话 webview，而且成对出现。基线中面板到点击重命名间隔 159–278 ms，还焦点已结束，输入框打开后无 blur；失败时间隔 95 ms，输入框获得焦点 9 ms 后窗口 blur（焦点进 webview），约 150 ms 后输入框关闭。
- 结论：测试设施与 webview 还焦点的时序竞态；移除 Agents 改变了前面步骤的耗时，暴露了它。不是产品问题（用户不会在命令面板关闭后 0.1 s 内点重命名）。
- 修复：`p1b-sidebar` 新增 `openInputBox`：打开输入框后等它持续持有焦点 400 ms 才输入，被抢走就重开（最多 3 次）；用于重命名和搜索。中途按错误假设加的两处改动（步骤 1b 改键盘操作、聚焦 Sessions）已撤回。

## 未验证

- NOT RUN：真实模型；Remote（gcp-workstation）上的外观。未部署。
- 用户现有 VS Code 里视图布局有缓存，新视图按默认折叠出现；如位置不对，可在侧栏标题 “…” 菜单里重置视图位置。
