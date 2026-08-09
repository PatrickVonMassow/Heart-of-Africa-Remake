// The walkable river bank of a settlement that stands on a river (work-order
// 482): where the water lies, which way it runs, and how far along it the
// player may walk.
//
// EVERYTHING HERE IS DERIVED FROM THE WORLD MODEL, never hand-placed. The
// settlement scene is a compressed miniature of its own surroundings — the
// §2.5 panorama samples the real terrain at `BACKDROP_SCALE` degrees per place
// unit — so the river the player walks up to inside the village is the SAME
// river the bird's-eye view draws, seen at that scale: its bearing from the
// centre is the bearing of the real course, its distance is the real gap
// between the village and the water's edge, and the current runs the way the
// real course runs (source → mouth). Nothing is painted into the backdrop and
// nothing is invented; a change to the course or to the calibratable river
// width moves the bank in the settlement with it.
//
// A bank exists only where the geography actually carries one: a VILLAGE whose
// water's edge lies clear of its built ground but within a short walk of it.
// Ports sit AT their river by design (the §4.2 exemption) and their much wider
// walkable disc would swallow the waterline, so they never grow one.

import { balance } from '../../config/balance'
import { RIVERS, type PlaceDef } from '../../world/geo'
import { densifyRiverAxis } from '../../world/riverProfile'
import { RIVER_WIDTH_DEG } from '../../world/riverWidth'
import { BACKDROP_SCALE } from './backdrop'

/** The waterline must lie at least this far outside the built disc, so the
 *  centre and every hut stay dry (spec item 1). */
export const BANK_MIN_GAP = 4
/** ... and at most this far, or the walk out to it is no longer a bank of the
 *  settlement but a journey. */
export const BANK_MAX_GAP = 14

/**
 * Half-width of the shore strip: the ground slopes from the walkable edge down
 * across `2 × BANK_SHORE_HALF` into the water, and the waterline lands exactly
 * in its middle. The player therefore stops at the TOP of the bank and looks
 * down at the water rather than standing in it.
 */
export const BANK_SHORE_HALF = 1.2

/** How far the water surface drops below the settlement's ground plane. */
export const BANK_WATER_DROP = 0.25

// --- The shore profile, and what the player may do with it (work-order 584) ---
//
// THE WATER IS NOT A WALL. Work-order 482 had fenced the waterline with an
// invisible collider so the last step at the water could not carry the traveller
// out of the settlement; the play session of 09.08.2026 hit that fence and read
// it for what it is — running into the river as into a wall, a metre short of a
// bank the village exists to let him stand at. Two rules were in conflict: the
// bird's-eye view lets him walk INTO the Niger and be carried downstream
// (criterion 21, "without ever HOLDING him"), while the settlement made the same
// river solid. One river may not behave as two.
//
// So the settlement's walkable region now reaches THROUGH the waterline and out
// across the shallows to the depth a man wades to (`balance.bankWadeDepth`).
// Past that he is out of his depth, which is where the river is SWUM — and
// swimming is what the bird's-eye view does, so the boundary simply ends there
// and the ordinary leave check hands him back to it. Nothing invisible stops
// him anywhere; the last thing he walks over is drawn ground sloping under
// drawn water.
//
// The profile below is the ONE description of that ground: the shore mesh is
// built from it (`render/placeRiver.ts`), the camera's footing is read from it,
// and the wade limit is solved on it. A second, drifting definition is exactly
// what points 129/378 forbid.

/** How far out from the waterline the shallows run before the bed falls away. */
export const BANK_SHALLOWS_SPAN = 4
/** How deep the water is at the end of the shallows. */
export const BANK_SHALLOWS_DEPTH = 0.9
/** How far out the drawn bed reaches, and how deep it lies there. Beyond the
 *  shallows the channel deepens to this — the water the traveller would have to
 *  swim, which the bird's-eye view is where he does. */
export const BANK_BED_REACH = 10
export const BANK_BED_DEPTH = 1.6

/** The tallest vertical step the shore profile may ever contain. The bank is
 *  ground the player walks down, so it is a slope with a waterline, never a
 *  face: `bankShoreRows` is pinned against this. */
export const BANK_MAX_STEP = 0.05

/** Angular half-width of the bank lobe's plateau: inside it the walkable
 *  region reaches all the way to the water. ~22°, which at a waterline ~35 m
 *  out is a stretch of roughly fourteen paces to each side. */
export const BANK_PLATEAU_ANGLE = 0.384
/** ... and where the lobe has faded back to the plain walkable radius. The
 *  region between the two tapers, so walking along the bank draws the player
 *  gently back inland instead of dropping him out of the settlement at a
 *  corner. */
export const BANK_FADE_ANGLE = 0.593

/** How far inside the walkable edge the three named bank points sit, so a
 *  villager sent to one stands clear of the edge and of the water wall. */
export const BANK_STAND_INSET = 1.5
/** The two stretches lie at this fraction of the plateau angle to each side —
 *  inside the plateau by construction, so they can never fall outside the
 *  walkable region however the calibratable river width moves the waterline. */
export const BANK_STRETCH_ANGLE_FRAC = 0.8

/** A point on the settlement ground. */
export interface BankPoint {
  x: number
  z: number
}

/** The bank of the river a settlement stands on. */
export interface PlaceRiverBank {
  /** The river this is a bank of. */
  riverId: string
  /** Unit vector from the place centre toward the water (place x/z). */
  nx: number
  nz: number
  /** Unit vector along the bank pointing DOWNSTREAM (place x/z). */
  fx: number
  fz: number
  /** Distance from the centre to the waterline, in place units (metres). */
  distance: number
  /** Distance to the top of the bank, where the flat ground plate ends and the
   *  shore begins to slope. The player walks ON past it, down the shore. */
  walkEdge: number
  /** Distance out at which the water has reached wading depth — the far edge of
   *  the settlement's walkable region on this bearing. One step further is out
   *  of his depth, and there the boundary hands him back to the bird's-eye view,
   *  where the river is swum (work-order 584). */
  wadeEdge: number
  /** Distance from the centre to the nearest river axis, in degrees — the
   *  world figure the rest is derived from. */
  axisDeg: number
  /** Where a villager stands at the water. */
  bank: BankPoint
  /** The far end of the walkable stretch AGAINST the current. */
  upstream: BankPoint
  /** The far end of the walkable stretch WITH the current. */
  downstream: BankPoint
}

/**
 * The shore's profile, as (distance out along the bank normal, ground height).
 * Read outward: the top of the bank at village level, the waterline where the
 * ground has dropped to the water surface, the far edge of the shallows, and
 * the bed. Every consumer — the drawn mesh, the camera's footing, the wade
 * limit — reads THIS, so the ground the player walks down is the ground the
 * scene draws.
 */
export function bankShoreRows(bank: Pick<PlaceRiverBank, 'distance' | 'walkEdge'>): Array<[number, number]> {
  return [
    [bank.walkEdge, 0],
    [bank.distance, -BANK_WATER_DROP],
    [bank.distance + BANK_SHALLOWS_SPAN, -BANK_WATER_DROP - BANK_SHALLOWS_DEPTH],
    [bank.distance + BANK_BED_REACH, -BANK_WATER_DROP - BANK_BED_DEPTH],
  ]
}

/** The ground height at `out` metres from the centre along the bank normal:
 *  flat village ground up to the top of the bank, then the profile above. */
export function bankShoreHeight(bank: Pick<PlaceRiverBank, 'distance' | 'walkEdge'>, out: number): number {
  const rows = bankShoreRows(bank)
  if (out <= rows[0][0]) return 0
  for (let i = 0; i + 1 < rows.length; i++) {
    const [x0, y0] = rows[i]
    const [x1, y1] = rows[i + 1]
    if (out <= x1) return y0 + ((out - x0) / (x1 - x0)) * (y1 - y0)
  }
  return rows[rows.length - 1][1]
}

/** How deep the water stands over the shore at `out` — negative on dry ground. */
export function bankWaterDepth(bank: Pick<PlaceRiverBank, 'distance' | 'walkEdge'>, out: number): number {
  return -BANK_WATER_DROP - bankShoreHeight(bank, out)
}

/** The ground the player stands on at (x, z): the shore where he has walked out
 *  onto it, the settlement's flat plate everywhere else. */
export function bankGroundHeight(bank: PlaceRiverBank | null | undefined, x: number, z: number): number {
  if (!bank) return 0
  return bankShoreHeight(bank, x * bank.nx + z * bank.nz)
}

/** Where the water reaches `depth` — solved on the profile above, so it can
 *  never name a spot the drawn shore does not have. */
function outAtDepth(bank: Pick<PlaceRiverBank, 'distance' | 'walkEdge'>, depth: number): number {
  const rows = bankShoreRows(bank)
  const want = -BANK_WATER_DROP - depth
  for (let i = 0; i + 1 < rows.length; i++) {
    const [x0, y0] = rows[i]
    const [x1, y1] = rows[i + 1]
    if (want >= y1 && y0 > y1) return x0 + ((y0 - want) / (y0 - y1)) * (x1 - x0)
  }
  return rows[rows.length - 1][0]
}

/** A point at bearing `a` off the bank normal, `r` from the centre. */
function alongBank(bank: Pick<PlaceRiverBank, 'nx' | 'nz' | 'fx' | 'fz'>, a: number, r: number): BankPoint {
  const c = Math.cos(a)
  const s = Math.sin(a)
  return { x: r * (c * bank.nx + s * bank.fx), z: r * (c * bank.nz + s * bank.fz) }
}

/**
 * The bank of the settlement `place`, or null where the geography carries none.
 *
 * `radius` is the settlement's plain walkable radius; the gate above is
 * measured against it, so a bigger settlement needs the water further out
 * before it counts as a bank rather than as a flooded market square.
 */
export function buildRiverBank(place: PlaceDef, radius: number): PlaceRiverBank | null {
  if (place.kind !== 'village') return null

  // The nearest point of any river course, and the course's own direction
  // there. The densified axis is the same one the bird's-eye ribbon and the
  // landmark boulder read, so all three agree about where the water is.
  let bestD = Infinity
  let riverId = ''
  let aLat = 0
  let aLon = 0
  let dLat = 0
  let dLon = 0
  for (const river of RIVERS) {
    const axis = densifyRiverAxis(river.points)
    for (let i = 0; i < axis.length; i++) {
      const d = Math.hypot(axis[i].lat - place.lat, axis[i].lon - place.lon)
      if (d >= bestD) continue
      bestD = d
      riverId = river.id
      aLat = axis[i].lat
      aLon = axis[i].lon
      // The axis runs SOURCE → MOUTH, so the step toward the next sample is
      // the DOWNSTREAM direction (the convention communicationRock.ts reads).
      const a = axis[Math.max(0, Math.min(axis.length - 2, i))]
      const b = axis[Math.max(1, Math.min(axis.length - 1, i + 1))]
      dLat = b.lat - a.lat
      dLon = b.lon - a.lon
    }
  }
  if (!riverId || bestD <= 0) return null

  // The water's edge, not the axis: the drawn band reaches RIVER_WIDTH_DEG out
  // to each side (world/terrain.ts), and the panorama's own scale turns those
  // degrees into the place units the player walks.
  const distance = (bestD - RIVER_WIDTH_DEG) / BACKDROP_SCALE
  if (!(distance >= radius + BANK_MIN_GAP) || distance > radius + BANK_MAX_GAP) return null

  // Place coordinates: +x is east (+lon) and +z is south (−lat), the mapping
  // the surroundings panorama samples the terrain with, so the water lies on
  // the same side of the village in both views.
  let nx = (aLon - place.lon) / bestD
  let nz = -(aLat - place.lat) / bestD
  const nLen = Math.hypot(nx, nz) || 1
  nx /= nLen
  nz /= nLen

  let fx = dLon
  let fz = -dLat
  // Square the flow against the normal: the two are perpendicular wherever the
  // village was nudged straight off its course, but a bend leaves a small
  // component that would tilt the bank strip against its own waterline.
  const proj = fx * nx + fz * nz
  fx -= proj * nx
  fz -= proj * nz
  const fLen = Math.hypot(fx, fz)
  if (fLen < 1e-6) return null
  fx /= fLen
  fz /= fLen

  const walkEdge = distance - BANK_SHORE_HALF
  // The wade limit is solved on the profile, so a recalibrated depth moves it
  // and the drawn shore together; clamped so it can never fall behind the top
  // of the bank however the depth is set.
  const wadeEdge = Math.max(walkEdge, outAtDepth({ distance, walkEdge }, balance.bankWadeDepth))
  const frame = { nx, nz, fx, fz }
  const stretchAngle = BANK_PLATEAU_ANGLE * BANK_STRETCH_ANGLE_FRAC
  const stretchR = walkEdge / Math.cos(stretchAngle) - BANK_STAND_INSET
  return {
    riverId,
    ...frame,
    distance,
    walkEdge,
    wadeEdge,
    axisDeg: bestD,
    bank: alongBank(frame, 0, walkEdge - BANK_STAND_INSET),
    upstream: alongBank(frame, -stretchAngle, stretchR),
    downstream: alongBank(frame, stretchAngle, stretchR),
  }
}

/** How far inland the three bank points may be drawn to find ground a villager
 *  actually fits on, and in what steps. Three metres is the whole budget: a
 *  point pulled further than that is no longer at the water. */
const BANK_SETTLE_STEP = 0.3
const BANK_SETTLE_MAX = 3

/**
 * Pulls the three named bank points onto ground a mover of the settlement's
 * own footprint can STAND on (point 155's rule, which the errand targets and
 * the dig sites already obey — these three were missed, and a rock dropped at
 * the water's edge by one seed left the downstream stretch inside a collider,
 * a place no villager sent there could ever reach).
 *
 * They are drawn straight INLAND along their own radius, so each stays on its
 * own bearing off the bank, and the two stretches move TOGETHER by the same
 * amount — the mirror between them is what the UPSTREAM/DOWNSTREAM teaching
 * rests on, and a stretch nudged on its own would break it. `free` decides what
 * is standable; the layout passes its full collider set.
 */
export function settleBankPoints(
  bank: PlaceRiverBank,
  free: (x: number, z: number) => boolean,
): void {
  const pull = (p: BankPoint, by: number): BankPoint => {
    const r = Math.hypot(p.x, p.z)
    if (r <= 1e-6) return p
    const f = Math.max(0, (r - by) / r)
    return { x: p.x * f, z: p.z * f }
  }
  const steps = Math.round(BANK_SETTLE_MAX / BANK_SETTLE_STEP)
  for (let s = 0; s <= steps; s++) {
    const p = pull(bank.bank, s * BANK_SETTLE_STEP)
    if (free(p.x, p.z)) {
      bank.bank = p
      break
    }
  }
  for (let s = 0; s <= steps; s++) {
    const up = pull(bank.upstream, s * BANK_SETTLE_STEP)
    const down = pull(bank.downstream, s * BANK_SETTLE_STEP)
    if (free(up.x, up.z) && free(down.x, down.z)) {
      bank.upstream = up
      bank.downstream = down
      break
    }
  }
}
