# 补丁 0017：嵌入模式标题栏操作并入会话标题行（2026-10-01）

- 改动：嵌入页面（`platform.embedded`）在会话路由下隐藏标题栏整行；状态（绿点）和审查面板开关从标题栏移到会话标题行，紧跟「对话 / 轨迹」切换，轨迹视图同样显示；去掉上下文用量圆环（用量已在轨迹里显示）。新会话页（无会话 ID）保留标题栏，状态入口不变。
- 补丁：`patches/opencode/0017-oco-embedded-header-actions-inline.patch`（5 个文件，+53/−9）；在固定 SHA 的干净树上 0001–0017 依次 `apply --check` 通过，结果与 vendor 一致。
- 检查：`packages/app` `tsgo -b` PASS；`bun run build` PASS。
- E2E `node tests/e2e/c4-trajectory.mjs`（mock，英文），新增 `header-actions-chat`、`header-actions-trajectory`：
  - 运行 1（`runs/20261001-134642-c4-trajectory-041d`）：16/17，新增两项 PASS；`subagent-link` FAIL，原因是 `clickOutline: null`（点击后面板立即切换，焦点探针没读到值），其余条件都满足。
  - 运行 2：测试服务没返回权限请求，在检查开始前崩溃（`Cannot read properties of undefined (reading 'id')`），无记录，目录已删除。
  - 运行 3（`runs/20261001-135104-c4-trajectory-cd1e`）：17/17 PASS。
  - 结论：`subagent-link` 和运行 2 的崩溃都表现为时序不稳定，与本补丁无关（未改链接或焦点样式）。
- Grok 委派：健康检查通过，但 Grok 工作区沙箱启动不了 VS Code（`Process failed to launch!`）；改由主线程运行。
- NOT RUN：中文环境（`OCO_E2E_LOCALE=zh-cn`）、Remote 实测、窄于 768px 的面板（审查开关在该宽度下本来就隐藏）。
