# User-facing Chinese → English

Scope: runtime strings only (status bar, messages, Quick Pick, tree items, webview banner, errors, `package.json` contributes). Comments were left unchanged. No l10n framework. Upstream UI (patches, `recovery.tsx`) was not edited.

Logic that matched these strings was updated with them: `describeFailure` (`/^Event stream/`), open-file “file does not exist” branch, dialog button equality (`Open Settings`, `Show Log`, `Delete`).

## submit-status.ts

| 原中文 | English |
| --- | --- |
| 取消发送 | Cancel send |
| 正在加载模型和 Agent…… | Loading models and agents… |
| 模型和 Agent 仍在加载，加载完成后自动发送。修改草稿或按 Esc 会取消发送。 | Models and agents are still loading. This will send automatically when they finish. Edit the draft or press Esc to cancel. |
| 已取消发送，草稿已保留。 | Send canceled. The draft was kept. |
| 草稿已修改，已取消自动发送。确认后请重新发送。 | Draft changed. Automatic send was canceled. Send again when ready. |

## package.json

| 原中文 | English |
| --- | --- |
| 连接已有服务（oco.serverUrl）。oco 从不启动、停止或修改它。 | Attach to an existing server (oco.serverUrl). oco never starts, stops, or modifies it. |
| 由 oco 在本窗口启动一个 `opencode serve`（仅监听 127.0.0.1、随机端口、随机密码），所有会话标签页共用；关闭窗口或停用扩展时只结束这个进程。 | oco starts one `opencode serve` in this window (127.0.0.1 only, random port, random password), shared by every session tab. Closing the window or disabling the extension stops only that process. |
| 连接方式。`attached`：…仅用户设置生效（machine 范围）。 | How oco connects. `attached`: connect to the existing server at `oco.serverUrl`. `managed`: oco starts and manages its own server with `oco.opencodePath` (the workspace must be trusted). An unexpected exit does not restart forever; run “oco: Restart Managed Server” to start it again. User settings only (machine scope). |
| 已运行的 OpenCode 服务地址，只写 origin… | Address of a running OpenCode server. Origin only, for example `http://127.0.0.1:4096` or `https://oc.example.com`. Do not include a path or credentials. User settings only (machine scope); a workspace or repository cannot override this. Used when `oco.serverMode` is `attached` (the default). oco only connects to that server and never starts, stops, or modifies it. Changing it reconnects. Open session tabs stay bound to the previous address and are not moved. |
| 连接服务使用的 HTTP Basic 用户名… | HTTP Basic username for the server. Defaults to `opencode` and must match the server. **Do not enter the password here.** Run “oco: Set Server Password”. The password is stored in VS Code Secret Storage (per address and username), not in settings.json. |
| 托管模式使用的 OpenCode 可执行文件完整路径… | Full path to the OpenCode executable used in managed mode, for example `/usr/local/bin/opencode`. Leave empty to look up `opencode` on the extension host `PATH` (on a remote window, the remote machine's PATH). oco does not install or upgrade OpenCode. User settings only (machine scope). |
| oco 未就绪：需要先打开一个工作区文件夹。 / 打开文件夹 | oco is not ready: open a workspace folder first. / Open Folder |
| 服务地址设置无效（见上方原因）。 / 打开设置 | The server address setting is invalid (see the reason above). / Open Settings |
| 正在连接 OpenCode 服务…… | Connecting to the OpenCode server… |
| 服务要求认证，用户名或密码不正确（密码未设置也会如此）。 / 设置密码 / 打开设置 | The server requires authentication, and the username or password is incorrect (this also happens when no password is set). / Set Password / Open Settings |
| 无法连接 OpenCode 服务（服务离线或地址不对），正在按退避间隔重试。 / 立即重连 / 打开设置 | Cannot connect to the OpenCode server (offline or wrong address). Retrying with backoff. / Reconnect Now / Open Settings |
| 连接中断，正在重连…… / 立即重连 / 打开设置 | Connection lost. Reconnecting… / Reconnect Now / Open Settings |
| 当前工作区还没有 OpenCode 会话。 / 新建会话 | This workspace has no OpenCode sessions yet. / New Session |
| 当前工作区还没有会话。受限模式下不能新建会话。 | This workspace has no sessions yet. Restricted Mode cannot create a session. |
| 没有匹配的会话。 / 清除搜索 | No matching sessions. / Clear Search |
| 受限模式下可以查看会话，但不能创建会话或执行有副作用的会话操作。 | In Restricted Mode you can view sessions, but you cannot create sessions or run session actions that have side effects. |

## connection.ts / session-feed.ts / endpoint.ts

| 原中文 | English |
| --- | --- |
| 托管服务启动中 | Managed server is starting |
| 托管服务未运行 | Managed server is not running |
| 认证失败（${origin}），请执行“oco: Set Server Password” | Authentication failed (${origin}). Run “oco: Set Server Password” |
| 认证失败（${origin}）：用户名或密码不正确。请执行“oco: Set Server Password”，或在设置中检查用户名 | Authentication failed (${origin}): the username or password is incorrect. Run “oco: Set Server Password”, or check the username in Settings |
| 服务返回 HTTP ${status}（…），地址可能不是 OpenCode 服务 | Server returned HTTP ${status} (…). The address may not be an OpenCode server |
| 无法连接服务（离线或地址/端口不对）：${m} | Cannot reach the server (offline or wrong address/port): ${m} |
| /^事件流/（前缀判断） | /^Event stream/ |
| 事件流无心跳 | Event stream has no heartbeat |
| 事件流已结束 | Event stream ended |
| 需要先打开一个工作区文件夹 | Open a workspace folder first |
| oco.serverUrl 不是有效 URL | oco.serverUrl is not a valid URL |
| oco.serverUrl 只支持 http/https | oco.serverUrl only supports http/https |
| oco.serverUrl 不能包含账号密码，请用“oco: Set Server Password”命令 | oco.serverUrl cannot include a username or password. Use the “oco: Set Server Password” command |
| oco.serverUrl 只能是 origin（如 http://127.0.0.1:4096） | oco.serverUrl must be an origin only (for example http://127.0.0.1:4096) |
| 托管服务只能监听回环地址 | The managed server can only listen on a loopback address |

## diagnostics.ts

| 原中文 | English |
| --- | --- |
| 服务版本 ${v} 不是 OpenCode v1，oco 未对它验证，部分功能可能不可用 | Server ${v} is not OpenCode v1. oco has not verified it; some features may be unavailable |
| 服务版本 ${v} 未经 oco 验证（已验证 ${verified}） | Server ${v} is not verified by oco (verified: ${verified}) |
| 模式：托管（oco 启动的 opencode serve） | Mode: Managed (opencode serve started by oco) |
| 模式：连接已有服务 | Mode: Attached server |
| 服务版本： | Server version: |
| 注意： | Note: |
| 托管进程：…（pid N） | Managed process: … (pid N) |
| 已连接 / 连接中 / 重连中 / 未连接 / 需要密码 / 未配置 | Connected / Connecting / Reconnecting / Not connected / Password required / Not configured |
| 状态 / 服务 / 目录 / 模式 / 版本 / 托管进程 / 受限模式 | Status / Server / Directory / Mode / Version / Managed process / Restricted Mode |
| 重连中（第 N 次） | Reconnecting (attempt N) |
| 托管 / 连接已有服务 | Managed / Attached |
| （未验证） | (unverified) |
| 只读 | Read-only |

## sessions-view.ts

| 原中文 | English |
| --- | --- |
| 运行中 / 重试中 / 等待权限 / 等待回答 / 出错 | Running / Retrying / Waiting for permission / Waiting for answer / Error |
| 刚刚 | just now |
| N 分钟前 / N 小时前 / N 天前 | N min ago / N hr ago / 1 day ago or N days ago |
| 已打开 | Open |
| 错误： | Error: |
| 打开会话 | Open Session |
| oco 连接 | oco Connection |
| 搜索： | Search: |
| 连接中断，正在重连（第 N 次）……列表可能不是最新。原因： | Connection lost. Reconnecting (attempt N)… The list may be out of date. Cause: |
| 无法连接 ${label}： | Cannot connect to ${label}: |
| 搜索只在已加载的最近 N 个会话中进行，更早的会话不会出现在结果里。 | Search covers only the N most recent loaded sessions. Older sessions are not included. |
| 只加载了最近 N 个会话，搜索也只覆盖这些会话。 | Only the N most recent sessions are loaded. Search covers only those sessions. |
| N 个会话等待你处理 | N session(s) waiting |
| oco 已连接 / 受限模式：只读 | oco: Connected to / Restricted Mode: read-only |
| oco 连接中 / 正在连接 | oco: Connecting… / Connecting to |
| oco 未连接 / oco 重连中 | oco: Not connected / oco: Reconnecting… |
| 点击立即重试 | Click to retry now |
| oco 需要密码 / 点击设置密码 | oco: Password required / Click to set the password |
| oco 未配置 / 点击打开设置 / 点击查看侧栏 | oco is not configured / Click to open Settings / Click to show the sidebar |
| oco 托管服务未运行 / 点击重新启动 | oco: Managed server not running / Click to restart |
| oco 启动服务中 | oco: Starting server… |

## extension.ts

| 原中文 | English |
| --- | --- |
| 受限模式下不会启动托管服务（信任工作区后自动启动） | Managed server does not start in Restricted Mode (it starts after you trust the workspace) |
| oco: 托管服务启动失败（…） / 打开设置 / 显示日志 | oco: Failed to start the managed server (…) / Open Settings / Show Log |
| oco: ${what}（${message}） | oco: ${what} (${message}) |
| oco: 受限模式下不能${what}（工作区未受信任） | oco: Cannot ${what} in Restricted Mode (workspace is not trusted) |
| 创建会话 / 重命名会话 / 归档会话 / 删除会话 | create a session / rename a session / archive a session / delete a session |
| 会话不属于当前工作区 | Session is not in the current workspace |
| 连接已变化 | Connection changed |
| 会话不属于同一项目 | Session is not in the same project |
| 无法打开会话 / 无法创建会话 / 无法重命名会话 / 无法归档会话 / 无法删除会话 / 无法设置密码 | Could not open session / Could not create session / Could not rename session / Could not archive session / Could not delete session / Could not set password |
| 需要先打开一个工作区文件夹 | Open a workspace folder first |
| 选择要打开的 OpenCode 会话 | Select an OpenCode session to open |
| 在新面板打开哪个 OpenCode 会话？ | Which OpenCode session should open in a new panel? |
| 新会话 | New Session |
| oco: 没有活动编辑器 | oco: No active editor |
| oco: 请先打开一个会话标签页 | oco: Open a session tab first |
| 加入到哪个会话的草稿？（不会自动发送） | Add to which session draft? (not sent automatically) |
| oco: 托管模式每次启动都生成随机密码并只保存在内存中，不需要设置 | oco: Managed mode generates a random password on each start and keeps it in memory only. Nothing to set. |
| ${origin}（用户 ${user}）的密码，保存在 VS Code SecretStorage… | Password for ${origin} (user ${user}). Stored in VS Code Secret Storage (not in settings), and only for this address and username. |
| oco: 该服务使用非回环 http，密码会明文传输 | oco: This server uses non-loopback HTTP. The password is sent in clear text. |
| 选择要重命名的会话 / 新的会话标题 / 标题不能为空 | Select a session to rename / New session title / Title cannot be empty |
| 选择要归档的会话 | Select a session to archive |
| 选择要删除的会话 | Select a session to delete |
| 删除会话“${title}”？ | Delete session "${title}"? |
| 会话将从服务器上永久删除，无法恢复。 / 删除 | The session will be permanently deleted from the server and cannot be recovered. / Delete |
| 在已加载的最近 200 个会话中按标题或 ID 搜索（留空清除） | Search loaded sessions (latest 200) by title or ID (leave empty to clear) |
| oco: 当前是“连接已有服务”模式… / 打开设置 | oco: Attached mode does not manage the server process. Set oco.serverMode to managed to let oco start the server. / Open Settings |
| oco: 当前不是托管模式，oco 不会停止外部服务 | oco: Not in managed mode. oco will not stop an external server. |
| oco: 当前只有一个工作区文件夹 | oco: This workspace has only one folder |
| 侧栏和新建会话使用哪个文件夹？（已打开的会话标签页不受影响） | Which folder should the sidebar and new sessions use? (Open session tabs are not affected) |
| oco: 诊断信息已生成（不含密码、认证头和消息正文）。分享前请再检查一遍。 | oco: Diagnostics exported (no passwords, auth headers, or message bodies). Review before sharing. |

## managed-server.ts

| 原中文 | English |
| --- | --- |
| 托管模式需要先打开一个工作区文件夹 | Managed mode needs a workspace folder open first |
| 无法启动 ${binary}： | Could not start ${binary}: |
| 托管服务 ${ms} ms 内没有开始监听。最后输出：…（无） | Managed server did not start listening within ${ms} ms. Last output: … (none) |
| 找不到 OpenCode 可执行文件“${binary}”。请在设置 oco.opencodePath 中填写完整路径 | OpenCode executable “${binary}” was not found. Set the full path in oco.opencodePath |
| 没有权限执行“${binary}” | Permission denied to run “${binary}” |
| 托管服务启动失败（退出码 …）。最后输出：…（无） | Managed server failed to start (exit code …). Last output: … (none) |
| 托管服务意外退出（…）。不会自动重启；执行“oco: Restart Managed Server”重新启动 | Managed server exited unexpectedly (…). It will not restart automatically. Run “oco: Restart Managed Server” to start it again |

## open-file-policy.ts

| 原中文 | English |
| --- | --- |
| 路径无效 | Invalid path |
| 只能打开本地文件路径 | Only local file paths can be opened |
| 服务不在本机，无法确认路径对应本地文件 | The server is not on this machine, so the path cannot be confirmed as a local file |
| 会话目录无效 | Invalid session directory |
| 会话目录在本机不存在 | Session directory does not exist on this machine |
| 会话目录不在当前工作区 | Session directory is not in the current workspace |
| 路径超出会话目录 | Path is outside the session directory |
| 文件不存在 | File does not exist |
| 不是文件 | Not a file |

## panels.ts

| 原中文 | English |
| --- | --- |
| oco: 未能加入草稿（…） | oco: Could not add to the draft (…) |
| oco: 无法打开文件（…） | oco: Could not open the file (…) |
| 连接已变化，请重新打开会话 | Connection changed. Reopen the session |
| 打开失败 | Open failed |
