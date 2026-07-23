// Budgeted terrain chunk build queue (docs/perf-driving-hitches.md): a chunk
// boundary crossing used to (re)build every changed chunk of the 13×13 window
// synchronously in one frame — ~40-60 buildChunkGeometry calls at thousands of
// sampleTerrain samples each, the tallest driving hitch. These pure scheduling
// rules split that burst across frames: the crossing enqueues the missing
// builds and the render loop drains a few per frame under a time budget,
// holes-then-nearest first, while every re-keyed chunk keeps drawing its
// previous geometry until the new build lands (a stale LOD for a few frames is
// invisible; a hole is not). A prefetch predicted from the travel heading
// warms the next window before the crossing so the queue is usually empty when
// it happens. Scheduling only: WHAT is built (buildChunkGeometry per key)
// is untouched — same seed, same geometry, same picture, just not all in one
// frame. Kept apart from the render loop so the rules are unit-testable
// (terrainQueue.test.ts), the floraStreaming.ts precedent.

export interface ChunkJob {
  cx: number
  cz: number
  segments: number
  /** The four neighbours' stitch resolutions (point 220), part of the job so a
   *  queued build can never run against stale edges: a changed window replans
   *  its jobs (fresh edgeSegs) rather than draining stale ones. */
  edgeSegs: readonly [number, number, number, number]
  /** Geometry cache key — chunk plus its own and its neighbours' resolutions. */
  key: string
  /** Chunk identity `cx,cz` (the stand-in lookup while a re-key is queued). */
  chunk: string
  /** Squared chunk distance from the window centre, for nearest-first order. */
  dist2: number
}

/**
 * Plan the full desired chunk window around centre (ccx, ccz) as jobs: the
 * same LOD/stitch assignment the synchronous loop produced, expressed as data.
 * `segsAt` is the centre-relative segment probe (memoised by the caller); the
 * key format matches the module geometry cache's existing keys.
 */
export function planChunkWindow(
  ccx: number,
  ccz: number,
  radius: number,
  segsAt: (dx: number, dz: number) => number,
): ChunkJob[] {
  const jobs: ChunkJob[] = []
  for (let dz = -radius; dz <= radius; dz++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const segments = segsAt(dx, dz)
      // Stitch each shared edge to the coarser neighbour (min of the two res)
      // so no T-junction crack opens where LOD levels meet (point 220). Order
      // matches buildChunkGeometry's edgeIndex: north/-z, south/+z, west/-x,
      // east/+x.
      const edgeSegs: [number, number, number, number] = [
        Math.min(segments, segsAt(dx, dz - 1)),
        Math.min(segments, segsAt(dx, dz + 1)),
        Math.min(segments, segsAt(dx - 1, dz)),
        Math.min(segments, segsAt(dx + 1, dz)),
      ]
      const chunk = `${ccx + dx},${ccz + dz}`
      jobs.push({
        cx: ccx + dx,
        cz: ccz + dz,
        segments,
        edgeSegs,
        key: `${chunk}:${segments}:${edgeSegs.join(',')}`,
        chunk,
        dist2: dx * dx + dz * dz,
      })
    }
  }
  return jobs
}

/**
 * Order queued builds: chunks with NO drawable stand-in first (nothing covers
 * them, so they must land before any mere LOD refinement), then nearest the
 * window centre first. Stable, so the build order is deterministic — though
 * every order converges to the same geometries (the builds are pure).
 */
export function orderChunkJobs(
  jobs: readonly ChunkJob[],
  hasStandIn: (chunk: string) => boolean,
): ChunkJob[] {
  return jobs
    .map((job, i) => ({ job, i, covered: hasStandIn(job.chunk) ? 1 : 0 }))
    .sort((a, b) => a.covered - b.covered || a.job.dist2 - b.job.dist2 || a.i - b.i)
    .map((e) => e.job)
}

/**
 * Drain jobs from the queue front until the per-frame time budget (ms) is
 * spent. Always builds at least one job so the queue can never stall, and
 * stops the moment the budget is crossed — one oversized job (a refined
 * 112-seg chunk) overshoots its own frame but never drags others with it.
 * `now` is injectable for the pure test. Returns the number built.
 */
export function drainChunkQueue<T>(
  queue: T[],
  budgetMs: number,
  now: () => number,
  build: (job: T) => void,
): number {
  if (queue.length === 0) return 0
  const start = now()
  let built = 0
  while (queue.length > 0) {
    build(queue.shift() as T)
    built += 1
    if (now() - start >= budgetMs) break
  }
  return built
}

/**
 * Predict the next chunk centre from the last frame's movement: look ahead
 * `lookahead` world units along the normalised heading; if that point lies in
 * another chunk, that chunk is the prefetch target. Null while idle or still
 * well inside the current chunk. Prefetching changes only WHEN builds run,
 * never what they produce.
 */
export function predictedNextCenter(
  pos: { x: number; z: number },
  prev: { x: number; z: number },
  chunkSize: number,
  lookahead: number,
): { cx: number; cz: number } | null {
  const dx = pos.x - prev.x
  const dz = pos.z - prev.z
  const len = Math.hypot(dx, dz)
  if (len < 1e-9) return null
  const ax = pos.x + (dx / len) * lookahead
  const az = pos.z + (dz / len) * lookahead
  const cx = Math.floor(ax / chunkSize)
  const cz = Math.floor(az / chunkSize)
  if (cx === Math.floor(pos.x / chunkSize) && cz === Math.floor(pos.z / chunkSize)) return null
  return { cx, cz }
}
