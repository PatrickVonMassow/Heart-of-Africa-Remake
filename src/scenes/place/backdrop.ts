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
// Mesh resolution. Doubled (24×160 → 48×320) after the user-reported hard
// polygon facets on the Cairo dune ridge: the shading is already smooth
// (interpolated vertex normals), so the visible steps were the SILHOUETTE of
// the coarse heightfield sampling. The taper below is a pure radius function,
// so raising the resolution never changes the backdrop's shape.
export const BACKDROP_RINGS = 48
export const BACKDROP_SEGS = 320
export const BACKDROP_OUTER = 340 // outermost ring radius

// The inner rim fades in over a fixed fraction of the log-radial span
// (historically the first 5 of 24 rings) — resolution-independent.
export const BACKDROP_TAPER_SPAN = 5 / 23

// The settlement ground disc overhangs the backdrop's inner rim by this many
// place-units (PlaceScene mounts the backdrop at r0 = layout.radius + 12 and the
// ground disc at layout.radius + 14, so the disc edge is r0 + this).
export const BACKDROP_DISC_OVERLAP = 2
// How far the inner rim tucks below the settlement ground disc, so the rim is
// hidden under the disc rather than joining it flush.
export const BACKDROP_RIM_DROP = 2

/** Inner-rim fade-in (0 at r0 → 1 past the taper band) as a pure function of
 * the radius, shared by the mesh build and `backdropHeightAt`. */
export function backdropTaper(r: number, r0: number): number {
  const t = Math.log(Math.max(r, r0) / r0) / Math.log(BACKDROP_OUTER / r0)
  return Math.min(1, t / BACKDROP_TAPER_SPAN)
}

/**
 * Vertical base offset of the backdrop surface (before the relief term), a pure
 * function of the radius shared by the mesh build and `backdropHeightAt`.
 *
 * The rim tucks `BACKDROP_RIM_DROP` below the settlement ground disc at r0 (so it
 * hides under the disc) and feathers UP to the disc plane (0) across the disc
 * overhang, reaching 0 exactly at the disc edge (r0 + BACKDROP_DISC_OVERLAP) and
 * staying flush beyond it. This keeps the horizon that emerges at the disc edge
 * continuous with the walkable ground — no hard step or sunken moat where the two
 * meet (point 236). Before, the base was a flat -2, so on a flat plain (delta
 * ports like Cairo/Khartoum) the backdrop stayed ~2 units below the disc past its
 * edge, reading as a rectangular notch around the settlement.
 */
export function backdropBase(r: number, r0: number): number {
  const joinT = Math.min(1, Math.max(0, (r - r0) / BACKDROP_DISC_OVERLAP))
  return -BACKDROP_RIM_DROP * (1 - joinT)
}

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
  return capped * backdropTaper(r, r0) + backdropBase(r, r0)
}

/**
 * Standing height for a panorama-wildlife silhouette. Past the ground-disc edge
 * the backdrop base is flush with the settlement's ground disc (point 236), but a
 * flat plain's relief can still dip just below it, and the disc edge acts as a
 * false horizon from eye height: an animal standing down there is horizon-clipped
 * to a black back-and-horns sliver "lying on the sand" (user-reported artifact).
 * Clamp to just above the disc plane so the whole silhouette stays visible; where
 * the relief genuinely rises (dunes, ridges) the animal keeps following it.
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
