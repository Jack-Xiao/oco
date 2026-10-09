# 实时运行视图“第 2 轮”（Round n=2）根因调查证据

- 调查日期：2026-10-09
- 调查目标：定位新会话首次对话在实时运行环形视图（live runtime ring view）中显示为“第 2 轮”（Round n=2）的原因。
- 数据库与离线对照：数据库中仅 1 条 user 消息，离线执行 `buildRingIndex` 为 1 轮；多出的一轮来源于实时 Solid store（`sync().data.message[sessionID]`）中多出的一条 user 消息。

---

## 一、多出的 user 消息来源路径与触发条件

### 1. 来源路径与触发时序

1. **客户端生成乐观消息并入库（Client Optimistic Add）**
   - **文件与行号**：`vendor/opencode/packages/app/src/components/prompt-input/submit.ts:127-171`
   - **逻辑**：用户点击发送时，客户端生成 `messageID`（通过 `Identifier.ascending("message")`）和乐观消息对象：
     ```ts
     const message: Message = {
       id: messageID,
       sessionID: input.draft.sessionID,
       role: "user",
       time: { created: Date.now() }, // 客户端时间戳 T_client
       ...
     }
     ```
   - **调用**：`input.sync.session.optimistic.add(...)`。
   - **进入 Store**：`vendor/opencode/packages/app/src/context/server-session.ts:1344-1347`：
     - `optimistic.set(input.sessionID, new Map([[message.id, ...]]))`
     - `setData("message", input.sessionID, (messages = []) => merge(messages, [input.message]).sort(compareMessages))`
     - 此时 `data.message[sessionID]` 中包含 1 条 user 消息（时间为 `T_client`）。

2. **服务端接收 Prompt 请求并入库（Server Prompt & Broadcast）**
   - **文件与行号**：`vendor/opencode/packages/app/src/utils/server-compat.ts:200-203` -> `vendor/opencode/packages/opencode/src/session/prompt.ts:656-660`
   - **逻辑**：客户端将 `messageID` 发送给服务端（通过 `promptAsync` 的 `messageID` 字段）。服务端使用相同的 ID 创建消息：
     ```ts
     const info: SessionV1.User = {
       id: input.messageID ?? MessageID.ascending(),
       role: "user",
       sessionID: input.sessionID,
       time: { created: Date.now() }, // 服务端处理时间戳 T_server
       ...
     }
     ```
   - **关键差异**：服务端的 `time.created`（`T_server`）为服务端处理时的时间，比客户端生成乐观消息的 `T_client` 晚若干毫秒（`T_server > T_client`）。服务端保存后通过 SSE 推送 `message.updated` 事件。

3. **SSE `message.updated` 命中致命的 Binary.search 键不匹配 Bug**
   - **文件与行号**：`vendor/opencode/packages/app/src/context/server-session.ts:1032-1063`
   - **逻辑**：客户端收到 `message.updated` 事件：
     ```ts
     const result = Binary.search(messages, messageKey(info), messageKey)
     if (result.found) setData("message", info.sessionID, result.index, reconcile(info))
     if (!result.found)
       setData("message", info.sessionID, (value = []) => {
         const next = value.slice()
         next.splice(result.index, 0, info)
         return next
       })
     ```
   - **致命根因**：
     `vendor/opencode/packages/app/src/utils/session-message.ts:21` 中定义：
     ```ts
     export const messageKey = (message: Pick<Message, "id" | "time">) => message.time.created + message.id
     ```
     `messageKey` 是由 `time.created + id` 拼接而成！
     - 原 store 中乐观消息的键为：`T_client + messageID`。
     - 服务端推送的真实消息键为：`T_server + messageID`。
     - 因为 `T_server !== T_client`，`Binary.search` **匹配失败**（`result.found === false`）！
     - 代码执行了 `next.splice(result.index, 0, info)`，将服务端真实消息**作为一条新消息直接插入**到了 `data.message[info.sessionID]` 数组中！
   - **结果**：此时 `data.message[sessionID]` 数组中同时存在 **2 条 user 消息**（一条为时间戳 `T_client` 的乐观消息，另一条为时间戳 `T_server` 的服务端消息，二者 ID 相同均为 `messageID`）。

4. **乐观消息清理逻辑失效（泄露无法被回收）**
   - **文件与行号**：
     - `vendor/opencode/packages/app/src/context/server-session.ts:1042`：在 `message.updated` 时，因为 `item.parts.length > 0`，将乐观项标记为 `confirmedMessage: true`。
     - `vendor/opencode/packages/app/src/components/prompt-input/submit.ts:173-222`：正常成功发送流程中，`submit.ts` **根本不会**调用 `remove()`（仅在 catch 异常或取消时调用）。
     - `vendor/opencode/packages/app/src/context/server-session.ts:1364`：即使调用 `optimistic.remove`，也因 `if (item.confirmedMessage) return` 提前返回，不再从 `data.message` 过滤消息。
     - `vendor/opencode/packages/app/src/context/server-session.ts:353-362`：`clearOptimistic` 仅从 `optimistic` Map 中删除记录，根本不操作 `data.message`。
   - **HTTP 全量 sync 也无法兜底**：
     - `server-session.ts:841`：`cached && !options?.force` 使得在已缓存时跳过 HTTP `loadMessages`。
     - `server-session.ts:114`：即使执行 `loadMessages`，其内部 `mergeOptimisticPage` 同样使用 `Binary.search(session, messageKey(item.message), messageKey)`，亦因 `messageKey` 时间戳不一致而把乐观消息重复 splice 进列表。

5. **环形视图消费到 2 条 User 消息导致 Round n=2**
   - **文件与行号**：
     - `vendor/opencode/packages/app/src/components/session/session-runtime.tsx:244-245`：直接从 `sync().data.message[id]` 取原始数组。
     - `vendor/opencode/packages/app/src/components/session/session-runtime-ring.ts:475-505`：
       ```ts
       for (const m of sortedMessages(input.messages)) {
         if (m.role === "user") {
           if (!isRealUserMessage(m.id, parts)) continue
           round = {
             n: ++realUsers,
             userMessageID: m.id,
             ...
           }
           rounds.push(round)
           ...
         }
       ```
       - 遭遇第 1 条（乐观消息）：`isRealUserMessage` 返回 true，`++realUsers` 变为 1，推入 Round 1。
       - 遭遇第 2 条（服务端消息）：`isRealUserMessage` 返回 true，`++realUsers` 变为 2，推入 Round 2！
       - 后续 Assistant 回复挂载到当前 `round`（Round 2）。
       - 实时界面展示“第 2 轮”。

*(注：主对话时间线 `message-timeline.tsx:336` 之所以没有显示重复气泡，是因为它取的是 `sync().data.session_message[id]`，而在 `server-session.ts:253` 的 `indexLegacyMessage` 中有显式的 `if (current.some((item) => item.id === message.id)) return` 按 ID 去重保护)*

---

## 二、把握程度

- **定论：已证实（Confirmed）**。
- **依据**：
  1. 完整还原了 `submit.ts -> optimistic.add -> promptAsync -> server SessionPrompt -> message.updated -> Binary.search(messageKey) 键不匹配 -> splice 插入双份 -> session-runtime.tsx -> session-runtime-ring.ts` 的完整代码执行链路。
  2. `messageKey = time.created + id` 导致包含不同时间戳的同 ID 乐观消息无法被二分查找到，完全符合“数据库中 1 条消息（离线 1 轮），实时 store 中 2 条消息（实时 2 轮）”的全部已知事实。
  3. `session_message` 与 `data.message` 的对比解释了为何普通聊天时间线没有重复气泡、而直接读取 `data.message` 的 runtime ring 视图会受到影响。

---

## 三、建议的最小修复点与风险对比

### 方案 A：在 Runtime Ring 索引侧去重 / 过滤（推荐最小风险方案）

- **修复位置**：
  - `vendor/opencode/packages/app/src/components/session/session-runtime.tsx:244` 或 `vendor/opencode/packages/app/src/components/session/session-runtime-ring.ts:475`。
- **具体做法**：
  在 `session-runtime.tsx` 提取 `sourceOf(id)` 时，或在 `session-runtime-ring.ts` 的 `sortedMessages` / 遍历循环中：
  1. 若连续遇到两条相同 `m.id` 的 user 消息，或者维护 `seenUserIds = new Set<string>()`，已计入轮次的 user message ID 不重复递增 `realUsers`（或后者覆盖前者）。
  2. 或者在 `sourceOf` 处按 `message.id` 做一次简单的 Map 去重（后到者/服务端版本优先）。
- **风险评估**：
  - **风险极低**：修改范围仅限 oco 自研的运行环（0019 补丁范围内），完全不影响 OpenCode 核心同步逻辑、其他面板或网络通信。
  - **缺点**：`sync().data.message` 内部仍存在重复对象（仅在 live 期间），但该 store 是纯内存响应式状态，刷新后恢复正常。

### 方案 B：在 Sync / Store 侧修复（彻底修复 store 状态异常）

- **修复位置**：
  - `vendor/opencode/packages/app/src/context/server-session.ts:1055-1063`（`message.updated`）以及 `server-session.ts:114`（`mergeOptimisticPage`）。
- **具体做法**：
  在 `message.updated` 中：
  ```ts
  let result = Binary.search(messages, messageKey(info), messageKey)
  if (!result.found) {
    const existingIndex = messages.findIndex((m) => m.id === info.id)
    if (existingIndex >= 0) {
      // 找到了同 ID 但时间戳不同的乐观消息，将其替换或更新
      setData("message", info.sessionID, existingIndex, reconcile(info))
      return
    }
  }
  ```
- **风险评估**：
  - **风险中等**：`server-session.ts` 是 vendor 层的核心状态树，涉及全部消息、历史分页与撤销重做。修改该处需要打入 `patches/opencode/` 补丁文件。
  - **优点**：从根本上纠正了乐观消息在 real-time store 中的替换生命周期，不仅解决 Ring 视图，也彻底消除 store 内同 ID 脏数据。

### 建议结论
短期建议优先采用 **方案 A**（在 `session-runtime.tsx` / `session-runtime-ring.ts` 增加防重保护），以最快速度消除用户界面的“第 2 轮”瑕疵；若后续规划升级/维护 OpenCode vendor 补丁集，可同步纳入 **方案 B** 作为长期状态树健全性修复。
