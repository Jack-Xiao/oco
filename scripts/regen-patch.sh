#!/usr/bin/env bash
# Regenerate one patches/opencode/NNNN-*.patch from a source worktree.
# Baseline is a detached HEAD plus every lower-numbered patch, committed
# in a temporary worktree. The new patch is the staged diff of that
# patch's paths (plus any --add paths) copied from the source tree.
set -euo pipefail

export COPYFILE_DISABLE=1
export GIT_PAGER=cat
export GIT_TERMINAL_PROMPT=0
export LANG=C
export LC_ALL=C

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PATCH_DIR="$ROOT/patches/opencode"

usage() {
  cat <<'EOF'
usage: bash scripts/regen-patch.sh <NNNN> [--source <dir>] [--out <file>] [--add <path>]... [--check]

  NNNN          patch number, for example 0020
  --source DIR  tree that already has the desired file contents (default: vendor/opencode)
  --out FILE    also write the generated patch here
  --add PATH    extra source-relative path to include; repeatable
  --check       validate only; do not overwrite patches/opencode
EOF
}

die() {
  echo "regen-patch: $*" >&2
  exit 1
}

TMP=""
BASE=""
VERIFY=""
SOURCE=""
DID_WORKTREE=0

cleanup() {
  # Keep the caller's exit status. Only remove worktrees this run created.
  rc=$?
  set +e
  if [ "$DID_WORKTREE" -eq 1 ] && [ -n "$SOURCE" ]; then
    if [ -n "$BASE" ]; then
      git -C "$SOURCE" worktree remove --force "$BASE" >/dev/null 2>&1
    fi
    if [ -n "$VERIFY" ]; then
      git -C "$SOURCE" worktree remove --force "$VERIFY" >/dev/null 2>&1
    fi
    git -C "$SOURCE" worktree prune >/dev/null 2>&1
  fi
  case "$TMP" in
    *oco-regen.*)
      rm -rf "$TMP"
      ;;
  esac
  if [ "$DID_WORKTREE" -eq 1 ] && [ -n "$SOURCE" ]; then
    git -C "$SOURCE" worktree prune >/dev/null 2>&1
  fi
  return "$rc"
}
trap cleanup EXIT

if [ $# -lt 1 ]; then
  usage >&2
  exit 2
fi

NNNN=""
SOURCE_ARG=""
OUT=""
CHECK=0
ADDS=()

while [ $# -gt 0 ]; do
  case "$1" in
    --source)
      [ $# -ge 2 ] || die "--source requires a directory"
      SOURCE_ARG=$2
      shift 2
      ;;
    --out)
      [ $# -ge 2 ] || die "--out requires a file"
      OUT=$2
      shift 2
      ;;
    --add)
      [ $# -ge 2 ] || die "--add requires a path"
      ADDS[${#ADDS[@]}]=$2
      shift 2
      ;;
    --check)
      CHECK=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    --)
      shift
      break
      ;;
    -*)
      die "unknown option: $1"
      ;;
    *)
      [ -z "$NNNN" ] || die "unexpected argument: $1"
      NNNN=$1
      shift
      ;;
  esac
done
if [ $# -gt 0 ]; then
  die "unexpected argument: $1"
fi
[ -n "$NNNN" ] || { usage >&2; exit 2; }

case "$NNNN" in
  *[!0-9]*) die "patch number must be digits, got: $NNNN" ;;
esac
if [ "${#NNNN}" -gt 4 ]; then
  die "patch number must be at most 4 digits"
fi
NNNN=$(printf '%04d' "$((10#$NNNN))")

if [ -n "$SOURCE_ARG" ]; then
  [ -d "$SOURCE_ARG" ] || die "source is not a directory: $SOURCE_ARG"
  SOURCE=$(cd "$SOURCE_ARG" && pwd)
else
  SOURCE="$ROOT/vendor/opencode"
fi
[ -d "$SOURCE" ] || die "source is not a directory: $SOURCE"
git -C "$SOURCE" rev-parse --is-inside-work-tree >/dev/null 2>&1 \
  || die "source is not a git worktree: $SOURCE"

TMP=$(mktemp -d "${TMPDIR:-/tmp}/oco-regen.XXXXXX")
case "$TMP" in
  "$SOURCE"|"$SOURCE"/*)
    die "temp directory is inside source; set TMPDIR outside the source tree"
    ;;
esac
BASE="$TMP/base"
PATCH_TMP="$TMP/new.patch"
: >"$TMP/paths.raw"
: >"$TMP/priors.txt"

abs_out=""
if [ -n "$OUT" ]; then
  mkdir -p "$(dirname "$OUT")"
  abs_out="$(cd "$(dirname "$OUT")" && pwd)/$(basename "$OUT")"
  patch_abs="$(cd "$PATCH_DIR" && pwd)"
  if [ "$CHECK" -eq 1 ]; then
    case "$abs_out" in
      "$patch_abs"/*)
        die "--check will not write under $PATCH_DIR"
        ;;
    esac
  fi
fi

existing=""
existing_count=0
for p in "$PATCH_DIR"/*.patch; do
  [ -f "$p" ] || continue
  base=$(basename "$p")
  num=${base%%-*}
  case "$num" in
    *[!0-9]*|'') continue ;;
  esac
  num_val=$((10#$num))
  if [ "$num_val" -eq "$((10#$NNNN))" ]; then
    existing_count=$((existing_count + 1))
    existing=$p
  elif [ "$num_val" -lt "$((10#$NNNN))" ]; then
    printf '%s\n' "$p" >>"$TMP/priors.txt"
  fi
done
if [ "$existing_count" -gt 1 ]; then
  die "more than one patch is numbered $NNNN"
fi
if [ "$CHECK" -eq 0 ] && [ -z "$existing" ]; then
  die "no $PATCH_DIR/$NNNN-*.patch to overwrite; pass --out"
fi
LC_ALL=C sort -o "$TMP/priors.txt" "$TMP/priors.txt"

extract_paths() {
  line=""
  rest=""
  a=""
  b=""
  while IFS= read -r line || [ -n "$line" ]; do
    line=${line%$'\r'}
    case "$line" in
      "diff --git "*) ;;
      *) continue ;;
    esac
    rest=${line#"diff --git "}
    case "$rest" in
      \"*)
        rest=${rest#\"}
        a=${rest%%\"*}
        rest=${rest#*\" }
        case "$rest" in
          \"*)
            rest=${rest#\"}
            b=${rest%\"}
            ;;
          *) b=$rest ;;
        esac
        ;;
      *)
        a=${rest%% b/*}
        b=${rest#"$a "}
        ;;
    esac
    a=${a#a/}
    b=${b#b/}
    if [ -n "$a" ] && [ "$a" != "/dev/null" ]; then
      printf '%s\n' "$a"
    fi
    if [ -n "$b" ] && [ "$b" != "$a" ] && [ "$b" != "/dev/null" ]; then
      printf '%s\n' "$b"
    fi
  done <"$1"
}

if [ -n "$existing" ]; then
  extract_paths "$existing" >"$TMP/paths.raw"
fi
if [ "${#ADDS[@]}" -gt 0 ]; then
  i=0
  while [ "$i" -lt "${#ADDS[@]}" ]; do
    printf '%s\n' "${ADDS[$i]}" >>"$TMP/paths.raw"
    i=$((i + 1))
  done
fi
LC_ALL=C sort -u "$TMP/paths.raw" >"$TMP/paths.txt"

paths=()
while IFS= read -r rel || [ -n "${rel:-}" ]; do
  [ -n "$rel" ] || continue
  case "$rel" in
    /*) die "path must be relative to the source root: $rel" ;;
    *\\*) die "backslash in path: $rel" ;;
  esac
  case "/$rel/" in
    */../*|*/../|*//*) die "invalid path: $rel" ;;
  esac
  paths[${#paths[@]}]=$rel
done <"$TMP/paths.txt"
[ "${#paths[@]}" -gt 0 ] || die "no files for patch $NNNN; pass --add"

echo "regen-patch: $NNNN files=${#paths[@]} priors=$(grep -c . "$TMP/priors.txt" || true) source=$SOURCE" >&2

DID_WORKTREE=1
git -C "$SOURCE" worktree add --detach "$BASE" HEAD
src_head=$(git -C "$SOURCE" rev-parse HEAD)
base_head=$(git -C "$BASE" rev-parse HEAD)
[ "$src_head" = "$base_head" ] || die "baseline HEAD does not match source HEAD"

while IFS= read -r prior || [ -n "${prior:-}" ]; do
  [ -n "$prior" ] || continue
  git -C "$BASE" apply --check -- "$prior"
  git -C "$BASE" apply -- "$prior"
done <"$TMP/priors.txt"

git --literal-pathspecs -C "$BASE" add -A -- .
if ! git -C "$BASE" diff --cached --quiet; then
  git -C "$BASE" \
    -c user.name=oco-regen \
    -c user.email=oco-regen@localhost \
    -c commit.gpgsign=false \
    commit --no-verify -q -m "baseline before $NNNN"
fi
echo "regen-patch: baseline $(git -C "$BASE" rev-parse --short HEAD)" >&2

i=0
while [ "$i" -lt "${#paths[@]}" ]; do
  rel=${paths[$i]}
  src="$SOURCE/$rel"
  dst="$BASE/$rel"
  if [ -e "$src" ] || [ -L "$src" ]; then
    if [ -d "$src" ] && [ ! -L "$src" ]; then
      die "refusing to copy a directory: $rel"
    fi
    mkdir -p "$(dirname "$dst")"
    rm -f "$dst"
    cp -p "$src" "$dst"
  elif [ -e "$dst" ] || [ -L "$dst" ]; then
    rm -f "$dst"
  fi
  i=$((i + 1))
done

git --literal-pathspecs -C "$BASE" add -A -- "${paths[@]}"

ws_file="$TMP/whitespace.txt"
set +e
git -C "$BASE" --no-pager diff --cached --check --no-color >"$ws_file" 2>&1
ws_rc=$?
set -e
if [ "$ws_rc" -ne 0 ] || [ -s "$ws_file" ]; then
  echo "regen-patch: git diff --check reported whitespace errors" >&2
  cat "$ws_file" >&2
  exit 1
fi

git -C "$BASE" --no-pager diff --cached --binary --no-color --no-ext-diff >"$PATCH_TMP"

if grep -n '/Users/' "$PATCH_TMP" >"$TMP/users.txt"; then
  echo "regen-patch: patch contains /Users/ absolute paths" >&2
  cat "$TMP/users.txt" >&2
  exit 1
fi

VERIFY="$TMP/verify"
git -C "$SOURCE" worktree add --detach "$VERIFY" HEAD
while IFS= read -r prior || [ -n "${prior:-}" ]; do
  [ -n "$prior" ] || continue
  git -C "$VERIFY" apply --check -- "$prior"
  git -C "$VERIFY" apply -- "$prior"
done <"$TMP/priors.txt"
if [ -s "$PATCH_TMP" ]; then
  git -C "$VERIFY" apply --check -- "$PATCH_TMP"
  git -C "$VERIFY" apply -- "$PATCH_TMP"
fi

[ -d "$SOURCE/packages/app" ] || die "source has no packages/app"
[ -d "$VERIFY/packages/app" ] || die "replay has no packages/app"
set +e
diff -r -x node_modules -x dist -x .turbo \
  "$SOURCE/packages/app" "$VERIFY/packages/app" >"$TMP/app.diff"
diff_rc=$?
set -e
if [ "$diff_rc" -ne 0 ]; then
  echo "regen-patch: packages/app diff is not empty (exit $diff_rc, lines=$(wc -l <"$TMP/app.diff" | tr -d ' '))" >&2
  head -n 40 "$TMP/app.diff" >&2
  exit 1
fi

git -C "$BASE" --no-pager diff --cached --numstat >"$TMP/numstat.txt"
files=0
ins=0
del=0
while IFS="$(printf '\t')" read -r a b _path || [ -n "${a:-}" ]; do
  [ -n "${a:-}" ] || continue
  files=$((files + 1))
  case "$a" in
    [0-9]*) ins=$((ins + a)) ;;
  esac
  case "${b:-}" in
    [0-9]*) del=$((del + b)) ;;
  esac
done <"$TMP/numstat.txt"

write_file() {
  dest=$1
  dest_dir=$(dirname "$dest")
  mkdir -p "$dest_dir"
  tmp_out="$dest_dir/.$(basename "$dest").regen.$$"
  cp "$PATCH_TMP" "$tmp_out"
  mv "$tmp_out" "$dest"
}

echo "$NNNN: $files files, +$ins -$del"
if [ -n "$abs_out" ]; then
  write_file "$abs_out"
  echo "wrote $abs_out"
fi
if [ "$CHECK" -eq 0 ]; then
  if [ "$abs_out" != "$existing" ]; then
    write_file "$existing"
    echo "wrote $existing"
  fi
elif [ -z "$abs_out" ]; then
  echo "check only; patches/opencode not modified"
fi
