// Pure vocabulary construction. A run saves the value, never its position in
// this enumeration: changing enumeration order must not reinterpret old notes.
import {
  DEFAULT_LECT, SEQUENCE_LENGTH, highCount, isWellFormed, reversed, speak,
  type ToneSequence, type Vocabulary,
} from './lexicon'
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

/**
 * Rule (a) spends the rising/falling reversal pair on the directions.
 * Rule (b) rejects ROCK/DIG reversals: their adjacency in the errand would
 * make an eight-strike palindrome across the constant pause.
 * A second, meaningless mirror pair among RIVER/ROCK/DIG/CHIEF is unavoidable
 * and accepted. In 8 of the 20 results both members remain in the errand,
 * but never adjacent. This rule does not remove every spurious mirror.
 */
export function enumerateVocabularies(): Vocabulary[] {
  const sequences: ToneSequence[] = []
  for (let mask = 0; mask < 1 << SEQUENCE_LENGTH; mask++) {
    const sequence: ToneSequence = Array.from({ length: SEQUENCE_LENGTH }, (_, i) =>
      mask & (1 << (SEQUENCE_LENGTH - 1 - i)) ? 'high' : 'low',
    )
    if (isWellFormed(sequence) && highCount(sequence) > 0 && highCount(sequence) < SEQUENCE_LENGTH) {
      sequences.push(sequence)
    }
  }
  const upstream = speak(['low', 'low', 'high', 'high'], DEFAULT_LECT)
  const downstream = speak(['high', 'high', 'low', 'low'], DEFAULT_LECT)
  const remaining = sequences.filter((s) => {
    const word = speak(s, DEFAULT_LECT)
    return word !== upstream && word !== downstream
  })
  const result: Vocabulary[] = []
  for (const river of remaining) {
    for (const rock of remaining.filter((s) => s !== river)) {
      for (const dig of remaining.filter((s) => s !== river && s !== rock)) {
        if (speak(reversed(rock), DEFAULT_LECT) === speak(dig, DEFAULT_LECT)) continue
        const chief = remaining.find((s) => s !== river && s !== rock && s !== dig)!
        result.push({
          RIVER: speak(river, DEFAULT_LECT), UPSTREAM: upstream, DOWNSTREAM: downstream,
          ROCK: speak(rock, DEFAULT_LECT), DIG: speak(dig, DEFAULT_LECT), CHIEF: speak(chief, DEFAULT_LECT),
        })
      }
    }
  }
  return result
}

/** An independent seed stream, following the run's knowing-village idiom. */
export function rollVocabulary(seed: number): Vocabulary {
  const rand = mulberry32((seed ^ 0x766f6361) >>> 0)
  const choices = enumerateVocabularies()
  return choices[Math.floor(rand() * choices.length)]
}
