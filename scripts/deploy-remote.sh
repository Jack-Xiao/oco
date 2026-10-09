#!/usr/bin/env bash
# Overwrite-install the packaged VSIX into an SSH host's VS Code Server (docs/remote-install.md step 2).
# Usage: bash scripts/deploy-remote.sh [host] [vsix]   (default host: gcp-workstation; default vsix: oco-<ver>-<HEAD>.vsix)
# Requires an earlier install of the same publisher.name-version on that host (first install: see the doc).
# Afterwards run "Developer: Reload Window" in the Remote window. Never touches OpenCode services.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
HOST="${1:-gcp-workstation}"
VER="$(node -p "require('./apps/extension/package.json').version")"
PUB="$(node -p "require('./apps/extension/package.json').publisher")"
NAME="$(node -p "require('./apps/extension/package.json').name")"
VSIX="${2:-$ROOT/oco-${VER}-$(git rev-parse --short HEAD).vsix}"
test -f "$VSIX" || { echo "找不到 ${VSIX}，先运行 bash scripts/package-vsix.sh" >&2; exit 1; }
EXPECT="$(unzip -p "$VSIX" extension/dist/extension.js | shasum -a 256 | awk '{print $1}')"
REMOTE_NAME="${PUB}.${NAME}-${VER}"
scp -q -o BatchMode=yes "$VSIX" "$HOST:/tmp/${REMOTE_NAME}.vsix"
ssh -o BatchMode=yes "$HOST" "python3 - '$REMOTE_NAME' '$EXPECT'" << 'PY'
import hashlib, json, os, shutil, sys, zipfile
remote_name, expect = sys.argv[1], sys.argv[2]
src = f"/tmp/{remote_name}.vsix"
stage = "/tmp/oco-vsix-extract"
dest = os.path.expanduser(f"~/.vscode-server/extensions/{remote_name}")
shutil.rmtree(stage, ignore_errors=True)
os.makedirs(stage)
with zipfile.ZipFile(src) as z:
    z.extractall(stage)
ext = os.path.join(stage, "extension")
pkg = json.load(open(os.path.join(ext, "package.json")))
assert f"{pkg['publisher']}.{pkg['name']}-{pkg['version']}" == remote_name, pkg
sha = lambda p: hashlib.sha256(open(p, "rb").read()).hexdigest()
if sha(os.path.join(ext, "dist", "extension.js")) != expect:
    raise SystemExit("包内 extension.js 哈希不一致")
if not os.path.isdir(dest):
    raise SystemExit(f"远程还没有 {dest}。先按 docs/remote-install.md 在 VS Code 终端安装一次。")
reg = json.load(open(os.path.expanduser("~/.vscode-server/extensions/extensions.json")))
hit = [e for e in reg if (e.get("identifier") or {}).get("id") == f"{pkg['publisher']}.{pkg['name']}"]
if len(hit) != 1 or hit[0]["location"]["path"] != dest:
    raise SystemExit("extensions.json 的登记路径与目标目录不一致，停止覆盖。")
# Stage outside the extensions dir: a running VS Code Server registers a new "<name>.new" there as this
# extension, and after the rename the registration points at a missing directory (oco disappears).
stage_root = os.path.expanduser("~/.oco-ext-stage")
os.makedirs(stage_root, exist_ok=True)
fresh, old = os.path.join(stage_root, remote_name + ".new"), os.path.join(stage_root, remote_name + ".old")
shutil.rmtree(fresh, ignore_errors=True)
shutil.copytree(ext, fresh)
if sha(os.path.join(fresh, "dist", "extension.js")) != expect:
    shutil.rmtree(fresh)
    raise SystemExit("复制后哈希不一致")
shutil.rmtree(old, ignore_errors=True)
os.rename(dest, old)
os.rename(fresh, dest)
shutil.rmtree(old)
reg = json.load(open(os.path.expanduser("~/.vscode-server/extensions/extensions.json")))
hit = [e for e in reg if (e.get("identifier") or {}).get("id") == f"{pkg['publisher']}.{pkg['name']}"]
if len(hit) != 1 or hit[0]["location"]["path"] != dest:
    raise SystemExit("替换后 extensions.json 的登记路径不是目标目录，见 docs/remote-install.md。")
shutil.rmtree(stage)
os.remove(src)
print("INSTALLED", remote_name, sha(os.path.join(dest, "dist", "extension.js")))
PY
echo "在 SSH: $HOST 窗口执行 Developer: Reload Window 以加载新代码"
