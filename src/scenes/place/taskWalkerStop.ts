// The task walker's stop at its work (work-order "walking villagers", from
// point 350): it takes hold of the load on its head with both hands while
// standing, lowers it as it kneels and sets it down beside it, works, grips it again, rises with it onto
// its head and lets go — and gets up ON THE SPOT: every step runs to its end
// before the first step home, so it never rises while it moves off.

import { TASK_LOAD_HANDLING as H, VILLAGER_MOTION } from '../../config/balance'

export type WorkStopMode = 'take' | 'work' | 'rise' | 'settle' | 'back'
export type StopMode = Exclude<WorkStopMode, 'back'>

/** The kneeling time of one stop: long enough for setting the load down,
 *  letting go and gripping it again. */
export function workSpan(seconds: number): number {
  return Math.max(seconds, H.lowerSeconds + H.releaseSeconds + H.gripSeconds + 0.5)
}

/** How long the getting-up with the load takes. */
export const RISE_SECONDS = Math.max(VILLAGER_MOTION.kneelSeconds, H.liftSeconds)

/** One frame of the stop: `take` grips the load standing, `work` kneels
 *  (`span` long), `rise` gets up with it, `settle` lets go of it on the head,
 *  then `back` lets the walker walk. */
export function workStop(mode: StopMode, timer: number, dt: number, span: number): { mode: WorkStopMode; timer: number; kneels: boolean } {
  const left = timer - dt
  if (left > 0) return { mode, timer: left, kneels: mode === 'work' }
  if (mode === 'take') return { mode: 'work', timer: span, kneels: true }
  if (mode === 'work') return { mode: 'rise', timer: RISE_SECONDS, kneels: false }
  if (mode === 'rise') return { mode: 'settle', timer: H.releaseSeconds, kneels: false }
  return { mode: 'back', timer: 0, kneels: false }
}
