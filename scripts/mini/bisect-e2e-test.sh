#!/usr/bin/env bash
# One `git bisect run` step for a mock E2E regression on the Mac mini (protocol: docs/MINI.md, example prompt: docs/mini/bisect-draft.md).
# Builds the checked-out commit, runs the mock suites that own the watched cases once (a suite whose watched case failed runs
# one more time to tell flaky from stable), caches the verdicts per fingerprint of the non-doc tree, and exits the way
# `git bisect run` expects: 0 good, 1 bad, 125 skip (build failed / watched case not recorded), 200 abort (harness unusable, deadline).
# The script lives outside the repo (copied to ~/oco-mini-logs/<task>/) because the checkout changes under it.
# env: BISECT_DIR (state; default ~/oco-mini-logs/bisect)   BISECT_SPECS ("suite:case ..."; default c14 + p1b-sidebar)
#      BISECT_PREDICATE (any = bad if any spec FAILs | one spec = bad iff that case FAILs)   BISECT_DEADLINE (epoch s)
#      BISECT_RUN_TIMEOUT (s per overnight run, default 1500)   plus the E2E env: OCO_VSCODE_BIN, OCO_OPENCODE_BIN,
#      OCO_TEST_PORT, OCO_MOCK_LLM_PORT, OCO_TEST_URL.
# usage: BISECT_PREDICATE=c14-review-notes:draft-acked bash bisect-e2e-test.sh      (inside the repo, on the commit to judge)
set -u
# Inside a linked worktree (the mini's ~/Ai-Project/oco-mini) `git bisect run` exports GIT_DIR to its command, which would make every
# `git -C vendor/opencode ...` act on the outer repo. vendor/opencode is a repo of its own: never inherit any of this.
unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_PREFIX GIT_COMMON_DIR
ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || { echo "bisect-test: not inside a git repo" >&2; exit 200; }
cd "$ROOT" || exit 200
DIR=${BISECT_DIR:-$HOME/oco-mini-logs/bisect}
SPECS=${BISECT_SPECS:-"c14-review-notes:draft-acked p1b-sidebar:chain-draft"}
PRED=${BISECT_PREDICATE:-any}
RUN_TIMEOUT=${BISECT_RUN_TIMEOUT:-1500}
mkdir -p "$DIR/cache" "$DIR/logs" || exit 200
SHA=$(git rev-parse --short=7 HEAD)
SUBJECT=$(git log -1 --format=%s HEAD | cut -c1-90)
# Docs and the mini scripts do not change what the suites exercise: commits that differ only there share one verdict.
FP=$(git ls-tree -r HEAD | awk -F'\t' '$2 !~ /^docs\// && $2 !~ /^scripts\/mini\//' | shasum | cut -c1-16)
CACHE="$DIR/cache/$FP"
SUMMARY=""
RC=""

say() { echo "[bisect $(date +%H:%M:%S) $SHA] $*"; }
get() { grep -m1 "^$1=" "$CACHE" 2>/dev/null | cut -d= -f2-; }
tget() { grep -m1 "^$1=" "$2" 2>/dev/null | cut -d= -f2-; }

# case_status <summary.md> <suite> <case>  ->  PASS | FAIL | NOT RUN | ... | MISSING (suite or case not recorded)
case_status() {
  local f
  f=$(grep -o 'docs/evidence/runs/[^ |]*results\.json' "$1" 2>/dev/null | grep -- "-$2-" | tail -1)
  if [ -z "$f" ] || [ ! -f "$f" ]; then echo MISSING; return; fi
  node -e 'try{const j=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));const r=(j.results||[]).find(x=>x.id===process.argv[2]);console.log(r?r.status:"MISSING")}catch{console.log("MISSING")}' "$f" "$3"
}

# run_suites <tag> <suite...>: one overnight-e2e mock run; sets SUMMARY (summary.md path or "") and RC (its exit code).
run_suites() {
  local tag=$1 out pid waited=0 port p
  shift
  out="$DIR/logs/$SHA.$tag.log"
  : > "$out"
  set -m
  bash scripts/overnight-e2e.sh --mock --lock-wait 900 "$@" > "$out" 2>&1 &
  pid=$!
  set +m
  while kill -0 "$pid" 2>/dev/null; do
    sleep 5
    waited=$((waited + 5))
    if [ "$waited" -ge "$RUN_TIMEOUT" ]; then
      say "run $tag still going after ${RUN_TIMEOUT}s: stopping its process group"
      kill -TERM -- "-$pid" 2>/dev/null
      sleep 30
      kill -KILL -- "-$pid" 2>/dev/null
      # The test server runs in a group of its own: free the ports reserved for this bisect (never the leftover services' ports).
      for port in ${OCO_TEST_PORT:-} ${OCO_MOCK_LLM_PORT:-}; do
        case "$port" in 4517|4518|4527|4528) continue ;; esac
        for p in $(lsof -nP -t -iTCP:"$port" -sTCP:LISTEN 2>/dev/null); do kill -TERM "$p" 2>/dev/null; done
      done
      break
    fi
  done
  wait "$pid" 2>/dev/null
  RC=$?
  SUMMARY=$(grep -m1 '^summary:' "$out" | awk '{print $2}')
}

if [ ! -s "$CACHE" ]; then
  if [ -n "${BISECT_DEADLINE:-}" ] && [ "$(date +%s)" -ge "$BISECT_DEADLINE" ]; then say "deadline passed: abort"; exit 200; fi
  say "no cached verdict for tree fingerprint $FP ($SUBJECT): build + run"
  VENDOR="$ROOT/vendor/opencode"
  if [ -d "$VENDOR/.git" ]; then
    # vendor/opencode must resolve to its own repo: a failed discovery would make these commands act on the outer repo
    # (mini bisect-draft 2026-10-16 21:11 wrote the outer repo's top-level files into vendor/opencode).
    if [ "$(git -C "$VENDOR" rev-parse --show-toplevel 2>/dev/null)" != "$(cd "$VENDOR" && pwd -P)" ]; then
      say "vendor/opencode does not resolve to its own git repo: abort"
      exit 200
    fi
    # Start every build from the pinned upstream tree: the patch chain differs between commits (0026-0028 come and go).
    git --git-dir="$VENDOR/.git" --work-tree="$VENDOR" checkout -q -- . 2>/dev/null
    git --git-dir="$VENDOR/.git" --work-tree="$VENDOR" clean -fdq -- packages 2>/dev/null
  fi
  if ! { bun run setup && bun run build; } > "$DIR/logs/$SHA.build.log" 2>&1; then
    say "setup/build failed (logs/$SHA.build.log): skip"
    printf '%s\t%s\t%s\t%s\tbuild=FAIL\n' "$(date '+%F %T')" "$SHA" "$FP" "$SUBJECT" >> "$DIR/verdicts.tsv"
    exit 125
  fi
  T="$CACHE.tmp.$$"
  { echo "sha=$SHA"; echo "build=OK"; } > "$T"
  SUITES=""
  for spec in $SPECS; do
    case " $SUITES " in *" ${spec%%:*} "*) ;; *) SUITES="$SUITES ${spec%%:*}" ;; esac
  done
  # shellcheck disable=SC2086
  run_suites run1 $SUITES
  SUM1=$SUMMARY
  RC1=$RC
  if [ "$RC1" = 3 ]; then
    # overnight-e2e.sh exit 3 = lock not acquired / test server not usable. A broken harness shows at the endpoints
    # (bisect-e2e.sh judges them first); inside the range it is a commit whose server will not start: skip it.
    say "E2E harness exit 3 (lock or test server, see logs/$SHA.run1.log): skip"
    printf '%s\t%s\t%s\t%s\tharness-exit-3\n' "$(date '+%F %T')" "$SHA" "$FP" "$SUBJECT" >> "$DIR/verdicts.tsv"
    rm -f "$T"
    exit 125
  fi
  RERUN=""
  for spec in $SPECS; do
    st=$(case_status "$SUM1" "${spec%%:*}" "${spec#*:}")
    echo "$spec.first=$st" >> "$T"
    if [ "$st" = FAIL ]; then
      case " $RERUN " in *" ${spec%%:*} "*) ;; *) RERUN="$RERUN ${spec%%:*}" ;; esac
    fi
  done
  SUM2=""
  if [ -n "$RERUN" ]; then
    say "watched case failed in:$RERUN - one more run"
    # shellcheck disable=SC2086
    run_suites run2 $RERUN
    SUM2=$SUMMARY
  fi
  ANY_REAL=0
  for spec in $SPECS; do
    st1=$(tget "$spec.first" "$T")
    st2=""
    fin=$st1
    if [ "$st1" = FAIL ]; then
      [ -n "$SUM2" ] && st2=$(case_status "$SUM2" "${spec%%:*}" "${spec#*:}")
      if [ "$st2" = PASS ]; then fin=PASS; else fin=FAIL; fi # a pass on the repeat counts as a pass (flaky)
    fi
    echo "$spec.second=$st2" >> "$T"
    echo "$spec=$fin" >> "$T"
    case "$fin" in PASS|FAIL) ANY_REAL=1 ;; esac
  done
  { echo "summary1=$SUM1"; echo "summary2=$SUM2"; echo "rc1=$RC1"; } >> "$T"
  ROW=$(for spec in $SPECS; do printf '%s=%s(%s>%s) ' "$spec" "$(tget "$spec" "$T")" "$(tget "$spec.first" "$T")" "$(tget "$spec.second" "$T")"; done)
  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\n' "$(date '+%F %T')" "$SHA" "$FP" "$SUBJECT" "$ROW" "$SUM1" "$SUM2" >> "$DIR/verdicts.tsv"
  # A run that recorded none of the watched cases says nothing about the commit: no cache, skip.
  if [ "$ANY_REAL" = 0 ]; then mv "$T" "$DIR/logs/$SHA.nocache"; say "no watched case recorded (logs/$SHA.run1.log): skip"; exit 125; fi
  mv "$T" "$CACHE"
  if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
    say "the run modified tracked files, restoring them:"; git status --porcelain --untracked-files=no | head -5
    git checkout -q -- .
  fi
else
  say "cache hit for tree fingerprint $FP (first judged at $(get sha))"
fi

nfail=0 npass=0 total=0
for spec in $SPECS; do
  if [ "$PRED" != any ] && [ "$PRED" != "$spec" ]; then continue; fi
  total=$((total + 1))
  case "$(get "$spec")" in FAIL) nfail=$((nfail + 1)) ;; PASS) npass=$((npass + 1)) ;; esac
done
if [ "$nfail" -gt 0 ]; then V=1; WORD=bad
elif [ "$total" -gt 0 ] && [ "$npass" -eq "$total" ]; then V=0; WORD=good
else V=125; WORD=skip; fi
say "RESULT predicate=$PRED $(for spec in $SPECS; do printf '%s=%s ' "$spec" "$(get "$spec")"; done)-> $WORD"
exit $V
