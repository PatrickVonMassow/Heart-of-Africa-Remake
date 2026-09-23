// Pure vocabulary construction. A run saves the value, never its position in
// this enumeration: changing enumeration order must not reinterpret old notes.
//
// LENGTH-GENERIC BY CONSTRUCTION. Nothing here writes a four-syllable literal:
// the word inventory is derived from SEQUENCE_LENGTH and the two rules are
// predicates over a vocabulary. Raising the syllable count — to fit more
// concepts into the language — is a change of that constant plus a new pinned
// table, not a redesign of the roll.
import {
  DEFAULT_LECT, SEQUENCE_LENGTH, CONCEPT_IDS, highCount, reversed, speak, tonesOf,
  wellFormedSequences,
  type ConceptId, type ToneSequence, type Vocabulary,
} from './lexicon'
import { CHIEF_MESSAGE_CONCEPTS } from './drumMessage'
import { mulberry32 } from '../world/noise'

/** The original mapping, used only to preserve saves made before the roll. */
export const SHIPPED_VOCABULARY: Vocabulary = {
  RIVER: 'ba-BA-ba-BA',
  UPSTREAM: 'ba-ba-BA-BA',
  DOWNSTREAM: 'BA-BA-ba-ba',
  ROCK: 'BA-ba-ba-BA',
  DIG: 'ba-BA-BA-ba',
  CHIEF: 'BA-ba-BA-ba',
}

/** The concepts whose word the directions rule does not already fix. */
const FREE_CONCEPTS: readonly ConceptId[] = CONCEPT_IDS.filter(
  (concept) => concept !== 'UPSTREAM' && concept !== 'DOWNSTREAM',
)

/**
 * The well-formed sequences that are WORDS: both tones present. Six of them at
 * four syllables, fifteen at five, thirty at six.
 */
export function wordSequences(length: number = SEQUENCE_LENGTH): ToneSequence[] {
  return wellFormedSequences(length).filter((s) => highCount(s) > 0 && highCount(s) < length)
}

/**
 * The RISING word: every low, then every high. At four syllables exactly one
 * such word exists; at five and six several do, and the one closest to an even
 * split is taken (ties to the fewer highs) — the most hearable rise the length
 * allows. Its reverse is the falling word.
 */
export function ascendingSequence(length: number = SEQUENCE_LENGTH): ToneSequence {
  const sorted = wordSequences(length).filter((s) => s.indexOf('low', s.indexOf('high')) < 0)
  return sorted.reduce((best, s) => {
    const d = (n: ToneSequence) => Math.abs(highCount(n) - length / 2)
    if (d(s) < d(best)) return s
    return d(s) === d(best) && highCount(s) < highCount(best) ? s : best
  })
}

/**
 * RULE (a), ICONIC DIRECTIONS: UPSTREAM is the rising word and DOWNSTREAM its
 * exact reverse. The river visibly flows and the bank game teaches the pair
 * against the current, so the tone line rises against it and falls with it.
 */
export function hasIconicDirections(
  vocabulary: Vocabulary,
  length: number = SEQUENCE_LENGTH,
): boolean {
  const rising = ascendingSequence(length)
  return (
    speak(rising, DEFAULT_LECT) === vocabulary.UPSTREAM &&
    speak(reversed(rising), DEFAULT_LECT) === vocabulary.DOWNSTREAM
  )
}

/**
 * RULE (b), NO MIRROR ACROSS A PAUSE: two concepts that stand ADJACENT in the
 * errand must not be tonal mirrors of each other, because the pair would be
 * heard as one palindrome across the single constant pause — an audible
 * symmetry the game attaches no meaning to, inside the one message the player
 * must decode. At today's errand (RIVER-UPSTREAM-ROCK-DIG) the rule bites on
 * ROCK and DIG; that is the case it produces, not the rule itself.
 *
 * WHAT IT DOES NOT DO: the directions spend one whole reversal pair, so a
 * second, meaningless mirror pair always remains among the free concepts. That
 * is unavoidable and accepted (user 21.09.2026); in 8 of the 20 four-syllable
 * results both its members still sit inside the errand, only never adjacently.
 */
export function hasNoAdjacentMirrors(
  vocabulary: Vocabulary,
  errand: readonly ConceptId[] = CHIEF_MESSAGE_CONCEPTS,
): boolean {
  for (let i = 1; i < errand.length; i++) {
    const before = tonesOf(vocabulary[errand[i - 1]])
    const after = tonesOf(vocabulary[errand[i]])
    if (speak(reversed(before), DEFAULT_LECT) === speak(after, DEFAULT_LECT)) return false
  }
  return true
}

/**
 * Every vocabulary both rules allow, in a stable order. COUNTED FOR FOUR
 * SYLLABLES AND SIX CONCEPTS: 96 assignments keep the directions mirrored,
 * rule (a) cuts them to 24 and rule (b) to 20. Those counts are derived from
 * this length and this concept list; another length gives other numbers.
 */
export function enumerateVocabularies(
  length: number = SEQUENCE_LENGTH,
  errand: readonly ConceptId[] = CHIEF_MESSAGE_CONCEPTS,
): Vocabulary[] {
  const rising = ascendingSequence(length)
  const upstream = speak(rising, DEFAULT_LECT)
  const downstream = speak(reversed(rising), DEFAULT_LECT)
  const free = wordSequences(length)
    .map((s) => speak(s, DEFAULT_LECT))
    .filter((word) => word !== upstream && word !== downstream)

  const result: Vocabulary[] = []
  const assigned: Partial<Record<ConceptId, string>> = { UPSTREAM: upstream, DOWNSTREAM: downstream }
  const walk = (index: number, taken: readonly string[]): void => {
    if (index === FREE_CONCEPTS.length) {
      const vocabulary = { ...assigned } as Vocabulary
      if (hasNoAdjacentMirrors(vocabulary, errand)) result.push(vocabulary)
      return
    }
    for (const word of free) {
      if (taken.includes(word)) continue
      assigned[FREE_CONCEPTS[index]] = word
      walk(index + 1, [...taken, word])
    }
    delete assigned[FREE_CONCEPTS[index]]
  }
  walk(0, [])
  return result
}

/** An independent seed stream, following the run's knowing-village idiom. */
export function rollVocabulary(seed: number): Vocabulary {
  const rand = mulberry32((seed ^ 0x766f6361) >>> 0)
  const choices = enumerateVocabularies()
  return choices[Math.floor(rand() * choices.length)]
}
