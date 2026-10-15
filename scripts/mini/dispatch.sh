#!/usr/bin/env bash
# Hands a long task (E2E, real-model runs, loops) to the Mac mini: pushes the current branch to the mini's repo
# over ssh (never origin), resets branch mini/<id> in ~/Ai-Project/oco-mini to it and starts run-task.sh in tmux.
# usage: bash scripts/mini/dispatch.sh <task-id> <prompt-file> [base-ref-on-mini]     (protocol: docs/MINI.md)
# With base-ref (for example mini/card7) nothing is pushed: the task starts from that ref already on the mini.
set -euo pipefail
[ $# -ge 2 ] || { echo "usage: dispatch.sh <task-id> <prompt-file> [base-ref-on-mini]" >&2; exit 2; }
ID=$1 PROMPT=$2 HOST=${OCO_MINI_HOST:-macmini}
BR=${3:-$(git rev-parse --abbrev-ref HEAD)}
[ $# -ge 3 ] || git push -q "$HOST:Ai-Project/oco" "$BR"
scp -q "$PROMPT" "$HOST:oco-mini-logs/$ID.prompt.md"
ssh "$HOST" "export PATH=/opt/homebrew/bin:\$HOME/.local/bin:\$HOME/.bun/bin:\$PATH; cd ~/Ai-Project/oco-mini || exit 1
  tmux ls 2>/dev/null | grep -q '^mini-' && { echo 'another mini task is running' >&2; exit 1; }
  # Never let this SSH call create the tmux server: an SSH-started server cannot read the keychain, so claude in it is
  # 'Not logged in' (mac-mini skill). No server: let the GUI-side rc-servers agent start it, then require loggedIn true.
  tmux ls >/dev/null 2>&1 || { launchctl kickstart -k gui/\$(id -u)/com.jarvis.rc-servers; for i in 1 2 3 4 5 6; do sleep 5; tmux ls >/dev/null 2>&1 && break; done; }
  tmux run-shell '\$HOME/.local/bin/claude auth status' 2>/dev/null | grep -q '\"loggedIn\": true' || { echo 'tmux server cannot read the keychain (SSH-started?); not dispatching, see the mac-mini skill' >&2; exit 1; }
  { git diff --quiet && git diff --cached --quiet; } || { echo 'mini worktree has uncommitted changes' >&2; exit 1; }
  git checkout -q -B mini/$ID $BR && tmux new-session -d -s mini-$ID 'OCO_MINI_MODEL=${OCO_MINI_MODEL:-sonnet} bash scripts/mini/run-task.sh $ID ~/oco-mini-logs/$ID.prompt.md' && echo started mini-$ID on $BR"
