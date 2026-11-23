// The predator's give-up out of a calf chase (design.md §19, §19.5, §19.16):
// the shared walk-off start of a swim escape and a crocodile steal.

/** Walk-off direction after a kill: straight away from the traveller, so the
 *  leave never crosses the view; random when standing on the traveller. */
export function leaveHeading(x: number, z: number, px: number, pz: number): number {
  const dx = x - px
  const dz = z - pz
  if (Math.hypot(dx, dz) < 1e-3) return Math.random() * Math.PI * 2
  return Math.atan2(dx, dz)
}

/** The chase-state fields the give-up touches. */
export interface ChaseAbortState<V> {
  mode: string
  lx: number
  lz: number
  heading: number
  leaveHeading?: number
  leaveT?: number
  victim: V | null
  victimHunt: boolean
}

/** Abort a calf chase into the ordinary walk-off FROM WHERE THE PREDATOR
 *  STANDS (point 1229): its position is left untouched and the walk-off
 *  heading is taken from it, never from the lost victim's spot — so the
 *  predator neither jumps nor turns to a far-away kill site. */
export function abortChaseIntoLeave<V>(s: ChaseAbortState<V>, travellerX: number, travellerZ: number): void {
  s.mode = 'leave'
  s.heading = leaveHeading(s.lx, s.lz, travellerX, travellerZ)
  s.leaveHeading = undefined // fresh corridor pick (point 188)
  s.leaveT = 0
  s.victim = null
  s.victimHunt = false
}
