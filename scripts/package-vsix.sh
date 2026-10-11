#!/usr/bin/env bash
# Build and package the oco VSIX (docs/remote-install.md step 1). Output: oco-<version>-<sha>.vsix in the repo root.
# The package holds this build's output, including uncommitted product changes; the SHA only names HEAD.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
test -d vendor/opencode/packages/app/node_modules || { echo "先运行 bash scripts/setup.sh" >&2; exit 1; }
[ "${OCO_SKIP_BUILD:-}" = "1" ] || bun run build
if grep -E '/Users/|xiaojiang' apps/extension/dist/extension.js apps/extension/media/chat/index.html; then
  echo "构建产物含本机路径，停止打包" >&2
  exit 1
fi
SHA="$(git rev-parse --short HEAD)"
DIRTY=""; [ -z "$(git status --porcelain -- apps packages patches)" ] || DIRTY="（构建时有未提交改动）"
STAGE="$(mktemp -d "${TMPDIR:-/tmp}/oco-vsix-XXXX")"
trap 'rm -rf "$STAGE"' EXIT
mkdir -p "$STAGE/dist" "$STAGE/media"
node -e '
const fs = require("fs");
const p = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
delete p.private;
fs.writeFileSync(process.argv[2], JSON.stringify(p, null, 2) + "\n");
' apps/extension/package.json "$STAGE/package.json"
cp apps/extension/dist/extension.js "$STAGE/dist/extension.js"
cp -a apps/extension/media/. "$STAGE/media/"
cp vendor/opencode/LICENSE "$STAGE/LICENSE"
cp CHANGELOG.md "$STAGE/CHANGELOG.md"
cat > "$STAGE/README.md" << EOR
# oco（本地测试包）

OpenCode 的 VS Code 客户端。发布者 oco-local-test 不是应用市场身份。提交 ${SHA}${DIRTY}。
安装后不依赖本仓库，也不需要 Bun。

- 默认连接已有服务（oco.serverUrl，machine 作用域）；需要认证时执行 oco: Set Server Password。
- oco.serverMode = managed 时，oco 在本窗口启动自己的 opencode serve（oco.opencodePath），只管理这个进程。
- 出问题时执行 oco: Export Diagnostics（已脱敏）和 oco: Show Log。
EOR
printf '%s\n' '**/*.map' '**/.DS_Store' 'src/**' 'tsconfig.json' > "$STAGE/.vscodeignore"
VER="$(node -p "require('./apps/extension/package.json').version")"
OUT="$ROOT/oco-${VER}-${SHA}.vsix"
(cd "$STAGE" && npx -y @vscode/vsce@4.0.0 package --no-dependencies --allow-missing-repository --no-rewrite-relative-links --no-gitHubIssueLinking --out "$OUT" >/dev/null)
unzip -t "$OUT" >/dev/null
if unzip -p "$OUT" extension/dist/extension.js | grep -qE '/Users/|xiaojiang'; then echo "VSIX 含本机路径" >&2; exit 1; fi
echo "VSIX=$OUT"
echo "SIZE=$(wc -c < "$OUT" | tr -d ' ')"
echo "EXTENSION_JS_SHA256=$(shasum -a 256 apps/extension/dist/extension.js | awk '{print $1}')"
