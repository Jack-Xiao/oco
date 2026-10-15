#!/usr/bin/env bash
# Zero-token watchdog on the Mac mini (tmux `watch-mini`): every 20 min, if a mini-* task runs but no file under its
# worktree evidence / tests / .oco-test or ~/oco-mini-logs changed for STALL_MIN minutes, send one Telegram alert
# (re-armed once files change again). Finishing is reported by run-task.sh itself.
# usage: tmux new-session -d -s watch-mini 'bash ~/oco-mini-logs/watchdog.sh'
export PATH="/opt/homebrew/bin:$HOME/.local/bin:$PATH"
STALL=${STALL_MIN:-75} WT="$HOME/Ai-Project/oco-mini" alerted=""
while true; do
  S=$(tmux ls -F '#S' 2>/dev/null | grep '^mini-' | head -1)
  if [ -n "$S" ]; then
    recent=$(find "$WT/docs/evidence" "$WT/tests/e2e" "$WT/.oco-test" "$HOME/oco-mini-logs" -type f -mmin "-$STALL" 2>/dev/null | head -1)
    if [ -z "$recent" ] && [ "$alerted" != "$S" ]; then
      bash "$WT/scripts/mini/notify.sh" "oco mini 看门狗：$S 已 $STALL 分钟没有文件更新，可能卡住（tmux 仍在运行）。"
      alerted=$S
    elif [ -n "$recent" ]; then
      alerted=""
    fi
  fi
  sleep 1200
done
