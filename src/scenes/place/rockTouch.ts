// LAYING A HAND ON A STONE (work-order 1065).
//
// A figure teaches a word by acting on the thing it names, and the act only
// exists if the hand ARRIVES. This module answers the one question that decides
// it: standing on which spot, and reaching at which angle, does a figure of a
// given size put its hand on a drawn flank?
//
// It is solved rather than tuned, and solved through the SAME chain the renderer
// draws — `handAt` with the touch's own lean and the figure's own trunk pivot —
// because the tolerance is centimetres and a re-derived pose is off by more than
// that. Give it a different stone, a different figure scale or a different lean
// and the answer follows; nothing here knows about rocks, children or the bank.
//
// WHY THE STAND IS THE LARGEST ONE THAT STILL TOUCHES. A reaching figure has a
// whole interval of stands that reach the stone, and the far end of it is the
// one to take: it keeps the body out of the flank, it leaves the arm extended
// rather than folded against the chest, and it is the only end that a collider
// a few centimetres wider does not immediately swallow.

import { FIGURE_LIMBS } from '../../render/figures'
import { handAt, TOUCH_LEAN } from '../../render/gesture'

/** How the reach was solved: where to stand, how to aim, and what it meets. */
export interface RockTouch {
  /** Distance from the thing's own axis at which the figure stands. */
  stand: number
  /** Arm elevation in the figure's own frame (rad); its bearing is straight
   *  ahead, because a figure lays its hand on what it is facing. */
  elevation: number
  /** World height the hand meets the surface at. */
  height: number
  /** The drawn flank radius there — what the hand is resting against. */
  radius: number
}

/** Elevations the solve considers, from a hand at the hip to one overhead. A
 *  step of ~1.1° is finer than the difference it could make to the stand. */
const LOW = -0.35
const HIGH = 1.45
const STEPS = 96

/**
 * Where a figure of this `scale` must stand to lay its hand on a surface whose
 * radius is `surfaceAt(y, bearingOffset)`, and how high it must reach. The
 * offset is measured from the body's approach bearing to its touching hand.
 *
 * `pivotY` is the height its trunk leans about, in body heights — 0 for a figure
 * drawn without legs, `FIGURE_LIMBS.hipY` for one with them. `null` comes back
 * when no elevation reaches the surface at all, which is a surface out of the
 * figure's reach rather than a failure to solve.
 */
export function solveTouch(
  surfaceAt: (y: number, bearingOffset: number) => number,
  scale: number,
  pivotY = FIGURE_LIMBS.hipY,
  lean = TOUCH_LEAN,
): RockTouch | null {
  const hand = FIGURE_LIMBS.handRadius * scale
  let best: RockTouch | null = null
  for (let k = 0; k <= STEPS; k++) {
    const elevation = LOW + ((HIGH - LOW) * k) / STEPS
    // The hand this reach puts out, in the figure's own frame and in metres.
    // The bearing is 0: the figure faces what it touches.
    const [hx, hy, hz] = handAt('left', 0, elevation, lean, pivotY).map((v) => v * scale)
    if (hy <= 0) continue
    // The left hand is beside the body's centreline. On an irregular stone
    // that changes the flank it meets; converge the radius and that bearing
    // together instead of treating every approach as a circular cross-section.
    let radius = surfaceAt(hy, 0)
    for (let j = 0; j < 12 && radius + hand > Math.abs(hx); j++) {
      const offset = Math.atan2(-hx, Math.sqrt((radius + hand) ** 2 - hx ** 2))
      const next = surfaceAt(hy, offset)
      const difference = Math.abs(next - radius)
      radius = next
      if (difference < 1e-7) break
    }
    if (!(radius > 0)) continue
    // The hand sits `hx` off the figure's own axis, so it meets the surface a
    // shade short of straight ahead; the stand follows from the triangle rather
    // than from the flank radius alone.
    const reach = radius + hand
    if (reach <= Math.abs(hx)) continue
    const stand = hz + Math.sqrt(reach * reach - hx * hx)
    if (!best || stand > best.stand) best = { stand, elevation, height: hy, radius }
  }
  return best
}

/**
 * Where the hand of a figure standing `stand` from an axis, facing it, actually
 * ends up: its distance from that axis and its height. The inverse of the solve
 * above and the thing an assertion should measure — it is the picture's own
 * answer, not the solve's claim about itself.
 */
export function touchedPoint(
  stand: number,
  elevation: number,
  scale: number,
  pivotY = FIGURE_LIMBS.hipY,
  lean = TOUCH_LEAN,
): { radius: number; height: number; offAxis: number } {
  const [hx, hy, hz] = handAt('left', 0, elevation, lean, pivotY).map((v) => v * scale)
  return { radius: Math.hypot(stand - hz, hx), height: hy, offAxis: hx }
}

/**
 * THE REACH FROM WHERE THE FIGURE ACTUALLY IS. `solveTouch` says where to send
 * it; a walker arrives near that spot rather than on it, and the hand has to
 * land on the stone from the spot it really reached. So the elevation is solved
 * again against the distance measured this frame, and the `gap` it comes back
 * with is the honest answer to "is the hand on the surface?" — positive when the
 * hand is short of it, negative when it would be through it.
 *
 * `null` means no elevation in the figure's range comes near at all.
 */
export function reachFrom(
  stand: number,
  surfaceAt: (y: number, bearingOffset: number) => number,
  scale: number,
  pivotY = FIGURE_LIMBS.hipY,
  lean = TOUCH_LEAN,
): (RockTouch & { gap: number }) | null {
  const hand = FIGURE_LIMBS.handRadius * scale
  let best: (RockTouch & { gap: number }) | null = null
  for (let k = 0; k <= STEPS; k++) {
    const elevation = LOW + ((HIGH - LOW) * k) / STEPS
    const at = touchedPoint(stand, elevation, scale, pivotY, lean)
    if (at.height <= 0) continue
    const forward = Math.sqrt(Math.max(0, at.radius ** 2 - at.offAxis ** 2))
    const radius = surfaceAt(at.height, Math.atan2(-at.offAxis, forward))
    if (!(radius > 0)) continue
    const gap = at.radius - (radius + hand)
    if (!best || Math.abs(gap) < Math.abs(best.gap)) {
      best = { stand, elevation, height: at.height, radius, gap }
    }
  }
  return best
}
