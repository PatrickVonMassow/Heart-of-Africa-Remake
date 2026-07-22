// Terrain chunk LOD rules (design.md §3.3, CLAUDE.md §7.1 pt. 11): extracted
// from TravelScene so the near-ring refinement gates are unit-testable
// (terrainShading.test.ts — the floraStreaming.ts precedent).
//
// The DEM texel is 0.025 deg = 0.25 world units; the base LOD samples a chunk
// at 0.43-1.2 wu per vertex, which re-quantizes the C1-smooth bicubic
// elevation field into polyline folds — the "angular mountains" report. The
// shading is already smooth (central-difference vertex normals), so the
// remaining facets are the SILHOUETTE class: only finer tessellation rounds
// them. Mirroring the accepted coastal doubling, a near chunk with real
// mountain relief doubles its segments (capped), so mountains sample at
// ~1 texel while the flat basins keep the base cost.

import { worldToLatLon } from '../../world/geo'
import { elevationAt } from '../../world/geodata'

/** Chunk edge length in world units — must match TravelScene.tsx (and
 *  Wildlife.tsx, which duplicates it the same way). */
const CHUNK_SIZE = 24

/** Base mesh resolution per chunk by Chebyshev ring distance. */
export function lodSegments(ring: number): number {
  return ring <= 2 ? 56 : ring <= 4 ? 28 : 20
}

/** Ring limit and cap for the near-ring quality doubling (coastal and
 *  mountainous chunks): 112 segments = 0.21 wu per vertex, just under one
 *  DEM texel — finer would re-sample interpolation, not data. */
export const REFINE_RING_MAX = 4
export const REFINE_SEGMENT_CAP = 112

/**
 * Segments for a chunk after the near-ring quality gates. `refine` is the
 * OR of the per-chunk gates (coast-crossing, mountainous); either doubles
 * the base resolution once — never twice — and only inside the near rings.
 */
export function refinedSegments(ring: number, refine: boolean): number {
  const base = lodSegments(ring)
  return refine && ring <= REFINE_RING_MAX ? Math.min(REFINE_SEGMENT_CAP, base * 2) : base
}

/** A chunk peaking above this is mountain terrain (terrain.ts MOUNTAIN_M). */
export const MOUNTAIN_CHUNK_PEAK_M = 1600
/**
 * Land-relief span (meters) above which a chunk reads as mountainous. A 2.4
 * deg chunk is large, so the span accumulates: measured over the whole world
 * grid, 250 m marks 78 % of land chunks, 400 m marks 60 %, 600 m 45 %. 400
 * keeps every massif and the valley scarps (Atlas, Kilimanjaro, Ethiopian
 * highlands, the Nile valley) while the flat basins (Sahel, Congo, Kalahari)
 * stay at base cost.
 */
export const MOUNTAIN_CHUNK_RELIEF_M = 400

/**
 * Whether a chunk carries mountain relief that would visibly step at the
 * base LOD. Probed on the same cheap 5x5 grid as the coastal gate, from the
 * real (bicubic, seed-independent) elevation — the identical value
 * sampleTerrain().elevation carries. Pure sea-floor spans are bathymetry
 * under the ocean plane, never mountains.
 */
export function chunkIsMountainous(cx: number, cz: number): boolean {
  const x0 = cx * CHUNK_SIZE
  const z0 = cz * CHUNK_SIZE
  let min = Infinity
  let max = -Infinity
  for (let iz = 0; iz <= 4; iz++) {
    for (let ix = 0; ix <= 4; ix++) {
      const { lat, lon } = worldToLatLon(x0 + (ix / 4) * CHUNK_SIZE, z0 + (iz / 4) * CHUNK_SIZE)
      const e = elevationAt(lat, lon)
      if (e < min) min = e
      if (e > max) max = e
    }
  }
  if (max <= 0) return false
  return max > MOUNTAIN_CHUNK_PEAK_M || max - Math.max(min, 0) > MOUNTAIN_CHUNK_RELIEF_M
}
