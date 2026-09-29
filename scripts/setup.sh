#!/usr/bin/env bash
# Reproducible setup from a clean checkout:
#   1. fetch upstream OpenCode at the pinned tag and verify the exact SHA
#   2. apply oco patches (patches/opencode/*.patch)
#   3. install upstream deps with its frozen lockfile, and oco root deps
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TAG="v1.18.33"
SHA="51ef4be1d3c122f18fefb510dca8d778571f4f18"
V="$ROOT/vendor/opencode"
if [ ! -d "$V/.git" ]; then
  git clone --quiet --depth 1 --branch "$TAG" https://github.com/anomalyco/opencode.git "$V"
fi
ACTUAL="$(git -C "$V" rev-parse HEAD)"
[ "$ACTUAL" = "$SHA" ] || { echo "vendor/opencode is at $ACTUAL, expected $SHA" >&2; exit 1; }
if [ -n "$(git -C "$V" status --porcelain -- packages)" ]; then
  echo "vendor/opencode has local changes; resetting to pinned SHA before applying patches"
  git -C "$V" checkout --quiet -- packages
fi
for p in "$ROOT"/patches/opencode/*.patch; do
  git -C "$V" apply --check "$p" && git -C "$V" apply "$p" && echo "applied $(basename "$p")"
done
(cd "$V" && bun install --frozen-lockfile)
(cd "$ROOT" && bun install --frozen-lockfile)
ln -sfn ../../vendor/opencode/packages/app/node_modules "$ROOT/apps/chat-webview/node_modules"
echo "setup done: bun run build"
