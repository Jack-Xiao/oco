# c7-result-card E2E checkpoint
范围：tests/e2e/c7-result-card.mjs（新）、run.mjs 套件名、本文件。mock-llm 已有 write 步骤，无需改。
计划：写套件 -> 启 mock 测试服务(scripts/test-server.sh, OCO_E2E_MODEL=mock) -> 跑 -> 记录。
进度：测试服务已启动(4517/4518)；正在写套件。
结果(最后一次 docs/evidence/runs/20261010-105723-c7-result-card-1e2e/): done-row-summary PASS, done-row-mark-read PASS, done-row-diff PASS(session-review-v2), runtime-result-card FAIL.
说明: 测试服务器真实 session.diff 恒为空(c2-diff-unavailable 已记), 套件用直通代理注入 session.diff(/event 与 /global/event)。侧栏收到并显示 "1 file"; 主面板 app 的 sync.session_diff 未收到注入事件(环心 stage=end, live, 无 result 卡)。已试: /global/event 包裹 {directory,project,payload{id,..}}。未解: app 端消费路径(可能需真实 sync 事件 / 不同 directory 键)。
## 主面板 app 不认注入 session.diff 的根因（只读调查）
- 帧匹配无问题：server-sdk.tsx 用 `event.directory`（原样）+ payload 分发；去重只合并相邻同 key 帧，不会吞注入帧；fixture 的 directory/project/id 与服务器帧一致。
- 真正原因（产品侧）：vendor/opencode/packages/app/src/context/server-sync.tsx:525、609 两处 applyDirectoryEvent 都传 `sessionContent: false`，event-reducer.ts:125 对 SESSION_CONTENT_EVENTS（含 session.diff）直接 return。
  `sync().data.session_diff` 实际读 server-session.ts:200 的 store（directory-sync.ts sessionFields 代理），全 app 无任何代码写它（仅被 reducer 与 session-cache 触及）。
  即补丁 0021 的数据源 `session_diff[sessionID]` 在当前上游版本永远为空，结果卡不会出现；与代理/fixture 无关，c7 的 runtime-result-card 失败是真实产品缺陷，不改断言。
- 建议（主线程）：结果卡改读 server-session 里实际有数据的来源（如 session summary.diffs / GET /session/:id/diff 的结果，或 review 面板用的 vcs diff），或在补丁里让 session.diff 写入 server-session store。
