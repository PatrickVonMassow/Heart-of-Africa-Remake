// What the use key at the chief's hut does (design.md §12, §13.4,
// docs/communication-poc-spec.md).
//
// There is no audience indoors. The first press at his door brings the chief
// OUT; from then on he stands in the open, at his drummer's side, and the press
// sends his message on the drums — or merely acknowledges the traveller, in a
// village that has nothing to send. Asking takes no precondition: the chief
// speaks from the first minute (point 689).
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

/** What the next press at the chief's hut door does. */
export type ChiefAction =
  /** He comes out of his hut and stands in the open. */
  | 'step-out'
  /** He calls his drummer and the message goes out (design.md §13.4). */
  | 'send-message'
  /** This chief has nothing to send; he only acknowledges the traveller. */
  | 'no-message'
  /** Not at a village chief at all. */
  | 'none'

/** What the use key at the chief's hut does NEXT, from the live game state. */
export function nextChiefAction(
  s: Pick<GameState, 'mode' | 'placeId' | 'chiefOutside'>,
): ChiefAction {
  if (s.mode !== 'place' || !s.placeId) return 'none'
  const place = placeById(s.placeId)
  if (place.kind !== 'village') return 'none'
  if (!s.chiefOutside[place.id]) return 'step-out'
  // Whether the traveller carries the find or not makes no difference here: the
  // find is given by using the item before him, never by this key.
  return place.id === DRUM_MESSAGE_VILLAGE ? 'send-message' : 'no-message'
}
