# OpenCode 上游调研：V2 发布、路线图与近期工作（2026-10-02）

> 问题：OpenCode 在做什么？V2 发布了什么？有没有路线图？从近期工作能推测什么计划？是否比 Codex、Claude Code “慢”？

## 证据级别与基线

| 标记 | 含义 |
| --- | --- |
| SOURCE | 本机克隆的上游源码、文档、git 元数据（只读；未安装、未构建、未运行 OpenCode） |
| REGISTRY | npm registry 公开 API（发布时间为 UTC） |
| WEB | GitHub 网页经 WebFetch 摘要；数值为 2026-10-02 抓取时页面显示，经二次摘要，可能有小误差 |
| SNIPPET | 只有搜索引擎摘要，原文无法打开（`x.com`、`opencode.ai`、`falcao.org` 被本环境出口代理拦截），可信度最低 |
| 推测 | 根据上面证据的推断，不是已确认事实；每条附验证路径 |

| 项 | 值 |
| --- | --- |
| 上游仓库 | `https://github.com/anomalyco/opencode`（treeless 克隆，2026-10-02） |
| `dev`（默认分支，V1 线） | `1ddb0873aee50d209d1a8d7f91b89c5daf692d49`，2026-10-01T22:21:08-05:00 |
| `v2` 分支 | `7440ff784408a8a095b58ef908de3fc6ee66ca66`，2026-10-02T20:50:09+05:30 |
| 对照 | `openai/codex` main `4cedd0caac89f9fdcb5ad385e8093da5363d91c2`（2026-10-02）；Claude Code 闭源，只用 npm 发布记录 |
| 未执行 | 运行速度基准、安装/运行任何一方的 CLI：NOT RUN |

## 摘要

1. OpenCode 是开源、不绑定模型厂商的编码 Agent（TUI、桌面、Web），GitHub 组织 `anomalyco`（原 `sst/opencode`）。商业化靠 Zen 按量付费、Go（$10/月）与 Go Plus（$40/月，2026-09-28 文档上线）、Console、Enterprise。SOURCE/WEB
2. V2 是一次重写：2026-06-26 起在独立 `v2` 分支开发，2026-09-11 发布 2.0.0，到 2026-10-02 已到 2.0.22（21 天 23 个版本）。新 npm 包 `@opencode/cli`；`opencode-ai@latest` 仍是 V1 的 1.18.34，V1 仍在打补丁。REGISTRY/SOURCE
3. V2 的核心：共享后台服务 + 多前端，新服务端 API/客户端（`@opencode/client`）、新插件 API、可嵌入 SDK（含 Cloudflare Durable Objects）、自研多模态 AI 层 `@opencode/ai`、Code Mode 解释器、桌面内置浏览器与 SSH/WSL 远程。SOURCE
4. V2 暂时少了 V1 的功能：不运行 LSP；todo 工具已删除；编辑工具仍有 LSP 诊断、工具级快照、文件监听事件的 TODO。SOURCE
5. 没有公开路线图。`specs/v2/README.md` 明说规格“不是 backlog”，活跃工作放 GitHub issues；2026-03 有人问路线图，issue 以 not planned 关闭。SOURCE/WEB
6. “慢”在产出量上不成立：2026-07～09 非机器人提交 OpenCode 1,228/1,495/1,154，Codex 877/1,262/1,596；9 月 npm 正式版 OpenCode 31（V1 9 + V2 22）、Claude Code 27、Codex 19。REGISTRY/SOURCE
7. 但“体验慢/质量一般”有可解释来源：V1 用户 4–5 月每月 34–35 个版本，9 月只剩 9 个（工作转到 V2）；V2 是可选新包，回归和缺失功能明显（OOM、Windows、LSP）；无 V2 发布说明（#52184）；4.6k 未关闭 issue、1.6k 未关闭 PR；团队集中（前 10 名作者占 V2 非机器人提交 95.7%）。REGISTRY/SOURCE/WEB
8. 运行速度（若指 Agent 干活快慢）本次没有测；只给出假设与测量方法（见第 7 节）。
9. 对 oco：oco 钉在 V1 的 v1.18.33，V2 改了服务端 API、客户端、插件 API 与前端包；官方 VS Code 扩展在 V2 仍只是终端启动器。迁移是否立项需另行决定。

## 1. V2 时间线与发布形态

| 日期 | 事件 | 来源 |
| --- | --- | --- |
| 2025-10-31 | v1.0.0 | SOURCE（tag） |
| 2026-03-04 → 04-14 | 桌面从 Tauri 转 Electron（`desktop: add electron version (#15663)`；`ci: remove Tauri desktop builds…`），属 V1 时期 | SOURCE（dev 提交） |
| 2026-06-26 | `v2` 分支与 `dev` 分叉（merge-base `0e2dd4ad`）；首批提交 `feat(tui): add v2 terminal interface`、`fix(cli): publish v2 package`（Dax Raad） | SOURCE |
| 2026-06-26 / 06-27 / 08-11 | `opencode-ai` 的 dist-tag `tui-v2`、`next`、`beta` 当前分别指向这三天的快照（是最后一次发布到该标签的时间，不是标签首次出现时间） | REGISTRY |
| 2026-09-02 | npm 包 `@opencode/cli` 创建 | REGISTRY |
| 2026-09-11 23:44Z | `@opencode/cli@2.0.0` 发布 | REGISTRY |
| 2026-09-19 | `feat(web): add v2 announcement banner to legacy docs`（V1 文档被称作 legacy） | SOURCE |
| 2026-09-30 | V1 `v1.18.34` 仍在发布 | SOURCE/REGISTRY |
| 2026-10-02 04:21Z | `@opencode/cli@2.0.22`；`opencode-ai` 的 `latest` 仍为 `1.18.34` | REGISTRY |
| 2026-10-02 | 未合并分支 `docs-v2-readme`：README 安装方式全部改为 V2（`@opencode/cli`、`opencode.ai/v2/install`、`brew install anomalyco/tap/opencode-v2`） | SOURCE（分支 diff） |

- V1 与 V2 都提供 `opencode` 命令，默认不能并装；V2 的 curl 安装器会替换 V1 二进制（`services/www/src/docs/content/migrate-v1.mdx` 开头）。SOURCE
- GitHub 上 v2.0.0 的 release 正文只有一行提交说明（WEB）；#52184（2026-09-29，open）指出 V2 没有发布说明、V2 changelog 链接 404（WEB）。
- 第三方说法与一手证据冲突：“2.0 beta 9 月 22 日才上线”与 npm 9-11 已发布 2.0.0 冲突；“2.0 把桌面从 Tauri 换成 Electron”实际发生在 2026-03～04；“从 Bun 迁到 Node”未确认——V2 CLI 的 `build` 仍用 `Bun.build` 编译（`packages/cli/script/build.ts`），同时存在 Node 26.4.0 SEA 构建（`build-node.ts`、`publish.yml` 的 `build-node-cli`），默认分发哪种二进制本次未查清。SNIPPET vs SOURCE

## 2. V2 改了什么（SOURCE）

- 架构：TUI 等界面连接共享后台服务，服务拥有会话、配置、插件、权限和工具执行；`opencode service status|restart`，`opencode pair` 开 Web，`opencode api` 直接调本地 API（`packages/core/src/plugin/skill/opencode.md`）。
- 三项有意的破坏性变更：插件 API；服务端 API 与客户端（改用 `@opencode/client`）；终端配置从分层 `tui.json(c)` 迁到全局 `cli.json`（`migrate-v1.mdx:8-14`）。V1 配置与 `.opencode/` 定义声明继续兼容，原生 V2 写法可选。
- 新包作用域 `@opencode/*`：`cli`、`client`（Promise 与 Effect 两套入口）、`sdk`（进程内宿主，无 HTTP 监听，另有 Cloudflare Durable Objects 指南）、`plugin`。
- 插件化：`packages/core/src` 中按正则 `id: "opencode.*"` 统计到 82 个不同 ID（provider 32、config 18、tool 13…）；Dax 推文摘要说是 68 个（SNIPPET），统计口径不同，方向一致：“几乎一切是内部插件”。
- 自研 AI 层 `@opencode/ai`：`src/providers/` 下 47 个提供方模块，含图像、视频、语音、转写（ElevenLabs、Deepgram、Runway 等）。`packages/core/package.json` 中 Vercel AI SDK 相关依赖从 dev 的 20 项降到 V2 的 7 项（同一正则），AI SDK 仍作后备路由；近期提交持续把 Cohere、Vertex Gemini、Vercel Gateway 等改走原生实现。
- Code Mode（`@opencode/codemode`）：只实现所需语法的类 JS 解释器，程序只能通过宿主工具接触外界；桌面浏览器插件 `@opencode/plugin-browser` 经 Code Mode 暴露。
- 桌面：Electron 44；`gui-extensions` 提供 SSH、WSL 远程 CLI；2026-09-19/20 一批启动性能提交（先显示窗口、V8 代码缓存、按需加载浏览器面板等）。
- Warming：空闲时定期发请求保持服务商提示缓存，默认关闭（`services/www/src/docs/content/warming.mdx`）。
- HTTP API：139 个端点，逐个审计 Keep/Change/Remove/Experimental（`V2_HTTP_API_AUDIT.md`，2026-09-13 重新生成）。
- 相比 V1 缺失：
  - LSP：“V2 accepts and preserves `lsp` configuration, but it does not run language servers…”（`migrate-v1.mdx:415`）。
  - todo 工具：`refactor: remove todo tool (#35989)`（2026-07-09）；用户 issue #42421 “todowrite/todoread missing in V2”（WEB，已关闭）。
  - 编辑路径 TODO：LSP 通知与诊断、工具级快照/撤销、文件监听事件（`packages/core/src/tool/plugin/edit.ts:105-107`、`write.ts:42-44`、`file-mutation.ts:129-131`）。会话级 `/undo` 快照已有文档（`snapshots.mdx`）。
- 官方 VS Code 扩展（`sdks/vscode`，2.0.22）：`extension.ts` 137 行，只有打开终端、新终端、插入文件引用 3 个命令。

## 3. 路线图：有没有

- 仓库里没有公开路线图文件。`specs/v2/README.md:3` “They are not API reference or a backlog.”；`:18` “GitHub issues own active work; Git history preserves removed plans and scratchpads.”；`:40` 不在规格里放实施清单。SOURCE
- issue #19206（2026-03-26）问“跟 Claude Code 功能表走，还是有自己的路线图”，状态 closed as not planned，页面上看不到维护者回复。WEB
- 文档里唯一的 “roadmap”：Enterprise 文档中自托管分享页面“This is currently on our roadmap.”（`packages/web/src/content/docs/enterprise.mdx:101-106`）。SOURCE
- 2026-08-14 删除的计划文档（均标为已完成或作废）：`plans/config-normalization.md`、`plans/session-generate.md`、`specs/storage/remove-opencode-db.md`、`docs/design/v1-v2-database-migration.md`、`specs/tui-package.md`。SOURCE

## 4. 近期工作（SOURCE）

`v2` 分支相对 `dev` 独有 4,077 个提交（含机器人）：6 月 80、7 月 1,008、8 月 1,633、9 月 1,265、10 月 1–2 日 91；同期 `dev` 独有 1,340 个。两边相同标题的提交只有 8 个，合并统计基本不重复。

近 30 天（2026-09-02 起）`v2` 非机器人提交 1,050 个：fix 532、feat 251、refactor 129、docs 41、test 31、chore 26、perf 25。主要范围：fix(core) 131、fix(app) 99、fix(ai) 78、fix(tui) 66、feat(core) 52、feat(app) 33、feat(desktop) 28、feat(tui) 25、codemode 的 fix/feat/refactor 共 64、acp 的 fix/refactor/feat 共 25、refactor(protocol) 14。

尚未合并、近两周活跃的功能分支（分支名｜作者｜顶端提交）：

| 分支 | 顶端提交 |
| --- | --- |
| `session-schedule` | feat(core): let agents create recurring and one-shot schedules |
| `chatgpt-app-ui` | feat(app): show ChatGPT plan connection UI |
| `openai-codex-v2` | feat(openai): allow GPT-6 Sol and Luna with Codex |
| `session-resume-api` | feat(sdk): expose session resume through API |
| `plugin-session-list-active` | feat(plugin): expose session list and active reads |
| `quick-prompt-shortcut` | feat(desktop): add global quick prompt shortcut |
| `effect4-stable` | chore: upgrade Effect to 4.0 stable |
| `config-v1-migrate` | refactor(core): migrate legacy commands one at a time |
| `gemini-tts-38` 等 | feat(ai): Gemini TTS、媒体输入 |

`dev`（V1）近一个月的人工提交主要是 Console、stats 站点和 Go 页面（fix/feat(console) 29、stats 21、go 18），V1 本体修复少（fix(opencode) 14、fix(core) 4）。商业侧信号：Go Plus 上线（09-28），Black 订阅停止续费（#51884，09-28）、限制旧访问（#50716，09-22），推荐计划结束（#51920）。

## 5. 推测的计划（推测，附验证路径）

| # | 推测 | 依据 | 验证方式 |
| --- | --- | --- | --- |
| 1 | 让 V2 成为默认，V1 逐步退场 | V1 文档挂 V2 横幅并被称 legacy；内置技能要求默认按 V2 回答；README 改 V2 的分支；V1 发布频率下降 | `npm view opencode-ai dist-tags` 的 `latest` 是否切到 2.x；`docs-v2-readme` 是否合入；V1 补丁是否停止 |
| 2 | 近期以 V2 稳定性为主 | 近 30 天 fix 占约一半；未解决 OOM（#51761、#51620）、Windows 问题；无发布说明（#52184） | 跟踪这些 issue 的关闭情况与 fix/feat 比例 |
| 3 | 补回与 V1 的功能差距 | 编辑路径 LSP/快照/监听 TODO；迁移文档承认不跑 LSP | 出现 LSP 运行时提交或文档删除该限制 |
| 4 | 做“Agent 后端平台”，前端可替换 | 服务协议、生成客户端、OpenAPI 进 CI、嵌入式 SDK（含 Cloudflare）、ACP、插件 RPC；Dax 推文摘要提到 OpenChamber 等第三方前端（SNIPPET） | 观察 `@opencode/client`/`@opencode/sdk` 稳定性声明与第三方前端数量 |
| 5 | 自建模型层并扩展到多模态 | `@opencode/ai` 47 个提供方、媒体模型、持续替换 AI SDK | 继续减少 `@ai-sdk/*` 依赖；出现图像/语音的用户功能 |
| 6 | 桌面成为主要入口，扩展到浏览器自动化与远程开发 | plugin-browser、gui-extensions、桌面启动优化、全局快捷输入 | 桌面版本发布说明与相关 issue |
| 7 | 自动化与订阅接入 | `session-schedule`、ChatGPT/Codex 订阅接入分支（未合并） | 这些分支是否合入 V2 |
| 8 | 收入向 Go/Go Plus 与企业集中 | Go Plus 上线、Black 停续费、推荐计划结束、企业自托管分享页面“on our roadmap” | Console/定价页变化 |

## 6. “慢”的数据对比

非机器人提交与作者（按作者名字符串；同一人多个名字会重复计；各家合并策略不同，只能比数量级）：

| 2026 | OpenCode `dev ∪ v2` 提交 | 作者 | Codex `main` 提交 | 作者 |
| --- | --- | --- | --- | --- |
| 7 月 | 1,228 | 38 | 877 | 113 |
| 8 月 | 1,495 | 47 | 1,262 | 152 |
| 9 月 | 1,154 | 55 | 1,596 | 144 |

npm 正式版（只算 `x.y.z`，不含 alpha/beta/snapshot；按 UTC 月份）：

| 包 | 4 月 | 5 月 | 6 月 | 7 月 | 8 月 | 9 月 |
| --- | --- | --- | --- | --- | --- | --- |
| `opencode-ai`（V1） | 34 | 35 | 16 | 19 | 15 | 9 |
| `@opencode/cli`（V2） | 0 | 0 | 0 | 0 | 0 | 22 |
| `@anthropic-ai/claude-code` | 29 | 27 | 30 | 23 | 29 | 27 |
| `@openai/codex` | 8 | 7 | 11 | 11 | 8 | 19 |

- 发版与提交数量上，OpenCode 不比 Codex、Claude Code 慢；它的作者数约为 Codex 的三分之一，`v2` 独有的 3,321 个非机器人提交中前 10 名作者占 95.7%（49 个作者名）。
- 可能造成“慢”感受的原因（数据支持，因果属推测）：V1 用户在 6–9 月看到的新版本明显变少；V2 新包需要主动安装；重写带来回归与缺功能；没有路线图和 V2 发布说明；GitHub 页面显示 4.6k open issues、1.6k open PRs，`2.0` 标签 363 open / 430 closed（WEB）。
- 如果“慢”指 Agent 执行速度：本次未测，以下是假设。
  - 模型与服务商影响最大：Codex、Claude Code 针对各自模型调优；OpenCode 面向多家服务商，缓存与提示调优因服务商而异。
  - V1 编辑后会等 LSP 诊断：`packages/opencode/src/tool/edit.ts:197-198` 调 `touchFile` 与 `diagnostics()`；`lsp/client.ts:13-16` 文档等待上限 5,000 ms、全量 10,000 ms、请求 3,000 ms、去抖 150 ms。实际耗时取决于语言服务，未测。V2 不跑 LSP。
  - V2 有大内存问题报告：#51761（v2.0.18，约 60 秒涨到 24–28 GB），#51620（~30 GB）。WEB
  - 测量方法：同一模型、同一仓库与任务，分别用 `opencode run`、`codex exec`、`claude -p`，每个 ≥5 次，记录总时长、首 token 时间、模型轮数、token 数，报中位数与 p90，并注明网络和服务商。

## 7. 对 oco 的影响（只列事实与待决事项）

- oco 当前钉在 `anomalyco/opencode` `v1.18.33`（`docs/evidence/upstream.md`），补丁针对 V1 的 `packages/app`，依赖 `@opencode-ai/sdk/v2` 与 `@opencode-ai/client` tarball。V2 改了服务端 API、客户端包名（`@opencode/client`）、插件 API，并重写前端包。
- V1 仍在维护（`v1.18.34`，2026-09-30），仓库文档中未找到 V1 停止维护日期。
- 官方 VS Code 扩展在 V2 仍是终端启动器，暂未与 oco 的嵌入式聊天界面重叠。
- 待用户决定：是否单独立项评估 V2 迁移（API 差异、补丁可移植性、Remote）。本批未改 NEXT。

## 8. 方法（可复现）

```bash
GIT_LFS_SKIP_SMUDGE=1 git clone --filter=tree:0 https://github.com/anomalyco/opencode
git worktree add --detach ../opencode-v2 origin/v2
git merge-base origin/v2 origin/dev
git log origin/dev..origin/v2 --format='%cs|%an|%s'          # V2 独有提交
git log origin/dev origin/v2 --since=2026-07-01 --until=2026-10-01 --format='%cs|%an'
git for-each-ref refs/tags --format='%(creatordate:short) %(refname:short)'
git for-each-ref refs/remotes/origin --sort=-committerdate   # 活跃分支
curl -s https://registry.npmjs.org/-/package/opencode-ai/dist-tags
curl -s https://registry.npmjs.org/@opencode%2Fcli           # time 字段按月计数
```

- 机器人：排除 `opencode-agent[bot]` 与作者名 `opencode`；Codex 排除名字含 `bot` 的作者。
- 局限：提交数受合并策略、AI 辅助提交、机器人比例影响；GitHub 页面数值来自二次摘要；X、opencode.ai 无法访问，Dax Raad 推文和 V2 在线文档只用仓库内源文件或搜索摘要。

## 9. 委派记录

| task_id | 唯一写入范围 | requested_route | actual_provider/model | agent_id/run_id | 状态 | 结果与 fallback_reason |
| --- | --- | --- | --- | --- | --- | --- |
| upstream-v2-survey | 本文件；STATUS/PROGRESS 本批条目 | grok-worker（Grok）；gemini-worker（Gemini，网络调研） | unknown/unknown（主线程接手；按会话规则不在仓库写入模型标识） | 当前主线程 | 已返回 | 本会话可用代理类型中没有 grok-worker、gemini-worker，也没有 grok-build:grok-delegate 技能；容器内 `command -v grok grok-build gemini` 均不存在（<10 秒）。两路均不可用，主线程接手；未使用其他模型子代理。checkpoint：本文件一次写入 |

## 10. 来源

- 仓库：<https://github.com/anomalyco/opencode>（`dev`、`v2` 及上述分支，SOURCE）；<https://github.com/openai/codex>
- 发布：<https://github.com/anomalyco/opencode/releases/tag/v2.0.0>；npm：<https://registry.npmjs.org/opencode-ai>、<https://registry.npmjs.org/@opencode%2Fcli>、<https://registry.npmjs.org/@anthropic-ai%2Fclaude-code>、<https://registry.npmjs.org/@openai%2Fcodex>
- Issues：[#19206](https://github.com/anomalyco/opencode/issues/19206)、[#52184](https://github.com/anomalyco/opencode/issues/52184)、[#51761](https://github.com/anomalyco/opencode/issues/51761)、[`2.0` open](https://github.com/anomalyco/opencode/issues?q=is%3Aissue%20is%3Aopen%20label%3A2.0)、[`2.0` closed](https://github.com/anomalyco/opencode/issues?q=is%3Aissue%20is%3Aclosed%20label%3A2.0)
- SNIPPET（未能打开原文）：Dax Raad 推文 <https://x.com/thdxr/status/2076690783810224568>、<https://x.com/thdxr/status/2087945880863191162>、<https://x.com/thdxr/status/2102882938815992183>；第三方报道 <https://www.kucoin.com/news/flash/opencode-2-0-major-rewrite-api-overhaul-node-migration-and-electron-desktop-shift>、<https://ccleaks.com/news/opencode-2-0-sep-2026>、<https://falcao.org/posts/opencode-v2-no-longer-plan-b/>
