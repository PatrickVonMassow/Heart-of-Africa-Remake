// THE WEAVER'S LOOM (work-order 1157). The station is two things at once, and
// the second is why it is layout data rather than a prop dropped at a constant:
//
//  - It is village LIFE: a weaver throwing a shuttle across a stretched warp,
//    the strip of cloth growing along it under her hands (design.md §15).
//  - It is the SECOND place the player can learn UPSTREAM and DOWNSTREAM. On
//    the bank the two words hang on running groups between two rocks; here they
//    hang on ONE PERSON WALKING along the warp. The only feature the two
//    pictures share is the river's axis, and that intersection is what prunes
//    the readings a single picture leaves open ("to the far rock" does not
//    exist at the loom, and left/right survives no change of standpoint).
//
// Everything below follows from the second job. THE WARP LIES ON THE RIVER'S
// AXIS, derived from the bank's own downstream vector and never from a
// hard-coded heading. THE WEAVER SITS IN ITS MIDDLE, so both of her calls send
// the helper AWAY from her — seated at an end, one call would be "toward me"
// and the other "away from me", and the player could learn the pair as come/go
// and still finish the puzzle. AND THE WATER IS IN THE PICTURE from her seat,
// so the claim that the warp runs with the river is one the player can check.
//
// A village with no river keeps its weaver and loses only the teaching: the
// warp is laid on the tangent there and `onRiverAxis` says so.
//
// The module is pure geometry. It knows nothing of three, of colliders or of
// the scene: the caller hands it predicates and gets a station back.

import type { BankPoint, PlaceRiverBank } from './riverBank'

/** The weaver's own body radius at her seat under the heddles. */
export const WEAVER_BODY_RADIUS = 0.3

/** The drawn stake at each end of the warp, and its collider. */
export const WARP_STAKE_RADIUS = 0.12

/**
 * The stretched warp's own body (work-order 1157 item 11). The threads run at
 * about knee height with the drag weight hanging off them, so a passer-by goes
 * ROUND the whole length rather than through it; the scene draws one segment
 * collider from stake to stake and this is its half-width.
 */
export const WARP_BODY_RADIUS = 0.2

/** How far to either side of the bearing the seat is swept, in degrees. The
 *  whole circle is reachable: the nominal bearing is tried first, so the loom
 *  only leaves the ground the village was built around when it must — but when
 *  it must, the water may be on the far side of the settlement. */
const SEAT_SWEEP_DEGREES = 180

/** Step of the radial part of the sweep, in metres. */
const SEAT_RADIUS_STEP = 0.5

/** The thin corridor the seat's view of the water is sampled through. */
const SIGHT_HALF_WIDTH = 0.25

export interface LoomGeometry {
  /** Metres from the seat to each stake — half the stretched warp. */
  warpHalf: number
  /** Metres from the seat at which the helper works when a call sends him. */
  tendStand: number
}

export interface LoomPlacement {
  /** The settlement's bank, or null where it stands on no river. */
  bank: PlaceRiverBank | null
  /** Where the station belongs when the settlement leaves it the room. */
  nominal: readonly [number, number]
  /** The walkable radius; the whole station stays inside it. */
  walkRadius: number
  /** Ground a body of radius `r` can stand on: clear of every solid, on the
   *  flat plate, inside the settlement. */
  free: (x: number, z: number, r: number) => boolean
  /** Whether nothing solid stands between two points — the seat's view of the
   *  water is asked as a corridor, so a hut beside the line does not hide it. */
  sightClear: (from: BankPoint, to: BankPoint, halfWidth: number) => boolean
  /** Distance from a spot to the NEAREST place a child speaks. The loom's own
   *  direction words must never arrive mixed with the children's (688 §1, §6),
   *  so this is the same measure the dig sites and the water path are held to. */
  toChildren: (x: number, z: number) => number
  /** The village water stand's head, where RIVER is spoken. Null where the
   *  settlement runs no water errand. */
  waterPathHead: BankPoint | null
  /** The separation every one of those places is owed: `talk.reach`. */
  clearance: number
  geometry: LoomGeometry
}

export interface LoomStation {
  /** The weaver's seat, and the MIDPOINT of the warp. */
  seat: BankPoint
  /** The stake the warp runs to AGAINST the current. */
  upstream: BankPoint
  /** The stake it runs to WITH the current. */
  downstream: BankPoint
  /** Unit vector along the warp, pointing DOWNSTREAM. */
  fx: number
  fz: number
  /** Where the helper works when a call sends him to either end. */
  tend: { upstream: BankPoint; downstream: BankPoint }
  /**
   * Whether the warp's axis is the RIVER's. False in a settlement with no bank,
   * where the two direction words do not exist: the weaver works and the helper
   * tends, and nothing is named.
   */
  onRiverAxis: boolean
}

/** A point `d` metres from `seat` along the warp; positive is downstream. */
function along(station: Pick<LoomStation, 'seat' | 'fx' | 'fz'>, d: number): BankPoint {
  return { x: station.seat.x + station.fx * d, z: station.seat.z + station.fz * d }
}

/** The whole station laid out around one seat on one axis. */
export function loomAround(
  seat: BankPoint,
  fx: number,
  fz: number,
  geometry: LoomGeometry,
  onRiverAxis: boolean,
): LoomStation {
  const axis = { seat, fx, fz }
  return {
    seat,
    upstream: along(axis, -geometry.warpHalf),
    downstream: along(axis, geometry.warpHalf),
    fx,
    fz,
    tend: {
      upstream: along(axis, -geometry.tendStand),
      downstream: along(axis, geometry.tendStand),
    },
    onRiverAxis,
  }
}

/**
 * Whether a laid-out station stands where it may: the whole warp on standable
 * ground, the seat's view of the water open, and the two teaching places it
 * must not be heard beside kept at their distance.
 */
function stationHolds(station: LoomStation, p: LoomPlacement): boolean {
  const { warpHalf } = p.geometry
  // The warp's whole LENGTH, not its ends: a stake either side of a hut corner
  // would pass an end-point test and run the threads through the wall.
  const steps = Math.max(8, Math.ceil((warpHalf * 2) / 0.4))
  for (let k = 0; k <= steps; k++) {
    const d = -warpHalf + (warpHalf * 2 * k) / steps
    const at = along(station, d)
    if (Math.hypot(at.x, at.z) > p.walkRadius) return false
    if (!p.free(at.x, at.z, WARP_BODY_RADIUS)) return false
  }
  // The weaver and her helper are bodies of their own beside the threads.
  if (!p.free(station.seat.x, station.seat.z, WEAVER_BODY_RADIUS)) return false
  for (const stand of [station.tend.upstream, station.tend.downstream]) {
    if (!p.free(stand.x, stand.z, WEAVER_BODY_RADIUS)) return false
  }
  // THE SEPARATION (item 9): the direction words spoken here must not arrive in
  // the same ear as the children's, and RIVER must not arrive in this one. The
  // whole station is held to it, because the helper speaks from neither end
  // but the weaver's word is heard wherever he is walking.
  for (const at of [station.seat, station.upstream, station.downstream]) {
    if (p.toChildren(at.x, at.z) < p.clearance) return false
    if (p.waterPathHead && Math.hypot(at.x - p.waterPathHead.x, at.z - p.waterPathHead.z) < p.clearance) {
      return false
    }
  }
  // THE WATER MUST BE IN THE PICTURE (item 10). A layout that hides the river
  // from the seat fails the point: the axis claim is only checkable if the
  // player standing at the loom can see what it is an axis of. The line is
  // asked STRAIGHT OUT from the seat rather than to the villagers' own stand at
  // the water — that stand is one of the places the children speak from, so a
  // sight line drawn to it would be a line the loom is already held 10 m away
  // from, and it would answer about a stretch of water she is not looking at.
  if (p.bank && !p.sightClear(station.seat, waterAhead(station.seat, p.bank), SIGHT_HALF_WIDTH)) {
    return false
  }
  return true
}

/** The waterline straight out from a spot, along the bank's own normal. */
export function waterAhead(at: BankPoint, bank: PlaceRiverBank): BankPoint {
  const out = bank.distance - (at.x * bank.nx + at.z * bank.nz)
  return { x: at.x + bank.nx * out, z: at.z + bank.nz * out }
}

/**
 * Where the loom stands in one settlement, or null where the plan leaves it no
 * room at all.
 *
 * The seat is swept out from the station's nominal bearing, nearest first, so
 * the loom stays where the rest of the village was built around it wherever it
 * can. When it cannot, THE LOOM MOVES AND THE CHILDREN DO NOT (work-order 1157
 * item 9): their ground is already settled when this runs, and it is the
 * teaching the whole communication slice is arranged around.
 */
export function placeLoom(p: LoomPlacement): LoomStation | null {
  // The warp's axis. With a bank it is the river's, and that is the whole
  // point; without one it is the tangent at the nominal spot, which gives a
  // bankless village its weaver without inventing a direction for it.
  const nominalAngle = Math.atan2(p.nominal[1], p.nominal[0])
  const fx = p.bank ? p.bank.fx : -Math.sin(nominalAngle)
  const fz = p.bank ? p.bank.fz : Math.cos(nominalAngle)
  const onRiverAxis = p.bank !== null

  const baseRadius = Math.hypot(p.nominal[0], p.nominal[1])
  const maxRadius = Math.max(0, p.walkRadius - p.geometry.warpHalf - WARP_BODY_RADIUS)
  const radii: number[] = [baseRadius]
  for (let d = SEAT_RADIUS_STEP; d <= maxRadius; d += SEAT_RADIUS_STEP) {
    if (baseRadius - d >= 2) radii.push(baseRadius - d)
    if (baseRadius + d <= maxRadius) radii.push(baseRadius + d)
  }

  for (let step = 0; step <= SEAT_SWEEP_DEGREES; step++) {
    for (const sign of step === 0 ? [1] : [-1, 1]) {
      const a = nominalAngle + sign * step * (Math.PI / 180)
      for (const r of radii) {
        const seat = { x: Math.cos(a) * r, z: Math.sin(a) * r }
        const station = loomAround(seat, fx, fz, p.geometry, onRiverAxis)
        if (stationHolds(station, p)) return station
      }
    }
  }
  return null
}
