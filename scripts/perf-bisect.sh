#!/usr/bin/env bash
# Measure one commit's bird's-eye frame cost in the throwaway bench worktree
# (point 276). Used to bisect the regression between v0.1 and main: it checks
# the commit out, refreshes deps only when the lockfile moved, serves it on its
# own port and runs the content-free desert point — the cleanest signal, since
# it holds no wildlife or flora whose amount could confound the comparison.
#
# Usage: scripts/perf-bisect.sh <commit> [point]
set -u
WT=/c/Users/Patri/Documents/Developing/hoa-v01-bench
PORT=5174
COMMIT="$1"
POINT="${2:-desert-empty}"

cd "$WT" || exit 1
PREV=$(git rev-parse HEAD)
git checkout -q --detach "$COMMIT" || exit 1
if ! git diff --quiet "$PREV" HEAD -- package-lock.json; then
  npm ci --silent >/dev/null 2>&1
fi

# Start vite DIRECTLY (not through npm) so the recorded PID is the server
# itself — an npm wrapper would leave the port held after the kill.
node node_modules/vite/bin/vite.js --port $PORT --strictPort >/tmp/bisect-dev.log 2>&1 &
DEV_PID=$!
for _ in $(seq 1 40); do
  code=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:$PORT/" 2>/dev/null)
  [ "$code" = "200" ] && break
  sleep 1
done

cd /c/Users/Patri/Documents/Developing/hoa || exit 1
OUT=$(BASE_URL="http://localhost:$PORT/" VERIFY_GL=webgpu BENCH_CONFIGS=baseline \
  BENCH_POINTS="$POINT" BENCH_SAMPLE_MS="${BENCH_SAMPLE_MS:-8000}" \
  node scripts/perf-bench.mjs 2>&1)

kill $DEV_PID 2>/dev/null
# Vite spawns a child; make sure the port is free for the next commit.
sleep 2

SUBJ=$(git -C "$WT" log -1 --format='%ci %s' | cut -c1-70)
LINE=$(echo "$OUT" | grep -E "^  baseline" | head -1)
echo "$COMMIT | $LINE | $SUBJ"
