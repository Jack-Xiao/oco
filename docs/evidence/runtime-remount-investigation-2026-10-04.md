# 运行视图切 Tab 状态不一致与子代理阻塞根因调查报告

- **日期**: 2026-10-04
- **证据路径**: `docs/evidence/runtime-remount-investigation-2026-10-04.md`
- **调查范围**: 
  - `vendor/opencode/packages/app/src/pages/session.tsx`
  - `vendor/opencode/packages/app/src/components/session/session-runtime*.ts(x)`
- **状态**: 调查完成 (COMPLETED)

---

## 一、切 Tab 卸载/重挂载与回放状态丢失根因

### 1. 卸载与重挂载机制
- **位置**: `vendor/opencode/packages/app/src/pages/session.tsx:2135–2160`
  ```tsx
  <Match when={params.id && store.view === "runtime" ? params.id : undefined}>
    {(id) => (
      <SessionRuntime
        sessionID={id()}
        onView={(view) => setStore("view", view)}
        ...
      />
    )}
  </Match>
  ```
- **机理**:
  - `session.tsx` 使用 SolidJS 的 `<Switch>` / `<Match>` 条件渲染。
  - 当从“运行”切到“对话”时，`store.view` 变为 `"chat"`，`<Match>` 条件为 `false`，SolidJS **完全卸载并销毁 `<SessionRuntime>` 组件实例**（触发所有 `onCleanup`）。
  - 当切回“运行”时，`<SessionRuntime>` **作为一个全新组件重新实例化挂载**。

### 2. 回放/实时模式与播放位置丢失原因
- **位置**: `vendor/opencode/packages/app/src/components/session/session-runtime.tsx:116–117, 203–207, 255–256`
  ```tsx
  const [cursor, setCursor] = createSignal<number | undefined>()
  const [pausedAt, setPausedAt] = createSignal<number | undefined>()
  const [playing, setPlaying] = createSignal(false)
  const [speed, setSpeed] = createSignal<PlaybackSpeed>(1)
  ...
  const replay = createMemo<RuntimeModel | undefined>(() => {
    const at = cursor()
    return at === undefined ? undefined : assemble(snapshotAt(messages(), parts, at, inFlightMessageID()), "replay", at)
  })
  const model = () => replay() ?? live()
  ```
- **机理**:
  - 模式与播放位置由局部 signal 控制：`cursor === undefined` 表示“实时”模式；`cursor !== undefined` 表示“回放”模式，数值为步骤时间戳。
  - 这些状态纯粹保存在 `<SessionRuntime>` 内部局部闭包内，未提升至 `session.tsx`，亦未持久化或存入 URL。
  - 组件一旦卸载再重挂载，`cursor` 重新初始化为 `undefined`，导致 `replay()` 为 `undefined`，`model()` 退化为 `live()`。
  - 因此原本处于「回放」288/288 的视图在切 Tab 重入后直接丢失播放点，静默变回「实时」模式。

---

## 二、重挂载后 13 个子代理来源及模型差异根因

### 1. 13 个子代理从何而来？（是否归到第 19 轮？）
- **位置**: `vendor/opencode/packages/app/src/components/session/session-runtime-loop.ts:168–173`（函数 `loopOf`）
  ```ts
  // A probe from an earlier round that is still out (live only) stays on the lane until it comes back.
  const probes = all.filter(
    (p) => p.dispatchRequest >= model.roundStart || (live && !p.cancelled && (p.stage === "running" || p.stage === "queued")),
  )
  const earlier = all.length - probes.length
  ```
- **机理**:
  - 全会话历史（第 1..19 轮）共有 24 个子代理（`all.length === 24`）。
  - 这 13 个子代理**并非派发在第 19 轮**（它们的 `dispatchRequest < model.roundStart`），**也没有被归入第 19 轮**。
  - 在第 1 张截图（会话结束，「回放」模式 288/288）下：`live === false`，过滤条件后半段 `(live && ...)` 完全失效，只有当前轮（第 19 轮）派发的子代理允许上跑道；而第 19 轮未派发子代理，因此跑道为空（`probes = []`），全量 24 个子代理全部折叠进 `earlier`（显示 `+24 更早的`，作业区“执行中”为空，已吸收 0/0，底栏子代理 0）。
  - 在第 2 张截图（切 Tab 重入，「实时」模式）下：`live === true`，过滤条件后半段 `(live && !p.cancelled && (p.stage === "running" || p.stage === "queued"))` **重新激活**！
  - 13 个历史未被吸收/未正常闭环的 probe 判定满足 `stage === "running"`，因此被强行捞回主跑道（`probes` 变为 13 个），`earlier` 从 24 降为 11（显示 `+11 更早的`），进入作业区 `zone: "work"`（“执行中 13”）。

### 2. 为何持续挂载与重挂载初始化模型不同？
- **函数与位置**:
  - `session-runtime-child-sync.ts:44–64`（函数 `createChildSync`）
  - `session-runtime-actions.ts:228–245, 288–302`（函数 `treeNodes` 和 `treeSyncTargets`）
  - `session-runtime-model.ts:258–284`（函数 `childLifecycleOf`）
- **机理**:
  - **增量运行期（持续挂载）**:
    主会话在逐轮运行推进时，每轮 `autoTurn` 变动，`treeSyncTargets` 会将当前轮的 task 识别为 `current = true`，主动调用 `deps.sync(id)` 同步子会话消息并 `pin` 订阅更新。当子会话结束时，其 assistant message 获得 `time.completed`，`childLifecycleOf` 计算为 `"done"`。
  - **静态初始化期（切 Tab 重挂载）**:
    - 重挂载后，`childSync` 从空集合重新开始，直接面对第 19 轮（末轮）。
    - 在 `treeNodes` 中检查历史 13 个子代理：因为 `item.tool.request !== rootLastReq`，且子会话消息未载入导致 `lifecycle === "unknown"`（不属于 `PIN_LIFECYCLE`），因此全部被判定为 `isCurrent = false`。
    - `treeSyncTargets` 直接过滤掉了这 13 个历史子代理，**不会发起任何自动加载（requestSync）**。
    - 缺少子会话消息使得 `childMessagesOf(sessionID)` 为空，`childLifecycleOf` 保持 `"unknown"`，后台任务无法通过 `child.lifecycle === "done"` 转为 `docked` 或通过 retrieval 转为 `absorbed`，永久滞留在 `stage: "running"`。

---

## 三、判定“阻塞”的条件

### 1. 阻塞统计与视觉呈现
- **函数与位置**:
  - `session-runtime-loop.ts:197`: `blocked: onLane.filter((p) => p.flag).length`
  - `session-runtime.tsx:408–410`: `summaryChildren`（底栏“子代理 {{total}}（运行 {{running}} / 阻塞 {{n}}）”）
  - `session-runtime-loop-view.tsx:206–218, 648–651`: `glyphOf` 与 `probeColor`（`flag === "error"` 呈现为红色 `var(--rt-err)` + 内部 `"✕"` 图标）

### 2. 标志位判定规则
在 `session-runtime-loop.ts:65–83`（函数 `probeStageOf`）中：
- 只要满足 `Boolean(p.flag)`，且 probe 在跑道上（`!p.cancelled`），就计入阻塞 `blocked`。
- **红色 ×（`flag: "error"`）的充要条件**:
  1. `last.state === "error"`：主会话中该 task 工具调用本身执行报错（`part.state.status === "error"`）；**或**
  2. `child.lifecycle === "error"`：子会话最后一条 assistant 消息携带错误（`last.error` 为真）；**或**
  3. `child.notice === "error"`：主会话收到了后台任务的非 COMPLETED/CANCELLED 通知（如 oh-my-openagent 注入的 `[BACKGROUND TASK FAILED]` 等，由 `session-runtime-model.ts:330` 解析为 `"error"`）。
- **黄色感叹号（`flag: "ask"`）的充要条件**:
  1. `last.awaiting` 存在：主代理等待用户权限审批或回答问题；**或**
  2. `child.lifecycle === "waiting-user"`：子代理内部正在等待用户交互。

---

## 四、建议修复方向

1. **状态保持与模式继承**:
   - 将 `SessionRuntime` 的播放状态（`cursor`, `mode`, `pausedAt`）提升至 `session.tsx` 的页面级状态（例如 `store.runtimeViewState`）或保留在 `sessionLayout` 中，避免组件卸载后状态丢失。
   - 或者使用 CSS 显隐（`hidden` / `display: none`）代替 `<Switch>` / `<Match>` 条件卸载，保持运行视图的 WebSocket 订阅与 DOM 状态。
2. **已结束会话的历史 Probe 滞留修正**:
   - 在 `session-runtime-loop.ts:169` 中，当主会话整体已完成时（`status.type === "idle"` 且末轮结束），历史未解决的 error/queued probe 不应无限期当作正在运行留在主跑道，或应提供历史终态归档逻辑。
3. **重挂载时的子会话状态复水（Hydration）**:
   - 在 `treeSyncTargets` / `treeNodes` 中，增加对未闭环/异常状态的历史 probe 的首屏轻量状态校准，避免因仅检查 `rootLastReq` 而丢失历史子代理的最终生命周期。

---

## 主线程核对（2026-10-04）

- 已核对 `session-runtime-loop.ts:65-83`（`probeStageOf`：error 保留 `where`=running 并加 flag）与 `:168-171`（`loopOf` 过滤：`live` 时早轮 running/queued 留在航道，未排除 flag=error）。结论成立：图二 13 个红 × 是早轮已失败的探针，被“仍在外面”规则误留；图一是回放（live=false）所以不显示。
- 第 2 节“子会话未同步导致 lifecycle unknown”是推测，红 × 说明这 13 个已判定为 error，不是 unknown；该推测未验证。

## 委派记录

| task_id | 唯一写入范围 | requested_route | actual_provider/model | agent_id | 状态 | 结果 | fallback_reason |
| --- | --- | --- | --- | --- | --- | --- | --- |
| remount-inv-1 | 本文件 | grok-worker | xAI / unknown | a38d94ce08ceb9427 | 失败 | — | 402 Grok Build usage balance exhausted，换 Gemini |
| remount-inv-2 | 本文件 | gemini-worker | Gemini(Antigravity) / unknown | a1a4ff2fd6641733f | 返回 `{"status":"ERROR"}`，但已写出本文件 | 本文件 | 主线程抽查核对关键行 |

## 修复 B（2026-10-04，主线程，未提交）

- `session-runtime-loop.ts` `loopOf`：早轮探针“仍在外面”规则排除 `flag === "error"`；等授权（ask）的仍留在航道。
- 单测新增 1 条（实时/回放都把早轮失败探针折进 earlier）。session 单测 271 / 0；app `tsc --noEmit` 0 错。
- 补丁 0019 已重新生成（与旧补丁的差异只有上述两处）；webview / vsix 未重建，E2E NOT RUN。
- 主线程接手理由：Grok 402、Gemini ERROR（见委派记录），改动 4 行 + 1 条单测。
