// Zoom-aware flora streaming (design.md §19.9, points 164 + 171). Two pop
// sources are closed here, both about WHERE the drawn edge sits relative to
// what the player can actually see:
//   • point 164: the dressing used to rebuild a FIXED ±6-chunk square, so its
//     corner (≈120-227 units) swept in and out of view and jumped back and
//     forth across a chunk boundary. Replaced by a CIRCLE gated behind a move
//     hysteresis, so the pop is off-screen and a back-and-forth never re-pops.
//   • point 171: that circle was sized to an ASSUMED view of 100×zoom, but the
//     real visible ground reaches the SCENE FOG far plane (region preset
//     165-330), far beyond 100×zoom — so at a wide zoom plants still streamed
//     in WITHIN the view (faintly fogged, but visible). The circle now follows
//     the fog far (the definitive visible limit — nothing renders past it), so
//     its edge is always fully fogged out at ANY zoom, without trusting a
//     frustum estimate. And the per-chunk fill runs NEAREST-FIRST, so a full
//     instance buffer drops the FARTHEST plants (the drawn edge stays a fogged
//     circle) instead of fraying a ragged, chunk-order boundary into view.
// Kept separate from the three.js render loop so the rules are unit-testable.

/** Plants are drawn out to fog.far + this reserve, so the streaming edge is a
 *  circle strictly BEYOND everything the fog lets the player see; its pop on a
 *  rebuild is always in dense fog and therefore invisible. */
export const FLORA_SPAWN_MARGIN = 30
/** Bounds the rebuild cost in the widest-fog regions (east fog far 330). Beyond
 *  this the outer ring already sits in >90% fog, so capping the radius there
 *  costs nothing the player can see. */
export const FLORA_SPAWN_HARD_CAP = 320
/** A rebuild fires only once the player has moved this far since the last one
 *  (or the fog far changed) — a back-and-forth shorter than this does not
 *  rebuild, so the frozen edge cannot re-pop. Stays below FLORA_SPAWN_MARGIN so
 *  the edge, receding by at most this between rebuilds, never crosses into the
 *  fog-clear view. */
export const FLORA_REBUILD_STEP = 16
/** Chunk-iteration cap for the rebuild cost; covers FLORA_SPAWN_HARD_CAP
 *  (⌈320/24⌉ + 1 = 15) so the capped edge still reaches the fog. */
export const FLORA_RANGE_MAX = 15

/** The radius (world units) out to which flora is drawn — the fog-limited
 *  visible extent plus a reserve, so the circular streaming edge is always
 *  beyond the visible ground and its pop stays in the fog. Zoom-independent:
 *  the fog far, not the camera height, sets what the player can see. */
export function floraSpawnRadius(fogFar: number): number {
  return Math.min(FLORA_SPAWN_HARD_CAP, fogFar + FLORA_SPAWN_MARGIN)
}

/** The half-width (in chunks) to iterate so the spawn circle is fully covered,
 *  capped for cost. +1 guards the corner of the bounding square. */
export function floraChunkRange(fogFar: number, chunkSize: number): number {
  return Math.min(FLORA_RANGE_MAX, Math.ceil(floraSpawnRadius(fogFar) / chunkSize) + 1)
}

/** Whether a plant at (x,z) is inside the spawn circle around the player — the
 *  circular edge that keeps the pop off-screen. */
export function floraInSpawnCircle(x: number, z: number, px: number, pz: number, spawnR: number): boolean {
  const dx = x - px
  const dz = z - pz
  return dx * dx + dz * dz <= spawnR * spawnR
}

/** The rebuild hysteresis: rebuild when there is no prior build, when the player
 *  has moved at least FLORA_REBUILD_STEP since the last one, or when the fog far
 *  changed ENOUGH TO MOVE THE SPAWN RADIUS (a new region widening/narrowing the
 *  visible circle). Comparing the spawn radius, not the raw fog far, avoids a
 *  rebuild storm while clearView lerps the fog to the horizon on a zoom change:
 *  above ~290 the radius is pinned at the hard cap, so those huge fog swings
 *  trigger nothing. A back-and-forth shorter than the step returns false. */
export function floraShouldRebuild(
  pos: { x: number; z: number },
  last: { x: number; z: number; fogFar: number } | null,
  fogFar: number,
): boolean {
  if (!last) return true
  if (Math.abs(floraSpawnRadius(fogFar) - floraSpawnRadius(last.fogFar)) >= 1) return true
  return Math.hypot(pos.x - last.x, pos.z - last.z) >= FLORA_REBUILD_STEP
}

const offsetCache = new Map<number, ReadonlyArray<readonly [number, number]>>()

/** Chunk offsets (dx,dz) within ±range, ordered by squared distance from the
 *  player's chunk (nearest first). The fill iterates these so a full instance
 *  buffer drops the FARTHEST plants and the drawn edge stays a fogged circle
 *  (point 171) rather than a ragged, chunk-order boundary. Memoised per range,
 *  since the order depends only on the range. */
export function chunkOffsetsByDistance(range: number): ReadonlyArray<readonly [number, number]> {
  const hit = offsetCache.get(range)
  if (hit) return hit
  const offs: Array<readonly [number, number]> = []
  for (let dz = -range; dz <= range; dz++) {
    for (let dx = -range; dx <= range; dx++) offs.push([dx, dz] as const)
  }
  offs.sort((a, b) => a[0] * a[0] + a[1] * a[1] - (b[0] * b[0] + b[1] * b[1]))
  offsetCache.set(range, offs)
  return offs
}
