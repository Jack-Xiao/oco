# oco 进度与下一步

更新时间：2026-09-29（P0 完成后）。

## 当前事实

- P0（T001–T006）已完成，结论：**继续首选路线**（ADR-004）。远程门槛 BLOCKED，不得宣称 Remote-SSH 支持。
- 已有：可复现构建（`scripts/setup.sh` + `bun run build`）、最小扩展（打开/新建会话、选区加入指定会话草稿、设置密码）、官方 v1.18.33 对话在 VS Code 标签页中经宿主桥连接真实服务。
- 已验证（本地、macOS、VS Code 1.139.1、OpenCode 1.18.33）：流式、工具+权限、提问、真实取消、三会话隔离、草稿恢复、未保存选区、图片字节、Reload Window、关闭标签不取消。见 `docs/evidence/p0-spike.md`。
- 未验证：Remote-SSH（BLOCKED）、团队实际服务（BLOCKED）、Windows、系统剪贴板图片、中文输入法、主题。
- 上游补丁 1 个：`patches/opencode/0001-oco-draft-insert.patch`。

## 下一批任务

| 顺序 | 任务 | 状态 | 进入条件 |
| --- | --- | --- | --- |
| 1 | T001–T006 P0 | DONE | — |
| 2 | T007 连接与自有进程管理 | TODO | 可开始 |
| 2 | T010 单会话嵌入模式（先于其他 T010 内容） | TODO | 可开始；见 ADR-004“P1 必须先解决” |
| 3 | T008 事件与状态 | TODO | T007 |
| 4 | T009 侧栏 / T010 其余 | TODO | T008 契约固定 |

## P0 实施记录

```text
日期 / 负责人: 2026-09-29 / 集成 AI（T002 源码调查委派给 Grok 子代理，仅写 docs/evidence/upstream.md）
领取任务与写入范围: T001–T006；根构建、apps/extension、apps/chat-webview、packages/contracts、patches/opencode、scripts、tests、docs
已完成行为: 见 docs/evidence/p0-spike.md §1
改动文件: 见 git log（b13134e 起）
已运行检查及结果: bun run typecheck PASS；干净 clone 重建 PASS；api-probe stream/abort PASS；t004 5/5 PASS；t005 9/9 PASS；perf 基线已记录
未运行/被阻塞检查: Remote-SSH BLOCKED；团队服务 BLOCKED；系统剪贴板图片、输入法、主题 NOT RUN
证据与 ADR: docs/evidence/{environment,upstream,p0-spike}.md；docs/adr/001–004
下一批任务: T007、T010（单会话嵌入模式优先）
```

## 未决项及默认处理

| 未决项 | 默认处理 | 何时必须解决 |
| --- | --- | --- |
| 目标 OpenCode 版本/企业修改 | 已固定并验证 1.18.33（本地）；团队服务仍 BLOCKED | 团队提供访问后重跑 E2E |
| 实际远程服务/测试环境 | 本地原型可先走；远程标未验证 | P0 尝试，T016 发布范围前完成 |
| Windows 优先级 | 暂不承诺 Windows 本地支持 | T001；正式支持声明前 |
| 上游源码引入与包管理 | 已决定：setup 脚本浅克隆固定 SHA + 补丁 + 上游锁文件 | ADR-002 |
| 官方 UI 网络/事件接入路径 | 已决定：虚拟服务源 + 宿主流式桥；共享订阅待 T008 | ADR-003 |
| publisher/扩展 ID/渠道 | 不发布；仅后续本地测试身份 | T018/T019 |

## 实施更新格式

由集成人每个可交付批次更新，不要求为每一条命令写日志：

```text
日期 / 负责人:
领取任务与写入范围:
已完成行为:
改动文件:
已运行检查及结果:
未运行/被阻塞检查:
证据与 ADR:
下一批任务:
```

## 当前推荐交接

把 `docs/HANDOFF.md` 中的“首轮实施提示词”交给一个集成 AI；它负责推进 P0，必要时按任务边界委派只读调查。完成后提交可运行原型、证据和路线结论，再领取 P1。
