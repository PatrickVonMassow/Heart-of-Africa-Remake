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
// on a river grows a lobe out past the waterline to its wade edge, so the bank
// is walkable ground of the settlement instead of something past its edge. The
// lobe is still ONE
// radius per bearing — both shapes it is built from contain the centre, so their
// union is star-shaped about it — which is why the band's angular lookup
// (`buildBoundaryLut`) needed no change at all to follow it.
//
// It also GROWS AROUND THE WATCHED SCENES (work-order 1252): every scene ground
// the layout names (`observed`) keeps `balance.observerMargin` of walkable room
// around it, so stepping aside to watch never leaves the village. The bulge is
// the far side of the margin disc along each ray, which still contains the
// centre, so the region stays star-shaped and one radius per bearing.

import { BACKDROP_INNER_OFFSET } from './backdrop'
import { balance } from '../../config/balance'
import {
  BANK_BED_REACH,
  BANK_DISC_SHIFT_EASE_ANGLE,
  BANK_FADE_ANGLE,
  BANK_PLATEAU_ANGLE,
  type PlaceRiverBank,
} from './riverBank'

/** How many angles the band's boundary lookup samples (see `buildBoundaryLut`).
 *  1024, not the historical 256: a plain circle needs one texel, but the bank
 *  lobe's edge climbs from the walkable radius out to the wade edge across ~12°,
 *  and at 256 texels one step of the lookup already moved the painted edge by
 *  most of a metre — a band that misplaces itself by a stride is a band that
 *  lies. Four kilobytes of lookup buy the angular resolution back. */
export const BOUNDARY_LUT_SIZE = 1024

/** A scene ground the player watches: a disc enclosing its whole extent. */
export interface ObservedGround {
  x: number
  z: number
  r: number
}

/** What the boundary is read from: the plain walkable radius, the river bank
 *  where the settlement has one, and the scene grounds it keeps room around. */
export interface PlaceBounds {
  radius: number
  bank?: PlaceRiverBank | null
  observed?: readonly ObservedGround[]
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
 * Where a bank lies on that bearing the boundary follows the WADE LIMIT — a
 * straight line out in the shallows, whose radius therefore grows as 1/cos away
 * from the bank's own bearing — across a plateau, and tapers back to the plain
 * radius over the fade. The taper is what keeps a walk along the bank from
 * ending at a corner: the edge curves inland ahead of the player instead of
 * vanishing under him.
 *
 * It runs PAST the waterline on purpose (work-order 584): the traveller walks
 * down the drawn shore and wades until he is out of his depth, and only there
 * does the settlement end — no plane at the water's edge holds him, and the
 * river he wades into is the one the bird's-eye view lets him swim.
 */
export function placeBoundaryRadius(bounds: PlaceBounds, angle = 0): number {
  const lobe = lobeRadius(bounds, angle)
  const observed = bounds.observed
  if (!observed || observed.length === 0) return lobe
  let reach = 0
  for (const g of observed) reach = Math.max(reach, observerReach(g, angle))
  if (reach <= lobe) return lobe
  // Never past the wade limit: toward the river the water is the edge, and an
  // observer stands on the shore.
  const bank = bounds.bank
  if (bank) {
    const cos = Math.cos(bearingDelta(angle, Math.atan2(bank.nz, bank.nx)))
    if (cos > 1e-6) reach = Math.min(reach, bank.wadeEdge / cos)
  }
  return Math.max(lobe, reach)
}

/**
 * How far along a ray from the centre the observer disc around a scene ground
 * reaches — its far side where the ray crosses it, else the projection of its
 * centre, which joins the far side at the tangent, so the result is continuous
 * over the full turn.
 */
function observerReach(g: ObservedGround, angle: number): number {
  const d = Math.hypot(g.x, g.z)
  const big = g.r + balance.observerMargin
  const delta = bearingDelta(angle, Math.atan2(g.z, g.x))
  const across = d * Math.sin(delta)
  return Math.max(0, d * Math.cos(delta) + Math.sqrt(Math.max(0, big * big - across * across)))
}

/** The plain radius with the bank lobe — the boundary before the scene room. */
function lobeRadius(bounds: PlaceBounds, angle: number): number {
  const bank = bounds.bank
  if (!bank) return bounds.radius
  const delta = Math.abs(bearingDelta(angle, Math.atan2(bank.nz, bank.nx)))
  const plateau = BANK_PLATEAU_ANGLE
  const fade = BANK_FADE_ANGLE
  if (delta >= fade) return bounds.radius
  // Both fades stay < π/2, so cos stays well above zero past the early return.
  const cos = Math.cos(delta)
  // The wade limit at this bearing, and how much of the way out to it the lobe
  // reaches here (all of it across the plateau, none of it past the fade).
  const water = bank.wadeEdge / cos
  const reach = bounds.radius + (water - bounds.radius) * ramp(fade, plateau, delta)
  return Math.max(bounds.radius, Math.min(water, reach))
}

/** Whether a bearing lies inside the bank lobe's arc — plateau or fade. The
 *  lobe is symmetric about the bank normal (work-order 1245). */
export function inBankArc(bank: Pick<PlaceRiverBank, 'nx' | 'nz'>, angle: number): boolean {
  const delta = Math.abs(bearingDelta(angle, Math.atan2(bank.nz, bank.nx)))
  return delta < BANK_FADE_ANGLE
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
  // A scene's room reaches at most its far side; an upper bound is enough here.
  let observed = 0
  for (const g of bounds.observed ?? []) observed = Math.max(observed, Math.hypot(g.x, g.z) + g.r + balance.observerMargin)
  const bank = bounds.bank
  if (!bank) return Math.max(bounds.radius, observed)
  // The plateau's rim, and a sweep of the fade: the lobe still reaches outward
  // for a little past the plateau, where the wade line grows faster than the
  // taper draws it in. The lobe is symmetric, so one side answers for both.
  const normal = Math.atan2(bank.nz, bank.nx)
  let widest = Math.max(bounds.radius, bank.wadeEdge / Math.cos(BANK_PLATEAU_ANGLE))
  for (let i = 0; i <= 256; i++) {
    const delta = BANK_PLATEAU_ANGLE + (i / 256) * (BANK_FADE_ANGLE - BANK_PLATEAU_ANGLE)
    widest = Math.max(widest, lobeRadius(bounds, normal + delta))
  }
  return Math.max(widest, observed)
}

/**
 * The radius of the DRAWN ground plate at a bearing: the disc, cut off along the
 * straight top of the river bank where there is one. Past that cut the shore
 * strip slopes down and the water takes over, so the plate has to end exactly
 * there — and the shore, not the plate, is what the last stretch of the
 * walkable region is drawn on (work-order 584).
 */
export function groundPlateRadius(bounds: PlaceBounds, angle: number, discEdge: number): number {
  const bank = bounds.bank
  const edge = discEdge + groundDiscShift(bounds, angle)
  if (!bank) return edge
  const cos = Math.cos(bearingDelta(angle, Math.atan2(bank.nz, bank.nx)))
  if (cos <= 1e-6) return edge
  return Math.min(edge, bank.walkEdge / cos)
}

/**
 * How far the drawn ground disc is pushed out past its plain edge at a bearing
 * (work-order 1237, both sides since 1245). Zero everywhere except where the
 * boundary reaches past the plain radius — across a bank's lobe, and around a
 * watched scene's room: there the disc moves out by exactly that excess, so it keeps the same overhang beyond
 * the last step as it has everywhere else. The backdrop's inner rim moves with it
 * (`PlaceScene`'s `LandscapeBackdrop`), so the panorama starts where the drawn
 * ground ends instead of standing on it.
 */
export function groundDiscShift(bounds: PlaceBounds, angle: number): number {
  const bank = bounds.bank
  // Around a watched scene's room the disc moves out the same way (work-order
  // 1252), so the drawn overhang past the last step stays the same width.
  if (!bank) return Math.max(0, placeBoundaryRadius(bounds, angle) - bounds.radius)
  // Eased in off the bank's own bearing, where the plate is cut at the top of
  // the bank anyway: out to `BANK_DISC_SHIFT_EASE_ANGLE` the scene is drawn as
  // it always was there, and past it the shift is whole.
  const delta = Math.abs(bearingDelta(angle, Math.atan2(bank.nz, bank.nx)))
  const eased = Math.max(0, placeBoundaryRadius(bounds, angle) - bounds.radius) * ramp(0, BANK_DISC_SHIFT_EASE_ANGLE, delta)
  // ... but never short of the drawn river's far edge across the plateau
  // (work-order 1245): the fishermen's lane now runs past the bank normal, and
  // the backdrop's rim would otherwise start under their hull. Past the ease
  // the whole shift already lies beyond that edge, so the two meet smoothly.
  if (delta >= BANK_PLATEAU_ANGLE) return eased
  const riverEdge = (bank.distance + BANK_BED_REACH) / Math.cos(delta) - (bounds.radius + BACKDROP_INNER_OFFSET)
  return Math.max(eased, riverEdge)
}

/**
 * How far along the bank, upstream and downstream of the normal, the drawn
 * shore and water have to run (work-order 1237; symmetric since 1245): the
 * furthest along-bank reach of the shifted disc anywhere it passes the top of
 * the bank, out to the drawn bed — so no strip of ground between the plate's
 * cut and the backdrop's rim is left undrawn, on either side.
 */
export function bankDrawnReach(bounds: PlaceBounds, discEdge: number): { up: number; down: number } {
  const bank = bounds.bank
  if (!bank) return { up: 0, down: 0 }
  const normal = Math.atan2(bank.nz, bank.nx)
  const reachOn = (toward: number): number => {
    let reach = Math.sqrt(Math.max(1, discEdge * discEdge - bank.walkEdge * bank.walkEdge))
    const steps = 360
    for (let i = 1; i < steps; i++) {
      const delta = (i / steps) * (Math.PI / 2)
      const cos = Math.cos(delta)
      const edge = discEdge + groundDiscShift(bounds, normal + toward * delta)
      const r = Math.min(edge, (bank.distance + BANK_BED_REACH) / cos)
      if (r * cos > bank.walkEdge) reach = Math.max(reach, r * Math.sin(delta))
    }
    return reach
  }
  const toward = Math.sin(Math.atan2(bank.fz, bank.fx) - normal) >= 0 ? 1 : -1
  return { up: reachOn(-toward), down: reachOn(toward) }
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
