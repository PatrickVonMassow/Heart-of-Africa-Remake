// The settlement's walkable boundary — THE one source (design.md §2.6,
// work-order 352/488/482).
//
// Three consumers must agree on it and can never be allowed to drift: the leave
// check in PlaceScene (walking past the boundary swaps the scene, design.md
// §2.3), the edge band painted on the ground, which tells the player where that
// boundary lies, and the inhabitants, who keep to the same shape the player
// does. A visible edge in the wrong place is worse than none, because the player
// will trust it — so the band does not carry a radius of its own. It reads THIS
// module, and only this module.
//
// The boundary is NO LONGER A PLAIN CIRCLE (work-order 482): a village standing
// on a river grows a lobe out to the water, so the bank is walkable ground of
// the settlement instead of something past its edge. The lobe is still ONE
// radius per bearing — both shapes it is built from contain the centre, so their
// union is star-shaped about it — which is why the band's angular lookup
// (`buildBoundaryLut`) needed no change at all to follow it.

import { BANK_FADE_ANGLE, BANK_PLATEAU_ANGLE, type PlaceRiverBank } from './riverBank'

/** How many angles the band's boundary lookup samples (see `buildBoundaryLut`).
 *  1024, not the historical 256: a plain circle needs one texel, but the bank
 *  lobe's edge climbs from the walkable radius out to the waterline across ~12°,
 *  and at 256 texels one step of the lookup already moved the painted edge by
 *  most of a metre — a band that misplaces itself by a stride is a band that
 *  lies. A kilobyte of lookup buys the angular resolution back. */
export const BOUNDARY_LUT_SIZE = 1024

/** What the boundary is read from: the plain walkable radius, and the river
 *  bank where the settlement has one. */
export interface PlaceBounds {
  radius: number
  bank?: PlaceRiverBank | null
}

/** Smoothstep, with the edges given in either order. */
function ramp(edge0: number, edge1: number, x: number): number {
  if (edge1 === edge0) return x < edge0 ? 0 : 1
  let t = (x - edge0) / (edge1 - edge0)
  t = t < 0 ? 0 : t > 1 ? 1 : t
  return t * t * (3 - 2 * t)
}

/** Signed difference of two bearings, wrapped to [−π, π]. */
function bearingDelta(a: number, b: number): number {
  let d = (a - b) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return d
}

/**
 * The walkable radius at a bearing, in metres from the place centre. `angle` is
 * the world bearing `atan2(z, x)`, the same convention the band's shader uses.
 *
 * Where a bank lies on that bearing the boundary follows the WATERLINE — a
 * straight line, whose radius therefore grows as 1/cos away from the bank's own
 * bearing — across a plateau, and tapers back to the plain radius over the
 * fade. The taper is what keeps a walk along the bank from ending at a corner:
 * the edge curves inland ahead of the player instead of vanishing under him.
 */
export function placeBoundaryRadius(bounds: PlaceBounds, angle = 0): number {
  const bank = bounds.bank
  if (!bank) return bounds.radius
  const delta = Math.abs(bearingDelta(angle, Math.atan2(bank.nz, bank.nx)))
  if (delta >= BANK_FADE_ANGLE) return bounds.radius
  const cos = Math.cos(delta)
  if (cos <= 1e-6) return bounds.radius
  // The waterline at this bearing, and how much of the way out to it the lobe
  // reaches here (all of it across the plateau, none of it past the fade).
  const water = bank.walkEdge / cos
  const reach =
    bounds.radius + (water - bounds.radius) * ramp(BANK_FADE_ANGLE, BANK_PLATEAU_ANGLE, delta)
  return Math.max(bounds.radius, Math.min(water, reach))
}

/** True once the traveller has walked out of the settlement (the leave check). */
export function isOutsidePlace(bounds: PlaceBounds, x: number, z: number): boolean {
  return Math.hypot(x, z) > placeBoundaryRadius(bounds, Math.atan2(z, x))
}

/** Whether a mover of the given clearance still stands inside the settlement —
 *  what the inhabitants walk by, so they keep to the shape the player does
 *  rather than to a circle of their own. */
export function insidePlace(bounds: PlaceBounds, x: number, z: number, margin = 0): boolean {
  return Math.hypot(x, z) <= placeBoundaryRadius(bounds, Math.atan2(z, x)) - margin
}

/** The largest radius the boundary ever reaches — what the drawn ground has to
 *  cover, so the player never walks off the plate he is standing on. */
export function maxBoundaryRadius(bounds: PlaceBounds): number {
  if (!bounds.bank) return bounds.radius
  return Math.max(bounds.radius, bounds.bank.walkEdge / Math.cos(BANK_PLATEAU_ANGLE))
}

/**
 * The radius of the DRAWN ground plate at a bearing: the disc, cut off along the
 * straight top of the river bank where there is one. Past that cut the shore
 * strip slopes down and the water takes over, so the plate has to end exactly
 * there — over the lobe's plateau this line IS the boundary.
 */
export function groundPlateRadius(bounds: PlaceBounds, angle: number, discEdge: number): number {
  const bank = bounds.bank
  if (!bank) return discEdge
  const cos = Math.cos(bearingDelta(angle, Math.atan2(bank.nz, bank.nx)))
  if (cos <= 1e-6) return discEdge
  return Math.min(discEdge, bank.walkEdge / cos)
}

/**
 * The boundary sampled over the full turn, for the band's angle lookup: texel
 * `j` holds the radius at the centre of its angular slice, so the shader's
 * linear filtering lands on the boundary between samples too.
 */
export function buildBoundaryLut(bounds: PlaceBounds, size = BOUNDARY_LUT_SIZE): Float32Array {
  const out = new Float32Array(size)
  for (let j = 0; j < size; j++) {
    out[j] = placeBoundaryRadius(bounds, ((j + 0.5) / size) * Math.PI * 2)
  }
  return out
}
