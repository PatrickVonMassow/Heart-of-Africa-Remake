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
