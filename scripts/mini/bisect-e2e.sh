#!/usr/bin/env bash
# Binary-searches a mock E2E regression on the Mac mini: for every watched spec it first judges both endpoints (a good ref
# that fails or a bad ref that passes means the regression is not what the refs say), then runs
# `git bisect run bisect-e2e-test.sh`. Verdicts are cached per tree fingerprint, so the second spec mostly reuses runs.
# Lives outside the repo at run time (copied to ~/oco-mini-logs/<task>/ with bisect-e2e-test.sh next to it).
# usage: bash bisect-e2e.sh <good-ref> <bad-ref> [max-minutes]      (run from the repo root, not on a branch you care about:
#        the script leaves the checkout on the branch it started on)
# env: BISECT_DIR (default ~/oco-mini-logs/bisect), BISECT_SPECS, and the E2E env described in bisect-e2e-test.sh.
# Output: stdout progress, $BISECT_DIR/chain.result (one line per spec), bisect-<spec>.out / .log, verdicts.tsv.
set -u
[ $# -ge 2 ] || { echo "usage: bisect-e2e.sh <good-ref> <bad-ref> [max-minutes]" >&2; exit 2; }
HERE=$(cd "$(dirname "$0")" && pwd)
TEST="$HERE/bisect-e2e-test.sh"
ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || { echo "not inside a git repo" >&2; exit 2; }
cd "$ROOT" || exit 2
export BISECT_DIR=${BISECT_DIR:-$HOME/oco-mini-logs/bisect}
export BISECT_SPECS=${BISECT_SPECS:-"c14-review-notes:draft-acked p1b-sidebar:chain-draft"}
MAXMIN=${3:-150}
mkdir -p "$BISECT_DIR" || exit 2
GOOD_SHA=$(git rev-parse --verify -q "$1^{commit}") || { echo "unknown good ref $1" >&2; exit 2; }
BAD_SHA=$(git rev-parse --verify -q "$2^{commit}") || { echo "unknown bad ref $2" >&2; exit 2; }
START=$(date +%s)
export BISECT_DEADLINE=$((START + MAXMIN * 60))
ORIG=$(git rev-parse --abbrev-ref HEAD)
[ "$ORIG" = HEAD ] && ORIG=$(git rev-parse HEAD)
RESULT="$BISECT_DIR/chain.result"
: > "$RESULT"
# A live E2E run (another task, a manual run) holds /tmp/oco-e2e.lock: every candidate would wait for it. Fail fast instead.
LOCK_PID=$(cat /tmp/oco-e2e.lock/pid 2> /dev/null || head -c 20 /tmp/oco-e2e.lock 2> /dev/null | tr -dc '0-9')
if [ -n "$LOCK_PID" ] && kill -0 "$LOCK_PID" 2> /dev/null; then
  echo "E2E lock /tmp/oco-e2e.lock is held by live pid $LOCK_PID: not starting" | tee -a "$RESULT"
  exit 3
fi
echo "chain start $(date '+%F %T') good=$GOOD_SHA bad=$BAD_SHA specs=[$BISECT_SPECS] budget=${MAXMIN}min dir=$BISECT_DIR"

for spec in $BISECT_SPECS; do
  tag=$(echo "$spec" | tr ':/' '__')
  echo "=== spec $spec: endpoints ($(date +%H:%M:%S))"
  git checkout -q --detach "$GOOD_SHA" || { echo "spec=$spec status=checkout-failed" >> "$RESULT"; continue; }
  BISECT_PREDICATE=$spec bash "$TEST"
  rg=$?
  git checkout -q --detach "$BAD_SHA" || { echo "spec=$spec status=checkout-failed" >> "$RESULT"; continue; }
  BISECT_PREDICATE=$spec bash "$TEST"
  rb=$?
  echo "endpoint $spec: good-ref=$rg (0 = good) bad-ref=$rb (1 = bad)"
  if [ "$rg" -ne 0 ]; then
    echo "spec=$spec status=good-ref-not-good rc=$rg good=$GOOD_SHA" >> "$RESULT"
    continue
  fi
  if [ "$rb" -ne 1 ]; then
    echo "spec=$spec status=bad-ref-not-bad rc=$rb bad=$BAD_SHA" >> "$RESULT"
    continue
  fi
  echo "=== spec $spec: git bisect run ($(date +%H:%M:%S))"
  OUT="$BISECT_DIR/bisect-$tag.out"
  git bisect start "$BAD_SHA" "$GOOD_SHA" > /dev/null
  BISECT_PREDICATE=$spec git bisect run bash "$TEST" 2>&1 | tee "$OUT"
  git bisect log > "$BISECT_DIR/bisect-$tag.log" 2>&1
  FIRST=$(grep -m1 'is the first bad commit' "$OUT" | awk '{print $1}')
  git bisect reset -q > /dev/null 2>&1
  if [ -n "$FIRST" ]; then
    echo "spec=$spec status=first-bad sha=$FIRST subject=$(git log -1 --format=%s "$FIRST" | cut -c1-100)" >> "$RESULT"
  elif grep -q "only 'skip'ped commits" "$OUT" 2>/dev/null || grep -q "only skipped commits" "$OUT" 2>/dev/null; then
    echo "spec=$spec status=only-skipped-left (see $OUT)" >> "$RESULT"
  else
    echo "spec=$spec status=aborted (deadline or harness; see $OUT and bisect-$tag.log)" >> "$RESULT"
  fi
done

git checkout -q "$ORIG" 2> /dev/null
echo "=== chain.result"
cat "$RESULT"
echo "chain done $(date '+%F %T') elapsed=$(( ($(date +%s) - START) / 60 ))min"
