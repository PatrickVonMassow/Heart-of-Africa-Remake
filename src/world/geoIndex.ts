// Geography query layer. Since the switch to real geodata (design.md §3
// "Real geodata and terrain rendering") this delegates to:
//   - geodata.ts: bilinear DEM samplers (elevation, land mask, coast dist)
//     built from real SRTM-composite tiles by scripts/build-geodata.mjs
//   - hydro.ts:  exact spline-densified vector distances for the authored
//     ~1890 rivers and lakes (no rasterization, no stair-steps)
// The old raster/Chaikin index is gone; the public API is kept.

import { coastDistanceAt, landFractionAt } from './geodata'
import { lakeContains, lakeShoreDistanceExact, riverDistanceExact } from './hydro'

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

/** Exact distance to the nearest river centerline in degrees, capped. */
export function riverDistance(lat: number, lon: number, maxDist = 4): number {
  return riverDistanceExact(lat, lon, Math.min(maxDist, 0.45))
}

/** Exact distance to the nearest lake shoreline in degrees, capped. */
export function lakeDistance(lat: number, lon: number, maxDist = 4): number {
  return lakeShoreDistanceExact(lat, lon, Math.min(maxDist, 0.45))
}
