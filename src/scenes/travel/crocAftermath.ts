// The crocodile kill's aftermath (design.md §19.16, work-order point 319): every
// way a crocodile drama can end must leave its victim in a consistent, VISIBLE
// state — the kill SINKS (the river keeps the body, held by the crocodile), a
// release (driven off, grip deadline, crocodile streamed out) frees the victim
// ALIVE. A carcass may only SHRINK while a visible feeder works it (lion feed,
// vulture flock, ground scavenger); a body dissolving with no actor is the
// reported defect. Pure over the animal's state fields so it is unit-testable.

import { markKilled } from './youngKill'
import type { DeathCause } from './deathCause'

/** The victim fields the crocodile aftermath reads and writes. */
export interface CrocVictim {
  caught?: number
  caughtBy?: 'crocodile'
  dead?: boolean
  gone?: boolean
  inWater?: number
  dissolve?: number
}

/** The crocodile's lunge fields the aftermath reads. */
export interface CrocLungeLike<V> {
  victim: V | null
  alongside?: V
  retreat?: boolean
}

/**
 * Free a seized victim ALIVE (a release, never a kill): the struggle ends, the
 * crocodile's claim is cleared, and the ordinary herd behaviour takes it back.
 * The same two fields the parent's drive-off has always cleared.
 */
export function releaseCrocVictim(v: CrocVictim): void {
  v.caught = undefined
  v.caughtBy = undefined
}

/** A water death (Wildlife takeAnimal with `sink`: the crocodile's kill, a
 *  waterfall plunge): the kill's own death (markKilled — no ground scavenger,
 *  no vulture over open water) put on the SINK path, so the body goes under
 *  over `dissolveSeconds` instead of shrinking on the bank. */
export function sinkKill(
  v: CrocVictim & { lionFed?: boolean; deathCause?: DeathCause },
  dissolveSeconds: number,
  cause: DeathCause,
): void {
  markKilled(v, dissolveSeconds, cause)
  v.inWater = 0
}

/** Whether a body is on the SINK path (a water death: the crocodile's kill or a
 *  drowning) — the river takes it, it is never a shrinking land carcass. */
export function isSinkingBody(v: CrocVictim): boolean {
  return v.dead === true && v.inWater !== undefined
}

/**
 * The consistent states a crocodile victim may be in, and the one it must
 * never be in:
 *   struggling — alive, seized, and a live crocodile HOLDS it;
 *   sinking    — dead on the sink path (the river keeps the body);
 *   alive      — freed (or never seized): walking on its own again;
 *   detached   — seized with no crocodile holding it (the struggle would end
 *                in a kill nobody made), or a dead crocodile victim that is
 *                NOT sinking (a bank carcass dissolving with no actor).
 */
export type CrocVictimState = 'struggling' | 'sinking' | 'alive' | 'detached'

export function crocVictimState(v: CrocVictim, held: boolean): CrocVictimState {
  if (v.dead) return isSinkingBody(v) ? 'sinking' : 'detached'
  if (v.caught !== undefined && v.caughtBy === 'crocodile') return held ? 'struggling' : 'detached'
  return 'alive'
}

/** Is `v` the body (victim or alongside-taken parent) of a live lunge? */
export function lungeHolds<V>(lunge: CrocLungeLike<V> | undefined, v: V): boolean {
  if (!lunge || lunge.retreat) return false
  return lunge.victim === v || lunge.alongside === v
}

/**
 * The view-ring despawn (and any other removal) of a crocodile mid-drama: every
 * still-STRUGGLING crocodile victim that no live lunge holds any more is freed
 * ALIVE — the absent ambusher can never complete the kill, so the countdown
 * must not run on into a sink with no crocodile there (the reported picture).
 * A body already sinking is left to sink: that is its legitimate end.
 * Returns the freed victims.
 */
export function releaseOrphanedCrocVictims<V extends CrocVictim>(
  animals: Iterable<V>,
  crocs: Iterable<{ dead?: boolean; lunge?: CrocLungeLike<V> }>,
): V[] {
  const live: CrocLungeLike<V>[] = []
  for (const c of crocs) if (!c.dead && c.lunge) live.push(c.lunge)
  const freed: V[] = []
  for (const a of animals) {
    if (a.dead || a.caughtBy !== 'crocodile' || a.caught === undefined) continue
    if (live.some((l) => lungeHolds(l, a))) continue
    releaseCrocVictim(a)
    freed.push(a)
  }
  return freed
}

/**
 * The dev-assert rule "shrinking carcass has no feeder": a dead body whose
 * dissolve timer went DOWN since the last check, that is not sinking, and that
 * no feeder (lion feed, vulture flock, ground scavenger, remnant flock)
 * registered as worked meanwhile, is shrinking with no visible actor.
 */
export function carcassShrinkUnfed(
  prevDissolve: number | undefined,
  dissolve: number | undefined,
  sinking: boolean,
  fed: boolean,
): boolean {
  if (sinking || fed) return false
  if (prevDissolve === undefined || dissolve === undefined) return false
  return dissolve < prevDissolve
}

/**
 * The visible sink (calibratable depth): a water death goes DOWN under the
 * sheet over its dissolve window rather than shrinking in place. Returns the
 * downward offset at the remaining `dissolve` of `total` seconds.
 */
export function sinkOffset(dissolve: number | undefined, total: number, depth: number): number {
  if (dissolve === undefined || total <= 0) return 0
  const left = Math.max(0, Math.min(1, dissolve / total))
  return (1 - left) * depth
}
