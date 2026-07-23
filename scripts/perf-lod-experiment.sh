#!/usr/bin/env bash
# Measure one terrain-LOD variant in the bench worktree (point 276). The
# variant is applied as a throwaway edit to terrainLod.ts, measured for both
# frame time AND triangle count, then reverted — so the levers of the point-209
# near-ring refinement can be priced before any of them is built for real.
#
# Usage: scripts/perf-lod-experiment.sh <label> <sed-expression>
set -u
WT=/c/Users/Patri/Documents/Developing/hoa-v01-bench
PORT=5174
LABEL="$1"
SED="$2"
FILE="$WT/src/scenes/travel/terrainLod.ts"

cd "$WT" || exit 1
git checkout -q -- src/scenes/travel/terrainLod.ts
[ -n "$SED" ] && sed -i "$SED" "$FILE"

node node_modules/vite/bin/vite.js --port $PORT --strictPort >/tmp/lod-dev.log 2>&1 &
DEV_PID=$!
for _ in $(seq 1 40); do
  [ "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:$PORT/ 2>/dev/null)" = "200" ] && break
  sleep 1
done

cd /c/Users/Patri/Documents/Developing/hoa || exit 1
S=$(BASE_URL="http://localhost:$PORT/" VERIFY_GL=webgpu node scripts/perf-structure.mjs 2>&1 | grep -E "^  ")
B=$(BASE_URL="http://localhost:$PORT/" VERIFY_GL=webgpu BENCH_CONFIGS=baseline \
  BENCH_SAMPLE_MS=8000 node scripts/perf-bench.mjs 2>&1 | grep -E "^  baseline")

kill $DEV_PID 2>/dev/null
sleep 2
git -C "$WT" checkout -q -- src/scenes/travel/terrainLod.ts

echo "=== $LABEL"
echo "$S"
echo "$B"
