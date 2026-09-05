// What the use key at the chief's hut does (design.md §12, §13.4,
// docs/communication-poc-spec.md).
//
// There is no audience indoors. The first press at his door brings the chief
// OUT; from then on he stands in the open, at his drummer's side, and every
// press decides between the things he has to give: the message on the drums,
// and the answer to what the traveller dug up at the boulder.
//
// Pure logic, so the whole decision is unit-testable without a scene: the
// caller (PlaceScene) only executes what this returns.

import { canAskForDrumMessage, DRUM_MESSAGE_VILLAGE, type GameState } from '../../state/store'
import { placeById } from '../../world/geo'

/** What the next press at the chief's hut door does. */
export type ChiefAction =
  /** He comes out of his hut and stands in the open. */
  | 'step-out'
  /** The find from the boulder is laid in his hands (point 487). */
  | 'hand-over'
  /** He calls his drummer and the message goes out (design.md §13.4). */
  | 'send-message'
  /** He has a message but withholds it from this traveller. */
  | 'withhold-message'
  /** This chief has nothing to send; he only acknowledges the traveller. */
  | 'no-message'
  /** Not at a village chief at all. */
  | 'none'

/** What the use key at the chief's hut does NEXT, from the live game state. */
export function nextChiefAction(
  s: Pick<GameState, 'mode' | 'placeId' | 'chiefOutside' | 'rockArtefact' | 'reveredGiftGiven' | 'goodwill'>,
): ChiefAction {
  if (s.mode !== 'place' || !s.placeId) return 'none'
  const place = placeById(s.placeId)
  if (place.kind !== 'village') return 'none'
  if (!s.chiefOutside[place.id]) return 'step-out'
  // The errand's end outranks the errand: a traveller holding the find has
  // come back for the answer, not to hear the message again.
  if (place.id === DRUM_MESSAGE_VILLAGE && s.rockArtefact === 'carried') return 'hand-over'
  if (place.id !== DRUM_MESSAGE_VILLAGE) return 'no-message'
  return canAskForDrumMessage(s, place.id) ? 'send-message' : 'withhold-message'
}
