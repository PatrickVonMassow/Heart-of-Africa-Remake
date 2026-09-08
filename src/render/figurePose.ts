// Writing a figure's pose onto the pivots that carry it (work-order 1065).
//
// `gesture.ts` decides WHAT a figure's arms and trunk do; this is the one place
// that puts that decision on the objects. It exists as its own module because
// of WHEN it has to happen: a figure applies its own pose in its own frame
// callback, and React subscribes a child's callback before its parent's — so a
// pose written by the parent was drawn one frame late, and a gesture issued
// together with a word was drawn after the word had fallen. Measured 08.09.2026
// in the browser: in the frame the tapping child said ROCK its shoulder was
// still drawn at rest, 54 cm of arm off the stone, and it stood on the stone
// only from the next frame on. So whoever WRITES a pose applies it too, in the
// same frame, through this function.

import type * as THREE from 'three/webgpu'
import type { FigurePose } from './gesture'

/** The pivots a pose moves, published by the figure that owns them. */
export interface FigureLimbs {
  /** The two shoulder pivots, the figure's LEFT one first. */
  arms: Array<THREE.Group | null>
  /** The trunk that the lean tips and the shake turns. */
  trunk: THREE.Group | null
}

/**
 * Write a pose onto the pivots it moves.
 *
 * The arms take their Euler angles as they stand — the pivots are created in
 * `YXZ` order, which is what makes a bearing apply to an arm that is already
 * raised. The lean tips the trunk about local X (+x carries its top to +z, the
 * figure's front) and the shake turns it about local Y; a missing pivot is
 * skipped rather than throwing, because a figure is drawn before its refs land.
 */
export function applyFigurePose(limbs: FigureLimbs | null, shown: FigurePose): void {
  if (!limbs) return
  const left = limbs.arms[0]
  const right = limbs.arms[1]
  if (left) left.rotation.set(shown.left.pitch, shown.left.yaw, shown.left.roll)
  if (right) right.rotation.set(shown.right.pitch, shown.right.yaw, shown.right.roll)
  if (limbs.trunk) limbs.trunk.rotation.set(shown.lean, shown.turn, 0)
}
