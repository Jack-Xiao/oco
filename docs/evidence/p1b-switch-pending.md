# 等待模型期间切换连接（收尾补测）

日期 2026-09-30。代码基线 `7fdc693`（产品代码同 `6343f7b`）加本批未提交改动；本套件只依赖 `6343f7b` 已有的宿主绑定逻辑，本批对 `bridge-host.ts` 无改动。VS Code 1.x 隔离 profile，隔离测试服务 127.0.0.1:4517，不碰用户 OpenCode。

## 方法

`tests/e2e/p1b-switch-pending.mjs`：两个透明代理 A、B 指向同一隔离服务（不同端口 → 不同 connectionId），服务端结果用直连 `api()` 观察。开发专用慢路径（`OCO_DEV_SLOW_PATHS`，8 s）制造“模型未就绪”。

1. `switch-while-pending`：绑定 A 的新面板在模型加载中输入并提交 → 出现待发横幅 → 改写用户 settings 把 `oco.serverUrl` 切到 B（提交后约 1.1 s，早于加载完成）→ 等过加载延迟和官方 20 s 超时。硬断言：该会话服务端 user 消息数为 0；面板仍在时输入框文本与提交时一致。
2. `new-panel-after-switch`（对照）：切换后新开面板，绑定到不同 connectionId，经 B 发送成功，恰 1 条 user 消息。

## 结果

| 运行 | 结果 |
| --- | --- |
| 正常构建 | exit 0；2/2 PASS。旧会话 user 消息 0，草稿保留，面板存活 |
| 变异对照（去掉 `bridge-host.ts` `bound()` 的 connectionId 检查） | exit 1；`switch-while-pending` FAIL：旧文本经 B 发出，草稿被清空。确认用例能抓到回归；源码已还原并重建 |

运行目录（Git 忽略）：正常 `docs/evidence/runs/20260930-034317-p1b-switch-pending-*`；变异 `…-034432-…`；全量回归中再次 exit 0。

## 观察到的机制（非缺陷，记录事实）

- 切换前已发出的慢路径请求（agent/provider）在延迟后仍经 A 完成，所以模型在旧面板里变为 ready，待发意图随即触发（`stats.ready = 1`）。
- 触发后的提交请求在宿主 `bound()` 被拒（“connection changed”），服务端没有收到消息；官方失败路径恢复了输入框。
- 因此“不会误发”靠的是宿主绑定拒绝，而不是页面层撤销待发意图。页面没有给出“连接已变化”的专门提示。若要更直观，可在后续让宿主在连接变化时通知面板撤销待发并提示；未纳入本批。

## 环境修正

worktree 路径较长，VS Code 用户数据目录下的 IPC socket 超过 macOS 103 字符上限，启动即退出（`listen EINVAL`）。`tests/e2e/vscode.mjs` 改为对 `.oco-test` 取 realpath；主仓库路径下行为不变。
