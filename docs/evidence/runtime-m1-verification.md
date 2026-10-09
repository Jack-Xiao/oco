# 运行视图 M1 验收证据（补丁 0019）

2026-10-03。范围：会话标题栏第三个视图“运行”（对话 | 轨迹 | 运行），只读，实时 + 按步骤回看。设计：[spec](../superpowers/specs/2026-10-02-runtime-dashboard-design.md)；计划：[M1 计划](../superpowers/plans/2026-10-03-runtime-dashboard-m1.md)。不改宿主、桥、公共契约。

## 环境
- 上游 OpenCode `v1.18.33`（`51ef4be`）+ 补丁 0001–0018 为基线（vendor 副本提交 `deb241e`）；本批 17 个提交在 vendor 副本里（`deb241e..c861179`），补丁由 `git diff deb241e HEAD -- packages/app` 生成。
- 实现与 E2E 运行委派给 Gemini（agy）；包装代理型号与 Gemini 型号均未由工具返回，记 unknown。评审：任务级 sonnet，Task 8 与最终整分支评审 opus。

## 结果
| 验收项 | 命令 / 证据 | 结果 |
|---|---|---|
| 单元：模型 + i18n + 事件级（真实 reducer） | `cd vendor/opencode/packages/app && bun test --conditions=solid --preload ./happydom.ts ./src/components/session/session-runtime-model.test.ts ./src/components/session/session-runtime-i18n.test.ts ./src/components/session/session-runtime-events.test.ts` | PASS 67 / 0 fail |
| 单元：整个 session 目录（含原有轨迹/上下文测试） | 同上，目录 `./src/components/session` | PASS 90 / 0 fail（基线轨迹测试 17 仍通过） |
| 类型：vendor `tsgo -b` | `cd vendor/opencode/packages/app && bun run typecheck` | PASS 0 错误（基线 0 错误） |
| 补丁：0001→0019 在干净 `51ef4be` 上依序 `git apply --check` + 应用 | 干净克隆依序重放 | PASS 19/19，`packages/app/src` 与开发树一致；0019 为 9 个文件、+2332/−5、`git diff --check` 干净 |
| webview 构建含新视图 | `bash scripts/build-webview.sh` exit 0；产物含 `data-oco-runtime`、`Interrupted (inferred)` | PASS |
| 仓库根离线验证 | `bun run verify:brief` | PASS：typecheck 0 错误、unit 185/185（含 `DEFAULT_SUITES` 钉住测试更新为 22 个套件） |
| E2E `c5-runtime` 英文 | [results.json](runs/20261003-050935-c5-runtime-d153/results.json) | PASS 9/9 |
| E2E `c5-runtime` 中文（`OCO_E2E_LOCALE=zh-cn`） | [results.json](runs/20261003-050959-c5-runtime-ad7a/results.json) | PASS 9/9 |
| E2E 回归 `c4-trajectory` | [results.json](runs/20261003-051021-c4-trajectory-befd/results.json) | PASS 17/17 |

E2E 详情与加强后的断言（焦点文字不冻结：回合中“等你批准…”→结束“已完成/Finished”；回看第 0 步 `tool.end`/`request.end` 均为 0，实时为 1/2；滑块最大 5；步骤标签 6/6→1/6）见 [runtime-m1-e2e.md](runtime-m1-e2e.md)。E2E 在独立测试服务（端口 4617，mock 模型 4618）上运行，未触碰共用的 4517 服务和用户的 VS Code；结束后两端口已释放。

## 评审过程与修复（摘要，完整记录在执行账本）
- 任务级评审 9 个任务，共 6 轮修复：重放不得读子会话实时状态；`rawTokens` 缺字段不得抛错；回看回退工具时保留子会话 id；焦点文字在 Solid 里被冻结；E2E 两条断言“不可能失败”被加强。
- 最终整分支评审（opus）：0 Critical、3 Important，全部修复并复审：子会话权限/提问不可见（现收集根+所有后代会话）；中断的工具/请求被显示为运行中/已完成（现标“已中断（推断）”）；重建触发过多（去掉每秒 `now` 刷新、到达时间不进重型 memo）。复审又发现 2 条回归（暂停回看时把进行中的请求当中断；焦点行把已中断工具当运行中），已修复并复审通过。

## NOT RUN / 限制（不得算通过）
- 真实模型（本轮全是 mock）、Remote 环境、真实长会话（1000+ 消息）性能：NOT RUN。只有合成基准：1000 消息/3000 工具时一次实时重建约 140–165 ms，其中约 116 ms 是既有 `buildTrajectory`（补丁 0012，非本批）；这不是 webview 实测。
- 子代理执行、权限审批界面操作、429 重试、取消在途：E2E NOT RUN（M2）。E2E 里权限是通过测试服务 HTTP 接口回复的；运行视图 M1 不提供批准/拒绝按钮，只在焦点卡片提示“请在对话视图处理”。
- 回放与历史重建一致性（实时一路构建 vs 事后重建）：只有“同一数据实时与回看在步骤层一致”的单测；逐事件重放对比 NOT RUN（M2）。
- “运行中不显示 0 token”只有一次采样（权限等待期间）；中文下该正则无效。
- 单元测试之外没有渲染层测试：组件靠类型检查 + E2E 验证。
- 未做：断连状态（嵌入页没有连接健康信号，需宿主新增消息、改桥契约，另提给集成人）；机制图、思考流、嵌套折叠、键盘与读屏全套、三种宽度与明暗主题 E2E（M3）。
- 未提交：补丁、E2E 脚本、证据与文档均在工作树，等用户授权后提交（AGENTS：不自动提交）。

## 给 M2 / M3 计划的未决项
mock 能否产出子代理/权限询问/429（本批的 mock 能产出 bash 工具和权限询问，未验证子代理与 429）；子会话加载（`sync → loadMessages`）与 4 小时回收边界；批准/拒绝按钮走现有回复通道；是否把“断连”提议提交给集成人；最终评审指出的结构性问题（单一大 memo、`For` 行按对象引用重建，M3 加按钮/动画前必须重构）；暂缓的小项：上下文标签在回退到更早请求时仍写“最近一次请求输入”、`toolInputSummary` 无空输入保护、长权限路径在 420 px 可能溢出、繁体“運行/執行”用词、孙会话审批不标记根的 task 行、多个 task 行共用同一子会话时都显示等待、`inFlightMessageID` 在“忙但最新消息已完成且存在更早的崩溃消息”时会挑错（应只看最后一条助手消息）。
