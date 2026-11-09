// The end of a predator kill on a young animal (design.md §19.8): the struggle
// countdown, the release of its parent, and the kill flock that finishes the
// remains. Pure — Wildlife.tsx drives these every frame, the Vitest drives the
// same functions in the same order.
import { killFlockMayDescend, vigilBlocksLanding } from './wildlifeBehavior'

/** One frame of a seized animal's struggle window: true on the frame the
 *  window runs out and the kill completes (the field is then cleared). */
export function stepCaught(a: { caught?: number }, dt: number): boolean {
  if (a.caught === undefined || a.caught <= 0) return false
  a.caught -= dt
  if (a.caught > 0) return false
  a.caught = undefined
  return true
}

/** The kill's own death (Wildlife takeAnimal): the body is the predator's
 *  (lionFed, no ground scavenger) and dissolves over `dissolveSeconds`. */
export function markKilled(a: { dead?: boolean; lionFed?: boolean; dissolve?: number }, dissolveSeconds: number): void {
  a.dead = true
  a.lionFed = true
  a.dissolve = dissolveSeconds
}

/** The family fields the kill resolution reads and writes. */
export interface KillFamilyMember<C = unknown> {
  x: number
  z: number
  dead?: boolean
  parent?: KillFamilyMember<C>
  child?: KillFamilyMember<C>
  vigil?: { x: number; z: number; carcass: C; time: number }
  bereaved?: number
}

/**
 * Release the parent of a young whose kill just completed (points 121/1213).
 * A parent within `tooLateDist` is taken alongside it ('taken' — the caller
 * kills it). Any other living parent is RELEASED: both links are cut, it walks
 * to the kill site for the vigil, and it stays `bereaved` for `bereavedSeconds`
 * — no adoption re-links a living young to it at the kill, so the dead young
 * is never seen "alive again" beside its parent (user report 25.09.2026).
 */
export function releaseBereavedParent<A extends KillFamilyMember<A>>(
  young: A,
  opts: { tooLateDist: number; bereavedSeconds: number; vigilAt: { x: number; z: number } },
): 'taken' | 'vigil' | null {
  const par = young.parent as A | undefined
  if (!par || par.dead) return null
  if (Math.hypot(par.x - young.x, par.z - young.z) < opts.tooLateDist) {
    par.child = undefined
    return 'taken'
  }
  par.vigil = { x: opts.vigilAt.x, z: opts.vigilAt.z, carcass: young, time: 0 }
  par.child = undefined
  par.bereaved = opts.bereavedSeconds
  young.parent = undefined
  return 'vigil'
}

/** The vigil follows the remains (point 121 (f)): every living keeper whose
 *  vigil anchors on the consumed victim is handed the scrap the predator left. */
export function handVigilToRemains<C>(
  lists: Iterable<readonly { dead?: boolean; vigil?: { carcass: C } }[]>,
  victim: C,
  remains: C,
): void {
  for (const list of lists) {
    for (const k of list) {
      if (!k.dead && k.vigil !== undefined && k.vigil.carcass === victim) k.vigil.carcass = remains
    }
  }
}

/** One frame of the kill flock on its remnant: only landed birds eat, and
 *  the scrap dissolves like a scavenged carcass. */
export function feedRemnant(remnant: { dissolve?: number }, dt: number, landed: boolean, dissolveSeconds: number): void {
  if (!landed) return
  if (remnant.dissolve === undefined) remnant.dissolve = dissolveSeconds
  remnant.dissolve -= dt
}

/** The remains the kill flock serves: the first hunt remnant still lying. */
export function killFlockRemnant<A extends { remnant?: boolean; dead?: boolean; gone?: boolean; dissolve?: number }>(
  lists: Iterable<readonly A[]>,
): A | null {
  for (const list of lists) {
    for (const a of list) {
      if (a.remnant && a.dead && !a.gone && (a.dissolve === undefined || a.dissolve > 0)) return a
    }
  }
  return null
}

/** May the kill flock land on its remnant this frame? Never while the
 *  predator guards it, never while a keeper stands vigil beside it. */
export function killFlockLands(
  predatorMode: string,
  predatorX: number,
  predatorZ: number,
  remnant: { x: number; z: number },
  nearestKeeperDist: number,
): boolean {
  return (
    killFlockMayDescend(predatorMode, predatorX, predatorZ, remnant.x, remnant.z) &&
    !vigilBlocksLanding(nearestKeeperDist)
  )
}

/** The carcass under a feeding predator (point 453): it shrinks as the meal
 *  goes on, but never below `floor` — the remnant's own fraction — so while
 *  the feeding pose lasts, something recognisable as prey lies under it. */
export function feedCarcassScale(eaten: number, floor: number): number {
  const e = Math.min(1, Math.max(0, eaten))
  return Math.max(floor, 1 - e * (1 - floor))
}

/** Does the feed on a herd victim end this frame (point 453)? The feeding
 *  state never outlives its carcass: it ends when the body has left its herd
 *  list (`listed` false, `gone`), when it has dissolved down to the remnant
 *  fraction (the remnant takes over at that size), or when the timer runs out. */
export function victimFeedEnds(
  v: { dead?: boolean; gone?: boolean; dissolve?: number },
  listed: boolean,
  timer: number,
  dissolveSeconds: number,
  remnantFraction: number,
): boolean {
  if (timer <= 0 || !listed || v.gone) return true
  if (!v.dead) return false
  return (v.dissolve ?? 0) <= dissolveSeconds * remnantFraction
}

/** May a remnant join a herd list of this length (point 453)? Only when the
 *  herd mesh will draw it: the draw clamps at `capacity`, and a scrap past it
 *  would hold the kill flock over nothing visible. */
export function remnantDrawable(listLength: number, capacity: number): boolean {
  return listLength < capacity
}

/** The index of the list holding `a`, or -1 when no list holds it. */
export function listIndexOf<A>(lists: readonly (readonly A[])[], a: A): number {
  for (let i = 0; i < lists.length; i++) if (lists[i].includes(a)) return i
  return -1
}
