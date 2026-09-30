# 连接设置子集（T014）+ C2 验证收尾 + T010 有限检查

基线 HEAD `b393df6` + 本批未提交改动（dirty）；opencode 1.18.33 隔离测试服务（`scripts/test-server.sh`，端口 4517，结束后已停止）；VS Code 1.139.1。主线程实现，未委派子代理（model/provider unknown）。运行目录 `docs/evidence/runs/` 被 Git 忽略，下表 ID 仅本机可查。

## 连接设置（不含整个 T014/A15）

- 新增命令 `oco.openSettings`（“Open Settings”）：打开原生设置并过滤 `oco`；侧栏标题栏齿轮、错误/未认证/重连/地址无效的空态、状态栏（地址无效时）都指向它。已有“设置密码”“立即重连”入口复用。
- `oco.serverUrl` / `oco.serverUsername` 补中文说明（格式、machine 范围、用户名用途、密码走专用命令）。仍是 machine 范围。
- 状态区分：地址无效（`unconfigured` + `issue: endpoint`，侧栏给设置入口）/ 没有工作区文件夹（`issue: folder`，给打开文件夹）/ 认证失败（用户名或密码不正确，不自动重试）/ 服务离线或非 OpenCode 服务（“无法连接服务…”、“服务返回 HTTP n”）。没有新增状态机，只在 `ConnectionSummary` 加 `issue`。
- 密码不进 settings、不进诊断输出；地址校验错误不回显 URL 内容。连接切换的旧会话绑定保护未改（沿用 `p1b-switch-pending`）。
- 测试：单元 136/136（新增 `settings-contribution.test.ts`、feed 诊断 2 项）；E2E `t014-connection` 6/6（`20260930-104422-t014-connection-8e5e`）：open-settings、invalid-url、valid-change、auth-failure（无自动重试）、offline、secret-not-in-settings。
- NOT RUN：真实设置密码输入框流程；受限模式；换地址后已开面板的 E2E（沿用旧证据）。

## C2 收尾

- **c1-open-file 焦点失败：真实问题，不是测试误判。** 加只读诊断（各编辑器组 active 标志、时间线）与宿主 `focusTrace` 后复现：`showTextDocument`（Beside）返回后约 16 ms，聊天面板 `panel.active` 又变回 true，聊天组重新激活并盖住文件（状态栏光标为空，持续 10 s 以上，不是 DOM 读取滞后）。修复：宿主在打开后 1 s 内若聊天面板重新激活，就在文件所在列重新展示一次（`panels.ts` `refocus`）。测试仍是真实点击后自动判定，没有点标签、没有加超时。修复后同套件 17 次运行（16 次连跑 + 最终验收）中 0 次焦点失败；1 次 diff-summary FAIL 为 `found:false`（模型未在 30 s 内产出 Diff 行，与焦点无关，属测试服务模型波动）。修复前同环境约 4~5 次里出现 1 次焦点失败。`refocuses` 计数未写入证据，无法逐次证明修复分支被触发。
  最终验收：`20260930-104953-c1-open-file-2ee2` 6/6。
- **DiffUnavailable UI：** 新增 `c2-diff-unavailable`（代理 `intercept` 夹具，默认关闭，不影响既有代理用例），3/3（`20260930-104341-c2-diff-unavailable-0f74`）：不可用提示 + 工具写入文件列表 + 无 before/after 行、无范围标签、无“无修改”字样；点文件打开；对照组（非空 diffs）显示正常 Diff 行且无不可用行。**只证明这种数据形状下的 UI 行为，不证明“真实快照缺失 → 空 diff → 该行”全链路。**

## T010 有限检查

- 未知 part 类型 / 未知工具：不白屏，未知工具显示通用条目，聊天可用（PASS）。
- 会话消失（消息列表 404）：出现上游错误页；原“Restart”是 `location.reload()`，在 VS Code webview 里重载后面板**空白**（探针截图确认）。修复：Restart 改为发 `ui reload`，宿主重设面板 HTML（`bridge` UiAction 增加 `reload`）。`t010-recover` 2/2（`20260930-104820-t010-recover-6149`）：restart 后聊天恢复。修复前的空白仅有探针截图观察，探针运行目录已清理。
- 未做：错误页仍是上游文案（含“报告给 OpenCode 团队 / Discord”），未改；服务不可达的整页兜底、面板内“会话已删除”专门提示另排。

## 汇总命令

`bun run verify:brief -- --build`：typecheck PASS，unit 136/0，build PASS，exit 0。E2E 仅上述 4 个套件定向运行，其余套件 NOT RUN。
