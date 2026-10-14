#!/usr/bin/env bash
# Shows a Mac mini task's state: running or done, its new commits (fetched as local branch mini/<id>) and the log tail.
# usage: bash scripts/mini/collect.sh <task-id>
set -euo pipefail
ID=$1 HOST=${OCO_MINI_HOST:-macmini}
ssh "$HOST" "export PATH=/opt/homebrew/bin:\$HOME/.local/bin:\$HOME/.bun/bin:\$PATH; tmux has-session -t mini-$ID 2>/dev/null && echo RUNNING || echo FINISHED; tail -c 1500 ~/oco-mini-logs/$ID.log 2>/dev/null"
git fetch -q "$HOST:Ai-Project/oco" "+mini/$ID:mini/$ID" && git log --oneline "HEAD..mini/$ID" | head -20
