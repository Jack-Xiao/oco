# P1b-1 验收记录

范围：[P1b 执行指示](../P1B-NEXT-STEPS.md) 的 P1b-1。设计见 [ADR-006](../adr/006-p1b1-sessions-sidebar.md)。上游调查见 [p1b-upstream-survey.md](p1b-upstream-survey.md)（Grok，只读源码）。

## 版本与环境

| 项 | 值 |
| --- | --- |
| 产品代码提交 | `ad9da32`（P1b-1 代码）；`064d915` 加入单元测试，`4082f43` 修复侧栏测试脚本，这两次产品代码都不变 |
| 上游 | OpenCode v1.18.33 @ `51ef4be` + 补丁 0001、0002、0003（窄栏换行）、0004（嵌入提交等待模型） |
| 服务 | 隔离测试服务 OpenCode 1.18.33（`scripts/test-server.sh`，状态全部在 `.oco-test/`），模型 Big Pickle |
| VS Code | 1.139.1，独立 profile，Playwright `_electron` 驱动 |
| 系统 | macOS（darwin 27.2.0 arm64），Node v26.7.0 |

运行记录的 `ocoDirty=true` 是因为运行时 README 和新文档还没提交。`apps/`、`packages/`、`patches/`、`scripts/`、`tests/` 与所记提交一致（`git status` 为空）。

## 命令

```bash
bun run typecheck
```

```bash
bun test tests/unit
```

```bash
node tests/e2e/run.mjs
```

## 结果

| 检查 | 结果 |
| --- | --- |
| typecheck | PASS |
| 单元测试 | 80/80 PASS（新增 SessionStore 12 个、SessionFeed 13 个）。变异检查：分别去掉事件 id 去重、旧版 `session.updated` 丢弃、快照前的令牌检查、缓冲事件回放、401 不重试，各有 1–3 个用例失败 |
| E2E 第 1 轮（全部默认套件） | exit 0：p1a-chat 8/8、p1a-identity 14/14、p1b-sidebar 11/11、p1b-narrow 12/12、p1b-theme-load 3/3、p1b-ime 1 PASS + 1 NOT RUN |
| E2E 第 2 轮 | exit 1：p1b-sidebar 的 chain-permission 为 NOT RUN（原因是测试脚本，见“第 2 轮”）；其余五个套件 exit 0 |
| p1b-sidebar 修复后 | 连续两次 exit 0（11/11），第二次在提交 `4082f43` 上 |
| 补丁可重复应用 | 在上游 `51ef4be` 的干净 worktree 上，0001–0004 都能通过 `git apply --check` 并应用成功；结果与构建所用的 vendor 树完全一致 |
| 窄栏负向对照 | 撤掉补丁 0003 后在 260 px：allow-260 FAIL（按钮右缘 299 > 视口 262，指针点击超时），套件 exit 1（run `c1fb`） |

第 2 轮 runId：`20260929-171554-p1a-chat-f58b`（8/8）、`20260929-171755-p1a-identity-b1eb`（14/14）、`20260929-172129-p1b-sidebar-3d7d`（10 PASS + chain-permission NOT RUN，exit 1）、`20260929-172704-p1b-narrow-cb25`（12/12）、`20260929-173045-p1b-theme-load-703b`（3/3）、`20260929-173129-p1b-ime-c89f`（1 PASS + 1 NOT RUN）。修复后侧栏：`20260929-173319-p1b-sidebar-afbe`、`20260929-173607-p1b-sidebar-0211`。

### 第 2 轮

`chain-permission` 在第 2 轮两次尝试中都没有等到 bash 权限请求。查看会话记录后确认原因在测试脚本：

- 测试用 Cmd+End 移动光标，但在多行输入框里它只移到当前行末，所以请求文字被插进了草稿代码块的中间；
- 模型把它当成“文件内容里夹带的指令”拒绝执行，重试时也拒绝了。

侧栏本身的行为正确：没有权限请求，所以一直显示空闲。

修复只改测试（`4082f43`）：

- 改用 Cmd+↓ 移到整个输入框末尾；
- 改写请求措辞；
- 新增断言：发出的第一条消息必须包含草稿代码。

修复后 p1b-sidebar 连续两次 11/11，exit 0。产品代码没有改动，所以其余五个套件没有重跑。

第 1 轮 runId：`20260929-170018-p1a-chat-2a8f`、`20260929-170229-p1a-identity-19ba`、`20260929-170640-p1b-sidebar-6323`、`20260929-170933-p1b-narrow-cdca`、`20260929-171459-p1b-theme-load-ca6d`、`20260929-171526-p1b-ime-5dfa`。

## 窄布局与权限（真实指针点击）

方法：

- 三个会话各占一个编辑器组，三组同时可见。调整窗口宽度，并执行 “Reset Editor Group Sizes”，使每个 webview 的 `innerWidth` 为目标宽度 ±4 px。
- 480 和 800 两档在屏幕上放不下三组，改用 VS Code 缩放 −1 / −4（页面按 CSS px 布局）。
- 第 1 组做拒绝，第 2 组做“允许一次”，第 3 组做提问（选 blue 后提交）。
- 点击方式是 Playwright `locator.click()`：先做可操作性检查和命中目标检查，再在元素中心发鼠标事件。没有使用 force、`dispatchEvent` 或 `element.click()`。

| 宽度（CSS px） | 缩放 | 拒绝 | 允许一次 | 提问 | 按钮是否在视口内且命中自身 |
| --- | --- | --- | --- | --- | --- |
| 260（实测 262） | 0 | PASS（工具 error） | PASS（工具 completed） | PASS（answer=blue） | 是 |
| 320 | 0 | PASS | PASS | PASS | 是 |
| 480（实测 479） | −1 | PASS | PASS | PASS | 是 |
| 800 | −4 | PASS | PASS | PASS | 是 |

- 每项还核对了服务端状态：权限请求已不在待处理列表中，工具部件的状态分别为 error 或 completed，提问记录的答案是 blue。
- 支持宽度：VS Code 编辑器组的最小宽度（约 220 px）以上都可操作，因为补丁后按钮会逐个换行。更窄的情况只可能来自自定义或本地化标签比面板还宽；这时用 “View: Toggle Maximize Editor Group”，或把会话移到更宽的组。

## 侧栏主链

`p1b-sidebar`：侧栏 → 草稿 → 发送 → 权限 → 停止 → 状态 → 切换恢复。

| 项 | 结论 | 证据要点 |
| --- | --- | --- |
| sidebar-list | PASS | 已连接；侧栏条目与服务端本目录根会话一致（上限 200），最新在前，无重复 |
| sidebar-create | PASS | 点击标题栏“+”：打开面板；新会话排在首位并标“已打开”；服务端目录正确 |
| sidebar-rename | PASS | 行内“重命名”按钮 → 服务端标题、侧栏标签、编辑器标签都更新 |
| sidebar-search | PASS | 搜索按钮 → 只剩一条匹配；清除按钮 → 条目数恢复 |
| chain-draft | PASS | math.ts 选区加入该会话草稿，没有发送 |
| chain-permission | PASS | 发送后侧栏显示“等待权限”、角标 1、状态栏带提醒数；在面板里点“允许一次” → 工具 completed → 侧栏回到空闲 |
| chain-stop | PASS | 运行中侧栏显示 busy；点停止 → 服务端记录 MessageAbortedError → 侧栏回到 idle（中止不算错误） |
| switch-restore | PASS | 同一组内 A、B 交替：各自未发送的草稿都恢复，没有串到对方；每个会话只有 1 个面板，连接一致 |
| focus-existing-group | PASS | A、B 在两个可见组中：点击侧栏行时聚焦已有的组，面板数不变，活动标签正确 |
| connection-switch | PASS | 服务地址改成不可达：状态 error、列表清空、状态栏显示“未连接”、给出原因；改回后列表恢复，条目数相同，无重复 |
| restricted-mode | PASS | 未受信任的文件夹（放在已信任的主目录之外）：可列出会话；“新建会话”按钮禁用，点击不打开面板 |

## T010：主题与首次加载

| 项 | 结论 | 证据要点 |
| --- | --- | --- |
| theme-initial-light | PASS | Default Light Modern → 应用 `data-color-scheme=light` |
| theme-switch-dark | PASS | 运行中切换到 Default Dark Modern → 同一文档（generation 不变）变为 dark，页面背景随之变深 |
| first-load-submit | PASS | 用开发钩子把 agent/provider 响应延迟 6 s；模型出现前按 Enter：页面进入等待，没有出现 “Select an agent and model”，约 7.3 s 后消息到达服务端并得到回复 |

## 独立环境验证

| 项 | 结论 | 说明 |
| --- | --- | --- |
| 输入法合成 + Enter（Chromium IME 路径） | PASS | 用 CDP `Input.imeSetComposition`，在合成中按 Enter（`isComposing=true`）→ 没有发送；确认上屏后按 Enter → 发送“中文输入”。这是浏览器自身的输入法事件路径，不是真实 macOS 输入法 |
| 真实 macOS 中文输入法 | NOT RUN | 需要有人用系统输入法实际打字；自动化无法驱动 VS Code 里的系统输入法 |
| 系统剪贴板图片粘贴 | NOT RUN | 会覆盖使用者当前的 macOS 剪贴板，未获同意前不做。现有 P1a 图片字节测试（模拟粘贴事件携带真实图片字节）保留 |
| 受限模式 UI | PASS | 见 restricted-mode |
| 连接切换 UI | PASS | 见 connection-switch |
| Remote-SSH、团队服务 | BLOCKED | 缺少目标环境 |
| Windows | NOT RUN | 没有 Windows 环境 |

## 子代理分工

- Grok：上游只读调查（主题键、提交门闩、坞布局、服务端 API 与事件）；SessionStore / SessionFeed 单元测试 25 个。调查中“`directory` 查询参数才按目录过滤”和“`/session` 默认 100 条”两条结论直接改变了快照请求的写法。
- 主线程：契约、宿主实现、补丁 0003/0004、主题、E2E 套件、验收和文档。

## 限制与已知问题

- 侧栏的长列表只加载最近 200 个根会话，搜索只在已加载的会话里进行，没有调用服务端搜索。
- 主题只跟随亮暗，不映射 VS Code 主题的具体颜色；应用内手动改的配色会在下次加载时被 VS Code 主题覆盖。
- 首次加载最多等待 20 s，等待期间只有页面根元素上的状态标记，没有可见提示。
- 侧栏状态依赖宿主的一条事件流：服务端运行中重启、或长时间网络中断，只用单元测试和“连接切换”覆盖过，没有做真实断网测试。
- 仍保留 P1a 的已知问题：同一连接下各会话共用输入历史；隐藏面板在重载后延迟恢复；官方应用不再占用的快捷键交给 VS Code（例如 Cmd+N 新建未命名文件）。
- 本轮没有推送、发布，也没有修改任何外部 OpenCode 服务。
