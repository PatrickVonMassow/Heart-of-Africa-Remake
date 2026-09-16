// What the settlement's two action keys mean where the player stands
// (work-order points 691/1139).
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

/** The use key: enter a building, call the chief (design.md §17.5). */
export const USE_KEY_CODE = 'Space'
/** The guess key: place a reading for the targeted word (design.md §13.4). */
export const GUESS_KEY_CODE = 'KeyE'

/** What a settlement candidate IS — the kinds the two keys are split along. */
export type UseKind = 'interactive' | 'chief' | 'speech'

/**
 * Which of the two keys a candidate belongs to (work-order point 1139). SPACE
 * and the guess shared one candidate list until the chief's hut and a word
 * spoken beside it started taking the key from each other by a step's distance:
 * at the hut the player got the word, or the word's speaker got the hut. They
 * are two keys now, so both offers can stand at once, and neither can lose.
 */
export function keyForUseKind(kind: UseKind): 'use' | 'guess' {
  return kind === 'speech' ? 'guess' : 'use'
}

/** The candidates one of the two keys acts on, in the order they came in. */
export function candidatesForKey<T extends { kind: UseKind }>(
  candidates: readonly UseCandidate<T>[],
  key: 'use' | 'guess',
): UseCandidate<T>[] {
  return candidates.filter((c) => keyForUseKind(c.payload.kind) === key)
}

/**
 * The candidate a PRESS of one of the two keys acts on (work-order point 1139),
 * or null when that key has nothing where the player stands. This is the whole
 * arbitration in one place, so the frame's hint, the press and the test all read
 * the same rule:
 *
 * - the use key takes the doors and the chief, and keeps its standing pick;
 * - the guess key takes the spoken word — the speech channel offers at most one
 *   and picks it itself, so there is no tie to hold here;
 * - a press from the GAMEPAD's A button takes the WHOLE list (design.md §17.5):
 *   its face buttons are all taken, so the guess has no button of its own there
 *   and the old nearest-wins arbitration survives on the pad alone.
 */
export function pickForKeyPress<T extends { kind: UseKind }>(
  candidates: readonly UseCandidate<T>[],
  key: 'use' | 'guess',
  options: { pad?: boolean; held?: string | null } = {},
): UseCandidate<T> | null {
  if (key === 'guess') return pickUseCandidate(candidatesForKey(candidates, 'guess'), null)
  const forPress = options.pad ? candidates : candidatesForKey(candidates, 'use')
  return pickUseCandidate(forPress, options.held ?? null)
}

/** One thing a key could mean, and how far the player stands from it. */
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
 * The candidate a key would act on, or null when nothing is in reach. `current`
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
