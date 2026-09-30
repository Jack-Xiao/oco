# ADR-005：P1a 面板身份、桥接生命周期、存储与连接边界

状态：已采纳（P1a）。日期：2026-09-29。依据：[P0 核查](../P0-REVIEW-P1-INSTRUCTIONS.md) 第 2–3 节、[上游调查](../evidence/p1a-upstream-identity.md)、[P1a 验收记录](../evidence/p1a-acceptance.md)。补充并部分取代 ADR-003 的 P0 做法。

## 1. 文档 generation 与请求生命周期（P1a-01）

- 协议升到 v2（`packages/contracts/src/bridge.ts`）。每个 webview 文档启动时发 `hello{docId}`，宿主分配全进程唯一的 generation，回 `welcome`；此后双方消息都带 generation。
- 宿主只接受面板当前 generation 的消息；请求以 `(generation, id)` 为键，回包带请求创建时的 generation；`finally` 只在表项仍是自己时才删除。
- 新 `hello` 到来（页面重载）或面板关闭时 `retire()`：中止该面板全部请求与事件流，旧文档后续消息一律丢弃。（2026-09-30 修订，见 ADR-007：面板改为 `retainContextWhenHidden:true`，隐藏不再销毁文档，也不再 retire。）
- 实现在纯模块 `apps/extension/src/bridge-core.ts`（无 vscode 依赖），单元测试覆盖“旧 SSE 未结束时新文档复用同一序号”的负向夹具，并做了变异测试（见验收记录）。

## 2. 单会话绑定（P1a-01）

- 路由守卫（`apps/chat-webview/src/app.tsx`）：MemoryRouter 的 history 只接受绑定会话的路由（2026-09-30 起为宿主最后通过 `navigate` 下发的会话，见 ADR-007）。其他会话 → 向宿主发 `openSession`，由宿主校验（同连接、同项目）后打开（ADR-007 起：主面板原地切换，或聚焦已显示它的面板）；其他路由 → 拒绝并计数。因 solid-router 在 `history.set` 之外也会写入自身位置信号，拒绝后会把绑定路由推回监听器。
- 上游补丁 `0002-oco-embedded-single-session.patch`：`Platform.embedded` 为真时不渲染也不注册内部标签条、home、新建标签/会话命令与终端命令，终端状态恒为关闭。对应快捷键不再被官方应用占用，交还 VS Code。
- 草稿插入：宿主消息带目标 sessionId；页面与（补丁 0001 的）composer 各自再核对一次，结果以 `draft.ack` 回报；待插入队列持久化在 workspaceState，确认后删除，拒绝时提示用户、从不改投其他会话。
- 标题：官方应用不设置 `document.title`，宿主在面板就绪时读取会话标题，并从代理的事件流中解析绑定会话的 `session.updated`。
- WebSocket 在页面中被禁用（唯一用户是终端，v0.1 不支持）。

## 3. 桥的可信范围（P1a-03）

虚拟 origin 限制只防“任意网络目标”，不等于会话权限。新增 `apps/extension/src/bridge-policy.ts`：

- 目录：丢弃页面提供的目录/工作区头，强制设为面板绑定目录；查询参数只能重复绑定目录（随后删除），其他目录或 `workspace` 覆盖一律 403（读写都拒绝）。
- 读请求（GET/HEAD/OPTIONS）放行：官方同步层需要读取同项目的会话列表与状态。
- 有副作用的请求需要受信任工作区，并且只允许：创建会话（目录已被强制）、`/log`、绑定会话及其经服务端确认的子会话上的操作、归属于这些会话的权限/提问回复。其余（配置、MCP、认证、PTY、TUI、dispose/upgrade、experimental 等）返回 403。

## 4. 连接身份与凭据目的地（P1a-03）

- `oco.serverUrl` / `oco.serverUsername` 改为 machine 作用域，仓库级设置不能改写凭据目的地；地址只接受 http/https origin，拒绝内嵌账号、路径和查询。
- `connectionId = hash(origin | username)`；密码按 connectionId 存在 SecretStorage。地址变化得到新 connectionId，不沿用旧密码；P0 的全局密码键保留不删但不再使用。
- 面板绑定其打开时的 connectionId；配置改变后旧面板的请求失败而不是把会话和凭据带到新服务；重载恢复只恢复当前连接、当前工作区的面板。
- 宿主请求一律 `redirect: "manual"`，凭据不随重定向转发。非回环 http 的 Basic 认证会提示明文风险。
- 开发用测试密码文件只在非生产模式且回环地址时读取。
- 声明 `untrustedWorkspaces: limited`：受限模式可查看，不能新建会话或执行有副作用的会话操作。

## 5. 存储（P1a-02）

- 在 `platform:"web"` 下，官方 `persisted()` 除草稿外都写 `window.localStorage`，窗口 id 固定为 `browser`（上游 `utils/persist.ts:531-587`）。不伪装成 desktop（会触发未验证分支），而是在 webview 启动时安装面板级 `localStorage` 垫片：同步内存副本，初值为宿主快照，写入异步回宿主。应用代码在垫片安装后才动态加载。
- 宿主按 key 分命名空间：`opencode.window.*`（标签、窗口布局）→ 面板；设置与纯 UI 偏好 → ui（全局共享）；其余（服务器列表、项目、模型、工作区/会话状态，均含虚拟服务 URL）→ 连接。草稿（官方 draftStore）→ 连接作用域。
- 每个 key 一个 Memento 条目；写入在 `update` 完成后才确认，失败回报页面；同一条目的写入按到达顺序串行；`clear` 覆盖已收到但尚未落盘的写入。已退役文档的迟到写入被桥丢弃。
- P0 数据：旧整表只作为读回退，从不修改或删除；迁移后的删除写入墓碑，旧值不会复活；面板作用域不回退旧数据（旧数据正是跨面板标签的来源）。P0 时写在原生 localStorage 的非面板键在首次启动时复制到宿主，原数据保留。

## 6. 取消、关闭与重载的语义

| 动作 | 语义 |
| --- | --- |
| 停止按钮 / Escape | 官方应用调用绑定会话的 abort，服务端停止运行 |
| 关闭标签页 | 只释放该面板的请求与事件流；服务端运行继续 |
| 隐藏标签页 | 文档保持存活，generation 与事件流不变；隐藏期间排队的草稿在再次显示时投递（2026-09-30 起，见 ADR-007） |
| Reload Window | 新激活；可见面板由序列化器自动恢复，隐藏面板在显示时恢复；草稿从宿主恢复 |
| 扩展停用 | 不停止任何服务（只支持 attached） |

## 7. 仍未解决

见验收记录“已知问题”：窄面板下权限按钮溢出、主题不跟随、输入历史按连接共享、首次提交前的同步竞态、远程与团队服务未验证。
