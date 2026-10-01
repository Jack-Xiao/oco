#!/usr/bin/env bash
# Build the chat webview bundle into apps/extension/media/chat using the vendored app toolchain.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
[ -d "$ROOT/vendor/opencode/packages/app/node_modules" ] || { echo "run: bun run setup" >&2; exit 1; }
ln -sfn ../../vendor/opencode/packages/app/node_modules "$ROOT/apps/chat-webview/node_modules"
cd "$ROOT/apps/chat-webview"
OPENCODE_CHANNEL=prod "$ROOT/vendor/opencode/packages/app/node_modules/.bin/vite" build --config vite.config.ts "$@"
# The app chunk is ~4 MB and every new panel loads it through the VS Code resource channel (uncompressed over Remote).
# Ship it gzipped next to the original; apps/extension/src/panels.ts fetches the .gz and inflates it in the page.
for f in "$ROOT"/apps/extension/media/chat/assets/app-*.js; do gzip -9 -n -c "$f" > "$f.gz"; done
