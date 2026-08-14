// What counts as heard (docs/communication-poc-spec.md): the first hearing
// wins, a phrase records each atom on its own, the player's own reading lives
// beside it, and the whole memory survives a save round trip. Pure logic.
import { describe, expect, it } from 'vitest'
import { balance } from '../config/balance'
import {
  deserializeMemory,
  emptyMemory,
  hasHeard,
  heardUtterances,
  hypothesisFor,
  isWithinHearing,
  observePhrase,
  observeUtterance,
  serializeMemory,
  setHypothesis,
} from './heard'
import { CONCEPT_IDS, conceptOf, phraseOf, utteranceOf } from './lexicon'

const RIVER_UTTERANCE = utteranceOf('RIVER')
const DIG = utteranceOf('DIG')
const ROCK_UTTERANCE = utteranceOf('ROCK')

describe('hearing distance', () => {
  it('carries to the balance radius and no further', () => {
    const r = balance.communication.hearingRadius
    expect(isWithinHearing(0)).toBe(true)
    expect(isWithinHearing(r)).toBe(true)
    expect(isWithinHearing(r + 0.01)).toBe(false)
    expect(isWithinHearing(r + 5, r + 6)).toBe(true) // an explicit radius wins
  })

  it('refuses a nonsensical distance', () => {
    expect(isWithinHearing(-1)).toBe(false)
    expect(isWithinHearing(Number.NaN)).toBe(false)
    expect(isWithinHearing(Number.POSITIVE_INFINITY)).toBe(false)
  })
})

describe('observing an utterance', () => {
  it('starts empty', () => {
    const memory = emptyMemory()
    expect(heardUtterances(memory)).toEqual([])
    expect(hasHeard(memory, RIVER_UTTERANCE)).toBe(false)
  })

  it('records the utterance with the day it was first heard', () => {
    const memory = observeUtterance(emptyMemory(), RIVER_UTTERANCE, 12)
    expect(hasHeard(memory, RIVER_UTTERANCE)).toBe(true)
    expect(memory.heard[RIVER_UTTERANCE]).toEqual({ utterance: RIVER_UTTERANCE, firstHeardDay: 12, hypothesis: '' })
  })

  it('keeps the first day and the same object on a repeat hearing', () => {
    const first = observeUtterance(emptyMemory(), RIVER_UTTERANCE, 12)
    const again = observeUtterance(first, RIVER_UTTERANCE, 40)
    expect(again).toBe(first)
    expect(again.heard[RIVER_UTTERANCE].firstHeardDay).toBe(12)
  })

  it('leaves the previous memory untouched', () => {
    const before = emptyMemory()
    const after = observeUtterance(before, RIVER_UTTERANCE, 3)
    expect(before.heard).toEqual({})
    expect(after).not.toBe(before)
  })

  it('ignores an empty utterance', () => {
    const memory = emptyMemory()
    expect(observeUtterance(memory, '', 1)).toBe(memory)
  })

  it('records the settlement of the first hearing, and none when there was none', () => {
    const inVillage = observeUtterance(emptyMemory(), RIVER_UTTERANCE, 12, 'bambara-village')
    expect(inVillage.heard[RIVER_UTTERANCE].firstHeardPlace).toBe('bambara-village')
    // Out on the map the entry carries no place at all — not an empty one, so
    // nothing downstream can render a placeholder village (point 579).
    const onTheMap = observeUtterance(emptyMemory(), RIVER_UTTERANCE, 12)
    expect(onTheMap.heard[RIVER_UTTERANCE]).toEqual({ utterance: RIVER_UTTERANCE, firstHeardDay: 12, hypothesis: '' })
    expect('firstHeardPlace' in onTheMap.heard[RIVER_UTTERANCE]).toBe(false)
  })

  it('keeps the place of the FIRST hearing when the same word is heard elsewhere', () => {
    const first = observeUtterance(emptyMemory(), RIVER_UTTERANCE, 12, 'bambara-village')
    const again = observeUtterance(first, RIVER_UTTERANCE, 40, 'masai-village')
    expect(again).toBe(first)
    expect(again.heard[RIVER_UTTERANCE].firstHeardPlace).toBe('bambara-village')
  })
})

describe('observing a phrase', () => {
  it('observes each atom on its own', () => {
    const memory = observePhrase(emptyMemory(), phraseOf(['DIG', 'ROCK']), 5)
    expect(Object.keys(memory.heard).sort()).toEqual([DIG, ROCK_UTTERANCE].sort())
    expect(memory.heard[DIG].firstHeardDay).toBe(5)
    expect(memory.heard[ROCK_UTTERANCE].firstHeardDay).toBe(5)
  })

  it('gives every atom of the phrase the settlement it was heard in', () => {
    const memory = observePhrase(emptyMemory(), phraseOf(['DIG', 'ROCK']), 5, 'bambara-village')
    expect(memory.heard[DIG].firstHeardPlace).toBe('bambara-village')
    expect(memory.heard[ROCK_UTTERANCE].firstHeardPlace).toBe('bambara-village')
  })

  it('records a repeated atom once', () => {
    const memory = observePhrase(emptyMemory(), phraseOf(['DIG', 'ROCK', 'DIG']), 5)
    expect(Object.keys(memory.heard)).toHaveLength(2)
  })

  it('adds only the new atoms of a phrase and returns the memory unchanged when none are', () => {
    const known = observeUtterance(emptyMemory(), DIG, 2)
    const mixed = observePhrase(known, phraseOf(['DIG', 'ROCK']), 9)
    expect(mixed.heard[DIG].firstHeardDay).toBe(2)
    expect(mixed.heard[ROCK_UTTERANCE].firstHeardDay).toBe(9)
    expect(observePhrase(mixed, phraseOf(['DIG', 'ROCK']), 20)).toBe(mixed)
    expect(observePhrase(mixed, [], 20)).toBe(mixed)
  })
})

describe('the player\'s own reading', () => {
  it('is empty until he writes one, and trims what he writes', () => {
    let memory = observeUtterance(emptyMemory(), RIVER_UTTERANCE, 1)
    expect(hypothesisFor(memory, RIVER_UTTERANCE)).toBe('')
    memory = setHypothesis(memory, RIVER_UTTERANCE, '  come here!  ')
    expect(hypothesisFor(memory, RIVER_UTTERANCE)).toBe('come here!')
  })

  it('clears on an empty text and holds still when nothing changes', () => {
    let memory = setHypothesis(observeUtterance(emptyMemory(), RIVER_UTTERANCE, 1), RIVER_UTTERANCE, 'come')
    expect(setHypothesis(memory, RIVER_UTTERANCE, 'come')).toBe(memory)
    memory = setHypothesis(memory, RIVER_UTTERANCE, '   ')
    expect(hypothesisFor(memory, RIVER_UTTERANCE)).toBe('')
  })

  it('never attaches to an utterance he has not heard', () => {
    const memory = emptyMemory()
    expect(setHypothesis(memory, RIVER_UTTERANCE, 'come')).toBe(memory)
    expect(hypothesisFor(memory, RIVER_UTTERANCE)).toBe('')
  })

  it('survives hearing the utterance again', () => {
    const memory = setHypothesis(observeUtterance(emptyMemory(), RIVER_UTTERANCE, 1), RIVER_UTTERANCE, 'come')
    expect(hypothesisFor(observeUtterance(memory, RIVER_UTTERANCE, 30), RIVER_UTTERANCE)).toBe('come')
  })
})

describe('the journal listing', () => {
  it('lists what was heard in the lexicon\'s sort order, whatever the order of hearing', () => {
    let memory = emptyMemory()
    for (const concept of [...CONCEPT_IDS].reverse()) {
      memory = observeUtterance(memory, utteranceOf(concept), 1)
    }
    const listed = heardUtterances(memory).map((e) => conceptOf(e.utterance))
    expect(listed).toEqual(['RIVER', 'UPSTREAM', 'DIG', 'ROCK', 'DOWNSTREAM'])
  })
})

describe('the save round trip', () => {
  it('restores days and hypotheses unchanged', () => {
    let memory = observePhrase(emptyMemory(), phraseOf(['DIG', 'ROCK']), 7)
    memory = setHypothesis(memory, DIG, 'dig?')
    const restored = deserializeMemory(JSON.parse(JSON.stringify(serializeMemory(memory))))
    expect(restored).toEqual(memory)
  })

  it('carries the settlement through the save, and invents none where the save has none', () => {
    const memory = observePhrase(emptyMemory(), phraseOf(['DIG', 'ROCK']), 7, 'bambara-village')
    const restored = deserializeMemory(JSON.parse(JSON.stringify(serializeMemory(memory))))
    expect(restored.heard[DIG].firstHeardPlace).toBe('bambara-village')
    // A snapshot written before the place was tracked, or with an empty one:
    // the entry reads without a village rather than with a wrong name.
    const older = deserializeMemory({
      heard: {
        [RIVER_UTTERANCE]: { firstHeardDay: 3, hypothesis: '' },
        [DIG]: { firstHeardDay: 3, hypothesis: '', firstHeardPlace: '' },
        [ROCK_UTTERANCE]: { firstHeardDay: 3, hypothesis: '', firstHeardPlace: 7 },
      },
    })
    for (const u of [RIVER_UTTERANCE, DIG, ROCK_UTTERANCE]) expect('firstHeardPlace' in older.heard[u]).toBe(false)
  })

  it('reads a save that predates the system, or a broken one, as an empty memory', () => {
    expect(deserializeMemory(undefined)).toEqual(emptyMemory())
    expect(deserializeMemory(null)).toEqual(emptyMemory())
    expect(deserializeMemory({})).toEqual(emptyMemory())
    expect(deserializeMemory({ heard: 'nonsense' })).toEqual(emptyMemory())
  })

  it('repairs a partial entry instead of crashing on it', () => {
    const restored = deserializeMemory({
      heard: {
        [RIVER_UTTERANCE]: { firstHeardDay: 'not a day', hypothesis: 5 },
        [DIG]: { firstHeardDay: 4 },
        '': { firstHeardDay: 1 },
        [ROCK_UTTERANCE]: null,
      },
    })
    expect(restored.heard[RIVER_UTTERANCE]).toEqual({ utterance: RIVER_UTTERANCE, firstHeardDay: 0, hypothesis: '' })
    expect(restored.heard[DIG]).toEqual({ utterance: DIG, firstHeardDay: 4, hypothesis: '' })
    expect(Object.keys(restored.heard).sort()).toEqual([RIVER_UTTERANCE, DIG].sort())
  })
})
