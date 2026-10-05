// The loads villagers carry on the head (work-order "walking villagers"): the
// numbers each load is DRAWN from are the numbers its steadying hand grips by,
// so the hand lies against the drawn side, not against a guessed outline.

import { VILLAGER_MOTION } from '../../config/balance'
import type { HeadLoadShape } from '../../render/figureWalk'

/** The task walker's bundle: a box, width across the hand's side (m). */
export const TASK_BUNDLE = { width: 0.38, height: 0.22, depth: 0.3 } as const
/** The task walker's closed jar: rim and base radius, height (m). */
export const TASK_JAR = { top: 0.12, bottom: 0.16, height: 0.32 } as const
/** The errand walkers' basket: rim and base radius, height (m). */
export const WALKER_BASKET = { top: 0.22, bottom: 0.16, height: 0.18 } as const

export type TaskLoad = 'bundle' | 'jar'

/** The outline the hand grips on a task walker's load. */
export function taskLoadShape(carry: TaskLoad): HeadLoadShape {
  if (carry === 'bundle') return { bottom: TASK_BUNDLE.width / 2, top: TASK_BUNDLE.width / 2, height: TASK_BUNDLE.height }
  return { ...TASK_JAR }
}

/** The load's outline when its carrier steadies it with a hand, else null
 *  (balanced hands-free) — `VILLAGER_MOTION.headLoad` decides. */
export function steadiedLoad(
  kind: keyof typeof VILLAGER_MOTION.headLoad,
  shape: HeadLoadShape,
  steady: boolean = VILLAGER_MOTION.headLoad[kind].steady,
): HeadLoadShape | null {
  return steady ? shape : null
}
