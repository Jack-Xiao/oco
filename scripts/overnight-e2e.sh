#!/usr/bin/env bash
# Overnight E2E runner: runs a list of suites one after another through tests/e2e/run.mjs, under the shared
# /tmp/oco-e2e.lock mutex, and writes a summary to docs/evidence/runs/overnight-<date-time>/summary.md.
# A failing suite never stops the rest. Nothing here is run by the build or the unit tests.
#
#   bash scripts/overnight-e2e.sh                              # default batch, scripted mock model
#   bash scripts/overnight-e2e.sh --real                       # same list against the real model (slow, uses quota)
#   bash scripts/overnight-e2e.sh p1b-narrow --loop 20         # one suite 20 times (race reproduction)
#   OCO_NARROW_WIDTHS=320 bash scripts/overnight-e2e.sh --loop 20     # --loop alone defaults to p1b-narrow
#   bash scripts/overnight-e2e.sh --dry-run                    # print the plan only
#
# Options: --real | --mock (default) | --loop N | --lock-wait SECONDS (default 21600, 0 = fail fast)
#          --timeout SECONDS (per suite; sets OCO_E2E_TIMEOUT_S, default: run.mjs rules) | --dry-run | -h
# Env passed through: OCO_VSCODE_BIN, OCO_OPENCODE_BIN, OCO_TEST_PORT, OCO_NARROW_WIDTHS, OCO_E2E_LOCALE, ...
#
# Server: the isolated test server (scripts/test-server.sh, port OCO_TEST_PORT or 4517) is reused when it already
# runs in the wanted mode; when it is down this script starts it and stops it again at the end. A server in the
# other mode is never touched: the script stops with an error instead. Other OpenCode services are never touched.
# Results of each suite stay where the suite writes them (docs/evidence/runs/<runId>/results.json); the summary
# lists their paths and PASS / FAIL / NOT RUN / BLOCKED / N/A counts. Exit code: 0 when every suite exited 0.
set -u

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOCK="/tmp/oco-e2e.lock"
PORT="${OCO_TEST_PORT:-4517}"
DEFAULT_SUITES="c6-inbox c10-sidebar-answer c11-sidebar-organize c12-new-session-draft c13-worktree-inbox c14-review-notes c15-fix-with-opencode c16-sidebar-stop c17-subagent-aggregate p1b-sidebar p1b-narrow c5-runtime c4-trajectory"

MODE="mock"
LOOP=1
LOCK_WAIT=21600
DRY=0
SUITES=()
LOOP_GIVEN=0

usage() { sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'; }

while [ $# -gt 0 ]; do
  case "$1" in
    --real) MODE="real" ;;
    --mock) MODE="mock" ;;
    --loop) shift; LOOP="${1:-}"; LOOP_GIVEN=1 ;;
    --lock-wait) shift; LOCK_WAIT="${1:-}" ;;
    --timeout) shift; export OCO_E2E_TIMEOUT_S="${1:-}" ;;
    --dry-run) DRY=1 ;;
    -h|--help) usage; exit 0 ;;
    --*) echo "unknown option: $1" >&2; usage >&2; exit 2 ;;
    *) SUITES+=("$1") ;;
  esac
  shift
done

case "$LOOP" in ''|*[!0-9]*|0) echo "--loop needs a positive integer" >&2; exit 2 ;; esac
case "$LOCK_WAIT" in ''|*[!0-9]*) echo "--lock-wait needs a number of seconds" >&2; exit 2 ;; esac
if [ "${OCO_E2E_TIMEOUT_S:-0}" != "0" ]; then
  case "${OCO_E2E_TIMEOUT_S:-}" in ''|*[!0-9]*) echo "--timeout needs a number of seconds" >&2; exit 2 ;; esac
fi

if [ ${#SUITES[@]} -eq 0 ]; then
  if [ "$LOOP_GIVEN" = 1 ]; then SUITES=(p1b-narrow); else read -r -a SUITES <<< "$DEFAULT_SUITES"; fi
fi
for s in "${SUITES[@]}"; do
  if [ ! -f "$ROOT/tests/e2e/$s.mjs" ]; then echo "no such suite: tests/e2e/$s.mjs" >&2; exit 2; fi
done

STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="$ROOT/docs/evidence/runs/overnight-$STAMP"
SUMMARY="$OUT/summary.md"
export OCO_E2E_MODEL="$MODE"

if [ "$DRY" = 1 ]; then
  echo "mode: $MODE   loop: $LOOP   lock: $LOCK (wait ${LOCK_WAIT}s)   port: $PORT"
  echo "summary: ${SUMMARY#$ROOT/}"
  n=0
  for s in "${SUITES[@]}"; do i=1; while [ "$i" -le "$LOOP" ]; do n=$((n + 1)); echo "  $n. node tests/e2e/run.mjs $s  (iteration $i/$LOOP)"; i=$((i + 1)); done; done
  exit 0
fi

HAVE_LOCK=0
SERVER_PID=""
FINISHED=0
TOTAL=0
FAILED=0

# ---------- lock (mkdir is atomic; a plain-file lock from another tool also blocks mkdir) ----------
lock_owner_alive() {
  local pid=""
  if [ -d "$LOCK" ]; then pid="$(cat "$LOCK/pid" 2>/dev/null)"; elif [ -f "$LOCK" ]; then pid="$(head -c 20 "$LOCK" 2>/dev/null | tr -dc '0-9')"; fi
  [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null
}
lock_owner_known() {
  local pid=""
  if [ -d "$LOCK" ]; then pid="$(cat "$LOCK/pid" 2>/dev/null)"; elif [ -f "$LOCK" ]; then pid="$(head -c 20 "$LOCK" 2>/dev/null | tr -dc '0-9')"; fi
  [ -n "$pid" ]
}
acquire_lock() {
  local waited=0
  while ! mkdir "$LOCK" 2>/dev/null; do
    if lock_owner_known && ! lock_owner_alive; then
      echo "stale lock $LOCK (owner gone): removing"; rm -rf "$LOCK"; continue
    fi
    if [ "$waited" -ge "$LOCK_WAIT" ]; then echo "lock $LOCK still held after ${waited}s: giving up" >&2; return 1; fi
    [ $((waited % 300)) -eq 0 ] && echo "waiting for $LOCK (held by another E2E run) ..."
    sleep 30; waited=$((waited + 30))
  done
  echo "$$" > "$LOCK/pid"
  echo "overnight-e2e $STAMP $ROOT" > "$LOCK/info"
  HAVE_LOCK=1
}

# ---------- test server ----------
curl_auth() { # curl_auth <path> [extra curl args]: basic auth through stdin, so the secret never shows in argv
  local path="$1"; shift
  [ -s "$ROOT/.oco-test/secret" ] || return 1
  printf 'user = "opencode:%s"\n' "$(cat "$ROOT/.oco-test/secret")" | curl -s -m 5 -K - "$@" "http://127.0.0.1:$PORT$path"
}
server_mode() { # prints down | mock | real
  local out
  out="$(curl_auth /config 2>/dev/null)" || out=""
  [ -z "$out" ] && { echo down; return; }
  node -e 'try{const m=String(JSON.parse(process.argv[1]).model||"");console.log(m?(m.startsWith("oco-mock/")?"mock":"real"):"unknown")}catch{console.log("down")}' "$out"
}
ensure_server() {
  local have; have="$(server_mode)"
  case "$have" in
    unknown) echo "test server on :$PORT is up (model not reported): reusing it" ;;
    "$MODE") echo "test server on :$PORT already runs in $MODE mode: reusing it" ;;
    down)
      echo "starting the test server ($MODE mode, port $PORT) ..."
      set -m
      bash "$ROOT/scripts/test-server.sh" > "$OUT/server.log" 2>&1 &
      SERVER_PID=$!
      set +m
      local i=0
      while [ "$i" -lt 90 ]; do
        [ "$(curl_auth /global/health -o /dev/null -w '%{http_code}' 2>/dev/null)" = "200" ] && { echo "test server is up"; return 0; }
        kill -0 "$SERVER_PID" 2>/dev/null || break
        sleep 1; i=$((i + 1))
      done
      echo "test server did not come up (see ${OUT#$ROOT/}/server.log); set OCO_OPENCODE_BIN or start it yourself" >&2
      return 1 ;;
    *) echo "test server on :$PORT runs in $have mode but $MODE was requested: refusing to touch it" >&2; return 1 ;;
  esac
}
stop_server() { # only a server this script started; the whole process group (test-server.sh, mock LLM, opencode)
  [ -n "$SERVER_PID" ] || return 0
  kill -TERM -- "-$SERVER_PID" 2>/dev/null || kill -TERM "$SERVER_PID" 2>/dev/null
  SERVER_PID=""
}

# ---------- summary ----------
summarize_run() { # summarize_run <results.json>  ->  "PASS FAIL NOTRUN BLOCKED NA|modelMode|failing ids"
  node -e '
    const fs = require("fs");
    try {
      const j = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
      const s = j.summary || {};
      const bad = (j.results || []).filter((r) => r.status === "FAIL").map((r) => r.id);
      const miss = (j.missingRequired || []).filter((id) => !bad.includes(id));
      const na = (j.results || []).filter((r) => r.status === "N/A").map((r) => r.id);
      console.log([s.PASS || 0, s.FAIL || 0, s["NOT RUN"] || 0, s.BLOCKED || 0, s["N/A"] || 0].join(" ") + "|" + (j.modelMode || "unknown") + "|" +
        (bad.length ? "FAIL: " + bad.join(", ") : "") + (miss.length ? (bad.length ? "; " : "") + "missing: " + miss.join(", ") : "") +
        (na.length ? ((bad.length || miss.length) ? "; " : "") + "N/A: " + na.join(", ") : ""));
    } catch (e) { console.log("? ? ? ? ?|unknown|results.json unreadable"); }
  ' "$1"
}
write_header() {
  mkdir -p "$OUT"
  {
    echo "# Overnight E2E $STAMP"
    echo
    echo "- mode: $MODE (OCO_E2E_MODEL=$MODE); loop: $LOOP; port: $PORT"
    echo "- started: $(date '+%Y-%m-%d %H:%M:%S %z')"
    echo "- commit: $(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null) on $(git -C "$ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null)"
    echo "- command: bash scripts/overnight-e2e.sh $*"
    echo
    echo "| # | suite | iter | exit | time | PASS | FAIL | NOT RUN | BLOCKED | N/A | model | notes | results | log |"
    echo "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |"
  } > "$SUMMARY"
}
finish() {
  local code=$?
  if [ "$FINISHED" = 0 ]; then
    FINISHED=1
    stop_server
    if [ -f "$SUMMARY" ]; then
      { echo; echo "- finished: $(date '+%Y-%m-%d %H:%M:%S %z'); suites run: $TOTAL, failed: $FAILED"; [ "$TOTAL" -lt "$EXPECTED" ] && echo "- INTERRUPTED or aborted after $TOTAL of $EXPECTED runs"; } >> "$SUMMARY"
    fi
    [ "$HAVE_LOCK" = 1 ] && rm -rf "$LOCK"
    HAVE_LOCK=0
  fi
  return $code
}
EXPECTED=$(( ${#SUITES[@]} * LOOP ))
trap 'finish' EXIT
trap 'echo "interrupted"; exit 130' INT TERM HUP

write_header "$@"
echo "summary: ${SUMMARY#$ROOT/}"
acquire_lock || { echo "- aborted: lock $LOCK not acquired" >> "$SUMMARY"; exit 3; }
ensure_server || { echo "- aborted: test server not usable (mode $MODE, port $PORT)" >> "$SUMMARY"; exit 3; }

cd "$ROOT" || exit 3
n=0
for s in "${SUITES[@]}"; do
  i=1
  while [ "$i" -le "$LOOP" ]; do
    n=$((n + 1))
    log="$OUT/$(printf '%02d' "$n")-$s.log"
    marker="$OUT/.marker-$n"
    : > "$marker"
    echo
    echo "=== [$n/$EXPECTED] $s (iteration $i/$LOOP, $MODE) $(date '+%H:%M:%S') ==="
    start=$SECONDS
    node tests/e2e/run.mjs "$s" 2>&1 | tee "$log"
    code=${PIPESTATUS[0]}
    dur=$((SECONDS - start))
    # The newest run directory of this suite created after the marker belongs to this execution.
    rundir="$(find "$ROOT/docs/evidence/runs" -maxdepth 1 -type d -name "*-$s-*" -newer "$marker" 2>/dev/null | sort | tail -1)"
    rm -f "$marker"
    counts="? ? ? ? ?"; model="unknown"; notes=""; rel="(no results.json)"
    if [ -n "$rundir" ] && [ -f "$rundir/results.json" ]; then
      parsed="$(summarize_run "$rundir/results.json")"
      counts="${parsed%%|*}"; rest="${parsed#*|}"; model="${rest%%|*}"; notes="${rest#*|}"
      rel="${rundir#$ROOT/}/results.json"
    elif [ -n "$rundir" ]; then
      rel="${rundir#$ROOT/} (no results.json: suite killed or timed out)"
      notes="no results.json"
    fi
    [ "$code" -ne 0 ] && FAILED=$((FAILED + 1))
    TOTAL=$((TOTAL + 1))
    read -r p f nr b na <<< "$counts"
    echo "| $n | $s | $i | $code | ${dur}s | $p | $f | $nr | $b | $na | $model | $notes | $rel | ${log#$ROOT/} |" >> "$SUMMARY"
    echo "--- $s: exit $code, ${dur}s, PASS $p FAIL $f NOT RUN $nr BLOCKED $b N/A $na"
    i=$((i + 1))
  done
done

echo
echo "done: $TOTAL runs, $FAILED with a non-zero exit. Summary: ${SUMMARY#$ROOT/}"
[ "$FAILED" -eq 0 ]
exit $?
