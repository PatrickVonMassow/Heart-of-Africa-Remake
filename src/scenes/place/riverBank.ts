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

/** How far INSIDE the walkable edge the water wall halts a mover. Without it
 *  the wall would stop the player exactly ON the boundary, where a rounding
 *  step decides whether the leave check has fired — and a village you fall out
 *  of by leaning on the water is not a bank. */
export const BANK_WALL_INSET = 0.05

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
  /** Distance to the walkable edge — the top of the bank, where the boundary
   *  runs and the ground plate ends. */
  walkEdge: number
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
  const frame = { nx, nz, fx, fz }
  const stretchAngle = BANK_PLATEAU_ANGLE * BANK_STRETCH_ANGLE_FRAC
  const stretchR = walkEdge / Math.cos(stretchAngle) - BANK_STAND_INSET
  return {
    riverId,
    ...frame,
    distance,
    walkEdge,
    axisDeg: bestD,
    bank: alongBank(frame, 0, walkEdge - BANK_STAND_INSET),
    upstream: alongBank(frame, -stretchAngle, stretchR),
    downstream: alongBank(frame, stretchAngle, stretchR),
  }
}
