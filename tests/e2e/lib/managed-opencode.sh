#!/usr/bin/env bash
# Stand-in "opencode" for the t007-managed suite: the real binary with an isolated HOME/XDG and the mock
# model config, so the managed server never reads the user's OpenCode state. Arguments pass through.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
M="$ROOT/.oco-test/managed"
mkdir -p "$M"/{home,xdg/config/opencode,xdg/data,xdg/state,xdg/cache}
sed "s#127.0.0.1:4518/#127.0.0.1:${OCO_MOCK_LLM_PORT:-4518}/#" "$ROOT/scripts/test-server.mock.opencode.json" > "$M/xdg/config/opencode/opencode.json"
BIN="${OCO_OPENCODE_BIN:-$(command -v opencode)}"
exec env HOME="$M/home" XDG_CONFIG_HOME="$M/xdg/config" XDG_DATA_HOME="$M/xdg/data" XDG_STATE_HOME="$M/xdg/state" XDG_CACHE_HOME="$M/xdg/cache" \
  OPENCODE_DISABLE_AUTOUPDATE=1 "$BIN" "$@"
