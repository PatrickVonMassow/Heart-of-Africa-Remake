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
import type { ArmPose, FigurePose } from './gesture'

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

/**
 * The ref callbacks that publish a figure's two shoulder pivots and put a NEWLY
 * BORN one at rest — one pair per figure, held for its lifetime.
 *
 * WHY A PIVOT IS ONLY EVER INITIALISED ONCE (work-order 1065). This began as an
 * INLINE ref callback, which is a new function on every render: React detaches
 * the old one and attaches the new one each time, and the callback set the arms
 * back to REST. So any re-render at all, from anywhere in the tree, returned
 * every drawn figure's shoulders to rest for one frame in the middle of whatever
 * it was doing — the pose loop wrote the real pose again on the next frame, so it
 * read as a flicker rather than as a bug. Measured 10.09.2026 on WebGL 2: the
 * tapping child's hand 61 cm off the stone it was naming for a single frame of a
 * nine-second hold, its pose written at -2.70 rad and drawn at 0.04, back on the
 * stone the frame after. On the frame a word falls, that is the whole contact
 * gone, which is the claim `design.md` §13.4 rests on.
 *
 * The guarantee is therefore in the DATA rather than in React's call schedule: a
 * pivot this factory has already seen is published again and left exactly as it
 * is posed. Holding the pair stable across renders (a `useMemo` at the call
 * site) is what keeps the memory alive, and the two together mean neither a
 * re-render nor a re-attach can reach a live pose.
 */
export function restingArmRefs(
  arms: Array<THREE.Group | null>,
  rest: readonly [ArmPose, ArmPose],
): Array<(el: THREE.Group | null) => void> {
  const born = new WeakSet<THREE.Group>()
  return [0, 1].map((i) => (el: THREE.Group | null) => {
    arms[i] = el
    if (!el || born.has(el)) return
    born.add(el)
    // The order is the pivot's own, not the pose's: a bearing has to apply to an
    // arm that is already raised (see `armDirection` in gesture.ts).
    el.rotation.order = 'YXZ'
    el.rotation.set(rest[i].pitch, 0, rest[i].roll)
  })
}
