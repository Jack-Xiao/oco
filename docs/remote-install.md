# 构建并安装到 VS Code Remote

把当前工作区的 oco 扩展打成 VSIX，装到 SSH 主机 `gcp-workstation` 上的 VS Code Server。扩展的 `extensionKind` 是 `workspace`，必须装在远程扩展目录里；只装在 Mac 本机不会出现在 Remote 窗口。

这是本机已跑通的更新步骤，不是 Remote-SSH 功能验收，也不会启动、停止或替换 OpenCode 服务。`*.vsix` 已被 `.gitignore` 忽略，不要提交安装包。

## 前置

- 仓库依赖已经准备好：`bash scripts/setup.sh`（只需在依赖或上游缺失时重做）。
- 本机有 Bun，以及 SSH 配置里的主机别名 `gcp-workstation`。
- Remote 窗口此前已经装过 `oco-local-test.oco`。下面的覆盖安装依赖这条登记；第一次安装或改了 `apps/extension/package.json` 的版本号时，用文末的另一种方法。

在仓库根目录执行后面的命令。

## 1. 构建并打包

包的内容是这一次 `bun run build` 的产物，包含尚未提交的产品改动。文件名里的提交号只表示当时的 `HEAD`。

```bash
set -euo pipefail
test -d vendor/opencode/packages/app/node_modules || { echo "先运行 bash scripts/setup.sh" >&2; exit 1; }
bun run build
if grep -E '/Users/|xiaojiang' apps/extension/dist/extension.js apps/extension/media/chat/index.html; then
  echo "构建产物含本机路径，停止打包" >&2
  exit 1
fi

SHA="$(git rev-parse --short HEAD)"
STAGE="$(mktemp -d /tmp/oco-vsix-XXXX)"
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
cat > "$STAGE/README.md" << EOF
# oco（本地测试包）

发布者 oco-local-test 不是应用市场身份。提交 ${SHA}。
安装后不依赖本仓库，也不需要 Bun。本扩展不启动或替换 OpenCode 服务。
用户设置（machine 作用域）配置 oco.serverUrl。需要认证时执行 oco: Set Server Password。
EOF
printf '%s\n' '**/*.map' '**/.DS_Store' 'src/**' 'tsconfig.json' > "$STAGE/.vscodeignore"
VER="$(node -p "require('./apps/extension/package.json').version")"
OUT="$PWD/oco-${VER}-${SHA}.vsix"
(cd "$STAGE" && bunx --bun @vscode/vsce package \
  --no-dependencies \
  --allow-missing-repository \
  --no-rewrite-relative-links \
  --no-gitHubIssueLinking \
  --out "$OUT")
rm -rf "$STAGE"
unzip -t "$OUT" >/dev/null
echo "VSIX=$OUT"
shasum -a 256 apps/extension/dist/extension.js
```

暂存目录里会去掉 `private`，避免 vsce 拒绝打包。不要改仓库里的 `apps/extension/package.json`。对话页的几百个 JavaScript 文件是 webview 资源，保留；扩展宿主只有 `dist/extension.js`。

## 2. 装到 gcp-workstation

普通 SSH 里执行远程的 `code --install-extension` 会失败，提示只能在 WSL 或 VS Code 终端里使用。已经登记过的同版本扩展，用覆盖扩展目录的方式更新。隧道有时要一两分钟，出现 `Opening a fresh IAM tunnel` 是正常的。

```bash
set -euo pipefail
SHA="$(git rev-parse --short HEAD)"
VER="$(node -p "require('./apps/extension/package.json').version")"
PUB="$(node -p "require('./apps/extension/package.json').publisher")"
NAME="$(node -p "require('./apps/extension/package.json').name")"
VSIX="$PWD/oco-${VER}-${SHA}.vsix"
LOCAL_JS="$(shasum -a 256 apps/extension/dist/extension.js | awk '{print $1}')"
REMOTE_NAME="${PUB}.${NAME}-${VER}"
test -f "$VSIX"
scp -o BatchMode=yes "$VSIX" "gcp-workstation:/tmp/${REMOTE_NAME}.vsix"
ssh -o BatchMode=yes gcp-workstation "python3 - '$REMOTE_NAME' '$LOCAL_JS'" << 'PY'
import hashlib, json, os, shutil, sys, zipfile
remote_name, expect = sys.argv[1], sys.argv[2]
src = f"/tmp/{remote_name}.vsix"
stage = "/tmp/oco-vsix-extract"
dest = os.path.expanduser(f"~/.vscode-server/extensions/{remote_name}")
print("UPLOADED", os.path.getsize(src))
shutil.rmtree(stage, ignore_errors=True)
os.makedirs(stage)
with zipfile.ZipFile(src) as z:
    z.extractall(stage)
ext = os.path.join(stage, "extension")
pkg = json.load(open(os.path.join(ext, "package.json")))
assert f"{pkg['publisher']}.{pkg['name']}-{pkg['version']}" == remote_name, pkg
assert pkg["main"] == "./dist/extension.js"
got = hashlib.sha256(open(os.path.join(ext, "dist", "extension.js"), "rb").read()).hexdigest()
if got != expect:
    raise SystemExit(f"包内 extension.js 与本机不一致: {got}")
if not os.path.isdir(dest):
    raise SystemExit(f"远程还没有 {dest}。先用文末的 VS Code 终端方法安装一次。")
reg = json.load(open(os.path.expanduser("~/.vscode-server/extensions/extensions.json")))
hit = [e for e in reg if (e.get("identifier") or {}).get("id") == f"{pkg['publisher']}.{pkg['name']}"]
if len(hit) != 1 or hit[0]["location"]["path"] != dest:
    raise SystemExit("extensions.json 的登记路径与目标目录不一致，停止覆盖。")
# 暂存目录必须在扩展目录之外：运行中的 VS Code Server 会把扩展目录里新出现的
# "<名字>.new" 登记为这个扩展，改名后登记指向不存在的目录，扩展就从窗口里消失。
work = os.path.expanduser("~/.oco-ext-stage")
os.makedirs(work, exist_ok=True)
fresh = os.path.join(work, remote_name + ".new")
shutil.rmtree(fresh, ignore_errors=True)
shutil.copytree(ext, fresh)
installed = hashlib.sha256(open(os.path.join(fresh, "dist", "extension.js"), "rb").read()).hexdigest()
if installed != expect:
    shutil.rmtree(fresh)
    raise SystemExit(f"装上之前哈希不一致: {installed}")
old = os.path.join(work, remote_name + ".old")
shutil.rmtree(old, ignore_errors=True)
os.rename(dest, old)
os.rename(fresh, dest)
shutil.rmtree(old)
reg = json.load(open(os.path.expanduser("~/.vscode-server/extensions/extensions.json")))
hit = [e for e in reg if (e.get("identifier") or {}).get("id") == f"{pkg['publisher']}.{pkg['name']}"]
if len(hit) != 1 or hit[0]["location"]["path"] != dest:
    raise SystemExit("替换后 extensions.json 的登记路径变了，需要人工检查。")
print("NEW_JS", installed)
print("REGISTERED", hit[0]["identifier"]["id"], hit[0]["version"], dest)
shutil.rmtree(stage)
os.remove(src)
print("INSTALLED")
PY
```

`NEW_JS` 必须等于本机 `apps/extension/dist/extension.js` 的 SHA-256。哈希不一致时不会改掉正在使用的扩展目录。

## 3. 让远程窗口用上新代码

在 **SSH: gcp-workstation** 窗口的命令面板执行 `Developer: Reload Window`。不重载的话，扩展宿主仍运行替换前的代码。

`oco.serverUrl` 在远程窗口里按 machine 作用域生效，默认 `http://127.0.0.1:4096`。这里的 `127.0.0.1` 是工作站自己，不是 Mac。需要认证时在该窗口执行 `oco: Set Server Password`。

## 第一次安装，或改了版本号

覆盖目录不会改 `extensions.json`。版本号变了以后目录名会变，旧登记仍指向旧目录。这时：

1. 完成本文第 1 步。文件名是 `oco-<版本>-<提交号>.vsix`，例如版本 `0.0.1`、提交 `26a784c` 时为 `oco-0.0.1-26a784c.vsix`。把它拷到工作站：

```bash
scp -o BatchMode=yes oco-<版本>-<提交号>.vsix gcp-workstation:/tmp/
```

2. 在已经连上 `gcp-workstation` 的 VS Code 窗口里打开终端（不要用 Mac 上的普通 SSH），执行：

```bash
code --install-extension /tmp/oco-<版本>-<提交号>.vsix --force
```

3. 按提示重载窗口。之后同版本更新可以继续用第 2 步的覆盖安装。

不开 Remote 窗口也可以从 Mac 用服务端自带的 CLI 安装（0.0.4 时验证过，会更新 `extensions.json` 登记）：

```bash
ssh -o BatchMode=yes gcp-workstation 'S=$(ls -td ~/.vscode-server/cli/servers/Stable-*/ | head -1); ${S}server/bin/code-server --install-extension /tmp/oco-<版本>-<提交号>.vsix --force'
```
