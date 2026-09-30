# C2 Diff 运行时证据

日期：2026-09-30（Asia/Shanghai）。oco 基线 `d1a3607`，本轮未提交；上游 `51ef4be`（调查版本 v1.18.33），Bun 1.3.10。主线程执行；两个订阅代理未返回产物，见 [委派检查点](c2-runtime-delegation.md)。

## 证据范围

**真实 Snapshot / SessionSummary.computeDiff 模块集成测试 PASS；HTTP / 模型会话 E2E NOT RUN。**
使用上游 Effect 测试夹具与真实 Git 快照。用户消息/助手消息的 step 边界由测试构造；没有执行模型、edit 工具、SessionSummary.summarize 持久化或 `/session/:id/diff` HTTP 请求。因此不能宣称完成真实服务端轮次验收，也未验证工具补丁元数据。

测试使用临时 Git 项目及上游 preload 隔离的 XDG/config/home/内存数据库；不启动服务、不调用模型、不修改用户现有 OpenCode 配置或进程。runner 在上游 test 下建立唯一临时测试目录，finally 清除；夹具清理临时项目和数据目录。没有新增依赖或修改上游产品代码。

## 重现

在项目根目录运行：

```sh
node tests/integration/c2-diff-runtime.mjs
```

需要已有 vendor/opencode 及其依赖。该命令单独运行，不属于 `verify:brief`；后者不能冒充本项结果。脚本将仓库中的测试临时复制进上游测试布局，以复用相对导入、bunfig preload 和 Effect 夹具。

## 本轮结果

| 用例 | 结果 | 实际含义 |
| --- | --- | --- |
| 同轮多次编辑 + 轮内外部写入 | PASS | 真实 computeDiff 取首个 start、末个 finish；中间内容消失，外部文件也被包含 |
| 跨轮同文件 + 轮间外部写入 | PASS | 每轮各自净变化；外部内容成为第二轮删除侧，不把 first→outside 当作第二轮修改 |
| 新建、删除、轮内新建再删除 | PASS | added/deleted 正确；临时文件最终不出现 |
| snapshot false | PASS | track 返回 undefined |
| 非 Git 项目 | PASS | track 返回 undefined |
| 新增未跟踪文本 > 2 MiB | PASS | 大文件整条缺失，小文件仍存在；空/不完整 Diff 不代表没有修改 |
| 二进制变化 | PASS | patch 空、计数 0、status modified；结果没有 binary 字段 |
| 缺失任一步边界 | PASS | computeDiff 返回 [] |

结果：8 PASS / 0 FAIL，31 次断言，exit 0。另定向运行上游原有 diffFull 新增/修改/删除/无变化/二进制 5 项：5 PASS / 0 FAIL，30 次断言。未运行整个 oco 单元、构建或历史 UI E2E（本轮无产品代码修改）。

## 未验证与下一步

- 快照 blob 读取失败/缺失：NOT RUN，仍是源码风险；双端 tree 哈希只能证明边界引用存在，不能证明内容完整。
- HTTP session diff、真实或确定性模型驱动的完整轮次、summary 持久化、edit/apply_patch 元数据：NOT RUN。
- 当前不能把“可信全文前后对照”标为已获准实施。下一步应补隔离服务的 HTTP/持久化契约测试及 blob 缺失负测，再收敛完整性校验或明确降级；不用 Git 工作区 Diff 冒充会话 Diff，不实现回滚。

## 原始短日志

新增集成测试：

```text
bun test v1.3.10 (30e609e0)

test/oco-c2-CcwKgK/runtime.test.ts:
(pass) C2 repeated edits and external edit within a turn form net workspace diff [1349.11ms]
(pass) C2 between-turn external edit becomes next baseline, not either turn change [1126.79ms]
(pass) C2 create delete and transient file statuses [955.03ms]
(pass) C2 snapshot false produces no tree [265.57ms]
(pass) C2 non-git project produces no tree [9.93ms]
(pass) C2 oversized untracked file is omitted while small file is present [708.28ms]
(pass) C2 binary diff has empty patch and no binary field [777.68ms]
(pass) C2 missing either step boundary returns empty diff [604.61ms]

 8 pass
 0 fail
 31 expect() calls
Ran 8 tests across 1 file. [8.19s]
```

上游环境探测（命令在 vendor/opencode/packages/opencode 运行）：

```sh
bun test test/snapshot/snapshot.test.ts --test-name-pattern 'diffFull with (new file additions|file modifications|file deletions|no changes|binary file changes)$'
```

```text
bun test v1.3.10 (30e609e0)

test/snapshot/snapshot.test.ts:
(pass) diffFull with new file additions [1406.75ms]
(pass) diffFull with file modifications [831.62ms]
(pass) diffFull with file deletions [804.75ms]
(pass) diffFull with no changes [753.23ms]
(pass) diffFull with binary file changes [858.46ms]

 5 pass
 51 filtered out
 0 fail
 30 expect() calls
Ran 5 tests across 1 file. [6.97s]
```

## 测试脚本 SHA-256

- `tests/integration/c2-diff-runtime.test.ts`: `d2a49f44e180ca4331335d131c08cedf89b81140b7107d5799f9a1d792be4772`
- `tests/integration/c2-diff-runtime.mjs`: `2d55597a82cdb07ef4a08486662118422efde8d554623521164f41642beb1f69`
