import { describe, expect, it } from 'vitest'
import { CONCEPT_IDS, highCount, tonesOf } from './lexicon'
import {
  ascendingSequence, enumerateVocabularies, hasIconicDirections, hasNoAdjacentMirrors,
  rollVocabulary, SHIPPED_VOCABULARY, wordSequences,
} from './vocabulary'

// Literal rows in RIVER / UPSTREAM / DOWNSTREAM / ROCK / DIG / CHIEF order.
// Changing either rule must produce a reviewable table diff.
const EXPECTED = [
  'ba-BA-ba-BA | ba-ba-BA-BA | BA-BA-ba-ba | ba-BA-BA-ba | BA-ba-ba-BA | BA-ba-BA-ba',
  'ba-BA-ba-BA | ba-ba-BA-BA | BA-BA-ba-ba | ba-BA-BA-ba | BA-ba-BA-ba | BA-ba-ba-BA',
  'ba-BA-ba-BA | ba-ba-BA-BA | BA-BA-ba-ba | BA-ba-ba-BA | ba-BA-BA-ba | BA-ba-BA-ba',
  'ba-BA-ba-BA | ba-ba-BA-BA | BA-BA-ba-ba | BA-ba-ba-BA | BA-ba-BA-ba | ba-BA-BA-ba',
  'ba-BA-ba-BA | ba-ba-BA-BA | BA-BA-ba-ba | BA-ba-BA-ba | ba-BA-BA-ba | BA-ba-ba-BA',
  'ba-BA-ba-BA | ba-ba-BA-BA | BA-BA-ba-ba | BA-ba-BA-ba | BA-ba-ba-BA | ba-BA-BA-ba',
  'ba-BA-BA-ba | ba-ba-BA-BA | BA-BA-ba-ba | ba-BA-ba-BA | BA-ba-ba-BA | BA-ba-BA-ba',
  'ba-BA-BA-ba | ba-ba-BA-BA | BA-BA-ba-ba | BA-ba-ba-BA | ba-BA-ba-BA | BA-ba-BA-ba',
  'ba-BA-BA-ba | ba-ba-BA-BA | BA-BA-ba-ba | BA-ba-ba-BA | BA-ba-BA-ba | ba-BA-ba-BA',
  'ba-BA-BA-ba | ba-ba-BA-BA | BA-BA-ba-ba | BA-ba-BA-ba | BA-ba-ba-BA | ba-BA-ba-BA',
  'BA-ba-ba-BA | ba-ba-BA-BA | BA-BA-ba-ba | ba-BA-ba-BA | ba-BA-BA-ba | BA-ba-BA-ba',
  'BA-ba-ba-BA | ba-ba-BA-BA | BA-BA-ba-ba | ba-BA-BA-ba | ba-BA-ba-BA | BA-ba-BA-ba',
  'BA-ba-ba-BA | ba-ba-BA-BA | BA-BA-ba-ba | ba-BA-BA-ba | BA-ba-BA-ba | ba-BA-ba-BA',
  'BA-ba-ba-BA | ba-ba-BA-BA | BA-BA-ba-ba | BA-ba-BA-ba | ba-BA-BA-ba | ba-BA-ba-BA',
  'BA-ba-BA-ba | ba-ba-BA-BA | BA-BA-ba-ba | ba-BA-ba-BA | ba-BA-BA-ba | BA-ba-ba-BA',
  'BA-ba-BA-ba | ba-ba-BA-BA | BA-BA-ba-ba | ba-BA-ba-BA | BA-ba-ba-BA | ba-BA-BA-ba',
  'BA-ba-BA-ba | ba-ba-BA-BA | BA-BA-ba-ba | ba-BA-BA-ba | ba-BA-ba-BA | BA-ba-ba-BA',
  'BA-ba-BA-ba | ba-ba-BA-BA | BA-BA-ba-ba | ba-BA-BA-ba | BA-ba-ba-BA | ba-BA-ba-BA',
  'BA-ba-BA-ba | ba-ba-BA-BA | BA-BA-ba-ba | BA-ba-ba-BA | ba-BA-ba-BA | ba-BA-BA-ba',
  'BA-ba-BA-ba | ba-ba-BA-BA | BA-BA-ba-ba | BA-ba-ba-BA | ba-BA-BA-ba | ba-BA-ba-BA',
]
const row = (v: ReturnType<typeof rollVocabulary>) => CONCEPT_IDS.map((c) => v[c]).join(' | ')

describe('the run vocabulary', () => {
  it('enumerates exactly the pinned 20 assignments and includes the shipped mapping', () => {
    const actual = enumerateVocabularies().map(row)
    expect(actual).toEqual(EXPECTED)
    expect(new Set(actual).size).toBe(20)
    expect(actual).toContain(row(SHIPPED_VOCABULARY))
  })

  it('keeps iconic directions and no eight-strike palindrome across any errand pause', () => {
    let internalMirrors = 0
    for (const v of enumerateVocabularies()) {
      expect(v.UPSTREAM).toBe('ba-ba-BA-BA')
      expect(v.DOWNSTREAM).toBe('BA-BA-ba-ba')
      expect(tonesOf(v.ROCK)).not.toEqual([...tonesOf(v.DIG)].reverse())
      const errand = [v.RIVER, v.UPSTREAM, v.ROCK, v.DIG].map(tonesOf)
      for (let i = 1; i < errand.length; i++) {
        const eight = [...errand[i - 1], ...errand[i]]
        expect(eight).not.toEqual([...eight].reverse())
      }
      if ([v.ROCK, v.DIG].some((word) => word === v.RIVER.split('-').reverse().join('-'))) internalMirrors++
    }
    expect(internalMirrors).toBe(8)
  })

  it('reproducibly reaches every mapping from a run seed', () => {
    const reached = new Set<string>()
    for (let seed = 0; seed < 1000; seed++) {
      const vocabulary = rollVocabulary(seed)
      expect(rollVocabulary(seed)).toEqual(vocabulary)
      reached.add(row(vocabulary))
    }
    expect([...reached].sort()).toEqual([...EXPECTED].sort())
  })
})

// The syllable count is meant to be raisable later, to fit more concepts into
// the language. Nothing above proves that: every row is four syllables wide.
// These cases run the same derivation and the same two rules at FIVE.
describe('the vocabulary rules at another syllable length', () => {
  it('derives the word inventory from the length instead of a table', () => {
    expect(wordSequences(4)).toHaveLength(6)
    expect(wordSequences(5)).toHaveLength(15)
    expect(wordSequences(6)).toHaveLength(30)
    for (const sequence of wordSequences(5)) {
      expect(sequence).toHaveLength(5)
      expect(highCount(sequence) % 2).toBe(0)
      expect(highCount(sequence)).toBeGreaterThan(0)
    }
  })

  it('still names one rising and one falling word at five syllables', () => {
    expect(ascendingSequence(4)).toEqual(['low', 'low', 'high', 'high'])
    expect(ascendingSequence(5)).toEqual(['low', 'low', 'low', 'high', 'high'])
    const falling = [...ascendingSequence(5)].reverse()
    expect(falling).toEqual(['high', 'high', 'low', 'low', 'low'])
  })

  it('enumerates five-syllable vocabularies that obey both rules', () => {
    const five = enumerateVocabularies(5)
    expect(five.length).toBeGreaterThan(20)
    for (const vocabulary of five) {
      expect(hasIconicDirections(vocabulary, 5)).toBe(true)
      expect(hasNoAdjacentMirrors(vocabulary)).toBe(true)
      for (const concept of CONCEPT_IDS) expect(tonesOf(vocabulary[concept])).toHaveLength(5)
      expect(new Set(CONCEPT_IDS.map((c) => vocabulary[c])).size).toBe(CONCEPT_IDS.length)
    }
  })
})
