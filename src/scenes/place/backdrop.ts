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

// Where PlaceScene mounts the two ground surfaces, measured out from the
// walkable radius: the geometry backdrop's inner rim, and the ground disc's
// edge. The disc therefore overhangs the walkable limit, so the player never
// looks at the plate's own edge from the last step he may take.
export const BACKDROP_INNER_OFFSET = 12
export const GROUND_DISC_OVERHANG = 14
// The settlement ground disc overhangs the backdrop's inner rim by this many
// place-units (the difference between the two mounts above).
export const BACKDROP_DISC_OVERLAP = GROUND_DISC_OVERHANG - BACKDROP_INNER_OFFSET
// How far the inner rim tucks below the settlement ground disc, so the rim is
// hidden under the disc rather than joining it flush.
export const BACKDROP_RIM_DROP = 2

// --- How far a walkable disc may reach (point 390) ---------------------------

/** Radius of the captured §2.5 panorama band cylinder (place units). The band
 *  IS the horizon on a normal entry, so everything that has to read as standing
 *  in FRONT of it — the ground plate, the drifting silhouettes — must stay
 *  inside this. */
export const PANORAMA_RADIUS = 200

/** Clearance kept between the OUTERMOST drifting silhouette ring and the band,
 *  so a silhouette always stands clearly in front of the horizon rather than
 *  being swallowed by it. */
export const PANORAMA_RING_CLEARANCE = 5

/**
 * The walkable radius an OPEN-PLAIN place may carry (point 390).
 *
 * Where the surroundings are a built or broken edge the disc may end at it,
 * because the eye reads a boundary. Where they are an open plain running
 * unbroken to the horizon — the desert monument sites — the picture promises
 * ground the whole way, so the disc must reach as far as the scene's own
 * construction allows. That limit is NOT the terrain: the geometry backdrop is
 * a compressed miniature anchored to the disc edge, so its relief always begins
 * immediately past the plate whatever the radius. The limit is the §2.5
 * panorama band, which stands at a FIXED `PANORAMA_RADIUS` — the drifting
 * silhouettes are placed at `walkRadius + BACKDROP_INNER_OFFSET + ringSpan` and
 * would disappear behind the band the moment they passed it.
 *
 * @param silhouetteRingSpan how far past the backdrop's inner rim the outermost
 *   drifting silhouette can sit (`balance.panoramaWildlife.ringInner +
 *   ringSpread`).
 */
export function openPlainWalkRadius(silhouetteRingSpan: number): number {
  return PANORAMA_RADIUS - PANORAMA_RING_CLEARANCE - BACKDROP_INNER_OFFSET - silhouetteRingSpan
}

/** Chord the walkable ground disc's edge keeps: 192 segments at the historical
 *  74 m edge. A 48-gon there put 9.7 m chords on the ground line and read as
 *  the hard straight edge of point 381. */
const GROUND_DISC_CHORD = (2 * Math.PI * 74) / 192

/**
 * Radial segments of the walkable ground disc, DERIVED from its own edge so the
 * chord length holds as the disc grows (point 390 widened the Giza plate). A
 * fixed count would have coarsened the ground line exactly where the widened
 * desert plate puts the player closest to it.
 */
export function groundDiscSegments(discEdge: number): number {
  return Math.max(192, Math.ceil((2 * Math.PI * discEdge) / GROUND_DISC_CHORD))
}

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
 * The backdrop surface at radius `r` for a given exaggerated relief — the ONE
 * shape formula, shared by the mesh build and `backdropHeightAt`, so no third
 * consumer can drift from the drawn geometry.
 *
 * Two bounds, both slope-free of any per-site constant:
 *  - UP, `r * BACKDROP_MAX_SLOPE`: a mountainous surround stays a distant range
 *    instead of arcing over the camera (§2.5).
 *  - DOWN, the base curve itself: outside the ground disc the surroundings may
 *    RISE but never sink below the plane the player stands on. The old floor was
 *    a flat −6, which tore the horizon open (point 381): the taper reaches 1
 *    within ~40 % of r0, so a surround sampling lower than the place centre —
 *    a plateau over a valley (Giza over the Nile), any coast, any river within
 *    the band's 1.7° reach — plunged 6 units in a few metres, while the eye's
 *    grazing line over the disc edge descends only eyeHeight/(2·discEdge) per
 *    unit (~0.01 at Giza). The surface therefore never met that line again
 *    inside BACKDROP_OUTER: past the disc rim there was NO ground at all, and
 *    the frame showed the disc's hard edge, then the captured band's low rows
 *    and the sky behind them. Measured before the fix, the sight line escaped
 *    in 48/320 azimuths from Giza's centre and in 3–241/320 from the far rim at
 *    EVERY place — the condition is the disc radius (a wider disc flattens the
 *    grazing line) plus a lower surround, never a site.
 *
 * Clamping the fall at the base costs nothing visible: a dip below the disc
 * plane is what the disc edge occludes anyway. Water and lowland keep their
 * terrain COLOUR, so a sea still reads as sea — as a plain at the horizon
 * rather than a hole in it.
 */
export function backdropSurfaceY(r: number, r0: number, relief: number): number {
  const base = backdropBase(r, r0)
  // Under the disc overhang the rim carries NO relief: a steeply rising
  // surround would otherwise push it through the plate the player walks on.
  // Nothing is lost — the plate hides this span — and the base still feathers
  // the rim up to exactly the disc plane at the edge.
  if (r < r0 + BACKDROP_DISC_OVERLAP) return base
  const capped = Math.min(r * BACKDROP_MAX_SLOPE, Math.max(0, relief))
  return capped * backdropTaper(r, r0) + base
}

/**
 * Radius of mesh ring `ri` — logarithmic spacing (more detail near the place),
 * but with ring 1 pinned to the GROUND-DISC EDGE (point 381).
 *
 * Without that pin no vertex fell on the edge at all: the log ladder's second
 * ring cleared it (74.4 against Giza's 74), so the strip from the tucked rim
 * INTERPOLATED across the join and the drawn surface sat a third of a unit
 * below the plate exactly where the plate ends — the pale slab with a visible
 * thickness in the report. With the pin the mesh meets the disc plane at the
 * disc edge, which is where `backdropBase` says it should.
 */
export function backdropRingRadius(ri: number, r0: number, rings: number = BACKDROP_RINGS): number {
  if (ri <= 0) return r0
  const edge = r0 + BACKDROP_DISC_OVERLAP
  if (ri === 1) return edge
  return edge * Math.pow(BACKDROP_OUTER / edge, (ri - 1) / (rings - 2))
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
  return backdropSurfaceY(r, r0, (smp.height - centerH) * BACKDROP_HEIGHT)
}

/**
 * Height at which the eye's line over the settlement's GROUND-DISC EDGE passes
 * the point (x, z) — the drawn ground line in that direction (point 181).
 *
 * The walkable disc is the nearest hard horizon from eye height: past its edge
 * the backdrop relief can dip out of sight (a plain like Cairo's dips below the
 * disc plane), and through that gap the far panorama band shows. A silhouette
 * anchored above this line therefore stands on nothing at all — the surface
 * behind its feet is the band cylinder, tens of units further out, and it hangs
 * in the sky over whatever the band happens to show there (the reported Cairo
 * pyramid). Anchored ON the line, its feet meet the last drawn ground.
 *
 * Camera-relative on purpose: the disc edge is CLOSE, so its horizon drops
 * steeply as the player walks toward it. Evaluated from the live camera, the
 * feet stay glued to the ground line from wherever the settlement is viewed.
 */
export function discHorizonY(
  x: number,
  z: number,
  camX: number,
  camZ: number,
  eyeHeight: number,
  discRadius: number,
): number {
  const dx = x - camX
  const dz = z - camZ
  const toTarget = Math.hypot(dx, dz) || 1
  const ux = dx / toTarget
  const uz = dz / toTarget
  // Where the sight ray leaves the disc: |cam + t·u| = discRadius.
  const b = camX * ux + camZ * uz
  const c = camX * camX + camZ * camZ - discRadius * discRadius
  const toEdge = Math.max(1e-3, -b + Math.sqrt(Math.max(0, b * b - c)))
  // The disc plate lies at y = 0, so the grazing line drops eyeHeight over
  // toEdge and keeps dropping at that rate out to the target.
  return eyeHeight * (1 - toTarget / toEdge)
}

/**
 * Where a §2.5 panorama silhouette's FEET belong (point 181): on the ground the
 * frame actually draws under them — the higher of the relief at its own spot and
 * the drawn ground line over the disc edge.
 *
 * Both failure modes of the old anchors are covered: the hard EYE_HEIGHT horizon
 * left the animal hanging over the captured band (nothing under its feet), while
 * the bare heightfield buried it inside a dune where the relief rises and, with
 * the old `panoramaGroundY` clamp, lifted it off the ground again where the
 * relief dips. On a dune it now walks the ridge; on a plain that falls away it
 * stands exactly on the visible ground line.
 */
export function panoramaStandY(
  x: number,
  z: number,
  lat: number,
  lon: number,
  seed: number,
  centerH: number,
  r0: number,
  camX: number,
  camZ: number,
  eyeHeight: number,
): number {
  const own = backdropHeightAt(x, z, lat, lon, seed, centerH, r0)
  const line = discHorizonY(x, z, camX, camZ, eyeHeight, r0 + BACKDROP_DISC_OVERLAP)
  return Math.max(own, line)
}
