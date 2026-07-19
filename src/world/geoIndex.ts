// Geography query layer. Since the switch to real geodata (design.md §3
// "Real geodata and terrain rendering") this delegates to:
//   - geodata.ts: bilinear DEM samplers (elevation, land mask, coast dist)
//     built from real SRTM-composite tiles by scripts/build-geodata.mjs
//   - hydro.ts:  exact spline-densified vector distances for the authored
//     ~1890 rivers and lakes (no rasterization, no stair-steps)
// The old raster/Chaikin index is gone; the public API is kept.

import { coastDistanceAt, landFractionAt } from './geodata'
import { lakeContains, lakeShoreDistanceExact, riverDistanceExact, riverFlowExact } from './hydro'

export const CELL_OCEAN = 0
export const CELL_LAND = 1
export const CELL_LAKE = 2

/** Discrete cell classification at a point (ocean / land / lake). */
export function cellAt(lat: number, lon: number): number {
  if (landFractionAt(lat, lon) < 0.5) return CELL_OCEAN
  if (lakeContains(lat, lon)) return CELL_LAKE
  return CELL_LAND
}

/** Distance to the sea coast in degrees (0 in the ocean). */
export function coastDistance(lat: number, lon: number, maxDist = 4): number {
  return Math.min(maxDist, coastDistanceAt(lat, lon))
}

// The reliably-resolvable radius grows with the bucket-search `range`: 3x3
// (range 1) resolves ~0.45deg, 5x5 (range 2) ~0.9deg. The clamp reflects that so
// a caller cannot ask for more than the neighbourhood can actually see. Default
// range 1 keeps every existing caller at exactly 0.45 (point 176).
const resolvableRadius = (range: number): number => 0.45 * range

/** Exact distance to the nearest river centerline in degrees, capped. `range`
 *  widens the bucket search (default 1 = 3x3; 2 = 5x5, for the dry-season drink
 *  catchment, point 176). */
export function riverDistance(lat: number, lon: number, maxDist = 4, range = 1): number {
  return riverDistanceExact(lat, lon, Math.min(maxDist, resolvableRadius(range)), range)
}

/** Exact distance to the nearest lake shoreline in degrees, capped (see
 *  riverDistance for `range`). */
export function lakeDistance(lat: number, lon: number, maxDist = 4, range = 1): number {
  return lakeShoreDistanceExact(lat, lon, Math.min(maxDist, resolvableRadius(range)), range)
}

/** Downstream river flow at a point (design.md §11): unit direction in (lat,
 *  lon) and a 0..1 strength that fades away from the centerline (0 off rivers). */
export function riverFlow(lat: number, lon: number): { dirLat: number; dirLon: number; strength: number } {
  return riverFlowExact(lat, lon)
}
