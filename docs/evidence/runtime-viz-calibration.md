# 运行时可视化规模校准

- 读取时间：2026-10-02
- 来源：本机 OpenCode SQLite（`sqlite3 -readonly`）。只聚合计数与数值，未读取、未写出消息正文、提示词、工具输出、路径或凭据。
- 主表：`message` / `part` / `session`。行数：session 108（根 57，子 51），message 850（user 243，assistant 607），part 3080。
- 未并入 `session_v2` / `session_message`：与 `message` 的 id 重叠 797，仅 v2 有 242 条消息、仅 `message` 有 53 条。两套一起算会双计。v2-only 的 content 类型只有 reasoning / text / tool，没有 compaction 或 summary。最新的 `time_created` 在 `message` 一侧。
- 写入位置：任务指定的主检出路径不可写（Operation not permitted）。本文件写在当前工作区的 `docs/evidence/runtime-viz-calibration.md`。
- model / provider：grok-4.7 / xAI（本会话身份；没有单独的工具元数据字段）。

## 口径

- 一次运行 = 一条 `role=user` 的消息，加上 `parentID` 指向它、且在同一 session 的全部 assistant 消息。无 assistant 的 user 消息不进入分位（全库 36 条，其中根会话 15 条）。
- 一步 = 一条 assistant 消息。本库中 step-start 与 assistant 消息接近一一对应：607 条 assistant 里 582 条恰有 1 个 step-start、25 条为 0；step-finish 575。根会话 176 次运行里有 16 次「step-start 比 assistant 少 1」；这 176 次若改按 step-start 计数，中位数 / p90 / 最大值仍是 1 / 6 / 17。
- 分位：升序后取第 `ceil(p × n)` 个观测值（1-based）。中位数是 p=0.5 的下中位，不是平均值。
- 时间重叠：同一条 assistant 消息内，工具 `state.time` 用半开区间 `[start, end)`。`end` 缺失或 `end <= start` 时当作 1 毫秒。同一时间戳先处理结束再处理开始。
- 主数字是「全部 session 的 user 运行」。根会话（`session.parent_id IS NULL`）另列，因为舞台默认看的是用户直接发起的运行；子会话步数在第 3 节。

## 1. 每次运行的步数

全库运行 n=207：中位数 **2**，p90 **7**，最大值 **17**。

根会话运行 n=176：中位数 **1**，p90 **6**，最大值 **17**。根分布：1×91，2×34，3×15，4×10，5×8，6×4，7×3，8×4，9×2，10×1，14×1，15×1，17×2。

```sql
SELECT u.id AS user_id, COUNT(a.id) AS steps
FROM message u
JOIN message a
  ON json_extract(a.data,'$.parentID') = u.id
 AND a.session_id = u.session_id
 AND json_extract(a.data,'$.role') = 'assistant'
WHERE json_extract(u.data,'$.role') = 'user'
GROUP BY u.id;
-- 根会话再 JOIN session s ON s.id = u.session_id AND s.parent_id IS NULL
```

## 2. 每一步的工具调用与并行

全库 607 步：工具个数中位数 **1**，p90 **4**，最大值 **9**。同一消息内时间重叠的最大值 **8**（重叠数本身的中位数 1，p90 3）。重叠分布：0×187，1×270，2×73，3×34，4×24，5×8，6×5，7×3，8×3。重叠 ≥5 的步为 19/607。

根会话 452 步：工具个数中位数 **1**，p90 **3**，最大值 **9**。重叠最大值同样是 **8**（中位数 1，p90 3）。重叠 ≥5 的步为 12/452。

```sql
SELECT m.id,
       SUM(json_extract(p.data,'$.type') = 'tool') AS tool_n
FROM message m
LEFT JOIN part p ON p.message_id = m.id
WHERE json_extract(m.data,'$.role') = 'assistant'
GROUP BY m.id;
```

重叠不是一条 SQL 能聚合完的：从 `part` 取 `json_extract(data,'$.type')='tool'` 的 `$.state.time.start` / `$.state.time.end`，按 `message_id` 做扫描线。

## 3. task 与子会话

全库每次运行的 task 次数：中位数 **0**，p90 **0**，最大值 **6**。分布：0×189，1×3，2×9，3×2，4×1，5×2，6×1。这 18 次非零运行全部在根会话（根会话 p90 因此是 1，不是 0）。task part 共 47，与分布乘积一致。

同一条 assistant 消息里并行 task 的最大值 **3**。峰值分布（按运行，取该运行内各消息重叠的最大）：0×189，1×10，2×7，3×1。

`session.parent_id` 链深度：根为 0。最大值 **2**。分布：0×57，1×50，2×1。task metadata 里的 `spawnDepth` 只有 3/47 条有值，且都是 1，不能代替 `parent_id`。

子会话自己的步数（51 个 `parent_id` 非空会话，按该会话的 assistant 消息数）：中位数 **1**，最大值 **15**。其中 21 个为 0。有至少 1 步的 30 个：中位数 **4**，p90 **13**，最大值 **15**。

```sql
SELECT json_extract(m.data,'$.parentID') AS user_id,
       SUM(json_extract(p.data,'$.tool') = 'task') AS task_n
FROM message m
JOIN part p ON p.message_id = m.id
WHERE json_extract(m.data,'$.role') = 'assistant'
  AND json_extract(p.data,'$.type') = 'tool'
GROUP BY user_id;

SELECT s.id, COUNT(m.id) AS child_steps
FROM session s
LEFT JOIN message m
  ON m.session_id = s.id
 AND json_extract(m.data,'$.role') = 'assistant'
WHERE s.parent_id IS NOT NULL
GROUP BY s.id;
```

并行 task 的重叠算法与第 2 节相同，只保留 `$.tool='task'`。

## 4. 单步 input token（含 cache.read）

取 `step-finish` 的 `tokens.input + tokens.cache.read`。全库 n=575：中位数 **26048**，p90 **81221**，最大值 **144415**。`cache.read / (input + cache.read)` 的中位数 **0.919**（572 步；3 步分母为 0，未计入）。

根会话 step-finish n=429：中位数 **29813**，p90 **86693**，最大值 **144415**。占比中位数 **0.949**。根上单独看，input 中位数 1497，cache.read 中位数 23040（分位不能相加，只作构成说明）。

```sql
SELECT json_extract(data,'$.tokens.input')
     + COALESCE(json_extract(data,'$.tokens.cache.read'), 0) AS in_tok,
       CASE
         WHEN json_extract(data,'$.tokens.input')
            + COALESCE(json_extract(data,'$.tokens.cache.read'), 0) > 0
         THEN 1.0 * COALESCE(json_extract(data,'$.tokens.cache.read'), 0)
            / (json_extract(data,'$.tokens.input')
               + COALESCE(json_extract(data,'$.tokens.cache.read'), 0))
       END AS cache_ratio
FROM part
WHERE json_extract(data,'$.type') = 'step-finish';
```

## 5. 压缩

**无数据。** `part.type` 没有 compaction 或 summary（现有类型：text 517，step-finish 575，step-start 582，tool 929，reasoning 465，patch 11，file 1）。因此没有「出现次数 / 占会话比例」可算。

核对过、也不算压缩 part 的旁证：`session.time_compacting` 与 `session_v2.time_compacting` 非空数都是 0；`session_pending` 0 行；event 类型里没有 compact / summary。`message.summary` 在 206 条 **user** 消息上，键是 `diffs` / `title`（87/108 个会话有），这是 diff 摘要字段，不是 compaction part，不计入。

## 6. reasoning、retry、error、permission、question

- 含 reasoning part 的步骤：全库 **446/607 = 73.5%**。根会话 **367/452 = 81.2%**。
- retry：**无数据**。tool `state.status` 只有 completed 885、error 43、running 1。step-finish reason 与 message finish 只有 `stop` 与 `tool-calls`。没有名为 retry 的 part、status 或 event。
- error 状态 part：**43**（另有 1 条 status=running，不是 error）。另有 30 条 assistant 消息带 error 对象（类名计数：APIError 15，MessageAbortedError 8，UnknownError 5，ProviderAuthError 2），这不是 part 状态。
- permission：表 `permission` 存在，**0 行**。没有 permission part。`session.permission` 有 58 个会话存着规则列表（元素键为 permission / pattern / action），这是规则配置，不是一次询问记录。`session_v2.permission` 无有效值。
- question：没有 question 表。以 tool part 持久化 **10** 条（`tool='question'`：completed 8，error 1，running 1）。`message.tools.question` 在 50 条消息上是布尔开关，不是询问记录。

```sql
SELECT json_extract(data,'$.state.status') AS status, COUNT(*)
FROM part
WHERE json_extract(data,'$.type') = 'tool'
GROUP BY status;

SELECT COUNT(*) FROM permission;
SELECT COUNT(*) FROM part
WHERE json_extract(data,'$.type') = 'tool'
  AND json_extract(data,'$.tool') = 'question';
```

## 7. 一次运行的总时长

起点：user 的 `time.created`（没有则用列 `time_created`）。终点：该运行最后一条 assistant 的 `time.completed`（没有则用列 `time_updated`）。单位毫秒，下面写成秒。负时长 0，缺终点 0。

全库 n=207：中位数 **21.8 秒**，p90 **138.3 秒**，最大值 **618495 秒**（约 7.16 天）。全库只有 **1** 次运行超过 24 小时；它在根会话，3 步，且从第一条 assistant 开始到最后完成就是这段跨度，不是用户开跑前的等待。根会话次大是 **5857 秒**（约 97.6 分钟）。根会话分桶：<10 秒 57，10 秒–1 分 79，1–5 分 29，5–30 分 6，30 分–2 小时 4，2–24 小时 0，>24 小时 1。

```sql
SELECT u.id,
       (MAX(COALESCE(json_extract(a.data,'$.time.completed'), a.time_updated))
      - COALESCE(json_extract(u.data,'$.time.created'), u.time_created)) / 1000.0 AS duration_s
FROM message u
JOIN message a
  ON json_extract(a.data,'$.parentID') = u.id
 AND a.session_id = u.session_id
 AND json_extract(a.data,'$.role') = 'assistant'
WHERE json_extract(u.data,'$.role') = 'user'
GROUP BY u.id;
```

## 版式建议

舞台一次同时显示的常驻槽：**4 个并行工具，3 个并行子代理**。

- 工具重叠 p90 是 3，最大值是 8。4 槽盖过 p90；全库超过 4 的步是 19/607（根 12/452），用「+N」折叠即可，不必按 8 排满。
- 子代理并行的观测最大值是 3，且 18 次有 task 的运行里只有 1 次达到 3，10 次峰值为 1、7 次为 2。3 槽就是当前数据的上限。
- 不要按步数最大值 17 或 7 天时长做常驻高度。步数 p90 是 7（根是 6），时长 p90 约 2.3 分钟。
