#!/usr/bin/env bash
# One short Telegram message to the user through the Mac mini's OpenClaw gateway. Target: OCO_NOTIFY_TARGET in
# ~/.oco-mini.env (not in the repo). Never fails the caller; prints why when it cannot send.
# usage: bash scripts/mini/notify.sh "<text>"
export PATH="/opt/homebrew/bin:$PATH" # openclaw is a node script
[ -f "$HOME/.oco-mini.env" ] && . "$HOME/.oco-mini.env"
[ -n "${OCO_NOTIFY_TARGET:-}" ] || { echo "notify: OCO_NOTIFY_TARGET not set; skipped" >&2; exit 0; }
MSG=$(printf '%s' "${1:-}" | head -c 3500)
/opt/homebrew/bin/openclaw message send --channel telegram -t "$OCO_NOTIFY_TARGET" -m "$MSG" >/dev/null 2>&1 || echo "notify: send failed" >&2
exit 0
