#!/usr/bin/env bash
# Start an ISOLATED local OpenCode v1 server for oco development.
# - All OpenCode state/config lives under .oco-test/ (never touches ~/.config/opencode or ~/.local/share/opencode).
# - Basic auth is enabled with a random secret stored in .oco-test/secret (mode 600, gitignored).
# - Does not install, upgrade or stop any other OpenCode service.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
T="$ROOT/.oco-test"
PORT="${OCO_TEST_PORT:-4517}"
BIN="${OCO_OPENCODE_BIN:-$(command -v opencode)}"
mkdir -p "$T"/{home,xdg/config,xdg/data,xdg/state,xdg/cache,workspace}
mkdir -p "$T/xdg/config/opencode"
cp "$ROOT/scripts/test-server.opencode.json" "$T/xdg/config/opencode/opencode.json"
if [ ! -s "$T/secret" ]; then (umask 077; openssl rand -hex 16 > "$T/secret"); fi
if [ ! -d "$T/workspace/.git" ]; then
  (cd "$T/workspace" && git init -q && printf 'export function add(a: number, b: number) {\n  return a + b\n}\n' > math.ts \
    && git add -A && git -c user.email=test@oco.local -c user.name=oco-test commit -qm init)
fi
echo "opencode binary: $BIN ($("$BIN" --version))"
echo "listening on http://127.0.0.1:$PORT (user: opencode, password: see .oco-test/secret)"
cd "$T/workspace"
exec env -i PATH="$PATH" TERM="${TERM:-xterm}" LANG="${LANG:-en_US.UTF-8}" \
  HOME="$T/home" OPENCODE_TEST_HOME="$T/home" \
  XDG_CONFIG_HOME="$T/xdg/config" XDG_DATA_HOME="$T/xdg/data" \
  XDG_STATE_HOME="$T/xdg/state" XDG_CACHE_HOME="$T/xdg/cache" \
  OPENCODE_SERVER_PASSWORD="$(cat "$T/secret")" \
  OPENCODE_DISABLE_AUTOUPDATE=1 \
  "$BIN" serve --hostname 127.0.0.1 --port "$PORT" "$@"
