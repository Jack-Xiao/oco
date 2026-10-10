# cleanup-2026-10-10 regen-patch

改动文件：新增 `scripts/regen-patch.sh`（可执行）。未改 `patches/opencode/`，未改 `vendor/opencode` 工作树。临时文件只在 scratchpad/regen。

自测：`bash -n scripts/regen-patch.sh` 通过。T1 = HEAD + 顺序 `git apply` 0001–0020。`bash scripts/regen-patch.sh 0020 --source T1 --check --out <scratch>/0020.patch` 成功（内部再放 0001–新 0020，`packages/app` `diff -r` 为空，`git diff --check` 无告警，无 `/Users/`）。T2 = 0001–0019 + 新 0020；`git apply --check` 通过；T1/T2 `packages/app`（排除 node_modules、dist、.turbo）差异行数 **0**（exit 0）。

新旧 0020 都是 **56 files, +19882 -8**，字节相同（962773）。`patches/opencode/*.patch` checksum 前后相同。

status porcelain：脚本前 **84**，脚本返回后 **84**，临时 worktree 删除后 **84**，两份列表 `cmp` 相同。HEAD 始终 `51ef4be1d3c122f18fefb510dca8d778571f4f18`。`git worktree list` 只剩 `vendor/opencode`。

未解决项：无。约 30 秒后另一代理将 `packages/app/src/context/global-sync/session-cache.ts` 标为已改，计数变成 85；不在本次前后窗口内。provider/model：unknown。

## 命令与结果

- `bash -n scripts/regen-patch.sh` → OK
- 伪 source：`git -C vendor/opencode worktree add --detach <scratch>/T1 HEAD`，再 `git apply --check` + `git apply` 全部 20 个补丁
- regen 标准输出：`0020: 56 files, +19882 -8`；写入 scratch `0020.patch`；未写 `patches/opencode/`
- regen 标准错误：`files=56 priors=19`；baseline 临时提交 `ed0e449`（随 worktree 删除）
- 脚本返回后 worktree 仅主树 + T1（base/verify 已 `worktree remove --force` 并 prune）
- T2 同样从 HEAD 建树，应用 0001–0019 后 `git apply --check` 新 0020，再 apply
- `diff -r -x node_modules -x dist -x .turbo T1/packages/app T2/packages/app` → rc 0，0 行
- `git apply --numstat`：旧 `0020-oco-runtime-view.patch` 与新补丁均为 56 / +19882 / -8；`cmp` 字节相同
- 清理 T1、T2 后 worktree list 与测试前相同；status 84=84
- 跟踪树约 132058272 字节；四次 detached checkout 各 6638 个文件

## 自测日志（里程碑；checkout 百分比进度已省略）

```text
10:15:42 bash -n
10:15:42 head_before=51ef4be1d3c122f18fefb510dca8d778571f4f18
10:15:42 status_before=84
10:15:42 tracked_bytes=132058272
10:15:42 worktree add T1
Preparing worktree (detached HEAD 51ef4be) — 6638 files
10:15:44 apply 0001-0020 onto T1
10:15:44 applied 0001 … 0020（20 个补丁均 apply --check 后 apply，每个 <1s）
10:15:45 run regen-patch.sh --check
regen-patch: 0020 files=56 priors=19 source=…/scratchpad/regen/T1
Preparing worktree (detached HEAD 51ef4be)  # base
regen-patch: baseline ed0e449
Preparing worktree (detached HEAD 51ef4be)  # verify
0020: 56 files, +19882 -8
wrote …/scratchpad/regen/0020.patch
10:15:51 regen exit=0
worktrees after regen:
  vendor/opencode  51ef4be (detached HEAD)
  …/scratchpad/regen/T1  51ef4be (detached HEAD)
10:15:51 worktree add T2 — 6638 files
10:15:52–10:15:53 T2 applied 0001 … 0019
10:15:53 git apply --check new 0020
10:15:53 apply_check_exit=0
10:15:53 t1_t2_rc=0 lines=0
10:15:53 old_0020=56 files, +19882 -8
10:15:53 new_0020=56 files, +19882 -8
10:15:53 patches_unchanged=yes
10:15:53 self-test body ok
10:15:53 cleanup: remove T1, T2; worktree prune
10:15:54 cleanup done rc=0
status_before=84 status_pre_script=84 status_post_script=84 status_after=84
status_before_after_same=yes status_around_script_same=yes worktree_same=yes
head_after=51ef4be1d3c122f18fefb510dca8d778571f4f18
worktree_after: /Users/xiaojiang/Ai-Project/oco/vendor/opencode 51ef4be (detached HEAD)
```

10:16:28 复查时 porcelain 为 85，相对 10:15:54 的快照只多一行：`M packages/app/src/context/global-sync/session-cache.ts`。
