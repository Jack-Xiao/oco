# P1a 验收记录（P1a-00～04）

日期：2026-09-29。执行：集成 AI（子代理分工见 §7）。依据：[P0 核查与 P1a 指示](../P0-REVIEW-P1-INSTRUCTIONS.md)。决定见 [ADR-005](../adr/005-p1a-identity-storage-connection.md)。

```text
oco commit:      6ab04b6（验收运行时工作区干净，results.json 中 ocoDirty=false）
upstream:        anomalyco/opencode v1.18.33 @ 51ef4be1d3c122f18fefb510dca8d778571f4f18
                 + patches/opencode/0001-oco-draft-insert.patch + 0002-oco-embedded-single-session.patch
Server:          opencode 1.18.33，本地隔离实例 127.0.0.1:4517（scripts/test-server.sh），模型 opencode/big-pickle（免费）
VS Code:         1.139.1，扩展开发宿主，每个套件独立 profile
Client/host OS:  macOS 27.2 arm64，本地模式（客户端即宿主）
Node / Bun:      v26.7.0 / 1.3.10
```

## 1. 检查汇总

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| 类型检查 | `bun run typecheck` | PASS |
| 单元测试 | `bun test tests/unit` | PASS：55 个测试，0 失败（5 个文件） |
| 构建 | `bun run build` | PASS |
| 干净 clone 重建 | clone → `scripts/setup.sh` → `bun run build` | PASS：两个补丁均 `git apply` 成功；资源文件名（内容哈希）与工作区构建一致；产物不含本机绝对路径 |
| 统一 E2E 第 1 轮 | `node tests/e2e/run.mjs` | PASS：exit 0。[p1a-chat 80fd](runs/20260929-153814-p1a-chat-80fd/results.json) 8/8，[p1a-identity 642c](runs/20260929-154000-p1a-identity-642c/results.json) 14/14 |
| 统一 E2E 第 2 轮 | 同上 | PASS：exit 0。[p1a-chat 9374](runs/20260929-154408-p1a-chat-9374/results.json) 8/8，[p1a-identity 6644](runs/20260929-154618-p1a-identity-6644/results.json) 14/14 |
| 负向对照 | `OCO_E2E_NEGATIVE=question node tests/e2e/p1a-chat.mjs` | 预期失败，见 §3 |
| 性能/泄漏基线 | `node tests/e2e/perf.mjs` | 见 §5 |

`tests/e2e/run.mjs` 的退出规则（`tests/e2e/lib/results.mjs`）：任一 FAIL、必需用例缺失或为 NOT RUN/BLOCKED/N/A、没有任何记录、进程异常（崩溃处理器记录 `run` FAIL）都返回 1。每次运行写 `docs/evidence/runs/<runId>/results.json` 与截图，记录提交、是否脏、上游 SHA、脚本 sha256、VS Code 与服务版本。

## 2. 用例与断言（当前版本证据）

### p1a-chat（`tests/e2e/p1a-chat.mjs`）

| 用例 | 断言（针对核查第 2 节的缺口） | 结果 |
| --- | --- | --- |
| stream-locked | 锁定服务端助手文本 part id；只采样该 part 的 Markdown DOM；忙碌期间 ≥3 次不同采样，每次都是最终服务端文本的前缀且单调增长；最终 DOM 与服务端文本一致 | PASS（10–61 次采样） |
| permission-bound | 读取本会话待决权限请求 id → `tool.callID` → 工具 part；点击后该请求已解除、工具 completed 且输出匹配 | PASS |
| question-answer | 读取 question 请求 id → 工具 part 的 `state.metadata.answers[0][0]` 必须等于点击的选项（不再搜索整个 state） | PASS |
| cancel-real | 锁定本次发送产生的助手消息；按钮必须处于 Stop 状态才点击；等待该消息定稿；服务端记录 `MessageAbortedError`、会话回 idle、之后不再增长 | PASS |
| policy-foreign-session | 页面直接调用桥：中止同项目但未绑定的会话 → 403，该会话仍在运行 | PASS |
| policy-directory-override | `?directory=/tmp` 的读与写 → 均 403 | PASS |
| policy-unlisted-write | `PATCH /config`、`POST /pty` → 403，配置未改变 | PASS |
| csp-violations | 全程 0 | PASS |

### p1a-identity（`tests/e2e/p1a-identity.mjs`）

| 用例 | 场景 | 结果 |
| --- | --- | --- |
| three-visible-webviews | 三个会话分别位于三个 editor group，同时可见、同时就绪，generation 各不相同 | PASS |
| no-internal-tabs | 三个面板内标签条/标签触发器元素数均为 0 | PASS |
| concurrent-send-isolated | 三个可见面板连续发送；每个会话服务端只有自己的提示、回复完成；任何会话的服务端数据与 DOM 中都没有其他会话的标记 | PASS |
| nav-link-other-session | 在 A 中触发路由器内链接到同项目另一会话：宿主为其打开独立面板；A 的路由与内容不变 | PASS |
| nav-blocked-routes | 在 A 中跳转 `/`、`/new-session`、另一服务器 key 的路由：3 次均被拒绝，A 路由不变 | PASS |
| nav-shortcuts-deeplink | 官方新建/终端/home 快捷键与两种深链接：A 路由不变，无终端元素，无 WebSocket 尝试，A 只有一个面板 | PASS |
| draft-after-attacks | 攻击之后：未保存编辑器选区加入 A 的草稿（显式目标），宿主收到确认、队列清空；发送后服务端收到未保存内容；B/C 未收到 | PASS |
| forged-draft-rejected | 在 A 页面伪造一条指向 B 的 `draft.insert`：页面拒绝并回报，宿主记录 1 次拒绝，A 的输入框不变 | PASS |
| permission-after-attacks | 攻击之后 A 的权限请求在 A 面板中回应，作用于该请求 | PASS（点击方式见已知问题 1） |
| hide-retires-generation | C 被同组新面板遮住：宿主记录 visible=false、generation=0、在途请求 0；再次显示得到更大的 generation，草稿恢复 | PASS |
| reload-auto-restore | Reload Window：新的 activationId；3 个可见面板由序列化器自动恢复（未调用打开命令）；编辑器标签集合前后一致；三个会话的未发送草稿全部恢复 | PASS |
| close-specific-tab | B 运行中点击 B 自己标签的关闭按钮：只关闭该标签、宿主不再持有 B、服务端继续运行并正常结束 | PASS |
| image-bytes | 合成 ClipboardEvent（真实 PNG 字节）→ 服务端 `image/png` data URL 逐字节一致 | PASS（仅合成事件，见 §4） |
| csp-violations | 全程 0 | PASS |

“三个编辑器标签页打开”（P0 t005）与“三个 Webview 同时可见且并发运行”（本表前三行）分别记录；后者是本轮首次验证。

## 3. 测试能判错的证据

1. **负向对照（E2E）**：`OCO_E2E_NEGATIVE=question` 时点击 red、期望 blue。[运行 50f1](runs/20260929-152929-p1a-chat-50f1/results.json)（提交 4e6603a）：question-answer FAIL（recordedAnswer=red），进程 exit 1。同一运行中 cancel-real 也 FAIL，那是随后在 6ab04b6 修复的测试等待竞态（见 §6），不是负向对照的一部分。最终提交上的负向对照复跑见 §3 末尾。
2. **重挂载负向夹具（单元）**：`tests/unit/bridge-core.test.ts` 模拟“旧 SSE 未结束时新文档复用同一请求 id”，断言旧 chunk/end/abort/finally 不影响新请求。变异测试（临时修改后恢复，源文件无残留）：

| 变异 | 结果 |
| --- | --- |
| finally 不做身份比较 | 被抓（duplicate-id 用例失败） |
| send 不检查 generation | 被抓（remount 用例失败） |
| 请求表只按 id 作键 | 未被抓：hello 时整体退役 + 消息层 generation 校验已足够，属纵深防御的等价变异 |
| 去掉消息层 generation 校验 | 未被抓：同上，另一层兜底 |
| 请求表只按 id 作键 + 去掉消息层校验 | 被抓（remount 用例失败） |

3. **结果库自测**：`tests/unit/e2e-results.test.ts` 覆盖 FAIL/缺失/NOT RUN/空结果 → 1。
4. **源码缺陷由测试发现**：Grok 编写的 `host-store.test.ts` 暴露 `KvStore.clear` 漏掉已收到但尚未落盘的写入；已修复（`clear` 同时覆盖串行队列中的条目）。

最终提交负向对照复跑：[0a3c](runs/20260929-155045-p1a-chat-0a3c/results.json)，只有 question-answer FAIL，exit 1（§8）。

## 4. 未验证 / 阻塞（独立列出）

| 项目 | 状态 | 说明 |
| --- | --- | --- |
| macOS 真实系统剪贴板粘贴图片 | NOT RUN | 需要改写用户系统剪贴板并用真实键盘粘贴；自动化会覆盖用户剪贴板，未执行。合成 ClipboardEvent 的字节测试不等于系统剪贴板通过 |
| 中文输入法 | NOT RUN | 需要人工使用输入法；自动化键盘事件不经过 IME |
| Remote-SSH | BLOCKED | 无远程主机；不得宣称远程支持 |
| 团队实际 OpenCode 服务 | BLOCKED | 未获得访问 |
| Windows | NOT RUN | 无设备 |
| 受限工作区（Workspace Trust）实际 UI | NOT RUN | 策略由单元测试覆盖（不受信任时写操作 403）；未在 VS Code 受限模式中跑 E2E |
| 连接地址变更后旧面板失效 | NOT RUN（E2E） | 由代码路径保证（ADR-005 §4），未做 UI 用例 |

## 5. 性能与泄漏（方法与结果）

结果见 §8。方法：进程内存为本测试 profile 的进程按 Electron `--type` 汇总的 RSS；三个可见 webview 共用渲染进程，无法按面板拆分；macOS 内存压缩使 RSS 抖动（三面板可见时总量甚至低于空闲），因此只作趋势参考，不据此重写官方 UI。泄漏判据以宿主计数为准：打开的事件流数 ≤ 可见面板数；隐藏面板在途请求为 0、generation 为 0。

## 6. 本轮修正的测试缺陷（均为测试侧，已修复）

- 流式断言统计整页文本 → 锁定 part；part 元素含页脚 → 只取 Markdown 子树。
- 答案断言搜索整个 state → 读取答案字段；并发权限双向排除。
- 关页用 `Meta+W` 可能关错 → 点击目标标签自己的关闭按钮并核对标签集合。
- 命令辅助函数在焦点仍位于忙碌输入框时按 Escape，等于点了“停止”（官方快捷键），导致会话被中止 → 先把焦点移回工作台。
- 首次点击 webview 可能只聚焦编辑器组，按键丢失 → 显式 focus 并核对文本到达。
- `waitIdle` 在运行尚未开始时就返回；会话先报 idle、被中止的消息稍后才定稿 → 改为等待回复/消息定稿。
- 链接测试使用相对 href，被 `<base>` 解析到资源源、绕过路由器 → 改为同源绝对地址，确保真正经过路由守卫。

## 7. 子代理分工

| 子代理 | 事项 | 写入范围 |
| --- | --- | --- |
| Gemini | 结果库、统一入口、结果库单元测试 | `tests/e2e/lib/results.mjs`、`tests/e2e/run.mjs`、`tests/unit/e2e-results.test.ts` |
| Grok | 上游身份/存储/导航/终端只读调查 | `docs/evidence/p1a-upstream-identity.md` |
| Grok | 策略、端点、存储单元测试（发现 clear 竞态缺陷） | `tests/unit/{bridge-policy,endpoint,host-store}.test.ts` |
| 集成人 | 协议、宿主桥、策略、连接、存储、webview、上游补丁、E2E 套件、文档与最终判断 | 其余 |

## 8. 最终提交上的补充运行

| 运行 | 提交 | 结果 |
| --- | --- | --- |
| [负向对照 0a3c](runs/20260929-155045-p1a-chat-0a3c/results.json) | 1770ab1（干净；与 6ab04b6 代码相同，仅多文档） | 只有 question-answer FAIL（点击 red，记录 red，期望 blue），其余 7 项 PASS，exit 1 —— 断言能判错 |
| [性能 7b77](runs/20260929-154922-perf-7b77/results.json) | 6ab04b6 + 未提交的文档改动（ocoDirty=true，代码未变） | no-stream-leak PASS（3 个可见面板，3 条事件流；被隐藏面板 0 条）；hidden-releases-requests PASS（隐藏面板在途 0） |

性能数值（单次采样，仅供趋势参考）：新建会话到输入框可用 0.8–1.2 s；隐藏面板经命令面板重新显示 ≈1.8 s（其中约 1.8 s 为脚本在命令面板输入，面板挂载本身在输入结束后 7–150 ms 内出现输入框）；VS Code 本测试 profile 总 RSS：空闲 1244 MB，三面板可见 1340 MB（渲染进程 2 个共 711 MB），10 次隐藏/显示循环首末 1229 → 1096 MB，无增长趋势。

失败的历史运行（保留，未混入通过记录）：[p1a-chat 7270](runs/20260929-153145-p1a-chat-7270/results.json)、[p1a-identity 2d7f](runs/20260929-153359-p1a-identity-2d7f/results.json)（提交 4e6603a，与干净 clone 构建并行运行）暴露了 §6 最后一条的等待竞态；修复后连续两轮全部通过。

## 9. 已知问题（进入 P1b / T010）

1. 窄面板（三组并排，约 260px）下官方权限 dock 的按钮不换行，“Allow once”溢出到相邻 webview 下方，真实指针点击会被相邻面板截获。测试以按钮自身的 click() 触发并记录。
2. 主题固定为官方浅色，不跟随 VS Code。
3. 输入历史（`opencode.global.dat:prompt-history`）按连接共享，未按面板隔离（属用户偏好，暂保留）。
4. 刚打开面板、agent/model 同步完成前提交会被官方提示“Select an agent and model”。
5. VS Code 对隐藏的 webview 延迟恢复：重载后宿主只持有可见面板，隐藏面板在显示时才重新绑定（标签本身完整保留）。
6. 官方快捷键不再注册后会交给 VS Code（例如 Cmd+N 新建未命名文件、Ctrl+` 打开 VS Code 终端），这是预期行为，文档需告知用户。
