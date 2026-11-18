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

/** A resumable build: `step` advances it until `deadline` (performance.now ms)
 *  passes, always doing at least one unit of work, and returns true once done. */
export interface SliceBuild {
  step(deadline: number): boolean
}

/** The in-flight state of a sliced drain, kept across frames by the caller. */
export interface SlicedDrainState<T extends { key: string }> {
  current: { job: T; build: SliceBuild } | null
  /** Builds set aside for an urgent job, resumed when their job comes up again. */
  parked: Map<string, SliceBuild>
}

/** At most this many parked partial builds are kept; the oldest is dropped (its
 *  job simply restarts if it is still wanted). */
export const MAX_PARKED_BUILDS = 4

export function newSlicedDrainState<T extends { key: string }>(): SlicedDrainState<T> {
  return { current: null, parked: new Map() }
}

/**
 * Drain the queue under a per-frame time budget, slicing each build
 * (docs/perf-1543-driving-hitches.md): an atomic per-job drain let one refined
 * 112-seg chunk overrun its frame by ~35 ms headless — the measured driving
 * hitch. Here a build that does not fit the budget yields mid-way and resumes
 * next frame. `begin` starts a job's build, or returns null when the job needs
 * none (already cached). `complete` receives a finished build. An `urgent` job
 * at the queue front (a chunk with no stand-in, i.e. a visible hole) preempts a
 * non-urgent build in flight, which is parked and resumed later, so near holes
 * keep their priority. Returns the number of builds completed this call.
 */
export function drainSlicedQueue<T extends { key: string }>(
  queue: T[],
  state: SlicedDrainState<T>,
  budgetMs: number,
  now: () => number,
  begin: (job: T) => SliceBuild | null,
  complete: (job: T, build: SliceBuild) => void,
  urgent: (job: T) => boolean,
): number {
  if (state.current === null && queue.length === 0) return 0
  const deadline = now() + budgetMs
  let completed = 0
  for (;;) {
    const cur = state.current
    if (cur !== null && queue.length > 0 && queue[0].key !== cur.job.key && urgent(queue[0]) && !urgent(cur.job)) {
      state.parked.delete(cur.job.key)
      state.parked.set(cur.job.key, cur.build)
      if (state.parked.size > MAX_PARKED_BUILDS) state.parked.delete(state.parked.keys().next().value as string)
      state.current = null
    }
    if (state.current === null) {
      const job = queue.shift()
      if (job === undefined) break
      const parked = state.parked.get(job.key)
      state.parked.delete(job.key)
      const build = parked ?? begin(job)
      if (build === null) continue
      state.current = { job, build }
    }
    const active = state.current as { job: T; build: SliceBuild }
    if (active.build.step(deadline)) {
      state.current = null
      complete(active.job, active.build)
      completed += 1
    }
    if (now() >= deadline) break
  }
  return completed
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
