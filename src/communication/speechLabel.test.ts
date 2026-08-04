// The hypothesis over the speaker's head (design.md §13.4, work-order point
// 485): its lifetime, and its binding to the ONE note the journal edits. The
// scene channel is covered in src/scenes/place/speechChannel.test.ts.
import { describe, it, expect } from 'vitest'
import { balance } from '../config/balance'
import { emptyMemory, observeUtterance, setHypothesis } from './heard'
import { phraseOf, utteranceOf } from './lexicon'
import {
  NO_READING,
  SPEECH_LABEL_HEIGHT,
  dropSpeechLabel,
  expireSpeechLabels,
  isSpeechLabelVisible,
  labelReadings,
  noSpeechLabels,
  readingOf,
  showSpeechLabel,
  speechLabelSeconds,
} from './speechLabel'

const COME = utteranceOf('COME')
const DIG = utteranceOf('DIG')
const HERE = utteranceOf('HERE')

/** A memory that has heard the given utterances, on day 1. */
function heardMemory(...utterances: string[]) {
  let memory = emptyMemory()
  for (const u of utterances) memory = observeUtterance(memory, u, 1)
  return memory
}

describe('what the label says (design.md §13.4)', () => {
  it('shows the reading the player wrote', () => {
    const memory = setHypothesis(heardMemory(COME), COME, 'come here')
    expect(readingOf(memory, COME)).toBe('come here')
  })

  it('shows ??? where he wrote none', () => {
    expect(readingOf(heardMemory(COME), COME)).toBe(NO_READING)
    expect(NO_READING).toBe('???')
  })

  it('shows one reading per atom of a phrase, in order', () => {
    let memory = heardMemory(DIG, HERE)
    memory = setHypothesis(memory, DIG, 'dig')
    const readings = labelReadings(memory, phraseOf(['DIG', 'HERE']))
    expect(readings.map((r) => r.utterance)).toEqual([DIG, HERE])
    expect(readings.map((r) => r.reading)).toEqual(['dig', NO_READING])
  })

  it('keeps the syllables beside the reading, never instead of it', () => {
    const memory = setHypothesis(heardMemory(COME), COME, 'come here')
    expect(labelReadings(memory, [COME])[0]).toEqual({ utterance: COME, reading: 'come here' })
  })

  it('follows the note the journal edits, with nothing kept on the label', () => {
    const label = showSpeechLabel(noSpeechLabels(), 'kid-1', [COME], 0).labels[0]
    let memory = heardMemory(COME)
    expect(labelReadings(memory, label.atoms)[0].reading).toBe(NO_READING)
    // The player writes his reading in the journal — the SAME label now reads it.
    memory = setHypothesis(memory, COME, 'come!')
    expect(labelReadings(memory, label.atoms)[0].reading).toBe('come!')
    // And clearing the note takes it straight back to ???.
    memory = setHypothesis(memory, COME, '')
    expect(labelReadings(memory, label.atoms)[0].reading).toBe(NO_READING)
  })
})

describe('when a label shows at all (design.md §13.4)', () => {
  it('shows for speech the player has already observed', () => {
    expect(isSpeechLabelVisible(heardMemory(COME), [COME])).toBe(true)
  })

  it('stays away for an utterance he has never heard', () => {
    expect(isSpeechLabelVisible(heardMemory(COME), [DIG])).toBe(false)
    expect(isSpeechLabelVisible(emptyMemory(), [COME])).toBe(false)
  })

  it('shows a phrase as soon as one of its atoms is known', () => {
    expect(isSpeechLabelVisible(heardMemory(DIG), phraseOf(['DIG', 'HERE']))).toBe(true)
  })
})

describe('how long a label stands (design.md §13.4)', () => {
  it('one atom stands the calibrated base time', () => {
    expect(speechLabelSeconds(1)).toBeCloseTo(balance.communication.labelSeconds)
  })

  it('a phrase adds one pause per further atom', () => {
    const { labelSeconds, phrasePauseSeconds } = balance.communication
    expect(speechLabelSeconds(3)).toBeCloseTo(labelSeconds + 2 * phrasePauseSeconds)
  })

  it('is brief — a seven-atom message stays under a quarter minute', () => {
    expect(speechLabelSeconds(7)).toBeLessThan(15)
  })

  it('shows a label from now until its time is up', () => {
    const state = showSpeechLabel(noSpeechLabels(), 'kid-1', [COME], 10)
    expect(state.labels).toHaveLength(1)
    expect(state.labels[0]).toMatchObject({ speakerId: 'kid-1', shownAt: 10, height: SPEECH_LABEL_HEIGHT })
    expect(state.labels[0].hideAt).toBeCloseTo(10 + speechLabelSeconds(1))
  })

  it('takes an explicit lifetime and height', () => {
    const state = showSpeechLabel(noSpeechLabels(), 'kid-1', [COME], 10, { seconds: 4, height: 1.4 })
    expect(state.labels[0].hideAt).toBe(14)
    expect(state.labels[0].height).toBe(1.4)
  })

  it('expires when its time is up, and not a moment before', () => {
    const state = showSpeechLabel(noSpeechLabels(), 'kid-1', [COME], 0, { seconds: 3 })
    expect(expireSpeechLabels(state, 2.9)).toBe(state)
    expect(expireSpeechLabels(state, 3).labels).toHaveLength(0)
  })

  it('never accumulates: one speaker carries one label, the newest', () => {
    let state = showSpeechLabel(noSpeechLabels(), 'kid-1', [COME], 0, { seconds: 10 })
    state = showSpeechLabel(state, 'kid-1', [DIG], 1, { seconds: 10 })
    expect(state.labels).toHaveLength(1)
    expect(state.labels[0].atoms).toEqual([DIG])
    expect(state.labels[0].shownAt).toBe(1)
  })

  it('sweeps out what has run out while showing a new one', () => {
    let state = showSpeechLabel(noSpeechLabels(), 'kid-1', [COME], 0, { seconds: 2 })
    state = showSpeechLabel(state, 'kid-2', [DIG], 5, { seconds: 2 })
    expect(state.labels.map((l) => l.speakerId)).toEqual(['kid-2'])
  })

  it('lets two speakers talk at once', () => {
    let state = showSpeechLabel(noSpeechLabels(), 'kid-1', [COME], 0, { seconds: 10 })
    state = showSpeechLabel(state, 'kid-2', [DIG], 0, { seconds: 10 })
    expect(state.labels.map((l) => l.speakerId)).toEqual(['kid-1', 'kid-2'])
  })

  it('copies the atoms, so a caller reusing its array cannot rewrite a label', () => {
    const spoken = [COME]
    const state = showSpeechLabel(noSpeechLabels(), 'kid-1', spoken, 0)
    spoken[0] = DIG
    expect(state.labels[0].atoms).toEqual([COME])
  })

  it('ignores an empty phrase and a nameless speaker', () => {
    const empty = noSpeechLabels()
    expect(showSpeechLabel(empty, 'kid-1', [], 0)).toBe(empty)
    expect(showSpeechLabel(empty, '', [COME], 0)).toBe(empty)
  })

  it('drops the label of a speaker whose figure is gone', () => {
    let state = showSpeechLabel(noSpeechLabels(), 'kid-1', [COME], 0, { seconds: 10 })
    state = showSpeechLabel(state, 'kid-2', [DIG], 0, { seconds: 10 })
    expect(dropSpeechLabel(state, 'kid-1').labels.map((l) => l.speakerId)).toEqual(['kid-2'])
  })

  it('returns the same state when nothing changed', () => {
    const state = showSpeechLabel(noSpeechLabels(), 'kid-1', [COME], 0, { seconds: 10 })
    expect(expireSpeechLabels(state, 1)).toBe(state)
    expect(dropSpeechLabel(state, 'kid-9')).toBe(state)
  })
})
