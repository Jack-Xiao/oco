#!/usr/bin/env bash
# Compact status for the main session's periodic check: RUNNING / STALLED / FINISHED <task>, plus the evidence tail
# (running) or the final report tail (finished). Keeps each check to one short tool output.
# usage: bash scripts/mini/patrol.sh <task-id>
ID=${1:?task id} HOST=${OCO_MINI_HOST:-macmini}
ssh -o BatchMode=yes -o ConnectTimeout=10 "$HOST" "export PATH=/opt/homebrew/bin:\$PATH; WT=\$HOME/Ai-Project/oco-mini
  if tmux has-session -t mini-$ID 2>/dev/null; then
    act=\$(find \$WT/docs/evidence \$WT/tests/e2e \$WT/.oco-test \$HOME/oco-mini-logs -type f -mmin -75 2>/dev/null | head -1)
    [ -n \"\$act\" ] && echo \"RUNNING $ID head=\$(git -C \$WT log -1 --format=%h)\" || echo \"STALLED $ID (no file change for 75 min)\"
    tail -n 4 \$WT/docs/evidence/mini-$ID.md 2>/dev/null | cut -c1-220
  else
    echo \"FINISHED $ID head=\$(git -C \$WT log -1 --format=%h)\"; tail -c 1500 \$HOME/oco-mini-logs/$ID.log
  fi"
