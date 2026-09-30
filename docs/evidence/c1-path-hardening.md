# C1 路径加固 + 点击补点

日期：2026-09-30。model/provider：unknown（本轮工具返回未带模型标识）。不含凭据。

本文件分两部分：

- **整批验收**（下一节）：本批全部改动（路径策略 + 补丁 0006 点击补点 + E2E 用例）的最终检查，含 E2E 运行目录。
- **子任务记录**（“路径策略子任务”一节起）：路径策略子任务当时的范围、设计与离线检查，保留原样；其中“未跑 E2E”“不在本任务范围”“未提交”只描述那个子任务，不是整批结论。

## 整批验收

范围：`apps/extension/src/{open-file-policy.ts,panels.ts}`、`packages/contracts/src/bridge.ts`（仅注释）、`patches/opencode/0006-oco-open-file-diff-summary-markdown.patch`、`tests/{unit/open-file-policy.test.ts,e2e/c1-open-file.mjs}`、docs。开发于工作树 `claude/path-validation-click-enhancement-5fa385`（基线 `a0ebb1f`），原样复制到 `claude/c1-finalize-c2-source-9d5520` 提交（逐文件 `cmp` 一致）。

| 检查 | 结果 |
| --- | --- |
| typecheck | PASS（提交分支复跑，exit 0） |
| unit | 128 pass / 0 fail，10 个文件（提交分支复跑） |
| 上游 tsgo（app、session-ui） | 0 错误（PROGRESS 记录，本次未复跑） |
| 补丁 0001–0006 重放 | 一致（PROGRESS 记录，本次未复跑） |
| E2E `c1-open-file` | **6/6 PASS，exit 0**，运行目录 [`runs/20260930-071232-c1-open-file-969b`](runs/20260930-071232-c1-open-file-969b/results.json)（已入库） |

最终 E2E 运行信息：oco `a0ebb1f` + 未提交改动（`ocoDirty: true`，改动与本批提交内容逐文件一致）；上游 `51ef4be`（v1.18.33，已打补丁 0001–0006）；脚本 sha256 `7157921b…2869`（与提交的 `tests/e2e/c1-open-file.mjs` 一致）；VS Code 1.139.1；node v26.7.0；darwin 27.2.0 arm64。用例：open-file-line、open-file-refused、tool-click-opens、position-parse、markdown-path、diff-summary。

运行历史（前两次未入库，只在原工作树本地）：

- `20260930-060359-c1-open-file-2419`：exit 1，4/6。position-parse 页面已关闭、diff-summary 未找到文件名，均为测试脚本问题，改测试后重跑。
- `20260930-060839-c1-open-file-cab5`：6/6 exit 0，但运行时间 14:08–14:09（+0800），扩展包构建于 14:03，`open-file-policy.ts` 最后一次修改在 14:10，**这次运行没有覆盖最终策略代码**，不作为验收。
- `20260930-071232-c1-open-file-969b`：15:12（+0800）重新 `build:extension` 后复跑，6/6 exit 0，作为本批验收。

限制：其余 9 个 E2E 套件本批未重跑（未改相关代码）；大小写敏感真实卷、Remote-SSH、Windows NOT RUN；新点击入口无变异负向对照；E2E 依赖真实测试模型，模型名未记录在 results.json 中（unknown）。

## 路径策略子任务（原记录）


### 改动文件

- `apps/extension/src/open-file-policy.ts`：策略与 `probeCaseInsensitive`
- `apps/extension/src/panels.ts`：只动 `openFile` 里构造 `decideOpenFile` env 的那几行（以及因此需要的 import）
- `tests/unit/open-file-policy.test.ts`：新 env 默认值与新增用例；原有用例保留
- 本文件

工作区里其他已修改文件（`docs/evidence/c1-editor.md`、`packages/contracts/src/bridge.ts`、`tests/e2e/c1-open-file.mjs`、`patches/opencode/0006-oco-open-file-diff-summary-markdown.patch`）不是本任务范围，未改、未还原。

### 设计

只有同时满足下面三条，才把服务报告的路径当成这台机器上的文件；少一条就拒绝，不猜测：

1. 端点主机是回环地址（`serverLocal`）。`panels.ts` 在已有的 `endpoint()` try 里一并取 `connectionId` 与 `host`，用 `isLoopbackHost` 填写。`endpoint()` 抛错时 `serverLocal` 保持 `false`（此时连接 id 对不上，会先以「连接已变化」拒绝）。`decideOpenFile` 在 `serverLocal === false` 时直接拒绝，原因「服务不在本机，无法确认路径对应本地文件」。
2. 会话目录的 realpath 存在，且落在某个本地工作区根的 realpath 之内。
3. 请求路径相对该目录解析后，realpath 仍在会话目录内，且是普通文件。

残留风险（写在源文件顶部注释）：回环端口若被转发到远端服务（例如 SSH 隧道），且远端恰好有同名目录，宿主无法把它和本机服务分开。

大小写不再看 `process.platform`。`OpenFileEnv.caseInsensitive(dir)` 由宿主对会话目录 realpath 实测。纯函数 `probeCaseInsensitive(dir, lstat)`：从深到浅找一段含字母的路径分量，把字母大小写翻转后再 `lstat`；与原路径 `dev+ino` 相同则不敏感；没有字母、对不上、或出错，一律 `false`（按敏感处理）。`decideOpenFile` 对探针抛错同样按敏感。

realpath 之后的包含关系（工作区根 vs `dirReal`，以及 `dirReal` vs 文件 realpath）先做大小写敏感比较；敏感比较失败时，仅当实测不敏感才再做一次不敏感比较。解析前的词法越界检查用同一规则，因此敏感卷上 `../Src/a.ts` 这种只差大小写的兄弟目录会被拒绝。敏感比较成功则不再依赖折叠，避免只走折叠比较时把本可敏感命中的路径判丢。

行号：先按字面路径走完全部校验。字面 realpath 为 null、且请求没有自带 `line`、且 `splitPosition` 得到了不同的 path 和 line 时，用拆出的 path/line/column 再校验一次（不连拆）。字面文件存在（例如真叫 `weird:3`）优先字面，不带行号。格式仍是 `p:line`、`p:line:col`、`p#Lline`、`p#LlineCcol`。Windows 盘符 `C:` 不被 `splitPosition` 拆开（单字母前缀排除保留）。`SCHEME` 增加负向前瞻，使 `name.ts:12` 这种「方案名 + 纯数字」不被当成 URI，否则 `missing.ts:3` / `weird:3` 会在字面检查之前被拒绝；`file:` / `vscode:` 后不是纯行号的仍拒绝。词法上已经越界的路径（`../x.ts:3`、`../etc/hosts`）在 realpath 之前拒绝，因此不会为了拆行号去碰 `/etc`。

### 命令与结果

工作目录：本 worktree。2026-09-30 复跑。

```
=== bun run typecheck ===
$ tsc -p packages/contracts && tsc -p apps/extension --noEmit
typecheck_exit:0
=== bun test tests/unit ===
bun test v1.3.10 (30e609e0)

tests/unit/e2e-results.test.ts:
[PASS] id-PASS: {"ok":true}
[FAIL] id-FAIL: {"ok":true}
[NOT RUN] id-NOT RUN: {"ok":true}
[BLOCKED] id-BLOCKED: {"ok":true}
[N/A] id-N/A: {"ok":true}
[BLOCKED] step1: {"reason":"waiting server"}
[PASS] step1: {"duration":150,"history":[{"status":"BLOCKED","detail":{"reason":"waiting server"},"at":"2026-09-30T06:11:12.259Z"}]}
[FAIL] step1: {"error":"unexpected timeout","history":[{"status":"BLOCKED","detail":{"reason":"waiting server"},"at":"2026-09-30T06:11:12.259Z"},{"status":"PASS","detail":{"duration":150},"at":"2026-09-30T06:11:12.259Z"}]}
[PASS] req-step: {"duration":100}
[PASS] opt-step: {"duration":50}
[PASS] req1: {}
[FAIL] req2: {}

tests/unit/brief.test.ts:
=== OCO Verification Brief (Offline) ===
Git HEAD: unknown (dirty: unknown)
Mode: offline checks (typecheck, unit)

[FAIL] typecheck (exit: 2, 0.00s)
       Tip: Run 'bun run typecheck' directly to inspect full failure logs.
[PASS] unit (exit: 0, 0.00s)

=== Verification Summary ===
typecheck    : FAIL   (exit:  2, 0.00s)
unit         : PASS   (exit:  0, 0.00s)
E2E          : NOT RUN (historical acceptance only; see bun run brief)
Overall      : FAIL (exit code: 1)
=== OCO Verification Brief (Offline) ===
Git HEAD: new2222 (dirty: true)
Mode: offline checks (typecheck, unit)

[PASS] typecheck (exit: 0, 0.00s) - pass
[PASS] unit (exit: 0, 0.00s) - pass

=== Verification Summary ===
typecheck    : PASS   (exit:  0, 0.00s) (pass)
unit         : PASS   (exit:  0, 0.00s) (pass)
E2E          : NOT RUN (historical acceptance only; see bun run brief)
Overall      : PASS (exit code: 0)
=== OCO Acceptance Brief ===
Git HEAD: sha9 (dirty: false)
Report: .oco-reports/latest.json (.md)

--- Latest E2E Acceptance by Suite ---
Suite           RunId                            Rev      Dirty    PASS FAIL NOT_RUN BLOCKED
(No acceptance runs found)

Version Status: NO_EVIDENCE - No acceptance suites recorded.

--- Special Runs (Excluded from Acceptance) ---
None

--- Evidence Integrity ---
Corrupted: 1 | Empty: 0 | Missing: 6 (p1a-chat, p1a-identity, p1b-sidebar, p1b-narrow, p1b-theme-load, p1b-ime)

 128 pass
 0 fail
 1858 expect() calls
Ran 128 tests across 10 files. [1087.00ms]
unit_exit:0
```

上面 `e2e-results` / `brief` 里的 `[FAIL]` 是夹具打印的验收文本，不是 bun 失败项。汇总：typecheck exit 0；unit **128 pass / 0 fail**，1858 次 expect，10 个文件，exit 0。

### 未解决

- 无功能缺口。SSH 隧道把回环端口转到远端且目录同名时无法区分，这是已知残留，不是漏做。
- 子任务未跑 e2e（其验收只要求 typecheck 与 `bun test tests/unit`）。整批 E2E 见上文。
- 未提交（子任务当时）。整批已提交，见上文“整批验收”。
