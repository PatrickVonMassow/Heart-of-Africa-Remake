// What the use key does at the chief's hut, at the chief himself and at his
// drummer (design.md §12, §13.4, docs/communication-poc-spec.md).
//
// The chief does not speak at his own door. The first press at the hut sends
// him OUT and ACROSS to the drummer's side; from there the press at either man
// sends his message on the drums, repeats it while he stands, and calls him
// back while he walks home. Used while he is outside, the hut itself does
// nothing at all. And while he is inside it, the press at the drummer belongs
// to the drummer: he points at the hut and names the man with the sixth word of
// the language.
//
// What the key no longer does is hand anything over. The find from the boulder
// is an inventory item and is given by USING it before him (design.md §6), so
// the key and the give no longer share one press and the game no longer picks
// between them.
//
// Pure logic, so the whole decision is unit-testable without a scene: the
// caller (PlaceScene) only executes what this returns.

import { DRUM_MESSAGE_VILLAGE, type GameState } from '../../state/store'
import { placeById } from '../../world/geo'
import type { ChiefPhase } from './chiefWalk'

/** The three things in a settlement this key can be pressed at. */
export type ChiefTarget = 'hut' | 'chief' | 'drummer'

/** What the next press does. */
export type ChiefAction =
  /** He leaves his hut and walks over to his drummer. */
  | 'step-out'
  /** The drums beat his message — the first time and every repeat. */
  | 'send-message'
  /** He is on his way home and turns round; the drums follow on arrival. */
  | 'call-back'
  /** The drummer points at the hut and says CHIEF. */
  | 'name-chief'
  /** This chief has nothing to send; he only acknowledges the traveller. */
  | 'no-message'
  /** Nothing happens here, now. */
  | 'none'

/**
 * What the use key does at `target`, from the live game state and the phase of
 * the chief's walk. `walking-out` answers nothing anywhere: he is already
 * coming, and a key that hurried him would be a second way to do the one thing
 * the hut key just did.
 */
export function nextChiefAction(
  target: ChiefTarget,
  s: Pick<GameState, 'mode' | 'placeId'>,
  phase: ChiefPhase,
): ChiefAction {
  if (s.mode !== 'place' || !s.placeId) return 'none'
  const place = placeById(s.placeId)
  if (place.kind !== 'village') return 'none'
  // Whether the traveller carries the find or not makes no difference here: the
  // find is given by using the item before him, never by this key.
  const message = place.id === DRUM_MESSAGE_VILLAGE ? 'send-message' : 'no-message'
  if (target === 'hut') return phase === 'in-hut' ? 'step-out' : 'none'
  switch (phase) {
    case 'at-drummer':
      return message
    case 'walking-back':
      return 'call-back'
    case 'in-hut':
      // The chief is not there to be spoken to; only his drummer is.
      return target === 'drummer' ? 'name-chief' : 'none'
    default:
      return 'none'
  }
}
