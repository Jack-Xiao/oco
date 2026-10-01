# 轨迹：比例按钮选中状态、子智能体行（补丁 0014）证据

- 基线：main `016ae9d`（补丁 0001–0013）+ 本批改动；上游 `51ef4be`。
- 用户反馈（2026-10-01）：点「轮次」「调用」图会变，但按钮不高亮，「时长」一直是选中样式；子智能体调用在轨迹里只显示成 `task` 工具。用户决定保留三个比例按钮（中途删除过一次，已撤回），不加「合计」标注（顶部数字默认就是整个会话的合计）。

## 行为

- **比例按钮**：三个按钮由 `For` 生成，选中状态只在首次渲染时计算一次，所以高亮不跟随点击。改为传入访问函数，点击后高亮正确切换；按钮加 `aria-pressed`。三种比例的作用不变：时长按实际耗时；轮次每轮等宽；调用每次模型请求等宽。
- **子智能体**：OpenCode 没有“每个子智能体一个工具”，子智能体都通过 `task` 工具启动：`subagent_type` 指定智能体，`metadata.sessionId` 记录新建的子会话。
  - 轨迹把这类 `task` 行标为「子智能体」（en Subagent，zht 子代理程式），单独配色，列表显示 `@explore 描述 → 子智能体的回答`。回答从 `<task_result>` 中取出，不显示外层标签；详情里的原始输出保持原样。
  - 精简模式下子智能体行不折叠，始终可见。
  - 详情的工具计时区新增「子智能体」和「子会话」（子会话 ID）。跳转到子会话没有做。
  - 泳道悬停标题和搜索文本也用 `@智能体名`。

## 改动

| 文件 | 改动 |
| --- | --- |
| `patches/opencode/0014-oco-trajectory-toggle-state-subagent.patch`（新） | `session-trajectory.tsx`、`session-trajectory-model.ts`（`subagentOf`、`taskResult`、折叠规则）、`session-trajectory-i18n.ts`（2 个键 × 3 种语言）、模型单元测试 |
| `tests/e2e/lib/mock-llm.mjs` | 新增指令 “Use the task tool with the <agent> agent: <描述>”，让 mock 模型调用 `task` |
| `tests/e2e/c4-trajectory.mjs` | 新增 `scale-toggle`、`subagent-row` 两项必检 |

补丁 0001–0014 在干净的 `51ef4be` 上按序应用通过，vendor 的 `packages/app/src` 与“上游 + 0001–0014”逐文件一致（`diff -rq` 无输出）。

## 检查

| 检查 | 结果 |
| --- | --- |
| app 类型检查（`tsgo -b`） | 0 错误 |
| 轨迹模型单元 | 17/17（新增子智能体识别、子智能体行不折叠、回答提取） |
| `bun run verify:brief -- --build` | typecheck 0 错误；unit 164/164；build PASS |
| E2E `c4-trajectory`（mock，英文） | 14/14，运行 `20261001-080409-c4-trajectory-cab4` |
| E2E `c4-trajectory`（mock，`OCO_E2E_LOCALE=zh-cn`） | 14/14，运行 `20261001-080457-c4-trajectory-82fd` |

- `scale-toggle`：依次点 轮次 → 调用 → 时长，每次只有被点的按钮 `aria-pressed=true`；调用模式下 3 根模型条间距 229/228 像素（等宽），与时长模式位置不同。
- `subagent-row`：服务端 `task` 调用记录了子会话 ID；精简列表里有 1 行「子智能体 @explore Find the fork code → subagent-ok」，不在折叠组内，不含 `<task` 标签；详情「子会话」字段等于服务端的子会话 ID。截图 `10-subagent-row.png`（中文）。
- 测试服务：共用的 4517 和 4527 当时被其他会话占用（其中 4517 运行的是另一个工作树的 mock）。本批把 `test-server.sh` 和 mock 复制到临时目录，用同一密钥在 4537/4538 起了独立服务（状态目录也独立），E2E 用 `OCO_TEST_URL` 指向它，测完已关闭。没有动其他会话的服务。

## 未验证与限制

- NOT RUN：真实模型下的子智能体调用、Remote 部署（本批只提交，未部署）、本批之外的回归 E2E。
- 新的 `scale-toggle` 检查没有在修复前的构建上跑过，未亲眼确认它能抓到旧问题。
- 子智能体只显示子会话 ID，不能点击跳转；子会话自身的请求和 token 不计入父会话的轨迹合计。
