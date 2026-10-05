// The task walker's stop at its work (work-order "walking villagers", from
// point 350): it kneels where it stopped, works, and gets up ON THE SPOT —
// the standing transition runs to its end before the first step, so it never
// rises while it moves off.

import { VILLAGER_MOTION } from '../../config/balance'

export type WorkStopMode = 'work' | 'rise' | 'back'

/** One frame of the stop: `work` counts the work down while kneeling, `rise`
 *  holds the walker in place for the getting-up, then `back` lets it walk. */
export function workStop(mode: 'work' | 'rise', timer: number, dt: number): { mode: WorkStopMode; timer: number; kneels: boolean } {
  const left = timer - dt
  if (mode === 'work') {
    return left > 0 ? { mode, timer: left, kneels: true } : { mode: 'rise', timer: VILLAGER_MOTION.kneelSeconds, kneels: false }
  }
  return left > 0 ? { mode, timer: left, kneels: false } : { mode: 'back', timer: 0, kneels: false }
}
