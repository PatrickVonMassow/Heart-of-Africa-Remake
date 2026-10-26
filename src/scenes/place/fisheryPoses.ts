// Pose helpers of the fishermen's scene (work-order 1245), kept out of the
// component so they can be tested: every pose written into a figure's own
// pose object is COPIED, never aliased to a shared template such as the
// head-carry pose other vignettes use too.

import type * as THREE from 'three/webgpu'
import { balance } from '../../config/balance'
import { armAim, copyPoseExtras, handAt, REST_POSE, type FigurePose } from '../../render/gesture'
import { FISH_BASKET } from './fishBaskets'
import { biteLift } from './fishFire'
import type { PoundingDuo } from './mortarPounding'
import { HEAD_CARRY_POSE } from './placeFigureContext'
import type { CanoeNetMan } from './villagerCanoe'

type FireConfig = typeof balance.villageLife.fishFire

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
  copyPoseExtras(into, from)
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

/** How far out a rack worker's posed hand is solved, as a share of her drawn
 *  arm: a bent arm the standing body reaches. Without it the skinned body
 *  crouched for the primitive's straight arm and re-chose that crouch every
 *  frame — the jitter of point 1416. */
const RACK_REACH = 0.85
/** Seconds over which the eating arm comes up from rest and goes back. */
const EAT_EASE_SECONDS = 0.4

/** What a woman of the pounding pair does with her arms away from the mortar
 *  (point 1282): reaching to the rack, eating the fish she took, else at rest.
 *  Each starts and ends at rest, so the phases join without a jump (point 1416). */
export function rackPose(
  duo: Pick<PoundingDuo, 'phase' | 'clock' | 'women'>,
  woman: number,
  cfg: FireConfig = balance.villageLife.fishFire,
): FigurePose {
  const rest = ownPose(REST_POSE)
  if (duo.phase === 'take') {
    const s = Math.sin(Math.PI * Math.min(1, duo.clock / cfg.takeSeconds))
    blendPose(rest, REST_POSE, reachPose(0, 0.3 * s), s)
    rest.reach = { left: RACK_REACH, right: RACK_REACH }
  } else if (duo.phase === 'eat' && duo.women[woman].fish > 0) {
    const e = Math.max(0, Math.min(1, duo.clock / EAT_EASE_SECONDS, (cfg.eatSeconds - duo.clock) / EAT_EASE_SECONDS))
    const eat = { left: armAim(0.35, -0.55 + 1.35 * biteLift(duo, cfg, woman)), right: REST_POSE.right, lean: 0.04, turn: 0 }
    blendPose(rest, REST_POSE, eat, e)
    rest.reach = { left: RACK_REACH }
  }
  return rest
}

/** How far down he goes as he lifts or sets the basket ashore (fraction of his height). */
const SHORE_SQUAT = 0.28

/** His height while ashore: 1 standing, down by SHORE_SQUAT at the bottom of a bend. */
export function netManSquash(reach: number): number {
  return 1 - SHORE_SQUAT * reach
}

/** The arms' bearing either side of straight ahead while he holds the basket. */
const HOLD_BEARING = 0.2
/** The arm elevations searched for his hands' height (rad): a lean of at most
 *  ~0.3 keeps the hand's height rising with the elevation over this range. */
const HOLD_ELEVATION: [number, number] = [-1.2, 0.6]

/** His hands' height over his ground at an arm elevation (m; the figure's
 *  scale is 1), and how far ahead of him they are. */
function netManHand(elevation: number, lean: number, squash: number): { height: number; forward: number } {
  const [, y, z] = handAt('left', HOLD_BEARING, elevation, lean)
  return { height: y * squash, forward: z }
}

export interface NetManAshore {
  pose: FigurePose
  /** Where his hands hold the basket's rim: ahead of his feet and over his ground (m). */
  rim: { forward: number; height: number }
}

/**
 * The net man ashore at a bend of `reach` (0 upright … 1 the bottom): his arms
 * and lean, and where his hands are. He bends only as far as the rim of the
 * basket standing on the ground — never further — and the basket he holds
 * hangs from his hands by its rim, so it stays BELOW them and ahead of him and
 * his head stays clear of it (the head sinking into a basket held at a fixed
 * height was the defect). Without the basket his relaxed hands are where the
 * shared reach pose puts them; with it, at the configured hold height.
 */
export function netManAshore(reach: number, holding: boolean, cfg = balance.villageLife.canoe): NetManAshore {
  const r = Math.min(1, Math.max(0, reach))
  const lean = 0.15 + cfg.netManBendLean * r
  const squash = netManSquash(r)
  // The relaxed hands: those of the shared reach pose upright (elevation −0.3).
  const upright = holding ? cfg.basketHoldHeight : netManHand(-0.3, 0.15, 1).height
  const target = upright + (FISH_BASKET.height - upright) * r
  let [lo, hi] = HOLD_ELEVATION
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2
    if (netManHand(mid, lean, squash).height < target) lo = mid
    else hi = mid
  }
  const elevation = (lo + hi) / 2
  const hand = netManHand(elevation, lean, squash)
  return {
    pose: { left: armAim(HOLD_BEARING, elevation), right: armAim(-HOLD_BEARING, elevation), lean, turn: 0 },
    rim: hand,
  }
}

/** Where the basket he holds stands in the world: hanging from his hands by
 *  its rim, ahead of him, and never below his ground. */
export function netManBasketAt(nm: CanoeNetMan, ground: (x: number, z: number) => number): { x: number; y: number; z: number } {
  const { forward, height } = netManAshore(nm.reach, true).rim
  return {
    x: nm.x + Math.sin(nm.yaw) * forward,
    y: ground(nm.x, nm.z) + Math.max(0, height - FISH_BASKET.height),
    z: nm.z + Math.cos(nm.yaw) * forward,
  }
}

/** The height over his ground of the basket the carrier carries on his head
 *  (m): standing on his crown. */
export const CARRIER_BASKET_Y = 1.36

/** Places the net man (point 1387) for this frame: on the seat and kneeling
 *  while in the hull, on the ground and standing (squatting to the basket) ashore. The kneel
 *  itself is the figure's own down-and-up transition. */
export function placeNetMan(
  group: THREE.Object3D,
  nm: CanoeNetMan,
  /** World height of his seat in the hull. */
  seatY: number,
  ground: (x: number, z: number) => number,
  kneels: { current: boolean },
  squat: { current: number },
): void {
  kneels.current = nm.inBoat
  const y = nm.inBoat ? seatY : ground(nm.x, nm.z)
  group.position.set(nm.x, y, nm.z)
  group.rotation.y = nm.yaw
  const squash = nm.inBoat ? 1 : netManSquash(nm.reach)
  group.scale.set(1, squash, 1)
  squat.current = squash
}
