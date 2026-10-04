// Who a settlement figure is — sex, age group, build — when its vignette does
// not say (work-order "villager dress"). Pure, so the mix is unit-tested.

import type { AgeGroup, Sex } from '../../systems/appearance'

export interface FigureIdentity {
  sex: Sex
  age: AgeGroup
  /** −1 slight .. +1 stout. */
  build: number
  /** A stable per-figure number in [0, 1) for the choices a share decides. */
  pick: number
}

/** A stable 32-bit hash of a string (FNV-1a with an avalanche). */
function hash32(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193)
  h ^= h >>> 15
  h = Math.imul(h, 0x2c1b3c6d)
  h ^= h >>> 12
  return h >>> 0
}

/**
 * Who a figure is when its vignette does not say: a child when it is drawn at
 * a child's scale, otherwise a mix of the sexes and of young, married and old
 * — stable per figure (React's `useId`), so a villager does not change between
 * visits of the same layout. The mix itself is a calibratable guess.
 */
export function figureIdentity(key: string, scale: number, sex?: Sex, age?: AgeGroup): FigureIdentity {
  const h = hash32(key)
  const u = (bits: number) => ((h >>> bits) & 0xff) / 256
  const resolvedAge: AgeGroup = age ?? (scale < 0.8 ? 'child' : u(8) < 0.3 ? 'youth' : u(8) < 0.75 ? 'adult' : 'elder')
  return {
    sex: sex ?? (u(0) < 0.5 ? 'female' : 'male'),
    age: resolvedAge,
    build: Math.round((u(16) - 0.5) * 2) * 0.6,
    pick: u(24),
  }
}
