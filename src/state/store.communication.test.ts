// Communication observations in the store (design.md §13.4,
// docs/communication-poc-spec.md): what the player has HEARD travels in the
// game state, his own readings with it, and both survive a save/load round
// trip. The lexicon and the memory rules themselves are covered in
// src/communication/*.test.ts — this file pins the STORE wiring.
import { describe, it, expect, beforeEach } from 'vitest'
import { hasHeard, heardUtterances, hypothesisFor } from '../communication/heard'
import { utteranceOf } from '../communication/lexicon'
import { chiefMessagePhrase } from '../communication/drumMessage'
import { isSpeechLabelVisible, labelReadings, NO_READING } from '../communication/speechLabel'
import { g, freshGame, withWorld } from '../test/store'

withWorld()

beforeEach(() => {
  freshGame()
})

const COME = utteranceOf('COME')
const DIG = utteranceOf('DIG')
const HERE = utteranceOf('HERE')

describe('hearing utterances (design.md §13.4)', () => {
  it('a fresh game has heard nothing', () => {
    expect(heardUtterances(g().communication)).toHaveLength(0)
  })

  it('records a heard utterance with the current in-game day', () => {
    g().debugSet({ day: 12.4 })
    g().hearUtterance(COME)
    expect(hasHeard(g().communication, COME)).toBe(true)
    expect(g().communication.heard[COME].firstHeardDay).toBe(12)
  })

  it('an utterance never heard stays absent', () => {
    g().hearUtterance(COME)
    expect(hasHeard(g().communication, DIG)).toBe(false)
    expect(heardUtterances(g().communication).map((h) => h.utterance)).toEqual([COME])
  })

  it('hearing the same utterance again keeps one entry and its first day', () => {
    g().debugSet({ day: 3 })
    g().hearUtterance(COME)
    const first = g().communication
    g().debugSet({ day: 9 })
    g().hearUtterance(COME)
    expect(heardUtterances(g().communication)).toHaveLength(1)
    expect(g().communication.heard[COME].firstHeardDay).toBe(3)
    // Nothing changed, so the memory is the very same object (no re-render).
    expect(g().communication).toBe(first)
  })

  it('a phrase records each of its atoms once', () => {
    g().hearPhrase([DIG, HERE, DIG])
    expect(heardUtterances(g().communication).map((h) => h.utterance).sort()).toEqual(
      [DIG, HERE].sort(),
    )
  })
})

describe('the player\'s own readings (design.md §13.4)', () => {
  it('stores a free-text note on a heard utterance', () => {
    g().hearUtterance(DIG)
    g().setUtteranceHypothesis(DIG, '  dig, or maybe bury  ')
    expect(hypothesisFor(g().communication, DIG)).toBe('dig, or maybe bury')
  })

  it('refuses a note on an utterance that was never heard', () => {
    g().setUtteranceHypothesis(DIG, 'nonsense')
    expect(hypothesisFor(g().communication, DIG)).toBe('')
    expect(hasHeard(g().communication, DIG)).toBe(false)
  })

  it('an empty note clears the reading again', () => {
    g().hearUtterance(DIG)
    g().setUtteranceHypothesis(DIG, 'dig')
    g().setUtteranceHypothesis(DIG, '   ')
    expect(hypothesisFor(g().communication, DIG)).toBe('')
  })
})

describe('observations travel with the save (design.md §18)', () => {
  it('heard utterances and notes survive a save/load round trip', () => {
    g().debugSet({ day: 5 })
    g().hearPhrase([DIG, HERE])
    g().setUtteranceHypothesis(HERE, 'here / this place')
    g().saveCheckpoint()

    g().newGame()
    expect(heardUtterances(g().communication)).toHaveLength(0)

    expect(g().loadCheckpoint()).toBe(true)
    expect(heardUtterances(g().communication).map((h) => h.utterance).sort()).toEqual(
      [DIG, HERE].sort(),
    )
    expect(hypothesisFor(g().communication, HERE)).toBe('here / this place')
    expect(g().communication.heard[DIG].firstHeardDay).toBe(5)
  })

  it('a snapshot from before the system loads with an empty memory', () => {
    g().hearUtterance(DIG)
    g().saveCheckpoint()
    // Strip the field the way a legacy snapshot lacks it.
    const key = 'hoa-checkpoints-v1'
    const snaps = JSON.parse(localStorage.getItem(key) ?? '[]') as Array<Record<string, unknown>>
    delete snaps[snaps.length - 1].communication
    localStorage.setItem(key, JSON.stringify(snaps))

    expect(g().loadCheckpoint()).toBe(true)
    expect(heardUtterances(g().communication)).toHaveLength(0)
  })
})

// The label over a speaker's head reads the SAME note as the journal (design.md
// §13.4, work-order point 485): both derive from the store, so a note edited in
// the journal is the note that stands over the speaker.
describe('the overhead label reads the journal note (design.md §13.4)', () => {
  it('shows ??? until the player writes a reading, then his own words', () => {
    g().hearUtterance(COME)
    expect(labelReadings(g().communication, [COME])[0].reading).toBe(NO_READING)

    g().setUtteranceHypothesis(COME, 'come here')
    expect(labelReadings(g().communication, [COME])[0].reading).toBe('come here')

    // Clearing the field in the journal takes the label straight back.
    g().setUtteranceHypothesis(COME, '')
    expect(labelReadings(g().communication, [COME])[0].reading).toBe(NO_READING)
  })

  it('shows one reading per atom of a heard phrase, in the spoken order', () => {
    g().hearPhrase([DIG, HERE])
    g().setUtteranceHypothesis(DIG, 'dig')
    expect(labelReadings(g().communication, [DIG, HERE])).toEqual([
      { utterance: DIG, reading: 'dig' },
      { utterance: HERE, reading: NO_READING },
    ])
  })

  it('shows no label for speech that was never observed', () => {
    g().hearUtterance(COME)
    expect(isSpeechLabelVisible(g().communication, [COME])).toBe(true)
    expect(isSpeechLabelVisible(g().communication, [DIG])).toBe(false)
  })
})

// The chief's drum message in the store (work-order point 486): the drums are
// HEARD like any speech, the chronicle records them once, and the fact that
// they were sent travels with the save so the display stays reopenable.
describe("the chief's drum message (design.md §13.4)", () => {
  it('a fresh game has not heard the drums', () => {
    expect(g().drumMessageHeard).toBe(false)
  })

  it('records every concept of the message as heard, on the current day', () => {
    g().debugSet({ day: 40.8 })
    g().receiveDrumMessage()
    expect(g().drumMessageHeard).toBe(true)
    const heard = heardUtterances(g().communication).map((h) => h.utterance)
    for (const atom of chiefMessagePhrase()) {
      expect(heard).toContain(atom)
      expect(g().communication.heard[atom].firstHeardDay).toBe(40)
    }
  })

  it('keeps the day and the note of a concept already heard in the village', () => {
    g().debugSet({ day: 5 })
    g().hearUtterance(DIG)
    g().setUtteranceHypothesis(DIG, 'dig here')
    g().debugSet({ day: 41 })
    g().receiveDrumMessage()
    expect(g().communication.heard[DIG].firstHeardDay).toBe(5)
    expect(hypothesisFor(g().communication, DIG)).toBe('dig here')
  })

  it('writes the chronicle entry once, however often the drums sound', () => {
    g().receiveDrumMessage()
    const entries = () => g().journal.filter((e) => e.title.key === 'journal.titles.drumMessage')
    expect(entries()).toHaveLength(1)
    expect(entries()[0].text.key).toBe('journal.drumMessage')
    g().receiveDrumMessage()
    expect(entries()).toHaveLength(1)
  })

  it('travels with the checkpoint, so the message stays reopenable', () => {
    g().receiveDrumMessage()
    g().saveCheckpoint()
    g().newGame()
    expect(g().drumMessageHeard).toBe(false)
    expect(g().loadCheckpoint()).toBe(true)
    expect(g().drumMessageHeard).toBe(true)
    expect(hasHeard(g().communication, chiefMessagePhrase()[0])).toBe(true)
  })

  it('a snapshot from before the drums existed simply never heard them', () => {
    g().receiveDrumMessage()
    g().saveCheckpoint()
    const key = 'hoa-checkpoints-v1'
    const snaps = JSON.parse(localStorage.getItem(key) ?? '[]') as Array<Record<string, unknown>>
    delete snaps[snaps.length - 1].drumMessageHeard
    localStorage.setItem(key, JSON.stringify(snaps))
    expect(g().loadCheckpoint()).toBe(true)
    expect(g().drumMessageHeard).toBe(false)
  })
})
