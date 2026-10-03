# Claude 委派路由审查（2026-10-01）

只读调查，未改配置、规则或 git。本文件是唯一写入。

修订：撤回「hook 排除 `grok-build:grok-delegate` / `gemini_subscription_worker` 与规则冲突」。排除只表示这条 CLI relay 不再包一层。系统提示里的模型自称不作为身份证据，已从下文删除。

执行身份分两条，不合并：外部工具响应 header 确认 **Handled by Grok Build**（处理方标注，不是 model，也不填 provider）。model 另记 **unknown**（header 与工具返回都没有 model 字段）。本修订未重跑健康检查：`grok-bridge check --json` ready=true，CLI grok 1.0.34，loggedIn=true，4.27s。桥脚本目录是插件 `grok-build/0.2.1`，不是 CLI 版本。

## 结论

Agent|Task（Claude）和 spawn_agent（Codex）hook **只在主模型已经决定调用该工具之后**改写参数，不会自己发起委派。主模型自己做完任务时，路由不发生。

`grok-bridge check` **不测推理**。它检查 node、`grok` 二进制，再跑 `grok models` 登录探测。Hook 也不调用这次检查。

Fallback **不只是 quota**。只读任务会在启动前把 Gemini 改成 Grok。进程起不来也会换另一家。非 quota 的运行失败不换。

Claude 的薄封装仍消耗 **Anthropic** 编排 token（主线程 Opus + worker `haiku`）。Codex 在父模型为 `gpt-*` 时，薄封装的编排模型是 **gpt-5.6-luna**。这是编排成本，不是禁令违反。现行 `AGENTS.md` 只禁止静默启用付费 API 或改走 OpenAI（49 行），**不禁止**这条已存在的轻量 relay。Runner 源码没有 OpenAI/付费 API fallback。

Hook 排除 `grok-build:grok-delegate`（Claude）和 `gemini_subscription_worker`（Codex）**与规则不冲突**。二者已有独立外部执行路线；排除只表示不要用本 hook 的 CLI relay 再包一层。它们不再列入失效点。建议规则分开写：**谁执行任务正文**，以及 **编排成本由谁承担**。

oco 没有项目或父级 `CLAUDE.md`。本机 Claude Code **2.1.283**（≥2.1.277）。按官方默认，应自动加载 `oco/AGENTS.md`，并同时加载 `~/.claude/CLAUDE.md`。未在会话里跑 `/memory` 核对。

## 规则从哪里来

| 位置 | 事实 |
| --- | --- |
| `oco/AGENTS.md` | 存在。与 `Agents.md` 同一 inode `231013638`（大小写不敏感卷）。委派表在 28–67 行。git `8700394`（2026-10-01）恢复该表。 |
| `oco/CLAUDE.md`、`oco/.claude/CLAUDE.md`、`oco/CLAUDE.local.md`、`Ai-Project/CLAUDE.md`、其上一级 | 都不存在。 |
| `~/.claude/CLAUDE.md` | 全文 24 行，标题「Token 与委派规则（所有项目）」。不含 oco 路由表，也不点名 worker。条款摘要见下节。官方：用户级此文件 **不算**「已有 CLAUDE.md」，不阻止加载项目 `AGENTS.md`。 |
| `~/.claude/settings.json` | 无 `projectInstructions` 键。`model` 为 `"opus"`（第 8 行）。 |

官方（code.claude.com/docs/en/memory，页面标注 2026-09-30）：默认 `claude-md-or-agents-md`。工作目录及祖先都没有 `CLAUDE.md` / `.claude/CLAUDE.md` / `CLAUDE.local.md` 时读 `AGENTS.md`。有其中任一则只读 CLAUDE 族，除非该文件 `@AGENTS.md` 导入，或设置改成 `claude-md-and-agents-md`。v2.1.277 起。本机 `claude --version` → `2.1.283`。

### `~/.claude/CLAUDE.md` 委派条款

全文就是这 24 行，没有路由名表：

- 主线程少读：先定位再读片段（通常 ≤80 行）；约 200 行以上交给子代理，只回 ≤15 行，全文写证据文件。命令输出先过滤；已读未改的文件不重读。
- 委派前 ≤10 秒健康检查：Grok 用 `grok-build:check` 或一次最小请求；agy 用一次最小请求。失败立即换另一条订阅；两条都失败则主线程自己做并写明原因。不空等、不反复重试。同一 session 失败过的路由，下次先重查。
- 不因路由故障改全局配置，**不静默改走付费 API**。没有「或改走 OpenAI」，也没有禁止已有轻量 relay。
- 提示词写明目标、唯一写入范围、要读的文件、验收、报告 ≤15 行。只读调查默认最多 20 轮。子代理用新上下文，不附带全史。
- 一批已提交且上下文超过约 20 万 token 时，下一批建议新会话，只凭状态/队列文档交接。长测试放后台，集成后再跑一次全量回归。

与现行项目 `AGENTS.md` 的差别：用户级文件不点名 `grok-worker`、`grok-build:grok-delegate`、`gemini_subscription_worker`；禁令比项目少半句（项目 49 行还有「或改走 OpenAI」）。两边都不禁止轻量 relay 编排。

### b2f6514 的委派是否比现行宽松

`b2f6514`（2026-09-30，`AGENTS.md`「委派」约 28–38 行）**流程上更宽松，有一条更严**。

更宽：无 ≤10 秒健康检查；无「其余工作默认委派、不因自己做更快而跳过」；无 Claude/Codex 路由表。`gemini_subscription_worker` 不可用时，说明原因后可用 `gemini_worker`，或已授权的 Grok 订阅代理。

更严：写明不要把 `sonnet`、`haiku`、`general-purpose` 当成可用路由。现行是两条订阅都不可用时，允许主线程自己做或用 `general-purpose`（路由表「其他」列）。

禁令同一口径：b2f6514 第 36 行与现行第 49 行都只禁止静默启用付费 API 或改走 OpenAI。b2f6514 第 34 行已有「用了 worker 不代表避开 OpenAI」，同样没有禁止轻量 relay，也没有把主体执行和编排成本分开。

Codex 会把 AGENTS.md 注入用户消息。`codex-route.mjs` 32–33 行用 `INJECTED` 把 `# AGENTS.md instructions` 从转给子代理的上下文里剥掉。`~/.codex/config.toml` 第 2 行 developer_instructions 指向 AGENTS.md；第 6 行 `model = "gpt-6-astra"`。未读 `~/.codex/AGENTS.md`（超出点名范围），未读 config 里的密钥字段。

## Hook 何时触发

Claude，`~/.claude/settings.json` 9–20 行：`PreToolUse`，matcher `Agent|Task`，命令 `route-subagents.mjs`，timeout **10**。

`route-subagents.mjs`：

- 2–9 行：注释写明是 Agent 工具的 PreToolUse；主对话在 Opus 上时才把子代理交给 relay。
- 88 行：`tool_name` 不是 Agent 也不是 Task 则直接返回，不改参数。
- 89 行：已有 `agent_id`（子代理里再调 Agent）不路由。
- 94 行：prompt 已带 `GROK_ROUTED_TASK` 不重复路由。
- 96–107 行：直接点名 `grok-worker` / `gemini-worker` 时 **不论主模型**都路由。其他类型还要：未关闭路由、类型不在排除集、`isolation !== "remote"`、工具参数里的 `model` 为空或就是 `opus`、主模型匹配 `/opus/i`。
- 118–126 行：成功时 `hookSpecificOutput.updatedInput` 把 `subagent_type` 改成对应 worker，prompt 换成 `MARKER` + 一条 `node grok-subagent.mjs start ...`，并 **delete model**。

因此：主模型必须先发出 Agent/Task。Hook 不能把「主模型自己做」改成委派。Hook 提前返回且不写 stdout 时，原调用保持不变。timeout 10 秒若被宿主杀掉，本调查没有实测宿主是放行原调用还是拦截。

主模型判断（37–78 行）：读 transcript 末尾最多 16MB，找最后一条非 sidechain、非 `<synthetic>` 的 assistant `message.model`。没有则用 `ANTHROPIC_MODEL`，再否则 `settings.json` 的 `model`（当前 `opus`）。新会话还没有模型行时，会因配置是 opus 而仍然路由。

排除类型 `KEEP_ON_CLAUDE`（24–32 行）：`grok-build:grok-delegate`、`claude`、`codex:codex-rescue`、`claude-code-guide`、`statusline-setup`、`fork`、`dashboard-builder`。

这**不是**与 `AGENTS.md` 44 行的冲突。较大编码任务点名 `grok-build:grok-delegate`，hook **故意不改写**（注释：「already Grok」），因为它已经走 Grok 插件自己的委托。排除只表示不要再用这条 CLI relay 包一层，不是把任务留在 Claude 上。

关闭开关：`route-core.mjs` 37–38 行，`GROK_ROUTE=off` 或存在 `~/.claude/hooks/grok-route/OFF`。点名 worker 时 98–99 行在检查开关 **之前**就 `forced`，关开关挡不住点名。

## 模型与角色限制

Claude worker（`~/.claude/agents/grok-worker.md`、`gemini-worker.md` 第 1–6 行）：

- `model: haiku`，`tools: Bash`。
- 指令：只跑 prompt 里那条 `node`，`STILL_RUNNING` 就跑第二行，原文回传。禁止读改文件、禁止其他命令。
- Hook 删掉调用方 `model` 后，用的是这份 frontmatter 的 haiku，不是父级 Opus。

只读角色：`route-subagents.mjs` 34 行 `READ_ONLY = Explore, Plan`。这两类 `write=false`。`general-purpose` 以及点名 worker 视为可写。其他类型把类型名写成 role 前缀（115 行），仍然可写。

内容路由 `route-core.mjs` 22–34 行，先匹配先生效：YouTube → gemini；X/Twitter → grok；latest/今天/本周等 → grok；broad research/调研 → gemini；否则 grok。点名 worker 时 `forced` 覆盖内容。

Gemini 只读被硬拦，`provider-policy.mjs` 1–9、20–22 行：`provider===gemini && !write` 改成 grok，原因是 “Gemini CLI sandbox does not enforce filesystem read-only access”。`grok-subagent.mjs` 318–325 行在启动前执行。所以 **Explore/Plan（以及 Codex 只读线程）里的 YouTube/调研到不了 Gemini**，即使内容规则选了 Gemini。

## Fallback 不是只有 quota

`grok-subagent.mjs`：

1. **Quota / 429 / rate limit / credits**（47–48、275–291 行）：`isQuotaError` 才 `fallBack`。然后该提供商 cooldown 默认 1 小时（43–44、327–337 行）。模拟开关 `GROK_ROUTE_SIMULATE_EXHAUSTED`。
2. **只读 Gemini**（318–325 行 + `provider-policy.mjs`）：启动前改 Grok，不是 quota。
3. **进程起不来**（340–343 行）：CLI 缺失、未登录等，若 `canStartFallback` 则换另一家。注释写 “not signed in, CLI missing”。
4. **其他失败不换**（293–296 行）：直接 `fail`，文案是 “Do this task yourself”。那是让 **Claude 主模型**自己做，不是 OpenAI。

`canStartFallback`（`provider-policy.mjs` 12–14 行）：已经 fallback 过，或目标是只读 Gemini，则不能再换。只读任务上 Grok 失败不会再试 Gemini。

正则可能误伤（正文里出现 “429” 或 “quota” 字样）或漏伤（错误文案不匹配则不换）。

Worker 描述写 “Falls back to Grok if Gemini is out of quota”（两边 agent md 第 3 行；`route-subagents.mjs` 124 行 systemMessage 同样只说 quota）。这比代码窄。

源码中无 OpenAI、无 API key fallback。禁止项没有被这条 runner 违反。已有轻量 relay 编排也不在禁止项里。

## 健康检查测了什么

`grok-bridge.mjs` 179–212 行 `buildCheckReport` / `handleCheck`：`ready = node 可用 && grok 可用 && loggedIn`。

`scripts/lib/grok.mjs` 72–134 行：`getGrokAuthStatus` → `runModelsProbe` → `grok models`。退出码 0 即 `loggedIn: true`，`source: "models-probe"`。这是列模型，不是 completion。未登录时 nextSteps 才建议再跑 `grok models`（bridge 188–190 行）。

`AGENTS.md` 49 行把这次检查和「一次最小请求」并列，并要求主模型在委派前做。这是提示词，不是 hook 门闩。主模型跳过检查仍可调用 Agent，hook 仍会改写。Gemini（agy）不在这次 check 里。

## 薄封装还耗不耗 Claude / OpenAI token

耗编排 token，不耗「任务正文」那一次外部推理。现行规则不禁止这笔编排成本；建议在规则里把它和「谁执行任务正文」分开写。

Claude 路径：

1. 主模型 Opus 决定调用并读回结果（Anthropic）。
2. Worker 是 haiku，每一段 `STILL_RUNNING` 轮询都是一次 haiku 调用。`SLICE_MS` 默认 100s（`grok-subagent.mjs` 42 行），长任务会多轮。
3. 回传最多 2 万字符（46、248–253 行），超出截断并留 jobs 文件。这段文本进入 haiku，再进入 Opus。
4. 任务正文在 `grok-bridge run`（138–144 行，Grok CLI）或 `agy -p ... --sandbox`（166–168 行，Antigravity CLI）。不是 OpenAI SDK。

Codex 路径（`~/.codex/hooks.json` 3–14 行）：`PreToolUse` matcher `spawn_agent$|^Agent$|grok_route__delegate$`，timeout 30，同一 `codex-route.mjs`。

- 131–147 行：父模型已经调用 spawn 之后才改写。排除 `luna_worker`、`gemini_subscription_worker`、`router_*`。调用方指定了与父模型不同的 `model` 则不改（点名 relay 除外）。
- explorer → `grok_gemini_explorer`；其他默认类型 → `grok_gemini_worker`。
- 115–124 行：父模型匹配 `/^gpt-/i` 时，relay 的 `model` 设为 **`gpt-5.6-luna`**，`reasoning_effort=low`。当前父配置是 `gpt-6-astra`，因此 **relay 本身走 GPT**。父模型是 `grok-oauth/` 时不改 model，只把 reasoning 调低。
- 149–155 行：消息为空或以 `gAAAAA` 开头视为加密，hook 不选 provider，交给 relay 的 grok_route MCP。明文则在 hook 里写 prompt 文件。
- `fork_turns` 缺省改成 `none`；`all` 改成 `"3"`（29、125–127 行）。加密路径不强制把 message 换成 node 命令。

`AGENTS.md` 45 行 Codex 列：Gemini 写 `gemini_subscription_worker`，不可用再用 `gemini_worker`。这与 hook 排除不冲突：前者是独立外部路线，后者才是 agy CLI relay。

`gemini-subscription-worker.toml` 1–4 行：`model_provider=codex-router`，`model=antigravity-subscription/gemini-3.8-flash-high`。`KEEP_ON_CODEX` 包含这个名字，**hook 不会把它改成 agy relay**。这是不重复包装，不是漏路由。`gemini_worker` / `grok_worker` 才是 CLI relay（toml 无 model 字段，模型由 hook 按父模型改）。`router-model-grok-oauth-grok-4-{5,6,7}.toml` 与 `router-model-antigravity-...toml` 同样被排除，留在 codex-router。未读 router 的密钥，不能断言它是否另有付费 API。

## 失效点（按可能性）

1. 主模型不调用 Agent/Task/spawn_agent → 全程 Claude Opus 或 Codex `gpt-6-astra`。
2. Claude 主模型不是 opus（或工具参数 `model` 不是 opus）→ 除点名 worker 外留在 Claude。
3. **撤回。** 排除集里的 `grok-build:grok-delegate` 与 `gemini_subscription_worker` 不是失效点：二者已有独立外部执行，hook 不改写只是不重复包装。没有外部路线的排除类型（如 `claude`、`statusline-setup`、`fork`）被点名时，才会留在父模型上。
4. 只读 + 内容应走 Gemini → 实际 Grok。Grok quota 时不能再回 Gemini。
5. `OFF` / `GROK_ROUTE=off` 只挡住非点名类型。
6. Claude hook 10 秒超时（大 transcript）。未实测宿主行为。
7. Quota 正则误判或漏判。
8. haiku/luna relay 不执行那条 `node` 而自己做题 → 任务跑在 Claude/GPT 上。frontmatter 禁止这样做，但是提示词不是强制门。
9. 子代理嵌套（`agent_id`）不再路由。
10. 加密 Codex 任务依赖 MCP；MCP 不可用时 toml 才允许写临时文件再调 `grok-subagent.mjs task`（`grok-worker.toml` 18 行）。那条路径仍是 CLI，不是 OpenAI。
11. 安装了项目或祖先 `CLAUDE.md` 且不导入 `@AGENTS.md` 时，2.1.283 默认 **停止**读 `AGENTS.md`。当前路径上没有这种文件。

## 建议草案（不要现在改文件）

不新增 `oco/CLAUDE.md`。空文件或只写别的内容会在默认设置下盖住 `AGENTS.md`。要钉死加载，只在确认 `/memory` 看不到 `AGENTS.md` 之后，用仅含下一行的 `CLAUDE.md`：

```markdown
@AGENTS.md
```

`AGENTS.md` 44–49 行不必改路由名，也不必把上述两个名字改成 hook 会改写的 worker。若以后补规则，只写清两件事：

- **主体执行**：任务正文在被点名的外部路线上。`grok-build:grok-delegate` 走 Grok 插件委托；`gemini_subscription_worker` 走 codex-router 的 `antigravity-subscription/gemini-3.8-flash-high`。`grok-worker` / `gemini-worker` / `grok_worker` 才进入本 hook 的 CLI relay（Grok CLI 或 agy）。Hook 排除前两个名字不等于没委派。
- **编排成本**：CLI relay 的薄封装另耗父模型与 worker token（Claude 为 haiku；Codex 父模型为 gpt-* 时为 gpt-5.6-luna）。现行只禁止静默启用付费 API 或改走 OpenAI，不禁止这条已有编排。不要把编排 token 写成「改走 OpenAI」。

健康检查维持现文，只补一句范围：`grok-build:check` 只证明 node、`grok` 二进制和 `grok models` 登录，不测生成，也不测 Gemini，hook 也不等它。检查失败再换另一条订阅或主线程自己做。不因失败改全局配置，不静默启用付费 API 或改走 OpenAI。

Worker 描述第 3 行若以后改，两份 Claude agent md 与 Codex toml 用同一句：

```markdown
Falls back to the other CLI if this one is out of quota, fails to start, or (Gemini only) the task is read-only. Other errors do not switch provider. No OpenAI fallback.
```

不建议为了「只读也走 Gemini」去改 `provider-policy.mjs`：当前拦截是沙箱不能强制只读。若要 Gemini 调研，派可写的 `gemini-worker`，并接受它可能改工作目录。
