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

import { WALKER_RADIUS } from './collision'
import type { BankPoint, PlaceRiverBank } from './riverBank'

/** The weaver's own body radius at her seat under the heddles. */
export const WEAVER_BODY_RADIUS = 0.3

/**
 * How far to the side of the warp each of the two bodies sits. She works the
 * shed at the warp's middle and the threads run past her on both sides, so she
 * is BESIDE the warp rather than on it — and she is on the INLAND side, with
 * the water beyond the warp, so a player standing behind her sees the weaver,
 * her warp and the river in one look (item 10).
 *
 * The distance is the SEATED body's own reach (`loomWork`'s WARP_REACH): closer
 * and she sits in her threads, further and her hands stop short of them.
 */
export const WEAVER_SIDE_OFFSET = 0.36

/** The helper works the far side, between the warp and the water. */
export const HELPER_SIDE_OFFSET = 0.45

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

/** The corridor of open ground the plaza must look at the seat through — a
 *  gap between two huts is not a view (work-order 1190). */
export const PLAZA_SIGHT_HALF_WIDTH = 1

/** How much farther from the water than the nominal spot a seat may sit. */
const PLAZA_INLAND_SLACK = 4

/** Degrees between seats in the sweep that demands a view from the plaza. */
const PLAZA_SWEEP_DEGREE_STEP = 2
/** Metres between candidate radii in that sweep. */
const PLAZA_SWEEP_RADIUS_STRIDE = 1
/** Valid seats whose plaza view that sweep measures before it settles for the
 *  widest found. Every settlement lays a loom, and a plan with no full line
 *  otherwise measured every seat: layouts ran 2.4x slower, up to 5x in the
 *  bankless villages, and a layout test crossed its 20 s timeout. The shipped
 *  Bambara plan finds its full line at the 58th. */
const PLAZA_SWEEP_VIEWED_SEATS = 120

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
  /** How far the nominal spot stands back from the waterline, in metres. */
  nominalWaterOff: number
  /** The walkable radius; the whole station stays inside it. */
  walkRadius: number
  /** Ground a body of radius `r` can stand on: clear of every solid, on the
   *  flat plate, inside the settlement. */
  free: (x: number, z: number, r: number) => boolean
  /** Whether nothing solid stands between two points — the seat's view of the
   *  water is asked as a corridor, so a hut beside the line does not hide it. */
  sightClear: (from: BankPoint, to: BankPoint, halfWidth: number) => boolean
  /** How wide a corridor of open ground the settlement's plaza looks at this
   *  seat through — the widest over every stand on the plaza, 0 where none sees
   *  it at all (work-order 1190). Settlements without a plaza answer Infinity.
   *  With `floor`, widths up to it are not measured and `floor` is the answer
   *  when nothing wider fits. */
  plazaView: (seat: BankPoint, floor?: number) => number
  /** Whether a seat stands near enough the plaza to be READ from it (work-order
   *  1191); a seat beyond is not asked for its view. Omitted: every seat is. */
  plazaReach?: (seat: BankPoint) => boolean
  /** `free` with the households that may give way to the plaza's view taken
   *  out (work-order 1191). Where the plaza sees no seat on the ground the plan
   *  leaves, it is asked again over this; the layout then leaves unbuilt what
   *  the chosen station stands on. Omitted: nothing gives way. */
  freeGivingWay?: (x: number, z: number, r: number) => boolean
  /** Distance from a spot to the NEAREST place a child speaks. The loom's own
   *  direction words must never arrive mixed with the children's (688 §1, §6),
   *  so this is the same measure the dig sites and the water path are held to. */
  toChildren: (x: number, z: number) => number
  /** The village water stand's head, where RIVER is spoken. Null where the
   *  settlement runs no water errand. */
  waterPathHead: BankPoint | null
  /** Whether a body of this radius would stand on the carriers' drawn water
   *  lane. The warp is a 6 m wall: laid across the lane it would put a solid
   *  through the track the scene draws to the river. */
  onWaterLane: (x: number, z: number, r: number) => boolean
  /** The separation every one of those places is owed: `talk.reach`. */
  clearance: number
  geometry: LoomGeometry
}

export interface LoomStation {
  /** Whether the seat was found by the sweep that DEMANDS a view from the plaza
   *  (work-order 1190). False means the plan held no such ground and the loom
   *  stands where it could — visible up close, not across the village. */
  seenFromPlaza?: boolean
  /** The MIDPOINT of the warp — the geometric seat the whole station hangs on. */
  seat: BankPoint
  /** Where the weaver's body is: beside the warp at its midpoint, inland. */
  weaver: BankPoint
  /** Where the helper stands while no call has sent him anywhere. */
  helperHome: BankPoint
  /** Unit vector ACROSS the warp, pointing toward the water (outward, in a
   *  settlement with no river). The weaver sits against it, the helper with it. */
  ax: number
  az: number
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

/** A point `d` metres along the warp and `side` metres across it, from the
 *  seat. Downstream is positive along; the water is positive across. */
function at(
  station: Pick<LoomStation, 'seat' | 'fx' | 'fz' | 'ax' | 'az'>,
  d: number,
  side = 0,
): BankPoint {
  return {
    x: station.seat.x + station.fx * d + station.ax * side,
    z: station.seat.z + station.fz * d + station.az * side,
  }
}

/** The whole station laid out around one seat on one axis. */
export function loomAround(
  seat: BankPoint,
  fx: number,
  fz: number,
  ax: number,
  az: number,
  geometry: LoomGeometry,
  onRiverAxis: boolean,
): LoomStation {
  const axis = { seat, fx, fz, ax, az }
  return {
    seat,
    weaver: at(axis, 0, -WEAVER_SIDE_OFFSET),
    helperHome: at(axis, 0, HELPER_SIDE_OFFSET),
    upstream: at(axis, -geometry.warpHalf),
    downstream: at(axis, geometry.warpHalf),
    fx,
    fz,
    ax,
    az,
    tend: {
      upstream: at(axis, -geometry.tendStand, HELPER_SIDE_OFFSET),
      downstream: at(axis, geometry.tendStand, HELPER_SIDE_OFFSET),
    },
    onRiverAxis,
  }
}

/**
 * The ground a laid-out station needs free, as circles: the warp, a way round
 * each end, and the weaver and her helper's walk (work-order 1191 reads it to
 * leave unbuilt what a chosen station stands on).
 */
export function stationGround(
  station: LoomStation,
  geometry: LoomPlacement['geometry'],
): Array<{ x: number; z: number; r: number; kind: 'warp' | 'end' | 'body' }> {
  const { warpHalf } = geometry
  const ground: Array<{ x: number; z: number; r: number; kind: 'warp' | 'end' | 'body' }> = []
  // The warp's whole LENGTH, not its ends: a stake either side of a hut corner
  // would pass an end-point test and run the threads through the wall.
  const steps = Math.max(8, Math.ceil((warpHalf * 2) / 0.4))
  for (let k = 0; k <= steps; k++) {
    const on = at(station, -warpHalf + (warpHalf * 2 * k) / steps)
    ground.push({ ...on, r: WARP_BODY_RADIUS, kind: 'warp' })
  }
  // A WAY ROUND EACH END. The warp is a wall six metres long between the
  // village and its water, and a walker must be able to pass it: the ground
  // just beyond each stake carries a walker's own body, clear of everything
  // else. Without this the station can seal the route to the bank against a
  // hut, which is what the point-483 walk found on the first build.
  const pastEnd = warpHalf + WARP_BODY_RADIUS + WALKER_RADIUS * 2
  for (const d of [-pastEnd, pastEnd]) ground.push({ ...at(station, d), r: WALKER_RADIUS, kind: 'end' })
  // The weaver and her helper are bodies of their own beside the threads, and
  // the helper's whole walk between his stands is ground he has to cross.
  ground.push({ x: station.weaver.x, z: station.weaver.z, r: WEAVER_BODY_RADIUS, kind: 'body' })
  const helperSteps = Math.max(8, Math.ceil((geometry.tendStand * 2) / 0.4))
  for (let k = 0; k <= helperSteps; k++) {
    const d = -geometry.tendStand + (geometry.tendStand * 2 * k) / helperSteps
    ground.push({ ...at(station, d, HELPER_SIDE_OFFSET), r: WEAVER_BODY_RADIUS, kind: 'body' })
  }
  return ground
}

/**
 * Whether a laid-out station stands where it may: the whole warp on standable
 * ground, the seat's view of the water open, and the two teaching places it
 * must not be heard beside kept at their distance.
 */
function stationHolds(station: LoomStation, p: LoomPlacement): boolean {
  const { warpHalf } = p.geometry
  // The arithmetic tests first; the sampled ones below are what a sweep pays for.
  // AND NO FARTHER FROM THE WATER THAN THE PLAN MEANT IT TO BE (work-order
  // 1190). The water sight line below reads SOLIDS, not the ground: a dune
  // between the seat and the river passes it and still hides the water in the
  // picture, which is how a seat moved inland for the plaza's sake arrived with
  // the river at the horizon and nothing blue where the frame reads for it.
  if (p.bank) {
    const off = p.bank.distance - (station.weaver.x * p.bank.nx + station.weaver.z * p.bank.nz)
    if (off > p.nominalWaterOff + PLAZA_INLAND_SLACK) return false
  }
  // THE SEPARATION (item 9): the direction words spoken here must not arrive in
  // the same ear as the children's, and RIVER must not arrive in this one. The
  // whole station is held to it, because the helper speaks from neither end
  // but the weaver's word is heard wherever he is walking.
  for (const on of [station.weaver, station.upstream, station.downstream]) {
    if (p.toChildren(on.x, on.z) < p.clearance) return false
    if (p.waterPathHead && Math.hypot(on.x - p.waterPathHead.x, on.z - p.waterPathHead.z) < p.clearance) {
      return false
    }
  }
  for (const g of stationGround(station, p.geometry)) {
    if (g.kind !== 'body' && Math.hypot(g.x, g.z) > p.walkRadius) return false
    if (!p.free(g.x, g.z, g.r)) return false
    // NOT ACROSS THE CARRIERS' TRACK (work-order 688): the water lane is drawn
    // ground, and a wall laid over it would stand in the picture of the walk.
    if (g.kind === 'warp' && p.onWaterLane(g.x, g.z, g.r)) return false
  }
  // THE WATER MUST BE IN THE PICTURE (item 10). A layout that hides the river
  // from the seat fails the point: the axis claim is only checkable if the
  // player standing at the loom can see what it is an axis of. The line is
  // asked STRAIGHT OUT from the seat rather than to the villagers' own stand at
  // the water — that stand is one of the places the children speak from, so a
  // sight line drawn to it would be a line the loom is already held 10 m away
  // from, and it would answer about a stretch of water she is not looking at.
  //
  // AND FROM WHERE THE HELPER WORKS, not only from her seat (work-order 1190).
  // The picture the water claim is judged on is taken over the HELPER's
  // shoulder as he walks out along the warp, so a seat that keeps the river in
  // her view and loses it in his is a seat that fails the frame — which is
  // exactly what the first plaza-visible seat did.
  if (p.bank) {
    for (const stand of [station.weaver, station.helperHome]) {
      if (!p.sightClear(stand, waterAhead(stand, p.bank), SIGHT_HALF_WIDTH)) return false
    }
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
  // point; without one it is the tangent at each CANDIDATE seat, which gives a
  // bankless village its weaver without inventing a direction for it. Taken
  // per candidate, not once at the nominal spot: a seat swept 90° round with
  // the nominal tangent kept would lay the two bodies along the threads
  // (GPT-6 Astra review, pass 8).
  const nominalAngle = Math.atan2(p.nominal[1], p.nominal[0])
  const onRiverAxis = p.bank !== null

  const baseRadius = Math.hypot(p.nominal[0], p.nominal[1])
  const maxRadius = Math.max(0, p.walkRadius - p.geometry.warpHalf - WARP_BODY_RADIUS)
  const radii: number[] = [baseRadius]
  for (let d = SEAT_RADIUS_STEP; d <= maxRadius; d += SEAT_RADIUS_STEP) {
    if (baseRadius - d >= 2) radii.push(baseRadius - d)
    if (baseRadius + d <= maxRadius) radii.push(baseRadius + d)
  }

  /** The candidate radii at a given stride, nearest the nominal one first.
   *  THE STRIDE IS TAKEN ON THE SEQUENCE, NOT ON THE ARRAY: skipping every nth
   *  entry of `radii` would drop only the INWARD ones (the list alternates in,
   *  out) and the search would drift away from the river without saying so. */
  const radiiAt = (stride: number): number[] => {
    const out = [baseRadius]
    for (let d = stride; d <= maxRadius; d += stride) {
      if (baseRadius - d >= 2) out.push(baseRadius - d)
      if (baseRadius + d <= maxRadius) out.push(baseRadius + d)
    }
    return out
  }

  /** The fine sweep out from the nominal bearing, nearest first. */
  const sweep = (): LoomStation | null => {
    for (let step = 0; step <= SEAT_SWEEP_DEGREES; step++) {
      for (const sign of step === 0 ? [1] : [-1, 1]) {
        const a = nominalAngle + sign * step * (Math.PI / 180)
        const fx = p.bank ? p.bank.fx : -Math.sin(a)
        const fz = p.bank ? p.bank.fz : Math.cos(a)
        for (const r of radii) {
          const seat = { x: Math.cos(a) * r, z: Math.sin(a) * r }
          // Across the warp, toward the water — or straight outward where the
          // settlement stands on no river and there is no water to face.
          const ax = p.bank ? p.bank.nx : Math.cos(a)
          const az = p.bank ? p.bank.nz : Math.sin(a)
          const station = loomAround(seat, fx, fz, ax, az, p.geometry, onRiverAxis)
          if (stationHolds(station, p)) return { ...station, seenFromPlaza: false }
        }
      }
    }
    return null
  }

  // THE PLAZA'S VIEW IS ASKED FIRST, AND WHERE IT CANNOT BE HAD IN FULL THE
  // WIDEST ONE GOING IS TAKEN (work-order 1190). The first seat the plaza sees
  // through a full metre wins outright, nearest the nominal spot first. Where
  // no plan holds one — and two shipped Mandinka plans do not — the answer is
  // not "anywhere": it is the seat with the widest view of the ones that clear
  // everything else, which is the user's criterion served as far as the plan
  // allows. Only a plan with no valid seat at all falls to the fine sweep.
  // Both questions are answered in ONE pass over the same seats in the same
  // order, so the view of each seat is measured once.
  //
  // THE PLAN'S OWN GROUND FIRST, THEN THE GROUND A HOUSEHOLD GIVES UP (work-order
  // 1191): a Sahel compound ring leaves no free ground near the plaza at all,
  // so where the first pass finds no seen seat the second asks again with the
  // households that may give way taken out. Its widest seat is only a fallback
  // for the first pass's: nothing is left unbuilt for a view that is not had.
  let widest: { station: LoomStation; view: number } | null = null
  const plazaPass = (q: LoomPlacement): LoomStation | null => {
    let viewed = 0
    for (let step = 0; step <= SEAT_SWEEP_DEGREES; step += PLAZA_SWEEP_DEGREE_STEP) {
      for (const sign of step === 0 ? [1] : [-1, 1]) {
        const a = nominalAngle + sign * step * (Math.PI / 180)
        const fx = p.bank ? p.bank.fx : -Math.sin(a)
        const fz = p.bank ? p.bank.fz : Math.cos(a)
        for (const r of radiiAt(PLAZA_SWEEP_RADIUS_STRIDE)) {
          const seat = { x: Math.cos(a) * r, z: Math.sin(a) * r }
          const ax = p.bank ? p.bank.nx : Math.cos(a)
          const az = p.bank ? p.bank.nz : Math.sin(a)
          const station = loomAround(seat, fx, fz, ax, az, p.geometry, onRiverAxis)
          if (q.plazaReach && !q.plazaReach(station.weaver)) continue
          if (!stationHolds(station, q)) continue
          const view = q.plazaView(station.weaver, widest ? widest.view : 0)
          if (view >= PLAZA_SIGHT_HALF_WIDTH) return { ...station, seenFromPlaza: true }
          if (q === p && (!widest || view > widest.view)) widest = { station, view }
          if (++viewed >= PLAZA_SWEEP_VIEWED_SEATS) return null
        }
      }
    }
    return null
  }
  const seen = plazaPass(p) ?? (p.freeGivingWay ? plazaPass({ ...p, free: p.freeGivingWay }) : null)
  if (seen) return seen
  if (widest) return { ...widest.station, seenFromPlaza: false }
  return sweep()
}
