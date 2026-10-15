#!/usr/bin/env bash
# Runs on the Mac mini (started by dispatch.sh): setup + build, then one headless Claude Code run of the prompt,
# then a Telegram summary through notify.sh. caffeinate keeps the mini and its display awake for the GUI E2E. Log: ~/oco-mini-logs/<id>.log.
# usage: bash scripts/mini/run-task.sh <task-id> <prompt-file>
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ID=$1 PROMPT=$2 LOG="$HOME/oco-mini-logs/$ID.log"
export PATH="$HOME/.bun/bin:$HOME/.local/bin:/opt/homebrew/bin:$PATH"
cd "$ROOT"
bash scripts/mini/notify.sh "oco mini: $ID 开始（$(git rev-parse --short HEAD)）"
if ! { bun run setup && bun run build; } >"$LOG.setup" 2>&1; then
  bash scripts/mini/notify.sh "oco mini: $ID setup/build 失败，见 ~/oco-mini-logs/$ID.log.setup
$(tail -c 800 "$LOG.setup")"
  exit 1
fi
if ! claude auth status 2>/dev/null | grep -q '"loggedIn": true'; then
  bash scripts/mini/notify.sh "oco mini: $ID 未执行：这个 tmux 服务器读不到钥匙串（多半由 SSH 启动），不是登出；见 mac-mini skill"
  exit 1
fi
caffeinate -dims claude -p "$(cat "$PROMPT")" --model "${OCO_MINI_MODEL:-sonnet}" --dangerously-skip-permissions >"$LOG" 2>&1
RC=$?
bash scripts/mini/notify.sh "oco mini: $ID 结束 rc=$RC head=$(git rev-parse --short HEAD)
$(tail -c 1500 "$LOG")"
