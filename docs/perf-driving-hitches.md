# Driving hitches in the bird's-eye view — analysis (TASKS point 272)

Read-only code analysis of the occasional short frame stalls while driving
continuously in one direction in the travel view. No code was changed; this doc
ranks the likely spike sources, recommends a fix approach per source, and
specifies the instrumentation to confirm the ranking before the fix lands.

## Symptom shape

The user reports occasional short stalls while driving straight. Two periodic,
synchronous work bursts fire on movement thresholds — every 24 wu (a chunk
boundary crossing) and every 16 wu (the flora rebuild hysteresis) — and both run
to completion inside a single `useFrame` callback on the main thread. At the
default travel speed 5.6 that is one burst roughly every 2.9 s and 4.3 s; at the
F3 test speed 25 every 0.64 s and 0.96 s. Every 48 wu the two coincide in
back-to-back frames (16·3 = 24·2), which predicts an occasional extra-long
stall — matching "occasional short hitches" exactly. The bursts only do real
work over NEW ground (both are cached/keyed), which matches "driving
continuously in one direction" being the trigger.

An aggravator, not a cause: the camera follow lerp is a fixed 0.12 per FRAME,
not dt-scaled (`TravelScene.tsx:2349`), so after one long frame the camera
falls behind and visibly snaps to catch up — a 100 ms stall reads worse than it
is. (Known/intentional per the `__camera.settled` comment, but worth noting for
the perceived severity.)

## Ranked spike sources

### 1. Terrain chunk rebuild burst on a chunk-boundary crossing (largest single-frame spikes)

`TerrainChunks`'s `useFrame` (`src/scenes/travel/TravelScene.tsx:468-529`)
returns early until the player's chunk changes, then synchronously, in that one
frame:

- Recomputes the 13×13 window's LOD assignment. The cache key
  (`TravelScene.tsx:511`) is `(cx,cz):segments:edgeSegs` — it encodes the
  chunk's own LOD **and all four neighbours' resolutions** (the point-220 seam
  stitch). Driving one chunk forward therefore re-keys far more than the 13
  newly entering chunks: every chunk crossing the ring-2/3 or ring-4/5 LOD
  boundary (front AND rear), every chunk entering/leaving the ring≤4 refine
  window, and every neighbour of any of those (its `edgeSegs` changed). On
  fresh ground that is roughly **40-60 `buildChunkGeometry` calls in one
  frame**.
- Each `buildChunkGeometry` (`TravelScene.tsx:171-340`) samples a
  `(segments+3)²` height grid via `sampleTerrain`: 3,481 samples for a 56-seg
  chunk, 13,225 for a refined 112-seg chunk (mountain/coast, point 230/209),
  plus stitch anchor resampling, skirt copies, and a plain `number[]` index
  array built by `push` (~37k-150k elements of GC garbage per chunk).
- `sampleTerrain` (`src/world/terrain.ts:219`) is expensive per call: bilinear
  land mask, vector coast signed distance inside the coast band, bicubic 4×4
  DEM read (`src/world/geodata.ts:143`), FOUR fbm2 fields (3-4 octaves each:
  detail, biome noise, two domain-warp channels), a bucket-searched exact
  vector river distance (`src/world/hydro.ts:158-180`), region weights and
  biome colour mixes. Order of a few µs each.
- The per-crossing LOD probes add to the same frame: `segsAt`
  (`TravelScene.tsx:485-496`) memoises only within the crossing (a fresh `Map`
  each time), and probes up to ~81 near-ring chunks plus neighbours through
  `chunkIsCoastal` (25 `landFractionAt`) and `chunkIsMountainous` (25 bicubic
  `elevationAt`, `src/scenes/travel/terrainLod.ts:61-76`) — a few thousand
  samples re-done every crossing even over already-built ground.
- `setActive(keys)` (`TravelScene.tsx:528`) then re-renders/reconciles 169
  `<mesh>` elements, and the >700-entry cache eviction
  (`TravelScene.tsx:519-527`) occasionally disposes dozens of GPU geometries in
  the same frame.

Estimate: ~75k terrain samples on flat fresh ground, up to ~200k in
mountain/coast belts (several 112-seg chunks) — plausibly **~50-300 ms in one
frame**, the tallest spikes the player sees. Driving back over known ground is
free (cache hit), which is why the stalls feel intermittent.

### 2. Flora instance-buffer rebuild every 16 wu (smaller but more frequent)

`Vegetation`'s `useFrame` (`TravelScene.tsx:1105-1250`) fires on
`floraShouldRebuild` (`src/scenes/travel/floraStreaming.ts:82-90`,
`FLORA_REBUILD_STEP = 16`), then synchronously:

- Scans `chunkOffsetsByDistance(14)` = 29×29 = 841 chunks ×
  `CANDIDATES_PER_CHUNK` 22 = **~18,500 `placedFloraAt` calls**
  (`TravelScene.tsx:869-901`), each doing 3-4 `hashChunk`, `worldToLatLon`, a
  full `sampleTerrain`, a river- AND lake-distance bucket query, and a loop
  over all ~30 `PLACES` with `Math.hypot` (`TravelScene.tsx:895-898`).
- For every accepted plant (thousands): another `worldToLatLon` +
  `seasonFieldTintAt`, quaternion/matrix compose (plus a second matrix multiply
  for crown species), `setMatrixAt` writes.
- Then flags ~14 instanced meshes' full matrix + seasonTint buffers dirty
  (`TravelScene.tsx:1242-1249`) — several MB of GPU upload in the next submit.

Estimate: **~40-100 ms per rebuild**, firing 1.5× as often as the chunk
crossing. Note the scan is *not* cached: unlike the terrain chunks, the same
~780 unchanged chunks are fully re-decided every 16 wu — only ~60 chunks are
actually new per step.

### 3. Same-frame minor contributors

- **Wildlife chunk spawn** (`src/scenes/travel/Wildlife.tsx:1664-1718`,
  `spawnChunk` 873-1034): fires on the same crossing frame as spike 1, but is
  light — ~9 new chunks at default zoom, a handful of terrain samples and a few
  animals each. The despawn filter rebuilds the herd arrays. Tens of µs to low
  ms; a pile-on, not a cause.
- **GC pressure**: both hot paths allocate heavily — `{lat,lon}` objects from
  `worldToLatLon`, `TerrainSample` objects with colour/splat arrays (hundreds
  of thousands per burst), the `number[]` index arrays. Minor-GC pauses land
  preferentially on exactly these frames.
- Not suspects: `RiversAndLakes` and `RegionBorders` build once per seed
  (module bundles, `Rivers.tsx:495-527`); `Climate` is per-frame uniform work;
  `FarTerrain` builds only on the debug zoom; the panorama capture fires only
  on settlement approach.

### Which dominates?

By call-count arithmetic, spike 1 gives the tallest stalls (especially entering
mountainous/coastal ground) and spike 2 the most frequent ones — but the true
ratio (and the GC share) **cannot be settled without profiling**. The fix
branch should land the instrumentation below FIRST and confirm the ranking on a
real straight drive before optimising.

## Recommended fix approach

Three tools, matched to the spikes. Order of adoption: instrumentation →
amortise/cache (cheap, likely sufficient) → worker (bigger hammer, only where
the budget still measures over).

### Spike 1 (terrain): amortise with a per-frame budget + keep-old-LOD, then worker if needed

- **Amortise**: replace the "build everything now" loop with a build QUEUE
  drained under a per-frame time budget (~4-6 ms), ordered nearest-first /
  on-screen-first (project via the existing frame-visibility test, the
  point-172 lesson — never an assumed radius).
- **Graceful LOD lag**: for a chunk that is merely re-keyed (LOD or edgeSegs
  change), keep drawing its existing cached geometry until the new build
  completes — the cache already holds the old key. A frame-late LOD refine of
  an off-screen ring is invisible; a HOLE would not be, so newly entering
  chunks with no geometry at all get queue priority.
- **Prefetch**: derive the drive heading from the last position delta and
  enqueue the next column's chunks (and their coast/mountain probes) when the
  player is within ~half a chunk of the boundary, so the queue has usually
  drained before the crossing. Prefetch changes only WHEN work runs, not what
  it produces.
- **Persist the probe memo**: `chunkIsCoastal`/`chunkIsMountainous` are pure
  per (chunk); cache them in a module `Map` keyed `(cx,cz)` instead of the
  per-crossing `segsCache`, eliminating thousands of repeat samples per
  crossing over known ground.
- **Worker (second stage, likely needed for mountain belts)**: one 112-seg
  chunk alone is ~13k samples ≈ 20-40 ms — it cannot fit ANY main-thread frame
  budget without a resumable row-by-row build. `buildChunkGeometry` is a pure
  function of `(cx, cz, seed, segments, edgeSegs)` producing plain typed
  arrays — ideal worker shape: the worker imports the same `terrain.ts`/
  `geodata.ts`/`hydro.ts` modules (their state is deterministic, loaded from
  fetched assets — init the geodata fetch in the worker too, or transfer the
  pixel buffer once), returns positions/normals/colors/splats/uvs/seasonUVs/
  indices as transferables, and the main thread only assembles the
  `BufferGeometry` (cheap). `src/journal/ttsWorker.ts` +
  `src/journal/speech.ts:57-60` are the project's worker/bundling reference
  (`new Worker(new URL(...), { type: 'module' })`). Determinism is untouched:
  same code, same seed, bit-identical output regardless of scheduling.
- Also: build indices into a preallocated `Uint32Array` instead of `number[]`
  push (removes the largest single GC allocation), whether or not the worker
  lands.

### Spike 2 (flora): placement cache per chunk + incremental bake

- **Cache the placement scan**: `placedFloraAt` results are deterministic per
  `(chunk, candidate, seed)` and calendar-INDEPENDENT (the season tint is read
  separately at bake time). Cache `Map<chunkKey, PlacedFlora[]>` (bounded,
  evict far chunks) and the 18.5k-call scan collapses to ~60 new chunks per
  rebuild step — likely an order-of-magnitude win on its own, with zero
  behaviour change. **Constraint**: `collidableFloraNear`
  (`TravelScene.tsx:911-931`) must read THE SAME results (share the cache or
  keep calling the pure function — bit-identical either way), preserving the
  point-129 render/collider lockstep.
- **Amortise the bake**: fill the instance matrices into scratch arrays over N
  frames (e.g. ~100 chunks/frame), then swap and upload once complete —
  double-buffered, so the previously completed circle keeps drawing during the
  fill and the drawn edge never regresses. The no-pop margin stays provable as
  a pure rule: movement-during-build + `FLORA_REBUILD_STEP` (16) must stay
  under `FLORA_SPAWN_MARGIN` (30) — at F3 speed 25 a 0.2 s fill consumes 5 wu
  of the 14 wu reserve. Anchor `lastBuild` at fill START and add the bound to
  `floraStreaming.test.ts`.
- A worker fits here too (the scan is pure), but with the placement cache the
  remaining per-step work (~60 chunks ≈ 1.3k candidates + bake) should fit an
  amortised main-thread budget comfortably; try cache+amortise first.

### Spike 3 (wildlife/React/GC): fold in cheaply

- If measurement shows `spawnChunk` mattering, push new-chunk spawns through
  the same budgeted queue (spawning an off-screen chunk one frame late is
  invisible by construction — they spawn beyond the view ring already).
- Consider gating `setActive` to the keys actually changing (it already only
  runs on crossings; the reconcile of 169 meshes is small — measure before
  touching).

### What must NOT change

- **Points 164/171/172**: the flora edge stays a circle beyond the frustum at
  any zoom; nearest-first fill so buffer saturation drops the farthest plants;
  rebuild hysteresis compares the SPAWN RADIUS, not raw fog far; verify by
  projecting to the frame (`__camera.onScreen`), never by a radius. Amortising
  must keep the completed-circle-always-covers-frustum invariant (margin bound
  above).
- **Determinism under the fixed seed**: `buildChunkGeometry` and
  `placedFloraAt` stay pure; caching/worker/scheduling changes WHEN they run,
  never what they return. Wildlife spawn hashes untouched.
- **Point 129**: collider and renderer keep deriving from one `placedFloraAt`.
- **Point 96**: no new per-rebuild materials/meshes; the instanced meshes and
  materials remain module singletons; surgical `dispose={null}` stays.
- **Point 175**: crown collapse stays on the instance matrix, colour on the
  attribute; do not reintroduce per-frame attribute uploads (the WebGPU race).
- **Point 220**: a late-built chunk must stitch against the SAME `edgeSegs` its
  neighbours assumed for that window — keep edge resolutions part of the
  queued job, and if a neighbour's LOD changes while a job is queued,
  re-enqueue with the new edgeSegs rather than building stale.
- Any render-visible change is verified on BOTH backends, judged by the
  picture.

## Instrumentation + verification (do this first on the fix branch)

1. **Attribution probe (DEV-only)**: wrap the three burst blocks — the
   `TerrainChunks` crossing body, the `Vegetation` rebuild body, the `Wildlife`
   spawn/despawn block — with `performance.now()` and expose
   `window.__perf = { terrain: {count, lastMs, maxMs, totalMs}, flora: {...},
   wildlife: {...}, frames: ringBuffer<{t, dt}> }` (ring buffer of the last
   ~600 rAF deltas). Zero-cost when not read.
2. **Measurement pass**: a driven straight run over FRESH ground (e.g. from
   Cairo south-west across the desert/Nile, and a second leg through a
   mountainous belt — Ethiopian highlands — for the 112-seg case), at the
   default zoom 0.5 and speed 5.6 AND at F3 speed 25. Record the frame-delta
   histogram and the per-burst ms. This confirms the 1-vs-2 ranking and the GC
   share (long frames with NO attributed burst ⇒ GC/upload).
3. **Regression gate (after the fix)**: a Playwright check in
   `scripts/verify/` (enrichments or a new `perf.mjs`) driving the same legs,
   asserting via `__perf` that (a) no attributed burst exceeds the budget
   (e.g. terrain ≤ 8 ms/frame, flora ≤ 8 ms/frame) and (b) the p99 rAF delta
   stays under a threshold with zero deltas above e.g. 150 ms, on the achievable
   zoom. Plus pure Vitest cases for the new queue/budget/margin rules
   (`floraStreaming.test.ts`, a new `terrainQueue.test.ts`) — the hybrid-layer
   rule.

## Bottom line

The hitches are with high confidence the two synchronous movement-threshold
bursts: the terrain chunk (re)build storm on a chunk-boundary crossing
(~40-60 chunk geometries × thousands of expensive `sampleTerrain` calls each,
the tallest spikes, worst over fresh mountain/coast ground) and the
every-16-wu flora rebuild (~18.5k un-cached placement decisions + full
instance-buffer re-upload, smaller but more frequent, coinciding with a
crossing every 48 wu). Recommended: land the attribution probe first, then a
per-frame-budgeted build queue with prefetch-by-heading and keep-old-LOD for
the terrain, a per-chunk placement cache plus double-buffered amortised bake
for the flora — and move the pure terrain sampling into a Web Worker
(ttsWorker pattern, transferable typed arrays) where the measured per-chunk
cost (refined 112-seg chunks) provably cannot fit a frame budget. All caches
and scheduling changes are behaviour-neutral: the same pure functions, the
same seed, the same picture — just not all in one frame.

## Implementation status (fix branch)

Landed, in order:

1. **Attribution probe**: `src/scenes/travel/perfProbe.ts` + `window.__perf`
   (DEV) — terrain/flora burst stats and a 600-frame delta ring, pure-tested.
2. **Terrain (spike 1)**: the crossing now only PLANS the window
   (`src/scenes/travel/terrainQueue.ts`, pure-tested in
   `terrainQueue.test.ts`); missing builds drain under a ~5 ms/frame budget,
   holes-then-nearest first, with the chunk's previous geometry drawn as a
   stand-in while a re-key waits, plus prefetch-by-heading (half a chunk of
   lookahead). Teleports/scene entry still build synchronously (no stand-ins
   exist there). The coast/mountain probes memoise per chunk in
   `terrainLod.ts`; the index buffer is a preallocated `Uint32Array`.
3. **Flora (spike 2)**: `placedFloraChunk` caches each chunk's placement
   (seed-keyed, bounded; render, collider and dev hook read the SAME arrays —
   point 129 by construction; pinned in `floraPlacementCache.test.ts`), and a
   driving-step rebuild fills scratch buffers over ≤ `FLORA_FILL_MAX_FRAMES`
   frames, swapped in atomically (double-buffered). The recession bound
   (trigger distance + worst fill drift ≤ `FLORA_SPAWN_MARGIN`) is enforced
   by the `floraAmortiseMaxStep` gate and pure-tested in
   `floraStreaming.test.ts`; radius-change/first/jump rebuilds stay
   synchronous.
4. **Regression gate**: the enrichments driven no-pop pass also asserts via
   `__perf` that both systems worked the drive in bounded slices (terrain
   maxMs < 150, flora maxMs < 100 — generous headless bounds).

**Deferred (documented follow-up): the Web Worker.** A refined 112-seg chunk
build is atomic and can alone overshoot the terrain frame budget (~20-40 ms on
real hardware) in mountain/coast belts; moving `buildChunkGeometry`'s sampling
into a worker (ttsWorker pattern, transferable typed arrays, geodata
initialised worker-side) remains the second stage if the measured overshoot
still reads as a hitch after this pass. The prefetch usually hides it today:
the refined builds run one per frame ahead of the crossing.
