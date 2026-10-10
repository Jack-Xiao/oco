# Checkpoint: 节头折叠箭头实现 (Round 3)

- **范围**: `apps/extension/media/sessions-list/index.js`, `apps/extension/media/sessions-list/index.css`
- **状态**: 实现完成，验证通过
- **完成项**:
  - [x] 1. 阅读 `cockpit-inbox-2026-10-10.md` 第三轮规格及现有 index.js / index.css
  - [x] 2. 统一 `.section-head` 样式与折叠箭头对齐（margin 6px + border 1px + padding 2px + chevron 16px + margin-right 4px = 29px）
  - [x] 3. 实现 SESSIONS 节头始终渲染（`data-group="sessions"`）与折叠逻辑（收起时隐藏 recent/more/loadMore 并显示总行数；搜索有内容时强制展开并忽略记忆状态，清空后恢复）
  - [x] 4. 实现 NEEDS ATTENTION 节头折叠逻辑统一，收起只剩节头与待办计数
  - [x] 5. 实现状态持久化（`vscode.getState/setState` 键 `collapsed: { inbox, sessions }`）与键盘无障碍导航（`role="button"`, `aria-expanded`, Enter/Space 切换, `focusables` 包含 `.section-head`）
  - [x] 6. 验证：`node --check` 与 `bun run build:extension` 全部通过
