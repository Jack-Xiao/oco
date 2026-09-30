# C2 diff sources — upstream OpenCode (read-only)

Upstream: `vendor/opencode` commit 51ef4be (v1.18.33). Read `packages/opencode/src`, `packages/schema`, `packages/sdk/js`, `packages/core` (project/config only). Ignored `packages/app` oco patches. No builds.

**Wire shape that matters:** `packages/schema/src/file-diff.ts` `Info` (identifier `SnapshotFileDiff`) is `file?`, `patch?`, `additions`, `deletions`, `status?` (`added|deleted|modified`). There is **no `before`/`after` field**. `snapshot/index.ts` aliases that as `FileDiff` (lines 20–21). SDK v2 `SnapshotFileDiff` matches (`packages/sdk/js/src/v2/gen/types.gen.ts` 152–158). SDK v1 `FileDiff` still has `before`/`after` and no `patch` (`packages/sdk/js/src/gen/types.gen.ts` 39–45) — **stale relative to the server schema**.

`diffFull` still loads blob text in memory, then throws it away and stores only a unified patch (`snapshot/index.ts` 736–752).

---

## Matrix

Columns: scope | base / head | content form | persistence | IDs | (a) same file many times | (b) external edit | (c) create / delete | (d) missing before-image

### 1. User-message summary diffs — `GET /session/:sessionID/diff`

| | |
|---|---|
| Scope | **One user turn**, not one tool call and not the whole session. `summarize` keeps the user message plus assistant messages whose `parentID` is that user id (`session/summary.ts` 119–124). |
| Base / head | First `step-start` part with `snapshot` in that set → last `step-finish` part with `snapshot` (`summary.ts` 82–99). Hashes are git **tree** ids from `Snapshot.track` (`snapshot/index.ts` 341–344), not the user's repo commits. |
| Content | `Snapshot.FileDiff[]`: unified patch built with `structuredPatch(..., { context: Number.MAX_SAFE_INTEGER })` (`snapshot/index.ts` 736–748), plus numstat additions/deletions and name-status. Full before/after strings are **not** fields. `git diff --no-renames` (`688–703`). |
| Persistence | **Computed at summarize time, then read back.** `GET` does not recompute (`server/.../handlers/session.ts` 99–103 → `summary.diff` 129–141). Stored on the **user** message `summary.diffs` via `updateMessage` (`summary.ts` 125–126). `GET` only unquotes a git-quoted `file` path. |
| IDs | Query: `sessionID` + optional `messageID` (`groups/session.ts` 39–41, 168–176; `DiffInput` is `messageID?`, `summary.ts` 148–151). **No messageID → `[]`** (129–130). Non-user message → `[]` (134). Diff objects themselves carry no session/message/hash. The hashes live on the assistant `step-start` / `step-finish` parts (`schema/src/v1/session.ts` 81–85, 233–244). |
| (a) | Net tree-to-tree for the whole turn. Repeated edits of one file in one step collapse. Each step still has its own start/finish hash, but the stored summary uses only the first start and the last finish. |
| (b) | Any worktree change between those two trees is included, including files no tool touched. A change **between** turns is in neither turn (both endpoints already contain it). |
| (c) | `A` → internal before `""`, after = blob at `to`. `D` → before = blob at `from`, after `""` (`snapshot/index.ts` 565–577, 592–599). Status is stored. A file created and deleted inside the same from/to pair is absent (both trees lack it). |
| (d) | See snapshot section. If either hash is missing, `computeDiff` returns `[]` (`summary.ts` 98–99) and that empty array is what gets stored (unless `snapshot === false`, which returns **before** writing the message — 115). Binary: `patch: ""`, additions/deletions 0 (`snapshot/index.ts` 713–715, 745–748). |

When it is computed: forked (not awaited) at each `step-finish` (`processor.ts` 485–490) and again at prompt `step === 1` before the model call (`prompt.ts` 1252–1253). `summarize` first **zeros** the session-level summary and publishes `session.diff` with `diff: []` (`summary.ts` 106–114). It does **not** later publish the real array. Real payload is the updated user message.

### 2. `session.diff` event

| | |
|---|---|
| Scope | Event schema is session-wide: `{ sessionID, diff: FileDiff[] }` (`schema/src/v1/session.ts` 643–648). SDK v2 `SessionDiff.data` is the same and has **no messageID** (`sdk/.../v2/gen/types.gen.ts` 5327–5342). |
| Base / head | On the normal turn path the published array is **always `[]`** (`summary.ts` 114). On **revert** the array is `computeDiff` over messages from the revert point to the end, so it can span **multiple turns** (`revert.ts` 74–78). |
| Content | Same `Snapshot.FileDiff` (patch, not before/after). |
| Persistence | Event only, except revert also `storage.write(["session_diff", sessionID], diffs)` (`revert.ts` 77). `Session.diff()` is a stub that returns `[]` (`session/session.ts` 823–825). Share full-sync calls that stub (`share/share-next.ts` 277, 296), so the stored `session_diff` file is not what share sends. Migration 2 also wrote that file from legacy `summary.diffs` (`storage/storage.ts` 182–194). |
| IDs | `sessionID` only. Revert also sets `session.revert.{messageID, partID?, snapshot?, diff?}` (`session.ts` 209–214). `revert.diff` is a **raw git patch string**, not `FileDiff[]` (`revert.ts` 73, `snapshot/index.ts` 526–541). |
| (a)(b)(c)(d) | Same as row 1 for the revert range. Normal-turn event is empty, so it cannot prove content. |

### 3. `edit` tool metadata

| | |
|---|---|
| Scope | **One tool call**, one file. |
| Base / head | **Disk at tool time**, not a snapshot hash. Existing file: `Bom.readFile` → `contentOld` (`tool/edit.ts` 126–127). New file (`oldString === ""` and path must not exist): `contentOld = ""` (90–100). Missing file throws (123–124). |
| Content | Unified diff from `createTwoFilesPatch(file, file, old, new)` with **no context option** (101, 137–143), then `trimDiff` which only strips shared leading whitespace (646–679). **INFERRED:** jsdiff default context is 4 lines, so this patch is not a full-file image. Also `filediff: { file: absolute path, patch, additions, deletions }` — no `status`, no `before`/`after` (175–186). Permission `ask` metadata is `{ filepath, diff }` only (145–152). After a formatter, `contentNew` is re-read and the diff is rebuilt (164–171). |
| Persistence | `ctx.metadata` writes the running tool part (`session/tools.ts` 67–79), then `completeToolCall` stores `state.metadata` on the completed part (`processor.ts` 160–181). Return metadata is `{ diagnostics, diff, filediff }` (`edit.ts` 203–208). |
| IDs | Tool part `id`, `sessionID`, `messageID`, `callID` (`schema/src/v1/session.ts` 315–321). No snapshot hash. `filediff.file` is absolute. |
| (a) | Each call is its own disk-before → written-after. Second call in the same turn sees the first call's result on disk. |
| (b) | Read once, then `ask`, then write the buffer (`126–155`). A user edit during the permission wait is overwritten. No snapshot involved. |
| (c) | Create: before `""`, watcher event `"add"` (115–118). This tool does not delete files. |
| (d) | No snapshot dependency. If the file is missing (and `oldString !== ""`), the call errors and `failToolCall` keeps only metadata already streamed (`processor.ts` 186–198) — edit streams `filediff` only **after** a successful write (`edit.ts` 188–194), so a failed call has no filediff. |

### 4. `write` tool metadata

| | |
|---|---|
| Scope | One tool call, one file. |
| Base / head | Disk if the path exists, else `text: ""` (`tool/write.ts` 46–50). |
| Content | Permission `ask` gets a `trimDiff(createTwoFilesPatch(...))` (`53–61`). **Completed metadata is `{ diagnostics, filepath, exists }` only** (92–98). No `diff`, no `filediff`, no before/after on the tool part. |
| Persistence | Same tool-part path as edit, but the result omits the patch. **UNCHECKED:** whether the permission request stores `ask.metadata.diff` anywhere the client can read later. |
| IDs | Same tool-part ids. `filepath` absolute. `exists` boolean. |
| (a) | Each call reads disk then. Not linked to other writes. |
| (b) | Same read-then-ask-then-write race (`46–64`). Formatter may change the file **after** the ask-time diff (`65–67`) and the result does not record that. |
| (c) | New file: before `""`, `exists: false`, watcher `"add"` (69–71). Does not delete. |
| (d) | Does not consult snapshots. |

### 5. `apply_patch` tool metadata

| | |
|---|---|
| Scope | One tool call, **one or many files**. |
| Base / head | Per hunk, disk at verification time, before permission (`tool/apply_patch.ts` 76–159). `add`: `oldContent = ""` (78–80). `update`: `Bom.readFile` (115–116). `delete`: `Bom.readFile`, `newContent = ""` (162–179). |
| Content | Returned `metadata`: `{ diff: totalDiff, files, diagnostics }` (295–301). Each `files[]` item: `filePath` (absolute), `relativePath`, `type` (`add|update|delete|move`), `patch`, `additions`, `deletions`, optional `movePath` (194–201). `oldContent` / `newContent` stay local and are **not** returned. Patches are `createTwoFilesPatch` + `trimDiff` (82, 133, 172). Formatter runs after write (`252–255`) and the stored patch is **not** recomputed. |
| Persistence | Same tool-part `state.metadata` on success. |
| IDs | Tool part ids. No snapshot hash. |
| (a) | One call can touch a file once (one hunk). A later call in the turn reads the updated disk. |
| (b) | Read all files, then one `ask`, then write (`204–248`). External edits during the ask are overwritten from the pre-ask buffers. |
| (c) | Add: before empty. Delete: before = full disk text, after empty, file removed (`246–248`). Move: write destination, remove source (`235–242`); the metadata patch is still old→new contents of the source path (`133–151`). |
| (d) | Update/delete of a missing or directory path fails the call (`108–112`, `162–169`). No snapshot. |

### 6. Snapshot system (the trees behind row 1)

| | |
|---|---|
| What | A **separate git dir**, work tree = the project worktree. `gitdir = path.join(Global.Path.data, "snapshot", project.id, Hash.fast(worktree))` (`snapshot/index.ts` 71). Not the user's `.git`. `seed` points `objects/info/alternates` at the user's object db and copies their index (198–232). **UNCHECKED:** concrete `Global.Path.data` location. |
| When | `track()` at processor create, before the LLM stream (`processor.ts` 99–109); reused as `step-start.snapshot` if still set (`424–431`); new `track()` at `step-finish` stored on that part (`435–463`). If the start hash's `patch()` lists files, a `patch` part is written: `{ hash, files[] }` absolute paths, **no content** (`471–481`, schema `PatchPart` 94–99). `cleanup()` also writes a patch part (`553–566`). `gc --prune=7.days` hourly (`23`, `300–305`, `761–765`). |
| Tracked / excluded | `git add` of worktree `diff-files` + untracked `--exclude-standard` (`235–297`). User ignore via `check-ignore --no-index` against `worktree/.git` (`102–129`); ignored paths are `rm --cached` and filtered out of patch/diff (`267–272`, `369–376`, `727–732`). User `info/exclude` is copied in (`172–192`). **Untracked** files with size `> 2 * 1024 * 1024` are excluded (`24`, `277–297`). Tracked files over that size are still staged (`294` vs `297`). |
| Disable | Config v1 key **`snapshot`** boolean. Default on: only `=== false` disables (`core/src/v1/config/config.ts` 52–55; checked at `snapshot/index.ts` 167–169 and `summary.ts` 115). v2 key `snapshots` is rewritten to `snapshot` (`config/v2-compat.ts` 135–137). SDK v2 config field `snapshot?: boolean` (`types.gen.ts` 1917). |
| Not a git repo | `enabled()` is false when `project.vcs !== "git"` (`snapshot/index.ts` 167–169). `vcs` is set only when `git.repo.discover` finds a repo (`core/src/project.ts` 110–121). `track()` returns `undefined` and does not create the git dir. `summarize` does **not** take the early return (that checks only the config flag), so it stores `diffs: []` on the user message. |
| `snapshot: false` | `track()` returns `undefined`. `summarize` returns after zeroing session summary and publishing empty `session.diff`, and **does not** update `user.summary.diffs` (`summary.ts` 106–115). |
| (a) | One tree per `track()`, not per tool. Multiple tools in one step share one start hash and one finish hash. |
| (b) | `track` stages the whole worktree delta, so external edits are in the next tree. |
| (c) | Deletions of tracked paths show up in `diff-files` and `git add --all` stages them (**INFERRED** from `add --all` at line 149 plus `diff --name-status` at 687–697; did not execute git). |
| (d) | Disabled or non-git: no hash, no blobs. Untracked >2MiB: file omitted entirely (not an empty before). Binary: empty patch. `git cat-file --batch` header ending `missing` leaves that side `""` and still builds a patch (`641–644`, 744–748). Batch failure falls back to per-file `git show` (`611–619`, `563–585`); `git()` turns a crash into `text: ""` (`93–99`), so a failed show becomes empty content (**INFERRED** effect on the patch). `write-tree` failure is not checked; the trimmed stdout is returned as the hash (`341–344`) — **INFERRED** empty/garbage hash, then `diffFull` yields `[]`. `check-ignore` exit other than 0 or 1 → treat nothing as ignored (`123`). |

`SnapshotPart` (`type: "snapshot"`) exists (`schema/src/v1/session.ts` 87–91). **No writer** in `packages/opencode/src` (search for `type: "snapshot"`). Hashes are on step parts, not snapshot parts.

There is **no HTTP API** that accepts two snapshot hashes and returns `diffFull`. Recompute is internal.

### 7. User's git (not session-scoped)

| | |
|---|---|
| Routes | `GET /vcs` branch info; `GET /vcs/status` stats only; `GET /vcs/diff?mode=git\|branch&context=` `Vcs.FileDiff[]`; `GET /vcs/diff/raw` one text patch; `POST /vcs/apply` (`groups/instance.ts` 43–50, 94–125; handler `handlers/instance.ts` 47–64). |
| Scope | **The project working tree / branch. Not a session, message, or turn.** `mode: "git"` diffs against `HEAD` (or untracked status if no HEAD). `mode: "branch"` diffs against merge-base with the default branch (`project/vcs.ts` 373–385). Non-git → `[]` or `""` (`350`, `376`, `389`). |
| Content | `file`, optional `patch`, `additions`, `deletions`, `status?` (`vcs.ts` 246–255). Comment says this mirrors `Snapshot.FileDiff` (248–250). Patches use context default `2_147_483_647` but cap **10_000_000** bytes per file and total (`11–15`, `106–141`); overflow becomes an empty patch (`17`, `144–146`). No before/after fields. |
| Persistence | Recomputed on each request from the user's repo. Not stored on a message. |
| IDs | None that tie the diff to a session. Instance/workspace routing only. |
| `GET /file/status` | Described as "git status of all files" (`groups/file.ts` 158–166) but the handler **returns `[]` always** (`handlers/file.ts` 127–128). `GET /file/content` returns current text or base64 (`115–122`); the `LegacyContent.diff` / `.patch` fields (`62–83`) are not set by that handler. |
| (a)(b) | Live worktree vs `HEAD` (or branch base). Session turns are irrelevant. Every edit, tool or human, is in the same diff until commit. |
| (c) | `status` `added` / `deleted` / `modified` from git status (`vcs.ts` 258–262, 364–368). Untracked included (`390–397`, `211–217`). |
| (d) | Non-git: empty. Truncated patch: empty patch string, file row still present. Did not read `git/index.ts` patch implementation (binary handling **UNCHECKED** there). |

---

## Answers

1. **Server session diff.** `GET /session/:id/diff?messageID=` returns the **already stored** `user.summary.diffs` for that user message (`handlers/session.ts` 99–103, `summary.ts` 129–141). Those were computed by `snapshot.diffFull(firstStepStartHash, lastStepFinishHash)` over that user message and its assistant children (`summary.ts` 82–126). Scope = **one turn**. Not recomputed on GET. Content = **full-context unified patch + stats + status**, not before/after fields. The `session.diff` event on that path is an empty array (`summary.ts` 114). Session-level `summary.diffs` is cleared to a zero summary without diffs at the start of `summarize` (`106–113`); the per-turn data is on the user message, not the session object (`setRevert` is the path that writes session `summary` counts, and it also omits the diffs array — `revert.ts` 79–86).

2. **Tool metadata.** Captured when the tool finishes, from a disk read (or `""` if creating) taken **before** the write, inside that call. `edit` persists `diff` + `filediff`. `write` persists neither on the result. `apply_patch` persists a combined `diff` and per-file `patch` / counts / type, not the raw strings. Scope = one call (`apply_patch`: N files in that call).

3. **Snapshots.** Separate git dir under `Global.Path.data/snapshot/<projectId>/<worktree hash>`, user's worktree as work tree. Taken at step boundaries (and once before the stream). Gitignore + exclude honored; untracked files over 2MiB dropped. Disabled with config `snapshot: false` (v2 alias `snapshots`). Disabled or non-git: `track()` returns no hash; no snapshot git dir; session diffs are empty / left untouched as in row 6.

4. **User git.** `GET /vcs/status`, `GET /vcs/diff`, `GET /vcs/diff/raw` are live working-tree or branch diffs. **Not session-scoped.** `GET /file/status` is a stub (`[]`).

5. **Edge cases.** See matrix columns (a)–(d). Short version: session summary is a **net** between two trees (repeats collapse; external edits during the turn are included; external edits between turns are in no turn). Tool metadata is **per call** against disk at that call and can clobber an edit made while permission is pending. Create → empty before (tools and snapshot). Delete → snapshot status `deleted` and `apply_patch` only (edit/write do not delete). Missing snapshot (flag, non-git, untracked >2MiB, binary, failed show) yields no hash, an omitted file, or `patch: ""` — never a synthetic before-image field, because that field is not in the schema.

6. **IDs a client can use.**
   - Turn diff ↔ user message: `sessionID` + user `messageID` (`User.summary.diffs`, `schema/src/v1/session.ts` 332–344). The diff objects do not embed those ids.
   - Tree hashes ↔ assistant step: `step-start` / `step-finish` `part.id` + `messageID` + `sessionID` + `snapshot` (233–244). `patch` part adds `hash` + absolute `files` (94–99) for **that step's** file list, not file bodies.
   - Tool text ↔ call: tool `part.id` + `messageID` + `sessionID` + `callID` + `state.metadata` (315–321). No hash, so it does not by itself prove the bytes match a snapshot.
   - `session.diff` event: `sessionID` only, and on the normal path the array is empty, so it does **not** prove turn content. Revert's event can, but it is a multi-message range, not one turn (`revert.ts` 74–78), plus `revert.snapshot` / `revert.messageID`.

---

## Not checked (tool budget)

- Full body of `session/message-v2.ts` (only the interrupted-metadata use). HTTP messages are typed as `SessionV1.WithParts` (`groups/session.ts` 179–181), which is the schema cited above. `session/message.ts` 81–83 is a **different**, snapshot-less `StepStartPart`; not the HTTP part schema.
- `git/index.ts` (how `/vcs` patches are produced, binary, renames).
- `node_modules/diff` default context for `createTwoFilesPatch` (marked INFERRED).
- Whether permission-request `metadata.diff` for `write` is persisted on a permission record.
- `Global.Path.data` absolute root.
- `packages/client` generated types (only noted SDK v1 vs v2).
- Shell/other tools that change files without `filediff` (they would still show up in the turn snapshot).
- Did not run the server or git.
