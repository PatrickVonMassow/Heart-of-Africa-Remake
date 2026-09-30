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
