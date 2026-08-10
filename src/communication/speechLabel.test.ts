// The hypothesis over the speaker's head (design.md §13.4, work-order point
// 485): its lifetime, and its binding to the ONE note the journal edits. The
// scene channel is covered in src/scenes/place/speechChannel.test.ts.
import { describe, it, expect } from 'vitest'
import { balance } from '../config/balance'
import { emptyMemory, observeUtterance, setHypothesis } from './heard'
import { phraseOf, utteranceOf } from './lexicon'
import {
  GROWN_FIGURE_HEIGHT,
  NO_READING,
  dropSpeechLabel,
  expireSpeechLabels,
  isSpeechLabelVisible,
  labelReadings,
  noSpeechLabels,
  readingOf,
  showSpeechLabel,
  speechLabelHeight,
  speechLabelSeconds,
  withSpeechTarget,
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
    expect(state.labels[0]).toMatchObject({ speakerId: 'kid-1', shownAt: 10, height: speechLabelHeight() })
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

/**
 * THE CLICK TARGET MUST LIVE LONG ENOUGH TO BE CLICKED (work-order point 588).
 * A label stands 2.6 s, which is shorter than reaching for the mouse — so the
 * one label the player is invited to click is held against the sweep for as
 * long as it is that target, and goes the moment it stops being one.
 */
describe('the note a click would take (design.md §13.4)', () => {
  it('names the target and keeps the same state object when it does not change', () => {
    const state = showSpeechLabel(noSpeechLabels(), 'kid-1', [COME], 0, { seconds: 2 })
    expect(state.targetId).toBeNull()
    const targeted = withSpeechTarget(state, 'kid-1')
    expect(targeted.targetId).toBe('kid-1')
    expect(withSpeechTarget(targeted, 'kid-1')).toBe(targeted)
  })

  it('holds the targeted label past its time, and lets it go once it is not the target', () => {
    let state = showSpeechLabel(noSpeechLabels(), 'kid-1', [COME], 0, { seconds: 2 })
    state = showSpeechLabel(state, 'kid-2', [DIG], 0, { seconds: 2 })
    state = withSpeechTarget(state, 'kid-1')
    // Long past both lifetimes: only the target still stands.
    state = expireSpeechLabels(state, 30)
    expect(state.labels.map((l) => l.speakerId)).toEqual(['kid-1'])
    // Another speaker takes the highlight — the held note goes with the next sweep.
    state = withSpeechTarget(state, null)
    expect(expireSpeechLabels(state, 30).labels).toHaveLength(0)
  })

  it('keeps the target while another speaker speaks over him', () => {
    let state = showSpeechLabel(noSpeechLabels(), 'kid-1', [COME], 0, { seconds: 2 })
    state = withSpeechTarget(state, 'kid-1')
    state = showSpeechLabel(state, 'kid-2', [DIG], 30, { seconds: 2 })
    expect(state.targetId).toBe('kid-1')
    expect(state.labels.map((l) => l.speakerId).sort()).toEqual(['kid-1', 'kid-2'])
  })

  it('takes the highlight with the figure when that leaves the scene', () => {
    let state = showSpeechLabel(noSpeechLabels(), 'kid-1', [COME], 0, { seconds: 10 })
    state = withSpeechTarget(state, 'kid-1')
    expect(dropSpeechLabel(state, 'kid-1').targetId).toBeNull()
  })
})

/**
 * WHERE THE NOTE FLOATS (work-order point 582). The old flat height was 2.3 m
 * over the speaker's FEET whoever spoke, which put a child's note about twice
 * the child's own height above it — the user reported missing utterances
 * because of it. The rule is now the SPEAKER's own height plus one small gap,
 * so these cases are stated in the only terms that matter: how far the note
 * ends up above THAT figure's crown, in world units.
 */
describe('the note rides on the speaker’s own height', () => {
  /** The crown of a figure whose actor record says `rise` (the record sits a
   *  little above the head sphere, exactly as the Ctrl label reads it). */
  const CROWN_UNDER_RECORD = 0.11
  const grown = GROWN_FIGURE_HEIGHT
  const kid = GROWN_FIGURE_HEIGHT * 0.55

  it('leaves the same small gap over a grown villager and over a child', () => {
    for (const rise of [grown, kid]) {
      const gap = speechLabelHeight(rise) - rise
      expect(gap).toBeCloseTo(balance.communication.labelHeadroom)
    }
  })

  it('sits a hand’s breadth over the head at BOTH scales, and never below it', () => {
    for (const [what, rise, scale] of [
      ['a grown villager', grown, 1],
      ['a child', kid, 0.55],
    ] as const) {
      const crown = rise - CROWN_UNDER_RECORD * scale
      const over = speechLabelHeight(rise) - crown
      expect(over, `${what}: the note must clear the head`).toBeGreaterThan(0)
      expect(over, `${what}: the note must stay close over it`).toBeLessThanOrEqual(0.5)
    }
  })

  it('is the defect it fixes: the old flat height stood far higher over both', () => {
    // The shipped constant, for the contrast this case exists to state.
    const FLAT = 2.3
    expect(FLAT - (grown - CROWN_UNDER_RECORD)).toBeGreaterThan(0.8)
    expect(FLAT - (kid - CROWN_UNDER_RECORD * 0.55)).toBeGreaterThan(kid)
    expect(speechLabelHeight(kid)).toBeLessThan(FLAT - 1)
  })

  it('moves with the figure: half the scale, roughly half the height', () => {
    const half = speechLabelHeight(kid)
    const full = speechLabelHeight(grown)
    expect(half).toBeLessThan(full)
    expect(half - balance.communication.labelHeadroom).toBeCloseTo(
      (full - balance.communication.labelHeadroom) * 0.55,
    )
  })

  it('falls back to a grown figure for a speaker that carries no height', () => {
    for (const missing of [undefined, null, 0, -1]) {
      expect(speechLabelHeight(missing)).toBeCloseTo(
        GROWN_FIGURE_HEIGHT + balance.communication.labelHeadroom,
      )
    }
  })

  it('follows the calibrated gap when it is tuned in the debug menu', () => {
    const before = balance.communication.labelHeadroom
    try {
      balance.communication.labelHeadroom = 0.6
      expect(speechLabelHeight(grown)).toBeCloseTo(grown + 0.6)
      balance.communication.labelHeadroom = -5
      expect(speechLabelHeight(grown)).toBeCloseTo(grown)
    } finally {
      balance.communication.labelHeadroom = before
    }
  })
})
