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
# The manifest too: a keybindings / menus-only change ships no new extension.js, so the two checks above cannot tell
# when another VSIX of the same version overwrote this slot (2026-10-16). VS Code adds `__metadata` on install; drop it.
MANIFEST_SHA() { node -e 'const p=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")); delete p.__metadata; process.stdout.write(JSON.stringify(p))' "$1" | shasum -a 256 | awk '{print $1}'; }
PKG_TMP="$(mktemp "${TMPDIR:-/tmp}/oco-manifest-XXXX")"
unzip -p "$VSIX" extension/package.json > "$PKG_TMP"
PKG_EXPECT="$(MANIFEST_SHA "$PKG_TMP")"; rm -f "$PKG_TMP"
PKG_GOT="$(MANIFEST_SHA "$DEST/package.json")"
[ "$PKG_EXPECT" = "$PKG_GOT" ] || { echo "安装目录的 package.json 与包内不一致（另一个同版本 VSIX 覆盖了这个槽位？）：$DEST" >&2; exit 1; }
echo "INSTALLED=$(basename "$VSIX") -> $DEST"
echo "EXTENSION_JS_SHA256=$GOT"
echo "PACKAGE_JSON_SHA256=$PKG_GOT"
echo "下一步：在 VS Code 执行 Developer: Reload Window；没有打开文件夹时 oco 会提示 Open Folder。"
