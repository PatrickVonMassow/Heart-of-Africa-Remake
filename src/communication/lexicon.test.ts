// The tonal lexicon (docs/communication-poc-spec.md): completeness of the
// registry, well-formedness and distance of the sequences, the mirror pairs,
// and the one sort order the journal uses. Pure logic — no browser.
import { SHIPPED_VOCABULARY } from './vocabulary'
import { describe, expect, it } from 'vitest'
import {
  CONCEPT_IDS,
  DEFAULT_LECT,
  LECTS,
  MIRROR_PAIRS,
  SEQUENCE_LENGTH,
  compareUtterances,
  conceptOf,
  highCount,
  isWellFormed,
  lectOf,
  phraseOf,
  reversed,
  sequenceOf,
  speak,
  toneDistance,
  toneOfSyllable,
  tonesOf,
  utteranceOf,
  type ConceptId,
  type LectId,
  type ToneSequence,
} from './lexicon'

const LECT_IDS = Object.keys(LECTS) as LectId[]

/** The table of docs/communication-poc-spec.md, transcribed independently. */
const SPEC_TABLE: Record<ConceptId, string> = {
  RIVER: 'ba-BA-ba-BA',
  UPSTREAM: 'ba-ba-BA-BA',
  DOWNSTREAM: 'BA-BA-ba-ba',
  ROCK: 'BA-ba-ba-BA',
  DIG: 'ba-BA-BA-ba',
  CHIEF: 'BA-ba-BA-ba',
}

const key = (s: ToneSequence) => s.join(',')

describe('the registry is complete', () => {
  it('holds exactly the six concepts of the slice', () => {
    expect(CONCEPT_IDS).toHaveLength(6)
    expect([...CONCEPT_IDS].sort()).toEqual(
      ['CHIEF', 'DIG', 'DOWNSTREAM', 'RIVER', 'ROCK', 'UPSTREAM'],
    )
  })

  it('gives every concept a sequence in the shipped vocabulary', () => {
    for (const concept of CONCEPT_IDS) {
      expect(sequenceOf(concept, SHIPPED_VOCABULARY), concept).toHaveLength(SEQUENCE_LENGTH)
    }
    expect(Object.keys(SHIPPED_VOCABULARY).sort()).toEqual([...CONCEPT_IDS].sort())
  })

  it('speaks the table of the spec, syllable for syllable', () => {
    for (const concept of CONCEPT_IDS) {
      expect(utteranceOf(concept, SHIPPED_VOCABULARY), concept).toBe(SPEC_TABLE[concept])
    }
  })

  it('resolves a spoken utterance back to its concept, and a non-word to null', () => {
    for (const concept of CONCEPT_IDS) expect(conceptOf(utteranceOf(concept, SHIPPED_VOCABULARY), SHIPPED_VOCABULARY)).toBe(concept)
    expect(conceptOf('BA-ba-BA-ba', SHIPPED_VOCABULARY)).toBe('CHIEF') // the last spare sequence, spoken now
    expect(conceptOf('BA-ba-BA', SHIPPED_VOCABULARY)).toBeNull() // too short
    expect(conceptOf('', SHIPPED_VOCABULARY)).toBeNull()
  })

  it('keeps the lects distinguishable: lower-case low, upper-case high, no shared pair', () => {
    const pairs = new Set<string>()
    for (const id of LECT_IDS) {
      const lect = lectOf(id)
      expect(lect.id).toBe(id)
      expect(lect.low).toBe(lect.low.toLowerCase())
      expect(lect.high).toBe(lect.high.toUpperCase())
      expect(toneOfSyllable(lect.low)).toBe('low')
      expect(toneOfSyllable(lect.high)).toBe('high')
      expect(pairs.has(`${lect.low}/${lect.high}`)).toBe(false)
      pairs.add(`${lect.low}/${lect.high}`)
    }
    expect(lectOf(DEFAULT_LECT).id).toBe(DEFAULT_LECT)
  })
})

describe('the sequences are hearable', () => {
  it('are four syllables with an even number of highs', () => {
    for (const concept of CONCEPT_IDS) {
      const s = sequenceOf(concept, SHIPPED_VOCABULARY)
      expect(isWellFormed(s), concept).toBe(true)
      expect(highCount(s) % 2, concept).toBe(0)
    }
  })

  it('rejects the malformed shapes', () => {
    expect(isWellFormed(['high', 'high', 'low'])).toBe(false) // wrong length
    expect(isWellFormed(['low', 'low', 'low', 'low'])).toBe(true) // even weight zero
    expect(isWellFormed(['high', 'high', 'high', 'high'])).toBe(true) // even weight four
    expect(isWellFormed(['high', 'low', 'low', 'low'])).toBe(false) // odd weight
  })

  it('carry at least one syllable of each tone — no word is four identical beats', () => {
    for (const concept of CONCEPT_IDS) {
      const s = sequenceOf(concept, SHIPPED_VOCABULARY)
      expect(highCount(s), concept).toBeGreaterThan(0)
      expect(highCount(s), concept).toBeLessThan(SEQUENCE_LENGTH)
    }
    // …and the two single-tone sequences are held in reserve rather than spoken.
    const reserved = lectOf(DEFAULT_LECT).reserved.map(key)
    expect(reserved).toContain(key(['low', 'low', 'low', 'low']))
    expect(reserved).toContain(key(['high', 'high', 'high', 'high']))
  })

  it('are unique', () => {
    const seen = new Set(CONCEPT_IDS.map((c) => key(sequenceOf(c, SHIPPED_VOCABULARY))))
    expect(seen.size).toBe(CONCEPT_IDS.length)
  })

  it('differ pairwise in at least two syllables', () => {
    for (const a of CONCEPT_IDS) {
      for (const b of CONCEPT_IDS) {
        if (a === b) continue
        expect(toneDistance(sequenceOf(a, SHIPPED_VOCABULARY), sequenceOf(b, SHIPPED_VOCABULARY)), `${a}/${b}`).toBeGreaterThanOrEqual(2)
      }
    }
  })

  it('turn no misheard beat into another concept — only into a non-word', () => {
    for (const concept of CONCEPT_IDS) {
      const s = sequenceOf(concept, SHIPPED_VOCABULARY)
      for (let i = 0; i < s.length; i++) {
        const misheard = [...s]
        misheard[i] = s[i] === 'high' ? 'low' : 'high'
        expect(conceptOf(speak(misheard, DEFAULT_LECT), SHIPPED_VOCABULARY), `${concept} beat ${i}`).toBeNull()
      }
    }
  })

  it('counts a dropped beat as a difference in every position past the end', () => {
    expect(toneDistance(sequenceOf('RIVER', SHIPPED_VOCABULARY), sequenceOf('RIVER', SHIPPED_VOCABULARY).slice(0, 3))).toBe(1)
    expect(toneDistance([], sequenceOf('RIVER', SHIPPED_VOCABULARY))).toBe(SEQUENCE_LENGTH)
  })

  it('reserves two unused sequences, and together with them exhausts the space', () => {
    const reserved = lectOf(DEFAULT_LECT).reserved
    expect(reserved).toHaveLength(2)
    const used = new Set(CONCEPT_IDS.map((c) => key(sequenceOf(c, SHIPPED_VOCABULARY))))
    for (const s of reserved) {
      expect(isWellFormed(s), key(s)).toBe(true)
      expect(used.has(key(s)), key(s)).toBe(false)
    }
    // Every well-formed four-syllable sequence is either used or reserved.
    const all: string[] = []
    for (let mask = 0; mask < 1 << SEQUENCE_LENGTH; mask++) {
      const s: ToneSequence = Array.from({ length: SEQUENCE_LENGTH }, (_, i) =>
        mask & (1 << i) ? 'high' : 'low',
      )
      if (isWellFormed(s)) all.push(key(s))
    }
    expect(all).toHaveLength(8)
    const covered = new Set([...used, ...reserved.map(key)])
    expect(covered.size).toBe(8)
    for (const s of all) expect(covered.has(s), s).toBe(true)
  })
})

describe('the opposite pairs mirror each other', () => {
  it('reverses the direction pair exactly', () => {
    for (const [a, b] of MIRROR_PAIRS) {
      expect(reversed(sequenceOf(a, SHIPPED_VOCABULARY)), `${a}/${b}`).toEqual(sequenceOf(b, SHIPPED_VOCABULARY))
      expect(reversed(sequenceOf(b, SHIPPED_VOCABULARY)), `${b}/${a}`).toEqual(sequenceOf(a, SHIPPED_VOCABULARY))
    }
  })

  it('contains only upstream/downstream', () => {
    expect(MIRROR_PAIRS).toEqual([['UPSTREAM', 'DOWNSTREAM']])
  })

  // The documents describe the SHAPE of the language, and that shape is
  // checkable: the spec claimed three mirror pairs including ROCK/DIG, when
  // ROCK and DIG are each their own mirror and no pair at all. Pinned here so
  // the next such sentence is caught by a test rather than by a reader.
  it('holds two mirror pairs and two sequences that mirror themselves', () => {
    const mirrorOf = (c: ConceptId) => key(reversed(sequenceOf(c, SHIPPED_VOCABULARY)))
    const mirrored = CONCEPT_IDS.filter((c) =>
      CONCEPT_IDS.some((o) => o !== c && key(sequenceOf(o, SHIPPED_VOCABULARY)) === mirrorOf(c)),
    )
    const selfMirrored = CONCEPT_IDS.filter((c) => key(sequenceOf(c, SHIPPED_VOCABULARY)) === mirrorOf(c))
    expect([...mirrored].sort()).toEqual(['CHIEF', 'DOWNSTREAM', 'RIVER', 'UPSTREAM'])
    expect([...selfMirrored].sort()).toEqual(['DIG', 'ROCK'])
  })
})

describe('utterances and phrases', () => {
  it('reads the tones back off a written utterance', () => {
    expect(tonesOf('ba-BA-BA-ba')).toEqual(sequenceOf('DIG', SHIPPED_VOCABULARY))
    expect(tonesOf('')).toEqual([])
  })

  it('a phrase is the ordered list of its atoms', () => {
    expect(phraseOf(['ROCK', 'DIG'], SHIPPED_VOCABULARY)).toEqual([utteranceOf('ROCK', SHIPPED_VOCABULARY), utteranceOf('DIG', SHIPPED_VOCABULARY)])
    expect(phraseOf([], SHIPPED_VOCABULARY)).toEqual([])
  })

  it('keeps the order of the chief\'s four-concept message', () => {
    const message: ConceptId[] = ['RIVER', 'UPSTREAM', 'ROCK', 'DIG']
    const phrase = phraseOf(message, SHIPPED_VOCABULARY)
    expect(phrase).toHaveLength(4)
    expect(phrase.map((a) => conceptOf(a, SHIPPED_VOCABULARY))).toEqual(message)
  })
})

describe('the journal sort order', () => {
  it('puts the low syllable before the high one, syllable by syllable', () => {
    expect(compareUtterances('ba-ba', 'BA-ba')).toBeLessThan(0)
    expect(compareUtterances('BA-ba', 'ba-ba')).toBeGreaterThan(0)
    expect(compareUtterances('ba-BA-ba', 'ba-ba-BA')).toBeGreaterThan(0)
    expect(compareUtterances('ba-ba', 'ba-ba')).toBe(0)
  })

  it('stays consistent across differing lengths — a prefix comes first', () => {
    expect(compareUtterances('ba-ba', 'ba-ba-ba')).toBeLessThan(0)
    expect(compareUtterances('ba-ba-BA', 'ba-ba')).toBeGreaterThan(0)
    expect(compareUtterances('', 'ba')).toBeLessThan(0)
    const mixed = ['ba-ba-ba', 'BA', 'ba', 'ba-BA', 'BA-ba', 'ba-ba']
    expect([...mixed].sort(compareUtterances)).toEqual([
      'ba', 'ba-ba', 'ba-ba-ba', 'ba-BA', 'BA', 'BA-ba',
    ])
  })

  it('is a total order — antisymmetric on every pair of the lexicon', () => {
    const all = [...CONCEPT_IDS.map((c) => utteranceOf(c, SHIPPED_VOCABULARY)), 'ba', 'BA-BA', '']
    for (const a of all) {
      for (const b of all) {
        const sum = Math.sign(compareUtterances(a, b)) + Math.sign(compareUtterances(b, a))
        expect(sum, `${a}/${b}`).toBe(0)
      }
    }
  })

  it('falls back to a text order for same-tone syllables of different lects', () => {
    expect(compareUtterances('ba-do', 'ba-ba')).toBeGreaterThan(0)
    expect(compareUtterances('DO', 'BA')).toBeGreaterThan(0)
    expect(compareUtterances('Ba', 'ba')).toBeLessThan(0) // both low, text decides
  })

  it('sorts the whole lexicon deterministically', () => {
    const sorted = CONCEPT_IDS.map((c) => utteranceOf(c, SHIPPED_VOCABULARY)).sort(compareUtterances)
    expect(sorted.map((u) => conceptOf(u, SHIPPED_VOCABULARY))).toEqual(
      ['UPSTREAM', 'RIVER', 'DIG', 'ROCK', 'CHIEF', 'DOWNSTREAM'],
    )
  })
})
