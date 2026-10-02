// The water carrier's jar at the river (work-order 1117, design.md §13.4): how
// it tips in the hand so only its MOUTH goes under the opaque surface, and the
// ring the surface answers the dip with. Pure, so the reading is asserted
// without a scene graph; PlaceLife draws exactly what this returns.

import { balance } from '../../config/balance'
import { REST_POSE, fillDip, fillHandPoint } from '../../render/gesture'

/** The open jar's height (m); its mouth is at +half, its base at -half. */
export const JAR_HEIGHT = 0.32

type Vec3 = [number, number, number]

/** Where the empty jar hangs in the hand while it is only carried. */
const HANG_POSITION: Vec3 = [0, -0.12, 0.04]
/** Its small outward cant while hanging, kept through the tip. */
const HANG_ROLL = 0.12
/** The outward roll `fillPose` takes off the carrying arm at the bottom of the
 *  dip. The jar keeps it, so the arm swinging in front never stands the jar up. */
const ARM_ROLL_SHED = REST_POSE.left.roll * 0.9

const rotX = (v: Vec3, a: number): Vec3 => [
  v[0],
  v[1] * Math.cos(a) - v[2] * Math.sin(a),
  v[1] * Math.sin(a) + v[2] * Math.cos(a),
]
const rotZ = (v: Vec3, a: number): Vec3 => [
  v[0] * Math.cos(a) - v[1] * Math.sin(a),
  v[0] * Math.sin(a) + v[1] * Math.cos(a),
  v[2],
]

/** The jar group's transform in the hand frame at this fill progress (0..1):
 *  `rotation` is a three.js `XYZ` Euler. Off the fill (`null`) it hangs. */
export function fillJarPlacement(progress: number | null): { position: Vec3; rotation: Vec3 } {
  if (progress === null) return { position: [...HANG_POSITION], rotation: [0, 0, HANG_ROLL] }
  const down = fillDip(progress)
  const { tilt, reach, lift } = balance.bankFillJar
  const tip = tilt * down
  // Tipped: the grip near the base, the centre `reach` toward the mouth.
  const centre = rotX(rotZ([0, reach, 0], HANG_ROLL + ARM_ROLL_SHED), tilt)
  const tipped: Vec3 = [centre[0], centre[1] + lift, centre[2]]
  const position: Vec3 = [0, 1, 2].map((k) => HANG_POSITION[k] + (tipped[k] - HANG_POSITION[k]) * down) as Vec3
  return { position, rotation: [tip, 0, HANG_ROLL + ARM_ROLL_SHED * down] }
}

/** A point on the jar's axis (`along` m from its centre, + toward the mouth),
 *  in the filling figure's frame — metres above its feet, squat included. */
export function fillJarPoint(progress: number, along: number): Vec3 {
  const { position, rotation } = fillJarPlacement(progress)
  const r = rotX(rotZ([0, along, 0], rotation[2]), rotation[0])
  return fillHandPoint(progress, [position[0] + r[0], position[1] + r[1], position[2] + r[2]])
}

/** How far the jar's mouth axis stands off the vertical (rad), in the figure's
 *  frame: 0 is upright, past π/2 the mouth points down. */
export function fillJarTiltFromVertical(progress: number): number {
  const m = fillJarPoint(progress, JAR_HEIGHT / 2)
  const b = fillJarPoint(progress, -JAR_HEIGHT / 2)
  const d = [m[0] - b[0], m[1] - b[1], m[2] - b[2]]
  return Math.acos(d[1] / Math.hypot(d[0], d[1], d[2]))
}

/** One ring on the water: radius (m) and opacity. */
export interface FillRing {
  radius: number
  opacity: number
}

/**
 * The rings the surface shows at a fill this far along, or `null` when nobody
 * is filling — the ring is alive exactly while the fill phase is. Driven by
 * progress through the fill (its seconds are `bankFillSeconds`), so a held dip
 * holds its rings. Ring `i` is born `i/count` of a period after the first and
 * fades as it spreads; all fade with the dip itself.
 */
export function fillRings(progress: number | null): FillRing[] | null {
  if (progress === null) return null
  const { count, period, startRadius, endRadius, opacity } = balance.bankFillRing
  const seconds = Math.max(0, Math.min(1, progress)) * balance.bankFillSeconds
  const strength = fillDip(progress)
  const rings: FillRing[] = []
  for (let i = 0; i < count; i++) {
    const age = seconds / period - i / count
    if (age < 0) {
      rings.push({ radius: startRadius, opacity: 0 })
      continue
    }
    const phase = age - Math.floor(age)
    rings.push({
      radius: startRadius + (endRadius - startRadius) * phase,
      opacity: opacity * (1 - phase) * strength,
    })
  }
  return rings
}
