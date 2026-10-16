# 卡 12 书签「同一书签再次点击不滚动」修复 E2E 验证

结论：PASS。c32-bookmarks 连跑 2 次，两次都是 8/8 PASS、exitCode 0，附加探测 open-same-session-repeat 两次均 PASS。没有改任何源码或测试文件。

## 运行

- 命令：`bash scripts/overnight-e2e.sh c32-bookmarks --loop 2 --lock-wait 900`（mock 模型；脚本自启并自停隔离服务器 4517，没有遇到另一模式的服务器，无需改端口）。
- 环境：提交 4f114ec（工作区含卡 12 修复的未提交改动，ocoDirty=true）；VS Code 1.141.0；OpenCode 服务器 1.18.33（测试实例）；模型 oco-mock/mock。
- summary：docs/evidence/runs/overnight-20261016-144212/summary.md（14:42:12 起，14:44:42 止）。

| 迭代 | runId | exitCode | PASS/FAIL/NOT RUN/BLOCKED/N-A | 耗时 |
| --- | --- | --- | --- | --- |
| 1 | 20261016-064243-c32-bookmarks-f249 | 0 | 8/0/0/0/0 | 套件 61s（脚本计 90s） |
| 2 | 20261016-064344-c32-bookmarks-8424 | 0 | 8/0/0/0/0 | 套件 58s |

每次的 results.json：docs/evidence/runs/<runId>/results.json。

## 用例（两次相同）

PASS：button-visible、add-user、add-assistant、open-same-session、open-same-session-repeat、open-other-session、remove、remove-persist。

- open-same-session-repeat：PASS 记录只有 backToTurn2=true、sameItemAgainAfterManualScroll=true。hash / turn2 位置 / scroller 这三个诊断字段只在 FAIL 分支写入（tests/e2e/c32-bookmarks.mjs 第 361 行），所以 PASS 记录里没有这三个值，也就没有可报告的数字。判据：连续跳转后再回到 turn 2（p2b），手动滚到底后再点同一书签（p2c），turn 2 的顶部位置都要落回 [-8, 200]。滚到底后 turn 2 不在视口内，所以 p2c 通过只能是这次点击真的滚动了。
- open-same-session（同次运行的位置数据，两次完全一致）：turn 2 点击前 top=-2210，点击后 top=64；turn 4 点击前 top=1190，点击后 top=0；点击前滚动条 fromBottom=0。
- 本轮未测：real 模型。

## 有效性核对

- E2E 通过 `--extensionDevelopmentPath=<worktree>/apps/extension` 加载扩展（tests/e2e/vscode.mjs:88）；apps/extension/media/chat/assets/app-D7HWxmkF.js 含 `oco:scroll-to-message`（2 处），测的是修复后的构建。
- 结束后 4517 无监听，/tmp/oco-e2e.lock 已释放；未触碰用户自己的 OpenCode 服务，未终止任何进程。

## 改动与未决

- 改过的文件：无源码、无测试改动。只写了 docs/evidence/runs/（脚本产物）和本文件。
- 未解决项：无。可选改进（未做，因为不是测试侧问题）：把 repeatDiag 也写进 PASS 记录，以后有数字可对照。

## 委派记录

task_id=card12-repeat-fix-e2e；唯一写入范围=docs/evidence/runs/**、本文件；requested_route=claude-subagent/sonnet；actual_provider/model=claude/sonnet-5-5；agent_id=unknown；状态=已返回（验收条件满足，待主线程确认）；工具轮数 8；耗时约 14:42 至 14:47:07；主线程发现的缺陷数=待主线程填写；fallback_reason：不适用（E2E 类别直接划归 Claude 子代理）。
