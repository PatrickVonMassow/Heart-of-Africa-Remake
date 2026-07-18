// Zoom-aware flora streaming (design.md §19.9, point 164). The dressing used to
// rebuild a FIXED ±6-chunk neighbourhood on every chunk crossing, so its square
// edge (≈120-227 units) popped in and out — and jumped BACK AND FORTH when the
// traveller drove across a boundary repeatedly, worst at a wide zoom where that
// edge sits inside the view. These pure rules move the edge to a CIRCLE just
// beyond the view and gate the rebuild behind a hysteresis step, so the pop is
// always off-screen and a back-and-forth never re-pops. Kept separate from the
// three.js render loop so the rules are unit-testable.

/** The bird's-eye view radius at zoom 1 — matches the wildlife view ring
 *  (Wildlife.tsx VIEW_AT_ZOOM1), so flora and animals stream to the same edge. */
export const FLORA_VIEW_AT_ZOOM1 = 100
/** Plants are drawn out to viewR + this, so the streaming edge is a circle
 *  strictly BEYOND the view circle and its pop is never in sight. */
export const FLORA_SPAWN_MARGIN = 30
/** A rebuild fires only once the player has moved this far since the last one
 *  (or the zoom changed) — a back-and-forth shorter than this does not rebuild,
 *  so the frozen edge cannot re-pop. Must stay below FLORA_SPAWN_MARGIN so the
 *  edge, receding by at most this between rebuilds, never crosses into view. */
export const FLORA_REBUILD_STEP = 16
/** Chunk-iteration cap for the rebuild cost; VEGETATION_HIDE_ZOOM keeps viewR
 *  under what this radius covers so the capped edge never enters view. */
export const FLORA_RANGE_MAX = 12

/** The radius (world units) out to which flora is drawn at a given zoom — the
 *  circular streaming edge, always FLORA_SPAWN_MARGIN beyond the view. */
export function floraSpawnRadius(zoom: number): number {
  return FLORA_VIEW_AT_ZOOM1 * zoom + FLORA_SPAWN_MARGIN
}

/** The half-width (in chunks) to iterate so the spawn circle is fully covered,
 *  capped for cost. +1 guards the corner of the bounding square. */
export function floraChunkRange(zoom: number, chunkSize: number): number {
  return Math.min(FLORA_RANGE_MAX, Math.ceil(floraSpawnRadius(zoom) / chunkSize) + 1)
}

/** Whether a plant at (x,z) is inside the spawn circle around the player — the
 *  circular edge that keeps the pop off-screen. */
export function floraInSpawnCircle(x: number, z: number, px: number, pz: number, spawnR: number): boolean {
  const dx = x - px
  const dz = z - pz
  return dx * dx + dz * dz <= spawnR * spawnR
}

/** The rebuild hysteresis: rebuild when there is no prior build, when the player
 *  has moved at least FLORA_REBUILD_STEP since the last one, or when the zoom
 *  changed. A back-and-forth shorter than the step returns false — no re-pop. */
export function floraShouldRebuild(
  pos: { x: number; z: number },
  last: { x: number; z: number; zoom: number } | null,
  zoom: number,
): boolean {
  if (!last) return true
  if (Math.abs(zoom - last.zoom) >= 0.05) return true
  return Math.hypot(pos.x - last.x, pos.z - last.z) >= FLORA_REBUILD_STEP
}
