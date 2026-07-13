// Pure geometry of the first-person surroundings panorama (design.md §2.5):
// the annulus heightfield formula shared by the backdrop mesh and the
// panorama wildlife, kept three-free so the shape rules are unit-testable.

import { sampleTerrain } from '../../world/terrain'

export const BACKDROP_SCALE = 0.005 // degrees of map per place-unit of distance
export const BACKDROP_HEIGHT = 30 // vertical exaggeration of the map relief
// Max backdrop rise as a fraction of the ring's distance (~tan of the elevation
// angle): keeps mountains as a distant horizon range, never looming over the
// camera. atan(0.32) ≈ 18°.
export const BACKDROP_MAX_SLOPE = 0.32
export const BACKDROP_RINGS = 24
export const BACKDROP_SEGS = 160 // smoother far-range silhouette (shader adds detail)
export const BACKDROP_OUTER = 340 // outermost ring radius

/**
 * Height of the backdrop surface at a point (x, z) around the place centre —
 * the same formula the backdrop mesh is built from, so panorama wildlife can
 * sit on the relief instead of floating above it or sinking into it (§2.5).
 */
export function backdropHeightAt(
  x: number,
  z: number,
  lat: number,
  lon: number,
  seed: number,
  centerH: number,
  r0: number,
): number {
  const r = Math.hypot(x, z)
  const smp = sampleTerrain(lat - z * BACKDROP_SCALE, lon + x * BACKDROP_SCALE, seed)
  const relief = (smp.height - centerH) * BACKDROP_HEIGHT
  const capped = Math.min(r * BACKDROP_MAX_SLOPE, Math.max(-6, relief))
  const ri = ((BACKDROP_RINGS - 1) * Math.log(Math.max(r, r0) / r0)) / Math.log(BACKDROP_OUTER / r0)
  const taper = Math.min(1, ri / 5)
  return capped * taper - 2
}

/**
 * Standing height for a panorama-wildlife silhouette. The backdrop's flat
 * inner plain sits ~2 units BELOW the settlement's ground disc, whose edge
 * acts as a false horizon from eye height: an animal standing down there is
 * horizon-clipped to a black back-and-horns sliver "lying on the sand"
 * (user-reported artifact). Clamp to just above the disc plane so the whole
 * silhouette stays visible; where the relief genuinely rises (dunes, ridges)
 * the animal keeps following it.
 */
export function panoramaGroundY(
  x: number,
  z: number,
  lat: number,
  lon: number,
  seed: number,
  centerH: number,
  r0: number,
): number {
  return Math.max(0.02, backdropHeightAt(x, z, lat, lon, seed, centerH, r0))
}
