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

const COME = utteranceOf('COME')
const DIG = utteranceOf('DIG')
const HERE = utteranceOf('HERE')

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
    expect(hasHeard(memory, COME)).toBe(false)
  })

  it('records the utterance with the day it was first heard', () => {
    const memory = observeUtterance(emptyMemory(), COME, 12)
    expect(hasHeard(memory, COME)).toBe(true)
    expect(memory.heard[COME]).toEqual({ utterance: COME, firstHeardDay: 12, hypothesis: '' })
  })

  it('keeps the first day and the same object on a repeat hearing', () => {
    const first = observeUtterance(emptyMemory(), COME, 12)
    const again = observeUtterance(first, COME, 40)
    expect(again).toBe(first)
    expect(again.heard[COME].firstHeardDay).toBe(12)
  })

  it('leaves the previous memory untouched', () => {
    const before = emptyMemory()
    const after = observeUtterance(before, COME, 3)
    expect(before.heard).toEqual({})
    expect(after).not.toBe(before)
  })

  it('ignores an empty utterance', () => {
    const memory = emptyMemory()
    expect(observeUtterance(memory, '', 1)).toBe(memory)
  })
})

describe('observing a phrase', () => {
  it('observes each atom on its own', () => {
    const memory = observePhrase(emptyMemory(), phraseOf(['DIG', 'HERE']), 5)
    expect(Object.keys(memory.heard).sort()).toEqual([DIG, HERE].sort())
    expect(memory.heard[DIG].firstHeardDay).toBe(5)
    expect(memory.heard[HERE].firstHeardDay).toBe(5)
  })

  it('records a repeated atom once', () => {
    const memory = observePhrase(emptyMemory(), phraseOf(['DIG', 'HERE', 'DIG']), 5)
    expect(Object.keys(memory.heard)).toHaveLength(2)
  })

  it('adds only the new atoms of a phrase and returns the memory unchanged when none are', () => {
    const known = observeUtterance(emptyMemory(), DIG, 2)
    const mixed = observePhrase(known, phraseOf(['DIG', 'HERE']), 9)
    expect(mixed.heard[DIG].firstHeardDay).toBe(2)
    expect(mixed.heard[HERE].firstHeardDay).toBe(9)
    expect(observePhrase(mixed, phraseOf(['DIG', 'HERE']), 20)).toBe(mixed)
    expect(observePhrase(mixed, [], 20)).toBe(mixed)
  })
})

describe('the player\'s own reading', () => {
  it('is empty until he writes one, and trims what he writes', () => {
    let memory = observeUtterance(emptyMemory(), COME, 1)
    expect(hypothesisFor(memory, COME)).toBe('')
    memory = setHypothesis(memory, COME, '  come here!  ')
    expect(hypothesisFor(memory, COME)).toBe('come here!')
  })

  it('clears on an empty text and holds still when nothing changes', () => {
    let memory = setHypothesis(observeUtterance(emptyMemory(), COME, 1), COME, 'come')
    expect(setHypothesis(memory, COME, 'come')).toBe(memory)
    memory = setHypothesis(memory, COME, '   ')
    expect(hypothesisFor(memory, COME)).toBe('')
  })

  it('never attaches to an utterance he has not heard', () => {
    const memory = emptyMemory()
    expect(setHypothesis(memory, COME, 'come')).toBe(memory)
    expect(hypothesisFor(memory, COME)).toBe('')
  })

  it('survives hearing the utterance again', () => {
    const memory = setHypothesis(observeUtterance(emptyMemory(), COME, 1), COME, 'come')
    expect(hypothesisFor(observeUtterance(memory, COME, 30), COME)).toBe('come')
  })
})

describe('the journal listing', () => {
  it('lists what was heard in the lexicon\'s sort order, whatever the order of hearing', () => {
    let memory = emptyMemory()
    for (const concept of [...CONCEPT_IDS].reverse()) {
      memory = observeUtterance(memory, utteranceOf(concept), 1)
    }
    const listed = heardUtterances(memory).map((e) => conceptOf(e.utterance))
    expect(listed).toEqual([
      'GO_THERE', 'THERE', 'NO', 'RIVER', 'FOLLOW', 'UPSTREAM',
      'BIG_ROCK', 'DIG', 'HERE', 'COME', 'DOWNSTREAM',
    ])
  })
})

describe('the save round trip', () => {
  it('restores days and hypotheses unchanged', () => {
    let memory = observePhrase(emptyMemory(), phraseOf(['DIG', 'HERE']), 7)
    memory = setHypothesis(memory, DIG, 'dig?')
    const restored = deserializeMemory(JSON.parse(JSON.stringify(serializeMemory(memory))))
    expect(restored).toEqual(memory)
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
        [COME]: { firstHeardDay: 'not a day', hypothesis: 5 },
        [DIG]: { firstHeardDay: 4 },
        '': { firstHeardDay: 1 },
        [HERE]: null,
      },
    })
    expect(restored.heard[COME]).toEqual({ utterance: COME, firstHeardDay: 0, hypothesis: '' })
    expect(restored.heard[DIG]).toEqual({ utterance: DIG, firstHeardDay: 4, hypothesis: '' })
    expect(Object.keys(restored.heard).sort()).toEqual([COME, DIG].sort())
  })
})
