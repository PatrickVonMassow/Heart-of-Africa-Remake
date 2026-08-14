// What the chief says when the artefact from the boulder is laid in his hands
// (docs/communication-poc-spec.md, work-order point 487).
//
// The hand-over is what solves the puzzle, and the chief acknowledges it IN HIS
// OWN TONGUE: two concepts, spoken like any other phrase in the village, with
// no translation anywhere. A player who learned the words reads them; a player
// who did not sees three runs of syllables and his own `???`. That asymmetry is
// the payoff of the whole slice, so nothing here may localize.
//
// Both concepts stand in the chief's own drum message. Nothing new is
// introduced at the moment of the solution.
//
// Pure data and pure logic — the sequences are never re-authored here, they come
// from the lexicon like every other utterance.

import { phraseOf, type ConceptId, type LectId, type Phrase } from './lexicon'

/**
 * "Rock — dig": the chief names the errand back to the traveller.
 */
export const CHIEF_ACKNOWLEDGE_CONCEPTS: readonly ConceptId[] = ['ROCK', 'DIG']

/** The acknowledgment's atoms in the given lect — the spoken phrase, unchanged. */
export function chiefAcknowledgePhrase(lect?: LectId): Phrase {
  return phraseOf(CHIEF_ACKNOWLEDGE_CONCEPTS, lect)
}
