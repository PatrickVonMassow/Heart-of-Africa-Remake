// What the use key (SPACE) means where the player stands (work-order point 691).
//
// A settlement offers SPACE several things at once: the door of a functional
// building, the utterance over a speaker's head, and — as the rebuild lands —
// a dig site, the chief, a form socket. Before this there were two independent
// keys for it, SPACE for the doors and a left click for the guess, and the
// player could not tell what either would do. There is now ONE candidate list:
// everything SPACE can mean is collected with its distance from the player and
// a reach of its own, and the NEAREST candidate still in its own reach wins.
//
// Pure logic — no scene, no store, no clock. The caller measures the distances
// on the ground plane, in place units, so the door and the voice are comparable
// at all; this only decides.
//
// A tie KEEPS the standing pick, exactly as the speaker choice already does
// (speechTarget.ts, point 588): two things a step apart must not swap the
// highlight between frames, so the hold is a hand's breadth wide rather than an
// exact comparison.

import { TARGET_HOLD } from '../../communication/speechTarget'

/** One thing SPACE could mean, and how far the player stands from it. */
export interface UseCandidate<T = unknown> {
  /** Identity across kinds — the key the hold is remembered by. */
  key: string
  /** Distance to the player on the ground plane, in place units. */
  distance: number
  /** How near the player must be for this candidate to be reachable at all. */
  range: number
  /** What the caller acts on once this candidate wins. */
  payload: T
}

/**
 * The candidate SPACE would act on, or null when nothing is in reach. `current`
 * is the key of the standing pick; it is kept while it stays within TARGET_HOLD
 * of the nearest rival, so the choice cannot flicker.
 */
export function pickUseCandidate<T>(
  candidates: readonly UseCandidate<T>[],
  current: string | null,
  hold: number = TARGET_HOLD,
): UseCandidate<T> | null {
  const inReach = candidates.filter((c) => Number.isFinite(c.distance) && c.distance <= c.range)
  if (inReach.length === 0) return null
  // Sorted by distance, ties broken by key: the FIRST pick of a frame is then
  // decided by the world and never by the order the candidates were collected in.
  const best = [...inReach].sort((a, b) => a.distance - b.distance || (a.key < b.key ? -1 : 1))[0]
  const held = current === null ? undefined : inReach.find((c) => c.key === current)
  if (held && held.distance <= best.distance + hold) return held
  return best
}
