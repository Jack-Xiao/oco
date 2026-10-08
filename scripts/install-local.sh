#!/usr/bin/env bash
# Install the packaged VSIX into this Mac's VS Code (replaces deploy-remote.sh now that gcp-workstation is gone).
# Usage: bash scripts/install-local.sh [vsix]   (default: oco-<ver>-<HEAD>.vsix; build it with scripts/package-vsix.sh)
# Afterwards run "Developer: Reload Window" in each open VS Code window, and open a folder: managed mode
# starts the server in the first workspace folder. Never touches OpenCode services.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
VER="$(node -p "require('./apps/extension/package.json').version")"
PUB="$(node -p "require('./apps/extension/package.json').publisher")"
NAME="$(node -p "require('./apps/extension/package.json').name")"
VSIX="${1:-$ROOT/oco-${VER}-$(git rev-parse --short HEAD).vsix}"
test -f "$VSIX" || { echo "找不到 ${VSIX}，先运行 bash scripts/package-vsix.sh" >&2; exit 1; }
CODE="${OCO_CODE_CLI:-$(command -v code || true)}"
[ -n "$CODE" ] || CODE="/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code"
test -x "$CODE" || { echo "找不到 VS Code 命令行（设置 OCO_CODE_CLI）" >&2; exit 1; }
"$CODE" --install-extension "$VSIX" --force >/dev/null
DEST="$HOME/.vscode/extensions/${PUB}.${NAME}-${VER}"
EXPECT="$(unzip -p "$VSIX" extension/dist/extension.js | shasum -a 256 | awk '{print $1}')"
GOT="$(shasum -a 256 "$DEST/dist/extension.js" | awk '{print $1}')"
[ "$EXPECT" = "$GOT" ] || { echo "安装目录的 extension.js 与包内不一致：$DEST" >&2; exit 1; }
WEB_EXPECT="$(unzip -p "$VSIX" extension/media/chat/index.html | shasum -a 256 | awk '{print $1}')"
WEB_GOT="$(shasum -a 256 "$DEST/media/chat/index.html" | awk '{print $1}')"
[ "$WEB_EXPECT" = "$WEB_GOT" ] || { echo "安装目录的 media/chat/index.html 与包内不一致：$DEST" >&2; exit 1; }
echo "INSTALLED=$(basename "$VSIX") -> $DEST"
echo "EXTENSION_JS_SHA256=$GOT"
echo "下一步：在 VS Code 执行 Developer: Reload Window；没有打开文件夹时 oco 会提示 Open Folder。"
