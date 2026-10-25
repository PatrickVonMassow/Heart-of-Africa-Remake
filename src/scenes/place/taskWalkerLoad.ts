// The task walker's head load in its hands (work-order "the task walker takes
// its head load off with its hands"): at its stop it grips the load on its
// head, brings it down with both hands while kneeling and sets it on the
// ground beside it; before rising it grips it there again and lifts it back
// onto its head. The load is never hidden: on the walk it rides the crown, in
// between it is where the hands put it. Pure, so the timeline and the grip
// are tested without a renderer; TaskWalker (PlaceLife.tsx) draws it.

import { TASK_LOAD_HANDLING as H } from '../../config/balance'
import { FIGURE_LIMBS } from '../../render/figures'
import { armAim, REST_POSE, type ArmPose, type FigurePose } from '../../render/gesture'
import { TASK_BUNDLE, TASK_JAR, type TaskLoad } from './headLoads'
import { RISE_SECONDS, type WorkStopMode } from './taskWalkerStop'

export interface V3 {
  x: number
  y: number
  z: number
}

/** Where the load is in the stop: `down` 0 on the head … 1 on the ground,
 *  `hold` how much the hands carry it (0: it rests where it is), `reach` how
 *  far the arms are out of their walking pose toward it. */
export interface LoadHandling {
  down: number
  hold: number
  reach: number
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const smooth = (v: number) => {
  const t = clamp01(v)
  return t * t * (3 - 2 * t)
}
// exact at both ends, so a load set down stands exactly on its spot
const mix = (a: number, b: number, t: number) => (t >= 1 ? b : t <= 0 ? a : a + (b - a) * t)
/** A release: the hands keep the load the first 40 % of it (it comes to rest
 *  in them), then come away. */
const RELEASE_HOLD = 0.4

/** The load's handling at this moment of the stop (`span`: the work's length). */
export function loadHandling(mode: WorkStopMode | 'go' | 'inside', timer: number, span: number): LoadHandling {
  switch (mode) {
    case 'take': {
      const p = 1 - timer / H.takeSeconds
      return { down: 0, reach: smooth(p / 0.7), hold: smooth((p - 0.6) / 0.4) }
    }
    case 'work': {
      const e = span - timer
      if (e < H.lowerSeconds) return { down: smooth(e / H.lowerSeconds), hold: 1, reach: 1 }
      if (e < H.lowerSeconds + H.releaseSeconds) {
        const p = (e - H.lowerSeconds) / H.releaseSeconds
        return { down: 1, hold: 1 - smooth(p / RELEASE_HOLD), reach: 1 - smooth((p - RELEASE_HOLD) / (1 - RELEASE_HOLD)) }
      }
      if (timer < H.gripSeconds) {
        const p = 1 - timer / H.gripSeconds
        return { down: 1, reach: smooth(p / 0.7), hold: smooth((p - 0.6) / 0.4) }
      }
      return { down: 1, hold: 0, reach: 0 }
    }
    case 'rise':
      return { down: 1 - smooth(1 - timer / RISE_SECONDS), hold: 1, reach: 1 }
    case 'settle': {
      const p = 1 - timer / H.releaseSeconds
      return { down: 0, hold: 1 - smooth(p / RELEASE_HOLD), reach: 1 - smooth((p - RELEASE_HOLD) / (1 - RELEASE_HOLD)) }
    }
    default:
      return { down: 0, hold: 0, reach: 0 }
  }
}

/** The spot beside the kneeling walker where the load stands, in its frame. */
export const LOAD_GROUND: V3 = { x: H.ground.side, y: 0, z: H.ground.forward }

/** The load's half width across the hands and the height they grip it at. */
export function loadGrip(carry: TaskLoad): { half: number; y: number } {
  if (carry === 'bundle') return { half: TASK_BUNDLE.width / 2, y: TASK_BUNDLE.height / 2 }
  return { half: (TASK_JAR.top + TASK_JAR.bottom) / 2, y: TASK_JAR.height / 2 }
}

/**
 * The load's base point in the walker's frame: on its way from the crown
 * (`head`, measured on the drawn figure) to the ground spot — out from the body
 * before down, so the path clears the shoulder — pulled into the hands as far
 * as they `hold` it (`hands`: the two drawn hands, left first, or null) and
 * only while it is on its way: at either end it rests where it is, so hands
 * closing on it or opening never move it. The hands are aimed at the
 * `planned` path, never at the load they carry. `tilt` is how far its
 * orientation has gone over from the head's to upright. `groundY` is the
 * terrain at the ground spot relative to the walker's feet, so the load stands
 * on a slope instead of floating over or sinking into it.
 */
export function loadPlacement(h: LoadHandling, head: V3, hands: readonly [V3, V3] | null, carry: TaskLoad, groundY = 0): { base: V3; planned: V3; tilt: number } {
  const out = smooth(h.down * H.outFirst)
  const dn = smooth(h.down)
  const planned = { x: mix(head.x, LOAD_GROUND.x, out), y: mix(head.y, LOAD_GROUND.y + groundY, dn), z: mix(head.z, LOAD_GROUND.z, out) }
  const tilt = smooth(h.down * 2)
  const w = h.hold * smooth(Math.min(h.down, 1 - h.down) / H.handOver)
  if (!hands || w <= 0) return { base: planned, planned, tilt }
  const g = loadGrip(carry)
  const held = { x: (hands[0].x + hands[1].x) / 2, y: (hands[0].y + hands[1].y) / 2 - g.y, z: (hands[0].z + hands[1].z) / 2 }
  return { base: { x: mix(planned.x, held.x, w), y: mix(planned.y, held.y, w), z: mix(planned.z, held.z, w) }, planned, tilt }
}

/** Where the two palms go on the load standing at `base` (left first): its
 *  sides across the walker, at its grip height. */
export function gripPoints(base: V3, carry: TaskLoad): [V3, V3] {
  const g = loadGrip(carry)
  const off = g.half + H.gripClearance
  const y = base.y + g.y
  return [
    { x: base.x + off, y, z: base.z },
    { x: base.x - off, y, z: base.z },
  ]
}

/** The primitive pivots the pose is written onto, at kneel `k` (skinnedFigure's
 *  virtual rig: no legs, its body folded and squashed by the kneel). */
function shoulderAt(i: 0 | 1, k: number): { at: V3; arm: number; squash: number } {
  const bodyH = 1 - 0.45 * k
  const squash = 1 - 0.25 * k
  return {
    at: { x: (i === 0 ? 1 : -1) * bodyH * FIGURE_LIMBS.shoulderX, y: bodyH * FIGURE_LIMBS.shoulderY * squash, z: 0 },
    arm: bodyH * FIGURE_LIMBS.armLength,
    squash,
  }
}

/** The arm angles that point arm `i` at `target` (the walker's frame), and how
 *  much of the arm's length it takes (the skinned body's reach share). */
export function aimArm(i: 0 | 1, target: V3, kneel: number): { arm: ArmPose; reach: number } {
  const s = shoulderAt(i, kneel)
  const dx = target.x - s.at.x
  const dy = (target.y - s.at.y) / s.squash
  const dz = target.z - s.at.z
  const flat = Math.hypot(dx, dz)
  const arm = armAim(Math.atan2(dx, dz || 1e-6), Math.atan2(dy, flat || 1e-6))
  return { arm, reach: Math.min(1, Math.hypot(dx, dy * s.squash, dz) / s.arm) }
}

/** Writes the walker's pose for this frame into `into`: the walking pose (arms
 *  free, as on the walk) blended by `h.reach` into both arms aimed at the
 *  grip points (`aims`, already corrected for the drawn arm), leaning toward a
 *  load down at the ground. */
export function handlingPose(into: FigurePose, h: LoadHandling, aims: readonly [V3, V3], kneel: number): void {
  const w = h.reach
  const blend = (rest: ArmPose, to: ArmPose): ArmPose => ({ pitch: mix(rest.pitch, to.pitch, w), yaw: mix(rest.yaw, to.yaw, w), roll: mix(rest.roll, to.roll, w) })
  const l = aimArm(0, aims[0], kneel)
  const r = aimArm(1, aims[1], kneel)
  into.left = w > 0 ? blend(REST_POSE.left, l.arm) : { ...REST_POSE.left }
  into.right = w > 0 ? blend(REST_POSE.right, r.arm) : { ...REST_POSE.right }
  into.lean = w * H.groundLean * smooth(h.down)
  into.turn = 0
  // a straight arm (share 1) at the start of the reach, so it never snaps in
  if (w > 0) into.reach = { left: mix(1, l.reach, w), right: mix(1, r.reach, w) }
  else delete into.reach
}

/** One hand's aim correction: moved toward closing the gap between where the
 *  hand should be and where it was drawn last frame, bounded; dropped while the
 *  arm is free. */
export function correctAim(offset: V3, target: V3, drawn: V3 | null, reach: number, dt: number): V3 {
  if (reach <= 0 || !drawn) return { x: 0, y: 0, z: 0 }
  const k = Math.min(1, H.aimCorrectRate * dt) * reach
  const o = { x: offset.x + (target.x - drawn.x) * k, y: offset.y + (target.y - drawn.y) * k, z: offset.z + (target.z - drawn.z) * k }
  const len = Math.hypot(o.x, o.y, o.z)
  if (len <= H.aimCorrectMax) return o
  const f = H.aimCorrectMax / len
  return { x: o.x * f, y: o.y * f, z: o.z * f }
}
