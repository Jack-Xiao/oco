#!/usr/bin/env bash
# Hands a long task (E2E, real-model runs, loops) to the Mac mini: pushes the current branch to the mini's repo
# over ssh (never origin), resets branch mini/<id> in ~/Ai-Project/oco-mini to it and starts run-task.sh in tmux.
# usage: bash scripts/mini/dispatch.sh <task-id> <prompt-file>     (protocol: docs/MINI.md)
set -euo pipefail
[ $# -eq 2 ] || { echo "usage: dispatch.sh <task-id> <prompt-file>" >&2; exit 2; }
ID=$1 PROMPT=$2 HOST=${OCO_MINI_HOST:-macmini}
BR=$(git rev-parse --abbrev-ref HEAD)
git push -q "$HOST:Ai-Project/oco" "$BR"
scp -q "$PROMPT" "$HOST:oco-mini-logs/$ID.prompt.md"
ssh "$HOST" "export PATH=/opt/homebrew/bin:\$HOME/.local/bin:\$HOME/.bun/bin:\$PATH; cd ~/Ai-Project/oco-mini || exit 1
  tmux ls 2>/dev/null | grep -q '^mini-' && { echo 'another mini task is running' >&2; exit 1; }
  { git diff --quiet && git diff --cached --quiet; } || { echo 'mini worktree has uncommitted changes' >&2; exit 1; }
  git checkout -q -B mini/$ID $BR && tmux new-session -d -s mini-$ID 'bash scripts/mini/run-task.sh $ID ~/oco-mini-logs/$ID.prompt.md' && echo started mini-$ID on $BR"
