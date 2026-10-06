// How the shovel (shovel.tsx) is held by the bodies that pose it by hand
// pivots — the primitive figure and the code-built body; the glTF body holds it
// by its clips' grip (gltfClipLayers.ts).

import { VILLAGER_ASSET, VILLAGER_GLTF } from '../../config/balance'
import type { ArmPose, FigurePose } from '../../render/gesture'

const S = VILLAGER_ASSET.shovel

/** How the primitive figure's hand carries the shovel (rad about the hand's x):
 *  nearly level, the blade forward. Its hanging hand is only ~0.18 of its
 *  height off the ground (FIGURE_LIMBS), so a shovel hanging from it would
 *  stand in the earth — the old hoe did; the primitive arm cannot shoulder it.
 *  While it digs the shaft runs along the arm (tilt 0) and the stroke drives
 *  the blade into the pit in front. */
export const PRIMITIVE_CARRY_TILT = -1.5

/** The lowest the blade tip reaches below a hanging hand (figure units) at a
 *  tilt about the hand's x axis. */
export const tipDrop = (tilt: number) => -S.tip * Math.cos(tilt)


/** The dig's share of a hand-pivot body's pose (0 … 1), eased toward
 *  `digging` over VILLAGER_GLTF.transitionSeconds as the glTF body's layers
 *  are: the stroke and the shovel's turn along the arm come and go together. */
export function easeDigWeight(k: number, digging: boolean, dt: number): number {
  const step = dt / Math.max(1e-6, VILLAGER_GLTF.transitionSeconds)
  return digging ? Math.min(1, k + step) : Math.max(0, k - step)
}

/** The shovel's tilt in the hand at a dig weight: carried at
 *  PRIMITIVE_CARRY_TILT, along the arm (0) while digging. */
export const primitiveToolTilt = (dig: number) => PRIMITIVE_CARRY_TILT * (1 - dig)

const mixArm = (a: ArmPose, b: ArmPose, k: number): ArmPose => ({
  pitch: a.pitch + (b.pitch - a.pitch) * k,
  yaw: a.yaw + (b.yaw - a.yaw) * k,
  roll: a.roll + (b.roll - a.roll) * k,
})

/** The pose `k` of the way from `base` to the dig's `dig`. */
export function mixDigPose(base: FigurePose, dig: FigurePose, k: number): FigurePose {
  if (k <= 0) return base
  if (k >= 1) return dig
  return {
    left: mixArm(base.left, dig.left, k),
    right: mixArm(base.right, dig.right, k),
    lean: base.lean + (dig.lean - base.lean) * k,
    turn: base.turn + (dig.turn - base.turn) * k,
  }
}
