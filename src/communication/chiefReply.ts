// What the chief pays for the thing dug up at the boulder
// (docs/communication-poc-spec.md).
//
// The hand-over is answered IN HIS OWN TONGUE: two concepts, spoken like any
// other phrase in the village, with no translation anywhere. A player who
// learned the words reads them; a player who did not sees two runs of syllables
// and his own `???`. That asymmetry is the payoff of the whole slice, so nothing
// here may localize.
//
// The phrase says WHERE and no more — the river, and with the current. What to
// do down there is carried by the mould he hands over wordlessly, not by a
// third word: the acknowledgment `ROCK · DIG` of the earlier design is gone.
// Nothing may be read into the ABSENCE of a digging word either; silence
// teaches nothing, so no meaning is assigned to it anywhere.
//
// `DOWNSTREAM` is the one word of the lexicon the errand had never used. It is
// the tonal mirror of `UPSTREAM`, which the drummed message spent, so the pair
// the player was meant to notice is what the reward turns on.
//
// Pure data and pure logic — the sequences are never re-authored here, they come
// from the lexicon like every other utterance.

import { phraseOf, type ConceptId, type LectId, type Phrase } from './lexicon'

/**
 * "River — with the current": the chief names the direction and nothing else.
 */
export const CHIEF_REWARD_CONCEPTS: readonly ConceptId[] = ['RIVER', 'DOWNSTREAM']

/** The reward's atoms in the given lect — the spoken phrase, unchanged. */
export function chiefRewardPhrase(lect?: LectId): Phrase {
  return phraseOf(CHIEF_REWARD_CONCEPTS, lect)
}
