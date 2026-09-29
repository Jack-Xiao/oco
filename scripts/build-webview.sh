#!/usr/bin/env bash
# Build the chat webview bundle into apps/extension/media/chat using the vendored app toolchain.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
[ -d "$ROOT/vendor/opencode/packages/app/node_modules" ] || { echo "run: bun run setup" >&2; exit 1; }
ln -sfn ../../vendor/opencode/packages/app/node_modules "$ROOT/apps/chat-webview/node_modules"
cd "$ROOT/apps/chat-webview"
OPENCODE_CHANNEL=prod "$ROOT/vendor/opencode/packages/app/node_modules/.bin/vite" build --config vite.config.ts "$@"
