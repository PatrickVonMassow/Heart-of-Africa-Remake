import { describe, expect, it } from 'vitest'
import { CONCEPT_IDS, tonesOf } from './lexicon'
import { enumerateVocabularies, rollVocabulary, SHIPPED_VOCABULARY } from './vocabulary'

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
