// The village water stand as the carrier works at it: where its jars stand,
// where he stands to reach them, how he takes the empty jar up and where his
// report points. Pure, so the reach and the aim are asserted without a scene
// graph; PlaceLife draws exactly what this returns.

import { balance } from '../../config/balance'
import {
  armAim,
  FILL_CARRY_SIDE,
  REST_POSE,
  WORK_LEAN_MAX,
  aimAt,
  gestureArm,
  type ArmPose,
  type ArmSide,
  type FigurePose,
} from '../../render/gesture'
import { JAR_HEIGHT } from './fillJar'

export interface StandPoint {
  x: number
  z: number
}
type Vec3 = [number, number, number]

/** Height of the plank's top the jars stand on (m). */
export const STAND_PLANK_TOP = 0.385
/** Spacing of the full jars in their row across the plank (m). */
const ROW_SPREAD = 0.28
/** The full jars stand in the plank's BACK half, so the empty jar has the
 *  front edge, the side the carrier works from (local +Z, toward the water). */
const ROW_Z = [-0.17, -0.25] as const
/** The empty jar waiting at the plank's front edge. */
export const SPARE_JAR_LOCAL: Vec3 = [0, STAND_PLANK_TOP + JAR_HEIGHT / 2, 0.27]

/** The stand's yaw (three.js `rotation.y`): its front, local +Z, toward the
 *  water path's foot — the side the carrier comes back from. */
export function standYaw(stand: StandPoint, foot: StandPoint | null): number {
  if (!foot) return 0
  return Math.atan2(foot.x - stand.x, foot.z - stand.z)
}

/** A point in the stand's own frame, in world metres (the stand's group stands
 *  at y = 0, as WaterStand draws it). */
export function standToWorld(stand: StandPoint, yaw: number, local: readonly number[]): { x: number; y: number; z: number } {
  const c = Math.cos(yaw)
  const s = Math.sin(yaw)
  return { x: stand.x + local[0] * c + local[2] * s, y: local[1], z: stand.z - local[0] * s + local[2] * c }
}

/** Where full jar `i` of the row stands, in the stand's frame (its centre). */
export function standJarLocal(i: number, capacity = balance.waterStandCapacity): Vec3 {
  return [(i - (capacity - 1) / 2) * ROW_SPREAD, STAND_PLANK_TOP + JAR_HEIGHT / 2, ROW_Z[i % 2]]
}

/** The water in the newest jar standing on the stand: the mouth of the last
 *  shown slot. `count` is the state's `standJars`; with none, the row's middle. */
export function newestJarWater(stand: StandPoint, foot: StandPoint | null, count: number): { x: number; y: number; z: number } {
  const slot = Math.max(0, Math.min(balance.waterStandCapacity, count) - 1)
  const [x, y, z] = standJarLocal(slot)
  return standToWorld(stand, standYaw(stand, foot), [x, y + JAR_HEIGHT / 2, z])
}

/**
 * Where the carrier stands AT the table: on the line from the stand's centre
 * out to his own working spot, `reach` from the centre (work-order 1405). His
 * working spot on the 2.4 m ring is where he waits for the order; the jar is
 * taken up and set down from here. Off standable ground, his own spot.
 */
export function tableSpot(
  stand: StandPoint,
  from: StandPoint,
  standable: (x: number, z: number) => boolean = () => true,
  reach = balance.waterStandReach,
): StandPoint {
  const dx = from.x - stand.x
  const dz = from.z - stand.z
  const d = Math.hypot(dx, dz)
  if (d <= reach) return { x: from.x, z: from.z }
  const spot = { x: stand.x + (dx / d) * reach, z: stand.z + (dz / d) * reach }
  return standable(spot.x, spot.z) ? spot : { x: from.x, z: from.z }
}

/** Where in the take the arm is out at the jar (0..1 of the take). */
export const TAKE_REACHED = 0.3
/** Where in the take the jar is in his hand: from here he carries it. */
export const TAKE_GRAB = 0.6
/** Where in the take he starts to straighten up again. */
const TAKE_RETURN = 0.7

function smoothstep(x: number): number {
  const c = Math.max(0, Math.min(1, x))
  return c * c * (3 - 2 * c)
}

/** How far out the reach is (0 standing, 1 at the jar) at this take progress. */
export function takeEnvelope(progress: number): number {
  const p = Math.max(0, Math.min(1, progress))
  if (p < TAKE_REACHED) return smoothstep(p / TAKE_REACHED)
  if (p > TAKE_RETURN) return 1 - smoothstep((p - TAKE_RETURN) / (1 - TAKE_RETURN))
  return 1
}

/** How far the empty jar has travelled from the plank to his hand (0..1): it
 *  lifts only while the hand is out at it, and is in the hand at TAKE_GRAB. */
export function takeJarTravel(progress: number): number {
  return smoothstep((progress - TAKE_REACHED) / (TAKE_GRAB - TAKE_REACHED))
}

/**
 * The carrier TAKING THE EMPTY JAR UP (work-order 1405): the carrying arm —
 * the one the empty jar then hangs from — reaches out along `aim` (in the
 * figure's own frame, as `aimAt` gives it) while the trunk leans in, no deeper
 * than a digging strike, and comes back with the jar. A pose, like `fillPose`:
 * driven by progress through the take, no clock of its own.
 */
export function takePose(progress: number, aim: { bearing: number; elevation: number }): FigurePose {
  const e = takeEnvelope(progress)
  const rest = REST_POSE[FILL_CARRY_SIDE]
  const target = armAim(aim.bearing, aim.elevation)
  const carrying: ArmPose = {
    pitch: rest.pitch + (target.pitch - rest.pitch) * e,
    yaw: rest.yaw + (target.yaw - rest.yaw) * e,
    // The outward roll keeps a HANGING arm clear of the body; one out in front
    // is clear already.
    roll: rest.roll * (1 - 0.9 * e),
  }
  const free = { ...REST_POSE[FILL_CARRY_SIDE === 'left' ? 'right' : 'left'] }
  return {
    left: FILL_CARRY_SIDE === 'left' ? carrying : free,
    right: FILL_CARRY_SIDE === 'left' ? free : carrying,
    lean: WORK_LEAN_MAX * e,
    turn: 0,
  }
}

/**
 * The aim of a pointing arm taken from ITS OWN SHOULDER, not from the body's
 * centre line (work-order 1405). `aimAt` measures from the centre, so an arm
 * half a shoulder-width off it pointed PARALLEL to the line at the target and
 * missed a jar a metre away by that half-width. The side is the one the
 * centre's bearing picks; the bearing and elevation are solved from that
 * shoulder, and the side is returned so the gesture keeps it even where the
 * corrected bearing crosses the centre line.
 */
export function shoulderAim(
  figure: { x: number; z: number; yaw: number },
  target: { x: number; y: number; z: number },
  shoulder: { y: number; x: number },
): { bearing: number; elevation: number; side: ArmSide } {
  const side = gestureArm(aimAt(figure, target, shoulder.y).bearing)
  const lx = side === 'left' ? shoulder.x : -shoulder.x
  // The figure's local +X in the world, under the codebase's yaw convention
  // (local +Z onto (sin yaw, cos yaw)).
  const at = {
    x: figure.x + lx * Math.cos(figure.yaw),
    z: figure.z - lx * Math.sin(figure.yaw),
    yaw: figure.yaw,
  }
  return { ...aimAt(at, target, shoulder.y), side }
}
