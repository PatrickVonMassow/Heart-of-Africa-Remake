// Pose helpers of the fishermen's scene (work-order 1245), kept out of the
// component so they can be tested: every pose written into a figure's own
// pose object is COPIED, never aliased to a shared template such as the
// head-carry pose other vignettes use too.

import { armAim, type FigurePose } from '../../render/gesture'
import { HEAD_CARRY_POSE } from './placeFigureContext'

/** Both arms reaching toward a bearing and down, for lifting or setting down. */
export function reachPose(bearing: number, down: number): FigurePose {
  return {
    left: armAim(bearing + 0.2, -0.3 - 0.9 * down),
    right: armAim(bearing - 0.2, -0.3 - 0.9 * down),
    lean: 0.15 + 0.45 * down,
    turn: Math.max(-0.6, Math.min(0.6, bearing * 0.5)),
  }
}

/** Writes `from` into `into`, copying the arm poses rather than sharing them. */
export function copyPose(into: FigurePose, from: FigurePose): void {
  into.left = { ...from.left }
  into.right = { ...from.right }
  into.lean = from.lean
  into.turn = from.turn
}

/** A pose object of a figure's own, starting as a copy of `from`. */
export function ownPose(from: FigurePose): FigurePose {
  return { left: { ...from.left }, right: { ...from.right }, lean: from.lean, turn: from.turn }
}

/** The carrier's walking pose: the basket steadied on his head, or bent to
 *  set it down or take it up during the swap at the bank. */
export function carrierWalkPose(phase: string, clock: number, liftSeconds: number): FigurePose {
  const bend = phase === 'swap' ? Math.sin(Math.PI * Math.min(1, clock / liftSeconds)) : 0
  return bend > 0.02 ? reachPose(0, bend) : HEAD_CARRY_POSE.current
}

/** Euler angles (XYZ) of a fish still caught in the net at the gunwale: hanging
 *  HEAD DOWN (the fish mesh's head is at local +Z, its tail at −Z), thrashing
 *  about that pose, tilted out over the shore-side gunwale. */
export function netFishRotation(t: number, i: number, shoreSide: number): [number, number, number] {
  return [Math.PI / 2 + 0.35 * Math.sin(t * (10 + i) + i), 0.5 * Math.sin(t * (8 + i) + 2 * i), shoreSide * 0.25]
}

/** Writes the pose `t` of the way from `a` to `b` into `into` (0 = a, 1 = b):
 *  the carrier's arms go over to the gutting with his kneel, never in a jump. */
export function blendPose(into: FigurePose, a: FigurePose, b: FigurePose, t: number): void {
  const k = Math.min(1, Math.max(0, t))
  const mix = (x: number, y: number) => x + (y - x) * k
  into.left = { pitch: mix(a.left.pitch, b.left.pitch), yaw: mix(a.left.yaw, b.left.yaw), roll: mix(a.left.roll, b.left.roll) }
  into.right = { pitch: mix(a.right.pitch, b.right.pitch), yaw: mix(a.right.yaw, b.right.yaw), roll: mix(a.right.roll, b.right.roll) }
  into.lean = mix(a.lean, b.lean)
  into.turn = mix(a.turn, b.turn)
}
